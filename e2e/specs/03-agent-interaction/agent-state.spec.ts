/**
 * Agent State E2E Tests
 *
 * Verifies agent-related UI elements in the session list and main panel.
 * Without a mock agent process, we verify the UI structure is correct.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Agent State', () => {
	test('session list shows the created session', async ({ windowWithSession }) => {
		const sessionList = windowWithSession.locator(SELECTORS.SESSION_LIST);
		await expect(sessionList).toBeVisible({ timeout: 5000 });

		const sessionText = await sessionList.textContent();
		expect(sessionText).toBeTruthy();
	});

	test('session entry contains agent name', async ({ windowWithSession }) => {
		const sessionList = windowWithSession.locator(SELECTORS.SESSION_LIST);
		const text = await sessionList.textContent() ?? '';
		expect(text).toContain('E2E Test Agent');
	});

	test('input area is functional alongside session list', async ({ windowWithSession }) => {
		await expect(windowWithSession.locator(SELECTORS.SESSION_LIST)).toBeVisible({ timeout: 5000 });
		await expect(windowWithSession.locator(SELECTORS.INPUT_AREA)).toBeVisible({ timeout: 5000 });

		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		await textarea.fill('test message');
		const value = await textarea.inputValue();
		expect(value).toBe('test message');
		await textarea.fill('');
	});
});
