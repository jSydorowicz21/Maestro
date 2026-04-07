/**
 * Symphony Session Creation Workflow Handlers
 *
 * IPC handlers for the session creation workflow including cloning repos,
 * starting contributions, creating draft PRs, fetching document content,
 * and manually crediting contributions.
 */

import { ipcMain } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../../utils/logger';
import { isWebContentsAvailable } from '../../../utils/safe-send';
import { createIpcHandler } from '../../../utils/ipcHandler';
import { execFileNoThrow } from '../../../utils/execFile';
import { ensureForkSetup } from '../../../utils/symphony-fork';
import type { CompletedContribution, DocumentReference } from '../../../../shared/symphony-types';
import {
	LOG_CONTEXT,
	type SymphonyHandlerDependencies,
	readState,
	writeState,
	getSymphonyDir,
	validateGitHubUrl,
	validateRepoSlug,
	generateBranchName,
	broadcastSymphonyUpdate,
	handlerOpts,
} from './helpers';
import {
	cloneRepository,
	createBranch,
	checkGhAuthentication,
	getDefaultBranch,
	createDraftPR,
} from './git-operations';

// ============================================================================
// IPC Handler Registration
// ============================================================================

export function registerWorkflowHandlers({
	app,
	getMainWindow,
}: Pick<SymphonyHandlerDependencies, 'app' | 'getMainWindow'>): void {
	/**
	 * Clone a repository for a new Symphony session.
	 * This is a simpler version of the start handler for the session creation flow.
	 */
	ipcMain.handle(
		'symphony:cloneRepo',
		createIpcHandler(
			handlerOpts('cloneRepo'),
			async (params: {
				repoUrl: string;
				localPath: string;
			}): Promise<{ success: boolean; error?: string }> => {
				const { repoUrl, localPath } = params;

				// Validate GitHub URL
				const urlValidation = validateGitHubUrl(repoUrl);
				if (!urlValidation.valid) {
					return { success: false, error: urlValidation.error };
				}

				// Ensure parent directory exists
				const parentDir = path.dirname(localPath);
				await fs.mkdir(parentDir, { recursive: true });

				// Clone with depth=1 for speed
				const result = await cloneRepository(repoUrl, localPath);
				if (!result.success) {
					return { success: false, error: `Clone failed: ${result.error}` };
				}

				logger.info('Repository cloned for Symphony session', LOG_CONTEXT, { localPath });
				return { success: true };
			}
		)
	);

	/**
	 * Start the contribution workflow after session is created.
	 * Creates branch and sets up Auto Run documents.
	 * Draft PR will be created on first real commit (deferred to avoid "no commits" error).
	 */
	ipcMain.handle(
		'symphony:startContribution',
		createIpcHandler(
			handlerOpts('startContribution'),
			async (params: {
				contributionId: string;
				sessionId: string;
				repoSlug: string;
				issueNumber: number;
				issueTitle: string;
				localPath: string;
				documentPaths: DocumentReference[];
			}): Promise<{
				success: boolean;
				branchName?: string;
				draftPrNumber?: number;
				draftPrUrl?: string;
				autoRunPath?: string;
				error?: string;
			}> => {
				const {
					contributionId,
					sessionId,
					repoSlug,
					issueNumber,
					issueTitle,
					localPath,
					documentPaths,
				} = params;

				// Validate inputs
				const slugValidation = validateRepoSlug(repoSlug);
				if (!slugValidation.valid) {
					return { success: false, error: slugValidation.error };
				}

				if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
					return { success: false, error: 'Invalid issue number' };
				}

				// Validate document paths
				for (const doc of documentPaths) {
					if (doc.isExternal) {
						// Validate external URLs are from trusted domains (GitHub)
						try {
							const parsed = new URL(doc.path);
							if (parsed.protocol !== 'https:') {
								return {
									success: false,
									error: `External document URL must use HTTPS: ${doc.path}`,
								};
							}
							// Allow GitHub domains for external documents (attachments, raw content, etc.)
							const allowedHosts = [
								'github.com',
								'www.github.com',
								'raw.githubusercontent.com',
								'user-images.githubusercontent.com',
								'camo.githubusercontent.com',
							];
							if (!allowedHosts.includes(parsed.hostname)) {
								return {
									success: false,
									error: `External document URL must be from GitHub: ${doc.path}`,
								};
							}
						} catch {
							return { success: false, error: `Invalid external document URL: ${doc.path}` };
						}
					} else {
						// Check repo-relative paths for path traversal
						if (doc.path.includes('..') || doc.path.startsWith('/')) {
							return { success: false, error: `Invalid document path: ${doc.path}` };
						}
					}
				}

				// Check gh CLI authentication (needed later for PR creation)
				const authCheck = await checkGhAuthentication();
				if (!authCheck.authenticated) {
					return { success: false, error: authCheck.error };
				}

				try {
					// 1. Create branch and checkout
					const branchName = generateBranchName(issueNumber);
					const branchResult = await createBranch(localPath, branchName);
					if (!branchResult.success) {
						logger.error('Failed to create branch', LOG_CONTEXT, {
							localPath,
							branchName,
							error: branchResult.error,
						});
						return { success: false, error: `Failed to create branch: ${branchResult.error}` };
					}

					// 1b. Capture upstream default branch before fork setup rewrites origin
					const upstreamDefaultBranch = await getDefaultBranch(localPath);

					// 1c. Set up fork if user doesn't have push access
					logger.info('Checking fork requirements', LOG_CONTEXT, { repoSlug });
					const forkResult = await ensureForkSetup(localPath, repoSlug);
					if (forkResult.error) {
						return { success: false, error: `Fork setup failed: ${forkResult.error}` };
					}
					if (forkResult.isFork) {
						logger.info('Using fork for contribution', LOG_CONTEXT, {
							forkSlug: forkResult.forkSlug,
							upstreamSlug: repoSlug,
						});
					} else {
						logger.info('User has push access, no fork needed', LOG_CONTEXT, { repoSlug });
					}

					// 2. Set up Auto Run documents directory
					// External docs (GitHub attachments) go to cache dir to avoid polluting the repo
					// Repo-internal docs are referenced in place
					const symphonyDocsDir = path.join(
						getSymphonyDir(app),
						'contributions',
						contributionId,
						'docs'
					);
					await fs.mkdir(symphonyDocsDir, { recursive: true });

					// Track resolved document paths for Auto Run
					const resolvedDocs: { name: string; path: string; isExternal: boolean }[] = [];

					for (const doc of documentPaths) {
						if (doc.isExternal) {
							// Download external file (GitHub attachment) to cache directory
							const destPath = path.join(symphonyDocsDir, doc.name);
							try {
								logger.info('Downloading external document', LOG_CONTEXT, {
									name: doc.name,
									url: doc.path,
								});
								const response = await fetch(doc.path);
								if (!response.ok) {
									logger.warn('Failed to download document', LOG_CONTEXT, {
										name: doc.name,
										status: response.status,
									});
									continue;
								}
								const buffer = await response.arrayBuffer();
								await fs.writeFile(destPath, Buffer.from(buffer));
								logger.info('Downloaded document to cache', LOG_CONTEXT, {
									name: doc.name,
									to: destPath,
								});
								resolvedDocs.push({ name: doc.name, path: destPath, isExternal: true });
							} catch (e) {
								logger.warn('Failed to download document', LOG_CONTEXT, {
									name: doc.name,
									error: e instanceof Error ? e.message : String(e),
								});
							}
						} else {
							// Repo-internal doc - verify it exists and reference in place
							const resolvedSource = path.resolve(localPath, doc.path);
							if (!resolvedSource.startsWith(localPath)) {
								logger.error('Attempted path traversal in document path', LOG_CONTEXT, {
									docPath: doc.path,
								});
								continue;
							}
							try {
								await fs.access(resolvedSource);
								logger.info('Using repo document', LOG_CONTEXT, {
									name: doc.name,
									path: resolvedSource,
								});
								resolvedDocs.push({ name: doc.name, path: resolvedSource, isExternal: false });
							} catch (e) {
								logger.warn('Document not found in repo', LOG_CONTEXT, {
									docPath: doc.path,
									error: e instanceof Error ? e.message : String(e),
								});
							}
						}
					}

					// 3. Write contribution metadata for later PR creation
					const metadataPath = path.join(symphonyDocsDir, '..', 'metadata.json');
					await fs.writeFile(
						metadataPath,
						JSON.stringify(
							{
								contributionId,
								sessionId,
								repoSlug,
								issueNumber,
								issueTitle,
								branchName,
								localPath,
								resolvedDocs,
								startedAt: new Date().toISOString(),
								prCreated: false,
								upstreamDefaultBranch,
								isFork: forkResult.isFork,
								...(forkResult.isFork && {
									forkSlug: forkResult.forkSlug,
									upstreamSlug: repoSlug,
								}),
							},
							null,
							2
						)
					);

					// 4. Determine Auto Run path (use cache dir if we have external docs, otherwise repo path)
					const hasExternalDocs = resolvedDocs.some((d) => d.isExternal);
					const autoRunPath = hasExternalDocs
						? symphonyDocsDir
						: resolvedDocs[0]?.path
							? path.dirname(resolvedDocs[0].path)
							: localPath;

					// 5. Create empty commit, push branch, and open draft PR to claim the issue
					let draftPrNumber: number | undefined;
					let draftPrUrl: string | undefined;

					const baseBranch = upstreamDefaultBranch;
					const commitMsg = `[Symphony] Start contribution for #${issueNumber}`;
					const emptyCommitResult = await execFileNoThrow(
						'git',
						['commit', '--allow-empty', '-m', commitMsg],
						localPath
					);

					if (emptyCommitResult.exitCode === 0) {
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
						if (prResult.success) {
							draftPrNumber = prResult.prNumber;
							draftPrUrl = prResult.prUrl;

							// Update metadata with PR info
							const metaContent = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
							metaContent.prCreated = true;
							metaContent.draftPrNumber = draftPrNumber;
							metaContent.draftPrUrl = draftPrUrl;
							await fs.writeFile(metadataPath, JSON.stringify(metaContent, null, 2));
						} else {
							logger.warn('Failed to create draft PR, continuing without claim', LOG_CONTEXT, {
								contributionId,
								error: prResult.error,
							});
						}
					} else {
						logger.warn('Empty commit failed, continuing without draft PR', LOG_CONTEXT, {
							contributionId,
							error: emptyCommitResult.stderr,
						});
					}

					// 6. Broadcast status update
					const mainWindow = getMainWindow?.();
					if (isWebContentsAvailable(mainWindow)) {
						mainWindow.webContents.send('symphony:contributionStarted', {
							contributionId,
							sessionId,
							branchName,
							autoRunPath,
							draftPrNumber,
							draftPrUrl,
						});
					}

					logger.info('Symphony contribution started', LOG_CONTEXT, {
						contributionId,
						sessionId,
						branchName,
						documentCount: resolvedDocs.length,
						hasExternalDocs,
						draftPrNumber,
					});

					return {
						success: true,
						branchName,
						autoRunPath,
						draftPrNumber,
						draftPrUrl,
					};
				} catch (error) {
					logger.error('Symphony contribution failed', LOG_CONTEXT, { error });
					return {
						success: false,
						error: error instanceof Error ? error.message : 'Unknown error',
					};
				}
			}
		)
	);

	/**
	 * Create draft PR for a contribution (called on first commit).
	 * Reads metadata from the contribution folder, pushes branch, and creates draft PR.
	 */
	ipcMain.handle(
		'symphony:createDraftPR',
		createIpcHandler(
			handlerOpts('createDraftPR'),
			async (params: {
				contributionId: string;
			}): Promise<{
				success: boolean;
				draftPrNumber?: number;
				draftPrUrl?: string;
				error?: string;
			}> => {
				const { contributionId } = params;

				// Read contribution metadata
				const metadataPath = path.join(
					getSymphonyDir(app),
					'contributions',
					contributionId,
					'metadata.json'
				);
				let metadata: {
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
					upstreamDefaultBranch?: string;
					isFork?: boolean;
					forkSlug?: string;
					upstreamSlug?: string;
				};

				try {
					const content = await fs.readFile(metadataPath, 'utf-8');
					metadata = JSON.parse(content);
				} catch (e) {
					logger.error('Failed to read contribution metadata', LOG_CONTEXT, {
						contributionId,
						error: e,
					});
					return { success: false, error: 'Contribution metadata not found' };
				}

				// Check if PR already created
				if (metadata.prCreated && metadata.draftPrUrl) {
					logger.info('Draft PR already exists', LOG_CONTEXT, {
						contributionId,
						prUrl: metadata.draftPrUrl,
					});
					return {
						success: true,
						draftPrNumber: metadata.draftPrNumber,
						draftPrUrl: metadata.draftPrUrl,
					};
				}

				// Check gh CLI authentication
				const authCheck = await checkGhAuthentication();
				if (!authCheck.authenticated) {
					return { success: false, error: authCheck.error };
				}

				const { localPath, issueNumber, issueTitle, sessionId } = metadata;

				// Check if there are any commits on this branch
				// Use rev-list to count commits not in the default branch
				// Prefer persisted upstream default branch (fork setup may have reconfigured origin)
				const baseBranch = metadata.upstreamDefaultBranch ?? (await getDefaultBranch(localPath));
				const commitCheckResult = await execFileNoThrow(
					'git',
					['rev-list', '--count', `${baseBranch}..HEAD`],
					localPath
				);

				const commitCount = parseInt(commitCheckResult.stdout.trim(), 10) || 0;
				if (commitCount === 0) {
					// No commits yet - return success but indicate no PR created
					logger.info('No commits yet, skipping PR creation', LOG_CONTEXT, { contributionId });
					return {
						success: true,
						// No PR fields - caller should know PR wasn't created yet
					};
				}

				logger.info('Found commits, creating draft PR', LOG_CONTEXT, {
					contributionId,
					commitCount,
				});

				// Create PR title and body
				const prTitle = `[WIP] Symphony: ${issueTitle} (#${issueNumber})`;
				const prBody = `## Maestro Symphony Contribution

Closes #${issueNumber}

Contributed via [Maestro Symphony](https://runmaestro.ai).

**Status:** In Progress
**Started:** ${new Date().toISOString()}

---

This PR will be updated automatically when the Auto Run completes.`;

				// Create draft PR (this also pushes the branch)
				const metaForkOwner = metadata.isFork ? metadata.forkSlug?.split('/')[0] : undefined;
				if (metadata.isFork || metadata.upstreamSlug) {
					logger.info('Creating cross-fork draft PR', LOG_CONTEXT, {
						upstreamSlug: metadata.upstreamSlug,
						forkSlug: metadata.forkSlug,
						branchName: metadata.branchName,
					});
				}
				const prResult = await createDraftPR(
					localPath,
					baseBranch,
					prTitle,
					prBody,
					metadata.upstreamSlug,
					metaForkOwner
				);
				if (!prResult.success) {
					logger.error('Failed to create draft PR', LOG_CONTEXT, {
						contributionId,
						error: prResult.error,
					});
					return { success: false, error: prResult.error };
				}

				// Update metadata with PR info
				metadata.prCreated = true;
				metadata.draftPrNumber = prResult.prNumber;
				metadata.draftPrUrl = prResult.prUrl;
				await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

				// Also update the active contribution in state with PR info
				// This is critical for checkPRStatuses to find the PR
				const state = await readState(app);
				const activeContrib = state.active.find((c) => c.id === contributionId);
				if (activeContrib) {
					activeContrib.draftPrNumber = prResult.prNumber;
					activeContrib.draftPrUrl = prResult.prUrl;
					await writeState(app, state);
				}

				// Broadcast PR creation event
				const mainWindow = getMainWindow?.();
				if (isWebContentsAvailable(mainWindow)) {
					mainWindow.webContents.send('symphony:prCreated', {
						contributionId,
						sessionId,
						draftPrNumber: prResult.prNumber,
						draftPrUrl: prResult.prUrl,
					});
				}

				logger.info('Draft PR created for Symphony contribution', LOG_CONTEXT, {
					contributionId,
					prNumber: prResult.prNumber,
					prUrl: prResult.prUrl,
				});

				return {
					success: true,
					draftPrNumber: prResult.prNumber,
					draftPrUrl: prResult.prUrl,
				};
			}
		)
	);

	// Handler for fetching document content (from main process to avoid CORS)
	ipcMain.handle(
		'symphony:fetchDocumentContent',
		createIpcHandler(
			handlerOpts('fetchDocumentContent'),
			async (params: {
				url: string;
			}): Promise<{ success: boolean; content?: string; error?: string }> => {
				const { url } = params;

				// Validate URL - only allow GitHub URLs
				try {
					const parsed = new URL(url);
					if (
						!['github.com', 'raw.githubusercontent.com', 'objects.githubusercontent.com'].some(
							(host) => parsed.hostname === host || parsed.hostname.endsWith('.' + host)
						)
					) {
						return { success: false, error: 'Only GitHub URLs are allowed' };
					}
					if (parsed.protocol !== 'https:') {
						return { success: false, error: 'Only HTTPS URLs are allowed' };
					}
				} catch {
					return { success: false, error: 'Invalid URL' };
				}

				try {
					logger.info('Fetching document content', LOG_CONTEXT, { url });
					const response = await fetch(url);
					if (!response.ok) {
						return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
					}
					const content = await response.text();
					return { success: true, content };
				} catch (error) {
					logger.error('Failed to fetch document content', LOG_CONTEXT, { url, error });
					return {
						success: false,
						error: error instanceof Error ? error.message : 'Failed to fetch document',
					};
				}
			}
		)
	);

	/**
	 * Manually credit a contribution (for contributions made outside Symphony workflow).
	 * This allows crediting a user for work done on a PR that wasn't tracked through Symphony.
	 */
	ipcMain.handle(
		'symphony:manualCredit',
		createIpcHandler(
			handlerOpts('manualCredit'),
			async (params: {
				repoSlug: string;
				repoName: string;
				issueNumber: number;
				issueTitle: string;
				prNumber: number;
				prUrl: string;
				startedAt?: string;
				completedAt?: string;
				wasMerged?: boolean;
				mergedAt?: string;
				tokenUsage?: {
					inputTokens?: number;
					outputTokens?: number;
					totalCost?: number;
				};
				timeSpent?: number;
				documentsProcessed?: number;
				tasksCompleted?: number;
			}): Promise<{ contributionId?: string; error?: string }> => {
				const {
					repoSlug,
					repoName,
					issueNumber,
					issueTitle,
					prNumber,
					prUrl,
					startedAt,
					completedAt,
					wasMerged,
					mergedAt,
					tokenUsage,
					timeSpent,
					documentsProcessed,
					tasksCompleted,
				} = params;

				// Validate required fields
				if (!repoSlug || !repoName || !issueNumber || !prNumber || !prUrl) {
					return {
						error: 'Missing required fields: repoSlug, repoName, issueNumber, prNumber, prUrl',
					};
				}

				const state = await readState(app);

				// Check if this PR is already credited
				const existingContribution = state.history.find(
					(c) => c.repoSlug === repoSlug && c.prNumber === prNumber
				);
				if (existingContribution) {
					return {
						error: `PR #${prNumber} is already credited (contribution: ${existingContribution.id})`,
					};
				}

				const now = new Date().toISOString();
				const contributionId = `manual_${issueNumber}_${Date.now()}`;

				const completed: CompletedContribution = {
					id: contributionId,
					repoSlug,
					repoName,
					issueNumber,
					issueTitle: issueTitle || `Issue #${issueNumber}`,
					startedAt: startedAt || now,
					completedAt: completedAt || now,
					prUrl,
					prNumber,
					tokenUsage: {
						inputTokens: tokenUsage?.inputTokens ?? 0,
						outputTokens: tokenUsage?.outputTokens ?? 0,
						totalCost: tokenUsage?.totalCost ?? 0,
					},
					timeSpent: timeSpent ?? 0,
					documentsProcessed: documentsProcessed ?? 0,
					tasksCompleted: tasksCompleted ?? 1,
					wasMerged: wasMerged ?? false,
					mergedAt: mergedAt,
				};

				// Add to history
				state.history.push(completed);

				// Update stats
				state.stats.totalContributions += 1;
				state.stats.totalDocumentsProcessed += completed.documentsProcessed;
				state.stats.totalTasksCompleted += completed.tasksCompleted;
				state.stats.totalTokensUsed +=
					completed.tokenUsage.inputTokens + completed.tokenUsage.outputTokens;
				state.stats.totalTimeSpent += completed.timeSpent;
				state.stats.estimatedCostDonated += completed.tokenUsage.totalCost;

				if (!state.stats.repositoriesContributed.includes(repoSlug)) {
					state.stats.repositoriesContributed.push(repoSlug);
				}

				if (wasMerged) {
					state.stats.totalMerged = (state.stats.totalMerged || 0) + 1;
					state.stats.totalIssuesResolved = (state.stats.totalIssuesResolved || 0) + 1;
				}

				state.stats.lastContributionAt = completed.completedAt;
				if (!state.stats.firstContributionAt) {
					state.stats.firstContributionAt = completed.completedAt;
				}

				// Update streak
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
					const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
					const previousWeek = getWeekNumber(oneWeekAgo);
					if (lastWeek === previousWeek || lastWeek === currentWeek) {
						if (lastWeek !== currentWeek) {
							state.stats.currentStreak += 1;
						}
					} else {
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

				logger.info('Manual contribution credited', LOG_CONTEXT, {
					contributionId,
					repoSlug,
					prNumber,
					prUrl,
				});

				broadcastSymphonyUpdate(getMainWindow);

				return { contributionId };
			}
		)
	);
}
