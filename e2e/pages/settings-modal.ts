/**
 * Settings Modal Page Object Model
 *
 * Encapsulates interactions with the settings modal dialog,
 * including opening/closing, theme selection, font size,
 * and conductor profile management.
 */
import type { Locator } from '@playwright/test';
import { BasePage } from './base-page';
import { SELECTORS } from '../utils/selectors';
import { SHORTCUTS } from '../utils/keyboard';

export class SettingsModal extends BasePage {
	/** The settings dialog container */
	get dialog(): Locator {
		return this.page.locator(SELECTORS.MODAL_DIALOG).filter({ hasText: /settings/i });
	}

	/**
	 * Open the settings modal via Ctrl+, shortcut.
	 */
	async open(): Promise<void> {
		await this.pressShortcut(SHORTCUTS.settings);
		await this.dialog.waitFor({ state: 'visible', timeout: 5000 });
	}

	/**
	 * Close the settings modal by pressing Escape.
	 */
	async close(): Promise<void> {
		await this.pressShortcut('Escape');
		await this.dialog.waitFor({ state: 'hidden', timeout: 5000 });
	}

	/**
	 * Check whether the settings modal is currently visible.
	 */
	async isOpen(): Promise<boolean> {
		return this.dialog.isVisible();
	}

	/**
	 * Select a theme by name.
	 *
	 * Finds the theme option within the settings dialog and clicks it.
	 */
	async selectTheme(themeName: string): Promise<void> {
		const themeOption = this.dialog
			.locator('[data-testid*="theme"], [role="option"], button, label')
			.filter({ hasText: themeName });
		await themeOption.first().click();
	}

	/**
	 * Set the font size input to the given numeric value.
	 */
	async setFontSize(size: number): Promise<void> {
		const fontInput = this.dialog.locator(
			'input[type="number"], input[aria-label*="font" i], input[data-testid*="font-size"]',
		);
		await fontInput.first().fill(String(size));
	}

	/**
	 * Get the current text content of the conductor profile field.
	 */
	async getConductorProfile(): Promise<string> {
		const profileField = this.dialog.locator(
			'textarea[data-testid*="conductor"], textarea[aria-label*="conductor" i], textarea',
		);
		return (await profileField.first().inputValue()) ?? '';
	}

	/**
	 * Set the conductor profile textarea to the given text.
	 */
	async setConductorProfile(text: string): Promise<void> {
		const profileField = this.dialog.locator(
			'textarea[data-testid*="conductor"], textarea[aria-label*="conductor" i], textarea',
		);
		await profileField.first().fill(text);
	}

	/**
	 * Save settings and close the modal.
	 *
	 * Clicks the save/apply button if present, then closes the dialog.
	 */
	async saveAndClose(): Promise<void> {
		const saveButton = this.dialog
			.locator('button')
			.filter({ hasText: /save|apply|done/i });
		const saveCount = await saveButton.count();
		if (saveCount > 0) {
			await saveButton.first().click();
		}
		await this.close();
	}
}
