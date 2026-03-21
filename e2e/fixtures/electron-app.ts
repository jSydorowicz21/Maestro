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

		await use(app);

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
