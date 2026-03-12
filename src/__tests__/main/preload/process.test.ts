/**
 * Tests for process preload API
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron ipcRenderer
const mockInvoke = vi.fn();
const mockOn = vi.fn();
const mockRemoveListener = vi.fn();
const mockSend = vi.fn();

vi.mock('electron', () => ({
	ipcRenderer: {
		invoke: (...args: unknown[]) => mockInvoke(...args),
		on: (...args: unknown[]) => mockOn(...args),
		removeListener: (...args: unknown[]) => mockRemoveListener(...args),
		send: (...args: unknown[]) => mockSend(...args),
	},
}));

import { createProcessApi, type ProcessConfig } from '../../../main/preload/process';

describe('Process Preload API', () => {
	let api: ReturnType<typeof createProcessApi>;

	beforeEach(() => {
		vi.clearAllMocks();
		api = createProcessApi();
	});

	describe('spawn', () => {
		it('should invoke process:spawn with config', async () => {
			const config: ProcessConfig = {
				sessionId: 'session-123',
				toolType: 'claude-code',
				cwd: '/home/user/project',
				command: 'claude',
				args: ['--json'],
			};
			mockInvoke.mockResolvedValue({ pid: 1234, success: true });

			const result = await api.spawn(config);

			expect(mockInvoke).toHaveBeenCalledWith('process:spawn', config);
			expect(result.pid).toBe(1234);
			expect(result.success).toBe(true);
		});

		it('should handle SSH remote response', async () => {
			const config: ProcessConfig = {
				sessionId: 'session-123',
				toolType: 'claude-code',
				cwd: '/home/user/project',
				command: 'claude',
				args: [],
			};
			mockInvoke.mockResolvedValue({
				pid: 1234,
				success: true,
				sshRemote: { id: 'remote-1', name: 'My Server', host: 'example.com' },
			});

			const result = await api.spawn(config);

			expect(result.sshRemote).toEqual({ id: 'remote-1', name: 'My Server', host: 'example.com' });
		});
	});

	describe('write', () => {
		it('should invoke process:write with sessionId and data', async () => {
			mockInvoke.mockResolvedValue(true);

			const result = await api.write('session-123', 'Hello');

			expect(mockInvoke).toHaveBeenCalledWith('process:write', 'session-123', 'Hello');
			expect(result).toBe(true);
		});
	});

	describe('interrupt', () => {
		it('should invoke process:interrupt with sessionId', async () => {
			mockInvoke.mockResolvedValue(true);

			const result = await api.interrupt('session-123');

			expect(mockInvoke).toHaveBeenCalledWith('process:interrupt', 'session-123');
			expect(result).toBe(true);
		});
	});

	describe('kill', () => {
		it('should invoke process:kill with sessionId', async () => {
			mockInvoke.mockResolvedValue(true);

			const result = await api.kill('session-123');

			expect(mockInvoke).toHaveBeenCalledWith('process:kill', 'session-123');
			expect(result).toBe(true);
		});
	});

	describe('resize', () => {
		it('should invoke process:resize with sessionId, cols, and rows', async () => {
			mockInvoke.mockResolvedValue(true);

			const result = await api.resize('session-123', 120, 40);

			expect(mockInvoke).toHaveBeenCalledWith('process:resize', 'session-123', 120, 40);
			expect(result).toBe(true);
		});
	});

	describe('runCommand', () => {
		it('should invoke process:runCommand with config', async () => {
			const config = {
				sessionId: 'session-123',
				command: 'ls -la',
				cwd: '/home/user',
				shell: '/bin/bash',
			};
			mockInvoke.mockResolvedValue({ exitCode: 0 });

			const result = await api.runCommand(config);

			expect(mockInvoke).toHaveBeenCalledWith('process:runCommand', config);
			expect(result.exitCode).toBe(0);
		});

		it('should handle SSH remote config', async () => {
			const config = {
				sessionId: 'session-123',
				command: 'ls -la',
				cwd: '/home/user',
				sessionSshRemoteConfig: {
					enabled: true,
					remoteId: 'remote-1',
					workingDirOverride: '/remote/path',
				},
			};
			mockInvoke.mockResolvedValue({ exitCode: 0 });

			await api.runCommand(config);

			expect(mockInvoke).toHaveBeenCalledWith('process:runCommand', config);
		});
	});

	describe('getActiveProcesses', () => {
		it('should invoke process:getActiveProcesses', async () => {
			const mockProcesses = [
				{
					sessionId: 'session-123',
					toolType: 'claude-code',
					pid: 1234,
					cwd: '/home/user',
					isTerminal: false,
					isBatchMode: false,
					startTime: Date.now(),
				},
			];
			mockInvoke.mockResolvedValue(mockProcesses);

			const result = await api.getActiveProcesses();

			expect(mockInvoke).toHaveBeenCalledWith('process:getActiveProcesses');
			expect(result).toEqual(mockProcesses);
		});
	});

	describe('onData', () => {
		it('should register event listener for process:data', () => {
			const callback = vi.fn();

			const cleanup = api.onData(callback);

			expect(mockOn).toHaveBeenCalledWith('process:data', expect.any(Function));
			expect(typeof cleanup).toBe('function');
		});

		it('should call callback with sessionId and data', () => {
			const callback = vi.fn();
			let registeredHandler: (event: unknown, sessionId: string, data: string) => void;

			mockOn.mockImplementation((channel: string, handler: typeof registeredHandler) => {
				if (channel === 'process:data') {
					registeredHandler = handler;
				}
			});

			api.onData(callback);
			registeredHandler!({}, 'session-123', 'output data');

			expect(callback).toHaveBeenCalledWith('session-123', 'output data');
		});
	});

	describe('onExit', () => {
		it('should register event listener for process:exit', () => {
			const callback = vi.fn();

			const cleanup = api.onExit(callback);

			expect(mockOn).toHaveBeenCalledWith('process:exit', expect.any(Function));
			expect(typeof cleanup).toBe('function');
		});
	});

	describe('onUsage', () => {
		it('should register event listener for process:usage', () => {
			const callback = vi.fn();
			let registeredHandler: (event: unknown, sessionId: string, usageStats: unknown) => void;

			mockOn.mockImplementation((channel: string, handler: typeof registeredHandler) => {
				if (channel === 'process:usage') {
					registeredHandler = handler;
				}
			});

			api.onUsage(callback);

			const usageStats = {
				inputTokens: 100,
				outputTokens: 200,
				cacheReadInputTokens: 50,
				cacheCreationInputTokens: 25,
				totalCostUsd: 0.01,
				contextWindow: 100000,
			};
			registeredHandler!({}, 'session-123', usageStats);

			expect(callback).toHaveBeenCalledWith('session-123', usageStats);
		});
	});

	describe('onAgentError', () => {
		it('should register event listener for agent:error', () => {
			const callback = vi.fn();
			let registeredHandler: (event: unknown, sessionId: string, error: unknown) => void;

			mockOn.mockImplementation((channel: string, handler: typeof registeredHandler) => {
				if (channel === 'agent:error') {
					registeredHandler = handler;
				}
			});

			api.onAgentError(callback);

			const error = {
				type: 'auth_expired',
				message: 'Authentication expired',
				recoverable: true,
				agentId: 'claude-code',
				timestamp: Date.now(),
			};
			registeredHandler!({}, 'session-123', error);

			expect(callback).toHaveBeenCalledWith('session-123', error);
		});
	});

	describe('sendRemoteNewTabResponse', () => {
		it('should send response via ipcRenderer.send', () => {
			api.sendRemoteNewTabResponse('response-channel', { tabId: 'tab-123' });

			expect(mockSend).toHaveBeenCalledWith('response-channel', { tabId: 'tab-123' });
		});

		it('should send null result', () => {
			api.sendRemoteNewTabResponse('response-channel', null);

			expect(mockSend).toHaveBeenCalledWith('response-channel', null);
		});
	});

	describe('onInteractionRequest', () => {
		it('should register event listener for process:interaction-request', () => {
			const callback = vi.fn();

			const cleanup = api.onInteractionRequest(callback);

			expect(mockOn).toHaveBeenCalledWith('process:interaction-request', expect.any(Function));
			expect(typeof cleanup).toBe('function');
		});

		it('should call callback with sessionId and tool approval request', () => {
			const callback = vi.fn();
			let registeredHandler: (event: unknown, sessionId: string, request: unknown) => void;

			mockOn.mockImplementation((channel: string, handler: typeof registeredHandler) => {
				if (channel === 'process:interaction-request') {
					registeredHandler = handler;
				}
			});

			api.onInteractionRequest(callback);

			const toolApprovalRequest = {
				interactionId: 'int-001',
				sessionId: 'session-123',
				agentId: 'claude-code',
				kind: 'tool-approval' as const,
				timestamp: Date.now(),
				timeoutMs: 300000,
				toolUseId: 'tool-use-abc',
				toolName: 'Edit',
				toolInput: { file_path: '/src/main.ts', old_string: 'foo', new_string: 'bar' },
				decisionReason: 'File write requires approval',
			};
			registeredHandler!({}, 'session-123', toolApprovalRequest);

			expect(callback).toHaveBeenCalledWith('session-123', toolApprovalRequest);
		});

		it('should call callback with sessionId and clarification request', () => {
			const callback = vi.fn();
			let registeredHandler: (event: unknown, sessionId: string, request: unknown) => void;

			mockOn.mockImplementation((channel: string, handler: typeof registeredHandler) => {
				if (channel === 'process:interaction-request') {
					registeredHandler = handler;
				}
			});

			api.onInteractionRequest(callback);

			const clarificationRequest = {
				interactionId: 'int-002',
				sessionId: 'session-456',
				agentId: 'claude-code',
				kind: 'clarification' as const,
				timestamp: Date.now(),
				questions: [
					{
						question: 'Which branch should I target?',
						header: 'Branch',
						options: [
							{ label: 'main', description: 'The main branch' },
							{ label: 'develop', description: 'The develop branch' },
						],
						multiSelect: false,
					},
				],
				allowFreeText: true,
			};
			registeredHandler!({}, 'session-456', clarificationRequest);

			expect(callback).toHaveBeenCalledWith('session-456', clarificationRequest);
		});

		it('should return cleanup function that removes listener', () => {
			const callback = vi.fn();

			const cleanup = api.onInteractionRequest(callback);
			cleanup();

			expect(mockRemoveListener).toHaveBeenCalledWith(
				'process:interaction-request',
				expect.any(Function)
			);
		});
	});

	describe('respondToInteraction', () => {
		it('should invoke process:respond-interaction with correct arguments', async () => {
			mockInvoke.mockResolvedValue(undefined);

			const response = {
				kind: 'approve' as const,
				message: 'Approved by user',
			};

			await api.respondToInteraction('session-123', 'int-001', response);

			expect(mockInvoke).toHaveBeenCalledWith(
				'process:respond-interaction',
				'session-123',
				'int-001',
				response
			);
		});

		it('should send deny response with interrupt flag', async () => {
			mockInvoke.mockResolvedValue(undefined);

			const response = {
				kind: 'deny' as const,
				message: 'User denied',
				interrupt: true,
			};

			await api.respondToInteraction('session-456', 'int-002', response);

			expect(mockInvoke).toHaveBeenCalledWith(
				'process:respond-interaction',
				'session-456',
				'int-002',
				response
			);
		});

		it('should send clarification-answer response', async () => {
			mockInvoke.mockResolvedValue(undefined);

			const response = {
				kind: 'clarification-answer' as const,
				answers: [
					{ questionIndex: 0, selectedOptionLabels: ['main'] },
				],
			};

			await api.respondToInteraction('session-789', 'int-003', response);

			expect(mockInvoke).toHaveBeenCalledWith(
				'process:respond-interaction',
				'session-789',
				'int-003',
				response
			);
		});

		it('should send cancel response', async () => {
			mockInvoke.mockResolvedValue(undefined);

			const response = {
				kind: 'cancel' as const,
				message: 'User cancelled',
			};

			await api.respondToInteraction('session-123', 'int-004', response);

			expect(mockInvoke).toHaveBeenCalledWith(
				'process:respond-interaction',
				'session-123',
				'int-004',
				response
			);
		});

		it('should send text response', async () => {
			mockInvoke.mockResolvedValue(undefined);

			const response = {
				kind: 'text' as const,
				text: 'Free text answer from user',
			};

			await api.respondToInteraction('session-123', 'int-005', response);

			expect(mockInvoke).toHaveBeenCalledWith(
				'process:respond-interaction',
				'session-123',
				'int-005',
				response
			);
		});
	});

	describe('onRemoteCommand', () => {
		it('should register listener and invoke callback with all parameters', () => {
			const callback = vi.fn();
			let registeredHandler: (
				event: unknown,
				sessionId: string,
				command: string,
				inputMode?: 'ai' | 'terminal'
			) => void;

			mockOn.mockImplementation((channel: string, handler: typeof registeredHandler) => {
				if (channel === 'remote:executeCommand') {
					registeredHandler = handler;
				}
			});

			api.onRemoteCommand(callback);
			registeredHandler!({}, 'session-123', 'test command', 'ai');

			expect(callback).toHaveBeenCalledWith('session-123', 'test command', 'ai');
		});
	});

	describe('onRuntimeMetadata', () => {
		it('should register event listener for process:runtime-metadata', () => {
			const callback = vi.fn();

			const cleanup = api.onRuntimeMetadata(callback);

			expect(mockOn).toHaveBeenCalledWith('process:runtime-metadata', expect.any(Function));
			expect(typeof cleanup).toBe('function');
		});

		it('should call callback with sessionId and full metadata snapshot', () => {
			const callback = vi.fn();
			let registeredHandler: (event: unknown, sessionId: string, metadata: unknown) => void;

			mockOn.mockImplementation((channel: string, handler: typeof registeredHandler) => {
				if (channel === 'process:runtime-metadata') {
					registeredHandler = handler;
				}
			});

			api.onRuntimeMetadata(callback);

			const metadata = {
				sessionId: 'session-123',
				source: 'claude-code',
				replace: true,
				skills: [
					{ id: 'commit', name: 'Commit', description: 'Create git commits' },
				],
				slashCommands: ['/help', '/clear'],
				availableModels: [
					{ id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
				],
				capabilities: {
					supportsRuntimeModelChange: true,
					supportsInteractionRequests: true,
				},
			};
			registeredHandler!({}, 'session-123', metadata);

			expect(callback).toHaveBeenCalledWith('session-123', metadata);
		});

		it('should call callback with partial metadata update', () => {
			const callback = vi.fn();
			let registeredHandler: (event: unknown, sessionId: string, metadata: unknown) => void;

			mockOn.mockImplementation((channel: string, handler: typeof registeredHandler) => {
				if (channel === 'process:runtime-metadata') {
					registeredHandler = handler;
				}
			});

			api.onRuntimeMetadata(callback);

			const partialUpdate = {
				sessionId: 'session-456',
				source: 'codex',
				slashCommands: ['/test', '/run'],
			};
			registeredHandler!({}, 'session-456', partialUpdate);

			expect(callback).toHaveBeenCalledWith('session-456', partialUpdate);
		});

		it('should return cleanup function that removes listener', () => {
			const callback = vi.fn();

			const cleanup = api.onRuntimeMetadata(callback);
			cleanup();

			expect(mockRemoveListener).toHaveBeenCalledWith(
				'process:runtime-metadata',
				expect.any(Function)
			);
		});
	});
});
