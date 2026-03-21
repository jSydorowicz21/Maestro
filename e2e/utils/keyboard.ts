/**
 * Keyboard shortcut helpers for E2E tests.
 *
 * Uses Control (not Meta) because CI runs on Linux.
 */
import type { Page } from '@playwright/test';

/**
 * Named shortcut map.
 *
 * Every entry uses Control as the modifier so tests work on Linux CI.
 * Add new shortcuts here rather than scattering raw key strings across specs.
 */
export const SHORTCUTS: Record<string, string> = {
	newAgent: 'Control+Shift+N',
	save: 'Control+S',
	find: 'Control+F',
	closeTab: 'Control+W',
	nextTab: 'Control+Tab',
	prevTab: 'Control+Shift+Tab',
	undo: 'Control+Z',
	redo: 'Control+Shift+Z',
	selectAll: 'Control+A',
	copy: 'Control+C',
	paste: 'Control+V',
	cut: 'Control+X',
	toggleSidebar: 'Control+B',
	commandPalette: 'Control+Shift+P',
	settings: 'Control+,',
} as const;

/**
 * Press a named shortcut on the given page.
 *
 * @param page - Playwright Page instance
 * @param shortcutName - Key from the SHORTCUTS map, or a raw combo string
 */
export async function pressShortcut(
	page: Page,
	shortcutName: string,
): Promise<void> {
	const combo = SHORTCUTS[shortcutName] ?? shortcutName;
	await page.keyboard.press(combo);
}
