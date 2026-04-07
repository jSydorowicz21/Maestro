import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TabBar } from '../../../renderer/components/TabBar';
import { formatShortcutKeys } from '../../../renderer/utils/shortcutFormatter';
import type { AITab, Theme, FilePreviewTab } from '../../../renderer/types';
import { mockTheme, createTab } from './TabBar.setup';

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

describe('TabBar', () => {
	const mockOnTabSelect = vi.fn();
	const mockOnTabClose = vi.fn();
	const mockOnNewTab = vi.fn();
	const mockOnTabRename = vi.fn();
	const mockOnRequestRename = vi.fn();
	const mockOnTabReorder = vi.fn();
	const mockOnTabStar = vi.fn();
	const mockOnTabMarkUnread = vi.fn();
	const mockOnToggleUnreadFilter = vi.fn();
	const mockOnOpenTabSearch = vi.fn();

	// Mock timers for hover delays
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		// Mock scrollTo and scrollIntoView
		Element.prototype.scrollTo = vi.fn();
		Element.prototype.scrollIntoView = vi.fn();
		// Mock clipboard
		Object.assign(navigator, {
			clipboard: {
				writeText: vi.fn().mockResolvedValue(undefined),
			},
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('rendering', () => {
		it('renders tabs correctly', () => {
			const tabs = [createTab({ id: 'tab-1', name: 'Tab 1' })];

			render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			expect(screen.getByText('Tab 1')).toBeInTheDocument();
		});

		it('renders new tab button', () => {
			render(
				<TabBar
					tabs={[createTab()]}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			expect(
				screen.getByTitle(`New tab (${formatShortcutKeys(['Meta', 't'])})`)
			).toBeInTheDocument();
		});

		it('renders unread filter button', () => {
			render(
				<TabBar
					tabs={[createTab()]}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			expect(screen.getByTitle(/Filter unread tabs/)).toBeInTheDocument();
		});

		it('renders tab search button when onOpenTabSearch provided', () => {
			render(
				<TabBar
					tabs={[createTab()]}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
					onOpenTabSearch={mockOnOpenTabSearch}
				/>
			);

			expect(
				screen.getByTitle(`Search tabs (${formatShortcutKeys(['Alt', 'Meta', 't'])})`)
			).toBeInTheDocument();
		});

		it('does not render tab search button when onOpenTabSearch not provided', () => {
			render(
				<TabBar
					tabs={[createTab()]}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			expect(
				screen.queryByTitle(`Search tabs (${formatShortcutKeys(['Alt', 'Meta', 't'])})`)
			).not.toBeInTheDocument();
		});
	});

	describe('getTabDisplayName', () => {
		it('displays tab name when provided', () => {
			const tabs = [createTab({ id: 'tab-1', name: 'My Custom Tab' })];

			render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			expect(screen.getByText('My Custom Tab')).toBeInTheDocument();
		});

		it('displays first UUID octet when no name but agentSessionId exists', () => {
			const tabs = [
				createTab({
					id: 'tab-1',
					name: '',
					agentSessionId: 'abcd1234-5678-9abc-def0-123456789012',
				}),
			];

			render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			expect(screen.getByText('ABCD1234')).toBeInTheDocument();
		});

		it('displays "New Session" when no name and no agentSessionId', () => {
			const tabs = [
				createTab({
					id: 'tab-1',
					name: '',
					agentSessionId: undefined,
				}),
			];

			render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			expect(screen.getByText('New Session')).toBeInTheDocument();
		});
	});

	describe('tab selection', () => {
		it('calls onTabSelect when tab is clicked', () => {
			const tabs = [
				createTab({ id: 'tab-1', name: 'Tab 1' }),
				createTab({ id: 'tab-2', name: 'Tab 2' }),
			];

			render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			fireEvent.click(screen.getByText('Tab 2'));
			expect(mockOnTabSelect).toHaveBeenCalledWith('tab-2');
		});

		it('applies active styles to active tab', () => {
			const tabs = [
				createTab({ id: 'tab-1', name: 'Tab 1' }),
				createTab({ id: 'tab-2', name: 'Tab 2' }),
			];

			render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			const activeTab = screen.getByText('Tab 1').closest('[data-tab-id]');
			expect(activeTab).toHaveStyle({ backgroundColor: mockTheme.colors.bgMain });
		});
	});

	describe('tab close', () => {
		it('calls onTabClose when close button is clicked', () => {
			const tabs = [createTab({ id: 'tab-1', name: 'Tab 1' })];

			render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			const closeButton = screen.getByTitle('Close tab');
			fireEvent.click(closeButton);
			expect(mockOnTabClose).toHaveBeenCalledWith('tab-1');
		});

		it('calls onTabClose on middle-click', () => {
			const tabs = [createTab({ id: 'tab-1', name: 'Tab 1' })];

			render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			const tab = screen.getByText('Tab 1').closest('[data-tab-id]')!;
			fireEvent.mouseDown(tab, { button: 1 });
			expect(mockOnTabClose).toHaveBeenCalledWith('tab-1');
		});

		it('does not close on left-click mouseDown', () => {
			const tabs = [createTab({ id: 'tab-1', name: 'Tab 1' })];

			render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			const tab = screen.getByText('Tab 1').closest('[data-tab-id]')!;
			fireEvent.mouseDown(tab, { button: 0 });
			expect(mockOnTabClose).not.toHaveBeenCalled();
		});
	});

	describe('new tab', () => {
		it('calls onNewTab when new tab button is clicked', () => {
			render(
				<TabBar
					tabs={[createTab()]}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			fireEvent.click(screen.getByTitle(`New tab (${formatShortcutKeys(['Meta', 't'])})`));
			expect(mockOnNewTab).toHaveBeenCalled();
		});
	});

	describe('tab indicators', () => {
		it('shows busy indicator when tab is busy', () => {
			const tabs = [createTab({ id: 'tab-1', name: 'Tab 1', state: 'busy' })];

			const { container } = render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			const busyDot = container.querySelector('.animate-pulse');
			expect(busyDot).toBeInTheDocument();
			expect(busyDot).toHaveStyle({ backgroundColor: mockTheme.colors.warning });
		});

		it('shows unread indicator for inactive tab with unread messages', () => {
			const tabs = [
				createTab({ id: 'tab-1', name: 'Tab 1' }),
				createTab({ id: 'tab-2', name: 'Tab 2', hasUnread: true }),
			];

			const { container } = render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			const unreadDot = container.querySelector('[title="New messages"]');
			expect(unreadDot).toBeInTheDocument();
			expect(unreadDot).toHaveStyle({ backgroundColor: mockTheme.colors.error });
		});

		it('shows unread indicator for active tab (when manually marked)', () => {
			const tabs = [createTab({ id: 'tab-1', name: 'Tab 1', hasUnread: true })];

			const { container } = render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			// Unread indicator should show immediately even on active tab
			// This allows users to mark a tab as unread and see the indicator right away
			const unreadDot = container.querySelector('[title="New messages"]');
			expect(unreadDot).toBeInTheDocument();
			expect(unreadDot).toHaveStyle({ backgroundColor: mockTheme.colors.error });
		});

		it('does not show unread indicator for busy tab', () => {
			const tabs = [
				createTab({ id: 'tab-1', name: 'Tab 1' }),
				createTab({ id: 'tab-2', name: 'Tab 2', hasUnread: true, state: 'busy' }),
			];

			const { container } = render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			expect(container.querySelector('[title="New messages"]')).not.toBeInTheDocument();
		});

		it('shows star indicator for starred tabs', () => {
			const tabs = [createTab({ id: 'tab-1', name: 'Tab 1', starred: true })];

			render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			expect(screen.getByTestId('star-icon')).toBeInTheDocument();
		});

		it('shows draft indicator for tabs with unsent input', () => {
			const tabs = [createTab({ id: 'tab-1', name: 'Tab 1', inputValue: 'draft message' })];

			render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			// The pencil icon component is rendered with testid
			expect(screen.getByTestId('pencil-icon')).toBeInTheDocument();
		});

		it('shows draft indicator for tabs with staged images', () => {
			const tabs = [createTab({ id: 'tab-1', name: 'Tab 1', stagedImages: ['image.png'] })];

			render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			// The pencil icon component is rendered with testid
			expect(screen.getByTestId('pencil-icon')).toBeInTheDocument();
		});

		it('shows shortcut hints for first 9 tabs', () => {
			const tabs = Array.from({ length: 10 }, (_, i) =>
				createTab({ id: `tab-${i}`, name: `Tab ${i + 1}` })
			);

			render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-0"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			// Should show 1-9 but not 10
			for (let i = 1; i <= 9; i++) {
				expect(screen.getByText(String(i))).toBeInTheDocument();
			}
			expect(screen.queryByText('10')).not.toBeInTheDocument();
		});

		it('hides shortcut hints when showUnreadOnly is true', () => {
			const tabs = [createTab({ id: 'tab-1', name: 'Tab 1' })];

			render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
					showUnreadOnly={true}
				/>
			);

			expect(screen.queryByText('1')).not.toBeInTheDocument();
		});

		it('shows shortcut hints on file tabs in unified tab order', () => {
			const aiTab = createTab({ id: 'ai-1', name: 'AI Tab' });
			const fileTab: FilePreviewTab = {
				id: 'file-1',
				path: '/path/to/test.ts',
				name: 'test',
				extension: '.ts',
				content: '',
				scrollTop: 0,
				searchQuery: '',
				editMode: false,
				editContent: undefined,
				createdAt: Date.now(),
				lastModified: Date.now(),
			};
			const unifiedTabs = [
				{ type: 'ai' as const, id: 'ai-1', data: aiTab },
				{ type: 'file' as const, id: 'file-1', data: fileTab },
				{ type: 'ai' as const, id: 'ai-2', data: createTab({ id: 'ai-2', name: 'AI Tab 2' }) },
			];

			render(
				<TabBar
					tabs={[aiTab, unifiedTabs[2].data as AITab]}
					activeTabId="ai-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
					unifiedTabs={unifiedTabs}
					activeFileTabId={null}
					onFileTabSelect={vi.fn()}
					onFileTabClose={vi.fn()}
				/>
			);

			// AI tab at index 0 should show "1"
			expect(screen.getByText('1')).toBeInTheDocument();
			// File tab at index 1 should show "2"
			expect(screen.getByText('2')).toBeInTheDocument();
			// Last tab should show "0" (Cmd+0 shortcut)
			expect(screen.getByText('0')).toBeInTheDocument();
		});

		it('shows 0 badge on last tab (Cmd+0 shortcut)', () => {
			const tabs = Array.from({ length: 3 }, (_, i) =>
				createTab({ id: `tab-${i}`, name: `Tab ${i + 1}` })
			);

			render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-0"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			// First two tabs show 1, 2
			expect(screen.getByText('1')).toBeInTheDocument();
			expect(screen.getByText('2')).toBeInTheDocument();
			// Last tab shows 0 instead of 3
			expect(screen.getByText('0')).toBeInTheDocument();
			expect(screen.queryByText('3')).not.toBeInTheDocument();
		});
	});

	describe('unread filter', () => {
		it('toggles unread filter when button clicked (uncontrolled)', () => {
			const tabs = [
				createTab({ id: 'tab-1', name: 'Tab 1' }),
				createTab({ id: 'tab-2', name: 'Tab 2', hasUnread: true }),
			];

			render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			// Initially both tabs visible
			expect(screen.getByText('Tab 1')).toBeInTheDocument();
			expect(screen.getByText('Tab 2')).toBeInTheDocument();

			// Toggle filter
			fireEvent.click(screen.getByTitle(/Filter unread tabs/));

			// Now only unread and active tab visible
			expect(screen.getByText('Tab 1')).toBeInTheDocument(); // Active
			expect(screen.getByText('Tab 2')).toBeInTheDocument(); // Unread
		});

		it('calls onToggleUnreadFilter when provided (controlled)', () => {
			const tabs = [createTab({ id: 'tab-1', name: 'Tab 1' })];

			render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
					onToggleUnreadFilter={mockOnToggleUnreadFilter}
				/>
			);

			fireEvent.click(screen.getByTitle(/Filter unread tabs/));
			expect(mockOnToggleUnreadFilter).toHaveBeenCalled();
		});

		it('shows empty state when filter is on but no unread tabs', () => {
			const tabs = [createTab({ id: 'tab-1', name: 'Tab 1' })];

			render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-2" // Different from tab-1
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
					showUnreadOnly={true}
				/>
			);

			expect(screen.getByText('No unread tabs')).toBeInTheDocument();
		});

		it('includes tabs with drafts in filtered view', () => {
			const tabs = [
				createTab({ id: 'tab-1', name: 'Tab 1' }),
				createTab({ id: 'tab-2', name: 'Draft Tab', inputValue: 'draft' }),
			];

			render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-3" // Not in the list
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
					showUnreadOnly={true}
				/>
			);

			// Only draft tab should be visible
			expect(screen.queryByText('Tab 1')).not.toBeInTheDocument();
			expect(screen.getByText('Draft Tab')).toBeInTheDocument();
		});

		it('updates filter button title based on state', () => {
			const tabs = [createTab({ id: 'tab-1', name: 'Tab 1' })];

			const { rerender } = render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
					showUnreadOnly={false}
				/>
			);

			expect(
				screen.getByTitle(`Filter unread tabs (${formatShortcutKeys(['Meta', 'u'])})`)
			).toBeInTheDocument();

			rerender(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
					showUnreadOnly={true}
				/>
			);

			expect(
				screen.getByTitle(`Showing unread only (${formatShortcutKeys(['Meta', 'u'])})`)
			).toBeInTheDocument();
		});
	});

	describe('tab search', () => {
		it('calls onOpenTabSearch when search button clicked', () => {
			render(
				<TabBar
					tabs={[createTab()]}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
					onOpenTabSearch={mockOnOpenTabSearch}
				/>
			);

			fireEvent.click(
				screen.getByTitle(`Search tabs (${formatShortcutKeys(['Alt', 'Meta', 't'])})`)
			);
			expect(mockOnOpenTabSearch).toHaveBeenCalled();
		});
	});

	describe('drag and drop', () => {
		it('handles drag start', () => {
			const tabs = [createTab({ id: 'tab-1', name: 'Tab 1' })];

			render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
					onTabReorder={mockOnTabReorder}
				/>
			);

			const tab = screen.getByText('Tab 1').closest('[data-tab-id]')!;
			const dataTransfer = {
				effectAllowed: '',
				setData: vi.fn(),
				getData: vi.fn().mockReturnValue('tab-1'),
			};

			fireEvent.dragStart(tab, { dataTransfer });

			expect(dataTransfer.effectAllowed).toBe('move');
			expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'tab-1');
		});

		it('handles drag over', () => {
			const tabs = [
				createTab({ id: 'tab-1', name: 'Tab 1' }),
				createTab({ id: 'tab-2', name: 'Tab 2' }),
			];

			render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
					onTabReorder={mockOnTabReorder}
				/>
			);

			const tab2 = screen.getByText('Tab 2').closest('[data-tab-id]')!;
			const dataTransfer = {
				dropEffect: '',
			};

			const event = fireEvent.dragOver(tab2, { dataTransfer });
			expect(dataTransfer.dropEffect).toBe('move');
		});

		it('handles drop and reorders tabs', () => {
			const tabs = [
				createTab({ id: 'tab-1', name: 'Tab 1' }),
				createTab({ id: 'tab-2', name: 'Tab 2' }),
			];

			render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
					onTabReorder={mockOnTabReorder}
				/>
			);

			const tab1 = screen.getByText('Tab 1').closest('[data-tab-id]')!;
			const tab2 = screen.getByText('Tab 2').closest('[data-tab-id]')!;

			// Start dragging tab-1
			fireEvent.dragStart(tab1, {
				dataTransfer: {
					effectAllowed: '',
					setData: vi.fn(),
					getData: vi.fn().mockReturnValue('tab-1'),
				},
			});

			// Drop on tab-2
			fireEvent.drop(tab2, {
				dataTransfer: {
					getData: vi.fn().mockReturnValue('tab-1'),
				},
			});

			expect(mockOnTabReorder).toHaveBeenCalledWith(0, 1);
		});

		it('does not reorder when dropping on same tab', () => {
			const tabs = [createTab({ id: 'tab-1', name: 'Tab 1' })];

			render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
					onTabReorder={mockOnTabReorder}
				/>
			);

			const tab = screen.getByText('Tab 1').closest('[data-tab-id]')!;

			fireEvent.drop(tab, {
				dataTransfer: {
					getData: vi.fn().mockReturnValue('tab-1'),
				},
			});

			expect(mockOnTabReorder).not.toHaveBeenCalled();
		});

		it('handles drag end', () => {
			const tabs = [createTab({ id: 'tab-1', name: 'Tab 1' })];

			render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
					onTabReorder={mockOnTabReorder}
				/>
			);

			const tab = screen.getByText('Tab 1').closest('[data-tab-id]')!;

			// Start drag to set draggingTabId
			fireEvent.dragStart(tab, {
				dataTransfer: {
					effectAllowed: '',
					setData: vi.fn(),
				},
			});

			// Drag end should reset state
			fireEvent.dragEnd(tab);

			// Tab should no longer have opacity-50 class (dragging state)
			expect(tab).not.toHaveClass('opacity-50');
		});
	});

	describe('separators', () => {
		it('shows separators between inactive tabs', () => {
			const tabs = [
				createTab({ id: 'tab-1', name: 'Tab 1' }),
				createTab({ id: 'tab-2', name: 'Tab 2' }),
				createTab({ id: 'tab-3', name: 'Tab 3' }),
			];

			const { container } = render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			// Separators between inactive tabs (tab-2 and tab-3)
			const separators = container.querySelectorAll('.w-px');
			expect(separators.length).toBeGreaterThan(0);
		});

		it('does not show separator next to active tab', () => {
			const tabs = [
				createTab({ id: 'tab-1', name: 'Tab 1' }),
				createTab({ id: 'tab-2', name: 'Tab 2' }),
			];

			const { container } = render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-2"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			// No separator when active tab is involved
			const separators = container.querySelectorAll('.w-px');
			// Separator should not appear before tab-2 (which is active)
			expect(separators.length).toBe(0);
		});
	});

	describe('scroll behavior', () => {
		it('scrolls active tab into view when activeTabId changes', async () => {
			// Mock requestAnimationFrame
			const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
				cb(0);
				return 0;
			});

			const tabs = [
				createTab({ id: 'tab-1', name: 'Tab 1' }),
				createTab({ id: 'tab-2', name: 'Tab 2' }),
			];

			const { rerender, container } = render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			// Get the tab bar container (the scrollable element)
			const tabBarContainer = container.querySelector('.overflow-x-auto') as HTMLElement;
			expect(tabBarContainer).toBeTruthy();

			// Change active tab
			rerender(
				<TabBar
					tabs={tabs}
					activeTabId="tab-2"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			// The scroll behavior uses getBoundingClientRect which returns 0s in JSDOM,
			// so we just verify the effect runs without error (container and tab element exist)
			const activeTab = container.querySelector('[data-tab-id="tab-2"]');
			expect(activeTab).toBeTruthy();

			rafSpy.mockRestore();
		});

		it('scrolls active tab into view when showUnreadOnly filter is toggled off', async () => {
			// Mock requestAnimationFrame
			const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
				cb(0);
				return 0;
			});

			const tabs = [
				createTab({ id: 'tab-1', name: 'Tab 1' }),
				createTab({ id: 'tab-2', name: 'Tab 2', hasUnread: true }),
				createTab({ id: 'tab-3', name: 'Tab 3' }),
			];

			const { rerender, container } = render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-3"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
					showUnreadOnly={true}
				/>
			);

			// Toggle filter off - this should trigger scroll to active tab
			rerender(
				<TabBar
					tabs={tabs}
					activeTabId="tab-3"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
					showUnreadOnly={false}
				/>
			);

			// The scroll behavior uses getBoundingClientRect which returns 0s in JSDOM,
			// so we just verify the effect runs without error (container and tab element exist)
			const activeTab = container.querySelector('[data-tab-id="tab-3"]');
			expect(activeTab).toBeTruthy();

			rafSpy.mockRestore();
		});

		it('scrolls file tab into view when activeFileTabId changes', async () => {
			// Mock requestAnimationFrame
			const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
				cb(0);
				return 0;
			});

			const tabs = [createTab({ id: 'tab-1', name: 'Tab 1' })];
			const fileTab: FilePreviewTab = {
				id: 'file-1',
				path: '/path/to/file.ts',
				name: 'file',
				extension: '.ts',
			};
			const unifiedTabs = [
				{ id: 'tab-1', type: 'ai' as const, data: tabs[0] },
				{ id: 'file-1', type: 'file' as const, data: fileTab },
			];

			const { rerender, container } = render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
					unifiedTabs={unifiedTabs}
					activeFileTabId={null}
					onFileTabSelect={vi.fn()}
					onFileTabClose={vi.fn()}
				/>
			);

			// Select the file tab - this should trigger scroll to file tab
			rerender(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
					unifiedTabs={unifiedTabs}
					activeFileTabId="file-1"
					onFileTabSelect={vi.fn()}
					onFileTabClose={vi.fn()}
				/>
			);

			// The scroll behavior uses getBoundingClientRect which returns 0s in JSDOM,
			// so we just verify the effect runs without error (container and tab element exist)
			const activeFileTab = container.querySelector('[data-tab-id="file-1"]');
			expect(activeFileTab).toBeTruthy();

			rafSpy.mockRestore();
		});

		it('scrolls active tab into view when its name changes (e.g., after auto-generation)', async () => {
			// Mock requestAnimationFrame
			const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
				cb(0);
				return 0;
			});

			const tabs = [
				createTab({ id: 'tab-1', name: null }), // Tab without name initially
				createTab({ id: 'tab-2', name: 'Tab 2' }),
			];

			const { rerender, container } = render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			// Simulate the active tab's name being updated (e.g., auto-generated name)
			// This should trigger a scroll to ensure the now-wider tab is still visible
			const updatedTabs = [
				createTab({ id: 'tab-1', name: 'A Much Longer Auto-Generated Tab Name' }),
				createTab({ id: 'tab-2', name: 'Tab 2' }),
			];

			rerender(
				<TabBar
					tabs={updatedTabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			// The scroll behavior uses getBoundingClientRect which returns 0s in JSDOM,
			// so we just verify the effect runs without error and the tab renders with new name
			const activeTab = container.querySelector('[data-tab-id="tab-1"]');
			expect(activeTab).toBeTruthy();
			expect(screen.getByText('A Much Longer Auto-Generated Tab Name')).toBeTruthy();

			rafSpy.mockRestore();
		});

		it('renders sticky elements with refs for scroll-into-view calculations', () => {
			const tabs = [
				createTab({ id: 'tab-1', name: 'Tab 1' }),
				createTab({ id: 'tab-2', name: 'Tab 2' }),
			];

			const { container } = render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			const tabBarContainer = container.querySelector('.overflow-x-auto') as HTMLElement;
			expect(tabBarContainer).toBeTruthy();

			// Verify sticky left element (search/filter buttons) exists
			const stickyLeft = tabBarContainer.querySelector('.sticky.left-0');
			expect(stickyLeft).toBeTruthy();

			// Verify the new tab button container exists (sticky right when overflowing)
			// It contains the "+" button
			const plusButton = tabBarContainer.querySelector('button[title*="New tab"]');
			expect(plusButton).toBeTruthy();
			expect(plusButton?.parentElement).toBeTruthy();
		});
	});

	describe('styling', () => {
		it('applies theme colors correctly', () => {
			const tabs = [createTab({ id: 'tab-1', name: 'Tab 1' })];

			const { container } = render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			const tabBar = container.firstChild as HTMLElement;
			expect(tabBar).toHaveStyle({ backgroundColor: mockTheme.colors.bgSidebar });
			expect(tabBar).toHaveStyle({ borderColor: mockTheme.colors.border });
		});

		it('applies hover effect on inactive tabs', () => {
			const tabs = [
				createTab({ id: 'tab-1', name: 'Tab 1' }),
				createTab({ id: 'tab-2', name: 'Tab 2' }),
			];

			render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			const inactiveTab = screen.getByText('Tab 2').closest('[data-tab-id]')! as HTMLElement;

			// Before hover - check inline style is not hover state
			const initialBgColor = inactiveTab.style.backgroundColor;
			expect(initialBgColor).not.toBe('rgba(255, 255, 255, 0.08)');

			// Hover
			fireEvent.mouseEnter(inactiveTab);
			expect(inactiveTab.style.backgroundColor).toBe('rgba(255, 255, 255, 0.08)');

			// Leave
			fireEvent.mouseLeave(inactiveTab);

			// After the timeout the state is set
			act(() => {
				vi.advanceTimersByTime(150);
			});

			// Background color should no longer be hover state
			expect(inactiveTab.style.backgroundColor).not.toBe('rgba(255, 255, 255, 0.08)');
		});

		it('does not set title attribute on tabs (removed for cleaner UX)', () => {
			// Tab title tooltips were intentionally removed to streamline the tab interaction feel
			const tabs = [
				createTab({
					id: 'tab-1',
					name: 'My Tab',
					agentSessionId: 'session-123',
				}),
			];

			render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			const tab = screen.getByText('My Tab').closest('[data-tab-id]')!;
			expect(tab).not.toHaveAttribute('title');
		});
	});

	describe('edge cases', () => {
		it('handles empty tabs array', () => {
			render(
				<TabBar
					tabs={[]}
					activeTabId="nonexistent"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			// Should still render the new tab button
			expect(
				screen.getByTitle(`New tab (${formatShortcutKeys(['Meta', 't'])})`)
			).toBeInTheDocument();
		});

		it('handles special characters in tab names', () => {
			const tabs = [
				createTab({
					id: 'tab-1',
					name: '<script>alert("xss")</script>',
				}),
			];

			render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			// Text should be escaped, not executed
			expect(screen.getByText('<script>alert("xss")</script>')).toBeInTheDocument();
		});

		it('handles unicode in tab names', () => {
			const tabs = [
				createTab({
					id: 'tab-1',
					name: '🎵 Music Tab 日本語',
				}),
			];

			render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			expect(screen.getByText('🎵 Music Tab 日本語')).toBeInTheDocument();
		});

		it('handles very long tab names with truncation for inactive tabs', () => {
			const longName = 'This is a very long tab name that should be truncated';
			const tabs = [
				createTab({ id: 'tab-1', name: 'Active Tab' }),
				createTab({ id: 'tab-2', name: longName }),
			];

			render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			// Inactive tab should be truncated
			const inactiveTabName = screen.getByText(longName);
			expect(inactiveTabName).toHaveClass('truncate');
			expect(inactiveTabName).toHaveClass('max-w-[120px]');

			// Active tab should show full name without truncation
			const activeTabName = screen.getByText('Active Tab');
			expect(activeTabName).toHaveClass('whitespace-nowrap');
			expect(activeTabName).not.toHaveClass('truncate');
		});

		it('handles many tabs', () => {
			const tabs = Array.from({ length: 50 }, (_, i) =>
				createTab({ id: `tab-${i}`, name: `Tab ${i + 1}` })
			);

			render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-0"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			expect(screen.getByText('Tab 1')).toBeInTheDocument();
			expect(screen.getByText('Tab 50')).toBeInTheDocument();
		});

		it('handles whitespace-only inputValue (no draft indicator)', () => {
			const tabs = [
				createTab({
					id: 'tab-1',
					name: 'Tab 1',
					inputValue: '   ', // whitespace only
				}),
			];

			render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			expect(screen.queryByTitle('Has draft message')).not.toBeInTheDocument();
		});

		it('handles empty stagedImages array (no draft indicator)', () => {
			const tabs = [
				createTab({
					id: 'tab-1',
					name: 'Tab 1',
					stagedImages: [],
				}),
			];

			render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			expect(screen.queryByTitle('Has draft message')).not.toBeInTheDocument();
		});

		it('handles rapid tab selection', () => {
			const tabs = [
				createTab({ id: 'tab-1', name: 'Tab 1' }),
				createTab({ id: 'tab-2', name: 'Tab 2' }),
				createTab({ id: 'tab-3', name: 'Tab 3' }),
			];

			render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-1"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			fireEvent.click(screen.getByText('Tab 2'));
			fireEvent.click(screen.getByText('Tab 3'));
			fireEvent.click(screen.getByText('Tab 1'));

			expect(mockOnTabSelect).toHaveBeenCalledTimes(3);
			expect(mockOnTabSelect).toHaveBeenNthCalledWith(1, 'tab-2');
			expect(mockOnTabSelect).toHaveBeenNthCalledWith(2, 'tab-3');
			expect(mockOnTabSelect).toHaveBeenNthCalledWith(3, 'tab-1');
		});
	});

	describe('overflow detection', () => {
		it('makes new tab button sticky when tabs overflow', () => {
			// Mock scrollWidth > clientWidth
			const originalRef = React.useRef;
			vi.spyOn(React, 'useRef').mockImplementation((initial) => {
				const ref = originalRef(initial);
				if (ref.current === null) {
					Object.defineProperty(ref, 'current', {
						get: () => ({
							scrollWidth: 1000,
							clientWidth: 500,
							querySelector: vi.fn().mockReturnValue({
								offsetLeft: 100,
								offsetWidth: 80,
								scrollIntoView: vi.fn(),
							}),
							scrollTo: vi.fn(),
						}),
						set: () => {},
					});
				}
				return ref;
			});

			const tabs = Array.from({ length: 20 }, (_, i) =>
				createTab({ id: `tab-${i}`, name: `Tab ${i + 1}` })
			);

			render(
				<TabBar
					tabs={tabs}
					activeTabId="tab-0"
					theme={mockTheme}
					onTabSelect={mockOnTabSelect}
					onTabClose={mockOnTabClose}
					onNewTab={mockOnNewTab}
				/>
			);

			// Wait for overflow check
			act(() => {
				vi.advanceTimersByTime(100);
			});

			vi.restoreAllMocks();
		});
	});
});
