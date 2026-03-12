/**
 * Tests for interaction helper functions.
 *
 * Verifies deterministic response generation for:
 * - Timeout responses (tool-approval → deny, clarification → cancel)
 * - Interrupt responses (tool-approval → deny+interrupt, clarification → cancel)
 * - Termination responses (tool-approval → deny+interrupt, clarification → cancel)
 */

import { describe, it, expect } from 'vitest';
import {
	DEFAULT_INTERACTION_TIMEOUT_MS,
	createInteractionTimeoutResponse,
	createInterruptResponse,
	createTerminationResponse,
} from '../interaction-helpers';

describe('interaction-helpers', () => {
	describe('DEFAULT_INTERACTION_TIMEOUT_MS', () => {
		it('should be 5 minutes', () => {
			expect(DEFAULT_INTERACTION_TIMEOUT_MS).toBe(5 * 60 * 1000);
		});
	});

	describe('createInteractionTimeoutResponse', () => {
		it('should return timeout with interactionKind for tool-approval', () => {
			const response = createInteractionTimeoutResponse('tool-approval');
			expect(response).toEqual({
				kind: 'timeout',
				interactionKind: 'tool-approval',
				message: 'Timed out waiting for user response',
			});
		});

		it('should return timeout with interactionKind for clarification', () => {
			const response = createInteractionTimeoutResponse('clarification');
			expect(response).toEqual({
				kind: 'timeout',
				interactionKind: 'clarification',
				message: 'Timed out waiting for user response',
			});
		});

		it('timeout kind carries interactionKind for downstream use', () => {
			const toolResponse = createInteractionTimeoutResponse('tool-approval');
			const clarResponse = createInteractionTimeoutResponse('clarification');
			expect(toolResponse.kind).toBe('timeout');
			expect(clarResponse.kind).toBe('timeout');
			if (toolResponse.kind === 'timeout') {
				expect(toolResponse.interactionKind).toBe('tool-approval');
			}
			if (clarResponse.kind === 'timeout') {
				expect(clarResponse.interactionKind).toBe('clarification');
			}
		});
	});

	describe('createInterruptResponse', () => {
		it('should return deny with interrupt for tool-approval', () => {
			const response = createInterruptResponse('tool-approval');
			expect(response).toEqual({
				kind: 'deny',
				message: 'Session interrupted',
				interrupt: true,
			});
		});

		it('should return cancel for clarification', () => {
			const response = createInterruptResponse('clarification');
			expect(response).toEqual({
				kind: 'cancel',
				message: 'Session interrupted',
			});
		});
	});

	describe('createTerminationResponse', () => {
		it('should return deny with interrupt for tool-approval', () => {
			const response = createTerminationResponse('tool-approval');
			expect(response).toEqual({
				kind: 'deny',
				message: 'Session terminated',
				interrupt: true,
			});
		});

		it('should return cancel for clarification', () => {
			const response = createTerminationResponse('clarification');
			expect(response).toEqual({
				kind: 'cancel',
				message: 'Session terminated',
			});
		});
	});
});
