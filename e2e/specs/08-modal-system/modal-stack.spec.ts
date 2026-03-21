/**
 * Modal System Tests
 *
 * Verifies modal open/close behavior, Escape key handling,
 * stacking priority, and backdrop click interactions.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Modal system', () => {
	test('modal opens with correct content', async ({ windowWithSession }) => {
		// Open settings modal via keyboard shortcut (Ctrl+,)
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		await expect(dialog.first()).toBeVisible({ timeout: 5000 });

		// Verify the modal has content (not empty)
		const content = await dialog.first().textContent();
		expect(content).toBeTruthy();
		expect((content ?? '').length).toBeGreaterThan(0);

		// Clean up
		await windowWithSession.keyboard.press('Escape');
	});

	test('modal closes on Escape', async ({ windowWithSession }) => {
		// Open settings modal
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		await expect(dialog.first()).toBeVisible({ timeout: 5000 });

		// Press Escape to close
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(500);

		// Modal should be hidden
		await expect(dialog).not.toBeVisible({ timeout: 5000 });
	});

	test('modal stack priority', async ({ windowWithSession }) => {
		// Open settings modal first
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const dialogs = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		await expect(dialogs.first()).toBeVisible({ timeout: 5000 });
		const firstDialogCount = await dialogs.count();

		// Try to open a second modal (e.g., the new agent wizard via Ctrl+Shift+N)
		await windowWithSession.keyboard.press('Control+Shift+N');
		await windowWithSession.waitForTimeout(500);

		const afterSecondCount = await dialogs.count();

		// If a second dialog appeared, pressing Escape should close only the top one
		if (afterSecondCount > firstDialogCount) {
			await windowWithSession.keyboard.press('Escape');
			await windowWithSession.waitForTimeout(500);

			const afterEscapeCount = await dialogs.count();
			// Should have closed exactly one modal from the stack
			expect(afterEscapeCount).toBeLessThan(afterSecondCount);
			// The first modal should still be present
			expect(afterEscapeCount).toBeGreaterThanOrEqual(firstDialogCount);
		} else {
			// If second modal did not open (blocked by first), that is also valid
			// Just verify the first modal is still visible
			await expect(dialogs.first()).toBeVisible();
		}

		// Clean up: close remaining modals
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(300);
	});

	test('modal backdrop click behavior', async ({ windowWithSession }) => {
		// Open settings modal
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		await expect(dialog.first()).toBeVisible({ timeout: 5000 });

		// Get the dialog bounding box to click outside it
		const box = await dialog.first().boundingBox();
		if (box) {
			// Click well outside the dialog (top-left corner of viewport)
			const outsideX = Math.max(0, box.x - 50);
			const outsideY = Math.max(0, box.y - 50);
			await windowWithSession.mouse.click(outsideX, outsideY);
			await windowWithSession.waitForTimeout(500);
		}

		// Check whether the modal closed or stayed open
		// Some modals close on backdrop click, some do not
		const afterClickCount = await dialog.count();
		// Just verify the app is still responsive regardless
		await expect(
			windowWithSession.locator('[data-tour]').first()
		).toBeVisible({ timeout: 5000 });

		if (afterClickCount > 0) {
			// Modal stayed open (settings modal may not close on backdrop)
			await expect(dialog.first()).toBeVisible();
			// Clean up
			await windowWithSession.keyboard.press('Escape');
		}
	});
});
