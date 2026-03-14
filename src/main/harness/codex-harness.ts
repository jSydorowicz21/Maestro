/**
 * Codex Harness
 *
 * Wraps @openai/codex-sdk and maps Codex JSONL events into generic
 * Maestro execution events and interaction requests.
 *
 * Key design decisions:
 * - Codex uses a sandbox-based permission model (no mid-turn tool approvals)
 * - Events follow JSONL format: thread.started, item.completed, turn.completed
 * - Session IDs are called thread_id (not session_id like Claude)
 * - No pending interaction map needed (unlike Claude's canUseTool bridge)
 * - Image handling uses prompt-embed mode on resume (file paths in prompt text)
 *
 * BOUNDARY INVARIANT: Codex SDK types must NEVER leak across the process
 * boundary. All SDK event types are translated into shared event shapes
 * before emission.
 */

import { EventEmitter } from 'events';
import type { AgentHarness, HarnessInput, HarnessSpawnResult } from './agent-harness';
import type { HarnessRuntimeSettings } from '../../shared/harness-types';
import type { ToolType, AgentExecutionConfig } from '../../shared/types';
import type { InteractionResponse } from '../../shared/interaction-types';
import type { HarnessRuntimeCapabilities, RuntimeMetadataEvent } from '../../shared/runtime-metadata-types';
import type { CodexProviderOptions } from './codex-provider-options';
import { CODEX_PROVIDER_OPTION_KEYS } from './codex-provider-options';
import { logger } from '../utils/logger';

const LOG_CONTEXT = '[CodexHarness]';

// ============================================================================
// Codex SDK Types (internal to harness)
// ============================================================================

/**
 * Codex SDK event shape — matches the JSONL format from the CLI.
 * Hand-transcribed from the @openai/codex-sdk API surface.
 *
 * Verified against Codex CLI v0.73.0+ output schema (see codex-output-parser.ts).
 */
export interface CodexSDKEvent {
	type: string;
	thread_id?: string;
	item?: {
		id?: string;
		type?: string;
		text?: string;
		tool?: string;
		args?: Record<string, unknown>;
		output?: string | number[];
	};
	usage?: {
		input_tokens?: number;
		output_tokens?: number;
		cached_input_tokens?: number;
		reasoning_output_tokens?: number;
	};
	error?: string | { message?: string; type?: string };
}

/**
 * Codex SDK execution handle.
 * Returned by the SDK's exec() function — an async iterable of events
 * with methods for follow-up input and lifecycle control.
 */
export interface CodexExecution extends AsyncIterable<CodexSDKEvent> {
	/** Send follow-up text input to the execution */
	sendInput(text: string): void;
	/** Signal interrupt (stop current turn gracefully) */
	stop(): void;
	/** Kill the execution immediately */
	kill(): void;
	/** Close/cleanup the execution */
	close(): void;
}

/**
 * Options for the Codex SDK exec function.
 */
export interface CodexExecOptions {
	prompt: string;
	model?: string;
	cwd?: string;
	sandbox?: string;
	images?: string[];
	threadId?: string;
	env?: Record<string, string>;
	maxTurns?: number;
	systemPrompt?: string;
}

/**
 * Function signature for the Codex SDK's exec() function.
 * In production, this is the imported exec function from @openai/codex-sdk.
 * In tests, this is a mock.
 */
export type CodexExecFunction = (options: CodexExecOptions) => CodexExecution;

// Maximum length for tool output to prevent oversized log entries
const MAX_TOOL_OUTPUT_LENGTH = 10000;

// ============================================================================
// CodexHarness
// ============================================================================

export class CodexHarness extends EventEmitter implements AgentHarness {
	readonly agentId: ToolType = 'codex' as ToolType;

	private _running = false;
	private _disposed = false;
	private _execution: CodexExecution | null = null;
	private _execFn: CodexExecFunction;

	/** Track the last tool name for correlating tool_call → tool_result pairs */
	private _lastToolName: string | null = null;

	/**
	 * @param execFn - The SDK's exec() function. Injected for testability.
	 *   In production, pass the imported exec function from @openai/codex-sdk.
	 *   In tests, pass a mock.
	 */
	constructor(execFn: CodexExecFunction) {
		super();
		this._execFn = execFn;
	}

