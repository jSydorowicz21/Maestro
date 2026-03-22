/**
 * Agent Conversation E2E Tests
 *
 * Verifies the core conversation flow: send a message, verify the mock
 * agent's known response text appears in the terminal, verify input
 * clears, and verify the terminal accumulates content.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Agent Conversation', () => {
	test('sending a message produces mock agent response in terminal', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		const terminal = windowWithSession.locator(SELECTORS.MAIN_TERMINAL);

		await textarea.fill('Hello from the E2E test');
		await windowWithSession.keyboard.press('Control+Enter');
		await windowWithSession.waitForTimeout(5000);

		// The mock agent responds with "Hello from mock Claude. This is a simulated response for E2E testing."
		const text = await terminal.textContent() ?? '';
		expect(text).toContain('mock Claude');
	});

	test('input clears after sending a message', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);

		await textarea.fill('Clear test message');
		expect(await textarea.inputValue()).toBe('Clear test message');

		await windowWithSession.keyboard.press('Control+Enter');
		await windowWithSession.waitForTimeout(2000);

		// Input must be empty after send
		expect(await textarea.inputValue()).toBe('');
	});

	test('terminal accumulates content across multiple messages', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		const terminal = windowWithSession.locator(SELECTORS.MAIN_TERMINAL);

		const lengthBefore = (await terminal.textContent() ?? '').length;

		await textarea.fill('First accumulation message');
		await windowWithSession.keyboard.press('Control+Enter');
		await windowWithSession.waitForTimeout(5000);

		const lengthAfterFirst = (await terminal.textContent() ?? '').length;
		expect(lengthAfterFirst).toBeGreaterThan(lengthBefore);

		await textarea.fill('Second accumulation message');
		await windowWithSession.keyboard.press('Control+Enter');
		await windowWithSession.waitForTimeout(5000);

		const lengthAfterSecond = (await terminal.textContent() ?? '').length;
		expect(lengthAfterSecond).toBeGreaterThan(lengthAfterFirst);
	});
});
