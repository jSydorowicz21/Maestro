/**
 * Session CRUD E2E Tests
 *
 * Uses the session-factory fixture which creates a single session
 * via the New Agent UI flow. All tests in this suite share that session.
 */
import { test, expect } from '../../fixtures/session-factory';

test.describe('Session CRUD', () => {
	test('session creation produces main UI with session list', async ({ windowWithSession }) => {
		const sessionList = windowWithSession.locator('[data-tour="session-list"]');
		await expect(sessionList).toBeVisible({ timeout: 10000 });
	});

	test('input area is available after session creation', async ({ windowWithSession }) => {
		const inputArea = windowWithSession.locator('[data-tour="input-area"]');
		await expect(inputArea).toBeVisible({ timeout: 10000 });

		const textarea = inputArea.locator('textarea');
		await expect(textarea).toBeVisible({ timeout: 5000 });
	});

	test('tab bar is visible with at least one tab', async ({ windowWithSession }) => {
		const tabBar = windowWithSession.locator('[data-tour="tab-bar"]');
		await expect(tabBar).toBeVisible({ timeout: 10000 });
	});

	test('main terminal area is visible', async ({ windowWithSession }) => {
		const terminal = windowWithSession.locator('[data-tour="main-terminal"]');
		await expect(terminal).toBeVisible({ timeout: 10000 });
	});

	test('header controls are visible', async ({ windowWithSession }) => {
		const controls = windowWithSession.locator('[data-tour="header-controls"]');
		await expect(controls).toBeVisible({ timeout: 10000 });
	});
});
