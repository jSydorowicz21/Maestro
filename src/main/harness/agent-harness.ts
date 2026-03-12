/**
 * Agent Harness Interface
 *
 * Defines the per-agent execution harness contract. Each harness wraps an
 * SDK or CLI adapter and maps provider-specific behavior into generic
 * Maestro execution events and interaction requests.
 *
 * Harness instances are stateful and scoped to a single execution.
 * The registry stores factories — each call to createHarness() returns
 * a fresh instance.
 *
 * BOUNDARY INVARIANT: This module must NEVER import from provider-specific
 * code (@anthropic-ai/sdk, openai, etc.). Provider-specific behavior
 * lives inside concrete harness implementations only.
 */

import { EventEmitter } from 'events';
import type { ToolType, AgentExecutionConfig, PermissionMode } from '../../shared/types';
import type { InteractionResponse } from '../../shared/interaction-types';
import type { HarnessRuntimeCapabilities } from '../../shared/runtime-metadata-types';

// ============================================================================
// Harness Input Types
// ============================================================================

/**
 * Input that can be written to a running harness execution.
 * Kept to the two shapes Maestro already needs: raw text and message
 * payloads with optional images.
 *
 * Image format normalization is the harness's responsibility:
 * - Claude: read file, base64-encode, wrap in SDK image content block
 * - Codex: pass path as { type: "local_image", path }
 * - OpenCode: image input not documented — log warning and omit
 * - Fallback CLI: agent-dependent
 */
export type HarnessInput =
	| { type: 'text'; text: string }
	| { type: 'message'; text?: string; images?: string[] };

// ============================================================================
// Harness Spawn Result
// ============================================================================

/**
 * Result of a harness spawn attempt.
 * `pid` must be nullable — do not use a sentinel such as -1.
 */
export interface HarnessSpawnResult {
	success: boolean;
	/** OS process ID, if applicable. Null for in-process SDK harnesses. */
	pid?: number | null;
}

// ============================================================================
// Harness Runtime Settings
// ============================================================================

/**
 * Runtime settings that can be updated on a running harness.
 *
 * Day 1 notes:
 * - `permissionMode: 'bypassPermissions'` is the single source of truth for "allow all"
 * - `model` maps to Claude's query.setModel() and supports model-switching UI
 * - Provider-specific runtime controls (e.g., reasoning effort) belong in
 *   `providerOptions`, not here
 */
export interface HarnessRuntimeSettings {
	permissionMode?: PermissionMode;
	model?: string;
	/** Provider-specific runtime options (adapter-owned, opaque to shared code) */
	providerOptions?: Record<string, unknown>;
}

// ============================================================================
// Harness Events
// ============================================================================

/**
 * Events emitted by harness instances.
 *
 * Harnesses emit existing ProcessManagerEvents (data, stderr, exit,
 * session-id, usage, thinking-chunk, tool-execution, agent-error,
 * query-complete, slash-commands) plus these harness-specific events.
 */
export interface HarnessEvents {
	/** Mid-turn interaction requiring user response */
	'interaction-request': (sessionId: string, request: import('../../shared/interaction-types').InteractionRequest) => void;
	/** Runtime metadata (skills, models, agents, slash commands, capabilities) */
	'runtime-metadata': (sessionId: string, metadata: import('../../shared/runtime-metadata-types').RuntimeMetadataEvent) => void;
}

// ============================================================================
// AgentHarness Interface
// ============================================================================

/**
 * Per-agent execution harness.
 *
 * Wraps an SDK or CLI adapter and maps provider-specific behavior into
 * generic Maestro execution events and interaction requests. Extends
 * EventEmitter so that ProcessManager can listen for both standard
 * ProcessManagerEvents and harness-specific events.
 *
 * Lifecycle:
 * 1. Factory creates a new instance
 * 2. ProcessManager calls spawn() with config
 * 3. Harness emits events as the agent runs
 * 4. ProcessManager or renderer may call write(), interrupt(), kill(),
 *    respondToInteraction(), or updateRuntimeSettings()
 * 5. On completion or kill, harness emits exit and cleans up
 */
export interface AgentHarness extends EventEmitter {
	/** The agent type this harness serves */
	readonly agentId: ToolType;

	/**
	 * Start an agent execution.
	 * Returns a result indicating success and optional PID.
	 */
	spawn(config: AgentExecutionConfig): Promise<HarnessSpawnResult>;

	/**
	 * Write follow-up input to the running execution.
	 * Only valid when the harness supports mid-turn input.
	 */
	write(input: HarnessInput): void;

	/**
	 * Interrupt the current execution.
	 * Resolves all pending interactions deterministically using interrupt
	 * responses, then signals the underlying SDK/process.
	 */
	interrupt(): Promise<void>;

	/**
	 * Kill the execution.
	 * Resolves all pending interactions deterministically using termination
	 * responses, then tears down the underlying SDK/process. After kill(),
	 * the harness is no longer usable.
	 */
	kill(): void;

	/**
	 * Dispose the harness, releasing all resources.
	 *
	 * Performs full deterministic cleanup:
	 * 1. Kills the execution if still running (resolves pending interactions)
	 * 2. Clears all pending interaction timeouts
	 * 3. Removes all event listeners
	 * 4. Marks the harness as disposed — all subsequent calls no-op or throw
	 *
	 * ProcessManager should call this when removing the execution record.
	 * Safe to call multiple times (idempotent).
	 */
	dispose(): void;

	/** Whether the harness has been disposed */
	isDisposed(): boolean;

	/**
	 * Respond to a pending interaction request.
	 * The harness translates the generic InteractionResponse into the
	 * provider-specific format internally.
	 *
	 * Throws if interactionId is unknown or expired.
	 */
	respondToInteraction(interactionId: string, response: InteractionResponse): Promise<void>;

	/**
	 * Update runtime settings on the running execution.
	 * The harness applies changes through provider-specific APIs.
	 */
	updateRuntimeSettings(settings: HarnessRuntimeSettings): Promise<void>;

	/** Whether the harness currently has an active execution */
	isRunning(): boolean;

	/**
	 * Get the runtime capabilities of this harness.
	 * Returns the full set of capability flags — callers use these to
	 * determine which runtime controls to enable.
	 */
	getCapabilities(): HarnessRuntimeCapabilities;
}
