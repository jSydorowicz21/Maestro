import { useCallback, useRef } from 'react';
import type {
	Session,
	SessionState,
	LogEntry,
	QueuedItem,
	CustomAICommand,
	BatchRunState,
} from '../../types';
import { getActiveTab, extractQuickTabName } from '../../utils/tabHelpers';
import { generateId } from '../../utils/ids';
import { hasCapabilityCached } from '../agent/useAgentCapabilities';
import { gitService } from '../../services/git';
import { imageOnlyDefaultPrompt } from '../../../prompts';
import { useSettingsStore } from '../../stores/settingsStore';
import { processSlashCommand } from './processSlashCommand';
import { resolveTerminalCwd } from './resolveTerminalCwd';
import { spawnBatchAgent } from './spawnBatchAgent';

/**
 * Default prompt used when user sends only an image without text.
 */
export const DEFAULT_IMAGE_ONLY_PROMPT = imageOnlyDefaultPrompt;

/**
 * Dependencies for the useInputProcessing hook.
 */
export interface UseInputProcessingDeps {
	/** Current active session (null if none selected) */
	activeSession: Session | null;
	/** Active session ID (may be different from activeSession.id during transitions) */
	activeSessionId: string;
	/** Session state setter */
	setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
	/** Current input value */
	inputValue: string;
	/** Input value setter */
	setInputValue: (value: string) => void;
	/** Staged images for the current message */
	stagedImages: string[];
	/** Staged images setter */
	setStagedImages: (images: string[] | ((prev: string[]) => string[])) => void;
	/** Reference to the input textarea element */
	inputRef: React.RefObject<HTMLTextAreaElement | null>;
	/** Custom AI commands configured by the user */
	customAICommands: CustomAICommand[];
	/** Slash command menu open state setter */
	setSlashCommandOpen: (open: boolean) => void;
	/** Sync AI input value to session state (for persistence) */
	syncAiInputToSession: (value: string) => void;
	/** Sync terminal input value to session state (for persistence) */
	syncTerminalInputToSession: (value: string) => void;
	/** Whether the active session is in AI mode */
	isAiMode: boolean;
	/** Reference to sessions array (for avoiding stale closures) */
	sessionsRef: React.MutableRefObject<Session[]>;
	/** Get batch state for a session */
	getBatchState: (sessionId: string) => BatchState;
	/** Active batch run state (may differ from session's batch state) */
	activeBatchRunState: BatchState;
	/** Ref to processQueuedItem function (defined later in component, accessed via ref to avoid stale closure) */
	processQueuedItemRef: React.MutableRefObject<
		((sessionId: string, item: QueuedItem) => Promise<void>) | null
	>;
	/** Flush any pending batched session updates (ensures AI output is flushed before user message appears) */
	flushBatchedUpdates?: () => void;
	/** Handler for the /history built-in command (requests synopsis and saves to history) */
	onHistoryCommand?: () => Promise<void>;
	/** Handler for the /wizard built-in command (starts the inline wizard for Auto Run documents) */
	onWizardCommand?: (args: string) => void;
	/** Handler for sending messages to the wizard (when wizard is active) */
	onWizardSendMessage?: (content: string, images?: string[]) => Promise<void>;
	/** Whether the wizard is currently active for the active tab */
	isWizardActive?: boolean;
	/** Handler for the /skills built-in command (lists Claude Code skills) */
	onSkillsCommand?: () => Promise<void>;
	/** Whether automatic tab naming is enabled */
	automaticTabNamingEnabled?: boolean;
	/** Conductor profile (user's About Me from settings) */
	conductorProfile?: string;
}

/**
 * @deprecated Use BatchRunState from '../types' directly. This alias is kept for backwards compatibility.
 */
export type BatchState = BatchRunState;

/**
 * Return type for useInputProcessing hook.
 */
export interface UseInputProcessingReturn {
	/** Process the current input (send message or execute command) */
	processInput: (
		overrideInputValue?: string,
		options?: { forceParallel?: boolean }
	) => Promise<void>;
	/** Ref to processInput for use in callbacks that need latest version */
	processInputRef: React.MutableRefObject<
		((overrideInputValue?: string, options?: { forceParallel?: boolean }) => Promise<void>) | null
	>;
}

