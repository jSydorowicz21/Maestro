import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TabBar } from '../../../renderer/components/TabBar';
import type { AITab, Theme, FilePreviewTab } from '../../../renderer/types';
import { mockTheme, createTab, createFileTab } from './TabBar.setup';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
	X: ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
		<span data-testid="x-icon" className={className} style={style}>
			X
		</span>
	),
	Plus: ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
		<span data-testid="plus-icon" className={className} style={style}>
			+
		</span>
	),
	Star: ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
		<span data-testid="star-icon" className={className} style={style}>
			★
		</span>
	),
	Copy: ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
		<span data-testid="copy-icon" className={className} style={style}>
			📋
		</span>
	),
	Edit2: ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
		<span data-testid="edit-icon" className={className} style={style}>
			✎
		</span>
	),
	Bell: ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
		<span data-testid="bell-icon" className={className} style={style}>
			🔔
		</span>
	),
	Pencil: ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
		<span data-testid="pencil-icon" className={className} style={style}>
			✏
		</span>
	),
	Search: ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
		<span data-testid="search-icon" className={className} style={style}>
			🔍
		</span>
	),
	GitMerge: ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
		<span data-testid="git-merge-icon" className={className} style={style}>
			⎇
		</span>
	),
	ArrowRightCircle: ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
		<span data-testid="arrow-right-circle-icon" className={className} style={style}>
			→
		</span>
	),
	Minimize2: ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
		<span data-testid="minimize-icon" className={className} style={style}>
			⊟
		</span>
	),
	Download: ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
		<span data-testid="download-icon" className={className} style={style}>
			↓
		</span>
	),
	Clipboard: ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
		<span data-testid="clipboard-icon" className={className} style={style}>
			📎
		</span>
	),
	Share2: ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
		<span data-testid="share2-icon" className={className} style={style}>
			⬆
		</span>
	),
	ChevronsLeft: ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
		<span data-testid="chevrons-left-icon" className={className} style={style}>
			«
		</span>
	),
	ChevronsRight: ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
		<span data-testid="chevrons-right-icon" className={className} style={style}>
			»
		</span>
	),
	ExternalLink: ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
		<span data-testid="external-link-icon" className={className} style={style}>
			↗
		</span>
	),
	FolderOpen: ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
		<span data-testid="folder-open-icon" className={className} style={style}>
			📂
		</span>
	),
	Link: ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
		<span data-testid="link-icon" className={className} style={style}>
			🔗
		</span>
	),
	FileText: ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
		<span data-testid="file-text-icon" className={className} style={style}>
			📄
		</span>
	),
	Mail: ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
		<span data-testid="mail-icon" className={className} style={style}>
			✉
		</span>
	),
}));

// Mock react-dom createPortal
vi.mock('react-dom', async () => {
	const actual = await vi.importActual('react-dom');
	return {
		...actual,
		createPortal: (children: React.ReactNode) => children,
	};
});

