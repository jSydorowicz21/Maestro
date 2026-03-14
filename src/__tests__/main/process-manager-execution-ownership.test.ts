/**
 * Tests for ProcessManager unified execution ownership.
 *
 * Verifies that ProcessManager correctly routes operations through
 * the backend discriminator (pty, child-process, harness) and that
 * the harness execution path behaves correctly during Phase 1
 * (logs warnings and returns safe defaults since harness adapters
 * are not yet wired).
 *
 * Also covers:
 * - Spawn fallback when harness mode is selected but no adapters registered
 * - respondToInteraction() guards for backend type and missing sessions
 * - Nullable PID in harness-backed AgentExecution records
 * - kill() cleanup for harness-backed executions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock node-pty before importing ProcessManager (native module)
vi.mock('node-pty', () => ({
	spawn: vi.fn(),
}));

// Mock logger — inline factory to avoid hoisting issues
vi.mock('../../main/utils/logger', () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

// Mock capabilities — claude-code supports harness, others don't
vi.mock('../../main/agents/capabilities', () => ({
	getAgentCapabilities: vi.fn((agentId: string) => {
		if (agentId === 'claude-code') {
			return { supportsHarnessExecution: true };
		}
		return { supportsHarnessExecution: false };
	}),
}));

import { ProcessManager } from '../../main/process-manager/ProcessManager';
import type { AgentExecution, ProcessManagerEvents } from '../../main/process-manager/types';
import type { InteractionRequest } from '../../shared/interaction-types';
import type { RuntimeMetadataEvent } from '../../shared/runtime-metadata-types';
import { logger } from '../../main/utils/logger';

// Cast to access mock functions
const mockLogger = logger as unknown as Record<string, ReturnType<typeof vi.fn>>;

/**
 * Helper: inject a synthetic execution record into the ProcessManager's
 * private processes map. This is necessary because Phase 1 spawn()
 * always falls back to classic, so we can't get a harness-backed
 * record through the normal spawn path.
 */
function injectExecution(pm: ProcessManager, execution: AgentExecution): void {
	// Access the private map for test injection
	(pm as any).processes.set(execution.sessionId, execution);
}

function makeHarnessExecution(overrides: Partial<AgentExecution> = {}): AgentExecution {
	return {
		sessionId: 'harness-session-1',
		toolType: 'claude-code',
		backend: 'harness',
		cwd: '/tmp',
		pid: null, // harness executions have null PID
		isTerminal: false,
		startTime: Date.now(),
		...overrides,
	};
}

function makePtyExecution(overrides: Partial<AgentExecution> = {}): AgentExecution {
	return {
		sessionId: 'pty-session-1',
		toolType: 'terminal',
		backend: 'pty',
		cwd: '/tmp',
		pid: 12345,
		isTerminal: true,
		startTime: Date.now(),
		ptyProcess: {
			write: vi.fn(),
			resize: vi.fn(),
			kill: vi.fn(),
			onData: vi.fn(),
			onExit: vi.fn(),
			pid: 12345,
			cols: 80,
			rows: 24,
			process: 'bash',
			handleFlowControl: false,
		} as any,
		...overrides,
	};
}

function makeChildProcessExecution(overrides: Partial<AgentExecution> = {}): AgentExecution {
	return {
		sessionId: 'cp-session-1',
		toolType: 'claude-code',
		backend: 'child-process',
		cwd: '/tmp',
		pid: 54321,
		isTerminal: false,
		startTime: Date.now(),
		childProcess: {
			stdin: { write: vi.fn() },
			kill: vi.fn(),
			killed: false,
			once: vi.fn(),
			pid: 54321,
		} as any,
		...overrides,
	};
}

