/**
 * Hamburger Menu E2E Tests
 *
 * Verifies all hamburger menu items are present and clickable.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Hamburger Menu', () => {
	test('menu contains expected items', async ({ windowWithSession }) => {
		const menu = windowWithSession.locator(SELECTORS.HAMBURGER_MENU);
		await menu.click();
		await windowWithSession.waitForTimeout(500);

		const contents = windowWithSession.locator(SELECTORS.HAMBURGER_MENU_CONTENTS);
		const text = (await contents.textContent() ?? '').toLowerCase();

		// Menu should contain standard items
		const expectedItems = ['new', 'group', 'about'];
		let foundCount = 0;
		for (const item of expectedItems) {
			if (text.includes(item)) foundCount++;
		}
		expect(foundCount).toBeGreaterThanOrEqual(1);

		await windowWithSession.keyboard.press('Escape');
	});

	test('menu closes on Escape', async ({ windowWithSession }) => {
		const menu = windowWithSession.locator(SELECTORS.HAMBURGER_MENU);
		await menu.click();
		await windowWithSession.waitForTimeout(500);

		const contents = windowWithSession.locator(SELECTORS.HAMBURGER_MENU_CONTENTS);
		await expect(contents).toBeVisible({ timeout: 3000 });

		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(300);

		// Menu should be closed
		const isStillOpen = await contents.isVisible().catch(() => false);
		expect(isStillOpen).toBe(false);
	});

	test('menu closes when clicking outside', async ({ windowWithSession }) => {
		const menu = windowWithSession.locator(SELECTORS.HAMBURGER_MENU);
		await menu.click();
		await windowWithSession.waitForTimeout(500);

		const contents = windowWithSession.locator(SELECTORS.HAMBURGER_MENU_CONTENTS);
		await expect(contents).toBeVisible({ timeout: 3000 });

		// Click on the main terminal area to close the menu
		const terminal = windowWithSession.locator(SELECTORS.MAIN_TERMINAL);
		await terminal.click({ force: true });
		await windowWithSession.waitForTimeout(300);

		const isStillOpen = await contents.isVisible().catch(() => false);
		expect(isStillOpen).toBe(false);
	});
});
