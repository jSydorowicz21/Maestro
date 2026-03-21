/**
 * Modal Escape Handling E2E Tests
 *
 * Validates that Escape closes the topmost modal.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Modal Escape Handling', () => {
	test('Escape closes settings modal', async ({ windowWithSession }) => {
		// Open settings
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const modal = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		await expect(modal.first()).toBeVisible({ timeout: 5000 });

		// Escape should close it
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(500);

		await expect(modal).not.toBeVisible({ timeout: 5000 });
	});

	test('Ctrl+K opens quick actions palette', async ({ windowWithSession }) => {
		// Open quick actions via Ctrl+K
		await windowWithSession.keyboard.press('Control+k');
		await windowWithSession.waitForTimeout(500);

		// Verify the quick actions modal/palette opened
		const modal = windowWithSession.locator('[aria-label="Quick Actions"]');
		await expect(modal).toBeVisible({ timeout: 5000 });

		// Clean up - close it
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(300);
		// Quick actions may need a second Escape or click outside
		if (await modal.isVisible().catch(() => false)) {
			await windowWithSession.keyboard.press('Escape');
		}
	});
});
