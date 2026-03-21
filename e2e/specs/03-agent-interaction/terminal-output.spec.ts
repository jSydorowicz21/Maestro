/**
 * Terminal Output E2E Tests
 *
 * Verifies the terminal output area renders correctly and handles content.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Terminal Output', () => {
	test('terminal output area has scrollable content region', async ({ windowWithSession }) => {
		const terminal = windowWithSession.locator(SELECTORS.MAIN_TERMINAL);
		await expect(terminal).toBeVisible({ timeout: 5000 });

		// Terminal should have a non-zero height
		const box = await terminal.boundingBox();
		expect(box).toBeTruthy();
		if (box) {
			expect(box.height).toBeGreaterThan(50);
		}
	});

	test('terminal and input area have correct layout', async ({ windowWithSession }) => {
		const terminal = windowWithSession.locator(SELECTORS.MAIN_TERMINAL);
		const inputArea = windowWithSession.locator(SELECTORS.INPUT_AREA);

		const termBox = await terminal.boundingBox();
		const inputBox = await inputArea.boundingBox();

		expect(termBox).toBeTruthy();
		expect(inputBox).toBeTruthy();

		if (termBox && inputBox) {
			// Input area should be below the terminal output
			expect(inputBox.y).toBeGreaterThan(termBox.y);
		}
	});
});
