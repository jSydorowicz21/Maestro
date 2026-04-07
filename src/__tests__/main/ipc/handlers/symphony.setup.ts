/**
 * Shared test setup for Symphony IPC handler test files.
 *
 * Each split test file must declare its own vi.mock() calls (Vitest hoisting requirement),
 * then call createSymphonyTestContext() in beforeEach to get the shared handler map and mocks.
 */

import { vi } from 'vitest';
import { ipcMain, BrowserWindow, App } from 'electron';
import fs from 'fs/promises';
import {
	registerSymphonyHandlers,
	SymphonyHandlerDependencies,
} from '../../../../main/ipc/handlers/symphony';
import { ensureForkSetup } from '../../../../main/utils/symphony-fork';

export interface SymphonyTestContext {
	handlers: Map<string, Function>;
	mockApp: App;
	mockMainWindow: BrowserWindow;
	mockDeps: SymphonyHandlerDependencies;
	mockSessionsStore: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };
}

/**
 * Creates the standard Symphony test context. Call in beforeEach after vi.clearAllMocks().
 */
export function createSymphonyTestContext(): SymphonyTestContext {
	// Capture all registered handlers
	const handlers = new Map<string, Function>();
	vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
		handlers.set(channel, handler);
	});

	// Setup mock app
	const mockApp = {
		getPath: vi.fn().mockReturnValue('/mock/userData'),
	} as unknown as App;

	// Setup mock main window
	const mockMainWindow = {
		isDestroyed: vi.fn().mockReturnValue(false),
		webContents: {
			send: vi.fn(),
			isDestroyed: vi.fn().mockReturnValue(false),
		},
	} as unknown as BrowserWindow;

	// Setup mock sessions store (exposed for individual tests to modify)
	const mockSessionsStore = {
		get: vi.fn().mockReturnValue([]),
		set: vi.fn(),
	};

	// Setup mock settings store
	const mockSettingsStore = {
		get: vi.fn().mockReturnValue([]),
		set: vi.fn(),
	};

	// Setup dependencies
	const mockDeps: SymphonyHandlerDependencies = {
		app: mockApp,
		getMainWindow: () => mockMainWindow,
		sessionsStore: mockSessionsStore as any,
		settingsStore: mockSettingsStore as any,
	};

	// Default mock for fs operations
	vi.mocked(fs.mkdir).mockResolvedValue(undefined);
	vi.mocked(fs.writeFile).mockResolvedValue(undefined);

	// Default: no fork needed (user has push access)
	vi.mocked(ensureForkSetup).mockResolvedValue({ isFork: false });

	// Register handlers
	registerSymphonyHandlers(mockDeps);

	return { handlers, mockApp, mockMainWindow, mockDeps, mockSessionsStore };
}
