/**
 * Tests for shared interaction request and response plumbing.
 *
 * Validates the provider-neutral contract for mid-turn interactions:
 * - Type shape contracts (JSON serialization round-trip)
 * - Interaction helper determinism and distinguishability
 * - Response kind completeness across the plumbing chain
 * - FIFO ordering, duplicate guards, and double-response resilience
 * - Selector correctness for interaction state queries
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	DEFAULT_INTERACTION_TIMEOUT_MS,
	createInteractionTimeoutResponse,
	createInterruptResponse,
	createTerminationResponse,
} from '../../main/harness/interaction-helpers';
import {
	useHarnessStore,
	selectSessionInteractions,
	selectHasPendingInteractions,
} from '../../renderer/stores/harnessStore';
import type {
	InteractionRequest,
	InteractionResponse,
	ToolApprovalRequest,
	ClarificationRequest,
	ClarificationAnswer,
	ClarificationQuestion,
	ClarificationOption,
	InteractionKind,
} from '../../shared/interaction-types';

// ============================================================================
// Helpers
// ============================================================================

function makeToolApproval(overrides: Partial<ToolApprovalRequest> = {}): ToolApprovalRequest {
	return {
		interactionId: `int-${Math.random().toString(36).slice(2, 8)}`,
		sessionId: 'session-1',
		agentId: 'claude-code',
		kind: 'tool-approval',
		timestamp: Date.now(),
		toolUseId: 'tool-use-1',
		toolName: 'Edit',
		toolInput: { file_path: '/test.ts' },
		...overrides,
	};
}

function makeClarification(overrides: Partial<ClarificationRequest> = {}): ClarificationRequest {
	return {
		interactionId: `int-${Math.random().toString(36).slice(2, 8)}`,
		sessionId: 'session-1',
		agentId: 'claude-code',
		kind: 'clarification',
		timestamp: Date.now(),
		questions: [
			{
				question: 'Which approach do you prefer?',
				header: 'Approach',
				options: [
					{ label: 'A', description: 'First option' },
					{ label: 'B', description: 'Second option' },
				],
				multiSelect: false,
			},
		],
		allowFreeText: true,
		...overrides,
	};
}

// ============================================================================
// Setup
// ============================================================================

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
// Type Shape Contracts
// ============================================================================

describe('interaction type shape contracts', () => {
	describe('ToolApprovalRequest', () => {
		it('has all required base fields', () => {
			const req = makeToolApproval({
				interactionId: 'int-shape-1',
				sessionId: 'sess-shape',
				timestamp: 1710000000000,
			});

			expect(req.interactionId).toBe('int-shape-1');
			expect(req.sessionId).toBe('sess-shape');
			expect(req.agentId).toBe('claude-code');
			expect(req.kind).toBe('tool-approval');
			expect(req.timestamp).toBe(1710000000000);
			expect(req.toolUseId).toBe('tool-use-1');
			expect(req.toolName).toBe('Edit');
			expect(req.toolInput).toEqual({ file_path: '/test.ts' });
		});

		it('supports all optional fields', () => {
			const req = makeToolApproval({
				timeoutMs: 60000,
				decisionReason: 'File write needs approval',
				suggestedPermissions: [{ tool: 'Edit', scope: '/src' }],
				blockedPath: '/src/main.ts',
				subagentId: 'sub-agent-1',
			});

			expect(req.timeoutMs).toBe(60000);
			expect(req.decisionReason).toBe('File write needs approval');
			expect(req.suggestedPermissions).toHaveLength(1);
			expect(req.blockedPath).toBe('/src/main.ts');
			expect(req.subagentId).toBe('sub-agent-1');
		});

		it('survives JSON round-trip with all fields intact', () => {
			const req = makeToolApproval({
				interactionId: 'int-rt-1',
				timeoutMs: 300000,
				decisionReason: 'Dangerous tool',
				suggestedPermissions: [{ tool: 'Bash', path: '/tmp' }],
				blockedPath: '/tmp/danger',
				subagentId: 'sub-1',
			});

			const roundTripped = JSON.parse(JSON.stringify(req)) as ToolApprovalRequest;

			expect(roundTripped).toEqual(req);
			expect(roundTripped.kind).toBe('tool-approval');
			expect(roundTripped.toolInput).toEqual(req.toolInput);
		});
	});

	describe('ClarificationRequest', () => {
		it('has all required fields including questions structure', () => {
			const req = makeClarification({
				interactionId: 'int-clar-1',
				allowFreeText: false,
			});

			expect(req.kind).toBe('clarification');
			expect(req.questions).toHaveLength(1);
			expect(req.questions[0].question).toBe('Which approach do you prefer?');
			expect(req.questions[0].header).toBe('Approach');
			expect(req.questions[0].options).toHaveLength(2);
			expect(req.questions[0].multiSelect).toBe(false);
			expect(req.allowFreeText).toBe(false);
		});

		it('supports multi-question clarification with multiSelect', () => {
			const questions: ClarificationQuestion[] = [
				{
					question: 'Which files to modify?',
					header: 'Files',
					options: [
						{ label: 'src/a.ts', description: 'Module A' },
						{ label: 'src/b.ts', description: 'Module B' },
						{ label: 'src/c.ts', description: 'Module C' },
					],
					multiSelect: true,
				},
				{
					question: 'Refactoring style?',
					header: 'Style',
					options: [
						{ label: 'Inline', description: 'Inline the logic', preview: '```ts\nconst x = a + b;\n```' },
						{ label: 'Extract', description: 'Extract to function' },
					],
					multiSelect: false,
				},
			];

			const req = makeClarification({ questions, allowFreeText: true });

			expect(req.questions).toHaveLength(2);
			expect(req.questions[0].multiSelect).toBe(true);
			expect(req.questions[0].options).toHaveLength(3);
			expect(req.questions[1].options[0].preview).toContain('const x');
		});

		it('survives JSON round-trip with nested question structures', () => {
			const option: ClarificationOption = {
				label: 'Option',
				description: 'Desc',
				preview: '```\ncode\n```',
			};
			const question: ClarificationQuestion = {
				question: 'Q?',
				header: 'Q',
				options: [option],
				multiSelect: true,
			};
			const req = makeClarification({
				interactionId: 'int-rt-clar',
				questions: [question],
				allowFreeText: true,
				timeoutMs: 120000,
			});

			const roundTripped = JSON.parse(JSON.stringify(req)) as ClarificationRequest;

			expect(roundTripped).toEqual(req);
			expect(roundTripped.questions[0].options[0].preview).toBe(option.preview);
		});
	});

	describe('InteractionResponse shapes', () => {
		it('approve response is JSON-serializable with all optional fields', () => {
			const response: InteractionResponse = {
				kind: 'approve',
				updatedInput: { file_path: '/modified.ts', new_string: 'updated' },
				updatedPermissions: [{ tool: 'Edit', scope: '/src' }],
				message: 'Approved with mods',
			};

			const roundTripped = JSON.parse(JSON.stringify(response));
			expect(roundTripped).toEqual(response);
		});

		it('deny response is JSON-serializable with interrupt flag', () => {
			const response: InteractionResponse = {
				kind: 'deny',
				message: 'Not allowed',
				interrupt: true,
			};

			const roundTripped = JSON.parse(JSON.stringify(response));
			expect(roundTripped).toEqual(response);
		});

		it('text response is JSON-serializable', () => {
			const response: InteractionResponse = {
				kind: 'text',
				text: 'Free-form user input with special chars: <>&"\'',
			};

			const roundTripped = JSON.parse(JSON.stringify(response));
			expect(roundTripped).toEqual(response);
		});

		it('clarification-answer response is JSON-serializable with mixed answer types', () => {
			const answers: ClarificationAnswer[] = [
				{ questionIndex: 0, selectedOptionLabels: ['A', 'B'] },
				{ questionIndex: 1, text: 'Custom answer' },
				{ questionIndex: 2, selectedOptionLabels: ['X'], text: 'Also has text' },
			];
			const response: InteractionResponse = {
				kind: 'clarification-answer',
				answers,
			};

			const roundTripped = JSON.parse(JSON.stringify(response));
			expect(roundTripped).toEqual(response);
			expect(roundTripped.answers).toHaveLength(3);
		});

		it('cancel response is JSON-serializable', () => {
			const response: InteractionResponse = {
				kind: 'cancel',
				message: 'User cancelled',
			};

			const roundTripped = JSON.parse(JSON.stringify(response));
			expect(roundTripped).toEqual(response);
		});

		it('minimal approve response (no optional fields) is valid', () => {
			const response: InteractionResponse = { kind: 'approve' };
			const roundTripped = JSON.parse(JSON.stringify(response));
			expect(roundTripped).toEqual({ kind: 'approve' });
		});

		it('minimal deny response (no message, no interrupt) is valid', () => {
			const response: InteractionResponse = { kind: 'deny' };
			const roundTripped = JSON.parse(JSON.stringify(response));
			expect(roundTripped).toEqual({ kind: 'deny' });
		});

		it('minimal cancel response (no message) is valid', () => {
			const response: InteractionResponse = { kind: 'cancel' };
			const roundTripped = JSON.parse(JSON.stringify(response));
			expect(roundTripped).toEqual({ kind: 'cancel' });
		});
	});
});

// ============================================================================
// Interaction Helpers — Distinguishability and Edge Cases
// ============================================================================

describe('interaction helper response distinguishability', () => {
	const kinds: InteractionKind[] = ['tool-approval', 'clarification'];

	describe('each helper produces distinguishable messages per kind', () => {
		for (const kind of kinds) {
			it(`timeout, interrupt, and termination for ${kind} have different messages`, () => {
				const timeout = createInteractionTimeoutResponse(kind);
				const interrupt = createInterruptResponse(kind);
				const termination = createTerminationResponse(kind);

				// Messages must be distinct so logs can differentiate scenarios
				const messages = new Set([
					(timeout as any).message,
					(interrupt as any).message,
					(termination as any).message,
				]);
				expect(messages.size).toBe(3);
			});
		}
	});

	describe('clarification responses never carry interrupt flag', () => {
		it('timeout for clarification has no interrupt flag', () => {
			const response = createInteractionTimeoutResponse('clarification');
			expect(response.kind).toBe('cancel');
			expect('interrupt' in response).toBe(false);
		});

		it('interrupt for clarification has no interrupt flag (cancel kind has no interrupt)', () => {
			const response = createInterruptResponse('clarification');
			expect(response.kind).toBe('cancel');
			expect('interrupt' in response).toBe(false);
		});

		it('termination for clarification has no interrupt flag', () => {
			const response = createTerminationResponse('clarification');
			expect(response.kind).toBe('cancel');
			expect('interrupt' in response).toBe(false);
		});
	});

	describe('tool-approval responses carry correct interrupt semantics', () => {
		it('timeout deny has NO interrupt flag (timeout is not an interrupt)', () => {
			const response = createInteractionTimeoutResponse('tool-approval');
			expect(response.kind).toBe('deny');
			if (response.kind === 'deny') {
				expect(response.interrupt).toBeUndefined();
			}
		});

		it('interrupt deny HAS interrupt flag', () => {
			const response = createInterruptResponse('tool-approval');
			expect(response.kind).toBe('deny');
			if (response.kind === 'deny') {
				expect(response.interrupt).toBe(true);
			}
		});

		it('termination deny HAS interrupt flag', () => {
			const response = createTerminationResponse('tool-approval');
			expect(response.kind).toBe('deny');
			if (response.kind === 'deny') {
				expect(response.interrupt).toBe(true);
			}
		});
	});

	describe('all helpers produce JSON-serializable responses', () => {
		for (const kind of kinds) {
			it(`timeout response for ${kind} survives JSON round-trip`, () => {
				const response = createInteractionTimeoutResponse(kind);
				expect(JSON.parse(JSON.stringify(response))).toEqual(response);
			});

			it(`interrupt response for ${kind} survives JSON round-trip`, () => {
				const response = createInterruptResponse(kind);
				expect(JSON.parse(JSON.stringify(response))).toEqual(response);
			});

			it(`termination response for ${kind} survives JSON round-trip`, () => {
				const response = createTerminationResponse(kind);
				expect(JSON.parse(JSON.stringify(response))).toEqual(response);
			});
		}
	});

	it('DEFAULT_INTERACTION_TIMEOUT_MS is positive and reasonable', () => {
		expect(DEFAULT_INTERACTION_TIMEOUT_MS).toBeGreaterThan(0);
		// Should be between 1 minute and 30 minutes
		expect(DEFAULT_INTERACTION_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
		expect(DEFAULT_INTERACTION_TIMEOUT_MS).toBeLessThanOrEqual(30 * 60_000);
	});
});

// ============================================================================
// Store Interaction Plumbing — FIFO, Double-Response, All Kinds
// ============================================================================

describe('harnessStore interaction plumbing', () => {
	describe('FIFO ordering guarantee', () => {
		it('requests are returned in insertion order', () => {
			const actions = useHarnessStore.getState();
			const req1 = makeToolApproval({ interactionId: 'first', timestamp: 100 });
			const req2 = makeClarification({ interactionId: 'second', timestamp: 200 });
			const req3 = makeToolApproval({ interactionId: 'third', timestamp: 300 });

			actions.addInteraction('session-1', req1);
			actions.addInteraction('session-1', req2);
			actions.addInteraction('session-1', req3);

			const pending = useHarnessStore.getState().pendingInteractions['session-1'];
			expect(pending).toHaveLength(3);
			expect(pending[0].interactionId).toBe('first');
			expect(pending[1].interactionId).toBe('second');
			expect(pending[2].interactionId).toBe('third');
		});

		it('removing middle item preserves order of remaining items', () => {
			const actions = useHarnessStore.getState();
			actions.addInteraction('session-1', makeToolApproval({ interactionId: 'A' }));
			actions.addInteraction('session-1', makeClarification({ interactionId: 'B' }));
			actions.addInteraction('session-1', makeToolApproval({ interactionId: 'C' }));

			useHarnessStore.getState().removeInteraction('session-1', 'B');

			const pending = useHarnessStore.getState().pendingInteractions['session-1'];
			expect(pending).toHaveLength(2);
			expect(pending[0].interactionId).toBe('A');
			expect(pending[1].interactionId).toBe('C');
		});
	});

	describe('double-response resilience', () => {
		it('responding to an already-removed interaction is a safe no-op on the store side', async () => {
			const req = makeToolApproval({ interactionId: 'int-double' });
			const actions = useHarnessStore.getState();
			actions.addInteraction('session-1', req);

			// First response removes the interaction
			await useHarnessStore.getState().respondToInteraction('session-1', 'int-double', {
				kind: 'approve',
			});

			// Second response for same interaction — should not throw
			await useHarnessStore.getState().respondToInteraction('session-1', 'int-double', {
				kind: 'deny',
				message: 'Late deny',
			});

			// IPC should be called both times (store doesn't gate on existence)
			expect(mockRespondToInteraction).toHaveBeenCalledTimes(2);

			// Pending list should remain empty
			const pending = useHarnessStore.getState().pendingInteractions['session-1'] ?? [];
			expect(pending).toHaveLength(0);
		});

		it('removeInteraction after respondToInteraction is a safe no-op', async () => {
			const req = makeToolApproval({ interactionId: 'int-rm-after' });
			useHarnessStore.getState().addInteraction('session-1', req);

			await useHarnessStore.getState().respondToInteraction('session-1', 'int-rm-after', {
				kind: 'approve',
			});

			// Extra removeInteraction call should be no-op
			const stateBefore = useHarnessStore.getState();
			useHarnessStore.getState().removeInteraction('session-1', 'int-rm-after');
			const stateAfter = useHarnessStore.getState();

			// State reference should not change (no-op)
			expect(stateAfter.pendingInteractions).toBe(stateBefore.pendingInteractions);
		});
	});

	describe('all five response kinds through respondToInteraction', () => {
		it('dispatches approve with updatedInput and updatedPermissions', async () => {
			const req = makeToolApproval({ interactionId: 'int-approve-full' });
			useHarnessStore.getState().addInteraction('session-1', req);

			const response: InteractionResponse = {
				kind: 'approve',
				updatedInput: { file_path: '/new.ts' },
				updatedPermissions: [{ tool: 'Edit', pattern: '*.ts' }],
				message: 'Modified and approved',
			};

			await useHarnessStore.getState().respondToInteraction('session-1', 'int-approve-full', response);

			expect(mockRespondToInteraction).toHaveBeenCalledWith('session-1', 'int-approve-full', response);
		});

		it('dispatches deny without interrupt', async () => {
			const req = makeToolApproval({ interactionId: 'int-deny-no-int' });
			useHarnessStore.getState().addInteraction('session-1', req);

			const response: InteractionResponse = { kind: 'deny', message: 'No' };

			await useHarnessStore.getState().respondToInteraction('session-1', 'int-deny-no-int', response);

			const sent = mockRespondToInteraction.mock.calls[0][2];
			expect(sent.kind).toBe('deny');
			expect(sent.interrupt).toBeUndefined();
		});

		it('dispatches text response', async () => {
			const req = makeClarification({ interactionId: 'int-text' });
			useHarnessStore.getState().addInteraction('session-1', req);

			const response: InteractionResponse = {
				kind: 'text',
				text: 'I want to do something completely different',
			};

			await useHarnessStore.getState().respondToInteraction('session-1', 'int-text', response);

			expect(mockRespondToInteraction).toHaveBeenCalledWith('session-1', 'int-text', response);
		});

		it('dispatches clarification-answer with multi-question structured answers', async () => {
			const req = makeClarification({
				interactionId: 'int-clar-multi',
				questions: [
					{
						question: 'Q1?',
						header: 'Q1',
						options: [{ label: 'A', description: 'A' }],
						multiSelect: true,
					},
					{
						question: 'Q2?',
						header: 'Q2',
						options: [{ label: 'X', description: 'X' }],
						multiSelect: false,
					},
				],
			});
			useHarnessStore.getState().addInteraction('session-1', req);

			const answers: ClarificationAnswer[] = [
				{ questionIndex: 0, selectedOptionLabels: ['A'] },
				{ questionIndex: 1, text: 'Custom answer for Q2' },
			];
			const response: InteractionResponse = { kind: 'clarification-answer', answers };

			await useHarnessStore.getState().respondToInteraction('session-1', 'int-clar-multi', response);

			const sent = mockRespondToInteraction.mock.calls[0][2];
			expect(sent.kind).toBe('clarification-answer');
			expect(sent.answers).toHaveLength(2);
			expect(sent.answers[0].selectedOptionLabels).toEqual(['A']);
			expect(sent.answers[1].text).toBe('Custom answer for Q2');
		});

		it('dispatches cancel response', async () => {
			const req = makeToolApproval({ interactionId: 'int-cancel' });
			useHarnessStore.getState().addInteraction('session-1', req);

			const response: InteractionResponse = { kind: 'cancel' };

			await useHarnessStore.getState().respondToInteraction('session-1', 'int-cancel', response);

			expect(mockRespondToInteraction).toHaveBeenCalledWith('session-1', 'int-cancel', response);
		});
	});

	describe('concurrent interactions in same session', () => {
		it('can respond to multiple interactions independently', async () => {
			const req1 = makeToolApproval({ interactionId: 'int-c1' });
			const req2 = makeToolApproval({ interactionId: 'int-c2' });
			const req3 = makeClarification({ interactionId: 'int-c3' });

			const actions = useHarnessStore.getState();
			actions.addInteraction('session-1', req1);
			actions.addInteraction('session-1', req2);
			actions.addInteraction('session-1', req3);

			// Respond to middle one first
			await useHarnessStore.getState().respondToInteraction('session-1', 'int-c2', {
				kind: 'approve',
			});

			let pending = useHarnessStore.getState().pendingInteractions['session-1'];
			expect(pending).toHaveLength(2);
			expect(pending.map((r) => r.interactionId)).toEqual(['int-c1', 'int-c3']);

			// Respond to first
			await useHarnessStore.getState().respondToInteraction('session-1', 'int-c1', {
				kind: 'deny',
			});

			pending = useHarnessStore.getState().pendingInteractions['session-1'];
			expect(pending).toHaveLength(1);
			expect(pending[0].interactionId).toBe('int-c3');

			// Respond to last
			await useHarnessStore.getState().respondToInteraction('session-1', 'int-c3', {
				kind: 'cancel',
			});

			pending = useHarnessStore.getState().pendingInteractions['session-1'] ?? [];
			expect(pending).toHaveLength(0);
			expect(mockRespondToInteraction).toHaveBeenCalledTimes(3);
		});
	});

	describe('cross-session isolation', () => {
		it('responding in one session does not affect another session', async () => {
			const req1 = makeToolApproval({ interactionId: 'int-s1', sessionId: 'session-1' });
			const req2 = makeToolApproval({ interactionId: 'int-s2', sessionId: 'session-2' });

			const actions = useHarnessStore.getState();
			actions.addInteraction('session-1', req1);
			actions.addInteraction('session-2', req2);

			await useHarnessStore.getState().respondToInteraction('session-1', 'int-s1', {
				kind: 'approve',
			});

			// Session 2 should be unaffected
			const s2Pending = useHarnessStore.getState().pendingInteractions['session-2'];
			expect(s2Pending).toHaveLength(1);
			expect(s2Pending[0].interactionId).toBe('int-s2');
		});

		it('clearSessionInteractions only affects target session', () => {
			const actions = useHarnessStore.getState();
			actions.addInteraction('session-1', makeToolApproval({ interactionId: 'int-a' }));
			actions.addInteraction('session-1', makeClarification({ interactionId: 'int-b' }));
			actions.addInteraction('session-2', makeToolApproval({ interactionId: 'int-c' }));
			actions.addInteraction('session-3', makeClarification({ interactionId: 'int-d' }));

			useHarnessStore.getState().clearSessionInteractions('session-1');

			const state = useHarnessStore.getState();
			expect(state.pendingInteractions['session-1']).toBeUndefined();
			expect(state.pendingInteractions['session-2']).toHaveLength(1);
			expect(state.pendingInteractions['session-3']).toHaveLength(1);
		});
	});

	describe('selectors with interaction plumbing', () => {
		it('selectSessionInteractions returns FIFO-ordered requests', () => {
			const actions = useHarnessStore.getState();
			const req1 = makeToolApproval({ interactionId: 'sel-1' });
			const req2 = makeClarification({ interactionId: 'sel-2' });
			actions.addInteraction('session-1', req1);
			actions.addInteraction('session-1', req2);

			const state = useHarnessStore.getState();
			const interactions = selectSessionInteractions(state, 'session-1');

			expect(interactions).toHaveLength(2);
			expect(interactions[0].kind).toBe('tool-approval');
			expect(interactions[1].kind).toBe('clarification');
		});

		it('selectHasPendingInteractions reflects current state after response', async () => {
			const req = makeToolApproval({ interactionId: 'sel-pending' });
			useHarnessStore.getState().addInteraction('session-1', req);

			expect(selectHasPendingInteractions(useHarnessStore.getState(), 'session-1')).toBe(true);

			await useHarnessStore.getState().respondToInteraction('session-1', 'sel-pending', {
				kind: 'approve',
			});

			expect(selectHasPendingInteractions(useHarnessStore.getState(), 'session-1')).toBe(false);
		});

		it('selectSessionInteractions returns empty array after clearSession', () => {
			const actions = useHarnessStore.getState();
			actions.addInteraction('session-1', makeToolApproval({ interactionId: 'sel-clear-1' }));
			actions.addInteraction('session-1', makeClarification({ interactionId: 'sel-clear-2' }));

			useHarnessStore.getState().clearSession('session-1');

			const interactions = selectSessionInteractions(useHarnessStore.getState(), 'session-1');
			expect(interactions).toEqual([]);
		});

		it('selectHasPendingInteractions returns false for session with empty array', () => {
			const actions = useHarnessStore.getState();
			const req = makeToolApproval({ interactionId: 'sel-empty' });
			actions.addInteraction('session-1', req);
			actions.removeInteraction('session-1', 'sel-empty');

			// Session key exists but array is empty
			expect(selectHasPendingInteractions(useHarnessStore.getState(), 'session-1')).toBe(false);
		});
	});

	describe('IPC failure does not corrupt store state', () => {
		it('store remains consistent after IPC failure on respondToInteraction', async () => {
			mockRespondToInteraction.mockRejectedValueOnce(new Error('Network error'));

			const req1 = makeToolApproval({ interactionId: 'int-ipc-fail' });
			const req2 = makeToolApproval({ interactionId: 'int-ipc-ok' });
			useHarnessStore.getState().addInteraction('session-1', req1);
			useHarnessStore.getState().addInteraction('session-1', req2);

			// This will fail at IPC level but optimistic removal already happened
			await useHarnessStore.getState().respondToInteraction('session-1', 'int-ipc-fail', {
				kind: 'approve',
			});

			// Store should still be functional
			const pending = useHarnessStore.getState().pendingInteractions['session-1'];
			expect(pending).toHaveLength(1);
			expect(pending[0].interactionId).toBe('int-ipc-ok');

			// Can still respond to remaining interactions
			mockRespondToInteraction.mockResolvedValueOnce(undefined);
			await useHarnessStore.getState().respondToInteraction('session-1', 'int-ipc-ok', {
				kind: 'approve',
			});

			const remainingPending = useHarnessStore.getState().pendingInteractions['session-1'] ?? [];
			expect(remainingPending).toHaveLength(0);
		});
	});
});

// ============================================================================
// Request ↔ Response Kind Matching
// ============================================================================

describe('request-response kind compatibility', () => {
	it('tool-approval request can receive approve, deny, or cancel response', () => {
		// These are the valid response kinds for tool-approval requests
		const validResponses: InteractionResponse[] = [
			{ kind: 'approve' },
			{ kind: 'approve', updatedInput: {}, updatedPermissions: [], message: 'ok' },
			{ kind: 'deny' },
			{ kind: 'deny', message: 'no', interrupt: true },
			{ kind: 'cancel' },
			{ kind: 'cancel', message: 'User cancelled' },
		];

		for (const response of validResponses) {
			const roundTripped = JSON.parse(JSON.stringify(response));
			expect(roundTripped.kind).toBe(response.kind);
		}
	});

	it('clarification request can receive clarification-answer, text, or cancel response', () => {
		const validResponses: InteractionResponse[] = [
			{ kind: 'clarification-answer', answers: [{ questionIndex: 0, selectedOptionLabels: ['A'] }] },
			{ kind: 'text', text: 'Free text' },
			{ kind: 'cancel' },
			{ kind: 'cancel', message: 'Dismissed' },
		];

		for (const response of validResponses) {
			const roundTripped = JSON.parse(JSON.stringify(response));
			expect(roundTripped.kind).toBe(response.kind);
		}
	});

	it('ClarificationAnswer supports both option selection and free text per question', () => {
		const optionAnswer: ClarificationAnswer = {
			questionIndex: 0,
			selectedOptionLabels: ['A', 'B'],
		};
		const textAnswer: ClarificationAnswer = {
			questionIndex: 1,
			text: 'Custom input',
		};
		const hybridAnswer: ClarificationAnswer = {
			questionIndex: 2,
			selectedOptionLabels: ['C'],
			text: 'Additional notes',
		};

		const response: InteractionResponse = {
			kind: 'clarification-answer',
			answers: [optionAnswer, textAnswer, hybridAnswer],
		};

		const roundTripped = JSON.parse(JSON.stringify(response));
		expect(roundTripped.answers[0].selectedOptionLabels).toEqual(['A', 'B']);
		expect(roundTripped.answers[0].text).toBeUndefined();
		expect(roundTripped.answers[1].text).toBe('Custom input');
		expect(roundTripped.answers[1].selectedOptionLabels).toBeUndefined();
		expect(roundTripped.answers[2].selectedOptionLabels).toEqual(['C']);
		expect(roundTripped.answers[2].text).toBe('Additional notes');
	});
});
