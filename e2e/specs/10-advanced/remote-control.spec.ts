/**
 * Remote Control / LIVE Toggle E2E Tests
 *
 * Verifies the remote control indicator displays a state
 * (LIVE or OFFLINE) and that clicking it produces a UI response.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Remote Control', () => {
	test('remote control indicator shows LIVE or OFFLINE state', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(200);

		const remoteControl = windowWithSession.locator(SELECTORS.REMOTE_CONTROL);
		await expect(remoteControl).toBeVisible({ timeout: 5000 });

		const text = (await remoteControl.textContent() ?? '').toLowerCase();
		expect(text).toMatch(/live|offline/);
	});

	test('clicking remote control toggles its state or opens config', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(200);

		const remoteControl = windowWithSession.locator(SELECTORS.REMOTE_CONTROL);
		await expect(remoteControl).toBeVisible({ timeout: 5000 });

		const textBefore = (await remoteControl.textContent() ?? '').toLowerCase();
		await remoteControl.click();
		await windowWithSession.waitForTimeout(500);

		// After click, either the text changed (toggled) or a dialog opened
		const textAfter = (await remoteControl.textContent() ?? '').toLowerCase();
		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		const dialogOpened = await dialog.first().isVisible().catch(() => false);

		const stateChanged = textAfter !== textBefore;
		expect(stateChanged || dialogOpened).toBe(true);

		// Clean up any dialog
		if (dialogOpened) {
			await windowWithSession.keyboard.press('Escape');
		}
	});
});
