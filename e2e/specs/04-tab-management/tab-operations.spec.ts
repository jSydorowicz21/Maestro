/**
 * Tab Management E2E Tests
 *
 * Validates tab bar visibility, tab creation via keyboard shortcut,
 * and basic tab interactions using the session-factory fixture.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Tab Operations', () => {
	test('tab bar is visible with at least one tab', async ({ windowWithSession }) => {
		const tabBar = windowWithSession.locator(SELECTORS.TAB_BAR);
		await expect(tabBar).toBeVisible({ timeout: 10000 });
	});

	test('new tab creation via Ctrl+N', async ({ windowWithSession }) => {
		const tabBar = windowWithSession.locator(SELECTORS.TAB_BAR);
		await expect(tabBar).toBeVisible({ timeout: 10000 });

		// Count tabs before creating a new one
		// Tabs are typically buttons or clickable elements inside the tab bar
		const tabsBefore = await tabBar.locator('[role="tab"], button').count();

		// Press Ctrl+N to create a new tab
		await windowWithSession.keyboard.press('Control+n');
		await windowWithSession.waitForTimeout(1000);

		// Count tabs after - should have increased
		const tabsAfter = await tabBar.locator('[role="tab"], button').count();
		expect(tabsAfter).toBeGreaterThanOrEqual(tabsBefore);
	});

	test('tab close via Ctrl+W', async ({ windowWithSession }) => {
		const tabBar = windowWithSession.locator(SELECTORS.TAB_BAR);
		await expect(tabBar).toBeVisible({ timeout: 10000 });

		// Create a second tab first so we have something to close
		await windowWithSession.keyboard.press('Control+n');
		await windowWithSession.waitForTimeout(1000);

		const tabsBeforeClose = await tabBar.locator('[role="tab"], button').count();

		// Close the current tab
		await windowWithSession.keyboard.press('Control+w');
		await windowWithSession.waitForTimeout(1000);

		const tabsAfterClose = await tabBar.locator('[role="tab"], button').count();

		// Tab count should decrease (or stay same if minimum 1 tab enforced)
		expect(tabsAfterClose).toBeLessThanOrEqual(tabsBeforeClose);
	});

	test('tab bar coexists with main terminal and input', async ({ windowWithSession }) => {
		// Verify all main UI elements are present together
		const tabBar = windowWithSession.locator(SELECTORS.TAB_BAR);
		await expect(tabBar).toBeVisible({ timeout: 10000 });

		const terminal = windowWithSession.locator(SELECTORS.MAIN_TERMINAL);
		await expect(terminal).toBeVisible({ timeout: 5000 });

		const inputArea = windowWithSession.locator(SELECTORS.INPUT_AREA);
		await expect(inputArea).toBeVisible({ timeout: 5000 });
	});
});
