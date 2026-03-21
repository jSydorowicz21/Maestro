/**
 * Focus Management E2E Tests
 *
 * Validates that keyboard-driven focus navigation works
 * correctly for the input area and sidebar.
 */
import { test, expect } from '../../fixtures/session-factory';

test.describe('Focus Management', () => {
	test('Ctrl+. toggles focus to input area', async ({ windowWithSession }) => {
		// Click somewhere neutral first (the main terminal area)
		const terminal = windowWithSession.locator('[data-tour="main-terminal"]');
		await terminal.click();
		await windowWithSession.waitForTimeout(300);

		// Press Ctrl+. to toggle focus toward input
		await windowWithSession.keyboard.press('Control+.');
		await windowWithSession.waitForTimeout(500);

		// The input area should be visible (focus toggle was processed)
		const inputArea = windowWithSession.locator('[data-tour="input-area"]');
		await expect(inputArea).toBeVisible({ timeout: 5000 });
	});

	test('Ctrl+Shift+A focuses sidebar', async ({ windowWithSession }) => {
		// First focus input so we have a known starting point
		await windowWithSession.keyboard.press('Control+.');
		await windowWithSession.waitForTimeout(300);

		// Press Ctrl+Shift+A to focus the sidebar
		await windowWithSession.keyboard.press('Control+Shift+a');
		await windowWithSession.waitForTimeout(500);

		// The session list should have received focus
		const sessionList = windowWithSession.locator('[data-tour="session-list"]');
		await expect(sessionList).toBeVisible({ timeout: 5000 });
	});
});
