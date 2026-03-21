/**
 * Error Boundary E2E Tests
 *
 * Verifies the app's error boundary catches and recovers from errors.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Error Boundary', () => {
	test('app does not show error boundary under normal operation', async ({ windowWithSession }) => {
		// The error boundary should not be visible during normal use
		const errorTitle = windowWithSession.locator(SELECTORS.ERROR_TITLE);
		const hasError = await errorTitle.isVisible().catch(() => false);
		expect(hasError).toBe(false);
	});

	test('app recovers from agent crash without showing error boundary', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		await textarea.fill('__CRASH__');
		await windowWithSession.keyboard.press('Control+Enter');
		await windowWithSession.waitForTimeout(3000);

		// Error boundary should NOT be shown (agent crash is handled gracefully)
		const errorTitle = windowWithSession.locator(SELECTORS.ERROR_TITLE);
		const hasError = await errorTitle.isVisible().catch(() => false);
		expect(hasError).toBe(false);

		// App should still be functional
		await expect(windowWithSession.locator(SELECTORS.INPUT_AREA)).toBeVisible({ timeout: 5000 });
	});

	test('app survives rapid error-triggering messages', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);

		// Send multiple error messages
		for (const keyword of ['__ERROR_AUTH__', '__CRASH__']) {
			await textarea.fill(keyword);
			await windowWithSession.keyboard.press('Control+Enter');
			await windowWithSession.waitForTimeout(3000);
		}

		// App should survive all error types - input area is the key indicator
		await expect(windowWithSession.locator(SELECTORS.INPUT_AREA)).toBeVisible({ timeout: 10000 });
	});
});
