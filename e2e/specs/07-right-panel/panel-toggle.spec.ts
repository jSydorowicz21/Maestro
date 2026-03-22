/**
 * Right Panel Toggle E2E Tests
 *
 * Verifies that keyboard shortcuts open specific right panel tabs
 * and that switching between tabs shows the correct panel content.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Right Panel Tab Switching', () => {
	test('Ctrl+Shift+F opens Files tab and shows files panel', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+Shift+f');
		await windowWithSession.waitForTimeout(500);

		const filesTab = windowWithSession.locator(SELECTORS.FILES_TAB);
		await expect(filesTab).toBeVisible({ timeout: 5000 });

		// The files PANEL (content area) should be visible, not just the tab
		const filesPanel = windowWithSession.locator(SELECTORS.FILES_PANEL);
		await expect(filesPanel).toBeVisible({ timeout: 5000 });

		// History panel should NOT be showing
		const historyPanel = windowWithSession.locator(SELECTORS.HISTORY_PANEL);
		await expect(historyPanel).not.toBeVisible({ timeout: 2000 });
	});

	test('Ctrl+Shift+H opens History tab and shows history panel', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+Shift+h');
		await windowWithSession.waitForTimeout(500);

		const historyTab = windowWithSession.locator(SELECTORS.HISTORY_TAB);
		await expect(historyTab).toBeVisible({ timeout: 5000 });

		// The history PANEL content should be visible
		const historyPanel = windowWithSession.locator(SELECTORS.HISTORY_PANEL);
		await expect(historyPanel).toBeVisible({ timeout: 5000 });

		// Files panel should NOT be showing
		const filesPanel = windowWithSession.locator(SELECTORS.FILES_PANEL);
		await expect(filesPanel).not.toBeVisible({ timeout: 2000 });
	});

	test('Ctrl+Shift+1 opens Auto Run tab', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+Shift+1');
		await windowWithSession.waitForTimeout(500);

		// The auto run tab button should be visible
		const autoRunTab = windowWithSession.locator(SELECTORS.AUTORUN_TAB);
		await expect(autoRunTab).toBeVisible({ timeout: 5000 });

		// The auto run panel may or may not be visible (depends on document configuration)
		// But the history panel should NOT be showing since we switched away from it
		const historyPanel = windowWithSession.locator(SELECTORS.HISTORY_PANEL);
		await expect(historyPanel).not.toBeVisible({ timeout: 2000 });
	});

	test('sequential tab switches show the correct panel each time', async ({ windowWithSession }) => {
		// Open Files
		await windowWithSession.keyboard.press('Control+Shift+f');
		await windowWithSession.waitForTimeout(500);
		await expect(windowWithSession.locator(SELECTORS.FILES_PANEL)).toBeVisible({ timeout: 5000 });

		// Switch to History
		await windowWithSession.keyboard.press('Control+Shift+h');
		await windowWithSession.waitForTimeout(500);
		await expect(windowWithSession.locator(SELECTORS.HISTORY_PANEL)).toBeVisible({ timeout: 5000 });
		await expect(windowWithSession.locator(SELECTORS.FILES_PANEL)).not.toBeVisible({ timeout: 2000 });

		// Switch to Auto Run
		await windowWithSession.keyboard.press('Control+Shift+1');
		await windowWithSession.waitForTimeout(500);
		// Auto Run tab should be visible (panel content depends on document state)
		await expect(windowWithSession.locator(SELECTORS.AUTORUN_TAB)).toBeVisible({ timeout: 5000 });
		await expect(windowWithSession.locator(SELECTORS.HISTORY_PANEL)).not.toBeVisible({ timeout: 2000 });

		// Switch back to Files
		await windowWithSession.keyboard.press('Control+Shift+f');
		await windowWithSession.waitForTimeout(500);
		await expect(windowWithSession.locator(SELECTORS.FILES_PANEL)).toBeVisible({ timeout: 5000 });
	});
});
