/**
 * Agent Output Formats E2E Tests
 *
 * Tests various agent response formats using mock agent keywords.
 * Covers: markdown rendering, JSON blocks, tool calls, thinking, long output.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Agent Output Formats', () => {
	test('markdown keyword message can be sent to agent', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		await textarea.fill('__MARKDOWN__ show analysis');
		await windowWithSession.keyboard.press('Control+Enter');
		await windowWithSession.waitForTimeout(5000);

		// App should remain responsive regardless of agent response
		await expect(windowWithSession.locator(SELECTORS.INPUT_AREA)).toBeVisible({ timeout: 5000 });
	});

	test('JSON keyword message can be sent to agent', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		await textarea.fill('__JSON__ show test results');
		await windowWithSession.keyboard.press('Control+Enter');
		await windowWithSession.waitForTimeout(5000);

		await expect(windowWithSession.locator(SELECTORS.INPUT_AREA)).toBeVisible({ timeout: 5000 });
	});

	test('tool call keyword message can be sent to agent', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		await textarea.fill('__TOOLCALL__ read a file');
		await windowWithSession.keyboard.press('Control+Enter');
		await windowWithSession.waitForTimeout(5000);

		await expect(windowWithSession.locator(SELECTORS.INPUT_AREA)).toBeVisible({ timeout: 5000 });
	});

	test('long response renders without freezing', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		await textarea.fill('__LONG__ give me a detailed explanation');
		await windowWithSession.keyboard.press('Control+Enter');
		await windowWithSession.waitForTimeout(8000);

		// App should still be responsive after long output
		await expect(windowWithSession.locator(SELECTORS.INPUT_AREA)).toBeVisible({ timeout: 5000 });

		// Terminal should have substantial content
		const terminal = windowWithSession.locator(SELECTORS.MAIN_TERMINAL);
		const text = await terminal.textContent() ?? '';
		expect(text.length).toBeGreaterThan(200);
	});

	test('high context usage response completes without error', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		await textarea.fill('__HIGHCONTEXT__ analyze everything');
		await windowWithSession.keyboard.press('Control+Enter');
		await windowWithSession.waitForTimeout(5000);

		// App should remain responsive
		await expect(windowWithSession.locator(SELECTORS.INPUT_AREA)).toBeVisible({ timeout: 5000 });
	});
});
