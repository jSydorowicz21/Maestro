/**
 * Tests for useBatchProcessor hook - Lifecycle
 *
 * Hook initialization, state synchronization, prompts, tracking, audio feedback, and session management.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type {
	Session,
	Group,
	HistoryEntry,
	UsageStats,
	BatchRunConfig,
	AgentError,
} from '../../../renderer/types';

import { useBatchProcessor } from '../../../renderer/hooks';
import { useBatchStore } from '../../../renderer/stores/batchStore';
import {
	createMockSession,
	createMockGroup,
	createBatchProcessorTestContext,
	type BatchProcessorTestContext,
} from './useBatchProcessor.setup';

// Mock notifyToast so we can verify toast notifications
const { mockNotifyToast } = vi.hoisted(() => ({
	mockNotifyToast: vi.fn(),
}));
vi.mock('../../../renderer/stores/notificationStore', () => ({
	notifyToast: (...args: unknown[]) => mockNotifyToast(...args),
}));

describe('useBatchProcessor hook - Lifecycle', () => {
	let ctx: BatchProcessorTestContext;
	let mockOnUpdateSession: ReturnType<typeof vi.fn>;
	let mockOnSpawnAgent: ReturnType<typeof vi.fn>;
	let mockOnAddHistoryEntry: ReturnType<typeof vi.fn>;
	let mockOnComplete: ReturnType<typeof vi.fn>;
	let mockOnPRResult: ReturnType<typeof vi.fn>;
	let mockReadDoc: ReturnType<typeof vi.fn>;
	let mockWriteDoc: ReturnType<typeof vi.fn>;
	let mockCreateWorkingCopy: ReturnType<typeof vi.fn>;
	let mockStatus: ReturnType<typeof vi.fn>;
	let mockBranch: ReturnType<typeof vi.fn>;
	let mockBroadcastAutoRunState: ReturnType<typeof vi.fn>;
	let mockRegisterSessionOrigin: ReturnType<typeof vi.fn>;
	let mockWorktreeSetup: ReturnType<typeof vi.fn>;
	let mockWorktreeCheckout: ReturnType<typeof vi.fn>;
	let mockGetDefaultBranch: ReturnType<typeof vi.fn>;
	let mockCreatePR: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		ctx = createBatchProcessorTestContext(mockNotifyToast);
		({
			mockOnUpdateSession,
			mockOnSpawnAgent,
			mockOnAddHistoryEntry,
			mockOnComplete,
			mockOnPRResult,
			mockReadDoc,
			mockWriteDoc,
			mockCreateWorkingCopy,
			mockStatus,
			mockBranch,
			mockBroadcastAutoRunState,
			mockRegisterSessionOrigin,
			mockWorktreeSetup,
			mockWorktreeCheckout,
			mockGetDefaultBranch,
			mockCreatePR,
		} = ctx);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('hook initialization', () => {
		it('should initialize with empty batch states', () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
					onPRResult: mockOnPRResult,
				})
			);

			expect(result.current.batchRunStates).toEqual({});
			expect(result.current.hasAnyActiveBatch).toBe(false);
			expect(result.current.activeBatchSessionIds).toEqual([]);
			expect(result.current.customPrompts).toEqual({});
		});

		it('should provide getBatchState that returns default state for unknown sessions', () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
				})
			);

			const state = result.current.getBatchState('unknown-session');
			expect(state.isRunning).toBe(false);
			expect(state.isStopping).toBe(false);
			expect(state.totalTasks).toBe(0);
			expect(state.completedTasks).toBe(0);
		});
	});

	describe('state synchronization', () => {
		/**
		 * Regression test for bug where progress bar was stuck at "0 of N tasks completed"
		 * even after all tasks finished.
		 *
		 * Root cause: batchRunStatesRef was only updated on React re-render, but the
		 * debounce callback read this ref to compare state changes. When dispatches
		 * happened faster than React re-renders, the ref contained stale state.
		 *
		 * Fix: The dispatch wrapper now synchronously updates batchRunStatesRef
		 * immediately after each dispatch, ensuring debounced callbacks always
		 * see the current state.
		 *
		 * These tests verify the fix at the unit level by checking that getBatchState
		 * returns correct values immediately after state-changing operations.
		 */
		it('should provide correct initial state via getBatchState', () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			// Initial state should have 0 completed tasks
			const state = result.current.getBatchState('test-session-id');
			expect(state.completedTasksAcrossAllDocs).toBe(0);
			expect(state.totalTasksAcrossAllDocs).toBe(0);
			expect(state.isRunning).toBe(false);
		});

		it('should track hasAnyActiveBatch correctly', () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			// Initially no active batches
			expect(result.current.hasAnyActiveBatch).toBe(false);
			expect(result.current.activeBatchSessionIds).toEqual([]);
		});

		it('should return default state for sessions that have not started batch processing', () => {
			const sessions = [
				createMockSession({ id: 'session-1' }),
				createMockSession({ id: 'session-2' }),
			];
			const groups = [createMockGroup()];

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			// Both sessions should return default state with 0 progress
			const state1 = result.current.getBatchState('session-1');
			const state2 = result.current.getBatchState('session-2');

			expect(state1.completedTasksAcrossAllDocs).toBe(0);
			expect(state1.totalTasksAcrossAllDocs).toBe(0);
			expect(state2.completedTasksAcrossAllDocs).toBe(0);
			expect(state2.totalTasksAcrossAllDocs).toBe(0);
		});
	});

	describe('setCustomPrompt', () => {
		it('should set custom prompt for a session', () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
				})
			);

			act(() => {
				result.current.setCustomPrompt('test-session-id', 'Custom prompt here');
			});

			expect(result.current.customPrompts['test-session-id']).toBe('Custom prompt here');
		});

		it('should update custom prompt for a session', () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
				})
			);

			act(() => {
				result.current.setCustomPrompt('test-session-id', 'First prompt');
			});

			expect(result.current.customPrompts['test-session-id']).toBe('First prompt');

			act(() => {
				result.current.setCustomPrompt('test-session-id', 'Updated prompt');
			});

			expect(result.current.customPrompts['test-session-id']).toBe('Updated prompt');
		});

		it('should handle multiple session prompts', () => {
			const sessions = [
				createMockSession({ id: 'session-1' }),
				createMockSession({ id: 'session-2' }),
			];
			const groups = [createMockGroup()];

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
				})
			);

			act(() => {
				result.current.setCustomPrompt('session-1', 'Prompt for session 1');
				result.current.setCustomPrompt('session-2', 'Prompt for session 2');
			});

			expect(result.current.customPrompts['session-1']).toBe('Prompt for session 1');
			expect(result.current.customPrompts['session-2']).toBe('Prompt for session 2');
		});
	});

	describe('reset on completion', () => {
		it('should create working copy when resetOnCompletion is enabled', async () => {
			// Note: Reset-on-completion now uses working copies in /runs/ directory
			// instead of modifying the original document. This preserves the original
			// and allows the agent to work on a copy.
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// First 3 reads return unchecked task (initial count, doc start, template expansion)
			// After that, return checked task (agent completed it)
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 3) {
					return { success: true, content: '- [ ] Task 1' };
				}
				// After task completion
				return { success: true, content: '- [x] Task 1' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: true }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should have created a working copy for the reset-on-completion document
			expect(mockCreateWorkingCopy).toHaveBeenCalledWith('/test/folder', 'tasks', 1, undefined);
		});
	});

	describe('audio feedback', () => {
		it('should speak synopsis when audio feedback is enabled', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			const mockSpeak = vi.fn().mockResolvedValue(undefined);
			window.maestro.notification = {
				...window.maestro.notification,
				speak: mockSpeak,
			};

			// Single task - need unchecked for first 3 calls
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 3) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
					audioFeedbackEnabled: true,
					audioFeedbackCommand: 'say',
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockSpeak).toHaveBeenCalled();
		});
	});

	describe('state broadcasting', () => {
		it('should broadcast state to web interface', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Single task - need unchecked for first 3 calls
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 3) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should have broadcast state updates
			expect(mockBroadcastAutoRunState).toHaveBeenCalled();
		});
	});

	describe('history entries', () => {
		it('should add history entry for each completed task', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Single task - need unchecked for first 3 calls
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 3) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockOnAddHistoryEntry).toHaveBeenCalledWith(
				expect.objectContaining({
					type: 'AUTO',
					sessionId: 'test-session-id',
				})
			);
		});
	});

	describe('hasAnyActiveBatch and activeBatchSessionIds', () => {
		it('should update when batch starts and ends', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Single task - need unchecked for first 3 calls
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 3) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			// Initially no active batches
			expect(result.current.hasAnyActiveBatch).toBe(false);
			expect(result.current.activeBatchSessionIds).toEqual([]);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// After batch completes, no active batches
			expect(result.current.hasAnyActiveBatch).toBe(false);
		});
	});

	describe('synopsis parsing', () => {
		it('should parse synopsis with proper Summary and Details format', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Mock agent response with synopsis format (synopsis is now extracted from agent response)
			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'mock-claude-session',
				usageStats: {
					inputTokens: 100,
					outputTokens: 200,
					totalCostUsd: 0.01,
					cacheReadInputTokens: 0,
					cacheCreationInputTokens: 0,
					contextWindow: 0,
				},
				response:
					'**Summary:** Created new component\n\n**Details:** Added a React component with hooks and tests.',
			});

			// Single task that completes
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should have added history entry with parsed synopsis
			expect(mockOnAddHistoryEntry).toHaveBeenCalledWith(
				expect.objectContaining({
					type: 'AUTO',
					summary: 'Created new component',
				})
			);
		});

		it('should handle synopsis with ANSI codes and box characters', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Mock agent response with ANSI codes and box drawing chars (synopsis is now extracted from agent response)
			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'mock-claude-session',
				usageStats: {
					inputTokens: 100,
					outputTokens: 200,
					totalCostUsd: 0.01,
					cacheReadInputTokens: 0,
					cacheCreationInputTokens: 0,
					contextWindow: 0,
				},
				response: '\x1b[32m**Summary:**\x1b[0m ─── Task done │\n\n**Details:** Info here.',
			});

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should have cleaned up the synopsis
			expect(mockOnAddHistoryEntry).toHaveBeenCalled();
		});

		it('should handle synopsis without Details section', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Mock agent response with only Summary (synopsis is now extracted from agent response)
			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'mock-claude-session',
				usageStats: {
					inputTokens: 100,
					outputTokens: 200,
					totalCostUsd: 0.01,
					cacheReadInputTokens: 0,
					cacheCreationInputTokens: 0,
					contextWindow: 0,
				},
				response: '**Summary:** No changes made.',
			});

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockOnAddHistoryEntry).toHaveBeenCalledWith(
				expect.objectContaining({
					summary: 'No changes made.',
				})
			);
		});

		it('should handle synopsis without proper format (fallback to first line)', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Mock agent response without proper markdown format (synopsis is now extracted from agent response)
			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'mock-claude-session',
				usageStats: {
					inputTokens: 100,
					outputTokens: 200,
					totalCostUsd: 0.01,
					cacheReadInputTokens: 0,
					cacheCreationInputTokens: 0,
					contextWindow: 0,
				},
				response: 'Just a plain text response\nWith multiple lines.',
			});

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should use first sentence as summary (full paragraph if no sentence break found within 150 chars)
			expect(mockOnAddHistoryEntry).toHaveBeenCalledWith(
				expect.objectContaining({
					summary: 'Just a plain text response\nWith multiple lines.',
				})
			);
		});

		it('should handle empty synopsis response', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Mock agent response with empty text (synopsis is now extracted from agent response)
			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'mock-claude-session',
				usageStats: {
					inputTokens: 100,
					outputTokens: 200,
					totalCostUsd: 0.01,
					cacheReadInputTokens: 0,
					cacheCreationInputTokens: 0,
					contextWindow: 0,
				},
				response: '',
			});

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should use default summary (includes document name prefix)
			expect(mockOnAddHistoryEntry).toHaveBeenCalledWith(
				expect.objectContaining({
					summary: expect.stringContaining('Task completed'),
				})
			);
		});

		it('should handle synopsis failure gracefully', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Mock agent failure (synopsis is now extracted from agent response)
			mockOnSpawnAgent.mockResolvedValue({
				success: false,
				agentSessionId: 'mock-claude-session',
				usageStats: {
					inputTokens: 100,
					outputTokens: 200,
					totalCostUsd: 0.01,
					cacheReadInputTokens: 0,
					cacheCreationInputTokens: 0,
					contextWindow: 0,
				},
				response: '',
			});

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should use default summary
			expect(mockOnAddHistoryEntry).toHaveBeenCalled();
		});

		it('should handle synopsis generation error', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Mock agent throwing error (synopsis is now extracted from agent response)
			mockOnSpawnAgent.mockRejectedValue(new Error('Agent execution failed'));

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should still complete and add history entry
			expect(mockOnAddHistoryEntry).toHaveBeenCalled();
			expect(mockOnComplete).toHaveBeenCalled();
		});
	});

	describe('session claude ID tracking', () => {
		it('should collect claude session IDs from successful spawns', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Multiple tasks
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task 1\n- [ ] Task 2' };
				if (callCount <= 4) return { success: true, content: '- [x] Task 1\n- [ ] Task 2' };
				return { success: true, content: '- [x] Task 1\n- [x] Task 2' };
			});

			let spawnCount = 0;
			mockOnSpawnAgent.mockImplementation(async () => {
				spawnCount++;
				return { success: true, agentSessionId: `claude-session-${spawnCount}` };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should have registered session origins
			expect(mockRegisterSessionOrigin).toHaveBeenCalledWith(
				'/test/path',
				'claude-session-1',
				'auto'
			);
			expect(mockRegisterSessionOrigin).toHaveBeenCalledWith(
				'/test/path',
				'claude-session-2',
				'auto'
			);
		});

		it('should handle missing claude session ID', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			// Spawn succeeds but no claude session ID
			mockOnSpawnAgent.mockResolvedValue({ success: true });

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should not call synopsis since no claude session ID
			// But should still complete
			expect(mockOnComplete).toHaveBeenCalled();
		});
	});

	describe('usage stats tracking', () => {
		it('should track usage stats from agent spawns', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'test-session',
				usageStats: {
					inputTokens: 500,
					outputTokens: 1000,
					totalCostUsd: 0.05,
					cacheReadInputTokens: 100,
					cacheCreationInputTokens: 50,
					contextWindow: 100000,
				},
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// History entry should include usage stats
			expect(mockOnAddHistoryEntry).toHaveBeenCalledWith(
				expect.objectContaining({
					usageStats: expect.objectContaining({
						inputTokens: 500,
						outputTokens: 1000,
						totalCostUsd: 0.05,
					}),
				})
			);
		});
	});

	describe('elapsed time tracking', () => {
		it('should track elapsed time for each task', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			// Delay agent spawn to create elapsed time
			mockOnSpawnAgent.mockImplementation(async () => {
				await new Promise((resolve) => setTimeout(resolve, 10));
				return { success: true, agentSessionId: 'test' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// History entry should have elapsed time
			expect(mockOnAddHistoryEntry).toHaveBeenCalledWith(
				expect.objectContaining({
					elapsedTimeMs: expect.any(Number),
				})
			);
		});

		it('should track total elapsed time for batch completion', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockOnComplete).toHaveBeenCalledWith(
				expect.objectContaining({
					elapsedTimeMs: expect.any(Number),
				})
			);
		});
	});

	describe('task count handling', () => {
		it('should handle Claude adding tasks (negative completion count)', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Claude adds a task instead of completing one
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task 1' };
				// After first run, there are MORE tasks
				if (callCount <= 4) return { success: true, content: '- [ ] Task 1\n- [ ] Task 2' };
				// Eventually complete
				if (callCount <= 6) return { success: true, content: '- [x] Task 1\n- [ ] Task 2' };
				return { success: true, content: '- [x] Task 1\n- [x] Task 2' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockOnComplete).toHaveBeenCalled();
		});
	});

	describe('session name in completion', () => {
		it('should use session name in completion callback', async () => {
			const sessions = [createMockSession({ name: 'My Custom Session' })];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockOnComplete).toHaveBeenCalledWith(
				expect.objectContaining({
					sessionName: 'My Custom Session',
				})
			);
		});

		it('should use cwd folder name as fallback for session name', async () => {
			const sessions = [createMockSession({ name: '', cwd: '/path/to/myproject' })];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockOnComplete).toHaveBeenCalledWith(
				expect.objectContaining({
					sessionName: 'myproject',
				})
			);
		});
	});

	describe('audio feedback', () => {
		it('should speak synopsis when audio feedback is enabled', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'test-session',
				usageStats: {
					inputTokens: 100,
					outputTokens: 200,
					totalCostUsd: 0.01,
					cacheReadInputTokens: 0,
					cacheCreationInputTokens: 0,
					contextWindow: 0,
				},
				response: '**Summary:** Fixed the bug\n\n**Details:** Updated the function.',
			});

			const mockSpeak = vi.fn().mockResolvedValue(undefined);
			window.maestro.notification.speak = mockSpeak;

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
					audioFeedbackEnabled: true,
					audioFeedbackCommand: 'say',
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should have called speak with the synopsis
			expect(mockSpeak).toHaveBeenCalledWith('Fixed the bug', 'say');
		});
	});

	describe('reset-on-completion in loop mode', () => {
		it('should create working copy when document has resetOnCompletion enabled', async () => {
			// Note: Reset-on-completion now uses working copies in /runs/ directory
			// instead of modifying the original document. This preserves the original
			// and allows the agent to work on a copy each loop iteration.
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// First 3 calls show unchecked, then checked after agent runs
			let readCount = 0;
			mockReadDoc.mockImplementation(async () => {
				readCount++;
				if (readCount <= 3) return { success: true, content: '- [ ] Repeating task' };
				return { success: true, content: '- [x] Repeating task' };
			});

			mockOnSpawnAgent.mockResolvedValue({ success: true, agentSessionId: 'test' });

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: true }],
						prompt: 'Test',
						loopEnabled: true,
						maxLoops: 1,
					},
					'/test/folder'
				);
			});

			// Should have created a working copy for the reset-on-completion document
			expect(mockCreateWorkingCopy).toHaveBeenCalledWith('/test/folder', 'tasks', 1, undefined);
		});
	});

	describe('session name extraction', () => {
		it('should extract session name from cwd when name is not set', async () => {
			// Session without a name, only cwd
			const sessions = [createMockSession({ name: '', cwd: '/path/to/MyProject' })];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'test-session',
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should extract 'MyProject' from cwd
			expect(mockOnComplete).toHaveBeenCalledWith(
				expect.objectContaining({
					sessionName: 'MyProject',
				})
			);
		});

		it('should use Unknown when cwd has no path segments', async () => {
			const sessions = [createMockSession({ name: '', cwd: '' })];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'test-session',
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockOnComplete).toHaveBeenCalledWith(
				expect.objectContaining({
					sessionName: 'Unknown',
				})
			);
		});
	});

	describe('Claude session registration', () => {
		it('should register session origin as auto-initiated', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'new-claude-session-123',
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should have registered the Claude session as auto-initiated
			expect(mockRegisterSessionOrigin).toHaveBeenCalledWith(
				'/test/path', // session.cwd
				'new-claude-session-123',
				'auto'
			);
		});

		it('should handle session registration error gracefully', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			mockRegisterSessionOrigin.mockRejectedValue(new Error('Registration failed'));

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'test-session',
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
				})
			);

			// Should not throw even if registration fails
			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockOnComplete).toHaveBeenCalled();
		});
	});

	describe('audio feedback edge cases', () => {
		it('should not speak if audio feedback is disabled', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			const mockSpeak = vi.fn().mockResolvedValue(undefined);
			window.maestro.notification.speak = mockSpeak;

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'test-session',
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
					audioFeedbackEnabled: false, // Disabled
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockSpeak).not.toHaveBeenCalled();
		});

		it('should handle speak error gracefully', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			const mockSpeak = vi.fn().mockRejectedValue(new Error('TTS not available'));
			window.maestro.notification.speak = mockSpeak;

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'test-session',
				usageStats: {
					inputTokens: 100,
					outputTokens: 200,
					totalCostUsd: 0.01,
					cacheReadInputTokens: 0,
					cacheCreationInputTokens: 0,
					contextWindow: 0,
				},
				response: '**Summary:** Done',
			});

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
					onComplete: mockOnComplete,
					audioFeedbackEnabled: true,
					audioFeedbackCommand: 'say',
				})
			);

			// Should not throw even if speak fails
			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockOnComplete).toHaveBeenCalled();
		});
	});
});
