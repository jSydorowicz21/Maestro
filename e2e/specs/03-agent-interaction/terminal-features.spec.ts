/**
 * Terminal Features E2E Tests
 *
 * Tests terminal-specific behaviors: content preservation after panel
 * toggles, and layout correctness (input below terminal).
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Terminal Features', () => {
	test('terminal preserves content after right panel toggle', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		const terminal = windowWithSession.locator(SELECTORS.MAIN_TERMINAL);

		// Send a message to create terminal content
		await textarea.fill('preservation test content');
		await windowWithSession.keyboard.press('Control+Enter');
		await windowWithSession.waitForTimeout(5000);

		const beforeText = await terminal.textContent() ?? '';
		expect(beforeText).toContain('mock Claude');

		// Toggle right panel open and closed via keyboard shortcut
		await windowWithSession.keyboard.press('Control+Shift+f');
		await windowWithSession.waitForTimeout(500);
		await windowWithSession.keyboard.press('Control+Shift+f');
		await windowWithSession.waitForTimeout(500);

		// Content must be preserved
		const afterText = await terminal.textContent() ?? '';
		expect(afterText).toContain('mock Claude');
	});

	test('input area is positioned below terminal output', async ({ windowWithSession }) => {
		const terminal = windowWithSession.locator(SELECTORS.MAIN_TERMINAL);
		const inputArea = windowWithSession.locator(SELECTORS.INPUT_AREA);

		const termBox = await terminal.boundingBox();
		const inputBox = await inputArea.boundingBox();

		expect(termBox).toBeTruthy();
		expect(inputBox).toBeTruthy();

		if (termBox && inputBox) {
			// Input area's top edge must be below terminal's top edge
			expect(inputBox.y).toBeGreaterThan(termBox.y);
		}
	});
});
