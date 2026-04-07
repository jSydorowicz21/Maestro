import type { Session, LogEntry } from '../../types';
import { getActiveTab } from '../../utils/tabHelpers';
import { getStdinFlags } from '../../utils/spawnHelpers';
import { generateId } from '../../utils/ids';
import { substituteTemplateVariables } from '../../utils/templateVariables';
import { filterYoloArgs } from '../../utils/agentArgs';
import { gitService } from '../../services/git';
import { maestroSystemPrompt } from '../../../prompts';
import type { BatchRunState } from '../../types';

export interface SpawnBatchAgentParams {
	activeSession: Session;
	activeSessionId: string;
	targetSessionId: string;
	capturedInputValue: string;
	capturedImages: string[];
	setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
	sessionsRef: React.MutableRefObject<Session[]>;
	getBatchState: (sessionId: string) => BatchRunState;
	conductorProfile?: string;
}

/**
 * Spawn a batch-mode agent process with the given prompt and images.
 * Handles session lookup, agent config, system prompt preparation,
 * read-only mode, merged context injection, and error recovery.
 */
export async function spawnBatchAgent(params: SpawnBatchAgentParams): Promise<void> {
	const {
		activeSessionId,
		targetSessionId,
		capturedInputValue,
		capturedImages,
		setSessions,
		sessionsRef,
		getBatchState,
		conductorProfile,
	} = params;

	try {
		// Get agent configuration
		const agent = await window.maestro.agents.get(params.activeSession.toolType);
		if (!agent) throw new Error(`${params.activeSession.toolType} agent not found`);

		// IMPORTANT: Get fresh session state from ref to avoid stale closure bug
		const freshSession = sessionsRef.current.find((s) => s.id === activeSessionId);
		if (!freshSession) throw new Error('Session not found');

		// Use the ACTIVE TAB's agentSessionId (not the deprecated session-level one)
		const freshActiveTab = getActiveTab(freshSession);
		const tabAgentSessionId = freshActiveTab?.agentSessionId;
		// Check CURRENT session's Auto Run state and respect worktree bypass
		const currentSessionBatchState = getBatchState(activeSessionId);
		const isAutoRunReadOnly =
			currentSessionBatchState.isRunning && !currentSessionBatchState.worktreeActive;
		const isReadOnly = isAutoRunReadOnly || freshActiveTab?.readOnlyMode;

		// For read-only mode, filter out any YOLO/skip-permissions flags from base args
		const baseArgs = agent.args ?? [];
		const spawnArgs = isReadOnly ? filterYoloArgs(baseArgs, agent) : [...baseArgs];

		// Use agent.path (full path) if available, otherwise fall back to agent.command
		const commandToUse = agent.path || agent.command;

		// If user sends only an image without text, inject the default image-only prompt
		const hasImages = capturedImages.length > 0;
		const hasNoText = !capturedInputValue.trim();
		const { DEFAULT_IMAGE_ONLY_PROMPT } = await import('./useInputProcessing');
		let effectivePrompt = hasImages && hasNoText ? DEFAULT_IMAGE_ONLY_PROMPT : capturedInputValue;

		// For read-only mode, append instruction to return plan in response instead of writing files
		if (isReadOnly) {
			effectivePrompt +=
				'\n\n---\n\nIMPORTANT: You are in read-only/plan mode. Do NOT write a plan file. Instead, return your plan directly to the user in beautiful markdown formatting.';
		}

		// Check for pending merged context that needs to be injected
		const pendingMergedContext = freshActiveTab?.pendingMergedContext;
		if (pendingMergedContext) {
			effectivePrompt = `${pendingMergedContext}\n\n---\n\n${effectivePrompt}`;

			// Clear the pending merged context from the tab
			setSessions((prev) =>
				prev.map((s) => {
					if (s.id !== activeSessionId) return s;
					return {
						...s,
						aiTabs: s.aiTabs.map((tab) =>
							tab.id === freshActiveTab.id ? { ...tab, pendingMergedContext: undefined } : tab
						),
					};
				})
			);

			console.log('[InputProcessing] Injected merged context into message:', {
				contextLength: pendingMergedContext.length,
				promptLength: effectivePrompt.length,
			});
		}

		// For NEW sessions (no agentSessionId), prepare Maestro system prompt separately
		const isNewSession = !tabAgentSessionId;
		let appendSystemPrompt: string | undefined;
		if (isNewSession && maestroSystemPrompt) {
			let gitBranch: string | undefined;
			if (freshSession.isGitRepo) {
				try {
					const status = await gitService.getStatus(freshSession.cwd);
					gitBranch = status.branch;
				} catch {
					// Ignore git errors
				}
			}

			// Get history file path for task recall
			// Skip for SSH sessions - the local path is unreachable from the remote host
			let historyFilePath: string | undefined;
			const isSSH = freshSession.sshRemoteId || freshSession.sessionSshRemoteConfig?.enabled;
			if (!isSSH) {
				try {
					historyFilePath =
						(await window.maestro.history.getFilePath(freshSession.id)) || undefined;
				} catch {
					// Ignore history errors
				}
			}

			// Substitute template variables in the system prompt
			console.log('[useInputProcessing] Template substitution context:', {
				sessionId: freshSession.id,
				sessionName: freshSession.name,
				autoRunFolderPath: freshSession.autoRunFolderPath,
				fullPath: freshSession.fullPath,
				cwd: freshSession.cwd,
				parentSessionId: freshSession.parentSessionId,
				historyFilePath,
			});
			appendSystemPrompt = substituteTemplateVariables(maestroSystemPrompt, {
				session: freshSession,
				gitBranch,
				groupId: freshSession.groupId,
				activeTabId: freshSession.activeTabId,
				historyFilePath,
				conductorProfile,
				readOnlyMode: isReadOnly,
			});
		}

		const { sendPromptViaStdin, sendPromptViaStdinRaw } = getStdinFlags({
			isSshSession: !!freshSession.sshRemoteId || !!freshSession.sessionSshRemoteConfig?.enabled,
			supportsStreamJsonInput: agent.capabilities?.supportsStreamJsonInput ?? false,
			hasImages: hasImages ?? false,
		});

		// Spawn agent with generic config
		await window.maestro.process.spawn({
			sessionId: targetSessionId,
			toolType: freshSession.toolType,
			cwd: freshSession.cwd,
			command: commandToUse,
			args: spawnArgs,
			prompt: effectivePrompt,
			images: hasImages ? capturedImages : undefined,
			appendSystemPrompt,
			agentSessionId: tabAgentSessionId ?? undefined,
			readOnlyMode: isReadOnly,
			sessionCustomPath: freshSession.customPath,
			sessionCustomArgs: freshSession.customArgs,
			sessionCustomEnvVars: freshSession.customEnvVars,
			sessionCustomModel: freshSession.customModel,
			sessionCustomEffort: freshSession.customEffort,
			sessionCustomContextWindow: freshSession.customContextWindow,
			sessionSshRemoteConfig: freshSession.sessionSshRemoteConfig,
			sendPromptViaStdin,
			sendPromptViaStdinRaw,
		});
	} catch (error) {
		console.error('Failed to spawn agent batch process:', error);
		const errorLog: LogEntry = {
			id: generateId(),
			timestamp: Date.now(),
			source: 'system',
			text: `Error: Failed to spawn agent process - ${(error as Error).message}`,
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
	}
}
