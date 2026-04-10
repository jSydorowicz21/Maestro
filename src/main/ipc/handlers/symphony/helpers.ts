/**
 * Symphony Shared Helpers
 *
 * Validation, path resolution, cache/state I/O, and utility functions
 * shared across all Symphony handler modules.
 */

import { App, BrowserWindow } from 'electron';
import type Store from 'electron-store';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../../utils/logger';
import { isWebContentsAvailable } from '../../../utils/safe-send';
import type { SessionsData, StoredSession, MaestroSettings } from '../../../stores/types';
import { CreateHandlerOptions } from '../../../utils/ipcHandler';
import {
	SYMPHONY_STATE_PATH,
	SYMPHONY_CACHE_PATH,
	SYMPHONY_REPOS_DIR,
	BRANCH_TEMPLATE,
	DOCUMENT_PATH_PATTERNS,
	DEFAULT_CONTRIBUTOR_STATS,
} from '../../../../shared/symphony-constants';
import type {
	SymphonyCache,
	SymphonyState,
	DocumentReference,
	ActiveContribution,
} from '../../../../shared/symphony-types';

// ============================================================================
// Constants
// ============================================================================

export const LOG_CONTEXT = '[Symphony]';

/** Maximum body size to parse (1MB) to prevent performance issues */
export const MAX_BODY_SIZE = 1024 * 1024;

// ============================================================================
// Dependencies Interface
// ============================================================================

export interface SymphonyHandlerDependencies {
	app: App;
	getMainWindow: () => BrowserWindow | null;
	sessionsStore: Store<SessionsData>;
	settingsStore: Store<MaestroSettings>;
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Sanitize repository name to prevent path traversal attacks.
 * Removes any characters that could be used for path traversal.
 */
export function sanitizeRepoName(repoName: string): string {
	// Only allow alphanumeric, dashes, underscores, and dots (not leading)
	return repoName
		.replace(/\.\./g, '') // Remove path traversal sequences
		.replace(/[^a-zA-Z0-9_\-]/g, '-') // Replace unsafe chars with dashes
		.replace(/^\.+/, '') // Remove leading dots
		.substring(0, 100); // Limit length
}

/**
 * Validate that a URL is a GitHub repository URL.
 * Only allows HTTPS URLs to github.com.
 */
export function validateGitHubUrl(url: string): { valid: boolean; error?: string } {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== 'https:') {
			return { valid: false, error: 'Only HTTPS URLs are allowed' };
		}
		if (parsed.hostname !== 'github.com' && parsed.hostname !== 'www.github.com') {
			return { valid: false, error: 'Only GitHub repositories are allowed' };
		}
		// Check for valid repo path format (owner/repo)
		const pathParts = parsed.pathname.split('/').filter(Boolean);
		if (pathParts.length < 2) {
			return { valid: false, error: 'Invalid repository path' };
		}
		return { valid: true };
	} catch {
		return { valid: false, error: 'Invalid URL format' };
	}
}

/**
 * Validate repository slug format (owner/repo).
 */
export function validateRepoSlug(slug: string): { valid: boolean; error?: string } {
	if (!slug || typeof slug !== 'string') {
		return { valid: false, error: 'Repository slug is required' };
	}
	const parts = slug.split('/');
	if (parts.length !== 2) {
		return { valid: false, error: 'Invalid repository slug format (expected owner/repo)' };
	}
	const [owner, repo] = parts;
	if (!owner || !repo) {
		return { valid: false, error: 'Owner and repository name are required' };
	}
	// GitHub username/repo name rules
	if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(owner)) {
		return { valid: false, error: 'Invalid owner name' };
	}
	if (!/^[a-zA-Z0-9._-]+$/.test(repo)) {
		return { valid: false, error: 'Invalid repository name' };
	}
	return { valid: true };
}

/**
 * Validate contribution start parameters.
 */
