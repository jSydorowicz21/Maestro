/**
 * Settings Modal E2E Tests
 *
 * Validates that the settings modal opens via keyboard shortcut,
 * contains expected UI elements (tabs, theme selector), and
 * closes properly.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Settings Modal', () => {
	test('settings modal opens via Ctrl+comma', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		await expect(dialog.first()).toBeVisible({ timeout: 5000 });

		// Clean up
		await windowWithSession.keyboard.press('Escape');
	});

	test('settings modal has content', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		await expect(dialog.first()).toBeVisible({ timeout: 5000 });

		// Verify the modal is not empty
		const content = await dialog.first().textContent();
		expect(content).toBeTruthy();
		expect((content ?? '').length).toBeGreaterThan(0);

		// Clean up
		await windowWithSession.keyboard.press('Escape');
	});

	test('settings modal closes on Escape', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		await expect(dialog.first()).toBeVisible({ timeout: 5000 });

		// Close via Escape
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(500);

		await expect(dialog).not.toBeVisible({ timeout: 5000 });
	});

	test('settings modal contains recognizable settings controls', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		await expect(dialog.first()).toBeVisible({ timeout: 5000 });

		// The settings modal should contain recognizable settings keywords
		const dialogText = (await dialog.first().textContent() ?? '').toLowerCase();
		const hasSettingsContent =
			dialogText.includes('theme') ||
			dialogText.includes('appearance') ||
			dialogText.includes('general') ||
			dialogText.includes('shortcut') ||
			dialogText.includes('font') ||
			dialogText.includes('settings');
		expect(hasSettingsContent).toBe(true);

		// Clean up
		await windowWithSession.keyboard.press('Escape');
	});

	test('settings modal can be reopened after closing', async ({ windowWithSession }) => {
		// Open
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		await expect(dialog.first()).toBeVisible({ timeout: 5000 });

		// Close
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(500);
		await expect(dialog).not.toBeVisible({ timeout: 5000 });

		// Reopen
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);
		await expect(dialog.first()).toBeVisible({ timeout: 5000 });

		// Clean up
		await windowWithSession.keyboard.press('Escape');
	});
});
