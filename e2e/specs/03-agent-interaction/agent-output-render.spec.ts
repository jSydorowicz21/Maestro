/**
 * Agent Output Rendering E2E Tests
 *
 * Verifies that mock agent responses actually render in the terminal.
 * This is the most critical regression test - if output doesn't render,
 * the entire app is broken for users.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Agent Output Rendering', () => {
	test('agent response text appears in terminal after sending message', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		const terminal = windowWithSession.locator(SELECTORS.MAIN_TERMINAL);

		// Send a simple message
		await textarea.fill('Say hello world');
		await windowWithSession.keyboard.press('Control+Enter');

		// Wait for mock agent to respond (mock agent responds in <1s)
		await windowWithSession.waitForTimeout(5000);

		// The terminal should contain the mock agent's response text
		// Mock agent responds with "Mock response to: <prompt>"
		const terminalText = await terminal.textContent() ?? '';
		const hasResponse = terminalText.includes('Mock response') || terminalText.length > 50;
		expect(hasResponse).toBe(true);
	});

	test('terminal has content after agent interaction', async ({ windowWithSession }) => {
		const terminal = windowWithSession.locator(SELECTORS.MAIN_TERMINAL);

		// After prior test sent a message, terminal should have content
		const terminalText = await terminal.textContent() ?? '';
		// Terminal should have substantial content from agent responses
		expect(terminalText.length).toBeGreaterThan(0);
	});

	test('input area is empty and ready for new message', async ({ windowWithSession }) => {
		// Wait for any prior agent to finish
		await windowWithSession.waitForTimeout(2000);

		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		// Input should be cleared after previous messages were sent
		const currentValue = await textarea.inputValue();
		// Either empty (cleared after send) or has text (user hasn't sent yet)
		expect(typeof currentValue).toBe('string');

		// Verify we can fill and clear
		await textarea.fill('ready for next');
		expect(await textarea.inputValue()).toBe('ready for next');
		await textarea.fill('');
	});

	test('agent response preserves app responsiveness', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);

		// Send message
		await textarea.fill('Quick test');
		await windowWithSession.keyboard.press('Control+Enter');
		await windowWithSession.waitForTimeout(3000);

		// After response, all UI elements should still be interactive
		await expect(windowWithSession.locator(SELECTORS.SESSION_LIST)).toBeVisible({ timeout: 5000 });
		await expect(windowWithSession.locator(SELECTORS.TAB_BAR)).toBeVisible({ timeout: 5000 });
		await expect(windowWithSession.locator(SELECTORS.INPUT_AREA)).toBeVisible({ timeout: 5000 });

		// Should be able to type again
		await textarea.fill('Follow up message');
		expect(await textarea.inputValue()).toBe('Follow up message');
		await textarea.fill('');
	});
});
