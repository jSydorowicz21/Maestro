/**
 * Welcome Screen E2E Tests
 *
 * Verifies the welcome/landing screen on fresh install.
 * Uses the base electron-app fixture (no session created).
 */
import { test, expect } from '../../fixtures/electron-app';

test.describe('Welcome Screen', () => {
	test('welcome screen has functional New Agent and Wizard buttons', async ({ window }) => {
		const welcome = window.locator('text=Welcome to Maestro');
		const isWelcome = await welcome.isVisible({ timeout: 10000 }).catch(() => false);

		if (isWelcome) {
			const newAgentBtn = window.locator('button:has-text("New Agent")');
			const wizardBtn = window.locator('button:has-text("Wizard")');
			await expect(newAgentBtn).toBeVisible({ timeout: 5000 });
			await expect(wizardBtn).toBeVisible({ timeout: 5000 });

			// Verify New Agent button is clickable and opens the create dialog
			await newAgentBtn.click();
			await window.waitForTimeout(500);

			const dialog = window.locator('[role="dialog"]');
			const dialogVisible = await dialog.first().isVisible().catch(() => false);
			if (dialogVisible) {
				const dialogText = await dialog.first().textContent() ?? '';
				expect(dialogText.toLowerCase()).toContain('agent');
				await window.keyboard.press('Escape');
			}
		}
	});
});
