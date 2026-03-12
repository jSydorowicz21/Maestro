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
		it('should return deny for tool-approval', () => {
			const response = createInteractionTimeoutResponse('tool-approval');
			expect(response).toEqual({
				kind: 'deny',
				message: 'Timed out waiting for user response',
			});
		});

		it('should return cancel for clarification', () => {
			const response = createInteractionTimeoutResponse('clarification');
			expect(response).toEqual({
				kind: 'cancel',
				message: 'Timed out waiting for user response',
			});
		});

		it('should not include interrupt flag on timeout deny', () => {
			const response = createInteractionTimeoutResponse('tool-approval');
			expect(response.kind).toBe('deny');
			if (response.kind === 'deny') {
				expect(response.interrupt).toBeUndefined();
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
