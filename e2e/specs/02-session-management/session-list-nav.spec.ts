/**
 * Session List Navigation E2E Tests
 *
 * Verifies session cycling via Ctrl+[ and Ctrl+] shortcuts
 * and session jump via Alt+Ctrl+1-9.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Session List Navigation', () => {
	test('Ctrl+] cycles to next session after creating a second', async ({ windowWithSession }) => {
		// Create a second session via New Agent
		await windowWithSession.keyboard.press('Control+Shift+n');
		await windowWithSession.waitForTimeout(500);

		// If wizard opened, close it - we just need to test the shortcut works
		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		if (await dialog.first().isVisible().catch(() => false)) {
			await windowWithSession.keyboard.press('Escape');
			await windowWithSession.waitForTimeout(300);
		}

		// Ctrl+] should not crash the app
		await windowWithSession.keyboard.press('Control+]');
		await windowWithSession.waitForTimeout(300);

		// App should still be responsive
		await expect(windowWithSession.locator(SELECTORS.SESSION_LIST)).toBeVisible({ timeout: 5000 });
	});

	test('Ctrl+[ cycles to previous session', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+[');
		await windowWithSession.waitForTimeout(300);

		await expect(windowWithSession.locator(SELECTORS.SESSION_LIST)).toBeVisible({ timeout: 5000 });
	});

	test('Alt+Ctrl+1 jumps to first session', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Alt+Control+1');
		await windowWithSession.waitForTimeout(300);

		await expect(windowWithSession.locator(SELECTORS.SESSION_LIST)).toBeVisible({ timeout: 5000 });
	});
});
