import { useCallback } from 'react';
import type { Session, FilePreviewTab, UnifiedTabRef } from '../../types';
import {
	closeFileTab as closeFileTabHelper,
	ensureInUnifiedTabOrder,
} from '../../utils/tabHelpers';
import { generateId } from '../../utils/ids';
import { useSessionStore } from '../../stores/sessionStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useModalStore } from '../../stores/modalStore';

// ============================================================================
// Types
// ============================================================================

interface FileTabOpenParams {
	path: string;
	name: string;
	content: string;
	sshRemoteId?: string;
	lastModified?: number;
}

export interface FileTabHandlersReturn {
	handleOpenFileTab: (
		file: FileTabOpenParams,
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
	handleUnifiedTabReorder: (fromIndex: number, toIndex: number) => void;
	handleFileTabNavigateBack: () => Promise<void>;
	handleFileTabNavigateForward: () => Promise<void>;
	handleFileTabNavigateToIndex: (index: number) => Promise<void>;
	handleClearFilePreviewHistory: () => void;
}

// ============================================================================
// Hook
// ============================================================================

export function useFileTabHandlers(): FileTabHandlersReturn {
	// ========================================================================
	// File Tab Creation
	// ========================================================================

	/**
	 * Open a file preview tab. If a tab with the same path already exists, select it.
	 * Otherwise, create a new FilePreviewTab, add it to filePreviewTabs and unifiedTabOrder,
	 * and set it as the active file tab (deselecting any active AI tab).
	 *
	 * For SSH remote files, pass sshRemoteId so content can be re-fetched if needed.
	 */
	const handleOpenFileTab = useCallback(
		(
			file: FileTabOpenParams,
			options?: {
				/** If true, create new tab adjacent to current file tab. If false, replace current file tab content. Default: true (create new tab) */
				openInNewTab?: boolean;
				/** Override which session the tab is created in (defaults to current active session) */
				targetSessionId?: string;
			}
		) => {
			const openInNewTab = options?.openInNewTab ?? true;
			const { setSessions } = useSessionStore.getState();
			const activeSessionId =
				options?.targetSessionId || useSessionStore.getState().activeSessionId;

			setSessions((prev: Session[]) =>
				prev.map((s) => {
					if (s.id !== activeSessionId) return s;

					// Check if a tab with this path already exists
					const existingTab = s.filePreviewTabs.find((tab) => tab.path === file.path);
					if (existingTab) {
						// Tab exists - update content and lastModified if provided and select it
						const updatedTabs = s.filePreviewTabs.map((tab) =>
							tab.id === existingTab.id
								? {
										...tab,
										content: file.content,
										lastModified: file.lastModified ?? tab.lastModified,
										isLoading: false,
									}
								: tab
						);
						return {
							...s,
							filePreviewTabs: updatedTabs,
							activeFileTabId: existingTab.id,
							activeTerminalTabId: null,
							inputMode: 'ai' as const,
							activeTabId: s.activeTabId,
							unifiedTabOrder: ensureInUnifiedTabOrder(s.unifiedTabOrder, 'file', existingTab.id),
						};
					}

					// If not opening in new tab and there's an active file tab, replace its content
					if (!openInNewTab && s.activeFileTabId) {
						const currentTabId = s.activeFileTabId;
						const currentTab = s.filePreviewTabs.find((tab) => tab.id === currentTabId);
						const extension = file.name.includes('.') ? '.' + file.name.split('.').pop() : '';
						const nameWithoutExtension = extension
							? file.name.slice(0, -extension.length)
							: file.name;

						// Replace current tab's content with new file and update navigation history
						const updatedTabs = s.filePreviewTabs.map((tab) => {
							if (tab.id !== currentTabId) return tab;

							// Build updated navigation history
							const currentHistory = tab.navigationHistory ?? [];
							const currentIndex = tab.navigationIndex ?? currentHistory.length - 1;

							// Save current file to history before replacing
							// Truncate forward history if we're not at the end
							const truncatedHistory =
								currentIndex >= 0 && currentIndex < currentHistory.length - 1
									? currentHistory.slice(0, currentIndex + 1)
									: currentHistory;

							// Add current file to history if it exists and isn't already the last entry
							let newHistory = truncatedHistory;
							if (
								currentTab &&
								currentTab.path &&
								(truncatedHistory.length === 0 ||
									truncatedHistory[truncatedHistory.length - 1].path !== currentTab.path)
							) {
								newHistory = [
									...truncatedHistory,
									{
										path: currentTab.path,
										name: currentTab.name,
										scrollTop: currentTab.scrollTop,
									},
								];
							}

							// Add the new file to history
							const finalHistory = [
								...newHistory,
								{
									path: file.path,
									name: nameWithoutExtension,
									scrollTop: 0,
								},
							];

							return {
								...tab,
								path: file.path,
								name: nameWithoutExtension,
								extension,
								content: file.content,
								scrollTop: 0,
								searchQuery: '',
								editMode: false,
								editContent: undefined,
								lastModified: file.lastModified ?? Date.now(),
								sshRemoteId: file.sshRemoteId,
								isLoading: false,
								navigationHistory: finalHistory,
								navigationIndex: finalHistory.length - 1,
							};
						});
						return {
							...s,
							filePreviewTabs: updatedTabs,
						};
					}

					// Create a new file preview tab
					const newTabId = generateId();
					const extension = file.name.includes('.') ? '.' + file.name.split('.').pop() : '';
					const nameWithoutExtension = extension
						? file.name.slice(0, -extension.length)
						: file.name;

					const newFileTab: FilePreviewTab = {
						id: newTabId,
						path: file.path,
						name: nameWithoutExtension,
						extension,
						content: file.content,
						scrollTop: 0,
						searchQuery: '',
						editMode: false,
						editContent: undefined,
						createdAt: Date.now(),
						lastModified: file.lastModified ?? Date.now(),
						sshRemoteId: file.sshRemoteId,
						isLoading: false,
						navigationHistory: [{ path: file.path, name: nameWithoutExtension, scrollTop: 0 }],
						navigationIndex: 0,
					};

					// Create the unified tab reference
					const newTabRef: UnifiedTabRef = { type: 'file', id: newTabId };

					// If opening in new tab and there's an active file tab, insert adjacent to it
					let updatedUnifiedTabOrder: UnifiedTabRef[];
					if (openInNewTab && s.activeFileTabId) {
						const currentIndex = s.unifiedTabOrder.findIndex(
							(ref) => ref.type === 'file' && ref.id === s.activeFileTabId
						);
						if (currentIndex !== -1) {
							updatedUnifiedTabOrder = [
								...s.unifiedTabOrder.slice(0, currentIndex + 1),
								newTabRef,
								...s.unifiedTabOrder.slice(currentIndex + 1),
							];
						} else {
							updatedUnifiedTabOrder = [...s.unifiedTabOrder, newTabRef];
						}
					} else {
						updatedUnifiedTabOrder = [...s.unifiedTabOrder, newTabRef];
					}

					return {
						...s,
						filePreviewTabs: [...s.filePreviewTabs, newFileTab],
						unifiedTabOrder: updatedUnifiedTabOrder,
						activeFileTabId: newTabId,
						activeTerminalTabId: null,
						inputMode: 'ai' as const,
					};
				})
			);
		},
		[]
	);

	// ========================================================================
	// File Tab Operations
	// ========================================================================

	/**
	 * Force close a file preview tab without confirmation.
	 */
	const forceCloseFileTab = useCallback((tabId: string) => {
		const { setSessions, activeSessionId } = useSessionStore.getState();
		setSessions((prev: Session[]) =>
			prev.map((s) => {
				if (s.id !== activeSessionId) return s;
				const result = closeFileTabHelper(s, tabId);
				if (!result) return s;
				return result.session;
			})
		);
	}, []);

	/**
	 * Close a file preview tab with unsaved changes check.
	 */
	const handleCloseFileTab = useCallback(
		(tabId: string) => {
			const { sessions, activeSessionId } = useSessionStore.getState();
			const currentSession = sessions.find((s) => s.id === activeSessionId);
			if (!currentSession) {
				forceCloseFileTab(tabId);
				return;
			}

			const tabToClose = currentSession.filePreviewTabs.find((tab) => tab.id === tabId);
			if (!tabToClose) {
				forceCloseFileTab(tabId);
				return;
			}

			if (tabToClose.editContent !== undefined) {
				useModalStore.getState().openModal('confirm', {
					message: `"${tabToClose.name}${tabToClose.extension}" has unsaved changes. Are you sure you want to close it?`,
					onConfirm: () => {
						forceCloseFileTab(tabId);
					},
				});
			} else {
				forceCloseFileTab(tabId);
			}
		},
		[forceCloseFileTab]
	);

	const handleFileTabEditModeChange = useCallback((tabId: string, editMode: boolean) => {
		const { setSessions, activeSessionId } = useSessionStore.getState();
		setSessions((prev: Session[]) =>
			prev.map((s) => {
				if (s.id !== activeSessionId) return s;
				const updatedFileTabs = s.filePreviewTabs.map((tab) => {
					if (tab.id !== tabId) return tab;
					return { ...tab, editMode };
				});
				return { ...s, filePreviewTabs: updatedFileTabs };
			})
		);
	}, []);

	const handleFileTabEditContentChange = useCallback(
		(tabId: string, editContent: string | undefined, savedContent?: string) => {
			const { setSessions, activeSessionId } = useSessionStore.getState();
			setSessions((prev: Session[]) =>
				prev.map((s) => {
					if (s.id !== activeSessionId) return s;
					const updatedFileTabs = s.filePreviewTabs.map((tab) => {
						if (tab.id !== tabId) return tab;
						if (savedContent !== undefined) {
							return { ...tab, editContent, content: savedContent };
						}
						return { ...tab, editContent };
					});
					return { ...s, filePreviewTabs: updatedFileTabs };
				})
			);
		},
		[]
	);

	const handleFileTabScrollPositionChange = useCallback((tabId: string, scrollTop: number) => {
		const { setSessions, activeSessionId } = useSessionStore.getState();
		setSessions((prev: Session[]) =>
			prev.map((s) => {
				if (s.id !== activeSessionId) return s;
				const updatedFileTabs = s.filePreviewTabs.map((tab) => {
					if (tab.id !== tabId) return tab;

					let updatedHistory = tab.navigationHistory;
					if (updatedHistory && updatedHistory.length > 0) {
						const currentIndex = tab.navigationIndex ?? updatedHistory.length - 1;
						if (currentIndex >= 0 && currentIndex < updatedHistory.length) {
							updatedHistory = updatedHistory.map((entry, idx) =>
								idx === currentIndex ? { ...entry, scrollTop } : entry
							);
						}
					}
					return { ...tab, scrollTop, navigationHistory: updatedHistory };
				});
				return { ...s, filePreviewTabs: updatedFileTabs };
			})
		);
	}, []);

	const handleFileTabSearchQueryChange = useCallback((tabId: string, searchQuery: string) => {
		const { setSessions, activeSessionId } = useSessionStore.getState();
		setSessions((prev: Session[]) =>
			prev.map((s) => {
				if (s.id !== activeSessionId) return s;
				const updatedFileTabs = s.filePreviewTabs.map((tab) => {
					if (tab.id !== tabId) return tab;
					return { ...tab, searchQuery };
				});
				return { ...s, filePreviewTabs: updatedFileTabs };
			})
		);
	}, []);

	const handleReloadFileTab = useCallback(async (tabId: string) => {
		const { sessions, activeSessionId } = useSessionStore.getState();
		const currentSession = sessions.find((s) => s.id === activeSessionId);
		if (!currentSession) return;

		const fileTab = currentSession.filePreviewTabs.find((tab) => tab.id === tabId);
		if (!fileTab) return;

		try {
			const [content, stat] = await Promise.all([
				window.maestro.fs.readFile(fileTab.path, fileTab.sshRemoteId),
				window.maestro.fs.stat(fileTab.path, fileTab.sshRemoteId),
			]);
			if (content === null) return;
			const newMtime = stat?.modifiedAt ? new Date(stat.modifiedAt).getTime() : Date.now();

			useSessionStore.getState().setSessions((prev: Session[]) =>
				prev.map((s) => {
					if (s.id !== useSessionStore.getState().activeSessionId) return s;
					return {
						...s,
						filePreviewTabs: s.filePreviewTabs.map((tab) =>
							tab.id === tabId
								? {
										...tab,
										content,
										lastModified: newMtime,
										editContent: undefined,
									}
								: tab
						),
					};
				})
			);
		} catch (error) {
			console.debug('[handleReloadFileTab] Failed to reload:', error);
		}
	}, []);

	/**
	 * Select a file preview tab. If fileTabAutoRefreshEnabled, checks if file changed on disk.
	 */
	const handleSelectFileTab = useCallback(async (tabId: string) => {
		const { sessions, activeSessionId, setSessions } = useSessionStore.getState();
		const currentSession = sessions.find((s) => s.id === activeSessionId);
		if (!currentSession) return;

		const fileTab = currentSession.filePreviewTabs.find((tab) => tab.id === tabId);
		if (!fileTab) return;

		// Set the tab as active immediately, and reset inputMode/activeTerminalTabId in case
		// we're switching away from terminal mode (clicking a file tab while terminal is active).
		setSessions((prev: Session[]) =>
			prev.map((s) => {
				if (s.id !== activeSessionId) return s;
				return { ...s, activeFileTabId: tabId, activeTerminalTabId: null, inputMode: 'ai' };
			})
		);

		// Auto-refresh if enabled and tab has no pending edits
		const { fileTabAutoRefreshEnabled } = useSettingsStore.getState();
		if (fileTabAutoRefreshEnabled && !fileTab.editContent) {
			try {
				const stat = await window.maestro.fs.stat(fileTab.path, fileTab.sshRemoteId);
				if (!stat || !stat.modifiedAt) return;

				const currentMtime = new Date(stat.modifiedAt).getTime();

				if (currentMtime > fileTab.lastModified) {
					const content = await window.maestro.fs.readFile(fileTab.path, fileTab.sshRemoteId);
					if (content === null) return;
					useSessionStore.getState().setSessions((prev: Session[]) =>
						prev.map((s) => {
							if (s.id !== useSessionStore.getState().activeSessionId) return s;
							return {
								...s,
								filePreviewTabs: s.filePreviewTabs.map((tab) =>
									tab.id === tabId ? { ...tab, content, lastModified: currentMtime } : tab
								),
							};
						})
					);
				}
			} catch (error) {
				console.debug('[handleSelectFileTab] Auto-refresh failed:', error);
			}
		}
	}, []);

	const handleUnifiedTabReorder = useCallback((fromIndex: number, toIndex: number) => {
		const { setSessions, activeSessionId } = useSessionStore.getState();
		setSessions((prev: Session[]) =>
			prev.map((s) => {
				if (s.id !== activeSessionId) return s;
				console.debug('[useTabHandlers] handleUnifiedTabReorder', {
					fromIndex,
					toIndex,
					orderLength: s.unifiedTabOrder.length,
					order: s.unifiedTabOrder.map((r) => `${r.type}:${r.id.slice(0, 8)}`),
				});
				if (
					fromIndex < 0 ||
					fromIndex >= s.unifiedTabOrder.length ||
					toIndex < 0 ||
					toIndex >= s.unifiedTabOrder.length ||
					fromIndex === toIndex
				) {
					console.debug(
						'[useTabHandlers] handleUnifiedTabReorder: bounds check failed, returning unchanged'
					);
					return s;
				}
				const newOrder = [...s.unifiedTabOrder];
				const [movedRef] = newOrder.splice(fromIndex, 1);
				newOrder.splice(toIndex, 0, movedRef);
				console.debug('[useTabHandlers] handleUnifiedTabReorder: reordered', {
					movedRef,
					newOrder: newOrder.map((r) => `${r.type}:${r.id.slice(0, 8)}`),
				});
				return { ...s, unifiedTabOrder: newOrder };
			})
		);
	}, []);

	// ========================================================================
	// File Tab Navigation
	// ========================================================================

	const handleClearFilePreviewHistory = useCallback(() => {
		const { sessions, activeSessionId, setSessions } = useSessionStore.getState();
		const currentSession = sessions.find((s) => s.id === activeSessionId);
		if (!currentSession) return;
		setSessions((prev: Session[]) =>
			prev.map((s) =>
				s.id === currentSession.id
					? { ...s, filePreviewHistory: [], filePreviewHistoryIndex: -1 }
					: s
			)
		);
	}, []);

	const handleFileTabNavigateBack = useCallback(async () => {
		const { sessions, activeSessionId, setSessions } = useSessionStore.getState();
		const currentSession = sessions.find((s) => s.id === activeSessionId);
		if (!currentSession?.activeFileTabId) return;

		const currentTab = currentSession.filePreviewTabs.find(
			(tab) => tab.id === currentSession.activeFileTabId
		);
		if (!currentTab) return;

		const history = currentTab.navigationHistory ?? [];
		const currentIndex = currentTab.navigationIndex ?? history.length - 1;

		if (currentIndex > 0) {
			const newIndex = currentIndex - 1;
			const historyEntry = history[newIndex];

			try {
				const sshRemoteId = currentTab.sshRemoteId;
				const content = await window.maestro.fs.readFile(historyEntry.path, sshRemoteId);
				if (!content) return;

				setSessions((prev: Session[]) =>
					prev.map((s) => {
						if (s.id !== currentSession.id) return s;
						return {
							...s,
							filePreviewTabs: s.filePreviewTabs.map((tab) =>
								tab.id === currentTab.id
									? {
											...tab,
											path: historyEntry.path,
											name: historyEntry.name,
											content,
											scrollTop: historyEntry.scrollTop ?? 0,
											navigationIndex: newIndex,
										}
									: tab
							),
						};
					})
				);
			} catch (error) {
				console.error('Failed to navigate back:', error);
			}
		}
	}, []);

	const handleFileTabNavigateForward = useCallback(async () => {
		const { sessions, activeSessionId, setSessions } = useSessionStore.getState();
		const currentSession = sessions.find((s) => s.id === activeSessionId);
		if (!currentSession?.activeFileTabId) return;

		const currentTab = currentSession.filePreviewTabs.find(
			(tab) => tab.id === currentSession.activeFileTabId
		);
		if (!currentTab) return;

		const history = currentTab.navigationHistory ?? [];
		const currentIndex = currentTab.navigationIndex ?? history.length - 1;

		if (currentIndex < history.length - 1) {
			const newIndex = currentIndex + 1;
			const historyEntry = history[newIndex];

			try {
				const sshRemoteId = currentTab.sshRemoteId;
				const content = await window.maestro.fs.readFile(historyEntry.path, sshRemoteId);
				if (!content) return;

				setSessions((prev: Session[]) =>
					prev.map((s) => {
						if (s.id !== currentSession.id) return s;
						return {
							...s,
							filePreviewTabs: s.filePreviewTabs.map((tab) =>
								tab.id === currentTab.id
									? {
											...tab,
											path: historyEntry.path,
											name: historyEntry.name,
											content,
											scrollTop: historyEntry.scrollTop ?? 0,
											navigationIndex: newIndex,
										}
									: tab
							),
						};
					})
				);
			} catch (error) {
				console.error('Failed to navigate forward:', error);
			}
		}
	}, []);

	const handleFileTabNavigateToIndex = useCallback(async (index: number) => {
		const { sessions, activeSessionId, setSessions } = useSessionStore.getState();
		const currentSession = sessions.find((s) => s.id === activeSessionId);
		if (!currentSession?.activeFileTabId) return;

		const currentTab = currentSession.filePreviewTabs.find(
			(tab) => tab.id === currentSession.activeFileTabId
		);
		if (!currentTab) return;

		const history = currentTab.navigationHistory ?? [];

		if (index >= 0 && index < history.length) {
			const historyEntry = history[index];

			try {
				const sshRemoteId = currentTab.sshRemoteId;
				const content = await window.maestro.fs.readFile(historyEntry.path, sshRemoteId);
				if (!content) return;

				setSessions((prev: Session[]) =>
					prev.map((s) => {
						if (s.id !== currentSession.id) return s;
						return {
							...s,
							filePreviewTabs: s.filePreviewTabs.map((tab) =>
								tab.id === currentTab.id
									? {
											...tab,
											path: historyEntry.path,
											name: historyEntry.name,
											content,
											scrollTop: historyEntry.scrollTop ?? 0,
											navigationIndex: index,
										}
									: tab
							),
						};
					})
				);
			} catch (error) {
				console.error('Failed to navigate to index:', error);
			}
		}
	}, []);

	return {
		handleOpenFileTab,
		handleSelectFileTab,
		handleCloseFileTab,
		handleFileTabEditModeChange,
		handleFileTabEditContentChange,
		handleFileTabScrollPositionChange,
		handleFileTabSearchQueryChange,
		handleReloadFileTab,
		handleUnifiedTabReorder,
		handleFileTabNavigateBack,
		handleFileTabNavigateForward,
		handleFileTabNavigateToIndex,
		handleClearFilePreviewHistory,
	};
}
