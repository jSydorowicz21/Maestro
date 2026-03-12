/**
 * Shared runtime metadata types for the Agent Harness execution model.
 *
 * These types define the provider-neutral contract for runtime metadata
 * events emitted by harness-backed agents. Runtime metadata includes
 * skills, slash commands, available models, available agents, and
 * runtime capabilities discovered after the harness is created.
 *
 * BOUNDARY INVARIANT: This module must NEVER import from provider-specific
 * code (main/harness/*, @anthropic-ai/sdk, openai, etc.). All types here
 * use generic summary shapes (id + optional label/name/description) so that
 * any provider's harness adapter can emit them without the renderer needing
 * provider-specific decoding. Provider-specific raw payloads should stay
 * inside logs or adapter-local code, not the renderer contract.
 *
 * Runtime metadata is session-scoped, not global agent-scoped.
 * Harnesses emit an initial snapshot early after spawn and may emit
 * incremental updates during execution.
 */

import type { ToolType } from './types';

// ============================================================================
// Runtime Capability Flags
// ============================================================================

/**
 * Runtime capabilities discovered after harness creation.
 * These inform the renderer which runtime controls to enable.
 *
 * Capability layers (keep distinct):
 * 1. Static agent capabilities (AgentCapabilities) — known before spawn
 * 2. Harness runtime capabilities (this interface) — known after harness creation
 * 3. Session runtime metadata (RuntimeMetadataEvent data fields) — concrete session-scoped data
 */
export interface HarnessRuntimeCapabilities {
	// -- Interaction --

	/** Whether the harness supports writing input mid-turn */
	supportsMidTurnInput: boolean;
	/** Whether the harness supports mid-turn interaction requests */
	supportsInteractionRequests: boolean;
	/** Whether the harness supports a persistent stdin channel */
	supportsPersistentStdin: boolean;

	// -- Runtime changes --

	/** Whether the harness supports permission updates at runtime */
	supportsRuntimePermissionUpdates: boolean;
	/** Whether the harness supports changing the model mid-session */
	supportsRuntimeModelChange: boolean;
	/** Whether the harness supports changing reasoning effort at runtime */
	supportsRuntimeEffortChange: boolean;

	// -- Feature discovery --

	/** Whether the harness can enumerate agent skills */
	supportsSkillsEnumeration: boolean;
	/** Whether the harness supports runtime slash commands */
	supportsRuntimeSlashCommands: boolean;

	// -- Data features --

	/** Whether the harness supports file checkpointing (rewind/revert) */
	supportsFileCheckpointing: boolean;
	/** Whether the harness supports structured output */
	supportsStructuredOutput: boolean;
	/** Whether the harness supports budget/token limits */
	supportsBudgetLimits: boolean;
	/** Whether the harness supports context compaction */
	supportsContextCompaction: boolean;
	/** Whether the harness supports session forking */
	supportsSessionFork: boolean;
}

// ============================================================================
// Runtime Summary Types
// ============================================================================

/**
 * Summary of a skill exposed by the agent at runtime.
 */
export interface SkillSummary {
	/** Unique skill identifier */
	id: string;
	/** Human-readable skill name */
	name: string;
	/** Optional short description of what the skill does */
	description?: string;
}

/**
 * Summary of an available model reported by the agent at runtime.
 */
export interface RuntimeModelSummary {
	/** Model identifier (e.g., 'claude-opus-4-6') */
	id: string;
	/** Human-readable label */
	label?: string;
}

/**
 * Summary of an available sub-agent reported by the agent at runtime.
 */
export interface RuntimeAgentSummary {
	/** Agent identifier */
	id: string;
	/** Human-readable label */
	label?: string;
}

// ============================================================================
// Runtime Metadata Event
// ============================================================================

/**
 * Runtime metadata event emitted by harness-backed agents.
 *
 * Rules:
 * - `replace: true` means the payload is a full snapshot for the included fields
 * - Omitted fields mean "no change"
 * - Providers may emit partial updates over time
 * - Provider-specific raw payloads should stay inside logs or adapter-local
 *   code, not the renderer contract
 *
 * Lifecycle:
 * - Session-scoped, not global agent-scoped
 * - Harnesses should emit an initial snapshot early after successful spawn
 * - Harnesses may emit incremental updates during execution
 * - Renderer stores should merge updates by field unless `replace: true`
 * - Session cleanup must clear stored runtime metadata on exit/kill/reset
 */
export interface RuntimeMetadataEvent {
	/** Maestro session ID */
	sessionId: string;
	/** Agent type that produced this event */
	source: ToolType;
	/** If true, treat this as a full snapshot (replace, don't merge) */
	replace?: boolean;

	/** Skills exposed by the agent */
	skills?: SkillSummary[];
	/** Slash commands available in this session */
	slashCommands?: string[];
	/** Models available for runtime switching */
	availableModels?: RuntimeModelSummary[];
	/** Sub-agents available in this session */
	availableAgents?: RuntimeAgentSummary[];
	/** Runtime capability flags */
	capabilities?: Partial<HarnessRuntimeCapabilities>;
}
