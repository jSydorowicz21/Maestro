#!/usr/bin/env python3
"""Split useBatchProcessor.test.ts into focused modules."""
import sys, os
sys.stdout.reconfigure(encoding='utf-8')

base_dir = 'src/__tests__/renderer/hooks'

with open(os.path.join(base_dir, 'useBatchProcessor.test.ts'), 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Line ranges (1-indexed, inclusive) for each describe block inside 'useBatchProcessor hook'
blocks = {
    'hook initialization': (707, 750),
    'state synchronization': (752, 837),
    'setCustomPrompt': (839, 913),
    'startBatchRun': (915, 1110),
    'stopBatchRun_1': (1112, 1175),
    'worktree handling': (1177, 1317),
    'PR creation': (1319, 1475),
    'loop mode': (1477, 1534),
    'reset on completion': (1536, 1582),
    'audio feedback_1': (1584, 1630),
    'state broadcasting': (1632, 1671),
    'history entries': (1673, 1716),
    'hasAnyActiveBatch': (1718, 1761),
    'synopsis parsing': (1763, 2141),
    'document reading': (2143, 2226),
    'git branch detection': (2228, 2346),
    'group name detection': (2348, 2385),
    'multiple documents': (2387, 2492),
    'task error handling': (2494, 2543),
    'error pause handling': (2545, 2633),
    'error pause processTask': (2635, 2804),
    'skip-document': (2806, 2904),
    'error state cleared': (2906, 2989),
    'rapid error cycle': (2991, 3119),
    'session claude ID': (3121, 3218),
    'usage stats': (3220, 3279),
    'elapsed time': (3281, 3370),
    'task count': (3372, 3414),
    'worktree cwd override': (3416, 3459),
    'session name completion': (3461, 3543),
    'stopBatchRun_2': (3545, 3588),
    'loop max limit': (3590, 3633),
    'worktree setup': (3635, 3798),
    'PR completion': (3800, 4003),
    'audio feedback_2': (4005, 4062),
    'reset-completion loop': (4064, 4109),
    'PR exception': (4111, 4284),
    'loop multiple iterations': (4286, 4476),
    'worktree checkout': (4478, 4612),
    'PR fallback branch': (4614, 4738),
    'session name extraction': (4740, 4834),
    'Claude session registration': (4836, 4928),
    'document failed read': (4930, 4997),
    'audio feedback edge': (4999, 5102),
    'ghPath PR creation': (5104, 5165),
    'SSH remote session': (5167, 5405),
    'worktree-dispatched PR': (5407, 5987),
}

lifecycle_blocks = [
    'hook initialization', 'state synchronization', 'setCustomPrompt',
    'reset on completion', 'audio feedback_1', 'state broadcasting',
    'history entries', 'hasAnyActiveBatch', 'synopsis parsing',
    'session claude ID', 'usage stats', 'elapsed time', 'task count',
    'session name completion', 'audio feedback_2', 'reset-completion loop',
    'session name extraction', 'Claude session registration', 'audio feedback edge',
]

execution_blocks = [
    'startBatchRun', 'stopBatchRun_1', 'loop mode',
    'document reading', 'git branch detection', 'group name detection',
    'multiple documents', 'stopBatchRun_2', 'loop max limit',
    'loop multiple iterations',
]

worktree_blocks = [
    'worktree handling', 'PR creation', 'worktree cwd override',
    'worktree setup', 'PR completion', 'PR exception',
    'worktree checkout', 'PR fallback branch', 'ghPath PR creation',
    'SSH remote session', 'worktree-dispatched PR',
]

error_blocks = [
    'task error handling', 'error pause handling', 'error pause processTask',
    'skip-document', 'error state cleared', 'rapid error cycle',
    'document failed read',
]

# --- SETUP FILE ---
setup_content = """/**
 * Shared test setup for useBatchProcessor hook test files.
 *
 * Each split test file must declare its own vi.mock() calls (Vitest hoisting requirement),
 * then call createBatchProcessorTestContext() in beforeEach to get the shared mocks.
 */

import { vi } from 'vitest';
import type {
\tSession,
\tGroup,
} from '../../../renderer/types';

export interface BatchProcessorTestContext {
\tmockOnUpdateSession: ReturnType<typeof vi.fn>;
\tmockOnSpawnAgent: ReturnType<typeof vi.fn>;
\tmockOnAddHistoryEntry: ReturnType<typeof vi.fn>;
\tmockOnComplete: ReturnType<typeof vi.fn>;
\tmockOnPRResult: ReturnType<typeof vi.fn>;
\tmockReadDoc: ReturnType<typeof vi.fn>;
\tmockWriteDoc: ReturnType<typeof vi.fn>;
\tmockCreateWorkingCopy: ReturnType<typeof vi.fn>;
\tmockStatus: ReturnType<typeof vi.fn>;
\tmockBranch: ReturnType<typeof vi.fn>;
\tmockBroadcastAutoRunState: ReturnType<typeof vi.fn>;
\tmockRegisterSessionOrigin: ReturnType<typeof vi.fn>;
\tmockWorktreeSetup: ReturnType<typeof vi.fn>;
\tmockWorktreeCheckout: ReturnType<typeof vi.fn>;
\tmockGetDefaultBranch: ReturnType<typeof vi.fn>;
\tmockCreatePR: ReturnType<typeof vi.fn>;
\tmockNotifyToast: ReturnType<typeof vi.fn>;
}

export const createMockSession = (overrides?: Partial<Session>): Session => ({
\tid: 'test-session-id',
\tname: 'Test Session',
\ttoolType: 'claude-code',
\tstate: 'idle',
\tinputMode: 'ai',
\tcwd: '/test/path',
\tprojectRoot: '/test/path',
\taiPid: 0,
\tterminalPid: 0,
\taiLogs: [],
\tshellLogs: [],
\tisGitRepo: true,
\tfileTree: [],
\tfileExplorerExpanded: [],
\tmessageQueue: [],
\t...overrides,
});

export const createMockGroup = (overrides?: Partial<Group>): Group => ({
\tid: 'test-group-id',
\tname: 'Test Group',
\tcollapsed: false,
\t...overrides,
});

/**
 * Creates the standard batch processor test context. Call in beforeEach after vi.clearAllMocks().
 */
export function createBatchProcessorTestContext(mockNotifyToast: ReturnType<typeof vi.fn>): BatchProcessorTestContext {
\tconst mockOnUpdateSession = vi.fn();
\tconst mockOnSpawnAgent = vi.fn().mockResolvedValue({
\t\tsuccess: true,
\t\tagentSessionId: 'mock-claude-session',
\t\tusageStats: {
\t\t\tinputTokens: 100,
\t\t\toutputTokens: 200,
\t\t\ttotalCostUsd: 0.01,
\t\t\tcacheReadInputTokens: 0,
\t\t\tcacheCreationInputTokens: 0,
\t\t\tcontextWindow: 0,
\t\t},
\t\tresponse: '**Summary:** Test task completed\\\\n\\\\n**Details:** Some details here.',
\t});
\tconst mockOnAddHistoryEntry = vi.fn();
\tconst mockOnComplete = vi.fn();
\tconst mockOnPRResult = vi.fn();

\tconst mockReadDoc = vi
\t\t.fn()
\t\t.mockResolvedValue({ success: true, content: '# Tasks\\\\n- [ ] Task 1\\\\n- [ ] Task 2' });
\tconst mockWriteDoc = vi.fn().mockResolvedValue({ success: true });
\tconst mockCreateWorkingCopy = vi.fn().mockResolvedValue({ workingCopyPath: 'runs/tasks-run-1.md' });
\tconst mockStatus = vi.fn().mockResolvedValue({ stdout: '' });
\tconst mockBranch = vi.fn().mockResolvedValue({ stdout: 'main' });
\tconst mockBroadcastAutoRunState = vi.fn();
\tconst mockRegisterSessionOrigin = vi.fn().mockResolvedValue(undefined);
\tconst mockWorktreeSetup = vi.fn().mockResolvedValue({ success: true });
\tconst mockWorktreeCheckout = vi.fn().mockResolvedValue({ success: true });
\tconst mockGetDefaultBranch = vi.fn().mockResolvedValue({ success: true, branch: 'main' });
\tconst mockCreatePR = vi
\t\t.fn()
\t\t.mockResolvedValue({ success: true, prUrl: 'https://github.com/test/test/pull/1' });

\t// Configure window.maestro
\twindow.maestro = {
\t\t...window.maestro,
\t\tautorun: {
\t\t\treadDoc: mockReadDoc,
\t\t\twriteDoc: mockWriteDoc,
\t\t\tcreateWorkingCopy: mockCreateWorkingCopy,
\t\t\twatchFolder: vi.fn(),
\t\t\tunwatchFolder: vi.fn(),
\t\t\treadFolder: vi.fn(),
\t\t},
\t\tgit: {
\t\t\t...window.maestro.git,
\t\t\tstatus: mockStatus,
\t\t\tbranch: mockBranch,
\t\t\tworktreeSetup: mockWorktreeSetup,
\t\t\tworktreeCheckout: mockWorktreeCheckout,
\t\t\tgetDefaultBranch: mockGetDefaultBranch,
\t\t\tcreatePR: mockCreatePR,
\t\t},
\t\tweb: {
\t\t\t...window.maestro.web,
\t\t\tbroadcastAutoRunState: mockBroadcastAutoRunState,
\t\t},
\t\tagentSessions: {
\t\t\t...window.maestro.agentSessions,
\t\t\tregisterSessionOrigin: mockRegisterSessionOrigin,
\t\t},
\t\tpower: {
\t\t\taddReason: vi.fn(),
\t\t\tremoveReason: vi.fn(),
\t\t\tsetEnabled: vi.fn(),
\t\t\tisEnabled: vi.fn().mockResolvedValue(true),
\t\t\tgetStatus: vi
\t\t\t\t.fn()
\t\t\t\t.mockResolvedValue({ enabled: true, blocking: false, reasons: [], platform: 'darwin' }),
\t\t},
\t};

\treturn {
\t\tmockOnUpdateSession,
\t\tmockOnSpawnAgent,
\t\tmockOnAddHistoryEntry,
\t\tmockOnComplete,
\t\tmockOnPRResult,
\t\tmockReadDoc,
\t\tmockWriteDoc,
\t\tmockCreateWorkingCopy,
\t\tmockStatus,
\t\tmockBranch,
\t\tmockBroadcastAutoRunState,
\t\tmockRegisterSessionOrigin,
\t\tmockWorktreeSetup,
\t\tmockWorktreeCheckout,
\t\tmockGetDefaultBranch,
\t\tmockCreatePR,
\t\tmockNotifyToast,
\t};
}
"""

with open(os.path.join(base_dir, 'useBatchProcessor.setup.ts'), 'w', encoding='utf-8') as f:
    f.write(setup_content)
print('Created useBatchProcessor.setup.ts')


def build_header(title, description):
    return f"""/**
 * Tests for useBatchProcessor hook - {title}
 *
 * {description}
 */

import {{ describe, it, expect, vi, beforeEach, afterEach }} from 'vitest';
import {{ renderHook, act, waitFor }} from '@testing-library/react';
import type {{
\tSession,
\tGroup,
\tHistoryEntry,
\tUsageStats,
\tBatchRunConfig,
\tAgentError,
}} from '../../../renderer/types';

import {{ useBatchProcessor }} from '../../../renderer/hooks';
import {{ useBatchStore }} from '../../../renderer/stores/batchStore';
import {{
\tcreateMockSession,
\tcreateMockGroup,
\tcreateBatchProcessorTestContext,
\ttype BatchProcessorTestContext,
}} from './useBatchProcessor.setup';

// Mock notifyToast so we can verify toast notifications
const {{ mockNotifyToast }} = vi.hoisted(() => ({{
\tmockNotifyToast: vi.fn(),
}}));
vi.mock('../../../renderer/stores/notificationStore', () => ({{
\tnotifyToast: (...args: unknown[]) => mockNotifyToast(...args),
}}));

describe('useBatchProcessor hook - {title}', () => {{
\tlet ctx: BatchProcessorTestContext;

\tbeforeEach(() => {{
\t\tctx = createBatchProcessorTestContext(mockNotifyToast);
\t}});

\tafterEach(() => {{
\t\tvi.clearAllMocks();
\t}});

"""


def build_split_file(title, description, block_names):
    header = build_header(title, description)
    block_content = []
    for name in block_names:
        start, end = blocks[name]
        block_content.append(''.join(lines[start-1:end]))
    inner = '\n'.join(block_content)
    return header + inner + '\n});\n'


# --- LIFECYCLE ---
lifecycle_file = build_split_file(
    'Lifecycle',
    'Hook initialization, state synchronization, prompts, tracking, audio feedback, and session management.',
    lifecycle_blocks,
)
with open(os.path.join(base_dir, 'useBatchProcessor.lifecycle.test.ts'), 'w', encoding='utf-8') as f:
    f.write(lifecycle_file)
print(f'Created useBatchProcessor.lifecycle.test.ts ({lifecycle_file.count(chr(10))} lines)')

# --- EXECUTION ---
execution_file = build_split_file(
    'Execution',
    'Start/stop batch runs, document reading, template substitution, loop mode, and git branch detection.',
    execution_blocks,
)
with open(os.path.join(base_dir, 'useBatchProcessor.execution.test.ts'), 'w', encoding='utf-8') as f:
    f.write(execution_file)
print(f'Created useBatchProcessor.execution.test.ts ({execution_file.count(chr(10))} lines)')

# --- WORKTREE ---
worktree_file = build_split_file(
    'Worktree & PR',
    'Worktree setup, checkout, PR creation, SSH remote session support.',
    worktree_blocks,
)
with open(os.path.join(base_dir, 'useBatchProcessor.worktree.test.ts'), 'w', encoding='utf-8') as f:
    f.write(worktree_file)
print(f'Created useBatchProcessor.worktree.test.ts ({worktree_file.count(chr(10))} lines)')

# --- ERRORS ---
errors_file = build_split_file(
    'Error Handling',
    'Task errors, error pause/resume, skip-document, abort cleanup, and rapid error cycles.',
    error_blocks,
)
with open(os.path.join(base_dir, 'useBatchProcessor.errors.test.ts'), 'w', encoding='utf-8') as f:
    f.write(errors_file)
print(f'Created useBatchProcessor.errors.test.ts ({errors_file.count(chr(10))} lines)')

# --- TRIM ORIGINAL FILE ---
# Keep lines 1-572 (pure function tests only, ending with the integration describe closing)
original_content = ''.join(lines[0:572])
original_content = original_content.rstrip() + '\n'

with open(os.path.join(base_dir, 'useBatchProcessor.test.ts'), 'w', encoding='utf-8') as f:
    f.write(original_content)
print(f'Trimmed useBatchProcessor.test.ts to {original_content.count(chr(10))} lines')

print('\nDone! All files created.')
