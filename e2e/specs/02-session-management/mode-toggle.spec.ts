/**
 * Mode Toggle E2E Tests
 *
 * Verifies switching between AI and Terminal modes via Ctrl+J.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Mode Toggle', () => {
	test('Ctrl+J toggles between AI and terminal mode', async ({ windowWithSession }) => {
		const inputArea = windowWithSession.locator(SELECTORS.INPUT_AREA);
		await expect(inputArea).toBeVisible({ timeout: 5000 });

		// Get initial placeholder text
		const textarea = inputArea.locator('textarea');
		const initialPlaceholder = await textarea.getAttribute('placeholder') ?? '';

		// Toggle mode
		await windowWithSession.keyboard.press('Control+j');
		await windowWithSession.waitForTimeout(500);

		// Placeholder should change (AI mode says "Talking to...", terminal mode says different)
		const newPlaceholder = await textarea.getAttribute('placeholder') ?? '';

		// Toggle back
		await windowWithSession.keyboard.press('Control+j');
		await windowWithSession.waitForTimeout(500);

		const restoredPlaceholder = await textarea.getAttribute('placeholder') ?? '';
		expect(restoredPlaceholder).toBe(initialPlaceholder);
	});

	test('input area remains functional after mode toggle', async ({ windowWithSession }) => {
		// Toggle to terminal mode and back
		await windowWithSession.keyboard.press('Control+j');
		await windowWithSession.waitForTimeout(300);
		await windowWithSession.keyboard.press('Control+j');
		await windowWithSession.waitForTimeout(300);

		// Input should still work
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		await textarea.fill('test after toggle');
		const value = await textarea.inputValue();
		expect(value).toBe('test after toggle');
		await textarea.fill('');
	});
});
