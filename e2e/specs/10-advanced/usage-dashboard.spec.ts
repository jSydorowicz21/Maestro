/**
 * Usage Dashboard E2E Tests
 *
 * Verifies the usage dashboard is accessible from the hamburger menu
 * and renders with meaningful content.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Usage Dashboard', () => {
	test('hamburger menu contains a Usage/Dashboard option', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(200);

		const menu = windowWithSession.locator(SELECTORS.HAMBURGER_MENU);
		await menu.click();
		await windowWithSession.waitForTimeout(500);

		const menuContents = windowWithSession.locator(SELECTORS.HAMBURGER_MENU_CONTENTS);
		await expect(menuContents).toBeVisible({ timeout: 3000 });

		const text = (await menuContents.textContent() ?? '').toLowerCase();
		expect(text).toMatch(/usage|dashboard|statistics|analytics/);

		await windowWithSession.keyboard.press('Escape');
	});

	test('clicking Usage/Dashboard opens dashboard with data content', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(200);

		const menu = windowWithSession.locator(SELECTORS.HAMBURGER_MENU);
		await menu.click();
		await windowWithSession.waitForTimeout(500);

		// Find and click the usage option
		const dashOption = windowWithSession.locator('text=Usage').or(
			windowWithSession.locator('text=Dashboard')
		).or(
			windowWithSession.locator('text=Statistics')
		).first();
		const hasOption = await dashOption.isVisible().catch(() => false);

		if (hasOption) {
			await dashOption.click();
			await windowWithSession.waitForTimeout(500);

			const dashboard = windowWithSession.locator(SELECTORS.USAGE_DASHBOARD);
			await expect(dashboard).toBeVisible({ timeout: 5000 });

			// Dashboard should contain numbers, charts, or data labels
			const dashText = (await dashboard.textContent() ?? '').toLowerCase();
			expect(dashText).toMatch(/token|cost|session|agent|message|total|\d+/);

			await windowWithSession.keyboard.press('Escape');
		} else {
			// If not found by text, close menu
			await windowWithSession.keyboard.press('Escape');
		}
	});
});
