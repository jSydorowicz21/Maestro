/**
 * Tests for useSessionRuntimeMetadata hook (Layer 3).
 *
 * Verifies that the hook correctly accesses session runtime metadata
 * from the harnessStore, providing concrete data fields (skills,
 * slash commands, models, agents) independently of Layer 2 capabilities.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHarnessStore } from '../../../renderer/stores/harnessStore';
import { useSessionRuntimeMetadata } from '../../../renderer/hooks/agent/useSessionRuntimeMetadata';
import type { RuntimeMetadataEvent } from '../../../shared/runtime-metadata-types';

// Reset store between tests
beforeEach(() => {
	useHarnessStore.setState({
		pendingInteractions: {},
		runtimeMetadata: {},
	});
});

describe('useSessionRuntimeMetadata', () => {
	it('returns empty defaults when no metadata exists for the session', () => {
		const { result } = renderHook(() =>
			useSessionRuntimeMetadata('session-1')
		);

		expect(result.current.metadata).toBeUndefined();
		expect(result.current.hasMetadata).toBe(false);
		expect(result.current.skills).toEqual([]);
		expect(result.current.slashCommands).toEqual([]);
		expect(result.current.availableModels).toEqual([]);
		expect(result.current.availableAgents).toEqual([]);
	});

	it('returns empty defaults for null sessionId', () => {
		const { result } = renderHook(() =>
			useSessionRuntimeMetadata(null)
		);

		expect(result.current.metadata).toBeUndefined();
		expect(result.current.hasMetadata).toBe(false);
	});

	it('returns empty defaults for undefined sessionId', () => {
		const { result } = renderHook(() =>
			useSessionRuntimeMetadata(undefined)
		);

		expect(result.current.metadata).toBeUndefined();
		expect(result.current.hasMetadata).toBe(false);
	});

	it('returns skills after metadata is applied', () => {
		const { result } = renderHook(() =>
			useSessionRuntimeMetadata('session-1')
		);

		act(() => {
			const event: RuntimeMetadataEvent = {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [
					{ id: 'commit', name: 'Commit', description: 'Commit changes' },
					{ id: 'review-pr', name: 'Review PR' },
				],
			};
			useHarnessStore.getState().applyRuntimeMetadata('session-1', event);
		});

		expect(result.current.hasMetadata).toBe(true);
		expect(result.current.skills).toHaveLength(2);
		expect(result.current.skills[0]).toEqual({
			id: 'commit',
			name: 'Commit',
			description: 'Commit changes',
		});
		expect(result.current.skills[1]).toEqual({
			id: 'review-pr',
			name: 'Review PR',
		});
	});

	it('returns slash commands after metadata is applied', () => {
		const { result } = renderHook(() =>
			useSessionRuntimeMetadata('session-1')
		);

		act(() => {
			useHarnessStore.getState().applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				slashCommands: ['/help', '/compact', '/review'],
			});
		});

		expect(result.current.slashCommands).toEqual(['/help', '/compact', '/review']);
	});

	it('returns available models after metadata is applied', () => {
		const { result } = renderHook(() =>
			useSessionRuntimeMetadata('session-1')
		);

		act(() => {
			useHarnessStore.getState().applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				availableModels: [
					{ id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
					{ id: 'claude-sonnet-4-6' },
				],
			});
		});

		expect(result.current.availableModels).toHaveLength(2);
		expect(result.current.availableModels[0]).toEqual({
			id: 'claude-opus-4-6',
			label: 'Claude Opus 4.6',
		});
	});

	it('returns available agents after metadata is applied', () => {
		const { result } = renderHook(() =>
			useSessionRuntimeMetadata('session-1')
		);

		act(() => {
			useHarnessStore.getState().applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				availableAgents: [
					{ id: 'code-reviewer', label: 'Code Reviewer' },
					{ id: 'test-runner', label: 'Test Runner' },
				],
			});
		});

		expect(result.current.availableAgents).toHaveLength(2);
		expect(result.current.availableAgents[0].id).toBe('code-reviewer');
	});

	it('isolates metadata between sessions', () => {
		const { result: result1 } = renderHook(() =>
			useSessionRuntimeMetadata('session-1')
		);
		const { result: result2 } = renderHook(() =>
			useSessionRuntimeMetadata('session-2')
		);

		act(() => {
			useHarnessStore.getState().applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [{ id: 'commit', name: 'Commit' }],
			});
			useHarnessStore.getState().applyRuntimeMetadata('session-2', {
				sessionId: 'session-2',
				source: 'codex',
				availableModels: [{ id: 'gpt-4o' }],
			});
		});

		// Session 1 has skills, no models
		expect(result1.current.skills).toHaveLength(1);
		expect(result1.current.availableModels).toHaveLength(0);

		// Session 2 has models, no skills
		expect(result2.current.skills).toHaveLength(0);
		expect(result2.current.availableModels).toHaveLength(1);
	});

	it('clears when session is cleaned up', () => {
		const { result } = renderHook(() =>
			useSessionRuntimeMetadata('session-1')
		);

		act(() => {
			useHarnessStore.getState().applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [{ id: 'commit', name: 'Commit' }],
				slashCommands: ['/help'],
				availableModels: [{ id: 'claude-opus-4-6' }],
			});
		});
		expect(result.current.hasMetadata).toBe(true);

		act(() => {
			useHarnessStore.getState().clearSession('session-1');
		});
		expect(result.current.hasMetadata).toBe(false);
		expect(result.current.skills).toEqual([]);
		expect(result.current.slashCommands).toEqual([]);
		expect(result.current.availableModels).toEqual([]);
	});

	it('returns stable empty arrays when no data (referential equality)', () => {
		const { result, rerender } = renderHook(() =>
			useSessionRuntimeMetadata('session-1')
		);

		const skills1 = result.current.skills;
		const models1 = result.current.availableModels;

		rerender();

		// Same empty array references across renders (memoization)
		expect(result.current.skills).toBe(skills1);
		expect(result.current.availableModels).toBe(models1);
	});

	it('does not include Layer 2 capabilities in metadata fields', () => {
		const { result } = renderHook(() =>
			useSessionRuntimeMetadata('session-1')
		);

		act(() => {
			useHarnessStore.getState().applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				capabilities: {
					supportsSkillsEnumeration: true,
					supportsRuntimeModelChange: true,
				},
				skills: [{ id: 'commit', name: 'Commit' }],
			});
		});

		// Skills are Layer 3 data — present
		expect(result.current.skills).toHaveLength(1);
		// Capabilities are in metadata.capabilities but NOT exposed as data fields
		expect(result.current.metadata?.capabilities).toBeDefined();
		expect(result.current.metadata?.capabilities?.supportsSkillsEnumeration).toBe(true);
		// The hook's convenience fields are data only
		expect(result.current).not.toHaveProperty('capabilities');
	});

	it('updates incrementally when partial metadata events arrive', () => {
		const { result } = renderHook(() =>
			useSessionRuntimeMetadata('session-1')
		);

		// First event: skills
		act(() => {
			useHarnessStore.getState().applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [{ id: 'commit', name: 'Commit' }],
			});
		});
		expect(result.current.skills).toHaveLength(1);
		expect(result.current.availableModels).toHaveLength(0);

		// Second event: models (incremental, skills preserved)
		act(() => {
			useHarnessStore.getState().applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				availableModels: [{ id: 'claude-opus-4-6' }],
			});
		});
		expect(result.current.skills).toHaveLength(1);
		expect(result.current.availableModels).toHaveLength(1);
	});

	it('handles replace event that clears fields with empty arrays', () => {
		const { result } = renderHook(() =>
			useSessionRuntimeMetadata('session-1')
		);

		// Populate
		act(() => {
			useHarnessStore.getState().applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [{ id: 'commit', name: 'Commit' }],
				slashCommands: ['/help'],
			});
		});
		expect(result.current.skills).toHaveLength(1);
		expect(result.current.slashCommands).toHaveLength(1);

		// Replace with empty skills (clear), omit slashCommands (preserve)
		act(() => {
			useHarnessStore.getState().applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				replace: true,
				skills: [],
			});
		});
		expect(result.current.skills).toHaveLength(0);
		expect(result.current.slashCommands).toHaveLength(1); // Preserved
	});
});