/**
 * Hook for processing user input (messages and commands).
 *
 * Handles:
 * - Slash command detection and execution (custom AI commands)
 * - Message queuing when AI is busy
 * - Terminal mode cd command tracking
 * - Process spawning for batch mode (Claude Code)
 * - Broadcasting input to web clients
 *
 * @param deps - Hook dependencies
 * @returns Input processing function and ref
 */
export function useInputProcessing(deps: UseInputProcessingDeps): UseInputProcessingReturn {
	const {
		activeSession,
		activeSessionId,
		setSessions,
		inputValue,
		setInputValue,
		stagedImages,
		setStagedImages,
		inputRef,
		customAICommands,
		setSlashCommandOpen,
		syncAiInputToSession,
		syncTerminalInputToSession,
		isAiMode,
		sessionsRef,
		getBatchState,
		// Note: activeBatchRunState is in deps interface but not used - kept for API compatibility
		processQueuedItemRef,
		flushBatchedUpdates,
		onHistoryCommand,
		onWizardCommand,
		onWizardSendMessage,
		isWizardActive,
		onSkillsCommand,
		automaticTabNamingEnabled,
		conductorProfile,
	} = deps;

	// Ref for the processInput function so external code can access the latest version
	const processInputRef = useRef<
		((overrideInputValue?: string, options?: { forceParallel?: boolean }) => Promise<void>) | null
	>(null);

	/**
	 * Process user input - handles slash commands, queuing, and message sending.
	 */
	const processInput = useCallback(
		async (overrideInputValue?: string, options?: { forceParallel?: boolean }) => {
			// Flush any pending batched updates before processing user input
			flushBatchedUpdates?.();

			const effectiveInputValue = overrideInputValue ?? inputValue;
			if (options?.forceParallel) {
				console.log('[ForcedParallel] processInput called:', {
					hasActiveSession: !!activeSession,
					inputValue: effectiveInputValue.substring(0, 50),
					inputMode: activeSession?.inputMode,
					sessionState: activeSession?.state,
				});
			}
			if (!activeSession || (!effectiveInputValue.trim() && stagedImages.length === 0)) {
				if (options?.forceParallel) {
					console.log('[ForcedParallel] Early return: no session or empty input');
				}
				return;
			}

			// Handle slash commands
			if (effectiveInputValue.trim().startsWith('/')) {
				const result = processSlashCommand({
					activeSession,
					activeSessionId,
					commandText: effectiveInputValue.trim(),
					setSessions,
					setInputValue,
					setSlashCommandOpen,
					syncAiInputToSession,
					inputRef,
					customAICommands,
					getBatchState,
					processQueuedItemRef,
					onHistoryCommand,
					onWizardCommand,
					onSkillsCommand,
					conductorProfile,
				});
				if (result === 'handled') return;
			}

			const currentMode = activeSession.inputMode;

			// Handle wizard mode - route messages to wizard sendMessage instead of normal AI processing
			if (currentMode === 'ai' && isWizardActive && onWizardSendMessage) {
				if (
					effectiveInputValue.trim().startsWith('/') &&
					!effectiveInputValue.trim().startsWith('/wizard')
				) {
					console.log(
						'[processInput] Ignoring slash command in wizard mode:',
						effectiveInputValue.trim()
					);
					return;
				}

				const imagesToSend = stagedImages.length > 0 ? [...stagedImages] : undefined;
				setInputValue('');
				setStagedImages([]);
				syncAiInputToSession('');
				if (inputRef.current) inputRef.current.style.height = 'auto';

				onWizardSendMessage(effectiveInputValue, imagesToSend).catch((error) => {
					console.error('[processInput] Wizard message failed:', error);
				});
				return;
			}

			// Queue messages when AI is busy (only in AI mode)
			if (currentMode === 'ai') {
				const activeTab = getActiveTab(activeSession);
				const isReadOnlyMode = activeTab?.readOnlyMode === true;

				const canWriteBypassQueue = (): boolean => {
					if (isReadOnlyMode) return false;
					if (activeSession.state !== 'busy') return false;
					const busyTabs = activeSession.aiTabs.filter((tab) => tab.state === 'busy');
					const allBusyTabsReadOnly = busyTabs.every((tab) => tab.readOnlyMode === true);
					if (!allBusyTabsReadOnly) return false;
					const allQueuedReadOnly = activeSession.executionQueue.every(
						(item) => item.readOnlyMode === true
					);
					if (!allQueuedReadOnly) return false;
					return true;
				};

				const isAutoRunActive = getBatchState(activeSession.id).isRunning;
				const forceParallel =
					options?.forceParallel === true && useSettingsStore.getState().forcedParallelExecution;

				const shouldQueue = forceParallel
					? false
					: isReadOnlyMode
						? activeTab?.state === 'busy'
						: (activeSession.state === 'busy' && !canWriteBypassQueue()) || isAutoRunActive;

				console.log('[processInput] Queue decision:', {
					sessionId: activeSession.id.substring(0, 8),
					sessionState: activeSession.state,
					tabState: activeTab?.state,
					isReadOnlyMode,
					isAutoRunActive,
					forceParallel,
					shouldQueue,
					queueLength: activeSession.executionQueue.length,
				});

				if (shouldQueue) {
					const queuedItem: QueuedItem = {
						id: generateId(),
						timestamp: Date.now(),
						tabId: activeTab?.id || activeSession.activeTabId,
						type: 'message',
						text: effectiveInputValue,
						images: [...stagedImages],
						tabName:
							activeTab?.name ||
							(activeTab?.agentSessionId
								? activeTab.agentSessionId.split('-')[0].toUpperCase()
								: 'New'),
						readOnlyMode: isReadOnlyMode,
					};

					setSessions((prev) =>
						prev.map((s) => {
							if (s.id !== activeSessionId) return s;
							return {
								...s,
								executionQueue: [...s.executionQueue, queuedItem],
							};
						})
					);

					setInputValue('');
					setStagedImages([]);
					syncAiInputToSession('');
					if (inputRef.current) inputRef.current.style.height = 'auto';
					return;
				}
			}

			// Check if we're in read-only mode for the log entry
			const activeTabForEntry = currentMode === 'ai' ? getActiveTab(activeSession) : null;
			const currentBatchState = getBatchState(activeSession.id);
			const isAutoRunReadOnly = currentBatchState.isRunning && !currentBatchState.worktreeActive;
			const isReadOnlyEntry = activeTabForEntry?.readOnlyMode === true || isAutoRunReadOnly;

			const isForceParallelEntry =
				options?.forceParallel === true && useSettingsStore.getState().forcedParallelExecution;

			const newEntry: LogEntry = {
				id: generateId(),
				timestamp: Date.now(),
				source: 'user',
				text: effectiveInputValue,
				images: [...stagedImages],
				...(isReadOnlyEntry && { readOnly: true }),
				...(isForceParallelEntry && { forceParallel: true }),
			};

			// Track shell CWD changes when in terminal mode
			let newShellCwd = activeSession.shellCwd || activeSession.cwd;
			let newRemoteCwd = activeSession.remoteCwd;
			let cwdChanged = false;
			let remoteCwdChanged = false;
			if (currentMode === 'terminal') {
				const cwdResult = await resolveTerminalCwd(activeSession, effectiveInputValue.trim());
				newShellCwd = cwdResult.newShellCwd;
				newRemoteCwd = cwdResult.newRemoteCwd;
				cwdChanged = cwdResult.cwdChanged;
				remoteCwdChanged = cwdResult.remoteCwdChanged;
			}

			setSessions((prev) =>
				prev.map((s) => {
					if (s.id !== activeSessionId) return s;

					// Add command to history (separate histories for AI and terminal modes)
					const historyKey = currentMode === 'ai' ? 'aiCommandHistory' : 'shellCommandHistory';
					const currentHistory =
						currentMode === 'ai' ? s.aiCommandHistory || [] : s.shellCommandHistory || [];
					const newHistory = [...currentHistory];
					if (
						effectiveInputValue.trim() &&
						(newHistory.length === 0 ||
							newHistory[newHistory.length - 1] !== effectiveInputValue.trim())
					) {
						newHistory.push(effectiveInputValue.trim());
					}

					// For terminal mode (legacy), add to shellLogs
					if (currentMode !== 'ai') {
						return {
							...s,
							// TODO: Remove shellLogs once terminal tabs migration is complete
							...(!s.terminalTabs?.length && { shellLogs: [...s.shellLogs, newEntry] }),
							state: 'busy',
							busySource: currentMode,
							shellCwd: newShellCwd,
							...(remoteCwdChanged && newRemoteCwd && { remoteCwd: newRemoteCwd }),
							[historyKey]: newHistory,
						};
					}

					// For AI mode, add to ACTIVE TAB's logs
					const activeTab = getActiveTab(s);
					if (!activeTab) {
						console.error(
							'[processInput] No active tab found - session has no aiTabs, this should not happen'
						);
						return s;
					}

					const isNewSession = !activeTab.agentSessionId;
					const updatedAiTabs = s.aiTabs.map((tab) =>
						tab.id === activeTab.id
							? {
									...tab,
									logs: [...tab.logs, newEntry],
									state: 'busy' as const,
									thinkingStartTime: Date.now(),
									awaitingSessionId: isNewSession ? true : tab.awaitingSessionId,
								}
							: tab
					);

					return {
						...s,
						state: 'busy',
						busySource: currentMode,
						thinkingStartTime: Date.now(),
						currentCycleTokens: 0,
						shellCwd: newShellCwd,
						[historyKey]: newHistory,
						aiTabs: updatedAiTabs,
					};
				})
			);

			// Trigger automatic tab naming for new AI sessions
			const activeTabForNaming = getActiveTab(activeSession);
			const isNewAiSession =
				currentMode === 'ai' && activeTabForNaming && !activeTabForNaming.agentSessionId;
			const hasTextMessage = effectiveInputValue.trim().length > 0;
			const hasNoCustomName = !activeTabForNaming?.name;

			if (automaticTabNamingEnabled && isNewAiSession && hasTextMessage && hasNoCustomName) {
				triggerAutoTabNaming(
					activeTabForNaming,
					activeSessionId,
					activeSession,
					effectiveInputValue,
					setSessions
				);
			}

			// If directory changed, check if new directory is a Git repository
			if (cwdChanged || remoteCwdChanged) {
				(async () => {
					const cwdToCheck = remoteCwdChanged && newRemoteCwd ? newRemoteCwd : newShellCwd;
					const sshIdForGit =
						activeSession.sshRemoteId ||
						activeSession.sessionSshRemoteConfig?.remoteId ||
						undefined;
					const isGitRepo = await gitService.isRepo(cwdToCheck, sshIdForGit);
					setSessions((prev) =>
						prev.map((s) => (s.id === activeSessionId ? { ...s, isGitRepo } : s))
					);
				})();
			}

			// Capture input value and images before clearing
			const nudgeMessage = activeSession.nudgeMessage;
			const capturedInputValue =
				nudgeMessage && currentMode === 'ai'
					? `${effectiveInputValue}\n\n---\n\n${nudgeMessage}`
					: effectiveInputValue;
			const capturedImages = [...stagedImages];

			// Broadcast user input to web clients
			window.maestro.web.broadcastUserInput(activeSession.id, effectiveInputValue, currentMode);

			setInputValue('');
			setStagedImages([]);

			if (isAiMode) {
				syncAiInputToSession('');
			} else {
				syncTerminalInputToSession('');
			}

			if (inputRef.current) inputRef.current.style.height = 'auto';

			// Write to the appropriate process based on inputMode
			const targetPid = currentMode === 'ai' ? activeSession.aiPid : activeSession.terminalPid;
			const activeTabForSpawn = getActiveTab(activeSession);
			const isForceParallel =
				options?.forceParallel === true && useSettingsStore.getState().forcedParallelExecution;
			const forceParallelSuffix = isForceParallel ? `-fp-${Date.now()}` : '';
			const targetSessionId =
				currentMode === 'ai'
					? `${activeSession.id}-ai-${activeTabForSpawn?.id || 'default'}${forceParallelSuffix}`
					: `${activeSession.id}-terminal`;

			const isBatchModeAgent =
				currentMode === 'ai' && hasCapabilityCached(activeSession.toolType, 'supportsBatchMode');

			if (isForceParallel) {
				console.log('[ForcedParallel] Reached spawn path:', {
					targetSessionId,
					isBatchModeAgent,
					toolType: activeSession.toolType,
				});
			}

			if (isBatchModeAgent) {
				spawnBatchAgent({
					activeSession,
					activeSessionId,
					targetSessionId,
					capturedInputValue,
					capturedImages,
					setSessions,
					sessionsRef,
					getBatchState,
					conductorProfile,
				});
			} else if (currentMode === 'terminal') {
				// Intercept "clear" command to clear shell logs
				const trimmedCommand = capturedInputValue.trim();
				if (trimmedCommand === 'clear') {
					setSessions((prev) =>
						prev.map((s) => {
							if (s.id !== activeSessionId) return s;
							return {
								...s,
								state: 'idle',
								busySource: undefined,
								thinkingStartTime: undefined,
								shellLogs: [],
							};
						})
					);
					return;
				}

				// Terminal mode: Use runCommand for clean stdout/stderr capture
				const isRemote =
					!!activeSession.sshRemoteId || !!activeSession.sessionSshRemoteConfig?.enabled;
				const commandCwd = isRemote
					? activeSession.remoteCwd ||
						activeSession.sessionSshRemoteConfig?.workingDirOverride ||
						activeSession.cwd
					: activeSession.shellCwd || activeSession.cwd;
				window.maestro.process
					.runCommand({
						sessionId: activeSession.id,
						command: capturedInputValue,
						cwd: commandCwd,
						sessionSshRemoteConfig: activeSession.sessionSshRemoteConfig,
					})
					.catch((error) => {
						console.error('Failed to run command:', error);
						setSessions((prev) =>
							prev.map((s) => {
								if (s.id !== activeSessionId) return s;
								return {
									...s,
									state: 'idle',
									busySource: undefined,
									thinkingStartTime: undefined,
									...(!s.terminalTabs?.length && {
										shellLogs: [
											...s.shellLogs,
											{
												id: generateId(),
												timestamp: Date.now(),
												source: 'system',
												text: `Error: Failed to run command - ${(error as Error).message}`,
											},
										],
									}),
								};
							})
						);
					});
			} else if (targetPid > 0) {
				// AI mode: Write to stdin
				window.maestro.process.write(targetSessionId, capturedInputValue).catch((error) => {
					console.error('Failed to write to process:', error);
					const errorLog: LogEntry = {
						id: generateId(),
						timestamp: Date.now(),
						source: 'system',
						text: `Error: Failed to write to process - ${(error as Error).message}`,
					};
					setSessions((prev) =>
						prev.map((s) => {
							if (s.id !== activeSessionId) return s;
							const updatedAiTabs =
								s.aiTabs?.length > 0
									? s.aiTabs.map((tab) =>
											tab.id === s.activeTabId
												? {
														...tab,
														state: 'idle' as const,
														thinkingStartTime: undefined,
														logs: [...tab.logs, errorLog],
													}
												: tab
										)
									: s.aiTabs;
							return {
								...s,
								state: 'idle',
								busySource: undefined,
								thinkingStartTime: undefined,
								aiTabs: updatedAiTabs,
							};
						})
					);
				});
			}
		},
		[
			activeSession,
			activeSessionId,
			inputValue,
			stagedImages,
			customAICommands,
			setInputValue,
			setStagedImages,
			setSlashCommandOpen,
			syncAiInputToSession,
			syncTerminalInputToSession,
			isAiMode,
			inputRef,
			sessionsRef,
			getBatchState,
			processQueuedItemRef,
			setSessions,
			flushBatchedUpdates,
			onHistoryCommand,
			onWizardCommand,
		]
	);

	// Update ref for external access
	processInputRef.current = processInput;

	return {
		processInput,
		processInputRef,
	};
}

