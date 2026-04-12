/**
 * IPC Handler Registration Module
 *
 * This module consolidates all IPC handler registrations, extracted from the main index.ts
 * to improve code organization and maintainability.
 *
 * Each handler module exports a register function that sets up the relevant ipcMain.handle calls.
 */

import { registerGitHandlers, GitHandlerDependencies } from './git';
import { registerAutorunHandlers } from './autorun';
import { registerPlaybooksHandlers } from './playbooks';
import { registerHistoryHandlers, HistoryHandlerDependencies } from './history';
import { registerAgentsHandlers, AgentsHandlerDependencies } from './agents';
import { registerProcessHandlers, ProcessHandlerDependencies } from './process';
import {
	registerPersistenceHandlers,
	PersistenceHandlerDependencies,
	MaestroSettings,
	SessionsData,
	GroupsData,
} from './persistence';
import {
	registerSystemHandlers,
	setupLoggerEventForwarding,
	SystemHandlerDependencies,
} from './system';
import { registerClaudeHandlers, ClaudeHandlerDependencies } from './claude';
import { registerAgentSessionsHandlers, AgentSessionsHandlerDependencies } from './agentSessions';
import { registerGroupChatHandlers, GroupChatHandlerDependencies } from './groupChat';
import { registerDebugHandlers, DebugHandlerDependencies } from './debug';
import { registerSpeckitHandlers } from './speckit';
import { registerOpenSpecHandlers } from './openspec';
import { registerBmadHandlers } from './bmad';
import {
	registerContextHandlers,
	ContextHandlerDependencies,
	cleanupAllGroomingSessions,
	getActiveGroomingSessionCount,
} from './context';
import { registerMarketplaceHandlers, MarketplaceHandlerDependencies } from './marketplace';
import { registerStatsHandlers, StatsHandlerDependencies } from './stats';
import { registerDocumentGraphHandlers, DocumentGraphHandlerDependencies } from './documentGraph';
import { registerSshRemoteHandlers, SshRemoteHandlerDependencies } from './ssh-remote';
import { registerFilesystemHandlers } from './filesystem';
import { registerAttachmentsHandlers, AttachmentsHandlerDependencies } from './attachments';
import { registerWebHandlers, ensureCliServer, WebHandlerDependencies } from './web';
import { registerLeaderboardHandlers, LeaderboardHandlerDependencies } from './leaderboard';
import { registerNotificationsHandlers } from './notifications';
import { registerSymphonyHandlers, SymphonyHandlerDependencies } from './symphony';
import { registerAgentErrorHandlers } from './agent-error';
import { registerTabNamingHandlers, TabNamingHandlerDependencies } from './tabNaming';
import { registerDirectorNotesHandlers, DirectorNotesHandlerDependencies } from './director-notes';
import { registerCueHandlers, CueHandlerDependencies } from './cue';
import { registerWakatimeHandlers } from './wakatime';
import { registerFeedbackHandlers } from './feedback';

// Re-export individual handlers for selective registration
export { registerGitHandlers };
export { registerAutorunHandlers };
export { registerPlaybooksHandlers };
export { registerHistoryHandlers };
export type { HistoryHandlerDependencies };
export { registerAgentsHandlers };
export { registerProcessHandlers };
export { registerPersistenceHandlers };
export { registerSystemHandlers, setupLoggerEventForwarding };
export { registerClaudeHandlers };
export { registerAgentSessionsHandlers };
export { registerGroupChatHandlers };
export { registerDebugHandlers };
export { registerSpeckitHandlers };
export { registerOpenSpecHandlers };
export { registerBmadHandlers };
export { registerContextHandlers, cleanupAllGroomingSessions, getActiveGroomingSessionCount };
export { registerMarketplaceHandlers };
export type { MarketplaceHandlerDependencies };
export { registerStatsHandlers };
export { registerDocumentGraphHandlers };
export { registerSshRemoteHandlers };
export { registerFilesystemHandlers };
export { registerAttachmentsHandlers };
export type { AttachmentsHandlerDependencies };
export { registerWebHandlers, ensureCliServer };
export type { WebHandlerDependencies };
export { registerLeaderboardHandlers };
export type { LeaderboardHandlerDependencies };
export { registerNotificationsHandlers };
export { registerSymphonyHandlers };
export { registerAgentErrorHandlers };
export { registerTabNamingHandlers };
export type { TabNamingHandlerDependencies };
export { registerDirectorNotesHandlers };
export type { DirectorNotesHandlerDependencies };
export { registerCueHandlers };
export type { CueHandlerDependencies };
export { registerWakatimeHandlers };
export { registerFeedbackHandlers };
export type { AgentsHandlerDependencies };
export type { ProcessHandlerDependencies };
export type { PersistenceHandlerDependencies };
export type { SystemHandlerDependencies };
export type { ClaudeHandlerDependencies };
export type { AgentSessionsHandlerDependencies };
export type { GroupChatHandlerDependencies };
export type { DebugHandlerDependencies };
export type { ContextHandlerDependencies };
export type { StatsHandlerDependencies };
export type { DocumentGraphHandlerDependencies };
export type { SshRemoteHandlerDependencies };
export type { GitHandlerDependencies };
export type { SymphonyHandlerDependencies };
export type { MaestroSettings, SessionsData, GroupsData };

// HandlerDependencies and registerAllHandlers were removed (dead code - no external callers)

