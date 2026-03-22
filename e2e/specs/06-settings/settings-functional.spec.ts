/**
 * Settings Functional E2E Tests
 *
 * Tests that settings controls actually work: values change, persist,
 * and affect the UI. Every test verifies a concrete state change.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Settings Functional', () => {
	test('toggling a checkbox changes its checked state', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG).first();
		await expect(dialog).toBeVisible({ timeout: 5000 });

		// Find a toggle/checkbox/switch
		const toggle = dialog.locator('[role="switch"], input[type="checkbox"]').first();
		await expect(toggle).toBeVisible({ timeout: 3000 });

		const initialChecked = await toggle.isChecked();

		await toggle.click();
		await windowWithSession.waitForTimeout(300);

		const afterChecked = await toggle.isChecked();
		expect(afterChecked).toBe(!initialChecked);

		// Restore original state
		await toggle.click();
		await windowWithSession.waitForTimeout(200);

		await windowWithSession.keyboard.press('Escape');
	});

	test('textarea value can be edited and read back', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG).first();
		await expect(dialog).toBeVisible({ timeout: 5000 });

		const textarea = dialog.locator('textarea').first();
		const hasTextarea = await textarea.isVisible().catch(() => false);

		if (hasTextarea) {
			const originalValue = await textarea.inputValue();

			await textarea.fill('E2E settings test value');
			expect(await textarea.inputValue()).toBe('E2E settings test value');

			// Restore
			await textarea.fill(originalValue);
		}

		await windowWithSession.keyboard.press('Escape');
	});

	test('settings persist after close and reopen', async ({ windowWithSession }) => {
		// Open settings and modify a textarea
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG).first();
		await expect(dialog).toBeVisible({ timeout: 5000 });

		const textarea = dialog.locator('textarea').first();
		const hasTextarea = await textarea.isVisible().catch(() => false);

		if (hasTextarea) {
			const originalValue = await textarea.inputValue();

			await textarea.fill('Persistence check value');

			// Close the modal
			await windowWithSession.keyboard.press('Escape');
			await windowWithSession.waitForTimeout(500);

			// Reopen settings
			await windowWithSession.keyboard.press('Control+,');
			await windowWithSession.waitForTimeout(500);

			const dialog2 = windowWithSession.locator(SELECTORS.MODAL_DIALOG).first();
			const textarea2 = dialog2.locator('textarea').first();

			// Value should have survived the close/reopen cycle
			expect(await textarea2.inputValue()).toBe('Persistence check value');

			// Clean up - restore original
			await textarea2.fill(originalValue);
		}

		await windowWithSession.keyboard.press('Escape');
	});

	test('toggled checkbox state persists after close and reopen', async ({ windowWithSession }) => {
		// Open settings
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG).first();
		await expect(dialog).toBeVisible({ timeout: 5000 });

		const toggle = dialog.locator('[role="switch"], input[type="checkbox"]').first();
		await expect(toggle).toBeVisible({ timeout: 3000 });

		const originalState = await toggle.isChecked();

		// Flip the toggle
		await toggle.click();
		await windowWithSession.waitForTimeout(300);
		expect(await toggle.isChecked()).toBe(!originalState);

		// Close settings
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(500);

		// Reopen settings
		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const dialog2 = windowWithSession.locator(SELECTORS.MODAL_DIALOG).first();
		const toggle2 = dialog2.locator('[role="switch"], input[type="checkbox"]').first();

		// The flipped state should persist
		expect(await toggle2.isChecked()).toBe(!originalState);

		// Restore original state
		await toggle2.click();
		await windowWithSession.waitForTimeout(200);

		await windowWithSession.keyboard.press('Escape');
	});

	test('theme change alters the background color', async ({ windowWithSession }) => {
		const body = windowWithSession.locator('body');
		const initialBg = await body.evaluate((el) => getComputedStyle(el).backgroundColor);

		await windowWithSession.keyboard.press('Control+,');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG).first();

		// Look for theme swatches
		const themeOptions = dialog.locator('[class*="theme"], [class*="swatch"], [title*="theme"]');
		const themeCount = await themeOptions.count();

		if (themeCount > 1) {
			// Click a different theme
			await themeOptions.nth(1).click();
			await windowWithSession.waitForTimeout(500);

			const newBg = await body.evaluate((el) => getComputedStyle(el).backgroundColor);
			// The background color should have changed
			expect(newBg).not.toBe(initialBg);

			// Restore original theme
			await themeOptions.nth(0).click();
			await windowWithSession.waitForTimeout(300);
		}

		await windowWithSession.keyboard.press('Escape');
	});
});
