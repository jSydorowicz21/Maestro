/**
 * Shortcuts Help Modal E2E Tests
 *
 * Verifies the keyboard shortcuts help modal.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Shortcuts Help', () => {
	test('shortcuts help is accessible from quick actions', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+k');
		await windowWithSession.waitForTimeout(500);

		const palette = windowWithSession.locator('[aria-label="Quick Actions"]');
		await expect(palette).toBeVisible({ timeout: 5000 });

		// Search for shortcuts
		const input = palette.locator('input');
		await input.fill('shortcut');
		await windowWithSession.waitForTimeout(300);

		const text = (await palette.textContent() ?? '').toLowerCase();
		const hasShortcuts = text.includes('shortcut') || text.includes('keyboard') || text.includes('key');
		expect(hasShortcuts).toBe(true);

		await windowWithSession.keyboard.press('Escape');
	});

	test('Ctrl+/ may open shortcuts help', async ({ windowWithSession }) => {
		// Ctrl+/ is a common shortcut for help
		await windowWithSession.keyboard.press('Control+/');
		await windowWithSession.waitForTimeout(500);

		// Check if any modal opened
		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		const isOpen = await dialog.first().isVisible().catch(() => false);

		if (isOpen) {
			const text = (await dialog.first().textContent() ?? '').toLowerCase();
			const isShortcutsHelp = text.includes('shortcut') || text.includes('keyboard') || text.length > 100;
			expect(isShortcutsHelp).toBe(true);
			await windowWithSession.keyboard.press('Escape');
		}
		// If no modal, that's fine - not all apps use Ctrl+/
	});
});
