/**
 * Renderer Health E2E Tests
 *
 * Verifies the renderer process is healthy and React rendered correctly.
 */
import { test, expect } from '../../fixtures/session-factory';

test.describe('Renderer Health', () => {
	test('React root element exists', async ({ windowWithSession }) => {
		const root = windowWithSession.locator('#root');
		await expect(root).toBeVisible({ timeout: 10000 });

		const children = await root.locator('> *').count();
		expect(children).toBeGreaterThan(0);
	});

	test('no uncaught console errors on startup', async ({ windowWithSession: window }) => {
		// Collect console errors
		const errors: string[] = [];
		window.on('console', (msg) => {
			if (msg.type() === 'error') {
				errors.push(msg.text());
			}
		});

		// Wait for app to settle
		await window.waitForTimeout(2000);

		// Filter out known benign errors (deprecation warnings, etc.)
		const realErrors = errors.filter(
			(e) => !e.includes('DeprecationWarning') && !e.includes('DevTools') && !e.includes('Electron')
		);

		// Should have no critical React errors
		const hasCriticalError = realErrors.some(
			(e) => e.includes('Uncaught') || e.includes('React error') || e.includes('ChunkLoadError')
		);
		expect(hasCriticalError).toBe(false);
	});

	test('page has no broken images', async ({ windowWithSession: window }) => {
		const images = await window.locator('img').all();
		for (const img of images) {
			const naturalWidth = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
			// Broken images have naturalWidth of 0
			expect(naturalWidth).toBeGreaterThan(0);
		}
	});
});
