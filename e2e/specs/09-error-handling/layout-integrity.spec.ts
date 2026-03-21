/**
 * Layout Integrity E2E Tests
 *
 * Verifies the three-panel layout remains structurally sound
 * across various interactions.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Layout Integrity', () => {
	test('three-panel layout has correct left-to-right order', async ({ windowWithSession }) => {
		// Ensure panels are visible
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(200);

		const sessionList = windowWithSession.locator(SELECTORS.SESSION_LIST);
		const terminal = windowWithSession.locator(SELECTORS.MAIN_TERMINAL);

		const leftBox = await sessionList.boundingBox();
		const centerBox = await terminal.boundingBox();

		if (leftBox && centerBox) {
			// Session list should be to the left of the terminal
			expect(leftBox.x).toBeLessThan(centerBox.x);
		}
	});

	test('header controls stay at top during scroll', async ({ windowWithSession }) => {
		const header = windowWithSession.locator(SELECTORS.HEADER_CONTROLS);
		const headerBox = await header.boundingBox();

		expect(headerBox).toBeTruthy();
		if (headerBox) {
			// Header should be near the top of the window
			expect(headerBox.y).toBeLessThan(100);
		}
	});

	test('input area stays at bottom of main panel', async ({ windowWithSession }) => {
		const inputArea = windowWithSession.locator(SELECTORS.INPUT_AREA);
		const inputBox = await inputArea.boundingBox();
		const terminal = windowWithSession.locator(SELECTORS.MAIN_TERMINAL);
		const termBox = await terminal.boundingBox();

		expect(inputBox).toBeTruthy();
		expect(termBox).toBeTruthy();
		if (inputBox && termBox) {
			// Input should be below the terminal content
			expect(inputBox.y).toBeGreaterThan(termBox.y);
		}
	});

	test('layout survives window focus/blur cycle', async ({ windowWithSession }) => {
		// Simulate focus change by clicking different areas rapidly
		await windowWithSession.locator(SELECTORS.SESSION_LIST).click({ force: true });
		await windowWithSession.waitForTimeout(100);
		await windowWithSession.locator(SELECTORS.MAIN_TERMINAL).click({ force: true });
		await windowWithSession.waitForTimeout(100);
		await windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`).click();
		await windowWithSession.waitForTimeout(100);

		// All elements should still be rendered correctly
		await expect(windowWithSession.locator(SELECTORS.SESSION_LIST)).toBeVisible({ timeout: 3000 });
		await expect(windowWithSession.locator(SELECTORS.MAIN_TERMINAL)).toBeVisible({ timeout: 3000 });
		await expect(windowWithSession.locator(SELECTORS.INPUT_AREA)).toBeVisible({ timeout: 3000 });
	});
});
