/**
 * Typed Claude Provider Option Helpers
 *
 * These builders are the ONLY sanctioned way to construct providerOptions
 * for Claude harness execution and runtime updates. Callers must use
 * buildClaudeProviderOptions() and buildClaudeRuntimeOptions() instead
 * of ad hoc Record<string, unknown> construction.
 *
 * BOUNDARY INVARIANT: These types live inside the harness directory because
 * they describe Claude-specific option shapes. Shared code must treat
 * providerOptions as opaque Record<string, unknown>. Only the Claude
 * harness adapter inspects and validates these values at runtime.
 *
 * Design rationale:
 * - Typed builders give callers compile-time safety without leaking
 *   provider internals into shared contracts
 * - The harness owns runtime validation and narrowing (extractProviderOptions)
 * - Unknown keys are ignored with a warning, never crash execution
 */

// ============================================================================
// Spawn-Time Provider Options
// ============================================================================

/**
 * Claude-specific options for harness spawn configuration.
 *
 * These map directly to Claude Agent SDK query options that are not
 * part of the shared AgentExecutionConfig contract. Each field is
 * optional — omitted fields use SDK defaults.
 */
export interface ClaudeProviderOptions {
	/** Continue the most recent session in the working directory */
	continueSession?: boolean;
	/** Fork when resuming a session (branch from resumed session) */
	forkSession?: boolean;
	/** Thinking/reasoning configuration */
	thinking?: { type: 'adaptive' } | { type: 'enabled'; budget_tokens: number };
	/** Reasoning effort level */
	effort?: 'low' | 'medium' | 'high' | 'max';
	/** Tools to auto-approve (bypass canUseTool for these) */
	allowedTools?: string[];
	/** Tools to always deny (overrides everything including bypassPermissions) */
	disallowedTools?: string[];
	/** Maximum cost before stopping */
	maxBudgetUsd?: number;
	/** Enable file change tracking for rewindFiles */
	enableFileCheckpointing?: boolean;
	/** Include streaming partial messages */
	includePartialMessages?: boolean;
	/** Which filesystem settings to load (CLAUDE.md, skills, etc.) */
	settingSources?: string[];
	/** MCP server configurations */
	mcpServers?: Record<string, unknown>;
	/** Sandbox configuration */
	sandbox?: Record<string, unknown>;
}

/**
 * The set of known Claude provider option keys.
 * Used by the harness for runtime validation — unknown keys are
 * ignored with a debug warning.
 */
export const CLAUDE_PROVIDER_OPTION_KEYS: ReadonlySet<string> = new Set([
	'continueSession',
	'forkSession',
	'thinking',
	'effort',
	'allowedTools',
	'disallowedTools',
	'maxBudgetUsd',
	'enableFileCheckpointing',
	'includePartialMessages',
	'settingSources',
	'mcpServers',
	'sandbox',
]);

/**
 * Build typed Claude provider options for AgentExecutionConfig.providerOptions.
 *
 * Returns a Record<string, unknown> that can be assigned to the shared
 * providerOptions field. Only defined (non-undefined) fields are included
 * in the output — this keeps the bag minimal and prevents SDK defaults
 * from being overridden by explicit undefined values.
 *
 * Usage:
 * ```typescript
 * const config: AgentExecutionConfig = {
 *   sessionId: 'abc',
 *   toolType: 'claude-code',
 *   cwd: '/project',
 *   providerOptions: buildClaudeProviderOptions({
 *     effort: 'max',
 *     allowedTools: ['Bash', 'Read'],
 *     maxBudgetUsd: 5.0,
 *   }),
 * };
 * ```
 */
export function buildClaudeProviderOptions(options: ClaudeProviderOptions): Record<string, unknown> {
	const result: Record<string, unknown> = {};

	if (options.continueSession !== undefined) result.continueSession = options.continueSession;
	if (options.forkSession !== undefined) result.forkSession = options.forkSession;
	if (options.thinking !== undefined) result.thinking = options.thinking;
	if (options.effort !== undefined) result.effort = options.effort;
	if (options.allowedTools !== undefined) result.allowedTools = options.allowedTools;
	if (options.disallowedTools !== undefined) result.disallowedTools = options.disallowedTools;
	if (options.maxBudgetUsd !== undefined) result.maxBudgetUsd = options.maxBudgetUsd;
	if (options.enableFileCheckpointing !== undefined) result.enableFileCheckpointing = options.enableFileCheckpointing;
	if (options.includePartialMessages !== undefined) result.includePartialMessages = options.includePartialMessages;
	if (options.settingSources !== undefined) result.settingSources = options.settingSources;
	if (options.mcpServers !== undefined) result.mcpServers = options.mcpServers;
	if (options.sandbox !== undefined) result.sandbox = options.sandbox;

	return result;
}

// ============================================================================
// Runtime Provider Options
// ============================================================================

/**
 * Claude-specific runtime options for updateRuntimeSettings().
 *
 * These are Claude-specific controls that can change mid-session.
 * They belong inside HarnessRuntimeSettings.providerOptions, not
 * as top-level fields on the shared runtime settings contract.
 */
export interface ClaudeRuntimeOptions {
	/** Change reasoning effort level mid-session */
	effort?: 'low' | 'medium' | 'high' | 'max';
}

/**
 * The set of known Claude runtime option keys.
 * Used by the harness for runtime validation.
 */
export const CLAUDE_RUNTIME_OPTION_KEYS: ReadonlySet<string> = new Set([
	'effort',
]);

/**
 * Build typed Claude runtime options for HarnessRuntimeSettings.providerOptions.
 *
 * Usage:
 * ```typescript
 * await harness.updateRuntimeSettings({
 *   providerOptions: buildClaudeRuntimeOptions({
 *     effort: 'max',
 *   }),
 * });
 * ```
 */
export function buildClaudeRuntimeOptions(options: ClaudeRuntimeOptions): Record<string, unknown> {
	const result: Record<string, unknown> = {};

	if (options.effort !== undefined) result.effort = options.effort;

	return result;
}
