/**
 * Symphony Registry Handlers
 *
 * IPC handlers for fetching the Symphony registry, GitHub issues,
 * and issue counts. Includes registry caching and star count enrichment.
 */

import { ipcMain } from 'electron';
import { logger } from '../../../utils/logger';
import { createIpcHandler } from '../../../utils/ipcHandler';
import {
	SYMPHONY_REGISTRY_URL,
	REGISTRY_CACHE_TTL_MS,
	ISSUES_CACHE_TTL_MS,
	STARS_CACHE_TTL_MS,
	ISSUE_COUNTS_CACHE_TTL_MS,
	GITHUB_API_BASE,
	SYMPHONY_ISSUE_LABEL,
} from '../../../../shared/symphony-constants';
import type {
	SymphonyRegistry,
	SymphonyCache,
	SymphonyIssue,
	GetRegistryResponse,
	GetIssuesResponse,
	GetIssueCountsResponse,
	IssueStatus,
} from '../../../../shared/symphony-types';
import { SymphonyError } from '../../../../shared/symphony-types';
import {
	LOG_CONTEXT,
	type SymphonyHandlerDependencies,
	readCache,
	writeCache,
	isCacheValid,
	parseDocumentPaths,
	redactUrlForLog,
	handlerOpts,
} from './helpers';

// ============================================================================
// Registry Fetching
// ============================================================================

/**
 * Fetch a single symphony registry from a URL.
 * Returns null on failure instead of throwing (isolated error handling per URL).
 */
async function fetchSingleRegistry(url: string): Promise<SymphonyRegistry | null> {
	const safeUrl = redactUrlForLog(url);
	try {
		const response = await fetch(url);
		if (!response.ok) {
			logger.warn(`Failed to fetch registry from ${safeUrl}: ${response.status}`, LOG_CONTEXT);
			return null;
		}
		const data = (await response.json()) as SymphonyRegistry;
		if (!data.repositories || !Array.isArray(data.repositories)) {
			logger.warn(`Invalid registry structure from ${safeUrl}`, LOG_CONTEXT);
			return null;
		}
		logger.info(`Fetched ${data.repositories.length} repos from ${safeUrl}`, LOG_CONTEXT);
		return data;
	} catch (error) {
		logger.warn(
			`Network error fetching registry from ${safeUrl}: ${error instanceof Error ? error.message : String(error)}`,
			LOG_CONTEXT
		);
		return null;
	}
}

/**
 * Fetch and merge symphony registries from all configured URLs.
 * Default URL always fetched first (wins on slug conflicts).
 * Custom URL failures are isolated - other registries still load.
 */
async function fetchRegistries(customUrls: string[]): Promise<SymphonyRegistry> {
	logger.info(
		`Fetching Symphony registries (1 default + ${customUrls.length} custom)`,
		LOG_CONTEXT
	);

	const allUrls = [SYMPHONY_REGISTRY_URL, ...customUrls];
	const results = await Promise.allSettled(allUrls.map(fetchSingleRegistry));

	const seenSlugs = new Set<string>();
	const mergedRepos: SymphonyRegistry['repositories'] = [];

	for (const result of results) {
		if (result.status === 'fulfilled' && result.value) {
			for (const repo of result.value.repositories) {
				if (!seenSlugs.has(repo.slug)) {
					seenSlugs.add(repo.slug);
					mergedRepos.push(repo);
				}
			}
		}
	}

	if (mergedRepos.length === 0) {
		throw new SymphonyError('Failed to fetch registry from all configured URLs', 'network');
	}

	logger.info(
		`Merged registry: ${mergedRepos.length} repos from ${allUrls.length} sources`,
		LOG_CONTEXT
	);

	return {
		schemaVersion: '1.0',
		lastUpdated: new Date().toISOString(),
		repositories: mergedRepos,
	};
}

/**
 * Fetch GitHub star counts for multiple repositories.
 * Uses concurrent requests with a concurrency limit to stay within rate limits.
 */
