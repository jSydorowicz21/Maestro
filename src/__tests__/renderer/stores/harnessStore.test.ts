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
	selectSessionRuntimeCapabilities,
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

		it('removes interaction only after IPC success', async () => {
			const request = createToolApproval({ interactionId: 'int-1' });
			useHarnessStore.getState().addInteraction('session-1', request);

			// Verify interaction exists before response
			expect(useHarnessStore.getState().pendingInteractions['session-1']).toHaveLength(1);

			await useHarnessStore.getState().respondToInteraction('session-1', 'int-1', {
				kind: 'approve',
			});

			// Interaction removed after successful IPC
			expect(useHarnessStore.getState().pendingInteractions['session-1'] || []).toHaveLength(0);
		});

		it('keeps interaction pending on IPC failure so user can retry', async () => {
			mockRespondToInteraction.mockRejectedValueOnce(new Error('IPC failed'));
			const request = createToolApproval({ interactionId: 'int-1' });
			useHarnessStore.getState().addInteraction('session-1', request);

			// Should throw on IPC failure
			await expect(
				useHarnessStore.getState().respondToInteraction('session-1', 'int-1', {
					kind: 'approve',
				})
			).rejects.toThrow('IPC failed');

			// Interaction should still be pending for retry
			const state = useHarnessStore.getState();
			expect(state.pendingInteractions['session-1']).toHaveLength(1);
			expect(state.pendingInteractions['session-1'][0].interactionId).toBe('int-1');
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

	// === Metadata Merge Edge Cases (Spec: RuntimeMetadataEvent rules) ===

	describe('applyRuntimeMetadata — edge cases', () => {
		it('replace with empty arrays clears the field', () => {
			const actions = useHarnessStore.getState();

			// Seed with data
			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [{ id: 's1', name: 'Skill A' }, { id: 's2', name: 'Skill B' }],
				slashCommands: ['/help', '/compact'],
				availableModels: [{ id: 'opus', label: 'Opus' }],
				availableAgents: [{ id: 'a1', label: 'Agent 1' }],
			});

			// Replace with empty arrays — should clear each field
			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				replace: true,
				skills: [],
				slashCommands: [],
				availableModels: [],
				availableAgents: [],
				capabilities: {},
			});

			const metadata = useHarnessStore.getState().runtimeMetadata['session-1'];
			expect(metadata.skills).toEqual([]);
			expect(metadata.slashCommands).toEqual([]);
			expect(metadata.availableModels).toEqual([]);
			expect(metadata.availableAgents).toEqual([]);
			expect(metadata.capabilities).toEqual({});
		});

		it('replace with capabilities replaces entire capabilities object', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				capabilities: {
					supportsMidTurnInput: true,
					supportsInteractionRequests: true,
					supportsSkillsEnumeration: true,
				},
			});

			// Replace with a subset — omitted flags should be dropped
			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				replace: true,
				capabilities: { supportsMidTurnInput: true },
			});

			const metadata = useHarnessStore.getState().runtimeMetadata['session-1'];
			expect(metadata.capabilities).toEqual({ supportsMidTurnInput: true });
			// The other flags should NOT be present
			expect(metadata.capabilities.supportsInteractionRequests).toBeUndefined();
			expect(metadata.capabilities.supportsSkillsEnumeration).toBeUndefined();
		});

		it('incremental merge can override capability flag from true to false', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				capabilities: { supportsInteractionRequests: true, supportsMidTurnInput: true },
			});

			// Merge update that flips a flag to false
			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				capabilities: { supportsInteractionRequests: false },
			});

			const metadata = useHarnessStore.getState().runtimeMetadata['session-1'];
			expect(metadata.capabilities.supportsInteractionRequests).toBe(false);
			// Unaffected flags should remain
			expect(metadata.capabilities.supportsMidTurnInput).toBe(true);
		});

		it('sequential incremental updates accumulate correctly across all fields', () => {
			const actions = useHarnessStore.getState();

			// First: skills
			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [{ id: 's1', name: 'Skill A' }],
			});

			// Second: slash commands
			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				slashCommands: ['/help'],
			});

			// Third: models
			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				availableModels: [{ id: 'opus', label: 'Opus' }],
			});

			// Fourth: agents + capabilities
			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				availableAgents: [{ id: 'a1', label: 'Agent 1' }],
				capabilities: { supportsInteractionRequests: true },
			});

			// All fields should be present
			const metadata = useHarnessStore.getState().runtimeMetadata['session-1'];
			expect(metadata.skills).toHaveLength(1);
			expect(metadata.slashCommands).toEqual(['/help']);
			expect(metadata.availableModels).toHaveLength(1);
			expect(metadata.availableAgents).toHaveLength(1);
			expect(metadata.capabilities.supportsInteractionRequests).toBe(true);
		});

		it('replace followed by incremental merge appends to replaced state', () => {
			const actions = useHarnessStore.getState();

			// Seed
			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [{ id: 's1', name: 'A' }, { id: 's2', name: 'B' }],
			});

			// Replace: only s3 remains
			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				replace: true,
				skills: [{ id: 's3', name: 'C' }],
			});

			// Incremental: s4 merges into the replaced state
			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [{ id: 's4', name: 'D' }],
			});

			const metadata = useHarnessStore.getState().runtimeMetadata['session-1'];
			expect(metadata.skills).toHaveLength(2);
			expect(metadata.skills.map((s) => s.id).sort()).toEqual(['s3', 's4']);
		});

		it('incremental merge followed by replace discards accumulated state', () => {
			const actions = useHarnessStore.getState();

			// Build up incrementally
			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [{ id: 's1', name: 'A' }],
			});
			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [{ id: 's2', name: 'B' }],
			});

			// Replace: only s3 should survive
			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				replace: true,
				skills: [{ id: 's3', name: 'C' }],
			});

			const metadata = useHarnessStore.getState().runtimeMetadata['session-1'];
			expect(metadata.skills).toHaveLength(1);
			expect(metadata.skills[0]).toEqual({ id: 's3', name: 'C' });
		});

		it('sessions have independent metadata (no cross-contamination)', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [{ id: 's1', name: 'Session 1 Skill' }],
				capabilities: { supportsMidTurnInput: true },
			});

			actions.applyRuntimeMetadata('session-2', {
				sessionId: 'session-2',
				source: 'codex',
				skills: [{ id: 's2', name: 'Session 2 Skill' }],
				capabilities: { supportsMidTurnInput: false },
			});

			const meta1 = useHarnessStore.getState().runtimeMetadata['session-1'];
			const meta2 = useHarnessStore.getState().runtimeMetadata['session-2'];

			expect(meta1.skills).toHaveLength(1);
			expect(meta1.skills[0].name).toBe('Session 1 Skill');
			expect(meta1.capabilities.supportsMidTurnInput).toBe(true);

			expect(meta2.skills).toHaveLength(1);
			expect(meta2.skills[0].name).toBe('Session 2 Skill');
			expect(meta2.capabilities.supportsMidTurnInput).toBe(false);
		});

		it('event with no metadata fields initializes empty metadata for new session', () => {
			useHarnessStore.getState().applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
			});

			const metadata = useHarnessStore.getState().runtimeMetadata['session-1'];
			expect(metadata).toBeDefined();
			expect(metadata.skills).toEqual([]);
			expect(metadata.slashCommands).toEqual([]);
			expect(metadata.availableModels).toEqual([]);
			expect(metadata.availableAgents).toEqual([]);
			expect(metadata.capabilities).toEqual({});
		});

		it('event with no metadata fields preserves existing metadata', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [{ id: 's1', name: 'Skill' }],
				slashCommands: ['/help'],
			});

			// Empty event — should not clear anything
			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
			});

			const metadata = useHarnessStore.getState().runtimeMetadata['session-1'];
			expect(metadata.skills).toHaveLength(1);
			expect(metadata.slashCommands).toEqual(['/help']);
		});

		it('mergeById preserves insertion order with existing items first', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				availableModels: [
					{ id: 'opus', label: 'Opus' },
					{ id: 'sonnet', label: 'Sonnet' },
				],
			});

			// Add haiku, update opus — order should be opus, sonnet, haiku
			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				availableModels: [
					{ id: 'opus', label: 'Opus 4.6' },
					{ id: 'haiku', label: 'Haiku' },
				],
			});

			const metadata = useHarnessStore.getState().runtimeMetadata['session-1'];
			expect(metadata.availableModels.map((m) => m.id)).toEqual(['opus', 'sonnet', 'haiku']);
			expect(metadata.availableModels[0].label).toBe('Opus 4.6');
		});

		it('clearSession after metadata accumulation fully resets', () => {
			const actions = useHarnessStore.getState();

			// Build up metadata over multiple events
			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [{ id: 's1', name: 'Skill' }],
				slashCommands: ['/help'],
				capabilities: { supportsInteractionRequests: true },
			});

			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				availableModels: [{ id: 'opus', label: 'Opus' }],
			});

			// Clear
			useHarnessStore.getState().clearSession('session-1');

			// Re-apply fresh metadata — should start from empty, not old state
			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [{ id: 's2', name: 'New Skill' }],
			});

			const metadata = useHarnessStore.getState().runtimeMetadata['session-1'];
			expect(metadata.skills).toHaveLength(1);
			expect(metadata.skills[0].id).toBe('s2');
			expect(metadata.slashCommands).toEqual([]);
			expect(metadata.availableModels).toEqual([]);
			expect(metadata.capabilities).toEqual({});
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

	// === Lifecycle Clearing ===

	describe('lifecycle clearing', () => {
		it('clearSessionInteractions preserves runtime metadata (interrupt scenario)', () => {
			const actions = useHarnessStore.getState();

			// Session has both interactions and metadata
			actions.addInteraction('session-1', createToolApproval({ interactionId: 'int-1' }));
			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [{ id: 's1', name: 'Skill' }],
				capabilities: { supportsInteractionRequests: true },
			});

			// Interrupt clears interactions only
			useHarnessStore.getState().clearSessionInteractions('session-1');

			const state = useHarnessStore.getState();
			expect(state.pendingInteractions['session-1']).toBeUndefined();
			// Runtime metadata survives interrupt
			expect(state.runtimeMetadata['session-1']).toBeDefined();
			expect(state.runtimeMetadata['session-1'].skills).toHaveLength(1);
			expect(state.runtimeMetadata['session-1'].capabilities.supportsInteractionRequests).toBe(true);
		});

		it('clearSession removes metadata even when no interactions exist (deletion scenario)', () => {
			const actions = useHarnessStore.getState();

			// Session has only metadata (no pending interactions)
			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [{ id: 's1', name: 'Skill' }],
				availableModels: [{ id: 'opus', label: 'Opus' }],
			});

			useHarnessStore.getState().clearSession('session-1');

			const state = useHarnessStore.getState();
			expect(state.pendingInteractions['session-1']).toBeUndefined();
			expect(state.runtimeMetadata['session-1']).toBeUndefined();
		});

		it('clearSession removes interactions even when no metadata exists', () => {
			const actions = useHarnessStore.getState();

			// Session has only interactions (no metadata)
			actions.addInteraction('session-1', createToolApproval({ interactionId: 'int-1' }));
			actions.addInteraction('session-1', createClarification({ interactionId: 'int-2' }));

			useHarnessStore.getState().clearSession('session-1');

			const state = useHarnessStore.getState();
			expect(state.pendingInteractions['session-1']).toBeUndefined();
			expect(state.runtimeMetadata['session-1']).toBeUndefined();
		});

		it('supports sequential execution cycles (clear → repopulate → clear)', () => {
			const actions = useHarnessStore.getState();

			// First execution populates state
			actions.addInteraction('session-1', createToolApproval({ interactionId: 'int-1' }));
			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [{ id: 's1', name: 'First Skill' }],
			});

			// Execution ends (exit)
			useHarnessStore.getState().clearSession('session-1');
			expect(useHarnessStore.getState().runtimeMetadata['session-1']).toBeUndefined();
			expect(useHarnessStore.getState().pendingInteractions['session-1']).toBeUndefined();

			// Second execution starts with fresh state
			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [{ id: 's2', name: 'Second Skill' }],
				slashCommands: ['/new-cmd'],
			});
			actions.addInteraction('session-1', createToolApproval({ interactionId: 'int-2' }));

			const midState = useHarnessStore.getState();
			expect(midState.runtimeMetadata['session-1'].skills).toHaveLength(1);
			expect(midState.runtimeMetadata['session-1'].skills[0].id).toBe('s2');
			expect(midState.pendingInteractions['session-1']).toHaveLength(1);

			// Second execution ends
			useHarnessStore.getState().clearSession('session-1');
			expect(useHarnessStore.getState().runtimeMetadata['session-1']).toBeUndefined();
			expect(useHarnessStore.getState().pendingInteractions['session-1']).toBeUndefined();
		});

		it('clearSessionMetadata preserves pending interactions (provider reset scenario)', () => {
			const actions = useHarnessStore.getState();

			actions.addInteraction('session-1', createToolApproval({ interactionId: 'int-1' }));
			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [{ id: 's1', name: 'Skill' }],
			});

			// Clear only metadata
			useHarnessStore.getState().clearSessionMetadata('session-1');

			const state = useHarnessStore.getState();
			expect(state.runtimeMetadata['session-1']).toBeUndefined();
			// Interactions survive
			expect(state.pendingInteractions['session-1']).toHaveLength(1);
		});

		it('concurrent session clearing does not interfere', () => {
			const actions = useHarnessStore.getState();

			// Two sessions with state
			actions.addInteraction('session-1', createToolApproval({ interactionId: 'int-1' }));
			actions.applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [{ id: 's1', name: 'Skill 1' }],
			});
			actions.addInteraction('session-2', createToolApproval({ interactionId: 'int-2' }));
			actions.applyRuntimeMetadata('session-2', {
				sessionId: 'session-2',
				source: 'codex',
				skills: [{ id: 's2', name: 'Skill 2' }],
			});

			// Clear session-1
			useHarnessStore.getState().clearSession('session-1');

			const state = useHarnessStore.getState();
			// session-1 fully cleared
			expect(state.pendingInteractions['session-1']).toBeUndefined();
			expect(state.runtimeMetadata['session-1']).toBeUndefined();
			// session-2 untouched
			expect(state.pendingInteractions['session-2']).toHaveLength(1);
			expect(state.runtimeMetadata['session-2'].skills[0].id).toBe('s2');
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

	// ========================================================================
	// Validation: Runtime metadata merge and cleanup
	// ========================================================================

	describe('validation — runtime metadata merge and cleanup', () => {
		// --- selectSessionRuntimeCapabilities selector ---

		describe('selectSessionRuntimeCapabilities', () => {
			it('returns undefined for session with no metadata', () => {
				const state = useHarnessStore.getState();
				expect(selectSessionRuntimeCapabilities(state, 'unknown')).toBeUndefined();
			});

			it('returns capability flags for session with metadata', () => {
				useHarnessStore.getState().applyRuntimeMetadata('session-1', {
					sessionId: 'session-1',
					source: 'claude-code',
					capabilities: {
						supportsInteractionRequests: true,
						supportsMidTurnInput: true,
					},
				});

				const state = useHarnessStore.getState();
				const caps = selectSessionRuntimeCapabilities(state, 'session-1');
				expect(caps).toBeDefined();
				expect(caps!.supportsInteractionRequests).toBe(true);
				expect(caps!.supportsMidTurnInput).toBe(true);
			});

			it('returns empty object when metadata exists but no capabilities were sent', () => {
				useHarnessStore.getState().applyRuntimeMetadata('session-1', {
					sessionId: 'session-1',
					source: 'claude-code',
					skills: [{ id: 's1', name: 'Skill' }],
				});

				const state = useHarnessStore.getState();
				const caps = selectSessionRuntimeCapabilities(state, 'session-1');
				expect(caps).toEqual({});
			});

			it('reflects capability updates after incremental merge', () => {
				const actions = useHarnessStore.getState();

				actions.applyRuntimeMetadata('session-1', {
					sessionId: 'session-1',
					source: 'claude-code',
					capabilities: { supportsInteractionRequests: true },
				});

				actions.applyRuntimeMetadata('session-1', {
					sessionId: 'session-1',
					source: 'claude-code',
					capabilities: { supportsSkillsEnumeration: true },
				});

				const caps = selectSessionRuntimeCapabilities(
					useHarnessStore.getState(),
					'session-1'
				);
				expect(caps!.supportsInteractionRequests).toBe(true);
				expect(caps!.supportsSkillsEnumeration).toBe(true);
			});

			it('returns undefined after clearSession', () => {
				useHarnessStore.getState().applyRuntimeMetadata('session-1', {
					sessionId: 'session-1',
					source: 'claude-code',
					capabilities: { supportsInteractionRequests: true },
				});

				useHarnessStore.getState().clearSession('session-1');

				const caps = selectSessionRuntimeCapabilities(
					useHarnessStore.getState(),
					'session-1'
				);
				expect(caps).toBeUndefined();
			});
		});

		// --- Incremental merge with empty arrays (no-op behavior) ---

		describe('incremental merge with empty arrays', () => {
			it('empty incoming skills array in incremental mode preserves existing skills', () => {
				const actions = useHarnessStore.getState();

				actions.applyRuntimeMetadata('session-1', {
					sessionId: 'session-1',
					source: 'claude-code',
					skills: [{ id: 's1', name: 'Skill A' }],
				});

				// Incremental with empty array — mergeById returns existing items
				actions.applyRuntimeMetadata('session-1', {
					sessionId: 'session-1',
					source: 'claude-code',
					skills: [],
				});

				const metadata = useHarnessStore.getState().runtimeMetadata['session-1'];
				expect(metadata.skills).toHaveLength(1);
				expect(metadata.skills[0].id).toBe('s1');
			});

			it('empty incoming slash commands in incremental mode preserves existing commands', () => {
				const actions = useHarnessStore.getState();

				actions.applyRuntimeMetadata('session-1', {
					sessionId: 'session-1',
					source: 'claude-code',
					slashCommands: ['/help', '/compact'],
				});

				actions.applyRuntimeMetadata('session-1', {
					sessionId: 'session-1',
					source: 'claude-code',
					slashCommands: [],
				});

				const metadata = useHarnessStore.getState().runtimeMetadata['session-1'];
				expect(metadata.slashCommands).toEqual(['/help', '/compact']);
			});

			it('contrasts with replace mode where empty arrays clear the field', () => {
				const actions = useHarnessStore.getState();

				actions.applyRuntimeMetadata('session-1', {
					sessionId: 'session-1',
					source: 'claude-code',
					skills: [{ id: 's1', name: 'Skill A' }],
					slashCommands: ['/help'],
				});

				// Incremental with empty: preserves
				actions.applyRuntimeMetadata('session-1', {
					sessionId: 'session-1',
					source: 'claude-code',
					skills: [],
				});
				expect(useHarnessStore.getState().runtimeMetadata['session-1'].skills).toHaveLength(1);

				// Replace with empty: clears
				actions.applyRuntimeMetadata('session-1', {
					sessionId: 'session-1',
					source: 'claude-code',
					replace: true,
					skills: [],
				});
				expect(useHarnessStore.getState().runtimeMetadata['session-1'].skills).toEqual([]);
			});
		});

		// --- Rapid-fire events and determinism ---

		describe('rapid-fire event processing', () => {
			it('10 sequential incremental events accumulate correctly', () => {
				const actions = useHarnessStore.getState();

				for (let i = 0; i < 10; i++) {
					actions.applyRuntimeMetadata('session-1', {
						sessionId: 'session-1',
						source: 'claude-code',
						skills: [{ id: `skill-${i}`, name: `Skill ${i}` }],
					});
				}

				const metadata = useHarnessStore.getState().runtimeMetadata['session-1'];
				expect(metadata.skills).toHaveLength(10);
				// Verify ordering: existing first, new appended
				expect(metadata.skills[0].id).toBe('skill-0');
				expect(metadata.skills[9].id).toBe('skill-9');
			});

			it('10 events updating the same skill id always takes the last value', () => {
				const actions = useHarnessStore.getState();

				for (let i = 0; i < 10; i++) {
					actions.applyRuntimeMetadata('session-1', {
						sessionId: 'session-1',
						source: 'claude-code',
						skills: [{ id: 'skill-1', name: `Version ${i}` }],
					});
				}

				const metadata = useHarnessStore.getState().runtimeMetadata['session-1'];
				expect(metadata.skills).toHaveLength(1);
				expect(metadata.skills[0].name).toBe('Version 9');
			});

			it('interleaved field updates across events produce correct composite state', () => {
				const actions = useHarnessStore.getState();

				// Event 1: skills + commands
				actions.applyRuntimeMetadata('session-1', {
					sessionId: 'session-1',
					source: 'claude-code',
					skills: [{ id: 's1', name: 'A' }],
					slashCommands: ['/help'],
				});

				// Event 2: models + capabilities
				actions.applyRuntimeMetadata('session-1', {
					sessionId: 'session-1',
					source: 'claude-code',
					availableModels: [{ id: 'opus' }],
					capabilities: { supportsInteractionRequests: true },
				});

				// Event 3: agents + more skills
				actions.applyRuntimeMetadata('session-1', {
					sessionId: 'session-1',
					source: 'claude-code',
					availableAgents: [{ id: 'reviewer' }],
					skills: [{ id: 's2', name: 'B' }],
				});

				// Event 4: replace only commands (everything else preserved)
				actions.applyRuntimeMetadata('session-1', {
					sessionId: 'session-1',
					source: 'claude-code',
					replace: true,
					slashCommands: ['/new-only'],
				});

				const metadata = useHarnessStore.getState().runtimeMetadata['session-1'];
				expect(metadata.skills).toHaveLength(2);
				expect(metadata.slashCommands).toEqual(['/new-only']);
				expect(metadata.availableModels).toHaveLength(1);
				expect(metadata.availableAgents).toHaveLength(1);
				expect(metadata.capabilities.supportsInteractionRequests).toBe(true);
			});
		});

		// --- Mixed source providers on same session ---

		describe('mixed provider sources', () => {
			it('events from different sources merge into the same session metadata', () => {
				const actions = useHarnessStore.getState();

				// Source A provides skills
				actions.applyRuntimeMetadata('session-1', {
					sessionId: 'session-1',
					source: 'claude-code',
					skills: [{ id: 's1', name: 'Commit' }],
				});

				// Source B provides models (same session, different source)
				actions.applyRuntimeMetadata('session-1', {
					sessionId: 'session-1',
					source: 'codex',
					availableModels: [{ id: 'gpt-4o' }],
				});

				const metadata = useHarnessStore.getState().runtimeMetadata['session-1'];
				expect(metadata.skills).toHaveLength(1);
				expect(metadata.availableModels).toHaveLength(1);
			});
		});

		// --- Cleanup idempotency ---

		describe('cleanup idempotency', () => {
			it('clearSession called twice does not throw or corrupt state', () => {
				const actions = useHarnessStore.getState();

				actions.applyRuntimeMetadata('session-1', {
					sessionId: 'session-1',
					source: 'claude-code',
					skills: [{ id: 's1', name: 'Skill' }],
				});
				actions.addInteraction('session-1', createToolApproval({ interactionId: 'int-1' }));

				useHarnessStore.getState().clearSession('session-1');
				const stateAfterFirst = useHarnessStore.getState();

				// Second clear — should be a no-op
				useHarnessStore.getState().clearSession('session-1');
				const stateAfterSecond = useHarnessStore.getState();

				// State references should be identical (no-op)
				expect(stateAfterSecond.pendingInteractions).toBe(stateAfterFirst.pendingInteractions);
				expect(stateAfterSecond.runtimeMetadata).toBe(stateAfterFirst.runtimeMetadata);
			});

			it('clearSessionMetadata called twice does not throw or corrupt state', () => {
				useHarnessStore.getState().applyRuntimeMetadata('session-1', {
					sessionId: 'session-1',
					source: 'claude-code',
					skills: [{ id: 's1', name: 'Skill' }],
				});

				useHarnessStore.getState().clearSessionMetadata('session-1');
				const stateAfterFirst = useHarnessStore.getState();

				useHarnessStore.getState().clearSessionMetadata('session-1');
				const stateAfterSecond = useHarnessStore.getState();

				expect(stateAfterSecond.runtimeMetadata).toBe(stateAfterFirst.runtimeMetadata);
			});

			it('clearSessionInteractions called twice does not throw or corrupt state', () => {
				useHarnessStore.getState().addInteraction('session-1', createToolApproval({ interactionId: 'int-1' }));

				useHarnessStore.getState().clearSessionInteractions('session-1');
				const stateAfterFirst = useHarnessStore.getState();

				useHarnessStore.getState().clearSessionInteractions('session-1');
				const stateAfterSecond = useHarnessStore.getState();

				expect(stateAfterSecond.pendingInteractions).toBe(stateAfterFirst.pendingInteractions);
			});
		});

		// --- Replace event touching only capabilities ---

		describe('replace event scoped to capabilities only', () => {
			it('replace with only capabilities preserves all data fields', () => {
				const actions = useHarnessStore.getState();

				actions.applyRuntimeMetadata('session-1', {
					sessionId: 'session-1',
					source: 'claude-code',
					skills: [{ id: 's1', name: 'Skill' }],
					slashCommands: ['/help', '/compact'],
					availableModels: [{ id: 'opus', label: 'Opus' }],
					availableAgents: [{ id: 'a1', label: 'Agent 1' }],
					capabilities: {
						supportsInteractionRequests: true,
						supportsMidTurnInput: true,
						supportsSkillsEnumeration: true,
					},
				});

				// Replace with only capabilities — all data fields should be preserved
				actions.applyRuntimeMetadata('session-1', {
					sessionId: 'session-1',
					source: 'claude-code',
					replace: true,
					capabilities: { supportsMidTurnInput: false },
				});

				const metadata = useHarnessStore.getState().runtimeMetadata['session-1'];
				expect(metadata.skills).toHaveLength(1);
				expect(metadata.slashCommands).toEqual(['/help', '/compact']);
				expect(metadata.availableModels).toHaveLength(1);
				expect(metadata.availableAgents).toHaveLength(1);
				// Capabilities were replaced entirely
				expect(metadata.capabilities).toEqual({ supportsMidTurnInput: false });
			});
		});

		// --- clearSessionMetadata followed by incremental rebuilding ---

		describe('metadata rebuild after clearSessionMetadata (reconnect flow)', () => {
			it('clearing metadata then incrementally rebuilding produces clean state', () => {
				const actions = useHarnessStore.getState();

				// Initial population
				actions.applyRuntimeMetadata('session-1', {
					sessionId: 'session-1',
					source: 'claude-code',
					skills: [{ id: 's1', name: 'Old Skill' }],
					slashCommands: ['/old-cmd'],
					capabilities: { supportsInteractionRequests: true },
				});

				// Provider reconnect: clear metadata
				useHarnessStore.getState().clearSessionMetadata('session-1');
				expect(useHarnessStore.getState().runtimeMetadata['session-1']).toBeUndefined();

				// Incremental rebuild from new provider session
				actions.applyRuntimeMetadata('session-1', {
					sessionId: 'session-1',
					source: 'claude-code',
					skills: [{ id: 's2', name: 'New Skill' }],
				});

				actions.applyRuntimeMetadata('session-1', {
					sessionId: 'session-1',
					source: 'claude-code',
					slashCommands: ['/new-cmd'],
				});

				const metadata = useHarnessStore.getState().runtimeMetadata['session-1'];
				// Should have only new data, not old
				expect(metadata.skills).toHaveLength(1);
				expect(metadata.skills[0].id).toBe('s2');
				expect(metadata.slashCommands).toEqual(['/new-cmd']);
				// Old capabilities should be gone
				expect(metadata.capabilities).toEqual({});
			});

			it('clearSessionMetadata preserves pending interactions during rebuild', () => {
				const actions = useHarnessStore.getState();

				// Session has both interactions and metadata
				actions.addInteraction('session-1', createToolApproval({ interactionId: 'int-1' }));
				actions.applyRuntimeMetadata('session-1', {
					sessionId: 'session-1',
					source: 'claude-code',
					skills: [{ id: 's1', name: 'Skill' }],
				});

				// Clear only metadata
				useHarnessStore.getState().clearSessionMetadata('session-1');

				// Rebuild metadata
				actions.applyRuntimeMetadata('session-1', {
					sessionId: 'session-1',
					source: 'claude-code',
					skills: [{ id: 's2', name: 'New Skill' }],
				});

				const state = useHarnessStore.getState();
				// Interactions survive the metadata rebuild cycle
				expect(state.pendingInteractions['session-1']).toHaveLength(1);
				expect(state.pendingInteractions['session-1'][0].interactionId).toBe('int-1');
				// Metadata is fresh
				expect(state.runtimeMetadata['session-1'].skills[0].id).toBe('s2');
			});
		});

		// --- Complex mergeById scenarios ---

		describe('complex mergeById behavior', () => {
			it('incoming event with mix of updates and new items merges correctly', () => {
				const actions = useHarnessStore.getState();

				actions.applyRuntimeMetadata('session-1', {
					sessionId: 'session-1',
					source: 'claude-code',
					availableModels: [
						{ id: 'opus', label: 'Opus 4' },
						{ id: 'sonnet', label: 'Sonnet 4' },
						{ id: 'haiku', label: 'Haiku 4' },
					],
				});

				// Update opus, add flash, leave sonnet and haiku untouched
				actions.applyRuntimeMetadata('session-1', {
					sessionId: 'session-1',
					source: 'claude-code',
					availableModels: [
						{ id: 'opus', label: 'Opus 4.6' },
						{ id: 'flash', label: 'Flash' },
					],
				});

				const metadata = useHarnessStore.getState().runtimeMetadata['session-1'];
				expect(metadata.availableModels).toHaveLength(4);
				// Order: existing order preserved, new appended
				expect(metadata.availableModels.map((m) => m.id)).toEqual([
					'opus', 'sonnet', 'haiku', 'flash',
				]);
				// Updated item has new label
				expect(metadata.availableModels[0].label).toBe('Opus 4.6');
				// Untouched items retain original labels
				expect(metadata.availableModels[1].label).toBe('Sonnet 4');
				expect(metadata.availableModels[2].label).toBe('Haiku 4');
			});

			it('mergeById with agents handles complete id overlap (all updates, no new)', () => {
				const actions = useHarnessStore.getState();

				actions.applyRuntimeMetadata('session-1', {
					sessionId: 'session-1',
					source: 'claude-code',
					availableAgents: [
						{ id: 'a1', label: 'Agent 1 v1' },
						{ id: 'a2', label: 'Agent 2 v1' },
					],
				});

				// All IDs overlap — pure update, no new items
				actions.applyRuntimeMetadata('session-1', {
					sessionId: 'session-1',
					source: 'claude-code',
					availableAgents: [
						{ id: 'a2', label: 'Agent 2 v2' },
						{ id: 'a1', label: 'Agent 1 v2' },
					],
				});

				const metadata = useHarnessStore.getState().runtimeMetadata['session-1'];
				expect(metadata.availableAgents).toHaveLength(2);
				// Insertion order preserved: a1 first (was first in existing)
				expect(metadata.availableAgents[0]).toEqual({ id: 'a1', label: 'Agent 1 v2' });
				expect(metadata.availableAgents[1]).toEqual({ id: 'a2', label: 'Agent 2 v2' });
			});
		});

		// --- Full lifecycle round-trip ---

		describe('full lifecycle round-trip', () => {
			it('spawn → populate → replace → interrupt → resume → exit cycle', () => {
				const actions = useHarnessStore.getState();

				// 1. Spawn: initial metadata snapshot
				actions.applyRuntimeMetadata('session-1', {
					sessionId: 'session-1',
					source: 'claude-code',
					skills: [{ id: 's1', name: 'Commit' }],
					slashCommands: ['/help'],
					capabilities: { supportsInteractionRequests: true },
				});

				let metadata = useHarnessStore.getState().runtimeMetadata['session-1'];
				expect(metadata.skills).toHaveLength(1);
				expect(metadata.capabilities.supportsInteractionRequests).toBe(true);

				// 2. Incremental updates during execution
				actions.applyRuntimeMetadata('session-1', {
					sessionId: 'session-1',
					source: 'claude-code',
					skills: [{ id: 's2', name: 'Review PR' }],
					availableModels: [{ id: 'opus' }],
				});
				actions.addInteraction('session-1', createToolApproval({ interactionId: 'int-1' }));

				metadata = useHarnessStore.getState().runtimeMetadata['session-1'];
				expect(metadata.skills).toHaveLength(2);
				expect(metadata.availableModels).toHaveLength(1);

				// 3. Replace event (provider re-enumerates)
				actions.applyRuntimeMetadata('session-1', {
					sessionId: 'session-1',
					source: 'claude-code',
					replace: true,
					skills: [
						{ id: 's1', name: 'Commit v2' },
						{ id: 's2', name: 'Review PR v2' },
						{ id: 's3', name: 'Lint' },
					],
				});

				metadata = useHarnessStore.getState().runtimeMetadata['session-1'];
				expect(metadata.skills).toHaveLength(3);
				// Models preserved (not in replace event)
				expect(metadata.availableModels).toHaveLength(1);

				// 4. Interrupt: clears interactions but preserves metadata
				useHarnessStore.getState().clearSessionInteractions('session-1');

				let state = useHarnessStore.getState();
				expect(state.pendingInteractions['session-1']).toBeUndefined();
				expect(state.runtimeMetadata['session-1']).toBeDefined();
				expect(state.runtimeMetadata['session-1'].skills).toHaveLength(3);

				// 5. Resume: new interactions arrive, metadata continues accumulating
				actions.addInteraction('session-1', createClarification({ interactionId: 'int-2' }));
				actions.applyRuntimeMetadata('session-1', {
					sessionId: 'session-1',
					source: 'claude-code',
					capabilities: { supportsRuntimeModelChange: true },
				});

				state = useHarnessStore.getState();
				expect(state.pendingInteractions['session-1']).toHaveLength(1);
				expect(state.runtimeMetadata['session-1'].capabilities.supportsInteractionRequests).toBe(true);
				expect(state.runtimeMetadata['session-1'].capabilities.supportsRuntimeModelChange).toBe(true);

				// 6. Exit: full cleanup
				useHarnessStore.getState().clearSession('session-1');

				state = useHarnessStore.getState();
				expect(state.pendingInteractions['session-1']).toBeUndefined();
				expect(state.runtimeMetadata['session-1']).toBeUndefined();
			});
		});

		// --- State reference identity (no unnecessary re-renders) ---

		describe('state reference identity', () => {
			it('no-op events do not create new state references', () => {
				const actions = useHarnessStore.getState();

				// Populate
				actions.applyRuntimeMetadata('session-1', {
					sessionId: 'session-1',
					source: 'claude-code',
					skills: [{ id: 's1', name: 'Skill' }],
				});

				// No-op: removing from unknown session
				const stateBefore = useHarnessStore.getState();
				actions.removeInteraction('session-1', 'nonexistent');
				const stateAfter = useHarnessStore.getState();

				expect(stateAfter.pendingInteractions).toBe(stateBefore.pendingInteractions);
			});

			it('clearing already-empty session produces no state change', () => {
				const stateBefore = useHarnessStore.getState();
				useHarnessStore.getState().clearSession('nonexistent');
				const stateAfter = useHarnessStore.getState();

				expect(stateAfter).toBe(stateBefore);
			});
		});
	});
});
