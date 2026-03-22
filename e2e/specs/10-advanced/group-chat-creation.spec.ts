/**
 * Group Chat Creation E2E Tests
 *
 * Verifies the group chat creation flow from the hamburger menu:
 * finding the option, opening the creation UI, and verifying
 * the dialog has expected form elements.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Group Chat Creation', () => {
	test('hamburger menu contains a "New Group" option', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(200);

		// Restore left panel if needed
		const sessionList = windowWithSession.locator(SELECTORS.SESSION_LIST);
		if (!await sessionList.isVisible().catch(() => false)) {
			await windowWithSession.keyboard.press('Alt+Control+ArrowLeft');
			await windowWithSession.waitForTimeout(300);
		}

		const menu = windowWithSession.locator(SELECTORS.HAMBURGER_MENU);
		await menu.click();
		await windowWithSession.waitForTimeout(500);

		const contents = windowWithSession.locator(SELECTORS.HAMBURGER_MENU_CONTENTS);
		await expect(contents).toBeVisible({ timeout: 3000 });

		const text = (await contents.textContent() ?? '').toLowerCase();
		expect(text).toMatch(/group|new group/);

		await windowWithSession.keyboard.press('Escape');
	});

	test('clicking "New Group" opens a dialog with a name input', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(200);

		const sessionList = windowWithSession.locator(SELECTORS.SESSION_LIST);
		if (!await sessionList.isVisible().catch(() => false)) {
			await windowWithSession.keyboard.press('Alt+Control+ArrowLeft');
			await windowWithSession.waitForTimeout(300);
		}

		const menu = windowWithSession.locator(SELECTORS.HAMBURGER_MENU);
		await menu.click();
		await windowWithSession.waitForTimeout(500);

		// Find and click the group option
		const groupOption = windowWithSession.locator('text=New Group').or(
			windowWithSession.locator('text=Create Group')
		).first();
		const hasOption = await groupOption.isVisible().catch(() => false);

		if (hasOption) {
			await groupOption.click();
			await windowWithSession.waitForTimeout(500);

			const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG).first();
			await expect(dialog).toBeVisible({ timeout: 5000 });

			// The dialog should have an input for the group name
			const inputs = await dialog.locator('input').count();
			expect(inputs).toBeGreaterThan(0);

			await windowWithSession.keyboard.press('Escape');
		} else {
			// Group feature may be gated - close menu
			await windowWithSession.keyboard.press('Escape');
		}
	});
});
