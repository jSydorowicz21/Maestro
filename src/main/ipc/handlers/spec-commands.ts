/**
 * Spec Command IPC Handler Factory
 *
 * Shared handler registration for SpecKit, OpenSpec, and BMAD command systems.
 * Each feature provides its config and manager functions; this factory registers
 * the identical set of IPC handlers (getMetadata, getPrompts, getCommand,
 * savePrompt, resetPrompt, refresh) with the appropriate channel prefix.
 */

import { ipcMain } from 'electron';
import { logger } from '../../utils/logger';
import { createIpcHandler, CreateHandlerOptions } from '../../utils/ipcHandler';
import type { SpecCommand, SpecCommandMetadata } from '../../spec-command-manager';

/**
 * Manager functions required by the IPC handler factory.
 * Each feature's thin wrapper passes its own implementations.
 */
export interface SpecCommandHandlerFunctions {
	getMetadata: () => Promise<SpecCommandMetadata>;
	getPrompts: () => Promise<SpecCommand[]>;
	savePrompt: (id: string, content: string) => Promise<void>;
	resetPrompt: (id: string) => Promise<string>;
	refresh: () => Promise<SpecCommandMetadata>;
	getCommandBySlash: (s: string) => Promise<SpecCommand | null>;
}

/**
 * Configuration for registering a spec command IPC handler set.
 */
export interface SpecCommandHandlerConfig {
	/** IPC channel prefix, e.g. 'speckit', 'openspec', 'bmad' */
	channelPrefix: string;
	/** Log context tag, e.g. '[SpecKit]', '[OpenSpec]', '[BMAD]' */
	logContext: string;
	/** Feature name for dot-prefixed log messages, e.g. 'speckit', 'openspec', 'bmad' */
	featureName: string;
	/** Display name for debug log, e.g. 'Spec Kit', 'OpenSpec', 'BMAD' */
	displayName: string;
	/** Format the refresh success log message from the returned metadata */
	formatRefreshLog: (metadata: SpecCommandMetadata) => string;
}

/**
 * Register a standard set of spec command IPC handlers.
 *
 * Creates handlers for: getMetadata, getPrompts, getCommand, savePrompt,
 * resetPrompt, and refresh - all under the configured channel prefix.
 */
export function registerSpecCommandHandlers(
	config: SpecCommandHandlerConfig,
	fns: SpecCommandHandlerFunctions
): void {
	const { channelPrefix, logContext, featureName, displayName, formatRefreshLog } = config;

	const handlerOpts = (operation: string, logSuccess = true): CreateHandlerOptions => ({
		context: logContext,
		operation,
		logSuccess,
	});

	// Get metadata (version info, last refresh date)
	ipcMain.handle(
		`${channelPrefix}:getMetadata`,
		createIpcHandler(handlerOpts('getMetadata', false), async () => {
			const metadata = await fns.getMetadata();
			return { metadata };
		})
	);

	// Get all prompts
	ipcMain.handle(
		`${channelPrefix}:getPrompts`,
		createIpcHandler(handlerOpts('getPrompts', false), async () => {
			const commands = await fns.getPrompts();
			return { commands };
		})
	);

	// Get a single command by slash command string
	ipcMain.handle(
		`${channelPrefix}:getCommand`,
		createIpcHandler(handlerOpts('getCommand', false), async (slashCommand: string) => {
			const command = await fns.getCommandBySlash(slashCommand);
			return { command };
		})
	);

	// Save user's edit to a prompt
	ipcMain.handle(
		`${channelPrefix}:savePrompt`,
		createIpcHandler(handlerOpts('savePrompt'), async (id: string, content: string) => {
			await fns.savePrompt(id, content);
			logger.info(`Saved custom prompt for ${featureName}.${id}`, logContext);
			return {};
		})
	);

	// Reset a prompt to bundled default
	ipcMain.handle(
		`${channelPrefix}:resetPrompt`,
		createIpcHandler(handlerOpts('resetPrompt'), async (id: string) => {
			const prompt = await fns.resetPrompt(id);
			logger.info(`Reset ${featureName}.${id} to bundled default`, logContext);
			return { prompt };
		})
	);

	// Refresh prompts from upstream
	ipcMain.handle(
		`${channelPrefix}:refresh`,
		createIpcHandler(handlerOpts('refresh'), async () => {
			const metadata = await fns.refresh();
			logger.info(formatRefreshLog(metadata), logContext);
			return { metadata };
		})
	);

	logger.debug(`${logContext} ${displayName} IPC handlers registered`);
}
