/**
 * Tests for useBatchProcessor hook - Error Handling
 *
 * Task errors, error pause/resume, skip-document, abort cleanup, and rapid error cycles.
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

describe('useBatchProcessor hook - Error Handling', () => {
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

	describe('task error handling', () => {
		it('should continue to next task on agent spawn error', async () => {
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

			// First spawn fails, second succeeds
			let spawnCount = 0;
			mockOnSpawnAgent.mockImplementation(async () => {
				spawnCount++;
				if (spawnCount === 1) throw new Error('Spawn failed');
				return { success: true, agentSessionId: 'session-2' };
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

			// Should have attempted both tasks
			expect(mockOnSpawnAgent).toHaveBeenCalledTimes(2);
			expect(mockOnComplete).toHaveBeenCalled();
		});
	});

	describe('error pause handling', () => {
		it('should pause processing until resumeAfterError is called', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			const contentInitial = '- [ ] Task 1\n- [ ] Task 2';
			const contentAfterFirst = '- [x] Task 1\n- [ ] Task 2';
			const contentAfterSecond = '- [x] Task 1\n- [x] Task 2';
			const docStates = [
				contentInitial,
				contentInitial,
				contentInitial,
				contentAfterFirst,
				contentAfterFirst,
				contentAfterSecond,
			];

			mockReadDoc.mockImplementation(async () => ({
				success: true,
				content: docStates.shift() ?? contentAfterSecond,
			}));

			let pauseHandler:
				| ((
						sessionId: string,
						error: AgentError,
						documentIndex: number,
						taskDescription?: string
				  ) => void)
				| null = null;

			mockOnSpawnAgent.mockImplementation(async () => {
				if (pauseHandler) {
					pauseHandler(
						'test-session-id',
						{
							type: 'auth',
							message: 'Auth error',
							recoverable: true,
							timestamp: Date.now(),
						},
						0,
						'Task 1'
					);
					pauseHandler = null;
				}
				return { success: true, agentSessionId: 'session-1' };
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

			pauseHandler = result.current.pauseBatchOnError;

			let startPromise: Promise<void>;
			act(() => {
				startPromise = result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			await waitFor(() => expect(mockOnSpawnAgent).toHaveBeenCalledTimes(1));
			await waitFor(() =>
				expect(result.current.getBatchState('test-session-id').errorPaused).toBe(true)
			);
			expect(mockOnSpawnAgent).toHaveBeenCalledTimes(1);

			act(() => {
				result.current.resumeAfterError('test-session-id');
			});

			await startPromise;
			expect(mockOnSpawnAgent).toHaveBeenCalledTimes(2);
		});
	});

	describe('error pause handling when processTask throws', () => {
		it('should await error resolution when processTask throws on last task and abort stops batch', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Single task document — processTask will throw on this task
			mockReadDoc.mockImplementation(async () => ({
				success: true,
				content: '- [ ] Task 1',
			}));

			let pauseHandler:
				| ((
						sessionId: string,
						error: AgentError,
						documentIndex: number,
						taskDescription?: string
				  ) => void)
				| null = null;

			// processTask calls pauseBatchOnError then throws (simulates agent error + processTask failure)
			mockOnSpawnAgent.mockImplementation(async () => {
				if (pauseHandler) {
					pauseHandler(
						'test-session-id',
						{
							type: 'token_exhaustion',
							message: 'Prompt is too long',
							recoverable: true,
							timestamp: Date.now(),
						},
						0,
						'Task 1'
					);
					pauseHandler = null;
				}
				throw new Error('Agent exited with error');
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

			pauseHandler = result.current.pauseBatchOnError;

			let startPromise: Promise<void>;
			act(() => {
				startPromise = result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Wait for error pause state
			await waitFor(() =>
				expect(result.current.getBatchState('test-session-id').errorPaused).toBe(true)
			);

			// Abort the batch
			act(() => {
				result.current.abortBatchOnError('test-session-id');
			});

			await startPromise;

			// Batch should have completed (stopped via abort)
			expect(result.current.getBatchState('test-session-id').isRunning).toBe(false);
			// Only one spawn attempt — didn't retry after abort
			expect(mockOnSpawnAgent).toHaveBeenCalledTimes(1);
		});

		it('should await error resolution when processTask throws on last task and resume re-reads document', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			let readCount = 0;
			mockReadDoc.mockImplementation(async () => {
				readCount++;
				// First reads: single unchecked task
				if (readCount <= 2) return { success: true, content: '- [ ] Task 1' };
				// After resume, task is already checked (e.g., was partially completed)
				return { success: true, content: '- [x] Task 1' };
			});

			let pauseHandler:
				| ((
						sessionId: string,
						error: AgentError,
						documentIndex: number,
						taskDescription?: string
				  ) => void)
				| null = null;

			let spawnCount = 0;
			mockOnSpawnAgent.mockImplementation(async () => {
				spawnCount++;
				if (spawnCount === 1 && pauseHandler) {
					pauseHandler(
						'test-session-id',
						{
							type: 'token_exhaustion',
							message: 'Prompt is too long',
							recoverable: true,
							timestamp: Date.now(),
						},
						0,
						'Task 1'
					);
					pauseHandler = null;
					throw new Error('Agent exited with error');
				}
				return { success: true, agentSessionId: 'session-1' };
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

			pauseHandler = result.current.pauseBatchOnError;

			let startPromise: Promise<void>;
			act(() => {
				startPromise = result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Wait for error pause state
			await waitFor(() =>
				expect(result.current.getBatchState('test-session-id').errorPaused).toBe(true)
			);

			// Resume after error
			act(() => {
				result.current.resumeAfterError('test-session-id');
			});

			await startPromise;

			// Error should be cleared
			expect(result.current.getBatchState('test-session-id').errorPaused).toBe(false);
			// Batch should complete
			expect(result.current.getBatchState('test-session-id').isRunning).toBe(false);
		});
	});

	describe('skip-document across multi-doc boundary', () => {
		it('should skip errored document and continue processing next document', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Two documents: doc1 has 1 task, doc2 has 1 task
			// Use filename-based logic: doc1 always has unchecked task (it errors before completing),
			// doc2 starts unchecked and becomes checked after the agent processes it.
			let doc2Completed = false;
			mockReadDoc.mockImplementation(async (_folder: string, filename: string) => {
				if (filename.includes('doc1')) {
					return { success: true, content: '- [ ] Task A' };
				}
				// doc2 — unchecked until agent succeeds, then checked
				if (doc2Completed) return { success: true, content: '- [x] Task B' };
				return { success: true, content: '- [ ] Task B' };
			});

			let pauseHandler:
				| ((
						sessionId: string,
						error: AgentError,
						documentIndex: number,
						taskDescription?: string
				  ) => void)
				| null = null;

			let spawnCount = 0;
			mockOnSpawnAgent.mockImplementation(async () => {
				spawnCount++;
				if (spawnCount === 1 && pauseHandler) {
					// First spawn (doc1) — triggers error pause and throws
					pauseHandler(
						'test-session-id',
						{
							type: 'token_exhaustion',
							message: 'Context limit',
							recoverable: true,
							timestamp: Date.now(),
						},
						0,
						'Task A'
					);
					pauseHandler = null;
					throw new Error('Agent exited with error');
				}
				// Second spawn (doc2) — succeeds, mark doc2 as completed
				// so the post-task re-read in processTask sees checked content
				doc2Completed = true;
				return { success: true, agentSessionId: 'session-2' };
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

			pauseHandler = result.current.pauseBatchOnError;

			let startPromise: Promise<void>;
			act(() => {
				startPromise = result.current.startBatchRun(
					'test-session-id',
					{
						documents: [
							{ filename: 'doc1', resetOnCompletion: false },
							{ filename: 'doc2', resetOnCompletion: false },
						],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Wait for error pause on doc1
			await waitFor(() =>
				expect(result.current.getBatchState('test-session-id').errorPaused).toBe(true)
			);

			// Skip the errored document
			act(() => {
				result.current.skipCurrentDocument('test-session-id');
			});

			await startPromise;

			// Batch should have completed
			expect(result.current.getBatchState('test-session-id').isRunning).toBe(false);
			// Should have spawned agent for both documents (1 failed + 1 succeeded)
			expect(mockOnSpawnAgent).toHaveBeenCalledTimes(2);
		});
	});

	describe('error state fully cleared after abort', () => {
		it('should have no lingering error fields after abort completes batch', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			mockReadDoc.mockImplementation(async () => ({
				success: true,
				content: '- [ ] Task 1\n- [ ] Task 2',
			}));

			let pauseHandler:
				| ((
						sessionId: string,
						error: AgentError,
						documentIndex: number,
						taskDescription?: string
				  ) => void)
				| null = null;

			mockOnSpawnAgent.mockImplementation(async () => {
				if (pauseHandler) {
					pauseHandler(
						'test-session-id',
						{
							type: 'auth_expired',
							message: 'Auth token expired',
							recoverable: false,
							timestamp: Date.now(),
						},
						0,
						'Task 1'
					);
					pauseHandler = null;
					throw new Error('Agent auth failure');
				}
				return { success: true, agentSessionId: 'session-1' };
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

			pauseHandler = result.current.pauseBatchOnError;

			let startPromise: Promise<void>;
			act(() => {
				startPromise = result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			await waitFor(() =>
				expect(result.current.getBatchState('test-session-id').errorPaused).toBe(true)
			);

			// Abort
			act(() => {
				result.current.abortBatchOnError('test-session-id');
			});

			await startPromise;

			// All error fields must be completely cleared
			const finalState = result.current.getBatchState('test-session-id');
			expect(finalState.isRunning).toBe(false);
			expect(finalState.errorPaused).toBe(false);
			expect(finalState.error).toBeUndefined();
			expect(finalState.errorDocumentIndex).toBeUndefined();
			expect(finalState.errorTaskDescription).toBeUndefined();
		});
	});

	describe('rapid error→resume→error cycle', () => {
		it('should handle sequential error-resume-error without corrupting refs', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Document has 3 tasks
			let readCount = 0;
			mockReadDoc.mockImplementation(async () => {
				readCount++;
				// Initial reads: 3 tasks unchecked
				if (readCount <= 2)
					return { success: true, content: '- [ ] Task 1\n- [ ] Task 2\n- [ ] Task 3' };
				// After first resume: 1 done, 2 remaining
				if (readCount <= 4)
					return { success: true, content: '- [x] Task 1\n- [ ] Task 2\n- [ ] Task 3' };
				// After second resume: 2 done, 1 remaining
				if (readCount <= 6)
					return { success: true, content: '- [x] Task 1\n- [x] Task 2\n- [ ] Task 3' };
				// Final: all done
				return { success: true, content: '- [x] Task 1\n- [x] Task 2\n- [x] Task 3' };
			});

			let pauseHandler:
				| ((
						sessionId: string,
						error: AgentError,
						documentIndex: number,
						taskDescription?: string
				  ) => void)
				| null = null;

			let spawnCount = 0;
			mockOnSpawnAgent.mockImplementation(async () => {
				spawnCount++;
				// First spawn: error + throw
				if (spawnCount === 1 && pauseHandler) {
					pauseHandler(
						'test-session-id',
						{
							type: 'rate_limited',
							message: 'Rate limit hit',
							recoverable: true,
							timestamp: Date.now(),
						},
						0,
						'Task 1'
					);
					throw new Error('Rate limited');
				}
				// Second spawn: error again + throw
				if (spawnCount === 2 && pauseHandler) {
					pauseHandler(
						'test-session-id',
						{
							type: 'rate_limited',
							message: 'Rate limit hit again',
							recoverable: true,
							timestamp: Date.now(),
						},
						0,
						'Task 2'
					);
					throw new Error('Rate limited again');
				}
				// Third spawn: succeeds
				return { success: true, agentSessionId: 'session-3' };
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

			pauseHandler = result.current.pauseBatchOnError;

			let startPromise: Promise<void>;
			act(() => {
				startPromise = result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// First error pause
			await waitFor(() =>
				expect(result.current.getBatchState('test-session-id').errorPaused).toBe(true)
			);
			expect(result.current.getBatchState('test-session-id').error?.message).toBe('Rate limit hit');

			// Resume first error
			act(() => {
				result.current.resumeAfterError('test-session-id');
			});

			// Second error pause
			await waitFor(() =>
				expect(result.current.getBatchState('test-session-id').errorPaused).toBe(true)
			);
			expect(result.current.getBatchState('test-session-id').error?.message).toBe(
				'Rate limit hit again'
			);

			// Resume second error
			act(() => {
				result.current.resumeAfterError('test-session-id');
			});

			await startPromise;

			// Batch completed successfully after two error cycles
			const finalState = result.current.getBatchState('test-session-id');
			expect(finalState.isRunning).toBe(false);
			expect(finalState.errorPaused).toBe(false);
			expect(finalState.error).toBeUndefined();
			// All three spawns happened
			expect(mockOnSpawnAgent).toHaveBeenCalledTimes(3);
		});
	});

	describe('document with failed read', () => {
		it('should handle document read returning empty content', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Document read fails (no content)
			mockReadDoc.mockResolvedValue({ success: true, content: '' });

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
						documents: [{ filename: 'empty', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should not spawn agent for empty document
			expect(mockOnSpawnAgent).not.toHaveBeenCalled();
		});

		it('should handle document read failure', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			mockReadDoc.mockResolvedValue({ success: false });

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
						documents: [{ filename: 'missing', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
					},
					'/test/folder'
				);
			});

			// Should not spawn agent for failed read
			expect(mockOnSpawnAgent).not.toHaveBeenCalled();
		});
	});
});
