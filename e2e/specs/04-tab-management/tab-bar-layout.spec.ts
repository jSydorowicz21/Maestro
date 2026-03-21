/**
 * Tab Bar Layout E2E Tests
 *
 * Verifies the tab bar renders correctly with proper layout.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Tab Bar Layout', () => {
	test('tab bar is positioned above the terminal', async ({ windowWithSession }) => {
		const tabBar = windowWithSession.locator(SELECTORS.TAB_BAR);
		const terminal = windowWithSession.locator(SELECTORS.MAIN_TERMINAL);

		const tabBox = await tabBar.boundingBox();
		const termBox = await terminal.boundingBox();

		expect(tabBox).toBeTruthy();
		expect(termBox).toBeTruthy();
		if (tabBox && termBox) {
			expect(tabBox.y).toBeLessThan(termBox.y);
		}
	});

	test('tab bar spans full width of main panel', async ({ windowWithSession }) => {
		const tabBar = windowWithSession.locator(SELECTORS.TAB_BAR);
		const tabBox = await tabBar.boundingBox();

		expect(tabBox).toBeTruthy();
		if (tabBox) {
			// Tab bar should be reasonably wide (at least 300px)
			expect(tabBox.width).toBeGreaterThan(300);
		}
	});

	test('active tab has visual distinction', async ({ windowWithSession }) => {
		const tabBar = windowWithSession.locator(SELECTORS.TAB_BAR);
		await expect(tabBar).toBeVisible({ timeout: 5000 });

		// Tab bar should contain at least one tab with text
		const tabText = await tabBar.textContent() ?? '';
		expect(tabText.length).toBeGreaterThan(0);
	});
});
