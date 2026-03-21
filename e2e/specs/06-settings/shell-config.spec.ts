/**
 * Shell Configuration E2E Tests
 *
 * Verifies shell-related settings are accessible.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Shell Configuration', () => {
	test('settings modal has shell or environment configuration', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG).first();
		await expect(dialog).toBeVisible({ timeout: 5000 });

		const text = (await dialog.textContent() ?? '').toLowerCase();
		const hasShellConfig =
			text.includes('shell') ||
			text.includes('environment') ||
			text.includes('terminal') ||
			text.includes('path');
		expect(hasShellConfig).toBe(true);

		await windowWithSession.keyboard.press('Escape');
	});

	test('settings has font size or editor configuration', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG).first();
		await expect(dialog).toBeVisible({ timeout: 5000 });

		const text = (await dialog.textContent() ?? '').toLowerCase();
		const hasEditorConfig =
			text.includes('font') ||
			text.includes('size') ||
			text.includes('editor') ||
			text.includes('tab');
		expect(hasEditorConfig).toBe(true);

		await windowWithSession.keyboard.press('Escape');
	});
});
