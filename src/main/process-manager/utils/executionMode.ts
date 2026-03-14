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
 * 1. Force classic if the agent does not support harness execution
 * 2. Use classic when caller explicitly requests it
 * 3. Use harness when caller explicitly requests it and agent supports it
 * 4. Use harness when preferred mode is 'auto' and agent supports it
 * 5. Fall back to classic otherwise
 *
 * SSH remote execution follows normal precedence — harness-capable agents
 * can use harness mode over SSH. The harness handles SSH wrapping internally.
 *
 * Auto Run queries follow the same precedence as user queries — they are
 * no longer forced to classic mode.
 *
 * This is a pure function: all inputs come from the config and the
 * static capability registry. ProcessManager calls this before routing
 * to a spawner or harness.
 */
export function selectExecutionMode(config: ProcessConfig): ExecutionModeResult {
	const { toolType, sessionId, preferredExecutionMode, querySource } =
		config;

	const capabilities = getAgentCapabilities(toolType);
	const isSsh = Boolean(config.sshRemoteId || config.sshRemoteHost);
	const sourceLabel =
		(querySource === 'auto' ? 'Auto Run' : 'User') +
		(isSsh ? ' (SSH remote)' : '');

	// 1. Agent does not support harness execution
	if (!capabilities.supportsHarnessExecution) {
		const result: ExecutionModeResult = {
			mode: 'classic',
			reason: `${sourceLabel} query: agent '${toolType}' does not support harness execution`,
		};
		logModeSelection(sessionId, toolType, result);
		return result;
	}

	// 2. Caller explicitly requested classic
	if (preferredExecutionMode === 'classic') {
		const result: ExecutionModeResult = {
			mode: 'classic',
			reason: `${sourceLabel} query: caller explicitly requested classic mode`,
		};
		logModeSelection(sessionId, toolType, result);
		return result;
	}

	// 3. Caller explicitly requested harness
	if (preferredExecutionMode === 'harness') {
		const result: ExecutionModeResult = {
			mode: 'harness',
			reason: `${sourceLabel} query: caller explicitly requested harness mode`,
		};
		logModeSelection(sessionId, toolType, result);
		return result;
	}

	// 4. Auto mode or unspecified — use harness when agent supports it
	if (preferredExecutionMode === 'auto' || preferredExecutionMode === undefined) {
		const result: ExecutionModeResult = {
			mode: 'harness',
			reason: `${sourceLabel} query: auto-selected harness mode for '${toolType}' (agent supports harness)`,
		};
		logModeSelection(sessionId, toolType, result);
		return result;
	}

	// Fallback (should not reach here, but be safe)
	const result: ExecutionModeResult = {
		mode: 'classic',
		reason: `${sourceLabel} query: fallback to classic mode (unrecognized preferredExecutionMode: '${preferredExecutionMode}')`,
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
