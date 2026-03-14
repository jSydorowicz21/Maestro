/**
 * Typed Codex Provider Option Helpers
 *
 * These builders are the ONLY sanctioned way to construct providerOptions
 * for Codex harness execution. Callers must use buildCodexProviderOptions()
 * instead of ad hoc Record<string, unknown> construction.
 *
 * BOUNDARY INVARIANT: These types live inside the harness directory because
 * they describe Codex-specific option shapes. Shared code must treat
 * providerOptions as opaque Record<string, unknown>. Only the Codex
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
 * Codex-specific options for harness spawn configuration.
 *
 * These map directly to Codex SDK exec options that are not part of
 * the shared AgentExecutionConfig contract. Each field is optional —
 * omitted fields use SDK defaults.
 */
export interface CodexProviderOptions {
	/** Model to use (e.g., 'gpt-5.2-codex', 'o4-mini') */
	model?: string;
	/** Sandbox mode: 'read-only', 'full', or 'none' */
	sandbox?: string;
}

/**
 * The set of known Codex provider option keys.
 * Used by the harness for runtime validation — unknown keys are
 * ignored with a debug warning.
 */
export const CODEX_PROVIDER_OPTION_KEYS: ReadonlySet<string> = new Set([
	'model',
	'sandbox',
]);

/**
 * Build typed Codex provider options for AgentExecutionConfig.providerOptions.
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
 *   toolType: 'codex',
 *   cwd: '/project',
 *   providerOptions: buildCodexProviderOptions({
 *     model: 'gpt-5.2-codex',
 *     sandbox: 'read-only',
 *   }),
 * };
 * ```
 */
export function buildCodexProviderOptions(options: CodexProviderOptions): Record<string, unknown> {
	const result: Record<string, unknown> = {};

	if (options.model !== undefined) result.model = options.model;
	if (options.sandbox !== undefined) result.sandbox = options.sandbox;

	return result;
}