	// ========================================================================
	// AgentHarness Interface
	// ========================================================================

	async spawn(config: AgentExecutionConfig): Promise<HarnessSpawnResult> {
		if (this._disposed) {
			logger.warn(`${LOG_CONTEXT} spawn() called on disposed harness`, LOG_CONTEXT);
			return { success: false, pid: null };
		}
		if (this._running) {
			logger.warn(`${LOG_CONTEXT} spawn() called while already running`, LOG_CONTEXT);
			return { success: false, pid: null };
		}

		const providerOpts = this.extractProviderOptions(config.providerOptions);

		try {
			const execOptions: CodexExecOptions = {
				prompt: config.prompt || '',
				cwd: config.cwd,
			};

			// Map shared config fields
			if (config.modelId) execOptions.model = config.modelId;
			if (config.systemPrompt) execOptions.systemPrompt = config.systemPrompt;
			if (config.maxTurns) execOptions.maxTurns = config.maxTurns;
			if (config.customEnvVars) execOptions.env = config.customEnvVars;
			if (config.resumeSessionId) execOptions.threadId = config.resumeSessionId;
			if (config.images && config.images.length > 0) execOptions.images = config.images;

			// Map permission mode to sandbox mode
			if (config.permissionMode === 'plan') {
				execOptions.sandbox = 'read-only';
			}

			// Apply Codex-specific provider options
			if (providerOpts.sandbox) execOptions.sandbox = providerOpts.sandbox;
			if (providerOpts.model) execOptions.model = providerOpts.model;

			this._execution = this._execFn(execOptions);
			this._running = true;

			logger.info(
				`${LOG_CONTEXT} spawn() succeeded`,
				LOG_CONTEXT,
				{
					sessionId: config.sessionId,
					model: config.modelId || 'default',
					cwd: config.cwd,
					hasResume: !!config.resumeSessionId,
					permissionMode: config.permissionMode,
				}
			);

			// Start consuming events in the background
			this.consumeEvents(config.sessionId).catch((error) => {
				logger.error(
					`${LOG_CONTEXT} Event consumption failed: ${String(error)}`,
					LOG_CONTEXT
				);
			});

			return { success: true, pid: null };
		} catch (error) {
			logger.error(`${LOG_CONTEXT} spawn() failed: ${String(error)}`, LOG_CONTEXT, {
				sessionId: config.sessionId,
			});
			this._running = false;
			return { success: false, pid: null };
		}
	}

	write(input: HarnessInput): void {
		if (this._disposed) {
			logger.warn(`${LOG_CONTEXT} write() called on disposed harness`, LOG_CONTEXT);
			return;
		}
		if (!this._execution || !this._running) {
			logger.warn(`${LOG_CONTEXT} write() called but harness is not running`, LOG_CONTEXT);
			return;
		}

		try {
			const text = input.type === 'text' ? input.text : (input.text || '');

			// For message type with images, embed file paths in prompt text
			// (Codex uses prompt-embed mode for images on follow-up input)
			if (input.type === 'message' && input.images && input.images.length > 0) {
				const imageRefs = input.images.map((p) => `[Image: ${p}]`).join('\n');
				const combined = text ? `${text}\n\n${imageRefs}` : imageRefs;
				this._execution.sendInput(combined);
			} else {
				this._execution.sendInput(text);
			}
		} catch (error) {
			logger.error(`${LOG_CONTEXT} write() failed: ${String(error)}`, LOG_CONTEXT);
		}
	}

	async interrupt(): Promise<void> {
		if (this._disposed) {
			logger.warn(`${LOG_CONTEXT} interrupt() called on disposed harness`, LOG_CONTEXT);
			return;
		}

		if (this._execution && this._running) {
			try {
				this._execution.stop();
			} catch (error) {
				logger.warn(`${LOG_CONTEXT} interrupt() SDK call failed: ${String(error)}`, LOG_CONTEXT);
			}
		}
	}

