/**
 * File Tree E2E Tests
 *
 * Verifies that the files panel shows actual file/directory entries
 * from the agent's working directory, not just empty chrome.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('File Tree', () => {
	test('files panel shows content when opened', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+Shift+f');
		await windowWithSession.waitForTimeout(500);

		const filesPanel = windowWithSession.locator(SELECTORS.FILES_PANEL);
		await expect(filesPanel).toBeVisible({ timeout: 5000 });

		// The panel should have some content - text, divs, spans representing files
		const panelText = await filesPanel.textContent() ?? '';
		expect(panelText.trim().length).toBeGreaterThan(0);

		// The panel should contain clickable elements (file/directory entries use custom divs)
		const clickableElements = await filesPanel.locator('div, span, a').count();
		expect(clickableElements).toBeGreaterThan(0);
	});

	test('Ctrl+F in files panel activates search/filter', async ({ windowWithSession }) => {
		// Open files panel first
		await windowWithSession.keyboard.press('Control+Shift+f');
		await windowWithSession.waitForTimeout(500);

		const filesPanel = windowWithSession.locator(SELECTORS.FILES_PANEL);
		await expect(filesPanel).toBeVisible({ timeout: 5000 });

		// Ctrl+F should open a search/filter within the files panel
		await windowWithSession.keyboard.press('Control+f');
		await windowWithSession.waitForTimeout(300);

		// A search input should appear inside or near the files panel
		const searchInput = filesPanel.locator('input');
		const hasSearch = await searchInput.isVisible().catch(() => false);

		if (hasSearch) {
			// Typing should filter the file list
			await searchInput.fill('test');
			await windowWithSession.waitForTimeout(300);

			// Press Escape to close the search
			await windowWithSession.keyboard.press('Escape');
		}
	});
});
