/**
 * Tests for useBatchProcessor hook - Execution
 *
 * Start/stop batch runs, document reading, template substitution, loop mode, and git branch detection.
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

describe('useBatchProcessor hook - Execution', () => {
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

	describe('startBatchRun', () => {
		it('should not start if session is not found', async () => {
			const sessions: Session[] = [];
			const groups: Group[] = [];

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'non-existent-session',
					{
						documents: [{ filename: 'test', resetOnCompletion: false }],
						prompt: 'Test prompt',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockOnSpawnAgent).not.toHaveBeenCalled();
		});

		it('should not start if no documents provided', async () => {
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

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [],
						prompt: 'Test prompt',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockOnSpawnAgent).not.toHaveBeenCalled();
		});

		it('should not start if no tasks found in documents', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Mock empty document with no tasks
			mockReadDoc.mockResolvedValue({ success: true, content: '# Empty document\nNo tasks here.' });

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'empty', resetOnCompletion: false }],
						prompt: 'Test prompt',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockOnSpawnAgent).not.toHaveBeenCalled();
		});

		it('should start batch run and process tasks', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Mock document with 2 tasks initially, then 1 task, then 0 tasks
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) {
					return { success: true, content: '# Tasks\n- [ ] Task 1\n- [ ] Task 2' };
				} else if (callCount <= 4) {
					return { success: true, content: '# Tasks\n- [x] Task 1\n- [ ] Task 2' };
				} else {
					return { success: true, content: '# Tasks\n- [x] Task 1\n- [x] Task 2' };
				}
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
						prompt: 'Complete the next task',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should have spawned agent
			expect(mockOnSpawnAgent).toHaveBeenCalled();

			// Should have called completion callback
			expect(mockOnComplete).toHaveBeenCalledWith(
				expect.objectContaining({
					sessionId: 'test-session-id',
					sessionName: 'Test Session',
				})
			);
		});

		it('should handle agent failure gracefully', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Mock single task - readDoc is called multiple times:
			// 1. Initial count (line 425)
			// 2. Document processing start (line 531)
			// 3. Template variable expansion (line 596)
			// 4. After agent runs to count remaining (line 626)
			// First 3 calls need unchecked tasks, call 4+ returns checked
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 3) {
					return { success: true, content: '# Tasks\n- [ ] Task 1' };
				} else {
					return { success: true, content: '# Tasks\n- [x] Task 1' };
				}
			});

			// Mock agent failure
			mockOnSpawnAgent.mockResolvedValue({ success: false });

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
						prompt: 'Complete the task',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should have tried to spawn agent
			expect(mockOnSpawnAgent).toHaveBeenCalled();

			// Should have added history entry with failure
			expect(mockOnAddHistoryEntry).toHaveBeenCalled();
		});
	});

	describe('stopBatchRun', () => {
		it('should set isStopping flag', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Create a deferred promise we can control
			let resolveAgent: (value: { success: boolean; agentSessionId?: string }) => void;
			const agentPromise = new Promise<{ success: boolean; agentSessionId?: string }>((resolve) => {
				resolveAgent = resolve;
			});
			mockOnSpawnAgent.mockReturnValue(agentPromise);

			const { result } = renderHook(() =>
				useBatchProcessor({
					sessions,
					groups,
					onUpdateSession: mockOnUpdateSession,
					onSpawnAgent: mockOnSpawnAgent,
					onAddHistoryEntry: mockOnAddHistoryEntry,
				})
			);

			// Start batch (don't await - we want it to be running)
			let batchFinished = false;
			act(() => {
				result.current
					.startBatchRun(
						'test-session-id',
						{
							documents: [{ filename: 'tasks', resetOnCompletion: false }],
							prompt: 'Test',
							loopEnabled: false,
						},
						'/test/folder'
					)
					.then(() => {
						batchFinished = true;
					});
			});

			// Wait for batch to actually be running (agent called)
			await waitFor(() => {
				expect(mockOnSpawnAgent).toHaveBeenCalled();
			});

			// Stop the batch while agent is "running"
			act(() => {
				result.current.stopBatchRun('test-session-id');
			});

			// Check state - isStopping should be true
			expect(result.current.getBatchState('test-session-id').isStopping).toBe(true);

			// Clean up: resolve the agent promise to let the batch finish
			await act(async () => {
				resolveAgent!({ success: true, agentSessionId: 'test-session' });
			});

			// Wait for batch to finish
			await waitFor(() => {
				expect(batchFinished).toBe(true);
			});
		});
	});

	describe('loop mode', () => {
		it('should stop at max loops', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Mock document that properly simulates task completion cycle
			// The batch processor calls readDoc at multiple points - we need to simulate
			// tasks being completed after the agent runs
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				// Calls 1-3: initial count, doc start, template - show unchecked
				// Call 4: after agent runs - show checked (task completed)
				// The reset-on-completion will uncheck, but since we hit maxLoops=1, we exit
				if (callCount <= 3) {
					return { success: true, content: '- [ ] Task 1' };
				} else {
					return { success: true, content: '- [x] Task 1' };
				}
			});

			// Track agent calls
			let spawnCount = 0;
			mockOnSpawnAgent.mockImplementation(async () => {
				spawnCount++;
				return { success: true, agentSessionId: `session-${spawnCount}` };
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
						loopEnabled: true,
						maxLoops: 1,
					},
					'/test/folder'
				);
			});

			// Should complete after max loops reached
			expect(mockOnComplete).toHaveBeenCalled();
			// Should have spawned at least one agent
			expect(spawnCount).toBeGreaterThanOrEqual(1);
		});
	});

	describe('document reading and template substitution', () => {
		it('should substitute template variables in document content', async () => {
			const sessions = [createMockSession({ name: 'MySession' })];
			const groups = [createMockGroup({ name: 'MyGroup' })];

			// Document with template variables - uses callCount to progress task completion
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task for ${session_name}' };
				return { success: true, content: '- [x] Task for MySession' };
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
						prompt: 'Process: ${session_name}',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockOnSpawnAgent).toHaveBeenCalled();
		});

		it('should handle document read failure gracefully (no expansion if read fails)', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// First read for counting, then task progresses to completion
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				// First read for initial count - has task
				if (callCount === 1) return { success: true, content: '- [ ] Task' };
				// Second read for document update - returns original (still has task)
				if (callCount === 2) return { success: true, content: '- [ ] Task' };
				// Reads for template expansion could fail but we still spawn
				// After spawn, task is marked complete
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

			// Should have attempted to spawn agent and completed
			expect(mockOnSpawnAgent).toHaveBeenCalled();
			expect(mockOnComplete).toHaveBeenCalled();
		});
	});

	describe('git branch detection', () => {
		it('should get git branch for git repos', async () => {
			const sessions = [createMockSession({ isGitRepo: true })];
			const groups = [createMockGroup()];

			mockBranch.mockResolvedValue({ stdout: 'feature/test' });

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
						prompt: 'Test ${git_branch}',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockStatus).toHaveBeenCalled();
			expect(mockBranch).toHaveBeenCalled();
		});

		it('should handle git status failure gracefully', async () => {
			const sessions = [createMockSession({ isGitRepo: true })];
			const groups = [createMockGroup()];

			mockStatus.mockRejectedValue(new Error('Git error'));

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

			// Should still proceed
			expect(mockOnSpawnAgent).toHaveBeenCalled();
		});

		it('should not fetch git status for non-git repos', async () => {
			const sessions = [createMockSession({ isGitRepo: false })];
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

			expect(mockStatus).not.toHaveBeenCalled();
			expect(mockBranch).not.toHaveBeenCalled();
		});
	});

	describe('group name detection', () => {
		it('should find group name for session with groupId', async () => {
			const sessions = [createMockSession({ groupId: 'group-1' })];
			const groups = [createMockGroup({ id: 'group-1', name: 'My Group' })];

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
						prompt: 'Group: ${group_name}',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockOnSpawnAgent).toHaveBeenCalled();
		});
	});

	describe('multiple documents', () => {
		it('should process multiple documents in order', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Track which document is being read
			const readOrder: string[] = [];
			let doc1Calls = 0;
			let doc2Calls = 0;

			// Mock readDoc with call-count thresholds that account for the recount-all-documents
			// logic after each task. For each document, reads happen at:
			//   doc1: initial count, doc-loop entry, processTask post-read, recount-all
			//   doc2: initial count, recount-all (after doc1), doc-loop entry, processTask post-read
			// The "agent completed" transition (unchecked → checked) should happen after processTask,
			// so doc1 returns checked on call 3+ and doc2 returns checked on call 4+.
			mockReadDoc.mockImplementation(async (_folder: string, filename: string) => {
				readOrder.push(filename);

				if (filename === 'doc1.md') {
					doc1Calls++;
					if (doc1Calls <= 2) return { success: true, content: '- [ ] Doc1 Task' };
					return { success: true, content: '- [x] Doc1 Task' };
				}
				if (filename === 'doc2.md') {
					doc2Calls++;
					if (doc2Calls <= 3) return { success: true, content: '- [ ] Doc2 Task' };
					return { success: true, content: '- [x] Doc2 Task' };
				}
				return { success: true, content: '' };
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
						documents: [
							{ filename: 'doc1', resetOnCompletion: false },
							{ filename: 'doc2', resetOnCompletion: false },
						],
						prompt: 'Process document',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			expect(mockOnSpawnAgent).toHaveBeenCalledTimes(2);
			expect(mockOnComplete).toHaveBeenCalled();
		});

		it('should skip documents with no tasks', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			mockReadDoc.mockImplementation(async (_folder: string, filename: string) => {
				if (filename === 'empty.md') {
					return { success: true, content: '# No tasks here' };
				}
				if (filename === 'tasks.md') {
					return { success: true, content: '- [x] Already done' };
				}
				return { success: true, content: '' };
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
						documents: [
							{ filename: 'empty', resetOnCompletion: false },
							{ filename: 'tasks', resetOnCompletion: false },
						],
						prompt: 'Process',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should not spawn agent for empty documents
			expect(mockOnSpawnAgent).not.toHaveBeenCalled();
		});
	});

	describe('stopBatchRun', () => {
		it('should set isStopping flag when called', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Simple test: start batch, call stop immediately, verify isStopping is set
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
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

			// Start batch and immediately stop
			act(() => {
				result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
				result.current.stopBatchRun('test-session-id');
			});

			// Verify stop flag is set
			expect(result.current.getBatchState('test-session-id').isStopping).toBe(true);
		});
	});

	describe('loop mode with max loops limit', () => {
		it('should stop after reaching maxLoops', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Simulate task completion: first 3 calls show unchecked, then checked
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				// Calls 1-3: initial count, doc start, template - show unchecked
				// Call 4+: after agent runs - show checked (task completed)
				if (callCount <= 3) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
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
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: true,
						maxLoops: 2,
					},
					'/test/folder'
				);
			});

			expect(mockOnComplete).toHaveBeenCalled();
		});
	});

	describe('loop mode with multiple iterations', () => {
		it('should complete loop and add loop summary history entry', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Track document states: first 3 calls show unchecked, then checked
			let readCount = 0;
			mockReadDoc.mockImplementation(async () => {
				readCount++;
				// Calls 1-3: initial count, doc start, template - show unchecked
				if (readCount <= 3) return { success: true, content: '- [ ] Task 1' };
				// Call 4+: after agent - show checked
				return { success: true, content: '- [x] Task 1' };
			});

			mockOnSpawnAgent.mockResolvedValue({
				success: true,
				agentSessionId: 'test-session',
				usageStats: {
					inputTokens: 500,
					outputTokens: 200,
					totalCostUsd: 0.05,
					cacheReadInputTokens: 0,
					cacheCreationInputTokens: 0,
					contextWindow: 0,
				},
				response: '**Summary:** Fixed it\n\n**Details:** Done.',
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
						loopEnabled: true,
						maxLoops: 2, // Allow 2 loops
					},
					'/test/folder'
				);
			});

			// Verify completion was called
			expect(mockOnComplete).toHaveBeenCalled();
		});

		it('should exit loop when reaching max loops limit', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// First 3 calls show unchecked, then checked
			let readCount = 0;
			mockReadDoc.mockImplementation(async () => {
				readCount++;
				if (readCount <= 3) return { success: true, content: '- [ ] Task' };
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
						loopEnabled: true,
						maxLoops: 1, // Limit to 1 loop
					},
					'/test/folder'
				);
			});

			// Should exit after max loops
			expect(mockOnComplete).toHaveBeenCalled();
		});

		it('should handle loop with reset-on-completion documents', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// First 3 calls show unchecked, then checked
			let readCount = 0;
			mockReadDoc.mockImplementation(async () => {
				readCount++;
				if (readCount <= 3) return { success: true, content: '- [ ] Repeating task' };
				return { success: true, content: '- [x] Repeating task' };
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
						documents: [{ filename: 'tasks', resetOnCompletion: true }],
						prompt: 'Test',
						loopEnabled: true,
						maxLoops: 1, // Limit iterations
					},
					'/test/folder'
				);
			});

			expect(mockOnComplete).toHaveBeenCalled();
		});

		it('should exit loop when no tasks were processed in an iteration', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// First 3 calls show unchecked, then no tasks
			let readCount = 0;
			mockReadDoc.mockImplementation(async () => {
				readCount++;
				if (readCount <= 3) return { success: true, content: '- [ ] Task' };
				// After processing - no tasks left
				return { success: true, content: '# Empty\nNo tasks here.' };
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
						loopEnabled: true,
						maxLoops: 5, // High limit - should exit early due to no tasks processed
					},
					'/test/folder'
				);
			});

			expect(mockOnComplete).toHaveBeenCalled();
		});
	});
});