	kill(): void {
		if (this._disposed) return; // Already fully cleaned up

		if (this._execution) {
			try {
				this._execution.close();
			} catch (error) {
				logger.warn(`${LOG_CONTEXT} kill() SDK close failed: ${String(error)}`, LOG_CONTEXT);
			}
		}

		this._running = false;
		this._execution = null;
		this._lastToolName = null;

		logger.debug(`${LOG_CONTEXT} kill() completed`, LOG_CONTEXT);
	}

	dispose(): void {
		if (this._disposed) return; // Already disposed — idempotent

		// Kill if still running (closes SDK execution)
		if (this._running || this._execution) {
			this.kill();
		}

		// Remove all event listeners to prevent memory leaks
		this.removeAllListeners();

		// Mark as disposed — all future calls will no-op or warn
		this._disposed = true;
	}

	isDisposed(): boolean {
		return this._disposed;
	}

	async respondToInteraction(interactionId: string, _response: InteractionResponse): Promise<void> {
		// Codex uses a sandbox-based permission model — no mid-turn interactions.
		// If this is called, it indicates a mismatch between capabilities and caller expectations.
		logger.warn(
			`${LOG_CONTEXT} respondToInteraction() called but Codex does not support mid-turn interactions (interactionId: ${interactionId})`,
			LOG_CONTEXT
		);
	}

	async updateRuntimeSettings(settings: HarnessRuntimeSettings): Promise<void> {
		if (this._disposed) {
			logger.warn(`${LOG_CONTEXT} updateRuntimeSettings() called on disposed harness`, LOG_CONTEXT);
			return;
		}
		if (!this._execution || !this._running) {
			logger.warn(
				`${LOG_CONTEXT} updateRuntimeSettings() called but harness is not running`,
				LOG_CONTEXT
			);
			return;
		}

		// Codex SDK does not currently expose runtime settings APIs.
		// Log the intent for future SDK support.
		if (settings.permissionMode !== undefined) {
			logger.debug(
				`${LOG_CONTEXT} Runtime permission mode change requested: ${settings.permissionMode} (not supported by Codex SDK)`,
				LOG_CONTEXT
			);
		}
		if (settings.model !== undefined) {
			logger.debug(
				`${LOG_CONTEXT} Runtime model change requested: ${settings.model} (not supported by Codex SDK)`,
				LOG_CONTEXT
			);
		}
	}

	isRunning(): boolean {
		return this._running;
	}

	getCapabilities(): HarnessRuntimeCapabilities {
		return {
			supportsMidTurnInput: true,
			supportsInteractionRequests: false, // Codex uses sandbox model, no canUseTool callback
			supportsPersistentStdin: false, // N/A for in-process SDK
			supportsRuntimePermissionUpdates: false, // Sandbox mode is set at spawn time
			supportsRuntimeModelChange: false, // Model is set at spawn time
			supportsRuntimeEffortChange: false, // Not exposed by Codex SDK
			supportsSkillsEnumeration: false, // Codex doesn't have skills
			supportsRuntimeSlashCommands: false, // Codex doesn't have slash commands
			supportsFileCheckpointing: false, // Not supported by Codex SDK
			supportsStructuredOutput: true, // Codex supports structured output
			supportsBudgetLimits: false, // Not exposed by Codex SDK
			supportsContextCompaction: false, // Not supported by Codex SDK
			supportsSessionFork: false, // Not supported by Codex SDK
		};
	}

	// ========================================================================
	// Event Consumption
	// ========================================================================

	/**
	 * Consume events from the Codex SDK execution and emit corresponding
	 * harness events.
	 *
	 * This runs in the background after spawn() and continues until
	 * the generator is exhausted (execution complete) or an error occurs.
	 */
	private async consumeEvents(sessionId: string): Promise<void> {
		if (!this._execution) return;

		logger.debug(`${LOG_CONTEXT} Event stream started`, LOG_CONTEXT, { sessionId });

		try {
			for await (const event of this._execution) {
				if (!this._running) break;
				this.handleCodexEvent(sessionId, event);
			}
		} catch (error) {
			if (!this._running) return; // Expected during kill/interrupt

			logger.error(
				`${LOG_CONTEXT} SDK event stream error: ${String(error)}`,
				LOG_CONTEXT,
				{ sessionId }
			);
			this.emit('agent-error', sessionId, {
				type: 'unknown',
				message: `SDK error: ${String(error)}`,
				recoverable: false,
				agentId: this.agentId,
				sessionId,
				timestamp: Date.now(),
			});
		} finally {
			this._running = false;
			logger.debug(`${LOG_CONTEXT} Event stream ended`, LOG_CONTEXT, { sessionId });

			// Emit exit when stream completes
			this.emit('exit', sessionId, 0);
		}
	}

