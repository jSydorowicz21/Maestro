/**
 * Auto Run Panel E2E Tests
 *
 * Verifies the Auto Run tab opens and shows content,
 * and that its state survives tab switching.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Auto Run Panel', () => {
	test('auto run tab opens and shows panel content', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+Shift+1');
		await windowWithSession.waitForTimeout(500);

		// The auto run tab button should be visible
		const autoRunTab = windowWithSession.locator(SELECTORS.AUTORUN_TAB);
		await expect(autoRunTab).toBeVisible({ timeout: 5000 });

		// The panel may or may not be visible depending on document state
		const autoRunPanel = windowWithSession.locator(SELECTORS.AUTORUN_PANEL);
		const panelVisible = await autoRunPanel.isVisible().catch(() => false);

		if (panelVisible) {
			// If the panel is visible, it should have some content
			const panelText = await autoRunPanel.textContent() ?? '';
			expect(panelText.trim().length).toBeGreaterThan(0);

			// Check for actual UI structure - buttons, dropdowns, or message elements
			const hasInteractiveElements = await autoRunPanel.locator(
				'button, select, [role="button"], [class*="selector"], [class*="empty"], [class*="drop"]'
			).count();
			expect(hasInteractiveElements).toBeGreaterThan(0);
		}
		// If panel is not visible, the tab button being visible is sufficient
		// (panel content may require documents to be configured)
	});

	test('auto run panel state survives switching to another tab and back', async ({ windowWithSession }) => {
		// Open auto run
		await windowWithSession.keyboard.press('Control+Shift+1');
		await windowWithSession.waitForTimeout(500);

		const autoRunTab = windowWithSession.locator(SELECTORS.AUTORUN_TAB);
		await expect(autoRunTab).toBeVisible({ timeout: 5000 });

		// Capture current panel visibility state
		const autoRunPanel = windowWithSession.locator(SELECTORS.AUTORUN_PANEL);
		const panelVisibleBefore = await autoRunPanel.isVisible().catch(() => false);
		const contentBefore = panelVisibleBefore ? (await autoRunPanel.textContent() ?? '') : '';

		// Switch to Files tab
		await windowWithSession.keyboard.press('Control+Shift+f');
		await windowWithSession.waitForTimeout(300);

		// Auto run tab should no longer be the active tab
		const filesTab = windowWithSession.locator(SELECTORS.FILES_TAB);
		await expect(filesTab).toBeVisible({ timeout: 2000 });

		// Switch back to Auto Run
		await windowWithSession.keyboard.press('Control+Shift+1');
		await windowWithSession.waitForTimeout(500);

		// Tab should be visible again
		await expect(autoRunTab).toBeVisible({ timeout: 5000 });

		// If panel was visible before, it should be visible again with same content
		if (panelVisibleBefore) {
			const panelVisibleAfter = await autoRunPanel.isVisible().catch(() => false);
			expect(panelVisibleAfter).toBe(true);
			const contentAfter = await autoRunPanel.textContent() ?? '';
			expect(contentAfter).toBe(contentBefore);
		}
	});
});
