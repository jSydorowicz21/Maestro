/**
 * Unit tests for CodexHarness.
 *
 * Verifies:
 * - spawn(): config mapping, state transitions, guard clauses
 * - Event mapping: thread.started, item.completed (agent_message, reasoning,
 *   tool_call, tool_result), turn.completed, turn.failed, error
 * - write(): text input, message+images (prompt-embed), guard clauses
 * - interrupt(): SDK stop() delegation, guard clauses
 * - kill(): SDK close() delegation, state cleanup
 * - dispose(): idempotency, listener cleanup, kill-if-running
 * - respondToInteraction(): no-op with warning
 * - updateRuntimeSettings(): guard clauses, log-only behavior
 * - Capability accessors: isRunning(), isDisposed(), getCapabilities()
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../../main/utils/logger', () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

// ── Imports (after mocks) ──────────────────────────────────────────────────

import {
	CodexHarness,
	type CodexExecution,
	type CodexExecFunction,
	type CodexExecOptions,
	type CodexSDKEvent,
} from '../../../main/harness/codex-harness';
import { logger } from '../../../main/utils/logger';
import type { AgentExecutionConfig } from '../../../shared/types';

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Create a mock CodexExecution that yields the given events then ends.
 * Use for event mapping tests where the stream should complete.
 */
function createMockExecution(events: CodexSDKEvent[] = []): CodexExecution {
	return {
		sendInput: vi.fn(),
		stop: vi.fn(),
		kill: vi.fn(),
		close: vi.fn(),
		[Symbol.asyncIterator]: async function* () {
			for (const event of events) {
				yield event;
			}
		},
	};
}

/**
 * Create a mock CodexExecution that never completes its async iterator.
 * The harness stays in running state until kill/dispose.
 * Use for tests that need the harness to remain running (write, interrupt, kill, etc.).
 */
function createHangingExecution(): CodexExecution {
	let resolveHang: (() => void) | null = null;
	const hangPromise = new Promise<void>((r) => { resolveHang = r; });

	const execution: CodexExecution = {
		sendInput: vi.fn(),
		stop: vi.fn(),
		kill: vi.fn(),
		close: vi.fn(() => { resolveHang?.(); }),
		[Symbol.asyncIterator]: async function* () {
			// Block forever until close() is called
			await hangPromise;
		},
	};

	return execution;
}

/**
 * Create a mock exec function that returns the given execution.
 */
function createMockExecFn(execution: CodexExecution): CodexExecFunction {
	return vi.fn(() => execution) as unknown as CodexExecFunction;
}

/**
 * Minimal AgentExecutionConfig for tests.
 */
function makeConfig(overrides?: Partial<AgentExecutionConfig>): AgentExecutionConfig {
	return {
		sessionId: 'test-session-1',
		toolType: 'codex' as any,
		cwd: '/home/user/project',
		prompt: 'Hello, Codex',
		...overrides,
	};
}

/**
 * Wait for all pending microtasks / async iterators to flush.
 */
