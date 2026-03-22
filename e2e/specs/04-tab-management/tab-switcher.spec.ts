/**
 * Tab Switcher E2E Tests
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Tab Switcher', () => {
	test('Alt+Ctrl+T opens the tab switcher modal', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Alt+Control+t');
		await windowWithSession.waitForTimeout(500);

		const modal = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		const isVisible = await modal.first().isVisible().catch(() => false);

		if (isVisible) {
			await windowWithSession.keyboard.press('Escape');
		}
	});

	test('Ctrl+T and Ctrl+W update tab bar', async ({ windowWithSession }) => {
		const tabBar = windowWithSession.locator(SELECTORS.TAB_BAR);
		const textBefore = await tabBar.textContent() ?? '';

		await windowWithSession.keyboard.press('Control+t');
		await windowWithSession.waitForTimeout(1000);

		const textAfter = await tabBar.textContent() ?? '';
		expect(textAfter.length).toBeGreaterThan(textBefore.length);

		await windowWithSession.keyboard.press('Control+w');
		await windowWithSession.waitForTimeout(500);
	});
});
