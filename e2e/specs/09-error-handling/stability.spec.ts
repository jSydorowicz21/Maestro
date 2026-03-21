/**
 * App Stability E2E Tests
 *
 * Stress tests that verify the app doesn't crash under various conditions.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('App Stability', () => {
	test('app survives rapid shortcut spam', async ({ windowWithSession }) => {
		// Rapidly press multiple shortcuts
		const shortcuts = ['Control+j', 'Control+k', 'Escape', 'Control+,', 'Escape', 'Control+Shift+f', 'Control+Shift+h', 'Control+Shift+1'];
		for (const shortcut of shortcuts) {
			await windowWithSession.keyboard.press(shortcut);
			await windowWithSession.waitForTimeout(100);
		}

		// App should still be responsive
		await windowWithSession.waitForTimeout(500);
		const inputArea = windowWithSession.locator(SELECTORS.INPUT_AREA);
		await expect(inputArea).toBeVisible({ timeout: 5000 });
	});

	test('app survives creating and closing multiple tabs', async ({ windowWithSession }) => {
		// Create 3 tabs rapidly
		for (let i = 0; i < 3; i++) {
			await windowWithSession.keyboard.press('Control+n');
			await windowWithSession.waitForTimeout(300);
		}

		// Close them all
		for (let i = 0; i < 3; i++) {
			await windowWithSession.keyboard.press('Control+w');
			await windowWithSession.waitForTimeout(300);
		}

		// App should still work
		const tabBar = windowWithSession.locator(SELECTORS.TAB_BAR);
		await expect(tabBar).toBeVisible({ timeout: 5000 });
	});

	test('app survives opening all right panel tabs in sequence', async ({ windowWithSession }) => {
		const tabs = ['Control+Shift+f', 'Control+Shift+h', 'Control+Shift+1'];
		for (const tab of tabs) {
			await windowWithSession.keyboard.press(tab);
			await windowWithSession.waitForTimeout(300);
		}

		// Toggle right panel off and on
		await windowWithSession.keyboard.press('Alt+Control+ArrowRight');
		await windowWithSession.waitForTimeout(300);
		await windowWithSession.keyboard.press('Alt+Control+ArrowRight');
		await windowWithSession.waitForTimeout(300);

		// App should still be responsive
		const inputArea = windowWithSession.locator(SELECTORS.INPUT_AREA);
		await expect(inputArea).toBeVisible({ timeout: 5000 });
	});
});
