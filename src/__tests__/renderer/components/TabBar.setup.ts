/**
 * Shared test setup for TabBar test files.
 *
 * Each split test file must declare its own vi.mock() calls (Vitest hoisting requirement),
 * then import these shared helpers for theme and tab creation.
 */

import type { AITab, Theme, FilePreviewTab } from '../../../renderer/types';

/** Standard dark theme used across all TabBar tests */
export const mockTheme: Theme = {
	id: 'test-theme',
	name: 'Test Theme',
	mode: 'dark',
	colors: {
		bgMain: '#1a1a1a',
		bgSidebar: '#2a2a2a',
		bgActivity: '#3a3a3a',
		textMain: '#ffffff',
		textDim: '#888888',
		accent: '#007acc',
		border: '#444444',
		error: '#ff4444',
		success: '#44ff44',
		warning: '#ffaa00',
		vibe: '#ff00ff',
		agentStatus: '#00ff00',
	},
};

/** Helper to create AI tabs with sensible defaults */
export function createTab(overrides: Partial<AITab> = {}): AITab {
	return {
		id: 'tab-1',
		agentSessionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
		state: 'idle',
		name: '',
		starred: false,
		hasUnread: false,
		inputValue: '',
		stagedImages: [],
		...overrides,
	};
}

/** Helper to create file preview tabs with sensible defaults */
export function createFileTab(overrides: Partial<FilePreviewTab> = {}): FilePreviewTab {
	return {
		id: 'file-tab-1',
		path: '/path/to/file.ts',
		name: 'file',
		extension: '.ts',
		content: '// test content',
		scrollTop: 0,
		searchQuery: '',
		editMode: false,
		editContent: undefined,
		createdAt: Date.now(),
		lastModified: Date.now(),
		...overrides,
	};
}
