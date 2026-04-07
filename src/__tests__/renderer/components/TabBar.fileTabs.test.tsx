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

describe('FileTab overlay menu', () => {
	const aiTab = createTab({ id: 'tab-1', name: 'AI Tab 1', agentSessionId: 'sess-1' });
	const defaultTabs: AITab[] = [aiTab];

	const fileTab: FilePreviewTab = {
		id: 'file-tab-1',
		path: '/path/to/document.md',
		name: 'document',
		extension: '.md',
		content: '# Test Document\n\nThis is test content.',
		scrollTop: 0,
		searchQuery: '',
		editMode: false,
		editContent: undefined,
		createdAt: Date.now(),
		lastModified: Date.now(),
	};

	const unifiedTabs = [
		{ type: 'ai' as const, id: 'tab-1', data: aiTab },
		{ type: 'file' as const, id: 'file-tab-1', data: fileTab },
	];

	it('shows file overlay menu on hover after delay', async () => {
		vi.useFakeTimers();

		render(
			<TabBar
				tabs={defaultTabs}
				activeTabId="tab-1"
				theme={mockTheme}
				onTabSelect={vi.fn()}
				onTabClose={vi.fn()}
				onNewTab={vi.fn()}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={vi.fn()}
				onFileTabClose={vi.fn()}
			/>
		);

		const fileTabElement = screen.getByText('document').closest('[data-tab-id="file-tab-1"]');
		expect(fileTabElement).toBeInTheDocument();

		// Hover over the file tab
		await act(async () => {
			fireEvent.mouseEnter(fileTabElement!);
		});

		// Overlay should not be visible immediately
		expect(screen.queryByText('Copy File Path')).not.toBeInTheDocument();

		// Wait for the delay
		await act(async () => {
			vi.advanceTimersByTime(450);
		});

		// Overlay should now be visible with file-specific actions
		expect(screen.getByText('Copy File Path')).toBeInTheDocument();
		expect(screen.getByText('Copy File Name')).toBeInTheDocument();
		expect(screen.getByText('Open in Default App')).toBeInTheDocument();
		expect(screen.getByText(/Reveal in (Finder|Explorer|File Manager)/)).toBeInTheDocument();

		vi.useRealTimers();
	});

	it('shows file-specific actions in overlay menu', async () => {
		vi.useFakeTimers();

		render(
			<TabBar
				tabs={defaultTabs}
				activeTabId="tab-1"
				theme={mockTheme}
				onTabSelect={vi.fn()}
				onTabClose={vi.fn()}
				onNewTab={vi.fn()}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={vi.fn()}
				onFileTabClose={vi.fn()}
			/>
		);

		const fileTabElement = screen.getByText('document').closest('[data-tab-id="file-tab-1"]');

		await act(async () => {
			fireEvent.mouseEnter(fileTabElement!);
			vi.advanceTimersByTime(450);
		});

		// Should show file-specific actions (these are unique to file tabs)
		expect(screen.getByText('Copy File Path')).toBeInTheDocument();
		expect(screen.getByText('Open in Default App')).toBeInTheDocument();
		expect(screen.getByText(/Reveal in (Finder|Explorer|File Manager)/)).toBeInTheDocument();

		vi.useRealTimers();
	});

	it('copies file path to clipboard when clicking Copy File Path', async () => {
		vi.useFakeTimers();
		const mockWriteText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, 'clipboard', {
			value: { writeText: mockWriteText },
			writable: true,
		});

		render(
			<TabBar
				tabs={defaultTabs}
				activeTabId="tab-1"
				theme={mockTheme}
				onTabSelect={vi.fn()}
				onTabClose={vi.fn()}
				onNewTab={vi.fn()}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={vi.fn()}
				onFileTabClose={vi.fn()}
			/>
		);

		const fileTabElement = screen.getByText('document').closest('[data-tab-id="file-tab-1"]');

		await act(async () => {
			fireEvent.mouseEnter(fileTabElement!);
			vi.advanceTimersByTime(450);
		});

		const copyPathButton = screen.getByText('Copy File Path');
		await act(async () => {
			fireEvent.click(copyPathButton);
		});

		expect(mockWriteText).toHaveBeenCalledWith('/path/to/document.md');
		expect(screen.getByText('Copied!')).toBeInTheDocument();

		vi.useRealTimers();
	});

	it('copies filename with extension when clicking Copy File Name', async () => {
		vi.useFakeTimers();
		const mockWriteText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, 'clipboard', {
			value: { writeText: mockWriteText },
			writable: true,
		});

		render(
			<TabBar
				tabs={defaultTabs}
				activeTabId="tab-1"
				theme={mockTheme}
				onTabSelect={vi.fn()}
				onTabClose={vi.fn()}
				onNewTab={vi.fn()}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={vi.fn()}
				onFileTabClose={vi.fn()}
			/>
		);

		const fileTabElement = screen.getByText('document').closest('[data-tab-id="file-tab-1"]');

		await act(async () => {
			fireEvent.mouseEnter(fileTabElement!);
			vi.advanceTimersByTime(450);
		});

		const copyNameButton = screen.getByText('Copy File Name');
		await act(async () => {
			fireEvent.click(copyNameButton);
		});

		expect(mockWriteText).toHaveBeenCalledWith('document.md');

		vi.useRealTimers();
	});

	it('calls openPath when clicking Open in Default App', async () => {
		vi.useFakeTimers();
		const mockOpenPath = vi.fn().mockResolvedValue(undefined);
		window.maestro = {
			...window.maestro,
			shell: {
				...window.maestro.shell,
				openPath: mockOpenPath,
			},
		} as typeof window.maestro;

		render(
			<TabBar
				tabs={defaultTabs}
				activeTabId="tab-1"
				theme={mockTheme}
				onTabSelect={vi.fn()}
				onTabClose={vi.fn()}
				onNewTab={vi.fn()}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={vi.fn()}
				onFileTabClose={vi.fn()}
			/>
		);

		const fileTabElement = screen.getByText('document').closest('[data-tab-id="file-tab-1"]');

		await act(async () => {
			fireEvent.mouseEnter(fileTabElement!);
			vi.advanceTimersByTime(450);
		});

		const openButton = screen.getByText('Open in Default App');
		await act(async () => {
			fireEvent.click(openButton);
		});

		expect(mockOpenPath).toHaveBeenCalledWith('/path/to/document.md');

		vi.useRealTimers();
	});

	it('calls showItemInFolder when clicking Reveal in Finder/Explorer', async () => {
		vi.useFakeTimers();
		const mockShowItemInFolder = vi.fn().mockResolvedValue(undefined);
		window.maestro = {
			...window.maestro,
			shell: {
				...window.maestro.shell,
				showItemInFolder: mockShowItemInFolder,
			},
		} as typeof window.maestro;

		render(
			<TabBar
				tabs={defaultTabs}
				activeTabId="tab-1"
				theme={mockTheme}
				onTabSelect={vi.fn()}
				onTabClose={vi.fn()}
				onNewTab={vi.fn()}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={vi.fn()}
				onFileTabClose={vi.fn()}
			/>
		);

		const fileTabElement = screen.getByText('document').closest('[data-tab-id="file-tab-1"]');

		await act(async () => {
			fireEvent.mouseEnter(fileTabElement!);
			vi.advanceTimersByTime(450);
		});

		const revealButton = screen.getByText(/Reveal in (Finder|Explorer|File Manager)/);
		await act(async () => {
			fireEvent.click(revealButton);
		});

		expect(mockShowItemInFolder).toHaveBeenCalledWith('/path/to/document.md');

		vi.useRealTimers();
	});

	it('shows Close Tab action and calls onFileTabClose when clicked', async () => {
		vi.useFakeTimers();
		const mockFileTabClose = vi.fn();

		render(
			<TabBar
				tabs={defaultTabs}
				activeTabId="tab-1"
				theme={mockTheme}
				onTabSelect={vi.fn()}
				onTabClose={vi.fn()}
				onNewTab={vi.fn()}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={vi.fn()}
				onFileTabClose={mockFileTabClose}
			/>
		);

		const fileTabElement = screen.getByText('document').closest('[data-tab-id="file-tab-1"]');

		await act(async () => {
			fireEvent.mouseEnter(fileTabElement!);
			vi.advanceTimersByTime(450);
		});

		// Get all "Close Tab" buttons - find the one in the file tab overlay
		// The overlay buttons are in a div with specific styling
		const closeTabButtons = screen.getAllByText('Close Tab');
		// The file tab's Close Tab button is in a standalone button (not the one with "X" icon prefix from AI tab overlay)
		const closeButton = closeTabButtons.find((btn) =>
			btn.closest('.shadow-xl')?.textContent?.includes('Copy File Path')
		);
		expect(closeButton).toBeTruthy();

		await act(async () => {
			fireEvent.click(closeButton!);
		});

		expect(mockFileTabClose).toHaveBeenCalledWith('file-tab-1');

		vi.useRealTimers();
	});

	it('shows Close Other Tabs action and calls handler when clicked', async () => {
		vi.useFakeTimers();
		const mockCloseOtherTabs = vi.fn();

		// Create multiple tabs to test Close Other Tabs
		const fileTab2: FilePreviewTab = {
			id: 'file-tab-2',
			path: '/path/to/other.ts',
			name: 'other',
			extension: '.ts',
			content: 'const y = 2;',
			scrollTop: 0,
			searchQuery: '',
			editMode: false,
			editContent: undefined,
			createdAt: Date.now(),
			lastModified: Date.now(),
		};

		const multiFileUnifiedTabs = [
			{ type: 'ai' as const, id: 'tab-1', data: aiTab },
			{ type: 'file' as const, id: 'file-tab-1', data: fileTab },
			{ type: 'file' as const, id: 'file-tab-2', data: fileTab2 },
		];

		render(
			<TabBar
				tabs={defaultTabs}
				activeTabId="tab-1"
				theme={mockTheme}
				onTabSelect={vi.fn()}
				onTabClose={vi.fn()}
				onNewTab={vi.fn()}
				unifiedTabs={multiFileUnifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={vi.fn()}
				onFileTabClose={vi.fn()}
				onCloseOtherTabs={mockCloseOtherTabs}
			/>
		);

		const fileTabElement = screen.getByText('document').closest('[data-tab-id="file-tab-1"]');

		await act(async () => {
			fireEvent.mouseEnter(fileTabElement!);
			vi.advanceTimersByTime(450);
		});

		// Should show Close Other Tabs option
		const closeOtherButtons = screen.getAllByText('Close Other Tabs');
		// Find the one in the file tab overlay (has Copy File Path action)
		const closeOtherButton = closeOtherButtons.find((btn) =>
			btn.closest('.shadow-xl')?.textContent?.includes('Copy File Path')
		);
		expect(closeOtherButton).toBeTruthy();

		await act(async () => {
			fireEvent.click(closeOtherButton!);
		});

		expect(mockCloseOtherTabs).toHaveBeenCalled();

		vi.useRealTimers();
	});

	it('disables Close Other Tabs when only one tab exists', async () => {
		vi.useFakeTimers();
		const mockCloseOtherTabs = vi.fn();

		// Single tab only
		const singleTabUnified = [{ type: 'file' as const, id: 'file-tab-1', data: fileTab }];

		render(
			<TabBar
				tabs={[]}
				activeTabId=""
				theme={mockTheme}
				onTabSelect={vi.fn()}
				onTabClose={vi.fn()}
				onNewTab={vi.fn()}
				unifiedTabs={singleTabUnified}
				activeFileTabId="file-tab-1"
				onFileTabSelect={vi.fn()}
				onFileTabClose={vi.fn()}
				onCloseOtherTabs={mockCloseOtherTabs}
			/>
		);

		const fileTabElement = screen.getByText('document').closest('[data-tab-id="file-tab-1"]');

		await act(async () => {
			fireEvent.mouseEnter(fileTabElement!);
			vi.advanceTimersByTime(450);
		});

		// Should show Close Other Tabs but disabled
		const closeOtherButton = screen.getByText('Close Other Tabs');
		expect(closeOtherButton).toBeInTheDocument();
		expect(closeOtherButton.closest('button')).toHaveAttribute('disabled');

		vi.useRealTimers();
	});

	it('shows Close Tabs to Left action and calls handler when clicked', async () => {
		vi.useFakeTimers();
		const mockCloseTabsLeft = vi.fn();

		// Create multiple tabs - file tab in the middle
		const fileTab2: FilePreviewTab = {
			id: 'file-tab-2',
			path: '/path/to/other.ts',
			name: 'other',
			extension: '.ts',
			content: 'const y = 2;',
			scrollTop: 0,
			searchQuery: '',
			editMode: false,
			editContent: undefined,
			createdAt: Date.now(),
			lastModified: Date.now(),
		};

		// File tab is at index 1 (has tabs to the left)
		const multiTabsUnified = [
			{ type: 'ai' as const, id: 'tab-1', data: aiTab },
			{ type: 'file' as const, id: 'file-tab-1', data: fileTab },
			{ type: 'file' as const, id: 'file-tab-2', data: fileTab2 },
		];

		render(
			<TabBar
				tabs={defaultTabs}
				activeTabId="tab-1"
				theme={mockTheme}
				onTabSelect={vi.fn()}
				onTabClose={vi.fn()}
				onNewTab={vi.fn()}
				unifiedTabs={multiTabsUnified}
				activeFileTabId={null}
				onFileTabSelect={vi.fn()}
				onFileTabClose={vi.fn()}
				onCloseTabsLeft={mockCloseTabsLeft}
			/>
		);

		// Hover over the middle tab (file-tab-1 at index 1)
		const fileTabElement = screen.getByText('document').closest('[data-tab-id="file-tab-1"]');

		await act(async () => {
			fireEvent.mouseEnter(fileTabElement!);
			vi.advanceTimersByTime(450);
		});

		// Should show Close Tabs to Left option
		const closeLeftButtons = screen.getAllByText('Close Tabs to Left');
		const closeLeftButton = closeLeftButtons.find((btn) =>
			btn.closest('.shadow-xl')?.textContent?.includes('Copy File Path')
		);
		expect(closeLeftButton).toBeTruthy();

		await act(async () => {
			fireEvent.click(closeLeftButton!);
		});

		expect(mockCloseTabsLeft).toHaveBeenCalled();

		vi.useRealTimers();
	});

	it('disables Close Tabs to Left for first tab', async () => {
		vi.useFakeTimers();
		const mockCloseTabsLeft = vi.fn();

		// File tab is first
		const fileFirstUnified = [
			{ type: 'file' as const, id: 'file-tab-1', data: fileTab },
			{ type: 'ai' as const, id: 'tab-1', data: aiTab },
		];

		render(
			<TabBar
				tabs={defaultTabs}
				activeTabId="tab-1"
				theme={mockTheme}
				onTabSelect={vi.fn()}
				onTabClose={vi.fn()}
				onNewTab={vi.fn()}
				unifiedTabs={fileFirstUnified}
				activeFileTabId={null}
				onFileTabSelect={vi.fn()}
				onFileTabClose={vi.fn()}
				onCloseTabsLeft={mockCloseTabsLeft}
			/>
		);

		const fileTabElement = screen.getByText('document').closest('[data-tab-id="file-tab-1"]');

		await act(async () => {
			fireEvent.mouseEnter(fileTabElement!);
			vi.advanceTimersByTime(450);
		});

		// Should show Close Tabs to Left but disabled (first tab)
		const closeLeftButton = screen.getByText('Close Tabs to Left');
		expect(closeLeftButton).toBeInTheDocument();
		expect(closeLeftButton.closest('button')).toHaveAttribute('disabled');

		vi.useRealTimers();
	});

	it('shows Close Tabs to Right action and calls handler when clicked', async () => {
		vi.useFakeTimers();
		const mockCloseTabsRight = vi.fn();

		// Create multiple tabs - file tab in the middle
		const fileTab2: FilePreviewTab = {
			id: 'file-tab-2',
			path: '/path/to/other.ts',
			name: 'other',
			extension: '.ts',
			content: 'const y = 2;',
			scrollTop: 0,
			searchQuery: '',
			editMode: false,
			editContent: undefined,
			createdAt: Date.now(),
			lastModified: Date.now(),
		};

		// File tab is at index 1 (has tabs to the right)
		const multiTabsUnified = [
			{ type: 'ai' as const, id: 'tab-1', data: aiTab },
			{ type: 'file' as const, id: 'file-tab-1', data: fileTab },
			{ type: 'file' as const, id: 'file-tab-2', data: fileTab2 },
		];

		render(
			<TabBar
				tabs={defaultTabs}
				activeTabId="tab-1"
				theme={mockTheme}
				onTabSelect={vi.fn()}
				onTabClose={vi.fn()}
				onNewTab={vi.fn()}
				unifiedTabs={multiTabsUnified}
				activeFileTabId={null}
				onFileTabSelect={vi.fn()}
				onFileTabClose={vi.fn()}
				onCloseTabsRight={mockCloseTabsRight}
			/>
		);

		// Hover over the middle tab (file-tab-1 at index 1)
		const fileTabElement = screen.getByText('document').closest('[data-tab-id="file-tab-1"]');

		await act(async () => {
			fireEvent.mouseEnter(fileTabElement!);
			vi.advanceTimersByTime(450);
		});

		// Should show Close Tabs to Right option
		const closeRightButtons = screen.getAllByText('Close Tabs to Right');
		const closeRightButton = closeRightButtons.find((btn) =>
			btn.closest('.shadow-xl')?.textContent?.includes('Copy File Path')
		);
		expect(closeRightButton).toBeTruthy();

		await act(async () => {
			fireEvent.click(closeRightButton!);
		});

		expect(mockCloseTabsRight).toHaveBeenCalled();

		vi.useRealTimers();
	});

	it('disables Close Tabs to Right for last tab', async () => {
		vi.useFakeTimers();
		const mockCloseTabsRight = vi.fn();

		// File tab is last
		const fileLastUnified = [
			{ type: 'ai' as const, id: 'tab-1', data: aiTab },
			{ type: 'file' as const, id: 'file-tab-1', data: fileTab },
		];

		render(
			<TabBar
				tabs={defaultTabs}
				activeTabId="tab-1"
				theme={mockTheme}
				onTabSelect={vi.fn()}
				onTabClose={vi.fn()}
				onNewTab={vi.fn()}
				unifiedTabs={fileLastUnified}
				activeFileTabId={null}
				onFileTabSelect={vi.fn()}
				onFileTabClose={vi.fn()}
				onCloseTabsRight={mockCloseTabsRight}
			/>
		);

		const fileTabElement = screen.getByText('document').closest('[data-tab-id="file-tab-1"]');

		await act(async () => {
			fireEvent.mouseEnter(fileTabElement!);
			vi.advanceTimersByTime(450);
		});

		// Should show Close Tabs to Right but disabled (last tab)
		const closeRightButton = screen.getByText('Close Tabs to Right');
		expect(closeRightButton).toBeInTheDocument();
		expect(closeRightButton.closest('button')).toHaveAttribute('disabled');

		vi.useRealTimers();
	});

	it('shows Move to First Position for non-first file tabs', async () => {
		vi.useFakeTimers();
		const mockUnifiedReorder = vi.fn();

		// Put file tab in second position
		const unifiedTabsWithFileSecond = [
			{ type: 'ai' as const, id: 'tab-1', data: aiTab },
			{ type: 'file' as const, id: 'file-tab-1', data: fileTab },
		];

		render(
			<TabBar
				tabs={defaultTabs}
				activeTabId="tab-1"
				theme={mockTheme}
				onTabSelect={vi.fn()}
				onTabClose={vi.fn()}
				onNewTab={vi.fn()}
				unifiedTabs={unifiedTabsWithFileSecond}
				activeFileTabId={null}
				onFileTabSelect={vi.fn()}
				onFileTabClose={vi.fn()}
				onUnifiedTabReorder={mockUnifiedReorder}
			/>
		);

		const fileTabElement = screen.getByText('document').closest('[data-tab-id="file-tab-1"]');

		await act(async () => {
			fireEvent.mouseEnter(fileTabElement!);
			vi.advanceTimersByTime(450);
		});

		// Should show Move to First Position
		expect(screen.getByText('Move to First Position')).toBeInTheDocument();

		vi.useRealTimers();
	});

	it('hides Move to First Position for first file tab', async () => {
		vi.useFakeTimers();
		const mockUnifiedReorder = vi.fn();

		// Put file tab in first position
		const unifiedTabsWithFileFirst = [
			{ type: 'file' as const, id: 'file-tab-1', data: fileTab },
			{ type: 'ai' as const, id: 'tab-1', data: aiTab },
		];

		render(
			<TabBar
				tabs={defaultTabs}
				activeTabId="tab-1"
				theme={mockTheme}
				onTabSelect={vi.fn()}
				onTabClose={vi.fn()}
				onNewTab={vi.fn()}
				unifiedTabs={unifiedTabsWithFileFirst}
				activeFileTabId={null}
				onFileTabSelect={vi.fn()}
				onFileTabClose={vi.fn()}
				onUnifiedTabReorder={mockUnifiedReorder}
			/>
		);

		const fileTabElement = screen.getByText('document').closest('[data-tab-id="file-tab-1"]');

		await act(async () => {
			fireEvent.mouseEnter(fileTabElement!);
			vi.advanceTimersByTime(450);
		});

		// Should NOT show Move to First Position
		expect(screen.queryByText('Move to First Position')).not.toBeInTheDocument();

		vi.useRealTimers();
	});

	it('closes overlay when mouse leaves', async () => {
		vi.useFakeTimers();

		render(
			<TabBar
				tabs={defaultTabs}
				activeTabId="tab-1"
				theme={mockTheme}
				onTabSelect={vi.fn()}
				onTabClose={vi.fn()}
				onNewTab={vi.fn()}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={vi.fn()}
				onFileTabClose={vi.fn()}
			/>
		);

		const fileTabElement = screen.getByText('document').closest('[data-tab-id="file-tab-1"]');

		// Hover to open overlay
		await act(async () => {
			fireEvent.mouseEnter(fileTabElement!);
			vi.advanceTimersByTime(450);
		});

		expect(screen.getByText('Copy File Path')).toBeInTheDocument();

		// Mouse leave from tab
		await act(async () => {
			fireEvent.mouseLeave(fileTabElement!);
			vi.advanceTimersByTime(150); // Wait for close delay
		});

		// Overlay should be closed
		expect(screen.queryByText('Copy File Path')).not.toBeInTheDocument();

		vi.useRealTimers();
	});
});

