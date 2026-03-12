/**
 * Interaction Helpers
 *
 * Deterministic response generators for timeout, interrupt, and
 * termination scenarios. Used by harness implementations to resolve
 * pending interactions cleanly when the execution ends or times out.
 *
 * These are shared utilities — every harness uses the same timeout
 * and cleanup semantics. Provider-specific translation happens after
 * these responses are generated.
 */

import type { InteractionKind, InteractionResponse } from '../../shared/interaction-types';

/**
 * Default interaction timeout in milliseconds (5 minutes).
 */
export const DEFAULT_INTERACTION_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Create a timeout response for an expired interaction.
 *
 * Returns a dedicated 'timeout' kind that carries the original interaction kind
 * so downstream code knows what timed out. This is semantically distinct from
 * user-initiated 'deny' or 'cancel' responses.
 */
export function createInteractionTimeoutResponse(kind: InteractionKind): InteractionResponse {
	return { kind: 'timeout', interactionKind: kind, message: 'Timed out waiting for user response' };
}

/**
 * Create a response for interactions cancelled by an interrupt signal.
 *
 * - Tool approvals are denied with interrupt flag
 * - Clarification requests are cancelled
 */
export function createInterruptResponse(kind: InteractionKind): InteractionResponse {
	if (kind === 'tool-approval') {
		return { kind: 'deny', message: 'Session interrupted', interrupt: true };
	}
	return { kind: 'cancel', message: 'Session interrupted' };
}

/**
 * Create a response for interactions cancelled by session termination.
 *
 * - Tool approvals are denied with interrupt flag
 * - Clarification requests are cancelled
 */
export function createTerminationResponse(kind: InteractionKind): InteractionResponse {
	if (kind === 'tool-approval') {
		return { kind: 'deny', message: 'Session terminated', interrupt: true };
	}
	return { kind: 'cancel', message: 'Session terminated' };
}
