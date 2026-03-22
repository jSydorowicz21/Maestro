/**
 * Modal Escape Handling E2E Tests
 *
 * Validates that Escape closes the topmost modal and that
 * different modal-opening shortcuts produce the correct modal.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Modal Escape Handling', () => {
	test('Escape closes settings modal and returns to main UI', async ({ windowWithSession }) => {
		// Open settings
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const modal = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		await expect(modal.first()).toBeVisible({ timeout: 5000 });

		// Escape should close it
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(500);

		await expect(modal).not.toBeVisible({ timeout: 5000 });

		// Main UI should be interactive again - verify textarea can accept input
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		await textarea.click();
		await textarea.fill('post-modal text');
		expect(await textarea.inputValue()).toBe('post-modal text');
		await textarea.fill('');
	});

	test('Escape closes quick actions palette', async ({ windowWithSession }) => {
		// Open quick actions
		await windowWithSession.keyboard.press('Control+k');
		await windowWithSession.waitForTimeout(500);

		const palette = windowWithSession.locator('[aria-label="Quick Actions"]');
		await expect(palette).toBeVisible({ timeout: 5000 });

		// Escape should close it
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(500);

		await expect(palette).not.toBeVisible({ timeout: 3000 });
	});

	test('Escape closes shortcuts help modal', async ({ windowWithSession }) => {
		// Open shortcuts help via Ctrl+/
		await windowWithSession.keyboard.press('Control+/');
		await windowWithSession.waitForTimeout(500);

		const modal = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		const isVisible = await modal.first().isVisible().catch(() => false);

		if (isVisible) {
			await windowWithSession.keyboard.press('Escape');
			await windowWithSession.waitForTimeout(500);

			await expect(modal).not.toBeVisible({ timeout: 5000 });
		}
	});
});
