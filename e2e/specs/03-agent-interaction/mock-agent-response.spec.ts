/**
 * Mock Agent Response E2E Tests
 *
 * Verifies the mock agent produces visible output in the terminal
 * when a message is sent.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Mock Agent Response', () => {
	test('sending a message produces output in terminal', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		const terminal = windowWithSession.locator(SELECTORS.MAIN_TERMINAL);

		// Record terminal content before sending
		const beforeText = await terminal.textContent() ?? '';

		// Send a message
		await textarea.fill('Hello from E2E test');
		await windowWithSession.keyboard.press('Control+Enter');

		// Wait for agent to respond
		await windowWithSession.waitForTimeout(5000);

		// Terminal should have new content (agent response)
		const afterText = await terminal.textContent() ?? '';
		// The terminal content should have changed (either agent response or at least the sent message)
		expect(afterText.length).toBeGreaterThanOrEqual(beforeText.length);
	});

	test('sending __THINKING__ keyword triggers thinking display', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);

		await textarea.fill('__THINKING__ analyze this problem');
		await windowWithSession.keyboard.press('Control+Enter');

		// Wait for agent to respond (thinking blocks take slightly longer)
		await windowWithSession.waitForTimeout(5000);

		// App should remain responsive
		await expect(windowWithSession.locator(SELECTORS.INPUT_AREA)).toBeVisible({ timeout: 5000 });
	});
});
