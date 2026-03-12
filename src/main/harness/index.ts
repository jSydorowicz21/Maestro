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

// Import registry functions for initialization
import {
	clearHarnessRegistry,
	getRegisteredHarnessIds,
} from './harness-registry';
import { logger } from '../utils/logger';

const LOG_CONTEXT = '[Harness]';

/**
 * Initialize all harness implementations.
 * Call this at application startup to register all available harness factories.
 *
 * Currently a no-op scaffolding — concrete harness registrations
 * (ClaudeCodeHarness, CodexHarness, etc.) will be added in subsequent phases.
 */
export function initializeHarnesses(): void {
	// Clear any existing registrations (for testing/reloading)
	clearHarnessRegistry();

	// Register harness factories here as they are implemented:
	// registerHarness('claude-code', () => new ClaudeCodeHarness());
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
