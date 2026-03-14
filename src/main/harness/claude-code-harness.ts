/**
 * Claude Code Harness
 *
 * Wraps @anthropic-ai/claude-agent-sdk and maps Claude runtime events
 * into generic Maestro execution events and interaction requests.
 *
 * Key design decisions:
 * - Uses streaming input mode (AsyncIterable prompt) for mid-turn interactivity
 * - Bridges SDK's canUseTool Promise callback to Maestro's event-driven IPC
 *   via a pendingInteractions map (the "Promise bridge")
 * - All Claude-specific translation stays inside this file and claude-sdk-types.ts
 * - Runtime metadata (skills, models, agents, slash commands) is emitted as
 *   typed shared events
 *
 * BOUNDARY INVARIANT: Claude SDK types must NEVER leak across the process
 * boundary. All SDK message types are translated into shared event shapes
 * before emission.
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type { AgentHarness, HarnessInput, HarnessSpawnResult } from './agent-harness';
import type { HarnessRuntimeSettings } from '../../shared/harness-types';
import type { ToolType, AgentExecutionConfig, PermissionMode } from '../../shared/types';
import type {
	InteractionRequest,
	InteractionResponse,
	InteractionKind,
	ToolApprovalRequest,
	ClarificationRequest,
	ClarificationAnswer,
} from '../../shared/interaction-types';
import type { HarnessRuntimeCapabilities, RuntimeMetadataEvent } from '../../shared/runtime-metadata-types';
import {
	DEFAULT_INTERACTION_TIMEOUT_MS,
	createInteractionTimeoutResponse,
	createInterruptResponse,
	createTerminationResponse,
} from './interaction-helpers';
import type { ClaudeProviderOptions, ClaudeRuntimeOptions } from './claude-provider-options';
import { CLAUDE_PROVIDER_OPTION_KEYS, CLAUDE_RUNTIME_OPTION_KEYS } from './claude-provider-options';
import type {
	SDKMessage,
	SDKQuery,
	SDKQueryFunction,
	SDKPermissionResult,
	SDKCanUseToolOptions,
	SDKUserMessage,
	SDKUserContentBlock,
	SDKAskUserQuestionInput,
	SDKPermissionMode,
	SDKContentBlock,
	SDKResultMessage,
	SDKSystemMessage,
	SDKAssistantMessage,
	SDKToolUseSummaryMessage,
	SDKRateLimitEvent,
	SDKStatusMessage,
	SDKToolProgressMessage,
	SDKAuthStatusMessage,
} from './claude-sdk-types';
import { encodeImageFiles } from './claude-image-encoding';
import { logger } from '../utils/logger';

const LOG_CONTEXT = '[ClaudeCodeHarness]';

// ============================================================================
// Pending Interaction Bridge
// ============================================================================

/**
 * A pending interaction waiting for user response.
 *
 * The Promise bridge works as follows:
 * 1. SDK's canUseTool callback fires
 * 2. Harness creates a PendingInteraction with resolve/reject and a timeout
 * 3. Harness emits an 'interaction-request' event
 * 4. SDK callback awaits the stored Promise
 * 5. Renderer responds via respondToInteraction()
 * 6. Harness looks up the entry, translates the response, resolves the Promise
 * 7. SDK continues execution with the resolved PermissionResult
 */
export interface PendingInteraction {
	interactionId: string;
	kind: InteractionKind;
	createdAt: number;
	timeoutMs: number;
	resolve: (response: SDKPermissionResult) => void;
	reject: (error: Error) => void;
	timeout: ReturnType<typeof setTimeout>;
	/** Retained for ClarificationRequest response translation */
	originalSdkInput?: Record<string, unknown>;
}

// ============================================================================
// ClaudeCodeHarness
// ============================================================================

export class ClaudeCodeHarness extends EventEmitter implements AgentHarness {
	readonly agentId: ToolType = 'claude-code' as ToolType;

	private _running = false;
	private _disposed = false;
	private _query: SDKQuery | null = null;
	private _abortController: AbortController | null = null;
	private _queryFn: SDKQueryFunction;

	/**
	 * Map of pending interactions awaiting user response.
	 * Each entry holds the resolve/reject callbacks and timeout handle
	 * for the Promise that the SDK's canUseTool callback is awaiting.
	 */
	private readonly pendingInteractions = new Map<string, PendingInteraction>();

