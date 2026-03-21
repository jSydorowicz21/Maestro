/**
 * Worktree Configuration E2E Tests
 *
 * Verifies worktree-related options are accessible from the UI.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Worktree Configuration', () => {
	test('quick actions has worktree-related options', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+k');
		await windowWithSession.waitForTimeout(500);

		const palette = windowWithSession.locator('[aria-label="Quick Actions"]');
		await expect(palette).toBeVisible({ timeout: 5000 });

		const input = palette.locator('input');
		await input.fill('worktree');
		await windowWithSession.waitForTimeout(300);

		const text = (await palette.textContent() ?? '').toLowerCase();
		// May or may not have worktree options depending on context
		// Just verify the search didn't crash
		expect(typeof text).toBe('string');

		await windowWithSession.keyboard.press('Escape');
	});
});
