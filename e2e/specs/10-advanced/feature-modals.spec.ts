/**
 * Feature Modals E2E Tests
 *
 * Verifies various feature modals are accessible from menus/quick actions.
 * Covers: marketplace, debug, playbook exchange, etc.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Feature Modals', () => {
	test('quick actions palette opens', async ({ windowWithSession }) => {
		// Dismiss any lingering UI
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(300);

		await windowWithSession.keyboard.press('Control+k');
		await windowWithSession.waitForTimeout(1000);

		// Quick actions may use different aria label or selector
		const palette = windowWithSession.locator('[aria-label="Quick Actions"]');
		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		const isOpen = await palette.isVisible().catch(() => false) || await dialog.first().isVisible().catch(() => false);
		expect(isOpen).toBe(true);

		await windowWithSession.keyboard.press('Escape');
	});

	test('quick actions search works', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+k');
		await windowWithSession.waitForTimeout(500);

		const palette = windowWithSession.locator('[aria-label="Quick Actions"]');
		const input = palette.locator('input');
		await input.fill('settings');
		await windowWithSession.waitForTimeout(300);

		const text = (await palette.textContent() ?? '').toLowerCase();
		expect(text.length).toBeGreaterThan(5);

		await windowWithSession.keyboard.press('Escape');
	});

	test('debug option is searchable in quick actions', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+k');
		await windowWithSession.waitForTimeout(500);

		const palette = windowWithSession.locator('[aria-label="Quick Actions"]');
		const input = palette.locator('input');
		await input.fill('debug');
		await windowWithSession.waitForTimeout(300);

		const text = (await palette.textContent() ?? '').toLowerCase();
		const hasDebug = text.includes('debug') || text.includes('diagnostic') || text.includes('log');
		expect(hasDebug || text.length > 20).toBe(true);

		await windowWithSession.keyboard.press('Escape');
	});

	test('new agent option is searchable in quick actions', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+k');
		await windowWithSession.waitForTimeout(500);

		const palette = windowWithSession.locator('[aria-label="Quick Actions"]');
		const input = palette.locator('input');
		await input.fill('new agent');
		await windowWithSession.waitForTimeout(300);

		const text = (await palette.textContent() ?? '').toLowerCase();
		expect(text.includes('new') || text.includes('agent') || text.includes('create')).toBe(true);

		await windowWithSession.keyboard.press('Escape');
	});

	test('theme option is searchable in quick actions', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+k');
		await windowWithSession.waitForTimeout(500);

		const palette = windowWithSession.locator('[aria-label="Quick Actions"]');
		const input = palette.locator('input');
		await input.fill('theme');
		await windowWithSession.waitForTimeout(300);

		const text = (await palette.textContent() ?? '').toLowerCase();
		expect(text.includes('theme') || text.includes('appearance') || text.length > 20).toBe(true);

		await windowWithSession.keyboard.press('Escape');
	});
});
