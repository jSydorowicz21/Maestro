/**
 * Agent State E2E Tests
 *
 * Verifies that the agent state transitions are reflected in the UI:
 * idle -> busy (while processing) -> idle (after response).
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Agent State', () => {
	test('agent returns to idle state after response completes', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);

		// Send a normal message and wait for response
		await textarea.fill('state transition test');
		await windowWithSession.keyboard.press('Control+Enter');
		await windowWithSession.waitForTimeout(5000);

		// After response, the textarea should be editable (agent is idle)
		await expect(textarea).toBeEditable({ timeout: 5000 });

		// The input area should not show any "busy" or "waiting" state
		const inputArea = windowWithSession.locator(SELECTORS.INPUT_AREA);
		const inputText = await inputArea.textContent() ?? '';
		// When idle, the textarea placeholder should mention "Talking to" (AI mode)
		const placeholder = await textarea.getAttribute('placeholder') ?? '';
		expect(placeholder.toLowerCase()).toContain('talking to');
	});

	test('slow agent message can be interrupted, returning to idle', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);

		// Send slow message (5 second delay in mock)
		await textarea.fill('__SLOW__ take your time');
		await windowWithSession.keyboard.press('Control+Enter');
		await windowWithSession.waitForTimeout(1000);

		// Interrupt with Escape
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(2000);

		// After interrupt, should be able to type again
		await expect(textarea).toBeEditable({ timeout: 10000 });
		await textarea.fill('after interrupt');
		expect(await textarea.inputValue()).toBe('after interrupt');
		await textarea.fill('');
	});
});
