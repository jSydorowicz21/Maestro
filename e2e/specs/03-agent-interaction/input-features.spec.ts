/**
 * Input Features E2E Tests
 *
 * Verifies input area behaviors: meaningful placeholder text,
 * multiline input support, and auto-grow height.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Input Features', () => {
	test('textarea placeholder indicates the active agent', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		const placeholder = await textarea.getAttribute('placeholder') ?? '';

		// Placeholder should mention "Talking to" and reference the agent
		expect(placeholder.toLowerCase()).toContain('talking to');
	});

	test('textarea supports multiline input via fill', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		await textarea.fill('line 1\nline 2\nline 3');
		const value = await textarea.inputValue();
		const lines = value.split('\n');
		expect(lines.length).toBe(3);
		expect(lines[0]).toBe('line 1');
		expect(lines[2]).toBe('line 3');
		await textarea.fill('');
	});

	test('textarea grows taller with more lines of content', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);

		// Measure empty height
		const emptyBox = await textarea.boundingBox();
		expect(emptyBox).toBeTruthy();

		// Fill with multiple lines
		await textarea.fill('line 1\nline 2\nline 3\nline 4\nline 5');
		await windowWithSession.waitForTimeout(200);
		const fullBox = await textarea.boundingBox();
		expect(fullBox).toBeTruthy();

		if (emptyBox && fullBox) {
			expect(fullBox.height).toBeGreaterThan(emptyBox.height);
		}

		await textarea.fill('');
	});
});
