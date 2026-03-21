/**
 * Wait utilities for E2E tests.
 *
 * Thin wrappers around Playwright primitives that standardize
 * timeouts and provide a consistent API across all specs.
 */
import type { Page, Locator } from '@playwright/test';

const DEFAULT_TIMEOUT = 10000;

/**
 * Wait for a CSS selector to become visible.
 */
export async function waitForSelector(
	page: Page,
	selector: string,
	timeout = DEFAULT_TIMEOUT,
): Promise<Locator> {
	await page.waitForSelector(selector, { state: 'visible', timeout });
	return page.locator(selector);
}

/**
 * Wait for a CSS selector to become hidden (detached or invisible).
 */
export async function waitForSelectorHidden(
	page: Page,
	selector: string,
	timeout = DEFAULT_TIMEOUT,
): Promise<void> {
	await page.waitForSelector(selector, { state: 'hidden', timeout });
}

/**
 * Wait for text content to appear anywhere in the page.
 */
export async function waitForText(
	page: Page,
	text: string,
	timeout = DEFAULT_TIMEOUT,
): Promise<Locator> {
	const locator = page.getByText(text);
	await locator.waitFor({ state: 'visible', timeout });
	return locator;
}

/**
 * Wait for the page to reach network idle state.
 */
export async function waitForNetworkIdle(
	page: Page,
	timeout = DEFAULT_TIMEOUT,
): Promise<void> {
	await page.waitForLoadState('networkidle', { timeout });
}

/**
 * Wait for the app to stabilize: network idle plus a short settle period
 * so React re-renders triggered by late responses can finish.
 */
export async function waitForAppStable(
	page: Page,
	timeout = DEFAULT_TIMEOUT,
	settleMs = 500,
): Promise<void> {
	await waitForNetworkIdle(page, timeout);
	await page.waitForTimeout(settleMs);
}
