import { useCallback } from 'react';
import type { Session } from '../../types';
import type { ThinkingMode } from '../../../shared/types';
import { getActiveTab, getInitialRenameValue } from '../../utils/tabHelpers';
import { useSessionStore } from '../../stores/sessionStore';
import { useModalStore } from '../../stores/modalStore';

// ============================================================================
// Types
// ============================================================================

export interface TabPropertyHandlersReturn {
	handleRequestTabRename: (tabId: string) => void;
	handleTabReorder: (fromIndex: number, toIndex: number) => void;
	handleUpdateTabByClaudeSessionId: (
		agentSessionId: string,
		updates: { name?: string | null; starred?: boolean }
	) => void;
	handleTabStar: (tabId: string, starred: boolean) => void;
	handleTabMarkUnread: (tabId: string) => void;
	handleToggleTabReadOnlyMode: () => void;
	handleToggleTabSaveToHistory: () => void;
	handleToggleTabShowThinking: () => void;
}

// ============================================================================
// Hook
// ============================================================================

export function useTabPropertyHandlers(): TabPropertyHandlersReturn {
	const handleRequestTabRename = useCallback((tabId: string) => {
		console.log('[DEBUG renameTab] handleRequestTabRename called', { tabId });
		const { sessions, activeSessionId, setSessions } = useSessionStore.getState();
		const session = sessions.find((s) => s.id === activeSessionId);
		if (!session) {
			console.log('[DEBUG renameTab] no session found');
			return;
		}
		const tab = session.aiTabs?.find((t) => t.id === tabId);
		console.log('[DEBUG renameTab] tab found:', !!tab, {
			aiTabCount: session.aiTabs?.length,
			tabId,
		});
		if (tab) {
			if (tab.isGeneratingName) {
				setSessions((prev: Session[]) =>
					prev.map((s) => {
						if (s.id !== activeSessionId) return s;
						return {
							...s,
							aiTabs: s.aiTabs.map((t) => (t.id === tabId ? { ...t, isGeneratingName: false } : t)),
						};
					})
				);
			}
			useModalStore.getState().openModal('renameTab', {
				tabId,
				initialName: getInitialRenameValue(tab),
			});
		}
	}, []);

	const handleTabReorder = useCallback((fromIndex: number, toIndex: number) => {
		const { setSessions, activeSessionId } = useSessionStore.getState();
		setSessions((prev: Session[]) =>
			prev.map((s) => {
				if (s.id !== activeSessionId || !s.aiTabs) return s;
				const tabs = [...s.aiTabs];
				const [movedTab] = tabs.splice(fromIndex, 1);
				tabs.splice(toIndex, 0, movedTab);
				return { ...s, aiTabs: tabs };
			})
		);
	}, []);

	const handleUpdateTabByClaudeSessionId = useCallback(
		(agentSessionId: string, updates: { name?: string | null; starred?: boolean }) => {
			const { setSessions, activeSessionId } = useSessionStore.getState();
			setSessions((prev: Session[]) =>
				prev.map((s) => {
					if (s.id !== activeSessionId) return s;
					const tabIndex = s.aiTabs.findIndex((tab) => tab.agentSessionId === agentSessionId);
					if (tabIndex === -1) return s;
					return {
						...s,
						aiTabs: s.aiTabs.map((tab) =>
							tab.agentSessionId === agentSessionId
								? {
										...tab,
										...(updates.name !== undefined ? { name: updates.name } : {}),
										...(updates.starred !== undefined ? { starred: updates.starred } : {}),
									}
								: tab
						),
					};
				})
			);
		},
		[]
	);

	const handleTabStar = useCallback((tabId: string, starred: boolean) => {
		const { sessions, activeSessionId, setSessions } = useSessionStore.getState();
		const session = sessions.find((s) => s.id === activeSessionId);
		if (!session) return;
		const tabToStar = session.aiTabs.find((t) => t.id === tabId);
		if (!tabToStar?.agentSessionId) return;

		setSessions((prev: Session[]) =>
			prev.map((s) => {
				if (s.id !== activeSessionId) return s;
				const tab = s.aiTabs.find((t) => t.id === tabId);
				if (tab?.agentSessionId) {
					const agentId = s.toolType || 'claude-code';
					if (agentId === 'claude-code') {
						window.maestro.claude
							.updateSessionStarred(s.projectRoot, tab.agentSessionId, starred)
							.catch((err) => console.error('Failed to persist tab starred:', err));
					} else {
						window.maestro.agentSessions
							.setSessionStarred(agentId, s.projectRoot, tab.agentSessionId, starred)
							.catch((err) => console.error('Failed to persist tab starred:', err));
					}
				}
				return {
					...s,
					aiTabs: s.aiTabs.map((t) => (t.id === tabId ? { ...t, starred } : t)),
				};
			})
		);
	}, []);

	const handleTabMarkUnread = useCallback((tabId: string) => {
		const { setSessions, activeSessionId } = useSessionStore.getState();
		setSessions((prev: Session[]) =>
			prev.map((s) => {
				if (s.id !== activeSessionId) return s;
				return {
					...s,
					aiTabs: s.aiTabs.map((t) => (t.id === tabId ? { ...t, hasUnread: true } : t)),
				};
			})
		);
	}, []);

	const handleToggleTabReadOnlyMode = useCallback(() => {
		const { sessions, activeSessionId, setSessions } = useSessionStore.getState();
		const session = sessions.find((s) => s.id === activeSessionId);
		if (!session) return;
		const currentActiveTab = getActiveTab(session);
		if (!currentActiveTab) return;
		setSessions((prev: Session[]) =>
			prev.map((s) => {
				if (s.id !== activeSessionId) return s;
				return {
					...s,
					aiTabs: s.aiTabs.map((tab) =>
						tab.id === currentActiveTab.id ? { ...tab, readOnlyMode: !tab.readOnlyMode } : tab
					),
				};
			})
		);
	}, []);

	const handleToggleTabSaveToHistory = useCallback(() => {
		const { sessions, activeSessionId, setSessions } = useSessionStore.getState();
		const session = sessions.find((s) => s.id === activeSessionId);
		if (!session) return;
		const currentActiveTab = getActiveTab(session);
		if (!currentActiveTab) return;
		setSessions((prev: Session[]) =>
			prev.map((s) => {
				if (s.id !== activeSessionId) return s;
				return {
					...s,
					aiTabs: s.aiTabs.map((tab) =>
						tab.id === currentActiveTab.id ? { ...tab, saveToHistory: !tab.saveToHistory } : tab
					),
				};
			})
		);
	}, []);

	const handleToggleTabShowThinking = useCallback(() => {
		const { sessions, activeSessionId, setSessions } = useSessionStore.getState();
		const session = sessions.find((s) => s.id === activeSessionId);
		if (!session) return;
		const currentActiveTab = getActiveTab(session);
		if (!currentActiveTab) return;

		const cycleThinkingMode = (current: ThinkingMode | undefined): ThinkingMode => {
			if (!current || current === 'off') return 'on';
			if (current === 'on') return 'sticky';
			return 'off';
		};

		setSessions((prev: Session[]) =>
			prev.map((s) => {
				if (s.id !== activeSessionId) return s;
				return {
					...s,
					aiTabs: s.aiTabs.map((tab) => {
						if (tab.id !== currentActiveTab.id) return tab;
						const newMode = cycleThinkingMode(tab.showThinking);
						if (newMode === 'off') {
							return {
								...tab,
								showThinking: 'off',
								logs: tab.logs.filter((l) => l.source !== 'thinking' && l.source !== 'tool'),
							};
						}
						return { ...tab, showThinking: newMode };
					}),
				};
			})
		);
	}, []);

	return {
		handleRequestTabRename,
		handleTabReorder,
		handleUpdateTabByClaudeSessionId,
		handleTabStar,
		handleTabMarkUnread,
		handleToggleTabReadOnlyMode,
		handleToggleTabSaveToHistory,
		handleToggleTabShowThinking,
	};
}