async function fetchStarCounts(repoSlugs: string[]): Promise<Record<string, number>> {
	const CONCURRENCY = 5;
	const counts: Record<string, number> = {};

	for (let i = 0; i < repoSlugs.length; i += CONCURRENCY) {
		const batch = repoSlugs.slice(i, i + CONCURRENCY);
		const results = await Promise.allSettled(
			batch.map(async (slug) => {
				const response = await fetch(`${GITHUB_API_BASE}/repos/${slug}`, {
					headers: {
						Accept: 'application/vnd.github.v3+json',
						'User-Agent': 'Maestro-Symphony',
					},
				});
				if (!response.ok) return { slug, stars: 0 };
				const data = (await response.json()) as { stargazers_count?: number };
				return { slug, stars: data.stargazers_count ?? 0 };
			})
		);
		for (const result of results) {
			if (result.status === 'fulfilled') {
				counts[result.value.slug] = result.value.stars;
			}
		}
	}

	return counts;
}

/**
 * Fetch GitHub issues with runmaestro.ai label for a repository.
 */
async function fetchIssues(repoSlug: string): Promise<SymphonyIssue[]> {
	logger.info(`Fetching issues for ${repoSlug}`, LOG_CONTEXT);

	try {
		const url = `${GITHUB_API_BASE}/repos/${repoSlug}/issues?labels=${encodeURIComponent(SYMPHONY_ISSUE_LABEL)}&state=open`;
		const response = await fetch(url, {
			headers: {
				Accept: 'application/vnd.github.v3+json',
				'User-Agent': 'Maestro-Symphony',
			},
		});

		if (!response.ok) {
			throw new SymphonyError(`Failed to fetch issues: ${response.status}`, 'github_api');
		}

		const rawIssues = (await response.json()) as Array<{
			number: number;
			title: string;
			body: string | null;
			url: string;
			html_url: string;
			user: { login: string };
			created_at: string;
			updated_at: string;
			labels: Array<{ name: string; color: string }>;
		}>;

		// Transform to SymphonyIssue format (initially all as available)
		const issues: SymphonyIssue[] = rawIssues.map((issue) => ({
			number: issue.number,
			title: issue.title,
			body: issue.body || '',
			url: issue.url,
			htmlUrl: issue.html_url,
			author: issue.user.login,
			createdAt: issue.created_at,
			updatedAt: issue.updated_at,
			documentPaths: parseDocumentPaths(issue.body || ''),
			labels: (issue.labels || [])
				.filter((l) => l.name !== SYMPHONY_ISSUE_LABEL)
				.map((l) => ({ name: l.name, color: l.color })),
			status: 'available' as IssueStatus,
		}));

		// Fetch linked PRs to determine actual status
		await enrichIssuesWithPRStatus(repoSlug, issues);

		logger.info(`Fetched ${issues.length} issues for ${repoSlug}`, LOG_CONTEXT);
		return issues;
	} catch (error) {
		if (error instanceof SymphonyError) throw error;
		throw new SymphonyError(
			`Failed to fetch issues: ${error instanceof Error ? error.message : String(error)}`,
			'github_api',
			error
		);
	}
}

/**
 * Fetch issue counts for all repos in a single GitHub Search API call.
 * Uses the search/issues endpoint with multiple repo: qualifiers (OR'd together).
 * Returns a map of slug -> open issue count with the runmaestro.ai label.
 */
