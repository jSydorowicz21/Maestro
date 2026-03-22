/**
 * Playbooks (Auto Run) E2E Tests
 *
 * Verifies the Auto Run tab in the right panel is accessible,
 * switchable, and renders its content panel.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Playbooks', () => {
	test('right panel shows all three tabs: Files, History, Auto Run', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(200);

		// Ensure right panel is open
		await windowWithSession.keyboard.press('Control+Shift+f');
		await windowWithSession.waitForTimeout(500);

		const filesTab = windowWithSession.locator(SELECTORS.FILES_TAB);
		const historyTab = windowWithSession.locator(SELECTORS.HISTORY_TAB);
		const autoRunTab = windowWithSession.locator(SELECTORS.AUTORUN_TAB);

		await expect(filesTab).toBeVisible({ timeout: 5000 });
		await expect(historyTab).toBeVisible({ timeout: 5000 });
		await expect(autoRunTab).toBeVisible({ timeout: 5000 });
	});

	test('clicking Auto Run tab switches to the Auto Run panel', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(200);

		// Open right panel and switch to Auto Run
		await windowWithSession.keyboard.press('Control+Shift+1');
		await windowWithSession.waitForTimeout(500);

		const autoRunTab = windowWithSession.locator(SELECTORS.AUTORUN_TAB);
		await expect(autoRunTab).toBeVisible({ timeout: 5000 });
		await autoRunTab.click();
		await windowWithSession.waitForTimeout(500);

		// Auto Run panel should appear with content
		const autoRunPanel = windowWithSession.locator(SELECTORS.AUTORUN_PANEL);
		await expect(autoRunPanel).toBeVisible({ timeout: 5000 });

		// Panel should contain playbook-related text (e.g., "playbook", "auto run", "run", "create")
		const content = (await autoRunPanel.textContent() ?? '').toLowerCase();
		expect(content).toMatch(/playbook|auto run|run|create|document|no\s/i);
	});

	test('keyboard shortcut Ctrl+Shift+1 activates Auto Run tab', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(200);

		// Switch to Files first to ensure we are not already on Auto Run
		await windowWithSession.keyboard.press('Control+Shift+f');
		await windowWithSession.waitForTimeout(300);

		// Now activate Auto Run via shortcut
		await windowWithSession.keyboard.press('Control+Shift+1');
		await windowWithSession.waitForTimeout(500);

		const autoRunPanel = windowWithSession.locator(SELECTORS.AUTORUN_PANEL);
		await expect(autoRunPanel).toBeVisible({ timeout: 5000 });
	});
});
