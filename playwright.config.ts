/**
 * Playwright configuration for Electron E2E testing
 *
 * This configuration is designed to test the Maestro Electron application.
 * E2E tests launch the actual packaged/built application and interact with
 * the UI through Playwright's browser automation.
 */
import { defineConfig } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
	// Test directory
	testDir: './e2e',

	// Test file patterns
	testMatch: '**/*.spec.ts',

	// Run tests in files in parallel
	fullyParallel: false, // Electron tests should run sequentially to avoid conflicts

	// Fail the build on CI if you accidentally left test.only in the source code
	forbidOnly: !!process.env.CI,

	// Retry on CI only
	retries: process.env.CI ? 2 : 0,

	// Opt out of parallel tests for Electron
	workers: 1,

	// Reporter to use
	reporter: process.env.CI
		? [['github'], ['html', { open: 'never' }]]
		: [['list'], ['html', { open: 'on-failure' }]],

	// Shared settings for all the projects below
	use: {
		// Base URL to use in actions like `await page.goto('/')`
		// For Electron, this is handled differently - we use app.evaluate()

		// Collect trace when retrying the failed test
		trace: 'on-first-retry',

		// Capture screenshot on failure
		screenshot: 'only-on-failure',

		// Record video on failure
		video: 'on-first-retry',

		// Timeout for each action
		actionTimeout: 10000,
	},

	// Configure projects - ordered spec directories with dependency chains
	projects: [
		{
			name: 'infrastructure',
			testDir: './e2e/specs/01-infrastructure',
		},
		{
			name: 'session-management',
			testDir: './e2e/specs/02-session-management',
			dependencies: ['infrastructure'],
		},
		{
			name: 'agent-interaction',
			testDir: './e2e/specs/03-agent-interaction',
			dependencies: ['infrastructure'],
		},
		{
			name: 'ui-features',
			testDir: './e2e/specs/04-tab-management',
			dependencies: ['infrastructure'],
		},
		{
			name: 'keyboard-navigation',
			testDir: './e2e/specs/05-keyboard-navigation',
			dependencies: ['infrastructure'],
		},
		{
			name: 'settings',
			testDir: './e2e/specs/06-settings',
			dependencies: ['infrastructure'],
		},
		{
			name: 'right-panel',
			testDir: './e2e/specs/07-right-panel',
			dependencies: ['infrastructure'],
		},
		{
			name: 'modal-system',
			testDir: './e2e/specs/08-modal-system',
			dependencies: ['infrastructure'],
		},
		{
			name: 'error-handling',
			testDir: './e2e/specs/09-error-handling',
			dependencies: ['infrastructure'],
		},
		{
			name: 'advanced',
			testDir: './e2e/specs/10-advanced',
			dependencies: ['session-management'],
		},
		{
			name: 'autorun',
			testDir: './e2e',
			testMatch: 'autorun-*.spec.ts',
		},
	],

	// Global test timeout
	timeout: 60000,

	// Expect timeout
	expect: {
		timeout: 10000,
	},

	// Output directory for test artifacts
	outputDir: 'e2e-results/',

	// Run local dev server before starting the tests
	// For Electron, we build and launch the app in the test fixtures
	// webServer: undefined,
});
