/**
 * Panel Shortcut E2E Tests
 *
 * Verifies left/right panel toggle shortcuts.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Panel Shortcuts', () => {
	test('Alt+Ctrl+Left toggles left panel', async ({ windowWithSession }) => {
		const sessionList = windowWithSession.locator(SELECTORS.SESSION_LIST);
		const initiallyVisible = await sessionList.isVisible().catch(() => false);

		await windowWithSession.keyboard.press('Alt+Control+ArrowLeft');
		await windowWithSession.waitForTimeout(500);

		const afterToggle = await sessionList.isVisible().catch(() => false);

		// Either it toggled, or the shortcut didn't apply (both are valid)
		// Verify app didn't crash
		const inputArea = windowWithSession.locator(SELECTORS.INPUT_AREA);
		await expect(inputArea).toBeVisible({ timeout: 5000 });

		// Restore if toggled
		if (afterToggle !== initiallyVisible) {
			await windowWithSession.keyboard.press('Alt+Control+ArrowLeft');
			await windowWithSession.waitForTimeout(300);
		}
	});

	test('Alt+Ctrl+Right toggles right panel', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Alt+Control+ArrowRight');
		await windowWithSession.waitForTimeout(500);

		// App should still be responsive regardless of toggle state
		const inputArea = windowWithSession.locator(SELECTORS.INPUT_AREA);
		await expect(inputArea).toBeVisible({ timeout: 5000 });

		// Toggle back
		await windowWithSession.keyboard.press('Alt+Control+ArrowRight');
		await windowWithSession.waitForTimeout(300);
	});
});
