/**
 * Agent Harness System
 *
 * Provides per-agent execution harnesses that wrap SDK or CLI adapters
 * and map provider-specific behavior into generic Maestro execution
 * events and interaction requests.
 *
 * Call initializeHarnesses() at application startup alongside
 * initializeOutputParsers() and initializeSessionStorages().
 *
 * Usage:
 * ```typescript
 * import { initializeHarnesses, createHarness } from './harness';
 *
 * // At app startup
 * initializeHarnesses();
 *
 * // When spawning a harness execution
 * const harness = createHarness('claude-code');
 * if (harness) {
 *   const result = await harness.spawn(config);
 * }
 * ```
 */

// Re-export interface and types
export type {
	AgentHarness,
	HarnessInput,
	HarnessSpawnResult,
	HarnessRuntimeSettings,
	HarnessEvents,
} from './agent-harness';

// Re-export registry functions
export {
	registerHarness,
	createHarness,
	hasHarness,
	getRegisteredHarnessIds,
	clearHarnessRegistry,
} from './harness-registry';
export type { HarnessFactory } from './harness-registry';

// Re-export interaction helpers
export {
	DEFAULT_INTERACTION_TIMEOUT_MS,
	createInteractionTimeoutResponse,
	createInterruptResponse,
	createTerminationResponse,
} from './interaction-helpers';

// Re-export Claude harness and its pending interaction type
export { ClaudeCodeHarness } from './claude-code-harness';
export type { PendingInteraction } from './claude-code-harness';

// Import registry functions for initialization
import {
	registerHarness,
	clearHarnessRegistry,
	getRegisteredHarnessIds,
} from './harness-registry';
import { ClaudeCodeHarness } from './claude-code-harness';
import { logger } from '../utils/logger';

const LOG_CONTEXT = '[Harness]';

/**
 * Initialize all harness implementations.
 * Call this at application startup to register all available harness factories.
 *
 * ClaudeCodeHarness is registered if the SDK query function is available.
 * The SDK dependency is resolved lazily at registration time.
 */
export function initializeHarnesses(): void {
	// Clear any existing registrations (for testing/reloading)
	clearHarnessRegistry();

	// Register Claude Code harness if the SDK is available
	try {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const sdk = require('@anthropic-ai/claude-agent-sdk');
		if (sdk && typeof sdk.query === 'function') {
			registerHarness('claude-code' as any, () => new ClaudeCodeHarness(sdk.query));
			logger.info(`${LOG_CONTEXT} Registered ClaudeCodeHarness (SDK available)`, LOG_CONTEXT);
		}
	} catch {
		logger.info(
			`${LOG_CONTEXT} Claude Agent SDK not available — ClaudeCodeHarness not registered`,
			LOG_CONTEXT
		);
	}

	// Future harness registrations:
	// registerHarness('codex', () => new CodexHarness());
	// registerHarness('opencode', () => new OpenCodeHarness());

	const registeredIds = getRegisteredHarnessIds();
	if (registeredIds.length > 0) {
		logger.info(
			`${LOG_CONTEXT} Initialized harnesses: ${registeredIds.join(', ')}`,
			LOG_CONTEXT
		);
	} else {
		logger.info(
			`${LOG_CONTEXT} Initialized (no harness factories registered yet)`,
			LOG_CONTEXT
		);
	}
}