async function fetchIssueCounts(repoSlugs: string[]): Promise<Record<string, number>> {
	if (repoSlugs.length === 0) return {};

	logger.info(`Fetching issue counts for ${repoSlugs.length} repos via Search API`, LOG_CONTEXT);

	// Build query: label:runmaestro.ai state:open repo:A repo:B repo:C ...
	const repoQualifiers = repoSlugs.map((s) => `repo:${s}`).join('+');
	const query = `label:${encodeURIComponent(SYMPHONY_ISSUE_LABEL)}+state:open+${repoQualifiers}`;
	// Initialize all slugs to 0, then count from paginated results
	const counts: Record<string, number> = {};
	for (const slug of repoSlugs) {
		counts[slug] = 0;
	}

	let page = 1;
	while (true) {
		const url = `${GITHUB_API_BASE}/search/issues?q=${query}&per_page=100&page=${page}`;
		const response = await fetch(url, {
			headers: {
				Accept: 'application/vnd.github.v3+json',
				'User-Agent': 'Maestro-Symphony',
			},
		});

		if (!response.ok) {
			throw new SymphonyError(`Search API failed: ${response.status}`, 'github_api');
		}

		const data = (await response.json()) as {
			total_count: number;
			items: Array<{ repository_url: string }>;
		};

		for (const item of data.items) {
			// repository_url looks like https://api.github.com/repos/RunMaestro/Maestro
			const slug = item.repository_url.replace(`${GITHUB_API_BASE}/repos/`, '');
			if (slug in counts) {
				counts[slug]++;
			}
		}

		// Stop if we got fewer than a full page or hit GitHub's 1,000-result cap
		if (data.items.length < 100 || page >= 10) break;
		page++;
	}

	logger.info(`Issue counts fetched: ${JSON.stringify(counts)}`, LOG_CONTEXT);
	return counts;
}

/**
 * Enrich issues with PR status by searching for linked PRs.
 * Modifies issues in place.
 */
