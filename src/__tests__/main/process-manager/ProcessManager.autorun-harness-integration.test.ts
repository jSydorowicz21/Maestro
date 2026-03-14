/**
 * Integration-style test: Auto Run spawn with harness-capable agent selects harness mode.
 *
 * Unlike the unit tests, this test does NOT mock selectExecutionMode().
 * It exercises the real execution-mode selection logic inside ProcessManager
 * to verify that Auto Run queries (querySource: 'auto') flow through to the
 * harness path for capable agents, and to classic for incapable ones.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// ── Mocks (everything EXCEPT selectExecutionMode) ────────────────────────

const mockCreateHarness = vi.fn();

vi.mock('../../../main/harness/harness-registry', () => ({
	createHarness: (...args: unknown[]) => mockCreateHarness(...args),
}));

// Real selectExecutionMode — NOT mocked
// vi.mock('../../../main/process-manager/utils/executionMode') — intentionally omitted

vi.mock('../../../main/utils/logger', () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

vi.mock('../../../main/process-manager/spawners/PtySpawner', () => {
	return {
		PtySpawner: class {
			spawn = vi.fn(() => ({ pid: 1234, success: true }));
		},
	};
});

vi.mock('../../../main/process-manager/spawners/ChildProcessSpawner', () => {
	return {
		ChildProcessSpawner: class {
			spawn = vi.fn(() => ({ pid: 5678, success: true }));
		},
	};
});

vi.mock('../../../main/process-manager/handlers/DataBufferManager', () => {
	return {
		DataBufferManager: class {
			flushDataBuffer = vi.fn();
		},
	};
});

vi.mock('../../../main/process-manager/runners/LocalCommandRunner', () => {
	return {
		LocalCommandRunner: class {
			run = vi.fn();
		},
	};
});

vi.mock('../../../main/process-manager/runners/SshCommandRunner', () => {
	return {
		SshCommandRunner: class {
			run = vi.fn();
		},
	};
});

// Mock capabilities — claude-code supports harness, terminal does not
vi.mock('../../../main/agents/capabilities', () => ({
	getAgentCapabilities: vi.fn((agentId: string) => {
		if (agentId === 'claude-code') {
			return { supportsHarnessExecution: true };
		}
		return { supportsHarnessExecution: false };
	}),
}));

// ── Imports (after mocks) ────────────────────────────────────────────────

import { ProcessManager } from '../../../main/process-manager/ProcessManager';
import type { ProcessConfig } from '../../../main/process-manager/types';
import type { AgentHarness, HarnessSpawnResult } from '../../../main/harness/agent-harness';

// ── Helpers ──────────────────────────────────────────────────────────────

function createMockHarness(): AgentHarness {
	const emitter = new EventEmitter();
	return Object.assign(emitter, {
		agentId: 'claude-code' as any,
		spawn: vi.fn<(config: any) => Promise<HarnessSpawnResult>>().mockResolvedValue({ success: true, pid: null }),
		write: vi.fn(),
		interrupt: vi.fn().mockResolvedValue(undefined),
		kill: vi.fn(),
		dispose: vi.fn(),
		isDisposed: vi.fn().mockReturnValue(false),
		respondToInteraction: vi.fn().mockResolvedValue(undefined),
		updateRuntimeSettings: vi.fn().mockResolvedValue(undefined),
		isRunning: vi.fn().mockReturnValue(false),
		getCapabilities: vi.fn().mockReturnValue({}),
	}) as unknown as AgentHarness;
}

function makeConfig(overrides?: Partial<ProcessConfig>): ProcessConfig {
	return {
		sessionId: 'test-session-1',
		toolType: 'claude-code',
		cwd: '/home/user/project',
		command: 'claude',
		args: [],
		prompt: 'Auto Run task',
		tabId: 'tab-1',
		projectPath: '/home/user/project',
		contextWindow: 200000,
		...overrides,
	};
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('Auto Run spawn integration (real selectExecutionMode)', () => {
	let pm: ProcessManager;

	beforeEach(() => {
		vi.clearAllMocks();
		pm = new ProcessManager();
	});

	it('Auto Run with harness-capable agent selects harness mode', async () => {
		const mockHarness = createMockHarness();
		mockCreateHarness.mockReturnValue(mockHarness);

		const config = makeConfig({
			querySource: 'auto',
			toolType: 'claude-code',
		});
		const result = pm.spawn(config);

		// Should route through harness path (pid=null, success=true)
		expect(result).toEqual({ pid: null, success: true });

		// Harness factory should have been called
		expect(mockCreateHarness).toHaveBeenCalledWith('claude-code');

		// Execution record should be harness-backed
		const execution = pm.get(config.sessionId);
		expect(execution).toBeDefined();
		expect(execution!.backend).toBe('harness');
		expect(execution!.harness).toBe(mockHarness);

		// Harness.spawn() should be called with the Auto Run config
		await vi.waitFor(() => {
			expect(mockHarness.spawn).toHaveBeenCalledTimes(1);
		});
		const spawnArg = vi.mocked(mockHarness.spawn).mock.calls[0][0];
		expect(spawnArg.sessionId).toBe(config.sessionId);
		expect(spawnArg.prompt).toBe('Auto Run task');
	});

	it('Auto Run with non-harness agent (terminal) selects classic mode', () => {
		const config = makeConfig({
			querySource: 'auto',
			toolType: 'terminal',
			prompt: undefined, // terminals don't get prompts
		});
		const result = pm.spawn(config);

		// Should route through classic path (has a pid)
		expect(result.success).toBe(true);
		expect(result.pid).toBeDefined();
		expect(result.pid).not.toBeNull();

		// Harness factory should NOT have been called
		expect(mockCreateHarness).not.toHaveBeenCalled();

		// No harness execution record in ProcessManager (classic records
		// are stored by the spawners, not by ProcessManager.processes)
		expect(pm.get(config.sessionId)).toBeUndefined();
	});

	it('Auto Run with SSH remote falls back to classic (SDK harness cannot execute remotely)', () => {
		const mockHarness = createMockHarness();
		mockCreateHarness.mockReturnValue(mockHarness);

		const config = makeConfig({
			querySource: 'auto',
			toolType: 'claude-code',
			sshRemoteId: 'remote-1',
			prompt: undefined, // classic path used for SSH
		});
		const result = pm.spawn(config);

		// SSH triggers fallback to classic (SDK-based harness runs in-process)
		expect(result.success).toBe(true);
		expect(result.pid).toBeDefined();
		expect(result.pid).not.toBeNull();

		// Harness factory should NOT have been called
		expect(mockCreateHarness).not.toHaveBeenCalled();
	});

	it('Auto Run and User query get same mode for same agent', async () => {
		const mockHarness1 = createMockHarness();
		const mockHarness2 = createMockHarness();
		mockCreateHarness
			.mockReturnValueOnce(mockHarness1)
			.mockReturnValueOnce(mockHarness2);

		const autoConfig = makeConfig({
			sessionId: 'auto-session',
			querySource: 'auto',
			toolType: 'claude-code',
		});
		const userConfig = makeConfig({
			sessionId: 'user-session',
			querySource: 'user',
			toolType: 'claude-code',
		});

		const autoResult = pm.spawn(autoConfig);
		const userResult = pm.spawn(userConfig);

		// Both should get harness mode
		expect(autoResult).toEqual({ pid: null, success: true });
		expect(userResult).toEqual({ pid: null, success: true });

		expect(pm.get('auto-session')!.backend).toBe('harness');
		expect(pm.get('user-session')!.backend).toBe('harness');
	});
});
