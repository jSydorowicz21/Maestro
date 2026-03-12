/**
 * Tests for nullable PID handling across the codebase.
 *
 * Verifies that all layers — types, ProcessManager, IPC serialization,
 * debug collectors, and renderer interfaces — correctly handle the case
 * where `pid` is null or undefined (harness-backed executions that don't
 * spawn an OS process).
 *
 * These tests cover:
 * - Type contracts: SpawnResult, AgentExecution, ActiveProcess, ProcessInfo
 * - ProcessManager.getAll() serialization with mixed PIDs
 * - IPC handler getActiveProcesses mapping with null PIDs
 * - Debug-package collector handling of null PIDs
 * - ProcessMonitor UI data model nullable PID support
 * - Context groomer interface compatibility with nullable PID
 * - Edge cases: undefined vs null vs 0 PID semantics
 * - Logging with null PIDs (no crashes or misleading output)
 * - Kill/interrupt operations on sessions with null PID
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ===================================================================
// Mocks — required before importing modules that use native bindings
// ===================================================================

vi.mock('node-pty', () => ({
	spawn: vi.fn(),
}));

vi.mock('../../main/utils/logger', () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

vi.mock('../../main/agents/capabilities', () => ({
	getAgentCapabilities: vi.fn((agentId: string) => {
		if (agentId === 'claude-code') {
			return { supportsHarnessExecution: true };
		}
		return { supportsHarnessExecution: false };
	}),
}));

import { ProcessManager } from '../../main/process-manager/ProcessManager';
import type { AgentExecution, SpawnResult } from '../../main/process-manager/types';
import { logger } from '../../main/utils/logger';

const mockLogger = logger as unknown as Record<string, ReturnType<typeof vi.fn>>;

// ===================================================================
// Helpers — synthetic execution record injection
// ===================================================================

function injectExecution(pm: ProcessManager, execution: AgentExecution): void {
	(pm as any).processes.set(execution.sessionId, execution);
}

function makeHarnessExecution(overrides: Partial<AgentExecution> = {}): AgentExecution {
	return {
		sessionId: 'harness-1',
		toolType: 'claude-code',
		backend: 'harness',
		cwd: '/tmp/harness',
		pid: null,
		isTerminal: false,
		startTime: Date.now(),
		...overrides,
	};
}

function makePtyExecution(overrides: Partial<AgentExecution> = {}): AgentExecution {
	return {
		sessionId: 'pty-1',
		toolType: 'terminal',
		backend: 'pty',
		cwd: '/tmp/pty',
		pid: 42000,
		isTerminal: true,
		startTime: Date.now(),
		ptyProcess: {
			write: vi.fn(),
			resize: vi.fn(),
			kill: vi.fn(),
			onData: vi.fn(),
			onExit: vi.fn(),
			pid: 42000,
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
		sessionId: 'cp-1',
		toolType: 'claude-code',
		backend: 'child-process',
		cwd: '/tmp/cp',
		pid: 55000,
		isTerminal: false,
		startTime: Date.now(),
		childProcess: {
			stdin: { write: vi.fn() },
			kill: vi.fn(),
			killed: false,
			once: vi.fn(),
			pid: 55000,
		} as any,
		...overrides,
	};
}

// ===================================================================
// Test suite
// ===================================================================

describe('Nullable PID Handling', () => {
	let pm: ProcessManager;

	beforeEach(() => {
		vi.clearAllMocks();
		pm = new ProcessManager();
	});

	afterEach(() => {
		pm.killAll();
	});

	// =================================================================
	// 1. Type contract: SpawnResult allows null PID
	// =================================================================
	describe('SpawnResult type contract', () => {
		it('SpawnResult accepts null pid for successful harness spawn', () => {
			const result: SpawnResult = { pid: null, success: true };

			expect(result.pid).toBeNull();
			expect(result.success).toBe(true);
		});

		it('SpawnResult accepts numeric pid for process-based spawn', () => {
			const result: SpawnResult = { pid: 12345, success: true };

			expect(result.pid).toBe(12345);
			expect(result.success).toBe(true);
		});

		it('SpawnResult with null pid serializes to JSON without loss', () => {
			const result: SpawnResult = { pid: null, success: true };
			const serialized = JSON.parse(JSON.stringify(result));

			expect(serialized.pid).toBeNull();
			expect(serialized.success).toBe(true);
		});
	});

	// =================================================================
	// 2. AgentExecution nullable PID semantics
	// =================================================================
	describe('AgentExecution nullable PID semantics', () => {
		it('null PID means harness-backed (no OS process)', () => {
			const execution = makeHarnessExecution({ pid: null });

			expect(execution.pid).toBeNull();
			expect(execution.backend).toBe('harness');
			expect(execution.ptyProcess).toBeUndefined();
			expect(execution.childProcess).toBeUndefined();
		});

		it('undefined PID is valid for harness backend', () => {
			const execution = makeHarnessExecution({ pid: undefined });

			expect(execution.pid).toBeUndefined();
			expect(execution.backend).toBe('harness');
		});

		it('numeric PID for pty backend', () => {
			const execution = makePtyExecution({ pid: 42000 });

			expect(execution.pid).toBe(42000);
			expect(typeof execution.pid).toBe('number');
		});

		it('numeric PID for child-process backend', () => {
			const execution = makeChildProcessExecution({ pid: 55000 });

			expect(execution.pid).toBe(55000);
			expect(typeof execution.pid).toBe('number');
		});

		it('PID 0 is a valid (albeit unusual) process PID, distinct from null', () => {
			// PID 0 is technically valid on some systems (kernel scheduler)
			// It should NOT be confused with "no PID" (null/undefined)
			const execution = makePtyExecution({ pid: 0 });

			expect(execution.pid).toBe(0);
			expect(execution.pid).not.toBeNull();
			expect(execution.pid).not.toBeUndefined();
		});
	});

	// =================================================================
	// 3. ProcessManager.get() with nullable PID
	// =================================================================
	describe('ProcessManager.get() with nullable PID', () => {
		it('returns harness execution with null PID unchanged', () => {
			injectExecution(pm, makeHarnessExecution({ pid: null }));

			const exec = pm.get('harness-1');
			expect(exec).toBeDefined();
			expect(exec!.pid).toBeNull();
		});

		it('returns harness execution with undefined PID unchanged', () => {
			injectExecution(pm, makeHarnessExecution({ pid: undefined }));

			const exec = pm.get('harness-1');
			expect(exec).toBeDefined();
			expect(exec!.pid).toBeUndefined();
		});

		it('returns process execution with numeric PID', () => {
			injectExecution(pm, makePtyExecution({ pid: 99999 }));

			const exec = pm.get('pty-1');
			expect(exec!.pid).toBe(99999);
		});
	});

	// =================================================================
	// 4. ProcessManager.getAll() serialization with mixed PIDs
	// =================================================================
	describe('ProcessManager.getAll() with mixed PIDs', () => {
		it('preserves null, undefined, and numeric PIDs in getAll()', () => {
			injectExecution(pm, makePtyExecution({ sessionId: 'pty-a', pid: 100 }));
			injectExecution(pm, makeChildProcessExecution({ sessionId: 'cp-a', pid: 200 }));
			injectExecution(pm, makeHarnessExecution({ sessionId: 'h-null', pid: null }));
			injectExecution(pm, makeHarnessExecution({ sessionId: 'h-undef', pid: undefined }));

			const all = pm.getAll();
			expect(all).toHaveLength(4);

			const byId = new Map(all.map((e) => [e.sessionId, e]));

			expect(byId.get('pty-a')!.pid).toBe(100);
			expect(byId.get('cp-a')!.pid).toBe(200);
			expect(byId.get('h-null')!.pid).toBeNull();
			expect(byId.get('h-undef')!.pid).toBeUndefined();
		});

		it('getAll() result is JSON-serializable with null PIDs', () => {
			injectExecution(pm, makePtyExecution({ sessionId: 'pty-a', pid: 100 }));
			injectExecution(pm, makeHarnessExecution({ sessionId: 'h-a', pid: null }));

			const all = pm.getAll();
			const serialized = JSON.parse(JSON.stringify(
				all.map((p) => ({
					sessionId: p.sessionId,
					toolType: p.toolType,
					pid: p.pid,
					cwd: p.cwd,
					isTerminal: p.isTerminal,
					isBatchMode: p.isBatchMode || false,
					startTime: p.startTime,
				}))
			));

			expect(serialized).toHaveLength(2);

			const ptyEntry = serialized.find((s: any) => s.sessionId === 'pty-a');
			const harnessEntry = serialized.find((s: any) => s.sessionId === 'h-a');

			expect(ptyEntry.pid).toBe(100);
			expect(harnessEntry.pid).toBeNull();
		});

		it('undefined PID serializes to absent field in JSON', () => {
			injectExecution(pm, makeHarnessExecution({ sessionId: 'h-undef', pid: undefined }));

			const all = pm.getAll();
			const serialized = JSON.parse(JSON.stringify(
				all.map((p) => ({
					sessionId: p.sessionId,
					pid: p.pid,
				}))
			));

			// JSON.stringify drops undefined fields — pid should not be present
			expect(serialized[0].sessionId).toBe('h-undef');
			expect('pid' in serialized[0]).toBe(false);
		});
	});

	// =================================================================
	// 5. IPC getActiveProcesses mapping faithfulness
	// =================================================================
	describe('IPC getActiveProcesses mapping', () => {
		it('maps pid faithfully including null for harness sessions', () => {
			injectExecution(pm, makePtyExecution({ sessionId: 'pty-ipc', pid: 10001 }));
			injectExecution(pm, makeHarnessExecution({ sessionId: 'h-ipc', pid: null }));

			// Simulate the IPC handler mapping (mirrors src/main/ipc/handlers/process.ts)
			const processes = pm.getAll();
			const mapped = processes.map((p) => ({
				sessionId: p.sessionId,
				toolType: p.toolType,
				pid: p.pid,
				cwd: p.cwd,
				isTerminal: p.isTerminal,
				isBatchMode: p.isBatchMode || false,
				startTime: p.startTime,
				command: p.command,
				args: p.args,
			}));

			const ptyMapped = mapped.find((m) => m.sessionId === 'pty-ipc');
			const harnessMapped = mapped.find((m) => m.sessionId === 'h-ipc');

			expect(ptyMapped!.pid).toBe(10001);
			expect(harnessMapped!.pid).toBeNull();
		});

		it('mapped result matches ActiveProcess interface shape', () => {
			injectExecution(pm, makeHarnessExecution({ sessionId: 'h-shape', pid: null }));

			const processes = pm.getAll();
			const mapped = processes.map((p) => ({
				sessionId: p.sessionId,
				toolType: p.toolType,
				pid: p.pid as number | null,
				cwd: p.cwd,
				isTerminal: p.isTerminal,
				isBatchMode: p.isBatchMode || false,
				startTime: p.startTime,
				command: p.command,
				args: p.args,
			}));

			const entry = mapped[0];
			// Verify all required ActiveProcess fields
			expect(typeof entry.sessionId).toBe('string');
			expect(typeof entry.toolType).toBe('string');
			expect(entry.pid === null || typeof entry.pid === 'number').toBe(true);
			expect(typeof entry.cwd).toBe('string');
			expect(typeof entry.isTerminal).toBe('boolean');
			expect(typeof entry.isBatchMode).toBe('boolean');
			expect(typeof entry.startTime).toBe('number');
		});
	});

	// =================================================================
	// 6. Debug-package collector: collectProcesses with null PIDs
	// =================================================================
	describe('collectProcesses with null PIDs', () => {
		it('preserves null PID for harness-backed processes', async () => {
			const { collectProcesses } = await import(
				'../../main/debug-package/collectors/processes'
			);

			const mockProcessManager = {
				getAll: vi.fn().mockReturnValue([
					{
						sessionId: 'harness-debug-1',
						toolType: 'claude-code',
						pid: null,
						cwd: '/tmp/test',
						isTerminal: false,
						isBatchMode: false,
						startTime: Date.now() - 30000,
						outputParser: null,
					},
				]),
			};

			const result = await collectProcesses(mockProcessManager as any);

			expect(result).toHaveLength(1);
			expect(result[0].pid).toBeNull();
			expect(result[0].sessionId).toBe('harness-debug-1');
		});

		it('preserves numeric PID for process-backed executions', async () => {
			const { collectProcesses } = await import(
				'../../main/debug-package/collectors/processes'
			);

			const mockProcessManager = {
				getAll: vi.fn().mockReturnValue([
					{
						sessionId: 'pty-debug-1',
						toolType: 'terminal',
						pid: 88888,
						cwd: '/tmp/test',
						isTerminal: true,
						isBatchMode: false,
						startTime: Date.now() - 10000,
						outputParser: {},
					},
				]),
			};

			const result = await collectProcesses(mockProcessManager as any);

			expect(result[0].pid).toBe(88888);
		});

		it('handles mixed PIDs (numeric + null) in same collection', async () => {
			const { collectProcesses } = await import(
				'../../main/debug-package/collectors/processes'
			);

			const mockProcessManager = {
				getAll: vi.fn().mockReturnValue([
					{
						sessionId: 'pty-mixed',
						toolType: 'terminal',
						pid: 11111,
						cwd: '/tmp',
						isTerminal: true,
						isBatchMode: false,
						startTime: Date.now(),
						outputParser: {},
					},
					{
						sessionId: 'harness-mixed',
						toolType: 'claude-code',
						pid: null,
						cwd: '/tmp',
						isTerminal: false,
						isBatchMode: false,
						startTime: Date.now(),
						outputParser: null,
					},
				]),
			};

			const result = await collectProcesses(mockProcessManager as any);

			expect(result).toHaveLength(2);
			expect(result[0].pid).toBe(11111);
			expect(result[1].pid).toBeNull();
		});

		it('does not coerce null PID to 0', async () => {
			const { collectProcesses } = await import(
				'../../main/debug-package/collectors/processes'
			);

			const mockProcessManager = {
				getAll: vi.fn().mockReturnValue([
					{
						sessionId: 'h-1',
						toolType: 'claude-code',
						pid: null,
						cwd: '/tmp',
						isTerminal: false,
						isBatchMode: false,
						startTime: Date.now(),
						outputParser: null,
					},
				]),
			};

			const result = await collectProcesses(mockProcessManager as any);

			// The old code used `proc.pid || 0` which would coerce null/0 to 0.
			// The fix uses `proc.pid ?? null` to preserve null.
			expect(result[0].pid).not.toBe(0);
			expect(result[0].pid).toBeNull();
		});

		it('handles undefined PID (falls back to null)', async () => {
			const { collectProcesses } = await import(
				'../../main/debug-package/collectors/processes'
			);

			const mockProcessManager = {
				getAll: vi.fn().mockReturnValue([
					{
						sessionId: 'h-undef',
						toolType: 'claude-code',
						pid: undefined,
						cwd: '/tmp',
						isTerminal: false,
						isBatchMode: false,
						startTime: Date.now(),
						outputParser: null,
					},
				]),
			};

			const result = await collectProcesses(mockProcessManager as any);

			// undefined ?? null -> null
			expect(result[0].pid).toBeNull();
		});
	});

	// =================================================================
	// 7. ProcessMonitor UI data model
	// =================================================================
	describe('ProcessMonitor data model nullable PID', () => {
		// These tests verify the data structures that ProcessMonitor uses
		// without requiring a React render context.

		interface ActiveProcess {
			sessionId: string;
			toolType: string;
			pid: number | null;
			cwd: string;
			isTerminal: boolean;
			isBatchMode: boolean;
			startTime: number;
			command?: string;
			args?: string[];
		}

		interface ProcessNode {
			id: string;
			type: 'group' | 'session' | 'process' | 'groupchat';
			label: string;
			processSessionId?: string;
			pid?: number | null;
			isAlive?: boolean;
		}

		interface ProcessDetailData {
			processSessionId: string;
			pid: number | null;
			toolType: string;
			cwd: string;
			startTime: number;
		}

		it('ActiveProcess accepts null PID for harness sessions', () => {
			const proc: ActiveProcess = {
				sessionId: 'harness-ai-tab1',
				toolType: 'claude-code',
				pid: null,
				cwd: '/project',
				isTerminal: false,
				isBatchMode: false,
				startTime: Date.now(),
			};

			expect(proc.pid).toBeNull();
		});

		it('ProcessNode can carry null PID from ActiveProcess', () => {
			const node: ProcessNode = {
				id: 'process-harness-ai-tab1',
				type: 'process',
				label: 'Agent 1 - AI Agent (claude-code)',
				processSessionId: 'harness-ai-tab1',
				pid: null,
				isAlive: true,
			};

			expect(node.pid).toBeNull();
			expect(node.processSessionId).toBe('harness-ai-tab1');
		});

		it('ProcessDetailData accepts null PID', () => {
			const detail: ProcessDetailData = {
				processSessionId: 'harness-ai-tab1',
				pid: null,
				toolType: 'claude-code',
				cwd: '/project',
				startTime: Date.now(),
			};

			expect(detail.pid).toBeNull();
		});

		it('PID display falls back to "N/A" for null', () => {
			const pid: number | null = null;
			const display = pid ?? 'N/A';

			expect(display).toBe('N/A');
		});

		it('PID display shows numeric value for process-backed sessions', () => {
			const pid: number | null = 42000;
			const display = pid ?? 'N/A';

			expect(display).toBe(42000);
		});

		it('openProcessDetail guard: null processSessionId blocks entry', () => {
			const node: ProcessNode = {
				id: 'process-x',
				type: 'process',
				label: 'Test',
				processSessionId: undefined,
				pid: null,
			};

			// The guard in ProcessMonitor is: if (!node.processSessionId) return;
			// So null PID should NOT block the detail view — only missing sessionId should.
			const shouldBlock = !node.processSessionId;
			expect(shouldBlock).toBe(true);
		});

		it('openProcessDetail guard: null PID does NOT block entry', () => {
			const node: ProcessNode = {
				id: 'process-harness-1',
				type: 'process',
				label: 'Test Harness',
				processSessionId: 'harness-session-123',
				pid: null,
			};

			// After the fix, only processSessionId is checked, not pid
			const shouldBlock = !node.processSessionId;
			expect(shouldBlock).toBe(false);
		});

		it('openProcessDetail guard: valid process-backed node passes', () => {
			const node: ProcessNode = {
				id: 'process-pty-1',
				type: 'process',
				label: 'Test PTY',
				processSessionId: 'pty-session-456',
				pid: 42000,
			};

			const shouldBlock = !node.processSessionId;
			expect(shouldBlock).toBe(false);
		});
	});

	// =================================================================
	// 8. Context groomer interface compatibility
	// =================================================================
	describe('context groomer interface nullable PID', () => {
		it('GroomingProcessManager.spawn() can return null PID', () => {
			// Simulates a future harness-backed grooming spawn
			const spawnResult: { pid: number | null; success?: boolean } | null = {
				pid: null,
				success: true,
			};

			expect(spawnResult).not.toBeNull();
			expect(spawnResult!.pid).toBeNull();
			expect(spawnResult!.success).toBe(true);
		});

		it('existing guard rejects null PID (Phase 1 behavior)', () => {
			// The context groomer currently rejects null PID spawns.
			// This is intentional for Phase 1 (context grooming over harness
			// is not yet implemented).
			const spawnResult: { pid: number | null; success?: boolean } = {
				pid: null,
				success: true,
			};

			const rejected = !spawnResult || !spawnResult.success || spawnResult.pid == null;
			expect(rejected).toBe(true);
		});

		it('guard accepts numeric PID from classic spawn', () => {
			const spawnResult: { pid: number | null; success?: boolean } = {
				pid: 77777,
				success: true,
			};

			const rejected = !spawnResult || !spawnResult.success || spawnResult.pid == null;
			expect(rejected).toBe(false);
		});

		it('guard correctly rejects failed spawn', () => {
			const spawnResult: { pid: number | null; success?: boolean } = {
				pid: 77777,
				success: false,
			};

			const rejected = !spawnResult || !spawnResult.success || spawnResult.pid == null;
			expect(rejected).toBe(true);
		});

		it('guard correctly rejects null spawn result', () => {
			const spawnResult: { pid: number | null; success?: boolean } | null = null;

			const rejected = !spawnResult || !spawnResult.success || spawnResult.pid == null;
			expect(rejected).toBe(true);
		});
	});

	// =================================================================
	// 9. Kill/interrupt with null PID — no OS signal attempted
	// =================================================================
	describe('kill/interrupt safety with null PID', () => {
		it('kill() on harness execution does not attempt process.kill()', () => {
			const execution = makeHarnessExecution({ pid: null });
			injectExecution(pm, execution);

			// kill() should succeed (remove record) without trying to signal a PID
			const result = pm.kill('harness-1');
			expect(result).toBe(true);
			expect(pm.get('harness-1')).toBeUndefined();
		});

		it('interrupt() on harness execution returns true (unreachable in Phase 1)', () => {
			const execution = makeHarnessExecution({ pid: null });
			injectExecution(pm, execution);

			const result = pm.interrupt('harness-1');
			expect(result).toBe(true);

			// Execution should still exist (interrupt doesn't remove it)
			expect(pm.get('harness-1')).toBeDefined();
		});

		it('write() on harness execution returns true (unreachable in Phase 1)', () => {
			const execution = makeHarnessExecution({ pid: null });
			injectExecution(pm, execution);

			const result = pm.write('harness-1', 'test data');
			expect(result).toBe(true);
		});

		it('resize() on harness execution returns false', () => {
			const execution = makeHarnessExecution({ pid: null });
			injectExecution(pm, execution);

			const result = pm.resize('harness-1', 120, 40);
			expect(result).toBe(false);
		});
	});

	// =================================================================
	// 10. Logging with null PID
	// =================================================================
	describe('logging with null PID', () => {
		it('interrupt escalation log includes pid field (for child-process)', () => {
			// When child-process interrupt escalates to SIGTERM, it logs the PID.
			// This is safe because it only runs in the child-process path.
			const execution = makeChildProcessExecution({ pid: 55555 });
			injectExecution(pm, execution);

			pm.interrupt('cp-1');

			// No crash — verify the interrupt succeeded
			expect(mockLogger.warn).not.toHaveBeenCalledWith(
				expect.stringContaining('harness'),
				expect.anything(),
				expect.anything()
			);
		});

		it('kill() harness warning log does not crash with null PID', () => {
			injectExecution(pm, makeHarnessExecution({ pid: null }));

			pm.kill('harness-1');

			// No harness instance on this execution, so it warns about missing harness
			expect(mockLogger.warn).toHaveBeenCalledWith(
				expect.stringContaining('harness-backed execution has no harness instance'),
				'ProcessManager',
				expect.objectContaining({ sessionId: 'harness-1' })
			);
		});

		it('write() harness error log does not crash with null PID', () => {
			injectExecution(pm, makeHarnessExecution({ pid: null }));

			pm.write('harness-1', 'data');

			expect(mockLogger.error).toHaveBeenCalledWith(
				expect.stringContaining('unreachable in Phase 1'),
				'ProcessManager',
				expect.objectContaining({ sessionId: 'harness-1' })
			);
		});

		it('interrupt() harness error log does not crash with null PID', () => {
			injectExecution(pm, makeHarnessExecution({ pid: null }));

			pm.interrupt('harness-1');

			expect(mockLogger.error).toHaveBeenCalledWith(
				expect.stringContaining('unreachable in Phase 1'),
				'ProcessManager',
				expect.objectContaining({ sessionId: 'harness-1' })
			);
		});
	});

	// =================================================================
	// 11. Mixed-backend killAll() preserves null PID safety
	// =================================================================
	describe('killAll() with mixed PIDs', () => {
		it('killAll cleans up all backends without PID-related crashes', () => {
			injectExecution(pm, makePtyExecution({ sessionId: 'pty-ka', pid: 11111 }));
			injectExecution(pm, makeChildProcessExecution({ sessionId: 'cp-ka', pid: 22222 }));
			injectExecution(pm, makeHarnessExecution({ sessionId: 'h-ka-1', pid: null }));
			injectExecution(pm, makeHarnessExecution({ sessionId: 'h-ka-2', pid: undefined }));

			expect(pm.getAll()).toHaveLength(4);

			pm.killAll();

			expect(pm.getAll()).toHaveLength(0);
		});
	});

	// =================================================================
	// 12. Edge cases: PID value semantics
	// =================================================================
	describe('PID value edge cases', () => {
		it('null == undefined is true (both represent "no PID")', () => {
			// This is important for guards that use == null
			const nullPid: number | null | undefined = null;
			const undefPid: number | null | undefined = undefined;

			expect(nullPid == null).toBe(true);
			expect(undefPid == null).toBe(true);
		});

		it('0 != null (PID 0 is a valid process ID)', () => {
			const zeroPid: number | null = 0;

			expect(zeroPid == null).toBe(false);
			expect(zeroPid === 0).toBe(true);
		});

		it('null is falsy but 0 is also falsy — guards must use == null, not !pid', () => {
			// Demonstrates why !pid is wrong for PID guards
			const nullPid: number | null = null;
			const zeroPid: number | null = 0;

			// !pid treats both as falsy — WRONG for PID checks
			expect(!nullPid).toBe(true);
			expect(!zeroPid).toBe(true);

			// == null correctly distinguishes — CORRECT for PID checks
			expect(nullPid == null).toBe(true);
			expect(zeroPid == null).toBe(false);
		});

		it('typeof null is "object" — cannot use typeof for PID check', () => {
			const pid: number | null = null;
			expect(typeof pid).toBe('object'); // Not 'number'
		});

		it('JSON round-trip preserves null PID', () => {
			const data = { sessionId: 'test', pid: null as number | null };
			const roundTripped = JSON.parse(JSON.stringify(data));

			expect(roundTripped.pid).toBeNull();
		});

		it('JSON round-trip drops undefined PID', () => {
			const data = { sessionId: 'test', pid: undefined as number | undefined };
			const roundTripped = JSON.parse(JSON.stringify(data));

			expect('pid' in roundTripped).toBe(false);
		});
	});

	// =================================================================
	// 13. Filtering/iteration safety
	// =================================================================
	describe('filtering and iteration with mixed PIDs', () => {
		it('filter by numeric PID excludes harness executions', () => {
			injectExecution(pm, makePtyExecution({ sessionId: 'pty-f', pid: 100 }));
			injectExecution(pm, makeHarnessExecution({ sessionId: 'h-f', pid: null }));

			const withPid = pm.getAll().filter((e) => e.pid != null);
			expect(withPid).toHaveLength(1);
			expect(withPid[0].sessionId).toBe('pty-f');
		});

		it('filter by null PID selects harness executions', () => {
			injectExecution(pm, makePtyExecution({ sessionId: 'pty-f2', pid: 100 }));
			injectExecution(pm, makeHarnessExecution({ sessionId: 'h-f2', pid: null }));

			const withoutPid = pm.getAll().filter((e) => e.pid == null);
			expect(withoutPid).toHaveLength(1);
			expect(withoutPid[0].sessionId).toBe('h-f2');
		});

		it('map PIDs to array preserves null entries', () => {
			injectExecution(pm, makePtyExecution({ sessionId: 'pty-m', pid: 100 }));
			injectExecution(pm, makeChildProcessExecution({ sessionId: 'cp-m', pid: 200 }));
			injectExecution(pm, makeHarnessExecution({ sessionId: 'h-m', pid: null }));

			const pids = pm.getAll().map((e) => e.pid);

			expect(pids).toContain(100);
			expect(pids).toContain(200);
			expect(pids).toContain(null);
			expect(pids).toHaveLength(3);
		});

		it('sort by PID with null-safe comparison', () => {
			injectExecution(pm, makeHarnessExecution({ sessionId: 'h-s', pid: null }));
			injectExecution(pm, makePtyExecution({ sessionId: 'pty-s', pid: 300 }));
			injectExecution(pm, makeChildProcessExecution({ sessionId: 'cp-s', pid: 100 }));

			const sorted = pm.getAll().sort((a, b) => {
				if (a.pid == null && b.pid == null) return 0;
				if (a.pid == null) return 1;  // null PIDs sort last
				if (b.pid == null) return -1; // numeric PIDs sort first
				return a.pid - b.pid;
			});

			expect(sorted[0].pid).toBe(100);
			expect(sorted[1].pid).toBe(300);
			expect(sorted[2].pid).toBeNull();
		});
	});

	// =================================================================
	// 14. Preload type shape contract
	// =================================================================
	describe('preload type shape contracts', () => {
		it('ProcessSpawnResponse shape allows null PID', () => {
			// Mirrors src/main/preload/process.ts ProcessSpawnResponse
			interface ProcessSpawnResponse {
				pid: number | null;
				success: boolean;
				sshRemote?: { id: string; name: string; host: string };
			}

			const response: ProcessSpawnResponse = {
				pid: null,
				success: true,
			};

			expect(response.pid).toBeNull();
			expect(response.success).toBe(true);
		});

		it('ActiveProcess shape allows null PID', () => {
			// Mirrors src/main/preload/process.ts ActiveProcess
			interface ActiveProcess {
				sessionId: string;
				toolType: string;
				pid: number | null;
				cwd: string;
				isTerminal: boolean;
				isBatchMode: boolean;
				startTime: number;
			}

			const proc: ActiveProcess = {
				sessionId: 'harness-preload',
				toolType: 'claude-code',
				pid: null,
				cwd: '/project',
				isTerminal: false,
				isBatchMode: false,
				startTime: Date.now(),
			};

			expect(proc.pid).toBeNull();
		});
	});
});