async function flushAsync(): Promise<void> {
	// Multiple ticks to ensure async generators complete
	for (let i = 0; i < 5; i++) {
		await new Promise((r) => setTimeout(r, 0));
	}
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('CodexHarness', () => {
	let harness: CodexHarness;
	let mockExecution: CodexExecution;
	let mockExecFn: CodexExecFunction;

	beforeEach(() => {
		vi.clearAllMocks();
		mockExecution = createMockExecution();
		mockExecFn = createMockExecFn(mockExecution);
		harness = new CodexHarness(mockExecFn);
	});

	// ════════════════════════════════════════════════════════════════════════
	// spawn()
	// ════════════════════════════════════════════════════════════════════════

	describe('spawn()', () => {
		it('should call execFn with mapped CodexExecOptions', async () => {
			const config = makeConfig({
				prompt: 'Build a feature',
				modelId: 'o4-mini',
				systemPrompt: 'You are helpful',
				maxTurns: 5,
				customEnvVars: { API_KEY: 'abc' },
				resumeSessionId: 'thread-old',
				cwd: '/workspace',
			});

			await harness.spawn(config);

			expect(mockExecFn).toHaveBeenCalledOnce();
			const opts = (mockExecFn as any).mock.calls[0][0] as CodexExecOptions;
			expect(opts.prompt).toBe('Build a feature');
			expect(opts.model).toBe('o4-mini');
			expect(opts.systemPrompt).toBe('You are helpful');
			expect(opts.maxTurns).toBe(5);
			expect(opts.env).toEqual({ API_KEY: 'abc' });
			expect(opts.threadId).toBe('thread-old');
			expect(opts.cwd).toBe('/workspace');
		});

		it('should pass images via execOptions.images on initial spawn (no resume)', async () => {
			const config = makeConfig({
				images: ['/tmp/screenshot.png'],
			});

			await harness.spawn(config);

			const opts = (mockExecFn as any).mock.calls[0][0] as CodexExecOptions;
			expect(opts.images).toEqual(['/tmp/screenshot.png']);
			expect(opts.prompt).toBe('Hello, Codex');
		});

		it('should embed image paths in prompt when resuming with images (prompt-embed)', async () => {
			const config = makeConfig({
				prompt: 'Continue working',
				resumeSessionId: 'thread-old',
				images: ['/tmp/img1.png', '/tmp/img2.png'],
			});

			await harness.spawn(config);

			const opts = (mockExecFn as any).mock.calls[0][0] as CodexExecOptions;
			// Images should NOT be in execOptions.images
			expect(opts.images).toBeUndefined();
			// Image paths should be embedded in the prompt text
			expect(opts.prompt).toContain('/tmp/img1.png');
			expect(opts.prompt).toContain('/tmp/img2.png');
			expect(opts.prompt).toContain('Continue working');
		});

		it('should embed image paths before the prompt text when resuming', async () => {
			const config = makeConfig({
				prompt: 'Analyze this',
				resumeSessionId: 'thread-old',
				images: ['/tmp/screenshot.png'],
			});

			await harness.spawn(config);

			const opts = (mockExecFn as any).mock.calls[0][0] as CodexExecOptions;
			// The image prefix should come before the user prompt
			const imageIdx = opts.prompt!.indexOf('/tmp/screenshot.png');
			const promptIdx = opts.prompt!.indexOf('Analyze this');
			expect(imageIdx).toBeLessThan(promptIdx);
		});

		it('should map permissionMode=plan to sandbox=read-only', async () => {
			const config = makeConfig({ permissionMode: 'plan' as any });
			await harness.spawn(config);

			const opts = (mockExecFn as any).mock.calls[0][0] as CodexExecOptions;
			expect(opts.sandbox).toBe('read-only');
		});

		it('should apply provider options (model and sandbox)', async () => {
			const config = makeConfig({
				providerOptions: { model: 'gpt-5.2-codex', sandbox: 'full' },
			});
			await harness.spawn(config);

			const opts = (mockExecFn as any).mock.calls[0][0] as CodexExecOptions;
			expect(opts.model).toBe('gpt-5.2-codex');
			expect(opts.sandbox).toBe('full');
		});

		it('should return success=true and pid=null on success', async () => {
			const result = await harness.spawn(makeConfig());
			expect(result).toEqual({ success: true, pid: null });
		});

		it('should set isRunning() to true after spawn', async () => {
			mockExecution = createHangingExecution();
			mockExecFn = createMockExecFn(mockExecution);
			harness = new CodexHarness(mockExecFn);

			expect(harness.isRunning()).toBe(false);
			await harness.spawn(makeConfig());
			expect(harness.isRunning()).toBe(true);
		});

		it('should return success=false when disposed', async () => {
			harness.dispose();
			const result = await harness.spawn(makeConfig());
			expect(result).toEqual({ success: false, pid: null });
			expect(logger.warn).toHaveBeenCalledWith(
				expect.stringContaining('spawn() called on disposed harness'),
				expect.any(String)
			);
		});

		it('should return success=false when already running', async () => {
			mockExecution = createHangingExecution();
			mockExecFn = createMockExecFn(mockExecution);
			harness = new CodexHarness(mockExecFn);

			await harness.spawn(makeConfig());
			const result = await harness.spawn(makeConfig());
			expect(result).toEqual({ success: false, pid: null });
			expect(logger.warn).toHaveBeenCalledWith(
				expect.stringContaining('spawn() called while already running'),
				expect.any(String)
			);
		});

		it('should return success=false when execFn throws', async () => {
			const throwingExecFn = vi.fn(() => {
				throw new Error('SDK init failed');
			}) as unknown as CodexExecFunction;
			harness = new CodexHarness(throwingExecFn);

			const result = await harness.spawn(makeConfig());
			expect(result).toEqual({ success: false, pid: null });
			expect(harness.isRunning()).toBe(false);
		});

		it('should ignore unknown provider options', async () => {
			const config = makeConfig({
				providerOptions: { model: 'o4-mini', unknownKey: 'ignored' },
			});
			await harness.spawn(config);

			expect(logger.debug).toHaveBeenCalledWith(
				expect.stringContaining('Ignoring unknown provider option: unknownKey'),
				expect.any(String)
			);
		});
	});

	// ════════════════════════════════════════════════════════════════════════
	// Event Mapping
	// ════════════════════════════════════════════════════════════════════════

	describe('event mapping', () => {
		describe('thread.started', () => {
			it('should emit session-id with thread_id', async () => {
				const events: CodexSDKEvent[] = [
					{ type: 'thread.started', thread_id: 'thread-abc-123' },
				];
				mockExecution = createMockExecution(events);
				mockExecFn = createMockExecFn(mockExecution);
				harness = new CodexHarness(mockExecFn);

				const sessionIdHandler = vi.fn();
				harness.on('session-id', sessionIdHandler);

				await harness.spawn(makeConfig());
				await flushAsync();

				expect(sessionIdHandler).toHaveBeenCalledWith('test-session-1', 'thread-abc-123');
			});

			it('should emit runtime-metadata with capabilities', async () => {
				const events: CodexSDKEvent[] = [
					{ type: 'thread.started', thread_id: 'thread-1' },
				];
				mockExecution = createMockExecution(events);
				mockExecFn = createMockExecFn(mockExecution);
				harness = new CodexHarness(mockExecFn);

				const metadataHandler = vi.fn();
				harness.on('runtime-metadata', metadataHandler);

				await harness.spawn(makeConfig());
				await flushAsync();

				expect(metadataHandler).toHaveBeenCalledWith(
					'test-session-1',
					expect.objectContaining({
						sessionId: 'test-session-1',
						source: 'codex',
						replace: true,
						capabilities: expect.objectContaining({
							supportsInteractionRequests: false,
							supportsMidTurnInput: true,
						}),
					})
				);
			});
		});

		describe('item.completed — agent_message', () => {
			it('should emit data with message text', async () => {
				const events: CodexSDKEvent[] = [
					{
						type: 'item.completed',
						item: { type: 'agent_message', text: 'Hello from Codex!' },
					},
				];
				mockExecution = createMockExecution(events);
				mockExecFn = createMockExecFn(mockExecution);
				harness = new CodexHarness(mockExecFn);

				const dataHandler = vi.fn();
				harness.on('data', dataHandler);

				await harness.spawn(makeConfig());
				await flushAsync();

				expect(dataHandler).toHaveBeenCalledWith('test-session-1', 'Hello from Codex!');
			});

			it('should emit empty string when text is missing', async () => {
				const events: CodexSDKEvent[] = [
					{ type: 'item.completed', item: { type: 'agent_message' } },
				];
				mockExecution = createMockExecution(events);
				mockExecFn = createMockExecFn(mockExecution);
				harness = new CodexHarness(mockExecFn);

				const dataHandler = vi.fn();
				harness.on('data', dataHandler);

				await harness.spawn(makeConfig());
				await flushAsync();

				expect(dataHandler).toHaveBeenCalledWith('test-session-1', '');
			});
		});

		describe('item.completed — reasoning', () => {
			it('should emit thinking-chunk with reasoning text', async () => {
				const events: CodexSDKEvent[] = [
					{
						type: 'item.completed',
						item: { type: 'reasoning', text: 'Let me think about this...' },
					},
				];
				mockExecution = createMockExecution(events);
				mockExecFn = createMockExecFn(mockExecution);
				harness = new CodexHarness(mockExecFn);

				const thinkingHandler = vi.fn();
				harness.on('thinking-chunk', thinkingHandler);

				await harness.spawn(makeConfig());
				await flushAsync();

				expect(thinkingHandler).toHaveBeenCalledWith(
					'test-session-1',
					'Let me think about this...'
				);
			});

			it('should not emit thinking-chunk when text is empty', async () => {
				const events: CodexSDKEvent[] = [
					{ type: 'item.completed', item: { type: 'reasoning' } },
				];
				mockExecution = createMockExecution(events);
				mockExecFn = createMockExecFn(mockExecution);
				harness = new CodexHarness(mockExecFn);

				const thinkingHandler = vi.fn();
				harness.on('thinking-chunk', thinkingHandler);

				await harness.spawn(makeConfig());
				await flushAsync();

				expect(thinkingHandler).not.toHaveBeenCalled();
			});
		});

		describe('item.completed — tool_call + tool_result', () => {
			it('should emit tool-execution with running status for tool_call', async () => {
				const events: CodexSDKEvent[] = [
					{
						type: 'item.completed',
						item: {
							type: 'tool_call',
							tool: 'shell',
							args: { command: 'ls -la' },
						},
					},
				];
				mockExecution = createMockExecution(events);
				mockExecFn = createMockExecFn(mockExecution);
				harness = new CodexHarness(mockExecFn);

				const toolHandler = vi.fn();
				harness.on('tool-execution', toolHandler);

				await harness.spawn(makeConfig());
				await flushAsync();

				expect(toolHandler).toHaveBeenCalledWith(
					'test-session-1',
					expect.objectContaining({
						toolName: 'shell',
						state: {
							status: 'running',
							input: { command: 'ls -la' },
						},
						timestamp: expect.any(Number),
					})
				);
			});

			it('should emit tool-execution with completed status for tool_result and carry tool name', async () => {
				const events: CodexSDKEvent[] = [
					{
						type: 'item.completed',
						item: { type: 'tool_call', tool: 'shell', args: { command: 'echo hi' } },
					},
					{
						type: 'item.completed',
						item: { type: 'tool_result', output: 'hi\n' },
					},
				];
				mockExecution = createMockExecution(events);
				mockExecFn = createMockExecFn(mockExecution);
				harness = new CodexHarness(mockExecFn);

				const toolHandler = vi.fn();
				harness.on('tool-execution', toolHandler);

				await harness.spawn(makeConfig());
				await flushAsync();

				// Second call should be the tool_result with the carried-over tool name
				expect(toolHandler).toHaveBeenCalledTimes(2);
				expect(toolHandler).toHaveBeenNthCalledWith(
					2,
					'test-session-1',
					expect.objectContaining({
						toolName: 'shell',
						state: {
							status: 'completed',
							output: 'hi\n',
						},
					})
				);
			});

			it('should use "unknown" for tool name when tool_call has no tool field', async () => {
				const events: CodexSDKEvent[] = [
					{ type: 'item.completed', item: { type: 'tool_call' } },
				];
				mockExecution = createMockExecution(events);
				mockExecFn = createMockExecFn(mockExecution);
				harness = new CodexHarness(mockExecFn);

				const toolHandler = vi.fn();
				harness.on('tool-execution', toolHandler);

				await harness.spawn(makeConfig());
				await flushAsync();

				expect(toolHandler).toHaveBeenCalledWith(
					'test-session-1',
					expect.objectContaining({ toolName: 'unknown' })
				);
			});

			it('should decode byte array tool output', async () => {
				const bytes = Array.from(Buffer.from('hello world'));
				const events: CodexSDKEvent[] = [
					{ type: 'item.completed', item: { type: 'tool_call', tool: 'exec' } },
					{ type: 'item.completed', item: { type: 'tool_result', output: bytes } },
				];
				mockExecution = createMockExecution(events);
				mockExecFn = createMockExecFn(mockExecution);
				harness = new CodexHarness(mockExecFn);

				const toolHandler = vi.fn();
				harness.on('tool-execution', toolHandler);

				await harness.spawn(makeConfig());
				await flushAsync();

				expect(toolHandler).toHaveBeenNthCalledWith(
					2,
					'test-session-1',
					expect.objectContaining({
						state: expect.objectContaining({
							status: 'completed',
							output: 'hello world',
						}),
					})
				);
			});

			it('should truncate long tool output', async () => {
				const longOutput = 'x'.repeat(15000);
				const events: CodexSDKEvent[] = [
					{ type: 'item.completed', item: { type: 'tool_call', tool: 'exec' } },
					{ type: 'item.completed', item: { type: 'tool_result', output: longOutput } },
				];
				mockExecution = createMockExecution(events);
				mockExecFn = createMockExecFn(mockExecution);
				harness = new CodexHarness(mockExecFn);

				const toolHandler = vi.fn();
				harness.on('tool-execution', toolHandler);

				await harness.spawn(makeConfig());
				await flushAsync();

				const result = toolHandler.mock.calls[1][1];
				expect(result.state.output).toContain('... [output truncated, 15000 chars total]');
				expect(result.state.output.length).toBeLessThan(longOutput.length);
			});
		});

		describe('turn.completed', () => {
			it('should emit usage with token counts', async () => {
				const events: CodexSDKEvent[] = [
					{
						type: 'turn.completed',
						usage: {
							input_tokens: 100,
							output_tokens: 50,
							cached_input_tokens: 20,
							reasoning_output_tokens: 10,
						},
					},
				];
				mockExecution = createMockExecution(events);
				mockExecFn = createMockExecFn(mockExecution);
				harness = new CodexHarness(mockExecFn);

				const usageHandler = vi.fn();
				harness.on('usage', usageHandler);

				await harness.spawn(makeConfig());
				await flushAsync();

				expect(usageHandler).toHaveBeenCalledWith(
					'test-session-1',
					expect.objectContaining({
						inputTokens: 100,
						outputTokens: 60, // 50 + 10 reasoning
						cacheReadInputTokens: 20,
						cacheCreationInputTokens: 0,
						totalCostUsd: 0,
						reasoningTokens: 10,
					})
				);
			});

			it('should emit query-complete', async () => {
				const events: CodexSDKEvent[] = [
					{ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 5 } },
				];
				mockExecution = createMockExecution(events);
				mockExecFn = createMockExecFn(mockExecution);
				harness = new CodexHarness(mockExecFn);

				const queryCompleteHandler = vi.fn();
				harness.on('query-complete', queryCompleteHandler);

				await harness.spawn(makeConfig());
				await flushAsync();

				expect(queryCompleteHandler).toHaveBeenCalledWith(
					'test-session-1',
					expect.objectContaining({
						sessionId: 'test-session-1',
						agentType: 'codex',
					})
				);
			});

			it('should handle missing usage gracefully (no usage emission)', async () => {
				const events: CodexSDKEvent[] = [{ type: 'turn.completed' }];
				mockExecution = createMockExecution(events);
				mockExecFn = createMockExecFn(mockExecution);
				harness = new CodexHarness(mockExecFn);

				const usageHandler = vi.fn();
				harness.on('usage', usageHandler);

				await harness.spawn(makeConfig());
				await flushAsync();

				expect(usageHandler).not.toHaveBeenCalled();
			});
		});

		describe('turn.failed', () => {
			it('should emit agent-error with recoverable=true', async () => {
				const events: CodexSDKEvent[] = [
					{ type: 'turn.failed', error: 'Rate limit exceeded' },
				];
				mockExecution = createMockExecution(events);
				mockExecFn = createMockExecFn(mockExecution);
				harness = new CodexHarness(mockExecFn);

				const errorHandler = vi.fn();
				harness.on('agent-error', errorHandler);

				await harness.spawn(makeConfig());
				await flushAsync();

				expect(errorHandler).toHaveBeenCalledWith(
					'test-session-1',
					expect.objectContaining({
						type: 'unknown',
						message: 'Rate limit exceeded',
						recoverable: true,
						agentId: 'codex',
						sessionId: 'test-session-1',
					})
				);
			});

			it('should handle object-form errors with message field', async () => {
				const events: CodexSDKEvent[] = [
					{
						type: 'turn.failed',
						error: { message: 'Token limit', type: 'rate_limit' },
					},
				];
				mockExecution = createMockExecution(events);
				mockExecFn = createMockExecFn(mockExecution);
				harness = new CodexHarness(mockExecFn);

				const errorHandler = vi.fn();
				harness.on('agent-error', errorHandler);

				await harness.spawn(makeConfig());
				await flushAsync();

				expect(errorHandler).toHaveBeenCalledWith(
					'test-session-1',
					expect.objectContaining({ message: 'Token limit' })
				);
			});
		});

		describe('error', () => {
			it('should emit agent-error with recoverable=false', async () => {
				const events: CodexSDKEvent[] = [
					{ type: 'error', error: 'Fatal SDK error' },
				];
				mockExecution = createMockExecution(events);
				mockExecFn = createMockExecFn(mockExecution);
				harness = new CodexHarness(mockExecFn);

				const errorHandler = vi.fn();
				harness.on('agent-error', errorHandler);

				await harness.spawn(makeConfig());
				await flushAsync();

				expect(errorHandler).toHaveBeenCalledWith(
					'test-session-1',
					expect.objectContaining({
						type: 'unknown',
						message: 'Fatal SDK error',
						recoverable: false,
					})
				);
			});
		});

		describe('stream completion', () => {
			it('should emit exit with code 0 when event stream ends normally', async () => {
				const events: CodexSDKEvent[] = [
					{ type: 'thread.started', thread_id: 'thread-1' },
				];
				mockExecution = createMockExecution(events);
				mockExecFn = createMockExecFn(mockExecution);
				harness = new CodexHarness(mockExecFn);

				const exitHandler = vi.fn();
				harness.on('exit', exitHandler);

				await harness.spawn(makeConfig());
				await flushAsync();

				expect(exitHandler).toHaveBeenCalledWith('test-session-1', 0);
			});

			it('should set isRunning() to false after stream ends', async () => {
				mockExecution = createMockExecution([]);
				mockExecFn = createMockExecFn(mockExecution);
				harness = new CodexHarness(mockExecFn);

				await harness.spawn(makeConfig());
				await flushAsync();

				expect(harness.isRunning()).toBe(false);
			});

			it('should emit agent-error on stream exception', async () => {
				// Create an execution that throws during iteration
				const execution: CodexExecution = {
					sendInput: vi.fn(),
					stop: vi.fn(),
					kill: vi.fn(),
					close: vi.fn(),
					[Symbol.asyncIterator]: async function* () {
						throw new Error('Connection lost');
					},
				};
				mockExecFn = createMockExecFn(execution);
				harness = new CodexHarness(mockExecFn);

				const errorHandler = vi.fn();
				harness.on('agent-error', errorHandler);

				await harness.spawn(makeConfig());
				await flushAsync();

				expect(errorHandler).toHaveBeenCalledWith(
					'test-session-1',
					expect.objectContaining({
						message: expect.stringContaining('Connection lost'),
						recoverable: false,
					})
				);
			});
		});

		describe('unknown events', () => {
			it('should log unknown event types without crashing', async () => {
				const events: CodexSDKEvent[] = [
					{ type: 'future.event' as any },
				];
				mockExecution = createMockExecution(events);
				mockExecFn = createMockExecFn(mockExecution);
				harness = new CodexHarness(mockExecFn);

				await harness.spawn(makeConfig());
				await flushAsync();

				expect(logger.debug).toHaveBeenCalledWith(
					expect.stringContaining('Unknown Codex event type: future.event'),
					expect.any(String),
					expect.any(Object)
				);
			});
		});

		describe('item.completed with no item', () => {
			it('should silently skip when item is undefined', async () => {
				const events: CodexSDKEvent[] = [
					{ type: 'item.completed' },
				];
				mockExecution = createMockExecution(events);
				mockExecFn = createMockExecFn(mockExecution);
				harness = new CodexHarness(mockExecFn);

				const dataHandler = vi.fn();
				harness.on('data', dataHandler);

				await harness.spawn(makeConfig());
				await flushAsync();

				expect(dataHandler).not.toHaveBeenCalled();
			});
		});
	});

	// ════════════════════════════════════════════════════════════════════════
	// write()
	// ════════════════════════════════════════════════════════════════════════

	describe('write()', () => {
		beforeEach(async () => {
			mockExecution = createHangingExecution();
			mockExecFn = createMockExecFn(mockExecution);
			harness = new CodexHarness(mockExecFn);
			await harness.spawn(makeConfig());
		});

		it('should send text input to execution.sendInput()', () => {
			harness.write({ type: 'text', text: 'follow up' });
			expect(mockExecution.sendInput).toHaveBeenCalledWith('follow up');
		});

		it('should send message text to execution.sendInput()', () => {
			harness.write({ type: 'message', text: 'message text' });
			expect(mockExecution.sendInput).toHaveBeenCalledWith('message text');
		});

		it('should embed image paths in prompt text for message+images', () => {
			harness.write({
				type: 'message',
				text: 'Look at this',
				images: ['/tmp/img1.png', '/tmp/img2.png'],
			});

			const call = (mockExecution.sendInput as any).mock.calls[0][0];
			expect(call).toContain('Look at this');
			expect(call).toContain('[Image: /tmp/img1.png]');
			expect(call).toContain('[Image: /tmp/img2.png]');
		});

		it('should send only image refs when message has no text', () => {
			harness.write({
				type: 'message',
				images: ['/tmp/img.png'],
			});

			const call = (mockExecution.sendInput as any).mock.calls[0][0];
			expect(call).toBe('[Image: /tmp/img.png]');
		});

		it('should warn and no-op when disposed', () => {
			harness.dispose();
			harness.write({ type: 'text', text: 'ignored' });
			expect(logger.warn).toHaveBeenCalledWith(
				expect.stringContaining('write() called on disposed harness'),
				expect.any(String)
			);
		});

		it('should warn and no-op when not running', () => {
			harness.kill();
			harness.write({ type: 'text', text: 'ignored' });
			expect(logger.warn).toHaveBeenCalledWith(
				expect.stringContaining('write() called but harness is not running'),
				expect.any(String)
			);
		});
	});

	// ════════════════════════════════════════════════════════════════════════
	// interrupt()
	// ════════════════════════════════════════════════════════════════════════

	describe('interrupt()', () => {
		it('should call execution.stop() when running', async () => {
			mockExecution = createHangingExecution();
			mockExecFn = createMockExecFn(mockExecution);
			harness = new CodexHarness(mockExecFn);

			await harness.spawn(makeConfig());
			await harness.interrupt();
			expect(mockExecution.stop).toHaveBeenCalledOnce();
		});

		it('should warn and no-op when disposed', async () => {
			harness.dispose();
			await harness.interrupt();
			expect(logger.warn).toHaveBeenCalledWith(
				expect.stringContaining('interrupt() called on disposed harness'),
				expect.any(String)
			);
		});

		it('should not throw when execution.stop() throws', async () => {
			mockExecution = createHangingExecution();
			(mockExecution.stop as any).mockImplementation(() => {
				throw new Error('stop failed');
			});
			mockExecFn = createMockExecFn(mockExecution);
			harness = new CodexHarness(mockExecFn);

			await harness.spawn(makeConfig());
			await expect(harness.interrupt()).resolves.toBeUndefined();
		});

		it('should no-op when not running (no execution)', async () => {
			await harness.interrupt();
			expect(mockExecution.stop).not.toHaveBeenCalled();
		});
	});

	// ════════════════════════════════════════════════════════════════════════
	// kill()
	// ════════════════════════════════════════════════════════════════════════

	describe('kill()', () => {
		it('should call execution.close()', async () => {
			mockExecution = createHangingExecution();
			mockExecFn = createMockExecFn(mockExecution);
			harness = new CodexHarness(mockExecFn);

			await harness.spawn(makeConfig());
			harness.kill();
			expect(mockExecution.close).toHaveBeenCalledOnce();
		});

		it('should set isRunning() to false', async () => {
			mockExecution = createHangingExecution();
			mockExecFn = createMockExecFn(mockExecution);
			harness = new CodexHarness(mockExecFn);

			await harness.spawn(makeConfig());
			expect(harness.isRunning()).toBe(true);
			harness.kill();
			expect(harness.isRunning()).toBe(false);
		});

		it('should clear execution reference', async () => {
			mockExecution = createHangingExecution();
			mockExecFn = createMockExecFn(mockExecution);
			harness = new CodexHarness(mockExecFn);

			await harness.spawn(makeConfig());
			harness.kill();
			// Verify by checking that write() warns about not running
			harness.write({ type: 'text', text: 'test' });
			expect(logger.warn).toHaveBeenCalledWith(
				expect.stringContaining('write() called but harness is not running'),
				expect.any(String)
			);
		});

		it('should no-op when disposed', async () => {
			harness.dispose();
			harness.kill();
			// Should not throw
			expect(mockExecution.close).not.toHaveBeenCalled();
		});

		it('should not throw when execution.close() throws', async () => {
			mockExecution = createHangingExecution();
			(mockExecution.close as any).mockImplementation(() => {
				throw new Error('close failed');
			});
			mockExecFn = createMockExecFn(mockExecution);
			harness = new CodexHarness(mockExecFn);

			await harness.spawn(makeConfig());
			expect(() => harness.kill()).not.toThrow();
		});
	});

	// ════════════════════════════════════════════════════════════════════════
	// dispose()
	// ════════════════════════════════════════════════════════════════════════

	describe('dispose()', () => {
		it('should set isDisposed() to true', () => {
			expect(harness.isDisposed()).toBe(false);
			harness.dispose();
			expect(harness.isDisposed()).toBe(true);
		});

		it('should be idempotent (safe to call multiple times)', () => {
			harness.dispose();
			harness.dispose();
			expect(harness.isDisposed()).toBe(true);
		});

		it('should kill if running', async () => {
			mockExecution = createHangingExecution();
			mockExecFn = createMockExecFn(mockExecution);
			harness = new CodexHarness(mockExecFn);

			await harness.spawn(makeConfig());
			expect(harness.isRunning()).toBe(true);
			harness.dispose();
			expect(harness.isRunning()).toBe(false);
			expect(mockExecution.close).toHaveBeenCalledOnce();
		});

		it('should remove all event listeners', async () => {
			const handler = vi.fn();
			harness.on('data', handler);
			expect(harness.listenerCount('data')).toBe(1);

			harness.dispose();
			expect(harness.listenerCount('data')).toBe(0);
		});
	});

	// ════════════════════════════════════════════════════════════════════════
	// respondToInteraction()
	// ════════════════════════════════════════════════════════════════════════

	describe('respondToInteraction()', () => {
		it('should log a warning (Codex does not support mid-turn interactions)', async () => {
			await harness.respondToInteraction('interaction-1', { kind: 'approve' });
			expect(logger.warn).toHaveBeenCalledWith(
				expect.stringContaining('respondToInteraction()'),
				expect.any(String)
			);
		});
	});

	// ════════════════════════════════════════════════════════════════════════
	// updateRuntimeSettings()
	// ════════════════════════════════════════════════════════════════════════

	describe('updateRuntimeSettings()', () => {
		it('should warn when disposed', async () => {
			harness.dispose();
			await harness.updateRuntimeSettings({ permissionMode: 'default' as any });
			expect(logger.warn).toHaveBeenCalledWith(
				expect.stringContaining('updateRuntimeSettings() called on disposed harness'),
				expect.any(String)
			);
		});

		it('should warn when not running', async () => {
			await harness.updateRuntimeSettings({ model: 'o4-mini' });
			expect(logger.warn).toHaveBeenCalledWith(
				expect.stringContaining('updateRuntimeSettings() called but harness is not running'),
				expect.any(String)
			);
		});

		it('should log debug messages for each setting (not supported by Codex SDK)', async () => {
			mockExecution = createHangingExecution();
			mockExecFn = createMockExecFn(mockExecution);
			harness = new CodexHarness(mockExecFn);

			await harness.spawn(makeConfig());
			await harness.updateRuntimeSettings({
				permissionMode: 'default' as any,
				model: 'o4-mini',
				providerOptions: { sandbox: 'full' },
			});

			expect(logger.debug).toHaveBeenCalledWith(
				expect.stringContaining('Runtime permission mode change requested'),
				expect.any(String)
			);
			expect(logger.debug).toHaveBeenCalledWith(
				expect.stringContaining('Runtime model change requested'),
				expect.any(String)
			);
			expect(logger.debug).toHaveBeenCalledWith(
				expect.stringContaining('Runtime provider options change requested'),
				expect.any(String),
				expect.any(Object)
			);
		});
	});

	// ════════════════════════════════════════════════════════════════════════
	// Capability Accessors
	// ════════════════════════════════════════════════════════════════════════

	describe('getCapabilities()', () => {
		it('should return Codex-specific capability flags', () => {
			const caps = harness.getCapabilities();

			expect(caps.supportsInteractionRequests).toBe(false);
			expect(caps.supportsMidTurnInput).toBe(true);
			expect(caps.supportsStructuredOutput).toBe(true);
			expect(caps.supportsRuntimePermissionUpdates).toBe(false);
			expect(caps.supportsRuntimeModelChange).toBe(false);
			expect(caps.supportsRuntimeEffortChange).toBe(false);
			expect(caps.supportsSkillsEnumeration).toBe(false);
			expect(caps.supportsRuntimeSlashCommands).toBe(false);
			expect(caps.supportsFileCheckpointing).toBe(false);
			expect(caps.supportsBudgetLimits).toBe(false);
			expect(caps.supportsContextCompaction).toBe(false);
			expect(caps.supportsSessionFork).toBe(false);
		});
	});

	describe('agentId', () => {
		it('should be codex', () => {
			expect(harness.agentId).toBe('codex');
		});
	});
});
