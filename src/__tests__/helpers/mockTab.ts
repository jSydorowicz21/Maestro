import type { AITab, FilePreviewTab } from '../../renderer/types';

/**
 * Shared factory for creating mock AITab objects in tests.
 * Provides sensible defaults for all required fields.
 */
export function createMockAITab(overrides: Partial<AITab> = {}): AITab {
	return {
		id: 'tab-1',
		agentSessionId: null,
		name: null,
		starred: false,
		logs: [],
		inputValue: '',
		stagedImages: [],
		createdAt: Date.now(),
		state: 'idle',
		...overrides,
	};
}

/**
 * Shared factory for creating mock FilePreviewTab objects in tests.
 * Provides sensible defaults for all required fields.
 */
export function createMockFileTab(overrides: Partial<FilePreviewTab> = {}): FilePreviewTab {
	return {
		id: 'file-tab-1',
		path: '/test/file.ts',
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
