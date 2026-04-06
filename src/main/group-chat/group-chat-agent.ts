/**
 * @file group-chat-agent.ts
 * @description Participant (agent) management for Group Chat feature.
 *
 * Participants are AI agents that work together in a group chat:
 * - Each participant has a unique name within the chat
 * - Participants receive messages from the moderator
 * - Participants can collaborate by referencing the shared chat log
 */

import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import {
	GroupChatParticipant,
	loadGroupChat,
	addParticipantToChat,
	removeParticipantFromChat,
	getParticipant,
} from './group-chat-storage';
import { appendToLog } from './group-chat-log';
import { IProcessManager, isModeratorActive } from './group-chat-moderator';
import type { AgentDetector } from '../agents';
import { buildAgentArgs, applyAgentConfigOverrides } from '../utils/agent-args';
import { groupChatParticipantPrompt } from '../../prompts';
import type { SshRemoteSettingsStore } from '../utils/ssh-remote-resolver';
import { spawnGroupChatAgent } from './spawnGroupChatAgent';
import { logger } from '../utils/logger';

const LOG_CONTEXT = '[GroupChatAgent]';

/**
 * In-memory store for active participant sessions.
 * Maps `${groupChatId}:${participantName}` -> sessionId
 */
const activeParticipantSessions = new Map<string, string>();

/**
 * Generate a key for the participant sessions map.
 */
function getParticipantKey(groupChatId: string, participantName: string): string {
	return `${groupChatId}:${participantName}`;
}

/**
 * Generate the system prompt for a participant.
 * Uses template from src/prompts/group-chat-participant.md
 */
function getParticipantSystemPrompt(
	participantName: string,
	groupChatName: string,
	logPath: string
): string {
	return groupChatParticipantPrompt
		.replace(/\{\{GROUP_CHAT_NAME\}\}/g, groupChatName)
		.replace(/\{\{PARTICIPANT_NAME\}\}/g, participantName)
		.replace(/\{\{LOG_PATH\}\}/g, logPath);
}

/**
 * Session-specific overrides for participant agent configuration.
 */
export interface SessionOverrides {
	customModel?: string;
	customArgs?: string;
	customEnvVars?: Record<string, string>;
	/** SSH remote name for display in participant card */
	sshRemoteName?: string;
	/** Full SSH remote config for remote execution */
	sshRemoteConfig?: {
		enabled: boolean;
		remoteId: string | null;
		workingDirOverride?: string;
	};
}

/**
 * Adds a participant to a group chat and spawns their agent session.
 *
 * @param groupChatId - The ID of the group chat
 * @param name - The participant's name (must be unique within the chat)
 * @param agentId - The agent type to use (e.g., 'claude-code')
 * @param processManager - The process manager to use for spawning
 * @param cwd - Working directory for the agent (defaults to home directory)
 * @param agentDetector - Optional agent detector for resolving agent paths
 * @param agentConfigValues - Optional agent config values (from config store)
 * @param customEnvVars - Optional custom environment variables for the agent (deprecated, use sessionOverrides)
 * @param sessionOverrides - Optional session-specific overrides (customModel, customArgs, customEnvVars, sshRemoteConfig)
 * @param sshStore - Optional SSH settings store for remote execution support
 * @returns The created participant
 */