async function enrichIssuesWithPRStatus(repoSlug: string, issues: SymphonyIssue[]): Promise<void> {
	if (issues.length === 0) return;

	try {
		// Fetch open PRs for the repository
		const prsUrl = `${GITHUB_API_BASE}/repos/${repoSlug}/pulls?state=open&per_page=100`;
		const response = await fetch(prsUrl, {
			headers: {
				Accept: 'application/vnd.github.v3+json',
				'User-Agent': 'Maestro-Symphony',
			},
		});

		if (!response.ok) {
			logger.warn(`Failed to fetch PRs for issue status: ${response.status}`, LOG_CONTEXT);
			return;
		}

		const prs = (await response.json()) as Array<{
			number: number;
			title: string;
			body: string | null;
			html_url: string;
			user: { login: string };
			draft: boolean;
		}>;

		// Build a map of issue numbers to PRs that reference them
		// Look for patterns like "#123", "fixes #123", "closes #123", or "Symphony: ... (#123)" in title/body
		for (const pr of prs) {
			const prText = `${pr.title} ${pr.body || ''}`;

			for (const issue of issues) {
				// Match various patterns that reference the issue number
				const patterns = [
					new RegExp(`#${issue.number}\\b`), // #123
					new RegExp(`\\(#${issue.number}\\)`), // (#123) - Symphony PR title format
				];

				const isLinked = patterns.some((pattern) => pattern.test(prText));

				if (isLinked) {
					issue.status = 'in_progress';
					issue.claimedByPr = {
						number: pr.number,
						url: pr.html_url,
						author: pr.user.login,
						isDraft: pr.draft,
					};
					logger.debug(`Issue #${issue.number} linked to PR #${pr.number}`, LOG_CONTEXT);
					break; // One PR per issue is enough
				}
			}
		}
	} catch (error) {
		// Non-fatal - just log and continue with issues as available
		logger.warn('Failed to enrich issues with PR status', LOG_CONTEXT, {
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

// ============================================================================
// IPC Handler Registration
// ============================================================================

export function registerRegistryHandlers({
	app,
	settingsStore,
}: Pick<SymphonyHandlerDependencies, 'app' | 'settingsStore'>): void {
	/**
	 * Enrich registry repositories with star counts.
	 * Uses a 24-hour cache; fetches fresh counts only when cache is expired.
	 */
	async function enrichWithStars(
		registry: SymphonyRegistry,
		cache: SymphonyCache | null,
		forceRefresh: boolean
	): Promise<SymphonyRegistry> {
		const slugs = registry.repositories.filter((r) => r.isActive).map((r) => r.slug);
		if (slugs.length === 0) return registry;

		// Use cached star counts if valid
		if (!forceRefresh && cache?.stars && isCacheValid(cache.stars.fetchedAt, STARS_CACHE_TTL_MS)) {
			return {
				...registry,
				repositories: registry.repositories.map((r) => ({
					...r,
					stars: cache.stars!.data[r.slug],
				})),
			};
		}

		// Fetch fresh star counts (non-critical - fall back to stale cache or undefined)
		try {
			const counts = await fetchStarCounts(slugs);

			// Persist to cache
			const updatedCache: SymphonyCache = {
				...cache,
				issues: cache?.issues ?? {},
				stars: { data: counts, fetchedAt: Date.now() },
			};
			await writeCache(app, updatedCache);

			return {
				...registry,
				repositories: registry.repositories.map((r) => ({
					...r,
					stars: counts[r.slug],
				})),
			};
		} catch (error) {
			logger.warn('Failed to fetch star counts', LOG_CONTEXT, { error });

			// Fall back to stale cache if available
			if (cache?.stars) {
				return {
					...registry,
					repositories: registry.repositories.map((r) => ({
						...r,
						stars: cache.stars!.data[r.slug],
					})),
				};
			}
			return registry;
		}
	}

	/**
	 * Get the symphony registry (with caching).
	 */
	ipcMain.handle(
		'symphony:getRegistry',
		createIpcHandler(
			handlerOpts('getRegistry'),
			async (forceRefresh?: boolean): Promise<Omit<GetRegistryResponse, 'success'>> => {
				const cache = await readCache(app);

				// Runtime-validate custom URLs from settings
				const rawCustomUrls = settingsStore.get('symphonyRegistryUrls');
				const customUrls = Array.isArray(rawCustomUrls)
					? rawCustomUrls.filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
					: [];

				// Skip cache when custom sources are configured - cache doesn't track
				// which source URLs produced it, so URL changes would serve stale data.
				const hasCustomSources = customUrls.length > 0;

				// Check cache validity
				if (
					!forceRefresh &&
					!hasCustomSources &&
					cache?.registry &&
					isCacheValid(cache.registry.fetchedAt, REGISTRY_CACHE_TTL_MS)
				) {
					const enriched = await enrichWithStars(cache.registry.data, cache, false);
					return {
						registry: enriched,
						fromCache: true,
						cacheAge: Date.now() - cache.registry.fetchedAt,
					};
				}

				// Fetch fresh data from all configured registries
				try {
					const registry = await fetchRegistries(customUrls);
					const enriched = await enrichWithStars(registry, cache, !!forceRefresh);

					// Update cache (enriched registry includes stars on repo objects,
					// but the canonical star data lives in cache.stars)
					const newCache: SymphonyCache = {
						...(await readCache(app)), // Re-read to get stars written by enrichWithStars
						registry: {
							data: registry, // Store unenriched registry (stars are in cache.stars)
							fetchedAt: Date.now(),
						},
						issues: (await readCache(app))?.issues ?? {},
					};
					await writeCache(app, newCache);

					return {
						registry: enriched,
						fromCache: false,
					};
				} catch (error) {
					logger.warn('Failed to fetch Symphony registry from GitHub', LOG_CONTEXT, { error });

					// Fallback to expired cache if available (better than showing nothing)
					if (cache?.registry) {
						const cacheAge = Date.now() - cache.registry.fetchedAt;
						logger.info(
							`Using expired cache as fallback (age: ${Math.round(cacheAge / 1000)}s)`,
							LOG_CONTEXT
						);
						const enriched = await enrichWithStars(cache.registry.data, cache, false);
						return {
							registry: enriched,
							fromCache: true,
							cacheAge,
						};
					}

					// No cache available - re-throw to show error to user
					throw error;
				}
			}
		)
	);

	/**
	 * Get issues for a repository (with caching).
	 */
	ipcMain.handle(
		'symphony:getIssues',
		createIpcHandler(
			handlerOpts('getIssues'),
			async (
				repoSlug: string,
				forceRefresh?: boolean
			): Promise<Omit<GetIssuesResponse, 'success'>> => {
				const cache = await readCache(app);

				// Check cache
				const cached = cache?.issues?.[repoSlug];
				if (!forceRefresh && cached && isCacheValid(cached.fetchedAt, ISSUES_CACHE_TTL_MS)) {
					return {
						issues: cached.data,
						fromCache: true,
						cacheAge: Date.now() - cached.fetchedAt,
					};
				}

				// Fetch fresh
				try {
					const issues = await fetchIssues(repoSlug);

					// Update cache
					const newCache: SymphonyCache = {
						...cache,
						registry: cache?.registry,
						issues: {
							...cache?.issues,
							[repoSlug]: {
								data: issues,
								fetchedAt: Date.now(),
							},
						},
					};
					await writeCache(app, newCache);

					return {
						issues,
						fromCache: false,
					};
				} catch (error) {
					logger.warn('Failed to fetch Symphony issues from GitHub', LOG_CONTEXT, {
						repoSlug,
						error,
					});

					// Fallback to expired cache if available (better than showing nothing)
					if (cached?.data) {
						const cacheAge = Date.now() - cached.fetchedAt;
						logger.info(
							`Using expired issues cache as fallback (age: ${Math.round(cacheAge / 1000)}s)`,
							LOG_CONTEXT
						);
						return {
							issues: cached.data,
							fromCache: true,
							cacheAge,
						};
					}

					// No cache available - re-throw to show error to user
					throw error;
				}
			}
		)
	);

	/**
	 * Get issue counts for all active repos via GitHub Search API (single call).
	 */
	ipcMain.handle(
		'symphony:getIssueCounts',
		createIpcHandler(
			handlerOpts('getIssueCounts'),
			async (
				repoSlugs: string[],
				forceRefresh?: boolean
			): Promise<Omit<GetIssueCountsResponse, 'success'>> => {
				const cache = await readCache(app);
				const requestedSlugs = [...new Set(repoSlugs)].sort();

				// Check cache (must match requested slugs AND be within TTL)
				if (
					!forceRefresh &&
					cache?.issueCounts &&
					isCacheValid(cache.issueCounts.fetchedAt, ISSUE_COUNTS_CACHE_TTL_MS) &&
					cache.issueCounts.repoSlugs &&
					requestedSlugs.length === cache.issueCounts.repoSlugs.length &&
					requestedSlugs.every((s) => cache.issueCounts!.repoSlugs.includes(s))
				) {
					return {
						counts: cache.issueCounts.data,
						fromCache: true,
						cacheAge: Date.now() - cache.issueCounts.fetchedAt,
					};
				}

				// Fetch fresh via Search API
				try {
					const counts = await fetchIssueCounts(repoSlugs);

					// Update cache
					const newCache: SymphonyCache = {
						...cache,
						registry: cache?.registry,
						issues: cache?.issues ?? {},
						issueCounts: {
							data: counts,
							fetchedAt: Date.now(),
							repoSlugs: requestedSlugs,
						},
					};
					await writeCache(app, newCache);

					return {
						counts,
						fromCache: false,
					};
				} catch (error) {
					logger.warn('Failed to fetch issue counts from GitHub Search API', LOG_CONTEXT, {
						error,
					});

					// Fallback to expired cache if available
					if (cache?.issueCounts?.data) {
						const cacheAge = Date.now() - cache.issueCounts.fetchedAt;
						return {
							counts: cache.issueCounts.data,
							fromCache: true,
							cacheAge,
						};
					}

					throw error;
				}
			}
		)
	);
}