describe('Unified tabs drag and drop', () => {
	const mockOnUnifiedTabReorder = vi.fn();
	const mockOnTabReorder = vi.fn();
	const mockOnFileTabSelect = vi.fn();
	const mockOnFileTabClose = vi.fn();

	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		Element.prototype.scrollTo = vi.fn();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	const aiTab1 = createTab({ id: 'ai-tab-1', name: 'AI Tab 1', agentSessionId: 'sess-1' });
	const aiTab2 = createTab({ id: 'ai-tab-2', name: 'AI Tab 2', agentSessionId: 'sess-2' });
	const aiTabs: AITab[] = [aiTab1, aiTab2];

	const fileTab1: FilePreviewTab = {
		id: 'file-tab-1',
		path: '/path/to/file1.ts',
		name: 'file1',
		extension: '.ts',
		content: 'const x = 1;',
		scrollTop: 0,
		searchQuery: '',
		editMode: false,
		editContent: undefined,
		createdAt: Date.now(),
		lastModified: Date.now(),
	};

	const fileTab2: FilePreviewTab = {
		id: 'file-tab-2',
		path: '/path/to/file2.md',
		name: 'file2',
		extension: '.md',
		content: '# File 2',
		scrollTop: 0,
		searchQuery: '',
		editMode: false,
		editContent: undefined,
		createdAt: Date.now() + 1,
		lastModified: Date.now() + 1,
	};

	// Unified tabs: AI, File, AI, File
	const unifiedTabs = [
		{ type: 'ai' as const, id: 'ai-tab-1', data: aiTab1 },
		{ type: 'file' as const, id: 'file-tab-1', data: fileTab1 },
		{ type: 'ai' as const, id: 'ai-tab-2', data: aiTab2 },
		{ type: 'file' as const, id: 'file-tab-2', data: fileTab2 },
	];

	it('drags AI tab to file tab position and calls onUnifiedTabReorder', () => {
		render(
			<TabBar
				tabs={aiTabs}
				activeTabId="ai-tab-1"
				theme={mockTheme}
				onTabSelect={vi.fn()}
				onTabClose={vi.fn()}
				onNewTab={vi.fn()}
				onTabReorder={mockOnTabReorder}
				onUnifiedTabReorder={mockOnUnifiedTabReorder}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
			/>
		);

		const aiTabElement = screen.getByText('AI Tab 1').closest('[data-tab-id]')!;
		const fileTabElement = screen.getByText('file1').closest('[data-tab-id]')!;

		// Start dragging ai-tab-1
		fireEvent.dragStart(aiTabElement, {
			dataTransfer: {
				effectAllowed: '',
				setData: vi.fn(),
				getData: vi.fn().mockReturnValue('ai-tab-1'),
			},
		});

		// Drop on file-tab-1
		fireEvent.drop(fileTabElement, {
			dataTransfer: {
				getData: vi.fn().mockReturnValue('ai-tab-1'),
			},
		});

		// Should call onUnifiedTabReorder with indices in unified array (0 to 1)
		expect(mockOnUnifiedTabReorder).toHaveBeenCalledWith(0, 1);
		// Should NOT call legacy onTabReorder since unified is available
		expect(mockOnTabReorder).not.toHaveBeenCalled();
	});

	it('drags file tab to AI tab position and calls onUnifiedTabReorder', () => {
		render(
			<TabBar
				tabs={aiTabs}
				activeTabId="ai-tab-1"
				theme={mockTheme}
				onTabSelect={vi.fn()}
				onTabClose={vi.fn()}
				onNewTab={vi.fn()}
				onTabReorder={mockOnTabReorder}
				onUnifiedTabReorder={mockOnUnifiedTabReorder}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
			/>
		);

		const fileTabElement = screen.getByText('file1').closest('[data-tab-id]')!;
		const aiTabElement = screen.getByText('AI Tab 2').closest('[data-tab-id]')!;

		// Start dragging file-tab-1 (index 1)
		fireEvent.dragStart(fileTabElement, {
			dataTransfer: {
				effectAllowed: '',
				setData: vi.fn(),
				getData: vi.fn().mockReturnValue('file-tab-1'),
			},
		});

		// Drop on ai-tab-2 (index 2)
		fireEvent.drop(aiTabElement, {
			dataTransfer: {
				getData: vi.fn().mockReturnValue('file-tab-1'),
			},
		});

		// Should call onUnifiedTabReorder (from index 1 to index 2)
		expect(mockOnUnifiedTabReorder).toHaveBeenCalledWith(1, 2);
	});

	it('drags file tab to another file tab position', () => {
		render(
			<TabBar
				tabs={aiTabs}
				activeTabId="ai-tab-1"
				theme={mockTheme}
				onTabSelect={vi.fn()}
				onTabClose={vi.fn()}
				onNewTab={vi.fn()}
				onTabReorder={mockOnTabReorder}
				onUnifiedTabReorder={mockOnUnifiedTabReorder}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
			/>
		);

		const fileTab1Element = screen.getByText('file1').closest('[data-tab-id]')!;
		const fileTab2Element = screen.getByText('file2').closest('[data-tab-id]')!;

		// Start dragging file-tab-1 (index 1)
		fireEvent.dragStart(fileTab1Element, {
			dataTransfer: {
				effectAllowed: '',
				setData: vi.fn(),
				getData: vi.fn().mockReturnValue('file-tab-1'),
			},
		});

		// Drop on file-tab-2 (index 3)
		fireEvent.drop(fileTab2Element, {
			dataTransfer: {
				getData: vi.fn().mockReturnValue('file-tab-1'),
			},
		});

		// Should call onUnifiedTabReorder (from index 1 to index 3)
		expect(mockOnUnifiedTabReorder).toHaveBeenCalledWith(1, 3);
	});

	it('does not reorder when dropping on the same tab', () => {
		render(
			<TabBar
				tabs={aiTabs}
				activeTabId="ai-tab-1"
				theme={mockTheme}
				onTabSelect={vi.fn()}
				onTabClose={vi.fn()}
				onNewTab={vi.fn()}
				onUnifiedTabReorder={mockOnUnifiedTabReorder}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
			/>
		);

		const fileTabElement = screen.getByText('file1').closest('[data-tab-id]')!;

		// Drop on same tab
		fireEvent.drop(fileTabElement, {
			dataTransfer: {
				getData: vi.fn().mockReturnValue('file-tab-1'),
			},
		});

		expect(mockOnUnifiedTabReorder).not.toHaveBeenCalled();
	});

	it('sets drag over visual feedback on target tab', () => {
		render(
			<TabBar
				tabs={aiTabs}
				activeTabId="ai-tab-1"
				theme={mockTheme}
				onTabSelect={vi.fn()}
				onTabClose={vi.fn()}
				onNewTab={vi.fn()}
				onUnifiedTabReorder={mockOnUnifiedTabReorder}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
			/>
		);

		const aiTabElement = screen.getByText('AI Tab 1').closest('[data-tab-id]')!;
		const fileTabElement = screen.getByText('file1').closest('[data-tab-id]')!;

		// Start dragging AI tab
		fireEvent.dragStart(aiTabElement, {
			dataTransfer: {
				effectAllowed: '',
				setData: vi.fn(),
				getData: vi.fn().mockReturnValue('ai-tab-1'),
			},
		});

		// Drag over file tab
		fireEvent.dragOver(fileTabElement, {
			dataTransfer: {
				dropEffect: '',
			},
		});

		// File tab should have ring visual
		expect(fileTabElement).toHaveClass('ring-2');
	});

	it('uses legacy onTabReorder when unifiedTabs is not provided', () => {
		render(
			<TabBar
				tabs={aiTabs}
				activeTabId="ai-tab-1"
				theme={mockTheme}
				onTabSelect={vi.fn()}
				onTabClose={vi.fn()}
				onNewTab={vi.fn()}
				onTabReorder={mockOnTabReorder}
				onUnifiedTabReorder={mockOnUnifiedTabReorder}
				// No unifiedTabs provided - should fall back to legacy behavior
			/>
		);

		const tab1 = screen.getByText('AI Tab 1').closest('[data-tab-id]')!;
		const tab2 = screen.getByText('AI Tab 2').closest('[data-tab-id]')!;

		// Start dragging tab-1
		fireEvent.dragStart(tab1, {
			dataTransfer: {
				effectAllowed: '',
				setData: vi.fn(),
				getData: vi.fn().mockReturnValue('ai-tab-1'),
			},
		});

		// Drop on tab-2
		fireEvent.drop(tab2, {
			dataTransfer: {
				getData: vi.fn().mockReturnValue('ai-tab-1'),
			},
		});

		// Should use legacy onTabReorder
		expect(mockOnTabReorder).toHaveBeenCalledWith(0, 1);
		// Should NOT call onUnifiedTabReorder
		expect(mockOnUnifiedTabReorder).not.toHaveBeenCalled();
	});

	it('shows Move to First/Last for file tabs when not at edges', async () => {
		render(
			<TabBar
				tabs={aiTabs}
				activeTabId="ai-tab-1"
				theme={mockTheme}
				onTabSelect={vi.fn()}
				onTabClose={vi.fn()}
				onNewTab={vi.fn()}
				onUnifiedTabReorder={mockOnUnifiedTabReorder}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
			/>
		);

		// Hover over file1 (index 1, not first or last)
		const fileTabElement = screen.getByText('file1').closest('[data-tab-id]')!;

		await act(async () => {
			fireEvent.mouseEnter(fileTabElement);
			vi.advanceTimersByTime(450);
		});

		// Should show both move options
		expect(screen.getByText('Move to First Position')).toBeInTheDocument();
		expect(screen.getByText('Move to Last Position')).toBeInTheDocument();
	});

	it('hides Move to First for first tab', async () => {
		render(
			<TabBar
				tabs={aiTabs}
				activeTabId="ai-tab-1"
				theme={mockTheme}
				onTabSelect={vi.fn()}
				onTabClose={vi.fn()}
				onNewTab={vi.fn()}
				onUnifiedTabReorder={mockOnUnifiedTabReorder}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
			/>
		);

		// Hover over AI Tab 1 (index 0, first tab)
		const aiTabElement = screen.getByText('AI Tab 1').closest('[data-tab-id]')!;

		await act(async () => {
			fireEvent.mouseEnter(aiTabElement);
			vi.advanceTimersByTime(450);
		});

		// Move to First should be hidden (not just disabled)
		expect(screen.queryByText('Move to First Position')).not.toBeInTheDocument();
		// Move to Last should be visible
		expect(screen.getByText('Move to Last Position')).toBeInTheDocument();
	});

	it('hides Move to Last for last tab', async () => {
		render(
			<TabBar
				tabs={aiTabs}
				activeTabId="ai-tab-1"
				theme={mockTheme}
				onTabSelect={vi.fn()}
				onTabClose={vi.fn()}
				onNewTab={vi.fn()}
				onUnifiedTabReorder={mockOnUnifiedTabReorder}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
			/>
		);

		// Hover over file2 (index 3, last tab)
		const fileTabElement = screen.getByText('file2').closest('[data-tab-id]')!;

		await act(async () => {
			fireEvent.mouseEnter(fileTabElement);
			vi.advanceTimersByTime(450);
		});

		// Move to First should be visible
		expect(screen.getByText('Move to First Position')).toBeInTheDocument();
		// Move to Last should be hidden (not just disabled)
		expect(screen.queryByText('Move to Last Position')).not.toBeInTheDocument();
	});

	it('calls onUnifiedTabReorder when Move to First is clicked on file tab', async () => {
		render(
			<TabBar
				tabs={aiTabs}
				activeTabId="ai-tab-1"
				theme={mockTheme}
				onTabSelect={vi.fn()}
				onTabClose={vi.fn()}
				onNewTab={vi.fn()}
				onUnifiedTabReorder={mockOnUnifiedTabReorder}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
			/>
		);

		// Hover over file1 (index 1)
		const fileTabElement = screen.getByText('file1').closest('[data-tab-id]')!;

		await act(async () => {
			fireEvent.mouseEnter(fileTabElement);
			vi.advanceTimersByTime(450);
		});

		// Click Move to First
		const moveButton = screen.getByText('Move to First Position');
		fireEvent.click(moveButton);

		// Should call onUnifiedTabReorder with index 1 -> 0
		expect(mockOnUnifiedTabReorder).toHaveBeenCalledWith(1, 0);
	});

	it('calls onUnifiedTabReorder when Move to Last is clicked on file tab', async () => {
		render(
			<TabBar
				tabs={aiTabs}
				activeTabId="ai-tab-1"
				theme={mockTheme}
				onTabSelect={vi.fn()}
				onTabClose={vi.fn()}
				onNewTab={vi.fn()}
				onUnifiedTabReorder={mockOnUnifiedTabReorder}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
			/>
		);

		// Hover over file1 (index 1)
		const fileTabElement = screen.getByText('file1').closest('[data-tab-id]')!;

		await act(async () => {
			fireEvent.mouseEnter(fileTabElement);
			vi.advanceTimersByTime(450);
		});

		// Click Move to Last
		const moveButton = screen.getByText('Move to Last Position');
		fireEvent.click(moveButton);

		// Should call onUnifiedTabReorder with index 1 -> 3 (last index)
		expect(mockOnUnifiedTabReorder).toHaveBeenCalledWith(1, 3);
	});

	it('middle-click closes file tab', () => {
		render(
			<TabBar
				tabs={aiTabs}
				activeTabId="ai-tab-1"
				theme={mockTheme}
				onTabSelect={vi.fn()}
				onTabClose={vi.fn()}
				onNewTab={vi.fn()}
				onUnifiedTabReorder={mockOnUnifiedTabReorder}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
			/>
		);

		const fileTabElement = screen.getByText('file1').closest('[data-tab-id]')!;

		// Middle-click on file tab
		fireEvent.mouseDown(fileTabElement, { button: 1 });

		expect(mockOnFileTabClose).toHaveBeenCalledWith('file-tab-1');
	});

	it('left-click does NOT close file tab', () => {
		render(
			<TabBar
				tabs={aiTabs}
				activeTabId="ai-tab-1"
				theme={mockTheme}
				onTabSelect={vi.fn()}
				onTabClose={vi.fn()}
				onNewTab={vi.fn()}
				onUnifiedTabReorder={mockOnUnifiedTabReorder}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
			/>
		);

		const fileTabElement = screen.getByText('file1').closest('[data-tab-id]')!;

		// Left-click on file tab (button: 0)
		fireEvent.mouseDown(fileTabElement, { button: 0 });

		// Should NOT close the tab
		expect(mockOnFileTabClose).not.toHaveBeenCalled();
	});

	it('right-click does NOT close file tab', () => {
		render(
			<TabBar
				tabs={aiTabs}
				activeTabId="ai-tab-1"
				theme={mockTheme}
				onTabSelect={vi.fn()}
				onTabClose={vi.fn()}
				onNewTab={vi.fn()}
				onUnifiedTabReorder={mockOnUnifiedTabReorder}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
			/>
		);

		const fileTabElement = screen.getByText('file1').closest('[data-tab-id]')!;

		// Right-click on file tab (button: 2)
		fireEvent.mouseDown(fileTabElement, { button: 2 });

		// Should NOT close the tab
		expect(mockOnFileTabClose).not.toHaveBeenCalled();
	});

	it('middle-click on AI tab still works in unified mode', () => {
		const mockOnAiTabClose = vi.fn();

		render(
			<TabBar
				tabs={aiTabs}
				activeTabId="ai-tab-1"
				theme={mockTheme}
				onTabSelect={vi.fn()}
				onTabClose={mockOnAiTabClose}
				onNewTab={vi.fn()}
				onUnifiedTabReorder={mockOnUnifiedTabReorder}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
			/>
		);

		const aiTabElement = screen.getByText('AI Tab 1').closest('[data-tab-id]')!;

		// Middle-click on AI tab
		fireEvent.mouseDown(aiTabElement, { button: 1 });

		// Should call the AI tab close handler, not file tab close handler
		expect(mockOnAiTabClose).toHaveBeenCalledWith('ai-tab-1');
		expect(mockOnFileTabClose).not.toHaveBeenCalled();
	});
});

