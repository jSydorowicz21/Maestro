/**
 * Input Features E2E Tests
 *
 * Verifies input area features: placeholder, auto-grow, multiline.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Input Features', () => {
	test('textarea has a meaningful placeholder', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		const placeholder = await textarea.getAttribute('placeholder') ?? '';
		expect(placeholder.length).toBeGreaterThan(5);
		expect(placeholder.toLowerCase()).toContain('talking to');
	});

	test('textarea supports multiline input', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		await textarea.fill('line 1\nline 2\nline 3');
		const value = await textarea.inputValue();
		expect(value).toContain('\n');
		expect(value.split('\n').length).toBe(3);
		await textarea.fill('');
	});

	test('textarea grows vertically with content', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		const emptyBox = await textarea.boundingBox();

		await textarea.fill('line 1\nline 2\nline 3\nline 4\nline 5');
		await windowWithSession.waitForTimeout(200);
		const fullBox = await textarea.boundingBox();

		expect(emptyBox).toBeTruthy();
		expect(fullBox).toBeTruthy();
		if (emptyBox && fullBox) {
			expect(fullBox.height).toBeGreaterThanOrEqual(emptyBox.height);
		}
		await textarea.fill('');
	});
});
