/**
 * Symphony Contribution Lifecycle Handlers
 *
 * IPC handlers for starting, registering, updating, completing,
 * cancelling, and syncing contributions. Also handles PR status checks.
 */

import { ipcMain } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../../utils/logger';
import { createIpcHandler } from '../../../utils/ipcHandler';
import { ensureForkSetup } from '../../../utils/symphony-fork';
import { GITHUB_API_BASE } from '../../../../shared/symphony-constants';
import type {
	ActiveContribution,
	CompletedContribution,
	ContributionStatus,
	StartContributionResponse,
	CompleteContributionResponse,
	DocumentReference,
} from '../../../../shared/symphony-types';
import {
	LOG_CONTEXT,
	type SymphonyHandlerDependencies,
	readState,
	writeState,
	getSymphonyDir,
	getReposDir,
	sanitizeRepoName,
	generateContributionId,
	generateBranchName,
	validateContributionParams,
	broadcastSymphonyUpdate,
	handlerOpts,
} from './helpers';
import {
	cloneRepository,
	createBranch,
	checkGhAuthentication,
	getDefaultBranch,
	createDraftPR,
	markPRReady,
	discoverPRByBranch,
	postPRComment,
} from './git-operations';

// ============================================================================
// IPC Handler Registration
// ============================================================================

