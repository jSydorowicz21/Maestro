/**
 * Glob pattern matching utilities.
 *
 * Shared between main process (IPC handlers, remote-fs) and renderer
 * (file explorer) to apply consistent ignore-pattern filtering.
 */

/**
 * Simple glob pattern matcher for ignore patterns.
 * Supports basic glob patterns: * (any chars) and ? (single char).
 *
 * IMPORTANT: This matcher operates on bare file/directory NAMES only,
 * not full paths. Patterns containing path separators (e.g., "src/dist")
 * will never match a bare name and are effectively ignored.
 * The `**` double-glob is treated as two consecutive `*` wildcards,
 * which is functionally equivalent to a single `*` for name matching.
 *
 * @param pattern - The glob pattern to match against
 * @param name - The file/folder name to test (must be a bare name, not a path)
 * @returns true if the name matches the pattern
 */
export function matchGlobPattern(pattern: string, name: string): boolean {
	// Convert glob pattern to regex
	// Escape special regex chars except * and ?
	const regexStr = pattern
		.replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special chars
		.replace(/\*/g, '.*') // * matches any chars
		.replace(/\?/g, '.'); // ? matches single char

	// Make it case-insensitive and match full string
	const regex = new RegExp(`^${regexStr}$`, 'i');
	return regex.test(name);
}

/**
 * Check if a file/folder name should be ignored based on patterns.
 * @param name - The file/folder name to check
 * @param patterns - Array of glob patterns to match against
 * @returns true if the name matches any ignore pattern
 */
export function shouldIgnore(name: string, patterns: string[]): boolean {
	return patterns.some((pattern) => matchGlobPattern(pattern, name));
}

/**
 * Default ignore patterns for SSH remote file indexing.
 *
 * Single source of truth used by:
 * - `src/main/stores/defaults.ts` (settings store default)
 * - `src/renderer/components/Settings/SshRemoteIgnoreSection.tsx` (reset-to-defaults)
 *
 * Sorted alphabetically for easy scanning. Add new entries in sort order.
 */
export const SSH_REMOTE_IGNORE_DEFAULTS: readonly string[] = [
	'*.egg-info',
	'.cache',
	'.git',
	'.gradle',
	'.m2',
	'.next',
	'.nuxt',
	'.nyc_output',
	'.parcel-cache',
	'.tox',
	'.turbo',
	'.venv',
	'__pycache__',
	'build',
	'coverage',
	'dist',
	'node_modules',
	'target',
	'vendor',
	'venv',
];
