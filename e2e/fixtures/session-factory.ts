/**
 * Session Factory Fixture
 *
 * Extends the worker-scoped electron-app fixture to create a session
 * via the UI ONCE, then share it across all tests. Since the base
 * fixtures are worker-scoped, the Electron app + session persist
 * across the entire test run.
 */
import { test as baseTest } from './electron-app';
import path from 'path';
import fs from 'fs';
import type { Page, ElectronApplication } from '@playwright/test';

export { expect } from '@playwright/test';

interface SessionFactoryWorkerFixtures {
	windowWithSession: Page;
}

export const test = baseTest.extend<{}, SessionFactoryWorkerFixtures>({
	windowWithSession: [async ({ window, electronApp, testDataDir }, use) => {
		// Create a project directory for this session
		const projectDir = path.join(testDataDir, 'e2e-project');
		fs.mkdirSync(projectDir, { recursive: true });
		fs.mkdirSync(path.join(projectDir, '.git'), { recursive: true });
		fs.writeFileSync(path.join(projectDir, '.git', 'HEAD'), 'ref: refs/heads/main\n');

		// Mock the folder picker dialog
		await electronApp.evaluate(async ({ dialog }, dirPath) => {
			dialog.showOpenDialog = async () => ({
				canceled: false,
				filePaths: [dirPath],
			});
		}, projectDir);

		// Check if we're on the welcome screen (fresh install)
		const welcomeScreen = window.locator('text=Welcome to Maestro');
		const isWelcome = await welcomeScreen.isVisible({ timeout: 10000 }).catch(() => false);

		if (isWelcome) {
			// Create session via New Agent UI flow
			await window.locator('button:has-text("New Agent")').click();
			await window.locator('text=Create New Agent').waitFor({ state: 'visible', timeout: 5000 });

			// Fill in agent name
			const nameInput = window.locator('[role="dialog"] input').first();
			await nameInput.fill('E2E Test Agent');

			// Click folder browse button to trigger mocked dialog
			const allButtons = await window.locator('[role="dialog"] button').all();
			for (const btn of allButtons) {
				const title = await btn.getAttribute('title');
				if (title && title.includes('Browse')) {
					await btn.click();
					break;
				}
			}
			await window.waitForTimeout(500);

			// Click Create Agent
			await window.locator('button:has-text("Create Agent")').click({ timeout: 10000 });

			// Wait for main UI
			await window.locator('[data-tour="session-list"]').waitFor({ state: 'visible', timeout: 15000 });
		}

		await use(window);
	}, { scope: 'worker' }],
});
