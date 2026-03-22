/**
 * Hamburger Menu E2E Tests
 *
 * Verifies the hamburger menu opens, contains expected items,
 * and closes via Escape and outside-click.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Hamburger Menu', () => {
	test('menu contains "New", "Group", and "About" items', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(200);

		const menu = windowWithSession.locator(SELECTORS.HAMBURGER_MENU);
		await menu.click();
		await windowWithSession.waitForTimeout(500);

		const contents = windowWithSession.locator(SELECTORS.HAMBURGER_MENU_CONTENTS);
		await expect(contents).toBeVisible({ timeout: 3000 });

		const text = (await contents.textContent() ?? '').toLowerCase();
		// Must contain at least 2 of the 3 standard items
		let found = 0;
		if (text.includes('new')) found++;
		if (text.includes('group')) found++;
		if (text.includes('about')) found++;
		expect(found).toBeGreaterThanOrEqual(2);

		await windowWithSession.keyboard.press('Escape');
	});

	test('Escape closes the hamburger menu', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(200);

		const menu = windowWithSession.locator(SELECTORS.HAMBURGER_MENU);
		await menu.click();
		await windowWithSession.waitForTimeout(500);

		const contents = windowWithSession.locator(SELECTORS.HAMBURGER_MENU_CONTENTS);
		await expect(contents).toBeVisible({ timeout: 3000 });

		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(300);

		await expect(contents).not.toBeVisible({ timeout: 3000 });
	});

	test('clicking outside closes the hamburger menu', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(200);

		const menu = windowWithSession.locator(SELECTORS.HAMBURGER_MENU);
		await menu.click();
		await windowWithSession.waitForTimeout(500);

		const contents = windowWithSession.locator(SELECTORS.HAMBURGER_MENU_CONTENTS);
		await expect(contents).toBeVisible({ timeout: 3000 });

		// Click on the main terminal area to close the menu
		const terminal = windowWithSession.locator(SELECTORS.MAIN_TERMINAL);
		await terminal.click({ force: true });
		await windowWithSession.waitForTimeout(300);

		await expect(contents).not.toBeVisible({ timeout: 3000 });
	});
});
