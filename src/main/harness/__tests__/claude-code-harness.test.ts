/**
 * Tests for ClaudeCodeHarness.
 *
 * Covers:
 * - Spawn with streaming input mode
 * - Pending interaction storage, timeout, and response resolution
 * - Invalid interaction IDs and cleanup on kill/interrupt
 * - Tool approval → interaction-request event mapping
 * - AskUserQuestion → clarification interaction-request event mapping
 * - InteractionResponse → SDK PermissionResult translation
 * - SDK message → harness event mapping (system, assistant, result, etc.)
 * - Runtime metadata emission
 * - Deterministic cleanup on timeout, interrupt, kill, and disposal
 * - Runtime settings updates (permission mode, model)
 * - Capabilities reporting
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeCodeHarness } from '../claude-code-harness';
import type { AgentExecutionConfig } from '../../../shared/types';
import type { InteractionRequest, ToolApprovalRequest, ClarificationRequest } from '../../../shared/interaction-types';
import type { RuntimeMetadataEvent } from '../../../shared/runtime-metadata-types';
import type { SDKMessage, SDKQuery, SDKQueryFunction, SDKPermissionResult, SDKCanUseToolOptions, SDKUserMessage } from '../claude-sdk-types';
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

// ============================================================================
// Test Helpers
// ============================================================================

/** Minimal config for spawning */
function createTestConfig(overrides?: Partial<AgentExecutionConfig>): AgentExecutionConfig {
	return {
		sessionId: 'test-session-1',
		toolType: 'claude-code' as any,
		cwd: '/test/dir',
		prompt: 'Hello Claude',
		...overrides,
	};
}

/**
 * Create a controllable mock SDK query object.
 *
 * Returns:
 * - query: The mock SDKQuery object
 * - pushMessage: Push a message into the async generator
 * - complete: Signal the generator is done
 * - error: Signal an error in the generator
 * - canUseToolFn: Captured canUseTool callback for testing interactions
 */
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

/**
 * Create a mock query function that captures the canUseTool callback
 * and returns a controllable query.
 */
function createMockQueryFn() {
	let capturedCanUseTool: ((
		toolName: string,
		input: Record<string, unknown>,
		options: SDKCanUseToolOptions
	) => Promise<SDKPermissionResult>) | null = null;
	let capturedPrompt: AsyncIterable<SDKUserMessage> | string | null = null;

	const mock = createMockQuery();

	const queryFn: SDKQueryFunction = (config) => {
		if (config.options?.canUseTool) {
			capturedCanUseTool = config.options.canUseTool as any;
		}
		capturedPrompt = config.prompt;
		return mock.query;
	};

	return {
		...mock,
		queryFn,
		get canUseTool() { return capturedCanUseTool; },
		get capturedPrompt() { return capturedPrompt; },
	};
}

