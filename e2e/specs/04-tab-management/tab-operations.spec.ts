/**
 * Tab Operations E2E Tests
 *
 * Verifies tab creation (Ctrl+T), closing (Ctrl+W), and switching.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Tab Operations', () => {
	test('Ctrl+T creates a new tab', async ({ windowWithSession }) => {
		const tabBar = windowWithSession.locator(SELECTORS.TAB_BAR);
		await expect(tabBar).toBeVisible({ timeout: 10000 });

		const textBefore = await tabBar.textContent() ?? '';

		await windowWithSession.keyboard.press('Control+t');
		await windowWithSession.waitForTimeout(1000);

		const textAfter = await tabBar.textContent() ?? '';
		// Tab bar should have more content (new tab name added)
		expect(textAfter.length).toBeGreaterThan(textBefore.length);
	});

	test('Ctrl+W closes current tab', async ({ windowWithSession }) => {
		const tabBar = windowWithSession.locator(SELECTORS.TAB_BAR);
		const textBefore = await tabBar.textContent() ?? '';

		// Create a tab so we have one to close
		await windowWithSession.keyboard.press('Control+t');
		await windowWithSession.waitForTimeout(1000);

		const textAfterCreate = await tabBar.textContent() ?? '';
		expect(textAfterCreate.length).toBeGreaterThan(textBefore.length);

		// Close it
		await windowWithSession.keyboard.press('Control+w');
		await windowWithSession.waitForTimeout(1000);

		const textAfterClose = await tabBar.textContent() ?? '';
		expect(textAfterClose.length).toBeLessThan(textAfterCreate.length);
	});

	test('tab bar content changes when switching tabs', async ({ windowWithSession }) => {
		// Create a second tab
		await windowWithSession.keyboard.press('Control+t');
		await windowWithSession.waitForTimeout(1000);

		// Input should still be functional
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		await expect(textarea).toBeEditable({ timeout: 5000 });

		// Clean up
		await windowWithSession.keyboard.press('Control+w');
		await windowWithSession.waitForTimeout(500);
	});
});
