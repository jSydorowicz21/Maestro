/**
 * Agent Configuration E2E Tests
 *
 * Verifies agent-specific settings are accessible in the settings modal.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Agent Configuration', () => {
	test('settings shows agent-related configuration', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG).first();
		await expect(dialog).toBeVisible({ timeout: 5000 });

		const text = (await dialog.textContent() ?? '').toLowerCase();
		const hasAgentConfig =
			text.includes('agent') ||
			text.includes('claude') ||
			text.includes('codex') ||
			text.includes('provider');
		expect(hasAgentConfig).toBe(true);

		await windowWithSession.keyboard.press('Escape');
	});

	test('settings has multiple sections or tabs', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG).first();
		await expect(dialog).toBeVisible({ timeout: 5000 });

		// Settings should have clickable tabs/sections
		const buttons = await dialog.locator('button').count();
		// Should have at least a few buttons (tabs + close)
		expect(buttons).toBeGreaterThan(2);

		await windowWithSession.keyboard.press('Escape');
	});
});
