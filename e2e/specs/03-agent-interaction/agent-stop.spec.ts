/**
 * Agent Stop / Interrupt E2E Tests
 *
 * Tests stop/interrupt functionality using the mock agent.
 * The __SLOW__ keyword makes the mock agent delay 5 seconds,
 * giving time to test the stop/interrupt flow.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Agent Stop', () => {
	test('Escape interrupts a slow agent and app stays functional', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		const terminal = windowWithSession.locator(SELECTORS.MAIN_TERMINAL);

		const beforeText = await terminal.textContent() ?? '';

		// Send a slow message (5 second delay)
		await textarea.fill('__SLOW__ please take your time');
		await windowWithSession.keyboard.press('Control+Enter');

		// Wait briefly for the agent to start
		await windowWithSession.waitForTimeout(1000);

		// Interrupt
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(2000);

		// App must remain functional
		await expect(textarea).toBeEditable({ timeout: 10000 });

		// Should be able to send another message after interrupt
		await textarea.fill('message after stop');
		await windowWithSession.keyboard.press('Control+Enter');
		await windowWithSession.waitForTimeout(5000);

		const afterText = await terminal.textContent() ?? '';
		expect(afterText.length).toBeGreaterThan(beforeText.length);
	});

	test('crash keyword does not crash the app', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);

		// __CRASH__ causes mock agent to exit(137) - simulating OOM
		await textarea.fill('__CRASH__');
		await windowWithSession.keyboard.press('Control+Enter');
		await windowWithSession.waitForTimeout(3000);

		// App must survive the crash
		await expect(textarea).toBeEditable({ timeout: 10000 });

		// Verify we can still send a normal message
		await textarea.fill('normal message after crash');
		await windowWithSession.keyboard.press('Control+Enter');
		await windowWithSession.waitForTimeout(5000);

		const terminal = windowWithSession.locator(SELECTORS.MAIN_TERMINAL);
		const text = await terminal.textContent() ?? '';
		expect(text).toContain('mock Claude');
	});
});