/** Wait for microtasks to flush */
function flushMicrotasks(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

// ============================================================================
// Tests
// ============================================================================

describe('ClaudeCodeHarness', () => {
	let harness: ClaudeCodeHarness;
	let mockFn: ReturnType<typeof createMockQueryFn>;

	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		mockFn = createMockQueryFn();
		harness = new ClaudeCodeHarness(mockFn.queryFn);
	});

	afterEach(() => {
		harness.kill();
		vi.useRealTimers();
	});

	// ====================================================================
	// Spawn & Streaming Input Mode
	// ====================================================================

	describe('spawn', () => {
		it('should spawn successfully with streaming input mode', async () => {
			const result = await harness.spawn(createTestConfig());

			expect(result.success).toBe(true);
			expect(result.pid).toBeNull();
			expect(harness.isRunning()).toBe(true);
		});

		it('should use AsyncIterable prompt (streaming mode) not string', async () => {
			await harness.spawn(createTestConfig());

			// The prompt should be an AsyncIterable, not a string
			expect(typeof mockFn.capturedPrompt).not.toBe('string');
			expect(mockFn.capturedPrompt).toBeDefined();
		});

		it('should fail if already running', async () => {
			await harness.spawn(createTestConfig());
			const result = await harness.spawn(createTestConfig());

			expect(result.success).toBe(false);
		});

		it('should pass config fields to SDK options', async () => {
			const config = createTestConfig({
				modelId: 'claude-opus-4-6',
				systemPrompt: 'Be helpful',
				maxTurns: 10,
				permissionMode: 'acceptEdits',
				customEnvVars: { FOO: 'bar' },
				resumeSessionId: 'resume-123',
			});

			const capturedOptions: Record<string, unknown>[] = [];
			const queryFn: SDKQueryFunction = (cfg) => {
				capturedOptions.push(cfg.options || {});
				return mockFn.query;
			};

			const h = new ClaudeCodeHarness(queryFn);
			await h.spawn(config);

			const opts = capturedOptions[0];
			expect(opts.model).toBe('claude-opus-4-6');
			expect(opts.systemPrompt).toBe('Be helpful');
			expect(opts.maxTurns).toBe(10);
			expect(opts.permissionMode).toBe('acceptEdits');
			expect(opts.resume).toBe('resume-123');

			h.kill();
		});

		it('should pass Claude-specific provider options', async () => {
			const config = createTestConfig({
				providerOptions: {
					effort: 'max',
					allowedTools: ['Bash', 'Read'],
					maxBudgetUsd: 5.0,
					enableFileCheckpointing: true,
				},
			});

			const capturedOptions: Record<string, unknown>[] = [];
			const queryFn: SDKQueryFunction = (cfg) => {
				capturedOptions.push(cfg.options || {});
				return mockFn.query;
			};

			const h = new ClaudeCodeHarness(queryFn);
			await h.spawn(config);

			const opts = capturedOptions[0];
			expect(opts.effort).toBe('max');
			expect(opts.allowedTools).toEqual(['Bash', 'Read']);
			expect(opts.maxBudgetUsd).toBe(5.0);
			expect(opts.enableFileCheckpointing).toBe(true);

			h.kill();
		});
	});

	// ====================================================================
	// Capabilities
	// ====================================================================

	describe('getCapabilities', () => {
		it('should report all Claude capabilities as true', () => {
			const caps = harness.getCapabilities();

			expect(caps.supportsMidTurnInput).toBe(true);
			expect(caps.supportsInteractionRequests).toBe(true);
			expect(caps.supportsRuntimePermissionUpdates).toBe(true);
			expect(caps.supportsRuntimeModelChange).toBe(true);
			expect(caps.supportsRuntimeEffortChange).toBe(true);
			expect(caps.supportsSkillsEnumeration).toBe(true);
			expect(caps.supportsRuntimeSlashCommands).toBe(true);
			expect(caps.supportsFileCheckpointing).toBe(true);
			expect(caps.supportsStructuredOutput).toBe(true);
			expect(caps.supportsBudgetLimits).toBe(true);
			expect(caps.supportsContextCompaction).toBe(true);
			expect(caps.supportsSessionFork).toBe(true);
		});

		it('should report supportsPersistentStdin as false (N/A for in-process)', () => {
			expect(harness.getCapabilities().supportsPersistentStdin).toBe(false);
		});
	});

	// ====================================================================
	// Pending Interactions — Tool Approval
	// ====================================================================

	describe('pending interactions — tool approval', () => {
		it('should emit interaction-request when canUseTool is called', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			const events: InteractionRequest[] = [];
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				events.push(req);
			});

			// Simulate SDK calling canUseTool
			expect(mockFn.canUseTool).not.toBeNull();
			const resultPromise = mockFn.canUseTool!(
				'Bash',
				{ command: 'ls -la' },
				{
					signal: new AbortController().signal,
					toolUseID: 'tool-use-1',
					decisionReason: 'Needs approval',
					blockedPath: '/test/file.ts',
					suggestions: [{ type: 'allow' }],
				}
			);

			await flushMicrotasks();

			expect(events).toHaveLength(1);
			const req = events[0] as ToolApprovalRequest;
			expect(req.kind).toBe('tool-approval');
			expect(req.toolName).toBe('Bash');
			expect(req.toolInput).toEqual({ command: 'ls -la' });
			expect(req.toolUseId).toBe('tool-use-1');
			expect(req.decisionReason).toBe('Needs approval');
			expect(req.blockedPath).toBe('/test/file.ts');
			expect(req.suggestedPermissions).toEqual([{ type: 'allow' }]);
			expect(req.sessionId).toBe('test-session-1');
			expect(req.agentId).toBe('claude-code');
			expect(req.interactionId).toBeDefined();
			expect(req.timeoutMs).toBe(DEFAULT_INTERACTION_TIMEOUT_MS);

			// Resolve it to clean up
			await harness.respondToInteraction(req.interactionId, { kind: 'approve' });
			await resultPromise;
		});

		it('should resolve SDK promise when respondToInteraction is called with approve', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			let capturedRequest: InteractionRequest | null = null;
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				capturedRequest = req;
			});

			const resultPromise = mockFn.canUseTool!(
				'Edit',
				{ file: 'test.ts' },
				{ signal: new AbortController().signal, toolUseID: 'tool-use-2' }
			);

			await flushMicrotasks();
			expect(capturedRequest).not.toBeNull();

			await harness.respondToInteraction(capturedRequest!.interactionId, {
				kind: 'approve',
				updatedInput: { file: 'test.ts', approved: true },
				updatedPermissions: [{ tool: 'Edit', scope: 'always' }],
			});

			const result = await resultPromise;
			expect(result.behavior).toBe('allow');
			expect((result as any).updatedInput).toEqual({ file: 'test.ts', approved: true });
			expect((result as any).updatedPermissions).toEqual([{ tool: 'Edit', scope: 'always' }]);
		});

		it('should resolve SDK promise when respondToInteraction is called with deny', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			let capturedRequest: InteractionRequest | null = null;
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				capturedRequest = req;
			});

			const resultPromise = mockFn.canUseTool!(
				'Bash',
				{ command: 'rm -rf /' },
				{ signal: new AbortController().signal, toolUseID: 'tool-use-3' }
			);

			await flushMicrotasks();

			await harness.respondToInteraction(capturedRequest!.interactionId, {
				kind: 'deny',
				message: 'Too dangerous',
				interrupt: true,
			});

			const result = await resultPromise;
			expect(result.behavior).toBe('deny');
			expect((result as any).message).toBe('Too dangerous');
			expect((result as any).interrupt).toBe(true);
		});

		it('should resolve SDK promise when respondToInteraction is called with cancel', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			let capturedRequest: InteractionRequest | null = null;
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				capturedRequest = req;
			});

			const resultPromise = mockFn.canUseTool!(
				'Bash',
				{ command: 'echo hi' },
				{ signal: new AbortController().signal, toolUseID: 'tool-use-4' }
			);

			await flushMicrotasks();

			await harness.respondToInteraction(capturedRequest!.interactionId, {
				kind: 'cancel',
				message: 'User cancelled',
			});

			const result = await resultPromise;
			expect(result.behavior).toBe('deny');
			expect((result as any).message).toBe('User cancelled');
		});

		it('should track pending interaction count', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			expect(harness.getPendingInteractionCount()).toBe(0);

			let capturedRequest: InteractionRequest | null = null;
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				capturedRequest = req;
			});

			const resultPromise = mockFn.canUseTool!(
				'Read',
				{ path: '/test' },
				{ signal: new AbortController().signal, toolUseID: 'tool-use-5' }
			);
			await flushMicrotasks();

			expect(harness.getPendingInteractionCount()).toBe(1);
			expect(harness.hasPendingInteraction(capturedRequest!.interactionId)).toBe(true);

			await harness.respondToInteraction(capturedRequest!.interactionId, { kind: 'approve' });
			await resultPromise;

			expect(harness.getPendingInteractionCount()).toBe(0);
			expect(harness.hasPendingInteraction(capturedRequest!.interactionId)).toBe(false);
		});
	});

	// ====================================================================
	// Pending Interactions — AskUserQuestion (Clarification)
	// ====================================================================

	describe('pending interactions — clarification', () => {
		it('should emit clarification interaction-request for AskUserQuestion', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			const events: InteractionRequest[] = [];
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				events.push(req);
			});

			const resultPromise = mockFn.canUseTool!(
				'AskUserQuestion',
				{
					questions: [{
						question: 'Which framework?',
						header: 'Framework',
						options: [
							{ label: 'React', description: 'React.js' },
							{ label: 'Vue', description: 'Vue.js' },
						],
						multiSelect: false,
					}],
				},
				{ signal: new AbortController().signal, toolUseID: 'ask-1' }
			);

			await flushMicrotasks();

			expect(events).toHaveLength(1);
			const req = events[0] as ClarificationRequest;
			expect(req.kind).toBe('clarification');
			expect(req.questions).toHaveLength(1);
			expect(req.questions[0].question).toBe('Which framework?');
			expect(req.questions[0].header).toBe('Framework');
			expect(req.questions[0].options).toHaveLength(2);
			expect(req.questions[0].options[0].label).toBe('React');
			expect(req.allowFreeText).toBe(true);

			// Respond with structured answer
			await harness.respondToInteraction(req.interactionId, {
				kind: 'clarification-answer',
				answers: [{ questionIndex: 0, selectedOptionLabels: ['React'] }],
			});

			const result = await resultPromise;
			expect(result.behavior).toBe('allow');
			const input = (result as any).updatedInput;
			expect(input.answers).toEqual({ 'Which framework?': 'React' });
			expect(input.questions).toBeDefined();
		});

		it('should handle clarification answers with free text', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			let capturedRequest: InteractionRequest | null = null;
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				capturedRequest = req;
			});

			const resultPromise = mockFn.canUseTool!(
				'AskUserQuestion',
				{
					questions: [{
						question: 'What name?',
						header: 'Name',
						options: [],
						multiSelect: false,
					}],
				},
				{ signal: new AbortController().signal, toolUseID: 'ask-2' }
			);

			await flushMicrotasks();

			await harness.respondToInteraction(capturedRequest!.interactionId, {
				kind: 'clarification-answer',
				answers: [{ questionIndex: 0, text: 'MyComponent' }],
			});

			const result = await resultPromise;
			expect(result.behavior).toBe('allow');
			const input = (result as any).updatedInput;
			expect(input.answers).toEqual({ 'What name?': 'MyComponent' });
		});
	});

	// ====================================================================
	// Timeout Behavior
	// ====================================================================

	describe('timeout behavior', () => {
		it('should resolve tool approval to deny on timeout', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.on('interaction-request', () => {});

			const resultPromise = mockFn.canUseTool!(
				'Bash',
				{ command: 'test' },
				{ signal: new AbortController().signal, toolUseID: 'timeout-1' }
			);

			await flushMicrotasks();
			expect(harness.getPendingInteractionCount()).toBe(1);

			// Advance past the timeout
			vi.advanceTimersByTime(DEFAULT_INTERACTION_TIMEOUT_MS + 100);
			await flushMicrotasks();

			const result = await resultPromise;
			expect(result.behavior).toBe('deny');
			expect((result as any).message).toBe('Timed out waiting for user response');
			expect(harness.getPendingInteractionCount()).toBe(0);
		});

		it('should resolve clarification to cancel on timeout', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.on('interaction-request', () => {});

			const resultPromise = mockFn.canUseTool!(
				'AskUserQuestion',
				{ questions: [{ question: 'Test?', header: 'Q', options: [], multiSelect: false }] },
				{ signal: new AbortController().signal, toolUseID: 'timeout-2' }
			);

			await flushMicrotasks();

			vi.advanceTimersByTime(DEFAULT_INTERACTION_TIMEOUT_MS + 100);
			await flushMicrotasks();

			const result = await resultPromise;
			// Clarification timeout → cancel → SDK deny
			expect(result.behavior).toBe('deny');
			expect((result as any).message).toBe('Timed out waiting for user response');
		});

		it('should use DEFAULT_INTERACTION_TIMEOUT_MS when no custom timeout specified', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			let capturedRequest: InteractionRequest | null = null;
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				capturedRequest = req;
			});

			mockFn.canUseTool!(
				'Bash',
				{ command: 'test' },
				{ signal: new AbortController().signal, toolUseID: 'default-timeout-1' }
			);
			await flushMicrotasks();

			// The emitted request should carry the default timeout
			expect(capturedRequest).not.toBeNull();
			expect(capturedRequest!.timeoutMs).toBe(DEFAULT_INTERACTION_TIMEOUT_MS);

			// Interaction should still be pending before the default timeout
			vi.advanceTimersByTime(DEFAULT_INTERACTION_TIMEOUT_MS - 1000);
			await flushMicrotasks();
			expect(harness.getPendingInteractionCount()).toBe(1);

			// Should timeout after the default period
			vi.advanceTimersByTime(1100);
			await flushMicrotasks();
			expect(harness.getPendingInteractionCount()).toBe(0);
		});

		it('should not fire timeout if response arrives first', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			let capturedRequest: InteractionRequest | null = null;
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				capturedRequest = req;
			});

			const resultPromise = mockFn.canUseTool!(
				'Bash',
				{ command: 'test' },
				{ signal: new AbortController().signal, toolUseID: 'early-response-1' }
			);
			await flushMicrotasks();

			// Respond well before timeout
			await harness.respondToInteraction(capturedRequest!.interactionId, { kind: 'approve' });
			const result = await resultPromise;
			expect(result.behavior).toBe('allow');
			expect(harness.getPendingInteractionCount()).toBe(0);

			// Advance past the timeout — should NOT affect anything
			vi.advanceTimersByTime(DEFAULT_INTERACTION_TIMEOUT_MS + 1000);
			await flushMicrotasks();

			// No crash, no extra resolutions — count stays at 0
			expect(harness.getPendingInteractionCount()).toBe(0);
		});

		it('should handle multiple concurrent interactions timing out independently', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.on('interaction-request', () => {});

			// Create first interaction
			const p1 = mockFn.canUseTool!(
				'Bash',
				{ command: 'first' },
				{ signal: new AbortController().signal, toolUseID: 'multi-timeout-1' }
			);
			await flushMicrotasks();

			// Small delay then create second interaction
			vi.advanceTimersByTime(1000);

			const p2 = mockFn.canUseTool!(
				'Write',
				{ path: '/test.ts' },
				{ signal: new AbortController().signal, toolUseID: 'multi-timeout-2' }
			);
			await flushMicrotasks();

			expect(harness.getPendingInteractionCount()).toBe(2);

			// Advance to when first interaction should timeout (but not second)
			vi.advanceTimersByTime(DEFAULT_INTERACTION_TIMEOUT_MS - 500);
			await flushMicrotasks();

			// First should have timed out, second still pending
			expect(harness.getPendingInteractionCount()).toBe(1);

			const r1 = await p1;
			expect(r1.behavior).toBe('deny');
			expect((r1 as any).message).toBe('Timed out waiting for user response');

			// Advance to when second interaction should timeout
			vi.advanceTimersByTime(1500);
			await flushMicrotasks();

			expect(harness.getPendingInteractionCount()).toBe(0);

			const r2 = await p2;
			expect(r2.behavior).toBe('deny');
			expect((r2 as any).message).toBe('Timed out waiting for user response');
		});

		it('should not double-resolve if timeout fires after kill', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.on('interaction-request', () => {});

			const resultPromise = mockFn.canUseTool!(
				'Bash',
				{ command: 'test' },
				{ signal: new AbortController().signal, toolUseID: 'kill-then-timeout-1' }
			);
			await flushMicrotasks();

			// Kill resolves with termination response
			harness.kill();

			const result = await resultPromise;
			expect(result.behavior).toBe('deny');
			expect((result as any).message).toBe('Session terminated');

			// Advance past timeout — should not throw or re-resolve
			vi.advanceTimersByTime(DEFAULT_INTERACTION_TIMEOUT_MS + 1000);
			await flushMicrotasks();

			// No crash — interaction was already cleaned up
			expect(harness.getPendingInteractionCount()).toBe(0);
		});
	});

	// ====================================================================
	// Invalid / Expired Interactions
	// ====================================================================

	describe('invalid interaction handling', () => {
		it('should throw for unknown interaction IDs', async () => {
			await harness.spawn(createTestConfig());

			await expect(
				harness.respondToInteraction('nonexistent-id', { kind: 'approve' })
			).rejects.toThrow('Unknown or expired interaction ID: nonexistent-id');
		});

		it('should throw for expired (already responded) interaction IDs', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			let capturedRequest: InteractionRequest | null = null;
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				capturedRequest = req;
			});

			mockFn.canUseTool!(
				'Read',
				{ path: '/test' },
				{ signal: new AbortController().signal, toolUseID: 'expired-1' }
			);
			await flushMicrotasks();

			const id = capturedRequest!.interactionId;
			await harness.respondToInteraction(id, { kind: 'approve' });

			// Second response should fail
			await expect(
				harness.respondToInteraction(id, { kind: 'approve' })
			).rejects.toThrow('Unknown or expired interaction ID');
		});
	});

	// ====================================================================
	// Interrupt Cleanup
	// ====================================================================

	describe('interrupt', () => {
		it('should resolve all pending interactions with interrupt responses', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.on('interaction-request', () => {});

			// Create two pending interactions
			const p1 = mockFn.canUseTool!(
				'Bash',
				{ command: 'test1' },
				{ signal: new AbortController().signal, toolUseID: 'int-1' }
			);
			await flushMicrotasks();

			const p2 = mockFn.canUseTool!(
				'AskUserQuestion',
				{ questions: [{ question: 'Q?', header: 'Q', options: [], multiSelect: false }] },
				{ signal: new AbortController().signal, toolUseID: 'int-2' }
			);
			await flushMicrotasks();

			expect(harness.getPendingInteractionCount()).toBe(2);

			await harness.interrupt();

			const r1 = await p1;
			const r2 = await p2;

			// Tool approval → deny with interrupt
			expect(r1.behavior).toBe('deny');
			expect((r1 as any).message).toBe('Session interrupted');
			expect((r1 as any).interrupt).toBe(true);

			// Clarification → cancel → SDK deny
			expect(r2.behavior).toBe('deny');
			expect((r2 as any).message).toBe('Session interrupted');

			expect(harness.getPendingInteractionCount()).toBe(0);
		});

		it('should call SDK interrupt()', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			await harness.interrupt();

			expect(mockFn.query.interrupt).toHaveBeenCalledOnce();
		});
	});

	// ====================================================================
	// Kill Cleanup
	// ====================================================================

	describe('kill', () => {
		it('should resolve all pending interactions with termination responses', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.on('interaction-request', () => {});

			const p1 = mockFn.canUseTool!(
				'Write',
				{ path: '/test.ts', content: '// test' },
				{ signal: new AbortController().signal, toolUseID: 'kill-1' }
			);
			await flushMicrotasks();

			expect(harness.getPendingInteractionCount()).toBe(1);

			harness.kill();

			const r1 = await p1;
			expect(r1.behavior).toBe('deny');
			expect((r1 as any).message).toBe('Session terminated');
			expect((r1 as any).interrupt).toBe(true);

			expect(harness.getPendingInteractionCount()).toBe(0);
			expect(harness.isRunning()).toBe(false);
		});

		it('should call SDK close()', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.kill();

			expect(mockFn.query.close).toHaveBeenCalledOnce();
		});

		it('should be idempotent', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.kill();
			harness.kill(); // Should not throw

			expect(harness.isRunning()).toBe(false);
		});
	});

	// ====================================================================
	// SDK Message → Harness Event Mapping
	// ====================================================================

	describe('SDK message event mapping', () => {
		it('should emit session-id and runtime-metadata from system init message', async () => {
			const sessionIdEvents: string[] = [];
			const metadataEvents: RuntimeMetadataEvent[] = [];
			const slashCommandEvents: unknown[][] = [];

			harness.on('session-id', (_sid: string, agentSessionId: string) => {
				sessionIdEvents.push(agentSessionId);
			});
			harness.on('runtime-metadata', (_sid: string, meta: RuntimeMetadataEvent) => {
				metadataEvents.push(meta);
			});
			harness.on('slash-commands', (_sid: string, cmds: unknown[]) => {
				slashCommandEvents.push(cmds);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'system',
				subtype: 'init',
				session_id: 'claude-session-abc',
				slash_commands: [{ name: '/commit' }, { name: '/review' }],
				skills: [{ name: 'tdd', description: 'Test driven dev' }],
				agents: [{ name: 'code-reviewer', description: 'Reviews code' }],
			} as any);

			await flushMicrotasks();

			expect(sessionIdEvents).toContain('claude-session-abc');
			expect(slashCommandEvents).toHaveLength(1);

			expect(metadataEvents).toHaveLength(1);
			const meta = metadataEvents[0];
			expect(meta.replace).toBe(true);
			expect(meta.source).toBe('claude-code');
			expect(meta.skills).toHaveLength(1);
			expect(meta.skills![0]).toEqual({ id: 'tdd', name: 'tdd', description: 'Test driven dev' });
			expect(meta.slashCommands).toEqual(['/commit', '/review']);
			expect(meta.availableAgents).toHaveLength(1);
			expect(meta.availableAgents![0]).toEqual({ id: 'code-reviewer', label: 'Reviews code' });
			expect(meta.capabilities).toBeDefined();
		});

		it('should include current model from init message in runtime metadata', async () => {
			const metadataEvents: RuntimeMetadataEvent[] = [];
			harness.on('runtime-metadata', (_sid: string, meta: RuntimeMetadataEvent) => {
				metadataEvents.push(meta);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'system',
				subtype: 'init',
				session_id: 'claude-session-model',
				model: 'claude-opus-4-6',
			} as any);

			await flushMicrotasks();

			// The initial snapshot should include the current model
			const initMeta = metadataEvents.find((m) => m.replace === true);
			expect(initMeta).toBeDefined();
			expect(initMeta!.availableModels).toEqual([{ id: 'claude-opus-4-6' }]);
		});

		it('should emit incremental runtime-metadata with models from supportedModels() API', async () => {
			// Configure supportedModels to return a list
			(mockFn.query.supportedModels as ReturnType<typeof vi.fn>).mockResolvedValue([
				{ id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
				{ id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
				{ id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
			]);

			const metadataEvents: RuntimeMetadataEvent[] = [];
			harness.on('runtime-metadata', (_sid: string, meta: RuntimeMetadataEvent) => {
				metadataEvents.push(meta);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			// Push init message to trigger the supportedModels query
			mockFn.pushMessage({
				type: 'system',
				subtype: 'init',
				session_id: 'claude-session-models',
				model: 'claude-opus-4-6',
				skills: [],
			} as any);

			await flushMicrotasks();

			// Should have 2 metadata events: initial snapshot + incremental models
			expect(metadataEvents.length).toBeGreaterThanOrEqual(2);

			const initMeta = metadataEvents.find((m) => m.replace === true);
			expect(initMeta).toBeDefined();

			const incrementalMeta = metadataEvents.find((m) => m.replace === false);
			expect(incrementalMeta).toBeDefined();
			expect(incrementalMeta!.availableModels).toHaveLength(3);
			expect(incrementalMeta!.availableModels).toEqual([
				{ id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
				{ id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
				{ id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
			]);
		});

		it('should call supportedModels() on the SDK query after init', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'system',
				subtype: 'init',
				session_id: 'claude-session-api',
			} as any);

			await flushMicrotasks();

			expect(mockFn.query.supportedModels).toHaveBeenCalled();
		});

		it('should handle supportedModels() failure gracefully (non-critical)', async () => {
			(mockFn.query.supportedModels as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error('SDK not ready')
			);

			const metadataEvents: RuntimeMetadataEvent[] = [];
			harness.on('runtime-metadata', (_sid: string, meta: RuntimeMetadataEvent) => {
				metadataEvents.push(meta);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'system',
				subtype: 'init',
				session_id: 'claude-session-fail',
				skills: [{ name: 'test-skill', description: 'Test' }],
			} as any);

			await flushMicrotasks();

			// Initial snapshot should still be emitted despite supportedModels failure
			expect(metadataEvents).toHaveLength(1);
			expect(metadataEvents[0].replace).toBe(true);
			expect(metadataEvents[0].skills).toHaveLength(1);

			// Harness should still be running
			expect(harness.isRunning()).toBe(true);
		});

		it('should not emit incremental metadata when supportedModels() returns empty', async () => {
			(mockFn.query.supportedModels as ReturnType<typeof vi.fn>).mockResolvedValue([]);

			const metadataEvents: RuntimeMetadataEvent[] = [];
			harness.on('runtime-metadata', (_sid: string, meta: RuntimeMetadataEvent) => {
				metadataEvents.push(meta);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'system',
				subtype: 'init',
				session_id: 'claude-session-empty',
			} as any);

			await flushMicrotasks();

			// Only the initial snapshot, no incremental update
			expect(metadataEvents).toHaveLength(1);
			expect(metadataEvents[0].replace).toBe(true);
		});

		it('should emit data from assistant messages', async () => {
			const dataEvents: string[] = [];
			harness.on('data', (_sid: string, data: string) => {
				dataEvents.push(data);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'assistant',
				message: {
					content: [
						{ type: 'text', text: 'Hello world!' },
					],
				},
			} as any);

			await flushMicrotasks();

			expect(dataEvents).toContain('Hello world!');
		});

		it('should emit thinking-chunk from thinking blocks', async () => {
			const thinkingEvents: string[] = [];
			harness.on('thinking-chunk', (_sid: string, text: string) => {
				thinkingEvents.push(text);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'assistant',
				message: {
					content: [
						{ type: 'thinking', thinking: 'Let me analyze this...' },
					],
				},
			} as any);

			await flushMicrotasks();

			expect(thinkingEvents).toContain('Let me analyze this...');
		});

		it('should emit usage and exit from success result message', async () => {
			const usageEvents: any[] = [];
			const exitEvents: number[] = [];
			const queryCompleteEvents: any[] = [];

			harness.on('usage', (_sid: string, stats: any) => {
				usageEvents.push(stats);
			});
			harness.on('exit', (_sid: string, code: number) => {
				exitEvents.push(code);
			});
			harness.on('query-complete', (_sid: string, data: any) => {
				queryCompleteEvents.push(data);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'result',
				subtype: 'success',
				session_id: 'claude-session-abc',
				total_cost_usd: 0.05,
				usage: {
					input_tokens: 1000,
					output_tokens: 500,
					cache_read_input_tokens: 200,
					cache_creation_input_tokens: 100,
				},
				num_turns: 3,
				duration_ms: 15000,
			} as any);

			await flushMicrotasks();

			expect(usageEvents).toHaveLength(1);
			expect(usageEvents[0].inputTokens).toBe(1000);
			expect(usageEvents[0].outputTokens).toBe(500);
			expect(usageEvents[0].totalCostUsd).toBe(0.05);

			expect(queryCompleteEvents).toHaveLength(1);
			expect(queryCompleteEvents[0].duration).toBe(15000);

			expect(exitEvents).toContain(0);
		});

		it('should emit agent-error and exit code 1 from error result message', async () => {
			const errorEvents: any[] = [];
			const exitEvents: number[] = [];

			harness.on('agent-error', (_sid: string, err: any) => {
				errorEvents.push(err);
			});
			harness.on('exit', (_sid: string, code: number) => {
				exitEvents.push(code);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'result',
				subtype: 'error_max_turns',
				errors: [{ message: 'Max turns exceeded' }],
			} as any);

			await flushMicrotasks();

			expect(errorEvents).toHaveLength(1);
			expect(errorEvents[0].message).toBe('Max turns exceeded');

			expect(exitEvents).toContain(1);
		});

		it('should emit tool-execution from tool_use_summary', async () => {
			const toolEvents: any[] = [];
			harness.on('tool-execution', (_sid: string, tool: any) => {
				toolEvents.push(tool);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'tool_use_summary',
				tool_name: 'Bash',
				tool_use_id: 'tu-1',
				input: { command: 'ls' },
				output: 'file1.ts\nfile2.ts',
			} as any);

			await flushMicrotasks();

			expect(toolEvents).toHaveLength(1);
			expect(toolEvents[0].toolName).toBe('Bash');
		});

		it('should emit agent-error from rate_limit', async () => {
			const errorEvents: any[] = [];
			harness.on('agent-error', (_sid: string, err: any) => {
				errorEvents.push(err);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'rate_limit',
				message: 'Rate limited',
				retry_after_ms: 5000,
			} as any);

			await flushMicrotasks();

			expect(errorEvents).toHaveLength(1);
			expect(errorEvents[0].type).toBe('rate_limited');
			expect(errorEvents[0].recoverable).toBe(true);
		});

		it('should emit data from status messages', async () => {
			const dataEvents: string[] = [];
			harness.on('data', (_sid: string, data: string) => {
				dataEvents.push(data);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'status',
				message: 'Processing...',
			} as any);

			await flushMicrotasks();

			expect(dataEvents).toContain('Processing...');
		});

		it('should emit data from compact_boundary', async () => {
			const dataEvents: string[] = [];
			harness.on('data', (_sid: string, data: string) => {
				dataEvents.push(data);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({ type: 'compact_boundary' } as any);

			await flushMicrotasks();

			expect(dataEvents).toContain('[Context compacted]');
		});

		it('should emit agent-error from auth_status error', async () => {
			const errorEvents: any[] = [];
			harness.on('agent-error', (_sid: string, err: any) => {
				errorEvents.push(err);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'auth_status',
				status: 'expired',
				message: 'Token expired',
			} as any);

			await flushMicrotasks();

			expect(errorEvents).toHaveLength(1);
			expect(errorEvents[0].type).toBe('auth_expired');
			expect(errorEvents[0].message).toBe('Token expired');
		});

		it('should emit tool-execution with progress flag from tool_progress', async () => {
			const toolEvents: any[] = [];
			harness.on('tool-execution', (_sid: string, tool: any) => {
				toolEvents.push(tool);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'tool_progress',
				tool_use_id: 'tp-1',
				tool_name: 'Bash',
				content: 'Running npm install...',
			} as any);

			await flushMicrotasks();

			expect(toolEvents).toHaveLength(1);
			expect(toolEvents[0].toolName).toBe('Bash');
			expect(toolEvents[0].state.progress).toBe(true);
			expect(toolEvents[0].state.content).toBe('Running npm install...');
		});
	});

	// ====================================================================
	// Write (Follow-up Input)
	// ====================================================================

	describe('write', () => {
		it('should call streamInput with a message', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.write({ type: 'text', text: 'Follow up message' });

			expect(mockFn.query.streamInput).toHaveBeenCalledOnce();
		});

		it('should warn and no-op when not running', () => {
			harness.write({ type: 'text', text: 'Not running' });
			expect(mockFn.query.streamInput).not.toHaveBeenCalled();
		});
	});

	// ====================================================================
	// Runtime Settings
	// ====================================================================

	describe('updateRuntimeSettings', () => {
		it('should call setPermissionMode for permission changes', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			await harness.updateRuntimeSettings({ permissionMode: 'bypassPermissions' });

			expect(mockFn.query.setPermissionMode).toHaveBeenCalledWith('bypassPermissions');
		});

		it('should call setModel for model changes', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			await harness.updateRuntimeSettings({ model: 'claude-sonnet-4-6' });

			expect(mockFn.query.setModel).toHaveBeenCalledWith('claude-sonnet-4-6');
		});

		it('should warn when not running', async () => {
			await harness.updateRuntimeSettings({ model: 'test' });
			expect(mockFn.query.setModel).not.toHaveBeenCalled();
		});
	});

	// ====================================================================
	// Stream Completion Cleanup
	// ====================================================================

	describe('stream completion cleanup', () => {
		it('should resolve pending interactions on stream end', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.on('interaction-request', () => {});

			const p1 = mockFn.canUseTool!(
				'Bash',
				{ command: 'test' },
				{ signal: new AbortController().signal, toolUseID: 'stream-end-1' }
			);
			await flushMicrotasks();

			expect(harness.getPendingInteractionCount()).toBe(1);

			// Complete the stream
			mockFn.complete();
			await flushMicrotasks();

			const result = await p1;
			expect(result.behavior).toBe('deny');
			expect((result as any).message).toBe('Session terminated');
		});
	});

	// ====================================================================
	// Response Translation — SDK Return Values
	// ====================================================================

	describe('response translation', () => {
		it('should translate approve (no optional fields) to SDK allow', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			let capturedRequest: InteractionRequest | null = null;
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				capturedRequest = req;
			});

			const resultPromise = mockFn.canUseTool!(
				'Read',
				{ path: '/test.ts' },
				{ signal: new AbortController().signal, toolUseID: 'trans-approve-1' }
			);
			await flushMicrotasks();

			await harness.respondToInteraction(capturedRequest!.interactionId, {
				kind: 'approve',
			});

			const result = await resultPromise;
			expect(result.behavior).toBe('allow');
			expect((result as any).updatedInput).toBeUndefined();
			expect((result as any).updatedPermissions).toBeUndefined();
		});

		it('should translate text response to SDK allow with text in updatedInput', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			let capturedRequest: InteractionRequest | null = null;
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				capturedRequest = req;
			});

			const resultPromise = mockFn.canUseTool!(
				'Bash',
				{ command: 'ls' },
				{ signal: new AbortController().signal, toolUseID: 'trans-text-1' }
			);
			await flushMicrotasks();

			await harness.respondToInteraction(capturedRequest!.interactionId, {
				kind: 'text',
				text: 'Use /tmp instead',
			});

			const result = await resultPromise;
			expect(result.behavior).toBe('allow');
			expect((result as any).updatedInput).toEqual({ text: 'Use /tmp instead' });
		});

		it('should translate deny (no optional fields) to SDK deny with default message', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			let capturedRequest: InteractionRequest | null = null;
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				capturedRequest = req;
			});

			const resultPromise = mockFn.canUseTool!(
				'Bash',
				{ command: 'rm -rf /' },
				{ signal: new AbortController().signal, toolUseID: 'trans-deny-1' }
			);
			await flushMicrotasks();

			await harness.respondToInteraction(capturedRequest!.interactionId, {
				kind: 'deny',
			});

			const result = await resultPromise;
			expect(result.behavior).toBe('deny');
			expect((result as any).message).toBe('User denied');
			expect((result as any).interrupt).toBeUndefined();
		});

		it('should translate cancel (no optional fields) to SDK deny with default message', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			let capturedRequest: InteractionRequest | null = null;
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				capturedRequest = req;
			});

			const resultPromise = mockFn.canUseTool!(
				'Write',
				{ path: '/test.ts' },
				{ signal: new AbortController().signal, toolUseID: 'trans-cancel-1' }
			);
			await flushMicrotasks();

			await harness.respondToInteraction(capturedRequest!.interactionId, {
				kind: 'cancel',
			});

			const result = await resultPromise;
			expect(result.behavior).toBe('deny');
			expect((result as any).message).toBe('User cancelled');
		});

		it('should translate clarification-answer with multiple questions', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			let capturedRequest: InteractionRequest | null = null;
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				capturedRequest = req;
			});

			const resultPromise = mockFn.canUseTool!(
				'AskUserQuestion',
				{
					questions: [
						{ question: 'Language?', header: 'Lang', options: [{ label: 'TS', description: 'TypeScript' }], multiSelect: false },
						{ question: 'Framework?', header: 'FW', options: [{ label: 'React', description: 'React.js' }], multiSelect: false },
					],
				},
				{ signal: new AbortController().signal, toolUseID: 'trans-multi-q-1' }
			);
			await flushMicrotasks();

			await harness.respondToInteraction(capturedRequest!.interactionId, {
				kind: 'clarification-answer',
				answers: [
					{ questionIndex: 0, selectedOptionLabels: ['TS'] },
					{ questionIndex: 1, text: 'Vue' },
				],
			});

			const result = await resultPromise;
			expect(result.behavior).toBe('allow');
			const input = (result as any).updatedInput;
			expect(input.answers).toEqual({ 'Language?': 'TS', 'Framework?': 'Vue' });
			expect(input.questions).toHaveLength(2);
		});

		it('should translate clarification-answer with out-of-bounds question index gracefully', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			let capturedRequest: InteractionRequest | null = null;
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				capturedRequest = req;
			});

			const resultPromise = mockFn.canUseTool!(
				'AskUserQuestion',
				{
					questions: [
						{ question: 'Color?', header: 'Color', options: [{ label: 'Red', description: 'Red' }], multiSelect: false },
					],
				},
				{ signal: new AbortController().signal, toolUseID: 'trans-oob-1' }
			);
			await flushMicrotasks();

			await harness.respondToInteraction(capturedRequest!.interactionId, {
				kind: 'clarification-answer',
				answers: [
					{ questionIndex: 0, selectedOptionLabels: ['Red'] },
					{ questionIndex: 5, text: 'This index does not exist' },
				],
			});

			const result = await resultPromise;
			expect(result.behavior).toBe('allow');
			const input = (result as any).updatedInput;
			// Only the valid index should appear in answers
			expect(input.answers).toEqual({ 'Color?': 'Red' });
		});
	});

	// ====================================================================
	// Subagent ID Forwarding
	// ====================================================================

	describe('subagent forwarding', () => {
		it('should include subagentId in tool approval requests', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			const events: InteractionRequest[] = [];
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				events.push(req);
			});

			const resultPromise = mockFn.canUseTool!(
				'Write',
				{ path: '/test.ts', content: 'test' },
				{
					signal: new AbortController().signal,
					toolUseID: 'sub-1',
					agentID: 'code-reviewer',
				}
			);
			await flushMicrotasks();

			const req = events[0] as ToolApprovalRequest;
			expect(req.subagentId).toBe('code-reviewer');

			await harness.respondToInteraction(req.interactionId, { kind: 'approve' });
			await resultPromise;
		});
	});

	// ====================================================================
	// Provider Options Containment
	// ====================================================================

	describe('provider options containment', () => {
		it('should ignore unknown provider option keys with no crash', async () => {
			const config = createTestConfig({
				providerOptions: {
					effort: 'high',
					unknownOption: 'should be ignored',
					anotherUnknown: 42,
				},
			});

			const capturedOptions: Record<string, unknown>[] = [];
			const queryFn: SDKQueryFunction = (cfg) => {
				capturedOptions.push(cfg.options || {});
				return mockFn.query;
			};

			const h = new ClaudeCodeHarness(queryFn);
			const result = await h.spawn(config);

			expect(result.success).toBe(true);

			// Known options should be passed through
			const opts = capturedOptions[0];
			expect(opts.effort).toBe('high');

			// Unknown options should NOT be passed to SDK
			expect(opts.unknownOption).toBeUndefined();
			expect(opts.anotherUnknown).toBeUndefined();

			h.kill();
		});

		it('should handle empty providerOptions bag', async () => {
			const config = createTestConfig({
				providerOptions: {},
			});

			const capturedOptions: Record<string, unknown>[] = [];
			const queryFn: SDKQueryFunction = (cfg) => {
				capturedOptions.push(cfg.options || {});
				return mockFn.query;
			};

			const h = new ClaudeCodeHarness(queryFn);
			const result = await h.spawn(config);

			expect(result.success).toBe(true);
			h.kill();
		});

		it('should handle undefined providerOptions', async () => {
			const config = createTestConfig();
			delete config.providerOptions;

			const result = await harness.spawn(config);
			expect(result.success).toBe(true);
		});

		it('should handle runtime providerOptions in updateRuntimeSettings', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			// Should not throw
			await harness.updateRuntimeSettings({
				providerOptions: { effort: 'max' },
			});
		});

		it('should ignore unknown runtime provider option keys', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			// Should not throw — unknown keys silently ignored
			await harness.updateRuntimeSettings({
				providerOptions: {
					effort: 'low',
					unknownRuntimeOption: true,
				},
			});
		});

		it('should handle runtime providerOptions with no recognized keys', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			// All unknown keys — should not crash
			await harness.updateRuntimeSettings({
				providerOptions: {
					totallyFake: 'value',
				},
			});
		});
	});

	// ====================================================================
	// Deterministic Cleanup — dispose(), disposal guards, resource release
	// ====================================================================

	describe('deterministic cleanup', () => {
		it('dispose() should kill a running harness and resolve pending interactions', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.on('interaction-request', () => {});

			const p1 = mockFn.canUseTool!(
				'Bash',
				{ command: 'test' },
				{ signal: new AbortController().signal, toolUseID: 'dispose-1' }
			);
			await flushMicrotasks();

			expect(harness.getPendingInteractionCount()).toBe(1);
			expect(harness.isRunning()).toBe(true);

			harness.dispose();

			const r1 = await p1;
			expect(r1.behavior).toBe('deny');
			expect((r1 as any).message).toBe('Session terminated');
			expect(harness.getPendingInteractionCount()).toBe(0);
			expect(harness.isRunning()).toBe(false);
			expect(harness.isDisposed()).toBe(true);
		});

		it('dispose() should be idempotent', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.dispose();
			harness.dispose(); // Second call should not throw

			expect(harness.isDisposed()).toBe(true);
		});

		it('dispose() should work on a never-started harness', () => {
			harness.dispose();

			expect(harness.isDisposed()).toBe(true);
			expect(harness.isRunning()).toBe(false);
		});

		it('dispose() should remove all event listeners', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			const listener = vi.fn();
			harness.on('data', listener);
			harness.on('exit', listener);
			harness.on('interaction-request', listener);

			expect(harness.listenerCount('data')).toBeGreaterThan(0);

			harness.dispose();

			expect(harness.listenerCount('data')).toBe(0);
			expect(harness.listenerCount('exit')).toBe(0);
			expect(harness.listenerCount('interaction-request')).toBe(0);
		});

		it('dispose() should call SDK close() and abort the controller', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.dispose();

			expect(mockFn.query.close).toHaveBeenCalledOnce();
		});

		it('spawn() should fail on disposed harness', async () => {
			harness.dispose();

			const result = await harness.spawn(createTestConfig());
			expect(result.success).toBe(false);
		});

		it('write() should no-op on disposed harness', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.dispose();

			// Should not throw
			harness.write({ type: 'text', text: 'hello' });
			expect(mockFn.query.streamInput).not.toHaveBeenCalled();
		});

		it('interrupt() should no-op on disposed harness', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.dispose();

			// Should not throw
			await harness.interrupt();
			// interrupt() was not called on the query because kill() already closed it
		});

		it('kill() should no-op on disposed harness', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.dispose();

			// Should not throw — kill() is idempotent after dispose
			harness.kill();
			expect(harness.isDisposed()).toBe(true);
		});

		it('respondToInteraction() should throw on disposed harness', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.on('interaction-request', () => {});

			const p1 = mockFn.canUseTool!(
				'Bash',
				{ command: 'test' },
				{ signal: new AbortController().signal, toolUseID: 'disposed-respond-1' }
			);
			await flushMicrotasks();

			// Capture the interaction ID before disposing
			let capturedInteractionId = '';
			harness.removeAllListeners('interaction-request');
			// The interaction is already pending, so we need to find its ID
			// We can't easily get the ID after it was created, so just dispose and try a fake one
			harness.dispose();

			const r1 = await p1; // Resolved by dispose → kill → resolveAllPending
			expect(r1.behavior).toBe('deny');

			await expect(
				harness.respondToInteraction('any-id', { kind: 'approve' })
			).rejects.toThrow('Cannot respond to interaction on disposed harness');
		});

		it('updateRuntimeSettings() should no-op on disposed harness', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.dispose();

			// Should not throw
			await harness.updateRuntimeSettings({ model: 'new-model' });
		});

		it('should clear timeout handles when kill() is called during pending timeout', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.on('interaction-request', () => {});

			const p1 = mockFn.canUseTool!(
				'Bash',
				{ command: 'test' },
				{ signal: new AbortController().signal, toolUseID: 'timeout-clear-1' }
			);
			await flushMicrotasks();

			expect(harness.getPendingInteractionCount()).toBe(1);

			// Kill resolves the interaction, clearing the timeout
			harness.kill();

			const r1 = await p1;
			expect(r1.behavior).toBe('deny');

			// Advancing past the default timeout should not cause issues
			vi.advanceTimersByTime(DEFAULT_INTERACTION_TIMEOUT_MS + 1000);
			await flushMicrotasks();

			// No double-resolution or errors — just the one resolve from kill
			expect(harness.getPendingInteractionCount()).toBe(0);
		});

		it('should clear timeout handles when interrupt() is called during pending timeout', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.on('interaction-request', () => {});

			const p1 = mockFn.canUseTool!(
				'Bash',
				{ command: 'test' },
				{ signal: new AbortController().signal, toolUseID: 'timeout-interrupt-1' }
			);
			await flushMicrotasks();

			await harness.interrupt();

			const r1 = await p1;
			expect(r1.behavior).toBe('deny');
			expect((r1 as any).message).toBe('Session interrupted');

			// Advancing past timeout should not cause double-resolution
			vi.advanceTimersByTime(DEFAULT_INTERACTION_TIMEOUT_MS + 1000);
			await flushMicrotasks();

			expect(harness.getPendingInteractionCount()).toBe(0);
		});

		it('should handle dispose() after interrupt() without errors', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			await harness.interrupt();
			harness.dispose(); // Should not throw

			expect(harness.isDisposed()).toBe(true);
			expect(harness.isRunning()).toBe(false);
		});

		it('should handle dispose() after kill() without errors', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.kill();
			harness.dispose(); // Should not throw

			expect(harness.isDisposed()).toBe(true);
		});

		it('should resolve multiple concurrent pending interactions on dispose()', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.on('interaction-request', () => {});

			const p1 = mockFn.canUseTool!(
				'Bash',
				{ command: 'cmd1' },
				{ signal: new AbortController().signal, toolUseID: 'multi-dispose-1' }
			);
			await flushMicrotasks();

			const p2 = mockFn.canUseTool!(
				'Write',
				{ path: '/f.ts', content: '' },
				{ signal: new AbortController().signal, toolUseID: 'multi-dispose-2' }
			);
			await flushMicrotasks();

			const p3 = mockFn.canUseTool!(
				'AskUserQuestion',
				{ questions: [{ question: 'Q?', header: 'H', options: [], multiSelect: false }] },
				{ signal: new AbortController().signal, toolUseID: 'multi-dispose-3' }
			);
			await flushMicrotasks();

			expect(harness.getPendingInteractionCount()).toBe(3);

			harness.dispose();

			const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

			// Tool approvals → deny with terminate message
			expect(r1.behavior).toBe('deny');
			expect((r1 as any).message).toBe('Session terminated');
			expect(r2.behavior).toBe('deny');
			expect((r2 as any).message).toBe('Session terminated');

			// Clarification → cancel → deny
			expect(r3.behavior).toBe('deny');
			expect((r3 as any).message).toBe('Session terminated');

			expect(harness.getPendingInteractionCount()).toBe(0);
		});
	});

	// ====================================================================
	// Invalid / Expired Interaction Responses — Clean Failure
	// ====================================================================

	describe('invalid and expired interaction responses — clean failure', () => {
		it('should throw cleanly for empty string interaction ID', async () => {
			await harness.spawn(createTestConfig());

			await expect(
				harness.respondToInteraction('', { kind: 'approve' })
			).rejects.toThrow('Unknown or expired interaction ID: ');

			// Harness should still be running
			expect(harness.isRunning()).toBe(true);
		});

		it('should throw for responding after timeout and harness remains functional', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			let capturedRequest: InteractionRequest | null = null;
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				capturedRequest = req;
			});

			const resultPromise = mockFn.canUseTool!(
				'Bash',
				{ command: 'test' },
				{ signal: new AbortController().signal, toolUseID: 'post-timeout-1' }
			);
			await flushMicrotasks();

			const timedOutId = capturedRequest!.interactionId;

			// Let it time out
			vi.advanceTimersByTime(DEFAULT_INTERACTION_TIMEOUT_MS + 100);
			await flushMicrotasks();

			const timedOutResult = await resultPromise;
			expect(timedOutResult.behavior).toBe('deny');

			// Now try responding to the timed-out interaction
			await expect(
				harness.respondToInteraction(timedOutId, { kind: 'approve' })
			).rejects.toThrow('Unknown or expired interaction ID');

			// Harness remains functional — can handle new interactions
			expect(harness.isRunning()).toBe(true);

			const p2 = mockFn.canUseTool!(
				'Read',
				{ path: '/new.ts' },
				{ signal: new AbortController().signal, toolUseID: 'post-timeout-2' }
			);
			await flushMicrotasks();

			capturedRequest = null;
			// Re-attach listener since the previous one is still active
			const newRequests: InteractionRequest[] = [];
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				newRequests.push(req);
			});

			// The interaction was already emitted, use the one we have
			expect(harness.getPendingInteractionCount()).toBe(1);

			// Respond to the new interaction
			const latestId = Array.from((harness as any).pendingInteractions.keys())[0];
			await harness.respondToInteraction(latestId, { kind: 'approve' });
			const r2 = await p2;
			expect(r2.behavior).toBe('allow');
		});

		it('should throw for responding after kill and not crash', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			let capturedRequest: InteractionRequest | null = null;
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				capturedRequest = req;
			});

			const resultPromise = mockFn.canUseTool!(
				'Bash',
				{ command: 'test' },
				{ signal: new AbortController().signal, toolUseID: 'post-kill-1' }
			);
			await flushMicrotasks();

			const killedId = capturedRequest!.interactionId;

			// Kill resolves with termination
			harness.kill();
			const result = await resultPromise;
			expect(result.behavior).toBe('deny');
			expect((result as any).message).toBe('Session terminated');

			// Now try responding to the killed interaction — should fail cleanly
			await expect(
				harness.respondToInteraction(killedId, { kind: 'approve' })
			).rejects.toThrow('Unknown or expired interaction ID');

			// Harness is not running but did not crash
			expect(harness.isRunning()).toBe(false);
			expect(harness.getPendingInteractionCount()).toBe(0);
		});

		it('should throw for responding after interrupt and not crash', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			let capturedRequest: InteractionRequest | null = null;
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				capturedRequest = req;
			});

			const resultPromise = mockFn.canUseTool!(
				'Bash',
				{ command: 'test' },
				{ signal: new AbortController().signal, toolUseID: 'post-interrupt-1' }
			);
			await flushMicrotasks();

			const interruptedId = capturedRequest!.interactionId;

			await harness.interrupt();
			const result = await resultPromise;
			expect(result.behavior).toBe('deny');
			expect((result as any).message).toBe('Session interrupted');

			// Now try responding to the interrupted interaction
			await expect(
				harness.respondToInteraction(interruptedId, { kind: 'approve' })
			).rejects.toThrow('Unknown or expired interaction ID');
		});

		it('should handle unknown response kind gracefully via SDK deny fallback', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			let capturedRequest: InteractionRequest | null = null;
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				capturedRequest = req;
			});

			const resultPromise = mockFn.canUseTool!(
				'Bash',
				{ command: 'test' },
				{ signal: new AbortController().signal, toolUseID: 'unknown-kind-1' }
			);
			await flushMicrotasks();

			// Send a response with a fabricated unknown kind
			await harness.respondToInteraction(capturedRequest!.interactionId, {
				kind: 'not-a-real-kind' as any,
			});

			const result = await resultPromise;
			// Unknown kind falls through to the default case → deny
			expect(result.behavior).toBe('deny');
			expect((result as any).message).toBe('Unknown response type');

			// Harness remains functional
			expect(harness.isRunning()).toBe(true);
			expect(harness.getPendingInteractionCount()).toBe(0);
		});

		it('should handle clarification-answer response to a tool-approval interaction gracefully', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			let capturedRequest: InteractionRequest | null = null;
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				capturedRequest = req;
			});

			// Tool approval (not clarification) — no originalSdkInput
			const resultPromise = mockFn.canUseTool!(
				'Bash',
				{ command: 'test' },
				{ signal: new AbortController().signal, toolUseID: 'mismatch-1' }
			);
			await flushMicrotasks();

			// Respond with clarification-answer to a tool-approval — should not crash
			await harness.respondToInteraction(capturedRequest!.interactionId, {
				kind: 'clarification-answer',
				answers: [{ questionIndex: 0, selectedOptionLabels: ['Yes'] }],
			});

			const result = await resultPromise;
			// Should resolve (not crash) — produces empty answers since no original questions
			expect(result.behavior).toBe('allow');
			expect((result as any).updatedInput.questions).toEqual([]);
			expect((result as any).updatedInput.answers).toEqual({});
		});

		it('should handle clarification-answer with null answers array gracefully', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			let capturedRequest: InteractionRequest | null = null;
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				capturedRequest = req;
			});

			const resultPromise = mockFn.canUseTool!(
				'AskUserQuestion',
				{
					questions: [{ question: 'Q?', header: 'Q', options: [], multiSelect: false }],
				},
				{ signal: new AbortController().signal, toolUseID: 'null-answers-1' }
			);
			await flushMicrotasks();

			// Send a clarification-answer with null answers (runtime type violation)
			await harness.respondToInteraction(capturedRequest!.interactionId, {
				kind: 'clarification-answer',
				answers: null as any,
			});

			const result = await resultPromise;
			// Defensive guard returns empty answers, no crash
			expect(result.behavior).toBe('allow');
			expect((result as any).updatedInput.answers).toEqual({});
		});

		it('should handle clarification-answer with malformed answer entries gracefully', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			let capturedRequest: InteractionRequest | null = null;
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				capturedRequest = req;
			});

			const resultPromise = mockFn.canUseTool!(
				'AskUserQuestion',
				{
					questions: [
						{ question: 'Color?', header: 'C', options: [{ label: 'Red', description: 'Red' }], multiSelect: false },
					],
				},
				{ signal: new AbortController().signal, toolUseID: 'malformed-answers-1' }
			);
			await flushMicrotasks();

			// Send answers with some malformed entries (null entry, missing questionIndex)
			await harness.respondToInteraction(capturedRequest!.interactionId, {
				kind: 'clarification-answer',
				answers: [
					null as any,
					{ questionIndex: 'not-a-number' } as any,
					{ questionIndex: 0, selectedOptionLabels: ['Red'] },
				],
			});

			const result = await resultPromise;
			expect(result.behavior).toBe('allow');
			// Only the valid entry (index 0) should produce an answer
			expect((result as any).updatedInput.answers).toEqual({ 'Color?': 'Red' });
		});

		it('should handle concurrent duplicate responses — second throws, first resolves', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			let capturedRequest: InteractionRequest | null = null;
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				capturedRequest = req;
			});

			const resultPromise = mockFn.canUseTool!(
				'Bash',
				{ command: 'test' },
				{ signal: new AbortController().signal, toolUseID: 'dup-respond-1' }
			);
			await flushMicrotasks();

			const id = capturedRequest!.interactionId;

			// First response succeeds
			await harness.respondToInteraction(id, { kind: 'approve' });
			const result = await resultPromise;
			expect(result.behavior).toBe('allow');

			// Second response to same ID throws
			await expect(
				harness.respondToInteraction(id, { kind: 'deny', message: 'Too late' })
			).rejects.toThrow('Unknown or expired interaction ID');

			// Harness still running
			expect(harness.isRunning()).toBe(true);
		});

		it('should remain functional after multiple consecutive invalid responses', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			// Fire several invalid responses
			for (let i = 0; i < 5; i++) {
				await expect(
					harness.respondToInteraction(`nonexistent-${i}`, { kind: 'approve' })
				).rejects.toThrow('Unknown or expired interaction ID');
			}

			// Harness should still be fully operational
			expect(harness.isRunning()).toBe(true);

			// Create and resolve a real interaction
			let capturedRequest: InteractionRequest | null = null;
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				capturedRequest = req;
			});

			const resultPromise = mockFn.canUseTool!(
				'Read',
				{ path: '/test.ts' },
				{ signal: new AbortController().signal, toolUseID: 'after-invalids-1' }
			);
			await flushMicrotasks();

			await harness.respondToInteraction(capturedRequest!.interactionId, { kind: 'approve' });
			const result = await resultPromise;
			expect(result.behavior).toBe('allow');
		});

		it('should handle respondToInteraction with deny response missing optional fields', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			let capturedRequest: InteractionRequest | null = null;
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				capturedRequest = req;
			});

			const resultPromise = mockFn.canUseTool!(
				'Bash',
				{ command: 'test' },
				{ signal: new AbortController().signal, toolUseID: 'minimal-deny-1' }
			);
			await flushMicrotasks();

			// Deny with no message, no interrupt flag
			await harness.respondToInteraction(capturedRequest!.interactionId, {
				kind: 'deny',
			});

			const result = await resultPromise;
			expect(result.behavior).toBe('deny');
			expect((result as any).message).toBe('User denied');
			expect((result as any).interrupt).toBeUndefined();
		});

		it('should resolve SDK promise with safe deny if response translation throws', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			let capturedRequest: InteractionRequest | null = null;
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				capturedRequest = req;
			});

			const resultPromise = mockFn.canUseTool!(
				'Bash',
				{ command: 'test' },
				{ signal: new AbortController().signal, toolUseID: 'translation-error-1' }
			);
			await flushMicrotasks();

			// Patch translateResponseToSdk to throw
			const originalTranslate = (harness as any).translateResponseToSdk.bind(harness);
			(harness as any).translateResponseToSdk = () => {
				throw new Error('Simulated translation failure');
			};

			// respondToInteraction should throw but the SDK promise should still resolve
			await expect(
				harness.respondToInteraction(capturedRequest!.interactionId, { kind: 'approve' })
			).rejects.toThrow('Response translation failed');

			// SDK promise resolved with a safe deny — not left dangling
			const result = await resultPromise;
			expect(result.behavior).toBe('deny');
			expect((result as any).message).toContain('Response translation error');

			// Restore
			(harness as any).translateResponseToSdk = originalTranslate;

			// Harness is still functional
			expect(harness.isRunning()).toBe(true);
			expect(harness.getPendingInteractionCount()).toBe(0);
		});

		it('should handle respondToInteraction on a harness that was never started', async () => {
			// Never call spawn()
			await expect(
				harness.respondToInteraction('some-id', { kind: 'approve' })
			).rejects.toThrow('Unknown or expired interaction ID');
		});
	});
});
