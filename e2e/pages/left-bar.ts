/**
 * Left Bar Page Object Model
 *
 * Encapsulates interactions with the left sidebar / session list,
 * including session CRUD, hamburger menu, and session selection.
 */
import type { Locator } from '@playwright/test';
import { BasePage } from '../pages/base-page';
import { SELECTORS } from '../utils/selectors';

export class LeftBar extends BasePage {
	/** Container for the full session list */
	get sessionList(): Locator {
		return this.page.locator(SELECTORS.SESSION_LIST);
	}

	/** Hamburger menu button */
	get hamburgerMenu(): Locator {
		return this.page.locator(SELECTORS.HAMBURGER_MENU);
	}

	/** Hamburger menu dropdown contents */
	get hamburgerMenuContents(): Locator {
		return this.page.locator(SELECTORS.HAMBURGER_MENU_CONTENTS);
	}

	/**
	 * Locator for all session items in the list.
	 */
	getSessionItems(): Locator {
		return this.sessionList.locator(SELECTORS.SESSION_ITEM);
	}

	/**
	 * Locator for a single session matching the given name.
	 */
	getSessionByName(name: string): Locator {
		return this.getSessionItems().filter({ hasText: name });
	}

	/**
	 * Return the number of sessions currently visible in the list.
	 */
	async getSessionCount(): Promise<number> {
		return this.getSessionItems().count();
	}

	/**
	 * Click a session by its display name to make it active.
	 */
	async selectSession(name: string): Promise<void> {
		await this.getSessionByName(name).first().click();
	}

	/**
	 * Start session creation via the new-session button or keyboard shortcut.
	 */
	async createNewSession(): Promise<void> {
		// Use the keyboard shortcut (Ctrl+Shift+N) to open the wizard
		await this.pressShortcut('Control+Shift+N');
	}

	/**
	 * Delete a session by right-clicking its name, selecting the
	 * delete menu item, then confirming the dialog.
	 */
	async deleteSession(name: string): Promise<void> {
		const session = this.getSessionByName(name).first();
		await session.click({ button: 'right' });

		// Click the delete option from the context menu
		const deleteItem = this.page.locator('text=Delete').first();
		await deleteItem.click();

		// Confirm the deletion dialog
		const confirmButton = this.page
			.locator(SELECTORS.MODAL_DIALOG)
			.locator('button', { hasText: /confirm|delete|yes/i })
			.first();
		await confirmButton.click();
	}

	/**
	 * Rename a session by double-clicking to enter edit mode,
	 * clearing the input, typing the new name, and pressing Enter.
	 */
	async renameSession(oldName: string, newName: string): Promise<void> {
		const session = this.getSessionByName(oldName).first();
		await session.dblclick();

		// The inline rename input should appear with autoFocus
		const input = this.sessionList.locator('input[type="text"]').first();
		await input.fill(newName);
		await input.press('Enter');
	}

	/**
	 * Open the hamburger menu by clicking its button.
	 */
	async openHamburgerMenu(): Promise<void> {
		await this.hamburgerMenu.click();
	}

	/**
	 * Check whether a session with the given name has active/selected styling.
	 */
	async isSessionActive(name: string): Promise<boolean> {
		const session = this.getSessionByName(name).first();
		const classes = await session.getAttribute('class');
		const ariaSelected = await session.getAttribute('aria-selected');
		return (
			ariaSelected === 'true' ||
			(classes !== null && classes.includes('active'))
		);
	}
}
