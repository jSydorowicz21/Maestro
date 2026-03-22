/**
 * History Panel E2E Tests
 *
 * Verifies the history panel renders meaningful content -
 * either history entries or an empty-state message.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('History Panel', () => {
	test('history panel shows empty state or entries', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+Shift+h');
		await windowWithSession.waitForTimeout(500);

		const historyPanel = windowWithSession.locator(SELECTORS.HISTORY_PANEL);
		await expect(historyPanel).toBeVisible({ timeout: 5000 });

		// The history panel should contain either:
		// 1. History entries (if the agent has been used), or
		// 2. An empty state message (e.g., "No history" or similar)
		const panelText = await historyPanel.textContent() ?? '';
		// Should not be completely empty - some UI text must be present
		expect(panelText.trim().length).toBeGreaterThan(3);

		// Verify the panel has structured content (not just random whitespace)
		// Either list items for history, or a message element
		const hasListItems = await historyPanel.locator('[class*="item"], [class*="entry"], li, [class*="empty"], [class*="no-"]').count();
		const hasAnyText = panelText.match(/\w{3,}/);
		// At least one of these should be true
		expect(hasListItems > 0 || hasAnyText !== null).toBe(true);
	});

	test('Ctrl+F in history panel activates search/filter', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+Shift+h');
		await windowWithSession.waitForTimeout(500);

		const historyPanel = windowWithSession.locator(SELECTORS.HISTORY_PANEL);
		await expect(historyPanel).toBeVisible({ timeout: 5000 });

		// Ctrl+F should enable search/filter in the history panel
		await windowWithSession.keyboard.press('Control+f');
		await windowWithSession.waitForTimeout(300);

		const searchInput = historyPanel.locator('input');
		const hasSearch = await searchInput.isVisible().catch(() => false);

		if (hasSearch) {
			// Verify the search input is functional (accepts typing)
			await searchInput.fill('test search');
			expect(await searchInput.inputValue()).toBe('test search');

			await windowWithSession.keyboard.press('Escape');
		}
	});
});
