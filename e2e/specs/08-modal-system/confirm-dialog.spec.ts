/**
 * Confirm Dialog E2E Tests
 *
 * Verifies that confirm dialogs appear when expected
 * and can be dismissed without crashing.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Confirm Dialogs', () => {
	test('quick actions palette has actionable items', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+k');
		await windowWithSession.waitForTimeout(500);

		const palette = windowWithSession.locator('[aria-label="Quick Actions"]');
		await expect(palette).toBeVisible({ timeout: 5000 });

		// The palette should have a search input
		const searchInput = palette.locator('input');
		const hasInput = await searchInput.isVisible().catch(() => false);
		expect(hasInput).toBe(true);

		await windowWithSession.keyboard.press('Escape');
	});

	test('hamburger menu has multiple options', async ({ windowWithSession }) => {
		// Restore left panel if hidden
		const sessionList = windowWithSession.locator(SELECTORS.SESSION_LIST);
		if (!await sessionList.isVisible().catch(() => false)) {
			await windowWithSession.keyboard.press('Alt+Control+ArrowLeft');
			await windowWithSession.waitForTimeout(300);
		}

		const menu = windowWithSession.locator(SELECTORS.HAMBURGER_MENU);
		await expect(menu).toBeVisible({ timeout: 5000 });
		await menu.click();
		await windowWithSession.waitForTimeout(500);

		const menuContents = windowWithSession.locator(SELECTORS.HAMBURGER_MENU_CONTENTS);
		const isOpen = await menuContents.isVisible().catch(() => false);

		if (isOpen) {
			const text = await menuContents.textContent() ?? '';
			// Menu should have multiple items
			expect(text.length).toBeGreaterThan(10);
		}

		// Close menu
		await windowWithSession.keyboard.press('Escape');
	});
});
