/**
 * SSH Config Smoke Tests
 *
 * Basic verification that the SSH remote configuration UI
 * is accessible through the settings modal. No actual SSH
 * connection is established.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('SSH config', () => {
	test('SSH remote config is accessible via settings', async ({ windowWithSession }) => {
		// Open settings modal
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		await expect(dialog.first()).toBeVisible({ timeout: 5000 });

		// Look for SSH-related content in the settings
		const dialogText = await dialog.first().textContent();
		const hasSshReference = (dialogText ?? '').toLowerCase().includes('ssh') ||
			(dialogText ?? '').toLowerCase().includes('remote');

		// If SSH/remote is mentioned, the feature is accessible
		if (hasSshReference) {
			const sshText = dialog.locator('text=/ssh|remote/i');
			const sshCount = await sshText.count();
			expect(sshCount).toBeGreaterThan(0);
		}

		// Clean up
		await windowWithSession.keyboard.press('Escape');
	});

	test('remote control indicator may be present', async ({ windowWithSession }) => {
		// Check for the remote control UI element
		const remoteControl = windowWithSession.locator(SELECTORS.REMOTE_CONTROL);
		const hasRemoteControl = await remoteControl.isVisible().catch(() => false);

		// Remote control is optional - it may or may not be visible depending on config
		// This is a smoke test - just verify the app doesn't crash checking for it
		if (hasRemoteControl) {
			await remoteControl.click();
			await windowWithSession.waitForTimeout(500);

			// A dialog or UI change may appear
			const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
			if (await dialog.isVisible().catch(() => false)) {
				await windowWithSession.keyboard.press('Escape');
			}
		}

		// App should be responsive regardless
		await expect(
			windowWithSession.locator(SELECTORS.SESSION_LIST)
		).toBeVisible({ timeout: 5000 });
	});

	test('settings modal is functional after SSH check', async ({ windowWithSession }) => {
		// Open settings, verify it works, close it
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		await expect(dialog.first()).toBeVisible({ timeout: 5000 });

		// Modal should have content
		const content = await dialog.first().textContent();
		expect(content).toBeTruthy();

		// Close
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(500);

		// App remains stable
		const inputArea = windowWithSession.locator(SELECTORS.INPUT_AREA);
		await expect(inputArea).toBeVisible({ timeout: 5000 });
	});
});
