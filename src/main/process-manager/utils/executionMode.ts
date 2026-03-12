// src/main/process-manager/utils/executionMode.ts

import { getAgentCapabilities } from '../../agents/capabilities';
import { logger } from '../../utils/logger';
import type { ProcessConfig } from '../types';

/**
 * Resolved execution mode for a spawn request.
 * - 'classic': Use existing PTY or child-process spawner
 * - 'harness': Use an AgentHarness adapter (SDK-backed or fallback CLI)
 */
export type ExecutionMode = 'classic' | 'harness';

/**
 * Result of execution-mode selection including the reason for the choice.
 * The reason is logged for observability but not exposed beyond ProcessManager.
 */
export interface ExecutionModeResult {
	mode: ExecutionMode;
	reason: string;
}

/**
 * Select the execution mode for a spawn request.
 *
 * Precedence (from the design doc):
 * 1. Force classic for SSH remote execution (Phase 1 constraint)
 * 2. Force classic for Auto Run queries (Phase 1 constraint)
 * 3. Force classic if the agent does not support harness execution
 * 4. Use harness when caller explicitly requests it and agent supports it
 * 5. Use harness when preferred mode is 'auto' and agent supports it
 * 6. Fall back to classic otherwise
 *
 * This is a pure function: all inputs come from the config and the
 * static capability registry. ProcessManager calls this before routing
 * to a spawner or harness.
 */
export function selectExecutionMode(config: ProcessConfig): ExecutionModeResult {
	const { toolType, sessionId, preferredExecutionMode, querySource, sshRemoteId, sshRemoteHost } =
		config;

	const capabilities = getAgentCapabilities(toolType);

	// 1. SSH remote — always classic in Phase 1
	if (sshRemoteId || sshRemoteHost) {
		const result: ExecutionModeResult = {
			mode: 'classic',
			reason: 'SSH remote execution forced classic mode (Phase 1)',
		};
		logModeSelection(sessionId, toolType, result);
		return result;
	}

	// 2. Auto Run — always classic in Phase 1
	if (querySource === 'auto') {
		const result: ExecutionModeResult = {
			mode: 'classic',
			reason: 'Auto Run forced classic mode (Phase 1)',
		};
		logModeSelection(sessionId, toolType, result);
		return result;
	}

	// 3. Agent does not support harness execution
	if (!capabilities.supportsHarnessExecution) {
		const result: ExecutionModeResult = {
			mode: 'classic',
			reason: `Agent '${toolType}' does not support harness execution`,
		};
		logModeSelection(sessionId, toolType, result);
		return result;
	}

	// 4. Caller explicitly requested classic
	if (preferredExecutionMode === 'classic') {
		const result: ExecutionModeResult = {
			mode: 'classic',
			reason: 'Caller explicitly requested classic mode',
		};
		logModeSelection(sessionId, toolType, result);
		return result;
	}

	// 5. Caller explicitly requested harness
	if (preferredExecutionMode === 'harness') {
		const result: ExecutionModeResult = {
			mode: 'harness',
			reason: 'Caller explicitly requested harness mode',
		};
		logModeSelection(sessionId, toolType, result);
		return result;
	}

	// 6. Auto mode or unspecified — use harness when agent supports it
	if (preferredExecutionMode === 'auto' || preferredExecutionMode === undefined) {
		const result: ExecutionModeResult = {
			mode: 'harness',
			reason: `Auto-selected harness mode for '${toolType}' (agent supports harness)`,
		};
		logModeSelection(sessionId, toolType, result);
		return result;
	}

	// Fallback (should not reach here, but be safe)
	const result: ExecutionModeResult = {
		mode: 'classic',
		reason: `Fallback to classic mode (unrecognized preferredExecutionMode: '${preferredExecutionMode}')`,
	};
	logModeSelection(sessionId, toolType, result);
	return result;
}

function logModeSelection(
	sessionId: string,
	toolType: string,
	result: ExecutionModeResult
): void {
	logger.debug('[ProcessManager] Execution mode selected', 'ProcessManager', {
		sessionId,
		toolType,
		mode: result.mode,
		reason: result.reason,
	});
}