describe('ProcessManager: Unified Execution Ownership', () => {
	let pm: ProcessManager;

	beforeEach(() => {
		vi.clearAllMocks();
		pm = new ProcessManager();
	});

	afterEach(() => {
		pm.killAll();
	});

	// ===================================================================
	// Spawn fallback when harness mode selected
	// ===================================================================
	describe('spawn() harness fallback', () => {
		it('logs warning when harness mode is selected but no adapters registered', () => {
			// spawn() for claude-code (harness-capable) should trigger the harness path
			// which logs a warning and falls back to classic. The actual spawn will
			// fail (no real PTY) but we're testing the warning path.
			try {
				pm.spawn({
					sessionId: 'test-harness-fallback',
					toolType: 'claude-code',
					cwd: '/tmp',
					command: 'claude',
					args: [],
					preferredExecutionMode: 'harness',
				});
			} catch {
				// spawn may throw due to missing PTY bindings — that's fine
			}

			// Verify the harness fallback warning was logged
			expect(mockLogger.warn).toHaveBeenCalledWith(
				expect.stringContaining('no harness factory registered; falling back to classic'),
				'ProcessManager',
				expect.objectContaining({
					sessionId: 'test-harness-fallback',
					toolType: 'claude-code',
				})
			);
		});

		it('does not log harness warning for classic-only agents', () => {
			try {
				pm.spawn({
					sessionId: 'test-classic-agent',
					toolType: 'terminal',
					cwd: '/tmp',
					command: 'bash',
					args: [],
				});
			} catch {
				// may throw due to missing PTY
			}

			// Should NOT have the harness fallback warning
			const harnessWarnings = mockLogger.warn.mock.calls.filter(
				(call: any[]) => typeof call[0] === 'string' && call[0].includes('Harness mode selected')
			);
			expect(harnessWarnings).toHaveLength(0);
		});
	});

	// ===================================================================
	// write() routing by backend
	// ===================================================================
	describe('write() backend routing', () => {
		it('returns true and logs error for harness backend (unreachable in Phase 1)', () => {
			const execution = makeHarnessExecution();
			injectExecution(pm, execution);

			const result = pm.write('harness-session-1', 'hello');

			expect(result).toBe(true);
			expect(mockLogger.error).toHaveBeenCalledWith(
				expect.stringContaining('unreachable in Phase 1'),
				'ProcessManager',
				expect.objectContaining({ sessionId: 'harness-session-1' })
			);
		});

		it('returns true for pty backend with valid ptyProcess', () => {
			const execution = makePtyExecution();
			injectExecution(pm, execution);

			const result = pm.write('pty-session-1', 'hello\n');

			expect(result).toBe(true);
			expect(execution.ptyProcess!.write).toHaveBeenCalledWith('hello\n');
		});

		it('returns true for child-process backend with valid stdin', () => {
			const execution = makeChildProcessExecution();
			injectExecution(pm, execution);

			const result = pm.write('cp-session-1', 'hello');

			expect(result).toBe(true);
			expect(execution.childProcess!.stdin!.write).toHaveBeenCalledWith('hello');
		});

		it('returns false for unknown session', () => {
			const result = pm.write('nonexistent', 'hello');

			expect(result).toBe(false);
			expect(mockLogger.error).toHaveBeenCalledWith(
				expect.stringContaining('No execution found'),
				'ProcessManager',
				expect.objectContaining({ sessionId: 'nonexistent' })
			);
		});
	});

	// ===================================================================
	// interrupt() routing by backend
	// ===================================================================
	describe('interrupt() backend routing', () => {
		it('returns true and logs error for harness backend (unreachable in Phase 1)', () => {
			const execution = makeHarnessExecution();
			injectExecution(pm, execution);

			const result = pm.interrupt('harness-session-1');

			expect(result).toBe(true);
			expect(mockLogger.error).toHaveBeenCalledWith(
				expect.stringContaining('unreachable in Phase 1'),
				'ProcessManager',
				expect.objectContaining({ sessionId: 'harness-session-1' })
			);
		});

		it('returns true for pty backend (sends Ctrl+C)', () => {
			const execution = makePtyExecution();
			injectExecution(pm, execution);

			const result = pm.interrupt('pty-session-1');

			expect(result).toBe(true);
			expect(execution.ptyProcess!.write).toHaveBeenCalledWith('\x03');
		});

		it('returns false for unknown session', () => {
			const result = pm.interrupt('nonexistent');
			expect(result).toBe(false);
		});
	});

	// ===================================================================
	// kill() routing by backend
	// ===================================================================
	describe('kill() backend routing', () => {
		it('calls harness.dispose() for harness backend and removes execution record', () => {
			const mockDispose = vi.fn();
			const execution = makeHarnessExecution({
				harness: { dispose: mockDispose, isDisposed: () => false } as any,
			});
			injectExecution(pm, execution);

			const result = pm.kill('harness-session-1');

			expect(result).toBe(true);
			expect(mockDispose).toHaveBeenCalledOnce();
			expect(pm.get('harness-session-1')).toBeUndefined();
		});

		it('logs warning when harness-backed execution has no harness instance', () => {
			const execution = makeHarnessExecution(); // no harness field
			injectExecution(pm, execution);

			const result = pm.kill('harness-session-1');

			expect(result).toBe(true);
			expect(mockLogger.warn).toHaveBeenCalledWith(
				expect.stringContaining('no harness instance'),
				'ProcessManager',
				expect.objectContaining({ sessionId: 'harness-session-1' })
			);
			expect(pm.get('harness-session-1')).toBeUndefined();
		});

		it('still deletes execution record if harness.dispose() throws', () => {
			const mockDispose = vi.fn(() => {
				throw new Error('dispose exploded');
			});
			const execution = makeHarnessExecution({
				harness: { dispose: mockDispose, isDisposed: () => false } as any,
			});
			injectExecution(pm, execution);

			const result = pm.kill('harness-session-1');

			expect(result).toBe(true);
			expect(mockDispose).toHaveBeenCalledOnce();
			expect(mockLogger.error).toHaveBeenCalledWith(
				expect.stringContaining('harness.dispose() threw'),
				'ProcessManager',
				expect.objectContaining({
					sessionId: 'harness-session-1',
					error: 'Error: dispose exploded',
				})
			);
			// Execution record must still be removed
			expect(pm.get('harness-session-1')).toBeUndefined();
		});

		it('removes execution record for pty backend', () => {
			const execution = makePtyExecution();
			injectExecution(pm, execution);

			const result = pm.kill('pty-session-1');

			expect(result).toBe(true);
			expect(execution.ptyProcess!.kill).toHaveBeenCalled();
			expect(pm.get('pty-session-1')).toBeUndefined();
		});

		it('removes execution record for child-process backend', () => {
			const execution = makeChildProcessExecution();
			injectExecution(pm, execution);

			const result = pm.kill('cp-session-1');

			expect(result).toBe(true);
			expect(execution.childProcess!.kill).toHaveBeenCalledWith('SIGTERM');
			expect(pm.get('cp-session-1')).toBeUndefined();
		});

		it('returns false for unknown session', () => {
			const result = pm.kill('nonexistent');
			expect(result).toBe(false);
		});

		it('clears data buffer timeout for harness execution on kill', () => {
			const timeout = setTimeout(() => {}, 10000);
			const execution = makeHarnessExecution({ dataBufferTimeout: timeout });
			injectExecution(pm, execution);

			const result = pm.kill('harness-session-1');

			expect(result).toBe(true);
			expect(pm.get('harness-session-1')).toBeUndefined();
		});
	});

	// ===================================================================
	// respondToInteraction() guards
	// ===================================================================
	describe('respondToInteraction() guards', () => {
		it('warns and returns for missing session', () => {
			pm.respondToInteraction('nonexistent', 'int-1', { kind: 'approve' });

			expect(mockLogger.warn).toHaveBeenCalledWith(
				expect.stringContaining('No execution found'),
				'ProcessManager',
				expect.objectContaining({
					sessionId: 'nonexistent',
					interactionId: 'int-1',
				})
			);
		});

		it('warns and returns when called on pty backend', () => {
			const execution = makePtyExecution();
			injectExecution(pm, execution);

			pm.respondToInteraction('pty-session-1', 'int-1', { kind: 'approve' });

			expect(mockLogger.warn).toHaveBeenCalledWith(
				expect.stringContaining('non-harness execution'),
				'ProcessManager',
				expect.objectContaining({
					sessionId: 'pty-session-1',
					interactionId: 'int-1',
					backend: 'pty',
				})
			);
		});

		it('warns and returns when called on child-process backend', () => {
			const execution = makeChildProcessExecution();
			injectExecution(pm, execution);

			pm.respondToInteraction('cp-session-1', 'int-1', { kind: 'deny' });

			expect(mockLogger.warn).toHaveBeenCalledWith(
				expect.stringContaining('non-harness execution'),
				'ProcessManager',
				expect.objectContaining({
					sessionId: 'cp-session-1',
					backend: 'child-process',
				})
			);
		});

		it('reaches harness delegation stub for harness backend', () => {
			const execution = makeHarnessExecution();
			injectExecution(pm, execution);

			pm.respondToInteraction('harness-session-1', 'int-1', { kind: 'approve' });

			expect(mockLogger.warn).toHaveBeenCalledWith(
				expect.stringContaining('harness adapters not yet registered'),
				'ProcessManager',
				expect.objectContaining({
					sessionId: 'harness-session-1',
					interactionId: 'int-1',
					responseKind: 'approve',
				})
			);
		});

		it('passes response kind through to log for all response types', () => {
			const execution = makeHarnessExecution();
			injectExecution(pm, execution);

			const responseKinds = ['approve', 'deny', 'text', 'clarification-answer', 'cancel'] as const;

			for (const kind of responseKinds) {
				mockLogger.warn.mockClear();

				const response = kind === 'text'
					? { kind, text: 'hello' } as const
					: kind === 'clarification-answer'
						? { kind, answers: [] } as const
						: { kind } as const;

				pm.respondToInteraction('harness-session-1', `int-${kind}`, response);

				expect(mockLogger.warn).toHaveBeenCalledWith(
					expect.stringContaining('harness adapters not yet registered'),
					'ProcessManager',
					expect.objectContaining({ responseKind: kind })
				);
			}
		});
	});

	// ===================================================================
	// updateRuntimeSettings() guards
	// ===================================================================
	describe('updateRuntimeSettings() guards', () => {
		it('warns and returns for missing session', async () => {
			await pm.updateRuntimeSettings('nonexistent', { model: 'claude-3-opus' });

			expect(mockLogger.warn).toHaveBeenCalledWith(
				expect.stringContaining('No execution found'),
				'ProcessManager',
				expect.objectContaining({
					sessionId: 'nonexistent',
				})
			);
		});

		it('warns and returns when called on pty backend', async () => {
			const execution = makePtyExecution();
			injectExecution(pm, execution);

			await pm.updateRuntimeSettings('pty-session-1', { model: 'claude-3-opus' });

			expect(mockLogger.warn).toHaveBeenCalledWith(
				expect.stringContaining('non-harness execution'),
				'ProcessManager',
				expect.objectContaining({
					sessionId: 'pty-session-1',
					backend: 'pty',
				})
			);
		});

		it('warns and returns when called on child-process backend', async () => {
			const execution = makeChildProcessExecution();
			injectExecution(pm, execution);

			await pm.updateRuntimeSettings('cp-session-1', { permissionMode: 'default' as any });

			expect(mockLogger.warn).toHaveBeenCalledWith(
				expect.stringContaining('non-harness execution'),
				'ProcessManager',
				expect.objectContaining({
					sessionId: 'cp-session-1',
					backend: 'child-process',
				})
			);
		});

		it('reaches harness delegation stub for harness backend', async () => {
			const execution = makeHarnessExecution();
			injectExecution(pm, execution);

			await pm.updateRuntimeSettings('harness-session-1', { model: 'claude-3-opus' });

			expect(mockLogger.warn).toHaveBeenCalledWith(
				expect.stringContaining('harness adapters not yet registered'),
				'ProcessManager',
				expect.objectContaining({
					sessionId: 'harness-session-1',
					settingsKeys: ['model'],
				})
			);
		});

		it('logs all settings keys in the stub warning', async () => {
			const execution = makeHarnessExecution();
			injectExecution(pm, execution);

			await pm.updateRuntimeSettings('harness-session-1', {
				model: 'claude-3-opus',
				permissionMode: 'default' as any,
				providerOptions: { reasoningEffort: 'high' },
			});

			expect(mockLogger.warn).toHaveBeenCalledWith(
				expect.stringContaining('harness adapters not yet registered'),
				'ProcessManager',
				expect.objectContaining({
					settingsKeys: expect.arrayContaining(['model', 'permissionMode', 'providerOptions']),
				})
			);
		});

		it('returns Promise<void> (is async)', () => {
			const execution = makeHarnessExecution();
			injectExecution(pm, execution);

			const result = pm.updateRuntimeSettings('harness-session-1', { model: 'test' });

			// Should return a promise
			expect(result).toBeInstanceOf(Promise);
		});
	});

	// ===================================================================
	// Nullable PID in harness-backed executions
	// ===================================================================
	describe('nullable PID for harness-backed executions', () => {
		it('get() returns execution with null PID for harness backend', () => {
			const execution = makeHarnessExecution({ pid: null });
			injectExecution(pm, execution);

			const retrieved = pm.get('harness-session-1');
			expect(retrieved).toBeDefined();
			expect(retrieved!.pid).toBeNull();
			expect(retrieved!.backend).toBe('harness');
		});

		it('get() returns execution with undefined PID for harness backend', () => {
			const execution = makeHarnessExecution({ pid: undefined });
			injectExecution(pm, execution);

			const retrieved = pm.get('harness-session-1');
			expect(retrieved).toBeDefined();
			expect(retrieved!.pid).toBeUndefined();
		});

		it('getAll() serializes mixed PIDs correctly (integer + null)', () => {
			injectExecution(pm, makePtyExecution({ sessionId: 'pty-1', pid: 100 }));
			injectExecution(pm, makeChildProcessExecution({ sessionId: 'cp-1', pid: 200 }));
			injectExecution(pm, makeHarnessExecution({ sessionId: 'h-1', pid: null }));

			const all = pm.getAll();
			expect(all).toHaveLength(3);

			const pids = all.map((e) => e.pid);
			expect(pids).toContain(100);
			expect(pids).toContain(200);
			expect(pids).toContain(null);
		});

		it('harness execution has no ptyProcess or childProcess handles', () => {
			const execution = makeHarnessExecution();
			injectExecution(pm, execution);

			const retrieved = pm.get('harness-session-1');
			expect(retrieved!.ptyProcess).toBeUndefined();
			expect(retrieved!.childProcess).toBeUndefined();
		});
	});

	// ===================================================================
	// killAll() with mixed backends
	// ===================================================================
	describe('killAll() with mixed backends', () => {
		it('kills all executions across all backends', () => {
			injectExecution(pm, makePtyExecution({ sessionId: 'pty-1' }));
			injectExecution(pm, makeChildProcessExecution({ sessionId: 'cp-1' }));
			injectExecution(pm, makeHarnessExecution({ sessionId: 'h-1' }));

			expect(pm.getAll()).toHaveLength(3);

			pm.killAll();

			expect(pm.getAll()).toHaveLength(0);
		});
	});

	// ===================================================================
	// Backend coexistence: different operations on different backends
	// ===================================================================
	describe('concurrent backend operations', () => {
		it('write routes correctly to each backend independently', () => {
			const ptyExec = makePtyExecution({ sessionId: 'pty-1' });
			const cpExec = makeChildProcessExecution({ sessionId: 'cp-1' });
			const harnessExec = makeHarnessExecution({ sessionId: 'h-1' });

			injectExecution(pm, ptyExec);
			injectExecution(pm, cpExec);
			injectExecution(pm, harnessExec);

			expect(pm.write('pty-1', 'a')).toBe(true);
			expect(pm.write('cp-1', 'b')).toBe(true);
			expect(pm.write('h-1', 'c')).toBe(true); // harness stub (unreachable in Phase 1)

			expect(ptyExec.ptyProcess!.write).toHaveBeenCalledWith('a');
			expect(cpExec.childProcess!.stdin!.write).toHaveBeenCalledWith('b');
		});

		it('kill only removes the targeted session', () => {
			injectExecution(pm, makePtyExecution({ sessionId: 'pty-1' }));
			injectExecution(pm, makeHarnessExecution({ sessionId: 'h-1' }));

			pm.kill('h-1');

			expect(pm.get('h-1')).toBeUndefined();
			expect(pm.get('pty-1')).toBeDefined();
		});
	});

	// ===================================================================
	// resize() is pty-only — no-op for other backends
	// ===================================================================
	describe('resize() backend specificity', () => {
		it('returns false for harness-backed execution', () => {
			injectExecution(pm, makeHarnessExecution());
			const result = pm.resize('harness-session-1', 120, 40);
			expect(result).toBe(false);
		});

		it('returns false for child-process execution', () => {
			injectExecution(pm, makeChildProcessExecution());
			const result = pm.resize('cp-session-1', 120, 40);
			expect(result).toBe(false);
		});

		it('returns true for pty terminal execution', () => {
			injectExecution(pm, makePtyExecution());
			const result = pm.resize('pty-session-1', 120, 40);
			expect(result).toBe(true);
		});
	});
});

// ===================================================================
// Type-level tests for ProcessManagerEvents
// ===================================================================
describe('ProcessManagerEvents type includes harness event signatures', () => {
	it('interaction-request event signature accepts InteractionRequest', () => {
		// Type-level assertion: if ProcessManagerEvents does not include
		// 'interaction-request', this assignment would fail at compile time.
		const handler: ProcessManagerEvents['interaction-request'] = (
			_sessionId: string,
			_request: InteractionRequest
		) => {};
		expect(typeof handler).toBe('function');
	});

	it('runtime-metadata event signature accepts RuntimeMetadataEvent', () => {
		// Type-level assertion: if ProcessManagerEvents does not include
		// 'runtime-metadata', this assignment would fail at compile time.
		const handler: ProcessManagerEvents['runtime-metadata'] = (
			_sessionId: string,
			_metadata: RuntimeMetadataEvent
		) => {};
		expect(typeof handler).toBe('function');
	});
});
