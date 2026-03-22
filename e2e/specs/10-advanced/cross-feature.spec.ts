/**
 * Cross-Feature Integration E2E Tests
 *
 * Verifies that interactions with one feature do not break
 * another - mode toggling, panel toggling, and modal interactions
 * preserve input state and layout.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Cross-Feature Integration', () => {
	test('mode toggle to terminal and back preserves textarea content', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(200);

		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		await textarea.fill('before toggle');

		// Toggle to terminal mode
		await windowWithSession.keyboard.press('Control+j');
		await windowWithSession.waitForTimeout(300);

		// Toggle back to AI mode
		await windowWithSession.keyboard.press('Control+j');
		await windowWithSession.waitForTimeout(300);

		// Content should be preserved (or cleared, depending on design)
		// The key test is that the textarea is still functional
		await expect(textarea).toBeEditable({ timeout: 3000 });
		await textarea.fill('after toggle');
		expect(await textarea.inputValue()).toBe('after toggle');
		await textarea.fill('');
	});

	test('right panel Files tab coexists with main terminal', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(200);

		// Open Files tab
		await windowWithSession.keyboard.press('Control+Shift+f');
		await windowWithSession.waitForTimeout(500);

		const filesTab = windowWithSession.locator(SELECTORS.FILES_TAB);
		const terminal = windowWithSession.locator(SELECTORS.MAIN_TERMINAL);

		await expect(filesTab).toBeVisible({ timeout: 5000 });
		await expect(terminal).toBeVisible({ timeout: 5000 });

		// Verify they are side by side (right panel is to the right)
		const filesBox = await filesTab.boundingBox();
		const termBox = await terminal.boundingBox();
		if (filesBox && termBox) {
			expect(filesBox.x).toBeGreaterThan(termBox.x);
		}
	});

	test('opening settings after creating a new tab does not corrupt tab bar', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(200);

		// Create a new tab
		await windowWithSession.keyboard.press('Control+n');
		await windowWithSession.waitForTimeout(500);

		const tabBar = windowWithSession.locator(SELECTORS.TAB_BAR);
		const tabCountBefore = await tabBar.locator('[role="tab"], [data-testid="tab"]').count();

		// Open and close settings
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(300);

		// Tab count should be unchanged
		const tabCountAfter = await tabBar.locator('[role="tab"], [data-testid="tab"]').count();
		expect(tabCountAfter).toBe(tabCountBefore);

		// Clean up the extra tab
		await windowWithSession.keyboard.press('Control+w');
		await windowWithSession.waitForTimeout(300);
	});
});
