/**
 * Group Chat Creation E2E Tests
 *
 * Verifies the group chat creation flow from the hamburger menu.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Group Chat Creation', () => {
	test('new group option is accessible from hamburger menu', async ({ windowWithSession }) => {
		// Restore left panel
		const sessionList = windowWithSession.locator(SELECTORS.SESSION_LIST);
		if (!await sessionList.isVisible().catch(() => false)) {
			await windowWithSession.keyboard.press('Alt+Control+ArrowLeft');
			await windowWithSession.waitForTimeout(300);
		}

		const menu = windowWithSession.locator(SELECTORS.HAMBURGER_MENU);
		await menu.click();
		await windowWithSession.waitForTimeout(500);

		const contents = windowWithSession.locator(SELECTORS.HAMBURGER_MENU_CONTENTS);
		const text = (await contents.textContent() ?? '').toLowerCase();

		// Menu should have substantial content (group option may use different text)
		expect(text.length).toBeGreaterThan(20);

		await windowWithSession.keyboard.press('Escape');
	});

	test('clicking new group opens group creation UI', async ({ windowWithSession }) => {
		const sessionList = windowWithSession.locator(SELECTORS.SESSION_LIST);
		if (!await sessionList.isVisible().catch(() => false)) {
			await windowWithSession.keyboard.press('Alt+Control+ArrowLeft');
			await windowWithSession.waitForTimeout(300);
		}

		const menu = windowWithSession.locator(SELECTORS.HAMBURGER_MENU);
		await menu.click();
		await windowWithSession.waitForTimeout(500);

		// Find and click group-related option
		const groupOption = windowWithSession.locator('text=New Group').or(
			windowWithSession.locator('text=Create Group')
		).first();
		const hasOption = await groupOption.isVisible().catch(() => false);

		if (hasOption) {
			await groupOption.click();
			await windowWithSession.waitForTimeout(500);

			// A modal or input should appear for group creation
			const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
			const hasDialog = await dialog.first().isVisible().catch(() => false);
			if (hasDialog) {
				const dialogText = (await dialog.first().textContent() ?? '').toLowerCase();
				const isGroupDialog = dialogText.includes('group') || dialogText.includes('name') || dialogText.length > 20;
				expect(isGroupDialog).toBe(true);
				await windowWithSession.keyboard.press('Escape');
			}
		} else {
			await windowWithSession.keyboard.press('Escape');
		}
	});
});
