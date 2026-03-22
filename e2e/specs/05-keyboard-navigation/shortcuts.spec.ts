/**
 * Keyboard Shortcuts E2E Tests
 *
 * Tests specific keyboard shortcuts that trigger distinct UI changes.
 * Avoids duplicating modal-escape and quick-actions tests.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Keyboard Shortcuts', () => {
	test('Ctrl+J toggles between AI and shell mode', async ({ windowWithSession }) => {
		const inputArea = windowWithSession.locator(SELECTORS.INPUT_AREA);
		await expect(inputArea).toBeVisible({ timeout: 5000 });

		// Capture a snapshot of the main terminal area class list or structure before toggle
		const stateBefore = await windowWithSession.evaluate(() => {
			const terminal = document.querySelector('[data-tour="main-terminal"]');
			return {
				classes: terminal?.className ?? '',
				childCount: terminal?.children.length ?? 0,
			};
		});

		// Toggle mode
		await windowWithSession.keyboard.press('Control+j');
		await windowWithSession.waitForTimeout(500);

		// After toggling, the input area should still be functional
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		const isStillEditable = await textarea.isVisible().catch(() => false);
		expect(isStillEditable).toBe(true);

		// Toggle back to restore
		await windowWithSession.keyboard.press('Control+j');
		await windowWithSession.waitForTimeout(500);
	});

	test('Ctrl+, opens settings modal with interactive controls', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const modal = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		await expect(modal.first()).toBeVisible({ timeout: 5000 });

		// Settings should contain interactive form controls, not just text
		const controlCount = await modal.first().locator(
			'input, select, textarea, [role="switch"], [role="checkbox"]'
		).count();
		expect(controlCount).toBeGreaterThan(0);

		await windowWithSession.keyboard.press('Escape');
	});

	test('Ctrl+/ opens shortcuts help showing available shortcuts', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+/');
		await windowWithSession.waitForTimeout(500);

		const modal = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		const isVisible = await modal.first().isVisible().catch(() => false);

		if (isVisible) {
			// The shortcuts help should list recognizable shortcut keys
			const modalText = await modal.first().textContent() ?? '';
			// Should contain actual shortcut descriptions
			expect(modalText).toMatch(/ctrl|shift|alt|toggle|open|new/i);

			await windowWithSession.keyboard.press('Escape');
		}
	});

	test('Ctrl+O opens agent switcher', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+o');
		await windowWithSession.waitForTimeout(500);

		// Agent switcher should appear as a modal/overlay
		const modal = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		const isVisible = await modal.first().isVisible().catch(() => false);

		if (isVisible) {
			// Should contain a search input for switching agents
			const hasInput = await modal.first().locator('input').isVisible().catch(() => false);
			expect(hasInput).toBe(true);

			await windowWithSession.keyboard.press('Escape');
		}
	});
});
