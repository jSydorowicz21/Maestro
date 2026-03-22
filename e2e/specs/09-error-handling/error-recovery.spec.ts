/**
 * Error Recovery E2E Tests
 *
 * Verifies the app recovers gracefully from error conditions
 * and remains fully functional afterward.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Error Recovery', () => {
	test('input accepts new messages after agent error', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);

		// Trigger an error
		await textarea.fill('__ERROR_AUTH__');
		await windowWithSession.keyboard.press('Control+Enter');
		await windowWithSession.waitForTimeout(3000);

		// After the error, the textarea should still be editable
		await expect(textarea).toBeEditable({ timeout: 5000 });

		// Type a new message and verify it's accepted
		await textarea.fill('message after error');
		expect(await textarea.inputValue()).toBe('message after error');
		await textarea.fill('');
	});

	test('settings modal still opens after agent crash', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);

		// Trigger a crash
		await textarea.fill('__CRASH__');
		await windowWithSession.keyboard.press('Control+Enter');
		await windowWithSession.waitForTimeout(3000);

		// Settings should still open normally
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG).first();
		await expect(dialog).toBeVisible({ timeout: 5000 });

		// And it should have interactive controls (not a frozen/broken UI)
		const controls = await dialog.locator('input, select, textarea, [role="switch"]').count();
		expect(controls).toBeGreaterThan(0);

		await windowWithSession.keyboard.press('Escape');
	});

	test('rapid open/close settings cycle completes without stuck modal', async ({ windowWithSession }) => {
		// Rapidly open/close settings 5 times
		for (let i = 0; i < 5; i++) {
			await windowWithSession.keyboard.press('Control+,');
			await windowWithSession.waitForTimeout(200);
			await windowWithSession.keyboard.press('Escape');
			await windowWithSession.waitForTimeout(200);
		}

		// No modal should remain open
		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		const dialogCount = await dialog.count();
		expect(dialogCount).toBe(0);

		// And the textarea should still work
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		await textarea.fill('still working');
		expect(await textarea.inputValue()).toContain('still working');
		await textarea.fill('');
	});
});
