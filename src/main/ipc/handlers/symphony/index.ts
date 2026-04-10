/**
 * Symphony IPC Handlers - Entry Point
 *
 * Provides handlers for fetching Symphony registry, GitHub issues with
 * runmaestro.ai label, managing contributions, and coordinating contribution runs.
 *
 * Cache Strategy:
 * - Registry cached with 2-hour TTL
 * - Issues cached with 5-minute TTL (change frequently)
 * - Force refresh bypasses cache
 */

import { logger } from '../../../utils/logger';
import { LOG_CONTEXT, type SymphonyHandlerDependencies } from './helpers';
import { registerRegistryHandlers } from './registry';
import { registerStateHandlers } from './state';
import { registerContributionHandlers } from './contributions';
import { registerWorkflowHandlers } from './workflow';

export type { SymphonyHandlerDependencies } from './helpers';

export function registerSymphonyHandlers(deps: SymphonyHandlerDependencies): void {
	registerRegistryHandlers(deps);
	registerStateHandlers(deps);
	registerContributionHandlers(deps);
	registerWorkflowHandlers(deps);

	logger.info('Symphony handlers registered', LOG_CONTEXT);
}
