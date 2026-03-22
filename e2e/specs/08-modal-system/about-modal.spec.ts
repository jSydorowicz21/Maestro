/**
 * About Modal E2E Tests
 *
 * Verifies the About modal opens from the hamburger menu
 * and displays version information.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('About Modal', () => {
	test('about modal opens from hamburger menu and shows version', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(200);

		const menu = windowWithSession.locator(SELECTORS.HAMBURGER_MENU);
		await menu.click();
		await windowWithSession.waitForTimeout(500);

		const menuContents = windowWithSession.locator(SELECTORS.HAMBURGER_MENU_CONTENTS);
		await expect(menuContents).toBeVisible({ timeout: 3000 });

		// Click the About option
		const aboutOption = menuContents.locator('text=About').first();
		await expect(aboutOption).toBeVisible({ timeout: 3000 });
		await aboutOption.click();
		await windowWithSession.waitForTimeout(500);

		// The about modal should appear as a dialog
		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG).first();
		await expect(dialog).toBeVisible({ timeout: 5000 });

		// Dialog must contain version information (e.g., "v0.x" or "version")
		const dialogText = (await dialog.textContent() ?? '').toLowerCase();
		expect(dialogText).toMatch(/version|v\d+\.\d+|maestro/);

		// Close and verify it dismissed
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(300);
		await expect(dialog).not.toBeVisible({ timeout: 3000 });
	});
});