	/**
	 * Handle a single Codex SDK event and emit the corresponding harness event(s).
	 *
	 * Event mapping:
	 * - thread.started  → session-id + runtime-metadata
	 * - turn.started    → (no-op)
	 * - item.completed (agent_message)  → data
	 * - item.completed (reasoning)      → thinking-chunk
	 * - item.completed (tool_call)      → tool-execution (running)
	 * - item.completed (tool_result)    → tool-execution (completed)
	 * - turn.completed  → usage + query-complete
	 * - turn.failed     → agent-error
	 * - error           → agent-error
	 */
	private handleCodexEvent(sessionId: string, event: CodexSDKEvent): void {
		switch (event.type) {
			case 'thread.started':
				this.handleThreadStarted(sessionId, event);
				break;

			case 'turn.started':
				// System event — no harness emission needed
				break;

			case 'item.completed':
				this.handleItemCompleted(sessionId, event);
				break;

			case 'turn.completed':
				this.handleTurnCompleted(sessionId, event);
				break;

			case 'turn.failed':
				this.emit('agent-error', sessionId, {
					type: 'unknown',
					message: this.extractErrorText(event.error),
					recoverable: true,
					agentId: this.agentId,
					sessionId,
					timestamp: Date.now(),
				});
				break;

			case 'error':
				this.emit('agent-error', sessionId, {
					type: 'unknown',
					message: this.extractErrorText(event.error),
					recoverable: false,
					agentId: this.agentId,
					sessionId,
					timestamp: Date.now(),
				});
				break;

			default:
				// Catch-all: unknown/future Codex event types are logged with
				// enough context for production debugging but never crash the harness.
				logger.debug(
					`${LOG_CONTEXT} Unknown Codex event type: ${event.type}`,
					LOG_CONTEXT,
					{
						sessionId,
						eventType: event.type,
						keys: Object.keys(event).filter((k) => k !== 'type'),
					}
				);
				break;
		}
	}

	// ========================================================================
	// Event Handlers
	// ========================================================================

	/**
	 * Handle thread.started — emits session-id and runtime-metadata events.
	 */
	private handleThreadStarted(sessionId: string, event: CodexSDKEvent): void {
		// Emit session-id (Codex uses thread_id)
		if (event.thread_id) {
			this.emit('session-id', sessionId, event.thread_id);
		}

		// Emit initial runtime metadata snapshot
		const metadata: RuntimeMetadataEvent = {
			sessionId,
			source: this.agentId,
			replace: true,
			capabilities: this.getCapabilities(),
		};
		this.emit('runtime-metadata', sessionId, metadata);
	}

	/**
	 * Handle item.completed events — dispatches based on item type.
	 */
	private handleItemCompleted(sessionId: string, event: CodexSDKEvent): void {
		const item = event.item;
		if (!item) return;

		switch (item.type) {
			case 'agent_message':
				// Final text response from agent
				this.emit('data', sessionId, item.text || '');
				break;

			case 'reasoning':
				// Reasoning/thinking content
				if (item.text) {
					this.emit('thinking-chunk', sessionId, item.text);
				}
				break;

			case 'tool_call':
				// Agent is using a tool — store name for the subsequent tool_result
				this._lastToolName = item.tool || null;
				this.emit('tool-execution', sessionId, {
					toolName: item.tool || 'unknown',
					state: {
						status: 'running',
						input: item.args,
					},
					timestamp: Date.now(),
				});
				break;

			case 'tool_result': {
				// Tool execution completed — carry over tool name from preceding tool_call
				const toolName = this._lastToolName || 'unknown';
				this._lastToolName = null;
				this.emit('tool-execution', sessionId, {
					toolName,
					state: {
						status: 'completed',
						output: this.decodeToolOutput(item.output),
					},
					timestamp: Date.now(),
				});
				break;
			}

			default:
				logger.debug(
					`${LOG_CONTEXT} Unknown item type: ${item.type}`,
					LOG_CONTEXT,
					{ sessionId, itemType: item.type }
				);
				break;
		}
	}

