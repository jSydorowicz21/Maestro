/**
 * useAutoSendOnActivate - extracted from App.tsx (Phase 13A, Task 9)
 *
 * Handles automatic sending of transferred context when a tab has
 * the autoSendOnActivate flag set (used by context transfer).
 *
 * Reads from: sessionStore
 */

import { useEffect } from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import { getActiveTab } from '../../utils/tabHelpers';
import type { Session } from '../../types';

export interface UseAutoSendOnActivateDeps {
	activeSession: Session | undefined;
	activeSessionIdRef: React.MutableRefObject<string>;
	processInput: () => void;
}

export function useAutoSendOnActivate(deps: UseAutoSendOnActivateDeps): void {
	const { activeSession, activeSessionIdRef, processInput } = deps;

	useEffect(() => {
		if (!activeSession) return;

		const activeTab = getActiveTab(activeSession);
		if (!activeTab?.autoSendOnActivate) return;

		// Capture intended targets so we can verify they haven't changed after the delay
		const targetSessionId = activeSession.id;
		const targetTabId = activeTab.id;

		// Clear the flag first to prevent multiple sends
		useSessionStore.getState().setSessions((prev) =>
			prev.map((s) =>
				s.id !== targetSessionId
					? s
					: {
							...s,
							aiTabs: s.aiTabs.map((tab) =>
								tab.id !== targetTabId ? tab : { ...tab, autoSendOnActivate: false }
							),
						}
			)
		);

		// Trigger the send after a short delay to ensure state is settled
		// The inputValue and pendingMergedContext are already set on the tab
		const timeoutId = setTimeout(() => {
			// Verify the active session/tab still match the originally intended targets
			const currentSessions = useSessionStore.getState().sessions;
			const currentSession = currentSessions.find((s) => s.id === targetSessionId);
			if (!currentSession) return;
			const currentTab = getActiveTab(currentSession);
			if (currentSession.id !== activeSessionIdRef.current || currentTab?.id !== targetTabId)
				return;

			processInput();
		}, 100);

		return () => clearTimeout(timeoutId);
	}, [activeSession?.id, activeSession?.activeTabId]);
}