export async function addParticipant(
	groupChatId: string,
	name: string,
	agentId: string,
	processManager: IProcessManager,
	cwd: string = os.homedir(),
	agentDetector?: AgentDetector,
	agentConfigValues?: Record<string, any>,
	customEnvVars?: Record<string, string>,
	sessionOverrides?: SessionOverrides,
	sshStore?: SshRemoteSettingsStore
): Promise<GroupChatParticipant> {
	logger.debug('========== ADD PARTICIPANT ==========', LOG_CONTEXT);
	logger.debug(`Group Chat ID: ${groupChatId}`, LOG_CONTEXT);
	logger.debug(`Participant Name: ${name}`, LOG_CONTEXT);
	logger.debug(`Agent ID: ${agentId}`, LOG_CONTEXT);
	logger.debug(`CWD: ${cwd}`, LOG_CONTEXT);

	const chat = await loadGroupChat(groupChatId);
	if (!chat) {
		logger.error('Group chat not found!', LOG_CONTEXT, { groupChatId });
		throw new Error(`Group chat not found: ${groupChatId}`);
	}

	logger.debug(`Chat loaded: "${chat.name}"`, LOG_CONTEXT);

	// Check if moderator is active
	if (!isModeratorActive(groupChatId)) {
		logger.error('Moderator not active!', LOG_CONTEXT, { groupChatId });
		throw new Error(
			`Moderator must be active before adding participants to group chat: ${groupChatId}`
		);
	}

	logger.debug('Moderator is active: true', LOG_CONTEXT);

	// Idempotent: if participant already exists, return it without spawning a new process
	const existingParticipant = chat.participants.find((p) => p.name === name);
	if (existingParticipant) {
		logger.info(`Participant '${name}' already exists, returning existing`, LOG_CONTEXT);
		return existingParticipant;
	}

	// Resolve the agent configuration to get the executable command
	let command = agentId;
	let args: string[] = [];
	let agentConfig: Awaited<ReturnType<AgentDetector['getAgent']>> | null = null;

	if (agentDetector) {
		agentConfig = await agentDetector.getAgent(agentId);
		logger.debug(
			`Agent resolved: ${agentConfig?.command || 'null'}, available: ${agentConfig?.available ?? false}`,
			LOG_CONTEXT
		);
		if (!agentConfig || !agentConfig.available) {
			logger.error('Agent not available!', LOG_CONTEXT, { agentId });
			throw new Error(`Agent '${agentId}' is not available`);
		}
		command = agentConfig.path || agentConfig.command;
		args = [...agentConfig.args];
	}

	const prompt = getParticipantSystemPrompt(name, chat.name, chat.logPath);
	// Note: Don't pass modelId to buildAgentArgs - it will be handled by applyAgentConfigOverrides
	// via sessionCustomModel to avoid duplicate --model args
	const baseArgs = buildAgentArgs(agentConfig, {
		baseArgs: args,
		prompt,
		cwd,
		readOnlyMode: false,
	});
	// Merge customEnvVars with sessionOverrides.customEnvVars (sessionOverrides takes precedence)
	const effectiveEnvVars = sessionOverrides?.customEnvVars ?? customEnvVars;
	const configResolution = applyAgentConfigOverrides(agentConfig, baseArgs, {
		agentConfigValues: agentConfigValues || {},
		sessionCustomModel: sessionOverrides?.customModel,
		sessionCustomArgs: sessionOverrides?.customArgs,
		sessionCustomEnvVars: effectiveEnvVars,
	});

	logger.debug(`Command: ${command}`, LOG_CONTEXT);
	logger.debug('Args', LOG_CONTEXT, configResolution.args);

	// Generate session ID for this participant
	const sessionId = `group-chat-${groupChatId}-participant-${name}-${uuidv4()}`;
	logger.debug(`Generated session ID: ${sessionId}`, LOG_CONTEXT);

	// Spawn the participant agent
	logger.debug('Spawning participant agent...', LOG_CONTEXT);
	const result = await spawnGroupChatAgent(
		{
			agentId,
			sessionId,
			cwd,
			command,
			args: configResolution.args,
			prompt,
			readOnlyMode: false,
			agent: agentConfig,
			agentConfigValues: agentConfigValues || {},
			customEnvVars: configResolution.effectiveCustomEnvVars ?? effectiveEnvVars,
			sshRemoteConfig: sessionOverrides?.sshRemoteConfig,
		},
		{ processManager, sshStore }
	);

	logger.debug('Spawn result', LOG_CONTEXT, result);

	if (!result.success) {
		logger.error('Spawn failed!', LOG_CONTEXT, { name, groupChatId });
		throw new Error(`Failed to spawn participant '${name}' for group chat ${groupChatId}`);
	}

	// Create participant record
	const participant: GroupChatParticipant = {
		name,
		agentId,
		sessionId,
		addedAt: Date.now(),
		sshRemoteName: sessionOverrides?.sshRemoteName,
	};

	// Store the session mapping
	activeParticipantSessions.set(getParticipantKey(groupChatId, name), sessionId);
	logger.debug('Session stored in active map', LOG_CONTEXT);

	// Add participant to the group chat
	await addParticipantToChat(groupChatId, participant);
	logger.info('Participant added to chat storage', LOG_CONTEXT);
	logger.debug('========================================', LOG_CONTEXT);

	return participant;
}

