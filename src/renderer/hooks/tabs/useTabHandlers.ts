import { useMemo, useCallback } from 'react';
import type {
	Session,
	AITab,
	FilePreviewTab,
	UnifiedTab,
	FilePreviewHistoryEntry,
} from '../../types';
import { setActiveTab, createTab, getActiveTab, buildUnifiedTabs } from '../../utils/tabHelpers';
import { useSessionStore, selectActiveSession } from '../../stores/sessionStore';
import { useModalStore } from '../../stores/modalStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTabStore } from '../../stores/tabStore';

import { useFileTabHandlers } from './useFileTabHandlers';
import { useTabCloseHandlers } from './useTabCloseHandlers';
import type { CloseCurrentTabResult } from './useTabCloseHandlers';
import { useTabPropertyHandlers } from './useTabPropertyHandlers';

// ============================================================================
// Types
// ============================================================================

export type { CloseCurrentTabResult } from './useTabCloseHandlers';

export interface TabHandlersReturn {
	// Derived state
	activeTab: AITab | undefined;
	unifiedTabs: UnifiedTab[];
	activeFileTab: FilePreviewTab | null;
	isResumingSession: boolean;
	fileTabBackHistory: FilePreviewHistoryEntry[];
	fileTabForwardHistory: FilePreviewHistoryEntry[];
	fileTabCanGoBack: boolean;
	fileTabCanGoForward: boolean;
	activeFileTabNavIndex: number;

	// Internal helpers (needed by keyboard handler)
	performTabClose: (tabId: string) => void;

	// AI Tab handlers
	handleNewAgentSession: () => void;
	handleTabSelect: (tabId: string) => void;
	handleTabClose: (tabId: string) => void;
	handleNewTab: () => void;
	handleTabReorder: (fromIndex: number, toIndex: number) => void;
	handleUnifiedTabReorder: (fromIndex: number, toIndex: number) => void;
	handleCloseAllTabs: () => void;
	handleCloseOtherTabs: () => void;
	handleCloseTabsLeft: () => void;
	handleCloseTabsRight: () => void;
	handleCloseCurrentTab: () => CloseCurrentTabResult;
	handleRequestTabRename: (tabId: string) => void;
	handleUpdateTabByClaudeSessionId: (
		agentSessionId: string,
		updates: { name?: string | null; starred?: boolean }
	) => void;
	handleTabStar: (tabId: string, starred: boolean) => void;
	handleTabMarkUnread: (tabId: string) => void;
	handleToggleTabReadOnlyMode: () => void;
	handleToggleTabSaveToHistory: () => void;
	handleToggleTabShowThinking: () => void;

	// File Tab handlers
	handleOpenFileTab: (
		file: {
			path: string;
			name: string;
			content: string;
			sshRemoteId?: string;
			lastModified?: number;
		},
		options?: { openInNewTab?: boolean; targetSessionId?: string }
	) => void;
	handleSelectFileTab: (tabId: string) => Promise<void>;
	handleCloseFileTab: (tabId: string) => void;
	handleFileTabEditModeChange: (tabId: string, editMode: boolean) => void;
	handleFileTabEditContentChange: (
		tabId: string,
		editContent: string | undefined,
		savedContent?: string
	) => void;
	handleFileTabScrollPositionChange: (tabId: string, scrollTop: number) => void;
	handleFileTabSearchQueryChange: (tabId: string, searchQuery: string) => void;
	handleReloadFileTab: (tabId: string) => Promise<void>;
	handleFileTabNavigateBack: () => Promise<void>;
	handleFileTabNavigateForward: () => Promise<void>;
	handleFileTabNavigateToIndex: (index: number) => Promise<void>;
	handleClearFilePreviewHistory: () => void;

	// Scroll/log handlers
	handleScrollPositionChange: (scrollTop: number) => void;
	handleAtBottomChange: (isAtBottom: boolean) => void;
	handleDeleteLog: (logId: string) => number | null;
}

// ============================================================================
// Hook
// ============================================================================

