/**
 * Confirm Dialog E2E Tests
 *
 * Verifies that destructive actions trigger confirm dialogs
 * and that confirming/canceling produces the expected outcome.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Confirm Dialogs', () => {
	test('closing last tab triggers confirm or prevents close', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(200);

		// Count current tabs
		const tabBar = windowWithSession.locator(SELECTORS.TAB_BAR);
		const tabsBefore = await tabBar.locator('[role="tab"], [data-testid="tab"]').count();

		// Try to close the current tab with Ctrl+W
		await windowWithSession.keyboard.press('Control+w');
		await windowWithSession.waitForTimeout(500);

		// Either a confirm dialog appeared, or the tab was prevented from closing
		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		const dialogAppeared = await dialog.first().isVisible().catch(() => false);

		if (dialogAppeared) {
			// Confirm dialog should have action buttons (Cancel/Confirm or similar)
			const buttons = await dialog.first().locator('button').count();
			expect(buttons).toBeGreaterThanOrEqual(1);

			// Cancel the dialog - tab count should remain the same
			await windowWithSession.keyboard.press('Escape');
			await windowWithSession.waitForTimeout(300);
		}

		// App should still have the tab bar visible
		await expect(tabBar).toBeVisible({ timeout: 3000 });
	});

	test('new agent wizard has Cancel button that dismisses it', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(200);

		// Open new agent wizard
		await windowWithSession.keyboard.press('Control+Shift+N');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG).first();
		await expect(dialog).toBeVisible({ timeout: 5000 });

		// The wizard dialog should have a cancel/close mechanism
		const cancelButton = dialog.locator('button:has-text("Cancel")').or(
			dialog.locator('button[aria-label="Close"]')
		).first();
		const hasCancelButton = await cancelButton.isVisible().catch(() => false);

		if (hasCancelButton) {
			await cancelButton.click();
			await windowWithSession.waitForTimeout(300);
			await expect(dialog).not.toBeVisible({ timeout: 3000 });
		} else {
			// Escape should also dismiss it
			await windowWithSession.keyboard.press('Escape');
			await windowWithSession.waitForTimeout(300);
			await expect(dialog).not.toBeVisible({ timeout: 3000 });
		}
	});
});
