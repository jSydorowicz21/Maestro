/**
 * Agent Spawn E2E Tests
 *
 * Tests that the input area is functional and the textarea
 * accepts user input. Without a real agent binary, we verify
 * the UI is ready for interaction rather than agent responses.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Agent Spawn', () => {
	test('input area is visible and has a textarea', async ({ windowWithSession }) => {
		// Dismiss any lingering modals from previous tests
		await windowWithSession.keyboard.press('Escape');
		await windowWithSession.waitForTimeout(300);

		const inputArea = windowWithSession.locator(SELECTORS.INPUT_AREA);
		await expect(inputArea).toBeVisible({ timeout: 10000 });

		const textarea = inputArea.locator('textarea');
		await expect(textarea).toBeVisible({ timeout: 5000 });
	});

	test('textarea accepts text input', async ({ windowWithSession }) => {
		const inputArea = windowWithSession.locator(SELECTORS.INPUT_AREA);
		await expect(inputArea).toBeVisible({ timeout: 10000 });

		const textarea = inputArea.locator('textarea');
		await expect(textarea).toBeVisible({ timeout: 5000 });

		// Type a message into the textarea
		await textarea.fill('Hello agent');
		const value = await textarea.inputValue();
		expect(value).toBe('Hello agent');
	});

	test('textarea is editable and can be cleared', async ({ windowWithSession }) => {
		const inputArea = windowWithSession.locator(SELECTORS.INPUT_AREA);
		await expect(inputArea).toBeVisible({ timeout: 10000 });

		const textarea = inputArea.locator('textarea');
		await expect(textarea).toBeVisible({ timeout: 5000 });

		// Fill, verify, clear, verify
		await textarea.fill('Test message');
		expect(await textarea.inputValue()).toBe('Test message');

		await textarea.fill('');
		expect(await textarea.inputValue()).toBe('');
	});

	test('main terminal area is present alongside input', async ({ windowWithSession }) => {
		const terminal = windowWithSession.locator(SELECTORS.MAIN_TERMINAL);
		await expect(terminal).toBeVisible({ timeout: 10000 });

		const inputArea = windowWithSession.locator(SELECTORS.INPUT_AREA);
		await expect(inputArea).toBeVisible({ timeout: 5000 });
	});
});
