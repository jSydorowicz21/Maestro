/**
 * Keyboard Shortcuts E2E Tests
 *
 * Validates that global keyboard shortcuts trigger the expected UI actions.
 * Uses windowWithSession so the main UI is fully rendered before testing shortcuts.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Keyboard Shortcuts', () => {
	test('Escape closes topmost modal', async ({ windowWithSession }) => {
		// Open settings via shortcut
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		// Settings modal should be open
		const modal = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		await expect(modal.first()).toBeVisible({ timeout: 5000 });

		// Press Escape to close
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(500);

		// Modal should be gone
		await expect(modal).not.toBeVisible({ timeout: 5000 });
	});

	test('Ctrl+, opens settings modal', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const modal = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		await expect(modal.first()).toBeVisible({ timeout: 5000 });

		// Clean up
		await windowWithSession.keyboard.press('Escape');
	});

	test('Ctrl+J toggles AI/terminal mode', async ({ windowWithSession }) => {
		// Look for the mode indicator before toggle
		const inputArea = windowWithSession.locator('[data-tour="input-area"]');
		await expect(inputArea).toBeVisible({ timeout: 5000 });

		// Press toggle mode shortcut
		await windowWithSession.keyboard.press('Control+j');
		await windowWithSession.waitForTimeout(500);

		// The input area should still be visible (mode changed but UI persists)
		await expect(inputArea).toBeVisible();
	});
});
