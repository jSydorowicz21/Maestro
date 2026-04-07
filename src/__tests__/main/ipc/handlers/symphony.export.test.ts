/**
 * Symphony IPC handlers - PR, export, and content tests
 *
 * Tests for: symphony:createDraftPR, symphony:fetchDocumentContent,
 * checkGhAuthentication, getDefaultBranch, symphony:manualCredit, label capture
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
	// Create Draft PR (Deferred) Tests (symphony:createDraftPR)
	// ============================================================================

	describe('symphony:createDraftPR', () => {
		const getCreateDraftPRHandler = () => handlers.get('symphony:createDraftPR');

		const createValidMetadata = (
			overrides?: Partial<{
				contributionId: string;
				sessionId: string;
				repoSlug: string;
				issueNumber: number;
				issueTitle: string;
				branchName: string;
				localPath: string;
				prCreated: boolean;
				draftPrNumber?: number;
				draftPrUrl?: string;
				isFork?: boolean;
				forkSlug?: string;
				upstreamSlug?: string;
				upstreamDefaultBranch?: string;
			}>
		) => ({
			contributionId: 'contrib_draft_test',
			sessionId: 'session-789',
			repoSlug: 'owner/repo',
			issueNumber: 42,
			issueTitle: 'Test Issue for Draft PR',
			branchName: 'symphony/issue-42-abc123',
			localPath: '/tmp/symphony/repos/repo-contrib_draft_test',
			prCreated: false,
			...overrides,
		});

		describe('metadata reading', () => {
			it('should read contribution metadata from disk', async () => {
				const metadata = createValidMetadata();
				vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
					if ((filePath as string).includes('metadata.json')) {
						return JSON.stringify(metadata);
					}
					throw new Error('ENOENT');
				});
				vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
					if (cmd === 'gh' && args?.[0] === 'auth')
						return { stdout: 'Logged in', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'symbolic-ref')
						return { stdout: 'refs/remotes/origin/main', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'rev-list')
						return { stdout: '0', stderr: '', exitCode: 0 };
					return { stdout: '', stderr: '', exitCode: 0 };
				});

				const handler = getCreateDraftPRHandler();
				await handler!({} as any, { contributionId: 'contrib_draft_test' });

				// Verify fs.readFile was called with metadata path
				expect(fs.readFile).toHaveBeenCalledWith(
					expect.stringContaining('contrib_draft_test'),
					'utf-8'
				);
			});

			it('should return error if metadata not found', async () => {
				vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

				const handler = getCreateDraftPRHandler();
				const result = await handler!({} as any, { contributionId: 'nonexistent_contrib' });

				expect(result.success).toBe(false);
				expect(result.error).toContain('metadata not found');
			});
		});

		describe('existing PR handling', () => {
			it('should return existing PR info if already created', async () => {
				const metadataWithPR = createValidMetadata({
					prCreated: true,
					draftPrNumber: 123,
					draftPrUrl: 'https://github.com/owner/repo/pull/123',
				});
				vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
					if ((filePath as string).includes('metadata.json')) {
						return JSON.stringify(metadataWithPR);
					}
					throw new Error('ENOENT');
				});

				const handler = getCreateDraftPRHandler();
				const result = await handler!({} as any, { contributionId: 'contrib_draft_test' });

				expect(result.success).toBe(true);
				expect(result.draftPrNumber).toBe(123);
				expect(result.draftPrUrl).toBe('https://github.com/owner/repo/pull/123');
				// No git operations should be attempted
				expect(execFileNoThrow).not.toHaveBeenCalled();
			});
		});

		describe('gh CLI authentication', () => {
			it('should check gh CLI authentication', async () => {
				const metadata = createValidMetadata();
				vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
					if ((filePath as string).includes('metadata.json')) {
						return JSON.stringify(metadata);
					}
					throw new Error('ENOENT');
				});
				vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
					if (cmd === 'gh' && args?.[0] === 'auth')
						return { stdout: '', stderr: 'not logged in', exitCode: 1 };
					return { stdout: '', stderr: '', exitCode: 0 };
				});

				const handler = getCreateDraftPRHandler();
				const result = await handler!({} as any, { contributionId: 'contrib_draft_test' });

				expect(result.success).toBe(false);
				expect(result.error).toContain('not authenticated');
				// execFileNoThrow is called with optional cwd and env args
				expect(execFileNoThrow).toHaveBeenCalledWith(
					'gh',
					['auth', 'status'],
					undefined,
					expect.any(Object)
				);
			});
		});

		describe('commit counting', () => {
			it('should count commits on branch vs base branch', async () => {
				const metadata = createValidMetadata();
				const stateWithActiveContrib = {
					active: [
						{
							id: 'contrib_draft_test',
							repoSlug: 'owner/repo',
							issueNumber: 42,
							status: 'running',
						},
					],
					history: [],
					stats: {},
				};
				vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
					if ((filePath as string).includes('metadata.json')) {
						return JSON.stringify(metadata);
					}
					if ((filePath as string).includes('state.json')) {
						return JSON.stringify(stateWithActiveContrib);
					}
					throw new Error('ENOENT');
				});
				vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args, cwd) => {
					if (cmd === 'gh' && args?.[0] === 'auth')
						return { stdout: 'Logged in', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'symbolic-ref')
						return { stdout: 'refs/remotes/origin/main', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'rev-list') {
						// Verify the correct arguments for counting commits
						expect(args).toContain('--count');
						expect(args?.[2]).toBe('main..HEAD');
						return { stdout: '3', stderr: '', exitCode: 0 };
					}
					if (cmd === 'git' && args?.[0] === 'rev-parse')
						return { stdout: 'symphony/issue-42-abc123', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'push') return { stdout: '', stderr: '', exitCode: 0 };
					if (cmd === 'gh' && args?.[0] === 'pr')
						return { stdout: 'https://github.com/owner/repo/pull/99', stderr: '', exitCode: 0 };
					return { stdout: '', stderr: '', exitCode: 0 };
				});

				const handler = getCreateDraftPRHandler();
				await handler!({} as any, { contributionId: 'contrib_draft_test' });

				// Verify commit count was checked
				expect(execFileNoThrow).toHaveBeenCalledWith(
					'git',
					['rev-list', '--count', 'main..HEAD'],
					expect.any(String)
				);
			});

			it('should return success without PR if no commits yet', async () => {
				const metadata = createValidMetadata();
				vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
					if ((filePath as string).includes('metadata.json')) {
						return JSON.stringify(metadata);
					}
					throw new Error('ENOENT');
				});
				vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
					if (cmd === 'gh' && args?.[0] === 'auth')
						return { stdout: 'Logged in', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'symbolic-ref')
						return { stdout: 'refs/remotes/origin/main', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'rev-list')
						return { stdout: '0', stderr: '', exitCode: 0 }; // No commits
					return { stdout: '', stderr: '', exitCode: 0 };
				});

				const handler = getCreateDraftPRHandler();
				const result = await handler!({} as any, { contributionId: 'contrib_draft_test' });

				expect(result.success).toBe(true);
				// No PR info - indicates no PR was created
				expect(result.draftPrNumber).toBeUndefined();
				expect(result.draftPrUrl).toBeUndefined();
				// git push should not have been called
				const pushCalls = vi
					.mocked(execFileNoThrow)
					.mock.calls.filter((call) => call[0] === 'git' && call[1]?.[0] === 'push');
				expect(pushCalls).toHaveLength(0);
			});
		});

		describe('PR creation', () => {
			it('should push branch and create draft PR when commits exist', async () => {
				const metadata = createValidMetadata();
				const stateWithActiveContrib = {
					active: [
						{
							id: 'contrib_draft_test',
							repoSlug: 'owner/repo',
							issueNumber: 42,
							status: 'running',
						},
					],
					history: [],
					stats: {},
				};
				vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
					if ((filePath as string).includes('metadata.json')) {
						return JSON.stringify(metadata);
					}
					if ((filePath as string).includes('state.json')) {
						return JSON.stringify(stateWithActiveContrib);
					}
					throw new Error('ENOENT');
				});
				vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
					if (cmd === 'gh' && args?.[0] === 'auth')
						return { stdout: 'Logged in', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'symbolic-ref')
						return { stdout: 'refs/remotes/origin/main', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'rev-list')
						return { stdout: '2', stderr: '', exitCode: 0 }; // 2 commits
					if (cmd === 'git' && args?.[0] === 'rev-parse')
						return { stdout: 'symphony/issue-42-abc123', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'push') return { stdout: '', stderr: '', exitCode: 0 };
					if (cmd === 'gh' && args?.[0] === 'pr' && args?.[1] === 'create') {
						expect(args).toContain('--draft');
						return { stdout: 'https://github.com/owner/repo/pull/55', stderr: '', exitCode: 0 };
					}
					return { stdout: '', stderr: '', exitCode: 0 };
				});

				const handler = getCreateDraftPRHandler();
				const result = await handler!({} as any, { contributionId: 'contrib_draft_test' });

				expect(result.success).toBe(true);
				expect(result.draftPrNumber).toBe(55);
				expect(result.draftPrUrl).toBe('https://github.com/owner/repo/pull/55');

				// Verify push was called
				expect(execFileNoThrow).toHaveBeenCalledWith(
					'git',
					expect.arrayContaining(['push', '-u', 'origin']),
					expect.any(String)
				);

				// Verify PR creation was called with --draft
				const prCreateCall = vi
					.mocked(execFileNoThrow)
					.mock.calls.find(
						(call) => call[0] === 'gh' && call[1]?.[0] === 'pr' && call[1]?.[1] === 'create'
					);
				expect(prCreateCall).toBeDefined();
				expect(prCreateCall![1]).toContain('--draft');
			});
		});

		describe('metadata updates', () => {
			it('should update metadata.json with PR info', async () => {
				const metadata = createValidMetadata();
				const stateWithActiveContrib = {
					active: [
						{
							id: 'contrib_draft_test',
							repoSlug: 'owner/repo',
							issueNumber: 42,
							status: 'running',
						},
					],
					history: [],
					stats: {},
				};
				vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
					if ((filePath as string).includes('metadata.json')) {
						return JSON.stringify(metadata);
					}
					if ((filePath as string).includes('state.json')) {
						return JSON.stringify(stateWithActiveContrib);
					}
					throw new Error('ENOENT');
				});
				vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
					if (cmd === 'gh' && args?.[0] === 'auth')
						return { stdout: 'Logged in', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'symbolic-ref')
						return { stdout: 'refs/remotes/origin/main', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'rev-list')
						return { stdout: '1', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'rev-parse')
						return { stdout: 'symphony/issue-42-abc123', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'push') return { stdout: '', stderr: '', exitCode: 0 };
					if (cmd === 'gh' && args?.[0] === 'pr')
						return { stdout: 'https://github.com/owner/repo/pull/77', stderr: '', exitCode: 0 };
					return { stdout: '', stderr: '', exitCode: 0 };
				});

				const handler = getCreateDraftPRHandler();
				await handler!({} as any, { contributionId: 'contrib_draft_test' });

				// Verify metadata.json was updated with PR info
				const metadataWriteCall = vi
					.mocked(fs.writeFile)
					.mock.calls.find((call) => (call[0] as string).includes('metadata.json'));
				expect(metadataWriteCall).toBeDefined();

				const updatedMetadata = JSON.parse(metadataWriteCall![1] as string);
				expect(updatedMetadata.prCreated).toBe(true);
				expect(updatedMetadata.draftPrNumber).toBe(77);
				expect(updatedMetadata.draftPrUrl).toBe('https://github.com/owner/repo/pull/77');
			});

			it('should update state.json active contribution with PR info', async () => {
				const metadata = createValidMetadata();
				const stateWithActiveContrib = {
					active: [
						{
							id: 'contrib_draft_test',
							repoSlug: 'owner/repo',
							issueNumber: 42,
							status: 'running',
						},
					],
					history: [],
					stats: {},
				};
				vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
					if ((filePath as string).includes('metadata.json')) {
						return JSON.stringify(metadata);
					}
					if ((filePath as string).includes('state.json')) {
						return JSON.stringify(stateWithActiveContrib);
					}
					throw new Error('ENOENT');
				});
				vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
					if (cmd === 'gh' && args?.[0] === 'auth')
						return { stdout: 'Logged in', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'symbolic-ref')
						return { stdout: 'refs/remotes/origin/main', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'rev-list')
						return { stdout: '1', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'rev-parse')
						return { stdout: 'symphony/issue-42-abc123', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'push') return { stdout: '', stderr: '', exitCode: 0 };
					if (cmd === 'gh' && args?.[0] === 'pr')
						return { stdout: 'https://github.com/owner/repo/pull/100', stderr: '', exitCode: 0 };
					return { stdout: '', stderr: '', exitCode: 0 };
				});

				const handler = getCreateDraftPRHandler();
				await handler!({} as any, { contributionId: 'contrib_draft_test' });

				// Verify state.json was updated with PR info
				const stateWriteCall = vi
					.mocked(fs.writeFile)
					.mock.calls.find((call) => (call[0] as string).includes('state.json'));
				expect(stateWriteCall).toBeDefined();

				const updatedState = JSON.parse(stateWriteCall![1] as string);
				const activeContrib = updatedState.active.find((c: any) => c.id === 'contrib_draft_test');
				expect(activeContrib).toBeDefined();
				expect(activeContrib.draftPrNumber).toBe(100);
				expect(activeContrib.draftPrUrl).toBe('https://github.com/owner/repo/pull/100');
			});
		});

		describe('event broadcasting', () => {
			it('should broadcast symphony:prCreated event', async () => {
				const metadata = createValidMetadata();
				const stateWithActiveContrib = {
					active: [
						{
							id: 'contrib_draft_test',
							repoSlug: 'owner/repo',
							issueNumber: 42,
							status: 'running',
						},
					],
					history: [],
					stats: {},
				};
				vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
					if ((filePath as string).includes('metadata.json')) {
						return JSON.stringify(metadata);
					}
					if ((filePath as string).includes('state.json')) {
						return JSON.stringify(stateWithActiveContrib);
					}
					throw new Error('ENOENT');
				});
				vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
					if (cmd === 'gh' && args?.[0] === 'auth')
						return { stdout: 'Logged in', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'symbolic-ref')
						return { stdout: 'refs/remotes/origin/main', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'rev-list')
						return { stdout: '5', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'rev-parse')
						return { stdout: 'symphony/issue-42-abc123', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'push') return { stdout: '', stderr: '', exitCode: 0 };
					if (cmd === 'gh' && args?.[0] === 'pr')
						return { stdout: 'https://github.com/owner/repo/pull/88', stderr: '', exitCode: 0 };
					return { stdout: '', stderr: '', exitCode: 0 };
				});

				const handler = getCreateDraftPRHandler();
				await handler!({} as any, { contributionId: 'contrib_draft_test' });

				// Verify broadcast was sent
				expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
					'symphony:prCreated',
					expect.objectContaining({
						contributionId: 'contrib_draft_test',
						sessionId: 'session-789',
						draftPrNumber: 88,
						draftPrUrl: 'https://github.com/owner/repo/pull/88',
					})
				);
			});
		});

		describe('return values', () => {
			it('should return draftPrNumber and draftPrUrl on success', async () => {
				const metadata = createValidMetadata();
				const stateWithActiveContrib = {
					active: [
						{
							id: 'contrib_draft_test',
							repoSlug: 'owner/repo',
							issueNumber: 42,
							status: 'running',
						},
					],
					history: [],
					stats: {},
				};
				vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
					if ((filePath as string).includes('metadata.json')) {
						return JSON.stringify(metadata);
					}
					if ((filePath as string).includes('state.json')) {
						return JSON.stringify(stateWithActiveContrib);
					}
					throw new Error('ENOENT');
				});
				vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
					if (cmd === 'gh' && args?.[0] === 'auth')
						return { stdout: 'Logged in', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'symbolic-ref')
						return { stdout: 'refs/remotes/origin/main', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'rev-list')
						return { stdout: '3', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'rev-parse')
						return { stdout: 'symphony/issue-42-abc123', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'push') return { stdout: '', stderr: '', exitCode: 0 };
					if (cmd === 'gh' && args?.[0] === 'pr')
						return { stdout: 'https://github.com/owner/repo/pull/101', stderr: '', exitCode: 0 };
					return { stdout: '', stderr: '', exitCode: 0 };
				});

				const handler = getCreateDraftPRHandler();
				const result = await handler!({} as any, { contributionId: 'contrib_draft_test' });

				expect(result.success).toBe(true);
				expect(result.draftPrNumber).toBe(101);
				expect(result.draftPrUrl).toBe('https://github.com/owner/repo/pull/101');
				expect(result.error).toBeUndefined();
			});
		});

		describe('fork support', () => {
			it('should pass fork info to gh pr create when metadata has fork info', async () => {
				const metadata = createValidMetadata({
					isFork: true,
					forkSlug: 'chris/repo',
					upstreamSlug: 'owner/repo',
					upstreamDefaultBranch: 'develop',
				});
				const stateWithActiveContrib = {
					active: [
						{
							id: 'contrib_draft_test',
							repoSlug: 'owner/repo',
							issueNumber: 42,
							status: 'running',
						},
					],
					history: [],
					stats: {},
				};
				vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
					if ((filePath as string).includes('metadata.json')) {
						return JSON.stringify(metadata);
					}
					if ((filePath as string).includes('state.json')) {
						return JSON.stringify(stateWithActiveContrib);
					}
					throw new Error('ENOENT');
				});
				vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
					if (cmd === 'gh' && args?.[0] === 'auth')
						return { stdout: 'Logged in', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'symbolic-ref')
						return { stdout: 'refs/remotes/origin/main', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'rev-list')
						return { stdout: '1', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'rev-parse')
						return { stdout: 'symphony/issue-42-abc123', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'push') return { stdout: '', stderr: '', exitCode: 0 };
					if (cmd === 'gh' && args?.[0] === 'pr')
						return { stdout: 'https://github.com/owner/repo/pull/50', stderr: '', exitCode: 0 };
					return { stdout: '', stderr: '', exitCode: 0 };
				});

				const handler = getCreateDraftPRHandler();
				const result = await handler!({} as any, { contributionId: 'contrib_draft_test' });

				expect(result.success).toBe(true);

				// Verify gh pr create was called with fork args
				const prCall = vi
					.mocked(execFileNoThrow)
					.mock.calls.find(
						(call) => call[0] === 'gh' && call[1]?.[0] === 'pr' && call[1]?.[1] === 'create'
					);
				expect(prCall).toBeDefined();
				const prArgs = prCall![1] as string[];
				// Should have --head chris:branchName
				const headIdx = prArgs.indexOf('--head');
				expect(headIdx).toBeGreaterThanOrEqual(0);
				expect(prArgs[headIdx + 1]).toMatch(/^chris:/);
				// Should have --repo owner/repo
				const repoIdx = prArgs.indexOf('--repo');
				expect(repoIdx).toBeGreaterThanOrEqual(0);
				expect(prArgs[repoIdx + 1]).toBe('owner/repo');
				// Should use upstreamDefaultBranch from metadata as --base
				const baseIdx = prArgs.indexOf('--base');
				expect(baseIdx).toBeGreaterThanOrEqual(0);
				expect(prArgs[baseIdx + 1]).toBe('develop');
			});

			it('should not pass fork args when metadata has no fork info', async () => {
				const metadata = createValidMetadata();
				const stateWithActiveContrib = {
					active: [
						{
							id: 'contrib_draft_test',
							repoSlug: 'owner/repo',
							issueNumber: 42,
							status: 'running',
						},
					],
					history: [],
					stats: {},
				};
				vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
					if ((filePath as string).includes('metadata.json')) {
						return JSON.stringify(metadata);
					}
					if ((filePath as string).includes('state.json')) {
						return JSON.stringify(stateWithActiveContrib);
					}
					throw new Error('ENOENT');
				});
				vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
					if (cmd === 'gh' && args?.[0] === 'auth')
						return { stdout: 'Logged in', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'symbolic-ref')
						return { stdout: 'refs/remotes/origin/main', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'rev-list')
						return { stdout: '1', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'rev-parse')
						return { stdout: 'symphony/issue-42-abc123', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'push') return { stdout: '', stderr: '', exitCode: 0 };
					if (cmd === 'gh' && args?.[0] === 'pr')
						return { stdout: 'https://github.com/owner/repo/pull/50', stderr: '', exitCode: 0 };
					return { stdout: '', stderr: '', exitCode: 0 };
				});

				const handler = getCreateDraftPRHandler();
				const result = await handler!({} as any, { contributionId: 'contrib_draft_test' });

				expect(result.success).toBe(true);

				// Verify gh pr create was called WITHOUT --repo flag
				const prCall = vi
					.mocked(execFileNoThrow)
					.mock.calls.find(
						(call) => call[0] === 'gh' && call[1]?.[0] === 'pr' && call[1]?.[1] === 'create'
					);
				expect(prCall).toBeDefined();
				const prArgs = prCall![1] as string[];
				expect(prArgs).not.toContain('--repo');
				// --head should be just the branch name, not prefixed
				const headIdx = prArgs.indexOf('--head');
				expect(headIdx).toBeGreaterThanOrEqual(0);
				expect(prArgs[headIdx + 1]).not.toContain(':');
			});

			it('should pass --repo but not fork-prefixed --head when metadata has upstreamSlug only', async () => {
				const metadata = createValidMetadata({
					upstreamSlug: 'owner/repo',
				});
				const stateWithActiveContrib = {
					active: [
						{
							id: 'contrib_draft_test',
							repoSlug: 'owner/repo',
							issueNumber: 42,
							status: 'running',
						},
					],
					history: [],
					stats: {},
				};
				vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
					if ((filePath as string).includes('metadata.json')) {
						return JSON.stringify(metadata);
					}
					if ((filePath as string).includes('state.json')) {
						return JSON.stringify(stateWithActiveContrib);
					}
					throw new Error('ENOENT');
				});
				vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
					if (cmd === 'gh' && args?.[0] === 'auth')
						return { stdout: 'Logged in', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'symbolic-ref')
						return { stdout: 'refs/remotes/origin/main', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'rev-list')
						return { stdout: '1', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'rev-parse')
						return { stdout: 'symphony/issue-42-abc123', stderr: '', exitCode: 0 };
					if (cmd === 'git' && args?.[0] === 'push') return { stdout: '', stderr: '', exitCode: 0 };
					if (cmd === 'gh' && args?.[0] === 'pr')
						return { stdout: 'https://github.com/owner/repo/pull/50', stderr: '', exitCode: 0 };
					return { stdout: '', stderr: '', exitCode: 0 };
				});

				const handler = getCreateDraftPRHandler();
				const result = await handler!({} as any, { contributionId: 'contrib_draft_test' });

				expect(result.success).toBe(true);

				// Verify gh pr create was called with --repo but no fork-prefixed --head
				const prCall = vi
					.mocked(execFileNoThrow)
					.mock.calls.find(
						(call) => call[0] === 'gh' && call[1]?.[0] === 'pr' && call[1]?.[1] === 'create'
					);
				expect(prCall).toBeDefined();
				const prArgs = prCall![1] as string[];
				// Should have --repo owner/repo (upstream slug from metadata)
				const repoIdx = prArgs.indexOf('--repo');
				expect(repoIdx).toBeGreaterThan(-1);
				expect(prArgs[repoIdx + 1]).toBe('owner/repo');
				// --head should be just the branch name (no fork owner prefix since no forkSlug)
				const headIdx = prArgs.indexOf('--head');
				expect(headIdx).toBeGreaterThanOrEqual(0);
				expect(prArgs[headIdx + 1]).not.toContain(':');
			});
		});
	});

	// ============================================================================
	// Fetch Document Content Tests (symphony:fetchDocumentContent)
	// ============================================================================

	describe('symphony:fetchDocumentContent', () => {
		const getFetchDocumentContentHandler = () => handlers.get('symphony:fetchDocumentContent');

		describe('URL validation', () => {
			it('should accept github.com URLs', async () => {
				mockFetch.mockResolvedValueOnce({
					ok: true,
					text: () => Promise.resolve('# Document Content'),
				});

				const handler = getFetchDocumentContentHandler();
				const result = await handler!({} as any, {
					url: 'https://github.com/owner/repo/blob/main/README.md',
				});

				expect(result.success).toBe(true);
				expect(result.content).toBe('# Document Content');
			});

			it('should accept raw.githubusercontent.com URLs', async () => {
				mockFetch.mockResolvedValueOnce({
					ok: true,
					text: () => Promise.resolve('Raw file content'),
				});

				const handler = getFetchDocumentContentHandler();
				const result = await handler!({} as any, {
					url: 'https://raw.githubusercontent.com/owner/repo/main/file.md',
				});

				expect(result.success).toBe(true);
				expect(result.content).toBe('Raw file content');
			});

			it('should accept objects.githubusercontent.com URLs', async () => {
				mockFetch.mockResolvedValueOnce({
					ok: true,
					text: () => Promise.resolve('Object storage content'),
				});

				const handler = getFetchDocumentContentHandler();
				const result = await handler!({} as any, {
					url: 'https://objects.githubusercontent.com/storage/file.md',
				});

				expect(result.success).toBe(true);
				expect(result.content).toBe('Object storage content');
			});

			it('should reject non-GitHub domains', async () => {
				const handler = getFetchDocumentContentHandler();
				const result = await handler!({} as any, { url: 'https://gitlab.com/owner/repo/file.md' });

				expect(result.success).toBe(false);
				expect(result.error).toContain('GitHub');
			});

			it('should reject HTTP protocol', async () => {
				const handler = getFetchDocumentContentHandler();
				const result = await handler!({} as any, { url: 'http://github.com/owner/repo/file.md' });

				expect(result.success).toBe(false);
				expect(result.error).toContain('HTTPS');
			});

			it('should reject invalid URL formats', async () => {
				const handler = getFetchDocumentContentHandler();
				const result = await handler!({} as any, { url: 'not-a-valid-url' });

				expect(result.success).toBe(false);
				expect(result.error).toContain('Invalid URL');
			});
		});

		describe('fetch behavior', () => {
			it('should fetch and return document text content', async () => {
				const documentContent = `# Task Description

This is a Symphony task document.

## Requirements
- Complete feature X
- Add tests
`;
				mockFetch.mockResolvedValueOnce({
					ok: true,
					text: () => Promise.resolve(documentContent),
				});

				const handler = getFetchDocumentContentHandler();
				const result = await handler!({} as any, {
					url: 'https://raw.githubusercontent.com/owner/repo/main/task.md',
				});

				expect(result.success).toBe(true);
				expect(result.content).toBe(documentContent);
				expect(mockFetch).toHaveBeenCalledWith(
					'https://raw.githubusercontent.com/owner/repo/main/task.md'
				);
			});

			it('should handle fetch errors gracefully', async () => {
				mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

				const handler = getFetchDocumentContentHandler();
				const result = await handler!({} as any, {
					url: 'https://raw.githubusercontent.com/owner/repo/main/file.md',
				});

				expect(result.success).toBe(false);
				expect(result.error).toContain('Network timeout');
			});
		});
	});

	// ============================================================================
	// Git Helper Function Tests (via mocked execFileNoThrow)
	// ============================================================================

	describe('checkGhAuthentication (via symphony:startContribution)', () => {
		const getStartContributionHandler = () => handlers.get('symphony:startContribution');

		it('should return authenticated:true when gh auth status succeeds', async () => {
			// Setup mocks for a successful flow - gh auth check passes
			vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
			vi.mocked(fs.mkdir).mockResolvedValue(undefined);
			vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
				if (cmd === 'gh' && args?.[0] === 'auth') {
					return { stdout: 'Logged in to github.com', stderr: '', exitCode: 0 };
				}
				if (cmd === 'git' && args?.[0] === 'checkout') {
					return { stdout: '', stderr: '', exitCode: 0 };
				}
				if (cmd === 'git' && args?.[0] === 'symbolic-ref') {
					return { stdout: 'refs/remotes/origin/main', stderr: '', exitCode: 0 };
				}
				return { stdout: '', stderr: '', exitCode: 0 };
			});

			const handler = getStartContributionHandler();
			const result = await handler!({} as any, {
				contributionId: 'contrib_auth_test',
				sessionId: 'session-auth',
				repoSlug: 'owner/repo',
				issueNumber: 1,
				issueTitle: 'Test',
				localPath: '/tmp/test',
				documentPaths: [],
			});

			// If auth passed, handler should continue (success depends on subsequent operations)
			// The key is that it doesn't fail with auth error
			// Either success is true, or if there's an error, it's not about authentication
			if (result.error) {
				expect(result.error).not.toContain('authenticated');
				expect(result.error).not.toContain('gh auth login');
				expect(result.error).not.toContain('not installed');
			}
			// Auth passed - the operation continued past the auth check
			expect(result.success === true || !result.error?.includes('auth')).toBe(true);
		});

		it('should return authenticated:false with proper message when not logged in', async () => {
			vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
			vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
				if (cmd === 'gh' && args?.[0] === 'auth') {
					return { stdout: '', stderr: 'not logged in', exitCode: 1 };
				}
				return { stdout: '', stderr: '', exitCode: 0 };
			});

			const handler = getStartContributionHandler();
			const result = await handler!({} as any, {
				contributionId: 'contrib_no_auth',
				sessionId: 'session-auth',
				repoSlug: 'owner/repo',
				issueNumber: 1,
				issueTitle: 'Test',
				localPath: '/tmp/test',
				documentPaths: [],
			});

			expect(result.success).toBe(false);
			expect(result.error).toContain('gh auth login');
		});

		it('should return error when gh CLI is not installed', async () => {
			vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
			vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
				if (cmd === 'gh' && args?.[0] === 'auth') {
					return { stdout: '', stderr: 'command not found', exitCode: 127 };
				}
				return { stdout: '', stderr: '', exitCode: 0 };
			});

			const handler = getStartContributionHandler();
			const result = await handler!({} as any, {
				contributionId: 'contrib_no_gh',
				sessionId: 'session-auth',
				repoSlug: 'owner/repo',
				issueNumber: 1,
				issueTitle: 'Test',
				localPath: '/tmp/test',
				documentPaths: [],
			});

			expect(result.success).toBe(false);
			expect(result.error).toContain('not installed');
		});
	});

	describe('getDefaultBranch (via symphony:createDraftPR)', () => {
		const getCreateDraftPRHandler = () => handlers.get('symphony:createDraftPR');

		const createMetadataForBranchTest = (localPath: string) => ({
			contributionId: 'contrib_branch_test',
			sessionId: 'session-branch',
			repoSlug: 'owner/repo',
			issueNumber: 42,
			issueTitle: 'Test Issue',
			branchName: 'symphony/issue-42-xyz',
			localPath,
			prCreated: false,
		});

		it('should return branch from symbolic-ref when available', async () => {
			const metadata = createMetadataForBranchTest('/tmp/repo-with-develop');
			vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
				if ((filePath as string).includes('metadata.json')) {
					return JSON.stringify(metadata);
				}
				throw new Error('ENOENT');
			});
			vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
				if (cmd === 'gh' && args?.[0] === 'auth')
					return { stdout: 'Logged in', stderr: '', exitCode: 0 };
				if (cmd === 'git' && args?.[0] === 'symbolic-ref') {
					return { stdout: 'refs/remotes/origin/develop', stderr: '', exitCode: 0 };
				}
				if (cmd === 'git' && args?.[0] === 'rev-list')
					return { stdout: '1', stderr: '', exitCode: 0 };
				if (cmd === 'git' && args?.[0] === 'rev-parse')
					return { stdout: 'symphony/issue-42-xyz', stderr: '', exitCode: 0 };
				if (cmd === 'git' && args?.[0] === 'push') return { stdout: '', stderr: '', exitCode: 0 };
				if (cmd === 'gh' && args?.[0] === 'pr' && args?.[1] === 'create') {
					// Verify the base branch is 'develop' from symbolic-ref
					const baseIndex = args?.indexOf('--base');
					if (baseIndex !== undefined && baseIndex >= 0 && args?.[baseIndex + 1] === 'develop') {
						return { stdout: 'https://github.com/owner/repo/pull/1', stderr: '', exitCode: 0 };
					}
					return { stdout: '', stderr: 'Wrong base branch', exitCode: 1 };
				}
				return { stdout: '', stderr: '', exitCode: 0 };
			});

			const handler = getCreateDraftPRHandler();
			const result = await handler!({} as any, { contributionId: 'contrib_branch_test' });

			expect(result.success).toBe(true);
		});

		it('should fall back to checking for main branch', async () => {
			const metadata = createMetadataForBranchTest('/tmp/repo-fallback-main');
			vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
				if ((filePath as string).includes('metadata.json')) {
					return JSON.stringify(metadata);
				}
				throw new Error('ENOENT');
			});
			vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
				if (cmd === 'gh' && args?.[0] === 'auth')
					return { stdout: 'Logged in', stderr: '', exitCode: 0 };
				if (cmd === 'git' && args?.[0] === 'symbolic-ref') {
					// Symbolic-ref fails (no HEAD set)
					return {
						stdout: '',
						stderr: 'fatal: ref refs/remotes/origin/HEAD is not a symbolic ref',
						exitCode: 1,
					};
				}
				if (cmd === 'git' && args?.[0] === 'ls-remote' && args?.includes('main')) {
					return { stdout: 'abc123\trefs/heads/main', stderr: '', exitCode: 0 };
				}
				if (cmd === 'git' && args?.[0] === 'rev-list')
					return { stdout: '1', stderr: '', exitCode: 0 };
				if (cmd === 'git' && args?.[0] === 'rev-parse')
					return { stdout: 'symphony/issue-42-xyz', stderr: '', exitCode: 0 };
				if (cmd === 'git' && args?.[0] === 'push') return { stdout: '', stderr: '', exitCode: 0 };
				if (cmd === 'gh' && args?.[0] === 'pr' && args?.[1] === 'create') {
					const baseIndex = args?.indexOf('--base');
					if (baseIndex !== undefined && baseIndex >= 0 && args?.[baseIndex + 1] === 'main') {
						return { stdout: 'https://github.com/owner/repo/pull/2', stderr: '', exitCode: 0 };
					}
					return { stdout: '', stderr: 'Wrong base branch', exitCode: 1 };
				}
				return { stdout: '', stderr: '', exitCode: 0 };
			});

			const handler = getCreateDraftPRHandler();
			const result = await handler!({} as any, { contributionId: 'contrib_branch_test' });

			expect(result.success).toBe(true);
		});

		it('should fall back to checking for master branch', async () => {
			const metadata = createMetadataForBranchTest('/tmp/repo-fallback-master');
			vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
				if ((filePath as string).includes('metadata.json')) {
					return JSON.stringify(metadata);
				}
				throw new Error('ENOENT');
			});
			vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
				if (cmd === 'gh' && args?.[0] === 'auth')
					return { stdout: 'Logged in', stderr: '', exitCode: 0 };
				if (cmd === 'git' && args?.[0] === 'symbolic-ref') {
					return {
						stdout: '',
						stderr: 'fatal: ref refs/remotes/origin/HEAD is not a symbolic ref',
						exitCode: 1,
					};
				}
				if (cmd === 'git' && args?.[0] === 'ls-remote' && args?.includes('main')) {
					// main branch doesn't exist
					return { stdout: '', stderr: '', exitCode: 0 };
				}
				if (cmd === 'git' && args?.[0] === 'ls-remote' && args?.includes('master')) {
					return { stdout: 'def456\trefs/heads/master', stderr: '', exitCode: 0 };
				}
				if (cmd === 'git' && args?.[0] === 'rev-list')
					return { stdout: '1', stderr: '', exitCode: 0 };
				if (cmd === 'git' && args?.[0] === 'rev-parse')
					return { stdout: 'symphony/issue-42-xyz', stderr: '', exitCode: 0 };
				if (cmd === 'git' && args?.[0] === 'push') return { stdout: '', stderr: '', exitCode: 0 };
				if (cmd === 'gh' && args?.[0] === 'pr' && args?.[1] === 'create') {
					const baseIndex = args?.indexOf('--base');
					if (baseIndex !== undefined && baseIndex >= 0 && args?.[baseIndex + 1] === 'master') {
						return { stdout: 'https://github.com/owner/repo/pull/3', stderr: '', exitCode: 0 };
					}
					return { stdout: '', stderr: 'Wrong base branch', exitCode: 1 };
				}
				return { stdout: '', stderr: '', exitCode: 0 };
			});

			const handler = getCreateDraftPRHandler();
			const result = await handler!({} as any, { contributionId: 'contrib_branch_test' });

			expect(result.success).toBe(true);
		});

		it('should default to main if detection fails', async () => {
			const metadata = createMetadataForBranchTest('/tmp/repo-default-main');
			vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
				if ((filePath as string).includes('metadata.json')) {
					return JSON.stringify(metadata);
				}
				throw new Error('ENOENT');
			});
			vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
				if (cmd === 'gh' && args?.[0] === 'auth')
					return { stdout: 'Logged in', stderr: '', exitCode: 0 };
				if (cmd === 'git' && args?.[0] === 'symbolic-ref') {
					return { stdout: '', stderr: 'error', exitCode: 1 };
				}
				if (cmd === 'git' && args?.[0] === 'ls-remote') {
					// Both main and master checks fail
					return { stdout: '', stderr: '', exitCode: 0 };
				}
				if (cmd === 'git' && args?.[0] === 'rev-list')
					return { stdout: '1', stderr: '', exitCode: 0 };
				if (cmd === 'git' && args?.[0] === 'rev-parse')
					return { stdout: 'symphony/issue-42-xyz', stderr: '', exitCode: 0 };
				if (cmd === 'git' && args?.[0] === 'push') return { stdout: '', stderr: '', exitCode: 0 };
				if (cmd === 'gh' && args?.[0] === 'pr' && args?.[1] === 'create') {
					// When detection fails, should default to 'main'
					const baseIndex = args?.indexOf('--base');
					if (baseIndex !== undefined && baseIndex >= 0 && args?.[baseIndex + 1] === 'main') {
						return { stdout: 'https://github.com/owner/repo/pull/4', stderr: '', exitCode: 0 };
					}
					return { stdout: '', stderr: 'Wrong base branch', exitCode: 1 };
				}
				return { stdout: '', stderr: '', exitCode: 0 };
			});

			const handler = getCreateDraftPRHandler();
			const result = await handler!({} as any, { contributionId: 'contrib_branch_test' });

			expect(result.success).toBe(true);
		});
	});

	// ============================================================================
	// Manual Credit Tests (symphony:manualCredit)
	// ============================================================================

	describe('symphony:manualCredit', () => {
		const getManualCreditHandler = () => handlers.get('symphony:manualCredit');

		beforeEach(() => {
			// Reset state to empty
			vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
			vi.mocked(fs.mkdir).mockResolvedValue(undefined);
			vi.mocked(fs.writeFile).mockResolvedValue(undefined);
		});

		describe('validation', () => {
			it('should reject missing required fields', async () => {
				const handler = getManualCreditHandler();
				const result = await handler!({} as any, {});

				// Handler returns { error: '...' }, wrapper adds success: true
				// So validation errors show as { success: true, error: '...' }
				expect(result.error).toContain('Missing required fields');
				expect(result.contributionId).toBeUndefined();
			});

			it('should reject missing repoSlug', async () => {
				const handler = getManualCreditHandler();
				const result = await handler!({} as any, {
					repoName: 'Test Repo',
					issueNumber: 123,
					prNumber: 456,
					prUrl: 'https://github.com/owner/repo/pull/456',
				});

				expect(result.error).toContain('Missing required fields');
				expect(result.contributionId).toBeUndefined();
			});

			it('should reject duplicate PR credit', async () => {
				// Setup existing state with a contribution
				vi.mocked(fs.readFile).mockResolvedValue(
					JSON.stringify({
						active: [],
						history: [
							{
								id: 'existing_contrib',
								repoSlug: 'owner/repo',
								prNumber: 456,
							},
						],
						stats: {
							totalContributions: 1,
							totalMerged: 0,
							totalIssuesResolved: 0,
							totalDocumentsProcessed: 0,
							totalTasksCompleted: 0,
							totalTokensUsed: 0,
							totalTimeSpent: 0,
							estimatedCostDonated: 0,
							repositoriesContributed: ['owner/repo'],
							currentStreak: 0,
							longestStreak: 0,
						},
					})
				);

				const handler = getManualCreditHandler();
				const result = await handler!({} as any, {
					repoSlug: 'owner/repo',
					repoName: 'Test Repo',
					issueNumber: 123,
					issueTitle: 'Test Issue',
					prNumber: 456,
					prUrl: 'https://github.com/owner/repo/pull/456',
				});

				expect(result.error).toContain('already credited');
				expect(result.contributionId).toBeUndefined();
			});
		});

		describe('successful credit', () => {
			it('should create a completed contribution with minimal params', async () => {
				const handler = getManualCreditHandler();
				const result = await handler!({} as any, {
					repoSlug: 'owner/repo',
					repoName: 'Test Repo',
					issueNumber: 123,
					issueTitle: 'Test Issue',
					prNumber: 456,
					prUrl: 'https://github.com/owner/repo/pull/456',
				});

				expect(result.success).toBe(true);
				expect(result.contributionId).toMatch(/^manual_123_/);

				// Verify state was written
				expect(fs.writeFile).toHaveBeenCalled();
				const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
				const writtenState = JSON.parse(writeCall[1] as string);

				expect(writtenState.history).toHaveLength(1);
				expect(writtenState.history[0].repoSlug).toBe('owner/repo');
				expect(writtenState.history[0].prNumber).toBe(456);
				expect(writtenState.stats.totalContributions).toBe(1);
			});

			it('should handle wasMerged flag correctly', async () => {
				const handler = getManualCreditHandler();
				const result = await handler!({} as any, {
					repoSlug: 'owner/repo',
					repoName: 'Test Repo',
					issueNumber: 123,
					issueTitle: 'Test Issue',
					prNumber: 456,
					prUrl: 'https://github.com/owner/repo/pull/456',
					wasMerged: true,
					mergedAt: '2026-02-02T23:31:31Z',
				});

				expect(result.success).toBe(true);

				const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
				const writtenState = JSON.parse(writeCall[1] as string);

				expect(writtenState.history[0].wasMerged).toBe(true);
				expect(writtenState.history[0].mergedAt).toBe('2026-02-02T23:31:31Z');
				expect(writtenState.stats.totalMerged).toBe(1);
				expect(writtenState.stats.totalIssuesResolved).toBe(1);
			});

			it('should add repo to repositoriesContributed if not already present', async () => {
				const handler = getManualCreditHandler();
				await handler!({} as any, {
					repoSlug: 'new-owner/new-repo',
					repoName: 'New Repo',
					issueNumber: 1,
					issueTitle: 'Issue 1',
					prNumber: 1,
					prUrl: 'https://github.com/new-owner/new-repo/pull/1',
				});

				const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
				const writtenState = JSON.parse(writeCall[1] as string);

				expect(writtenState.stats.repositoriesContributed).toContain('new-owner/new-repo');
			});

			it('should accept custom token usage', async () => {
				const handler = getManualCreditHandler();
				await handler!({} as any, {
					repoSlug: 'owner/repo',
					repoName: 'Test Repo',
					issueNumber: 123,
					issueTitle: 'Test Issue',
					prNumber: 456,
					prUrl: 'https://github.com/owner/repo/pull/456',
					tokenUsage: {
						inputTokens: 50000,
						outputTokens: 25000,
						totalCost: 1.5,
					},
				});

				const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
				const writtenState = JSON.parse(writeCall[1] as string);

				expect(writtenState.history[0].tokenUsage.inputTokens).toBe(50000);
				expect(writtenState.history[0].tokenUsage.outputTokens).toBe(25000);
				expect(writtenState.history[0].tokenUsage.totalCost).toBe(1.5);
				expect(writtenState.stats.totalTokensUsed).toBe(75000);
				expect(writtenState.stats.estimatedCostDonated).toBe(1.5);
			});

			it('should set firstContributionAt on first credit', async () => {
				const handler = getManualCreditHandler();
				await handler!({} as any, {
					repoSlug: 'owner/repo',
					repoName: 'Test Repo',
					issueNumber: 123,
					issueTitle: 'Test Issue',
					prNumber: 456,
					prUrl: 'https://github.com/owner/repo/pull/456',
				});

				const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
				const writtenState = JSON.parse(writeCall[1] as string);

				expect(writtenState.stats.firstContributionAt).toBeDefined();
				expect(writtenState.stats.lastContributionAt).toBeDefined();
			});
		});
	});

	// ==========================================================================
	// Label Capture and Blocking Label Tests
	// ==========================================================================

	describe('GitHub label capture (via symphony:getIssues)', () => {
		const getIssuesHandler = () => handlers.get('symphony:getIssues');

		beforeEach(() => {
			vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
		});

		it('should capture labels from GitHub API response', async () => {
			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: () =>
						Promise.resolve([
							{
								number: 1,
								title: 'Test Issue',
								body: 'docs/task.md',
								url: 'https://api.github.com/repos/owner/repo/issues/1',
								html_url: 'https://github.com/owner/repo/issues/1',
								user: { login: 'user' },
								created_at: '2024-01-01',
								updated_at: '2024-01-01',
								labels: [
									{ name: 'runmaestro.ai', color: '0075ca' },
									{ name: 'enhancement', color: 'a2eeef' },
									{ name: 'good first issue', color: '7057ff' },
								],
							},
						]),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve([]),
				});

			const handler = getIssuesHandler();
			const result = await handler!({} as any, 'owner/repo');

			// Should exclude the runmaestro.ai label
			expect(result.issues[0].labels).toHaveLength(2);
			expect(result.issues[0].labels).toContainEqual({ name: 'enhancement', color: 'a2eeef' });
			expect(result.issues[0].labels).toContainEqual({ name: 'good first issue', color: '7057ff' });
		});

		it('should filter out the runmaestro.ai label from the labels list', async () => {
			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: () =>
						Promise.resolve([
							{
								number: 1,
								title: 'Test',
								body: 'task.md',
								url: 'https://api.github.com/repos/owner/repo/issues/1',
								html_url: 'https://github.com/owner/repo/issues/1',
								user: { login: 'user' },
								created_at: '2024-01-01',
								updated_at: '2024-01-01',
								labels: [{ name: 'runmaestro.ai', color: '0075ca' }],
							},
						]),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve([]),
				});

			const handler = getIssuesHandler();
			const result = await handler!({} as any, 'owner/repo');

			expect(result.issues[0].labels).toHaveLength(0);
		});

		it('should handle issues with no labels array gracefully', async () => {
			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: () =>
						Promise.resolve([
							{
								number: 1,
								title: 'Test',
								body: 'task.md',
								url: 'https://api.github.com/repos/owner/repo/issues/1',
								html_url: 'https://github.com/owner/repo/issues/1',
								user: { login: 'user' },
								created_at: '2024-01-01',
								updated_at: '2024-01-01',
							},
						]),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve([]),
				});

			const handler = getIssuesHandler();
			const result = await handler!({} as any, 'owner/repo');

			expect(result.issues[0].labels).toEqual([]);
		});

		it('should capture blocking label on issues', async () => {
			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: () =>
						Promise.resolve([
							{
								number: 1,
								title: 'Blocked Issue',
								body: 'task.md',
								url: 'https://api.github.com/repos/owner/repo/issues/1',
								html_url: 'https://github.com/owner/repo/issues/1',
								user: { login: 'user' },
								created_at: '2024-01-01',
								updated_at: '2024-01-01',
								labels: [
									{ name: 'runmaestro.ai', color: '0075ca' },
									{ name: 'blocking', color: 'e4e669' },
								],
							},
							{
								number: 2,
								title: 'Available Issue',
								body: 'task2.md',
								url: 'https://api.github.com/repos/owner/repo/issues/2',
								html_url: 'https://github.com/owner/repo/issues/2',
								user: { login: 'user' },
								created_at: '2024-01-01',
								updated_at: '2024-01-01',
								labels: [{ name: 'runmaestro.ai', color: '0075ca' }],
							},
						]),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve([]),
				});

			const handler = getIssuesHandler();
			const result = await handler!({} as any, 'owner/repo');

			// Issue 1 should have the blocking label
			const blockedIssue = result.issues.find((i: any) => i.number === 1);
			expect(blockedIssue.labels).toContainEqual({ name: 'blocking', color: 'e4e669' });

			// Issue 2 should have no labels (runmaestro.ai filtered out)
			const availableIssue = result.issues.find((i: any) => i.number === 2);
			expect(availableIssue.labels).toHaveLength(0);
		});
	});
});
