/**
 * useSessionRuntimeCapabilities.ts
 *
 * React hook for accessing Layer 2 (harness runtime) capabilities
 * for a specific session. These are discovered after a harness is created
 * and describe what the running harness instance can do at runtime.
 *
 * Three-layer capability model:
 *   Layer 1 — Static agent capabilities (useAgentCapabilities)
 *             Known before spawn, agent-type-scoped.
 *             Example: "claude-code supports resume"
 *
 *   Layer 2 — Harness runtime capabilities (this hook)
 *             Known after harness creation, per-session.
 *             Example: "this session's harness supports runtime model change"
 *
 *   Layer 3 — Session runtime metadata (useHarnessStore + selectSessionRuntimeMetadata)
 *             Concrete data discovered during execution, per-session.
 *             Example: "the available models are [claude-opus-4-6, claude-sonnet-4-6]"
 *
 * Do NOT conflate these layers. A component asking "should I show a model
 * picker?" should check Layer 1 (supportsModelSelection) to decide if the
 * agent type supports it at all, and Layer 2 (supportsRuntimeModelChange)
 * to decide if the current harness session can actually switch models.
 */

import { useCallback } from 'react';
import {
	useHarnessStore,
	selectSessionRuntimeCapabilities,
} from '../../stores/harnessStore';
import type { HarnessRuntimeCapabilities } from '../../../shared/runtime-metadata-types';

/**
 * Return type for useSessionRuntimeCapabilities hook.
 */
export interface UseSessionRuntimeCapabilitiesReturn {
	/** Partial runtime capabilities for this session (undefined if no metadata yet) */
	runtimeCapabilities: Partial<HarnessRuntimeCapabilities> | undefined;
	/** Check if a specific runtime capability is supported */
	hasRuntimeCapability: (capability: keyof HarnessRuntimeCapabilities) => boolean;
}

/**
 * Hook to access Layer 2 (harness runtime) capabilities for a session.
 *
 * @param sessionId - The Maestro session ID
 * @returns Runtime capabilities and a helper to check individual flags
 *
 * @example
 * ```tsx
 * function ModelPicker({ sessionId, toolType }: Props) {
 *   // Layer 1: Does this agent type support model selection at all?
 *   const { hasCapability } = useAgentCapabilities(toolType);
 *   // Layer 2: Can this running session actually switch models?
 *   const { hasRuntimeCapability } = useSessionRuntimeCapabilities(sessionId);
 *
 *   if (!hasCapability('supportsModelSelection')) return null;
 *   if (!hasRuntimeCapability('supportsRuntimeModelChange')) return null;
 *
 *   return <ModelSelector />;
 * }
 * ```
 */
export function useSessionRuntimeCapabilities(
	sessionId: string | null | undefined
): UseSessionRuntimeCapabilitiesReturn {
	const runtimeCapabilities = useHarnessStore((state) =>
		sessionId ? selectSessionRuntimeCapabilities(state, sessionId) : undefined
	);

	const hasRuntimeCapability = useCallback(
		(capability: keyof HarnessRuntimeCapabilities): boolean => {
			return runtimeCapabilities?.[capability] === true;
		},
		[runtimeCapabilities]
	);

	return { runtimeCapabilities, hasRuntimeCapability };
}
