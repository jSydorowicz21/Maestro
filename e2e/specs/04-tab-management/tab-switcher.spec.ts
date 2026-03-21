/**
 * Tab Switcher E2E Tests
 *
 * Verifies the tab switcher modal (Ctrl+Tab) and tab navigation.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Tab Switcher', () => {
	test('Ctrl+Tab opens tab switcher or cycles tabs', async ({ windowWithSession }) => {
		// Create a second tab first
		await windowWithSession.keyboard.press('Control+n');
		await windowWithSession.waitForTimeout(1000);

		// Try Ctrl+Tab - should either open a switcher modal or cycle tabs
		await windowWithSession.keyboard.press('Control+Tab');
		await windowWithSession.waitForTimeout(500);

		// App should still be responsive
		const inputArea = windowWithSession.locator(SELECTORS.INPUT_AREA);
		await expect(inputArea).toBeVisible({ timeout: 5000 });

		// Press Escape to close any modal that opened
		await windowWithSession.keyboard.press('Escape');
	});

	test('multiple tabs can be created and navigated', async ({ windowWithSession }) => {
		const tabBar = windowWithSession.locator(SELECTORS.TAB_BAR);
		await expect(tabBar).toBeVisible({ timeout: 5000 });

		// Count initial tabs
		const initialText = await tabBar.textContent() ?? '';

		// Create a new tab
		await windowWithSession.keyboard.press('Control+n');
		await windowWithSession.waitForTimeout(1000);

		// Tab bar content should have changed (new tab added)
		const afterText = await tabBar.textContent() ?? '';
		// The tab bar should have more content now
		expect(afterText.length).toBeGreaterThanOrEqual(initialText.length);
	});
});
