/**
 * Right Panel Page Object Model
 *
 * Encapsulates interactions with the right sidebar,
 * including the Files, History, and Auto Run tabs.
 */
import type { Locator } from '@playwright/test';
import { BasePage } from '../pages/base-page';
import { SELECTORS } from '../utils/selectors';

export class RightPanel extends BasePage {
	/** Files tab button */
	get filesTab(): Locator {
		return this.page.locator(SELECTORS.FILES_TAB);
	}

	/** History tab button */
	get historyTab(): Locator {
		return this.page.locator(SELECTORS.HISTORY_TAB);
	}

	/** Auto Run tab button */
	get autoRunTab(): Locator {
		return this.page.locator(SELECTORS.AUTORUN_TAB);
	}

	/** Files panel content */
	get filesPanel(): Locator {
		return this.page.locator(SELECTORS.FILES_PANEL);
	}

	/** History panel content */
	get historyPanel(): Locator {
		return this.page.locator(SELECTORS.HISTORY_PANEL);
	}

	/** Auto Run panel content */
	get autoRunPanel(): Locator {
		return this.page.locator(SELECTORS.AUTORUN_PANEL);
	}

	/**
	 * Switch to the Files tab.
	 */
	async switchToFilesTab(): Promise<void> {
		await this.filesTab.click();
	}

	/**
	 * Switch to the History tab.
	 */
	async switchToHistoryTab(): Promise<void> {
		await this.historyTab.click();
	}

	/**
	 * Switch to the Auto Run tab.
	 */
	async switchToAutoRunTab(): Promise<void> {
		await this.autoRunTab.click();
	}

	/**
	 * Check whether the Files tab is currently active.
	 */
	async isFilesTabActive(): Promise<boolean> {
		const ariaSelected = await this.filesTab.getAttribute('aria-selected');
		const classes = await this.filesTab.getAttribute('class');
		return (
			ariaSelected === 'true' ||
			(classes !== null && classes.includes('active'))
		);
	}

	/**
	 * Check whether the History tab is currently active.
	 */
	async isHistoryTabActive(): Promise<boolean> {
		const ariaSelected = await this.historyTab.getAttribute('aria-selected');
		const classes = await this.historyTab.getAttribute('class');
		return (
			ariaSelected === 'true' ||
			(classes !== null && classes.includes('active'))
		);
	}

	/**
	 * Check whether the Auto Run tab is currently active.
	 */
	async isAutoRunTabActive(): Promise<boolean> {
		const ariaSelected = await this.autoRunTab.getAttribute('aria-selected');
		const classes = await this.autoRunTab.getAttribute('class');
		return (
			ariaSelected === 'true' ||
			(classes !== null && classes.includes('active'))
		);
	}

	/**
	 * Get the text content of whichever panel is currently visible.
	 */
	async getPanelContent(): Promise<string> {
		for (const panel of [this.filesPanel, this.historyPanel, this.autoRunPanel]) {
			if (await panel.isVisible().catch(() => false)) {
				return (await panel.textContent()) ?? '';
			}
		}
		return '';
	}

	/**
	 * Check whether the right panel container is visible.
	 */
	async isVisible(): Promise<boolean> {
		// If any of the three panels is visible, the right panel is showing
		for (const panel of [this.filesPanel, this.historyPanel, this.autoRunPanel]) {
			if (await panel.isVisible().catch(() => false)) {
				return true;
			}
		}
		return false;
	}
}