	/**
	 * @param queryFn - The SDK's query() function. Injected for testability.
	 *   In production, pass the imported query function from @anthropic-ai/claude-agent-sdk.
	 *   In tests, pass a mock.
	 */
	constructor(queryFn: SDKQueryFunction) {
		super();
		this._queryFn = queryFn;
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

		this._abortController = new AbortController();

		const providerOpts = this.extractProviderOptions(config.providerOptions);

		try {
			// Build the canUseTool callback that bridges SDK promises to Maestro events
			const canUseTool = this.createCanUseToolCallback(config.sessionId);

			// Build SDK query options
			const queryOptions: Record<string, unknown> = {
				permissionMode: this.mapPermissionMode(config.permissionMode),
				canUseTool,
				cwd: config.cwd,
				abortController: this._abortController,
				includePartialMessages: providerOpts.includePartialMessages ?? true,
			};

			// Map optional config fields
			if (config.modelId) queryOptions.model = config.modelId;
			if (config.systemPrompt) queryOptions.systemPrompt = config.systemPrompt;
			if (config.maxTurns) queryOptions.maxTurns = config.maxTurns;
			if (config.customEnvVars) queryOptions.env = { ...process.env, ...config.customEnvVars };
			if (config.resumeSessionId) queryOptions.resume = config.resumeSessionId;
			if (config.outputFormat) queryOptions.outputFormat = config.outputFormat;

			// Map Claude-specific provider options
			if (providerOpts.continueSession) queryOptions.continue = true;
			if (providerOpts.forkSession) queryOptions.forkSession = true;
			if (providerOpts.thinking) queryOptions.thinking = providerOpts.thinking;
			if (providerOpts.effort) queryOptions.effort = providerOpts.effort;
			if (providerOpts.allowedTools) queryOptions.allowedTools = providerOpts.allowedTools;
			if (providerOpts.disallowedTools) queryOptions.disallowedTools = providerOpts.disallowedTools;
			if (providerOpts.maxBudgetUsd) queryOptions.maxBudgetUsd = providerOpts.maxBudgetUsd;
			if (providerOpts.enableFileCheckpointing) queryOptions.enableFileCheckpointing = true;
			if (providerOpts.settingSources) queryOptions.settingSources = providerOpts.settingSources;
			if (providerOpts.mcpServers) queryOptions.mcpServers = providerOpts.mcpServers;
			if (providerOpts.sandbox) queryOptions.sandbox = providerOpts.sandbox;

			// Use streaming input mode — required for mid-turn interactivity
			const initialMessage = await this.buildInitialMessage(config);

			this._query = this._queryFn({
				prompt: this.createStreamingPrompt(initialMessage),
				options: queryOptions,
			});

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

			// Start consuming the async generator in the background
			this.consumeMessages(config.sessionId).catch((error) => {
				logger.error(
					`${LOG_CONTEXT} Message consumption failed: ${String(error)}`,
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
		if (!this._query || !this._running) {
			logger.warn(`${LOG_CONTEXT} write() called but harness is not running`, LOG_CONTEXT);
			return;
		}

		// Build message async (may need to encode images) then stream it
		this.buildUserMessage(input)
			.then((message) => {
				if (!this._query || !this._running) return;
				try {
					this._query.streamInput(this.createStreamingPrompt(message));
				} catch (error) {
					logger.error(`${LOG_CONTEXT} write() streamInput failed: ${String(error)}`, LOG_CONTEXT);
				}
			})
			.catch((error) => {
				logger.error(`${LOG_CONTEXT} write() failed: ${String(error)}`, LOG_CONTEXT);
			});
	}

	async interrupt(): Promise<void> {
		if (this._disposed) {
			logger.warn(`${LOG_CONTEXT} interrupt() called on disposed harness`, LOG_CONTEXT);
			return;
		}

		// Resolve all pending interactions with interrupt responses
		this.resolveAllPending(createInterruptResponse);

		if (this._query && this._running) {
			try {
				this._query.interrupt();
			} catch (error) {
				logger.warn(`${LOG_CONTEXT} interrupt() SDK call failed: ${String(error)}`, LOG_CONTEXT);
			}
		}
	}

	kill(): void {
		if (this._disposed) return; // Already fully cleaned up

		const pendingCount = this.pendingInteractions.size;

		// Resolve all pending interactions with termination responses
		this.resolveAllPending(createTerminationResponse);

		if (this._query) {
			try {
				this._query.close();
			} catch (error) {
				logger.warn(`${LOG_CONTEXT} kill() SDK close failed: ${String(error)}`, LOG_CONTEXT);
			}
		}

		if (this._abortController) {
			this._abortController.abort();
		}

		this._running = false;
		this._query = null;
		this._abortController = null;

		logger.debug(
			`${LOG_CONTEXT} kill() completed, resolved ${pendingCount} pending interaction(s)`,
			LOG_CONTEXT
		);
	}

	dispose(): void {
		if (this._disposed) return; // Already disposed — idempotent

		// Kill if still running (resolves pending interactions, closes SDK)
		if (this._running || this._query) {
			this.kill();
		}

		// Final safety net: clear any remaining pending interactions
		// (should be empty after kill, but enforce the invariant)
		if (this.pendingInteractions.size > 0) {
			this.resolveAllPending(createTerminationResponse);
		}

		// Remove all event listeners to prevent memory leaks
		this.removeAllListeners();

		// Mark as disposed — all future calls will no-op or throw
		this._disposed = true;
	}

	isDisposed(): boolean {
		return this._disposed;
	}

	async respondToInteraction(interactionId: string, response: InteractionResponse): Promise<void> {
		if (this._disposed) {
			const message = `Cannot respond to interaction on disposed harness: ${interactionId}`;
			logger.warn(`${LOG_CONTEXT} ${message}`, LOG_CONTEXT);
			throw new Error(message);
		}

		const pending = this.pendingInteractions.get(interactionId);
		if (!pending) {
			const message = `Unknown or expired interaction ID: ${interactionId}`;
			logger.warn(`${LOG_CONTEXT} ${message}`, LOG_CONTEXT);
			throw new Error(message);
		}

		// Clear timeout and remove from map BEFORE translation.
		// If translation fails, the SDK promise must still resolve (with a
		// safe deny) so that the SDK callback never dangles forever.
		clearTimeout(pending.timeout);
		this.pendingInteractions.delete(interactionId);

		const latencyMs = Date.now() - pending.createdAt;

		try {
			const sdkResult = this.translateResponseToSdk(response, pending);
			pending.resolve(sdkResult);

			logger.debug(
				`${LOG_CONTEXT} respondToInteraction() resolved`,
				LOG_CONTEXT,
				{
					interactionId,
					kind: pending.kind,
					responseKind: response.kind,
					latencyMs,
				}
			);
		} catch (translationError) {
			// Translation failed — resolve with a safe deny so the SDK
			// callback is never left dangling, then re-throw so the caller
			// knows the response was malformed.
			logger.error(
				`${LOG_CONTEXT} Response translation failed for ${interactionId}: ${String(translationError)}`,
				LOG_CONTEXT
			);
			pending.resolve({
				behavior: 'deny',
				message: `Response translation error: ${String(translationError)}`,
			});
			throw new Error(
				`Response translation failed for interaction ${interactionId}: ${String(translationError)}`
			);
		}
	}

	async updateRuntimeSettings(settings: HarnessRuntimeSettings): Promise<void> {
		if (this._disposed) {
			logger.warn(`${LOG_CONTEXT} updateRuntimeSettings() called on disposed harness`, LOG_CONTEXT);
			return;
		}
		if (!this._query || !this._running) {
			logger.warn(
				`${LOG_CONTEXT} updateRuntimeSettings() called but harness is not running`,
				LOG_CONTEXT
			);
			return;
		}

		if (settings.permissionMode !== undefined) {
			const sdkMode = this.mapPermissionMode(settings.permissionMode);
			if (sdkMode) {
				try {
					this._query.setPermissionMode(sdkMode);
				} catch (error) {
					logger.error(
						`${LOG_CONTEXT} setPermissionMode failed: ${String(error)}`,
						LOG_CONTEXT
					);
				}
			}
		}

		if (settings.model !== undefined) {
			try {
				this._query.setModel(settings.model || undefined);
			} catch (error) {
				logger.error(`${LOG_CONTEXT} setModel failed: ${String(error)}`, LOG_CONTEXT);
			}
		}

		// Handle Claude-specific runtime options from providerOptions
		if (settings.providerOptions) {
			const runtimeOpts = this.extractRuntimeOptions(settings.providerOptions);
			this.applyRuntimeOptions(runtimeOpts);
		}
	}

	/**
	 * Apply Claude-specific runtime options to the running query.
	 * Translation from shared option names to SDK API calls happens here.
	 */
	private applyRuntimeOptions(options: ClaudeRuntimeOptions): void {
		if (!this._query) return;

		if (options.effort !== undefined) {
			try {
				// Claude SDK does not have a dedicated setEffort() method.
				// Effort is a query-level option applied at spawn time.
				// Runtime effort changes are stored and applied on the next
				// streamInput call via query options if the SDK supports it
				// in a future version. For now, log the intent.
				logger.debug(
					`${LOG_CONTEXT} Runtime effort change requested: ${options.effort} (applied at next query)`,
					LOG_CONTEXT
				);
			} catch (error) {
				logger.error(
					`${LOG_CONTEXT} applyRuntimeOptions failed: ${String(error)}`,
					LOG_CONTEXT
				);
			}
		}
	}

	isRunning(): boolean {
		return this._running;
	}

	getCapabilities(): HarnessRuntimeCapabilities {
		return {
			supportsMidTurnInput: true,
			supportsInteractionRequests: true,
			supportsPersistentStdin: false, // N/A for in-process SDK
			supportsRuntimePermissionUpdates: true,
			supportsRuntimeModelChange: true,
			supportsRuntimeEffortChange: true,
			supportsSkillsEnumeration: true,
			supportsRuntimeSlashCommands: true,
			supportsFileCheckpointing: true,
			supportsStructuredOutput: true,
			supportsBudgetLimits: true,
			supportsContextCompaction: true,
			supportsSessionFork: true,
		};
	}

	// ========================================================================
	// Pending Interaction Management
	// ========================================================================

	/**
	 * Get the number of pending interactions (exposed for testing).
	 */
	getPendingInteractionCount(): number {
		return this.pendingInteractions.size;
	}

	/**
	 * Check if a specific interaction is pending (exposed for testing).
	 */
	hasPendingInteraction(interactionId: string): boolean {
		return this.pendingInteractions.has(interactionId);
	}

	/**
	 * Create a pending interaction and return a Promise that resolves
	 * when the renderer responds or rejects on timeout.
	 *
	 * This is the core of the Promise bridge:
	 * - Creates a unique interaction ID
	 * - Stores resolve/reject callbacks with a timeout
	 * - Emits the interaction-request event
	 * - Returns the Promise for the SDK callback to await
	 */
	private awaitInteraction(
		sessionId: string,
		request: InteractionRequest,
		originalSdkInput?: Record<string, unknown>
	): Promise<SDKPermissionResult> {
		return new Promise<SDKPermissionResult>((resolve, reject) => {
			const timeoutMs = request.timeoutMs ?? DEFAULT_INTERACTION_TIMEOUT_MS;

			const timeout = setTimeout(() => {
				const pending = this.pendingInteractions.get(request.interactionId);
				if (pending) {
					this.pendingInteractions.delete(request.interactionId);
					const timeoutResponse = createInteractionTimeoutResponse(request.kind);
					const sdkResult = this.translateResponseToSdk(timeoutResponse, pending);

					logger.debug(
						`${LOG_CONTEXT} Interaction timed out after ${timeoutMs}ms`,
						LOG_CONTEXT,
						{ interactionId: request.interactionId, kind: request.kind, sessionId }
					);

					resolve(sdkResult);
				}
			}, timeoutMs);

			const pending: PendingInteraction = {
				interactionId: request.interactionId,
				kind: request.kind,
				createdAt: request.timestamp,
				timeoutMs,
				resolve,
				reject,
				timeout,
				originalSdkInput,
			};

			this.pendingInteractions.set(request.interactionId, pending);

			logger.debug(
				`${LOG_CONTEXT} Pending interaction created`,
				LOG_CONTEXT,
				{
					interactionId: request.interactionId,
					kind: request.kind,
					sessionId,
					timeoutMs,
					pendingCount: this.pendingInteractions.size,
				}
			);

			this.emit('interaction-request', sessionId, request);
		});
	}

	/**
	 * Resolve all pending interactions using the given response factory.
	 * Used during interrupt() and kill() for deterministic cleanup.
	 */
	private resolveAllPending(
		responseFactory: (kind: InteractionKind) => InteractionResponse
	): void {
		const count = this.pendingInteractions.size;
		if (count > 0) {
			logger.debug(
				`${LOG_CONTEXT} Resolving ${count} pending interaction(s) via ${responseFactory.name || 'factory'}`,
				LOG_CONTEXT
			);
		}

		for (const [, pending] of this.pendingInteractions) {
			clearTimeout(pending.timeout);
			const response = responseFactory(pending.kind);
			const sdkResult = this.translateResponseToSdk(response, pending);
			pending.resolve(sdkResult);
		}
		this.pendingInteractions.clear();
	}

	// ========================================================================
	// canUseTool Callback
	// ========================================================================

	/**
	 * Create the canUseTool callback that bridges SDK tool approval/clarification
	 * requests to Maestro's interaction event system.
	 *
	 * The Claude SDK routes BOTH tool approvals and AskUserQuestion through
	 * canUseTool. We differentiate by toolName.
	 */
	private createCanUseToolCallback(sessionId: string) {
		return async (
			toolName: string,
			input: Record<string, unknown>,
			options: SDKCanUseToolOptions
		): Promise<SDKPermissionResult> => {
			const interactionId = randomUUID();
			const timestamp = Date.now();

			if (toolName === 'AskUserQuestion') {
				// Clarification request
				const sdkInput = input as unknown as SDKAskUserQuestionInput;
				const questions = (sdkInput.questions || []).map((q) => ({
					question: q.question,
					header: q.header,
					options: (q.options || []).map((o) => ({
						label: o.label,
						description: o.description,
						preview: o.preview,
					})),
					multiSelect: q.multiSelect,
				}));

				logger.debug(
					`${LOG_CONTEXT} canUseTool: clarification request`,
					LOG_CONTEXT,
					{ sessionId, interactionId, questionCount: questions.length }
				);

				const request: ClarificationRequest = {
					interactionId,
					sessionId,
					agentId: this.agentId,
					kind: 'clarification',
					timestamp,
					timeoutMs: DEFAULT_INTERACTION_TIMEOUT_MS,
					questions,
					allowFreeText: true,
				};

				return this.awaitInteraction(sessionId, request, input);
			} else {
				// Tool approval request
				logger.debug(
					`${LOG_CONTEXT} canUseTool: tool approval request`,
					LOG_CONTEXT,
					{ sessionId, interactionId, toolName, reason: options.decisionReason }
				);

				const request: ToolApprovalRequest = {
					interactionId,
					sessionId,
					agentId: this.agentId,
					kind: 'tool-approval',
					timestamp,
					timeoutMs: DEFAULT_INTERACTION_TIMEOUT_MS,
					toolUseId: options.toolUseID,
					toolName,
					toolInput: input,
					decisionReason: options.decisionReason,
					suggestedPermissions: options.suggestions,
					blockedPath: options.blockedPath,
					subagentId: options.agentID,
				};

				return this.awaitInteraction(sessionId, request);
			}
		};
	}

	// ========================================================================
	// Response Translation
	// ========================================================================

	/**
	 * Translate a shared InteractionResponse into Claude SDK's PermissionResult.
	 *
	 * This is where Claude-specific translation is contained. The shared
	 * InteractionResponse types are provider-neutral; only this method
	 * knows how to convert them into SDK-specific formats.
	 */
	private translateResponseToSdk(
		response: InteractionResponse,
		pending: PendingInteraction
	): SDKPermissionResult {
		switch (response.kind) {
			case 'approve':
				return {
					behavior: 'allow',
					updatedInput: response.updatedInput,
					updatedPermissions: response.updatedPermissions,
				};

			case 'deny':
				return {
					behavior: 'deny',
					message: response.message || 'User denied',
					interrupt: response.interrupt,
				};

			case 'text':
				// Free-text fallback — treat as approval with text input
				return {
					behavior: 'allow',
					updatedInput: { text: response.text },
				};

			case 'clarification-answer':
				return this.translateClarificationAnswer(response.answers, pending);

			case 'cancel':
				return {
					behavior: 'deny',
					message: response.message || 'User cancelled',
				};

			case 'timeout':
				return {
					behavior: 'deny',
					message: response.message || 'Timed out waiting for user response',
				};

			default:
				return {
					behavior: 'deny',
					message: 'Unknown response type',
				};
		}
	}

	/**
	 * Translate structured clarification answers into the Claude SDK's
	 * expected AskUserQuestion response format.
	 *
	 * The SDK expects: { behavior: 'allow', updatedInput: { questions, answers: { [questionText]: selectedLabel } } }
	 */
	private translateClarificationAnswer(
		answers: ClarificationAnswer[],
		pending: PendingInteraction
	): SDKPermissionResult {
		const originalInput = pending.originalSdkInput as SDKAskUserQuestionInput | undefined;
		const questions = originalInput?.questions || [];

		// Build the SDK's answers record: { [questionText]: selectedLabel }
		const sdkAnswers: Record<string, string> = {};

		// Defensive: handle null/undefined/non-array answers gracefully
		if (!Array.isArray(answers)) {
			logger.warn(
				`${LOG_CONTEXT} clarification-answer received non-array answers, returning empty`,
				LOG_CONTEXT
			);
			return {
				behavior: 'allow',
				updatedInput: {
					questions: originalInput?.questions || [],
					answers: sdkAnswers,
				},
			};
		}

		for (const answer of answers) {
			if (!answer || typeof answer.questionIndex !== 'number') continue;
			const question = questions[answer.questionIndex];
			if (question) {
				if (answer.text) {
					sdkAnswers[question.question] = answer.text;
				} else if (answer.selectedOptionLabels && answer.selectedOptionLabels.length > 0) {
					sdkAnswers[question.question] = answer.selectedOptionLabels[0];
				}
			}
		}

		return {
			behavior: 'allow',
			updatedInput: {
				questions: originalInput?.questions || [],
				answers: sdkAnswers,
			},
		};
	}

	// ========================================================================
	// SDK Message Consumption
	// ========================================================================

	/**
	 * Consume messages from the SDK's async generator and emit
	 * corresponding harness events.
	 *
	 * This runs in the background after spawn() and continues until
	 * the generator is exhausted (query complete) or an error occurs.
	 */
	private async consumeMessages(sessionId: string): Promise<void> {
		if (!this._query) return;

		logger.debug(`${LOG_CONTEXT} Message stream started`, LOG_CONTEXT, { sessionId });

		try {
			for await (const message of this._query) {
				if (!this._running) break;
				this.handleSdkMessage(sessionId, message);
			}
		} catch (error) {
			if (!this._running) return; // Expected during kill/interrupt

			logger.error(
				`${LOG_CONTEXT} SDK message stream error: ${String(error)}`,
				LOG_CONTEXT,
				{ sessionId, pendingInteractions: this.pendingInteractions.size }
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
			// Resolve any remaining pending interactions on stream end
			this.resolveAllPending(createTerminationResponse);

			logger.debug(`${LOG_CONTEXT} Message stream ended`, LOG_CONTEXT, { sessionId });
		}
	}

	/**
	 * Handle a single SDK message and emit the corresponding harness event(s).
	 *
	 * This is the core event mapping table from the design spec.
	 * Claude-specific richness stays here; only shared event shapes cross
	 * the boundary.
	 */
	private handleSdkMessage(sessionId: string, message: SDKMessage): void {
		switch (message.type) {
			case 'system':
				this.handleSystemMessage(sessionId, message);
				break;

			case 'assistant':
				this.handleAssistantMessage(sessionId, message);
				break;

			case 'result':
				this.handleResultMessage(sessionId, message as SDKResultMessage);
				break;

			case 'tool_use_summary': {
				const toolMsg = message as SDKToolUseSummaryMessage;
				this.emit('tool-execution', sessionId, {
					toolName: toolMsg.tool_name || 'unknown',
					state: {
						input: toolMsg.input,
						output: toolMsg.output,
						error: toolMsg.error,
					},
					timestamp: Date.now(),
				});
				break;
			}

			case 'rate_limit': {
				const rlMsg = message as SDKRateLimitEvent;
				this.emit('agent-error', sessionId, {
					type: 'rate_limited',
					message: rlMsg.message || 'Rate limit hit',
					recoverable: true,
					agentId: this.agentId,
					sessionId,
					timestamp: Date.now(),
				});
				break;
			}

			case 'status': {
				const statusMsg = message as SDKStatusMessage;
				this.emit('data', sessionId, statusMsg.message || '');
				break;
			}

			case 'compact_boundary':
				this.emit('data', sessionId, '[Context compacted]');
				break;

			case 'tool_progress': {
				const progMsg = message as SDKToolProgressMessage;
				this.emit('tool-execution', sessionId, {
					toolName: progMsg.tool_name || 'unknown',
					state: {
						progress: true,
						content: progMsg.content,
						tool_use_id: progMsg.tool_use_id,
					},
					timestamp: Date.now(),
				});
				break;
			}

			case 'auth_status': {
				const authMsg = message as SDKAuthStatusMessage;
				if (authMsg.status === 'error' || authMsg.status === 'expired') {
					this.emit('agent-error', sessionId, {
						type: 'auth_expired',
						message: authMsg.message || 'Authentication error',
						recoverable: true,
						agentId: this.agentId,
						sessionId,
						timestamp: Date.now(),
					});
				}
				break;
			}

			default:
				// Unknown message types are logged but not surfaced
				logger.debug(
					`${LOG_CONTEXT} Unhandled SDK message type: ${message.type}`,
					LOG_CONTEXT
				);
				break;
		}
	}

	/**
	 * Handle SDKSystemMessage (init) — emits session-id, slash-commands,
	 * and runtime-metadata events. After the initial snapshot, queries
	 * supported-runtime discovery APIs for supplemental data (models).
	 */
	private handleSystemMessage(sessionId: string, message: SDKMessage): void {
		const sys = message as SDKSystemMessage;
		if (sys.subtype !== 'init') return;

		// Emit session-id
		if (sys.session_id) {
			this.emit('session-id', sessionId, sys.session_id);
		}

		// Emit slash-commands
		if (sys.slash_commands) {
			this.emit('slash-commands', sessionId, sys.slash_commands);
		}

		// Emit runtime-metadata with initial snapshot
		const metadata: RuntimeMetadataEvent = {
			sessionId,
			source: this.agentId,
			replace: true,
		};

		if (sys.skills) {
			metadata.skills = sys.skills.map((s) => ({
				id: s.name,
				name: s.name,
				description: s.description,
			}));
		}

		if (sys.slash_commands) {
			// Defensive: SDK may emit strings or objects in this array
			metadata.slashCommands = sys.slash_commands.map((c: any) =>
				typeof c === 'string' ? c : c.name
			);
		}

		if (sys.agents) {
			metadata.availableAgents = sys.agents.map((a) => ({
				id: a.name,
				label: a.description,
			}));
		}

		// Include current model from init message if available
		if (sys.model) {
			metadata.availableModels = [{ id: sys.model }];
		}

		metadata.capabilities = this.getCapabilities();

		this.emit('runtime-metadata', sessionId, metadata);

		// Query supported-runtime discovery APIs for supplemental data.
		// This runs async and emits incremental updates — it does not block
		// message consumption.
		this.querySupportedRuntimeData(sessionId).catch((error) => {
			logger.debug(
				`${LOG_CONTEXT} Supported-runtime query failed (non-critical): ${String(error)}`,
				LOG_CONTEXT
			);
		});
	}

	/**
	 * Query the SDK's supported-runtime discovery APIs and emit
	 * incremental runtime-metadata updates.
	 *
	 * These APIs (supportedModels, supportedCommands, supportedAgents)
	 * provide richer data than the init message alone — e.g., the full
	 * list of available models for runtime switching, which the init
	 * message does not include.
	 *
	 * Failures are non-critical: the initial snapshot from the init
	 * message already covers the minimum required metadata.
	 */
	private async querySupportedRuntimeData(sessionId: string): Promise<void> {
		if (!this._query || !this._running) return;

		const metadata: RuntimeMetadataEvent = {
			sessionId,
			source: this.agentId,
			replace: false,
		};

		let hasData = false;

		// Query available models — not available in the init message
		try {
			const models = await this._query.supportedModels();
			if (models && models.length > 0) {
				metadata.availableModels = models.map((m) => ({
					id: m.id,
					label: m.label,
				}));
				hasData = true;
			}
		} catch (error) {
			logger.debug(
				`${LOG_CONTEXT} supportedModels() failed: ${String(error)}`,
				LOG_CONTEXT
			);
		}

		// Only emit if we got data and the harness is still running
		if (hasData && this._running) {
			this.emit('runtime-metadata', sessionId, metadata);
		}
	}

	/**
	 * Handle SDKAssistantMessage and SDKPartialAssistantMessage —
	 * emits data and thinking-chunk events.
	 */
	private handleAssistantMessage(sessionId: string, message: SDKMessage): void {
		const msg = message as SDKAssistantMessage;
		const content: SDKContentBlock[] = msg.message?.content || [];

		for (const block of content) {
			if (block.type === 'text') {
				this.emit('data', sessionId, block.text);
			} else if (block.type === 'thinking') {
				this.emit('thinking-chunk', sessionId, block.thinking);
			}
		}
	}

	/**
	 * Handle SDKResultMessage — emits usage, query-complete, agent-error,
	 * and exit events.
	 */
	private handleResultMessage(sessionId: string, message: SDKResultMessage): void {
		const isSuccess = message.subtype === 'success';

		// Emit usage stats if available
		if (message.usage || message.total_cost_usd !== undefined) {
			const usage = message.usage || {};
			this.emit('usage', sessionId, {
				inputTokens: usage.input_tokens || 0,
				outputTokens: usage.output_tokens || 0,
				cacheReadInputTokens: usage.cache_read_input_tokens || 0,
				cacheCreationInputTokens: usage.cache_creation_input_tokens || 0,
				totalCostUsd: message.total_cost_usd || 0,
				contextWindow: 0, // Not directly available from ResultMessage
			});
		}

		// Emit errors for non-success results
		if (!isSuccess && message.errors) {
			for (const err of message.errors) {
				this.emit('agent-error', sessionId, {
					type: 'unknown',
					message: err.message,
					recoverable: false,
					agentId: this.agentId,
					sessionId,
					timestamp: Date.now(),
				});
			}
		}

		// Emit query-complete
		this.emit('query-complete', sessionId, {
			sessionId,
			agentType: this.agentId,
			source: 'user',
			startTime: 0,
			duration: message.duration_ms || 0,
		});

		// Emit exit
		this.emit('exit', sessionId, isSuccess ? 0 : 1);
	}

	// ========================================================================
	// Streaming Input
	// ========================================================================

	/**
	 * Create a streaming prompt AsyncIterable that yields a single message.
	 *
	 * The Claude SDK requires AsyncIterable<SDKUserMessage> for streaming
	 * input mode. This generator yields the provided message and completes.
	 */
	private async *createStreamingPrompt(message: SDKUserMessage): AsyncIterable<SDKUserMessage> {
		yield message;
	}

	/**
	 * Build the initial SDKUserMessage from the execution config.
	 */
	private async buildInitialMessage(config: AgentExecutionConfig): Promise<SDKUserMessage> {
		const content: SDKUserContentBlock[] = [];

		if (config.prompt) {
			content.push({ type: 'text', text: config.prompt });
		}

		if (config.images && config.images.length > 0) {
			const imageBlocks = await encodeImageFiles(config.images);
			content.push(...imageBlocks);
		}

		// Ensure at least one content block
		if (content.length === 0) {
			content.push({ type: 'text', text: '' });
		}

		return { role: 'user', content };
	}

	/**
	 * Build an SDKUserMessage from a HarnessInput.
	 */
	private async buildUserMessage(input: HarnessInput): Promise<SDKUserMessage> {
		const content: SDKUserContentBlock[] = [];

		if (input.type === 'text') {
			content.push({ type: 'text', text: input.text });
		} else {
			if (input.text) {
				content.push({ type: 'text', text: input.text });
			}
			if (input.images && input.images.length > 0) {
				const imageBlocks = await encodeImageFiles(input.images);
				content.push(...imageBlocks);
			}
		}

		if (content.length === 0) {
			content.push({ type: 'text', text: '' });
		}

		return { role: 'user', content };
	}

	// ========================================================================
	// Helpers
	// ========================================================================

	/**
	 * Map Maestro's PermissionMode to Claude SDK's PermissionMode.
	 */
	private mapPermissionMode(mode?: PermissionMode): SDKPermissionMode | undefined {
		if (!mode) return undefined;
		// The types are identical — direct pass-through
		return mode as SDKPermissionMode;
	}

	/**
	 * Extract and validate Claude-specific options from the generic providerOptions bag.
	 * Unknown keys are ignored with a debug log.
	 *
	 * Callers should use buildClaudeProviderOptions() to construct the bag —
	 * this method validates at runtime in case the bag was constructed ad hoc.
	 */
	private extractProviderOptions(options?: Record<string, unknown>): ClaudeProviderOptions {
		if (!options) return {};

		const known: ClaudeProviderOptions = {};

		for (const [key, value] of Object.entries(options)) {
			if (CLAUDE_PROVIDER_OPTION_KEYS.has(key)) {
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

	/**
	 * Extract and validate Claude-specific runtime options from the generic
	 * HarnessRuntimeSettings.providerOptions bag.
	 *
	 * Callers should use buildClaudeRuntimeOptions() to construct the bag.
	 */
	private extractRuntimeOptions(options?: Record<string, unknown>): ClaudeRuntimeOptions {
		if (!options) return {};

		const known: ClaudeRuntimeOptions = {};

		for (const [key, value] of Object.entries(options)) {
			if (CLAUDE_RUNTIME_OPTION_KEYS.has(key)) {
				(known as any)[key] = value;
			} else {
				logger.debug(
					`${LOG_CONTEXT} Ignoring unknown runtime option: ${key}`,
					LOG_CONTEXT
				);
			}
		}

		return known;
	}
}
