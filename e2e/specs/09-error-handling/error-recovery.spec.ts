/**
 * Error Handling and Recovery Tests
 *
 * Verifies that the app handles edge cases gracefully and remains
 * responsive. Without a mock agent, we test resilience by verifying
 * the app survives keyboard actions and UI interactions without crashing.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Error handling', () => {
	test('app remains stable under normal operation', async ({ windowWithSession }) => {
		// Dismiss any lingering modals and restore panels from prior tests
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(300);

		// Ensure left panel is visible (may have been toggled by earlier tests)
		const sessionList = windowWithSession.locator(SELECTORS.SESSION_LIST);
		if (!await sessionList.isVisible().catch(() => false)) {
			await windowWithSession.keyboard.press('Alt+Control+ArrowLeft');
			await windowWithSession.waitForTimeout(300);
		}

		await expect(sessionList).toBeVisible({ timeout: 10000 });

		const inputArea = windowWithSession.locator(SELECTORS.INPUT_AREA);
		await expect(inputArea).toBeVisible({ timeout: 5000 });

		const terminal = windowWithSession.locator(SELECTORS.MAIN_TERMINAL);
		await expect(terminal).toBeVisible({ timeout: 5000 });

		// Verify data-tour elements exist (app is properly initialized)
		const tourElements = await windowWithSession.locator('[data-tour]').count();
		expect(tourElements).toBeGreaterThan(0);
	});

	test('app survives rapid keyboard input', async ({ windowWithSession }) => {
		const inputArea = windowWithSession.locator(SELECTORS.INPUT_AREA);
		await expect(inputArea).toBeVisible({ timeout: 10000 });

		const textarea = inputArea.locator('textarea');
		await expect(textarea).toBeVisible({ timeout: 5000 });

		// Type rapidly to stress-test the input handling
		await textarea.fill('rapid input test');
		await textarea.fill('');
		await textarea.fill('second rapid input');
		await textarea.fill('');

		// App should still be responsive
		await expect(inputArea).toBeVisible();
		await expect(textarea).toBeEditable();
	});

	test('app survives multiple Escape presses with no open modals', async ({ windowWithSession }) => {
		// Press Escape multiple times when nothing is open
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(300);

		// App should still be fully functional
		const sessionList = windowWithSession.locator(SELECTORS.SESSION_LIST);
		await expect(sessionList).toBeVisible({ timeout: 5000 });

		const inputArea = windowWithSession.locator(SELECTORS.INPUT_AREA);
		await expect(inputArea).toBeVisible({ timeout: 5000 });
	});

	test('app survives opening and closing settings rapidly', async ({ windowWithSession }) => {
		// Rapidly open/close the settings modal
		for (let i = 0; i < 3; i++) {
			await windowWithSession.keyboard.press('Control+,');
			await windowWithSession.waitForTimeout(300);
			await windowWithSession.keyboard.press('Escape');
			await windowWithSession.waitForTimeout(300);
		}

		// App should still be responsive
		const inputArea = windowWithSession.locator(SELECTORS.INPUT_AREA);
		await expect(inputArea).toBeVisible({ timeout: 5000 });

		const textarea = inputArea.locator('textarea');
		await textarea.fill('Still working after rapid modal cycling');
		expect(await textarea.inputValue()).toContain('Still working');
	});
});
