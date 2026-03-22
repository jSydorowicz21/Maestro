/**
 * Error Boundary E2E Tests
 *
 * Verifies the app's error boundary does not activate under
 * normal operation or agent error conditions.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Error Boundary', () => {
	test('no error boundary visible during normal operation', async ({ windowWithSession }) => {
		const errorTitle = windowWithSession.locator(SELECTORS.ERROR_TITLE);
		const hasError = await errorTitle.isVisible().catch(() => false);
		expect(hasError).toBe(false);

		// Also verify no error description or retry buttons leaked
		const errorDesc = windowWithSession.locator(SELECTORS.ERROR_DESCRIPTION);
		const hasDesc = await errorDesc.isVisible().catch(() => false);
		expect(hasDesc).toBe(false);
	});

	test('sending __CRASH__ to agent does not trigger error boundary', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		await textarea.fill('__CRASH__');
		await windowWithSession.keyboard.press('Control+Enter');
		await windowWithSession.waitForTimeout(3000);

		// Error boundary should NOT appear (agent crash is handled gracefully)
		const errorTitle = windowWithSession.locator(SELECTORS.ERROR_TITLE);
		expect(await errorTitle.isVisible().catch(() => false)).toBe(false);

		// The input area should still accept new input
		await textarea.fill('recovery test');
		expect(await textarea.inputValue()).toBe('recovery test');
		await textarea.fill('');
	});

	test('sending __ERROR_AUTH__ shows agent handles it without error boundary', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		await textarea.fill('__ERROR_AUTH__');
		await windowWithSession.keyboard.press('Control+Enter');
		await windowWithSession.waitForTimeout(3000);

		// Error boundary should NOT appear
		const errorTitle = windowWithSession.locator(SELECTORS.ERROR_TITLE);
		expect(await errorTitle.isVisible().catch(() => false)).toBe(false);

		// Agent state indicator should still exist (session was not destroyed)
		const sessionList = windowWithSession.locator(SELECTORS.SESSION_LIST);
		await expect(sessionList).toBeVisible({ timeout: 5000 });
		const sessionText = await sessionList.textContent() ?? '';
		expect(sessionText).toContain('E2E Test Agent');
	});
});
