/**
 * Static Agent Capabilities — Layer 1 of the three-layer capability model.
 *
 * These are facts about an agent *type* (e.g., "claude-code supports resume"),
 * known before any process is spawned. They gate UI features, execution-mode
 * selection, and feature availability.
 *
 * Capability layers (keep distinct — do not conflate):
 *   1. Static agent capabilities (this file) — known before spawn, agent-scoped
 *   2. Harness runtime capabilities (HarnessRuntimeCapabilities) — known after
 *      harness creation, per-harness-instance
 *   3. Session runtime metadata (SessionRuntimeMetadata) — concrete data
 *      discovered during execution, per-session
 *
 * BOUNDARY: This module lives in shared/ so both main and renderer processes
 * import the same type. Never define a local copy of AgentCapabilities.
 */

/**
 * Capability flags that determine what features are available for each agent.
 *
 * These are *static* facts about an agent type, not session-scoped runtime
 * state. For runtime capabilities discovered after harness creation, see
 * HarnessRuntimeCapabilities in runtime-metadata-types.ts.
 */
export interface AgentCapabilities {
	/** Agent supports resuming existing sessions (e.g., --resume flag) */
	supportsResume: boolean;

	/** Agent supports read-only/plan mode (e.g., --permission-mode plan) */
	supportsReadOnlyMode: boolean;

	/** Agent outputs JSON-formatted responses (for parsing) */
	supportsJsonOutput: boolean;

	/** Agent provides a session ID for conversation continuity */
	supportsSessionId: boolean;

	/** Agent can accept image inputs (screenshots, diagrams, etc.) */
	supportsImageInput: boolean;

	/** Agent can accept image inputs when resuming an existing session */
	supportsImageInputOnResume: boolean;

	/** Agent supports slash commands (e.g., /help, /compact) */
	supportsSlashCommands: boolean;

	/** Agent stores session history in a discoverable location */
	supportsSessionStorage: boolean;

	/** Agent provides cost/pricing information */
	supportsCostTracking: boolean;

	/** Agent provides token usage statistics */
	supportsUsageStats: boolean;

	/** Agent supports batch/headless mode (non-interactive) */
	supportsBatchMode: boolean;

	/** Agent requires a prompt to start (no eager spawn on session creation) */
	requiresPromptToStart: boolean;

	/** Agent streams responses in real-time */
	supportsStreaming: boolean;

	/** Agent provides distinct "result" messages when done */
	supportsResultMessages: boolean;

	/** Agent supports selecting different models (e.g., --model flag) */
	supportsModelSelection: boolean;

	/** Agent supports --input-format stream-json for image input via stdin */
	supportsStreamJsonInput: boolean;

	/** Agent emits streaming thinking/reasoning content that can be displayed */
	supportsThinkingDisplay: boolean;

	/** Agent can receive merged context from other sessions/tabs */
	supportsContextMerge: boolean;

	/** Agent can export its context for transfer to other sessions/agents */
	supportsContextExport: boolean;

	/** Agent supports inline wizard structured output conversations */
	supportsWizard: boolean;

	/** Agent can serve as a group chat moderator */
	supportsGroupChatModeration: boolean;

	/** Agent uses JSON line (JSONL) output format in CLI batch mode */
	usesJsonLineOutput: boolean;

	/** Agent uses a combined input+output context window (vs separate limits) */
	usesCombinedContextWindow: boolean;

	/** Agent can run through a harness-backed execution path (SDK or adapter) */
	supportsHarnessExecution: boolean;

	/** How images should be handled on resume when -i flag is not available.
	 * 'prompt-embed': Save images to temp files and embed file paths in the prompt text.
	 * undefined: Use default image handling (or no special resume handling needed). */
	imageResumeMode?: 'prompt-embed';
}

/**
 * Default capabilities - safe defaults for unknown agents.
 * All capabilities disabled by default (conservative approach).
 */
export const DEFAULT_CAPABILITIES: AgentCapabilities = {
	supportsResume: false,
	supportsReadOnlyMode: false,
	supportsJsonOutput: false,
	supportsSessionId: false,
	supportsImageInput: false,
	supportsImageInputOnResume: false,
	supportsSlashCommands: false,
	supportsSessionStorage: false,
	supportsCostTracking: false,
	supportsUsageStats: false,
	supportsBatchMode: false,
	requiresPromptToStart: false,
	supportsStreaming: false,
	supportsResultMessages: false,
	supportsModelSelection: false,
	supportsStreamJsonInput: false,
	supportsThinkingDisplay: false,
	supportsContextMerge: false,
	supportsContextExport: false,
	supportsWizard: false,
	supportsGroupChatModeration: false,
	usesJsonLineOutput: false,
	usesCombinedContextWindow: false,
	supportsHarnessExecution: false,
	imageResumeMode: undefined,
};
