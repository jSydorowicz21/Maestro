/**
 * Symphony IPC handlers - Participant management tests
 *
 * Tests for: symphony:updateStatus, symphony:complete, symphony:cancel,
 * symphony:checkPRStatuses, symphony:syncContribution
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ipcMain, BrowserWindow } from 'electron';
import fs from 'fs/promises';
import { createSymphonyTestContext, SymphonyTestContext } from './symphony.setup';

// Mock electron
vi.mock('electron', () => ({
	ipcMain: {
		handle: vi.fn(),
		removeHandler: vi.fn(),
	},
	app: {
		getPath: vi.fn(),
	},
	BrowserWindow: vi.fn(),
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
	default: {
		readFile: vi.fn(),
		writeFile: vi.fn(),
		mkdir: vi.fn(),
		rm: vi.fn(),
		access: vi.fn(),
	},
}));

// Mock execFileNoThrow
vi.mock('../../../../main/utils/execFile', () => ({
	execFileNoThrow: vi.fn(),
}));

// Mock symphony-fork
vi.mock('../../../../main/utils/symphony-fork', () => ({
	ensureForkSetup: vi.fn(),
}));

// Mock cliDetection - resolveGhPath returns 'gh' so existing assertions still match
vi.mock('../../../../main/utils/cliDetection', () => ({
	resolveGhPath: vi.fn().mockResolvedValue('gh'),
}));

// Mock the logger
vi.mock('../../../../main/utils/logger', () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import mocked functions
import { execFileNoThrow } from '../../../../main/utils/execFile';
import { ensureForkSetup } from '../../../../main/utils/symphony-fork';

describe('Symphony IPC handlers', () => {
	let ctx: SymphonyTestContext;
	let handlers: Map<string, Function>;
	let mockMainWindow: SymphonyTestContext['mockMainWindow'];
	let mockSessionsStore: SymphonyTestContext['mockSessionsStore'];

	beforeEach(() => {
		vi.clearAllMocks();
		ctx = createSymphonyTestContext();
		handlers = ctx.handlers;
		mockMainWindow = ctx.mockMainWindow;
		mockSessionsStore = ctx.mockSessionsStore;
	});

	afterEach(() => {
		handlers.clear();
	});

	// ============================================================================
	// Update Status Tests (symphony:updateStatus)
	// ============================================================================

	describe('symphony:updateStatus', () => {
		const getUpdateStatusHandler = () => handlers.get('symphony:updateStatus');

		const createStateWithContribution = (
			overrides?: Partial<{
				id: string;
				status: string;
				progress: {
					totalDocuments: number;
					completedDocuments: number;
					totalTasks: number;
					completedTasks: number;
				};
				tokenUsage: { inputTokens: number; outputTokens: number; estimatedCost: number };
				timeSpent: number;
				draftPrNumber?: number;
				draftPrUrl?: string;
				error?: string;
			}>
		) => ({
			active: [
				{
					id: 'contrib_test123',
					repoSlug: 'owner/repo',
					repoName: 'repo',
					issueNumber: 42,
					issueTitle: 'Test Issue',
					localPath: '/tmp/symphony/repos/repo',
					branchName: 'symphony/issue-42-abc',
					startedAt: '2024-01-01T00:00:00Z',
					status: 'running',
					progress: { totalDocuments: 5, completedDocuments: 1, totalTasks: 10, completedTasks: 3 },
					tokenUsage: { inputTokens: 1000, outputTokens: 500, estimatedCost: 0.1 },
					timeSpent: 60000,
					sessionId: 'session-123',
					agentType: 'claude-code',
					...overrides,
				},
			],
			history: [],
			stats: {},
		});

		describe('field updates', () => {
			it('should update contribution status field', async () => {
				vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(createStateWithContribution()));

				const handler = getUpdateStatusHandler();
				const result = await handler!({} as any, {
					contributionId: 'contrib_test123',
					status: 'paused',
				});

				expect(result.updated).toBe(true);

				// Verify state was written with updated status
				expect(fs.writeFile).toHaveBeenCalled();
				const writeCall = vi
					.mocked(fs.writeFile)
					.mock.calls.find((call) => (call[0] as string).includes('state.json'));
				expect(writeCall).toBeDefined();
				const writtenState = JSON.parse(writeCall![1] as string);
				expect(writtenState.active[0].status).toBe('paused');
			});

			it('should update progress fields (partial update)', async () => {
				vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(createStateWithContribution()));

				const handler = getUpdateStatusHandler();
				const result = await handler!({} as any, {
					contributionId: 'contrib_test123',
					progress: { completedDocuments: 3, completedTasks: 7 },
				});

				expect(result.updated).toBe(true);

				// Verify state was written with updated progress
				const writeCall = vi
					.mocked(fs.writeFile)
					.mock.calls.find((call) => (call[0] as string).includes('state.json'));
				expect(writeCall).toBeDefined();
				const writtenState = JSON.parse(writeCall![1] as string);
				// Should preserve original fields and merge new ones
				expect(writtenState.active[0].progress).toEqual({
					totalDocuments: 5,
					completedDocuments: 3,
					totalTasks: 10,
					completedTasks: 7,
				});
			});

			it('should update token usage fields (partial update)', async () => {
				vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(createStateWithContribution()));

				const handler = getUpdateStatusHandler();
				const result = await handler!({} as any, {
					contributionId: 'contrib_test123',
					tokenUsage: { inputTokens: 2500, estimatedCost: 0.25 },
				});

				expect(result.updated).toBe(true);

				// Verify state was written with updated token usage
				const writeCall = vi
					.mocked(fs.writeFile)
					.mock.calls.find((call) => (call[0] as string).includes('state.json'));
				expect(writeCall).toBeDefined();
				const writtenState = JSON.parse(writeCall![1] as string);
				// Should preserve original fields and merge new ones
				expect(writtenState.active[0].tokenUsage).toEqual({
					inputTokens: 2500,
					outputTokens: 500, // unchanged
					estimatedCost: 0.25,
				});
			});

			it('should update timeSpent', async () => {
				vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(createStateWithContribution()));

				const handler = getUpdateStatusHandler();
				const result = await handler!({} as any, {
					contributionId: 'contrib_test123',
					timeSpent: 180000, // 3 minutes
				});

				expect(result.updated).toBe(true);

				const writeCall = vi
					.mocked(fs.writeFile)
					.mock.calls.find((call) => (call[0] as string).includes('state.json'));
				expect(writeCall).toBeDefined();
				const writtenState = JSON.parse(writeCall![1] as string);
				expect(writtenState.active[0].timeSpent).toBe(180000);
			});

			it('should update draftPrNumber and draftPrUrl', async () => {
				vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(createStateWithContribution()));

				const handler = getUpdateStatusHandler();
				const result = await handler!({} as any, {
					contributionId: 'contrib_test123',
					draftPrNumber: 99,
					draftPrUrl: 'https://github.com/owner/repo/pull/99',
				});

				expect(result.updated).toBe(true);

				const writeCall = vi
					.mocked(fs.writeFile)
					.mock.calls.find((call) => (call[0] as string).includes('state.json'));
				expect(writeCall).toBeDefined();
				const writtenState = JSON.parse(writeCall![1] as string);
				expect(writtenState.active[0].draftPrNumber).toBe(99);
				expect(writtenState.active[0].draftPrUrl).toBe('https://github.com/owner/repo/pull/99');
			});

			it('should update error field', async () => {
				vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(createStateWithContribution()));

				const handler = getUpdateStatusHandler();
				const result = await handler!({} as any, {
					contributionId: 'contrib_test123',
					error: 'Rate limit exceeded',
				});

				expect(result.updated).toBe(true);

				const writeCall = vi
					.mocked(fs.writeFile)
					.mock.calls.find((call) => (call[0] as string).includes('state.json'));
				expect(writeCall).toBeDefined();
				const writtenState = JSON.parse(writeCall![1] as string);
				expect(writtenState.active[0].error).toBe('Rate limit exceeded');
			});
		});

		describe('contribution not found', () => {
			it('should return updated:false if contribution not found', async () => {
				// State with no active contributions
				vi.mocked(fs.readFile).mockResolvedValue(
					JSON.stringify({
						active: [],
						history: [],
						stats: {},
					})
				);

				const handler = getUpdateStatusHandler();
				const result = await handler!({} as any, {
					contributionId: 'nonexistent_contrib',
					status: 'paused',
				});

				expect(result.updated).toBe(false);
			});
		});

		describe('broadcast behavior', () => {
			it('should broadcast update after successful update', async () => {
				vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(createStateWithContribution()));

				const handler = getUpdateStatusHandler();
				await handler!({} as any, {
					contributionId: 'contrib_test123',
					status: 'completing',
				});

				// Verify broadcast was sent
				expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('symphony:updated');
			});
		});
	});

	// ============================================================================
	// Complete Contribution Tests (symphony:complete)
	// ============================================================================

	describe('symphony:complete', () => {
		const getCompleteHandler = () => handlers.get('symphony:complete');

		// Helper to get the final state write (last one with state.json)
		// Complete handler writes state twice: once for 'completing' status, once for final state
		const getFinalStateWrite = () => {
			const writeCalls = vi
				.mocked(fs.writeFile)
				.mock.calls.filter((call) => (call[0] as string).includes('state.json'));
			const lastCall = writeCalls[writeCalls.length - 1];
			return lastCall ? JSON.parse(lastCall[1] as string) : null;
		};

		const createActiveContribution = (
			overrides?: Partial<{
				id: string;
				repoSlug: string;
				repoName: string;
				issueNumber: number;
				issueTitle: string;
				localPath: string;
				branchName: string;
				draftPrNumber: number;
				draftPrUrl: string;
				status: string;
				progress: {
					totalDocuments: number;
					completedDocuments: number;
					totalTasks: number;
					completedTasks: number;
				};
				tokenUsage: { inputTokens: number; outputTokens: number; estimatedCost: number };
				timeSpent: number;
				sessionId: string;
				agentType: string;
				startedAt: string;
			}>
		) => ({
			id: 'contrib_complete_test',
			repoSlug: 'owner/repo',
			repoName: 'repo',
			issueNumber: 42,
			issueTitle: 'Test Issue',
			localPath: '/tmp/symphony/repos/repo-contrib_complete_test',
			branchName: 'symphony/issue-42-abc',
			draftPrNumber: 99,
			draftPrUrl: 'https://github.com/owner/repo/pull/99',
			startedAt: '2024-01-01T00:00:00Z',
			status: 'running',
			progress: { totalDocuments: 3, completedDocuments: 2, totalTasks: 10, completedTasks: 8 },
			tokenUsage: { inputTokens: 5000, outputTokens: 2500, estimatedCost: 0.5 },
			timeSpent: 180000,
			sessionId: 'session-123',
			agentType: 'claude-code',
			...overrides,
		});

		// Helper to get ISO week number string (matches implementation in symphony.ts)
		const getWeekNumberHelper = (date: Date): string => {
			const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
			const dayNum = d.getUTCDay() || 7;
			d.setUTCDate(d.getUTCDate() + 4 - dayNum);
			const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
			const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
			return `${d.getUTCFullYear()}-W${weekNo}`;
		};

		const createStateWithActiveContribution = (
			contribution?: ReturnType<typeof createActiveContribution>
		) => ({
			active: [contribution || createActiveContribution()],
			history: [],
			stats: {
				totalContributions: 5,
				totalMerged: 3,
				totalIssuesResolved: 4,
				totalDocumentsProcessed: 20,
				totalTasksCompleted: 50,
				totalTokensUsed: 100000,
				totalTimeSpent: 7200000,
				estimatedCostDonated: 10.0,
				repositoriesContributed: ['other/repo1', 'other/repo2'],
				uniqueMaintainersHelped: 2,
				currentStreak: 2,
				longestStreak: 5,
				lastContributionDate: getWeekNumberHelper(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)), // last week
			},
		});

		describe('contribution lookup', () => {
			it('should fail if contribution not found', async () => {
				// State with no active contributions
				vi.mocked(fs.readFile).mockResolvedValue(
					JSON.stringify({
						active: [],
						history: [],
						stats: {},
					})
				);

				const handler = getCompleteHandler();
				const result = await handler!({} as any, {
					contributionId: 'nonexistent_contrib',
				});

				expect(result.error).toContain('Contribution not found');
			});

			it('should fail if contribution exists but ID does not match', async () => {
				vi.mocked(fs.readFile).mockResolvedValue(
					JSON.stringify(createStateWithActiveContribution())
				);

				const handler = getCompleteHandler();
				const result = await handler!({} as any, {
					contributionId: 'wrong_contrib_id',
				});

				expect(result.error).toContain('Contribution not found');
			});
		});

		describe('draft PR validation', () => {
			it('should fail if no draft PR exists', async () => {
				const contributionWithoutPR = createActiveContribution({
					draftPrNumber: undefined,
					draftPrUrl: undefined,
				});
				vi.mocked(fs.readFile).mockResolvedValue(
					JSON.stringify({
						active: [contributionWithoutPR],
						history: [],
						stats: {},
					})
				);

				const handler = getCompleteHandler();
				const result = await handler!({} as any, {
					contributionId: 'contrib_complete_test',
				});

				expect(result.error).toContain('No draft PR exists');
			});

			it('should fail if draftPrNumber is missing but draftPrUrl exists', async () => {
				const contributionWithPartialPR = createActiveContribution({
					draftPrNumber: undefined,
					draftPrUrl: 'https://github.com/owner/repo/pull/99',
				});
				vi.mocked(fs.readFile).mockResolvedValue(
					JSON.stringify({
						active: [contributionWithPartialPR],
						history: [],
						stats: {},
					})
				);

				const handler = getCompleteHandler();
				const result = await handler!({} as any, {
					contributionId: 'contrib_complete_test',
				});

				expect(result.error).toContain('No draft PR exists');
			});
		});

		describe('PR ready marking', () => {
			it('should mark PR as ready for review via gh CLI', async () => {
				vi.mocked(fs.readFile).mockResolvedValue(
					JSON.stringify(createStateWithActiveContribution())
				);
				vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args, cwd) => {
					if (cmd === 'gh' && args?.[0] === 'pr' && args?.[1] === 'ready') {
						expect(args?.[2]).toBe('99'); // PR number
						return { stdout: '', stderr: '', exitCode: 0 };
					}
					if (cmd === 'gh' && args?.[0] === 'pr' && args?.[1] === 'comment') {
						return { stdout: '', stderr: '', exitCode: 0 };
					}
					return { stdout: '', stderr: '', exitCode: 0 };
				});

				const handler = getCompleteHandler();
				const result = await handler!({} as any, {
					contributionId: 'contrib_complete_test',
				});

				expect(result.success).toBe(true);
				expect(result.prUrl).toBe('https://github.com/owner/repo/pull/99');
				expect(result.prNumber).toBe(99);
			});

			it('should handle PR ready failure gracefully', async () => {
				vi.mocked(fs.readFile).mockResolvedValue(
					JSON.stringify(createStateWithActiveContribution())
				);
				vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
					if (cmd === 'gh' && args?.[0] === 'pr' && args?.[1] === 'ready') {
						return { stdout: '', stderr: 'Pull request #99 is not a draft', exitCode: 1 };
					}
					return { stdout: '', stderr: '', exitCode: 0 };
				});

				const handler = getCompleteHandler();
				const result = await handler!({} as any, {
					contributionId: 'contrib_complete_test',
				});

				expect(result.error).toContain('Pull request #99 is not a draft');

				// Verify contribution status was updated to failed (get the last/final state write)
				const writtenState = getFinalStateWrite();
				expect(writtenState).toBeDefined();
				expect(writtenState.active[0].status).toBe('failed');
				expect(writtenState.active[0].error).toContain('Pull request #99 is not a draft');
			});
		});

		describe('PR comment posting', () => {
			it('should post PR comment with contribution stats', async () => {
				vi.mocked(fs.readFile).mockResolvedValue(
					JSON.stringify(createStateWithActiveContribution())
				);
				let commentBody = '';
				vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
					if (cmd === 'gh' && args?.[0] === 'pr' && args?.[1] === 'ready') {
						return { stdout: '', stderr: '', exitCode: 0 };
					}
					if (cmd === 'gh' && args?.[0] === 'pr' && args?.[1] === 'comment') {
						commentBody = args?.[4] as string; // --body argument
						return { stdout: '', stderr: '', exitCode: 0 };
					}
					return { stdout: '', stderr: '', exitCode: 0 };
				});

				const handler = getCompleteHandler();
				await handler!({} as any, {
					contributionId: 'contrib_complete_test',
				});

				// Verify comment was posted with stats
				expect(commentBody).toContain('Symphony Contribution Summary');
				expect(commentBody).toContain('5,000'); // inputTokens
				expect(commentBody).toContain('2,500'); // outputTokens
				expect(commentBody).toContain('$0.50'); // estimatedCost
				expect(commentBody).toContain('Documents Processed');
				expect(commentBody).toContain('Tasks Completed');
			});

			it('should use provided stats over stored values', async () => {
				vi.mocked(fs.readFile).mockResolvedValue(
					JSON.stringify(createStateWithActiveContribution())
				);
				let commentBody = '';
				vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
					if (cmd === 'gh' && args?.[0] === 'pr' && args?.[1] === 'ready') {
						return { stdout: '', stderr: '', exitCode: 0 };
					}
					if (cmd === 'gh' && args?.[0] === 'pr' && args?.[1] === 'comment') {
						commentBody = args?.[4] as string;
						return { stdout: '', stderr: '', exitCode: 0 };
					}
					return { stdout: '', stderr: '', exitCode: 0 };
				});

				const handler = getCompleteHandler();
				await handler!({} as any, {
					contributionId: 'contrib_complete_test',
					stats: {
						inputTokens: 10000,
						outputTokens: 5000,
						estimatedCost: 1.25,
						timeSpentMs: 300000,
						documentsProcessed: 5,
						tasksCompleted: 15,
					},
				});

				// Verify comment used provided stats
				expect(commentBody).toContain('10,000'); // provided inputTokens, not 5,000
				expect(commentBody).toContain('5,000'); // provided outputTokens, not 2,500
				expect(commentBody).toContain('$1.25'); // provided cost, not $0.50
			});
		});

		describe('state transitions', () => {
			it('should move contribution from active to history', async () => {
				vi.mocked(fs.readFile).mockResolvedValue(
					JSON.stringify(createStateWithActiveContribution())
				);
				vi.mocked(execFileNoThrow).mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

				const handler = getCompleteHandler();
				await handler!({} as any, {
					contributionId: 'contrib_complete_test',
				});

				const writtenState = getFinalStateWrite();
				expect(writtenState).toBeDefined();

				// Active should be empty
				expect(writtenState.active).toHaveLength(0);

				// History should have the completed contribution
				expect(writtenState.history).toHaveLength(1);
				expect(writtenState.history[0].id).toBe('contrib_complete_test');
				expect(writtenState.history[0].prUrl).toBe('https://github.com/owner/repo/pull/99');
				expect(writtenState.history[0].prNumber).toBe(99);
				expect(writtenState.history[0].completedAt).toBeDefined();
			});
		});

		describe('contributor stats updates', () => {
			it('should update contributor stats (totals, streak, timestamps)', async () => {
				vi.mocked(fs.readFile).mockResolvedValue(
					JSON.stringify(createStateWithActiveContribution())
				);
				vi.mocked(execFileNoThrow).mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

				const handler = getCompleteHandler();
				await handler!({} as any, {
					contributionId: 'contrib_complete_test',
				});

				const writtenState = getFinalStateWrite();
				expect(writtenState).toBeDefined();

				// totalContributions should be incremented
				expect(writtenState.stats.totalContributions).toBe(6); // was 5

				// totalDocumentsProcessed should be incremented by completed docs
				expect(writtenState.stats.totalDocumentsProcessed).toBe(22); // was 20, +2 completedDocuments

				// totalTasksCompleted should be incremented by completed tasks
				expect(writtenState.stats.totalTasksCompleted).toBe(58); // was 50, +8 completedTasks

				// totalTokensUsed should be incremented
				expect(writtenState.stats.totalTokensUsed).toBe(107500); // was 100000, +(5000+2500)

				// totalTimeSpent should be incremented
				expect(writtenState.stats.totalTimeSpent).toBe(7380000); // was 7200000, +180000

				// estimatedCostDonated should be incremented
				expect(writtenState.stats.estimatedCostDonated).toBeCloseTo(10.5, 2); // was 10.00, +0.50

				// lastContributionAt should be set
				expect(writtenState.stats.lastContributionAt).toBeDefined();
			});

			it('should add repository to repositoriesContributed if new', async () => {
				vi.mocked(fs.readFile).mockResolvedValue(
					JSON.stringify(createStateWithActiveContribution())
				);
				vi.mocked(execFileNoThrow).mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

				const handler = getCompleteHandler();
				await handler!({} as any, {
					contributionId: 'contrib_complete_test',
				});

				const writtenState = getFinalStateWrite();
				expect(writtenState).toBeDefined();

				// Should have added owner/repo to the list
				expect(writtenState.stats.repositoriesContributed).toContain('owner/repo');
				expect(writtenState.stats.repositoriesContributed).toHaveLength(3); // was 2, now 3
			});

			it('should not duplicate repository in repositoriesContributed', async () => {
				const stateWithExistingRepo = createStateWithActiveContribution();
				stateWithExistingRepo.stats.repositoriesContributed.push('owner/repo'); // Already in list
				vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(stateWithExistingRepo));
				vi.mocked(execFileNoThrow).mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

				const handler = getCompleteHandler();
				await handler!({} as any, {
					contributionId: 'contrib_complete_test',
				});

				const writtenState = getFinalStateWrite();
				expect(writtenState).toBeDefined();

				// Should not have duplicated the repo
				const repoCount = writtenState.stats.repositoriesContributed.filter(
					(r: string) => r === 'owner/repo'
				).length;
				expect(repoCount).toBe(1);
			});
		});

		describe('streak calculations (by week)', () => {
			// Helper to get ISO week number string (matches implementation in symphony.ts)
			const getWeekNumber = (date: Date): string => {
				const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
				const dayNum = d.getUTCDay() || 7;
				d.setUTCDate(d.getUTCDate() + 4 - dayNum);
				const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
				const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
				return `${d.getUTCFullYear()}-W${weekNo}`;
			};

			it('should keep streak same for same week contribution', async () => {
				const currentWeek = getWeekNumber(new Date());
				const stateWithSameWeekContribution = createStateWithActiveContribution();
				stateWithSameWeekContribution.stats.lastContributionDate = currentWeek;
				stateWithSameWeekContribution.stats.currentStreak = 3;
				vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(stateWithSameWeekContribution));
				vi.mocked(execFileNoThrow).mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

				const handler = getCompleteHandler();
				await handler!({} as any, {
					contributionId: 'contrib_complete_test',
				});

				const writtenState = getFinalStateWrite();
				expect(writtenState).toBeDefined();

				// Same week should keep streak the same (already counted this week)
				expect(writtenState.stats.currentStreak).toBe(3);
			});

			it('should increment streak for consecutive week contribution', async () => {
				const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
				const lastWeek = getWeekNumber(oneWeekAgo);
				const stateWithLastWeekContribution = createStateWithActiveContribution();
				stateWithLastWeekContribution.stats.lastContributionDate = lastWeek;
				stateWithLastWeekContribution.stats.currentStreak = 5;
				vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(stateWithLastWeekContribution));
				vi.mocked(execFileNoThrow).mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

				const handler = getCompleteHandler();
				await handler!({} as any, {
					contributionId: 'contrib_complete_test',
				});

				const writtenState = getFinalStateWrite();
				expect(writtenState).toBeDefined();

				// Consecutive week should continue streak
				expect(writtenState.stats.currentStreak).toBe(6);
			});

			it('should reset streak on gap of more than one week', async () => {
				const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
				const oldWeek = getWeekNumber(twoWeeksAgo);
				const stateWithOldContribution = createStateWithActiveContribution();
				stateWithOldContribution.stats.lastContributionDate = oldWeek;
				stateWithOldContribution.stats.currentStreak = 10;
				vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(stateWithOldContribution));
				vi.mocked(execFileNoThrow).mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

				const handler = getCompleteHandler();
				await handler!({} as any, {
					contributionId: 'contrib_complete_test',
				});

				const writtenState = getFinalStateWrite();
				expect(writtenState).toBeDefined();

				// Gap should reset streak to 1
				expect(writtenState.stats.currentStreak).toBe(1);
			});

			it('should update longestStreak when current exceeds it', async () => {
				const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
				const lastWeek = getWeekNumber(oneWeekAgo);
				const stateAboutToBreakRecord = createStateWithActiveContribution();
				stateAboutToBreakRecord.stats.lastContributionDate = lastWeek;
				stateAboutToBreakRecord.stats.currentStreak = 5; // Equal to longest
				stateAboutToBreakRecord.stats.longestStreak = 5;
				vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(stateAboutToBreakRecord));
				vi.mocked(execFileNoThrow).mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

				const handler = getCompleteHandler();
				await handler!({} as any, {
					contributionId: 'contrib_complete_test',
				});

				const writtenState = getFinalStateWrite();
				expect(writtenState).toBeDefined();

				// Should update longest streak to 6
				expect(writtenState.stats.currentStreak).toBe(6);
				expect(writtenState.stats.longestStreak).toBe(6);
			});

			it('should not update longestStreak when current does not exceed it', async () => {
				const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
				const oldWeek = getWeekNumber(twoWeeksAgo);
				const stateWithHighLongest = createStateWithActiveContribution();
				stateWithHighLongest.stats.lastContributionDate = oldWeek; // Gap - will reset
				stateWithHighLongest.stats.currentStreak = 3;
				stateWithHighLongest.stats.longestStreak = 15;
				vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(stateWithHighLongest));
				vi.mocked(execFileNoThrow).mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

				const handler = getCompleteHandler();
				await handler!({} as any, {
					contributionId: 'contrib_complete_test',
				});

				const writtenState = getFinalStateWrite();
				expect(writtenState).toBeDefined();

				// Current should reset to 1, longest should stay at 15
				expect(writtenState.stats.currentStreak).toBe(1);
				expect(writtenState.stats.longestStreak).toBe(15);
			});
		});

		describe('return values', () => {
			it('should return prUrl and prNumber on success', async () => {
				vi.mocked(fs.readFile).mockResolvedValue(
					JSON.stringify(createStateWithActiveContribution())
				);
				vi.mocked(execFileNoThrow).mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

				const handler = getCompleteHandler();
				const result = await handler!({} as any, {
					contributionId: 'contrib_complete_test',
				});

				expect(result.success).toBe(true);
				expect(result.prUrl).toBe('https://github.com/owner/repo/pull/99');
				expect(result.prNumber).toBe(99);
				expect(result.error).toBeUndefined();
			});
		});

		describe('broadcast behavior', () => {
			it('should broadcast symphony:updated on completion', async () => {
				vi.mocked(fs.readFile).mockResolvedValue(
					JSON.stringify(createStateWithActiveContribution())
				);
				vi.mocked(execFileNoThrow).mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

				const handler = getCompleteHandler();
				await handler!({} as any, {
					contributionId: 'contrib_complete_test',
				});

				expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('symphony:updated');
			});
		});
	});

	// ============================================================================
	// Cancel Contribution Tests (symphony:cancel)
	// ============================================================================

	describe('symphony:cancel', () => {
		const getCancelHandler = () => handlers.get('symphony:cancel');

		const createStateWithActiveContributions = () => ({
			active: [
				{
					id: 'contrib_to_cancel',
					repoSlug: 'owner/repo',
					repoName: 'repo',
					issueNumber: 42,
					issueTitle: 'Test Issue',
					localPath: '/tmp/symphony/repos/repo-contrib_to_cancel',
					branchName: 'symphony/issue-42-abc',
					draftPrNumber: 99,
					draftPrUrl: 'https://github.com/owner/repo/pull/99',
					startedAt: '2024-01-01T00:00:00Z',
					status: 'running',
					progress: { totalDocuments: 3, completedDocuments: 1, totalTasks: 10, completedTasks: 5 },
					tokenUsage: { inputTokens: 2000, outputTokens: 1000, estimatedCost: 0.2 },
					timeSpent: 60000,
					sessionId: 'session-456',
					agentType: 'claude-code',
				},
				{
					id: 'contrib_other',
					repoSlug: 'other/repo',
					repoName: 'repo',
					issueNumber: 10,
					status: 'running',
				},
			],
			history: [],
			stats: {},
		});

		describe('contribution removal', () => {
			it('should remove contribution from active list', async () => {
				vi.mocked(fs.readFile).mockResolvedValue(
					JSON.stringify(createStateWithActiveContributions())
				);

				const handler = getCancelHandler();
				const result = await handler!({} as any, 'contrib_to_cancel', false);

				expect(result.cancelled).toBe(true);

				// Verify state was written without the cancelled contribution
				const writeCall = vi
					.mocked(fs.writeFile)
					.mock.calls.find((call) => (call[0] as string).includes('state.json'));
				expect(writeCall).toBeDefined();
				const writtenState = JSON.parse(writeCall![1] as string);

				// Should have removed the contribution
				expect(writtenState.active).toHaveLength(1);
				expect(writtenState.active[0].id).toBe('contrib_other');
				expect(
					writtenState.active.find((c: { id: string }) => c.id === 'contrib_to_cancel')
				).toBeUndefined();
			});

			it('should return cancelled:false if contribution not found', async () => {
				vi.mocked(fs.readFile).mockResolvedValue(
					JSON.stringify({
						active: [],
						history: [],
						stats: {},
					})
				);

				const handler = getCancelHandler();
				const result = await handler!({} as any, 'nonexistent_contrib', false);

				expect(result.cancelled).toBe(false);
			});
		});

		describe('local directory cleanup', () => {
			it('should clean up local directory when cleanup=true', async () => {
				vi.mocked(fs.readFile).mockResolvedValue(
					JSON.stringify(createStateWithActiveContributions())
				);
				vi.mocked(fs.rm).mockResolvedValue(undefined);

				const handler = getCancelHandler();
				await handler!({} as any, 'contrib_to_cancel', true);

				// Verify fs.rm was called with the local path
				expect(fs.rm).toHaveBeenCalledWith('/tmp/symphony/repos/repo-contrib_to_cancel', {
					recursive: true,
					force: true,
				});
			});

			it('should preserve local directory when cleanup=false', async () => {
				vi.mocked(fs.readFile).mockResolvedValue(
					JSON.stringify(createStateWithActiveContributions())
				);
				vi.mocked(fs.rm).mockResolvedValue(undefined);

				const handler = getCancelHandler();
				await handler!({} as any, 'contrib_to_cancel', false);

				// Verify fs.rm was NOT called
				expect(fs.rm).not.toHaveBeenCalled();
			});

			it('should handle directory cleanup errors gracefully', async () => {
				vi.mocked(fs.readFile).mockResolvedValue(
					JSON.stringify(createStateWithActiveContributions())
				);
				vi.mocked(fs.rm).mockRejectedValue(new Error('Permission denied'));

				const handler = getCancelHandler();
				const result = await handler!({} as any, 'contrib_to_cancel', true);

				// Should still succeed even if cleanup fails
				expect(result.cancelled).toBe(true);

				// State should still be updated
				const writeCall = vi
					.mocked(fs.writeFile)
					.mock.calls.find((call) => (call[0] as string).includes('state.json'));
				expect(writeCall).toBeDefined();
				const writtenState = JSON.parse(writeCall![1] as string);
				expect(writtenState.active).toHaveLength(1);
			});
		});

		describe('broadcast behavior', () => {
			it('should broadcast update after cancellation', async () => {
				vi.mocked(fs.readFile).mockResolvedValue(
					JSON.stringify(createStateWithActiveContributions())
				);

				const handler = getCancelHandler();
				await handler!({} as any, 'contrib_to_cancel', false);

				expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('symphony:updated');
			});
		});
	});

	// ============================================================================
	// Check PR Statuses Tests (symphony:checkPRStatuses)
	// ============================================================================

	describe('symphony:checkPRStatuses', () => {
		const getCheckPRStatusesHandler = () => handlers.get('symphony:checkPRStatuses');

		const createStateWithHistory = (
			historyOverrides?: Array<{
				id?: string;
				repoSlug?: string;
				prNumber?: number;
				wasMerged?: boolean;
				wasClosed?: boolean;
			}>
		) => ({
			active: [],
			history:
				historyOverrides?.map((override, i) => ({
					id: override.id || `contrib_${i + 1}`,
					repoSlug: override.repoSlug || 'owner/repo',
					repoName: 'repo',
					issueNumber: i + 1,
					issueTitle: `Issue ${i + 1}`,
					startedAt: '2024-01-01T00:00:00Z',
					completedAt: '2024-01-02T00:00:00Z',
					prUrl: `https://github.com/${override.repoSlug || 'owner/repo'}/pull/${override.prNumber || i + 1}`,
					prNumber: override.prNumber || i + 1,
					tokenUsage: { inputTokens: 1000, outputTokens: 500, totalCost: 0.1 },
					timeSpent: 60000,
					documentsProcessed: 1,
					tasksCompleted: 5,
					wasMerged: override.wasMerged,
					wasClosed: override.wasClosed,
				})) || [],
			stats: {
				totalContributions: 0,
				totalMerged: 0,
				totalIssuesResolved: 0,
				totalDocumentsProcessed: 0,
				totalTasksCompleted: 0,
				totalTokensUsed: 0,
				totalTimeSpent: 0,
				estimatedCostDonated: 0,
				repositoriesContributed: [],
				uniqueMaintainersHelped: 0,
				currentStreak: 0,
				longestStreak: 0,
			},
		});

		describe('history entry checking', () => {
			it('should check all history entries without wasMerged flag', async () => {
				const state = createStateWithHistory([
					{ id: 'pr_1', prNumber: 101, wasMerged: undefined },
					{ id: 'pr_2', prNumber: 102, wasMerged: undefined },
					{ id: 'pr_3', prNumber: 103, wasMerged: true }, // Already tracked
				]);
				vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(state));

				// Mock fetch to return open status for all PRs
				mockFetch.mockResolvedValue({
					ok: true,
					json: () => Promise.resolve({ state: 'open', merged: false, merged_at: null }),
				});

				const handler = getCheckPRStatusesHandler();
				const result = await handler!({} as any);

				// Should only check entries without wasMerged (2 entries)
				expect(result.checked).toBe(2);
				// Verify fetch was called for each unchecked PR
				expect(mockFetch).toHaveBeenCalledTimes(2);
			});

			it('should fetch PR status from GitHub API', async () => {
				const state = createStateWithHistory([
					{ id: 'pr_1', repoSlug: 'myorg/myrepo', prNumber: 123 },
				]);
				vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(state));

				mockFetch.mockResolvedValue({
					ok: true,
					json: () => Promise.resolve({ state: 'open', merged: false, merged_at: null }),
				});

				const handler = getCheckPRStatusesHandler();
				await handler!({} as any);

				// Verify correct GitHub API endpoint was called
				expect(mockFetch).toHaveBeenCalledWith(
					expect.stringContaining('/repos/myorg/myrepo/pulls/123'),
					expect.objectContaining({
						headers: expect.objectContaining({
							Accept: 'application/vnd.github.v3+json',
						}),
					})
				);
			});

			it('should mark PR as merged when API confirms merge', async () => {
				const state = createStateWithHistory([{ id: 'pr_merged', prNumber: 200 }]);
				vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(state));

				mockFetch.mockResolvedValue({
					ok: true,
					json: () =>
						Promise.resolve({
							state: 'closed',
							merged: true,
							merged_at: '2024-01-15T12:00:00Z',
						}),
				});

				const handler = getCheckPRStatusesHandler();
				const result = await handler!({} as any);

				expect(result.merged).toBe(1);

				// Verify state was updated
				const writeCall = vi
					.mocked(fs.writeFile)
					.mock.calls.find((call) => (call[0] as string).includes('state.json'));
				expect(writeCall).toBeDefined();
				const writtenState = JSON.parse(writeCall![1] as string);
				expect(writtenState.history[0].wasMerged).toBe(true);
			});

			it('should set mergedAt timestamp on merge', async () => {
				const state = createStateWithHistory([{ id: 'pr_merged', prNumber: 200 }]);
				vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(state));

				const mergeTimestamp = '2024-02-20T14:30:00Z';
				mockFetch.mockResolvedValue({
					ok: true,
					json: () =>
						Promise.resolve({
							state: 'closed',
							merged: true,
							merged_at: mergeTimestamp,
						}),
				});

				const handler = getCheckPRStatusesHandler();
				await handler!({} as any);

				// Verify mergedAt was set
				const writeCall = vi
					.mocked(fs.writeFile)
					.mock.calls.find((call) => (call[0] as string).includes('state.json'));
				expect(writeCall).toBeDefined();
				const writtenState = JSON.parse(writeCall![1] as string);
				expect(writtenState.history[0].mergedAt).toBe(mergeTimestamp);
			});

			it('should increment totalMerged stat on merge', async () => {
				const state = createStateWithHistory([
					{ id: 'pr_1', prNumber: 101 },
					{ id: 'pr_2', prNumber: 102 },
				]);
				state.stats.totalMerged = 5; // Start with 5
				vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(state));

				// Both PRs merged
				mockFetch.mockResolvedValue({
					ok: true,
					json: () =>
						Promise.resolve({
							state: 'closed',
							merged: true,
							merged_at: '2024-01-15T12:00:00Z',
						}),
				});

				const handler = getCheckPRStatusesHandler();
				await handler!({} as any);

				// Verify totalMerged was incremented by 2
				const writeCall = vi
					.mocked(fs.writeFile)
					.mock.calls.find((call) => (call[0] as string).includes('state.json'));
				expect(writeCall).toBeDefined();
				const writtenState = JSON.parse(writeCall![1] as string);
				expect(writtenState.stats.totalMerged).toBe(7); // 5 + 2
			});

			it('should mark PR as closed when API shows closed state', async () => {
				const state = createStateWithHistory([{ id: 'pr_closed', prNumber: 300 }]);
				vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(state));

				mockFetch.mockResolvedValue({
					ok: true,
					json: () =>
						Promise.resolve({
							state: 'closed',
							merged: false, // Closed but not merged
							merged_at: null,
						}),
				});

				const handler = getCheckPRStatusesHandler();
				const result = await handler!({} as any);

				expect(result.closed).toBe(1);

				// Verify state was updated
				const writeCall = vi
					.mocked(fs.writeFile)
					.mock.calls.find((call) => (call[0] as string).includes('state.json'));
				expect(writeCall).toBeDefined();
				const writtenState = JSON.parse(writeCall![1] as string);
				expect(writtenState.history[0].wasClosed).toBe(true);
				expect(writtenState.history[0].wasMerged).toBeUndefined();
			});

			it('should handle GitHub API errors gracefully', async () => {
				const state = createStateWithHistory([
					{ id: 'pr_1', prNumber: 101 },
					{ id: 'pr_2', prNumber: 102 },
				]);
				vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(state));

				// First PR succeeds, second fails
				mockFetch
					.mockResolvedValueOnce({
						ok: true,
						json: () => Promise.resolve({ state: 'open', merged: false, merged_at: null }),
					})
					.mockResolvedValueOnce({
						ok: false,
						status: 404,
					});

				const handler = getCheckPRStatusesHandler();
				const result = await handler!({} as any);

				// Both were checked
				expect(result.checked).toBe(2);
				// One error recorded
				expect(result.errors).toHaveLength(1);
				expect(result.errors[0]).toContain('102'); // PR number in error
				expect(result.errors[0]).toContain('404');
			});
		});

		describe('active contribution checking', () => {
			it('should check all active contributions with a draft PR', async () => {
				const state = {
					active: [
						{
							id: 'active_1',
							repoSlug: 'owner/repo',
							repoName: 'repo',
							issueNumber: 1,
							issueTitle: 'Active Issue',
							localPath: '/tmp/repo',
							branchName: 'symphony/issue-1-abc',
							draftPrNumber: 500,
							draftPrUrl: 'https://github.com/owner/repo/pull/500',
							startedAt: '2024-01-01T00:00:00Z',
							status: 'ready_for_review',
							progress: {
								totalDocuments: 1,
								completedDocuments: 1,
								totalTasks: 5,
								completedTasks: 5,
							},
							tokenUsage: { inputTokens: 1000, outputTokens: 500, estimatedCost: 0.1 },
							timeSpent: 60000,
							sessionId: 'session-123',
							agentType: 'claude-code',
						},
						{
							id: 'active_2',
							repoSlug: 'owner/repo',
							repoName: 'repo',
							issueNumber: 2,
							draftPrNumber: 501,
							status: 'running', // Running contributions with PR should also be checked
						},
						{
							id: 'active_3',
							repoSlug: 'owner/repo',
							repoName: 'repo',
							issueNumber: 3,
							// No draftPrNumber - should not be checked
							status: 'running',
						},
					],
					history: [],
					stats: { totalMerged: 0 },
				};
				vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(state));

				mockFetch.mockResolvedValue({
					ok: true,
					json: () => Promise.resolve({ state: 'open', merged: false, merged_at: null }),
				});

				const handler = getCheckPRStatusesHandler();
				const result = await handler!({} as any);

				// Should check all contributions with a draft PR (both ready_for_review and running)
				expect(result.checked).toBe(2);
			});

			it('should move merged active contributions to history', async () => {
				const state = {
					active: [
						{
							id: 'active_merged',
							repoSlug: 'owner/repo',
							repoName: 'repo',
							issueNumber: 42,
							issueTitle: 'Merged Active',
							localPath: '/tmp/repo',
							branchName: 'symphony/issue-42-abc',
							draftPrNumber: 600,
							draftPrUrl: 'https://github.com/owner/repo/pull/600',
							startedAt: '2024-01-01T00:00:00Z',
							status: 'ready_for_review',
							progress: {
								totalDocuments: 2,
								completedDocuments: 2,
								totalTasks: 10,
								completedTasks: 8,
							},
							tokenUsage: { inputTokens: 2000, outputTokens: 1000, estimatedCost: 0.2 },
							timeSpent: 120000,
							sessionId: 'session-456',
							agentType: 'claude-code',
						},
					],
					history: [],
					stats: { totalMerged: 3 },
				};
				vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(state));

				mockFetch.mockResolvedValue({
					ok: true,
					json: () =>
						Promise.resolve({
							state: 'closed',
							merged: true,
							merged_at: '2024-02-01T10:00:00Z',
						}),
				});

				const handler = getCheckPRStatusesHandler();
				const result = await handler!({} as any);

				expect(result.merged).toBe(1);

				// Verify contribution was moved to history
				const writeCall = vi
					.mocked(fs.writeFile)
					.mock.calls.find((call) => (call[0] as string).includes('state.json'));
				expect(writeCall).toBeDefined();
				const writtenState = JSON.parse(writeCall![1] as string);

				// Active should be empty
				expect(writtenState.active).toHaveLength(0);

				// History should have the contribution
				expect(writtenState.history).toHaveLength(1);
				expect(writtenState.history[0].id).toBe('active_merged');
				expect(writtenState.history[0].wasMerged).toBe(true);
				expect(writtenState.history[0].prNumber).toBe(600);

				// totalMerged should be incremented
				expect(writtenState.stats.totalMerged).toBe(4);
			});

			it('should broadcast update when changes occur', async () => {
				const state = createStateWithHistory([{ id: 'pr_1', prNumber: 101 }]);
				vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(state));

				mockFetch.mockResolvedValue({
					ok: true,
					json: () =>
						Promise.resolve({
							state: 'closed',
							merged: true,
							merged_at: '2024-01-15T12:00:00Z',
						}),
				});

				const handler = getCheckPRStatusesHandler();
				await handler!({} as any);

				// Verify broadcast was sent
				expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('symphony:updated');
			});

			it('should return summary with checked, merged, closed counts', async () => {
				const state = createStateWithHistory([
					{ id: 'pr_1', prNumber: 101 }, // Will be merged
					{ id: 'pr_2', prNumber: 102 }, // Will be closed
					{ id: 'pr_3', prNumber: 103 }, // Will be open
				]);
				vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(state));

				mockFetch
					.mockResolvedValueOnce({
						ok: true,
						json: () =>
							Promise.resolve({ state: 'closed', merged: true, merged_at: '2024-01-15T12:00:00Z' }),
					})
					.mockResolvedValueOnce({
						ok: true,
						json: () => Promise.resolve({ state: 'closed', merged: false, merged_at: null }),
					})
					.mockResolvedValueOnce({
						ok: true,
						json: () => Promise.resolve({ state: 'open', merged: false, merged_at: null }),
					});

				const handler = getCheckPRStatusesHandler();
				const result = await handler!({} as any);

				expect(result.checked).toBe(3);
				expect(result.merged).toBe(1);
				expect(result.closed).toBe(1);
				expect(result.errors).toEqual([]);
			});
		});
	});

	// ============================================================================
	// Sync Contribution Tests (symphony:syncContribution)
	// ============================================================================

	describe('symphony:syncContribution', () => {
		const getSyncContributionHandler = () => handlers.get('symphony:syncContribution');

		const createActiveContribution = (overrides?: Partial<ActiveContribution>) => ({
			id: 'contrib_123',
			repoSlug: 'owner/repo',
			repoName: 'repo',
			issueNumber: 42,
			issueTitle: 'Test Issue',
			localPath: '/tmp/symphony/repo-contrib_123',
			branchName: 'symphony/issue-42-abc',
			draftPrNumber: undefined,
			draftPrUrl: undefined,
			startedAt: '2024-01-01T00:00:00Z',
			status: 'running',
			progress: {
				totalDocuments: 2,
				completedDocuments: 1,
				totalTasks: 10,
				completedTasks: 5,
			},
			tokenUsage: { inputTokens: 5000, outputTokens: 2500, estimatedCost: 0.5 },
			timeSpent: 120000,
			sessionId: 'session-abc',
			agentType: 'claude-code',
			...overrides,
		});

		it('should return error when contribution not found', async () => {
			const state = {
				active: [],
				history: [],
				stats: { totalMerged: 0 },
			};
			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(state));

			const handler = getSyncContributionHandler();
			const result = await handler!({} as any, 'nonexistent');

			expect(result.success).toBe(false);
			expect(result.error).toContain('not found');
		});

		it('should sync PR info from metadata when missing from state', async () => {
			const contribution = createActiveContribution({ draftPrNumber: undefined });
			const state = {
				active: [contribution],
				history: [],
				stats: { totalMerged: 0 },
			};
			vi.mocked(fs.readFile)
				.mockResolvedValueOnce(JSON.stringify(state)) // First call: read state
				.mockResolvedValueOnce(
					JSON.stringify({
						// Second call: read metadata
						prCreated: true,
						draftPrNumber: 789,
						draftPrUrl: 'https://github.com/owner/repo/pull/789',
					})
				);

			// Mock PR status check
			mockFetch.mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						state: 'open',
						merged: false,
						merged_at: null,
						draft: true,
					}),
			});

			const handler = getSyncContributionHandler();
			const result = await handler!({} as any, 'contrib_123');

			expect(result.success).toBe(true);
			expect(result.prCreated).toBe(true);
			expect(result.message).toContain('789');
		});

		it('should detect merged PR and move to history', async () => {
			const contribution = createActiveContribution({
				draftPrNumber: 456,
				draftPrUrl: 'https://github.com/owner/repo/pull/456',
			});
			const state = {
				active: [contribution],
				history: [],
				stats: { totalMerged: 0 },
			};
			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(state));

			mockFetch.mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						state: 'closed',
						merged: true,
						merged_at: '2024-02-15T10:00:00Z',
						draft: false,
					}),
			});

			const handler = getSyncContributionHandler();
			const result = await handler!({} as any, 'contrib_123');

			expect(result.success).toBe(true);
			expect(result.prMerged).toBe(true);
			expect(result.message).toContain('merged');

			// Verify state was updated with contribution moved to history
			const writeCall = vi
				.mocked(fs.writeFile)
				.mock.calls.find((call) => (call[0] as string).includes('state.json'));
			expect(writeCall).toBeDefined();
			const writtenState = JSON.parse(writeCall![1] as string);
			expect(writtenState.active).toHaveLength(0);
			expect(writtenState.history).toHaveLength(1);
			expect(writtenState.history[0].wasMerged).toBe(true);
			expect(writtenState.stats.totalMerged).toBe(1);
		});

		it('should detect closed PR and move to history', async () => {
			const contribution = createActiveContribution({
				draftPrNumber: 456,
				draftPrUrl: 'https://github.com/owner/repo/pull/456',
			});
			const state = {
				active: [contribution],
				history: [],
				stats: { totalMerged: 0 },
			};
			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(state));

			mockFetch.mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						state: 'closed',
						merged: false,
						merged_at: null,
						draft: false,
					}),
			});

			const handler = getSyncContributionHandler();
			const result = await handler!({} as any, 'contrib_123');

			expect(result.success).toBe(true);
			expect(result.prClosed).toBe(true);
			expect(result.message).toContain('closed');

			// Verify state was updated
			const writeCall = vi
				.mocked(fs.writeFile)
				.mock.calls.find((call) => (call[0] as string).includes('state.json'));
			expect(writeCall).toBeDefined();
			const writtenState = JSON.parse(writeCall![1] as string);
			expect(writtenState.history[0].wasClosed).toBe(true);
		});

		it('should update status when PR is no longer draft', async () => {
			const contribution = createActiveContribution({
				draftPrNumber: 456,
				draftPrUrl: 'https://github.com/owner/repo/pull/456',
				status: 'running',
			});
			const state = {
				active: [contribution],
				history: [],
				stats: { totalMerged: 0 },
			};
			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(state));

			mockFetch.mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						state: 'open',
						merged: false,
						merged_at: null,
						draft: false, // PR is ready for review
					}),
			});

			const handler = getSyncContributionHandler();
			const result = await handler!({} as any, 'contrib_123');

			expect(result.success).toBe(true);
			expect(result.message).toContain('ready for review');

			// Verify status was updated
			const writeCall = vi
				.mocked(fs.writeFile)
				.mock.calls.find((call) => (call[0] as string).includes('state.json'));
			expect(writeCall).toBeDefined();
			const writtenState = JSON.parse(writeCall![1] as string);
			expect(writtenState.active[0].status).toBe('ready_for_review');
		});

		it('should handle GitHub API errors gracefully', async () => {
			const contribution = createActiveContribution({
				draftPrNumber: 456,
				draftPrUrl: 'https://github.com/owner/repo/pull/456',
			});
			const state = {
				active: [contribution],
				history: [],
				stats: { totalMerged: 0 },
			};
			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(state));

			mockFetch.mockResolvedValue({
				ok: false,
				status: 404,
			});

			const handler = getSyncContributionHandler();
			const result = await handler!({} as any, 'contrib_123');

			expect(result.success).toBe(true);
			expect(result.message).toContain('Could not check PR status');
		});
	});
});
