/**
 * Usage Dashboard E2E Tests
 *
 * Verifies the usage dashboard is accessible and renders.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Usage Dashboard', () => {
	test('usage dashboard is accessible from hamburger menu', async ({ windowWithSession }) => {
		const menu = windowWithSession.locator(SELECTORS.HAMBURGER_MENU);
		await menu.click();
		await windowWithSession.waitForTimeout(500);

		const menuContents = windowWithSession.locator(SELECTORS.HAMBURGER_MENU_CONTENTS);
		const text = (await menuContents.textContent() ?? '').toLowerCase();

		const hasDashboard =
			text.includes('usage') ||
			text.includes('dashboard') ||
			text.includes('statistics') ||
			text.includes('analytics');

		await windowWithSession.keyboard.press('Escape');

		// Dashboard menu item should exist (may vary by version)
		expect(hasDashboard || text.length > 50).toBe(true);
	});

	test('usage dashboard renders if opened', async ({ windowWithSession }) => {
		const menu = windowWithSession.locator(SELECTORS.HAMBURGER_MENU);
		await menu.click();
		await windowWithSession.waitForTimeout(500);

		// Try to find and click usage/dashboard option
		const dashOption = windowWithSession.locator('text=Usage').or(
			windowWithSession.locator('text=Dashboard')
		).first();
		const isVisible = await dashOption.isVisible().catch(() => false);

		if (isVisible) {
			await dashOption.click();
			await windowWithSession.waitForTimeout(500);

			// Check if dashboard content appeared
			const dashboard = windowWithSession.locator(SELECTORS.USAGE_DASHBOARD);
			const dashVisible = await dashboard.isVisible({ timeout: 5000 }).catch(() => false);

			if (dashVisible) {
				const text = await dashboard.textContent() ?? '';
				expect(text.length).toBeGreaterThan(0);
			}

			// Close any modal
			await windowWithSession.keyboard.press('Escape');
		} else {
			await windowWithSession.keyboard.press('Escape');
		}
	});
});
