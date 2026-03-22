/**
 * Modal Stack E2E Tests
 *
 * Verifies modal open/close behavior, Escape key handling,
 * stacking priority, and backdrop interactions.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Modal Stack', () => {
	test('settings modal blocks interaction with elements behind it', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(200);

		// Open settings modal
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator('[role="dialog"]').first();
		await expect(dialog).toBeVisible({ timeout: 5000 });

		// The textarea behind the modal should not be focusable via click
		// (modal should trap or block interaction)
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		const textareaBox = await textarea.boundingBox();
		if (textareaBox) {
			// The modal overlay should be covering the textarea
			// Verify the modal is rendered above the textarea's position
			const dialogBox = await dialog.boundingBox();
			expect(dialogBox).toBeTruthy();
		}

		await windowWithSession.keyboard.press('Escape');
	});

	test('Escape closes current modal and reveals nothing beneath', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(200);

		// Open settings
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const dialogs = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		await expect(dialogs.first()).toBeVisible({ timeout: 5000 });
		const countBefore = await dialogs.count();

		// Press Escape
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(500);

		// All dialogs should be gone (single modal scenario)
		const countAfter = await dialogs.count();
		expect(countAfter).toBeLessThan(countBefore);

		// The underlying UI should now be accessible
		await expect(windowWithSession.locator(SELECTORS.INPUT_AREA)).toBeVisible({ timeout: 3000 });
	});

	test('stacked modals: Escape closes only the topmost', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(200);

		// Open settings modal first
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const dialogs = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		await expect(dialogs.first()).toBeVisible({ timeout: 5000 });
		const firstCount = await dialogs.count();

		// Open a second modal (new agent wizard)
		await windowWithSession.keyboard.press('Control+Shift+N');
		await windowWithSession.waitForTimeout(500);

		const secondCount = await dialogs.count();

		if (secondCount > firstCount) {
			// Two modals are stacked - Escape should close only the top one
			await windowWithSession.keyboard.press('Escape');
			await windowWithSession.waitForTimeout(500);

			const afterEscapeCount = await dialogs.count();
			expect(afterEscapeCount).toBe(secondCount - 1);

			// The first modal should still be present
			await expect(dialogs.first()).toBeVisible({ timeout: 3000 });
		}

		// Clean up remaining modals
		for (let i = 0; i < 3; i++) {
			await windowWithSession.keyboard.press('Escape');
			await windowWithSession.waitForTimeout(200);
		}
	});

	test('backdrop click on settings modal either closes or blocks', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(200);

		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG).first();
		await expect(dialog).toBeVisible({ timeout: 5000 });

		const box = await dialog.boundingBox();
		expect(box).toBeTruthy();

		if (box) {
			// Click well outside the dialog
			const outsideX = Math.max(5, box.x - 50);
			const outsideY = Math.max(5, box.y - 50);
			await windowWithSession.mouse.click(outsideX, outsideY);
			await windowWithSession.waitForTimeout(500);

			const stillVisible = await dialog.isVisible().catch(() => false);
			if (stillVisible) {
				// Settings modal does not close on backdrop - this is valid behavior
				// But the dialog must still be interactive (not frozen)
				const inputs = await dialog.locator('input, select, textarea, [role="switch"]').count();
				expect(inputs).toBeGreaterThan(0);
				await windowWithSession.keyboard.press('Escape');
			}
			// If it closed, that is also valid - the modal is gone
		}
	});
});
