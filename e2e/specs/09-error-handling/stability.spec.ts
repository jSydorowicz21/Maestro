/**
 * App Stability E2E Tests
 *
 * Stress tests that verify the app handles rapid, overlapping
 * interactions without freezing or losing state.
 * Limited to 2 stress tests as these are broad "app survives" checks.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('App Stability', () => {
	test('rapid shortcut sequence does not freeze the UI', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(200);

		// Fire a sequence of shortcuts that open/close various UI elements
		const shortcuts = [
			'Control+k', 'Escape',           // Quick actions open/close
			'Control+,', 'Escape',            // Settings open/close
			'Control+Shift+f', 'Control+Shift+h', 'Control+Shift+1', // Right panel tabs
			'Alt+Control+ArrowLeft', 'Alt+Control+ArrowLeft',        // Left panel toggle
		];

		for (const shortcut of shortcuts) {
			await windowWithSession.keyboard.press(shortcut);
			await windowWithSession.waitForTimeout(100);
		}

		await windowWithSession.waitForTimeout(500);

		// After all that, verify the textarea is still editable (not frozen)
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		await textarea.fill('still alive after shortcut storm');
		expect(await textarea.inputValue()).toBe('still alive after shortcut storm');
		await textarea.fill('');
	});

	test('creating and closing multiple tabs preserves tab bar', async ({ windowWithSession }) => {
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(200);

		const tabBar = windowWithSession.locator(SELECTORS.TAB_BAR);
		const tabBarTextBefore = await tabBar.textContent() ?? '';

		// Create 3 tabs using Ctrl+N (new agent)
		for (let i = 0; i < 3; i++) {
			await windowWithSession.keyboard.press('Control+n');
			await windowWithSession.waitForTimeout(300);
		}

		const tabBarTextAfterCreate = await tabBar.textContent() ?? '';
		// Tab bar text should have grown (more tab labels)
		expect(tabBarTextAfterCreate.length).toBeGreaterThan(tabBarTextBefore.length);

		// Close the created tabs
		for (let i = 0; i < 3; i++) {
			await windowWithSession.keyboard.press('Control+w');
			await windowWithSession.waitForTimeout(300);
		}

		// Tab bar should still be visible and functional
		await expect(tabBar).toBeVisible({ timeout: 3000 });
	});
});
