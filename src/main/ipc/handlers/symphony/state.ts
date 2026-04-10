/**
 * Symphony State Handlers
 *
 * IPC handlers for reading Symphony state, active/completed contributions,
 * contributor statistics, and cache management.
 */

import { ipcMain } from 'electron';
import { createIpcHandler } from '../../../utils/ipcHandler';
import type {
	SymphonyState,
	ActiveContribution,
	CompletedContribution,
	ContributorStats,
} from '../../../../shared/symphony-types';
import {
	type SymphonyHandlerDependencies,
	readState,
	writeCache,
	filterOrphanedContributions,
	handlerOpts,
} from './helpers';

// ============================================================================
// IPC Handler Registration
// ============================================================================

export function registerStateHandlers({
	app,
	sessionsStore,
}: Pick<SymphonyHandlerDependencies, 'app' | 'sessionsStore'>): void {
	/**
	 * Get current symphony state.
	 * Filters out contributions whose sessions no longer exist.
	 */
	ipcMain.handle(
		'symphony:getState',
		createIpcHandler(
			handlerOpts('getState', false),
			async (): Promise<{ state: SymphonyState }> => {
				const state = await readState(app);
				// Filter out orphaned contributions whose sessions are gone
				state.active = filterOrphanedContributions(state.active, sessionsStore);
				return { state };
			}
		)
	);

	/**
	 * Get active contributions.
	 * Filters out contributions whose sessions no longer exist.
	 */
	ipcMain.handle(
		'symphony:getActive',
		createIpcHandler(
			handlerOpts('getActive', false),
			async (): Promise<{ contributions: ActiveContribution[] }> => {
				const state = await readState(app);
				const validContributions = filterOrphanedContributions(state.active, sessionsStore);
				return { contributions: validContributions };
			}
		)
	);

	/**
	 * Get completed contributions.
	 */
	ipcMain.handle(
		'symphony:getCompleted',
		createIpcHandler(
			handlerOpts('getCompleted', false),
			async (limit?: number): Promise<{ contributions: CompletedContribution[] }> => {
				const state = await readState(app);
				const sorted = [...state.history].sort(
					(a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
				);
				return {
					contributions: limit ? sorted.slice(0, limit) : sorted,
				};
			}
		)
	);

	/**
	 * Get contributor statistics.
	 * Includes real-time stats from active contributions for live updates.
	 */
	ipcMain.handle(
		'symphony:getStats',
		createIpcHandler(
			handlerOpts('getStats', false),
			async (): Promise<{ stats: ContributorStats }> => {
				const state = await readState(app);

				// Start with base completed stats
				const baseStats = state.stats;

				// Aggregate stats from active contributions for real-time display
				let activeTokens = 0;
				let activeTime = 0;
				let activeCost = 0;
				let activeDocs = 0;
				let activeTasks = 0;

				for (const contribution of state.active) {
					activeTokens +=
						contribution.tokenUsage.inputTokens + contribution.tokenUsage.outputTokens;
					activeTime += contribution.timeSpent;
					activeCost += contribution.tokenUsage.estimatedCost;
					activeDocs += contribution.progress.completedDocuments;
					activeTasks += contribution.progress.completedTasks;
				}

				// Return combined stats (completed + active in-progress)
				return {
					stats: {
						...baseStats,
						// Add active contribution stats to totals
						totalTokensUsed: baseStats.totalTokensUsed + activeTokens,
						totalTimeSpent: baseStats.totalTimeSpent + activeTime,
						estimatedCostDonated: baseStats.estimatedCostDonated + activeCost,
						totalDocumentsProcessed: baseStats.totalDocumentsProcessed + activeDocs,
						totalTasksCompleted: baseStats.totalTasksCompleted + activeTasks,
					},
				};
			}
		)
	);

	/**
	 * Clear cache.
	 */
	ipcMain.handle(
		'symphony:clearCache',
		createIpcHandler(handlerOpts('clearCache'), async (): Promise<{ cleared: boolean }> => {
			await writeCache(app, { issues: {} });
			return { cleared: true };
		})
	);
}
