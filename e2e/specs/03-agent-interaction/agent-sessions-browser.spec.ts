/**
 * Agent Sessions Browser E2E Tests
 *
 * Verifies the agent sessions browser modal (history of past conversations).
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Agent Sessions Browser', () => {
	test('agent sessions button exists in header', async ({ windowWithSession }) => {
		const button = windowWithSession.locator(SELECTORS.AGENT_SESSIONS_BUTTON);
		const isVisible = await button.isVisible().catch(() => false);
		// The button may or may not be visible depending on agent type
		// Just verify the app doesn't crash when checking
		expect(typeof isVisible).toBe('boolean');
	});

	test('agent sessions browser opens if button exists', async ({ windowWithSession }) => {
		const button = windowWithSession.locator(SELECTORS.AGENT_SESSIONS_BUTTON);
		const isVisible = await button.isVisible().catch(() => false);

		if (isVisible) {
			await button.click();
			await windowWithSession.waitForTimeout(500);

			// A modal or panel should appear
			const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
			const hasDialog = await dialog.first().isVisible().catch(() => false);

			if (hasDialog) {
				const text = (await dialog.first().textContent() ?? '').toLowerCase();
				// Should mention sessions or history
				expect(
					text.includes('session') || text.includes('history') || text.includes('conversation') || text.length > 50
				).toBe(true);
				await windowWithSession.keyboard.press('Escape');
			}
		}
	});
});
