/**
 * Symphony Git Operations
 *
 * Git and GitHub CLI operations for cloning, branching, and PR management.
 */

import { logger } from '../../../utils/logger';
import { execFileNoThrow } from '../../../utils/execFile';
import { getExpandedEnv } from '../../../agents/path-prober';
import { resolveGhPath } from '../../../utils/cliDetection';
import { GITHUB_API_BASE } from '../../../../shared/symphony-constants';
import { LOG_CONTEXT } from './helpers';

// ============================================================================
// Git Operations (using safe execFileNoThrow utility)
// ============================================================================

/**
 * Clone a repository to a local path.
 */
export async function cloneRepository(
	repoUrl: string,
	targetPath: string
): Promise<{ success: boolean; error?: string }> {
	logger.info('Cloning repository', LOG_CONTEXT, { repoUrl, targetPath });

	const result = await execFileNoThrow('git', ['clone', '--depth=1', repoUrl, targetPath]);

	if (result.exitCode !== 0) {
		return { success: false, error: result.stderr };
	}

	return { success: true };
}

/**
 * Create a new branch for contribution work.
 */
export async function createBranch(
	repoPath: string,
	branchName: string
): Promise<{ success: boolean; error?: string }> {
	const result = await execFileNoThrow('git', ['checkout', '-b', branchName], repoPath);

	if (result.exitCode !== 0) {
		return { success: false, error: result.stderr };
	}

	return { success: true };
}

/**
 * Check if gh CLI is authenticated.
 */
export async function checkGhAuthentication(): Promise<{ authenticated: boolean; error?: string }> {
	const ghCommand = await resolveGhPath();
	const result = await execFileNoThrow(ghCommand, ['auth', 'status'], undefined, getExpandedEnv());
	if (result.exitCode !== 0) {
		// gh auth status outputs to stderr even on success for some info
		const output = result.stderr + result.stdout;
		if (output.includes('not logged in') || output.includes('no accounts')) {
			return {
				authenticated: false,
				error: 'GitHub CLI is not authenticated. Run "gh auth login" to authenticate.',
			};
		}
		// If gh CLI is not installed
		if (output.includes('command not found') || output.includes('not recognized')) {
			return {
				authenticated: false,
				error: 'GitHub CLI (gh) is not installed. Install it from https://cli.github.com/',
			};
		}
		return { authenticated: false, error: `GitHub CLI error: ${output}` };
	}
	return { authenticated: true };
}

/**
 * Get the default branch of a repository.
 */
export async function getDefaultBranch(repoPath: string): Promise<string> {
	// Try to get the default branch from remote
	const result = await execFileNoThrow(
		'git',
		['symbolic-ref', 'refs/remotes/origin/HEAD'],
		repoPath
	);
	if (result.exitCode === 0) {
		// Output is like "refs/remotes/origin/main"
		const branch = result.stdout.trim().replace('refs/remotes/origin/', '');
		if (branch) return branch;
	}

	// Fallback: try common branch names
	const checkResult = await execFileNoThrow(
		'git',
		['ls-remote', '--heads', 'origin', 'main'],
		repoPath
	);
	if (checkResult.exitCode === 0 && checkResult.stdout.includes('refs/heads/main')) {
		return 'main';
	}

	const masterCheck = await execFileNoThrow(
		'git',
		['ls-remote', '--heads', 'origin', 'master'],
		repoPath
	);
	if (masterCheck.exitCode === 0 && masterCheck.stdout.includes('refs/heads/master')) {
		return 'master';
	}

	// Default to main if we can't determine
	return 'main';
}

/**
 * Push branch and create draft PR using gh CLI.
 */
export async function createDraftPR(
	repoPath: string,
	baseBranch: string,
	title: string,
	body: string,
	upstreamSlug?: string,
	forkOwner?: string
): Promise<{ success: boolean; prUrl?: string; prNumber?: number; error?: string }> {
	// Check gh authentication first
	const authCheck = await checkGhAuthentication();
	if (!authCheck.authenticated) {
		return { success: false, error: authCheck.error };
	}

	// Get current branch name
	const branchResult = await execFileNoThrow(
		'git',
		['rev-parse', '--abbrev-ref', 'HEAD'],
		repoPath
	);
	const branchName = branchResult.stdout.trim();
	if (!branchName || branchResult.exitCode !== 0) {
		return { success: false, error: 'Failed to determine current branch' };
	}

	// First push the branch
	const pushResult = await execFileNoThrow('git', ['push', '-u', 'origin', branchName], repoPath);

	if (pushResult.exitCode !== 0) {
		return { success: false, error: `Failed to push: ${pushResult.stderr}` };
	}

	// Create draft PR using gh CLI (use --head to explicitly specify the branch)
	const prArgs = [
		'pr',
		'create',
		'--draft',
		'--base',
		baseBranch,
		'--head',
		// For fork contributions, use "forkOwner:branchName" to specify the fork's branch
		upstreamSlug && forkOwner ? `${forkOwner}:${branchName}` : branchName,
		'--title',
		title,
		'--body',
		body,
	];

	// For fork contributions, target the upstream repo
	if (upstreamSlug) {
		prArgs.push('--repo', upstreamSlug);
	}

	const ghCommand = await resolveGhPath();
	const prResult = await execFileNoThrow(ghCommand, prArgs, repoPath, getExpandedEnv());

	if (prResult.exitCode !== 0) {
		// If PR creation failed after push, try to delete the remote branch.
		// Note: In fork mode, `origin` points to the user's fork (set by ensureForkSetup),
		// so this correctly deletes the branch from the fork, not the upstream repo.
		logger.warn('PR creation failed, attempting to clean up remote branch', LOG_CONTEXT);
		await execFileNoThrow('git', ['push', 'origin', '--delete', branchName], repoPath);
		return { success: false, error: `Failed to create PR: ${prResult.stderr}` };
	}

	// Parse PR URL from output
	const prUrl = prResult.stdout.trim();
	const prNumberMatch = prUrl.match(/\/pull\/(\d+)/);
	const prNumber = prNumberMatch ? parseInt(prNumberMatch[1], 10) : undefined;

	return { success: true, prUrl, prNumber };
}

