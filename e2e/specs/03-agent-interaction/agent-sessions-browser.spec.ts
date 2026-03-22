/**
 * Agent Sessions Browser E2E Tests
 *
 * Verifies the agent sessions browser (conversation history) button
 * opens a dialog with session/history content.
 *
 * The sessions browser button may not exist for all agent types or
 * UI configurations. The test skips gracefully when the button is absent.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Agent Sessions Browser', () => {
	test('sessions browser button opens dialog with history content', async ({ windowWithSession }) => {
		const button = windowWithSession.locator(SELECTORS.AGENT_SESSIONS_BUTTON);

		// Wait briefly for UI to stabilize, then check visibility
		await windowWithSession.waitForTimeout(1000);
		const isVisible = await button.isVisible().catch(() => false);

		// Skip when the button is not available (depends on agent capabilities)
		test.skip(!isVisible, 'Agent sessions browser button not visible - feature may not be available for this agent type');

		await button.click();
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		await expect(dialog.first()).toBeVisible({ timeout: 5000 });

		// The dialog should contain session/history-related content
		const text = (await dialog.first().textContent() ?? '').toLowerCase();
		const hasHistoryContent = text.includes('session') ||
			text.includes('history') ||
			text.includes('conversation') ||
			text.includes('resume') ||
			text.includes('agent');
		expect(hasHistoryContent).toBe(true);

		await windowWithSession.keyboard.press('Escape');
	});
});
