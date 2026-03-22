/**
 * Wizard Flow E2E Tests
 *
 * Validates the new agent wizard: opens via shortcut, contains agent
 * type tiles, has a name input that accepts text, and closes on Escape.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Wizard Flow', () => {
	test('Ctrl+Shift+N opens wizard with Claude Code agent tile', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+Shift+N');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		await expect(dialog.first()).toBeVisible({ timeout: 5000 });

		// Wizard must contain "Claude Code" as an agent type option
		const claudeCodeOption = dialog.locator('text=Claude Code');
		await expect(claudeCodeOption.first()).toBeVisible({ timeout: 3000 });

		await windowWithSession.keyboard.press('Escape');
	});

	test('wizard name input accepts and retains typed text', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+Shift+N');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		await expect(dialog.first()).toBeVisible({ timeout: 5000 });

		const nameInput = dialog.locator('input').first();
		await expect(nameInput).toBeVisible({ timeout: 3000 });

		// Type a name and verify it sticks
		await nameInput.fill('Wizard Test Agent');
		expect(await nameInput.inputValue()).toBe('Wizard Test Agent');

		// Clear and verify
		await nameInput.fill('');
		expect(await nameInput.inputValue()).toBe('');

		await windowWithSession.keyboard.press('Escape');
	});

	test('wizard dialog closes on Escape and does not persist', async ({ windowWithSession }) => {
		// Open
		await windowWithSession.keyboard.press('Control+Shift+N');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		await expect(dialog.first()).toBeVisible({ timeout: 5000 });

		// Close
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(500);

		// Dialog should be gone
		await expect(dialog).not.toBeVisible({ timeout: 5000 });

		// Main UI should still be functional
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		await textarea.fill('after wizard close');
		expect(await textarea.inputValue()).toBe('after wizard close');
		await textarea.fill('');
	});
});
