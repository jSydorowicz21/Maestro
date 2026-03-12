/**
 * harnessStore - Zustand store for harness-backed agent state
 *
 * Manages renderer-side state for harness features:
 * 1. Pending interaction requests (tool approvals, clarifications) by session
 * 2. Runtime metadata (skills, models, agents, capabilities) by session
 *
 * Design decisions:
 * - Interaction requests are keyed by session ID (each session can have
 *   multiple pending interactions concurrently)
 * - Runtime metadata is keyed by session ID and merged incrementally
 *   unless a `replace: true` event arrives
 * - Responding to an interaction removes it from pending state and
 *   dispatches the response via IPC to the main process
 * - Session cleanup (exit/kill/reset) clears both interactions and metadata
 *
 * Can be used outside React via useHarnessStore.getState() / getHarnessActions().
 */

import { create } from 'zustand';
import type { InteractionRequest, InteractionResponse } from '../../shared/interaction-types';
import type {
	RuntimeMetadataEvent,
	HarnessRuntimeCapabilities,
	SkillSummary,
	RuntimeModelSummary,
	RuntimeAgentSummary,
} from '../../shared/runtime-metadata-types';

// ============================================================================
// Store Types
// ============================================================================

/**
 * Accumulated runtime metadata for a single session.
 * Built up from RuntimeMetadataEvent emissions over the session lifetime.
 */
export interface SessionRuntimeMetadata {
	skills: SkillSummary[];
	slashCommands: string[];
	availableModels: RuntimeModelSummary[];
	availableAgents: RuntimeAgentSummary[];
	capabilities: Partial<HarnessRuntimeCapabilities>;
}

export interface HarnessStoreState {
	/**
	 * Pending interaction requests indexed by session ID.
	 * Each session can have multiple pending interactions concurrently
	 * (e.g., tool approval followed by clarification before first resolves).
	 */
	pendingInteractions: Record<string, InteractionRequest[]>;

	/**
	 * Accumulated runtime metadata indexed by session ID.
	 * Merged incrementally from RuntimeMetadataEvent emissions.
	 */
	runtimeMetadata: Record<string, SessionRuntimeMetadata>;
}

export interface HarnessStoreActions {
	// === Interaction Management ===

	/** Add a pending interaction request for a session */
	addInteraction: (sessionId: string, request: InteractionRequest) => void;

	/** Remove a specific interaction by ID (after response, timeout, or cancel) */
	removeInteraction: (sessionId: string, interactionId: string) => void;

	/** Clear all pending interactions for a session (on exit/kill/reset) */
	clearSessionInteractions: (sessionId: string) => void;

	/**
	 * Respond to an interaction: remove from pending state and dispatch
	 * the response via IPC to the main process harness.
	 */
	respondToInteraction: (
		sessionId: string,
		interactionId: string,
		response: InteractionResponse
	) => Promise<void>;

	// === Runtime Metadata ===

	/**
	 * Apply a runtime metadata event for a session.
	 * If `replace` is true, replaces included fields entirely.
	 * Otherwise merges arrays by appending new entries (deduped by id).
	 */
	applyRuntimeMetadata: (sessionId: string, event: RuntimeMetadataEvent) => void;

	/** Clear runtime metadata for a session (on exit/kill/reset) */
	clearSessionMetadata: (sessionId: string) => void;

	// === Session Cleanup ===

	/** Clear all harness state for a session (interactions + metadata) */
	clearSession: (sessionId: string) => void;
}

export type HarnessStore = HarnessStoreState & HarnessStoreActions;

// ============================================================================
// Helpers
// ============================================================================

/** Empty runtime metadata for initialization */
function emptyMetadata(): SessionRuntimeMetadata {
	return {
		skills: [],
		slashCommands: [],
		availableModels: [],
		availableAgents: [],
		capabilities: {},
	};
}

/**
 * Merge an array of items with id fields, deduplicating by id.
 * New items with the same id replace existing ones.
 */
function mergeById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
	const map = new Map<string, T>();
	for (const item of existing) map.set(item.id, item);
	for (const item of incoming) map.set(item.id, item);
	return Array.from(map.values());
}

/**
 * Merge slash commands, deduplicating.
 */
