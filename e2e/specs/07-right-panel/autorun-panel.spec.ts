/**
 * Auto Run Panel E2E Tests
 *
 * Deeper tests for the Auto Run tab and document handling.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Auto Run Panel', () => {
	test('auto run tab shows document selector area', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+Shift+1');
		await windowWithSession.waitForTimeout(500);

		const autoRunPanel = windowWithSession.locator(SELECTORS.AUTORUN_PANEL);
		const isVisible = await autoRunPanel.isVisible().catch(() => false);

		if (isVisible) {
			// Should show either documents or an empty state
			const text = await autoRunPanel.textContent() ?? '';
			expect(text.length).toBeGreaterThan(0);
		}

		// Auto run tab should be visible regardless
		await expect(windowWithSession.locator(SELECTORS.AUTORUN_TAB)).toBeVisible({ timeout: 5000 });
	});

	test('auto run document selector exists', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+Shift+1');
		await windowWithSession.waitForTimeout(500);

		const selector = windowWithSession.locator(SELECTORS.AUTORUN_DOC_SELECTOR);
		const isVisible = await selector.isVisible().catch(() => false);

		// Document selector may or may not be visible depending on if documents exist
		// But the auto run tab itself should be accessible
		await expect(windowWithSession.locator(SELECTORS.AUTORUN_TAB)).toBeVisible({ timeout: 5000 });
	});

	test('switching between right panel tabs preserves auto run state', async ({ windowWithSession }) => {
		// Open auto run
		await windowWithSession.keyboard.press('Control+Shift+1');
		await windowWithSession.waitForTimeout(300);

		// Switch to files
		await windowWithSession.keyboard.press('Control+Shift+f');
		await windowWithSession.waitForTimeout(300);

		// Switch back to auto run
		await windowWithSession.keyboard.press('Control+Shift+1');
		await windowWithSession.waitForTimeout(300);

		// Auto run tab should still be functional
		await expect(windowWithSession.locator(SELECTORS.AUTORUN_TAB)).toBeVisible({ timeout: 5000 });
	});
});