export function registerContributionHandlers({
	app,
	getMainWindow,
}: Pick<SymphonyHandlerDependencies, 'app' | 'getMainWindow'>): void {
	/**
	 * Start a new contribution.
	 */
	ipcMain.handle(
		'symphony:start',
		createIpcHandler(
			handlerOpts('start'),
			async (params: {
				repoSlug: string;
				repoUrl: string;
				repoName: string;
				issueNumber: number;
				issueTitle: string;
				documentPaths: DocumentReference[];
				agentType: string;
				sessionId: string;
				baseBranch?: string;
			}): Promise<Omit<StartContributionResponse, 'success'>> => {
				// Validate input parameters
				const validation = validateContributionParams({
					repoSlug: params.repoSlug,
					repoUrl: params.repoUrl,
					repoName: params.repoName,
					issueNumber: params.issueNumber,
					documentPaths: params.documentPaths,
				});
				if (!validation.valid) {
					return { error: validation.error };
				}

				// Check gh CLI authentication before starting
				const authCheck = await checkGhAuthentication();
				if (!authCheck.authenticated) {
					return { error: authCheck.error };
				}

				const {
					repoSlug,
					repoUrl,
					repoName,
					issueNumber,
					issueTitle,
					documentPaths,
					agentType,
					sessionId,
				} = params;

				const contributionId = generateContributionId();
				const state = await readState(app);

				// Check if already working on this issue
				const existing = state.active.find(
					(c) => c.repoSlug === repoSlug && c.issueNumber === issueNumber
				);
				if (existing) {
					return {
						error: `Already working on this issue (contribution: ${existing.id})`,
					};
				}

				// Sanitize repo name for local path
				const sanitizedRepoName = sanitizeRepoName(repoName);

				// Determine local path
				const reposDir = getReposDir(app);
				await fs.mkdir(reposDir, { recursive: true });
				const localPath = path.join(reposDir, `${sanitizedRepoName}-${contributionId}`);

				// Generate branch name
				const branchName = generateBranchName(issueNumber);

				// Clone repository
				const cloneResult = await cloneRepository(repoUrl, localPath);
				if (!cloneResult.success) {
					return { error: `Clone failed: ${cloneResult.error}` };
				}

				// Detect default branch (don't rely on hardcoded 'main')
				const baseBranch = params.baseBranch || (await getDefaultBranch(localPath));

				// Create branch
				const branchResult = await createBranch(localPath, branchName);
				if (!branchResult.success) {
					// Cleanup
					await fs
						.rm(localPath, { recursive: true, force: true })
						.catch((err) =>
							logger.warn(`Failed to clean up directory ${localPath}: ${err}`, LOG_CONTEXT)
						);
					return { error: `Branch creation failed: ${branchResult.error}` };
				}

				// Set up fork if user doesn't have push access
				logger.info('Checking fork requirements', LOG_CONTEXT, { repoSlug });
				const forkResult = await ensureForkSetup(localPath, repoSlug);
				if (forkResult.error) {
					await fs
						.rm(localPath, { recursive: true, force: true })
						.catch((err) =>
							logger.warn(`Failed to clean up directory ${localPath}: ${err}`, LOG_CONTEXT)
						);
					return { error: `Fork setup failed: ${forkResult.error}` };
				}
				if (forkResult.isFork) {
					logger.info('Using fork for contribution', LOG_CONTEXT, {
						forkSlug: forkResult.forkSlug,
						upstreamSlug: repoSlug,
					});
				} else {
					logger.info('User has push access, no fork needed', LOG_CONTEXT, { repoSlug });
				}

				// Create draft PR to claim the issue
				const prTitle = `[WIP] Symphony: ${issueTitle} (#${issueNumber})`;
				const prBody = `## Maestro Symphony Contribution

Closes #${issueNumber}

Contributed via [Maestro Symphony](https://runmaestro.ai).

**Status:** In Progress
**Started:** ${new Date().toISOString()}

---

This PR will be updated automatically when the Auto Run completes.`;

				const forkOwner = forkResult.isFork ? forkResult.forkSlug?.split('/')[0] : undefined;
				if (forkResult.isFork) {
					logger.info('Creating cross-fork draft PR', LOG_CONTEXT, {
						upstreamSlug: repoSlug,
						forkSlug: forkResult.forkSlug,
						branchName,
					});
				}
				const prResult = await createDraftPR(
					localPath,
					baseBranch,
					prTitle,
					prBody,
					forkResult.isFork ? repoSlug : undefined,
					forkOwner
				);
				if (!prResult.success) {
					// Cleanup
					await fs
						.rm(localPath, { recursive: true, force: true })
						.catch((err) =>
							logger.warn(`Failed to clean up directory ${localPath}: ${err}`, LOG_CONTEXT)
						);
					return { error: `PR creation failed: ${prResult.error}` };
				}

				// Create active contribution entry
				const contribution: ActiveContribution = {
					id: contributionId,
					repoSlug,
					repoName,
					issueNumber,
					issueTitle,
					localPath,
					branchName,
					draftPrNumber: prResult.prNumber!,
					draftPrUrl: prResult.prUrl!,
					startedAt: new Date().toISOString(),
					status: 'running',
					progress: {
						totalDocuments: documentPaths.length,
						completedDocuments: 0,
						totalTasks: 0,
						completedTasks: 0,
					},
					tokenUsage: {
						inputTokens: 0,
						outputTokens: 0,
						estimatedCost: 0,
					},
					timeSpent: 0,
					sessionId,
					agentType,
					isFork: forkResult.isFork,
					...(forkResult.isFork && {
						forkSlug: forkResult.forkSlug,
						upstreamSlug: repoSlug,
					}),
				};

				// Save state
				state.active.push(contribution);
				await writeState(app, state);

				logger.info('Contribution started', LOG_CONTEXT, {
					contributionId,
					repoSlug,
					issueNumber,
					prNumber: prResult.prNumber,
				});

				broadcastSymphonyUpdate(getMainWindow);

				return {
					contributionId,
					draftPrUrl: prResult.prUrl,
					draftPrNumber: prResult.prNumber,
				};
			}
		)
	);

	/**
	 * Register an active contribution (called when Symphony session is created).
	 * Creates an entry in the persistent state for tracking in the Active tab.
	 */
	ipcMain.handle(
		'symphony:registerActive',
		createIpcHandler(
			handlerOpts('registerActive'),
			async (params: {
				contributionId: string;
				sessionId: string;
				repoSlug: string;
				repoName: string;
				issueNumber: number;
				issueTitle: string;
				localPath: string;
				branchName: string;
				totalDocuments: number;
				agentType: string;
				draftPrNumber?: number;
				draftPrUrl?: string;
			}): Promise<{ success: boolean; error?: string }> => {
				const {
					contributionId,
					sessionId,
					repoSlug,
					repoName,
					issueNumber,
					issueTitle,
					localPath,
					branchName,
					totalDocuments,
					agentType,
					draftPrNumber,
					draftPrUrl,
				} = params;

				const state = await readState(app);

				// Check if already registered
				const existing = state.active.find((c) => c.id === contributionId);
				if (existing) {
					logger.debug('Contribution already registered', LOG_CONTEXT, { contributionId });
					return { success: true };
				}

				// Create active contribution entry
				const contribution: ActiveContribution = {
					id: contributionId,
					repoSlug,
					repoName,
					issueNumber,
					issueTitle,
					localPath,
					branchName,
					draftPrNumber,
					draftPrUrl,
					startedAt: new Date().toISOString(),
					status: 'running',
					progress: {
						totalDocuments,
						completedDocuments: 0,
						totalTasks: 0,
						completedTasks: 0,
					},
					tokenUsage: {
						inputTokens: 0,
						outputTokens: 0,
						estimatedCost: 0,
					},
					timeSpent: 0,
					sessionId,
					agentType,
				};

				state.active.push(contribution);
				await writeState(app, state);

				logger.info('Active contribution registered', LOG_CONTEXT, {
					contributionId,
					sessionId,
					repoSlug,
					issueNumber,
				});

				broadcastSymphonyUpdate(getMainWindow);
				return { success: true };
			}
		)
	);

	/**
	 * Update contribution status.
	 */
	ipcMain.handle(
		'symphony:updateStatus',
		createIpcHandler(
			handlerOpts('updateStatus', false),
			async (params: {
				contributionId: string;
				status?: ContributionStatus;
				progress?: Partial<ActiveContribution['progress']>;
				tokenUsage?: Partial<ActiveContribution['tokenUsage']>;
				timeSpent?: number;
				draftPrNumber?: number;
				draftPrUrl?: string;
				error?: string;
			}): Promise<{ updated: boolean }> => {
				const {
					contributionId,
					status,
					progress,
					tokenUsage,
					timeSpent,
					draftPrNumber,
					draftPrUrl,
					error,
				} = params;
				const state = await readState(app);
				const contribution = state.active.find((c) => c.id === contributionId);

				if (!contribution) {
					return { updated: false };
				}

				if (status) contribution.status = status;
				if (progress) contribution.progress = { ...contribution.progress, ...progress };
				if (tokenUsage) contribution.tokenUsage = { ...contribution.tokenUsage, ...tokenUsage };
				if (timeSpent !== undefined) contribution.timeSpent = timeSpent;
				if (draftPrNumber !== undefined) contribution.draftPrNumber = draftPrNumber;
				if (draftPrUrl !== undefined) contribution.draftPrUrl = draftPrUrl;
				if (error) contribution.error = error;

				await writeState(app, state);
				broadcastSymphonyUpdate(getMainWindow);
				return { updated: true };
			}
		)
	);

	/**
	 * Complete a contribution (mark PR as ready).
	 * Accepts optional stats from the frontend which override stored values.
	 */
	ipcMain.handle(
		'symphony:complete',
		createIpcHandler(
			handlerOpts('complete'),
			async (params: {
				contributionId: string;
				prBody?: string;
				stats?: {
					inputTokens: number;
					outputTokens: number;
					estimatedCost: number;
					timeSpentMs: number;
					documentsProcessed: number;
					tasksCompleted: number;
				};
			}): Promise<Omit<CompleteContributionResponse, 'success'>> => {
				const { contributionId, stats } = params;
				const state = await readState(app);
				const contributionIndex = state.active.findIndex((c) => c.id === contributionId);

				if (contributionIndex === -1) {
					return { error: 'Contribution not found' };
				}

				const contribution = state.active[contributionIndex];

				// Can't complete if there's no draft PR yet
				if (!contribution.draftPrNumber || !contribution.draftPrUrl) {
					return { error: 'No draft PR exists yet. Make a commit to create the PR first.' };
				}

				contribution.status = 'completing';
				await writeState(app, state);

				// Mark PR as ready (use upstreamSlug for fork contributions)
				const upstreamSlug =
					contribution.isFork && contribution.upstreamSlug ? contribution.upstreamSlug : undefined;
				const readyResult = await markPRReady(
					contribution.localPath,
					contribution.draftPrNumber,
					upstreamSlug
				);
				if (!readyResult.success) {
					contribution.status = 'failed';
					contribution.error = readyResult.error;
					await writeState(app, state);
					return { error: readyResult.error };
				}

				// Post PR comment with stats (use provided stats or fall back to stored values)
				const commentStats = stats || {
					inputTokens: contribution.tokenUsage.inputTokens,
					outputTokens: contribution.tokenUsage.outputTokens,
					estimatedCost: contribution.tokenUsage.estimatedCost,
					timeSpentMs: contribution.timeSpent,
					documentsProcessed: contribution.progress.completedDocuments,
					tasksCompleted: contribution.progress.completedTasks,
				};

				const commentResult = await postPRComment(
					contribution.localPath,
					contribution.draftPrNumber,
					commentStats,
					upstreamSlug
				);

				if (!commentResult.success) {
					// Log but don't fail - the PR is already ready, comment is just bonus
					logger.warn('Failed to post PR comment', LOG_CONTEXT, {
						contributionId,
						error: commentResult.error,
					});
				}

				// Use provided stats for the completed record if available
				const finalInputTokens = stats?.inputTokens ?? contribution.tokenUsage.inputTokens;
				const finalOutputTokens = stats?.outputTokens ?? contribution.tokenUsage.outputTokens;
				const finalCost = stats?.estimatedCost ?? contribution.tokenUsage.estimatedCost;
				const finalTimeSpent = stats?.timeSpentMs ?? contribution.timeSpent;
				const finalDocsProcessed =
					stats?.documentsProcessed ?? contribution.progress.completedDocuments;
				const finalTasksCompleted = stats?.tasksCompleted ?? contribution.progress.completedTasks;

				// Move to completed
				const completed: CompletedContribution = {
					id: contribution.id,
					repoSlug: contribution.repoSlug,
					repoName: contribution.repoName,
					issueNumber: contribution.issueNumber,
					issueTitle: contribution.issueTitle,
					startedAt: contribution.startedAt,
					completedAt: new Date().toISOString(),
					prUrl: contribution.draftPrUrl,
					prNumber: contribution.draftPrNumber,
					tokenUsage: {
						inputTokens: finalInputTokens,
						outputTokens: finalOutputTokens,
						totalCost: finalCost,
					},
					timeSpent: finalTimeSpent,
					documentsProcessed: finalDocsProcessed,
					tasksCompleted: finalTasksCompleted,
				};

				// Update state
				state.active.splice(contributionIndex, 1);
				state.history.push(completed);

				// Update stats
				state.stats.totalContributions += 1;
				state.stats.totalDocumentsProcessed += completed.documentsProcessed;
				state.stats.totalTasksCompleted += completed.tasksCompleted;
				state.stats.totalTokensUsed +=
					completed.tokenUsage.inputTokens + completed.tokenUsage.outputTokens;
				state.stats.totalTimeSpent += completed.timeSpent;
				state.stats.estimatedCostDonated += completed.tokenUsage.totalCost;

				if (!state.stats.repositoriesContributed.includes(contribution.repoSlug)) {
					state.stats.repositoriesContributed.push(contribution.repoSlug);
				}

				state.stats.lastContributionAt = completed.completedAt;
				if (!state.stats.firstContributionAt) {
					state.stats.firstContributionAt = completed.completedAt;
				}

				// Update streak by week (check if last contribution was this week or last week)
				const getWeekNumber = (date: Date): string => {
					const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
					const dayNum = d.getUTCDay() || 7;
					d.setUTCDate(d.getUTCDate() + 4 - dayNum);
					const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
					const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
					return `${d.getUTCFullYear()}-W${weekNo}`;
				};
				const currentWeek = getWeekNumber(new Date());
				const lastWeek = state.stats.lastContributionDate;
				if (lastWeek) {
					// Calculate previous week
					const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
					const previousWeek = getWeekNumber(oneWeekAgo);
					if (lastWeek === previousWeek || lastWeek === currentWeek) {
						// Only increment if this is a new week (not same week contribution)
						if (lastWeek !== currentWeek) {
							state.stats.currentStreak += 1;
						}
						// If same week, streak stays the same (already counted this week)
					} else {
						// Gap of more than one week, reset streak
						state.stats.currentStreak = 1;
					}
				} else {
					state.stats.currentStreak = 1;
				}
				state.stats.lastContributionDate = currentWeek;
				if (state.stats.currentStreak > state.stats.longestStreak) {
					state.stats.longestStreak = state.stats.currentStreak;
				}

				await writeState(app, state);

				logger.info('Contribution completed', LOG_CONTEXT, {
					contributionId,
					prUrl: completed.prUrl,
				});

				broadcastSymphonyUpdate(getMainWindow);

				return {
					prUrl: completed.prUrl,
					prNumber: completed.prNumber,
				};
			}
		)
	);

	/**
	 * Cancel an active contribution.
	 */
	ipcMain.handle(
		'symphony:cancel',
		createIpcHandler(
			handlerOpts('cancel'),
			async (contributionId: string, cleanup?: boolean): Promise<{ cancelled: boolean }> => {
				const state = await readState(app);
				const index = state.active.findIndex((c) => c.id === contributionId);

				if (index === -1) {
					return { cancelled: false };
				}

				const contribution = state.active[index];

				// Optionally cleanup local files
				if (cleanup && contribution.localPath) {
					try {
						await fs.rm(contribution.localPath, { recursive: true, force: true });
					} catch (e) {
						logger.warn('Failed to cleanup contribution directory', LOG_CONTEXT, { error: e });
					}
				}

				// Remove from active
				state.active.splice(index, 1);
				await writeState(app, state);

				logger.info('Contribution cancelled', LOG_CONTEXT, { contributionId });

				broadcastSymphonyUpdate(getMainWindow);

				return { cancelled: true };
			}
		)
	);

	/**
	 * Check PR statuses for all completed contributions and update merged status.
	 * Moves PRs that are merged/closed from active to history (for ready_for_review PRs).
	 * Returns summary of what changed.
	 */
	ipcMain.handle(
		'symphony:checkPRStatuses',
		createIpcHandler(
			handlerOpts('checkPRStatuses'),
			async (): Promise<{
				checked: number;
				merged: number;
				closed: number;
				errors: string[];
			}> => {
				const state = await readState(app);
				const results = {
					checked: 0,
					merged: 0,
					closed: 0,
					errors: [] as string[],
				};

				// Check history entries that might have been merged
				for (const completed of state.history) {
					if (!completed.prNumber || !completed.repoSlug) continue;
					if (completed.wasMerged) continue; // Already tracked as merged

					results.checked++;

					try {
						// Fetch PR status from GitHub API
						const prUrl = `${GITHUB_API_BASE}/repos/${completed.repoSlug}/pulls/${completed.prNumber}`;
						const response = await fetch(prUrl, {
							headers: {
								Accept: 'application/vnd.github.v3+json',
								'User-Agent': 'Maestro-Symphony',
							},
						});

						if (!response.ok) {
							results.errors.push(`Failed to check PR #${completed.prNumber}: ${response.status}`);
							continue;
						}

						const pr = (await response.json()) as {
							state: string;
							merged: boolean;
							merged_at: string | null;
						};

						if (pr.merged) {
							// PR was merged - update history entry and stats
							completed.wasMerged = true;
							completed.mergedAt = pr.merged_at || new Date().toISOString();
							state.stats.totalMerged += 1;
							results.merged++;

							logger.info('PR merged detected', LOG_CONTEXT, {
								prNumber: completed.prNumber,
								repoSlug: completed.repoSlug,
							});
						} else if (pr.state === 'closed') {
							// PR was closed without merge
							completed.wasClosed = true;
							results.closed++;

							logger.info('PR closed detected', LOG_CONTEXT, {
								prNumber: completed.prNumber,
								repoSlug: completed.repoSlug,
							});
						}
					} catch (error) {
						const errMsg = error instanceof Error ? error.message : String(error);
						results.errors.push(`Error checking PR #${completed.prNumber}: ${errMsg}`);
					}
				}

				// First, sync PR info and fork info from metadata.json for active contributions
				// This handles cases where PR was created but state.json wasn't updated (migration)
				let prInfoSynced = false;
				for (const contribution of state.active) {
					// Skip if both PR info and fork info are already synced
					if (contribution.draftPrNumber && contribution.isFork !== undefined) {
						continue;
					}
					try {
						const metadataPath = path.join(
							getSymphonyDir(app),
							'contributions',
							contribution.id,
							'metadata.json'
						);
						const metadataContent = await fs.readFile(metadataPath, 'utf-8');
						const metadata = JSON.parse(metadataContent) as {
							prCreated?: boolean;
							draftPrNumber?: number;
							draftPrUrl?: string;
							isFork?: boolean;
							forkSlug?: string;
							upstreamSlug?: string;
						};
						if (!contribution.draftPrNumber && metadata.prCreated && metadata.draftPrNumber) {
							// Sync PR info from metadata to state
							contribution.draftPrNumber = metadata.draftPrNumber;
							contribution.draftPrUrl = metadata.draftPrUrl;
							prInfoSynced = true;
							logger.info('Synced PR info from metadata to state', LOG_CONTEXT, {
								contributionId: contribution.id,
								draftPrNumber: metadata.draftPrNumber,
							});
						}
						// Sync fork info from metadata to state (independent of PR info)
						if (
							metadata.isFork &&
							metadata.forkSlug &&
							metadata.upstreamSlug &&
							!contribution.isFork
						) {
							contribution.isFork = metadata.isFork;
							contribution.forkSlug = metadata.forkSlug;
							contribution.upstreamSlug = metadata.upstreamSlug;
						}
					} catch {
						// Metadata file might not exist - that's okay
					}
				}

				// Second, try to discover PRs by branch name for contributions still missing PR info
				// This handles PRs created manually via gh CLI or GitHub UI
				for (const contribution of state.active) {
					if (!contribution.draftPrNumber && contribution.branchName && contribution.repoSlug) {
						const forkHeadOwner = contribution.isFork
							? contribution.forkSlug?.split('/')[0]
							: undefined;
						const discovered = await discoverPRByBranch(
							contribution.repoSlug,
							contribution.branchName,
							forkHeadOwner
						);
						if (discovered.prNumber) {
							contribution.draftPrNumber = discovered.prNumber;
							contribution.draftPrUrl = discovered.prUrl;
							prInfoSynced = true;
							logger.info('Discovered PR from branch during status check', LOG_CONTEXT, {
								contributionId: contribution.id,
								branchName: contribution.branchName,
								draftPrNumber: discovered.prNumber,
							});
						}
					}
				}

				// Also check active contributions that have a draft PR
				// These might have been merged/closed externally
				const activeToMove: number[] = [];
				for (let i = 0; i < state.active.length; i++) {
					const contribution = state.active[i];
					// Check any active contribution with a PR (not just ready_for_review)
					if (!contribution.draftPrNumber) continue;

					results.checked++;

					try {
						const prUrl = `${GITHUB_API_BASE}/repos/${contribution.repoSlug}/pulls/${contribution.draftPrNumber}`;
						const response = await fetch(prUrl, {
							headers: {
								Accept: 'application/vnd.github.v3+json',
								'User-Agent': 'Maestro-Symphony',
							},
						});

						if (!response.ok) {
							results.errors.push(
								`Failed to check PR #${contribution.draftPrNumber}: ${response.status}`
							);
							continue;
						}

						const pr = (await response.json()) as {
							state: string;
							merged: boolean;
							merged_at: string | null;
						};

						if (pr.merged || pr.state === 'closed') {
							// Move to history
							const completed: CompletedContribution = {
								id: contribution.id,
								repoSlug: contribution.repoSlug,
								repoName: contribution.repoName,
								issueNumber: contribution.issueNumber,
								issueTitle: contribution.issueTitle,
								documentsProcessed: contribution.progress.completedDocuments,
								tasksCompleted: contribution.progress.completedTasks,
								timeSpent: contribution.timeSpent,
								startedAt: contribution.startedAt,
								completedAt: new Date().toISOString(),
								prUrl: contribution.draftPrUrl || '',
								prNumber: contribution.draftPrNumber,
								tokenUsage: {
									inputTokens: contribution.tokenUsage.inputTokens,
									outputTokens: contribution.tokenUsage.outputTokens,
									totalCost: contribution.tokenUsage.estimatedCost,
								},
								wasMerged: pr.merged,
								mergedAt: pr.merged ? pr.merged_at || new Date().toISOString() : undefined,
								wasClosed: pr.state === 'closed' && !pr.merged,
							};

							state.history.push(completed);
							activeToMove.push(i);

							if (pr.merged) {
								state.stats.totalMerged += 1;
								results.merged++;
							} else {
								results.closed++;
							}

							logger.info('Active contribution moved to history', LOG_CONTEXT, {
								contributionId: contribution.id,
								merged: pr.merged,
								closed: pr.state === 'closed',
							});
						}
					} catch (error) {
						const errMsg = error instanceof Error ? error.message : String(error);
						results.errors.push(`Error checking PR #${contribution.draftPrNumber}: ${errMsg}`);
					}
				}

				// Remove moved contributions from active (in reverse order to preserve indices)
				for (let i = activeToMove.length - 1; i >= 0; i--) {
					state.active.splice(activeToMove[i], 1);
				}

				await writeState(app, state);

				if (results.merged > 0 || results.closed > 0 || prInfoSynced) {
					broadcastSymphonyUpdate(getMainWindow);
				}

				logger.info('PR status check complete', LOG_CONTEXT, { ...results, prInfoSynced });

				return results;
			}
		)
	);

	/**
	 * Sync a single contribution's status with GitHub.
	 * Checks for PR status, syncs metadata, and attempts recovery if needed.
	 */
	ipcMain.handle(
		'symphony:syncContribution',
		createIpcHandler(
			handlerOpts('syncContribution'),
			async (
				contributionId: string
			): Promise<{
				success: boolean;
				message?: string;
				prCreated?: boolean;
				prMerged?: boolean;
				prClosed?: boolean;
				error?: string;
			}> => {
				const state = await readState(app);
				const contribution = state.active.find((c) => c.id === contributionId);

				if (!contribution) {
					return { success: false, error: 'Contribution not found' };
				}

				let message = '';
				let prCreated = false;
				let prMerged = false;
				let prClosed = false;

				try {
					// Step 1: Check if we have PR info or fork info in metadata but not in state
					if (!contribution.draftPrNumber || !contribution.isFork) {
						const metadataPath = path.join(
							getSymphonyDir(app),
							'contributions',
							contribution.id,
							'metadata.json'
						);
						try {
							const metadataContent = await fs.readFile(metadataPath, 'utf-8');
							const metadata = JSON.parse(metadataContent) as {
								prCreated?: boolean;
								draftPrNumber?: number;
								draftPrUrl?: string;
								isFork?: boolean;
								forkSlug?: string;
								upstreamSlug?: string;
							};
							if (!contribution.draftPrNumber && metadata.prCreated && metadata.draftPrNumber) {
								contribution.draftPrNumber = metadata.draftPrNumber;
								contribution.draftPrUrl = metadata.draftPrUrl;
								prCreated = true;
								message = `Synced PR #${metadata.draftPrNumber} from metadata`;
								logger.info('Synced PR info from metadata', LOG_CONTEXT, {
									contributionId,
									draftPrNumber: metadata.draftPrNumber,
								});
							}
							// Sync fork info from metadata to state (independent of PR info)
							if (
								metadata.isFork &&
								metadata.forkSlug &&
								metadata.upstreamSlug &&
								!contribution.isFork
							) {
								contribution.isFork = metadata.isFork;
								contribution.forkSlug = metadata.forkSlug;
								contribution.upstreamSlug = metadata.upstreamSlug;
							}
						} catch {
							// Metadata file might not exist - that's okay, we'll try to create PR
						}
					}

					// Step 2: If still no PR, try to discover it from GitHub by branch name
					// This handles PRs created manually via gh CLI or GitHub UI
					if (!contribution.draftPrNumber && contribution.branchName && contribution.repoSlug) {
						const forkHeadOwner = contribution.isFork
							? contribution.forkSlug?.split('/')[0]
							: undefined;
						const discovered = await discoverPRByBranch(
							contribution.repoSlug,
							contribution.branchName,
							forkHeadOwner
						);
						if (discovered.prNumber) {
							contribution.draftPrNumber = discovered.prNumber;
							contribution.draftPrUrl = discovered.prUrl;
							prCreated = true;
							message = `Discovered PR #${discovered.prNumber} from branch ${contribution.branchName}`;
							logger.info('Discovered PR from branch', LOG_CONTEXT, {
								contributionId,
								branchName: contribution.branchName,
								draftPrNumber: discovered.prNumber,
							});
						}
					}

					// Step 3: If still no PR, log info for manual intervention
					if (!contribution.draftPrNumber && contribution.localPath) {
						try {
							// Check if local path exists
							await fs.access(contribution.localPath);
							// Local path exists but no PR - user may need to trigger PR creation
							logger.info(
								'Contribution has no PR - user may need to trigger PR creation manually',
								LOG_CONTEXT,
								{ contributionId }
							);
							if (!message) {
								message = 'No PR exists yet - contribution may still be in progress';
							}
						} catch {
							// Local path doesn't exist
							logger.warn('Local path not accessible for contribution', LOG_CONTEXT, {
								contributionId,
								localPath: contribution.localPath,
							});
						}
					}

					// Step 4: If we have a PR, check its status
					if (contribution.draftPrNumber) {
						const prUrl = `${GITHUB_API_BASE}/repos/${contribution.repoSlug}/pulls/${contribution.draftPrNumber}`;
						const response = await fetch(prUrl, {
							headers: {
								Accept: 'application/vnd.github.v3+json',
								'User-Agent': 'Maestro-Symphony',
							},
						});

						if (response.ok) {
							const pr = (await response.json()) as {
								state: string;
								merged: boolean;
								merged_at: string | null;
								draft: boolean;
							};

							if (pr.merged) {
								// PR was merged - move to history
								prMerged = true;
								const completed: CompletedContribution = {
									id: contribution.id,
									repoSlug: contribution.repoSlug,
									repoName: contribution.repoName,
									issueNumber: contribution.issueNumber,
									issueTitle: contribution.issueTitle,
									documentsProcessed: contribution.progress.completedDocuments,
									tasksCompleted: contribution.progress.completedTasks,
									timeSpent: contribution.timeSpent,
									startedAt: contribution.startedAt,
									completedAt: pr.merged_at || new Date().toISOString(),
									prUrl: contribution.draftPrUrl || '',
									prNumber: contribution.draftPrNumber,
									tokenUsage: {
										inputTokens: contribution.tokenUsage.inputTokens,
										outputTokens: contribution.tokenUsage.outputTokens,
										totalCost: contribution.tokenUsage.estimatedCost,
									},
									wasMerged: true,
									mergedAt: pr.merged_at || new Date().toISOString(),
								};

								// Remove from active, add to history
								const index = state.active.findIndex((c) => c.id === contributionId);
								if (index !== -1) {
									state.active.splice(index, 1);
								}
								state.history.push(completed);
								state.stats.totalMerged += 1;
								message = `PR #${contribution.draftPrNumber} was merged!`;
							} else if (pr.state === 'closed') {
								// PR was closed without merge
								prClosed = true;
								const completed: CompletedContribution = {
									id: contribution.id,
									repoSlug: contribution.repoSlug,
									repoName: contribution.repoName,
									issueNumber: contribution.issueNumber,
									issueTitle: contribution.issueTitle,
									documentsProcessed: contribution.progress.completedDocuments,
									tasksCompleted: contribution.progress.completedTasks,
									timeSpent: contribution.timeSpent,
									startedAt: contribution.startedAt,
									completedAt: new Date().toISOString(),
									prUrl: contribution.draftPrUrl || '',
									prNumber: contribution.draftPrNumber,
									tokenUsage: {
										inputTokens: contribution.tokenUsage.inputTokens,
										outputTokens: contribution.tokenUsage.outputTokens,
										totalCost: contribution.tokenUsage.estimatedCost,
									},
									wasClosed: true,
								};

								const index = state.active.findIndex((c) => c.id === contributionId);
								if (index !== -1) {
									state.active.splice(index, 1);
								}
								state.history.push(completed);
								message = `PR #${contribution.draftPrNumber} was closed`;
							} else if (!pr.draft && contribution.status === 'running') {
								// PR is no longer draft but status shows running - update to ready_for_review
								contribution.status = 'ready_for_review';
								message = `PR #${contribution.draftPrNumber} is ready for review`;
							} else if (!message) {
								message = `PR #${contribution.draftPrNumber} synced (${pr.draft ? 'draft' : 'ready'})`;
							}
						} else {
							logger.warn('Failed to fetch PR status', LOG_CONTEXT, {
								contributionId,
								prNumber: contribution.draftPrNumber,
								status: response.status,
							});
							if (!message) {
								message = `Could not check PR status (HTTP ${response.status})`;
							}
						}
					}

					// Save updated state
					await writeState(app, state);
					broadcastSymphonyUpdate(getMainWindow);

					return {
						success: true,
						message: message || 'Synced successfully',
						prCreated,
						prMerged,
						prClosed,
					};
				} catch (error) {
					logger.error('Failed to sync contribution', LOG_CONTEXT, { contributionId, error });
					return {
						success: false,
						error: error instanceof Error ? error.message : 'Unknown error',
					};
				}
			}
		)
	);
}
