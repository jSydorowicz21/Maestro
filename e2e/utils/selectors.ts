/**
 * Centralized selector constants for E2E tests.
 *
 * Selector strategy priority:
 * 1. data-tour attributes (primary)
 * 2. data-testid attributes (secondary)
 * 3. getByRole (tertiary)
 */
export const SELECTORS = {
	// Layout
	SESSION_LIST: '[data-tour="session-list"]',
	TAB_BAR: '[data-tour="tab-bar"]',
	MAIN_TERMINAL: '[data-tour="main-terminal"]',
	INPUT_AREA: '[data-tour="input-area"]',
	HEADER_CONTROLS: '[data-tour="header-controls"]',
	HAMBURGER_MENU: '[data-tour="hamburger-menu"]',
	HAMBURGER_MENU_CONTENTS: '[data-tour="hamburger-menu-contents"]',

	// Right panel
	FILES_TAB: '[data-tour="files-tab"]',
	HISTORY_TAB: '[data-tour="history-tab"]',
	AUTORUN_TAB: '[data-tour="autorun-tab"]',
	FILES_PANEL: '[data-tour="files-panel"]',
	HISTORY_PANEL: '[data-tour="history-panel"]',
	AUTORUN_PANEL: '[data-tour="autorun-panel"]',
	AUTORUN_DOC_SELECTOR: '[data-tour="autorun-document-selector"]',

	// Session items
	SESSION_ITEM: '[data-testid="session-item"]',

	// Agent
	AGENT_STATE_INDICATOR: '[data-testid="agent-state-indicator"]',
	AGENT_SESSIONS_BUTTON: '[data-tour="agent-sessions-button"]',

	// Wizard
	WIZARD_CONVERSATION: '[data-testid="wizard-conversation-view"]',
	WIZARD_LETS_GO: '[data-testid="wizard-lets-go-button"]',

	// Errors
	ERROR_TITLE: '[data-testid="error-title"]',
	ERROR_DESCRIPTION: '[data-testid="error-description"]',
	ERROR_RETRY: '[data-testid="error-retry-button"]',
	ERROR_DISMISS: '[data-testid="error-dismiss-button"]',

	// Dashboard
	USAGE_DASHBOARD: '[data-testid="usage-dashboard-content"]',

	// Modals
	MODAL_DIALOG: '[role="dialog"]',

	// Remote
	REMOTE_CONTROL: '[data-tour="remote-control"]',
} as const;

export type SelectorKey = keyof typeof SELECTORS;
