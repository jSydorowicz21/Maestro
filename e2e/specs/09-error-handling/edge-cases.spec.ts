/**
 * Edge Case E2E Tests
 *
 * Verifies the app handles unusual inputs and rapid interactions gracefully.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Edge Cases', () => {
	test('app handles very long input text', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		const longText = 'a'.repeat(5000);
		await textarea.fill(longText);
		const value = await textarea.inputValue();
		expect(value.length).toBe(5000);
		await textarea.fill('');
	});

	test('app handles special characters in input', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		const specialText = '```python\nprint("hello <world> & friends")\n```\n$HOME ${PATH} `backticks`';
		await textarea.fill(specialText);
		const value = await textarea.inputValue();
		expect(value).toContain('```python');
		expect(value).toContain('<world>');
		await textarea.fill('');
	});

	test('app handles unicode and emoji in input', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		const unicodeText = 'Hello! Chinese: \u4f60\u597d Japanese: \u3053\u3093\u306b\u3061\u306f Arabic: \u0645\u0631\u062d\u0628\u0627';
		await textarea.fill(unicodeText);
		const value = await textarea.inputValue();
		expect(value).toContain('\u4f60\u597d');
		await textarea.fill('');
	});

	test('app survives toggling all panels rapidly', async ({ windowWithSession }) => {
		for (let i = 0; i < 5; i++) {
			await windowWithSession.keyboard.press('Alt+Control+ArrowLeft');
			await windowWithSession.waitForTimeout(50);
			await windowWithSession.keyboard.press('Alt+Control+ArrowRight');
			await windowWithSession.waitForTimeout(50);
		}

		await windowWithSession.waitForTimeout(500);
		const inputArea = windowWithSession.locator(SELECTORS.INPUT_AREA);
		await expect(inputArea).toBeVisible({ timeout: 5000 });
	});
});
