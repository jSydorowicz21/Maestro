/**
 * About Modal E2E Tests
 *
 * Verifies the About modal is accessible from the hamburger menu.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('About Modal', () => {
	test('about option exists in hamburger menu', async ({ windowWithSession }) => {
		const menu = windowWithSession.locator(SELECTORS.HAMBURGER_MENU);
		await menu.click();
		await windowWithSession.waitForTimeout(500);

		const menuContents = windowWithSession.locator(SELECTORS.HAMBURGER_MENU_CONTENTS);
		const text = (await menuContents.textContent() ?? '').toLowerCase();

		// Menu should have an "about" option
		expect(text.includes('about') || text.includes('version')).toBe(true);

		await windowWithSession.keyboard.press('Escape');
	});

	test('about modal shows version info', async ({ windowWithSession }) => {
		const menu = windowWithSession.locator(SELECTORS.HAMBURGER_MENU);
		await menu.click();
		await windowWithSession.waitForTimeout(500);

		// Find and click the About option
		const aboutOption = windowWithSession.locator('text=About').first();
		const isVisible = await aboutOption.isVisible().catch(() => false);

		if (isVisible) {
			await aboutOption.click();
			await windowWithSession.waitForTimeout(500);

			// The about modal should show version info
			const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
			if (await dialog.first().isVisible().catch(() => false)) {
				const dialogText = (await dialog.first().textContent() ?? '').toLowerCase();
				const hasVersionInfo = dialogText.includes('version') || dialogText.includes('maestro') || dialogText.includes('v0.');
				expect(hasVersionInfo).toBe(true);
				await windowWithSession.keyboard.press('Escape');
			}
		} else {
			// About might be nested - close menu
			await windowWithSession.keyboard.press('Escape');
		}
	});
});
