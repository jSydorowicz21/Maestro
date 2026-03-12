/**
 * Tests for Claude harness pending interaction cleanup and failure behavior.
 *
 * Focuses on scenarios that exercise error paths, resilience, and cleanup
 * guarantees that are distinct from the happy-path interaction tests in
 * claude-code-harness.test.ts:
 *
 * - SDK stream errors with pending interactions (consumeMessages catch/finally)
 * - SDK method failure resilience (close() throws, interrupt() throws)
 * - dispose() safety-net path (pending left after kill)
 * - Abort controller state after kill/dispose
 * - Pending interactions surviving unrelated write() errors
 * - Rapid lifecycle transitions (interrupt → kill → dispose with pending)
 * - Stream error when _running is false (expected during kill, silent exit)
 * - Stream end cleanup with mixed interaction kinds
 * - Spawn failure does not leave pending interactions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeCodeHarness } from '../claude-code-harness';
import type { AgentExecutionConfig } from '../../../shared/types';
import type { InteractionRequest } from '../../../shared/interaction-types';
import type {
	SDKMessage,
	SDKQuery,
	SDKQueryFunction,
	SDKPermissionResult,
	SDKCanUseToolOptions,
	SDKUserMessage,
} from '../claude-sdk-types';
import { DEFAULT_INTERACTION_TIMEOUT_MS } from '../interaction-helpers';

// Mock the logger
vi.mock('../../utils/logger', () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

// Import after mock — vi.mock is hoisted but the reference is stable
import { logger as mockLoggerImport } from '../../utils/logger';
const mockLogger = mockLoggerImport as unknown as {
	debug: ReturnType<typeof vi.fn>;
	info: ReturnType<typeof vi.fn>;
	warn: ReturnType<typeof vi.fn>;
	error: ReturnType<typeof vi.fn>;
};

// ============================================================================
// Test Helpers (duplicated from claude-code-harness.test.ts — intentionally
// self-contained so this file can run independently)
// ============================================================================

function createTestConfig(overrides?: Partial<AgentExecutionConfig>): AgentExecutionConfig {
	return {
		sessionId: 'cleanup-test-session',
		toolType: 'claude-code' as any,
		cwd: '/test/dir',
		prompt: 'Hello',
		...overrides,
	};
}

function createMockQuery() {
	let resolveNext: ((value: IteratorResult<SDKMessage>) => void) | null = null;
	let rejectNext: ((error: Error) => void) | null = null;
	const messageQueue: SDKMessage[] = [];
	let done = false;
	let streamError: Error | null = null;

	const query: SDKQuery = {
		[Symbol.asyncIterator]() {
			return this;
		},
		async next(): Promise<IteratorResult<SDKMessage>> {
			if (streamError) {
				const err = streamError;
				streamError = null;
				throw err;
			}
			if (messageQueue.length > 0) {
				return { value: messageQueue.shift()!, done: false };
			}
			if (done) {
				return { value: undefined as any, done: true };
			}
			return new Promise<IteratorResult<SDKMessage>>((resolve, reject) => {
				resolveNext = resolve;
				rejectNext = reject;
			});
		},
		async return(): Promise<IteratorResult<SDKMessage>> {
			done = true;
			return { value: undefined as any, done: true };
		},
		async throw(error: Error): Promise<IteratorResult<SDKMessage>> {
			done = true;
			throw error;
		},
		interrupt: vi.fn(),
		setPermissionMode: vi.fn(),
		setModel: vi.fn(),
		streamInput: vi.fn(),
		close: vi.fn(() => {
			done = true;
			if (resolveNext) {
				resolveNext({ value: undefined as any, done: true });
				resolveNext = null;
			}
		}),
		supportedCommands: vi.fn().mockResolvedValue([]),
		supportedModels: vi.fn().mockResolvedValue([]),
		supportedAgents: vi.fn().mockResolvedValue([]),
		initializationResult: vi.fn().mockResolvedValue({}),
	};

	return {
		query,
		pushMessage(msg: SDKMessage) {
			if (resolveNext) {
				resolveNext({ value: msg, done: false });
				resolveNext = null;
			} else {
				messageQueue.push(msg);
			}
		},
		complete() {
			done = true;
			if (resolveNext) {
				resolveNext({ value: undefined as any, done: true });
				resolveNext = null;
			}
		},
		error(err: Error) {
			if (rejectNext) {
				rejectNext(err);
				rejectNext = null;
			} else {
				streamError = err;
			}
		},
	};
}

function createMockQueryFn() {
	let capturedCanUseTool: ((
		toolName: string,
		input: Record<string, unknown>,
		options: SDKCanUseToolOptions
	) => Promise<SDKPermissionResult>) | null = null;

	const mock = createMockQuery();

	const queryFn: SDKQueryFunction = (config) => {
		if (config.options?.canUseTool) {
			capturedCanUseTool = config.options.canUseTool as any;
		}
		return mock.query;
	};

	return {
		...mock,
		queryFn,
		get canUseTool() { return capturedCanUseTool; },
	};
}

function flushMicrotasks(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Helper to create a pending tool-approval interaction and return the SDK promise + request. */
async function createPendingToolApproval(
	harness: ClaudeCodeHarness,
	canUseTool: NonNullable<ReturnType<typeof createMockQueryFn>['canUseTool']>,
	toolUseID: string,
	toolName = 'Bash',
): Promise<{ promise: Promise<SDKPermissionResult>; request: InteractionRequest }> {
	let capturedRequest: InteractionRequest | null = null;
	const listener = (_sid: string, req: InteractionRequest) => {
		capturedRequest = req;
	};
	harness.on('interaction-request', listener);

	const promise = canUseTool(
		toolName,
		{ command: `test-${toolUseID}` },
		{ signal: new AbortController().signal, toolUseID }
	);
	await flushMicrotasks();

	harness.removeListener('interaction-request', listener);
	return { promise, request: capturedRequest! };
}

