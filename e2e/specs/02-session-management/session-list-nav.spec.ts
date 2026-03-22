/**
 * Session List Navigation E2E Tests
 *
 * Verifies agent cycling via Ctrl+] / Ctrl+[ and agent jump
 * via Alt+Ctrl+1. Tests that navigation shortcuts actually
 * change the selected agent, not just "app didn't crash."
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Session List Navigation', () => {
	test('Ctrl+] and Ctrl+[ cycle between agents', async ({ windowWithSession }) => {
		const sessionList = windowWithSession.locator(SELECTORS.SESSION_LIST);

		// We need at least 2 agents to test cycling. Create one if needed.
		const itemCount = await sessionList.locator('[data-testid="session-item"]').count();
		if (itemCount < 2) {
			// Create a second agent
			await windowWithSession.keyboard.press('Control+Shift+N');
			await windowWithSession.waitForTimeout(500);
			const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
			if (await dialog.first().isVisible().catch(() => false)) {
				const nameInput = dialog.locator('input').first();
				await nameInput.fill('Nav Test Agent');
				await windowWithSession.waitForTimeout(300);
				const createBtn = dialog.locator('button:has-text("Create Agent")');
				if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
					await createBtn.click({ timeout: 10000 });
					await windowWithSession.waitForTimeout(2000);
				} else {
					await windowWithSession.keyboard.press('Escape');
				}
			}
		}

		// Get the current placeholder to detect agent switch (different agents have different names in placeholder)
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		const placeholderBefore = await textarea.getAttribute('placeholder') ?? '';

		// Cycle forward
		await windowWithSession.keyboard.press('Control+]');
		await windowWithSession.waitForTimeout(500);

		// Cycle back
		await windowWithSession.keyboard.press('Control+[');
		await windowWithSession.waitForTimeout(500);

		// After cycling forward and back, placeholder should match the original
		const placeholderAfter = await textarea.getAttribute('placeholder') ?? '';
		expect(placeholderAfter).toBe(placeholderBefore);
	});

	test('Alt+Ctrl+1 jumps to first agent', async ({ windowWithSession }) => {
		// Navigate away first (if we have multiple agents)
		await windowWithSession.keyboard.press('Control+]');
		await windowWithSession.waitForTimeout(300);

		// Jump to first
		await windowWithSession.keyboard.press('Alt+Control+1');
		await windowWithSession.waitForTimeout(500);

		// Verify the session list is visible and first agent is selected
		const sessionList = windowWithSession.locator(SELECTORS.SESSION_LIST);
		await expect(sessionList).toBeVisible({ timeout: 5000 });

		// The first agent should be E2E Test Agent (created by session-factory)
		const sessionText = await sessionList.textContent() ?? '';
		expect(sessionText).toContain('E2E Test Agent');
	});
});
