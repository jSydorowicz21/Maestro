/**
 * useSessionRuntimeMetadata.ts
 *
 * React hook for accessing Layer 3 (session runtime metadata) for a specific
 * session. This provides the concrete data discovered during execution:
 * skills, slash commands, available models, and available agents.
 *
 * Three-layer capability model:
 *   Layer 1 — Static agent capabilities (useAgentCapabilities)
 *             Known before spawn, agent-type-scoped.
 *
 *   Layer 2 — Harness runtime capabilities (useSessionRuntimeCapabilities)
 *             Known after harness creation, per-session.
 *
 *   Layer 3 — Session runtime metadata (this hook)
 *             Concrete data discovered during execution, per-session.
 *             Example: "the available skills are [commit, review-pr, ...]"
 *
 * Do NOT use this hook for capability checks. Use Layer 1 or Layer 2 hooks
 * for "should I show X?" decisions. Use this hook for "what are the available
 * X values to display?"
 */

import { useHarnessStore, selectSessionRuntimeMetadata } from '../../stores/harnessStore';
import type { SessionRuntimeMetadata } from '../../stores/harnessStore';
import type {
	SkillSummary,
	RuntimeModelSummary,
	RuntimeAgentSummary,
} from '../../../shared/runtime-metadata-types';

/**
 * Return type for useSessionRuntimeMetadata hook.
 */
export interface UseSessionRuntimeMetadataReturn {
	/** Full runtime metadata for this session (undefined if no metadata yet) */
	metadata: SessionRuntimeMetadata | undefined;
	/** Skills discovered by the harness */
	skills: SkillSummary[];
	/** Slash commands available in this session (from harness, not classic IPC) */
	slashCommands: string[];
	/** Models available for runtime switching */
	availableModels: RuntimeModelSummary[];
	/** Sub-agents available in this session */
	availableAgents: RuntimeAgentSummary[];
	/** Whether any runtime metadata has been received for this session */
	hasMetadata: boolean;
}

/** Empty arrays for stable references when no metadata exists */
const EMPTY_SKILLS: SkillSummary[] = [];
const EMPTY_SLASH_COMMANDS: string[] = [];
const EMPTY_MODELS: RuntimeModelSummary[] = [];
const EMPTY_AGENTS: RuntimeAgentSummary[] = [];

/**
 * Hook to access Layer 3 (session runtime metadata) for a session.
 *
 * @param sessionId - The Maestro session ID
 * @returns Runtime metadata fields and a convenience hasMetadata flag
 *
 * @example
 * ```tsx
 * function SkillsList({ sessionId }: Props) {
 *   const { skills, hasMetadata } = useSessionRuntimeMetadata(sessionId);
 *   if (!hasMetadata || skills.length === 0) return null;
 *   return (
 *     <ul>
 *       {skills.map(s => <li key={s.id}>{s.name}</li>)}
 *     </ul>
 *   );
 * }
 * ```
 */
export function useSessionRuntimeMetadata(
	sessionId: string | null | undefined
): UseSessionRuntimeMetadataReturn {
	const metadata = useHarnessStore((state) =>
		sessionId ? selectSessionRuntimeMetadata(state, sessionId) : undefined
	);

	return {
		metadata,
		skills: metadata?.skills ?? EMPTY_SKILLS,
		slashCommands: metadata?.slashCommands ?? EMPTY_SLASH_COMMANDS,
		availableModels: metadata?.availableModels ?? EMPTY_MODELS,
		availableAgents: metadata?.availableAgents ?? EMPTY_AGENTS,
		hasMetadata: metadata !== undefined,
	};
}
