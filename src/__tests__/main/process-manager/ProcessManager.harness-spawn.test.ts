/**
 * Tests for ProcessManager harness spawn path.
 *
 * Verifies:
 * - Harness creation via createHarness() when mode is 'harness'
 * - Fallback to classic when no factory is registered
 * - Event subscription for all standard and harness-specific events
 * - AgentExecution record created with backend='harness', pid=null
 * - Async spawn success/failure handling
 * - Cleanup on spawn failure (dispose + record removal)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockCreateHarness = vi.fn();

vi.mock('../../../main/harness/harness-registry', () => ({
	createHarness: (...args: unknown[]) => mockCreateHarness(...args),
}));

vi.mock('../../../main/process-manager/utils/executionMode', () => ({
	selectExecutionMode: vi.fn(),
}));

vi.mock('../../../main/utils/logger', () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

// Mock spawners and runners so constructor doesn't fail
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

// ── Imports (after mocks) ──────────────────────────────────────────────────

import { ProcessManager } from '../../../main/process-manager/ProcessManager';
import { selectExecutionMode } from '../../../main/process-manager/utils/executionMode';
import { logger } from '../../../main/utils/logger';
import type { ProcessConfig } from '../../../main/process-manager/types';
import type { AgentHarness, HarnessSpawnResult } from '../../../main/harness/agent-harness';

// ── Helpers ────────────────────────────────────────────────────────────────

function createMockHarness(overrides?: Partial<AgentHarness>): AgentHarness {
	const emitter = new EventEmitter();
	const harness = Object.assign(emitter, {
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
		...overrides,
	}) as unknown as AgentHarness;
	return harness;
}

function makeConfig(overrides?: Partial<ProcessConfig>): ProcessConfig {
	return {
		sessionId: 'test-session-1',
		toolType: 'claude-code',
		cwd: '/home/user/project',
		command: 'claude',
		args: [],
		prompt: 'Hello',
		querySource: 'user',
		tabId: 'tab-1',
		projectPath: '/home/user/project',
		contextWindow: 200000,
		...overrides,
	};
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('ProcessManager harness spawn path', () => {
	let pm: ProcessManager;

	beforeEach(() => {
		vi.clearAllMocks();
		pm = new ProcessManager();
	});

	describe('when mode is harness and factory is registered', () => {
		let mockHarness: AgentHarness;

		beforeEach(() => {
			mockHarness = createMockHarness();
			vi.mocked(selectExecutionMode).mockReturnValue({
				mode: 'harness',
				reason: 'test',
			});
			mockCreateHarness.mockReturnValue(mockHarness);
		});

		it('should call createHarness with the toolType', () => {
			const config = makeConfig();
			pm.spawn(config);

			expect(mockCreateHarness).toHaveBeenCalledWith('claude-code');
		});

		it('should return pid=null and success=true', () => {
			const result = pm.spawn(makeConfig());

			expect(result).toEqual({ pid: null, success: true });
		});

		it('should store execution record with backend=harness', () => {
			const config = makeConfig();
			pm.spawn(config);

			const execution = pm.get(config.sessionId);
			expect(execution).toBeDefined();
			expect(execution!.backend).toBe('harness');
			expect(execution!.pid).toBeNull();
			expect(execution!.harness).toBe(mockHarness);
			expect(execution!.isTerminal).toBe(false);
			expect(execution!.sessionId).toBe(config.sessionId);
			expect(execution!.toolType).toBe(config.toolType);
			expect(execution!.cwd).toBe(config.cwd);
		});

		it('should call harness.spawn() with AgentExecutionConfig derived from ProcessConfig', async () => {
			const config = makeConfig({
				prompt: 'test prompt',
				images: ['/tmp/img.png'],
				customEnvVars: { FOO: 'bar' },
				providerOptions: { key: 'value' },
				permissionMode: 'default' as any,
			});

			pm.spawn(config);

			// Wait for async spawn to be called
			await vi.waitFor(() => {
				expect(mockHarness.spawn).toHaveBeenCalledTimes(1);
			});

			const spawnArg = vi.mocked(mockHarness.spawn).mock.calls[0][0];
			expect(spawnArg.sessionId).toBe(config.sessionId);
			expect(spawnArg.toolType).toBe(config.toolType);
			expect(spawnArg.cwd).toBe(config.cwd);
			expect(spawnArg.prompt).toBe('test prompt');
			expect(spawnArg.images).toEqual(['/tmp/img.png']);
			expect(spawnArg.customEnvVars).toEqual({ FOO: 'bar' });
			expect(spawnArg.providerOptions).toEqual({ key: 'value' });
		});

		it('should subscribe to all standard ProcessManager events', () => {
			pm.spawn(makeConfig());

			const standardEvents = [
				'data', 'exit', 'stderr', 'session-id', 'usage',
				'thinking-chunk', 'tool-execution', 'agent-error',
				'query-complete', 'slash-commands',
			];

			for (const eventName of standardEvents) {
				expect(mockHarness.listenerCount(eventName)).toBeGreaterThanOrEqual(1);
			}
		});

		it('should subscribe to harness-specific events', () => {
			pm.spawn(makeConfig());

			expect(mockHarness.listenerCount('interaction-request')).toBeGreaterThanOrEqual(1);
			expect(mockHarness.listenerCount('runtime-metadata')).toBeGreaterThanOrEqual(1);
		});

		it('should forward standard events from harness to ProcessManager', () => {
			const config = makeConfig();
			pm.spawn(config);

			const dataHandler = vi.fn();
			pm.on('data', dataHandler);

			(mockHarness as EventEmitter).emit('data', config.sessionId, 'hello world');

			expect(dataHandler).toHaveBeenCalledWith(config.sessionId, 'hello world');
		});

		it('should forward interaction-request events from harness to ProcessManager', () => {
			const config = makeConfig();
			pm.spawn(config);

			const handler = vi.fn();
			pm.on('interaction-request', handler);

			const mockRequest = { id: 'req-1', type: 'tool_use' };
			(mockHarness as EventEmitter).emit('interaction-request', config.sessionId, mockRequest);

			expect(handler).toHaveBeenCalledWith(config.sessionId, mockRequest);
		});

		it('should forward runtime-metadata events from harness to ProcessManager', () => {
			const config = makeConfig();
			pm.spawn(config);

			const handler = vi.fn();
			pm.on('runtime-metadata', handler);

			const mockMetadata = { type: 'capabilities', data: {} };
			(mockHarness as EventEmitter).emit('runtime-metadata', config.sessionId, mockMetadata);

			expect(handler).toHaveBeenCalledWith(config.sessionId, mockMetadata);
		});

		it('should update pid on execution record when spawn returns a pid', async () => {
			vi.mocked(mockHarness.spawn).mockResolvedValue({ success: true, pid: 42 });

			const config = makeConfig();
			pm.spawn(config);

			await vi.waitFor(() => {
				const execution = pm.get(config.sessionId);
				expect(execution!.pid).toBe(42);
			});
		});

		it('should not change pid when spawn returns pid=null', async () => {
			vi.mocked(mockHarness.spawn).mockResolvedValue({ success: true, pid: null });

			const config = makeConfig();
			pm.spawn(config);

			await vi.waitFor(() => {
				expect(vi.mocked(mockHarness.spawn)).toHaveBeenCalled();
			});

			const execution = pm.get(config.sessionId);
			expect(execution!.pid).toBeNull();
		});
	});

	describe('when mode is harness but no factory is registered', () => {
		beforeEach(() => {
			vi.mocked(selectExecutionMode).mockReturnValue({
				mode: 'harness',
				reason: 'test',
			});
			mockCreateHarness.mockReturnValue(null);
		});

		it('should fall back to classic execution', () => {
			const config = makeConfig({ prompt: undefined });
			const result = pm.spawn(config);

			// Should succeed via classic path (ChildProcessSpawner)
			expect(result.success).toBe(true);
			expect(result.pid).toBeDefined();
		});

		it('should log a warning about fallback', () => {
			pm.spawn(makeConfig());

			expect(logger.warn).toHaveBeenCalledWith(
				expect.stringContaining('no harness factory registered; falling back to classic'),
				'ProcessManager',
				expect.any(Object)
			);
		});

		it('should not create a harness execution record', () => {
			const config = makeConfig();
			pm.spawn(config);

			const execution = pm.get(config.sessionId);
			// Should be a classic execution, not a harness one
			expect(execution?.backend).not.toBe('harness');
		});
	});

	describe('harness spawn failure handling', () => {
		let mockHarness: AgentHarness;

		beforeEach(() => {
			vi.mocked(selectExecutionMode).mockReturnValue({
				mode: 'harness',
				reason: 'test',
			});
		});

		it('should clean up on spawn failure (success=false)', async () => {
			mockHarness = createMockHarness();
			vi.mocked(mockHarness.spawn).mockResolvedValue({ success: false });
			mockCreateHarness.mockReturnValue(mockHarness);

			const config = makeConfig();
			const errorHandler = vi.fn();
			const exitHandler = vi.fn();
			pm.on('agent-error', errorHandler);
			pm.on('exit', exitHandler);

			pm.spawn(config);

			await vi.waitFor(() => {
				expect(mockHarness.dispose).toHaveBeenCalled();
			});

			// Execution record should be removed
			expect(pm.get(config.sessionId)).toBeUndefined();

			// Should emit agent-error and exit events
			expect(errorHandler).toHaveBeenCalledWith(config.sessionId, expect.objectContaining({
				type: 'agent_crashed',
				message: 'Harness spawn failed',
				recoverable: false,
			}));
			expect(exitHandler).toHaveBeenCalledWith(config.sessionId, 1);
		});

		it('should clean up on spawn exception', async () => {
			mockHarness = createMockHarness();
			vi.mocked(mockHarness.spawn).mockRejectedValue(new Error('SDK connection failed'));
			mockCreateHarness.mockReturnValue(mockHarness);

			const config = makeConfig();
			const errorHandler = vi.fn();
			const exitHandler = vi.fn();
			pm.on('agent-error', errorHandler);
			pm.on('exit', exitHandler);

			pm.spawn(config);

			await vi.waitFor(() => {
				expect(mockHarness.dispose).toHaveBeenCalled();
			});

			// Execution record should be removed
			expect(pm.get(config.sessionId)).toBeUndefined();

			// Should emit agent-error with the error message
			expect(errorHandler).toHaveBeenCalledWith(config.sessionId, expect.objectContaining({
				type: 'agent_crashed',
				message: expect.stringContaining('SDK connection failed'),
				recoverable: false,
			}));
			expect(exitHandler).toHaveBeenCalledWith(config.sessionId, 1);
		});
	});

	describe('classic execution mode (unchanged)', () => {
		beforeEach(() => {
			vi.mocked(selectExecutionMode).mockReturnValue({
				mode: 'classic',
				reason: 'test',
			});
		});

		it('should not call createHarness when mode is classic', () => {
			pm.spawn(makeConfig({ prompt: undefined }));
			expect(mockCreateHarness).not.toHaveBeenCalled();
		});

		it('should use classic spawner and succeed', () => {
			const result = pm.spawn(makeConfig({ prompt: undefined }));
			expect(result.success).toBe(true);
		});
	});

	describe('harness delegation: write()', () => {
		let mockHarness: AgentHarness;

		beforeEach(() => {
			mockHarness = createMockHarness();
			vi.mocked(selectExecutionMode).mockReturnValue({ mode: 'harness', reason: 'test' });
			mockCreateHarness.mockReturnValue(mockHarness);
		});

		it('should delegate write() to harness.write() with text input', () => {
			const config = makeConfig();
			pm.spawn(config);

			const result = pm.write(config.sessionId, 'hello world');

			expect(result).toBe(true);
			expect(mockHarness.write).toHaveBeenCalledWith({ type: 'text', text: 'hello world' });
		});

		it('should return false when no execution exists', () => {
			expect(pm.write('nonexistent', 'data')).toBe(false);
		});
	});

	describe('harness delegation: interrupt()', () => {
		let mockHarness: AgentHarness;

		beforeEach(() => {
			mockHarness = createMockHarness();
			vi.mocked(selectExecutionMode).mockReturnValue({ mode: 'harness', reason: 'test' });
			mockCreateHarness.mockReturnValue(mockHarness);
		});

		it('should delegate interrupt() to harness.interrupt()', () => {
			const config = makeConfig();
			pm.spawn(config);

			const result = pm.interrupt(config.sessionId);

			expect(result).toBe(true);
			expect(mockHarness.interrupt).toHaveBeenCalled();
		});

		it('should return false when no execution exists', () => {
			expect(pm.interrupt('nonexistent')).toBe(false);
		});

		it('should log error when harness.interrupt() rejects', async () => {
			vi.mocked(mockHarness.interrupt).mockRejectedValue(new Error('interrupt failed'));

			const config = makeConfig();
			pm.spawn(config);

			const result = pm.interrupt(config.sessionId);
			expect(result).toBe(true);

			// Wait for async rejection to be handled
			await vi.waitFor(() => {
				expect(logger.error).toHaveBeenCalledWith(
					'[ProcessManager] harness.interrupt() threw',
					'ProcessManager',
					expect.objectContaining({ sessionId: config.sessionId })
				);
			});
		});
	});

	describe('harness delegation: respondToInteraction()', () => {
		let mockHarness: AgentHarness;

		beforeEach(() => {
			mockHarness = createMockHarness();
			vi.mocked(selectExecutionMode).mockReturnValue({ mode: 'harness', reason: 'test' });
			mockCreateHarness.mockReturnValue(mockHarness);
		});

		it('should delegate to harness.respondToInteraction()', async () => {
			const config = makeConfig();
			pm.spawn(config);

			const response = { kind: 'tool-approval' as const, approved: true };
			await pm.respondToInteraction(config.sessionId, 'interaction-1', response as any);

			expect(mockHarness.respondToInteraction).toHaveBeenCalledWith('interaction-1', response);
		});

		it('should warn when no execution exists', async () => {
			await pm.respondToInteraction('nonexistent', 'interaction-1', { kind: 'tool-approval' } as any);

			expect(logger.warn).toHaveBeenCalledWith(
				expect.stringContaining('No execution found'),
				'ProcessManager',
				expect.any(Object)
			);
		});
	});

	describe('harness delegation: updateRuntimeSettings()', () => {
		let mockHarness: AgentHarness;

		beforeEach(() => {
			mockHarness = createMockHarness();
			vi.mocked(selectExecutionMode).mockReturnValue({ mode: 'harness', reason: 'test' });
			mockCreateHarness.mockReturnValue(mockHarness);
		});

		it('should delegate to harness.updateRuntimeSettings()', async () => {
			const config = makeConfig();
			pm.spawn(config);

			const settings = { permissionMode: 'bypassPermissions' as const };
			await pm.updateRuntimeSettings(config.sessionId, settings);

			expect(mockHarness.updateRuntimeSettings).toHaveBeenCalledWith(settings);
		});

		it('should warn when no execution exists', async () => {
			await pm.updateRuntimeSettings('nonexistent', { model: 'claude-opus' });

			expect(logger.warn).toHaveBeenCalledWith(
				expect.stringContaining('No execution found'),
				'ProcessManager',
				expect.any(Object)
			);
		});
	});

	describe('harness delegation: kill()', () => {
		let mockHarness: AgentHarness;

		beforeEach(() => {
			mockHarness = createMockHarness();
			vi.mocked(selectExecutionMode).mockReturnValue({ mode: 'harness', reason: 'test' });
			mockCreateHarness.mockReturnValue(mockHarness);
		});

		it('should call harness.dispose() and remove execution record', () => {
			const config = makeConfig();
			pm.spawn(config);

			const result = pm.kill(config.sessionId);

			expect(result).toBe(true);
			expect(mockHarness.dispose).toHaveBeenCalled();
			expect(pm.get(config.sessionId)).toBeUndefined();
		});

		it('should continue cleanup even if dispose() throws', () => {
			vi.mocked(mockHarness.dispose).mockImplementation(() => {
				throw new Error('dispose failed');
			});

			const config = makeConfig();
			pm.spawn(config);

			const result = pm.kill(config.sessionId);

			expect(result).toBe(true);
			expect(pm.get(config.sessionId)).toBeUndefined();
		});
	});
});
