/**
 * Shared test setup for useBatchProcessor hook test files.
 *
 * Each split test file must declare its own vi.mock() calls (Vitest hoisting requirement),
 * then call createBatchProcessorTestContext() in beforeEach to get the shared mocks.
 */

import { vi } from 'vitest';
import type { Session, Group } from '../../../renderer/types';
import { createMockSession as sharedCreateMockSession } from '../../helpers/mockSession';

export interface BatchProcessorTestContext {
	mockOnUpdateSession: ReturnType<typeof vi.fn>;
	mockOnSpawnAgent: ReturnType<typeof vi.fn>;
	mockOnAddHistoryEntry: ReturnType<typeof vi.fn>;
	mockOnComplete: ReturnType<typeof vi.fn>;
	mockOnPRResult: ReturnType<typeof vi.fn>;
	mockReadDoc: ReturnType<typeof vi.fn>;
	mockWriteDoc: ReturnType<typeof vi.fn>;
	mockCreateWorkingCopy: ReturnType<typeof vi.fn>;
	mockStatus: ReturnType<typeof vi.fn>;
	mockBranch: ReturnType<typeof vi.fn>;
	mockBroadcastAutoRunState: ReturnType<typeof vi.fn>;
	mockRegisterSessionOrigin: ReturnType<typeof vi.fn>;
	mockWorktreeSetup: ReturnType<typeof vi.fn>;
	mockWorktreeCheckout: ReturnType<typeof vi.fn>;
	mockGetDefaultBranch: ReturnType<typeof vi.fn>;
	mockCreatePR: ReturnType<typeof vi.fn>;
	mockNotifyToast: ReturnType<typeof vi.fn>;
}

export const createMockSession = (overrides?: Partial<Session>): Session =>
	sharedCreateMockSession({
		id: 'test-session-id',
		cwd: '/test/path',
		projectRoot: '/test/path',
		isGitRepo: true,
		...overrides,
	});

export const createMockGroup = (overrides?: Partial<Group>): Group => ({
	id: 'test-group-id',
	name: 'Test Group',
	collapsed: false,
	...overrides,
});

/**
 * Creates the standard batch processor test context. Call in beforeEach after vi.clearAllMocks().
 */
export function createBatchProcessorTestContext(
	mockNotifyToast: ReturnType<typeof vi.fn>
): BatchProcessorTestContext {
	const mockOnUpdateSession = vi.fn();
	const mockOnSpawnAgent = vi.fn().mockResolvedValue({
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
		response: '**Summary:** Test task completed\n\n**Details:** Some details here.',
	});
	const mockOnAddHistoryEntry = vi.fn();
	const mockOnComplete = vi.fn();
	const mockOnPRResult = vi.fn();

	const mockReadDoc = vi
		.fn()
		.mockResolvedValue({ success: true, content: '# Tasks\n- [ ] Task 1\n- [ ] Task 2' });
	const mockWriteDoc = vi.fn().mockResolvedValue({ success: true });
	const mockCreateWorkingCopy = vi
		.fn()
		.mockResolvedValue({ workingCopyPath: 'runs/tasks-run-1.md' });
	const mockStatus = vi.fn().mockResolvedValue({ stdout: '' });
	const mockBranch = vi.fn().mockResolvedValue({ stdout: 'main' });
	const mockBroadcastAutoRunState = vi.fn();
	const mockRegisterSessionOrigin = vi.fn().mockResolvedValue(undefined);
	const mockWorktreeSetup = vi.fn().mockResolvedValue({ success: true });
	const mockWorktreeCheckout = vi.fn().mockResolvedValue({ success: true });
	const mockGetDefaultBranch = vi.fn().mockResolvedValue({ success: true, branch: 'main' });
	const mockCreatePR = vi
		.fn()
		.mockResolvedValue({ success: true, prUrl: 'https://github.com/test/test/pull/1' });

	// Configure window.maestro
	window.maestro = {
		...window.maestro,
		autorun: {
			readDoc: mockReadDoc,
			writeDoc: mockWriteDoc,
			createWorkingCopy: mockCreateWorkingCopy,
			watchFolder: vi.fn(),
			unwatchFolder: vi.fn(),
			readFolder: vi.fn(),
		},
		git: {
			...window.maestro.git,
			status: mockStatus,
			branch: mockBranch,
			worktreeSetup: mockWorktreeSetup,
			worktreeCheckout: mockWorktreeCheckout,
			getDefaultBranch: mockGetDefaultBranch,
			createPR: mockCreatePR,
		},
		web: {
			...window.maestro.web,
			broadcastAutoRunState: mockBroadcastAutoRunState,
		},
		agentSessions: {
			...window.maestro.agentSessions,
			registerSessionOrigin: mockRegisterSessionOrigin,
		},
		power: {
			addReason: vi.fn(),
			removeReason: vi.fn(),
			setEnabled: vi.fn(),
			isEnabled: vi.fn().mockResolvedValue(true),
			getStatus: vi
				.fn()
				.mockResolvedValue({ enabled: true, blocking: false, reasons: [], platform: 'darwin' }),
		},
	};

	return {
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
		mockNotifyToast,
	};
}