describe('Unified active tab styling consistency', () => {
	const mockOnTabSelect = vi.fn();
	const mockOnTabClose = vi.fn();
	const mockOnNewTab = vi.fn();
	const mockOnFileTabSelect = vi.fn();
	const mockOnFileTabClose = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('applies same active styling to both AI tabs and file tabs', () => {
		const aiTab = createTab({ id: 'ai-tab-1', name: 'AI Tab' });
		const fileTab: FilePreviewTab = {
			id: 'file-tab-1',
			path: '/test/example.tsx',
			name: 'example',
			extension: '.tsx',
			content: 'const Example = () => {};',
			scrollTop: 0,
			searchQuery: '',
			editMode: false,
			editContent: undefined,
			createdAt: Date.now(),
			lastModified: Date.now(),
		};

		const unifiedTabs = [
			{ type: 'ai' as const, id: 'ai-tab-1', data: aiTab },
			{ type: 'file' as const, id: 'file-tab-1', data: fileTab },
		];

		// Test 1: Active AI tab styling
		const { rerender } = render(
			<TabBar
				tabs={[aiTab]}
				activeTabId="ai-tab-1"
				theme={mockTheme}
				onTabSelect={mockOnTabSelect}
				onTabClose={mockOnTabClose}
				onNewTab={mockOnNewTab}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
			/>
		);

		const activeAiTab = screen.getByText('AI Tab').closest('[data-tab-id]')!;
		expect(activeAiTab).toHaveStyle({ backgroundColor: mockTheme.colors.bgMain });
		expect(activeAiTab).toHaveStyle({ borderTopLeftRadius: '6px' });
		expect(activeAiTab).toHaveStyle({ borderTopRightRadius: '6px' });
		expect(activeAiTab).toHaveStyle({ marginBottom: '-1px' });
		expect(activeAiTab).toHaveStyle({ zIndex: '1' });

		// Test 2: Active file tab styling - switch active tab
		rerender(
			<TabBar
				tabs={[aiTab]}
				activeTabId="ai-tab-1"
				theme={mockTheme}
				onTabSelect={mockOnTabSelect}
				onTabClose={mockOnTabClose}
				onNewTab={mockOnNewTab}
				unifiedTabs={unifiedTabs}
				activeFileTabId="file-tab-1"
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
			/>
		);

		const activeFileTab = screen.getByText('example').closest('[data-tab-id]')!;
		// File tabs should have the same active styling as AI tabs
		expect(activeFileTab).toHaveStyle({ backgroundColor: mockTheme.colors.bgMain });
		expect(activeFileTab).toHaveStyle({ borderTopLeftRadius: '6px' });
		expect(activeFileTab).toHaveStyle({ borderTopRightRadius: '6px' });
		expect(activeFileTab).toHaveStyle({ marginBottom: '-1px' });
		expect(activeFileTab).toHaveStyle({ zIndex: '1' });
	});

	it('applies same inactive styling to both AI tabs and file tabs', () => {
		const aiTab = createTab({ id: 'ai-tab-1', name: 'AI Tab' });
		const fileTab: FilePreviewTab = {
			id: 'file-tab-1',
			path: '/test/example.tsx',
			name: 'example',
			extension: '.tsx',
			content: 'const Example = () => {};',
			scrollTop: 0,
			searchQuery: '',
			editMode: false,
			editContent: undefined,
			createdAt: Date.now(),
			lastModified: Date.now(),
		};

		const unifiedTabs = [
			{ type: 'ai' as const, id: 'ai-tab-1', data: aiTab },
			{ type: 'file' as const, id: 'file-tab-1', data: fileTab },
		];

		// Render with AI tab active (file tab inactive)
		render(
			<TabBar
				tabs={[aiTab]}
				activeTabId="ai-tab-1"
				theme={mockTheme}
				onTabSelect={mockOnTabSelect}
				onTabClose={mockOnTabClose}
				onNewTab={mockOnNewTab}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
			/>
		);

		const inactiveFileTab = screen.getByText('example').closest('[data-tab-id]') as HTMLElement;
		// Inactive file tab should NOT have the active background color (bright background)
		// It may be transparent or empty depending on how JSDOM handles it
		const bgColor = inactiveFileTab.style.backgroundColor;
		expect(bgColor === 'transparent' || bgColor === '').toBe(true);
		expect(inactiveFileTab).toHaveStyle({ marginBottom: '0' });
		expect(inactiveFileTab).toHaveStyle({ zIndex: '0' });
	});

	it('file tab displays extension badge with file extension text', () => {
		const aiTab = createTab({ id: 'ai-tab-1', name: 'AI Tab' });
		const fileTab: FilePreviewTab = {
			id: 'file-tab-1',
			path: '/test/example.tsx',
			name: 'example',
			extension: '.tsx',
			content: 'const Example = () => {};',
			scrollTop: 0,
			searchQuery: '',
			editMode: false,
			editContent: undefined,
			createdAt: Date.now(),
			lastModified: Date.now(),
		};

		const unifiedTabs = [
			{ type: 'ai' as const, id: 'ai-tab-1', data: aiTab },
			{ type: 'file' as const, id: 'file-tab-1', data: fileTab },
		];

		render(
			<TabBar
				tabs={[aiTab]}
				activeTabId="ai-tab-1"
				theme={mockTheme}
				onTabSelect={mockOnTabSelect}
				onTabClose={mockOnTabClose}
				onNewTab={mockOnNewTab}
				unifiedTabs={unifiedTabs}
				activeFileTabId="file-tab-1"
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
			/>
		);

		// File tab should show extension badge (uppercase, without leading dot)
		const extensionBadge = screen.getByText('TSX');
		expect(extensionBadge).toBeInTheDocument();
		// Verify it has the uppercase and small badge styling
		expect(extensionBadge.className).toContain('uppercase');
	});
});
