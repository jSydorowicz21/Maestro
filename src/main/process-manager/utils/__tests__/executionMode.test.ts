/**
 * Tests for execution-mode selection logic.
 *
 * Verifies the precedence rules from the design doc:
 * 1. SSH remote → classic
 * 2. Agent doesn't support harness → classic
 * 3. Caller explicitly requests classic → classic
 * 4. Caller explicitly requests harness → harness
 * 5. Auto/unspecified + agent supports harness → harness
 *
 * Auto Run queries follow the same precedence as user queries.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { selectExecutionMode } from '../executionMode';
import type { ProcessConfig } from '../../types';

// Mock the logger to avoid console output in tests
vi.mock('../../../utils/logger', () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

// Mock capabilities — default to supporting harness for claude-code, not for others
vi.mock('../../../agents/capabilities', () => ({
	getAgentCapabilities: vi.fn((agentId: string) => {
		if (agentId === 'claude-code') {
			return { supportsHarnessExecution: true };
		}
		return { supportsHarnessExecution: false };
	}),
}));

function makeConfig(overrides: Partial<ProcessConfig> = {}): ProcessConfig {
	return {
		sessionId: 'test-session',
		toolType: 'claude-code',
		cwd: '/tmp',
		command: 'claude',
		args: [],
		...overrides,
	};
}

describe('selectExecutionMode', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// -----------------------------------------------------------------------
	// Rule 1: SSH remote → classic
	// -----------------------------------------------------------------------
	describe('SSH remote forces classic mode', () => {
		it('returns classic when sshRemoteId is set', () => {
			const config = makeConfig({ sshRemoteId: 'remote-1' });
			const result = selectExecutionMode(config);
			expect(result.mode).toBe('classic');
			expect(result.reason).toContain('SSH');
			expect(result.reason).toContain('User query');
		});

		it('returns classic when sshRemoteHost is set', () => {
			const config = makeConfig({ sshRemoteHost: '192.168.1.1' });
			const result = selectExecutionMode(config);
			expect(result.mode).toBe('classic');
			expect(result.reason).toContain('SSH');
		});

		it('returns classic for SSH even when preferredExecutionMode is harness', () => {
			const config = makeConfig({
				sshRemoteId: 'remote-1',
				preferredExecutionMode: 'harness',
			});
			const result = selectExecutionMode(config);
			expect(result.mode).toBe('classic');
		});
	});

	// -----------------------------------------------------------------------
	// Rule 2: Auto Run follows normal precedence (no longer forced classic)
	// -----------------------------------------------------------------------
	describe('Auto Run follows normal precedence', () => {
		it('returns harness for capable agent when querySource is auto', () => {
			const config = makeConfig({ querySource: 'auto' });
			const result = selectExecutionMode(config);
			expect(result.mode).toBe('harness');
			expect(result.reason).toContain('Auto Run query');
		});

		it('returns harness for Auto Run when preferredExecutionMode is harness', () => {
			const config = makeConfig({
				querySource: 'auto',
				preferredExecutionMode: 'harness',
			});
			const result = selectExecutionMode(config);
			expect(result.mode).toBe('harness');
			expect(result.reason).toContain('Auto Run query');
		});

		it('returns classic for Auto Run with incapable agent', () => {
			const config = makeConfig({
				querySource: 'auto',
				toolType: 'terminal',
			});
			const result = selectExecutionMode(config);
			expect(result.mode).toBe('classic');
			expect(result.reason).toContain('Auto Run query');
			expect(result.reason).toContain('does not support harness');
		});

		it('returns classic for Auto Run when caller explicitly requests classic', () => {
			const config = makeConfig({
				querySource: 'auto',
				preferredExecutionMode: 'classic',
			});
			const result = selectExecutionMode(config);
			expect(result.mode).toBe('classic');
			expect(result.reason).toContain('Auto Run query');
			expect(result.reason).toContain('explicitly requested classic');
		});
	});

	// -----------------------------------------------------------------------
	// Rule 3: Agent does not support harness → classic
	// -----------------------------------------------------------------------
	describe('unsupported agents get classic mode', () => {
		it('returns classic for terminal', () => {
			const config = makeConfig({ toolType: 'terminal' });
			const result = selectExecutionMode(config);
			expect(result.mode).toBe('classic');
			expect(result.reason).toContain('does not support harness');
		});

		it('returns classic for codex (Phase 1)', () => {
			const config = makeConfig({ toolType: 'codex' });
			const result = selectExecutionMode(config);
			expect(result.mode).toBe('classic');
		});

		it('returns classic for unsupported agent even when preferredExecutionMode is harness', () => {
			const config = makeConfig({
				toolType: 'terminal',
				preferredExecutionMode: 'harness',
			});
			const result = selectExecutionMode(config);
			expect(result.mode).toBe('classic');
		});
	});

	// -----------------------------------------------------------------------
	// Rule 4: Caller explicitly requests classic → classic
	// -----------------------------------------------------------------------
	describe('explicit classic preference', () => {
		it('returns classic when caller requests classic', () => {
			const config = makeConfig({ preferredExecutionMode: 'classic' });
			const result = selectExecutionMode(config);
			expect(result.mode).toBe('classic');
			expect(result.reason).toContain('explicitly requested classic');
		});
	});

	// -----------------------------------------------------------------------
	// Rule 5: Caller explicitly requests harness → harness
	// -----------------------------------------------------------------------
	describe('explicit harness preference', () => {
		it('returns harness when caller requests harness and agent supports it', () => {
			const config = makeConfig({ preferredExecutionMode: 'harness' });
			const result = selectExecutionMode(config);
			expect(result.mode).toBe('harness');
			expect(result.reason).toContain('explicitly requested harness');
			expect(result.reason).toContain('User query');
		});
	});

	// -----------------------------------------------------------------------
	// Rule 6: Auto/unspecified + agent supports harness → harness
	// -----------------------------------------------------------------------
	describe('auto mode selects harness for capable agents', () => {
		it('returns harness when preferredExecutionMode is auto', () => {
			const config = makeConfig({ preferredExecutionMode: 'auto' });
			const result = selectExecutionMode(config);
			expect(result.mode).toBe('harness');
			expect(result.reason).toContain('auto-selected harness');
		});

		it('returns harness when preferredExecutionMode is undefined', () => {
			const config = makeConfig({ preferredExecutionMode: undefined });
			const result = selectExecutionMode(config);
			expect(result.mode).toBe('harness');
		});

		it('returns harness for user queries from claude-code with no explicit mode', () => {
			const config = makeConfig({ querySource: 'user' });
			const result = selectExecutionMode(config);
			expect(result.mode).toBe('harness');
		});
	});

	// -----------------------------------------------------------------------
	// Precedence: SSH > capability > preference
	// -----------------------------------------------------------------------
	describe('precedence ordering', () => {
		it('SSH takes priority over everything', () => {
			const config = makeConfig({
				sshRemoteId: 'remote-1',
				querySource: 'auto',
				preferredExecutionMode: 'harness',
			});
			const result = selectExecutionMode(config);
			expect(result.mode).toBe('classic');
			expect(result.reason).toContain('SSH');
		});

		it('agent capability takes priority over preference', () => {
			const config = makeConfig({
				toolType: 'terminal',
				preferredExecutionMode: 'harness',
			});
			const result = selectExecutionMode(config);
			expect(result.mode).toBe('classic');
			expect(result.reason).toContain('does not support harness');
		});

		it('Auto Run with capable agent follows normal precedence to harness', () => {
			const config = makeConfig({
				querySource: 'auto',
				preferredExecutionMode: 'harness',
			});
			const result = selectExecutionMode(config);
			expect(result.mode).toBe('harness');
			expect(result.reason).toContain('Auto Run query');
			expect(result.reason).toContain('explicitly requested harness');
		});
	});

	// -----------------------------------------------------------------------
	// Edge case: both SSH fields set simultaneously
	// -----------------------------------------------------------------------
	describe('both SSH fields set simultaneously', () => {
		it('returns classic when both sshRemoteId and sshRemoteHost are set', () => {
			const config = makeConfig({
				sshRemoteId: 'remote-1',
				sshRemoteHost: '192.168.1.1',
			});
			const result = selectExecutionMode(config);
			expect(result.mode).toBe('classic');
			expect(result.reason).toContain('SSH');
		});

		it('returns classic when both SSH fields are set even with harness preference', () => {
			const config = makeConfig({
				sshRemoteId: 'remote-1',
				sshRemoteHost: '192.168.1.1',
				preferredExecutionMode: 'harness',
			});
			const result = selectExecutionMode(config);
			expect(result.mode).toBe('classic');
		});
	});

	// -----------------------------------------------------------------------
	// Edge case: unrecognized preferredExecutionMode → fallback
	// -----------------------------------------------------------------------
	describe('unrecognized preferredExecutionMode falls back to classic', () => {
		it('returns classic for an unknown mode string', () => {
			const config = makeConfig({
				preferredExecutionMode: 'invalid-mode' as any,
			});
			const result = selectExecutionMode(config);
			expect(result.mode).toBe('classic');
			expect(result.reason).toContain('fallback');
			expect(result.reason).toContain('invalid-mode');
		});

		it('returns classic for empty string mode', () => {
			const config = makeConfig({
				preferredExecutionMode: '' as any,
			});
			const result = selectExecutionMode(config);
			expect(result.mode).toBe('classic');
			expect(result.reason).toContain('fallback');
		});
	});

	// -----------------------------------------------------------------------
	// Edge case: explicit querySource: undefined
	// -----------------------------------------------------------------------
	describe('querySource undefined is treated as user query', () => {
		it('returns harness for capable agent when querySource is explicitly undefined', () => {
			const config = makeConfig({ querySource: undefined });
			const result = selectExecutionMode(config);
			expect(result.mode).toBe('harness');
		});

		it('returns classic for incapable agent regardless of querySource', () => {
			const config = makeConfig({
				toolType: 'terminal',
				querySource: undefined,
			});
			const result = selectExecutionMode(config);
			expect(result.mode).toBe('classic');
		});
	});

	// -----------------------------------------------------------------------
	// Result shape contract
	// -----------------------------------------------------------------------
	describe('result shape contract', () => {
		it('always returns both mode and reason fields', () => {
			const configs = [
				makeConfig(),
				makeConfig({ sshRemoteId: 'r' }),
				makeConfig({ querySource: 'auto' }),
				makeConfig({ toolType: 'terminal' }),
				makeConfig({ preferredExecutionMode: 'classic' }),
				makeConfig({ preferredExecutionMode: 'harness' }),
				makeConfig({ preferredExecutionMode: 'auto' }),
			];

			for (const config of configs) {
				const result = selectExecutionMode(config);
				expect(result).toHaveProperty('mode');
				expect(result).toHaveProperty('reason');
				expect(typeof result.mode).toBe('string');
				expect(typeof result.reason).toBe('string');
				expect(result.reason.length).toBeGreaterThan(0);
			}
		});

		it('mode is always classic or harness', () => {
			const configs = [
				makeConfig(),
				makeConfig({ sshRemoteId: 'r' }),
				makeConfig({ querySource: 'auto' }),
				makeConfig({ preferredExecutionMode: 'unknown' as any }),
			];

			for (const config of configs) {
				const result = selectExecutionMode(config);
				expect(['classic', 'harness']).toContain(result.mode);
			}
		});
	});

	// -----------------------------------------------------------------------
	// Classic and harness coexistence in the same model
	// -----------------------------------------------------------------------
	describe('classic and harness records coexist', () => {
		it('returns different modes for different agents in the same session set', () => {
			const claudeConfig = makeConfig({
				sessionId: 'session-1',
				toolType: 'claude-code',
			});
			const terminalConfig = makeConfig({
				sessionId: 'session-2',
				toolType: 'terminal',
			});

			const claudeResult = selectExecutionMode(claudeConfig);
			const terminalResult = selectExecutionMode(terminalConfig);

			expect(claudeResult.mode).toBe('harness');
			expect(terminalResult.mode).toBe('classic');
		});

		it('same agent gets harness mode regardless of querySource', () => {
			const userQuery = makeConfig({
				sessionId: 'session-1',
				querySource: 'user',
			});
			const autoQuery = makeConfig({
				sessionId: 'session-2',
				querySource: 'auto',
			});

			const userResult = selectExecutionMode(userQuery);
			const autoResult = selectExecutionMode(autoQuery);

			expect(userResult.mode).toBe('harness');
			expect(autoResult.mode).toBe('harness');
		});
	});
});
