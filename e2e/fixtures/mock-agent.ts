/**
 * Mock Agent Fixture
 *
 * Extends the base electron-app fixture to pre-seed
 * maestro-agent-configs.json with a custom path pointing
 * to the mock Claude agent script. This lets E2E tests
 * run without a real Claude Code binary.
 */
import { test as base, expect } from './electron-app';
import { _electron as electron } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// Re-export expect
export { expect };

/** Absolute path to the mock agent script */
const MOCK_CLAUDE_PATH = path.resolve(
	__dirname,
	'../mock-agent/mock-claude.mjs',
);

interface MockAgentFixtures {
	mockAgentPath: string;
}

/**
 * Write the agent config store so Maestro uses our mock agent
 * instead of the real Claude Code binary.
 */
function seedAgentConfig(testDataDir: string): void {
	const config = {
		configs: {
			'claude-code': {
				customPath: MOCK_CLAUDE_PATH,
			},
		},
	};
	fs.writeFileSync(
		path.join(testDataDir, 'maestro-agent-configs.json'),
		JSON.stringify(config, null, '\t'),
		'utf-8',
	);
}

export const test = base.extend<MockAgentFixtures>({
	// Expose the mock agent path for assertions
	// eslint-disable-next-line no-empty-pattern
	mockAgentPath: async ({}, use) => {
		await use(MOCK_CLAUDE_PATH);
	},

	// Override electronApp to seed mock agent config before launch
	electronApp: async ({ appPath, testDataDir }, use) => {
		// Seed the agent config BEFORE launching the app
		seedAgentConfig(testDataDir);

		const app = await electron.launch({
			args: [appPath],
			env: {
				...process.env,
				MAESTRO_DATA_DIR: testDataDir,
				ELECTRON_DISABLE_GPU: '1',
				NODE_ENV: 'test',
				MAESTRO_E2E_TEST: 'true',
			},
			timeout: 30000,
		});

		await use(app);
		await app.close();
	},
});
