/**
 * Tests for execution-mode selection logic.
 *
 * Verifies the precedence rules from the design doc:
 * 1. SSH remote → classic
 * 2. Auto Run → classic
 * 3. Agent doesn't support harness → classic
 * 4. Caller explicitly requests classic → classic
 * 5. Caller explicitly requests harness → harness
 * 6. Auto/unspecified + agent supports harness → harness
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
	// Rule 2: Auto Run → classic
	// -----------------------------------------------------------------------
	describe('Auto Run forces classic mode', () => {
		it('returns classic when querySource is auto', () => {
			const config = makeConfig({ querySource: 'auto' });
			const result = selectExecutionMode(config);
			expect(result.mode).toBe('classic');
			expect(result.reason).toContain('Auto Run');
		});

		it('returns classic for Auto Run even when preferredExecutionMode is harness', () => {
			const config = makeConfig({
				querySource: 'auto',
				preferredExecutionMode: 'harness',
			});
			const result = selectExecutionMode(config);
			expect(result.mode).toBe('classic');
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
			expect(result.reason).toContain('Auto-selected harness');
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
	// Precedence: SSH > Auto Run > capability > preference
	// -----------------------------------------------------------------------
	describe('precedence ordering', () => {
		it('SSH takes priority over Auto Run', () => {
			const config = makeConfig({
				sshRemoteId: 'remote-1',
				querySource: 'auto',
				preferredExecutionMode: 'harness',
			});
			const result = selectExecutionMode(config);
			expect(result.mode).toBe('classic');
			expect(result.reason).toContain('SSH');
		});

		it('Auto Run takes priority over agent capability', () => {
			const config = makeConfig({
				querySource: 'auto',
				preferredExecutionMode: 'harness',
			});
			const result = selectExecutionMode(config);
			expect(result.mode).toBe('classic');
			expect(result.reason).toContain('Auto Run');
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

		it('same agent can get different modes based on context', () => {
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
			expect(autoResult.mode).toBe('classic');
		});
	});
});
