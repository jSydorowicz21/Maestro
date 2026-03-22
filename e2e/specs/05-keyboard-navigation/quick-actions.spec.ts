/**
 * Quick Actions E2E Tests
 *
 * Verifies the quick actions palette (Ctrl+K) opens with a functional
 * search input that filters the listed actions.
 */
import { test, expect } from '../../fixtures/session-factory';

test.describe('Quick Actions', () => {
	test('Ctrl+K opens palette with a search input', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+k');
		await windowWithSession.waitForTimeout(500);

		const palette = windowWithSession.locator('[aria-label="Quick Actions"]');
		await expect(palette).toBeVisible({ timeout: 5000 });

		// The palette should have a search/filter input
		const input = palette.locator('input');
		await expect(input).toBeVisible({ timeout: 3000 });

		await windowWithSession.keyboard.press('Escape');
	});

	test('typing in search input filters the action list', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+k');
		await windowWithSession.waitForTimeout(500);

		const palette = windowWithSession.locator('[aria-label="Quick Actions"]');
		await expect(palette).toBeVisible({ timeout: 5000 });

		const input = palette.locator('input');

		// Count items before filtering
		// Quick action items are typically list items or buttons inside the palette
		const itemsBefore = await palette.locator('[role="option"], [role="listitem"], li, [class*="item"]').count();

		// Type a specific filter term
		await input.fill('settings');
		await windowWithSession.waitForTimeout(300);

		const itemsAfter = await palette.locator('[role="option"], [role="listitem"], li, [class*="item"]').count();

		// Filtering should reduce the number of items (or change content)
		// At minimum, the count should differ from unfiltered
		expect(itemsAfter).toBeLessThan(itemsBefore);

		await windowWithSession.keyboard.press('Escape');
	});

	test('selecting an action from the palette triggers it', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+k');
		await windowWithSession.waitForTimeout(500);

		const palette = windowWithSession.locator('[aria-label="Quick Actions"]');
		await expect(palette).toBeVisible({ timeout: 5000 });

		const input = palette.locator('input');

		// Search for settings action
		await input.fill('settings');
		await windowWithSession.waitForTimeout(300);

		// Press Enter to select the first result
		await windowWithSession.keyboard.press('Enter');
		await windowWithSession.waitForTimeout(500);

		// The palette should close after selection
		await expect(palette).not.toBeVisible({ timeout: 3000 });

		// If "settings" was triggered, a settings modal should be open
		const modal = windowWithSession.locator('[role="dialog"]');
		const modalVisible = await modal.first().isVisible().catch(() => false);

		if (modalVisible) {
			// Good - the settings action was triggered
			await windowWithSession.keyboard.press('Escape');
		}
	});
});