// ============================================================================
// Auto Tab Naming (extracted for readability)
// ============================================================================

import type { AITab } from '../../types';

function triggerAutoTabNaming(
	activeTabForNaming: AITab,
	activeSessionId: string,
	activeSession: Session,
	effectiveInputValue: string,
	setSessions: React.Dispatch<React.SetStateAction<Session[]>>
): void {
	// Fast-path: extract tab name from known patterns (GitHub URLs, PR/issue refs, Jira tickets)
	const quickName = extractQuickTabName(effectiveInputValue);
	if (quickName) {
		window.maestro.logger.log('info', `Quick tab named: "${quickName}"`, 'TabNaming', {
			tabId: activeTabForNaming.id,
			sessionId: activeSessionId,
			quickName,
		});
		setSessions((prev) =>
			prev.map((s) => {
				if (s.id !== activeSessionId) return s;
				return {
					...s,
					aiTabs: s.aiTabs.map((t) =>
						t.id === activeTabForNaming.id ? { ...t, name: quickName } : t
					),
				};
			})
		);
		return;
	}

	// Set isGeneratingName to show spinner in tab
	setSessions((prev) =>
		prev.map((s) => {
			if (s.id !== activeSessionId) return s;
			return {
				...s,
				aiTabs: s.aiTabs.map((t) =>
					t.id === activeTabForNaming.id ? { ...t, isGeneratingName: true } : t
				),
			};
		})
	);

	window.maestro.logger.log('info', 'Auto tab naming started', 'TabNaming', {
		tabId: activeTabForNaming.id,
		sessionId: activeSessionId,
		agentType: activeSession.toolType,
		messageLength: effectiveInputValue.length,
	});

	// Call the tab naming API (async, fire and forget)
	window.maestro.tabNaming
		.generateTabName({
			userMessage: effectiveInputValue,
			agentType: activeSession.toolType,
			cwd: activeSession.cwd,
			sessionSshRemoteConfig: activeSession.sessionSshRemoteConfig,
		})
		.then((generatedName) => {
			// Clear the generating indicator
			setSessions((prev) =>
				prev.map((s) => {
					if (s.id !== activeSessionId) return s;
					return {
						...s,
						aiTabs: s.aiTabs.map((t) =>
							t.id === activeTabForNaming.id ? { ...t, isGeneratingName: false } : t
						),
					};
				})
			);

			if (!generatedName) {
				window.maestro.logger.log('warn', 'Auto tab naming returned null', 'TabNaming', {
					tabId: activeTabForNaming.id,
					sessionId: activeSessionId,
				});
				return;
			}

			// Update the tab name only if it's still null (user hasn't manually renamed it)
			setSessions((prev) =>
				prev.map((s) => {
					if (s.id !== activeSessionId) return s;
					const tab = s.aiTabs.find((t) => t.id === activeTabForNaming.id);
					if (!tab || tab.name !== null) {
						window.maestro.logger.log(
							'info',
							'Auto tab naming skipped (tab already named)',
							'TabNaming',
							{
								tabId: activeTabForNaming.id,
								generatedName,
								existingName: tab?.name,
							}
						);
						return s;
					}
					window.maestro.logger.log('info', `Auto tab named: "${generatedName}"`, 'TabNaming', {
						tabId: activeTabForNaming.id,
						sessionId: activeSessionId,
						generatedName,
					});
					return {
						...s,
						aiTabs: s.aiTabs.map((t) =>
							t.id === activeTabForNaming.id ? { ...t, name: generatedName } : t
						),
					};
				})
			);
		})
		.catch((error) => {
			window.maestro.logger.log('error', 'Auto tab naming failed', 'TabNaming', {
				tabId: activeTabForNaming.id,
				sessionId: activeSessionId,
				error: String(error),
			});
			// Clear the generating indicator on error
			setSessions((prev) =>
				prev.map((s) => {
					if (s.id !== activeSessionId) return s;
					return {
						...s,
						aiTabs: s.aiTabs.map((t) =>
							t.id === activeTabForNaming.id ? { ...t, isGeneratingName: false } : t
						),
					};
				})
			);
		});
}
