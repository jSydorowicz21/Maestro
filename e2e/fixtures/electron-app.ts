/**
 * Electron Application Fixture for E2E Testing
 *
 * Launches ONE Electron app instance per worker and shares it across all tests.
 * Since we run with workers: 1, this means one app instance for the entire test run.
 * This is dramatically faster than launching a new instance per test (~4s saved per test).
 */
import {
	test as base,
	_electron as electron,
	type ElectronApplication,
	type Page,
} from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Worker-scoped fixtures persist across all tests in a worker
interface ElectronWorkerFixtures {
	electronApp: ElectronApplication;
	window: Page;
	appPath: string;
	testDataDir: string;
}

function getMainPath(): string {
	return path.join(__dirname, '../../dist/main/index.js');
}

function createTestDataDir(): string {
	const testDir = path.join(
		os.tmpdir(),
		`maestro-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`
	);
	fs.mkdirSync(testDir, { recursive: true });
	return testDir;
}

/**
 * Extended test with worker-scoped Electron fixtures.
 * One app instance is shared across ALL tests in the worker.
 */
export const test = base.extend<{}, ElectronWorkerFixtures>({
	// Worker-scoped: created once, shared across all tests
	testDataDir: [async ({}, use) => {
		const dir = createTestDataDir();
		await use(dir);
		try {
			fs.rmSync(dir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	}, { scope: 'worker' }],

	appPath: [async ({}, use) => {
		const mainPath = getMainPath();
		if (!fs.existsSync(mainPath)) {
			throw new Error(
				`Electron main process not built. Run 'npm run build:main && npm run build:renderer' first.\n` +
					`Expected path: ${mainPath}`
			);
		}
		await use(mainPath);
	}, { scope: 'worker' }],

	electronApp: [async ({ appPath, testDataDir }, use) => {
		// Pre-seed mock agent config so Maestro uses our mock instead of real Claude.
		// IMPORTANT: Agent configs are stored in the PRODUCTION data path (not MAESTRO_DATA_DIR)
		// because Maestro shares agent configs between dev and prod.
		// We need to write to the production path AND convert to Windows path format.
		// Use .cmd wrapper on Windows (node can't execute .mjs directly as a binary)
		const mockAgentPathWsl = path.join(__dirname, '..', 'mock-agent', 'mock-claude.cmd');
		const productionDataPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Electron');

		// Back up existing agent config and restore after tests
		const agentConfigFile = path.join(productionDataPath, 'maestro-agent-configs.json');
		let originalAgentConfig: string | null = null;
		if (fs.existsSync(agentConfigFile)) {
			originalAgentConfig = fs.readFileSync(agentConfigFile, 'utf-8');
		}

		if (fs.existsSync(mockAgentPathWsl)) {
			// Convert /mnt/c/... to C:\... for Windows
			let mockAgentPath = mockAgentPathWsl;
			const wslMatch = mockAgentPathWsl.match(/^\/mnt\/([a-z])\/(.*)/);
			if (wslMatch) {
				mockAgentPath = `${wslMatch[1].toUpperCase()}:\\${wslMatch[2].replace(/\//g, '\\')}`;
			}

			// Read existing config and merge (don't overwrite other agent configs)
			let existingConfig: Record<string, any> = {};
			if (originalAgentConfig) {
				try {
					existingConfig = JSON.parse(originalAgentConfig);
				} catch {
					existingConfig = {};
				}
			}
			if (!existingConfig.configs) existingConfig.configs = {};
			existingConfig.configs['claude-code'] = {
				...existingConfig.configs['claude-code'],
				customPath: mockAgentPath,
			};

			fs.mkdirSync(productionDataPath, { recursive: true });
			fs.writeFileSync(agentConfigFile, JSON.stringify(existingConfig, null, '\t'), 'utf-8');
		}

		const app = await electron.launch({
			args: [appPath],
			env: {
				...process.env,
				MAESTRO_DATA_DIR: testDataDir,
				ELECTRON_DISABLE_GPU: '1',
				NODE_ENV: 'test',
				MAESTRO_E2E_TEST: 'true',
			},
			timeout: 30000,
		});

		// Minimize the window so it doesn't steal focus from the user's monitor
		await app.evaluate(async ({ BrowserWindow }) => {
			const win = BrowserWindow.getAllWindows()[0];
			if (win) win.minimize();
		}).catch(() => {});

		// Auto-dismiss any native dialogs (quit confirmations, error alerts)
		app.on('dialog', async (dialog) => {
			await dialog.dismiss().catch(() => {});
		});

		// Auto-confirm quit in E2E mode (skip the quit confirmation dialog)
		await app.evaluate(async ({ ipcMain }) => {
			// When the renderer requests quit confirmation, auto-confirm
			ipcMain.on('app:quitConfirmed', () => {});
			// Disable the quit confirmation flow entirely
			(global as any).__e2eSkipQuitConfirmation = true;
		}).catch(() => {});

		// Suppress beforeunload in the renderer
		const win = await app.firstWindow();
		await win.evaluate(() => {
			window.onbeforeunload = null;
			// Auto-confirm quit via IPC if the app asks
			if ((window as any).maestro?.app?.confirmQuit) {
				const origOnQuit = (window as any).maestro.app.onQuitConfirmationRequest;
				if (origOnQuit) {
					origOnQuit(() => {
						(window as any).maestro.app.confirmQuit();
					});
				}
			}
		}).catch(() => {});

		await use(app);

		// Restore original agent config (remove mock agent path)
		try {
			if (originalAgentConfig !== null) {
				fs.writeFileSync(agentConfigFile, originalAgentConfig, 'utf-8');
			} else if (fs.existsSync(agentConfigFile)) {
				// Remove the config we created if there was none before
				fs.unlinkSync(agentConfigFile);
			}
		} catch {
			// Ignore restore errors
		}

		// Force-close after ALL tests complete
		try {
			const pid = app.process().pid;
			await app.close().catch(() => {});
			if (pid) {
				await new Promise((r) => setTimeout(r, 500));
				try {
					const { execSync } = require('child_process');
					execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
				} catch {
					// Process already exited
				}
			}
		} catch {
			// App may have already closed
		}
	}, { scope: 'worker' }],

	window: [async ({ electronApp }, use) => {
		const window = await electronApp.firstWindow();
		await window.waitForLoadState('domcontentloaded');
		await window.waitForTimeout(1000);

		// Auto-dismiss the Windows Support Notice if it appears
		const gotItButton = window.locator('button:has-text("Got it")');
		if (await gotItButton.isVisible({ timeout: 3000 }).catch(() => false)) {
			await gotItButton.click();
			await window.waitForTimeout(500);
		}

		await use(window);
	}, { scope: 'worker' }],
});

export { expect } from '@playwright/test';