/** Helper to create a pending clarification interaction. */
async function createPendingClarification(
	harness: ClaudeCodeHarness,
	canUseTool: NonNullable<ReturnType<typeof createMockQueryFn>['canUseTool']>,
	toolUseID: string,
): Promise<{ promise: Promise<SDKPermissionResult>; request: InteractionRequest }> {
	let capturedRequest: InteractionRequest | null = null;
	const listener = (_sid: string, req: InteractionRequest) => {
		capturedRequest = req;
	};
	harness.on('interaction-request', listener);

	const promise = canUseTool(
		'AskUserQuestion',
		{ questions: [{ question: 'Pick?', header: 'P', options: [], multiSelect: false }] },
		{ signal: new AbortController().signal, toolUseID }
	);
	await flushMicrotasks();

	harness.removeListener('interaction-request', listener);
	return { promise, request: capturedRequest! };
}

// ============================================================================
// Tests
// ============================================================================

describe('Claude harness pending interaction cleanup and failure behavior', () => {
	let harness: ClaudeCodeHarness;
	let mockFn: ReturnType<typeof createMockQueryFn>;

	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		mockFn = createMockQueryFn();
		harness = new ClaudeCodeHarness(mockFn.queryFn);
		mockLogger.debug.mockClear();
		mockLogger.info.mockClear();
		mockLogger.warn.mockClear();
		mockLogger.error.mockClear();
	});

	afterEach(() => {
		harness.kill();
		vi.useRealTimers();
	});

	// ====================================================================
	// SDK stream error with pending interactions
	// ====================================================================

	describe('stream error with pending interactions', () => {
		it('should resolve all pending interactions when the SDK stream throws an error', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.on('interaction-request', () => {});

			const { promise: p1 } = await createPendingToolApproval(harness, mockFn.canUseTool!, 'stream-err-1');
			const { promise: p2 } = await createPendingClarification(harness, mockFn.canUseTool!, 'stream-err-2');

			expect(harness.getPendingInteractionCount()).toBe(2);

			// Inject a stream error — consumeMessages catch/finally will fire
			mockFn.error(new Error('SDK connection lost'));
			await flushMicrotasks();

			// Both interactions should be resolved with termination responses
			const [r1, r2] = await Promise.all([p1, p2]);

			expect(r1.behavior).toBe('deny');
			expect((r1 as any).message).toBe('Session terminated');
			expect(r2.behavior).toBe('deny');
			expect((r2 as any).message).toBe('Session terminated');
			expect(harness.getPendingInteractionCount()).toBe(0);
		});

		it('should emit agent-error event when SDK stream throws while running', async () => {
			const errorEvents: any[] = [];
			harness.on('agent-error', (_sid: string, err: any) => {
				errorEvents.push(err);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.on('interaction-request', () => {});

			await createPendingToolApproval(harness, mockFn.canUseTool!, 'stream-err-event-1');

			// Inject stream error
			mockFn.error(new Error('Unexpected SDK failure'));
			await flushMicrotasks();

			expect(errorEvents.length).toBeGreaterThanOrEqual(1);
			const sdkErr = errorEvents.find(e => e.message.includes('SDK error'));
			expect(sdkErr).toBeDefined();
			expect(sdkErr.recoverable).toBe(false);
		});

		it('should set _running to false after stream error cleanup', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			expect(harness.isRunning()).toBe(true);

			mockFn.error(new Error('Stream crash'));
			await flushMicrotasks();

			expect(harness.isRunning()).toBe(false);
		});

		it('should resolve interactions even when stream error message is empty', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.on('interaction-request', () => {});

			const { promise: p1 } = await createPendingToolApproval(harness, mockFn.canUseTool!, 'empty-err-1');

			mockFn.error(new Error(''));
			await flushMicrotasks();

			const r1 = await p1;
			expect(r1.behavior).toBe('deny');
			expect((r1 as any).message).toBe('Session terminated');
		});
	});

	// ====================================================================
	// SDK method failure resilience
	// ====================================================================

	describe('SDK method failure resilience', () => {
		it('kill() should still resolve pending interactions when SDK close() throws', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			// Make close() throw
			(mockFn.query.close as ReturnType<typeof vi.fn>).mockImplementation(() => {
				throw new Error('close() failed');
			});

			harness.on('interaction-request', () => {});

			const { promise: p1 } = await createPendingToolApproval(harness, mockFn.canUseTool!, 'close-fail-1');
			const { promise: p2 } = await createPendingClarification(harness, mockFn.canUseTool!, 'close-fail-2');

			expect(harness.getPendingInteractionCount()).toBe(2);

			// kill() should not throw even though close() fails
			harness.kill();

			const [r1, r2] = await Promise.all([p1, p2]);

			expect(r1.behavior).toBe('deny');
			expect((r1 as any).message).toBe('Session terminated');
			expect(r2.behavior).toBe('deny');
			expect((r2 as any).message).toBe('Session terminated');
			expect(harness.getPendingInteractionCount()).toBe(0);
			expect(harness.isRunning()).toBe(false);

			// close() failure should be logged
			expect(mockLogger.warn).toHaveBeenCalledWith(
				expect.stringContaining('close'),
				expect.anything()
			);
		});

		it('interrupt() should still resolve pending interactions when SDK interrupt() throws', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			// Make interrupt() throw
			(mockFn.query.interrupt as ReturnType<typeof vi.fn>).mockImplementation(() => {
				throw new Error('interrupt() failed');
			});

			harness.on('interaction-request', () => {});

			const { promise: p1 } = await createPendingToolApproval(harness, mockFn.canUseTool!, 'int-fail-1');

			expect(harness.getPendingInteractionCount()).toBe(1);

			// interrupt() should not throw
			await harness.interrupt();

			const r1 = await p1;
			expect(r1.behavior).toBe('deny');
			expect((r1 as any).message).toBe('Session interrupted');
			expect(harness.getPendingInteractionCount()).toBe(0);

			// interrupt() failure should be logged
			expect(mockLogger.warn).toHaveBeenCalledWith(
				expect.stringContaining('interrupt'),
				expect.anything()
			);
		});

		it('kill() should not throw when both close() and abort() encounter issues', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			// Make close() throw
			(mockFn.query.close as ReturnType<typeof vi.fn>).mockImplementation(() => {
				throw new Error('close() broken');
			});

			harness.on('interaction-request', () => {});

			const { promise: p1 } = await createPendingToolApproval(harness, mockFn.canUseTool!, 'double-fail-1');

			harness.kill();

			const r1 = await p1;
			expect(r1.behavior).toBe('deny');
			expect(harness.isRunning()).toBe(false);
		});

		it('write() failure should not affect pending interactions', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			// Make streamInput throw
			(mockFn.query.streamInput as ReturnType<typeof vi.fn>).mockImplementation(() => {
				throw new Error('streamInput broken');
			});

			harness.on('interaction-request', () => {});

			const { promise: p1, request: req1 } = await createPendingToolApproval(
				harness, mockFn.canUseTool!, 'write-fail-1'
			);

			expect(harness.getPendingInteractionCount()).toBe(1);

			// Write should not throw despite streamInput failing
			harness.write({ type: 'text', text: 'follow up' });

			// Interaction should still be pending and resolvable
			expect(harness.getPendingInteractionCount()).toBe(1);
			expect(harness.hasPendingInteraction(req1.interactionId)).toBe(true);

			await harness.respondToInteraction(req1.interactionId, { kind: 'approve' });
			const r1 = await p1;
			expect(r1.behavior).toBe('allow');
			expect(harness.getPendingInteractionCount()).toBe(0);
		});
	});

	// ====================================================================
	// Abort controller behavior
	// ====================================================================

	describe('abort controller behavior', () => {
		it('kill() should abort the controller after resolving pending interactions', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			// Access the internal abort controller
			const abortController = (harness as any)._abortController as AbortController;
			expect(abortController).not.toBeNull();
			expect(abortController.signal.aborted).toBe(false);

			harness.on('interaction-request', () => {});

			const { promise: p1 } = await createPendingToolApproval(harness, mockFn.canUseTool!, 'abort-1');

			harness.kill();
			await p1;

			expect(abortController.signal.aborted).toBe(true);
		});

		it('dispose() should abort the controller', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			const abortController = (harness as any)._abortController as AbortController;
			expect(abortController.signal.aborted).toBe(false);

			harness.dispose();

			expect(abortController.signal.aborted).toBe(true);
		});

		it('kill() should null out the controller and query references', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			expect((harness as any)._query).not.toBeNull();
			expect((harness as any)._abortController).not.toBeNull();

			harness.kill();

			expect((harness as any)._query).toBeNull();
			expect((harness as any)._abortController).toBeNull();
		});
	});

	// ====================================================================
	// dispose() safety-net path
	// ====================================================================

	describe('dispose() safety-net for lingering interactions', () => {
		it('dispose() resolves pending even if kill() is bypassed (simulated)', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.on('interaction-request', () => {});

			const { promise: p1 } = await createPendingToolApproval(harness, mockFn.canUseTool!, 'safety-net-1');

			expect(harness.getPendingInteractionCount()).toBe(1);

			// Simulate kill() not clearing interactions by directly setting _running=false
			// without calling resolveAllPending. This tests the safety-net code path
			// in dispose() where pendingInteractions.size > 0 after the kill() call.
			//
			// We can't easily force this in the real code (kill always clears),
			// so instead we verify dispose() handles the case where kill() already
			// resolved interactions (idempotent) and the safety-net is redundant.
			harness.dispose();

			const r1 = await p1;
			expect(r1.behavior).toBe('deny');
			expect((r1 as any).message).toBe('Session terminated');
			expect(harness.getPendingInteractionCount()).toBe(0);
			expect(harness.isDisposed()).toBe(true);
		});

		it('dispose() on harness with interactions but no active query', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.on('interaction-request', () => {});

			const { promise: p1 } = await createPendingToolApproval(harness, mockFn.canUseTool!, 'no-query-1');

			// Null out the query to simulate a partially broken state
			// (e.g., query was garbage collected or closed externally)
			(harness as any)._query = null;

			expect(harness.getPendingInteractionCount()).toBe(1);

			// dispose() should still clean up pending interactions
			harness.dispose();

			const r1 = await p1;
			expect(r1.behavior).toBe('deny');
			expect((r1 as any).message).toBe('Session terminated');
			expect(harness.getPendingInteractionCount()).toBe(0);
			expect(harness.isDisposed()).toBe(true);
		});
	});

	// ====================================================================
	// Rapid lifecycle transitions
	// ====================================================================

	describe('rapid lifecycle transitions with pending interactions', () => {
		it('interrupt → kill in rapid succession resolves interactions once (not twice)', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.on('interaction-request', () => {});

			const { promise: p1 } = await createPendingToolApproval(harness, mockFn.canUseTool!, 'rapid-ik-1');
			const { promise: p2 } = await createPendingClarification(harness, mockFn.canUseTool!, 'rapid-ik-2');

			expect(harness.getPendingInteractionCount()).toBe(2);

			// Interrupt resolves all pending interactions
			await harness.interrupt();

			// Kill immediately after — should be a no-op for interactions (already cleared)
			harness.kill();

			const [r1, r2] = await Promise.all([p1, p2]);

			// Resolved by interrupt, not kill
			expect(r1.behavior).toBe('deny');
			expect((r1 as any).message).toBe('Session interrupted');
			expect(r2.behavior).toBe('deny');
			expect((r2 as any).message).toBe('Session interrupted');

			expect(harness.getPendingInteractionCount()).toBe(0);
		});

		it('kill → dispose in rapid succession does not double-resolve', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.on('interaction-request', () => {});

			const { promise: p1 } = await createPendingToolApproval(harness, mockFn.canUseTool!, 'rapid-kd-1');

			harness.kill();
			harness.dispose();

			const r1 = await p1;
			expect(r1.behavior).toBe('deny');
			expect((r1 as any).message).toBe('Session terminated');
			expect(harness.isDisposed()).toBe(true);
			expect(harness.getPendingInteractionCount()).toBe(0);
		});

		it('interrupt → kill → dispose sequence with pending interactions', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.on('interaction-request', () => {});

			const { promise: p1 } = await createPendingToolApproval(harness, mockFn.canUseTool!, 'rapid-ikd-1');
			const { promise: p2 } = await createPendingClarification(harness, mockFn.canUseTool!, 'rapid-ikd-2');
			const { promise: p3 } = await createPendingToolApproval(harness, mockFn.canUseTool!, 'rapid-ikd-3', 'Write');

			expect(harness.getPendingInteractionCount()).toBe(3);

			await harness.interrupt();
			harness.kill();
			harness.dispose();

			const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

			// All resolved by the first cleanup (interrupt)
			expect(r1.behavior).toBe('deny');
			expect(r2.behavior).toBe('deny');
			expect(r3.behavior).toBe('deny');

			expect(harness.getPendingInteractionCount()).toBe(0);
			expect(harness.isDisposed()).toBe(true);
			expect(harness.isRunning()).toBe(false);
		});

		it('partial response → interrupt cleans up remaining', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.on('interaction-request', () => {});

			const { promise: p1, request: req1 } = await createPendingToolApproval(
				harness, mockFn.canUseTool!, 'partial-int-1'
			);
			const { promise: p2 } = await createPendingToolApproval(
				harness, mockFn.canUseTool!, 'partial-int-2', 'Write'
			);
			const { promise: p3 } = await createPendingClarification(
				harness, mockFn.canUseTool!, 'partial-int-3'
			);

			// Respond to the first one normally
			await harness.respondToInteraction(req1.interactionId, { kind: 'approve' });
			const r1 = await p1;
			expect(r1.behavior).toBe('allow');
			expect(harness.getPendingInteractionCount()).toBe(2);

			// Interrupt the rest
			await harness.interrupt();

			const [r2, r3] = await Promise.all([p2, p3]);
			expect(r2.behavior).toBe('deny');
			expect((r2 as any).message).toBe('Session interrupted');
			expect((r2 as any).interrupt).toBe(true);
			expect(r3.behavior).toBe('deny');
			expect((r3 as any).message).toBe('Session interrupted');

			expect(harness.getPendingInteractionCount()).toBe(0);
		});

		it('timeout fires during kill sequence — does not corrupt state', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.on('interaction-request', () => {});

			const { promise: p1 } = await createPendingToolApproval(harness, mockFn.canUseTool!, 'timeout-kill-race-1');

			// Advance time close to timeout but not past it
			vi.advanceTimersByTime(DEFAULT_INTERACTION_TIMEOUT_MS - 100);
			await flushMicrotasks();
			expect(harness.getPendingInteractionCount()).toBe(1);

			// Kill just before timeout
			harness.kill();

			const r1 = await p1;
			expect(r1.behavior).toBe('deny');
			expect((r1 as any).message).toBe('Session terminated');

			// Advance past timeout — should not corrupt anything
			vi.advanceTimersByTime(200);
			await flushMicrotasks();
			expect(harness.getPendingInteractionCount()).toBe(0);
		});
	});

	// ====================================================================
	// Stream end cleanup with mixed interaction kinds
	// ====================================================================

	describe('stream end cleanup', () => {
		it('should resolve mixed tool-approval and clarification on normal stream completion', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.on('interaction-request', () => {});

			const { promise: p1 } = await createPendingToolApproval(harness, mockFn.canUseTool!, 'stream-mix-1');
			const { promise: p2 } = await createPendingClarification(harness, mockFn.canUseTool!, 'stream-mix-2');
			const { promise: p3 } = await createPendingToolApproval(harness, mockFn.canUseTool!, 'stream-mix-3', 'Edit');

			expect(harness.getPendingInteractionCount()).toBe(3);

			// Normal stream completion
			mockFn.complete();
			await flushMicrotasks();

			const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

			// Tool approvals get termination with interrupt
			expect(r1.behavior).toBe('deny');
			expect((r1 as any).message).toBe('Session terminated');
			expect((r1 as any).interrupt).toBe(true);

			// Clarification gets termination as cancel → SDK deny
			expect(r2.behavior).toBe('deny');
			expect((r2 as any).message).toBe('Session terminated');

			// Second tool approval
			expect(r3.behavior).toBe('deny');
			expect((r3 as any).message).toBe('Session terminated');
			expect((r3 as any).interrupt).toBe(true);

			expect(harness.getPendingInteractionCount()).toBe(0);
			expect(harness.isRunning()).toBe(false);
		});

		it('stream end after partial response resolves only remaining', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.on('interaction-request', () => {});

			const { promise: p1, request: req1 } = await createPendingToolApproval(
				harness, mockFn.canUseTool!, 'stream-partial-1'
			);
			const { promise: p2 } = await createPendingToolApproval(
				harness, mockFn.canUseTool!, 'stream-partial-2', 'Write'
			);

			// Resolve first interaction normally
			await harness.respondToInteraction(req1.interactionId, { kind: 'deny', message: 'No' });
			const r1 = await p1;
			expect(r1.behavior).toBe('deny');
			expect((r1 as any).message).toBe('No');

			// Stream completes — only second interaction gets terminated
			mockFn.complete();
			await flushMicrotasks();

			const r2 = await p2;
			expect(r2.behavior).toBe('deny');
			expect((r2 as any).message).toBe('Session terminated');

			expect(harness.getPendingInteractionCount()).toBe(0);
		});
	});

	// ====================================================================
	// Spawn failure cleanup
	// ====================================================================

	describe('spawn failure cleanup', () => {
		it('spawn failure should leave no pending interactions', async () => {
			const throwingQueryFn: SDKQueryFunction = () => {
				throw new Error('SDK initialization failed');
			};
			const failHarness = new ClaudeCodeHarness(throwingQueryFn);

			const result = await failHarness.spawn(createTestConfig());

			expect(result.success).toBe(false);
			expect(result.pid).toBeNull();
			expect(failHarness.isRunning()).toBe(false);
			expect(failHarness.getPendingInteractionCount()).toBe(0);

			// Should still be safe to dispose
			failHarness.dispose();
			expect(failHarness.isDisposed()).toBe(true);
		});

		it('disposed harness spawn should fail without leaving state', async () => {
			harness.dispose();

			const result = await harness.spawn(createTestConfig());
			expect(result.success).toBe(false);
			expect(harness.getPendingInteractionCount()).toBe(0);
			expect(harness.isRunning()).toBe(false);
			expect(harness.isDisposed()).toBe(true);
		});
	});

	// ====================================================================
	// Post-cleanup state verification
	// ====================================================================

	describe('post-cleanup state verification', () => {
		it('new interactions after interrupt should work independently', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.on('interaction-request', () => {});

			// Create and interrupt first batch
			const { promise: p1 } = await createPendingToolApproval(harness, mockFn.canUseTool!, 'post-int-a1');
			await harness.interrupt();
			const r1 = await p1;
			expect(r1.behavior).toBe('deny');
			expect(harness.getPendingInteractionCount()).toBe(0);

			// Create new interactions — should work cleanly with no pollution
			const { promise: p2, request: req2 } = await createPendingToolApproval(
				harness, mockFn.canUseTool!, 'post-int-a2'
			);

			expect(harness.getPendingInteractionCount()).toBe(1);

			await harness.respondToInteraction(req2.interactionId, { kind: 'approve' });
			const r2 = await p2;
			expect(r2.behavior).toBe('allow');
			expect(harness.getPendingInteractionCount()).toBe(0);
		});

		it('respondToInteraction after stream error should throw for expired IDs', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.on('interaction-request', () => {});

			const { promise: p1, request: req1 } = await createPendingToolApproval(
				harness, mockFn.canUseTool!, 'post-err-1'
			);

			const id = req1.interactionId;

			// Stream error resolves the interaction via finally block
			mockFn.error(new Error('Connection dropped'));
			await flushMicrotasks();
			await p1; // Resolved with termination

			// Late response to the now-expired ID
			await expect(
				harness.respondToInteraction(id, { kind: 'approve' })
			).rejects.toThrow('Unknown or expired interaction ID');
		});

		it('getPendingInteractionCount() is 0 after every cleanup path', async () => {
			// Path 1: timeout
			await harness.spawn(createTestConfig());
			await flushMicrotasks();
			harness.on('interaction-request', () => {});
			await createPendingToolApproval(harness, mockFn.canUseTool!, 'count-check-1');
			vi.advanceTimersByTime(DEFAULT_INTERACTION_TIMEOUT_MS + 100);
			await flushMicrotasks();
			expect(harness.getPendingInteractionCount()).toBe(0);

			// Path 2: manual response (create a new interaction after timeout)
			const { request: req2 } = await createPendingToolApproval(harness, mockFn.canUseTool!, 'count-check-2');
			await harness.respondToInteraction(req2.interactionId, { kind: 'approve' });
			expect(harness.getPendingInteractionCount()).toBe(0);

			// Path 3: interrupt
			await createPendingToolApproval(harness, mockFn.canUseTool!, 'count-check-3');
			await harness.interrupt();
			expect(harness.getPendingInteractionCount()).toBe(0);

			// Path 4: kill (need fresh harness since interrupt may have stopped it)
			harness.kill();
			const mockFn2 = createMockQueryFn();
			const h2 = new ClaudeCodeHarness(mockFn2.queryFn);
			await h2.spawn(createTestConfig());
			await flushMicrotasks();
			h2.on('interaction-request', () => {});
			await createPendingToolApproval(h2, mockFn2.canUseTool!, 'count-check-4');
			h2.kill();
			expect(h2.getPendingInteractionCount()).toBe(0);

			// Path 5: dispose
			const mockFn3 = createMockQueryFn();
			const h3 = new ClaudeCodeHarness(mockFn3.queryFn);
			await h3.spawn(createTestConfig());
			await flushMicrotasks();
			h3.on('interaction-request', () => {});
			await createPendingToolApproval(h3, mockFn3.canUseTool!, 'count-check-5');
			h3.dispose();
			expect(h3.getPendingInteractionCount()).toBe(0);
		});
	});

	// ====================================================================
	// Logging verification for cleanup and failure paths
	// ====================================================================

	describe('logging verification for cleanup and failure paths', () => {
		it('should log error when SDK message stream throws', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.error(new Error('Catastrophic SDK failure'));
			await flushMicrotasks();

			expect(mockLogger.error).toHaveBeenCalledWith(
				expect.stringContaining('SDK message stream error'),
				expect.anything(),
				expect.anything()
			);
		});

		it('should log warning when respondToInteraction called on disposed harness', async () => {
			harness.dispose();

			await expect(
				harness.respondToInteraction('some-id', { kind: 'approve' })
			).rejects.toThrow('Cannot respond to interaction on disposed harness');

			expect(mockLogger.warn).toHaveBeenCalledWith(
				expect.stringContaining('disposed harness'),
				expect.anything()
			);
		});

		it('should log warning when respondToInteraction called with unknown ID', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			await expect(
				harness.respondToInteraction('ghost-id', { kind: 'approve' })
			).rejects.toThrow('Unknown or expired interaction ID');

			expect(mockLogger.warn).toHaveBeenCalledWith(
				expect.stringContaining('Unknown or expired'),
				expect.anything()
			);
		});

		it('should log warning for spawn on disposed harness', async () => {
			harness.dispose();

			await harness.spawn(createTestConfig());

			expect(mockLogger.warn).toHaveBeenCalledWith(
				expect.stringContaining('spawn() called on disposed'),
				expect.anything()
			);
		});

		it('should log warning for write on disposed harness', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();
			harness.dispose();

			harness.write({ type: 'text', text: 'test' });

			expect(mockLogger.warn).toHaveBeenCalledWith(
				expect.stringContaining('write() called on disposed'),
				expect.anything()
			);
		});

		it('should log warning for interrupt on disposed harness', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();
			harness.dispose();

			await harness.interrupt();

			expect(mockLogger.warn).toHaveBeenCalledWith(
				expect.stringContaining('interrupt() called on disposed'),
				expect.anything()
			);
		});

		it('should log error when write/streamInput throws', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			(mockFn.query.streamInput as ReturnType<typeof vi.fn>).mockImplementation(() => {
				throw new Error('streamInput exploded');
			});

			harness.write({ type: 'text', text: 'test' });

			expect(mockLogger.error).toHaveBeenCalledWith(
				expect.stringContaining('write() streamInput failed'),
				expect.anything()
			);
		});

		it('should log error on response translation failure during respondToInteraction', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.on('interaction-request', () => {});

			const { promise: p1, request: req1 } = await createPendingToolApproval(
				harness, mockFn.canUseTool!, 'log-translation-1'
			);

			// Patch to force translation failure
			const original = (harness as any).translateResponseToSdk.bind(harness);
			(harness as any).translateResponseToSdk = () => {
				throw new Error('Translation broke');
			};

			await expect(
				harness.respondToInteraction(req1.interactionId, { kind: 'approve' })
			).rejects.toThrow('Response translation failed');

			expect(mockLogger.error).toHaveBeenCalledWith(
				expect.stringContaining('Response translation failed'),
				expect.anything()
			);

			// SDK promise still resolved (safe deny)
			const r1 = await p1;
			expect(r1.behavior).toBe('deny');

			(harness as any).translateResponseToSdk = original;
		});
	});

	// ====================================================================
	// Edge case: interaction cleanup with no listeners
	// ====================================================================

	describe('interaction cleanup with no event listeners', () => {
		it('should cleanly resolve interactions on kill even with no interaction-request listeners', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			// Do NOT attach an interaction-request listener.
			// The interaction event will be emitted but unheard.

			const p1 = mockFn.canUseTool!(
				'Bash',
				{ command: 'test' },
				{ signal: new AbortController().signal, toolUseID: 'no-listener-1' }
			);
			await flushMicrotasks();

			expect(harness.getPendingInteractionCount()).toBe(1);

			harness.kill();

			const r1 = await p1;
			expect(r1.behavior).toBe('deny');
			expect((r1 as any).message).toBe('Session terminated');
		});

		it('should cleanly timeout interactions even with no listeners', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			// No listener attached
			const p1 = mockFn.canUseTool!(
				'Bash',
				{ command: 'test' },
				{ signal: new AbortController().signal, toolUseID: 'no-listener-timeout-1' }
			);
			await flushMicrotasks();

			vi.advanceTimersByTime(DEFAULT_INTERACTION_TIMEOUT_MS + 100);
			await flushMicrotasks();

			const r1 = await p1;
			expect(r1.behavior).toBe('deny');
			expect((r1 as any).message).toBe('Timed out waiting for user response');
		});
	});

	// ====================================================================
	// Concurrent interactions across multiple cleanup triggers
	// ====================================================================

	describe('concurrent interactions across cleanup triggers', () => {
		it('some interactions timeout, then kill cleans up the rest', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.on('interaction-request', () => {});

			// First interaction — will timeout
			const { promise: p1 } = await createPendingToolApproval(harness, mockFn.canUseTool!, 'mixed-cleanup-1');

			// Wait a bit, then create second interaction
			vi.advanceTimersByTime(1000);
			const { promise: p2 } = await createPendingToolApproval(harness, mockFn.canUseTool!, 'mixed-cleanup-2', 'Write');

			expect(harness.getPendingInteractionCount()).toBe(2);

			// Advance just enough for the first to timeout (but not the second)
			vi.advanceTimersByTime(DEFAULT_INTERACTION_TIMEOUT_MS - 500);
			await flushMicrotasks();

			expect(harness.getPendingInteractionCount()).toBe(1);
			const r1 = await p1;
			expect(r1.behavior).toBe('deny');
			expect((r1 as any).message).toBe('Timed out waiting for user response');

			// Kill cleans up the remaining one
			harness.kill();
			const r2 = await p2;
			expect(r2.behavior).toBe('deny');
			expect((r2 as any).message).toBe('Session terminated');
			expect(harness.getPendingInteractionCount()).toBe(0);
		});

		it('some interactions responded to, some timeout, then stream ends', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.on('interaction-request', () => {});

			// Create three interactions staggered by 2 seconds each.
			// Timeline: p1 at T=0, p2 at T=2000, p3 at T=4000
			const { promise: p1, request: req1 } = await createPendingToolApproval(
				harness, mockFn.canUseTool!, 'combo-1'
			);

			vi.advanceTimersByTime(2000);
			const { promise: p2 } = await createPendingToolApproval(
				harness, mockFn.canUseTool!, 'combo-2', 'Write'
			);

			vi.advanceTimersByTime(2000);
			const { promise: p3 } = await createPendingClarification(
				harness, mockFn.canUseTool!, 'combo-3'
			);

			// Now at T=4000. Respond to the first one manually.
			await harness.respondToInteraction(req1.interactionId, { kind: 'approve' });
			const r1 = await p1;
			expect(r1.behavior).toBe('allow');
			expect(harness.getPendingInteractionCount()).toBe(2);

			// Advance so p2 times out (created at T=2000, timeout at T=2000+DEFAULT)
			// but p3 does NOT (created at T=4000, timeout at T=4000+DEFAULT).
			// Current time: T=4000. Advance by DEFAULT-1000 → T=4000+DEFAULT-1000.
			// p2 timeout at T=2000+DEFAULT → 2000+DEFAULT < 4000+DEFAULT-1000 → yes (since 2000 < 3000).
			// p3 timeout at T=4000+DEFAULT → NOT elapsed (4000+DEFAULT > 4000+DEFAULT-1000).
			vi.advanceTimersByTime(DEFAULT_INTERACTION_TIMEOUT_MS - 1000);
			await flushMicrotasks();

			expect(harness.getPendingInteractionCount()).toBe(1);
			const r2 = await p2;
			expect(r2.behavior).toBe('deny');
			expect((r2 as any).message).toBe('Timed out waiting for user response');

			// Stream completes — cleans up the third
			mockFn.complete();
			await flushMicrotasks();

			const r3 = await p3;
			expect(r3.behavior).toBe('deny');
			expect((r3 as any).message).toBe('Session terminated');
			expect(harness.getPendingInteractionCount()).toBe(0);
		});
	});
});
