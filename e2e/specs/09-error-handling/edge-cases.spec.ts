/**
 * Edge Case E2E Tests
 *
 * Verifies the app correctly handles unusual inputs -
 * long text, special characters, and unicode content.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Edge Cases', () => {
	test('textarea accepts and preserves 5000-character input', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		const longText = 'a'.repeat(5000);
		await textarea.fill(longText);
		const value = await textarea.inputValue();
		expect(value.length).toBe(5000);
		await textarea.fill('');
	});

	test('textarea preserves code blocks, HTML entities, and shell variables', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		const specialText = '```python\nprint("hello <world> & friends")\n```\n$HOME ${PATH} `backticks`';
		await textarea.fill(specialText);
		const value = await textarea.inputValue();
		expect(value).toContain('```python');
		expect(value).toContain('<world>');
		expect(value).toContain('$HOME');
		expect(value).toContain('`backticks`');
		await textarea.fill('');
	});

	test('textarea preserves CJK and Arabic unicode characters', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		const unicodeText = '\u4f60\u597d \u3053\u3093\u306b\u3061\u306f \u0645\u0631\u062d\u0628\u0627';
		await textarea.fill(unicodeText);
		const value = await textarea.inputValue();
		expect(value).toContain('\u4f60\u597d');
		expect(value).toContain('\u3053\u3093\u306b\u3061\u306f');
		expect(value).toContain('\u0645\u0631\u062d\u0628\u0627');
		await textarea.fill('');
	});

	test('textarea preserves content after rapid clear-and-refill cycles', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);

		// Rapid fill/clear cycles
		for (let i = 0; i < 10; i++) {
			await textarea.fill(`iteration ${i}`);
			await textarea.fill('');
		}

		// Final fill should still work correctly
		await textarea.fill('final value');
		expect(await textarea.inputValue()).toBe('final value');
		await textarea.fill('');
	});
});