function mergeSlashCommands(existing: string[], incoming: string[]): string[] {
	const set = new Set(existing);
	for (const cmd of incoming) set.add(cmd);
	return Array.from(set);
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useHarnessStore = create<HarnessStore>()((set, get) => ({
	// --- State ---
	pendingInteractions: {},
	runtimeMetadata: {},

	// --- Interaction Actions ---

	addInteraction: (sessionId, request) => {
		set((state) => {
			const existing = state.pendingInteractions[sessionId] || [];
			// Avoid duplicate interaction IDs
			if (existing.some((r) => r.interactionId === request.interactionId)) {
				return state;
			}
			return {
				pendingInteractions: {
					...state.pendingInteractions,
					[sessionId]: [...existing, request],
				},
			};
		});
	},

	removeInteraction: (sessionId, interactionId) => {
		set((state) => {
			const existing = state.pendingInteractions[sessionId];
			if (!existing) return state;
			const filtered = existing.filter((r) => r.interactionId !== interactionId);
			if (filtered.length === existing.length) return state; // no change
			return {
				pendingInteractions: {
					...state.pendingInteractions,
					[sessionId]: filtered,
				},
			};
		});
	},

	clearSessionInteractions: (sessionId) => {
		set((state) => {
			if (!state.pendingInteractions[sessionId]?.length) return state;
			const { [sessionId]: _, ...rest } = state.pendingInteractions;
			return { pendingInteractions: rest };
		});
	},

	respondToInteraction: async (sessionId, interactionId, response) => {
		// Remove from pending state immediately (optimistic)
		get().removeInteraction(sessionId, interactionId);

		// Dispatch response to main process via IPC
		try {
			await window.maestro.process.respondToInteraction(sessionId, interactionId, response);
		} catch (err) {
			console.error(
				`[harnessStore] Failed to respond to interaction ${interactionId}:`,
				err
			);
			// Don't re-add — the harness will timeout and handle cleanup
		}
	},

	// --- Runtime Metadata Actions ---

	applyRuntimeMetadata: (sessionId, event) => {
		set((state) => {
			const existing = state.runtimeMetadata[sessionId] || emptyMetadata();
			let updated: SessionRuntimeMetadata;

			if (event.replace) {
				// Full snapshot: replace included fields, keep omitted fields
				updated = {
					skills: event.skills ?? existing.skills,
					slashCommands: event.slashCommands ?? existing.slashCommands,
					availableModels: event.availableModels ?? existing.availableModels,
					availableAgents: event.availableAgents ?? existing.availableAgents,
					capabilities: event.capabilities ?? existing.capabilities,
				};
			} else {
				// Incremental merge: merge arrays, merge capability flags
				updated = {
					skills: event.skills
						? mergeById(existing.skills, event.skills)
						: existing.skills,
					slashCommands: event.slashCommands
						? mergeSlashCommands(existing.slashCommands, event.slashCommands)
						: existing.slashCommands,
					availableModels: event.availableModels
						? mergeById(existing.availableModels, event.availableModels)
						: existing.availableModels,
					availableAgents: event.availableAgents
						? mergeById(existing.availableAgents, event.availableAgents)
						: existing.availableAgents,
					capabilities: event.capabilities
						? { ...existing.capabilities, ...event.capabilities }
						: existing.capabilities,
				};
			}

			return {
				runtimeMetadata: {
					...state.runtimeMetadata,
					[sessionId]: updated,
				},
			};
		});
	},

	clearSessionMetadata: (sessionId) => {
		set((state) => {
			if (!state.runtimeMetadata[sessionId]) return state;
			const { [sessionId]: _, ...rest } = state.runtimeMetadata;
			return { runtimeMetadata: rest };
		});
	},

	// --- Session Cleanup ---

	clearSession: (sessionId) => {
		set((state) => {
			const hasInteractions = !!state.pendingInteractions[sessionId]?.length;
			const hasMetadata = !!state.runtimeMetadata[sessionId];
			if (!hasInteractions && !hasMetadata) return state;

			const { [sessionId]: _i, ...restInteractions } = state.pendingInteractions;
			const { [sessionId]: _m, ...restMetadata } = state.runtimeMetadata;
			return {
				pendingInteractions: restInteractions,
				runtimeMetadata: restMetadata,
			};
		});
	},
}));

// ============================================================================
// Selectors
// ============================================================================

/** Select pending interactions for a specific session */
export const selectSessionInteractions = (
	state: HarnessStore,
	sessionId: string
): InteractionRequest[] => state.pendingInteractions[sessionId] || [];

/** Select whether a session has any pending interactions */
export const selectHasPendingInteractions = (
	state: HarnessStore,
	sessionId: string
): boolean => (state.pendingInteractions[sessionId]?.length ?? 0) > 0;

/** Select runtime metadata for a specific session */
export const selectSessionRuntimeMetadata = (
	state: HarnessStore,
	sessionId: string
): SessionRuntimeMetadata | undefined => state.runtimeMetadata[sessionId];

// ============================================================================
// Non-React Access
// ============================================================================

/**
 * Get the current harness store state snapshot.
 * Use outside React (services, orchestrators, IPC handlers).
 */
export function getHarnessState() {
	return useHarnessStore.getState();
}

/**
 * Get stable harness action references outside React.
 */
export function getHarnessActions() {
	const state = useHarnessStore.getState();
	return {
		addInteraction: state.addInteraction,
		removeInteraction: state.removeInteraction,
		clearSessionInteractions: state.clearSessionInteractions,
		respondToInteraction: state.respondToInteraction,
		applyRuntimeMetadata: state.applyRuntimeMetadata,
		clearSessionMetadata: state.clearSessionMetadata,
		clearSession: state.clearSession,
	};
}
