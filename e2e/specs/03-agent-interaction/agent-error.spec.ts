/**
 * Agent Error Handling E2E Tests
 *
 * Tests error-related UI behavior. The mock agent is registered
 * via the fixture, so we can trigger errors by sending special keywords.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Agent Error Handling', () => {
	test('app is stable with no agent errors', async ({ windowWithSession }) => {
		const errorTitle = windowWithSession.locator(SELECTORS.ERROR_TITLE);
		const hasErrorTitle = await errorTitle.isVisible().catch(() => false);
		expect(hasErrorTitle).toBe(false);
	});

	test('app UI is fully functional without errors', async ({ windowWithSession }) => {
		await expect(windowWithSession.locator(SELECTORS.SESSION_LIST)).toBeVisible({ timeout: 10000 });
		await expect(windowWithSession.locator(SELECTORS.INPUT_AREA)).toBeVisible({ timeout: 5000 });
		await expect(windowWithSession.locator(SELECTORS.TAB_BAR)).toBeVisible({ timeout: 5000 });
		await expect(windowWithSession.locator(SELECTORS.MAIN_TERMINAL)).toBeVisible({ timeout: 5000 });
	});

	test('app survives sending a message to mock agent', async ({ windowWithSession }) => {
		// Type a message and send it - the mock agent should respond
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		await textarea.fill('Hello mock agent');
		await windowWithSession.keyboard.press('Control+Enter');
		await windowWithSession.waitForTimeout(3000);

		// App should remain responsive after the agent responds
		await expect(windowWithSession.locator(SELECTORS.INPUT_AREA)).toBeVisible({ timeout: 5000 });
	});

	test('app survives agent error keyword', async ({ windowWithSession }) => {
		// Send an error-triggering message - mock agent exits with code 1
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		await textarea.fill('__ERROR_AUTH__');
		await windowWithSession.keyboard.press('Control+Enter');
		await windowWithSession.waitForTimeout(3000);

		// App should remain responsive even after agent error
		await expect(windowWithSession.locator(SELECTORS.INPUT_AREA)).toBeVisible({ timeout: 10000 });

		// Session list should still be functional
		await expect(windowWithSession.locator(SELECTORS.SESSION_LIST)).toBeVisible({ timeout: 5000 });
	});

	test('session list contains agent entry for error reporting', async ({ windowWithSession }) => {
		const sessionList = windowWithSession.locator(SELECTORS.SESSION_LIST);
		await expect(sessionList).toBeVisible({ timeout: 5000 });
		const text = await sessionList.textContent() ?? '';
		expect(text).toContain('E2E Test Agent');
	});
});
