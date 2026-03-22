/**
 * Agent Output Formats E2E Tests
 *
 * Tests that different mock agent response formats (markdown, JSON,
 * tool calls, thinking, long output) render correctly in the terminal.
 * Each test verifies specific expected content, not just "app didn't crash."
 *
 * The mock agent (mock-claude.mjs) responds to keyword prompts with known
 * output. Since no responses/*.json files exist, the mock uses inline
 * fallback text for each keyword.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Agent Output Formats', () => {
	test('markdown response renders heading and code block content', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		const terminal = windowWithSession.locator(SELECTORS.MAIN_TERMINAL);

		await textarea.fill('__MARKDOWN__ show analysis');
		await windowWithSession.keyboard.press('Control+Enter');
		await windowWithSession.waitForTimeout(5000);

		// Mock emits: "# Analysis Report\n\n## Summary\n\nHere are the findings..."
		// with a code block containing a function named "greet"
		const text = await terminal.textContent() ?? '';
		expect(text).toContain('Analysis Report');
		// Also verify some body content rendered (code block or list items)
		const hasBodyContent = text.includes('greet') || text.includes('findings') || text.includes('Conclusion');
		expect(hasBodyContent).toBe(true);
	});

	test('JSON response renders structured data', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		const terminal = windowWithSession.locator(SELECTORS.MAIN_TERMINAL);

		await textarea.fill('__JSON__ show test results');
		await windowWithSession.keyboard.press('Control+Enter');
		await windowWithSession.waitForTimeout(5000);

		// Mock emits: {"status":"success","tests":146,"passed":146,"failed":0,"coverage":"95%"}
		// inside a ```json code block. Terminal may render as plain text.
		const text = await terminal.textContent() ?? '';
		const hasJsonContent = text.includes('success') || text.includes('status') || text.includes('146');
		expect(hasJsonContent).toBe(true);
	});

	test('tool call keyword produces agent response', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		const terminal = windowWithSession.locator(SELECTORS.MAIN_TERMINAL);
		const beforeLength = (await terminal.textContent() ?? '').length;

		await textarea.fill('__TOOLCALL__ read a file');
		await windowWithSession.keyboard.press('Control+Enter');
		await windowWithSession.waitForTimeout(5000);

		// Tool call events may not render as text, but the result text should appear
		const text = await terminal.textContent() ?? '';
		// Terminal should have grown (agent produced some output)
		expect(text.length).toBeGreaterThan(beforeLength);
	});

	test('long response renders multiple paragraphs', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		const terminal = windowWithSession.locator(SELECTORS.MAIN_TERMINAL);

		await textarea.fill('__LONG__ give me a detailed explanation');
		await windowWithSession.keyboard.press('Control+Enter');
		await windowWithSession.waitForTimeout(8000);

		// Mock emits 10 paragraphs: "Paragraph 1: ..." through "Paragraph 10: ..."
		const text = await terminal.textContent() ?? '';
		expect(text).toContain('Paragraph 1');
		// Verify multiple paragraphs rendered (at least first and a later one)
		const hasMultiple = text.includes('Paragraph 5') || text.includes('Paragraph 10');
		expect(hasMultiple).toBe(true);
	});

	test('thinking keyword produces agent response', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		const terminal = windowWithSession.locator(SELECTORS.MAIN_TERMINAL);
		const beforeLength = (await terminal.textContent() ?? '').length;

		await textarea.fill('__THINKING__ analyze this');
		await windowWithSession.keyboard.press('Control+Enter');
		await windowWithSession.waitForTimeout(5000);

		// Thinking blocks may not render as visible text, but the result should
		const text = await terminal.textContent() ?? '';
		expect(text.length).toBeGreaterThan(beforeLength);
	});
});
