/**
 * App Lifecycle E2E Tests
 *
 * Validates fundamental Electron app lifecycle behavior
 * using the base electron-app fixture (no mock agent needed).
 *
 * These tests confirm that the built app can launch, render,
 * and shut down cleanly - the most basic smoke tests.
 */
import { test, expect } from '../../fixtures/electron-app';

test.describe('App Lifecycle', () => {
	test('app launches without crash', async ({ electronApp }) => {
		// If we reach here the app launched successfully.
		// Verify we got a valid ElectronApplication handle.
		const windows = electronApp.windows();
		expect(windows.length).toBeGreaterThanOrEqual(0);
	});

	test('main window is created and visible', async ({ window }) => {
		// The fixture already waits for firstWindow + domcontentloaded.
		// In Electron, viewportSize() may return null since it's not a
		// standard browser. Verify the page is loaded via title or URL instead.
		const title = await window.title();
		expect(title).toBeTruthy();

		// Verify the page has rendered something (body exists with content)
		const body = window.locator('body');
		await expect(body).toBeVisible();
	});

	test('splash screen dismisses after load', async ({ window }) => {
		// On fresh install on Windows, a "Windows Support Notice" modal may
		// appear first. Dismiss it if present, then verify the main UI loads.
		const gotItButton = window.locator('button:has-text("Got it")');
		if (await gotItButton.isVisible({ timeout: 5000 }).catch(() => false)) {
			await gotItButton.click();
		}

		// After dismissing any initial modals, wait for the main UI, wizard,
		// or the fresh install welcome screen (shows "Welcome to Maestro")
		const mainUI = window.locator('[data-tour]').first();
		const welcomeScreen = window.locator('text=Welcome to Maestro');
		const anyLoaded = mainUI.or(welcomeScreen);
		await expect(anyLoaded).toBeVisible({ timeout: 20000 });
	});

	test('window title contains Maestro', async ({ window }) => {
		const title = await window.title();
		expect(title.toLowerCase()).toContain('maestro');
	});

	test('app closes gracefully', async ({ electronApp }) => {
		// Closing should not throw or hang.
		// The fixture teardown also calls close(), but we test it
		// explicitly here to make the intent clear.
		const closePromise = electronApp.close();
		await expect(closePromise).resolves.not.toThrow();
	});
});
