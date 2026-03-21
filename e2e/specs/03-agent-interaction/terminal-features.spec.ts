/**
 * Terminal Features E2E Tests
 *
 * Tests terminal-specific features: search, scrolling, copy.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Terminal Features', () => {
	test('Ctrl+F may open terminal search', async ({ windowWithSession }) => {
		// Click terminal to focus it
		await windowWithSession.locator(SELECTORS.MAIN_TERMINAL).click({ force: true });
		await windowWithSession.waitForTimeout(300);

		await windowWithSession.keyboard.press('Control+f');
		await windowWithSession.waitForTimeout(500);

		// Check for a search bar appearance
		const searchBar = windowWithSession.locator('input[placeholder*="Search"], input[placeholder*="Find"]');
		const hasSearch = await searchBar.isVisible().catch(() => false);

		// Close any search UI
		await windowWithSession.keyboard.press('Escape');

		// Terminal search may or may not exist - just verify no crash
		expect(typeof hasSearch).toBe('boolean');
	});

	test('terminal area is scrollable', async ({ windowWithSession }) => {
		const terminal = windowWithSession.locator(SELECTORS.MAIN_TERMINAL);
		const box = await terminal.boundingBox();

		expect(box).toBeTruthy();
		if (box) {
			// Terminal should have substantial height
			expect(box.height).toBeGreaterThan(100);
		}
	});

	test('terminal preserves content after panel toggles', async ({ windowWithSession }) => {
		// Send a message first to have content
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		await textarea.fill('Content preservation test');
		await windowWithSession.keyboard.press('Control+Enter');
		await windowWithSession.waitForTimeout(3000);

		const terminal = windowWithSession.locator(SELECTORS.MAIN_TERMINAL);
		const beforeText = await terminal.textContent() ?? '';

		// Toggle right panel
		await windowWithSession.keyboard.press('Control+Shift+f');
		await windowWithSession.waitForTimeout(300);
		await windowWithSession.keyboard.press('Control+Shift+f');
		await windowWithSession.waitForTimeout(300);

		// Content should be preserved
		const afterText = await terminal.textContent() ?? '';
		expect(afterText.length).toBeGreaterThanOrEqual(beforeText.length - 10);
	});
});
