/**
 * Symphony Modal - State management hook
 *
 * Encapsulates all modal state, callbacks, and effects for the SymphonyModal.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { SymphonyIssue, RegisteredRepository } from '../../../shared/symphony-types';
import { useSymphony } from '../../hooks/symphony';
import { useContributorStats } from '../../hooks/symphony/useContributorStats';
import { useLayerStack } from '../../contexts/LayerStackContext';
import { MODAL_PRIORITIES } from '../../constants/modalPriorities';
import type { AgentCreationConfig } from '../AgentCreationDialog';
import type { SymphonyContributionData, ModalTab } from './helpers';

export function useSymphonyModal({
	isOpen,
	onClose,
	onStartContribution,
}: {
	isOpen: boolean;
	onClose: () => void;
	onStartContribution: (data: SymphonyContributionData) => void;
	onSelectSession: (sessionId: string) => void;
}) {
	const { registerLayer, unregisterLayer } = useLayerStack();
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;

	const symphony = useSymphony();
	const contributorStats = useContributorStats();

	// UI state
	const [activeTab, setActiveTab] = useState<ModalTab>('projects');
	const [selectedTileIndex, setSelectedTileIndex] = useState(0);
	const [showDetailView, setShowDetailView] = useState(false);
	const [selectedIssue, setSelectedIssue] = useState<SymphonyIssue | null>(null);
	const [documentPreview, setDocumentPreview] = useState<string | null>(null);
	const [isLoadingDocument, setIsLoadingDocument] = useState(false);
	const [isStarting, setIsStarting] = useState(false);
	const [showAgentDialog, setShowAgentDialog] = useState(false);
	const [showBuildWarning, setShowBuildWarning] = useState(false);
	const [ghCliStatus, setGhCliStatus] = useState<{
		installed: boolean;
		authenticated: boolean;
	} | null>(null);
	const [isCheckingGh, setIsCheckingGh] = useState(false);
	const [showHelp, setShowHelp] = useState(false);
	const [isCheckingPRStatuses, setIsCheckingPRStatuses] = useState(false);
	const [prStatusMessage, setPrStatusMessage] = useState<string | null>(null);
	const [syncingContributionId, setSyncingContributionId] = useState<string | null>(null);

	const searchInputRef = useRef<HTMLInputElement>(null);
	const tileGridRef = useRef<HTMLDivElement>(null);
	const helpButtonRef = useRef<HTMLButtonElement>(null);
	const showDetailViewRef = useRef(showDetailView);
	const showHelpRef = useRef(showHelp);
	showHelpRef.current = showHelp;
	showDetailViewRef.current = showDetailView;

	const handleCategoryChange = useCallback(
		(category: string) => {
			symphony.setSelectedCategory(category);
			setSelectedTileIndex(0);
		},
		[symphony.setSelectedCategory]
	);

	const handleSearchChange = useCallback(
		(value: string) => {
			symphony.setSearchQuery(value);
			setSelectedTileIndex(0);
		},
		[symphony.setSearchQuery]
	);

	// Back navigation
	const handleBack = useCallback(() => {
		setShowDetailView(false);
		symphony.selectRepository(null);
		setSelectedIssue(null);
		setDocumentPreview(null);
	}, [symphony.selectRepository]);

	const handleBackRef = useRef(handleBack);
	handleBackRef.current = handleBack;

	// Layer stack
	useEffect(() => {
		if (isOpen) {
			const id = registerLayer({
				type: 'modal',
				priority: MODAL_PRIORITIES.SYMPHONY ?? 710,
				blocksLowerLayers: true,
				capturesFocus: true,
				focusTrap: 'strict',
				ariaLabel: 'Maestro Symphony',
				onEscape: () => {
					if (showHelpRef.current) {
						setShowHelp(false);
					} else if (showDetailViewRef.current) {
						handleBackRef.current();
					} else {
						onCloseRef.current();
					}
				},
			});
			return () => unregisterLayer(id);
		}
	}, [isOpen, registerLayer, unregisterLayer]);

	// Focus tile grid for keyboard navigation (keyboard-first design)
	useEffect(() => {
		if (isOpen && activeTab === 'projects' && !showDetailView) {
			const timer = setTimeout(() => tileGridRef.current?.focus(), 50);
			return () => clearTimeout(timer);
		}
	}, [isOpen, activeTab, showDetailView]);

	// Select repo
	const handleSelectRepo = useCallback(
		async (repo: RegisteredRepository) => {
			await symphony.selectRepository(repo);
			setShowDetailView(true);
			setSelectedIssue(null);
			setDocumentPreview(null);
		},
		[symphony.selectRepository]
	);

	// Select issue
	const handleSelectIssue = useCallback(async (issue: SymphonyIssue) => {
		setSelectedIssue(issue);
		setDocumentPreview(null);
	}, []);

	// Preview document - fetches content from external URLs (GitHub attachments)
	const handlePreviewDocument = useCallback(
		async (path: string, isExternal: boolean) => {
			if (!symphony.selectedRepo) return;
			setIsLoadingDocument(true);
			setDocumentPreview(null);

			try {
				if (isExternal && path.startsWith('http')) {
					// Fetch content from external URL via main process (to avoid CORS)
					const result = await window.maestro.symphony.fetchDocumentContent(path);
					if (result.success && result.content) {
						setDocumentPreview(result.content);
					} else {
						setDocumentPreview(`*Failed to load document: ${result.error || 'Unknown error'}*`);
					}
				} else {
					// For repo-relative paths, we can't preview until contribution starts
					setDocumentPreview(
						`*This document is located at \`${path}\` in the repository and will be available when you start the contribution.*`
					);
				}
			} catch (error) {
				console.error('Failed to fetch document:', error);
				setDocumentPreview(
					`*Failed to load document: ${error instanceof Error ? error.message : 'Unknown error'}*`
				);
			} finally {
				setIsLoadingDocument(false);
			}
		},
		[symphony.selectedRepo]
	);

	// Start contribution - check gh CLI and show build warning
	const handleStartContribution = useCallback(() => {
		if (!symphony.selectedRepo || !selectedIssue) return;
		setGhCliStatus(null);
		setIsCheckingGh(true);
		setShowBuildWarning(true);
		window.maestro.git
			.checkGhCli()
			.then((status) => setGhCliStatus(status))
			.catch(() => setGhCliStatus({ installed: false, authenticated: false }))
			.finally(() => setIsCheckingGh(false));
	}, [symphony.selectedRepo, selectedIssue]);

	const handleBuildWarningConfirm = useCallback(() => {
		setShowBuildWarning(false);
		setShowAgentDialog(true);
	}, []);

	// Handle agent creation from dialog
	const handleCreateAgent = useCallback(
		async (config: AgentCreationConfig): Promise<{ success: boolean; error?: string }> => {
			if (!symphony.selectedRepo || !selectedIssue) {
				return { success: false, error: 'No repository or issue selected' };
			}

			setIsStarting(true);
			const result = await symphony.startContribution(
				config.repo,
				config.issue,
				config.agentType,
				'', // session ID will be generated by the backend
				config.workingDirectory // Pass the working directory for cloning
			);
			setIsStarting(false);

			if (result.success && result.contributionId) {
				// Close the agent dialog
				setShowAgentDialog(false);
				// Switch to Active tab
				setActiveTab('active');
				handleBack();
				// Notify parent with all data needed to create the session
				onStartContribution({
					contributionId: result.contributionId,
					localPath: config.workingDirectory,
					autoRunPath: result.autoRunPath,
					branchName: result.branchName,
					draftPrNumber: result.draftPrNumber,
					draftPrUrl: result.draftPrUrl,
					agentType: config.agentType,
					sessionName: config.sessionName,
					repo: config.repo,
					issue: config.issue,
					customPath: config.customPath,
					customArgs: config.customArgs,
					customEnvVars: config.customEnvVars,
				});
				return { success: true };
			}

			return { success: false, error: result.error ?? 'Failed to start contribution' };
		},
		[
			symphony.selectedRepo,
			selectedIssue,
			symphony.startContribution,
			onStartContribution,
			handleBack,
		]
	);

	// Contribution actions
	const handleFinalize = useCallback(
		async (contributionId: string) => {
			await symphony.finalizeContribution(contributionId);
		},
		[symphony.finalizeContribution]
	);

	// Sync individual contribution status with GitHub
	const handleSyncContribution = useCallback(async (contributionId: string) => {
		setSyncingContributionId(contributionId);
		try {
			const result = await window.maestro.symphony.syncContribution(contributionId);
			if (result.message) {
				setPrStatusMessage(result.message);
				setTimeout(() => setPrStatusMessage(null), 5000);
			}
		} catch (err) {
			console.error('Failed to sync contribution:', err);
			setPrStatusMessage('Sync failed');
			setTimeout(() => setPrStatusMessage(null), 5000);
		} finally {
			setSyncingContributionId(null);
		}
	}, []);

	// Check PR statuses (merged/closed) and update history
	const handleCheckPRStatuses = useCallback(async () => {
		setIsCheckingPRStatuses(true);
		setPrStatusMessage(null);
		try {
			const result = await window.maestro.symphony.checkPRStatuses();
			const messages: string[] = [];
			if ((result.merged ?? 0) > 0) {
				messages.push(`${result.merged} PR${(result.merged ?? 0) > 1 ? 's' : ''} merged`);
			}
			if ((result.closed ?? 0) > 0) {
				messages.push(`${result.closed} PR${(result.closed ?? 0) > 1 ? 's' : ''} closed`);
			}
			if (messages.length > 0) {
				setPrStatusMessage(messages.join(', '));
			} else if ((result.checked ?? 0) > 0) {
				setPrStatusMessage('All PRs up to date');
			} else {
				setPrStatusMessage('No PRs to check');
			}
			// Clear message after 5 seconds
			setTimeout(() => setPrStatusMessage(null), 5000);
		} catch (err) {
			console.error('Failed to check PR statuses:', err);
			setPrStatusMessage('Failed to check statuses');
			setTimeout(() => setPrStatusMessage(null), 5000);
		} finally {
			setIsCheckingPRStatuses(false);
		}
	}, []);

	// Tab cycling with Cmd+Shift+[ and Cmd+Shift+]
	const tabs: ModalTab[] = useMemo(() => ['projects', 'active', 'history', 'stats'], []);

	useEffect(() => {
		const handleTabCycle = (e: KeyboardEvent) => {
			// Cmd+Shift+[ or Cmd+Shift+] to cycle tabs
			if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === '[' || e.key === ']')) {
				e.preventDefault();
				e.stopPropagation();

				const currentIndex = tabs.indexOf(activeTab);
				let newIndex: number;

				if (e.key === '[') {
					// Go backwards, wrap around
					newIndex = currentIndex <= 0 ? tabs.length - 1 : currentIndex - 1;
				} else {
					// Go forwards, wrap around
					newIndex = currentIndex >= tabs.length - 1 ? 0 : currentIndex + 1;
				}

				setActiveTab(tabs[newIndex]);
			}
		};

		if (isOpen) {
			window.addEventListener('keydown', handleTabCycle);
			return () => window.removeEventListener('keydown', handleTabCycle);
		}
	}, [isOpen, activeTab, tabs]);

	// Keyboard navigation
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (activeTab !== 'projects' || showDetailView) return;

			// "/" to focus search (vim-style)
			if (e.key === '/' && !(e.target instanceof HTMLInputElement)) {
				e.preventDefault();
				searchInputRef.current?.focus();
				return;
			}

			// Escape from search returns focus to grid
			if (e.key === 'Escape' && e.target instanceof HTMLInputElement) {
				e.preventDefault();
				(e.target as HTMLInputElement).blur();
				tileGridRef.current?.focus();
				return;
			}

			const total = symphony.filteredRepositories.length;
			if (total === 0) return;
			if (e.target instanceof HTMLInputElement && !['ArrowDown', 'ArrowUp'].includes(e.key)) return;

			const gridColumns = 3;
			switch (e.key) {
				case 'ArrowRight':
					e.preventDefault();
					setSelectedTileIndex((i) => Math.min(total - 1, i + 1));
					break;
				case 'ArrowLeft':
					e.preventDefault();
					setSelectedTileIndex((i) => Math.max(0, i - 1));
					break;
				case 'ArrowDown':
					e.preventDefault();
					setSelectedTileIndex((i) => Math.min(total - 1, i + gridColumns));
					// If we're in the search box, move focus to grid
					if (e.target instanceof HTMLInputElement) {
						tileGridRef.current?.focus();
					}
					break;
				case 'ArrowUp':
					e.preventDefault();
					setSelectedTileIndex((i) => Math.max(0, i - gridColumns));
					break;
				case 'Enter': {
					e.preventDefault();
					const repo = symphony.filteredRepositories[selectedTileIndex];
					if (repo) {
						handleSelectRepo(repo);
					}
					break;
				}
			}
		};

		if (isOpen) {
			window.addEventListener('keydown', handleKeyDown);
			return () => window.removeEventListener('keydown', handleKeyDown);
		}
	}, [
		isOpen,
		activeTab,
		showDetailView,
		symphony.filteredRepositories,
		selectedTileIndex,
		handleSelectRepo,
	]);

	return {
		// Symphony data
		symphony,
		contributorStats,

		// UI state
		activeTab,
		setActiveTab,
		selectedTileIndex,
		showDetailView,
		selectedIssue,
		documentPreview,
		isLoadingDocument,
		isStarting,
		showAgentDialog,
		setShowAgentDialog,
		showBuildWarning,
		setShowBuildWarning,
		ghCliStatus,
		isCheckingGh,
		showHelp,
		setShowHelp,
		isCheckingPRStatuses,
		prStatusMessage,
		syncingContributionId,

		// Refs
		searchInputRef,
		tileGridRef,
		helpButtonRef,

		// Handlers
		handleCategoryChange,
		handleSearchChange,
		handleBack,
		handleSelectRepo,
		handleSelectIssue,
		handlePreviewDocument,
		handleStartContribution,
		handleBuildWarningConfirm,
		handleCreateAgent,
		handleFinalize,
		handleSyncContribution,
		handleCheckPRStatuses,
	};
}
