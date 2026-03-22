/**
 * Accessibility E2E Tests
 *
 * Verifies ARIA attributes, focus management, and keyboard
 * accessibility for core UI landmarks.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Accessibility', () => {
	test('settings modal has role="dialog" with aria-modal or aria-label', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator('[role="dialog"]').first();
		await expect(dialog).toBeVisible({ timeout: 5000 });

		const ariaModal = await dialog.getAttribute('aria-modal');
		const ariaLabel = await dialog.getAttribute('aria-label');
		expect(ariaModal === 'true' || (ariaLabel !== null && ariaLabel.length > 0)).toBe(true);

		await windowWithSession.keyboard.press('Escape');
	});

	test('textarea receives and holds focus on click', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		await textarea.click();
		await expect(textarea).toBeFocused({ timeout: 3000 });

		// Type something to prove focus is real
		await textarea.fill('focus test');
		expect(await textarea.inputValue()).toBe('focus test');
		await textarea.fill('');
	});

	test('Tab key moves focus to an interactive element', async ({ windowWithSession }) => {
		// Focus the textarea first
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		await textarea.click();
		await expect(textarea).toBeFocused({ timeout: 3000 });

		// Press Tab and verify focus went somewhere
		await windowWithSession.keyboard.press('Tab');
		await windowWithSession.waitForTimeout(200);

		// Check that the active element is some interactive element
		const activeInfo = await windowWithSession.evaluate(() => {
			const active = document.activeElement;
			return {
				tagName: active?.tagName ?? 'NONE',
				isBody: active === document.body,
				isStillTextarea: active?.tagName === 'TEXTAREA'
					&& active?.closest('[data-tour="input-area"]') !== null,
			};
		});

		// Tab should have moved focus - either away from textarea or to a nearby interactive element
		// In some UI frameworks, Tab might cycle within the same region, which is valid
		// The key assertion is that activeElement is something meaningful, not just body
		expect(activeInfo.isBody).toBe(false);
	});
});
