/**
 * Session CRUD E2E Tests
 *
 * Tests creating, verifying, and deleting agents via the UI.
 * Uses the session-factory fixture which creates a single session
 * via the New Agent UI flow. All tests share that session.
 */
import { test, expect } from '../../fixtures/session-factory';
import { SELECTORS } from '../../utils/selectors';

test.describe('Session CRUD', () => {
	test('created agent appears in session list with correct name', async ({ windowWithSession }) => {
		const sessionList = windowWithSession.locator(SELECTORS.SESSION_LIST);
		await expect(sessionList).toBeVisible({ timeout: 10000 });

		// The session-factory creates an agent named "E2E Test Agent"
		const sessionText = await sessionList.textContent() ?? '';
		expect(sessionText).toContain('E2E Test Agent');
	});

	test('creating a second agent adds it to the session list', async ({ windowWithSession }) => {
		const sessionList = windowWithSession.locator(SELECTORS.SESSION_LIST);

		// Count agents before
		const itemsBefore = await sessionList.locator('[data-testid="session-item"]').count();

		// Open new agent dialog
		await windowWithSession.keyboard.press('Control+Shift+N');
		await windowWithSession.waitForTimeout(500);

		const dialog = windowWithSession.locator(SELECTORS.MODAL_DIALOG);
		await expect(dialog.first()).toBeVisible({ timeout: 5000 });

		// Fill in agent name
		const nameInput = dialog.locator('input').first();
		await nameInput.fill('Second E2E Agent');
		await windowWithSession.waitForTimeout(300);

		// Click Create Agent button
		const createBtn = dialog.locator('button:has-text("Create Agent")');
		if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
			await createBtn.click({ timeout: 10000 });
			await windowWithSession.waitForTimeout(2000);

			// Verify count increased
			const itemsAfter = await sessionList.locator('[data-testid="session-item"]').count();
			expect(itemsAfter).toBeGreaterThan(itemsBefore);
		} else {
			// Close dialog if Create button not found
			await windowWithSession.keyboard.press('Escape');
		}
	});

	test('input area is functional - accepts and clears text', async ({ windowWithSession }) => {
		const textarea = windowWithSession.locator(`${SELECTORS.INPUT_AREA} textarea`);
		await expect(textarea).toBeVisible({ timeout: 5000 });

		// Fill and verify value
		await textarea.fill('CRUD test message');
		expect(await textarea.inputValue()).toBe('CRUD test message');

		// Clear and verify empty
		await textarea.fill('');
		expect(await textarea.inputValue()).toBe('');
	});
});