	/**
	 * Handle turn.completed — emits usage and query-complete events.
	 */
	private handleTurnCompleted(sessionId: string, event: CodexSDKEvent): void {
		// Emit usage stats if present
		if (event.usage) {
			const inputTokens = event.usage.input_tokens || 0;
			const outputTokens = event.usage.output_tokens || 0;
			const cachedInputTokens = event.usage.cached_input_tokens || 0;
			const reasoningOutputTokens = event.usage.reasoning_output_tokens || 0;

			// Total output tokens = output_tokens + reasoning_output_tokens
			const totalOutputTokens = outputTokens + reasoningOutputTokens;

			this.emit('usage', sessionId, {
				inputTokens,
				outputTokens: totalOutputTokens,
				// Note: For OpenAI/Codex, cached_input_tokens is a SUBSET of input_tokens
				// (already included). We report cacheReadTokens for display purposes only.
				cacheReadInputTokens: cachedInputTokens,
				cacheCreationInputTokens: 0, // Codex doesn't report cache creation tokens
				totalCostUsd: 0, // Codex doesn't provide cost (pricing varies by model)
				contextWindow: 0, // Context window is determined by model, not per-event
				reasoningTokens: reasoningOutputTokens,
			});
		}

		// Emit query-complete
		this.emit('query-complete', sessionId, {
			sessionId,
			agentType: this.agentId,
			source: 'user',
			startTime: 0,
			duration: 0,
		});
	}

	// ========================================================================
	// Provider Options
	// ========================================================================

	/**
	 * Extract Codex-specific provider options from the opaque bag.
	 * Unknown keys are ignored with a debug log.
	 */
	private extractProviderOptions(options?: Record<string, unknown>): CodexProviderOptions {
		if (!options) return {};

		const known: CodexProviderOptions = {};

		for (const [key, value] of Object.entries(options)) {
			if (CODEX_PROVIDER_OPTION_KEYS.has(key)) {
				(known as any)[key] = value;
			} else {
				logger.debug(
					`${LOG_CONTEXT} Ignoring unknown provider option: ${key}`,
					LOG_CONTEXT
				);
			}
		}

		return known;
	}

	// ========================================================================
	// Utility Methods
	// ========================================================================

	/**
	 * Extract a human-readable error message from Codex's polymorphic error field.
	 * Codex sends errors as either a plain string or { message?, type? } object.
	 */
	private extractErrorText(error: CodexSDKEvent['error'], fallback = 'Unknown error'): string {
		if (typeof error === 'object' && error?.message) return error.message;
		if (typeof error === 'string') return error;
		return fallback;
	}

	/**
	 * Decode tool output which may be a string or byte array.
	 * Codex sometimes returns command output as byte arrays.
	 * Large outputs are truncated to MAX_TOOL_OUTPUT_LENGTH.
	 */
	private decodeToolOutput(output: string | number[] | undefined): string {
		let decoded: string;

		if (output === undefined) {
			return '';
		} else if (typeof output === 'string') {
			decoded = output;
		} else if (Array.isArray(output)) {
			// Byte array — decode to string
			try {
				decoded = Buffer.from(output).toString('utf-8');
			} catch {
				decoded = output.toString();
			}
		} else {
			decoded = String(output);
		}

		if (decoded.length > MAX_TOOL_OUTPUT_LENGTH) {
			const originalLength = decoded.length;
			decoded =
				decoded.substring(0, MAX_TOOL_OUTPUT_LENGTH) +
				`\n... [output truncated, ${originalLength} chars total]`;
		}

		return decoded;
	}
}
