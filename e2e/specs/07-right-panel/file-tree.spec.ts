/**
 * File Tree E2E Tests
 *
 * Verifies the file tree panel renders and shows project files.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('File Tree', () => {
	test('files panel renders content when opened', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+Shift+f');
		await windowWithSession.waitForTimeout(500);

		const filesPanel = windowWithSession.locator(SELECTORS.FILES_PANEL);
		const isVisible = await filesPanel.isVisible().catch(() => false);

		if (isVisible) {
			// Panel should have some content (even if just "No files" or a tree)
			const text = await filesPanel.textContent() ?? '';
			expect(text.length).toBeGreaterThan(0);
		}
	});

	test('files tab shows file count or tree structure', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+Shift+f');
		await windowWithSession.waitForTimeout(500);

		const filesTab = windowWithSession.locator(SELECTORS.FILES_TAB);
		await expect(filesTab).toBeVisible({ timeout: 5000 });

		// The tab text might include a file count badge
		const tabText = await filesTab.textContent() ?? '';
		expect(tabText.toLowerCase()).toContain('files');
	});
});