describe('File tab content and SSH support', () => {
	const mockOnTabSelect = vi.fn();
	const mockOnTabClose = vi.fn();
	const mockOnNewTab = vi.fn();
	const mockOnFileTabSelect = vi.fn();
	const mockOnFileTabClose = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('file tab stores content field', () => {
		const aiTab = createTab({ id: 'ai-tab-1', name: 'AI Tab' });
		const fileContent = '# Test Content\n\nThis is the file content stored on the tab.';
		const fileTab: FilePreviewTab = {
			id: 'file-tab-1',
			path: '/test/readme.md',
			name: 'readme',
			extension: '.md',
			content: fileContent, // Content is stored on the tab
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

		// Verify the file tab renders (content is used by MainPanel, not TabBar)
		expect(screen.getByText('readme')).toBeInTheDocument();
		// Verify the content is stored on the tab data
		expect(fileTab.content).toBe(fileContent);
	});

	it('file tab supports SSH remote ID', () => {
		const aiTab = createTab({ id: 'ai-tab-1', name: 'AI Tab' });
		const fileTab: FilePreviewTab = {
			id: 'file-tab-1',
			path: '/remote/project/src/main.ts',
			name: 'main',
			extension: '.ts',
			content: 'export const main = () => {}',
			scrollTop: 0,
			searchQuery: '',
			editMode: false,
			editContent: undefined,
			createdAt: Date.now(),
			lastModified: Date.now(),
			sshRemoteId: 'ssh-remote-123', // SSH remote ID for re-fetching
			isLoading: false,
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

		// Verify the file tab renders
		expect(screen.getByText('main')).toBeInTheDocument();
		// Verify SSH remote ID is stored
		expect(fileTab.sshRemoteId).toBe('ssh-remote-123');
		expect(fileTab.isLoading).toBe(false);
	});

	it('file tab can be in loading state for SSH files', () => {
		const aiTab = createTab({ id: 'ai-tab-1', name: 'AI Tab' });
		const fileTab: FilePreviewTab = {
			id: 'file-tab-1',
			path: '/remote/project/loading.ts',
			name: 'loading',
			extension: '.ts',
			content: '', // Empty while loading
			scrollTop: 0,
			searchQuery: '',
			editMode: false,
			editContent: undefined,
			createdAt: Date.now(),
			lastModified: 0, // Not yet loaded
			sshRemoteId: 'ssh-remote-456',
			isLoading: true, // Currently loading content
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

		// Tab still renders while loading
		expect(screen.getByText('loading')).toBeInTheDocument();
		// Verify loading state
		expect(fileTab.isLoading).toBe(true);
		expect(fileTab.content).toBe('');
	});

	it('file tab editContent takes precedence over content when set', () => {
		const aiTab = createTab({ id: 'ai-tab-1', name: 'AI Tab' });
		const originalContent = 'Original file content';
		const editedContent = 'Edited content not yet saved';
		const fileTab: FilePreviewTab = {
			id: 'file-tab-1',
			path: '/test/edited.md',
			name: 'edited',
			extension: '.md',
			content: originalContent,
			scrollTop: 100,
			searchQuery: 'search',
			editMode: true,
			editContent: editedContent, // Has unsaved edits
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

		// Tab renders
		expect(screen.getByText('edited')).toBeInTheDocument();
		// Verify both content fields exist (MainPanel uses editContent ?? content)
		expect(fileTab.content).toBe(originalContent);
		expect(fileTab.editContent).toBe(editedContent);
		expect(fileTab.editMode).toBe(true);
	});
});

describe('Extension badge styling across themes', () => {
	const mockOnTabSelect = vi.fn();
	const mockOnTabClose = vi.fn();
	const mockOnNewTab = vi.fn();
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

	// Light theme for testing contrast
	const lightTheme: Theme = {
		id: 'github-light',
		name: 'GitHub Light',
		mode: 'light',
		colors: {
			bgMain: '#ffffff',
			bgSidebar: '#f6f8fa',
			bgActivity: '#eff2f5',
			textMain: '#24292f',
			textDim: '#57606a',
			accent: '#0969da',
			border: '#d0d7de',
			error: '#cf222e',
			success: '#1a7f37',
			warning: '#9a6700',
		},
	};

	// Dark theme for comparison
	const darkTheme: Theme = {
		id: 'dracula',
		name: 'Dracula',
		mode: 'dark',
		colors: {
			bgMain: '#282a36',
			bgSidebar: '#21222c',
			bgActivity: '#343746',
			textMain: '#f8f8f2',
			textDim: '#6272a4',
			accent: '#bd93f9',
			border: '#44475a',
			error: '#ff5555',
			success: '#50fa7b',
			warning: '#ffb86c',
		},
	};

	const createFileTab = (extension: string): FilePreviewTab => ({
		id: `file-tab-${extension}`,
		path: `/test/file${extension}`,
		name: 'file',
		extension: extension,
		content: 'test content',
		scrollTop: 0,
		searchQuery: '',
		editMode: false,
		editContent: undefined,
		createdAt: Date.now(),
		lastModified: Date.now(),
	});

	it('renders extension badges for TypeScript files with appropriate styling', () => {
		const aiTab = createTab({ id: 'ai-tab-1', name: 'AI Tab' });
		const fileTab = createFileTab('.ts');

		const unifiedTabs = [
			{ type: 'ai' as const, id: 'ai-tab-1', data: aiTab },
			{ type: 'file' as const, id: fileTab.id, data: fileTab },
		];

		render(
			<TabBar
				tabs={[aiTab]}
				activeTabId="ai-tab-1"
				theme={darkTheme}
				onTabSelect={mockOnTabSelect}
				onTabClose={mockOnTabClose}
				onNewTab={mockOnNewTab}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
			/>
		);

		// Extension badge should be rendered
		const badge = screen.getByText('TS');
		expect(badge).toBeInTheDocument();
		// Badge should have blue-ish background for TypeScript
		expect(badge).toHaveStyle({ backgroundColor: 'rgba(59, 130, 246, 0.3)' });
	});

	it('renders extension badges for TypeScript files with light theme appropriate styling', () => {
		const aiTab = createTab({ id: 'ai-tab-1', name: 'AI Tab' });
		const fileTab = createFileTab('.tsx');

		const unifiedTabs = [
			{ type: 'ai' as const, id: 'ai-tab-1', data: aiTab },
			{ type: 'file' as const, id: fileTab.id, data: fileTab },
		];

		render(
			<TabBar
				tabs={[aiTab]}
				activeTabId="ai-tab-1"
				theme={lightTheme}
				onTabSelect={mockOnTabSelect}
				onTabClose={mockOnTabClose}
				onNewTab={mockOnNewTab}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
			/>
		);

		// Extension badge should be rendered with light theme colors
		const badge = screen.getByText('TSX');
		expect(badge).toBeInTheDocument();
		// Badge should have darker blue for better contrast on light backgrounds
		expect(badge).toHaveStyle({ backgroundColor: 'rgba(37, 99, 235, 0.15)' });
	});

	it('renders extension badges for Markdown files with dark theme styling', () => {
		const aiTab = createTab({ id: 'ai-tab-1', name: 'AI Tab' });
		const fileTab = createFileTab('.md');

		const unifiedTabs = [
			{ type: 'ai' as const, id: 'ai-tab-1', data: aiTab },
			{ type: 'file' as const, id: fileTab.id, data: fileTab },
		];

		render(
			<TabBar
				tabs={[aiTab]}
				activeTabId="ai-tab-1"
				theme={darkTheme}
				onTabSelect={mockOnTabSelect}
				onTabClose={mockOnTabClose}
				onNewTab={mockOnNewTab}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
			/>
		);

		const badge = screen.getByText('MD');
		expect(badge).toBeInTheDocument();
		// Green tones for Markdown/Docs
		expect(badge).toHaveStyle({ backgroundColor: 'rgba(34, 197, 94, 0.3)' });
	});

	it('renders extension badges for JSON files with dark theme styling', () => {
		const aiTab = createTab({ id: 'ai-tab-1', name: 'AI Tab' });
		const fileTab = createFileTab('.json');

		const unifiedTabs = [
			{ type: 'ai' as const, id: 'ai-tab-1', data: aiTab },
			{ type: 'file' as const, id: fileTab.id, data: fileTab },
		];

		render(
			<TabBar
				tabs={[aiTab]}
				activeTabId="ai-tab-1"
				theme={darkTheme}
				onTabSelect={mockOnTabSelect}
				onTabClose={mockOnTabClose}
				onNewTab={mockOnNewTab}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
			/>
		);

		const badge = screen.getByText('JSON');
		expect(badge).toBeInTheDocument();
		// Yellow tones for JSON/Config
		expect(badge).toHaveStyle({ backgroundColor: 'rgba(234, 179, 8, 0.3)' });
	});

	it('renders extension badges for CSS files with dark theme styling', () => {
		const aiTab = createTab({ id: 'ai-tab-1', name: 'AI Tab' });
		const fileTab = createFileTab('.css');

		const unifiedTabs = [
			{ type: 'ai' as const, id: 'ai-tab-1', data: aiTab },
			{ type: 'file' as const, id: fileTab.id, data: fileTab },
		];

		render(
			<TabBar
				tabs={[aiTab]}
				activeTabId="ai-tab-1"
				theme={darkTheme}
				onTabSelect={mockOnTabSelect}
				onTabClose={mockOnTabClose}
				onNewTab={mockOnNewTab}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
			/>
		);

		const badge = screen.getByText('CSS');
		expect(badge).toBeInTheDocument();
		// Purple tones for CSS/Styles
		expect(badge).toHaveStyle({ backgroundColor: 'rgba(168, 85, 247, 0.3)' });
	});

	it('renders extension badges for HTML files with dark theme styling', () => {
		const aiTab = createTab({ id: 'ai-tab-1', name: 'AI Tab' });
		const fileTab = createFileTab('.html');

		const unifiedTabs = [
			{ type: 'ai' as const, id: 'ai-tab-1', data: aiTab },
			{ type: 'file' as const, id: fileTab.id, data: fileTab },
		];

		render(
			<TabBar
				tabs={[aiTab]}
				activeTabId="ai-tab-1"
				theme={darkTheme}
				onTabSelect={mockOnTabSelect}
				onTabClose={mockOnTabClose}
				onNewTab={mockOnNewTab}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
			/>
		);

		const badge = screen.getByText('HTML');
		expect(badge).toBeInTheDocument();
		// Orange tones for HTML/Templates
		expect(badge).toHaveStyle({ backgroundColor: 'rgba(249, 115, 22, 0.3)' });
	});

	it('renders extension badges for Python files with dark theme styling', () => {
		const aiTab = createTab({ id: 'ai-tab-1', name: 'AI Tab' });
		const fileTab = createFileTab('.py');

		const unifiedTabs = [
			{ type: 'ai' as const, id: 'ai-tab-1', data: aiTab },
			{ type: 'file' as const, id: fileTab.id, data: fileTab },
		];

		render(
			<TabBar
				tabs={[aiTab]}
				activeTabId="ai-tab-1"
				theme={darkTheme}
				onTabSelect={mockOnTabSelect}
				onTabClose={mockOnTabClose}
				onNewTab={mockOnNewTab}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
			/>
		);

		const badge = screen.getByText('PY');
		expect(badge).toBeInTheDocument();
		// Teal/cyan tones for Python
		expect(badge).toHaveStyle({ backgroundColor: 'rgba(20, 184, 166, 0.3)' });
	});

	it('renders extension badges for Rust files with dark theme styling', () => {
		const aiTab = createTab({ id: 'ai-tab-1', name: 'AI Tab' });
		const fileTab = createFileTab('.rs');

		const unifiedTabs = [
			{ type: 'ai' as const, id: 'ai-tab-1', data: aiTab },
			{ type: 'file' as const, id: fileTab.id, data: fileTab },
		];

		render(
			<TabBar
				tabs={[aiTab]}
				activeTabId="ai-tab-1"
				theme={darkTheme}
				onTabSelect={mockOnTabSelect}
				onTabClose={mockOnTabClose}
				onNewTab={mockOnNewTab}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
			/>
		);

		const badge = screen.getByText('RS');
		expect(badge).toBeInTheDocument();
		// Rust/red-orange tones for Rust
		expect(badge).toHaveStyle({ backgroundColor: 'rgba(239, 68, 68, 0.3)' });
	});

	it('renders extension badges for unknown files using theme border color', () => {
		const aiTab = createTab({ id: 'ai-tab-1', name: 'AI Tab' });
		const fileTab = createFileTab('.xyz');

		const unifiedTabs = [
			{ type: 'ai' as const, id: 'ai-tab-1', data: aiTab },
			{ type: 'file' as const, id: fileTab.id, data: fileTab },
		];

		render(
			<TabBar
				tabs={[aiTab]}
				activeTabId="ai-tab-1"
				theme={darkTheme}
				onTabSelect={mockOnTabSelect}
				onTabClose={mockOnTabClose}
				onNewTab={mockOnNewTab}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
			/>
		);

		const badge = screen.getByText('XYZ');
		expect(badge).toBeInTheDocument();
		// Unknown extensions use accent-derived color for visibility
		expect(badge).toHaveStyle({ backgroundColor: 'rgba(189, 147, 249, 0.3)' });
	});

	it('renders consistent tab name truncation for file tabs (max-w-[120px])', () => {
		const aiTab = createTab({ id: 'ai-tab-1', name: 'AI Tab' });
		const fileTab: FilePreviewTab = {
			id: 'file-tab-1',
			path: '/test/very-long-filename-that-should-be-truncated.ts',
			name: 'very-long-filename-that-should-be-truncated',
			extension: '.ts',
			content: 'test',
			scrollTop: 0,
			searchQuery: '',
			editMode: false,
			editContent: undefined,
			createdAt: Date.now(),
			lastModified: Date.now(),
		};

		const unifiedTabs = [
			{ type: 'ai' as const, id: 'ai-tab-1', data: aiTab },
			{ type: 'file' as const, id: fileTab.id, data: fileTab },
		];

		render(
			<TabBar
				tabs={[aiTab]}
				activeTabId="ai-tab-1" // AI tab active, file tab inactive
				theme={darkTheme}
				onTabSelect={mockOnTabSelect}
				onTabClose={mockOnTabClose}
				onNewTab={mockOnNewTab}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
			/>
		);

		// File tab name span should have truncation class
		const fileNameSpan = screen.getByText('very-long-filename-that-should-be-truncated');
		expect(fileNameSpan).toHaveClass('truncate');
		expect(fileNameSpan).toHaveClass('max-w-[120px]');
	});
});

describe('File tab extension badge colorblind mode', () => {
	const mockOnTabSelect = vi.fn();
	const mockOnTabClose = vi.fn();
	const mockOnNewTab = vi.fn();
	const mockOnFileTabSelect = vi.fn();
	const mockOnFileTabClose = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
	});

	// Light theme for testing contrast
	const lightTheme: Theme = {
		id: 'github-light',
		name: 'GitHub Light',
		mode: 'light',
		colors: {
			bgMain: '#ffffff',
			bgSidebar: '#f6f8fa',
			bgActivity: '#eff2f5',
			textMain: '#24292f',
			textDim: '#57606a',
			accent: '#0969da',
			border: '#d0d7de',
			error: '#cf222e',
			success: '#1a7f37',
			warning: '#9a6700',
		},
	};

	// Dark theme for comparison
	const darkTheme: Theme = {
		id: 'dracula',
		name: 'Dracula',
		mode: 'dark',
		colors: {
			bgMain: '#282a36',
			bgSidebar: '#21222c',
			bgActivity: '#343746',
			textMain: '#f8f8f2',
			textDim: '#6272a4',
			accent: '#bd93f9',
			border: '#44475a',
			error: '#ff5555',
			success: '#50fa7b',
			warning: '#ffb86c',
		},
	};

	const createTab = (overrides: Partial<AITab> = {}): AITab => ({
		id: 'test-tab',
		name: '',
		agentSessionId: 'abc12345-def6-7890',
		logs: [],
		...overrides,
	});

	const createFileTab = (extension: string): FilePreviewTab => ({
		id: `file-tab-${extension}`,
		path: `/test/example${extension}`,
		name: 'example',
		extension: extension,
		content: 'test content',
		scrollTop: 0,
		searchQuery: '',
		editMode: false,
		editContent: undefined,
		createdAt: Date.now(),
		lastModified: Date.now(),
	});

	it('renders colorblind-safe colors for TypeScript files in dark mode', () => {
		const aiTab = createTab({ id: 'ai-tab-1', name: 'AI Tab' });
		const fileTab = createFileTab('.ts');

		const unifiedTabs = [
			{ type: 'ai' as const, id: 'ai-tab-1', data: aiTab },
			{ type: 'file' as const, id: fileTab.id, data: fileTab },
		];

		render(
			<TabBar
				tabs={[aiTab]}
				activeTabId="ai-tab-1"
				theme={darkTheme}
				onTabSelect={mockOnTabSelect}
				onTabClose={mockOnTabClose}
				onNewTab={mockOnNewTab}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
				colorBlindMode={true}
			/>
		);

		const badge = screen.getByText('TS');
		expect(badge).toBeInTheDocument();
		// Strong Blue (#0077BB) from Wong's colorblind-safe palette
		expect(badge).toHaveStyle({ backgroundColor: 'rgba(0, 119, 187, 0.35)' });
	});

	it('renders colorblind-safe colors for TypeScript files in light mode', () => {
		const aiTab = createTab({ id: 'ai-tab-1', name: 'AI Tab' });
		const fileTab = createFileTab('.tsx');

		const unifiedTabs = [
			{ type: 'ai' as const, id: 'ai-tab-1', data: aiTab },
			{ type: 'file' as const, id: fileTab.id, data: fileTab },
		];

		render(
			<TabBar
				tabs={[aiTab]}
				activeTabId="ai-tab-1"
				theme={lightTheme}
				onTabSelect={mockOnTabSelect}
				onTabClose={mockOnTabClose}
				onNewTab={mockOnNewTab}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
				colorBlindMode={true}
			/>
		);

		const badge = screen.getByText('TSX');
		expect(badge).toBeInTheDocument();
		// Strong Blue (#0077BB) lighter for light theme
		expect(badge).toHaveStyle({ backgroundColor: 'rgba(0, 119, 187, 0.18)' });
	});

	it('renders colorblind-safe colors for Markdown files (teal)', () => {
		const aiTab = createTab({ id: 'ai-tab-1', name: 'AI Tab' });
		const fileTab = createFileTab('.md');

		const unifiedTabs = [
			{ type: 'ai' as const, id: 'ai-tab-1', data: aiTab },
			{ type: 'file' as const, id: fileTab.id, data: fileTab },
		];

		render(
			<TabBar
				tabs={[aiTab]}
				activeTabId="ai-tab-1"
				theme={darkTheme}
				onTabSelect={mockOnTabSelect}
				onTabClose={mockOnTabClose}
				onNewTab={mockOnNewTab}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
				colorBlindMode={true}
			/>
		);

		const badge = screen.getByText('MD');
		expect(badge).toBeInTheDocument();
		// Teal (#009988) from Wong's colorblind-safe palette
		expect(badge).toHaveStyle({ backgroundColor: 'rgba(0, 153, 136, 0.35)' });
	});

	it('renders colorblind-safe colors for JSON/Config files (orange)', () => {
		const aiTab = createTab({ id: 'ai-tab-1', name: 'AI Tab' });
		const fileTab = createFileTab('.json');

		const unifiedTabs = [
			{ type: 'ai' as const, id: 'ai-tab-1', data: aiTab },
			{ type: 'file' as const, id: fileTab.id, data: fileTab },
		];

		render(
			<TabBar
				tabs={[aiTab]}
				activeTabId="ai-tab-1"
				theme={darkTheme}
				onTabSelect={mockOnTabSelect}
				onTabClose={mockOnTabClose}
				onNewTab={mockOnNewTab}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
				colorBlindMode={true}
			/>
		);

		const badge = screen.getByText('JSON');
		expect(badge).toBeInTheDocument();
		// Orange (#EE7733) from Wong's colorblind-safe palette
		expect(badge).toHaveStyle({ backgroundColor: 'rgba(238, 119, 51, 0.35)' });
	});

	it('renders colorblind-safe colors for CSS files (purple)', () => {
		const aiTab = createTab({ id: 'ai-tab-1', name: 'AI Tab' });
		const fileTab = createFileTab('.css');

		const unifiedTabs = [
			{ type: 'ai' as const, id: 'ai-tab-1', data: aiTab },
			{ type: 'file' as const, id: fileTab.id, data: fileTab },
		];

		render(
			<TabBar
				tabs={[aiTab]}
				activeTabId="ai-tab-1"
				theme={darkTheme}
				onTabSelect={mockOnTabSelect}
				onTabClose={mockOnTabClose}
				onNewTab={mockOnNewTab}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
				colorBlindMode={true}
			/>
		);

		const badge = screen.getByText('CSS');
		expect(badge).toBeInTheDocument();
		// Purple (#AA4499) from Wong's colorblind-safe palette
		expect(badge).toHaveStyle({ backgroundColor: 'rgba(170, 68, 153, 0.35)' });
	});

	it('renders colorblind-safe colors for HTML files (vermillion)', () => {
		const aiTab = createTab({ id: 'ai-tab-1', name: 'AI Tab' });
		const fileTab = createFileTab('.html');

		const unifiedTabs = [
			{ type: 'ai' as const, id: 'ai-tab-1', data: aiTab },
			{ type: 'file' as const, id: fileTab.id, data: fileTab },
		];

		render(
			<TabBar
				tabs={[aiTab]}
				activeTabId="ai-tab-1"
				theme={darkTheme}
				onTabSelect={mockOnTabSelect}
				onTabClose={mockOnTabClose}
				onNewTab={mockOnNewTab}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
				colorBlindMode={true}
			/>
		);

		const badge = screen.getByText('HTML');
		expect(badge).toBeInTheDocument();
		// Vermillion (#CC3311) from Wong's colorblind-safe palette
		expect(badge).toHaveStyle({ backgroundColor: 'rgba(204, 51, 17, 0.35)' });
	});

	it('renders colorblind-safe colors for Python files (cyan)', () => {
		const aiTab = createTab({ id: 'ai-tab-1', name: 'AI Tab' });
		const fileTab = createFileTab('.py');

		const unifiedTabs = [
			{ type: 'ai' as const, id: 'ai-tab-1', data: aiTab },
			{ type: 'file' as const, id: fileTab.id, data: fileTab },
		];

		render(
			<TabBar
				tabs={[aiTab]}
				activeTabId="ai-tab-1"
				theme={darkTheme}
				onTabSelect={mockOnTabSelect}
				onTabClose={mockOnTabClose}
				onNewTab={mockOnNewTab}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
				colorBlindMode={true}
			/>
		);

		const badge = screen.getByText('PY');
		expect(badge).toBeInTheDocument();
		// Cyan (#33BBEE) from Wong's colorblind-safe palette
		expect(badge).toHaveStyle({ backgroundColor: 'rgba(51, 187, 238, 0.35)' });
	});

	it('renders colorblind-safe colors for Rust files (magenta)', () => {
		const aiTab = createTab({ id: 'ai-tab-1', name: 'AI Tab' });
		const fileTab = createFileTab('.rs');

		const unifiedTabs = [
			{ type: 'ai' as const, id: 'ai-tab-1', data: aiTab },
			{ type: 'file' as const, id: fileTab.id, data: fileTab },
		];

		render(
			<TabBar
				tabs={[aiTab]}
				activeTabId="ai-tab-1"
				theme={darkTheme}
				onTabSelect={mockOnTabSelect}
				onTabClose={mockOnTabClose}
				onNewTab={mockOnNewTab}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
				colorBlindMode={true}
			/>
		);

		const badge = screen.getByText('RS');
		expect(badge).toBeInTheDocument();
		// Magenta (#EE3377) from Wong's colorblind-safe palette
		expect(badge).toHaveStyle({ backgroundColor: 'rgba(238, 51, 119, 0.35)' });
	});

	it('renders colorblind-safe colors for Go files (blue-green)', () => {
		const aiTab = createTab({ id: 'ai-tab-1', name: 'AI Tab' });
		const fileTab = createFileTab('.go');

		const unifiedTabs = [
			{ type: 'ai' as const, id: 'ai-tab-1', data: aiTab },
			{ type: 'file' as const, id: fileTab.id, data: fileTab },
		];

		render(
			<TabBar
				tabs={[aiTab]}
				activeTabId="ai-tab-1"
				theme={darkTheme}
				onTabSelect={mockOnTabSelect}
				onTabClose={mockOnTabClose}
				onNewTab={mockOnNewTab}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
				colorBlindMode={true}
			/>
		);

		const badge = screen.getByText('GO');
		expect(badge).toBeInTheDocument();
		// Blue-Green (#44AA99) from Wong's colorblind-safe palette
		expect(badge).toHaveStyle({ backgroundColor: 'rgba(68, 170, 153, 0.35)' });
	});

	it('renders colorblind-safe colors for Shell scripts (gray)', () => {
		const aiTab = createTab({ id: 'ai-tab-1', name: 'AI Tab' });
		const fileTab = createFileTab('.sh');

		const unifiedTabs = [
			{ type: 'ai' as const, id: 'ai-tab-1', data: aiTab },
			{ type: 'file' as const, id: fileTab.id, data: fileTab },
		];

		render(
			<TabBar
				tabs={[aiTab]}
				activeTabId="ai-tab-1"
				theme={darkTheme}
				onTabSelect={mockOnTabSelect}
				onTabClose={mockOnTabClose}
				onNewTab={mockOnNewTab}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
				colorBlindMode={true}
			/>
		);

		const badge = screen.getByText('SH');
		expect(badge).toBeInTheDocument();
		// Gray for shell scripts (distinguishable by luminance)
		expect(badge).toHaveStyle({ backgroundColor: 'rgba(150, 150, 150, 0.35)' });
	});

	it('falls back to theme colors for unknown extensions in colorblind mode', () => {
		const aiTab = createTab({ id: 'ai-tab-1', name: 'AI Tab' });
		const fileTab = createFileTab('.xyz');

		const unifiedTabs = [
			{ type: 'ai' as const, id: 'ai-tab-1', data: aiTab },
			{ type: 'file' as const, id: fileTab.id, data: fileTab },
		];

		render(
			<TabBar
				tabs={[aiTab]}
				activeTabId="ai-tab-1"
				theme={darkTheme}
				onTabSelect={mockOnTabSelect}
				onTabClose={mockOnTabClose}
				onNewTab={mockOnNewTab}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
				colorBlindMode={true}
			/>
		);

		const badge = screen.getByText('XYZ');
		expect(badge).toBeInTheDocument();
		// Colorblind mode also uses accent-derived fallback for unknown extensions
		expect(badge).toHaveStyle({ backgroundColor: 'rgba(189, 147, 249, 0.3)' });
	});
});

describe('Performance: Many file tabs (10+)', () => {
	const mockOnTabSelect = vi.fn();
	const mockOnTabClose = vi.fn();
	const mockOnNewTab = vi.fn();
	const mockOnFileTabSelect = vi.fn();
	const mockOnFileTabClose = vi.fn();
	const mockOnUnifiedTabReorder = vi.fn();

	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		Element.prototype.scrollTo = vi.fn();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// Helper to create many file tabs
	const createManyFileTabs = (count: number): FilePreviewTab[] =>
		Array.from({ length: count }, (_, i) => ({
			id: `file-tab-${i}`,
			path: `/path/to/files/file-${i}.ts`,
			name: `file-${i}`,
			extension: '.ts',
			content: `// Content for file ${i}\nconst x${i} = ${i};`,
			scrollTop: 0,
			searchQuery: '',
			editMode: false,
			editContent: undefined,
			createdAt: Date.now() + i,
			lastModified: Date.now() + i,
		}));

	// Helper to create unified tabs from file tabs
	const createUnifiedTabsFromFiles = (
		fileTabs: FilePreviewTab[],
		aiTab: AITab
	): Array<{ type: 'ai' | 'file'; id: string; data: AITab | FilePreviewTab }> => [
		{ type: 'ai' as const, id: aiTab.id, data: aiTab },
		...fileTabs.map((ft) => ({ type: 'file' as const, id: ft.id, data: ft })),
	];

	it('renders 15 file tabs without performance issues', () => {
		const aiTab = createTab({ id: 'ai-tab-1', name: 'AI Tab', agentSessionId: 'sess-1' });
		const fileTabs = createManyFileTabs(15);
		const unifiedTabs = createUnifiedTabsFromFiles(fileTabs, aiTab);

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
				onUnifiedTabReorder={mockOnUnifiedTabReorder}
			/>
		);

		// All 15 file tabs should be rendered
		expect(screen.getByText('file-0')).toBeInTheDocument();
		expect(screen.getByText('file-7')).toBeInTheDocument();
		expect(screen.getByText('file-14')).toBeInTheDocument();

		// All extension badges should be present (uppercase, no leading dot)
		const tsBadges = screen.getAllByText('TS');
		expect(tsBadges.length).toBe(15);
	});

	it('renders 30 file tabs with mixed AI tabs', () => {
		const aiTab1 = createTab({ id: 'ai-tab-1', name: 'AI Tab 1', agentSessionId: 'sess-1' });
		const aiTab2 = createTab({ id: 'ai-tab-2', name: 'AI Tab 2', agentSessionId: 'sess-2' });
		const fileTabs = createManyFileTabs(30);

		// Interleave AI tabs with file tabs
		const unifiedTabs = [
			{ type: 'ai' as const, id: aiTab1.id, data: aiTab1 },
			...fileTabs.slice(0, 15).map((ft) => ({ type: 'file' as const, id: ft.id, data: ft })),
			{ type: 'ai' as const, id: aiTab2.id, data: aiTab2 },
			...fileTabs.slice(15).map((ft) => ({ type: 'file' as const, id: ft.id, data: ft })),
		];

		render(
			<TabBar
				tabs={[aiTab1, aiTab2]}
				activeTabId="ai-tab-1"
				theme={mockTheme}
				onTabSelect={mockOnTabSelect}
				onTabClose={mockOnTabClose}
				onNewTab={mockOnNewTab}
				unifiedTabs={unifiedTabs}
				activeFileTabId={null}
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
				onUnifiedTabReorder={mockOnUnifiedTabReorder}
			/>
		);

		// AI tabs should be present
		expect(screen.getByText('AI Tab 1')).toBeInTheDocument();
		expect(screen.getByText('AI Tab 2')).toBeInTheDocument();

		// File tabs from both groups should be present
		expect(screen.getByText('file-0')).toBeInTheDocument();
		expect(screen.getByText('file-14')).toBeInTheDocument();
		expect(screen.getByText('file-15')).toBeInTheDocument();
		expect(screen.getByText('file-29')).toBeInTheDocument();
	});

	it('selects file tab correctly among many tabs', () => {
		const aiTab = createTab({ id: 'ai-tab-1', name: 'AI Tab', agentSessionId: 'sess-1' });
		const fileTabs = createManyFileTabs(20);
		const unifiedTabs = createUnifiedTabsFromFiles(fileTabs, aiTab);

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
				onUnifiedTabReorder={mockOnUnifiedTabReorder}
			/>
		);

		// Click on file-10
		const fileTab10 = screen.getByText('file-10').closest('[data-tab-id]')!;
		fireEvent.click(fileTab10);

		expect(mockOnFileTabSelect).toHaveBeenCalledWith('file-tab-10');
	});

	it('closes file tab correctly among many tabs', () => {
		const aiTab = createTab({ id: 'ai-tab-1', name: 'AI Tab', agentSessionId: 'sess-1' });
		const fileTabs = createManyFileTabs(20);
		const unifiedTabs = createUnifiedTabsFromFiles(fileTabs, aiTab);

		render(
			<TabBar
				tabs={[aiTab]}
				activeTabId="ai-tab-1"
				theme={mockTheme}
				onTabSelect={mockOnTabSelect}
				onTabClose={mockOnTabClose}
				onNewTab={mockOnNewTab}
				unifiedTabs={unifiedTabs}
				activeFileTabId="file-tab-5" // Make file-5 active to show close button
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
				onUnifiedTabReorder={mockOnUnifiedTabReorder}
			/>
		);

		// The close button should be visible on the active file tab
		const fileTab5 = screen.getByText('file-5').closest('[data-tab-id]')!;
		const closeButton = fileTab5.querySelector('button[title="Close tab"]');
		expect(closeButton).toBeInTheDocument();

		fireEvent.click(closeButton!);
		expect(mockOnFileTabClose).toHaveBeenCalledWith('file-tab-5');
	});

	it('supports drag and drop reorder with many file tabs', () => {
		const aiTab = createTab({ id: 'ai-tab-1', name: 'AI Tab', agentSessionId: 'sess-1' });
		const fileTabs = createManyFileTabs(15);
		const unifiedTabs = createUnifiedTabsFromFiles(fileTabs, aiTab);

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
				onUnifiedTabReorder={mockOnUnifiedTabReorder}
			/>
		);

		const fileTab2 = screen.getByText('file-2').closest('[data-tab-id]')!;
		const fileTab10 = screen.getByText('file-10').closest('[data-tab-id]')!;

		// Start dragging file-tab-2 (index 3 in unified tabs: AI tab is at 0)
		fireEvent.dragStart(fileTab2, {
			dataTransfer: {
				effectAllowed: '',
				setData: vi.fn(),
				getData: vi.fn().mockReturnValue('file-tab-2'),
			},
		});

		// Drop on file-tab-10 (index 11 in unified tabs)
		fireEvent.drop(fileTab10, {
			dataTransfer: {
				getData: vi.fn().mockReturnValue('file-tab-2'),
			},
		});

		// Should call onUnifiedTabReorder with correct indices
		expect(mockOnUnifiedTabReorder).toHaveBeenCalledWith(3, 11);
	});

	it('renders file tabs with different extensions correctly', () => {
		const aiTab = createTab({ id: 'ai-tab-1', name: 'AI Tab', agentSessionId: 'sess-1' });
		const extensions = [
			'.ts',
			'.tsx',
			'.js',
			'.json',
			'.md',
			'.css',
			'.html',
			'.py',
			'.rs',
			'.go',
			'.sh',
		];
		const fileTabs: FilePreviewTab[] = extensions.map((ext, i) => ({
			id: `file-tab-${i}`,
			path: `/path/to/files/file-${i}${ext}`,
			name: `file-${i}`,
			extension: ext,
			content: `// Content`,
			scrollTop: 0,
			searchQuery: '',
			editMode: false,
			editContent: undefined,
			createdAt: Date.now() + i,
			lastModified: Date.now() + i,
		}));

		const unifiedTabs = createUnifiedTabsFromFiles(fileTabs, aiTab);

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
				onUnifiedTabReorder={mockOnUnifiedTabReorder}
			/>
		);

		// All extension badges should be rendered (uppercase, no leading dot)
		extensions.forEach((ext) => {
			// Strip leading dot and convert to uppercase (e.g., '.ts' -> 'TS')
			const badgeText = ext.replace(/^\./, '').toUpperCase();
			expect(screen.getByText(badgeText)).toBeInTheDocument();
		});
	});

	it('maintains active tab styling among many tabs', () => {
		const aiTab = createTab({ id: 'ai-tab-1', name: 'AI Tab', agentSessionId: 'sess-1' });
		const fileTabs = createManyFileTabs(20);
		const unifiedTabs = createUnifiedTabsFromFiles(fileTabs, aiTab);

		render(
			<TabBar
				tabs={[aiTab]}
				activeTabId="ai-tab-1"
				theme={mockTheme}
				onTabSelect={mockOnTabSelect}
				onTabClose={mockOnTabClose}
				onNewTab={mockOnNewTab}
				unifiedTabs={unifiedTabs}
				activeFileTabId="file-tab-10" // file-10 is active
				onFileTabSelect={mockOnFileTabSelect}
				onFileTabClose={mockOnFileTabClose}
				onUnifiedTabReorder={mockOnUnifiedTabReorder}
			/>
		);

		// Active file tab should have main background color (non-transparent)
		const activeFileTab = screen.getByText('file-10').closest('[data-tab-id]')!;
		expect(activeFileTab).toHaveStyle({ backgroundColor: mockTheme.colors.bgMain });

		// Active file tab should also have the bottom margin adjustment (active styling)
		expect(activeFileTab).toHaveStyle({ marginBottom: '-1px' });

		// Inactive file tab should NOT have the active margin adjustment
		const inactiveFileTab = screen.getByText('file-5').closest('[data-tab-id]')!;
		expect(inactiveFileTab).toHaveStyle({ marginBottom: '0' });
	});
});
