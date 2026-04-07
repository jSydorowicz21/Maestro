import { useCallback } from 'react';
import type { Session } from '../../types';
import {
	closeTab,
	closeFileTab as closeFileTabHelper,
	createTab,
	addAiTabToUnifiedHistory,
	hasActiveWizard,
	hasDraft,
} from '../../utils/tabHelpers';
import { useSessionStore } from '../../stores/sessionStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useModalStore } from '../../stores/modalStore';

// ============================================================================
// Types
// ============================================================================

export interface CloseCurrentTabResult {
	type: 'file' | 'ai' | 'terminal' | 'prevented' | 'none';
	tabId?: string;
	isWizardTab?: boolean;
	hasDraft?: boolean;
}

export interface TabCloseHandlersReturn {
	performTabClose: (tabId: string) => void;
	handleTabClose: (tabId: string) => void;
	handleNewTab: () => void;
	handleCloseAllTabs: () => void;
	handleCloseOtherTabs: () => void;
	handleCloseTabsLeft: () => void;
	handleCloseTabsRight: () => void;
	handleCloseCurrentTab: () => CloseCurrentTabResult;
}

// ============================================================================
// Hook
// ============================================================================

export function useTabCloseHandlers(): TabCloseHandlersReturn {
	/**
	 * Internal tab close handler that performs the actual close.
	 */
	const performTabClose = useCallback((tabId: string) => {
		const { setSessions, activeSessionId } = useSessionStore.getState();
		setSessions((prev: Session[]) =>
			prev.map((s) => {
				if (s.id !== activeSessionId) return s;
				const tab = s.aiTabs.find((t) => t.id === tabId);
				const isWizardTab = tab && hasActiveWizard(tab);
				const unifiedIndex = s.unifiedTabOrder.findIndex(
					(ref) => ref.type === 'ai' && ref.id === tabId
				);
				const result = closeTab(s, tabId, false, { skipHistory: isWizardTab });
				if (!result) return s;
				if (!isWizardTab && tab) {
					return addAiTabToUnifiedHistory(result.session, tab, unifiedIndex);
				}
				return result.session;
			})
		);
	}, []);

	const handleTabClose = useCallback(
		(tabId: string) => {
			const { sessions, activeSessionId } = useSessionStore.getState();
			const session = sessions.find((s) => s.id === activeSessionId);
			const tab = session?.aiTabs.find((t) => t.id === tabId);

			if (tab && hasActiveWizard(tab)) {
				useModalStore.getState().openModal('confirm', {
					message: 'Close this wizard? Your progress will be lost and cannot be restored.',
					onConfirm: () => performTabClose(tabId),
				});
			} else if (tab && hasDraft(tab)) {
				useModalStore.getState().openModal('confirm', {
					message: 'This tab has an unsent draft. Are you sure you want to close it?',
					onConfirm: () => performTabClose(tabId),
				});
			} else {
				performTabClose(tabId);
			}
		},
		[performTabClose]
	);

	const handleNewTab = useCallback(() => {
		const { setSessions, activeSessionId } = useSessionStore.getState();
		const { defaultSaveToHistory, defaultShowThinking } = useSettingsStore.getState();
		setSessions((prev: Session[]) =>
			prev.map((s) => {
				if (s.id !== activeSessionId) return s;
				const result = createTab(s, {
					saveToHistory: defaultSaveToHistory,
					showThinking: defaultShowThinking,
				});
				if (!result) return s;
				return result.session;
			})
		);
	}, []);

	const performCloseAllTabs = useCallback(() => {
		const { setSessions, activeSessionId } = useSessionStore.getState();
		setSessions((prev: Session[]) =>
			prev.map((s) => {
				if (s.id !== activeSessionId) return s;
				let updatedSession = s;
				const tabIds = s.aiTabs.map((t) => t.id);
				for (const tabId of tabIds) {
					const tab = updatedSession.aiTabs.find((t) => t.id === tabId);
					const result = closeTab(updatedSession, tabId, false, {
						skipHistory: tab ? hasActiveWizard(tab) : false,
					});
					if (result) {
						updatedSession = result.session;
					}
				}
				return updatedSession;
			})
		);
	}, []);

	const handleCloseAllTabs = useCallback(() => {
		const { sessions, activeSessionId } = useSessionStore.getState();
		const session = sessions.find((s) => s.id === activeSessionId);
		if (!session) return;

		const hasAnyDraft = session.aiTabs.some((tab) => hasDraft(tab));
		if (hasAnyDraft) {
			useModalStore.getState().openModal('confirm', {
				message: 'Some tabs have unsent drafts. Are you sure you want to close all tabs?',
				onConfirm: performCloseAllTabs,
			});
		} else {
			performCloseAllTabs();
		}
	}, [performCloseAllTabs]);

	const performCloseOtherTabs = useCallback(() => {
		const { setSessions, activeSessionId } = useSessionStore.getState();
		setSessions((prev: Session[]) =>
			prev.map((s) => {
				if (s.id !== activeSessionId) return s;

				const activeUnifiedId = s.activeFileTabId ?? s.activeTabId;
				const activeUnifiedType = s.activeFileTabId ? 'file' : 'ai';

				const tabsToClose = s.unifiedTabOrder.filter(
					(ref) => !(ref.type === activeUnifiedType && ref.id === activeUnifiedId)
				);

				let updatedSession = s;

				for (const tabRef of tabsToClose) {
					if (tabRef.type === 'ai') {
						const tab = updatedSession.aiTabs.find((t) => t.id === tabRef.id);
						if (tab) {
							const result = closeTab(updatedSession, tab.id, false, {
								skipHistory: hasActiveWizard(tab),
							});
							if (result) {
								updatedSession = result.session;
							}
						}
					} else {
						updatedSession = {
							...updatedSession,
							filePreviewTabs: updatedSession.filePreviewTabs.filter((t) => t.id !== tabRef.id),
							unifiedTabOrder: updatedSession.unifiedTabOrder.filter(
								(ref) => !(ref.type === 'file' && ref.id === tabRef.id)
							),
						};
					}
				}

				return updatedSession;
			})
		);
	}, []);

	const handleCloseOtherTabs = useCallback(() => {
		const { sessions, activeSessionId } = useSessionStore.getState();
		const session = sessions.find((s) => s.id === activeSessionId);
		if (!session) return;

		const activeTabId = session.activeFileTabId ?? session.activeTabId;
		const otherAiTabs = session.aiTabs.filter((t) => t.id !== activeTabId);
		const hasAnyDraft = otherAiTabs.some((tab) => hasDraft(tab));
		if (hasAnyDraft) {
			useModalStore.getState().openModal('confirm', {
				message: 'Some tabs have unsent drafts. Are you sure you want to close them?',
				onConfirm: performCloseOtherTabs,
			});
		} else {
			performCloseOtherTabs();
		}
	}, [performCloseOtherTabs]);

	const performCloseTabsLeft = useCallback(() => {
		const { setSessions, activeSessionId } = useSessionStore.getState();
		setSessions((prev: Session[]) =>
			prev.map((s) => {
				if (s.id !== activeSessionId) return s;

				const activeUnifiedId = s.activeFileTabId ?? s.activeTabId;
				const activeUnifiedType = s.activeFileTabId ? 'file' : 'ai';

				const activeIndex = s.unifiedTabOrder.findIndex(
					(ref) => ref.type === activeUnifiedType && ref.id === activeUnifiedId
				);
				if (activeIndex <= 0) return s;

				const tabsToClose = s.unifiedTabOrder.slice(0, activeIndex);

				let updatedSession = s;

				for (const tabRef of tabsToClose) {
					if (tabRef.type === 'ai') {
						const tab = updatedSession.aiTabs.find((t) => t.id === tabRef.id);
						if (tab) {
							const result = closeTab(updatedSession, tab.id, false, {
								skipHistory: hasActiveWizard(tab),
							});
							if (result) {
								updatedSession = result.session;
							}
						}
					} else {
						updatedSession = {
							...updatedSession,
							filePreviewTabs: updatedSession.filePreviewTabs.filter((t) => t.id !== tabRef.id),
							unifiedTabOrder: updatedSession.unifiedTabOrder.filter(
								(ref) => !(ref.type === 'file' && ref.id === tabRef.id)
							),
						};
					}
				}

				return updatedSession;
			})
		);
	}, []);

	const handleCloseTabsLeft = useCallback(() => {
		const { sessions, activeSessionId } = useSessionStore.getState();
		const session = sessions.find((s) => s.id === activeSessionId);
		if (!session) return;

		const activeUnifiedId = session.activeFileTabId ?? session.activeTabId;
		const activeUnifiedType = session.activeFileTabId ? 'file' : 'ai';
		const activeIndex = session.unifiedTabOrder.findIndex(
			(ref) => ref.type === activeUnifiedType && ref.id === activeUnifiedId
		);
		if (activeIndex <= 0) return;

		const tabRefsToClose = session.unifiedTabOrder.slice(0, activeIndex);
		const aiTabIds = new Set(tabRefsToClose.filter((r) => r.type === 'ai').map((r) => r.id));
		const hasAnyDraft = session.aiTabs
			.filter((t) => aiTabIds.has(t.id))
			.some((tab) => hasDraft(tab));
		if (hasAnyDraft) {
			useModalStore.getState().openModal('confirm', {
				message: 'Some tabs have unsent drafts. Are you sure you want to close them?',
				onConfirm: performCloseTabsLeft,
			});
		} else {
			performCloseTabsLeft();
		}
	}, [performCloseTabsLeft]);

	const performCloseTabsRight = useCallback(() => {
		const { setSessions, activeSessionId } = useSessionStore.getState();
		setSessions((prev: Session[]) =>
			prev.map((s) => {
				if (s.id !== activeSessionId) return s;

				const activeUnifiedId = s.activeFileTabId ?? s.activeTabId;
				const activeUnifiedType = s.activeFileTabId ? 'file' : 'ai';

				const activeIndex = s.unifiedTabOrder.findIndex(
					(ref) => ref.type === activeUnifiedType && ref.id === activeUnifiedId
				);
				if (activeIndex < 0 || activeIndex >= s.unifiedTabOrder.length - 1) return s;

				const tabsToClose = s.unifiedTabOrder.slice(activeIndex + 1);

				let updatedSession = s;

				for (const tabRef of tabsToClose) {
					if (tabRef.type === 'ai') {
						const tab = updatedSession.aiTabs.find((t) => t.id === tabRef.id);
						if (tab) {
							const result = closeTab(updatedSession, tab.id, false, {
								skipHistory: hasActiveWizard(tab),
							});
							if (result) {
								updatedSession = result.session;
							}
						}
					} else {
						updatedSession = {
							...updatedSession,
							filePreviewTabs: updatedSession.filePreviewTabs.filter((t) => t.id !== tabRef.id),
							unifiedTabOrder: updatedSession.unifiedTabOrder.filter(
								(ref) => !(ref.type === 'file' && ref.id === tabRef.id)
							),
						};
					}
				}

				return updatedSession;
			})
		);
	}, []);

	const handleCloseTabsRight = useCallback(() => {
		const { sessions, activeSessionId } = useSessionStore.getState();
		const session = sessions.find((s) => s.id === activeSessionId);
		if (!session) return;

		const activeUnifiedId = session.activeFileTabId ?? session.activeTabId;
		const activeUnifiedType = session.activeFileTabId ? 'file' : 'ai';
		const activeIndex = session.unifiedTabOrder.findIndex(
			(ref) => ref.type === activeUnifiedType && ref.id === activeUnifiedId
		);
		if (activeIndex < 0 || activeIndex >= session.unifiedTabOrder.length - 1) return;

		const tabRefsToClose = session.unifiedTabOrder.slice(activeIndex + 1);
		const aiTabIds = new Set(tabRefsToClose.filter((r) => r.type === 'ai').map((r) => r.id));
		const hasAnyDraft = session.aiTabs
			.filter((t) => aiTabIds.has(t.id))
			.some((tab) => hasDraft(tab));
		if (hasAnyDraft) {
			useModalStore.getState().openModal('confirm', {
				message: 'Some tabs have unsent drafts. Are you sure you want to close them?',
				onConfirm: performCloseTabsRight,
			});
		} else {
			performCloseTabsRight();
		}
	}, [performCloseTabsRight]);

	const handleCloseCurrentTab = useCallback((): CloseCurrentTabResult => {
		const { sessions, activeSessionId, setSessions } = useSessionStore.getState();
		const session = sessions.find((s) => s.id === activeSessionId);
		if (!session) return { type: 'none' };

		// Terminal tab is active - close it (unless it's the only tab of any type)
		if (session.inputMode === 'terminal' && session.activeTerminalTabId) {
			const tabId = session.activeTerminalTabId;
			// Allow closing terminal tabs as long as there are other tabs to fall back to.
			// closeTerminalTabHelper handles selecting the adjacent tab (which may be AI or file).
			const totalTabs =
				(session.aiTabs?.length || 0) +
				(session.filePreviewTabs?.length || 0) +
				(session.terminalTabs?.length || 0);
			if (totalTabs <= 1) {
				return { type: 'prevented' };
			}
			return { type: 'terminal', tabId };
		}

		// Check if a file tab is active
		if (session.activeFileTabId) {
			const tabId = session.activeFileTabId;
			setSessions((prev: Session[]) =>
				prev.map((s) => {
					if (s.id !== activeSessionId) return s;
					const result = closeFileTabHelper(s, tabId);
					if (!result) return s;
					return result.session;
				})
			);
			return { type: 'file', tabId };
		}

		// AI tab is active
		if (session.activeTabId) {
			const tabId = session.activeTabId;
			const tab = session.aiTabs.find((t) => t.id === tabId);
			const isWizardTab = tab ? hasActiveWizard(tab) : false;
			const tabHasDraft = tab ? hasDraft(tab) : false;

			return { type: 'ai', tabId, isWizardTab, hasDraft: tabHasDraft };
		}

		return { type: 'none' };
	}, []);

	return {
		performTabClose,
		handleTabClose,
		handleNewTab,
		handleCloseAllTabs,
		handleCloseOtherTabs,
		handleCloseTabsLeft,
		handleCloseTabsRight,
		handleCloseCurrentTab,
	};
}
