/**
 * Quick Actions E2E Tests
 *
 * Verifies the quick actions palette (Ctrl+K) functionality.
 */
import { test, expect } from '../../fixtures/session-factory';

test.describe('Quick Actions', () => {
	test('quick actions palette opens and has search', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+k');
		await windowWithSession.waitForTimeout(500);

		const palette = windowWithSession.locator('[aria-label="Quick Actions"]');
		await expect(palette).toBeVisible({ timeout: 5000 });

		// Should have a search/filter input
		const input = palette.locator('input');
		await expect(input).toBeVisible({ timeout: 3000 });

		await windowWithSession.keyboard.press('Escape');
	});

	test('quick actions palette shows action items', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+k');
		await windowWithSession.waitForTimeout(500);

		const palette = windowWithSession.locator('[aria-label="Quick Actions"]');
		await expect(palette).toBeVisible({ timeout: 5000 });

		// The palette should have content (action items listed)
		const text = await palette.textContent() ?? '';
		expect(text.length).toBeGreaterThan(20);

		await windowWithSession.keyboard.press('Escape');
	});

	test('quick actions search filters results', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+k');
		await windowWithSession.waitForTimeout(500);

		const palette = windowWithSession.locator('[aria-label="Quick Actions"]');
		await expect(palette).toBeVisible({ timeout: 5000 });

		const input = palette.locator('input');
		const textBefore = await palette.textContent() ?? '';

		// Type a filter query
		await input.fill('settings');
		await windowWithSession.waitForTimeout(300);

		const textAfter = await palette.textContent() ?? '';
		// Results should have changed (filtered)
		// Either fewer items or different content
		expect(textAfter).not.toBe(textBefore);

		await windowWithSession.keyboard.press('Escape');
	});
});
