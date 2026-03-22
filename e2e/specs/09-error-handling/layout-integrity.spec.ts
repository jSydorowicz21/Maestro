/**
 * Layout Integrity E2E Tests
 *
 * Verifies the three-panel layout maintains correct spatial
 * ordering and positioning across interactions.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Layout Integrity', () => {
	test('session list is positioned left of main terminal', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(200);

		const sessionList = windowWithSession.locator(SELECTORS.SESSION_LIST);
		const terminal = windowWithSession.locator(SELECTORS.MAIN_TERMINAL);

		const leftBox = await sessionList.boundingBox();
		const centerBox = await terminal.boundingBox();

		expect(leftBox).toBeTruthy();
		expect(centerBox).toBeTruthy();
		expect(leftBox!.x + leftBox!.width).toBeLessThanOrEqual(centerBox!.x + 2);
	});

	test('header controls are positioned at the top of the window', async ({ windowWithSession }) => {
		const header = windowWithSession.locator(SELECTORS.HEADER_CONTROLS);
		const headerBox = await header.boundingBox();

		expect(headerBox).toBeTruthy();
		expect(headerBox!.y).toBeLessThan(80);
	});

	test('input area is positioned below main terminal area', async ({ windowWithSession }) => {
		const inputArea = windowWithSession.locator(SELECTORS.INPUT_AREA);
		const terminal = windowWithSession.locator(SELECTORS.MAIN_TERMINAL);

		const inputBox = await inputArea.boundingBox();
		const termBox = await terminal.boundingBox();

		expect(inputBox).toBeTruthy();
		expect(termBox).toBeTruthy();
		expect(inputBox!.y).toBeGreaterThan(termBox!.y);
	});

	test('toggling left panel off gives terminal more width', async ({ windowWithSession }) => {
		const terminal = windowWithSession.locator(SELECTORS.MAIN_TERMINAL);
		const sessionList = windowWithSession.locator(SELECTORS.SESSION_LIST);

		// Ensure left panel is visible first
		if (!await sessionList.isVisible().catch(() => false)) {
			await windowWithSession.keyboard.press('Alt+Control+ArrowLeft');
			await windowWithSession.waitForTimeout(300);
		}

		const widthWithPanel = (await terminal.boundingBox())!.width;

		// Hide left panel
		await windowWithSession.keyboard.press('Alt+Control+ArrowLeft');
		await windowWithSession.waitForTimeout(300);

		const widthWithoutPanel = (await terminal.boundingBox())!.width;

		// Terminal should be wider when left panel is hidden
		expect(widthWithoutPanel).toBeGreaterThan(widthWithPanel);

		// Restore left panel
		await windowWithSession.keyboard.press('Alt+Control+ArrowLeft');
		await windowWithSession.waitForTimeout(300);
	});
});
