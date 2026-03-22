/**
 * App Lifecycle E2E Tests
 *
 * Validates fundamental Electron app lifecycle behavior
 * using the base electron-app fixture (no mock agent needed).
 *
 * These are the most basic smoke tests: can the app launch,
 * render content, and display the expected initial screen?
 */
import { test, expect } from '../../fixtures/electron-app';

test.describe('App Lifecycle', () => {
	test('app launches and renders the Maestro window', async ({ window }) => {
		// The fixture already waits for firstWindow + domcontentloaded.
		// Verify the window has the correct title.
		const title = await window.title();
		expect(title.toLowerCase()).toContain('maestro');
	});

	test('fresh launch shows welcome screen or main UI', async ({ window }) => {
		// Dismiss Windows Support Notice if present
		const gotItButton = window.locator('button:has-text("Got it")');
		if (await gotItButton.isVisible({ timeout: 5000 }).catch(() => false)) {
			await gotItButton.click();
		}

		// After dismissing any initial modals, the app must reach either
		// the welcome screen (fresh install) or the main UI (existing data)
		const mainUI = window.locator('[data-tour]').first();
		const welcomeScreen = window.locator('text=Welcome to Maestro');
		const anyLoaded = mainUI.or(welcomeScreen);
		await expect(anyLoaded).toBeVisible({ timeout: 20000 });
	});
});
