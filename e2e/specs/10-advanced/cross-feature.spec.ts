/**
 * Cross-Feature Integration E2E Tests
 *
 * Verifies that multiple features work correctly together
 * without interfering with each other.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Cross-Feature Integration', () => {
	test('right panel and main panel coexist', async ({ windowWithSession }) => {
		// Clean slate
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(200);

		// Open right panel via keyboard
		await windowWithSession.keyboard.press('Control+Shift+f');
		await windowWithSession.waitForTimeout(500);

		// Both the right panel tab and main terminal should be visible
		const filesTab = windowWithSession.locator(SELECTORS.FILES_TAB);
		const terminal = windowWithSession.locator(SELECTORS.MAIN_TERMINAL);
		const inputArea = windowWithSession.locator(SELECTORS.INPUT_AREA);

		await expect(filesTab).toBeVisible({ timeout: 5000 });
		await expect(terminal).toBeVisible({ timeout: 5000 });
		await expect(inputArea).toBeVisible({ timeout: 5000 });
	});

	test('mode toggle preserves input functionality', async ({ windowWithSession }) => {
		// Toggle to terminal mode and back
		await windowWithSession.keyboard.press('Control+j');
		await windowWithSession.waitForTimeout(300);
		await windowWithSession.keyboard.press('Control+j');
		await windowWithSession.waitForTimeout(300);

		// Input should still work after double toggle
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		await textarea.fill('works after toggle');
		expect(await textarea.inputValue()).toBe('works after toggle');
		await textarea.fill('');
	});

	test('input area works after all panels toggled', async ({ windowWithSession }) => {
		// Toggle left panel off and on
		await windowWithSession.keyboard.press('Alt+Control+ArrowLeft');
		await windowWithSession.waitForTimeout(200);
		await windowWithSession.keyboard.press('Alt+Control+ArrowLeft');
		await windowWithSession.waitForTimeout(200);

		// Toggle right panel off and on
		await windowWithSession.keyboard.press('Alt+Control+ArrowRight');
		await windowWithSession.waitForTimeout(200);
		await windowWithSession.keyboard.press('Alt+Control+ArrowRight');
		await windowWithSession.waitForTimeout(200);

		// Input should still work
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		await textarea.fill('still works after panel toggles');
		expect(await textarea.inputValue()).toBe('still works after panel toggles');
		await textarea.fill('');
	});

	test('new tab works after settings change', async ({ windowWithSession }) => {
		// Open and close settings
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(300);

		// Create a new tab
		await windowWithSession.keyboard.press('Control+n');
		await windowWithSession.waitForTimeout(500);

		// Tab bar should still be visible with the new tab
		await expect(windowWithSession.locator(SELECTORS.TAB_BAR)).toBeVisible({ timeout: 5000 });
	});
});
