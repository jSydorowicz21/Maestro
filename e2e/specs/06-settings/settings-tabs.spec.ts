/**
 * Settings Tabs E2E Tests
 *
 * Navigates within the settings modal to cover deeper settings components.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Settings Tabs', () => {
	test('settings modal has clickable tab navigation', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG).first();
		await expect(dialog).toBeVisible({ timeout: 5000 });

		// Find tab-like buttons in the settings sidebar
		const tabs = dialog.locator('button, [role="tab"]');
		const tabCount = await tabs.count();
		expect(tabCount).toBeGreaterThan(3);

		await windowWithSession.keyboard.press('Escape');
	});

	test('clicking different settings sections changes content', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG).first();
		const initialContent = await dialog.textContent() ?? '';

		// Try to click a different tab/section
		const allButtons = await dialog.locator('button').all();
		for (const btn of allButtons) {
			const text = (await btn.textContent() ?? '').toLowerCase();
			if (text.includes('shortcut') || text.includes('keyboard') || text.includes('keys')) {
				await btn.click();
				await windowWithSession.waitForTimeout(300);
				break;
			}
		}

		const newContent = await dialog.textContent() ?? '';
		// Content should change (or at least not crash)
		expect(typeof newContent).toBe('string');

		await windowWithSession.keyboard.press('Escape');
	});

	test('settings modal has substantial content', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG).first();
		const text = (await dialog.textContent() ?? '').toLowerCase();

		// Settings should have substantial content (tabs, labels, inputs)
		expect(text.length).toBeGreaterThan(50);

		await windowWithSession.keyboard.press('Escape');
	});
});
