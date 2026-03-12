/**
 * Tests for useSessionRuntimeCapabilities hook (Layer 2).
 *
 * Verifies that the hook correctly accesses harness runtime capabilities
 * from the harnessStore, independent of Layer 1 (static) capabilities.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHarnessStore } from '../../../renderer/stores/harnessStore';
import { useSessionRuntimeCapabilities } from '../../../renderer/hooks/agent/useSessionRuntimeCapabilities';
import type { RuntimeMetadataEvent } from '../../../shared/runtime-metadata-types';

// Reset store between tests
beforeEach(() => {
	useHarnessStore.setState({
		pendingInteractions: {},
		runtimeMetadata: {},
	});
});

describe('useSessionRuntimeCapabilities', () => {
	it('returns undefined when no metadata exists for the session', () => {
		const { result } = renderHook(() =>
			useSessionRuntimeCapabilities('session-1')
		);

		expect(result.current.runtimeCapabilities).toBeUndefined();
		expect(result.current.hasRuntimeCapability('supportsInteractionRequests')).toBe(false);
	});

	it('returns undefined for null sessionId', () => {
		const { result } = renderHook(() =>
			useSessionRuntimeCapabilities(null)
		);

		expect(result.current.runtimeCapabilities).toBeUndefined();
	});

	it('returns capabilities after metadata is applied', () => {
		const { result } = renderHook(() =>
			useSessionRuntimeCapabilities('session-1')
		);

		act(() => {
			const event: RuntimeMetadataEvent = {
				sessionId: 'session-1',
				source: 'claude-code',
				capabilities: {
					supportsInteractionRequests: true,
					supportsRuntimeModelChange: true,
					supportsSkillsEnumeration: false,
				},
			};
			useHarnessStore.getState().applyRuntimeMetadata('session-1', event);
		});

		expect(result.current.runtimeCapabilities).toBeDefined();
		expect(result.current.hasRuntimeCapability('supportsInteractionRequests')).toBe(true);
		expect(result.current.hasRuntimeCapability('supportsRuntimeModelChange')).toBe(true);
		expect(result.current.hasRuntimeCapability('supportsSkillsEnumeration')).toBe(false);
	});

	it('returns false for capabilities not reported by the harness', () => {
		const { result } = renderHook(() =>
			useSessionRuntimeCapabilities('session-1')
		);

		act(() => {
			const event: RuntimeMetadataEvent = {
				sessionId: 'session-1',
				source: 'claude-code',
				capabilities: {
					supportsInteractionRequests: true,
				},
			};
			useHarnessStore.getState().applyRuntimeMetadata('session-1', event);
		});

		// Reported as true
		expect(result.current.hasRuntimeCapability('supportsInteractionRequests')).toBe(true);
		// Not reported — should be false (conservative)
		expect(result.current.hasRuntimeCapability('supportsRuntimeModelChange')).toBe(false);
		expect(result.current.hasRuntimeCapability('supportsFileCheckpointing')).toBe(false);
	});

	it('updates when runtime capabilities change', () => {
		const { result } = renderHook(() =>
			useSessionRuntimeCapabilities('session-1')
		);

		// Initial: no model change support
		act(() => {
			useHarnessStore.getState().applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				capabilities: { supportsRuntimeModelChange: false },
			});
		});
		expect(result.current.hasRuntimeCapability('supportsRuntimeModelChange')).toBe(false);

		// Update: model change now supported
		act(() => {
			useHarnessStore.getState().applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				capabilities: { supportsRuntimeModelChange: true },
			});
		});
		expect(result.current.hasRuntimeCapability('supportsRuntimeModelChange')).toBe(true);
	});

	it('isolates capabilities between sessions', () => {
		const { result: result1 } = renderHook(() =>
			useSessionRuntimeCapabilities('session-1')
		);
		const { result: result2 } = renderHook(() =>
			useSessionRuntimeCapabilities('session-2')
		);

		act(() => {
			useHarnessStore.getState().applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				capabilities: { supportsRuntimeModelChange: true },
			});
			useHarnessStore.getState().applyRuntimeMetadata('session-2', {
				sessionId: 'session-2',
				source: 'codex',
				capabilities: { supportsRuntimeModelChange: false },
			});
		});

		expect(result1.current.hasRuntimeCapability('supportsRuntimeModelChange')).toBe(true);
		expect(result2.current.hasRuntimeCapability('supportsRuntimeModelChange')).toBe(false);
	});

	it('clears when session metadata is cleared', () => {
		const { result } = renderHook(() =>
			useSessionRuntimeCapabilities('session-1')
		);

		act(() => {
			useHarnessStore.getState().applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				capabilities: { supportsInteractionRequests: true },
			});
		});
		expect(result.current.hasRuntimeCapability('supportsInteractionRequests')).toBe(true);

		act(() => {
			useHarnessStore.getState().clearSession('session-1');
		});
		expect(result.current.runtimeCapabilities).toBeUndefined();
		expect(result.current.hasRuntimeCapability('supportsInteractionRequests')).toBe(false);
	});

	it('is independent from Layer 3 data fields (skills, models, etc.)', () => {
		const { result } = renderHook(() =>
			useSessionRuntimeCapabilities('session-1')
		);

		act(() => {
			useHarnessStore.getState().applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [{ id: 'commit', name: 'Commit' }],
				slashCommands: ['/help'],
				availableModels: [{ id: 'claude-opus-4-6' }],
				capabilities: { supportsSkillsEnumeration: true },
			});
		});

		// Layer 2 only returns capability flags, not data fields
		expect(result.current.runtimeCapabilities).toEqual({
			supportsSkillsEnumeration: true,
		});
		// Data fields are NOT in the runtime capabilities
		expect(result.current.runtimeCapabilities).not.toHaveProperty('skills');
		expect(result.current.runtimeCapabilities).not.toHaveProperty('slashCommands');
		expect(result.current.runtimeCapabilities).not.toHaveProperty('availableModels');
	});
});
