/**
 * Agent Stop / Interrupt E2E Tests
 *
 * Tests stop/interrupt functionality using the mock agent.
 * The __SLOW__ keyword makes the mock agent delay, giving time to test stop.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Agent Stop', () => {
	test('input area is present and editable when no agent is running', async ({ windowWithSession }) => {
		const inputArea = windowWithSession.locator(SELECTORS.INPUT_AREA);
		await expect(inputArea).toBeVisible({ timeout: 10000 });

		const textarea = inputArea.locator('textarea');
		await expect(textarea).toBeEditable({ timeout: 5000 });
	});

	test('sending a slow message and interrupting does not crash', async ({ windowWithSession }) => {
		// Send a slow message to the mock agent
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		await textarea.fill('__SLOW__ please take your time');
		await windowWithSession.keyboard.press('Control+Enter');

		// Wait briefly for the agent to start processing
		await windowWithSession.waitForTimeout(1000);

		// Try to interrupt with Escape (Maestro's stop shortcut)
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(2000);

		// App should remain responsive
		await expect(windowWithSession.locator(SELECTORS.INPUT_AREA)).toBeVisible({ timeout: 10000 });
	});

	test('app remains responsive after keyboard interrupt attempt', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(300);

		const inputArea = windowWithSession.locator(SELECTORS.INPUT_AREA);
		await expect(inputArea).toBeVisible({ timeout: 5000 });

		const textarea = inputArea.locator('textarea');
		await textarea.fill('Still working');
		expect(await textarea.inputValue()).toBe('Still working');
		await textarea.fill('');
	});
});
