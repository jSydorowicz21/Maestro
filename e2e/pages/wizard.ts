/**
 * Wizard Page Object Model
 *
 * Encapsulates interactions with the onboarding wizard flow,
 * including agent selection, directory picking, and wizard navigation.
 */
import type { Locator } from '@playwright/test';
import { BasePage } from '../pages/base-page';
import { SELECTORS } from '../utils/selectors';

export class Wizard extends BasePage {
	/** The wizard conversation view */
	get conversationView(): Locator {
		return this.page.locator(SELECTORS.WIZARD_CONVERSATION);
	}

	/** The primary "Let's Go" / CTA button */
	get letsGoButton(): Locator {
		return this.page.locator(SELECTORS.WIZARD_LETS_GO);
	}

	/** The wizard modal/dialog container */
	get dialog(): Locator {
		return this.page.locator(SELECTORS.MODAL_DIALOG);
	}

	/**
	 * Check whether the wizard is currently visible.
	 */
	async isOpen(): Promise<boolean> {
		// Check for the wizard title text or conversation view
		const wizardTitle = this.page.locator('text=Create a Maestro Agent');
		const isTitle = await wizardTitle.isVisible().catch(() => false);
		const isConversation = await this.conversationView.isVisible().catch(() => false);
		return isTitle || isConversation;
	}

	/**
	 * Select an agent by clicking its tile with the matching name.
	 */
	async selectAgent(agentName: string): Promise<void> {
		const agentTile = this.page.locator(`text=${agentName}`).first();
		await agentTile.click();
	}

	/**
	 * Click the "Let's Go" / primary CTA button.
	 */
	async clickLetsGo(): Promise<void> {
		await this.letsGoButton.click();
	}

	/**
	 * Click the Next or Continue button.
	 */
	async clickNext(): Promise<void> {
		const nextButton = this.page
			.locator('button:has-text("Next")')
			.or(this.page.locator('button:has-text("Continue")'));
		await nextButton.first().click();
	}

	/**
	 * Click the Back button to return to the previous step.
	 */
	async clickBack(): Promise<void> {
		const backButton = this.page.locator('button:has-text("Back")');
		await backButton.first().click();
	}

	/**
	 * Select a directory via the native file dialog (requires dialog-mock fixture).
	 *
	 * The dialog mock must be configured before calling this method so that
	 * the native open-dialog returns the desired path.
	 */
	async setDirectoryPath(): Promise<void> {
		// Click the directory picker button/area
		const dirButton = this.page
			.locator('button:has-text("Browse")')
			.or(this.page.locator('button:has-text("Select")'))
			.or(this.page.locator('button:has-text("Choose")'))
			.or(this.page.locator('[data-testid="directory-picker"]'));
		await dirButton.first().click();
	}

	/**
	 * Locator for the conversation area within the wizard.
	 */
	getConversationView(): Locator {
		return this.conversationView;
	}

	/**
	 * Read the current confidence level from the badge.
	 */
	async getConfidenceLevel(): Promise<string> {
		const badge = this.page.locator('[data-testid="confidence-badge"]');
		return (await badge.textContent()) ?? '';
	}

	/**
	 * Wait until the wizard is no longer visible (completed or dismissed).
	 */
	async waitForWizardComplete(timeout = 10000): Promise<void> {
		await this.page.waitForSelector('text=Create a Maestro Agent', {
			state: 'hidden',
			timeout,
		});
	}

	/**
	 * Close the wizard by pressing Escape or clicking a close button.
	 */
	async close(): Promise<void> {
		await this.page.keyboard.press('Escape');
	}
}
