/**
 * Update Check E2E Tests
 *
 * Verifies update-related UI is accessible.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Update Check', () => {
	test('quick actions has update-related option', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+k');
		await windowWithSession.waitForTimeout(500);

		const palette = windowWithSession.locator('[aria-label="Quick Actions"]');
		await expect(palette).toBeVisible({ timeout: 5000 });

		const input = palette.locator('input');
		await input.fill('update');
		await windowWithSession.waitForTimeout(300);

		const text = (await palette.textContent() ?? '').toLowerCase();
		const hasUpdate = text.includes('update') || text.includes('check');
		expect(hasUpdate).toBe(true);

		await windowWithSession.keyboard.press('Escape');
	});
});
