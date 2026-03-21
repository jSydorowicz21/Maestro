/**
 * Main Panel Page Object Model
 *
 * Encapsulates interactions with the central workspace area,
 * including the tab bar, terminal output, and input area.
 */
import type { Locator } from '@playwright/test';
import { BasePage } from '../pages/base-page';
import { SELECTORS } from '../utils/selectors';

export class MainPanel extends BasePage {
	/** The tab bar across the top of the main panel */
	get tabBar(): Locator {
		return this.page.locator(SELECTORS.TAB_BAR);
	}

	/** The terminal output area */
	get terminal(): Locator {
		return this.page.locator(SELECTORS.MAIN_TERMINAL);
	}

	/** The message input area at the bottom */
	get inputArea(): Locator {
		return this.page.locator(SELECTORS.INPUT_AREA);
	}

	/**
	 * Locator for all tab elements in the tab bar.
	 */
	getTabs(): Locator {
		return this.tabBar.locator('[role="tab"]');
	}

	/**
	 * Return the number of tabs currently open.
	 */
	async getTabCount(): Promise<number> {
		return this.getTabs().count();
	}

	/**
	 * Locator for the currently active tab.
	 */
	getActiveTab(): Locator {
		return this.tabBar.locator('[role="tab"][aria-selected="true"]');
	}

	/**
	 * Click a tab by its zero-based index to switch to it.
	 */
	async selectTab(index: number): Promise<void> {
		await this.getTabs().nth(index).click();
	}

	/**
	 * Close a tab by clicking its close (X) button.
	 */
	async closeTab(index: number): Promise<void> {
		const tab = this.getTabs().nth(index);
		const closeButton = tab.locator('button', { hasText: /x|close/i }).or(
			tab.locator('[aria-label="Close"]'),
		);
		await closeButton.click();
	}

	/**
	 * Get the visible text content from the terminal area.
	 */
	async getTerminalContent(): Promise<string> {
		return (await this.terminal.textContent()) ?? '';
	}

	/**
	 * Type text into the input area.
	 */
	async typeInInput(text: string): Promise<void> {
		await this.inputArea.locator('textarea, input').first().fill(text);
	}

	/**
	 * Submit the current input by pressing Enter.
	 */
	async submitInput(): Promise<void> {
		await this.inputArea.locator('textarea, input').first().press('Enter');
	}

	/**
	 * Clear the input area.
	 */
	async clearInput(): Promise<void> {
		const field = this.inputArea.locator('textarea, input').first();
		await field.fill('');
	}

	/**
	 * Toggle the star/favorite indicator on a tab by index.
	 */
	async toggleStar(tabIndex: number): Promise<void> {
		const tab = this.getTabs().nth(tabIndex);
		const starButton = tab.locator('[aria-label*="star"], [aria-label*="favorite"]').or(
			tab.locator('button').filter({ hasText: /star/i }),
		);
		await starButton.click();
	}
}
