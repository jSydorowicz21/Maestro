/**
 * Wizard Flow E2E Tests
 *
 * Validates the onboarding wizard behavior: that it shows on fresh install,
 * displays agent tiles, and provides navigation controls.
 *
 * Note: The session-factory fixture already completes the wizard flow to
 * create a session. These tests verify wizard elements are accessible
 * by opening the "New Agent" wizard from an existing session context.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Wizard Flow', () => {
	test('new agent wizard opens via Ctrl+Shift+N', async ({ windowWithSession }) => {
		// Open the new agent wizard from the main UI
		await windowWithSession.keyboard.press('Control+Shift+N');
		await windowWithSession.waitForTimeout(500);

		// The "Create New Agent" dialog should appear
		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		await expect(dialog.first()).toBeVisible({ timeout: 5000 });

		// Verify it contains agent-related content
		const dialogText = await dialog.first().textContent();
		expect(dialogText).toBeTruthy();

		// Clean up
		await windowWithSession.keyboard.press('Escape');
	});

	test('wizard has agent type tiles', async ({ windowWithSession }) => {
		// Open the new agent wizard
		await windowWithSession.keyboard.press('Control+Shift+N');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		await expect(dialog.first()).toBeVisible({ timeout: 5000 });

		// The wizard should contain agent type options (e.g. "Claude Code")
		const claudeCodeOption = dialog.locator('text=Claude Code');
		const hasAgentTile = await claudeCodeOption.count() > 0;
		expect(hasAgentTile).toBe(true);

		// Clean up
		await windowWithSession.keyboard.press('Escape');
	});

	test('wizard dialog has a name input field', async ({ windowWithSession }) => {
		// Open the new agent wizard
		await windowWithSession.keyboard.press('Control+Shift+N');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		await expect(dialog.first()).toBeVisible({ timeout: 5000 });

		// The wizard dialog should contain an input for the agent name
		const nameInput = dialog.locator('input').first();
		await expect(nameInput).toBeVisible({ timeout: 5000 });

		// Verify the input is interactive
		await nameInput.fill('Test Agent Name');
		const value = await nameInput.inputValue();
		expect(value).toBe('Test Agent Name');

		// Clean up
		await windowWithSession.keyboard.press('Escape');
	});

	test('wizard dialog closes on Escape', async ({ windowWithSession }) => {
		// Open the wizard
		await windowWithSession.keyboard.press('Control+Shift+N');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		await expect(dialog.first()).toBeVisible({ timeout: 5000 });

		// Press Escape to close
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(500);

		// Dialog should be gone
		await expect(dialog).not.toBeVisible({ timeout: 5000 });
	});
});
