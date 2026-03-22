/**
 * Tab Persistence E2E Tests
 *
 * Verifies input state persists across modal overlays and tab switches.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Tab Persistence', () => {
	test('input text survives opening and closing settings modal', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		await textarea.fill('persistent text');
		expect(await textarea.inputValue()).toBe('persistent text');

		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(300);
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(300);

		expect(await textarea.inputValue()).toBe('persistent text');
		await textarea.fill('');
	});

	test('creating a new tab and switching back preserves input', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		await textarea.fill('tab-one-content');

		// Create new tab (Meta+T = Ctrl+T on Windows)
		await windowWithSession.keyboard.press('Control+t');
		await windowWithSession.waitForTimeout(1000);

		// New tab should have different input
		const newTabValue = await textarea.inputValue();
		expect(newTabValue).not.toBe('tab-one-content');

		// Close extra tab to go back
		await windowWithSession.keyboard.press('Control+w');
		await windowWithSession.waitForTimeout(500);

		// Original content should be restored
		expect(await textarea.inputValue()).toBe('tab-one-content');
		await textarea.fill('');
	});
});
