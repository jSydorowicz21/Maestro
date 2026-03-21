/**
 * Modal Manager Page Object Model
 *
 * Provides generic helpers for interacting with any modal dialog
 * in the application, including counting, closing, and waiting
 * for modals to open or close.
 */
import type { Locator } from '@playwright/test';
import { BasePage } from './base-page';
import { SELECTORS } from '../utils/selectors';

export class ModalManager extends BasePage {
	/**
	 * Locator for all visible modal dialogs.
	 */
	get modals(): Locator {
		return this.page.locator(SELECTORS.MODAL_DIALOG);
	}

	/**
	 * Locator for the topmost visible dialog.
	 *
	 * When multiple dialogs are stacked, returns the last one
	 * in DOM order (typically the topmost layer).
	 */
	getTopModal(): Locator {
		return this.modals.last();
	}

	/**
	 * Check whether any modal dialog is currently open.
	 */
	async isModalOpen(): Promise<boolean> {
		const count = await this.modals.count();
		return count > 0;
	}

	/**
	 * Close the topmost modal by pressing Escape.
	 */
	async closeTopModal(): Promise<void> {
		await this.pressShortcut('Escape');
	}

	/**
	 * Return the number of currently visible modal dialogs.
	 */
	async getModalCount(): Promise<number> {
		return this.modals.count();
	}

	/**
	 * Wait for at least one modal dialog to appear.
	 */
	async waitForModalOpen(timeout = 5000): Promise<void> {
		await this.modals.first().waitFor({ state: 'visible', timeout });
	}

	/**
	 * Wait for all modal dialogs to close.
	 */
	async waitForModalClose(timeout = 5000): Promise<void> {
		await this.page.waitForSelector(SELECTORS.MODAL_DIALOG, {
			state: 'hidden',
			timeout,
		});
	}
}