export function validateContributionParams(params: {
	repoSlug: string;
	repoUrl: string;
	repoName: string;
	issueNumber: number;
	documentPaths: DocumentReference[];
}): { valid: boolean; error?: string } {
	// Validate repo slug
	const slugValidation = validateRepoSlug(params.repoSlug);
	if (!slugValidation.valid) {
		return slugValidation;
	}

	// Validate URL
	const urlValidation = validateGitHubUrl(params.repoUrl);
	if (!urlValidation.valid) {
		return urlValidation;
	}

	// Validate repo name
	if (!params.repoName || typeof params.repoName !== 'string') {
		return { valid: false, error: 'Repository name is required' };
	}

	// Validate issue number
	if (!Number.isInteger(params.issueNumber) || params.issueNumber <= 0) {
		return { valid: false, error: 'Invalid issue number' };
	}

	// Validate document paths (check for path traversal in repo-relative paths)
	for (const doc of params.documentPaths) {
		if (doc.isExternal) {
			// Validate external URLs are from trusted domains (GitHub)
			try {
				const parsed = new URL(doc.path);
				if (parsed.protocol !== 'https:') {
					return { valid: false, error: `External document URL must use HTTPS: ${doc.path}` };
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
					return { valid: false, error: `External document URL must be from GitHub: ${doc.path}` };
				}
			} catch {
				return { valid: false, error: `Invalid external document URL: ${doc.path}` };
			}
		} else {
			// Check repo-relative paths for path traversal
			if (doc.path.includes('..') || doc.path.startsWith('/')) {
				return { valid: false, error: `Invalid document path: ${doc.path}` };
			}
		}
	}

	return { valid: true };
}

// ============================================================================
// Path Helpers
// ============================================================================

/**
 * Get the symphony directory path.
 */
export function getSymphonyDir(app: App): string {
	return path.join(app.getPath('userData'), 'symphony');
}

/**
 * Get cache file path.
 */
export function getCachePath(app: App): string {
	return path.join(getSymphonyDir(app), SYMPHONY_CACHE_PATH);
}

/**
 * Get state file path.
 */
export function getStatePath(app: App): string {
	return path.join(getSymphonyDir(app), SYMPHONY_STATE_PATH);
}

/**
 * Get repos directory path.
 */
export function getReposDir(app: App): string {
	return path.join(getSymphonyDir(app), SYMPHONY_REPOS_DIR);
}

// ============================================================================
// Cache / State I/O
// ============================================================================

/**
 * Ensure symphony directory exists.
 */
export async function ensureSymphonyDir(app: App): Promise<void> {
	const dir = getSymphonyDir(app);
	await fs.mkdir(dir, { recursive: true });
}

/**
 * Read cache from disk.
 */
export async function readCache(app: App): Promise<SymphonyCache | null> {
	try {
		const content = await fs.readFile(getCachePath(app), 'utf-8');
		return JSON.parse(content) as SymphonyCache;
	} catch {
		return null;
	}
}

/**
 * Write cache to disk.
 */
export async function writeCache(app: App, cache: SymphonyCache): Promise<void> {
	await ensureSymphonyDir(app);
	await fs.writeFile(getCachePath(app), JSON.stringify(cache, null, 2), 'utf-8');
}

/**
 * Read symphony state from disk.
 */
export async function readState(app: App): Promise<SymphonyState> {
	try {
		const content = await fs.readFile(getStatePath(app), 'utf-8');
		return JSON.parse(content) as SymphonyState;
	} catch {
		// Return default state
		return {
			active: [],
			history: [],
			stats: { ...DEFAULT_CONTRIBUTOR_STATS },
		};
	}
}

/**
 * Write symphony state to disk.
 */
