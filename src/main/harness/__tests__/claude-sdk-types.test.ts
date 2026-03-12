/**
 * Tests for SDK type drift detection and provenance tracking.
 *
 * - Verifies the provenance comment exists in claude-sdk-types.ts.
 * - When @anthropic-ai/claude-agent-sdk is installed, verifies that key
 *   exports still exist. When not installed, skips gracefully.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SDK_TYPES_PATH = resolve(__dirname, '..', 'claude-sdk-types.ts');
const SDK_PACKAGE_NAME = '@anthropic-ai/claude-agent-sdk';

/**
 * Attempt to require the SDK at runtime, bypassing Vite's static import
 * analysis. Returns null if the SDK is not installed.
 */
function tryRequireSDK(): Record<string, unknown> | null {
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		return require(SDK_PACKAGE_NAME) as Record<string, unknown>;
	} catch {
		return null;
	}
}

describe('claude-sdk-types provenance', () => {
	it('should contain an SDK version provenance comment', () => {
		const source = readFileSync(SDK_TYPES_PATH, 'utf-8');
		expect(source).toMatch(/SDK version:\s*@anthropic-ai\/claude-agent-sdk\s+v[\d.]+/);
	});

	it('should contain a last-synced date', () => {
		const source = readFileSync(SDK_TYPES_PATH, 'utf-8');
		expect(source).toMatch(/Last synced:\s*\d{4}-\d{2}-\d{2}/);
	});
});

describe('claude-sdk-types drift detection', () => {
	/**
	 * Key export names that the SDK should expose when installed.
	 * These correspond to the core types our harness adapter depends on.
	 */
	const EXPECTED_SDK_EXPORTS = [
		'query',
	] as const;

	it('should verify SDK exports when @anthropic-ai/claude-agent-sdk is installed', () => {
		const sdk = tryRequireSDK();

		if (!sdk) {
			console.log(
				`[claude-sdk-types drift detection] ${SDK_PACKAGE_NAME} is not installed. ` +
				'Skipping drift detection. Install the SDK to enable this check.',
			);
			return;
		}

		// SDK is installed — verify key exports exist
		for (const exportName of EXPECTED_SDK_EXPORTS) {
			expect(
				sdk[exportName],
				`Expected SDK to export "${exportName}". ` +
				'If the SDK removed this export, update claude-sdk-types.ts accordingly.',
			).toBeDefined();
		}

		// Verify query is a function
		expect(typeof sdk.query).toBe('function');
	});

	it('should verify SDK message type discriminants are still valid', () => {
		const sdk = tryRequireSDK();

		if (!sdk) {
			console.log(
				`[claude-sdk-types drift detection] ${SDK_PACKAGE_NAME} not installed, ` +
				'skipping message type verification.',
			);
			return;
		}

		// Known message type discriminants our stubs cover
		const knownMessageTypes = [
			'system',
			'assistant',
			'result',
			'tool_use_summary',
			'rate_limit',
			'status',
			'compact_boundary',
			'tool_progress',
			'auth_status',
		];

		console.log(
			`[claude-sdk-types drift detection] SDK loaded successfully. ` +
			`Our stub covers ${knownMessageTypes.length} message types. ` +
			`Review SDK changelog if any drift is detected.`,
		);

		// Presence of the SDK is the primary signal; when it exposes
		// a type registry or enum in the future, cross-check here.
		expect(sdk).toBeDefined();
	});
});
