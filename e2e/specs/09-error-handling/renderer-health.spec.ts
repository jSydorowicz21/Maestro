/**
 * Renderer Health E2E Tests
 *
 * Verifies the renderer process is healthy: React rendered,
 * no critical console errors, and no broken images.
 */
import { test, expect } from '../../fixtures/session-factory';

test.describe('Renderer Health', () => {
	test('React root has rendered child components', async ({ windowWithSession }) => {
		const root = windowWithSession.locator('#root');
		await expect(root).toBeVisible({ timeout: 10000 });

		const children = await root.locator('> *').count();
		expect(children).toBeGreaterThan(0);
	});

	test('no critical React or chunk-load errors in console', async ({ windowWithSession: window }) => {
		const errors: string[] = [];
		window.on('console', (msg) => {
			if (msg.type() === 'error') {
				errors.push(msg.text());
			}
		});

		// Wait for app to settle
		await window.waitForTimeout(2000);

		// Filter out benign noise
		const criticalErrors = errors.filter(
			(e) =>
				!e.includes('DeprecationWarning') &&
				!e.includes('DevTools') &&
				!e.includes('Electron')
		).filter(
			(e) =>
				e.includes('Uncaught') ||
				e.includes('React error') ||
				e.includes('ChunkLoadError') ||
				e.includes('Cannot read properties of null')
		);

		expect(criticalErrors).toHaveLength(0);
	});

	test('all rendered images have non-zero naturalWidth', async ({ windowWithSession: window }) => {
		const images = await window.locator('img').all();
		for (const img of images) {
			const naturalWidth = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
			expect(naturalWidth).toBeGreaterThan(0);
		}
	});
});
