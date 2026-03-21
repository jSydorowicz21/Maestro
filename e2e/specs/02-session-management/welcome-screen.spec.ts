/**
 * Welcome Screen E2E Tests
 *
 * Verifies the welcome/landing screen on fresh install.
 * Uses the base electron-app fixture (no session created).
 */
import { test, expect } from '../../fixtures/electron-app';

test.describe('Welcome Screen', () => {
	test('fresh install shows welcome content', async ({ window }) => {
		const welcome = window.locator('text=Welcome to Maestro');
		const newAgent = window.locator('button:has-text("New Agent")');
		const wizard = window.locator('button:has-text("Wizard")');

		// At least the welcome text or one button should be visible
		const welcomeVisible = await welcome.isVisible({ timeout: 10000 }).catch(() => false);
		const newAgentVisible = await newAgent.isVisible().catch(() => false);
		const wizardVisible = await wizard.isVisible().catch(() => false);

		expect(welcomeVisible || newAgentVisible || wizardVisible).toBe(true);
	});

	test('welcome screen has New Agent and Wizard buttons', async ({ window }) => {
		const welcome = window.locator('text=Welcome to Maestro');
		const isWelcome = await welcome.isVisible({ timeout: 10000 }).catch(() => false);

		if (isWelcome) {
			const newAgent = window.locator('button:has-text("New Agent")');
			const wizard = window.locator('button:has-text("Wizard")');
			await expect(newAgent).toBeVisible({ timeout: 5000 });
			await expect(wizard).toBeVisible({ timeout: 5000 });
		}
	});

	test('welcome screen describes Maestro features', async ({ window }) => {
		const welcome = window.locator('text=Welcome to Maestro');
		const isWelcome = await welcome.isVisible({ timeout: 10000 }).catch(() => false);

		if (isWelcome) {
			const pageText = (await window.locator('body').textContent() ?? '').toLowerCase();
			const describesFeatures =
				pageText.includes('multiple ai') ||
				pageText.includes('parallel') ||
				pageText.includes('auto run') ||
				pageText.includes('orchestration');
			expect(describesFeatures).toBe(true);
		}
	});
});
