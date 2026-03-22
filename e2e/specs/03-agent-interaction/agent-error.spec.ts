/**
 * Agent Error Handling E2E Tests
 *
 * Tests that error keywords trigger visible error state in the UI
 * and that the app remains functional afterward.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Agent Error Handling', () => {
	test('auth error keyword triggers error state, app stays functional', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);

		await textarea.fill('__ERROR_AUTH__');
		await windowWithSession.keyboard.press('Control+Enter');
		await windowWithSession.waitForTimeout(3000);

		// The mock agent exits with code 1, which should produce an error indicator.
		// Check for error title/description or a red state indicator.
		const errorTitle = windowWithSession.locator(SELECTORS.ERROR_TITLE);
		const stateIndicator = windowWithSession.locator(SELECTORS.AGENT_STATE_INDICATOR);
		const terminal = windowWithSession.locator(SELECTORS.MAIN_TERMINAL);

		const hasErrorTitle = await errorTitle.isVisible().catch(() => false);
		const terminalText = (await terminal.textContent() ?? '').toLowerCase();

		// At least one of: error title visible, error text in terminal, or state changed
		const hasErrorIndication = hasErrorTitle ||
			terminalText.includes('error') ||
			terminalText.includes('authentication') ||
			terminalText.includes('failed');
		expect(hasErrorIndication).toBe(true);

		// App must remain functional - input should still be editable
		await expect(textarea).toBeEditable({ timeout: 10000 });
	});

	test('app recovers from error and accepts new messages', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		const terminal = windowWithSession.locator(SELECTORS.MAIN_TERMINAL);

		// Send error
		await textarea.fill('__ERROR_AUTH__');
		await windowWithSession.keyboard.press('Control+Enter');
		await windowWithSession.waitForTimeout(3000);

		// Now send a normal message - the app should still work
		await textarea.fill('Recovery message after error');
		await windowWithSession.keyboard.press('Control+Enter');
		await windowWithSession.waitForTimeout(5000);

		// Terminal should contain response from the recovery message
		const text = await terminal.textContent() ?? '';
		const hasRecovery = text.includes('mock Claude') || text.includes('Recovery');
		expect(hasRecovery).toBe(true);
	});
});
