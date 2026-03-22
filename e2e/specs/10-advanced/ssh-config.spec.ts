/**
 * SSH Config E2E Tests
 *
 * Verifies the SSH remote configuration is accessible via the
 * settings modal and that related UI elements are present.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('SSH Config', () => {
	test('settings modal contains SSH or Remote configuration section', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(200);

		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG).first();
		await expect(dialog).toBeVisible({ timeout: 5000 });

		const dialogText = (await dialog.textContent() ?? '').toLowerCase();
		expect(dialogText).toMatch(/ssh|remote/);

		await windowWithSession.keyboard.press('Escape');
	});

	test('clicking SSH/Remote option reveals configuration inputs', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(200);

		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG).first();
		await expect(dialog).toBeVisible({ timeout: 5000 });

		// Look for SSH-related clickable elements (tabs, links, or buttons)
		const sshElement = dialog.locator('text=/ssh|remote/i').first();
		const hasSshElement = await sshElement.isVisible().catch(() => false);

		if (hasSshElement) {
			await sshElement.click();
			await windowWithSession.waitForTimeout(300);

			// After clicking, there should be inputs for SSH configuration
			// (host, port, key path, etc.)
			const inputs = await dialog.locator('input').count();
			expect(inputs).toBeGreaterThan(0);
		}

		await windowWithSession.keyboard.press('Escape');
	});
});
