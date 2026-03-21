/**
 * Accessibility E2E Tests
 *
 * Verifies basic accessibility attributes and landmarks.
 * Uses session-factory since we need the full UI rendered.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Accessibility', () => {
	test('modals use role="dialog"', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator('[role="dialog"]');
		await expect(dialog.first()).toBeVisible({ timeout: 5000 });

		// Dialog should have aria-modal or aria-label
		const ariaModal = await dialog.first().getAttribute('aria-modal');
		const ariaLabel = await dialog.first().getAttribute('aria-label');
		expect(ariaModal === 'true' || (ariaLabel && ariaLabel.length > 0)).toBe(true);

		await windowWithSession.keyboard.press('Escape');
	});

	test('input area textarea is focusable', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		await textarea.focus();
		await expect(textarea).toBeFocused({ timeout: 3000 });
	});

	test('interactive elements exist in the main layout', async ({ windowWithSession }) => {
		// Verify core interactive landmarks are present
		await expect(windowWithSession.locator(SELECTORS.SESSION_LIST)).toBeVisible({ timeout: 5000 });
		await expect(windowWithSession.locator(SELECTORS.INPUT_AREA)).toBeVisible({ timeout: 5000 });
		await expect(windowWithSession.locator(SELECTORS.TAB_BAR)).toBeVisible({ timeout: 5000 });
		await expect(windowWithSession.locator(SELECTORS.MAIN_TERMINAL)).toBeVisible({ timeout: 5000 });
	});
});
