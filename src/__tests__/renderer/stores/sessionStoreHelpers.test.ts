import { describe, it, expect, beforeEach } from 'vitest';
import {
	useSessionStore,
	updateAiTab,
	updateActiveAiTab,
	updateSessionWith,
} from '../../../renderer/stores/sessionStore';
import type { Session } from '../../../renderer/types';
import { createMockSession } from '../../helpers/mockSession';
import { createMockAITab } from '../../helpers/mockTab';

// ============================================================================
// Test Helpers
// ============================================================================

function resetStore() {
	useSessionStore.setState({
		sessions: [],
		groups: [],
		activeSessionId: '',
		sessionsLoaded: false,
		initialLoadComplete: false,
		removedWorktreePaths: new Set(),
		cyclePosition: -1,
	});
}

/**
 * Create a session with two AI tabs for testing tab-level updates.
 */
function createSessionWithTabs(sessionId: string, activeTabId: string = 'tab-a') {
	const tabA = createMockAITab({ id: 'tab-a', inputValue: 'original-a', state: 'idle' });
	const tabB = createMockAITab({ id: 'tab-b', inputValue: 'original-b', state: 'idle' });
	return createMockSession({
		id: sessionId,
		aiTabs: [tabA, tabB],
		activeTabId,
	});
}

// ============================================================================
// Tests
// ============================================================================

