/**
 * Panel Shortcut E2E Tests
 *
 * Verifies that left and right panel toggle shortcuts actually
 * show/hide the respective panels, not just that the app survives.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Panel Shortcuts', () => {
	test('Alt+Ctrl+Left toggles left panel visibility', async ({ windowWithSession }) => {
		const sessionList = windowWithSession.locator(SELECTORS.SESSION_LIST);
		const initiallyVisible = await sessionList.isVisible().catch(() => false);

		// Toggle left panel
		await windowWithSession.keyboard.press('Alt+Control+ArrowLeft');
		await windowWithSession.waitForTimeout(500);

		const afterFirstToggle = await sessionList.isVisible().catch(() => false);
		// State should have flipped
		expect(afterFirstToggle).toBe(!initiallyVisible);

		// Toggle back to restore original state
		await windowWithSession.keyboard.press('Alt+Control+ArrowLeft');
		await windowWithSession.waitForTimeout(500);

		const afterSecondToggle = await sessionList.isVisible().catch(() => false);
		// Should be back to original
		expect(afterSecondToggle).toBe(initiallyVisible);
	});

	test('Alt+Ctrl+Right toggles right panel visibility', async ({ windowWithSession }) => {
		// First, ensure right panel is in a known state by opening the history tab
		await windowWithSession.keyboard.press('Control+Shift+h');
		await windowWithSession.waitForTimeout(500);

		const historyTab = windowWithSession.locator(SELECTORS.HISTORY_TAB);
		const historyPanel = windowWithSession.locator(SELECTORS.HISTORY_PANEL);

		// Check if any right panel tab is visible as our baseline
		const rightPanelOpen = await historyTab.isVisible().catch(() => false)
			|| await historyPanel.isVisible().catch(() => false);

		// Toggle right panel closed
		await windowWithSession.keyboard.press('Alt+Control+ArrowRight');
		await windowWithSession.waitForTimeout(500);

		const afterToggle = await historyTab.isVisible().catch(() => false);
		if (rightPanelOpen) {
			// If it was open, it should now be closed
			expect(afterToggle).toBe(false);
		}

		// Toggle back
		await windowWithSession.keyboard.press('Alt+Control+ArrowRight');
		await windowWithSession.waitForTimeout(500);

		const afterRestore = await historyTab.isVisible().catch(() => false);
		// After toggling twice, we should be back to the original state
		expect(afterRestore).toBe(rightPanelOpen);
	});
});
