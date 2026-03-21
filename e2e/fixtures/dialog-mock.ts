/**
 * Dialog Mock Fixture
 *
 * Extends the base electron-app fixture to provide helpers
 * for mocking Electron's native dialog.showOpenDialog and
 * dialog.showSaveDialog via electronApp.evaluate().
 *
 * Mocks are automatically restored during teardown.
 */
import { test as base } from './electron-app';
import type { ElectronApplication } from '@playwright/test';

export { expect } from '@playwright/test';

interface DialogMockFixtures {
	/** Mock dialog.showOpenDialog to return the given path(s) */
	mockOpenDialog: (returnPath: string | string[]) => Promise<void>;
	/** Mock dialog.showSaveDialog to return the given path */
	mockSaveDialog: (returnPath: string) => Promise<void>;
}

/**
 * Install a mock for dialog.showOpenDialog inside the Electron main process.
 */
async function installOpenDialogMock(
	electronApp: ElectronApplication,
	returnPaths: string[],
): Promise<void> {
	await electronApp.evaluate(
		async ({ dialog }, paths) => {
			// Store the original so we can restore it later
			if (!(dialog as Record<string, unknown>).__originalShowOpenDialog) {
				(dialog as Record<string, unknown>).__originalShowOpenDialog =
					dialog.showOpenDialog;
			}

			dialog.showOpenDialog = async () => ({
				canceled: false,
				filePaths: paths,
			});
		},
		returnPaths,
	);
}

/**
 * Install a mock for dialog.showSaveDialog inside the Electron main process.
 */
async function installSaveDialogMock(
	electronApp: ElectronApplication,
	returnPath: string,
): Promise<void> {
	await electronApp.evaluate(
		async ({ dialog }, savePath) => {
			if (!(dialog as Record<string, unknown>).__originalShowSaveDialog) {
				(dialog as Record<string, unknown>).__originalShowSaveDialog =
					dialog.showSaveDialog;
			}

			dialog.showSaveDialog = async () => ({
				canceled: false,
				filePath: savePath,
			});
		},
		returnPath,
	);
}

/**
 * Restore any mocked dialog functions back to their originals.
 */
async function restoreDialogs(
	electronApp: ElectronApplication,
): Promise<void> {
	await electronApp.evaluate(async ({ dialog }) => {
		const d = dialog as Record<string, unknown>;
		if (d.__originalShowOpenDialog) {
			(dialog as Record<string, unknown>).showOpenDialog =
				d.__originalShowOpenDialog as typeof dialog.showOpenDialog;
			delete d.__originalShowOpenDialog;
		}
		if (d.__originalShowSaveDialog) {
			(dialog as Record<string, unknown>).showSaveDialog =
				d.__originalShowSaveDialog as typeof dialog.showSaveDialog;
			delete d.__originalShowSaveDialog;
		}
	});
}

export const test = base.extend<DialogMockFixtures>({
	mockOpenDialog: async ({ electronApp }, use) => {
		const mock = async (returnPath: string | string[]) => {
			const paths = Array.isArray(returnPath) ? returnPath : [returnPath];
			await installOpenDialogMock(electronApp, paths);
		};

		await use(mock);

		// Teardown: restore originals
		await restoreDialogs(electronApp);
	},

	mockSaveDialog: async ({ electronApp }, use) => {
		const mock = async (returnPath: string) => {
			await installSaveDialogMock(electronApp, returnPath);
		};

		await use(mock);

		// Teardown: restore originals
		await restoreDialogs(electronApp);
	},
});
