/**
 * Harness Registry
 *
 * Stores harness factories, not singleton instances. Each call to
 * createHarness() invokes the registered factory and returns a fresh
 * instance — harnesses are stateful and must not be shared across
 * executions.
 *
 * Follows the same registry pattern as AgentOutputParser and
 * AgentSessionStorage.
 */

import type { ToolType } from '../../shared/types';
import type { AgentHarness } from './agent-harness';
import { isValidAgentId } from '../../shared/agentIds';
import { logger } from '../utils/logger';

const LOG_CONTEXT = '[HarnessRegistry]';

/**
 * Factory function that creates a new harness instance.
 * Called once per execution — never shared across runs.
 */
export type HarnessFactory = () => AgentHarness;

/**
 * Registry mapping agent IDs to their harness factories.
 */
const harnessRegistry = new Map<ToolType, HarnessFactory>();

/**
 * Register a harness factory for an agent type.
 *
 * @param agentId - The agent type this factory serves
 * @param factory - Factory function that creates new harness instances
 */
export function registerHarness(agentId: ToolType, factory: HarnessFactory): void {
	if (harnessRegistry.has(agentId)) {
		logger.warn(
			`${LOG_CONTEXT} Overwriting existing harness factory for '${agentId}'`,
			LOG_CONTEXT
		);
	}
	harnessRegistry.set(agentId, factory);
	logger.debug(`${LOG_CONTEXT} Registered harness factory for '${agentId}'`, LOG_CONTEXT);
}

/**
 * Create a new harness instance for the given agent type.
 *
 * Returns null if no factory is registered. Each call creates a fresh
 * instance — harnesses are stateful and must not be reused.
 *
 * @param agentId - The agent type to create a harness for
 * @returns A new AgentHarness instance, or null if no factory is registered
 */
export function createHarness(agentId: ToolType | string): AgentHarness | null {
	if (!isValidAgentId(agentId)) {
		logger.warn(
			`${LOG_CONTEXT} createHarness() called with invalid agent ID: '${agentId}'`,
			LOG_CONTEXT
		);
		return null;
	}

	const factory = harnessRegistry.get(agentId as ToolType);
	if (!factory) {
		return null;
	}

	try {
		const harness = factory();
		logger.debug(`${LOG_CONTEXT} Created harness instance for '${agentId}'`, LOG_CONTEXT);
		return harness;
	} catch (error) {
		logger.error(
			`${LOG_CONTEXT} Failed to create harness for '${agentId}': ${String(error)}`,
			LOG_CONTEXT
		);
		return null;
	}
}

/**
 * Check if a harness factory is registered for the given agent type.
 *
 * @param agentId - The agent type to check
 * @returns true if a factory is registered
 */
export function hasHarness(agentId: ToolType | string): boolean {
	if (!isValidAgentId(agentId)) {
		return false;
	}
	return harnessRegistry.has(agentId as ToolType);
}

/**
 * Get all registered agent IDs that have harness factories.
 * @internal Primarily used for logging and testing.
 */
export function getRegisteredHarnessIds(): ToolType[] {
	return Array.from(harnessRegistry.keys());
}

/**
 * Clear the harness registry.
 * @internal Exposed for testing only — do not use in production code.
 */
export function clearHarnessRegistry(): void {
	harnessRegistry.clear();
}
