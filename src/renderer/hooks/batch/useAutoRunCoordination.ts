/**
 * useAutoRunCoordination - extracted from App.tsx (Phase 13A, Task 6)
 *
 * Coordinates all Auto Run / batch processing concerns that were inline in App.tsx:
 *   - batchStore state reads (documentList, documentTree)
 *   - useAutoRunHandlers (folder selection, document CRUD, batch start)
 *   - useAutoRunAchievements (progress tracking, peak stats)
 *   - useAutoRunDocumentLoader (list, tree, task counts, file watching)
 *   - handleSetActiveRightTab (auto-run setup modal gating)
 *   - handleMarketplaceImportComplete (refresh docs on import)
 *   - handleSaveBatchPrompt (persist batch prompt to session)
 *
 * Self-sources from: sessionStore, batchStore, modalStore, uiStore
 */

import { useCallback } from 'react';
import type { BatchRunConfig, RightPanelTab, Session } from '../../types';
import { useSessionStore, selectActiveSession } from '../../stores/sessionStore';
import { useBatchStore } from '../../stores/batchStore';
import { getModalActions } from '../../stores/modalStore';
import { useUIStore } from '../../stores/uiStore';
import { notifyToast } from '../../stores/notificationStore';
import { useAutoRunHandlers } from './useAutoRunHandlers';
import type { UseAutoRunHandlersReturn, AutoRunTreeNode } from './useAutoRunHandlers';
import { useAutoRunAchievements } from './useAutoRunAchievements';
import { useAutoRunDocumentLoader } from './useAutoRunDocumentLoader';

// ============================================================================
// Dependencies interface
// ============================================================================

export interface UseAutoRunCoordinationDeps {
	/** Start a batch run (from useBatchHandlers) */
	startBatchRun: (sessionId: string, config: BatchRunConfig, folderPath: string) => void;
	/** IDs of sessions with active batch runs (from useBatchHandlers) */
	activeBatchSessionIds: string[];
	/** Ref for circular dep resolution with useWizardHandlers */
	handleAutoRunRefreshRef: React.MutableRefObject<(() => void) | null>;
}

// ============================================================================
// Return type
// ============================================================================

export interface UseAutoRunCoordinationReturn extends UseAutoRunHandlersReturn {
	/** Auto Run document list from batchStore */
	autoRunDocumentList: string[];
	/** Auto Run document tree from batchStore */
	autoRunDocumentTree: AutoRunTreeNode[];
	/** Tab switcher that gates auto-run tab on folder config */
	handleSetActiveRightTab: (tab: RightPanelTab) => void;
	/** Refresh docs and show toast on marketplace import */
	handleMarketplaceImportComplete: (folderName: string) => Promise<void>;
	/** Save custom batch prompt to session */
	handleSaveBatchPrompt: (prompt: string) => void;
}

// ============================================================================
// Hook implementation
// ============================================================================

export function useAutoRunCoordination(
	deps: UseAutoRunCoordinationDeps
): UseAutoRunCoordinationReturn {
	const { startBatchRun, activeBatchSessionIds, handleAutoRunRefreshRef } = deps;

	// --- Reactive subscriptions ---
	const activeSession = useSessionStore(selectActiveSession);
	const autoRunDocumentList = useBatchStore((s) => s.documentList);
	const autoRunDocumentTree = useBatchStore((s) => s.documentTree);

	// --- Store actions (stable via getState) ---
	const { setSessions } = useSessionStore.getState();
	const {
		setDocumentList: setAutoRunDocumentList,
		setDocumentTree: setAutoRunDocumentTree,
		setIsLoadingDocuments: setAutoRunIsLoadingDocuments,
	} = useBatchStore.getState();

	const { setAutoRunSetupModalOpen, setBatchRunnerModalOpen } = getModalActions();

	const { setActiveRightTab, setRightPanelOpen, setActiveFocus, setSuccessFlashNotification } =
		useUIStore.getState();

	// --- Auto Run handlers (folder, documents, batch start) ---
	const autoRunHandlers = useAutoRunHandlers(activeSession, {
		setSessions,
		setAutoRunDocumentList,
		setAutoRunDocumentTree,
		setAutoRunIsLoadingDocuments,
		setAutoRunSetupModalOpen,
		setBatchRunnerModalOpen,
		setActiveRightTab,
		setRightPanelOpen,
		setActiveFocus,
		setSuccessFlashNotification,
		autoRunDocumentList,
		startBatchRun,
	});

	// Wire up ref for circular dep resolution with useWizardHandlers
	handleAutoRunRefreshRef.current = autoRunHandlers.handleAutoRunRefresh;

	// --- Auto Run achievements (progress intervals, peak stats) ---
	useAutoRunAchievements({ activeBatchSessionIds });

	// --- Auto Run document loader (list, tree, task counts, file watching) ---
	useAutoRunDocumentLoader();

	// --- Tab switcher with auto-run setup modal gating ---
	const handleSetActiveRightTab = useCallback(
		(tab: RightPanelTab) => {
			if (tab === 'autorun' && activeSession && !activeSession.autoRunFolderPath) {
				// No folder configured - show setup modal
				setAutoRunSetupModalOpen(true);
			}
			// Always switch to the tab
			setActiveRightTab(tab);
		},
		[activeSession]
	);

	// --- Marketplace import completion handler ---
	const handleMarketplaceImportComplete = useCallback(
		async (folderName: string) => {
			// Refresh the Auto Run document list to show newly imported documents
			if (activeSession?.autoRunFolderPath) {
				autoRunHandlers.handleAutoRunRefresh();
			}
			notifyToast({
				type: 'success',
				title: 'Playbook Imported',
				message: `Successfully imported playbook to ${folderName}`,
			});
		},
		[activeSession?.autoRunFolderPath, autoRunHandlers.handleAutoRunRefresh]
	);

	// --- Save batch prompt to session ---
	const handleSaveBatchPrompt = useCallback(
		(prompt: string) => {
			if (!activeSession) return;
			// Save the custom prompt and modification timestamp to the session (persisted across restarts)
			setSessions((prev: Session[]) =>
				prev.map((s) =>
					s.id === activeSession.id
						? {
								...s,
								batchRunnerPrompt: prompt,
								batchRunnerPromptModifiedAt: Date.now(),
							}
						: s
				)
			);
		},
		[activeSession]
	);

	return {
		// batchStore state
		autoRunDocumentList,
		autoRunDocumentTree,
		// useAutoRunHandlers pass-through
		...autoRunHandlers,
		// Coordination callbacks
		handleSetActiveRightTab,
		handleMarketplaceImportComplete,
		handleSaveBatchPrompt,
	};
}