/**
 * Sends a message to a specific participant in a group chat.
 *
 * @param groupChatId - The ID of the group chat
 * @param participantName - The name of the participant
 * @param message - The message to send
 * @param processManager - The process manager (optional)
 */
export async function sendToParticipant(
	groupChatId: string,
	participantName: string,
	message: string,
	processManager?: IProcessManager
): Promise<void> {
	const chat = await loadGroupChat(groupChatId);
	if (!chat) {
		throw new Error(`Group chat not found: ${groupChatId}`);
	}

	// Find the participant
	const participant = await getParticipant(groupChatId, participantName);
	if (!participant) {
		throw new Error(`Participant '${participantName}' not found in group chat`);
	}

	// Get the session ID
	const sessionId = activeParticipantSessions.get(getParticipantKey(groupChatId, participantName));
	if (!sessionId && processManager) {
		throw new Error(`No active session for participant '${participantName}'`);
	}

	// Log the message as coming from the moderator to this participant
	await appendToLog(chat.logPath, `moderator->${participantName}`, message);

	// Send to the participant's session if process manager is provided
	if (processManager && sessionId) {
		processManager.write(sessionId, message + '\n');
	}
}

/**
 * Removes a participant from a group chat and kills their session.
 *
 * @param groupChatId - The ID of the group chat
 * @param participantName - The name of the participant to remove
 * @param processManager - The process manager (optional, for killing the process)
 */
export async function removeParticipant(
	groupChatId: string,
	participantName: string,
	processManager?: IProcessManager
): Promise<void> {
	const chat = await loadGroupChat(groupChatId);
	if (!chat) {
		throw new Error(`Group chat not found: ${groupChatId}`);
	}

	// Find the participant to get session info before removal
	const participant = await getParticipant(groupChatId, participantName);
	if (!participant) {
		throw new Error(`Participant '${participantName}' not found in group chat`);
	}

	// Get the session ID from our active sessions map
	const key = getParticipantKey(groupChatId, participantName);
	const sessionId = activeParticipantSessions.get(key);

	// Kill the session if process manager provided and session exists
	if (processManager && sessionId) {
		processManager.kill(sessionId);
	}

	// Remove from active sessions
	activeParticipantSessions.delete(key);

	// Remove from group chat
	await removeParticipantFromChat(groupChatId, participantName);
}

/**
 * Clears all active participant sessions for a group chat.
 *
 * @param groupChatId - The ID of the group chat
 * @param processManager - The process manager (optional, for killing processes)
 */
export async function clearAllParticipantSessions(
	groupChatId: string,
	processManager?: IProcessManager
): Promise<void> {
	const prefix = `${groupChatId}:`;
	const keysToDelete: string[] = [];

	for (const [key, sessionId] of activeParticipantSessions.entries()) {
		if (key.startsWith(prefix)) {
			if (processManager) {
				processManager.kill(sessionId);
			}
			keysToDelete.push(key);
		}
	}

	for (const key of keysToDelete) {
		activeParticipantSessions.delete(key);
	}
}
