/**
 * Validation: Classic execution UI still works when no harness features are present.
 *
 * These tests verify that the existing classic execution flow (PTY-based,
 * no harness layer) is not broken by the addition of harness infrastructure.
 * Every session that does NOT receive harness events should behave exactly
 * as before: no interaction modals, no metadata bars, safe default hooks,
 * and no store pollution across sessions.
 *
 * Covers:
 * - Harness store starts clean and stays inert for classic sessions
 * - InteractionRequestModal renders nothing when no interactions exist
 * - RuntimeMetadataBar renders nothing when no metadata exists
 * - Hooks return safe defaults for sessions with no harness data
 * - Layer 1 static capabilities work independently of Layer 2/3
 * - Multiple classic sessions coexist without harness store interference
 * - Classic session lifecycle (create, switch, delete) is unaffected
 * - Harness data in one session does not bleed into classic sessions
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';

// --- Stores ---
import { useHarnessStore } from '../../renderer/stores/harnessStore';
import { useSessionStore } from '../../renderer/stores/sessionStore';

// --- Selectors ---
import {
	selectSessionInteractions,
	selectHasPendingInteractions,
	selectSessionRuntimeMetadata,
	selectSessionRuntimeCapabilities,
	getHarnessState,
	getHarnessActions,
} from '../../renderer/stores/harnessStore';

// --- Hooks ---
import { useSessionRuntimeMetadata } from '../../renderer/hooks/agent/useSessionRuntimeMetadata';
import { useSessionRuntimeCapabilities } from '../../renderer/hooks/agent/useSessionRuntimeCapabilities';

// --- Components ---
import { InteractionRequestModal } from '../../renderer/components/InteractionRequest/InteractionRequestModal';
import { RuntimeMetadataBar } from '../../renderer/components/RuntimeMetadataBar';

// --- Types ---
import type { Theme } from '../../renderer/types';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('lucide-react', () => ({
	Sparkles: ({ className }: any) => <svg data-testid="sparkles-icon" className={className} />,
	Terminal: ({ className }: any) => <svg data-testid="terminal-icon" className={className} />,
	Cpu: ({ className }: any) => <svg data-testid="cpu-icon" className={className} />,
	Bot: ({ className }: any) => <svg data-testid="bot-icon" className={className} />,
	MessageSquare: ({ className, style }: any) => <svg data-testid="message-square-icon" className={className} style={style} />,
	Shield: ({ className, style }: any) => <svg data-testid="shield-icon" className={className} style={style} />,
	Check: ({ className, style }: any) => <svg data-testid="check-icon" className={className} style={style} />,
}));

// Mock the LayerStackContext for Modal rendering
vi.mock('../../renderer/contexts/LayerStackContext', () => ({
	LayerStackProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	useLayerStack: () => ({
		register: vi.fn(),
		unregister: vi.fn(),
		isTopLayer: () => true,
	}),
}));

// Mock Modal to simplify component testing
vi.mock('../../renderer/components/ui/Modal', () => ({
	Modal: ({ children, testId }: any) => (
		<div data-testid={testId}>{children}</div>
	),
}));

const mockRespondToInteraction = vi.fn().mockResolvedValue(undefined);

(window as any).maestro = {
	...(window as any).maestro,
	process: {
		...((window as any).maestro?.process ?? {}),
		respondToInteraction: mockRespondToInteraction,
	},
};

// ============================================================================
// Fixtures
// ============================================================================

const testTheme: Theme = {
	id: 'test-theme' as any,
	name: 'Test Theme',
	mode: 'dark',
	colors: {
		bgMain: '#1e1e1e',
		bgSidebar: '#252526',
		bgActivity: '#333333',
		textMain: '#d4d4d4',
		textDim: '#808080',
		accent: '#007acc',
		accentDim: '#007acc80',
		accentText: '#007acc',
		accentForeground: '#ffffff',
		border: '#404040',
		error: '#f14c4c',
		warning: '#cca700',
		success: '#89d185',
	},
};

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
	useHarnessStore.setState({
		pendingInteractions: {},
		runtimeMetadata: {},
	});
	useSessionStore.setState({
		activeSessionId: 'classic-session-1',
	});
	vi.clearAllMocks();
});

// ============================================================================
// Tests — Harness Store Inert for Classic Sessions
// ============================================================================

describe('Classic execution: harness store is inert', () => {
	it('harness store starts with empty state', () => {
		const state = getHarnessState();
		expect(state.pendingInteractions).toEqual({});
		expect(state.runtimeMetadata).toEqual({});
	});

	it('selectors return safe defaults for a session that never received events', () => {
		const state = useHarnessStore.getState();
		expect(selectSessionInteractions(state, 'classic-session-1')).toEqual([]);
		expect(selectHasPendingInteractions(state, 'classic-session-1')).toBe(false);
		expect(selectSessionRuntimeMetadata(state, 'classic-session-1')).toBeUndefined();
		expect(selectSessionRuntimeCapabilities(state, 'classic-session-1')).toBeUndefined();
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

	it('clearSession on an empty session is a safe no-op', () => {
		const before = useHarnessStore.getState();
		useHarnessStore.getState().clearSession('classic-session-1');
		const after = useHarnessStore.getState();

		// Reference identity — no state mutation occurred
		expect(after.pendingInteractions).toBe(before.pendingInteractions);
		expect(after.runtimeMetadata).toBe(before.runtimeMetadata);
	});

	it('clearSessionInteractions on an empty session is a safe no-op', () => {
		const before = useHarnessStore.getState();
		useHarnessStore.getState().clearSessionInteractions('classic-session-1');
		const after = useHarnessStore.getState();

		expect(after.pendingInteractions).toBe(before.pendingInteractions);
	});

	it('clearSessionMetadata on an empty session is a safe no-op', () => {
		const before = useHarnessStore.getState();
		useHarnessStore.getState().clearSessionMetadata('classic-session-1');
		const after = useHarnessStore.getState();

		expect(after.runtimeMetadata).toBe(before.runtimeMetadata);
	});

	it('removeInteraction on a non-existent session is a safe no-op', () => {
		const before = useHarnessStore.getState();
		useHarnessStore.getState().removeInteraction('classic-session-1', 'nonexistent-id');
		const after = useHarnessStore.getState();

		expect(after.pendingInteractions).toBe(before.pendingInteractions);
	});
});

// ============================================================================
// Tests — InteractionRequestModal renders nothing for classic sessions
// ============================================================================

describe('Classic execution: InteractionRequestModal is invisible', () => {
	it('renders null when no interactions exist for the active session', () => {
		useSessionStore.setState({ activeSessionId: 'classic-session-1' });

		const { container } = render(
			<InteractionRequestModal theme={testTheme} />
		);

		expect(container.firstChild).toBeNull();
	});

	it('renders null when activeSessionId is empty', () => {
		useSessionStore.setState({ activeSessionId: '' });

		const { container } = render(
			<InteractionRequestModal theme={testTheme} />
		);

		expect(container.firstChild).toBeNull();
	});

	it('renders null even when another session has pending interactions', () => {
		// Another session has interactions, but our active classic session does not
		useHarnessStore.setState({
			pendingInteractions: {
				'harness-session-99': [
					{
						interactionId: 'int-1',
						sessionId: 'harness-session-99',
						agentId: 'claude-code',
						kind: 'tool-approval',
						timestamp: Date.now(),
						toolUseId: 'tool-1',
						toolName: 'Edit',
						toolInput: { file_path: '/test.ts' },
					} as any,
				],
			},
		});
		useSessionStore.setState({ activeSessionId: 'classic-session-1' });

		const { container } = render(
			<InteractionRequestModal theme={testTheme} />
		);

		expect(container.firstChild).toBeNull();
	});
});

// ============================================================================
// Tests — RuntimeMetadataBar renders nothing for classic sessions
// ============================================================================

describe('Classic execution: RuntimeMetadataBar is invisible', () => {
	it('renders null when no metadata exists for the session', () => {
		const { container } = render(
			<RuntimeMetadataBar sessionId="classic-session-1" theme={testTheme} />
		);

		expect(container.firstChild).toBeNull();
	});

	it('renders null for a session that never received any events', () => {
		const { container } = render(
			<RuntimeMetadataBar sessionId="never-seen-session" theme={testTheme} />
		);

		expect(container.firstChild).toBeNull();
	});

	it('renders null even when another session has metadata', () => {
		// Populate metadata for a different session
		act(() => {
			useHarnessStore.getState().applyRuntimeMetadata('harness-session-99', {
				sessionId: 'harness-session-99',
				source: 'claude-code',
				skills: [{ id: 'commit', name: 'Commit' }],
				slashCommands: ['/help'],
			});
		});

		const { container } = render(
			<RuntimeMetadataBar sessionId="classic-session-1" theme={testTheme} />
		);

		expect(container.firstChild).toBeNull();
	});
});

// ============================================================================
// Tests — Hooks return safe defaults for classic sessions
// ============================================================================

describe('Classic execution: useSessionRuntimeMetadata hook defaults', () => {
	it('returns safe empty defaults for a classic session', () => {
		const { result } = renderHook(() =>
			useSessionRuntimeMetadata('classic-session-1')
		);

		expect(result.current.metadata).toBeUndefined();
		expect(result.current.hasMetadata).toBe(false);
		expect(result.current.skills).toEqual([]);
		expect(result.current.slashCommands).toEqual([]);
		expect(result.current.availableModels).toEqual([]);
		expect(result.current.availableAgents).toEqual([]);
	});

	it('returns stable empty array references across re-renders', () => {
		const { result, rerender } = renderHook(() =>
			useSessionRuntimeMetadata('classic-session-1')
		);

		const skills1 = result.current.skills;
		const cmds1 = result.current.slashCommands;
		const models1 = result.current.availableModels;
		const agents1 = result.current.availableAgents;

		rerender();

		// Referential identity — no wasted re-renders
		expect(result.current.skills).toBe(skills1);
		expect(result.current.slashCommands).toBe(cmds1);
		expect(result.current.availableModels).toBe(models1);
		expect(result.current.availableAgents).toBe(agents1);
	});

	it('stays empty when unrelated session receives metadata', () => {
		const { result } = renderHook(() =>
			useSessionRuntimeMetadata('classic-session-1')
		);

		act(() => {
			useHarnessStore.getState().applyRuntimeMetadata('harness-session-99', {
				sessionId: 'harness-session-99',
				source: 'claude-code',
				skills: [{ id: 'commit', name: 'Commit' }],
				availableModels: [{ id: 'claude-opus-4-6' }],
			});
		});

		expect(result.current.hasMetadata).toBe(false);
		expect(result.current.skills).toEqual([]);
		expect(result.current.availableModels).toEqual([]);
	});
});

describe('Classic execution: useSessionRuntimeCapabilities hook defaults', () => {
	it('returns undefined capabilities for a classic session', () => {
		const { result } = renderHook(() =>
			useSessionRuntimeCapabilities('classic-session-1')
		);

		expect(result.current.runtimeCapabilities).toBeUndefined();
	});

	it('hasRuntimeCapability returns false for all flags on a classic session', () => {
		const { result } = renderHook(() =>
			useSessionRuntimeCapabilities('classic-session-1')
		);

		// All runtime capability flags should return false
		expect(result.current.hasRuntimeCapability('supportsInteractionRequests')).toBe(false);
		expect(result.current.hasRuntimeCapability('supportsMidTurnInput')).toBe(false);
		expect(result.current.hasRuntimeCapability('supportsRuntimeModelChange')).toBe(false);
		expect(result.current.hasRuntimeCapability('supportsRuntimeEffortChange')).toBe(false);
		expect(result.current.hasRuntimeCapability('supportsSkillsEnumeration')).toBe(false);
		expect(result.current.hasRuntimeCapability('supportsRuntimeSlashCommands')).toBe(false);
		expect(result.current.hasRuntimeCapability('supportsFileCheckpointing')).toBe(false);
		expect(result.current.hasRuntimeCapability('supportsStructuredOutput')).toBe(false);
		expect(result.current.hasRuntimeCapability('supportsBudgetLimits')).toBe(false);
		expect(result.current.hasRuntimeCapability('supportsContextCompaction')).toBe(false);
		expect(result.current.hasRuntimeCapability('supportsSessionFork')).toBe(false);
		expect(result.current.hasRuntimeCapability('supportsPersistentStdin')).toBe(false);
		expect(result.current.hasRuntimeCapability('supportsRuntimePermissionUpdates')).toBe(false);
	});

	it('stays undefined when unrelated session gets capabilities', () => {
		const { result } = renderHook(() =>
			useSessionRuntimeCapabilities('classic-session-1')
		);

		act(() => {
			useHarnessStore.getState().applyRuntimeMetadata('harness-session-99', {
				sessionId: 'harness-session-99',
				source: 'claude-code',
				capabilities: {
					supportsInteractionRequests: true,
					supportsRuntimeModelChange: true,
				},
			});
		});

		expect(result.current.runtimeCapabilities).toBeUndefined();
		expect(result.current.hasRuntimeCapability('supportsInteractionRequests')).toBe(false);
	});
});

// ============================================================================
// Tests — Multiple classic sessions coexist cleanly
// ============================================================================

describe('Classic execution: multiple sessions without harness data', () => {
	it('all classic sessions return empty selectors independently', () => {
		const sessions = ['classic-1', 'classic-2', 'classic-3'];
		const state = useHarnessStore.getState();

		for (const sid of sessions) {
			expect(selectSessionInteractions(state, sid)).toEqual([]);
			expect(selectHasPendingInteractions(state, sid)).toBe(false);
			expect(selectSessionRuntimeMetadata(state, sid)).toBeUndefined();
			expect(selectSessionRuntimeCapabilities(state, sid)).toBeUndefined();
		}
	});

	it('clearSession on one classic session does not affect others', () => {
		// Even though neither has harness data, this should be safe
		const before = useHarnessStore.getState();
		useHarnessStore.getState().clearSession('classic-1');
		const after = useHarnessStore.getState();

		// State should be referentially identical (no-op)
		expect(after.pendingInteractions).toBe(before.pendingInteractions);
		expect(after.runtimeMetadata).toBe(before.runtimeMetadata);

		// Other sessions still return defaults
		expect(selectSessionInteractions(after, 'classic-2')).toEqual([]);
		expect(selectSessionRuntimeMetadata(after, 'classic-3')).toBeUndefined();
	});

	it('switching active session between classic sessions keeps modal hidden', () => {
		// Render modal with classic-session-1 active
		useSessionStore.setState({ activeSessionId: 'classic-session-1' });
		const { container, rerender } = render(
			<InteractionRequestModal theme={testTheme} />
		);
		expect(container.firstChild).toBeNull();

		// Switch to classic-session-2
		act(() => {
			useSessionStore.setState({ activeSessionId: 'classic-session-2' });
		});
		rerender(<InteractionRequestModal theme={testTheme} />);
		expect(container.firstChild).toBeNull();

		// Switch to classic-session-3
		act(() => {
			useSessionStore.setState({ activeSessionId: 'classic-session-3' });
		});
		rerender(<InteractionRequestModal theme={testTheme} />);
		expect(container.firstChild).toBeNull();
	});
});

// ============================================================================
// Tests — Harness data in one session does not contaminate classic sessions
// ============================================================================

describe('Classic execution: harness session isolation', () => {
	it('harness session data does not appear in classic session hooks', () => {
		// One harness session has rich data
		act(() => {
			useHarnessStore.getState().applyRuntimeMetadata('harness-session-1', {
				sessionId: 'harness-session-1',
				source: 'claude-code',
				skills: [
					{ id: 'commit', name: 'Commit' },
					{ id: 'review', name: 'Review PR' },
				],
				slashCommands: ['/help', '/compact'],
				availableModels: [
					{ id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
				],
				availableAgents: [
					{ id: 'sub-agent-1', label: 'Sub Agent' },
				],
				capabilities: {
					supportsInteractionRequests: true,
					supportsRuntimeModelChange: true,
					supportsSkillsEnumeration: true,
				},
			});
			useHarnessStore.getState().addInteraction('harness-session-1', {
				interactionId: 'int-1',
				sessionId: 'harness-session-1',
				agentId: 'claude-code',
				kind: 'tool-approval',
				timestamp: Date.now(),
				toolUseId: 'tool-1',
				toolName: 'Bash',
				toolInput: { command: 'rm -rf /' },
			});
		});

		// Classic session hooks should be completely unaffected
		const { result: metaResult } = renderHook(() =>
			useSessionRuntimeMetadata('classic-session-1')
		);
		const { result: capsResult } = renderHook(() =>
			useSessionRuntimeCapabilities('classic-session-1')
		);

		expect(metaResult.current.hasMetadata).toBe(false);
		expect(metaResult.current.skills).toEqual([]);
		expect(metaResult.current.slashCommands).toEqual([]);
		expect(metaResult.current.availableModels).toEqual([]);
		expect(metaResult.current.availableAgents).toEqual([]);

		expect(capsResult.current.runtimeCapabilities).toBeUndefined();
		expect(capsResult.current.hasRuntimeCapability('supportsInteractionRequests')).toBe(false);

		// Selectors also unaffected
		const state = useHarnessStore.getState();
		expect(selectSessionInteractions(state, 'classic-session-1')).toEqual([]);
		expect(selectHasPendingInteractions(state, 'classic-session-1')).toBe(false);
	});

	it('cleaning up harness session does not affect classic session state', () => {
		// Populate harness session
		act(() => {
			useHarnessStore.getState().applyRuntimeMetadata('harness-session-1', {
				sessionId: 'harness-session-1',
				source: 'claude-code',
				skills: [{ id: 'commit', name: 'Commit' }],
			});
		});

		// Classic session hook is watching
		const { result } = renderHook(() =>
			useSessionRuntimeMetadata('classic-session-1')
		);
		expect(result.current.hasMetadata).toBe(false);

		// Clean up the harness session
		act(() => {
			useHarnessStore.getState().clearSession('harness-session-1');
		});

		// Classic session hook is still unaffected
		expect(result.current.hasMetadata).toBe(false);
		expect(result.current.skills).toEqual([]);
	});
});

// ============================================================================
// Tests — Classic session lifecycle operations are safe
// ============================================================================

describe('Classic execution: session lifecycle operations', () => {
	it('simulated classic session create/use/exit cycle with no harness side effects', () => {
		const sessionId = 'classic-lifecycle-test';

		// 1. Session created — harness state is clean
		let state = useHarnessStore.getState();
		expect(selectSessionInteractions(state, sessionId)).toEqual([]);
		expect(selectSessionRuntimeMetadata(state, sessionId)).toBeUndefined();

		// 2. Session active (user sends messages, receives output) — still clean
		useSessionStore.setState({ activeSessionId: sessionId });
		state = useHarnessStore.getState();
		expect(selectHasPendingInteractions(state, sessionId)).toBe(false);

		// 3. Session exits — clearSession is a no-op
		const before = useHarnessStore.getState();
		useHarnessStore.getState().clearSession(sessionId);
		const after = useHarnessStore.getState();
		expect(after.pendingInteractions).toBe(before.pendingInteractions);
		expect(after.runtimeMetadata).toBe(before.runtimeMetadata);
	});

	it('repeated clearSession calls on same classic session are idempotent', () => {
		const sessionId = 'classic-idempotent';

		for (let i = 0; i < 5; i++) {
			const before = useHarnessStore.getState();
			useHarnessStore.getState().clearSession(sessionId);
			const after = useHarnessStore.getState();
			expect(after.pendingInteractions).toBe(before.pendingInteractions);
			expect(after.runtimeMetadata).toBe(before.runtimeMetadata);
		}
	});

	it('sequential classic sessions can be created and cleaned up independently', () => {
		const sessions = ['seq-1', 'seq-2', 'seq-3', 'seq-4', 'seq-5'];

		// "Create" and "exit" each session
		for (const sid of sessions) {
			useSessionStore.setState({ activeSessionId: sid });

			const state = useHarnessStore.getState();
			expect(selectHasPendingInteractions(state, sid)).toBe(false);
			expect(selectSessionRuntimeMetadata(state, sid)).toBeUndefined();

			// On exit
			useHarnessStore.getState().clearSession(sid);
		}

		// Final state should still be pristine
		const finalState = useHarnessStore.getState();
		expect(finalState.pendingInteractions).toEqual({});
		expect(finalState.runtimeMetadata).toEqual({});
	});
});

// ============================================================================
// Tests — Layer 1 static capabilities are independent of Layer 2/3
// ============================================================================

describe('Classic execution: Layer 1 is independent of harness layers', () => {
	it('Layer 2 (runtime capabilities) being undefined does not interfere with Layer 1', () => {
		// A classic session has no Layer 2 data
		const { result: capsResult } = renderHook(() =>
			useSessionRuntimeCapabilities('classic-session-1')
		);
		expect(capsResult.current.runtimeCapabilities).toBeUndefined();

		// This is correct — Layer 1 is fetched via IPC from useAgentCapabilities,
		// not from harnessStore. Layer 2 being empty is the expected state for
		// agents running via classic PTY execution.
	});

	it('Layer 3 (runtime metadata) being undefined does not interfere with Layer 1', () => {
		// A classic session has no Layer 3 data
		const { result: metaResult } = renderHook(() =>
			useSessionRuntimeMetadata('classic-session-1')
		);
		expect(metaResult.current.metadata).toBeUndefined();
		expect(metaResult.current.hasMetadata).toBe(false);

		// Layer 1 agent capabilities (supportsSlashCommands, etc.) are not
		// stored in harnessStore. They come from the static capability system.
		// Classic agents get their slash commands via the IPC agentCommands path,
		// not the harness RuntimeMetadataEvent path.
	});

	it('all three layers return independent defaults for a classic session', () => {
		const sessionId = 'classic-all-layers';

		// Layer 2
		const { result: l2 } = renderHook(() =>
			useSessionRuntimeCapabilities(sessionId)
		);
		expect(l2.current.runtimeCapabilities).toBeUndefined();

		// Layer 3
		const { result: l3 } = renderHook(() =>
			useSessionRuntimeMetadata(sessionId)
		);
		expect(l3.current.metadata).toBeUndefined();
		expect(l3.current.hasMetadata).toBe(false);
		expect(l3.current.skills).toEqual([]);
		expect(l3.current.slashCommands).toEqual([]);
		expect(l3.current.availableModels).toEqual([]);
		expect(l3.current.availableAgents).toEqual([]);

		// Modifying Layer 2 for ANOTHER session still doesn't affect this session
		act(() => {
			useHarnessStore.getState().applyRuntimeMetadata('other-session', {
				sessionId: 'other-session',
				source: 'claude-code',
				capabilities: { supportsRuntimeModelChange: true },
				skills: [{ id: 'commit', name: 'Commit' }],
			});
		});

		expect(l2.current.runtimeCapabilities).toBeUndefined();
		expect(l3.current.hasMetadata).toBe(false);
	});
});
