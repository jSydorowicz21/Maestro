/**
 * Shared test setup for TabBar test files.
 *
 * Each split test file must declare its own vi.mock() calls (Vitest hoisting requirement),
 * then import these shared helpers for theme and tab creation.
 *
 * Delegates to shared helpers in src/__tests__/helpers/ to avoid duplicating
 * mock factories. Re-exports with TabBar-specific defaults.
 */

import type { AITab, FilePreviewTab } from '../../../renderer/types';
import { mockTheme } from '../../helpers/mockTheme';
import {
	createMockAITab,
	createMockFileTab as sharedCreateMockFileTab,
} from '../../helpers/mockTab';

/** Standard dark theme used across all TabBar tests (from shared helpers) */
export { mockTheme };

/** Helper to create AI tabs with sensible defaults for TabBar tests */
export function createTab(overrides: Partial<AITab> = {}): AITab {
	return createMockAITab({
		agentSessionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
		hasUnread: false,
		...overrides,
	});
}

/** Helper to create file preview tabs with sensible defaults for TabBar tests */
export function createFileTab(overrides: Partial<FilePreviewTab> = {}): FilePreviewTab {
	return sharedCreateMockFileTab({
		path: '/path/to/file.ts',
		...overrides,
	});
}
