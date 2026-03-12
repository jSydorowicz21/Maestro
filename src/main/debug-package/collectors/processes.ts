/**
 * Processes Collector
 *
 * Collects information about active processes.
 * - Working directories are sanitized
 * - No command output included
 */

import { ProcessManager } from '../../process-manager';
import { sanitizePath } from './sanitize';

export interface ProcessInfo {
	sessionId: string;
	toolType: string;
	/** OS process ID. Null for harness-backed runs that don't spawn a system process. */
	pid: number | null;
	cwd: string; // Sanitized
	isTerminal: boolean;
	isBatchMode: boolean;
	uptimeMs: number;
	hasParser: boolean;
}

/**
 * Collect information about active processes.
 */
export async function collectProcesses(
	processManager: ProcessManager | null
): Promise<ProcessInfo[]> {
	const processes: ProcessInfo[] = [];

	if (!processManager) {
		return processes;
	}

	// Get active processes from the process manager
	const activeProcesses = processManager.getAll();

	for (const proc of activeProcesses) {
		const processInfo: ProcessInfo = {
			sessionId: proc.sessionId || 'unknown',
			toolType: proc.toolType || 'unknown',
			pid: proc.pid ?? null,
			cwd: sanitizePath(proc.cwd || ''),
			isTerminal: !!proc.isTerminal,
			isBatchMode: !!proc.isBatchMode,
			uptimeMs: proc.startTime ? Date.now() - proc.startTime : 0,
			hasParser: !!proc.outputParser,
		};

		processes.push(processInfo);
	}

	return processes;
}
