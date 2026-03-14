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

// Mock the image encoding module
vi.mock('../claude-image-encoding', () => ({
	encodeImageFiles: vi.fn().mockResolvedValue([]),
}));

import { encodeImageFiles } from '../claude-image-encoding';

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

		it('should encode images and include them in initial message', async () => {
			const fakeImageBlock = {
				type: 'image' as const,
				source: { type: 'base64' as const, media_type: 'image/png', data: 'aW1hZ2VkYXRh' },
			};
			vi.mocked(encodeImageFiles).mockResolvedValueOnce([fakeImageBlock]);

			const config = createTestConfig({
				prompt: 'Analyze this image',
				images: ['/path/to/screenshot.png'],
			});

			let capturedPrompt: AsyncIterable<SDKUserMessage> | null = null;
			const queryFn: SDKQueryFunction = (cfg) => {
				capturedPrompt = cfg.prompt as AsyncIterable<SDKUserMessage>;
				return mockFn.query;
			};

			const h = new ClaudeCodeHarness(queryFn);
			await h.spawn(config);

			// encodeImageFiles called with the image paths
			expect(encodeImageFiles).toHaveBeenCalledWith(['/path/to/screenshot.png']);

			// Consume the streaming prompt to verify content
			const messages: SDKUserMessage[] = [];
			for await (const msg of capturedPrompt!) {
				messages.push(msg);
			}
			expect(messages).toHaveLength(1);

			// Text + image content blocks
			const contentTypes = messages[0].content.map((b: any) => b.type);
			expect(contentTypes).toEqual(['text', 'image']);
			expect(messages[0].content[0]).toEqual({ type: 'text', text: 'Analyze this image' });
			expect(messages[0].content[1]).toEqual(fakeImageBlock);

			h.kill();
		});

		it('should continue with text when all images fail to encode', async () => {
			// encodeImageFiles returns empty array (all images failed)
			vi.mocked(encodeImageFiles).mockResolvedValueOnce([]);

			const config = createTestConfig({
				prompt: 'Analyze this image',
				images: ['/path/to/bad-image.bmp'],
			});

			let capturedPrompt: AsyncIterable<SDKUserMessage> | null = null;
			const queryFn: SDKQueryFunction = (cfg) => {
				capturedPrompt = cfg.prompt as AsyncIterable<SDKUserMessage>;
				return mockFn.query;
			};

			const h = new ClaudeCodeHarness(queryFn);
			await h.spawn(config);

			// Consume the streaming prompt
			const messages: SDKUserMessage[] = [];
			for await (const msg of capturedPrompt!) {
				messages.push(msg);
			}
			expect(messages).toHaveLength(1);

			// Only text — failed images are skipped gracefully
			const contentTypes = messages[0].content.map((b: any) => b.type);
			expect(contentTypes).toEqual(['text']);
			expect(messages[0].content[0]).toEqual({ type: 'text', text: 'Analyze this image' });

			h.kill();
		});

		it('should not call encodeImageFiles when no images provided', async () => {
			vi.mocked(encodeImageFiles).mockClear();

			const config = createTestConfig({ prompt: 'No images here' });

			const h = new ClaudeCodeHarness(mockFn.queryFn);
			await h.spawn(config);

			expect(encodeImageFiles).not.toHaveBeenCalled();

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
		it('should resolve tool approval to SDK deny via timeout kind on timeout', async () => {
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

		it('should resolve clarification to SDK deny via timeout kind on timeout', async () => {
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
			// Clarification timeout → timeout kind → SDK deny
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

		it('should emit data with structured JSON payload from task_started', async () => {
			const dataEvents: string[] = [];
			harness.on('data', (_sid: string, data: string) => {
				dataEvents.push(data);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'task_started',
				task_id: 'task-123',
				task_name: 'Background indexing',
				message: 'Indexing workspace files',
			} as any);

			await flushMicrotasks();

			// Find the task_started data event (skip any earlier data events from spawn)
			const taskEvent = dataEvents.find((d) => d.includes('task_started'));
			expect(taskEvent).toBeDefined();

			const parsed = JSON.parse(taskEvent!);
			expect(parsed.harnessEvent).toBe('task_started');
			expect(parsed.taskId).toBe('task-123');
			expect(parsed.taskName).toBe('Background indexing');
			expect(parsed.message).toBe('Indexing workspace files');
		});

		it('should emit data from task_started with minimal fields', async () => {
			const dataEvents: string[] = [];
			harness.on('data', (_sid: string, data: string) => {
				dataEvents.push(data);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'task_started',
				task_id: 'task-456',
			} as any);

			await flushMicrotasks();

			const taskEvent = dataEvents.find((d) => d.includes('task_started'));
			expect(taskEvent).toBeDefined();

			const parsed = JSON.parse(taskEvent!);
			expect(parsed.harnessEvent).toBe('task_started');
			expect(parsed.taskId).toBe('task-456');
			expect(parsed.taskName).toBeUndefined();
			expect(parsed.message).toBeUndefined();
		});

		it('should emit data with structured JSON payload from task_progress', async () => {
			const dataEvents: string[] = [];
			harness.on('data', (_sid: string, data: string) => {
				dataEvents.push(data);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'task_progress',
				task_id: 'task-789',
				task_name: 'Background indexing',
				message: 'Indexed 50 of 100 files',
				progress: 0.5,
			} as any);

			await flushMicrotasks();

			const taskEvent = dataEvents.find((d) => d.includes('task_progress'));
			expect(taskEvent).toBeDefined();

			const parsed = JSON.parse(taskEvent!);
			expect(parsed.harnessEvent).toBe('task_progress');
			expect(parsed.taskId).toBe('task-789');
			expect(parsed.taskName).toBe('Background indexing');
			expect(parsed.message).toBe('Indexed 50 of 100 files');
			expect(parsed.progress).toBe(0.5);
		});

		it('should emit data from task_progress with minimal fields', async () => {
			const dataEvents: string[] = [];
			harness.on('data', (_sid: string, data: string) => {
				dataEvents.push(data);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'task_progress',
				task_id: 'task-minimal',
			} as any);

			await flushMicrotasks();

			const taskEvent = dataEvents.find((d) => d.includes('task_progress'));
			expect(taskEvent).toBeDefined();

			const parsed = JSON.parse(taskEvent!);
			expect(parsed.harnessEvent).toBe('task_progress');
			expect(parsed.taskId).toBe('task-minimal');
			expect(parsed.taskName).toBeUndefined();
			expect(parsed.message).toBeUndefined();
			expect(parsed.progress).toBeUndefined();
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
			await flushMicrotasks();

			expect(mockFn.query.streamInput).toHaveBeenCalledOnce();
		});

		it('should warn and no-op when not running', () => {
			harness.write({ type: 'text', text: 'Not running' });
			expect(mockFn.query.streamInput).not.toHaveBeenCalled();
		});

		it('should encode images and include them in follow-up message', async () => {
			const fakeImageBlock = {
				type: 'image' as const,
				source: { type: 'base64' as const, media_type: 'image/png', data: 'aW1hZ2VkYXRh' },
			};
			vi.mocked(encodeImageFiles).mockResolvedValueOnce([fakeImageBlock]);

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.write({ type: 'message', text: 'Describe this', images: ['/path/to/img.png'] });
			await flushMicrotasks();

			// encodeImageFiles called with the image paths
			expect(encodeImageFiles).toHaveBeenCalledWith(['/path/to/img.png']);

			// streamInput called with text + image content
			expect(mockFn.query.streamInput).toHaveBeenCalledOnce();
		});

		it('should send images-only message when no text is provided', async () => {
			const fakeImageBlocks = [
				{
					type: 'image' as const,
					source: { type: 'base64' as const, media_type: 'image/png', data: 'aW1n' },
				},
				{
					type: 'image' as const,
					source: { type: 'base64' as const, media_type: 'image/jpeg', data: 'anBn' },
				},
			];
			vi.mocked(encodeImageFiles).mockResolvedValueOnce(fakeImageBlocks);

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			// Reset streamInput call count from spawn
			vi.mocked(mockFn.query.streamInput).mockClear();

			harness.write({ type: 'message', images: ['/a.png', '/b.jpg'] });
			await flushMicrotasks();

			// encodeImageFiles called
			expect(encodeImageFiles).toHaveBeenCalledWith(['/a.png', '/b.jpg']);

			// streamInput IS called — images are now supported
			expect(mockFn.query.streamInput).toHaveBeenCalledOnce();
		});

		it('should send empty text fallback when images-only all fail to encode', async () => {
			// All images fail — encodeImageFiles returns empty array
			vi.mocked(encodeImageFiles).mockResolvedValueOnce([]);

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			// Reset streamInput call count from spawn
			vi.mocked(mockFn.query.streamInput).mockClear();

			harness.write({ type: 'message', images: ['/a.bmp'] });
			await flushMicrotasks();

			// streamInput still called with empty-text fallback
			expect(mockFn.query.streamInput).toHaveBeenCalledOnce();
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

		it('should translate timeout to SDK deny with timeout message', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			let capturedRequest: InteractionRequest | null = null;
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				capturedRequest = req;
			});

			const resultPromise = mockFn.canUseTool!(
				'Bash',
				{ command: 'test' },
				{ signal: new AbortController().signal, toolUseID: 'trans-timeout-1' }
			);
			await flushMicrotasks();

			await harness.respondToInteraction(capturedRequest!.interactionId, {
				kind: 'timeout',
				interactionKind: 'tool-approval',
				message: 'Timed out waiting for user response',
			});

			const result = await resultPromise;
			expect(result.behavior).toBe('deny');
			expect((result as any).message).toBe('Timed out waiting for user response');
		});

		it('should translate timeout without message to SDK deny with default message', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			let capturedRequest: InteractionRequest | null = null;
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				capturedRequest = req;
			});

			const resultPromise = mockFn.canUseTool!(
				'Bash',
				{ command: 'test' },
				{ signal: new AbortController().signal, toolUseID: 'trans-timeout-2' }
			);
			await flushMicrotasks();

			await harness.respondToInteraction(capturedRequest!.interactionId, {
				kind: 'timeout',
				interactionKind: 'tool-approval',
			});

			const result = await resultPromise;
			expect(result.behavior).toBe('deny');
			expect((result as any).message).toBe('Timed out waiting for user response');
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
			const latestId = Array.from((harness as any).pendingInteractions.keys())[0] as string;
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

	// ====================================================================
	// Validation: Pending Interaction Storage Invariants
	// ====================================================================

	describe('validation — pending interaction storage', () => {
		it('should assign unique interactionIds to concurrent interactions', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			const ids: string[] = [];
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				ids.push(req.interactionId);
			});

			// Create three concurrent interactions
			const p1 = mockFn.canUseTool!(
				'Bash', { command: 'cmd1' },
				{ signal: new AbortController().signal, toolUseID: 'unique-1' }
			);
			await flushMicrotasks();

			const p2 = mockFn.canUseTool!(
				'Write', { path: '/f.ts', content: '' },
				{ signal: new AbortController().signal, toolUseID: 'unique-2' }
			);
			await flushMicrotasks();

			const p3 = mockFn.canUseTool!(
				'AskUserQuestion',
				{ questions: [{ question: 'Q?', header: 'H', options: [], multiSelect: false }] },
				{ signal: new AbortController().signal, toolUseID: 'unique-3' }
			);
			await flushMicrotasks();

			expect(ids).toHaveLength(3);
			// All IDs must be distinct
			expect(new Set(ids).size).toBe(3);
			// All IDs should be valid UUID format
			for (const id of ids) {
				expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
			}

			// Clean up
			harness.kill();
			await Promise.all([p1, p2, p3]);
		});

		it('should store correct kind for tool-approval and clarification interactions', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			const requests: InteractionRequest[] = [];
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				requests.push(req);
			});

			// Tool approval
			const p1 = mockFn.canUseTool!(
				'Bash', { command: 'ls' },
				{ signal: new AbortController().signal, toolUseID: 'kind-check-1' }
			);
			await flushMicrotasks();

			// Clarification
			const p2 = mockFn.canUseTool!(
				'AskUserQuestion',
				{ questions: [{ question: 'Which?', header: 'Q', options: [], multiSelect: false }] },
				{ signal: new AbortController().signal, toolUseID: 'kind-check-2' }
			);
			await flushMicrotasks();

			expect(requests).toHaveLength(2);
			expect(requests[0].kind).toBe('tool-approval');
			expect(requests[1].kind).toBe('clarification');

			// Verify the pending map entries match
			const pendingMap = (harness as any).pendingInteractions as Map<string, any>;
			const entry1 = pendingMap.get(requests[0].interactionId);
			const entry2 = pendingMap.get(requests[1].interactionId);
			expect(entry1.kind).toBe('tool-approval');
			expect(entry2.kind).toBe('clarification');

			// Clean up
			harness.kill();
			await Promise.all([p1, p2]);
		});

		it('should retain originalSdkInput for clarification but not tool-approval', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			const requests: InteractionRequest[] = [];
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				requests.push(req);
			});

			// Tool approval — no originalSdkInput
			const p1 = mockFn.canUseTool!(
				'Bash', { command: 'test' },
				{ signal: new AbortController().signal, toolUseID: 'sdk-input-1' }
			);
			await flushMicrotasks();

			// Clarification — should store originalSdkInput
			const askInput = {
				questions: [{ question: 'Name?', header: 'N', options: [], multiSelect: false }],
			};
			const p2 = mockFn.canUseTool!(
				'AskUserQuestion', askInput,
				{ signal: new AbortController().signal, toolUseID: 'sdk-input-2' }
			);
			await flushMicrotasks();

			const pendingMap = (harness as any).pendingInteractions as Map<string, any>;
			const toolEntry = pendingMap.get(requests[0].interactionId);
			const clarEntry = pendingMap.get(requests[1].interactionId);

			// Tool approval has no originalSdkInput
			expect(toolEntry.originalSdkInput).toBeUndefined();

			// Clarification retains the SDK input for response translation
			expect(clarEntry.originalSdkInput).toBeDefined();
			expect(clarEntry.originalSdkInput.questions).toBeDefined();

			// Clean up
			harness.kill();
			await Promise.all([p1, p2]);
		});

		it('should selectively resolve one interaction while others remain pending', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			const requests: InteractionRequest[] = [];
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				requests.push(req);
			});

			const p1 = mockFn.canUseTool!(
				'Bash', { command: 'first' },
				{ signal: new AbortController().signal, toolUseID: 'selective-1' }
			);
			await flushMicrotasks();

			const p2 = mockFn.canUseTool!(
				'Write', { path: '/a.ts', content: '' },
				{ signal: new AbortController().signal, toolUseID: 'selective-2' }
			);
			await flushMicrotasks();

			const p3 = mockFn.canUseTool!(
				'Read', { path: '/b.ts' },
				{ signal: new AbortController().signal, toolUseID: 'selective-3' }
			);
			await flushMicrotasks();

			expect(harness.getPendingInteractionCount()).toBe(3);

			// Resolve only the middle one
			await harness.respondToInteraction(requests[1].interactionId, { kind: 'approve' });
			const r2 = await p2;

			expect(r2.behavior).toBe('allow');
			expect(harness.getPendingInteractionCount()).toBe(2);

			// First and third should still be pending
			expect(harness.hasPendingInteraction(requests[0].interactionId)).toBe(true);
			expect(harness.hasPendingInteraction(requests[1].interactionId)).toBe(false);
			expect(harness.hasPendingInteraction(requests[2].interactionId)).toBe(true);

			// Resolve remaining
			await harness.respondToInteraction(requests[0].interactionId, { kind: 'deny', message: 'No' });
			await harness.respondToInteraction(requests[2].interactionId, { kind: 'approve' });
			const [r1, r3] = await Promise.all([p1, p3]);

			expect(r1.behavior).toBe('deny');
			expect(r3.behavior).toBe('allow');
			expect(harness.getPendingInteractionCount()).toBe(0);
		});

		it('should emit interaction-request with valid timestamp', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			const beforeTime = Date.now();

			let capturedRequest: InteractionRequest | null = null;
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				capturedRequest = req;
			});

			const resultPromise = mockFn.canUseTool!(
				'Bash', { command: 'test' },
				{ signal: new AbortController().signal, toolUseID: 'timestamp-1' }
			);
			await flushMicrotasks();

			const afterTime = Date.now();

			expect(capturedRequest).not.toBeNull();
			expect(capturedRequest!.timestamp).toBeGreaterThanOrEqual(beforeTime);
			expect(capturedRequest!.timestamp).toBeLessThanOrEqual(afterTime);

			await harness.respondToInteraction(capturedRequest!.interactionId, { kind: 'approve' });
			await resultPromise;
		});
	});

	// ====================================================================
	// Validation: Timeout Handling Edge Cases
	// ====================================================================

	describe('validation — timeout handling', () => {
		it('should translate timeout response through correct SDK pipeline for tool-approval', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.on('interaction-request', () => {});

			const resultPromise = mockFn.canUseTool!(
				'Bash', { command: 'test' },
				{ signal: new AbortController().signal, toolUseID: 'timeout-pipeline-1' }
			);
			await flushMicrotasks();

			// Let timeout fire
			vi.advanceTimersByTime(DEFAULT_INTERACTION_TIMEOUT_MS + 100);
			await flushMicrotasks();

			const result = await resultPromise;
			// Timeout response → timeout kind → translateResponseToSdk → SDK deny
			expect(result.behavior).toBe('deny');
			expect((result as any).message).toBe('Timed out waiting for user response');
			// Timeout does NOT include interrupt flag
			expect((result as any).interrupt).toBeUndefined();
		});

		it('should translate timeout response through correct SDK pipeline for clarification', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.on('interaction-request', () => {});

			const resultPromise = mockFn.canUseTool!(
				'AskUserQuestion',
				{ questions: [{ question: 'Pick?', header: 'P', options: [], multiSelect: false }] },
				{ signal: new AbortController().signal, toolUseID: 'timeout-pipeline-2' }
			);
			await flushMicrotasks();

			vi.advanceTimersByTime(DEFAULT_INTERACTION_TIMEOUT_MS + 100);
			await flushMicrotasks();

			const result = await resultPromise;
			// Clarification timeout → timeout kind → translateResponseToSdk → SDK deny
			expect(result.behavior).toBe('deny');
			expect((result as any).message).toBe('Timed out waiting for user response');
		});

		it('should not corrupt pending map when timeout fires on already-deleted entry', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.on('interaction-request', () => {});

			// Create two interactions simultaneously
			const p1 = mockFn.canUseTool!(
				'Bash', { command: 'first' },
				{ signal: new AbortController().signal, toolUseID: 'map-integrity-1' }
			);
			await flushMicrotasks();

			const p2 = mockFn.canUseTool!(
				'Write', { path: '/f.ts', content: '' },
				{ signal: new AbortController().signal, toolUseID: 'map-integrity-2' }
			);
			await flushMicrotasks();

			expect(harness.getPendingInteractionCount()).toBe(2);

			// Kill resolves both — but their timeouts are still scheduled
			harness.kill();
			const [r1, r2] = await Promise.all([p1, p2]);
			expect(r1.behavior).toBe('deny');
			expect(r2.behavior).toBe('deny');

			expect(harness.getPendingInteractionCount()).toBe(0);

			// Advance past all timeouts — should not corrupt state
			vi.advanceTimersByTime(DEFAULT_INTERACTION_TIMEOUT_MS + 1000);
			await flushMicrotasks();

			// Map is still clean, no phantom entries
			expect(harness.getPendingInteractionCount()).toBe(0);
		});
	});

	// ====================================================================
	// Validation: Response Resolution Correctness
	// ====================================================================

	describe('validation — response resolution', () => {
		it('should resolve interactions out of creation order', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			const requests: InteractionRequest[] = [];
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				requests.push(req);
			});

			// Create three interactions
			const p1 = mockFn.canUseTool!(
				'Bash', { command: 'first' },
				{ signal: new AbortController().signal, toolUseID: 'order-1' }
			);
			await flushMicrotasks();

			const p2 = mockFn.canUseTool!(
				'Write', { path: '/f.ts', content: '' },
				{ signal: new AbortController().signal, toolUseID: 'order-2' }
			);
			await flushMicrotasks();

			const p3 = mockFn.canUseTool!(
				'Read', { path: '/g.ts' },
				{ signal: new AbortController().signal, toolUseID: 'order-3' }
			);
			await flushMicrotasks();

			// Resolve in reverse order: 3, 1, 2
			await harness.respondToInteraction(requests[2].interactionId, { kind: 'approve' });
			const r3 = await p3;
			expect(r3.behavior).toBe('allow');

			await harness.respondToInteraction(requests[0].interactionId, { kind: 'deny', message: 'No' });
			const r1 = await p1;
			expect(r1.behavior).toBe('deny');
			expect((r1 as any).message).toBe('No');

			await harness.respondToInteraction(requests[1].interactionId, { kind: 'approve' });
			const r2 = await p2;
			expect(r2.behavior).toBe('allow');

			// Each SDK promise resolved to the correct response for its own interaction
			expect(harness.getPendingInteractionCount()).toBe(0);
		});

		it('should translate approve with updatedInput only (no updatedPermissions)', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			let capturedRequest: InteractionRequest | null = null;
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				capturedRequest = req;
			});

			const resultPromise = mockFn.canUseTool!(
				'Bash', { command: 'echo hello' },
				{ signal: new AbortController().signal, toolUseID: 'approve-input-only' }
			);
			await flushMicrotasks();

			await harness.respondToInteraction(capturedRequest!.interactionId, {
				kind: 'approve',
				updatedInput: { command: 'echo world' },
				// No updatedPermissions
			});

			const result = await resultPromise;
			expect(result.behavior).toBe('allow');
			expect((result as any).updatedInput).toEqual({ command: 'echo world' });
			expect((result as any).updatedPermissions).toBeUndefined();
		});

		it('should translate text response with empty string', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			let capturedRequest: InteractionRequest | null = null;
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				capturedRequest = req;
			});

			const resultPromise = mockFn.canUseTool!(
				'Bash', { command: 'test' },
				{ signal: new AbortController().signal, toolUseID: 'empty-text-1' }
			);
			await flushMicrotasks();

			await harness.respondToInteraction(capturedRequest!.interactionId, {
				kind: 'text',
				text: '',
			});

			const result = await resultPromise;
			expect(result.behavior).toBe('allow');
			expect((result as any).updatedInput).toEqual({ text: '' });
		});

		it('should match each SDK promise to the correct response when resolved concurrently', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			const requests: InteractionRequest[] = [];
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				requests.push(req);
			});

			const p1 = mockFn.canUseTool!(
				'Bash', { command: 'first' },
				{ signal: new AbortController().signal, toolUseID: 'concurrent-1' }
			);
			await flushMicrotasks();

			const p2 = mockFn.canUseTool!(
				'Write', { path: '/a.ts', content: 'content' },
				{ signal: new AbortController().signal, toolUseID: 'concurrent-2' }
			);
			await flushMicrotasks();

			// Respond to both, then await both
			await harness.respondToInteraction(requests[0].interactionId, {
				kind: 'deny', message: 'denied-first',
			});
			await harness.respondToInteraction(requests[1].interactionId, {
				kind: 'approve', updatedInput: { modified: true },
			});

			const [r1, r2] = await Promise.all([p1, p2]);

			// First interaction's SDK promise → deny
			expect(r1.behavior).toBe('deny');
			expect((r1 as any).message).toBe('denied-first');

			// Second interaction's SDK promise → allow with updated input
			expect(r2.behavior).toBe('allow');
			expect((r2 as any).updatedInput).toEqual({ modified: true });
		});

		it('should translate deny with message and interrupt flag correctly', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			let capturedRequest: InteractionRequest | null = null;
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				capturedRequest = req;
			});

			const resultPromise = mockFn.canUseTool!(
				'Bash', { command: 'rm -rf /' },
				{ signal: new AbortController().signal, toolUseID: 'deny-full-1' }
			);
			await flushMicrotasks();

			await harness.respondToInteraction(capturedRequest!.interactionId, {
				kind: 'deny',
				message: 'Dangerous operation blocked',
				interrupt: true,
			});

			const result = await resultPromise;
			expect(result.behavior).toBe('deny');
			expect((result as any).message).toBe('Dangerous operation blocked');
			expect((result as any).interrupt).toBe(true);
		});
	});

	// ====================================================================
	// Validation: Invalid Interaction IDs and Cleanup on Kill/Interrupt
	// ====================================================================

	describe('validation — invalid interaction IDs and cleanup on kill/interrupt', () => {
		// ------- Invalid interaction IDs -------

		it('should throw for UUID-format ID that was never issued by the harness', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			// A properly formatted UUID, but one the harness never created
			const fakeUuid = '00000000-0000-4000-8000-000000000000';

			await expect(
				harness.respondToInteraction(fakeUuid, { kind: 'approve' })
			).rejects.toThrow('Unknown or expired interaction ID');

			expect(harness.isRunning()).toBe(true);
			expect(harness.getPendingInteractionCount()).toBe(0);
		});

		it('should reject an ID from a previous harness lifecycle (spawn → kill → new harness)', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			let capturedRequest: InteractionRequest | null = null;
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				capturedRequest = req;
			});

			// Create an interaction in the first lifecycle
			const p1 = mockFn.canUseTool!(
				'Bash',
				{ command: 'test' },
				{ signal: new AbortController().signal, toolUseID: 'lifecycle-1' }
			);
			await flushMicrotasks();

			const firstLifecycleId = capturedRequest!.interactionId;

			// Kill resolves it with termination
			harness.kill();
			const r1 = await p1;
			expect(r1.behavior).toBe('deny');

			// Create a fresh harness instance (simulating the next lifecycle)
			const newMock = createMockQueryFn();
			const newHarness = new ClaudeCodeHarness(newMock.queryFn);
			const result = await newHarness.spawn(createTestConfig());
			expect(result.success).toBe(true);

			// The old ID from the first harness lifecycle should be rejected
			await expect(
				newHarness.respondToInteraction(firstLifecycleId, { kind: 'approve' })
			).rejects.toThrow('Unknown or expired interaction ID');

			// New harness is still running, no corruption
			expect(newHarness.isRunning()).toBe(true);
			expect(newHarness.getPendingInteractionCount()).toBe(0);

			newHarness.kill();
		});

		it('should reject IDs cleared by stream completion', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			let capturedRequest: InteractionRequest | null = null;
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				capturedRequest = req;
			});

			const p1 = mockFn.canUseTool!(
				'Bash',
				{ command: 'test' },
				{ signal: new AbortController().signal, toolUseID: 'stream-end-1' }
			);
			await flushMicrotasks();

			const streamEndId = capturedRequest!.interactionId;
			expect(harness.getPendingInteractionCount()).toBe(1);

			// Complete the SDK message stream — triggers finally-block resolveAllPending
			mockFn.complete();
			await flushMicrotasks();

			const r1 = await p1;
			expect(r1.behavior).toBe('deny');
			expect((r1 as any).message).toBe('Session terminated');

			// ID is gone — should throw
			await expect(
				harness.respondToInteraction(streamEndId, { kind: 'approve' })
			).rejects.toThrow('Unknown or expired interaction ID');
		});

		it('should not corrupt existing pending interactions when responding with invalid IDs', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			const requests: InteractionRequest[] = [];
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				requests.push(req);
			});

			// Create a real interaction
			const p1 = mockFn.canUseTool!(
				'Read',
				{ path: '/valid.ts' },
				{ signal: new AbortController().signal, toolUseID: 'corrupt-test-1' }
			);
			await flushMicrotasks();

			const validId = requests[0].interactionId;
			expect(harness.getPendingInteractionCount()).toBe(1);

			// Fire several invalid IDs — these should not affect the valid pending interaction
			for (const badId of ['fake-1', 'fake-2', '', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee']) {
				await expect(
					harness.respondToInteraction(badId, { kind: 'approve' })
				).rejects.toThrow('Unknown or expired interaction ID');
			}

			// Valid interaction is still pending and uncorrupted
			expect(harness.getPendingInteractionCount()).toBe(1);
			expect(harness.hasPendingInteraction(validId)).toBe(true);

			// Resolve the valid one — it should still work perfectly
			await harness.respondToInteraction(validId, { kind: 'approve' });
			const r1 = await p1;
			expect(r1.behavior).toBe('allow');
			expect(harness.getPendingInteractionCount()).toBe(0);
		});

		it('should interleave valid and invalid responses correctly without confusion', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			const requests: InteractionRequest[] = [];
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				requests.push(req);
			});

			// Create two real interactions
			const p1 = mockFn.canUseTool!(
				'Bash', { command: 'first' },
				{ signal: new AbortController().signal, toolUseID: 'interleave-1' }
			);
			await flushMicrotasks();

			const p2 = mockFn.canUseTool!(
				'Write', { path: '/a.ts', content: '' },
				{ signal: new AbortController().signal, toolUseID: 'interleave-2' }
			);
			await flushMicrotasks();

			expect(harness.getPendingInteractionCount()).toBe(2);

			// Invalid response attempt
			await expect(
				harness.respondToInteraction('totally-bogus', { kind: 'approve' })
			).rejects.toThrow('Unknown or expired interaction ID');

			// Valid response to first
			await harness.respondToInteraction(requests[0].interactionId, {
				kind: 'deny', message: 'nope',
			});

			// Another invalid attempt
			await expect(
				harness.respondToInteraction('also-bogus', { kind: 'deny' })
			).rejects.toThrow('Unknown or expired interaction ID');

			// Valid response to second
			await harness.respondToInteraction(requests[1].interactionId, {
				kind: 'approve',
			});

			const [r1, r2] = await Promise.all([p1, p2]);
			expect(r1.behavior).toBe('deny');
			expect((r1 as any).message).toBe('nope');
			expect(r2.behavior).toBe('allow');
			expect(harness.getPendingInteractionCount()).toBe(0);
		});

		// ------- Cleanup on kill -------

		it('kill() should resolve mixed tool-approval and clarification with correct SDK shapes per kind', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.on('interaction-request', () => {});

			// Tool approval
			const pTool = mockFn.canUseTool!(
				'Bash', { command: 'rm file' },
				{ signal: new AbortController().signal, toolUseID: 'kill-mix-1' }
			);
			await flushMicrotasks();

			// Clarification
			const pClarify = mockFn.canUseTool!(
				'AskUserQuestion',
				{ questions: [{ question: 'Which?', header: 'Q', options: [], multiSelect: false }] },
				{ signal: new AbortController().signal, toolUseID: 'kill-mix-2' }
			);
			await flushMicrotasks();

			// Second tool approval
			const pTool2 = mockFn.canUseTool!(
				'Write', { path: '/f.ts', content: '' },
				{ signal: new AbortController().signal, toolUseID: 'kill-mix-3' }
			);
			await flushMicrotasks();

			expect(harness.getPendingInteractionCount()).toBe(3);

			harness.kill();

			const [rTool, rClarify, rTool2] = await Promise.all([pTool, pClarify, pTool2]);

			// Tool approvals → deny with interrupt flag and "Session terminated" message
			expect(rTool.behavior).toBe('deny');
			expect((rTool as any).message).toBe('Session terminated');
			expect((rTool as any).interrupt).toBe(true);

			// Clarification → cancel → SDK deny with "Session terminated" message, no interrupt flag
			expect(rClarify.behavior).toBe('deny');
			expect((rClarify as any).message).toBe('Session terminated');

			// Second tool approval → same as first
			expect(rTool2.behavior).toBe('deny');
			expect((rTool2 as any).message).toBe('Session terminated');
			expect((rTool2 as any).interrupt).toBe(true);

			expect(harness.getPendingInteractionCount()).toBe(0);
		});

		it('kill() after partial resolution only terminates unresolved interactions', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			const requests: InteractionRequest[] = [];
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				requests.push(req);
			});

			const p1 = mockFn.canUseTool!(
				'Bash', { command: 'first' },
				{ signal: new AbortController().signal, toolUseID: 'partial-kill-1' }
			);
			await flushMicrotasks();

			const p2 = mockFn.canUseTool!(
				'Write', { path: '/f.ts', content: '' },
				{ signal: new AbortController().signal, toolUseID: 'partial-kill-2' }
			);
			await flushMicrotasks();

			const p3 = mockFn.canUseTool!(
				'Read', { path: '/g.ts' },
				{ signal: new AbortController().signal, toolUseID: 'partial-kill-3' }
			);
			await flushMicrotasks();

			expect(harness.getPendingInteractionCount()).toBe(3);

			// Resolve the first one manually
			await harness.respondToInteraction(requests[0].interactionId, { kind: 'approve' });
			const r1 = await p1;
			expect(r1.behavior).toBe('allow');
			expect(harness.getPendingInteractionCount()).toBe(2);

			// Now kill — only the remaining two get termination responses
			harness.kill();

			const [r2, r3] = await Promise.all([p2, p3]);
			expect(r2.behavior).toBe('deny');
			expect((r2 as any).message).toBe('Session terminated');
			expect(r3.behavior).toBe('deny');
			expect((r3 as any).message).toBe('Session terminated');

			expect(harness.getPendingInteractionCount()).toBe(0);
		});

		it('kill() makes hasPendingInteraction() return false for ALL prior IDs', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			const requests: InteractionRequest[] = [];
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				requests.push(req);
			});

			mockFn.canUseTool!(
				'Bash', { command: 'a' },
				{ signal: new AbortController().signal, toolUseID: 'has-check-k1' }
			);
			await flushMicrotasks();

			mockFn.canUseTool!(
				'Write', { path: '/f.ts', content: '' },
				{ signal: new AbortController().signal, toolUseID: 'has-check-k2' }
			);
			await flushMicrotasks();

			const allIds = requests.map((r) => r.interactionId);
			expect(allIds.every((id) => harness.hasPendingInteraction(id))).toBe(true);

			harness.kill();
			await flushMicrotasks();

			// Every ID should now be gone
			expect(allIds.every((id) => !harness.hasPendingInteraction(id))).toBe(true);
			expect(harness.getPendingInteractionCount()).toBe(0);
		});

		it('kill() calls SDK close() exactly once regardless of pending count', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.on('interaction-request', () => {});

			// Create three pending interactions
			for (let i = 0; i < 3; i++) {
				mockFn.canUseTool!(
					'Bash', { command: `cmd-${i}` },
					{ signal: new AbortController().signal, toolUseID: `close-once-${i}` }
				);
				await flushMicrotasks();
			}
			expect(harness.getPendingInteractionCount()).toBe(3);

			harness.kill();

			expect(mockFn.query.close).toHaveBeenCalledTimes(1);
		});

		it('kill() then immediate respondToInteraction fails cleanly for every cleared ID', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			const requests: InteractionRequest[] = [];
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				requests.push(req);
			});

			for (let i = 0; i < 3; i++) {
				mockFn.canUseTool!(
					'Bash', { command: `post-kill-${i}` },
					{ signal: new AbortController().signal, toolUseID: `post-kill-id-${i}` }
				);
				await flushMicrotasks();
			}

			harness.kill();
			await flushMicrotasks();

			// Every ID should throw with a consistent error
			for (const req of requests) {
				await expect(
					harness.respondToInteraction(req.interactionId, { kind: 'approve' })
				).rejects.toThrow('Unknown or expired interaction ID');
			}
		});

		// ------- Cleanup on interrupt -------

		it('interrupt() should resolve mixed tool-approval and clarification with correct shapes per kind', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.on('interaction-request', () => {});

			// Tool approval
			const pTool = mockFn.canUseTool!(
				'Edit', { file: 'test.ts' },
				{ signal: new AbortController().signal, toolUseID: 'int-mix-1' }
			);
			await flushMicrotasks();

			// Clarification
			const pClarify = mockFn.canUseTool!(
				'AskUserQuestion',
				{ questions: [{ question: 'Name?', header: 'N', options: [], multiSelect: false }] },
				{ signal: new AbortController().signal, toolUseID: 'int-mix-2' }
			);
			await flushMicrotasks();

			expect(harness.getPendingInteractionCount()).toBe(2);

			await harness.interrupt();

			const [rTool, rClarify] = await Promise.all([pTool, pClarify]);

			// Tool approval → deny with interrupt flag
			expect(rTool.behavior).toBe('deny');
			expect((rTool as any).message).toBe('Session interrupted');
			expect((rTool as any).interrupt).toBe(true);

			// Clarification → cancel → SDK deny
			expect(rClarify.behavior).toBe('deny');
			expect((rClarify as any).message).toBe('Session interrupted');

			expect(harness.getPendingInteractionCount()).toBe(0);
		});

		it('interrupt() after partial resolution only interrupts unresolved interactions', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			const requests: InteractionRequest[] = [];
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				requests.push(req);
			});

			const p1 = mockFn.canUseTool!(
				'Bash', { command: 'first' },
				{ signal: new AbortController().signal, toolUseID: 'partial-int-1' }
			);
			await flushMicrotasks();

			const p2 = mockFn.canUseTool!(
				'Write', { path: '/f.ts', content: '' },
				{ signal: new AbortController().signal, toolUseID: 'partial-int-2' }
			);
			await flushMicrotasks();

			expect(harness.getPendingInteractionCount()).toBe(2);

			// Resolve the second one manually
			await harness.respondToInteraction(requests[1].interactionId, { kind: 'deny', message: 'No writes' });
			const r2 = await p2;
			expect(r2.behavior).toBe('deny');
			expect((r2 as any).message).toBe('No writes');
			expect(harness.getPendingInteractionCount()).toBe(1);

			// Interrupt — only the first (still pending) gets interrupt response
			await harness.interrupt();

			const r1 = await p1;
			expect(r1.behavior).toBe('deny');
			expect((r1 as any).message).toBe('Session interrupted');
			expect((r1 as any).interrupt).toBe(true);

			expect(harness.getPendingInteractionCount()).toBe(0);
		});

		it('interrupt() makes hasPendingInteraction() return false for ALL prior IDs', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			const requests: InteractionRequest[] = [];
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				requests.push(req);
			});

			mockFn.canUseTool!(
				'Bash', { command: 'x' },
				{ signal: new AbortController().signal, toolUseID: 'has-check-i1' }
			);
			await flushMicrotasks();

			mockFn.canUseTool!(
				'Read', { path: '/z.ts' },
				{ signal: new AbortController().signal, toolUseID: 'has-check-i2' }
			);
			await flushMicrotasks();

			const allIds = requests.map((r) => r.interactionId);
			expect(allIds.every((id) => harness.hasPendingInteraction(id))).toBe(true);

			await harness.interrupt();
			await flushMicrotasks();

			expect(allIds.every((id) => !harness.hasPendingInteraction(id))).toBe(true);
			expect(harness.getPendingInteractionCount()).toBe(0);
		});

		it('interrupt() calls SDK interrupt() exactly once regardless of pending count', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.on('interaction-request', () => {});

			for (let i = 0; i < 4; i++) {
				mockFn.canUseTool!(
					'Bash', { command: `cmd-${i}` },
					{ signal: new AbortController().signal, toolUseID: `int-once-${i}` }
				);
				await flushMicrotasks();
			}
			expect(harness.getPendingInteractionCount()).toBe(4);

			await harness.interrupt();

			expect(mockFn.query.interrupt).toHaveBeenCalledTimes(1);
		});

		it('interrupt() then immediate respondToInteraction fails cleanly for every cleared ID', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			const requests: InteractionRequest[] = [];
			harness.on('interaction-request', (_sid: string, req: InteractionRequest) => {
				requests.push(req);
			});

			for (let i = 0; i < 3; i++) {
				mockFn.canUseTool!(
					'Bash', { command: `post-int-${i}` },
					{ signal: new AbortController().signal, toolUseID: `post-int-id-${i}` }
				);
				await flushMicrotasks();
			}

			await harness.interrupt();
			await flushMicrotasks();

			for (const req of requests) {
				await expect(
					harness.respondToInteraction(req.interactionId, { kind: 'approve' })
				).rejects.toThrow('Unknown or expired interaction ID');
			}
		});
	});

	// ====================================================================
	// Validation — Claude event mapping into shared events
	// ====================================================================

	describe('validation — Claude event mapping into shared events', () => {
		// -- Assistant message mapping --

		it('should emit separate data events for each text block in a single assistant message', async () => {
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
						{ type: 'text', text: 'First paragraph.' },
						{ type: 'text', text: 'Second paragraph.' },
						{ type: 'text', text: 'Third paragraph.' },
					],
				},
			} as any);

			await flushMicrotasks();

			expect(dataEvents).toEqual(['First paragraph.', 'Second paragraph.', 'Third paragraph.']);
		});

		it('should emit both data and thinking-chunk from mixed content blocks in one assistant message', async () => {
			const dataEvents: string[] = [];
			const thinkingEvents: string[] = [];

			harness.on('data', (_sid: string, data: string) => {
				dataEvents.push(data);
			});
			harness.on('thinking-chunk', (_sid: string, text: string) => {
				thinkingEvents.push(text);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'assistant',
				message: {
					content: [
						{ type: 'thinking', thinking: 'Analyzing the problem...' },
						{ type: 'text', text: 'Here is my answer.' },
						{ type: 'thinking', thinking: 'Checking edge cases...' },
					],
				},
			} as any);

			await flushMicrotasks();

			expect(dataEvents).toEqual(['Here is my answer.']);
			expect(thinkingEvents).toEqual(['Analyzing the problem...', 'Checking edge cases...']);
		});

		it('should emit no events from assistant message with empty content array', async () => {
			const allEvents: Array<{ event: string; data: unknown }> = [];

			for (const eventName of ['data', 'thinking-chunk', 'tool-execution']) {
				harness.on(eventName, (_sid: string, data: unknown) => {
					allEvents.push({ event: eventName, data });
				});
			}

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'assistant',
				message: { content: [] },
			} as any);

			await flushMicrotasks();

			expect(allEvents).toHaveLength(0);
		});

		it('should ignore non-text/non-thinking content blocks in assistant messages (e.g., tool_use)', async () => {
			const dataEvents: string[] = [];
			const thinkingEvents: string[] = [];

			harness.on('data', (_sid: string, data: string) => {
				dataEvents.push(data);
			});
			harness.on('thinking-chunk', (_sid: string, text: string) => {
				thinkingEvents.push(text);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'assistant',
				message: {
					content: [
						{ type: 'text', text: 'Before tool.' },
						{ type: 'tool_use', id: 'tu-1', name: 'Bash', input: { command: 'ls' } },
						{ type: 'text', text: 'After tool.' },
					],
				},
			} as any);

			await flushMicrotasks();

			expect(dataEvents).toEqual(['Before tool.', 'After tool.']);
			expect(thinkingEvents).toHaveLength(0);
		});

		// -- System init message mapping --

		it('should emit runtime-metadata with capabilities even when init has no optional fields', async () => {
			const metadataEvents: RuntimeMetadataEvent[] = [];
			harness.on('runtime-metadata', (_sid: string, meta: RuntimeMetadataEvent) => {
				metadataEvents.push(meta);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'system',
				subtype: 'init',
				session_id: 'bare-init-session',
			} as any);

			await flushMicrotasks();

			expect(metadataEvents.length).toBeGreaterThanOrEqual(1);
			const initMeta = metadataEvents.find((m) => m.replace === true);
			expect(initMeta).toBeDefined();
			expect(initMeta!.capabilities).toBeDefined();
			expect(initMeta!.capabilities!.supportsMidTurnInput).toBe(true);
			// Optional fields should be absent, not empty arrays
			expect(initMeta!.skills).toBeUndefined();
			expect(initMeta!.availableAgents).toBeUndefined();
			expect(initMeta!.availableModels).toBeUndefined();
		});

		it('should ignore system messages with non-init subtype', async () => {
			const sessionIdEvents: string[] = [];
			const metadataEvents: RuntimeMetadataEvent[] = [];

			harness.on('session-id', (_sid: string, agentSessionId: string) => {
				sessionIdEvents.push(agentSessionId);
			});
			harness.on('runtime-metadata', (_sid: string, meta: RuntimeMetadataEvent) => {
				metadataEvents.push(meta);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'system',
				subtype: 'heartbeat',
				session_id: 'should-not-appear',
			} as any);

			await flushMicrotasks();

			expect(sessionIdEvents).toHaveLength(0);
			expect(metadataEvents).toHaveLength(0);
		});

		it('should map slash_commands to string names regardless of string or object format', async () => {
			const metadataEvents: RuntimeMetadataEvent[] = [];
			harness.on('runtime-metadata', (_sid: string, meta: RuntimeMetadataEvent) => {
				metadataEvents.push(meta);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'system',
				subtype: 'init',
				session_id: 'slash-fmt-session',
				slash_commands: [
					'/compact',
					{ name: '/review' },
					{ name: '/commit', description: 'Commit changes' },
				],
			} as any);

			await flushMicrotasks();

			const initMeta = metadataEvents.find((m) => m.replace === true);
			expect(initMeta).toBeDefined();
			expect(initMeta!.slashCommands).toEqual(['/compact', '/review', '/commit']);
		});

		// -- Result message mapping --

		it('should emit query-complete and exit without usage event when result has no usage data', async () => {
			const usageEvents: unknown[] = [];
			const exitEvents: number[] = [];
			const queryCompleteEvents: unknown[] = [];

			harness.on('usage', (_sid: string, stats: unknown) => {
				usageEvents.push(stats);
			});
			harness.on('exit', (_sid: string, code: number) => {
				exitEvents.push(code);
			});
			harness.on('query-complete', (_sid: string, data: unknown) => {
				queryCompleteEvents.push(data);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'result',
				subtype: 'success',
			} as any);

			await flushMicrotasks();

			expect(usageEvents).toHaveLength(0);
			expect(queryCompleteEvents).toHaveLength(1);
			expect(exitEvents).toContain(0);
		});

		it('should emit separate agent-error for each error in result message', async () => {
			const errorEvents: any[] = [];
			harness.on('agent-error', (_sid: string, err: any) => {
				errorEvents.push(err);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'result',
				subtype: 'error_unknown',
				errors: [
					{ message: 'First error' },
					{ message: 'Second error' },
					{ message: 'Third error' },
				],
			} as any);

			await flushMicrotasks();

			expect(errorEvents).toHaveLength(3);
			expect(errorEvents[0].message).toBe('First error');
			expect(errorEvents[1].message).toBe('Second error');
			expect(errorEvents[2].message).toBe('Third error');
		});

		it('should map all non-success result subtypes to exit code 1', async () => {
			const subtypes = ['error_max_turns', 'error_budget', 'error_tool_use', 'error_unknown'];

			for (const subtype of subtypes) {
				const localMockFn = createMockQueryFn();
				const localHarness = new ClaudeCodeHarness(localMockFn.queryFn);

				const exitEvents: number[] = [];
				localHarness.on('exit', (_sid: string, code: number) => {
					exitEvents.push(code);
				});

				await localHarness.spawn(createTestConfig());
				await flushMicrotasks();

				localMockFn.pushMessage({
					type: 'result',
					subtype,
				} as any);

				await flushMicrotasks();

				expect(exitEvents).toContain(1);
				localHarness.kill();
			}
		});

		it('should map success result subtype to exit code 0', async () => {
			const exitEvents: number[] = [];
			harness.on('exit', (_sid: string, code: number) => {
				exitEvents.push(code);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'result',
				subtype: 'success',
			} as any);

			await flushMicrotasks();

			expect(exitEvents).toEqual([0]);
		});

		// -- Error event mapping --

		it('should emit agent-error for auth_status "error" (not just "expired")', async () => {
			const errorEvents: any[] = [];
			harness.on('agent-error', (_sid: string, err: any) => {
				errorEvents.push(err);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'auth_status',
				status: 'error',
				message: 'Authentication failed',
			} as any);

			await flushMicrotasks();

			expect(errorEvents).toHaveLength(1);
			expect(errorEvents[0].type).toBe('auth_expired');
			expect(errorEvents[0].message).toBe('Authentication failed');
			expect(errorEvents[0].recoverable).toBe(true);
		});

		it('should NOT emit agent-error for auth_status "ok"', async () => {
			const errorEvents: any[] = [];
			harness.on('agent-error', (_sid: string, err: any) => {
				errorEvents.push(err);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'auth_status',
				status: 'ok',
			} as any);

			await flushMicrotasks();

			expect(errorEvents).toHaveLength(0);
		});

		it('should use fallback message for rate_limit with no message field', async () => {
			const errorEvents: any[] = [];
			harness.on('agent-error', (_sid: string, err: any) => {
				errorEvents.push(err);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'rate_limit',
			} as any);

			await flushMicrotasks();

			expect(errorEvents).toHaveLength(1);
			expect(errorEvents[0].message).toBe('Rate limit hit');
			expect(errorEvents[0].type).toBe('rate_limited');
		});

		it('should use fallback message for auth_status with no message field', async () => {
			const errorEvents: any[] = [];
			harness.on('agent-error', (_sid: string, err: any) => {
				errorEvents.push(err);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'auth_status',
				status: 'expired',
			} as any);

			await flushMicrotasks();

			expect(errorEvents).toHaveLength(1);
			expect(errorEvents[0].message).toBe('Authentication error');
		});

		// -- Tool event mapping --

		it('should fall back to "unknown" for tool_use_summary with missing tool_name', async () => {
			const toolEvents: any[] = [];
			harness.on('tool-execution', (_sid: string, tool: any) => {
				toolEvents.push(tool);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'tool_use_summary',
				tool_use_id: 'tu-missing-name',
				input: { command: 'ls' },
				output: 'files',
			} as any);

			await flushMicrotasks();

			expect(toolEvents).toHaveLength(1);
			expect(toolEvents[0].toolName).toBe('unknown');
			expect(toolEvents[0].state.input).toEqual({ command: 'ls' });
			expect(toolEvents[0].state.output).toBe('files');
		});

		it('should fall back to "unknown" for tool_progress with missing tool_name', async () => {
			const toolEvents: any[] = [];
			harness.on('tool-execution', (_sid: string, tool: any) => {
				toolEvents.push(tool);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'tool_progress',
				tool_use_id: 'tp-missing-name',
				content: 'Working...',
			} as any);

			await flushMicrotasks();

			expect(toolEvents).toHaveLength(1);
			expect(toolEvents[0].toolName).toBe('unknown');
			expect(toolEvents[0].state.progress).toBe(true);
			expect(toolEvents[0].state.content).toBe('Working...');
		});

		it('should pass error field through in tool_use_summary state', async () => {
			const toolEvents: any[] = [];
			harness.on('tool-execution', (_sid: string, tool: any) => {
				toolEvents.push(tool);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'tool_use_summary',
				tool_name: 'Bash',
				tool_use_id: 'tu-error',
				input: { command: 'bad-cmd' },
				error: 'Command not found',
			} as any);

			await flushMicrotasks();

			expect(toolEvents).toHaveLength(1);
			expect(toolEvents[0].toolName).toBe('Bash');
			expect(toolEvents[0].state.error).toBe('Command not found');
		});

		// -- Unknown message type --

		it('should not emit any events for unknown message types', async () => {
			const allEvents: Array<{ event: string; data: unknown }> = [];

			for (const eventName of ['data', 'thinking-chunk', 'tool-execution', 'agent-error', 'usage', 'exit', 'query-complete', 'session-id', 'runtime-metadata', 'slash-commands']) {
				harness.on(eventName, (...args: unknown[]) => {
					allEvents.push({ event: eventName, data: args });
				});
			}

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({ type: 'custom_vendor_event', payload: 'something' } as any);

			await flushMicrotasks();

			expect(allEvents).toHaveLength(0);
		});

		// -- Session ID propagation --

		it('should propagate correct session ID to all emitted events', async () => {
			const sessionIds = new Map<string, string[]>();
			const trackEvent = (eventName: string) => {
				harness.on(eventName, (sid: string, ..._args: unknown[]) => {
					if (!sessionIds.has(eventName)) sessionIds.set(eventName, []);
					sessionIds.get(eventName)!.push(sid);
				});
			};

			for (const name of ['data', 'thinking-chunk', 'tool-execution', 'agent-error', 'usage', 'exit', 'query-complete', 'session-id', 'runtime-metadata', 'slash-commands']) {
				trackEvent(name);
			}

			const testSessionId = 'propagation-test-session';
			await harness.spawn(createTestConfig({ sessionId: testSessionId }));
			await flushMicrotasks();

			// Push messages that trigger different event types
			mockFn.pushMessage({
				type: 'system',
				subtype: 'init',
				session_id: 'claude-internal',
				slash_commands: [{ name: '/test' }],
				skills: [{ name: 'test-skill' }],
			} as any);
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'assistant',
				message: { content: [{ type: 'text', text: 'Hello' }, { type: 'thinking', thinking: 'Hmm' }] },
			} as any);
			await flushMicrotasks();

			mockFn.pushMessage({ type: 'rate_limit', message: 'Slow down' } as any);
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'tool_use_summary',
				tool_name: 'Read',
				tool_use_id: 'tu-prop',
				input: {},
			} as any);
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'result',
				subtype: 'success',
				total_cost_usd: 0.01,
				usage: { input_tokens: 10, output_tokens: 5 },
				duration_ms: 100,
			} as any);
			await flushMicrotasks();

			// Every event emitted should carry the Maestro session ID, not the Claude session ID
			for (const [, sids] of sessionIds) {
				for (const sid of sids) {
					expect(sid).toBe(testSessionId);
				}
			}

			// Verify that events were actually emitted for the key event types
			expect(sessionIds.has('data')).toBe(true);
			expect(sessionIds.has('thinking-chunk')).toBe(true);
			expect(sessionIds.has('runtime-metadata')).toBe(true);
			expect(sessionIds.has('session-id')).toBe(true);
			expect(sessionIds.has('tool-execution')).toBe(true);
			expect(sessionIds.has('agent-error')).toBe(true);
			expect(sessionIds.has('usage')).toBe(true);
			expect(sessionIds.has('exit')).toBe(true);
			expect(sessionIds.has('query-complete')).toBe(true);
		});

		// -- Stream error mapping --

		it('should emit agent-error when SDK message stream throws', async () => {
			const errorEvents: any[] = [];
			harness.on('agent-error', (_sid: string, err: any) => {
				errorEvents.push(err);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.error(new Error('Connection reset by peer'));
			await flushMicrotasks();

			expect(errorEvents).toHaveLength(1);
			expect(errorEvents[0].type).toBe('unknown');
			expect(errorEvents[0].message).toContain('Connection reset by peer');
			expect(errorEvents[0].recoverable).toBe(false);
			expect(errorEvents[0].agentId).toBe('claude-code');
			expect(errorEvents[0].sessionId).toBe('test-session-1');
		});

		// -- Result message usage field defaults --

		it('should default missing usage fields to 0', async () => {
			const usageEvents: any[] = [];
			harness.on('usage', (_sid: string, stats: any) => {
				usageEvents.push(stats);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'result',
				subtype: 'success',
				total_cost_usd: 0.02,
				usage: {
					input_tokens: 500,
					// output_tokens, cache_read, cache_creation all omitted
				},
			} as any);

			await flushMicrotasks();

			expect(usageEvents).toHaveLength(1);
			expect(usageEvents[0].inputTokens).toBe(500);
			expect(usageEvents[0].outputTokens).toBe(0);
			expect(usageEvents[0].cacheReadInputTokens).toBe(0);
			expect(usageEvents[0].cacheCreationInputTokens).toBe(0);
			expect(usageEvents[0].totalCostUsd).toBe(0.02);
		});

		// -- Multi-message sequence end-to-end --

		it('should correctly map a full conversation sequence of multiple SDK messages', async () => {
			const dataEvents: string[] = [];
			const thinkingEvents: string[] = [];
			const toolEvents: any[] = [];
			const usageEvents: any[] = [];
			const exitEvents: number[] = [];

			harness.on('data', (_sid: string, d: string) => dataEvents.push(d));
			harness.on('thinking-chunk', (_sid: string, t: string) => thinkingEvents.push(t));
			harness.on('tool-execution', (_sid: string, te: any) => toolEvents.push(te));
			harness.on('usage', (_sid: string, u: any) => usageEvents.push(u));
			harness.on('exit', (_sid: string, c: number) => exitEvents.push(c));

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			// Simulate: thinking → text → tool use summary → more text → result
			mockFn.pushMessage({
				type: 'assistant',
				message: { content: [{ type: 'thinking', thinking: 'Planning approach...' }] },
			} as any);
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'assistant',
				message: { content: [{ type: 'text', text: 'Let me check that file.' }] },
			} as any);
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'tool_use_summary',
				tool_name: 'Read',
				tool_use_id: 'tu-seq-1',
				input: { path: '/src/main.ts' },
				output: 'const x = 1;',
			} as any);
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'assistant',
				message: { content: [{ type: 'text', text: 'The file contains a constant.' }] },
			} as any);
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'result',
				subtype: 'success',
				total_cost_usd: 0.03,
				usage: { input_tokens: 200, output_tokens: 100 },
				duration_ms: 5000,
			} as any);
			await flushMicrotasks();

			expect(thinkingEvents).toEqual(['Planning approach...']);
			expect(dataEvents).toEqual(['Let me check that file.', 'The file contains a constant.']);
			expect(toolEvents).toHaveLength(1);
			expect(toolEvents[0].toolName).toBe('Read');
			expect(usageEvents).toHaveLength(1);
			expect(usageEvents[0].inputTokens).toBe(200);
			expect(exitEvents).toEqual([0]);
		});
	});

	// ====================================================================
	// Validation — Runtime metadata emission for supported models,
	// slash commands, skills, and related data
	// ====================================================================

	describe('validation — runtime metadata emission for supported models, slash commands, skills, and related data', () => {

		// -- Skills mapping --

		it('should map multiple skills with correct id, name, and description fields', async () => {
			const metadataEvents: RuntimeMetadataEvent[] = [];
			harness.on('runtime-metadata', (_sid: string, meta: RuntimeMetadataEvent) => {
				metadataEvents.push(meta);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'system',
				subtype: 'init',
				session_id: 'sess-skills-multi',
				skills: [
					{ name: 'tdd', description: 'Test-driven development' },
					{ name: 'debugging', description: 'Systematic debugging' },
					{ name: 'brainstorming', description: 'Creative ideation' },
				],
			} as any);
			await flushMicrotasks();

			const initMeta = metadataEvents.find((m) => m.replace === true);
			expect(initMeta).toBeDefined();
			expect(initMeta!.skills).toHaveLength(3);
			expect(initMeta!.skills).toEqual([
				{ id: 'tdd', name: 'tdd', description: 'Test-driven development' },
				{ id: 'debugging', name: 'debugging', description: 'Systematic debugging' },
				{ id: 'brainstorming', name: 'brainstorming', description: 'Creative ideation' },
			]);
		});

		it('should map skills with missing description as undefined', async () => {
			const metadataEvents: RuntimeMetadataEvent[] = [];
			harness.on('runtime-metadata', (_sid: string, meta: RuntimeMetadataEvent) => {
				metadataEvents.push(meta);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'system',
				subtype: 'init',
				session_id: 'sess-skills-nodesc',
				skills: [
					{ name: 'minimal-skill' },
				],
			} as any);
			await flushMicrotasks();

			const initMeta = metadataEvents.find((m) => m.replace === true);
			expect(initMeta!.skills).toHaveLength(1);
			expect(initMeta!.skills![0].id).toBe('minimal-skill');
			expect(initMeta!.skills![0].name).toBe('minimal-skill');
			expect(initMeta!.skills![0].description).toBeUndefined();
		});

		it('should use skill name as both id and name (identity mapping)', async () => {
			const metadataEvents: RuntimeMetadataEvent[] = [];
			harness.on('runtime-metadata', (_sid: string, meta: RuntimeMetadataEvent) => {
				metadataEvents.push(meta);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'system',
				subtype: 'init',
				session_id: 'sess-skills-id',
				skills: [{ name: 'my-custom-skill', description: 'Custom' }],
			} as any);
			await flushMicrotasks();

			const skill = metadataEvents.find((m) => m.replace === true)!.skills![0];
			expect(skill.id).toBe(skill.name);
			expect(skill.id).toBe('my-custom-skill');
		});

		it('should omit skills field from metadata when init has no skills', async () => {
			const metadataEvents: RuntimeMetadataEvent[] = [];
			harness.on('runtime-metadata', (_sid: string, meta: RuntimeMetadataEvent) => {
				metadataEvents.push(meta);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'system',
				subtype: 'init',
				session_id: 'sess-no-skills',
			} as any);
			await flushMicrotasks();

			const initMeta = metadataEvents.find((m) => m.replace === true);
			expect(initMeta).toBeDefined();
			expect(initMeta!.skills).toBeUndefined();
		});

		// -- Slash commands mapping --

		it('should map object-format slash commands to string names in metadata', async () => {
			const metadataEvents: RuntimeMetadataEvent[] = [];
			harness.on('runtime-metadata', (_sid: string, meta: RuntimeMetadataEvent) => {
				metadataEvents.push(meta);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'system',
				subtype: 'init',
				session_id: 'sess-cmds-obj',
				slash_commands: [
					{ name: '/commit', description: 'Commit changes' },
					{ name: '/review', description: 'Review PR' },
					{ name: '/help', description: 'Get help' },
				],
			} as any);
			await flushMicrotasks();

			const initMeta = metadataEvents.find((m) => m.replace === true);
			expect(initMeta!.slashCommands).toEqual(['/commit', '/review', '/help']);
		});

		it('should map string-format slash commands directly', async () => {
			const metadataEvents: RuntimeMetadataEvent[] = [];
			harness.on('runtime-metadata', (_sid: string, meta: RuntimeMetadataEvent) => {
				metadataEvents.push(meta);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'system',
				subtype: 'init',
				session_id: 'sess-cmds-str',
				slash_commands: ['/commit', '/review', '/help'],
			} as any);
			await flushMicrotasks();

			const initMeta = metadataEvents.find((m) => m.replace === true);
			expect(initMeta!.slashCommands).toEqual(['/commit', '/review', '/help']);
		});

		it('should handle mixed string and object slash command formats', async () => {
			const metadataEvents: RuntimeMetadataEvent[] = [];
			harness.on('runtime-metadata', (_sid: string, meta: RuntimeMetadataEvent) => {
				metadataEvents.push(meta);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'system',
				subtype: 'init',
				session_id: 'sess-cmds-mixed',
				slash_commands: [
					'/commit',
					{ name: '/review', description: 'Review PR' },
					'/help',
				],
			} as any);
			await flushMicrotasks();

			const initMeta = metadataEvents.find((m) => m.replace === true);
			expect(initMeta!.slashCommands).toEqual(['/commit', '/review', '/help']);
		});

		it('should emit slash commands both as standalone event and within metadata', async () => {
			const metadataEvents: RuntimeMetadataEvent[] = [];
			const slashCommandEvents: unknown[][] = [];

			harness.on('runtime-metadata', (_sid: string, meta: RuntimeMetadataEvent) => {
				metadataEvents.push(meta);
			});
			harness.on('slash-commands', (_sid: string, cmds: unknown[]) => {
				slashCommandEvents.push(cmds);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			const commands = [{ name: '/commit' }, { name: '/test' }];
			mockFn.pushMessage({
				type: 'system',
				subtype: 'init',
				session_id: 'sess-cmds-dual',
				slash_commands: commands,
			} as any);
			await flushMicrotasks();

			// Standalone event emits the raw SDK format
			expect(slashCommandEvents).toHaveLength(1);
			expect(slashCommandEvents[0]).toEqual(commands);

			// Metadata event maps to string names
			const initMeta = metadataEvents.find((m) => m.replace === true);
			expect(initMeta!.slashCommands).toEqual(['/commit', '/test']);
		});

		it('should omit slashCommands field from metadata when init has no slash_commands', async () => {
			const metadataEvents: RuntimeMetadataEvent[] = [];
			harness.on('runtime-metadata', (_sid: string, meta: RuntimeMetadataEvent) => {
				metadataEvents.push(meta);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'system',
				subtype: 'init',
				session_id: 'sess-no-cmds',
			} as any);
			await flushMicrotasks();

			const initMeta = metadataEvents.find((m) => m.replace === true);
			expect(initMeta!.slashCommands).toBeUndefined();
		});

		// -- Available models mapping --

		it('should include init model as single-element availableModels without label', async () => {
			const metadataEvents: RuntimeMetadataEvent[] = [];
			harness.on('runtime-metadata', (_sid: string, meta: RuntimeMetadataEvent) => {
				metadataEvents.push(meta);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'system',
				subtype: 'init',
				session_id: 'sess-model-init',
				model: 'claude-sonnet-4-6',
			} as any);
			await flushMicrotasks();

			const initMeta = metadataEvents.find((m) => m.replace === true);
			expect(initMeta!.availableModels).toHaveLength(1);
			expect(initMeta!.availableModels![0]).toEqual({ id: 'claude-sonnet-4-6' });
			// Init model has no label — only supportedModels() provides labels
			expect(initMeta!.availableModels![0].label).toBeUndefined();
		});

		it('should omit availableModels from initial snapshot when init has no model field', async () => {
			const metadataEvents: RuntimeMetadataEvent[] = [];
			harness.on('runtime-metadata', (_sid: string, meta: RuntimeMetadataEvent) => {
				metadataEvents.push(meta);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'system',
				subtype: 'init',
				session_id: 'sess-no-model',
				// No model field
			} as any);
			await flushMicrotasks();

			const initMeta = metadataEvents.find((m) => m.replace === true);
			expect(initMeta!.availableModels).toBeUndefined();
		});

		it('should propagate label from supportedModels() API in incremental update', async () => {
			(mockFn.query.supportedModels as ReturnType<typeof vi.fn>).mockResolvedValue([
				{ id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
				{ id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
			]);

			const metadataEvents: RuntimeMetadataEvent[] = [];
			harness.on('runtime-metadata', (_sid: string, meta: RuntimeMetadataEvent) => {
				metadataEvents.push(meta);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'system',
				subtype: 'init',
				session_id: 'sess-models-labels',
				model: 'claude-opus-4-6',
			} as any);
			await flushMicrotasks();

			const incrementalMeta = metadataEvents.find((m) => m.replace === false);
			expect(incrementalMeta).toBeDefined();

			// Incremental update from supportedModels() carries labels
			for (const model of incrementalMeta!.availableModels!) {
				expect(model.label).toBeDefined();
				expect(typeof model.label).toBe('string');
			}
			expect(incrementalMeta!.availableModels![0].label).toBe('Claude Opus 4.6');
			expect(incrementalMeta!.availableModels![1].label).toBe('Claude Sonnet 4.6');
		});

		it('should not call supportedModels() when harness is killed before init', async () => {
			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			harness.kill();
			await flushMicrotasks();

			// No init message was sent, so supportedModels should not be called
			expect(mockFn.query.supportedModels).not.toHaveBeenCalled();
		});

		// -- Available agents mapping --

		it('should map multiple agents with correct id and label fields', async () => {
			const metadataEvents: RuntimeMetadataEvent[] = [];
			harness.on('runtime-metadata', (_sid: string, meta: RuntimeMetadataEvent) => {
				metadataEvents.push(meta);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'system',
				subtype: 'init',
				session_id: 'sess-agents-multi',
				agents: [
					{ name: 'code-reviewer', description: 'Reviews code quality' },
					{ name: 'test-runner', description: 'Runs test suites' },
					{ name: 'explorer', description: 'Explores codebases' },
				],
			} as any);
			await flushMicrotasks();

			const initMeta = metadataEvents.find((m) => m.replace === true);
			expect(initMeta!.availableAgents).toHaveLength(3);
			expect(initMeta!.availableAgents).toEqual([
				{ id: 'code-reviewer', label: 'Reviews code quality' },
				{ id: 'test-runner', label: 'Runs test suites' },
				{ id: 'explorer', label: 'Explores codebases' },
			]);
		});

		it('should map agents with no description to undefined label', async () => {
			const metadataEvents: RuntimeMetadataEvent[] = [];
			harness.on('runtime-metadata', (_sid: string, meta: RuntimeMetadataEvent) => {
				metadataEvents.push(meta);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'system',
				subtype: 'init',
				session_id: 'sess-agents-nodesc',
				agents: [{ name: 'minimal-agent' }],
			} as any);
			await flushMicrotasks();

			const initMeta = metadataEvents.find((m) => m.replace === true);
			expect(initMeta!.availableAgents).toHaveLength(1);
			expect(initMeta!.availableAgents![0].id).toBe('minimal-agent');
			expect(initMeta!.availableAgents![0].label).toBeUndefined();
		});

		it('should omit availableAgents from metadata when init has no agents', async () => {
			const metadataEvents: RuntimeMetadataEvent[] = [];
			harness.on('runtime-metadata', (_sid: string, meta: RuntimeMetadataEvent) => {
				metadataEvents.push(meta);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'system',
				subtype: 'init',
				session_id: 'sess-no-agents',
			} as any);
			await flushMicrotasks();

			const initMeta = metadataEvents.find((m) => m.replace === true);
			expect(initMeta!.availableAgents).toBeUndefined();
		});

		// -- Capabilities in metadata --

		it('should include all capability flags in initial metadata snapshot', async () => {
			const metadataEvents: RuntimeMetadataEvent[] = [];
			harness.on('runtime-metadata', (_sid: string, meta: RuntimeMetadataEvent) => {
				metadataEvents.push(meta);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'system',
				subtype: 'init',
				session_id: 'sess-caps',
			} as any);
			await flushMicrotasks();

			const initMeta = metadataEvents.find((m) => m.replace === true);
			expect(initMeta!.capabilities).toBeDefined();

			const caps = initMeta!.capabilities!;
			expect(caps.supportsMidTurnInput).toBe(true);
			expect(caps.supportsInteractionRequests).toBe(true);
			expect(caps.supportsPersistentStdin).toBe(false);
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

		it('should match capabilities in metadata to getCapabilities() output', async () => {
			const metadataEvents: RuntimeMetadataEvent[] = [];
			harness.on('runtime-metadata', (_sid: string, meta: RuntimeMetadataEvent) => {
				metadataEvents.push(meta);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'system',
				subtype: 'init',
				session_id: 'sess-caps-match',
			} as any);
			await flushMicrotasks();

			const initMeta = metadataEvents.find((m) => m.replace === true);
			const directCaps = harness.getCapabilities();

			// Every field in getCapabilities() should appear in metadata capabilities
			expect(initMeta!.capabilities).toEqual(directCaps);
		});

		// -- Metadata shape integrity --

		it('should set replace: true on initial snapshot and replace: false on incremental update', async () => {
			(mockFn.query.supportedModels as ReturnType<typeof vi.fn>).mockResolvedValue([
				{ id: 'claude-opus-4-6', label: 'Opus' },
			]);

			const metadataEvents: RuntimeMetadataEvent[] = [];
			harness.on('runtime-metadata', (_sid: string, meta: RuntimeMetadataEvent) => {
				metadataEvents.push(meta);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'system',
				subtype: 'init',
				session_id: 'sess-replace-flags',
				model: 'claude-opus-4-6',
				skills: [{ name: 'skill-1' }],
			} as any);
			await flushMicrotasks();

			expect(metadataEvents.length).toBeGreaterThanOrEqual(2);

			const snapshots = metadataEvents.filter((m) => m.replace === true);
			const incrementals = metadataEvents.filter((m) => m.replace === false);

			expect(snapshots).toHaveLength(1);
			expect(incrementals).toHaveLength(1);
		});

		it('should set correct sessionId and source on all metadata events', async () => {
			(mockFn.query.supportedModels as ReturnType<typeof vi.fn>).mockResolvedValue([
				{ id: 'model-1' },
			]);

			const metadataEvents: RuntimeMetadataEvent[] = [];
			harness.on('runtime-metadata', (_sid: string, meta: RuntimeMetadataEvent) => {
				metadataEvents.push(meta);
			});

			const sessionId = 'custom-session-xyz';
			await harness.spawn(createTestConfig({ sessionId }));
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'system',
				subtype: 'init',
				session_id: 'sdk-session',
			} as any);
			await flushMicrotasks();

			for (const meta of metadataEvents) {
				expect(meta.sessionId).toBe(sessionId);
				expect(meta.source).toBe('claude-code');
			}
		});

		it('should only include capabilities and defined fields in metadata — no extra SDK data leaks', async () => {
			const metadataEvents: RuntimeMetadataEvent[] = [];
			harness.on('runtime-metadata', (_sid: string, meta: RuntimeMetadataEvent) => {
				metadataEvents.push(meta);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'system',
				subtype: 'init',
				session_id: 'sess-containment',
				mcp_servers: [{ name: 'server-1', status: 'connected' }],
				plugins: [{ name: 'plugin-1' }],
				tools: [{ name: 'Read' }, { name: 'Write' }],
			} as any);
			await flushMicrotasks();

			const initMeta = metadataEvents.find((m) => m.replace === true);
			expect(initMeta).toBeDefined();

			// These SDK-specific fields should NOT appear in the shared metadata
			const metaKeys = Object.keys(initMeta!);
			expect(metaKeys).not.toContain('mcp_servers');
			expect(metaKeys).not.toContain('plugins');
			expect(metaKeys).not.toContain('tools');

			// Only shared RuntimeMetadataEvent fields should be present
			const allowedKeys = new Set([
				'sessionId', 'source', 'replace',
				'skills', 'slashCommands', 'availableModels', 'availableAgents', 'capabilities',
			]);
			for (const key of metaKeys) {
				expect(allowedKeys.has(key)).toBe(true);
			}
		});

		// -- Full init with all fields --

		it('should correctly map a full init message with all metadata fields populated', async () => {
			(mockFn.query.supportedModels as ReturnType<typeof vi.fn>).mockResolvedValue([
				{ id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
				{ id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
			]);

			const metadataEvents: RuntimeMetadataEvent[] = [];
			const sessionIdEvents: string[] = [];
			const slashCommandEvents: unknown[][] = [];

			harness.on('runtime-metadata', (_sid: string, meta: RuntimeMetadataEvent) => {
				metadataEvents.push(meta);
			});
			harness.on('session-id', (_sid: string, id: string) => {
				sessionIdEvents.push(id);
			});
			harness.on('slash-commands', (_sid: string, cmds: unknown[]) => {
				slashCommandEvents.push(cmds);
			});

			await harness.spawn(createTestConfig({ sessionId: 'full-init-session' }));
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'system',
				subtype: 'init',
				session_id: 'claude-full-init',
				model: 'claude-opus-4-6',
				slash_commands: [
					{ name: '/commit', description: 'Commit' },
					'/help',
				],
				skills: [
					{ name: 'tdd', description: 'Test driven' },
					{ name: 'debugging' },
				],
				agents: [
					{ name: 'reviewer', description: 'Code review' },
				],
			} as any);
			await flushMicrotasks();

			// Session ID emitted
			expect(sessionIdEvents).toContain('claude-full-init');

			// Slash commands standalone event emitted
			expect(slashCommandEvents).toHaveLength(1);

			// Initial snapshot
			const initMeta = metadataEvents.find((m) => m.replace === true);
			expect(initMeta).toBeDefined();
			expect(initMeta!.sessionId).toBe('full-init-session');
			expect(initMeta!.source).toBe('claude-code');
			expect(initMeta!.skills).toHaveLength(2);
			expect(initMeta!.slashCommands).toEqual(['/commit', '/help']);
			expect(initMeta!.availableModels).toEqual([{ id: 'claude-opus-4-6' }]);
			expect(initMeta!.availableAgents).toEqual([{ id: 'reviewer', label: 'Code review' }]);
			expect(initMeta!.capabilities).toBeDefined();
			expect(initMeta!.capabilities!.supportsMidTurnInput).toBe(true);

			// Incremental update with full model list from API
			const incrementalMeta = metadataEvents.find((m) => m.replace === false);
			expect(incrementalMeta).toBeDefined();
			expect(incrementalMeta!.availableModels).toHaveLength(2);
			expect(incrementalMeta!.availableModels![0].label).toBe('Claude Opus 4.6');

			// Incremental update should NOT re-emit skills/agents/slashCommands/capabilities
			expect(incrementalMeta!.skills).toBeUndefined();
			expect(incrementalMeta!.slashCommands).toBeUndefined();
			expect(incrementalMeta!.availableAgents).toBeUndefined();
			expect(incrementalMeta!.capabilities).toBeUndefined();
		});

		// -- Incremental update scoping --

		it('should not include skills, slashCommands, agents, or capabilities in incremental model update', async () => {
			(mockFn.query.supportedModels as ReturnType<typeof vi.fn>).mockResolvedValue([
				{ id: 'model-a' },
			]);

			const metadataEvents: RuntimeMetadataEvent[] = [];
			harness.on('runtime-metadata', (_sid: string, meta: RuntimeMetadataEvent) => {
				metadataEvents.push(meta);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'system',
				subtype: 'init',
				session_id: 'sess-scope',
				skills: [{ name: 'skill-a' }],
				slash_commands: ['/cmd-a'],
				agents: [{ name: 'agent-a' }],
			} as any);
			await flushMicrotasks();

			const incrementalMeta = metadataEvents.find((m) => m.replace === false);
			expect(incrementalMeta).toBeDefined();
			expect(incrementalMeta!.availableModels).toBeDefined();

			// These should only be in the initial snapshot, not the incremental update
			expect(incrementalMeta!.skills).toBeUndefined();
			expect(incrementalMeta!.slashCommands).toBeUndefined();
			expect(incrementalMeta!.availableAgents).toBeUndefined();
			expect(incrementalMeta!.capabilities).toBeUndefined();
		});

		// -- supportedModels() not queried after harness stops --

		it('should not emit incremental metadata if harness stops before supportedModels() resolves', async () => {
			// Use a deferred promise for supportedModels
			let resolveSupportedModels: ((value: any) => void) | null = null;
			(mockFn.query.supportedModels as ReturnType<typeof vi.fn>).mockImplementation(() => {
				return new Promise((resolve) => {
					resolveSupportedModels = resolve;
				});
			});

			const metadataEvents: RuntimeMetadataEvent[] = [];
			harness.on('runtime-metadata', (_sid: string, meta: RuntimeMetadataEvent) => {
				metadataEvents.push(meta);
			});

			await harness.spawn(createTestConfig());
			await flushMicrotasks();

			mockFn.pushMessage({
				type: 'system',
				subtype: 'init',
				session_id: 'sess-race',
			} as any);
			await flushMicrotasks();

			// Kill harness before supportedModels resolves
			harness.kill();
			await flushMicrotasks();

			// Now resolve supportedModels after kill
			// resolveSupportedModels is assigned inside the async mockImplementation callback
			const resolver = resolveSupportedModels as ((value: any) => void) | null;
			if (resolver) {
				resolver([{ id: 'late-model', label: 'Late' }]);
			}
			await flushMicrotasks();

			// Only the initial snapshot should exist, no incremental from late-resolving models
			const incrementals = metadataEvents.filter((m) => m.replace === false);
			expect(incrementals).toHaveLength(0);
		});
	});
});
