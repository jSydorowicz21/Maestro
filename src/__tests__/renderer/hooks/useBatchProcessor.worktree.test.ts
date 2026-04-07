/**
 * Tests for useBatchProcessor hook - Worktree & PR
 *
 * Worktree setup, checkout, PR creation, SSH remote session support.
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

describe('useBatchProcessor hook - Worktree & PR', () => {
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

	describe('worktree handling', () => {
		it('should set up worktree when enabled', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Single task - need unchecked for first 3 calls (initial count, doc start, template expansion)
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 3) {
					return { success: true, content: '- [ ] Task' };
				}
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
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature/test',
						},
					},
					'/test/folder'
				);
			});

			expect(mockWorktreeSetup).toHaveBeenCalledWith(
				'/test/path',
				'/test/worktree',
				'feature/test',
				undefined // sshRemoteId (undefined for local sessions)
			);
		});

		it('should handle worktree setup failure', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Mock worktree setup failure
			mockWorktreeSetup.mockResolvedValue({ success: false, error: 'Worktree setup failed' });

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
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature/test',
						},
					},
					'/test/folder'
				);
			});

			// Should not have spawned agent due to worktree failure
			expect(mockOnSpawnAgent).not.toHaveBeenCalled();
		});

		it('should checkout different branch when worktree exists with branch mismatch', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Mock worktree exists with different branch
			mockWorktreeSetup.mockResolvedValue({ success: true, branchMismatch: true });

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
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature/test',
						},
					},
					'/test/folder'
				);
			});

			expect(mockWorktreeCheckout).toHaveBeenCalledWith(
				'/test/worktree',
				'feature/test',
				true,
				undefined // sshRemoteId (undefined for local sessions)
			);
		});
	});

	describe('PR creation', () => {
		it('should create PR when worktree is used and PR creation enabled', async () => {
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
					onPRResult: mockOnPRResult,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature/test',
							createPROnCompletion: true,
						},
					},
					'/test/folder'
				);
			});

			expect(mockCreatePR).toHaveBeenCalled();
			expect(mockOnPRResult).toHaveBeenCalledWith(
				expect.objectContaining({
					success: true,
					prUrl: 'https://github.com/test/test/pull/1',
				})
			);
		});

		it('should handle PR creation failure', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Mock PR creation failure
			mockCreatePR.mockResolvedValue({ success: false, error: 'PR creation failed' });

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
					onPRResult: mockOnPRResult,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature/test',
							createPROnCompletion: true,
						},
					},
					'/test/folder'
				);
			});

			expect(mockOnPRResult).toHaveBeenCalledWith(
				expect.objectContaining({
					success: false,
					error: 'PR creation failed',
				})
			);
		});

		it('should use custom target branch for PR', async () => {
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
					onPRResult: mockOnPRResult,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature/test',
							createPROnCompletion: true,
							prTargetBranch: 'develop',
						},
					},
					'/test/folder'
				);
			});

			expect(mockCreatePR).toHaveBeenCalledWith(
				'/test/worktree',
				'develop',
				expect.any(String),
				expect.any(String),
				undefined
			);
		});
	});

	describe('worktree with cwd override', () => {
		it('should pass worktree path as cwd override to agent', async () => {
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
						documents: [{ filename: 'task', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktree: {
							enabled: true,
							path: '/custom/worktree',
							branchName: 'feature/test',
						},
					},
					'/test/folder'
				);
			});

			// Should have called spawn with cwd override
			expect(mockOnSpawnAgent).toHaveBeenCalledWith('test-session-id', 'Test', '/custom/worktree');
		});
	});

	describe('worktree setup', () => {
		it('should handle worktree setup failure', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			mockReadDoc.mockResolvedValue({ success: true, content: '- [ ] Task' });

			// Mock worktree setup to fail
			const mockWorktreeSetup = vi.fn().mockResolvedValue({
				success: false,
				error: 'Failed to create worktree',
			});
			window.maestro.git.worktreeSetup = mockWorktreeSetup;

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
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature-branch',
							createPROnCompletion: false,
						},
					},
					'/test/folder'
				);
			});

			// Should not have spawned agent due to worktree failure
			expect(mockOnSpawnAgent).not.toHaveBeenCalled();
		});

		it('should handle worktree branch mismatch and checkout', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			// Mock worktree setup with branch mismatch
			const mockWorktreeSetup = vi.fn().mockResolvedValue({
				success: true,
				branchMismatch: true,
			});
			window.maestro.git.worktreeSetup = mockWorktreeSetup;

			const mockWorktreeCheckout = vi.fn().mockResolvedValue({
				success: true,
			});
			window.maestro.git.worktreeCheckout = mockWorktreeCheckout;

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
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature-branch',
							createPROnCompletion: false,
						},
					},
					'/test/folder'
				);
			});

			// Should have called worktree checkout
			expect(mockWorktreeCheckout).toHaveBeenCalledWith(
				'/test/worktree',
				'feature-branch',
				true,
				undefined // sshRemoteId (undefined for local sessions)
			);

			// Should have spawned agent with worktree path
			expect(mockOnSpawnAgent).toHaveBeenCalledWith('test-session-id', 'Test', '/test/worktree');
		});

		it('should handle worktree checkout failure with uncommitted changes', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			mockReadDoc.mockResolvedValue({ success: true, content: '- [ ] Task' });

			// Mock worktree setup with branch mismatch
			const mockWorktreeSetup = vi.fn().mockResolvedValue({
				success: true,
				branchMismatch: true,
			});
			window.maestro.git.worktreeSetup = mockWorktreeSetup;

			// Mock checkout failure due to uncommitted changes
			const mockWorktreeCheckout = vi.fn().mockResolvedValue({
				success: false,
				hasUncommittedChanges: true,
			});
			window.maestro.git.worktreeCheckout = mockWorktreeCheckout;

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
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature-branch',
							createPROnCompletion: false,
						},
					},
					'/test/folder'
				);
			});

			// Should not have spawned agent due to checkout failure
			expect(mockOnSpawnAgent).not.toHaveBeenCalled();
		});
	});

	describe('PR creation on completion', () => {
		it('should create PR when worktree completes with createPROnCompletion enabled', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			// Mock worktree setup
			const mockWorktreeSetup = vi.fn().mockResolvedValue({ success: true });
			window.maestro.git.worktreeSetup = mockWorktreeSetup;

			// Mock PR creation
			const mockCreatePR = vi.fn().mockResolvedValue({
				success: true,
				prUrl: 'https://github.com/test/repo/pull/123',
			});
			window.maestro.git.createPR = mockCreatePR;

			// Mock default branch detection
			const mockGetDefaultBranch = vi.fn().mockResolvedValue({
				success: true,
				branch: 'main',
			});
			window.maestro.git.getDefaultBranch = mockGetDefaultBranch;

			const mockOnPRResult = vi.fn();

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

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature-branch',
							createPROnCompletion: true,
						},
					},
					'/test/folder'
				);
			});

			// Should have created PR
			expect(mockCreatePR).toHaveBeenCalled();
			expect(mockOnPRResult).toHaveBeenCalledWith(
				expect.objectContaining({
					success: true,
					prUrl: 'https://github.com/test/repo/pull/123',
				})
			);
		});

		it('should handle PR creation failure gracefully', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			// Mock worktree setup
			const mockWorktreeSetup = vi.fn().mockResolvedValue({ success: true });
			window.maestro.git.worktreeSetup = mockWorktreeSetup;

			// Mock PR creation failure
			const mockCreatePR = vi.fn().mockResolvedValue({
				success: false,
				error: 'No upstream configured',
			});
			window.maestro.git.createPR = mockCreatePR;

			const mockGetDefaultBranch = vi.fn().mockResolvedValue({
				success: true,
				branch: 'main',
			});
			window.maestro.git.getDefaultBranch = mockGetDefaultBranch;

			const mockOnPRResult = vi.fn();

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

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature-branch',
							createPROnCompletion: true,
						},
					},
					'/test/folder'
				);
			});

			// Should report PR failure but still complete the batch
			expect(mockOnPRResult).toHaveBeenCalledWith(
				expect.objectContaining({
					success: false,
					error: 'No upstream configured',
				})
			);
			expect(mockOnComplete).toHaveBeenCalled();
		});

		it('should use custom PR target branch when specified', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 2) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			// Mock worktree setup
			const mockWorktreeSetup = vi.fn().mockResolvedValue({ success: true });
			window.maestro.git.worktreeSetup = mockWorktreeSetup;

			// Mock PR creation
			const mockCreatePR = vi.fn().mockResolvedValue({
				success: true,
				prUrl: 'https://github.com/test/repo/pull/456',
			});
			window.maestro.git.createPR = mockCreatePR;

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
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature-branch',
							createPROnCompletion: true,
							prTargetBranch: 'develop',
						},
					},
					'/test/folder'
				);
			});

			// Should have used custom target branch
			expect(mockCreatePR).toHaveBeenCalledWith(
				'/test/worktree',
				'develop',
				expect.any(String),
				expect.any(String),
				undefined
			);
		});
	});

	describe('PR creation exception handling', () => {
		it('should handle PR creation throwing an Error', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Mock worktree setup success
			mockWorktreeSetup.mockResolvedValue({ success: true });

			// Mock PR creation throws an Error
			mockCreatePR.mockRejectedValue(new Error('Network timeout'));

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
					onPRResult: mockOnPRResult,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature-branch',
							createPROnCompletion: true,
						},
					},
					'/test/folder'
				);
			});

			// Should have notified of PR failure
			expect(mockOnPRResult).toHaveBeenCalledWith(
				expect.objectContaining({
					success: false,
					error: 'Network timeout',
				})
			);
		});

		it('should handle PR creation throwing a non-Error object', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			mockWorktreeSetup.mockResolvedValue({ success: true });
			mockCreatePR.mockRejectedValue('String error'); // Non-Error rejection

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
					onPRResult: mockOnPRResult,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature-branch',
							createPROnCompletion: true,
						},
					},
					'/test/folder'
				);
			});

			// Should have notified with 'Unknown error' for non-Error objects
			expect(mockOnPRResult).toHaveBeenCalledWith(
				expect.objectContaining({
					success: false,
					error: 'Unknown error',
				})
			);
		});

		it('should handle PR creation exception without onPRResult callback', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			mockWorktreeSetup.mockResolvedValue({ success: true });
			mockCreatePR.mockRejectedValue(new Error('Git error'));

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
					// No onPRResult callback - tests the if (onPRResult) branch
				})
			);

			// Should not throw even without onPRResult callback
			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature-branch',
							createPROnCompletion: true,
						},
					},
					'/test/folder'
				);
			});

			// Should still complete successfully
			expect(mockOnComplete).toHaveBeenCalled();
		});
	});

	describe('worktree checkout handling', () => {
		it('should handle worktree checkout failure due to uncommitted changes', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Worktree exists but on different branch
			mockWorktreeSetup.mockResolvedValue({ success: true, branchMismatch: true });

			// Checkout fails due to uncommitted changes
			mockWorktreeCheckout.mockResolvedValue({
				success: false,
				hasUncommittedChanges: true,
			});

			mockReadDoc.mockResolvedValue({ success: true, content: '- [ ] Task' });

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
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature-branch',
						},
					},
					'/test/folder'
				);
			});

			// Should not have spawned agent due to checkout failure
			expect(mockOnSpawnAgent).not.toHaveBeenCalled();
		});

		it('should handle worktree checkout failure without uncommitted changes', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			mockWorktreeSetup.mockResolvedValue({ success: true, branchMismatch: true });

			// Checkout fails for other reasons
			mockWorktreeCheckout.mockResolvedValue({
				success: false,
				error: 'Branch does not exist',
			});

			mockReadDoc.mockResolvedValue({ success: true, content: '- [ ] Task' });

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
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature-branch',
						},
					},
					'/test/folder'
				);
			});

			// Should not have spawned agent due to checkout failure
			expect(mockOnSpawnAgent).not.toHaveBeenCalled();
		});

		it('should handle worktree setup exception', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			// Worktree setup throws exception
			mockWorktreeSetup.mockRejectedValue(new Error('Git not found'));

			mockReadDoc.mockResolvedValue({ success: true, content: '- [ ] Task' });

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
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature-branch',
						},
					},
					'/test/folder'
				);
			});

			// Should not have spawned agent due to exception
			expect(mockOnSpawnAgent).not.toHaveBeenCalled();
		});
	});

	describe('PR creation with fallback to default branch', () => {
		it('should use default branch when prTargetBranch is not specified', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			mockWorktreeSetup.mockResolvedValue({ success: true });
			mockGetDefaultBranch.mockResolvedValue({ success: true, branch: 'develop' });
			mockCreatePR.mockResolvedValue({ success: true, prUrl: 'https://github.com/test/pr/1' });

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
					onPRResult: mockOnPRResult,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature-branch',
							createPROnCompletion: true,
							// No prTargetBranch - should use default
						},
					},
					'/test/folder'
				);
			});

			// Should have called getDefaultBranch
			expect(mockGetDefaultBranch).toHaveBeenCalled();

			// Should have created PR with detected default branch
			expect(mockCreatePR).toHaveBeenCalledWith(
				expect.any(String),
				'develop', // The detected default branch
				expect.any(String),
				expect.any(String),
				undefined
			);
		});

		it('should fall back to main when getDefaultBranch fails', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			mockWorktreeSetup.mockResolvedValue({ success: true });
			mockGetDefaultBranch.mockResolvedValue({ success: false });
			mockCreatePR.mockResolvedValue({ success: true, prUrl: 'https://github.com/test/pr/1' });

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
					onPRResult: mockOnPRResult,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature-branch',
							createPROnCompletion: true,
						},
					},
					'/test/folder'
				);
			});

			// Should have created PR with fallback to 'main'
			expect(mockCreatePR).toHaveBeenCalledWith(
				expect.any(String),
				'main', // Fallback
				expect.any(String),
				expect.any(String),
				undefined
			);
		});
	});

	describe('ghPath for PR creation', () => {
		it('should pass ghPath to createPR when specified', async () => {
			const sessions = [createMockSession()];
			const groups = [createMockGroup()];

			mockWorktreeSetup.mockResolvedValue({ success: true });
			mockCreatePR.mockResolvedValue({ success: true, prUrl: 'https://github.com/test/pr/1' });

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
					onPRResult: mockOnPRResult,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'test-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktree: {
							enabled: true,
							path: '/test/worktree',
							branchName: 'feature-branch',
							createPROnCompletion: true,
							prTargetBranch: 'main',
							ghPath: '/usr/local/bin/gh', // Custom gh path
						},
					},
					'/test/folder'
				);
			});

			// Should have passed ghPath to createPR
			expect(mockCreatePR).toHaveBeenCalledWith(
				expect.any(String),
				'main',
				expect.any(String),
				expect.any(String),
				'/usr/local/bin/gh'
			);
		});
	});

	describe('SSH remote session support', () => {
		it('should pass sshRemoteId to readDoc for SSH sessions', async () => {
			const sshSession = createMockSession({
				sshRemoteId: 'ssh-remote-123',
				sessionSshRemoteConfig: {
					enabled: true,
					remoteId: 'ssh-remote-123',
				},
			});
			const sessions = [sshSession];
			const groups = [createMockGroup()];

			mockReadDoc.mockResolvedValue({ success: true, content: '- [x] Completed' });

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
					'/remote/path'
				);
			});

			// Verify readDoc was called with sshRemoteId
			expect(mockReadDoc).toHaveBeenCalledWith(
				'/remote/path',
				'tasks.md',
				'ssh-remote-123' // sshRemoteId should be passed
			);
		});

		it('should pass sshRemoteId through multiple readDoc calls for SSH sessions', async () => {
			const sshSession = createMockSession({
				sshRemoteId: 'ssh-remote-456',
				sessionSshRemoteConfig: {
					enabled: true,
					remoteId: 'ssh-remote-456',
				},
			});
			const sessions = [sshSession];
			const groups = [createMockGroup()];

			// Start with one unchecked task, then return checked after agent run
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
					'/remote/path'
				);
			});

			// Verify all readDoc calls included sshRemoteId
			const readDocCalls = mockReadDoc.mock.calls;
			expect(readDocCalls.length).toBeGreaterThan(0);

			// Every call should have sshRemoteId as the third argument
			for (const call of readDocCalls) {
				expect(call[2]).toBe('ssh-remote-456');
			}
		});

		it('should use sessionSshRemoteConfig.remoteId when sshRemoteId is not set', async () => {
			// This tests the fallback: session.sshRemoteId || session.sessionSshRemoteConfig?.remoteId
			const sshSession = createMockSession({
				sshRemoteId: undefined, // Not set (e.g., terminal-only SSH session)
				sessionSshRemoteConfig: {
					enabled: true,
					remoteId: 'fallback-remote-789',
				},
			});
			const sessions = [sshSession];
			const groups = [createMockGroup()];

			mockReadDoc.mockResolvedValue({ success: true, content: '- [x] Completed' });

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
					'/remote/path'
				);
			});

			// Verify readDoc was called with the fallback sshRemoteId
			expect(mockReadDoc).toHaveBeenCalledWith(
				'/remote/path',
				'tasks.md',
				'fallback-remote-789' // Should use sessionSshRemoteConfig.remoteId as fallback
			);
		});

		it('should pass sshRemoteId to worktree operations for SSH sessions', async () => {
			const sshSession = createMockSession({
				sshRemoteId: 'ssh-worktree-remote',
				sessionSshRemoteConfig: {
					enabled: true,
					remoteId: 'ssh-worktree-remote',
				},
			});
			const sessions = [sshSession];
			const groups = [createMockGroup()];

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
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktree: {
							enabled: true,
							path: '/remote/worktree',
							branchName: 'feature/ssh-test',
						},
					},
					'/remote/folder'
				);
			});

			// Verify worktreeSetup was called with sshRemoteId
			expect(mockWorktreeSetup).toHaveBeenCalledWith(
				'/test/path', // session.cwd
				'/remote/worktree',
				'feature/ssh-test',
				'ssh-worktree-remote' // sshRemoteId should be passed
			);
		});

		it('should not pass sshRemoteId for local sessions', async () => {
			// Regular local session without SSH config
			const localSession = createMockSession({
				sshRemoteId: undefined,
				sessionSshRemoteConfig: undefined,
			});
			const sessions = [localSession];
			const groups = [createMockGroup()];

			mockReadDoc.mockResolvedValue({ success: true, content: '- [x] Completed' });

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
					'/local/path'
				);
			});

			// Verify readDoc was called without sshRemoteId (undefined)
			expect(mockReadDoc).toHaveBeenCalledWith(
				'/local/path',
				'tasks.md',
				undefined // No sshRemoteId for local sessions
			);
		});
	});

	describe('worktree-dispatched PR creation', () => {
		it('should create PR when worktreeTarget is set with createPROnCompletion', async () => {
			// Create a worktree agent session with a parent
			const parentSession = createMockSession({
				id: 'parent-session-id',
				name: 'Parent Agent',
				cwd: '/main/repo',
			});
			const worktreeSession = createMockSession({
				id: 'worktree-session-id',
				name: 'Worktree Agent',
				cwd: '/main/repo/worktrees/feature-branch',
				parentSessionId: 'parent-session-id',
				worktreeBranch: 'feature-branch',
			});
			const sessions = [parentSession, worktreeSession];
			const groups = [createMockGroup()];

			// Mock task processing: first call returns unchecked, subsequent calls return checked
			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 3) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			// Mock PR creation success
			mockCreatePR.mockResolvedValue({
				success: true,
				prUrl: 'https://github.com/test/repo/pull/42',
			});

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

			await act(async () => {
				await result.current.startBatchRun(
					'worktree-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktreeTarget: {
							mode: 'create-new',
							newBranchName: 'feature-branch',
							baseBranch: 'main',
							createPROnCompletion: true,
						},
						worktree: {
							enabled: true,
							path: '/main/repo/worktrees/feature-branch',
							branchName: 'feature-branch',
							createPROnCompletion: true,
							prTargetBranch: 'main',
						},
					},
					'/test/folder'
				);
			});

			// Should have called createPR with parent session's cwd as mainRepoCwd
			expect(mockCreatePR).toHaveBeenCalledWith(
				'/main/repo/worktrees/feature-branch', // worktreePath (session.cwd for worktree agent)
				'main', // prTargetBranch
				expect.any(String), // PR title
				expect.any(String), // PR body
				undefined // ghPath
			);

			// Verify onPRResult callback was called
			expect(mockOnPRResult).toHaveBeenCalledWith(
				expect.objectContaining({
					sessionId: 'worktree-session-id',
					success: true,
					prUrl: 'https://github.com/test/repo/pull/42',
				})
			);
		});

		it('should resolve mainRepoCwd from parent session for worktree-dispatched runs', async () => {
			// Parent session has a different cwd from the worktree agent
			const parentSession = createMockSession({
				id: 'parent-session-id',
				name: 'Parent Agent',
				cwd: '/projects/main-repo',
			});
			const worktreeSession = createMockSession({
				id: 'wt-session-id',
				name: 'WT Agent',
				cwd: '/projects/main-repo/worktrees/my-feature',
				parentSessionId: 'parent-session-id',
				worktreeBranch: 'my-feature',
			});
			const sessions = [parentSession, worktreeSession];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 3) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			mockGetDefaultBranch.mockResolvedValue({ success: true, branch: 'main' });

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

			await act(async () => {
				await result.current.startBatchRun(
					'wt-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktreeTarget: {
							mode: 'existing-closed',
							worktreePath: '/projects/main-repo/worktrees/my-feature',
							createPROnCompletion: true,
						},
						worktree: {
							enabled: true,
							path: '/projects/main-repo/worktrees/my-feature',
							branchName: 'my-feature',
							createPROnCompletion: true,
						},
					},
					'/test/folder'
				);
			});

			// The createPR call's first arg is worktreePath, second is the base branch
			// mainRepoCwd should be the parent's cwd, not the worktree agent's cwd
			expect(mockCreatePR).toHaveBeenCalled();
			const createPRCallArgs = mockCreatePR.mock.calls[0];
			// The worktreeManager.createPR gets an options object, but it's the
			// internal createPR mock on window.maestro.git. The worktreeManager wrapper
			// passes worktreePath as the first arg to git.createPR
			expect(createPRCallArgs[0]).toBe('/projects/main-repo/worktrees/my-feature');
		});

		it('should not create PR when worktreeTarget is set but createPROnCompletion is false', async () => {
			const parentSession = createMockSession({
				id: 'parent-session-id',
				cwd: '/main/repo',
			});
			const worktreeSession = createMockSession({
				id: 'wt-session-id',
				cwd: '/main/repo/worktrees/feat',
				parentSessionId: 'parent-session-id',
				worktreeBranch: 'feat',
			});
			const sessions = [parentSession, worktreeSession];
			const groups = [createMockGroup()];

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
					onPRResult: mockOnPRResult,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'wt-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktreeTarget: {
							mode: 'create-new',
							newBranchName: 'feat',
							baseBranch: 'main',
							createPROnCompletion: false,
						},
						// No worktree.createPROnCompletion, so PR creation should not fire
					},
					'/test/folder'
				);
			});

			// createPR should NOT have been called
			expect(mockCreatePR).not.toHaveBeenCalled();
		});

		it('should use worktreeBranch from session when available', async () => {
			const parentSession = createMockSession({
				id: 'parent-id',
				cwd: '/main/repo',
			});
			const worktreeSession = createMockSession({
				id: 'wt-id',
				cwd: '/main/repo/worktrees/my-branch',
				parentSessionId: 'parent-id',
				worktreeBranch: 'my-branch-from-session',
			});
			const sessions = [parentSession, worktreeSession];
			const groups = [createMockGroup()];

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
					onPRResult: mockOnPRResult,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'wt-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktreeTarget: {
							mode: 'create-new',
							newBranchName: 'config-branch-name',
							baseBranch: 'main',
							createPROnCompletion: true,
						},
						worktree: {
							enabled: true,
							path: '/main/repo/worktrees/my-branch',
							branchName: 'config-branch-name',
							createPROnCompletion: true,
							prTargetBranch: 'main',
						},
					},
					'/test/folder'
				);
			});

			// PR should have been created (worktreeActive was overridden to true)
			expect(mockCreatePR).toHaveBeenCalled();
		});

		it('should skip setupWorktree when worktreeTarget is set (worktree already created)', async () => {
			const parentSession = createMockSession({
				id: 'parent-session-id',
				cwd: '/main/repo',
			});
			const worktreeSession = createMockSession({
				id: 'wt-session-id',
				cwd: '/main/repo/worktrees/auto-run-branch',
				parentSessionId: 'parent-session-id',
				worktreeBranch: 'auto-run-branch',
			});
			const sessions = [parentSession, worktreeSession];
			const groups = [createMockGroup()];

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
					onPRResult: mockOnPRResult,
				})
			);

			await act(async () => {
				await result.current.startBatchRun(
					'wt-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktreeTarget: {
							mode: 'create-new',
							newBranchName: 'auto-run-branch',
							baseBranch: 'main',
							createPROnCompletion: false,
						},
						worktree: {
							enabled: true,
							path: '/main/repo/worktrees/auto-run-branch',
							branchName: 'auto-run-branch',
						},
					},
					'/test/folder'
				);
			});

			// setupWorktree (git.worktreeSetup) should NOT be called when worktreeTarget is set,
			// because useAutoRunHandlers already created the worktree. Calling it again would fail
			// since the session's CWD is already a worktree (git-common-dir != git-dir).
			expect(mockWorktreeSetup).not.toHaveBeenCalled();
		});

		it('should fire "Auto Run Started" toast notification when batch starts with worktreeTarget', async () => {
			const parentSession = createMockSession({
				id: 'parent-session-id',
				name: 'Parent Agent',
				cwd: '/main/repo',
			});
			const worktreeSession = createMockSession({
				id: 'wt-session-id',
				name: 'WT Agent',
				cwd: '/main/repo/worktrees/feature',
				parentSessionId: 'parent-session-id',
				worktreeBranch: 'feature',
			});
			const sessions = [parentSession, worktreeSession];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 3) return { success: true, content: '- [ ] Task 1\n- [ ] Task 2' };
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
					'wt-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktreeTarget: {
							mode: 'create-new',
							newBranchName: 'feature',
							baseBranch: 'main',
							createPROnCompletion: false,
						},
					},
					'/test/folder'
				);
			});

			// Verify "Auto Run Started" toast was fired
			expect(mockNotifyToast).toHaveBeenCalledWith(
				expect.objectContaining({
					type: 'info',
					title: 'Auto Run Started',
					sessionId: 'wt-session-id',
				})
			);

			// Verify the message includes task and document counts
			const toastCall = mockNotifyToast.mock.calls.find(
				(call: unknown[]) => (call[0] as { title?: string })?.title === 'Auto Run Started'
			);
			expect(toastCall).toBeDefined();
			expect((toastCall![0] as { message: string }).message).toMatch(
				/\d+ tasks? across \d+ documents?/
			);
		});

		it('should add history entry with PR URL on successful PR creation', async () => {
			const parentSession = createMockSession({
				id: 'parent-session-id',
				cwd: '/main/repo',
			});
			const worktreeSession = createMockSession({
				id: 'wt-session-id',
				name: 'WT Agent',
				cwd: '/main/repo/worktrees/pr-branch',
				parentSessionId: 'parent-session-id',
				worktreeBranch: 'pr-branch',
			});
			const sessions = [parentSession, worktreeSession];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 3) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			mockCreatePR.mockResolvedValue({
				success: true,
				prUrl: 'https://github.com/test/repo/pull/99',
			});

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

			await act(async () => {
				await result.current.startBatchRun(
					'wt-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktreeTarget: {
							mode: 'create-new',
							newBranchName: 'pr-branch',
							baseBranch: 'main',
							createPROnCompletion: true,
						},
						worktree: {
							enabled: true,
							path: '/main/repo/worktrees/pr-branch',
							branchName: 'pr-branch',
							createPROnCompletion: true,
							prTargetBranch: 'main',
						},
					},
					'/test/folder'
				);
			});

			// Verify onAddHistoryEntry was called with PR URL in summary
			expect(mockOnAddHistoryEntry).toHaveBeenCalledWith(
				expect.objectContaining({
					type: 'AUTO',
					summary: expect.stringContaining('https://github.com/test/repo/pull/99'),
					sessionId: 'wt-session-id',
					success: true,
				})
			);

			// Verify the full response contains PR details
			const prHistoryCall = mockOnAddHistoryEntry.mock.calls.find((call: unknown[]) => {
				const entry = call[0] as { summary?: string };
				return entry.summary?.includes('PR created');
			});
			expect(prHistoryCall).toBeDefined();
			const prEntry = prHistoryCall![0] as { fullResponse: string };
			expect(prEntry.fullResponse).toContain('Pull Request Created');
			expect(prEntry.fullResponse).toContain('pr-branch');
			expect(prEntry.fullResponse).toContain('https://github.com/test/repo/pull/99');
		});

		it('should add history entry with error on failed PR creation', async () => {
			const parentSession = createMockSession({
				id: 'parent-session-id',
				cwd: '/main/repo',
			});
			const worktreeSession = createMockSession({
				id: 'wt-session-id',
				name: 'WT Agent',
				cwd: '/main/repo/worktrees/fail-branch',
				parentSessionId: 'parent-session-id',
				worktreeBranch: 'fail-branch',
			});
			const sessions = [parentSession, worktreeSession];
			const groups = [createMockGroup()];

			let callCount = 0;
			mockReadDoc.mockImplementation(async () => {
				callCount++;
				if (callCount <= 3) return { success: true, content: '- [ ] Task' };
				return { success: true, content: '- [x] Task' };
			});

			mockCreatePR.mockResolvedValue({
				success: false,
				error: 'gh: not authenticated',
			});

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

			await act(async () => {
				await result.current.startBatchRun(
					'wt-session-id',
					{
						documents: [{ filename: 'tasks', resetOnCompletion: false }],
						prompt: 'Test',
						loopEnabled: false,
						worktreeTarget: {
							mode: 'create-new',
							newBranchName: 'fail-branch',
							baseBranch: 'main',
							createPROnCompletion: true,
						},
						worktree: {
							enabled: true,
							path: '/main/repo/worktrees/fail-branch',
							branchName: 'fail-branch',
							createPROnCompletion: true,
							prTargetBranch: 'main',
						},
					},
					'/test/folder'
				);
			});

			// Verify onAddHistoryEntry was called with error info
			expect(mockOnAddHistoryEntry).toHaveBeenCalledWith(
				expect.objectContaining({
					type: 'AUTO',
					summary: expect.stringContaining('PR creation failed'),
					sessionId: 'wt-session-id',
					success: false,
				})
			);

			// Verify error details in full response
			const prHistoryCall = mockOnAddHistoryEntry.mock.calls.find((call: unknown[]) => {
				const entry = call[0] as { summary?: string };
				return entry.summary?.includes('PR creation failed');
			});
			expect(prHistoryCall).toBeDefined();
			const prEntry = prHistoryCall![0] as { fullResponse: string };
			expect(prEntry.fullResponse).toContain('Pull Request Creation Failed');
			expect(prEntry.fullResponse).toContain('gh: not authenticated');
		});
	});
});