/**
 * Mark PR as ready for review.
 */
export async function markPRReady(
	repoPath: string,
	prNumber: number,
	upstreamSlug?: string
): Promise<{ success: boolean; error?: string }> {
	const ghCommand = await resolveGhPath();
	const args = ['pr', 'ready', String(prNumber)];
	if (upstreamSlug) {
		args.push('--repo', upstreamSlug);
	}
	const result = await execFileNoThrow(ghCommand, args, repoPath, getExpandedEnv());

	if (result.exitCode !== 0) {
		return { success: false, error: result.stderr };
	}

	return { success: true };
}

/**
 * Discover an existing PR for a branch by querying GitHub API.
 * This handles cases where PRs were created manually (via gh CLI or GitHub UI)
 * but not tracked in Symphony metadata.
 */
export async function discoverPRByBranch(
	repoSlug: string,
	branchName: string,
	headOwner?: string
): Promise<{ prNumber?: number; prUrl?: string }> {
	try {
		// Query GitHub API for PRs with this head branch
		// API: GET /repos/{owner}/{repo}/pulls?head={owner}:{branch}&state=all
		// For cross-fork PRs, headOwner is the fork owner (branch lives on fork, PR targets upstream)
		const [owner] = repoSlug.split('/');
		const headRef = `${headOwner || owner}:${branchName}`;
		const apiUrl = `${GITHUB_API_BASE}/repos/${repoSlug}/pulls?head=${encodeURIComponent(headRef)}&state=all&per_page=1`;

		const response = await fetch(apiUrl, {
			headers: {
				Accept: 'application/vnd.github.v3+json',
				'User-Agent': 'Maestro-Symphony',
			},
		});

		if (!response.ok) {
			logger.warn('Failed to query GitHub for PRs by branch', LOG_CONTEXT, {
				repoSlug,
				branchName,
				status: response.status,
			});
			return {};
		}

		const prs = (await response.json()) as Array<{
			number: number;
			html_url: string;
			state: string;
		}>;

		if (prs.length > 0) {
			const pr = prs[0];
			logger.info('Discovered existing PR for branch', LOG_CONTEXT, {
				repoSlug,
				branchName,
				prNumber: pr.number,
				state: pr.state,
			});
			return {
				prNumber: pr.number,
				prUrl: pr.html_url,
			};
		}

		return {};
	} catch (error) {
		logger.warn('Error discovering PR by branch', LOG_CONTEXT, {
			repoSlug,
			branchName,
			error: error instanceof Error ? error.message : String(error),
		});
		return {};
	}
}

/**
 * Post a comment to a PR with Symphony contribution stats.
 */
export async function postPRComment(
	repoPath: string,
	prNumber: number,
	stats: {
		inputTokens: number;
		outputTokens: number;
		estimatedCost: number;
		timeSpentMs: number;
		documentsProcessed: number;
		tasksCompleted: number;
	},
	upstreamSlug?: string
): Promise<{ success: boolean; error?: string }> {
	// Format time spent
	const hours = Math.floor(stats.timeSpentMs / 3600000);
	const minutes = Math.floor((stats.timeSpentMs % 3600000) / 60000);
	const seconds = Math.floor((stats.timeSpentMs % 60000) / 1000);
	const timeStr =
		hours > 0
			? `${hours}h ${minutes}m ${seconds}s`
			: minutes > 0
				? `${minutes}m ${seconds}s`
				: `${seconds}s`;

	// Format token counts with commas
	const formatNumber = (n: number) => n.toLocaleString('en-US');

	// Build the comment body
	const commentBody = `## Symphony Contribution Summary

This pull request was created using [Maestro Symphony](https://runmaestro.ai/symphony) - connecting AI-powered contributors with open source projects.

### Contribution Stats
| Metric | Value |
|--------|-------|
| Input Tokens | ${formatNumber(stats.inputTokens)} |
| Output Tokens | ${formatNumber(stats.outputTokens)} |
| Total Tokens | ${formatNumber(stats.inputTokens + stats.outputTokens)} |
| Estimated Cost | $${stats.estimatedCost.toFixed(2)} |
| Time Spent | ${timeStr} |
| Documents Processed | ${stats.documentsProcessed} |
| Tasks Completed | ${stats.tasksCompleted} |

---
*Powered by [Maestro](https://runmaestro.ai) • [Learn about Symphony](https://docs.runmaestro.ai/symphony)*`;

	const ghCommand = await resolveGhPath();
	const commentArgs = ['pr', 'comment', String(prNumber), '--body', commentBody];
	if (upstreamSlug) {
		commentArgs.push('--repo', upstreamSlug);
	}
	const result = await execFileNoThrow(ghCommand, commentArgs, repoPath, getExpandedEnv());

	if (result.exitCode !== 0) {
		return { success: false, error: result.stderr };
	}

	return { success: true };
}