export function useTabHandlers(): TabHandlersReturn {
	// --- Reactive subscriptions for derived state ---
	const activeSession = useSessionStore(selectActiveSession);

	// --- Derived state (useMemo) ---

	// Per-tab navigation history for the active file tab
	const activeFileTabHistory = useMemo(() => {
		if (!activeSession?.activeFileTabId) return [];
		const tab = activeSession.filePreviewTabs.find((t) => t.id === activeSession.activeFileTabId);
		return tab?.navigationHistory ?? [];
	}, [activeSession?.activeFileTabId, activeSession?.filePreviewTabs]);

	const activeFileTabNavIndex = useMemo(() => {
		if (!activeSession?.activeFileTabId) return -1;
		const tab = activeSession.filePreviewTabs.find((t) => t.id === activeSession.activeFileTabId);
		return tab?.navigationIndex ?? (tab?.navigationHistory?.length ?? 0) - 1;
	}, [activeSession?.activeFileTabId, activeSession?.filePreviewTabs]);

	// Per-tab back/forward history arrays
	const fileTabBackHistory = useMemo(
		() => activeFileTabHistory.slice(0, activeFileTabNavIndex),
		[activeFileTabHistory, activeFileTabNavIndex]
	);
	const fileTabForwardHistory = useMemo(
		() => activeFileTabHistory.slice(activeFileTabNavIndex + 1),
		[activeFileTabHistory, activeFileTabNavIndex]
	);

	// Can navigate back/forward in the current file tab
	const fileTabCanGoBack = activeFileTabNavIndex > 0;
	const fileTabCanGoForward = activeFileTabNavIndex < activeFileTabHistory.length - 1;

	const activeTab = useMemo(
		() => (activeSession ? getActiveTab(activeSession) : undefined),
		[activeSession?.aiTabs, activeSession?.activeTabId]
	);

	// UNIFIED TAB SYSTEM: Combine aiTabs and filePreviewTabs according to unifiedTabOrder
	// Uses shared buildUnifiedTabs which also appends orphaned tabs as a safety net
	const unifiedTabs = useMemo((): UnifiedTab[] => {
		if (!activeSession) return [];
		return buildUnifiedTabs(activeSession);
	}, [
		activeSession?.aiTabs,
		activeSession?.filePreviewTabs,
		activeSession?.terminalTabs,
		activeSession?.unifiedTabOrder,
	]);

	// Get the active file preview tab (if a file tab is active)
	const activeFileTab = useMemo((): FilePreviewTab | null => {
		if (!activeSession?.activeFileTabId) return null;
		return (
			activeSession.filePreviewTabs.find((tab) => tab.id === activeSession.activeFileTabId) ?? null
		);
	}, [activeSession?.activeFileTabId, activeSession?.filePreviewTabs]);

	const isResumingSession = !!activeTab?.agentSessionId;

	// --- Compose sub-hooks ---
	const fileTabHandlers = useFileTabHandlers();
	const closeHandlers = useTabCloseHandlers();
	const propertyHandlers = useTabPropertyHandlers();

	// ========================================================================
	// AI Tab Operations
	// ========================================================================

	const handleNewAgentSession = useCallback(() => {
		const { setSessions } = useSessionStore.getState();
		const activeSessionId = useSessionStore.getState().activeSessionId;
		const { defaultSaveToHistory, defaultShowThinking } = useSettingsStore.getState();

		setSessions((prev: Session[]) => {
			const currentSession = prev.find((s) => s.id === activeSessionId);
			if (!currentSession) return prev;
			return prev.map((s) => {
				if (s.id !== currentSession.id) return s;
				const result = createTab(s, {
					saveToHistory: defaultSaveToHistory,
					showThinking: defaultShowThinking,
				});
				if (!result) return s;
				return result.session;
			});
		});
		useModalStore.getState().closeModal('agentSessions');
	}, []);

	const handleTabSelect = useCallback((tabId: string) => {
		const { setSessions, activeSessionId } = useSessionStore.getState();
		setSessions((prev: Session[]) =>
			prev.map((s) => {
				if (s.id !== activeSessionId) return s;
				const result = setActiveTab(s, tabId);
				return result ? result.session : s;
			})
		);
	}, []);

	// ========================================================================
	// Log Deletion
	// ========================================================================

	const handleDeleteLog = useCallback((logId: string): number | null => {
		const { sessions, activeSessionId, setSessions } = useSessionStore.getState();
		const currentSession = sessions.find((s) => s.id === activeSessionId);
		if (!currentSession) return null;

		const isAIMode = currentSession.inputMode === 'ai';
		const currentActiveTab = isAIMode ? getActiveTab(currentSession) : null;
		const logs = isAIMode ? currentActiveTab?.logs || [] : currentSession.shellLogs;

		const logIndex = logs.findIndex((log) => log.id === logId);
		if (logIndex === -1) return null;

		const log = logs[logIndex];
		if (log.source !== 'user') return null;

		let endIndex = logs.length;
		for (let i = logIndex + 1; i < logs.length; i++) {
			if (logs[i].source === 'user') {
				endIndex = i;
				break;
			}
		}

		const newLogs = [...logs.slice(0, logIndex), ...logs.slice(endIndex)];

		let nextUserCommandIndex: number | null = null;
		for (let i = logIndex; i < newLogs.length; i++) {
			if (newLogs[i].source === 'user') {
				nextUserCommandIndex = i;
				break;
			}
		}
		if (nextUserCommandIndex === null) {
			for (let i = logIndex - 1; i >= 0; i--) {
				if (newLogs[i].source === 'user') {
					nextUserCommandIndex = i;
					break;
				}
			}
		}

		if (isAIMode && currentActiveTab) {
			const agentSessionId = currentActiveTab.agentSessionId;
			if (agentSessionId && currentSession.cwd) {
				window.maestro.claude
					.deleteMessagePair(currentSession.cwd, agentSessionId, logId, log.text)
					.then((result) => {
						if (!result.success) {
							console.warn('[handleDeleteLog] Failed to delete from Claude session:', result.error);
						}
					})
					.catch((err) => {
						console.error('[handleDeleteLog] Error deleting from Claude session:', err);
					});
			}

			const commandText = log.text.trim();

			setSessions((prev: Session[]) =>
				prev.map((s) => {
					if (s.id !== currentSession.id) return s;
					const newAICommandHistory = (s.aiCommandHistory || []).filter(
						(cmd) => cmd !== commandText
					);
					return {
						...s,
						aiCommandHistory: newAICommandHistory,
						aiTabs: s.aiTabs.map((tab) =>
							tab.id === currentActiveTab.id ? { ...tab, logs: newLogs } : tab
						),
					};
				})
			);
		} else {
			const commandText = log.text.trim();

			setSessions((prev: Session[]) =>
				prev.map((s) => {
					if (s.id !== currentSession.id) return s;
					const newShellCommandHistory = (s.shellCommandHistory || []).filter(
						(cmd) => cmd !== commandText
					);
					return {
						...s,
						shellLogs: newLogs,
						shellCommandHistory: newShellCommandHistory,
					};
				})
			);
		}

		return nextUserCommandIndex;
	}, []);

	// ========================================================================
	// Scroll State
	// ========================================================================

	const handleScrollPositionChange = useCallback((scrollTop: number) => {
		const { sessions, activeSessionId, setSessions } = useSessionStore.getState();
		const session = sessions.find((s) => s.id === activeSessionId);
		if (!session) return;
		if (session.inputMode === 'ai') {
			const currentActiveTab = getActiveTab(session);
			if (!currentActiveTab) return;
			setSessions((prev: Session[]) =>
				prev.map((s) => {
					if (s.id !== activeSessionId) return s;
					return {
						...s,
						aiTabs: s.aiTabs.map((tab) =>
							tab.id === currentActiveTab.id ? { ...tab, scrollTop } : tab
						),
					};
				})
			);
		} else {
			setSessions((prev: Session[]) =>
				prev.map((s) => (s.id === activeSessionId ? { ...s, terminalScrollTop: scrollTop } : s))
			);
		}
	}, []);

	const handleAtBottomChange = useCallback((isAtBottom: boolean) => {
		const { sessions, activeSessionId, setSessions } = useSessionStore.getState();
		const session = sessions.find((s) => s.id === activeSessionId);
		if (!session) return;
		if (session.inputMode === 'ai') {
			const currentActiveTab = getActiveTab(session);
			if (!currentActiveTab) return;
			setSessions((prev: Session[]) =>
				prev.map((s) => {
					if (s.id !== activeSessionId) return s;
					return {
						...s,
						aiTabs: s.aiTabs.map((tab) =>
							tab.id === currentActiveTab.id
								? {
										...tab,
										isAtBottom,
										hasUnread: isAtBottom ? false : tab.hasUnread,
									}
								: tab
						),
					};
				})
			);
		}
	}, []);

	// ========================================================================
	// Return
	// ========================================================================

	return {
		// Derived state
		activeTab,
		unifiedTabs,
		activeFileTab,
		isResumingSession,
		fileTabBackHistory,
		fileTabForwardHistory,
		fileTabCanGoBack,
		fileTabCanGoForward,
		activeFileTabNavIndex,

		// Internal helpers (needed by keyboard handler)
		performTabClose: closeHandlers.performTabClose,

		// AI Tab handlers
		handleNewAgentSession,
		handleTabSelect,
		handleTabClose: closeHandlers.handleTabClose,
		handleNewTab: closeHandlers.handleNewTab,
		handleTabReorder: propertyHandlers.handleTabReorder,
		handleUnifiedTabReorder: fileTabHandlers.handleUnifiedTabReorder,
		handleCloseAllTabs: closeHandlers.handleCloseAllTabs,
		handleCloseOtherTabs: closeHandlers.handleCloseOtherTabs,
		handleCloseTabsLeft: closeHandlers.handleCloseTabsLeft,
		handleCloseTabsRight: closeHandlers.handleCloseTabsRight,
		handleCloseCurrentTab: closeHandlers.handleCloseCurrentTab,
		handleRequestTabRename: propertyHandlers.handleRequestTabRename,
		handleUpdateTabByClaudeSessionId: propertyHandlers.handleUpdateTabByClaudeSessionId,
		handleTabStar: propertyHandlers.handleTabStar,
		handleTabMarkUnread: propertyHandlers.handleTabMarkUnread,
		handleToggleTabReadOnlyMode: propertyHandlers.handleToggleTabReadOnlyMode,
		handleToggleTabSaveToHistory: propertyHandlers.handleToggleTabSaveToHistory,
		handleToggleTabShowThinking: propertyHandlers.handleToggleTabShowThinking,

		// File Tab handlers
		handleOpenFileTab: fileTabHandlers.handleOpenFileTab,
		handleSelectFileTab: fileTabHandlers.handleSelectFileTab,
		handleCloseFileTab: fileTabHandlers.handleCloseFileTab,
		handleFileTabEditModeChange: fileTabHandlers.handleFileTabEditModeChange,
		handleFileTabEditContentChange: fileTabHandlers.handleFileTabEditContentChange,
		handleFileTabScrollPositionChange: fileTabHandlers.handleFileTabScrollPositionChange,
		handleFileTabSearchQueryChange: fileTabHandlers.handleFileTabSearchQueryChange,
		handleReloadFileTab: fileTabHandlers.handleReloadFileTab,
		handleFileTabNavigateBack: fileTabHandlers.handleFileTabNavigateBack,
		handleFileTabNavigateForward: fileTabHandlers.handleFileTabNavigateForward,
		handleFileTabNavigateToIndex: fileTabHandlers.handleFileTabNavigateToIndex,
		handleClearFilePreviewHistory: fileTabHandlers.handleClearFilePreviewHistory,

		// Scroll/log handlers
		handleScrollPositionChange,
		handleAtBottomChange,
		handleDeleteLog,
	};
}