describe('sessionStore standalone helpers', () => {
	beforeEach(() => {
		resetStore();
	});

	// ========================================================================
	// updateAiTab
	// ========================================================================

	describe('updateAiTab', () => {
		it('modifies the correct tab and leaves others unchanged', () => {
			const session = createSessionWithTabs('s1');
			useSessionStore.getState().setSessions([session]);

			updateAiTab('s1', 'tab-a', (tab) => ({ ...tab, inputValue: 'updated' }));

			const updated = useSessionStore.getState().sessions[0];
			expect(updated.aiTabs[0].inputValue).toBe('updated');
			expect(updated.aiTabs[1].inputValue).toBe('original-b');
		});

		it('is a no-op when session ID does not exist', () => {
			const session = createSessionWithTabs('s1');
			useSessionStore.getState().setSessions([session]);
			const stateBefore = useSessionStore.getState();

			updateAiTab('nonexistent', 'tab-a', (tab) => ({ ...tab, inputValue: 'updated' }));

			const stateAfter = useSessionStore.getState();
			expect(stateAfter.sessions).toBe(stateBefore.sessions);
		});

		it('is a no-op when tab ID does not exist', () => {
			const session = createSessionWithTabs('s1');
			useSessionStore.getState().setSessions([session]);
			const stateBefore = useSessionStore.getState();

			updateAiTab('s1', 'nonexistent', (tab) => ({ ...tab, inputValue: 'updated' }));

			const stateAfter = useSessionStore.getState();
			expect(stateAfter.sessions).toBe(stateBefore.sessions);
		});

		it('does not affect other sessions', () => {
			const s1 = createSessionWithTabs('s1');
			const s2 = createSessionWithTabs('s2');
			useSessionStore.getState().setSessions([s1, s2]);

			updateAiTab('s1', 'tab-a', (tab) => ({ ...tab, inputValue: 'updated' }));

			const sessions = useSessionStore.getState().sessions;
			expect(sessions[0].aiTabs[0].inputValue).toBe('updated');
			expect(sessions[1].aiTabs[0].inputValue).toBe('original-a');
		});
	});

	// ========================================================================
	// updateActiveAiTab
	// ========================================================================

	describe('updateActiveAiTab', () => {
		it('modifies only the active tab', () => {
			const session = createSessionWithTabs('s1', 'tab-b');
			useSessionStore.getState().setSessions([session]);

			updateActiveAiTab('s1', (tab) => ({ ...tab, state: 'busy' }));

			const updated = useSessionStore.getState().sessions[0];
			expect(updated.aiTabs[0].state).toBe('idle');
			expect(updated.aiTabs[1].state).toBe('busy');
		});

		it('falls back to first tab when activeTabId does not match', () => {
			const session = createSessionWithTabs('s1', 'nonexistent-tab');
			useSessionStore.getState().setSessions([session]);

			updateActiveAiTab('s1', (tab) => ({ ...tab, inputValue: 'fallback' }));

			const updated = useSessionStore.getState().sessions[0];
			expect(updated.aiTabs[0].inputValue).toBe('fallback');
			expect(updated.aiTabs[1].inputValue).toBe('original-b');
		});

		it('is a no-op when session ID does not exist', () => {
			const session = createSessionWithTabs('s1');
			useSessionStore.getState().setSessions([session]);
			const stateBefore = useSessionStore.getState();

			updateActiveAiTab('nonexistent', (tab) => ({ ...tab, state: 'busy' }));

			const stateAfter = useSessionStore.getState();
			expect(stateAfter.sessions).toBe(stateBefore.sessions);
		});

		it('is a no-op when session has no tabs', () => {
			const session = createMockSession({ id: 's1', aiTabs: [], activeTabId: '' });
			useSessionStore.getState().setSessions([session]);
			const stateBefore = useSessionStore.getState();

			updateActiveAiTab('s1', (tab) => ({ ...tab, state: 'busy' }));

			const stateAfter = useSessionStore.getState();
			expect(stateAfter.sessions).toBe(stateBefore.sessions);
		});
	});

	// ========================================================================
	// updateSessionWith
	// ========================================================================

	describe('updateSessionWith', () => {
		it('modifies the correct session', () => {
			const s1 = createMockSession({ id: 's1', state: 'idle' });
			const s2 = createMockSession({ id: 's2', state: 'idle' });
			useSessionStore.getState().setSessions([s1, s2]);

			updateSessionWith('s1', (s) => ({ ...s, state: 'busy' }));

			const sessions = useSessionStore.getState().sessions;
			expect(sessions[0].state).toBe('busy');
			expect(sessions[1].state).toBe('idle');
		});

		it('is a no-op when session ID does not exist', () => {
			const session = createMockSession({ id: 's1' });
			useSessionStore.getState().setSessions([session]);
			const stateBefore = useSessionStore.getState();

			updateSessionWith('nonexistent', (s) => ({ ...s, state: 'busy' }));

			const stateAfter = useSessionStore.getState();
			expect(stateAfter.sessions).toBe(stateBefore.sessions);
		});

		it('supports complex updates across multiple fields', () => {
			const session = createSessionWithTabs('s1');
			useSessionStore.getState().setSessions([session]);

			updateSessionWith('s1', (s) => ({
				...s,
				state: 'busy',
				contextUsage: 50,
			}));

			const updated = useSessionStore.getState().sessions[0];
			expect(updated.state).toBe('busy');
			expect(updated.contextUsage).toBe(50);
			expect(updated.aiTabs).toHaveLength(2);
		});
	});

	// ========================================================================
	// Immutability
	// ========================================================================

	describe('immutability', () => {
		it('updateAiTab does not mutate original state objects', () => {
			const session = createSessionWithTabs('s1');
			useSessionStore.getState().setSessions([session]);

			const sessionsBefore = useSessionStore.getState().sessions;
			const tabBefore = sessionsBefore[0].aiTabs[0];

			updateAiTab('s1', 'tab-a', (tab) => ({ ...tab, inputValue: 'changed' }));

			const sessionsAfter = useSessionStore.getState().sessions;
			// Original references are unchanged
			expect(tabBefore.inputValue).toBe('original-a');
			// New array was created
			expect(sessionsAfter).not.toBe(sessionsBefore);
			expect(sessionsAfter[0]).not.toBe(sessionsBefore[0]);
			expect(sessionsAfter[0].aiTabs[0]).not.toBe(tabBefore);
		});

		it('updateActiveAiTab does not mutate original state objects', () => {
			const session = createSessionWithTabs('s1', 'tab-a');
			useSessionStore.getState().setSessions([session]);

			const sessionsBefore = useSessionStore.getState().sessions;

			updateActiveAiTab('s1', (tab) => ({ ...tab, state: 'busy' }));

			const sessionsAfter = useSessionStore.getState().sessions;
			expect(sessionsBefore[0].aiTabs[0].state).toBe('idle');
			expect(sessionsAfter).not.toBe(sessionsBefore);
		});

		it('updateSessionWith does not mutate original state objects', () => {
			const session = createMockSession({ id: 's1', contextUsage: 0 });
			useSessionStore.getState().setSessions([session]);

			const sessionsBefore = useSessionStore.getState().sessions;

			updateSessionWith('s1', (s) => ({ ...s, contextUsage: 99 }));

			const sessionsAfter = useSessionStore.getState().sessions;
			expect(sessionsBefore[0].contextUsage).toBe(0);
			expect(sessionsAfter[0].contextUsage).toBe(99);
			expect(sessionsAfter).not.toBe(sessionsBefore);
		});
	});
});
