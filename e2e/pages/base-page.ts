/**
 * Base Page Object Model for Maestro E2E tests.
 *
 * Provides common helpers shared across all page objects.
 * Selector strategy: data-tour first, data-testid second, getByRole third.
 */
import type { Page, Locator } from '@playwright/test';

export class BasePage {
	constructor(protected readonly page: Page) {}

	/**
	 * Locate an element by its data-tour attribute.
	 */
	getByTour(name: string): Locator {
		return this.page.locator(`[data-tour="${name}"]`);
	}

	/**
	 * Locate an element by its data-testid attribute.
	 */
	getByTestId(id: string): Locator {
		return this.page.locator(`[data-testid="${id}"]`);
	}

	/**
	 * Press a keyboard shortcut.
	 *
	 * Accepts a single key combo string (e.g. "Control+Shift+N")
	 * or an array of combos to press in sequence.
	 */
	async pressShortcut(keys: string | string[]): Promise<void> {
		const combos = Array.isArray(keys) ? keys : [keys];
		for (const combo of combos) {
			await this.page.keyboard.press(combo);
		}
	}

	/**
	 * Wait until the application is ready by checking for
	 * any element with a data-tour attribute.
	 */
	async waitForAppReady(timeout = 15000): Promise<void> {
		await this.page.waitForSelector('[data-tour]', {
			state: 'visible',
			timeout,
		});
	}

	/**
	 * Wait for the app to reach a stable idle state.
	 *
	 * Waits for network activity to settle, then adds a short
	 * pause so any resulting re-renders can complete.
	 */
	async waitForIdle(timeout = 10000): Promise<void> {
		await this.page.waitForLoadState('networkidle', { timeout });
		// Allow a brief settle period for React renders
		await this.page.waitForTimeout(300);
	}
}
