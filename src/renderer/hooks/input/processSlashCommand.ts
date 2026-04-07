import type {
	Session,
	SessionState,
	QueuedItem,
	CustomAICommand,
	BatchRunState,
} from '../../types';
import { getActiveTab } from '../../utils/tabHelpers';
import { generateId } from '../../utils/ids';
import { substituteTemplateVariables } from '../../utils/templateVariables';
import { gitService } from '../../services/git';

/**
 * Result of slash command processing.
 * - 'handled': command was processed, caller should return early
 * - 'not-a-command': input doesn't start with /, continue normal processing
 * - 'no-match': starts with / but no matching command found, continue normal processing
 */
export type SlashCommandResult = 'handled' | 'not-a-command' | 'no-match';

export interface SlashCommandContext {
	activeSession: Session;
	activeSessionId: string;
	commandText: string;
	setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
	setInputValue: (value: string) => void;
	setSlashCommandOpen: (open: boolean) => void;
	syncAiInputToSession: (value: string) => void;
	inputRef: React.RefObject<HTMLTextAreaElement | null>;
	customAICommands: CustomAICommand[];
	getBatchState: (sessionId: string) => BatchRunState;
	processQueuedItemRef: React.MutableRefObject<
		((sessionId: string, item: QueuedItem) => Promise<void>) | null
	>;
	onHistoryCommand?: () => Promise<void>;
	onWizardCommand?: (args: string) => void;
	onSkillsCommand?: () => Promise<void>;
	conductorProfile?: string;
}

/**
 * Process slash commands: /history, /wizard, /skills, and custom AI commands.
 * Returns whether the command was handled (caller should return early).
 */
export function processSlashCommand(ctx: SlashCommandContext): SlashCommandResult {
	const { commandText, activeSession } = ctx;

	if (!commandText.startsWith('/')) {
		return 'not-a-command';
	}

	const isTerminalMode = activeSession.inputMode === 'terminal';

	// Handle built-in /history command (only in AI mode)
	if (!isTerminalMode && commandText === '/history' && ctx.onHistoryCommand) {
		clearInput(ctx);
		ctx.onHistoryCommand().catch((error) => {
			console.error('[processInput] /history command failed:', error);
		});
		return 'handled';
	}

	// Handle built-in /wizard command (only in AI mode)
	const isWizardCommand = commandText === '/wizard' || commandText.startsWith('/wizard ');
	if (!isTerminalMode && isWizardCommand && ctx.onWizardCommand) {
		const args = commandText.slice('/wizard'.length).trim();
		clearInput(ctx);
		ctx.onWizardCommand(args);
		return 'handled';
	}

	// Handle built-in /skills command (only in AI mode, only for Claude Code sessions)
	if (
		!isTerminalMode &&
		commandText === '/skills' &&
		ctx.onSkillsCommand &&
		activeSession.toolType === 'claude-code'
	) {
		clearInput(ctx);
		ctx.onSkillsCommand().catch((error) => {
			console.error('[processInput] /skills command failed:', error);
		});
		return 'handled';
	}

	// Check for custom AI commands (only in AI mode)
	if (!isTerminalMode) {
		const firstSpaceIndex = commandText.indexOf(' ');
		const baseCommand =
			firstSpaceIndex === -1 ? commandText : commandText.substring(0, firstSpaceIndex);
		const commandArgs =
			firstSpaceIndex === -1 ? '' : commandText.substring(firstSpaceIndex + 1).trim();

		// Check custom AI commands first, then agent-discovered commands with prompts
		const matchingAgentCommand = activeSession.agentCommands?.find(
			(cmd) => cmd.command === baseCommand && cmd.prompt
		);
		const matchingCustomCommand =
			ctx.customAICommands.find((cmd) => cmd.command === baseCommand) ||
			(matchingAgentCommand
				? {
						command: matchingAgentCommand.command,
						description: matchingAgentCommand.description,
						prompt: matchingAgentCommand.prompt!,
					}
				: undefined);

		if (matchingCustomCommand) {
			clearInput(ctx);
			executeCustomCommand(ctx, matchingCustomCommand, commandArgs, commandText);
			return 'handled';
		}
	}

	return 'no-match';
}

function clearInput(ctx: SlashCommandContext): void {
	ctx.setInputValue('');
	ctx.setSlashCommandOpen(false);
	ctx.syncAiInputToSession('');
	if (ctx.inputRef.current) ctx.inputRef.current.style.height = 'auto';
}

function executeCustomCommand(
	ctx: SlashCommandContext,
	matchingCustomCommand: { command: string; description?: string; prompt: string },
	commandArgs: string,
	commandText: string
): void {
	const { activeSession, activeSessionId, setSessions, getBatchState, processQueuedItemRef } = ctx;

	(async () => {
		let gitBranch: string | undefined;
		if (activeSession.isGitRepo) {
			try {
				const status = await gitService.getStatus(activeSession.cwd);
				gitBranch = status.branch;
			} catch {
				// Ignore git errors
			}
		}
		substituteTemplateVariables(matchingCustomCommand.prompt, {
			session: activeSession,
			gitBranch,
			groupId: activeSession.groupId,
			activeTabId: activeSession.activeTabId,
			conductorProfile: ctx.conductorProfile,
		});

		// ALWAYS queue slash commands - they execute in order like write messages
		const activeTab = getActiveTab(activeSession);
		const isReadOnlyMode = activeTab?.readOnlyMode === true;
		const isAutoRunActive = getBatchState(activeSession.id).isRunning;
		const sessionIsIdle = activeSession.state !== 'busy' && !isAutoRunActive;

		const queuedItem: QueuedItem = {
			id: generateId(),
			timestamp: Date.now(),
			tabId: activeTab?.id || activeSession.activeTabId,
			type: 'command',
			command: matchingCustomCommand.command,
			commandArgs,
			commandDescription: matchingCustomCommand.description,
			tabName:
				activeTab?.name ||
				(activeTab?.agentSessionId ? activeTab.agentSessionId.split('-')[0].toUpperCase() : 'New'),
			readOnlyMode: isReadOnlyMode,
		};

		if (sessionIsIdle) {
			// Set up session and tab state for immediate processing
			setSessions((prev) =>
				prev.map((s) => {
					if (s.id !== activeSessionId) return s;

					const updatedAiTabs = s.aiTabs.map((tab) =>
						tab.id === queuedItem.tabId
							? { ...tab, state: 'busy' as const, thinkingStartTime: Date.now() }
							: tab
					);

					return {
						...s,
						state: 'busy' as SessionState,
						busySource: 'ai',
						thinkingStartTime: Date.now(),
						currentCycleTokens: 0,
						currentCycleBytes: 0,
						aiTabs: updatedAiTabs,
						aiCommandHistory: Array.from(
							new Set([...(s.aiCommandHistory || []), commandText])
						).slice(-50),
					};
				})
			);

			// Process immediately after state is set up
			// 50ms delay allows React to flush the setState above
			setTimeout(() => {
				processQueuedItemRef.current?.(activeSessionId, queuedItem);
			}, 50);
		} else {
			// Session is busy - just add to queue
			setSessions((prev) =>
				prev.map((s) => {
					if (s.id !== activeSessionId) return s;
					return {
						...s,
						executionQueue: [...s.executionQueue, queuedItem],
						aiCommandHistory: Array.from(
							new Set([...(s.aiCommandHistory || []), commandText])
						).slice(-50),
					};
				})
			);
		}
	})();
}
