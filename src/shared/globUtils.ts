/**
 * Glob pattern matching utilities.
 *
 * Shared between main process (IPC handlers, remote-fs) and renderer
 * (file explorer) to apply consistent ignore-pattern filtering.
 */

/**
 * Simple glob pattern matcher for ignore patterns.
 * Supports basic glob patterns: *, ?, and character classes.
 * @param pattern - The glob pattern to match against
 * @param name - The file/folder name to test
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
