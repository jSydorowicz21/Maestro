/**
 * @file spawnGroupChatAgent.ts
 * @description Shared helper for spawning group chat agents (moderators and participants).
 *
 * Consolidates the repeated SSH wrapping + Windows config + processManager.spawn()
 * boilerplate that was duplicated across 5 call sites in group-chat-agent.ts and
 * group-chat-router.ts.
 */

import { wrapSpawnWithSsh } from '../utils/ssh-spawn-wrapper';
import type { SshRemoteSettingsStore } from '../utils/ssh-remote-resolver';
import { getWindowsSpawnConfig, type SpawnSshConfig } from './group-chat-config';
import { getContextWindowValue } from '../utils/agent-args';
import type { AgentConfig } from '../agents/definitions';
import type { IProcessManager } from './group-chat-moderator';

/**
 * Configuration for spawning a group chat agent process.
 * All SSH wrapping and Windows shell configuration is handled internally.
 */
export interface GroupChatSpawnConfig {
	/** The agent ID (e.g., 'claude-code', 'codex') */
	agentId: string;
	/** Unique session ID for this spawn */
	sessionId: string;
	/** Working directory for the agent process */
	cwd: string;
	/** Resolved command to execute (from agent config or custom path) */
	command: string;
	/** Resolved CLI args (after applyAgentConfigOverrides) */
	args: string[];
	/** Prompt to send to the agent */
	prompt?: string;
	/** Whether the agent should run in read-only mode */
	readOnlyMode: boolean;
	/** Resolved agent configuration (null when agentDetector was not provided) */
	agent: AgentConfig | null;
	/** Agent config values for context window calculation */
	agentConfigValues: Record<string, unknown>;
	/** Custom environment variables */
	customEnvVars?: Record<string, string>;
	/** SSH remote configuration (if SSH is enabled for this session) */
	sshRemoteConfig?: SpawnSshConfig;
}

/**
 * Dependencies injected into spawnGroupChatAgent.
 */
export interface GroupChatSpawnDeps {
	/** Process manager for spawning */
	processManager: IProcessManager;
	/** SSH remote settings store (needed when sshRemoteConfig is provided) */
	sshStore?: SshRemoteSettingsStore | null;
}

/**
 * Spawns a group chat agent with SSH wrapping and Windows shell configuration.
 *
 * This consolidates the shared boilerplate across all group chat spawn sites:
 * 1. Applies SSH wrapping via wrapSpawnWithSsh (when sshRemoteConfig is enabled)
 * 2. Applies Windows-specific shell config via getWindowsSpawnConfig
 * 3. Calls processManager.spawn with the full config
 *
 * @returns The spawn result from processManager.spawn
 */
export async function spawnGroupChatAgent(
	config: GroupChatSpawnConfig,
	deps: GroupChatSpawnDeps
): Promise<{ pid: number; success: boolean }> {
	const {
		agentId,
		sessionId,
		cwd,
		command,
		args,
		prompt,
		readOnlyMode,
		agent,
		agentConfigValues,
		customEnvVars,
		sshRemoteConfig,
	} = config;
	const { processManager, sshStore } = deps;

	// Start with base values
	let spawnCommand = command;
	let spawnArgs = args;
	let spawnCwd = cwd;
	let spawnPrompt: string | undefined = prompt;
	let spawnEnvVars = customEnvVars;
	let spawnShell: string | undefined;
	let spawnRunInShell = false;
	let spawnSshStdinScript: string | undefined;

	// Apply SSH wrapping if configured and store is available
	if (sshStore && sshRemoteConfig) {
		const sshWrapped = await wrapSpawnWithSsh(
			{
				command,
				args,
				cwd,
				prompt,
				customEnvVars,
				promptArgs: agent?.promptArgs,
				noPromptSeparator: agent?.noPromptSeparator,
				agentBinaryName: agent?.binaryName,
			},
			sshRemoteConfig,
			sshStore
		);
		spawnCommand = sshWrapped.command;
		spawnArgs = sshWrapped.args;
		spawnCwd = sshWrapped.cwd;
		spawnPrompt = sshWrapped.prompt;
		spawnEnvVars = sshWrapped.customEnvVars;
		spawnSshStdinScript = sshWrapped.sshStdinScript;
	}

	// Get Windows-specific spawn config (shell, stdin mode) - handles SSH exclusion
	const winConfig = getWindowsSpawnConfig(agentId, sshRemoteConfig);
	if (winConfig.shell) {
		spawnShell = winConfig.shell;
		spawnRunInShell = winConfig.runInShell;
	}

	// Spawn the agent process
	return processManager.spawn({
		sessionId,
		toolType: agentId,
		cwd: spawnCwd,
		command: spawnCommand,
		args: spawnArgs,
		readOnlyMode,
		prompt: spawnPrompt,
		contextWindow: getContextWindowValue(agent, agentConfigValues),
		customEnvVars: spawnEnvVars,
		promptArgs: agent?.promptArgs,
		noPromptSeparator: agent?.noPromptSeparator,
		shell: spawnShell,
		runInShell: spawnRunInShell,
		sendPromptViaStdin: winConfig.sendPromptViaStdin,
		sendPromptViaStdinRaw: winConfig.sendPromptViaStdinRaw,
		sshStdinScript: spawnSshStdinScript,
	});
}
