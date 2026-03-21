/**
 * Conductor Profile E2E Tests
 *
 * Verifies the conductor profile (About Me) section in settings.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Conductor Profile', () => {
	test('settings contains conductor or profile section', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG).first();
		await expect(dialog).toBeVisible({ timeout: 5000 });

		const text = (await dialog.textContent() ?? '').toLowerCase();
		const hasProfile =
			text.includes('conductor') ||
			text.includes('about me') ||
			text.includes('profile') ||
			text.includes('your name');
		expect(hasProfile).toBe(true);

		await windowWithSession.keyboard.press('Escape');
	});

	test('settings has a text input or textarea for profile', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG).first();
		await expect(dialog).toBeVisible({ timeout: 5000 });

		// Settings should have input fields (text inputs or textareas)
		const inputs = dialog.locator('input, textarea');
		const inputCount = await inputs.count();
		expect(inputCount).toBeGreaterThan(0);

		await windowWithSession.keyboard.press('Escape');
	});
});