// ============================================================================
// Terminal Tab Handlers
// ============================================================================

export interface TerminalTabHandlersReturn {
	handleOpenTerminalTab: (options?: { shell?: string; cwd?: string; name?: string | null }) => void;
	handleCloseTerminalTab: (tabId: string) => void;
	handleSelectTerminalTab: (tabId: string) => void;
	handleRenameTerminalTab: (tabId: string, name: string) => void;
}

/**
 * Thin wrapper hook exposing terminal tab operations via the tabStore.
 * Components call this hook to manipulate terminal tabs without directly
 * importing the store.
 */
export function useTerminalTabHandlers(): TerminalTabHandlersReturn {
	const { createTerminalTab, closeTerminalTab, selectTerminalTab, renameTerminalTab } =
		useTabStore();

	const handleOpenTerminalTab = useCallback(
		(options?: { shell?: string; cwd?: string; name?: string | null }) => {
			createTerminalTab(options);
		},
		[createTerminalTab]
	);

	const handleCloseTerminalTab = useCallback(
		(tabId: string) => {
			closeTerminalTab(tabId);
		},
		[closeTerminalTab]
	);

	const handleSelectTerminalTab = useCallback(
		(tabId: string) => {
			selectTerminalTab(tabId);
		},
		[selectTerminalTab]
	);

	const handleRenameTerminalTab = useCallback(
		(tabId: string, name: string) => {
			renameTerminalTab(tabId, name);
		},
		[renameTerminalTab]
	);

	return {
		handleOpenTerminalTab,
		handleCloseTerminalTab,
		handleSelectTerminalTab,
		handleRenameTerminalTab,
	};
}
