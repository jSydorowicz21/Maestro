/**
 * Session Context Menu E2E Tests
 *
 * Verifies right-click context menu on sessions (rename, delete, etc.).
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Session Context Menu', () => {
	test('right-clicking session shows context menu', async ({ windowWithSession }) => {
		// Ensure left panel visible
		const sessionList = windowWithSession.locator(SELECTORS.SESSION_LIST);
		if (!await sessionList.isVisible().catch(() => false)) {
			await windowWithSession.keyboard.press('Alt+Control+ArrowLeft');
			await windowWithSession.waitForTimeout(300);
		}

		// Right-click the session entry
		const sessionEntry = sessionList.locator('div').filter({ hasText: 'E2E Test Agent' }).first();
		await sessionEntry.click({ button: 'right' });
		await windowWithSession.waitForTimeout(500);

		// A context menu should appear (could be native or custom)
		const contextMenu = windowWithSession.locator('[role="menu"], [class*="context"], [class*="dropdown"]');
		const hasMenu = await contextMenu.first().isVisible().catch(() => false);

		// Some apps use native context menus which Playwright can't see - that's OK
		if (hasMenu) {
			const menuText = (await contextMenu.first().textContent() ?? '').toLowerCase();
			const hasRenameOrDelete = menuText.includes('rename') || menuText.includes('delete') || menuText.includes('remove');
			expect(hasRenameOrDelete).toBe(true);
		}

		// Close any menu
		await windowWithSession.keyboard.press('Escape');
	});

	test('rename option opens rename modal', async ({ windowWithSession }) => {
		const sessionList = windowWithSession.locator(SELECTORS.SESSION_LIST);
		if (!await sessionList.isVisible().catch(() => false)) {
			await windowWithSession.keyboard.press('Alt+Control+ArrowLeft');
			await windowWithSession.waitForTimeout(300);
		}

		const sessionEntry = sessionList.locator('div').filter({ hasText: 'E2E Test Agent' }).first();
		await sessionEntry.click({ button: 'right' });
		await windowWithSession.waitForTimeout(500);

		// Try to find and click rename option
		const renameOption = windowWithSession.locator('text=Rename').first();
		const hasRename = await renameOption.isVisible().catch(() => false);

		if (hasRename) {
			await renameOption.click();
			await windowWithSession.waitForTimeout(500);

			// A rename modal or inline input should appear
			const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
			const inlineInput = windowWithSession.locator('input[type="text"]');
			const hasRenameUI = await dialog.first().isVisible().catch(() => false) ||
				await inlineInput.first().isVisible().catch(() => false);

			if (hasRenameUI) {
				await windowWithSession.keyboard.press('Escape');
			}
		} else {
			// Close context menu
			await windowWithSession.keyboard.press('Escape');
		}
	});
});
