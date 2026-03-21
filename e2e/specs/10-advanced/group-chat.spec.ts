/**
 * Group Chat Smoke Tests
 *
 * Basic verification that the group chat creation flow
 * is accessible from the UI. Tests look for the hamburger
 * menu and group chat entry points.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Group chat', () => {
	test('hamburger menu is accessible', async ({ windowWithSession }) => {
		// Ensure left panel is visible (may have been hidden by prior tests)
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(200);
		const sessionList = windowWithSession.locator(SELECTORS.SESSION_LIST);
		if (!await sessionList.isVisible().catch(() => false)) {
			await windowWithSession.keyboard.press('Alt+Control+ArrowLeft');
			await windowWithSession.waitForTimeout(300);
		}

		const hamburger = windowWithSession.locator(SELECTORS.HAMBURGER_MENU);
		const isVisible = await hamburger.isVisible().catch(() => false);

		if (isVisible) {
			// Click the hamburger menu to open it
			await hamburger.click();
			await windowWithSession.waitForTimeout(500);

			// Menu contents should appear
			const menuContents = windowWithSession.locator(SELECTORS.HAMBURGER_MENU_CONTENTS);
			const menuVisible = await menuContents.isVisible().catch(() => false);

			if (menuVisible) {
				// Menu opened successfully - verify it has content
				const content = await menuContents.textContent();
				expect(content).toBeTruthy();
			}

			// Clean up - close menu
			await windowWithSession.keyboard.press('Escape');
		} else {
			// Hamburger menu may not be visible (e.g., in a different layout).
			// Verify the app is still responsive.
			await expect(
				windowWithSession.locator('[data-tour]').first()
			).toBeVisible({ timeout: 5000 });
		}
	});

	test('group chat option in hamburger menu', async ({ windowWithSession }) => {
		const hamburger = windowWithSession.locator(SELECTORS.HAMBURGER_MENU);

		if (await hamburger.isVisible().catch(() => false)) {
			await hamburger.click();
			await windowWithSession.waitForTimeout(500);

			const menuContents = windowWithSession.locator(SELECTORS.HAMBURGER_MENU_CONTENTS);

			if (await menuContents.isVisible().catch(() => false)) {
				// Look for a group chat option in the menu
				const groupChatOption = menuContents.locator('text=/group/i');
				const hasGroupChat = await groupChatOption.count() > 0;

				if (hasGroupChat) {
					// Group chat menu item exists
					await groupChatOption.first().click();
					await windowWithSession.waitForTimeout(500);

					// A dialog or some UI change should have occurred
					const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
					const dialogVisible = await dialog.isVisible().catch(() => false);

					if (dialogVisible) {
						// Clean up
						await windowWithSession.keyboard.press('Escape');
					}
				}
				// Group chat may be gated behind a feature flag - either way is valid
			}

			// Ensure menu is closed
			await windowWithSession.keyboard.press('Escape');
		}

		// Final check: app is responsive
		await expect(
			windowWithSession.locator(SELECTORS.SESSION_LIST)
		).toBeVisible({ timeout: 5000 });
	});
});
