/**
 * Tests for harnessStore - Harness-backed agent state management
 *
 * Tests interaction request storage, removal, response flow,
 * runtime metadata merge/replace semantics, and session cleanup.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	useHarnessStore,
	selectSessionInteractions,
	selectHasPendingInteractions,
	selectSessionRuntimeMetadata,
	getHarnessState,
	getHarnessActions,
} from '../../../renderer/stores/harnessStore';
import type { SessionRuntimeMetadata } from '../../../renderer/stores/harnessStore';
import type { InteractionRequest, ToolApprovalRequest, ClarificationRequest } from '../../../shared/interaction-types';
import type { RuntimeMetadataEvent } from '../../../shared/runtime-metadata-types';

// ============================================================================
// Helpers
// ============================================================================

function createToolApproval(overrides: Partial<ToolApprovalRequest> = {}): ToolApprovalRequest {
	return {
		interactionId: overrides.interactionId ?? `int-${Math.random().toString(36).slice(2, 8)}`,
		sessionId: overrides.sessionId ?? 'session-1',
		agentId: overrides.agentId ?? 'claude-code',
		kind: 'tool-approval',
		timestamp: overrides.timestamp ?? Date.now(),
		toolUseId: overrides.toolUseId ?? 'tool-use-1',
		toolName: overrides.toolName ?? 'Edit',
		toolInput: overrides.toolInput ?? { file_path: '/test.ts' },
		...overrides,
	};
}

function createClarification(overrides: Partial<ClarificationRequest> = {}): ClarificationRequest {
	return {
		interactionId: overrides.interactionId ?? `int-${Math.random().toString(36).slice(2, 8)}`,
		sessionId: overrides.sessionId ?? 'session-1',
		agentId: overrides.agentId ?? 'claude-code',
		kind: 'clarification',
		timestamp: overrides.timestamp ?? Date.now(),
		questions: overrides.questions ?? [
			{
				question: 'Which approach?',
				header: 'Approach',
				options: [
					{ label: 'A', description: 'First option' },
					{ label: 'B', description: 'Second option' },
				],
				multiSelect: false,
			},
		],
		allowFreeText: overrides.allowFreeText ?? true,
		...overrides,
	};
}

// ============================================================================
// Setup
// ============================================================================

// Mock window.maestro.process.respondToInteraction
const mockRespondToInteraction = vi.fn().mockResolvedValue(undefined);

(window as any).maestro = {
	...(window as any).maestro,
	process: {
		...((window as any).maestro?.process ?? {}),
		respondToInteraction: mockRespondToInteraction,
	},
};

function resetStore() {
	useHarnessStore.setState({
		pendingInteractions: {},
		runtimeMetadata: {},
	});
}

beforeEach(() => {
	resetStore();
	vi.clearAllMocks();
});

// ============================================================================
// Tests — Interaction Request State
// ============================================================================

describe('harnessStore', () => {
	describe('initial state', () => {
		it('has empty pending interactions and runtime metadata', () => {
			const state = useHarnessStore.getState();
			expect(state.pendingInteractions).toEqual({});
			expect(state.runtimeMetadata).toEqual({});
		});
	});

	// === Interaction Management ===

	describe('addInteraction', () => {
		it('adds a tool approval interaction for a session', () => {
			const request = createToolApproval({ interactionId: 'int-1', sessionId: 'session-1' });
			useHarnessStore.getState().addInteraction('session-1', request);

			const state = useHarnessStore.getState();
			expect(state.pendingInteractions['session-1']).toHaveLength(1);
			expect(state.pendingInteractions['session-1'][0]).toBe(request);
		});

		it('adds a clarification interaction for a session', () => {
			const request = createClarification({ interactionId: 'int-2', sessionId: 'session-1' });
			useHarnessStore.getState().addInteraction('session-1', request);

			const state = useHarnessStore.getState();
			expect(state.pendingInteractions['session-1']).toHaveLength(1);
			expect(state.pendingInteractions['session-1'][0].kind).toBe('clarification');
		});

		it('appends multiple interactions for the same session', () => {
			const req1 = createToolApproval({ interactionId: 'int-1' });
			const req2 = createClarification({ interactionId: 'int-2' });

			const actions = useHarnessStore.getState();
			actions.addInteraction('session-1', req1);
			actions.addInteraction('session-1', req2);

			const state = useHarnessStore.getState();
			expect(state.pendingInteractions['session-1']).toHaveLength(2);
			expect(state.pendingInteractions['session-1'][0].kind).toBe('tool-approval');
			expect(state.pendingInteractions['session-1'][1].kind).toBe('clarification');
		});

		it('keeps interactions separate across sessions', () => {
			const req1 = createToolApproval({ interactionId: 'int-1', sessionId: 'session-1' });
			const req2 = createToolApproval({ interactionId: 'int-2', sessionId: 'session-2' });

			const actions = useHarnessStore.getState();
			actions.addInteraction('session-1', req1);
			actions.addInteraction('session-2', req2);

			const state = useHarnessStore.getState();
			expect(state.pendingInteractions['session-1']).toHaveLength(1);
			expect(state.pendingInteractions['session-2']).toHaveLength(1);
		});

		it('ignores duplicate interaction IDs', () => {
			const request = createToolApproval({ interactionId: 'int-1' });

			const actions = useHarnessStore.getState();
			actions.addInteraction('session-1', request);
			actions.addInteraction('session-1', request);

			const state = useHarnessStore.getState();
			expect(state.pendingInteractions['session-1']).toHaveLength(1);
		});
	});

	describe('removeInteraction', () => {
		it('removes a specific interaction by ID', () => {
			const req1 = createToolApproval({ interactionId: 'int-1' });
			const req2 = createToolApproval({ interactionId: 'int-2' });

			const actions = useHarnessStore.getState();
			actions.addInteraction('session-1', req1);
			actions.addInteraction('session-1', req2);
			actions.removeInteraction('session-1', 'int-1');

			const state = useHarnessStore.getState();
			expect(state.pendingInteractions['session-1']).toHaveLength(1);
			expect(state.pendingInteractions['session-1'][0].interactionId).toBe('int-2');
		});

		it('is a no-op for unknown interaction ID', () => {
			const request = createToolApproval({ interactionId: 'int-1' });
			useHarnessStore.getState().addInteraction('session-1', request);

			const stateBefore = useHarnessStore.getState();
			useHarnessStore.getState().removeInteraction('session-1', 'nonexistent');
			const stateAfter = useHarnessStore.getState();

			// Should be the same reference (no state change)
			expect(stateAfter.pendingInteractions).toBe(stateBefore.pendingInteractions);
		});

		it('is a no-op for unknown session ID', () => {
			const stateBefore = useHarnessStore.getState();
			useHarnessStore.getState().removeInteraction('unknown-session', 'int-1');
			const stateAfter = useHarnessStore.getState();
			expect(stateAfter.pendingInteractions).toBe(stateBefore.pendingInteractions);
		});
	});

	describe('clearSessionInteractions', () => {
		it('removes all interactions for a session', () => {
			const actions = useHarnessStore.getState();
			actions.addInteraction('session-1', createToolApproval({ interactionId: 'int-1' }));
			actions.addInteraction('session-1', createToolApproval({ interactionId: 'int-2' }));
			actions.addInteraction('session-2', createToolApproval({ interactionId: 'int-3' }));

			useHarnessStore.getState().clearSessionInteractions('session-1');

			const state = useHarnessStore.getState();
			expect(state.pendingInteractions['session-1']).toBeUndefined();
			expect(state.pendingInteractions['session-2']).toHaveLength(1);
		});

		it('is a no-op for session with no interactions', () => {
			const stateBefore = useHarnessStore.getState();
			useHarnessStore.getState().clearSessionInteractions('unknown');
			const stateAfter = useHarnessStore.getState();
			expect(stateAfter.pendingInteractions).toBe(stateBefore.pendingInteractions);
		});
	});

	describe('respondToInteraction', () => {
		it('removes interaction from pending and dispatches IPC', async () => {
			const request = createToolApproval({ interactionId: 'int-1' });
			useHarnessStore.getState().addInteraction('session-1', request);

			await useHarnessStore.getState().respondToInteraction('session-1', 'int-1', {
				kind: 'approve',
			});

			// Interaction should be removed from pending
			const state = useHarnessStore.getState();
			expect(state.pendingInteractions['session-1'] || []).toHaveLength(0);

			// IPC should have been called
			expect(mockRespondToInteraction).toHaveBeenCalledWith('session-1', 'int-1', {
				kind: 'approve',
			});
		});

		it('handles deny response', async () => {
			const request = createToolApproval({ interactionId: 'int-1' });
			useHarnessStore.getState().addInteraction('session-1', request);

			await useHarnessStore.getState().respondToInteraction('session-1', 'int-1', {
				kind: 'deny',
				message: 'Not allowed',
			});

			expect(mockRespondToInteraction).toHaveBeenCalledWith('session-1', 'int-1', {
				kind: 'deny',
				message: 'Not allowed',
			});
		});

		it('handles clarification-answer response', async () => {
			const request = createClarification({ interactionId: 'int-1' });
			useHarnessStore.getState().addInteraction('session-1', request);

			const response = {
				kind: 'clarification-answer' as const,
				answers: [{ questionIndex: 0, selectedOptionLabels: ['A'] }],
			};

			await useHarnessStore.getState().respondToInteraction('session-1', 'int-1', response);

			expect(mockRespondToInteraction).toHaveBeenCalledWith('session-1', 'int-1', response);
		});

		it('handles cancel response', async () => {
			const request = createToolApproval({ interactionId: 'int-1' });
			useHarnessStore.getState().addInteraction('session-1', request);

			await useHarnessStore.getState().respondToInteraction('session-1', 'int-1', {
				kind: 'cancel',
				message: 'User cancelled',
			});

			expect(mockRespondToInteraction).toHaveBeenCalledWith('session-1', 'int-1', {
				kind: 'cancel',
				message: 'User cancelled',
			});
		});

		it('does not re-add interaction on IPC failure', async () => {
			mockRespondToInteraction.mockRejectedValueOnce(new Error('IPC failed'));
			const request = createToolApproval({ interactionId: 'int-1' });
			useHarnessStore.getState().addInteraction('session-1', request);

			// Should not throw
			await useHarnessStore.getState().respondToInteraction('session-1', 'int-1', {
				kind: 'approve',
			});

			// Interaction should still be removed (optimistic removal)
			const state = useHarnessStore.getState();
			expect(state.pendingInteractions['session-1'] || []).toHaveLength(0);
		});
	});

	// === Runtime Metadata ===

	describe('applyRuntimeMetadata', () => {
		it('creates metadata entry for new session', () => {
			const event: RuntimeMetadataEvent = {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [{ id: 'skill-1', name: 'Commit', description: 'Git commit' }],
			};

			useHarnessStore.getState().applyRuntimeMetadata('session-1', event);

			const metadata = useHarnessStore.getState().runtimeMetadata['session-1'];
			expect(metadata).toBeDefined();
			expect(metadata.skills).toHaveLength(1);
			expect(metadata.skills[0].name).toBe('Commit');
			// Other fields should be empty defaults
			expect(metadata.slashCommands).toEqual([]);
			expect(metadata.availableModels).toEqual([]);
			expect(metadata.availableAgents).toEqual([]);
			expect(metadata.capabilities).toEqual({});
		});

		it('merges skills by ID (incremental update)', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [{ id: 's1', name: 'Skill A' }],
			});

			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [
					{ id: 's2', name: 'Skill B' },
					{ id: 's1', name: 'Skill A Updated' },
				],
			});

			const metadata = useHarnessStore.getState().runtimeMetadata['session-1'];
			expect(metadata.skills).toHaveLength(2);
			expect(metadata.skills.find((s) => s.id === 's1')?.name).toBe('Skill A Updated');
			expect(metadata.skills.find((s) => s.id === 's2')?.name).toBe('Skill B');
		});

		it('replaces skills when replace=true', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [
					{ id: 's1', name: 'Skill A' },
					{ id: 's2', name: 'Skill B' },
				],
			});

			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				replace: true,
				skills: [{ id: 's3', name: 'Skill C' }],
			});

			const metadata = useHarnessStore.getState().runtimeMetadata['session-1'];
			expect(metadata.skills).toHaveLength(1);
			expect(metadata.skills[0].id).toBe('s3');
		});

		it('merges slash commands without duplicates', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				slashCommands: ['/help', '/compact'],
			});

			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				slashCommands: ['/compact', '/clear'],
			});

			const metadata = useHarnessStore.getState().runtimeMetadata['session-1'];
			expect(metadata.slashCommands).toEqual(['/help', '/compact', '/clear']);
		});

		it('replaces slash commands when replace=true', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				slashCommands: ['/help', '/compact'],
			});

			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				replace: true,
				slashCommands: ['/new-cmd'],
			});

			const metadata = useHarnessStore.getState().runtimeMetadata['session-1'];
			expect(metadata.slashCommands).toEqual(['/new-cmd']);
		});

		it('merges capabilities incrementally', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				capabilities: { supportsInteractionRequests: true, supportsMidTurnInput: true },
			});

			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				capabilities: { supportsSkillsEnumeration: true },
			});

			const metadata = useHarnessStore.getState().runtimeMetadata['session-1'];
			expect(metadata.capabilities).toEqual({
				supportsInteractionRequests: true,
				supportsMidTurnInput: true,
				supportsSkillsEnumeration: true,
			});
		});

		it('preserves omitted fields on partial update', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [{ id: 's1', name: 'Skill' }],
				slashCommands: ['/help'],
			});

			// Update only models — skills and commands should remain
			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				availableModels: [{ id: 'opus', label: 'Opus' }],
			});

			const metadata = useHarnessStore.getState().runtimeMetadata['session-1'];
			expect(metadata.skills).toHaveLength(1);
			expect(metadata.slashCommands).toEqual(['/help']);
			expect(metadata.availableModels).toHaveLength(1);
		});

		it('preserves omitted fields on replace', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [{ id: 's1', name: 'Skill' }],
				slashCommands: ['/help'],
			});

			// Replace with only models — skills and commands should remain (omitted)
			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				replace: true,
				availableModels: [{ id: 'opus', label: 'Opus' }],
			});

			const metadata = useHarnessStore.getState().runtimeMetadata['session-1'];
			expect(metadata.skills).toHaveLength(1);
			expect(metadata.slashCommands).toEqual(['/help']);
			expect(metadata.availableModels).toHaveLength(1);
		});

		it('merges available models and agents by ID', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				availableModels: [{ id: 'opus', label: 'Opus' }],
				availableAgents: [{ id: 'agent-1', label: 'Main Agent' }],
			});

			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				availableModels: [
					{ id: 'opus', label: 'Opus 4.6' },
					{ id: 'sonnet', label: 'Sonnet' },
				],
				availableAgents: [{ id: 'agent-2', label: 'Sub Agent' }],
			});

			const metadata = useHarnessStore.getState().runtimeMetadata['session-1'];
			expect(metadata.availableModels).toHaveLength(2);
			expect(metadata.availableModels.find((m) => m.id === 'opus')?.label).toBe('Opus 4.6');
			expect(metadata.availableAgents).toHaveLength(2);
		});
	});

	describe('clearSessionMetadata', () => {
		it('removes runtime metadata for a session', () => {
			useHarnessStore.getState().applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [{ id: 's1', name: 'Skill' }],
			});

			useHarnessStore.getState().clearSessionMetadata('session-1');

			expect(useHarnessStore.getState().runtimeMetadata['session-1']).toBeUndefined();
		});

		it('is a no-op for unknown session', () => {
			const stateBefore = useHarnessStore.getState();
			useHarnessStore.getState().clearSessionMetadata('unknown');
			const stateAfter = useHarnessStore.getState();
			expect(stateAfter.runtimeMetadata).toBe(stateBefore.runtimeMetadata);
		});
	});

	// === Session Cleanup ===

	describe('clearSession', () => {
		it('clears both interactions and metadata for a session', () => {
			const actions = useHarnessStore.getState();
			actions.addInteraction('session-1', createToolApproval({ interactionId: 'int-1' }));
			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [{ id: 's1', name: 'Skill' }],
			});

			useHarnessStore.getState().clearSession('session-1');

			const state = useHarnessStore.getState();
			expect(state.pendingInteractions['session-1']).toBeUndefined();
			expect(state.runtimeMetadata['session-1']).toBeUndefined();
		});

		it('does not affect other sessions', () => {
			const actions = useHarnessStore.getState();
			actions.addInteraction('session-1', createToolApproval({ interactionId: 'int-1' }));
			actions.addInteraction('session-2', createToolApproval({ interactionId: 'int-2' }));
			actions.applyRuntimeMetadata('session-2', {
				sessionId: 'session-2',
				source: 'claude-code',
				skills: [{ id: 's1', name: 'Skill' }],
			});

			useHarnessStore.getState().clearSession('session-1');

			const state = useHarnessStore.getState();
			expect(state.pendingInteractions['session-2']).toHaveLength(1);
			expect(state.runtimeMetadata['session-2']).toBeDefined();
		});

		it('is a no-op for session with no harness state', () => {
			const stateBefore = useHarnessStore.getState();
			useHarnessStore.getState().clearSession('unknown');
			const stateAfter = useHarnessStore.getState();
			expect(stateAfter.pendingInteractions).toBe(stateBefore.pendingInteractions);
			expect(stateAfter.runtimeMetadata).toBe(stateBefore.runtimeMetadata);
		});
	});

	// === Selectors ===

	describe('selectors', () => {
		it('selectSessionInteractions returns empty array for unknown session', () => {
			const state = useHarnessStore.getState();
			expect(selectSessionInteractions(state, 'unknown')).toEqual([]);
		});

		it('selectSessionInteractions returns interactions for session', () => {
			const request = createToolApproval({ interactionId: 'int-1' });
			useHarnessStore.getState().addInteraction('session-1', request);

			const state = useHarnessStore.getState();
			const interactions = selectSessionInteractions(state, 'session-1');
			expect(interactions).toHaveLength(1);
			expect(interactions[0]).toBe(request);
		});

		it('selectHasPendingInteractions returns false for empty session', () => {
			const state = useHarnessStore.getState();
			expect(selectHasPendingInteractions(state, 'unknown')).toBe(false);
		});

		it('selectHasPendingInteractions returns true for session with interactions', () => {
			useHarnessStore.getState().addInteraction('session-1', createToolApproval());
			const state = useHarnessStore.getState();
			expect(selectHasPendingInteractions(state, 'session-1')).toBe(true);
		});

		it('selectSessionRuntimeMetadata returns undefined for unknown session', () => {
			const state = useHarnessStore.getState();
			expect(selectSessionRuntimeMetadata(state, 'unknown')).toBeUndefined();
		});

		it('selectSessionRuntimeMetadata returns metadata for session', () => {
			useHarnessStore.getState().applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [{ id: 's1', name: 'Skill' }],
			});

			const state = useHarnessStore.getState();
			const metadata = selectSessionRuntimeMetadata(state, 'session-1');
			expect(metadata).toBeDefined();
			expect(metadata!.skills).toHaveLength(1);
		});
	});

	// === Non-React Access ===

	describe('non-React access', () => {
		it('getHarnessState returns current state', () => {
			useHarnessStore.getState().addInteraction('session-1', createToolApproval({ interactionId: 'int-1' }));

			const state = getHarnessState();
			expect(state.pendingInteractions['session-1']).toHaveLength(1);
		});

		it('getHarnessActions returns stable action references', () => {
			const actions = getHarnessActions();
			expect(typeof actions.addInteraction).toBe('function');
			expect(typeof actions.removeInteraction).toBe('function');
			expect(typeof actions.clearSessionInteractions).toBe('function');
			expect(typeof actions.respondToInteraction).toBe('function');
			expect(typeof actions.applyRuntimeMetadata).toBe('function');
			expect(typeof actions.clearSessionMetadata).toBe('function');
			expect(typeof actions.clearSession).toBe('function');
		});
	});
});