export async function writeState(app: App, state: SymphonyState): Promise<void> {
	await ensureSymphonyDir(app);
	await fs.writeFile(getStatePath(app), JSON.stringify(state, null, 2), 'utf-8');
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if cached data is still valid.
 */
export function isCacheValid(fetchedAt: number, ttlMs: number): boolean {
	return Date.now() - fetchedAt < ttlMs;
}

/**
 * Generate a unique contribution ID.
 */
export function generateContributionId(): string {
	const timestamp = Date.now().toString(36);
	const random = Math.random().toString(36).substring(2, 8);
	return `contrib_${timestamp}_${random}`;
}

/**
 * Generate branch name from template.
 */
export function generateBranchName(issueNumber: number): string {
	const timestamp = Date.now().toString(36);
	return BRANCH_TEMPLATE.replace('{issue}', String(issueNumber)).replace('{timestamp}', timestamp);
}

/**
 * Parse document references from issue body.
 * Supports both repository-relative paths and GitHub attachment links.
 */
export function parseDocumentPaths(body: string): DocumentReference[] {
	// Guard against extremely large bodies that could cause performance issues
	if (body.length > MAX_BODY_SIZE) {
		logger.warn('Issue body too large, truncating for document parsing', LOG_CONTEXT, {
			bodyLength: body.length,
			maxSize: MAX_BODY_SIZE,
		});
		body = body.substring(0, MAX_BODY_SIZE);
	}

	const docs: Map<string, DocumentReference> = new Map();

	// Pattern for markdown links: [filename.md](url)
	// Captures: [1] = filename (link text), [2] = URL
	const markdownLinkPattern = /\[([^\]]+\.md)\]\(([^)]+)\)/gi;

	// First, check for markdown links (GitHub attachments)
	let match;
	while ((match = markdownLinkPattern.exec(body)) !== null) {
		const filename = match[1];
		const url = match[2];
		// Only add if it's a GitHub attachment URL or similar external URL
		if (url.startsWith('http')) {
			const key = filename.toLowerCase(); // Dedupe by filename
			if (!docs.has(key)) {
				docs.set(key, {
					name: filename,
					path: url,
					isExternal: true,
				});
			}
		}
	}

	// Then check for repo-relative paths using existing patterns
	for (const pattern of DOCUMENT_PATH_PATTERNS) {
		// Reset lastIndex for global regex
		pattern.lastIndex = 0;
		while ((match = pattern.exec(body)) !== null) {
			const docPath = match[1];
			if (docPath && !docPath.startsWith('http')) {
				const filename = docPath.split('/').pop() || docPath;
				const key = filename.toLowerCase();
				// Don't overwrite external links with same filename
				if (!docs.has(key)) {
					docs.set(key, {
						name: filename,
						path: docPath,
						isExternal: false,
					});
				}
			}
		}
	}

	return Array.from(docs.values());
}

/**
 * Redact a URL for safe logging - strips credentials, query params, and fragments.
 */
export function redactUrlForLog(rawUrl: string): string {
	try {
		const parsed = new URL(rawUrl);
		parsed.username = '';
		parsed.password = '';
		parsed.search = '';
		parsed.hash = '';
		return parsed.toString();
	} catch {
		return '[invalid-url]';
	}
}

// ============================================================================
// Handler Options Helper
// ============================================================================

export const handlerOpts = (operation: string, logSuccess = true): CreateHandlerOptions => ({
	context: LOG_CONTEXT,
	operation,
	logSuccess,
});

// ============================================================================
// Real-time Updates
// ============================================================================

/**
 * Broadcast symphony state updates to renderer.
 */
export function broadcastSymphonyUpdate(getMainWindow: () => BrowserWindow | null): void {
	const mainWindow = getMainWindow?.();
	if (isWebContentsAvailable(mainWindow)) {
		mainWindow.webContents.send('symphony:updated');
	}
}

/**
 * Filter out orphaned contributions whose sessions no longer exist.
 * Returns only contributions that have a corresponding session in the sessions store.
 */
export function filterOrphanedContributions(
	contributions: ActiveContribution[],
	sessionsStore: Store<SessionsData>
): ActiveContribution[] {
	const sessions = sessionsStore.get('sessions', []) as StoredSession[];
	const sessionIds = new Set(sessions.map((s) => s.id));

	const validContributions: ActiveContribution[] = [];
	const orphanedIds: string[] = [];

	for (const contribution of contributions) {
		if (sessionIds.has(contribution.sessionId)) {
			validContributions.push(contribution);
		} else {
			orphanedIds.push(contribution.id);
		}
	}

	if (orphanedIds.length > 0) {
		logger.info(
			`Filtering ${orphanedIds.length} orphaned contribution(s) with missing sessions`,
			LOG_CONTEXT,
			{ orphanedIds }
		);
	}

	return validContributions;
}
