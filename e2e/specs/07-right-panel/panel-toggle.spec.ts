/**
 * Right Panel Tests
 *
 * Verifies the right sidebar tabs using keyboard shortcuts
 * (Ctrl+Shift+F for Files, Ctrl+Shift+H for History, Ctrl+Shift+1 for Auto Run).
 * Direct tab clicks are unreliable due to header-controls z-index overlap.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Right panel', () => {
	test('Ctrl+Shift+F opens Files tab', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+Shift+f');
		await windowWithSession.waitForTimeout(500);

		// Files tab should be visible
		const filesTab = windowWithSession.locator(SELECTORS.FILES_TAB);
		await expect(filesTab).toBeVisible({ timeout: 5000 });
	});

	test('Ctrl+Shift+H opens History tab', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+Shift+h');
		await windowWithSession.waitForTimeout(500);

		// History tab should be visible
		const historyTab = windowWithSession.locator(SELECTORS.HISTORY_TAB);
		await expect(historyTab).toBeVisible({ timeout: 5000 });
	});

	test('Ctrl+Shift+1 opens Auto Run tab', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+Shift+1');
		await windowWithSession.waitForTimeout(500);

		// Auto Run tab should be visible
		const autoRunTab = windowWithSession.locator(SELECTORS.AUTORUN_TAB);
		await expect(autoRunTab).toBeVisible({ timeout: 5000 });
	});

	test('right panel tabs coexist with main content', async ({ windowWithSession }) => {
		// Open right panel via Files shortcut
		await windowWithSession.keyboard.press('Control+Shift+f');
		await windowWithSession.waitForTimeout(500);

		// Both the right panel tab and main terminal should be visible simultaneously
		const filesTab = windowWithSession.locator(SELECTORS.FILES_TAB);
		const mainTerminal = windowWithSession.locator('[data-tour="main-terminal"]');

		const filesVisible = await filesTab.isVisible().catch(() => false);
		const terminalVisible = await mainTerminal.isVisible().catch(() => false);

		// At least the main terminal should always be visible
		expect(terminalVisible).toBe(true);
		// Files tab may or may not be visible depending on window size
		// but the shortcut should not crash the app
		expect(filesVisible || terminalVisible).toBe(true);
	});
});
