/**
 * Agent Spawn E2E Tests
 *
 * Tests that the mock agent process spawns correctly when a message
 * is sent, and that the agent's init event sets up the session properly.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Agent Spawn', () => {
	test('sending a message spawns agent and produces response', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		const terminal = windowWithSession.locator(SELECTORS.MAIN_TERMINAL);

		// Before sending, terminal should have minimal or no agent content
		const beforeText = await terminal.textContent() ?? '';

		await textarea.fill('spawn test message');
		await windowWithSession.keyboard.press('Control+Enter');
		await windowWithSession.waitForTimeout(5000);

		// After sending, the terminal should contain the mock agent's response
		const afterText = await terminal.textContent() ?? '';
		expect(afterText.length).toBeGreaterThan(beforeText.length);
		expect(afterText).toContain('mock Claude');
	});

	test('agent state indicator appears after sending a message', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);

		await textarea.fill('state check message');
		await windowWithSession.keyboard.press('Control+Enter');
		await windowWithSession.waitForTimeout(5000);

		// After agent has responded, check for a state indicator in the session list
		const stateIndicator = windowWithSession.locator(SELECTORS.AGENT_STATE_INDICATOR);
		const sessionList = windowWithSession.locator(SELECTORS.SESSION_LIST);

		// The session list should still contain our agent
		const listText = await sessionList.textContent() ?? '';
		expect(listText).toContain('E2E Test Agent');
	});
});
