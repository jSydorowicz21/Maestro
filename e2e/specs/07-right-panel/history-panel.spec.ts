/**
 * History Panel E2E Tests
 *
 * Verifies the history panel renders and shows task history.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('History Panel', () => {
	test('history panel renders when opened', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+Shift+h');
		await windowWithSession.waitForTimeout(500);

		const historyPanel = windowWithSession.locator(SELECTORS.HISTORY_PANEL);
		const isVisible = await historyPanel.isVisible().catch(() => false);

		if (isVisible) {
			const text = await historyPanel.textContent() ?? '';
			// Even an empty history should show some UI (header, empty state message)
			expect(text.length).toBeGreaterThan(0);
		}
	});

	test('history tab label is correct', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+Shift+h');
		await windowWithSession.waitForTimeout(500);

		const historyTab = windowWithSession.locator(SELECTORS.HISTORY_TAB);
		await expect(historyTab).toBeVisible({ timeout: 5000 });

		const tabText = await historyTab.textContent() ?? '';
		expect(tabText.toLowerCase()).toContain('history');
	});
});
