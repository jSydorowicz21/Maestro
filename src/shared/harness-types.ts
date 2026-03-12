/**
 * Shared Harness Types
 *
 * Types that need to be accessible from both the main process (harness
 * implementations) and the renderer/preload layers (IPC pipelines).
 *
 * BOUNDARY INVARIANT: This file lives in shared/ so that preload and
 * renderer code can import it without reaching into main-process-only
 * modules. Main-process code re-exports these types from
 * harness/agent-harness.ts for backwards compatibility.
 */

import type { PermissionMode } from './types';

// ============================================================================
// Harness Runtime Settings
// ============================================================================

/**
 * Runtime settings that can be updated on a running harness.
 *
 * Phase 1 notes:
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
