/**
 * Tests for src/main/group-chat/spawnGroupChatAgent.ts
 *
 * Tests the shared spawn helper that consolidates SSH wrapping,
 * Windows config, and processManager.spawn() calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock SSH wrapper
vi.mock('../../../main/utils/ssh-spawn-wrapper', () => ({
	wrapSpawnWithSsh: vi.fn(),
}));

// Mock Windows spawn config
vi.mock('../../../main/group-chat/group-chat-config', () => ({
	getWindowsSpawnConfig: vi.fn(),
}));

// Mock agent-args
vi.mock('../../../main/utils/agent-args', () => ({
	getContextWindowValue: vi.fn(),
}));

import {
	spawnGroupChatAgent,
	type GroupChatSpawnConfig,
	type GroupChatSpawnDeps,
} from '../../../main/group-chat/spawnGroupChatAgent';
import { wrapSpawnWithSsh } from '../../../main/utils/ssh-spawn-wrapper';
import { getWindowsSpawnConfig } from '../../../main/group-chat/group-chat-config';
import { getContextWindowValue } from '../../../main/utils/agent-args';
import type { AgentConfig } from '../../../main/agents/definitions';

function createMockAgent(overrides?: Partial<AgentConfig>): AgentConfig {
	return {
		id: 'claude-code',
		name: 'Claude Code',
		binaryName: 'claude',
		command: '/usr/bin/claude',
		args: ['--print'],
		available: true,
		path: '/usr/bin/claude',
		capabilities: { supportsStreamJsonInput: false } as any,
		...overrides,
	} as AgentConfig;
}

function createMockProcessManager() {
	return {
		spawn: vi.fn(() => ({ pid: 12345, success: true })),
		write: vi.fn(() => true),
		kill: vi.fn(() => true),
	};
}

function createBaseConfig(overrides?: Partial<GroupChatSpawnConfig>): GroupChatSpawnConfig {
	return {
		agentId: 'claude-code',
		sessionId: 'test-session-123',
		cwd: '/home/user/project',
		command: '/usr/bin/claude',
		args: ['--print', '-p', 'test prompt'],
		prompt: 'Hello agent',
		readOnlyMode: false,
		agent: createMockAgent(),
		agentConfigValues: {},
		customEnvVars: { API_KEY: 'test-key' },
		...overrides,
	};
}

describe('spawnGroupChatAgent', () => {
	let mockProcessManager: ReturnType<typeof createMockProcessManager>;

	beforeEach(() => {
		vi.clearAllMocks();
		mockProcessManager = createMockProcessManager();

		// Default: no Windows config (non-Windows platform)
		vi.mocked(getWindowsSpawnConfig).mockReturnValue({
			shell: undefined,
			runInShell: false,
			sendPromptViaStdin: false,
			sendPromptViaStdinRaw: false,
		});

		// Default context window
		vi.mocked(getContextWindowValue).mockReturnValue(200000);
	});

	describe('basic spawn (no SSH, no Windows)', () => {
		it('should call processManager.spawn with correct config', async () => {
			const config = createBaseConfig();
			const deps: GroupChatSpawnDeps = { processManager: mockProcessManager };

			const result = await spawnGroupChatAgent(config, deps);

			expect(result).toEqual({ pid: 12345, success: true });
			expect(mockProcessManager.spawn).toHaveBeenCalledWith({
				sessionId: 'test-session-123',
				toolType: 'claude-code',
				cwd: '/home/user/project',
				command: '/usr/bin/claude',
				args: ['--print', '-p', 'test prompt'],
				readOnlyMode: false,
				prompt: 'Hello agent',
				contextWindow: 200000,
				customEnvVars: { API_KEY: 'test-key' },
				promptArgs: undefined,
				noPromptSeparator: undefined,
				shell: undefined,
				runInShell: false,
				sendPromptViaStdin: false,
				sendPromptViaStdinRaw: false,
				sshStdinScript: undefined,
			});
		});

		it('should not call wrapSpawnWithSsh when no sshStore provided', async () => {
			const config = createBaseConfig({
				sshRemoteConfig: { enabled: true, remoteId: 'remote-1' },
			});
			const deps: GroupChatSpawnDeps = { processManager: mockProcessManager };

			await spawnGroupChatAgent(config, deps);

			expect(wrapSpawnWithSsh).not.toHaveBeenCalled();
		});

		it('should not call wrapSpawnWithSsh when no sshRemoteConfig provided', async () => {
			const sshStore = {} as any;
			const deps: GroupChatSpawnDeps = { processManager: mockProcessManager, sshStore };

			await spawnGroupChatAgent(createBaseConfig(), deps);

			expect(wrapSpawnWithSsh).not.toHaveBeenCalled();
		});
	});

	describe('SSH wrapping', () => {
		it('should wrap with SSH when sshRemoteConfig and sshStore are provided', async () => {
			const sshStore = {} as any;
			vi.mocked(wrapSpawnWithSsh).mockResolvedValue({
				command: 'ssh',
				args: ['remote-host', '--', 'claude', '--print'],
				cwd: '/remote/project',
				prompt: 'wrapped prompt',
				customEnvVars: { REMOTE_KEY: 'val' },
				sshStdinScript: 'echo "script"',
				sshRemoteUsed: { name: 'my-remote', id: 'remote-1' } as any,
			});

			const config = createBaseConfig({
				sshRemoteConfig: { enabled: true, remoteId: 'remote-1' },
			});
			const deps: GroupChatSpawnDeps = { processManager: mockProcessManager, sshStore };

			await spawnGroupChatAgent(config, deps);

			expect(wrapSpawnWithSsh).toHaveBeenCalledWith(
				{
					command: '/usr/bin/claude',
					args: ['--print', '-p', 'test prompt'],
					cwd: '/home/user/project',
					prompt: 'Hello agent',
					customEnvVars: { API_KEY: 'test-key' },
					promptArgs: undefined,
					noPromptSeparator: undefined,
					agentBinaryName: 'claude',
				},
				{ enabled: true, remoteId: 'remote-1' },
				sshStore
			);

			// Verify SSH-wrapped values are used in spawn
			expect(mockProcessManager.spawn).toHaveBeenCalledWith(
				expect.objectContaining({
					command: 'ssh',
					args: ['remote-host', '--', 'claude', '--print'],
					cwd: '/remote/project',
					prompt: 'wrapped prompt',
					customEnvVars: { REMOTE_KEY: 'val' },
					sshStdinScript: 'echo "script"',
				})
			);
		});

		it('should pass agent promptArgs and noPromptSeparator to SSH wrapper', async () => {
			const promptArgsFn = (p: string) => ['-p', p];
			const agent = createMockAgent({
				promptArgs: promptArgsFn,
				noPromptSeparator: true,
			});
			const sshStore = {} as any;
			vi.mocked(wrapSpawnWithSsh).mockResolvedValue({
				command: 'ssh',
				args: [],
				cwd: '/remote',
				prompt: 'p',
				customEnvVars: undefined,
				sshRemoteUsed: null,
			});

			const config = createBaseConfig({
				agent,
				sshRemoteConfig: { enabled: true, remoteId: 'r1' },
			});
			await spawnGroupChatAgent(config, { processManager: mockProcessManager, sshStore });

			expect(wrapSpawnWithSsh).toHaveBeenCalledWith(
				expect.objectContaining({
					promptArgs: promptArgsFn,
					noPromptSeparator: true,
					agentBinaryName: 'claude',
				}),
				expect.any(Object),
				sshStore
			);
		});
	});

	describe('Windows shell config', () => {
		it('should apply Windows shell config when getWindowsSpawnConfig returns shell', async () => {
			vi.mocked(getWindowsSpawnConfig).mockReturnValue({
				shell: 'powershell.exe',
				runInShell: true,
				sendPromptViaStdin: true,
				sendPromptViaStdinRaw: false,
			});

			await spawnGroupChatAgent(createBaseConfig(), {
				processManager: mockProcessManager,
			});

			expect(mockProcessManager.spawn).toHaveBeenCalledWith(
				expect.objectContaining({
					shell: 'powershell.exe',
					runInShell: true,
					sendPromptViaStdin: true,
					sendPromptViaStdinRaw: false,
				})
			);
		});

		it('should pass sshRemoteConfig to getWindowsSpawnConfig for SSH exclusion', async () => {
			const sshConfig = { enabled: true, remoteId: 'r1' };
			await spawnGroupChatAgent(createBaseConfig({ sshRemoteConfig: sshConfig }), {
				processManager: mockProcessManager,
			});

			expect(getWindowsSpawnConfig).toHaveBeenCalledWith('claude-code', sshConfig);
		});
	});

	describe('agent config passthrough', () => {
		it('should pass through custom path, args, and env vars', async () => {
			const config = createBaseConfig({
				command: '/custom/path/claude',
				args: ['--custom-arg', '--verbose'],
				customEnvVars: { CUSTOM_VAR: 'value', ANOTHER: 'val2' },
			});

			await spawnGroupChatAgent(config, { processManager: mockProcessManager });

			expect(mockProcessManager.spawn).toHaveBeenCalledWith(
				expect.objectContaining({
					command: '/custom/path/claude',
					args: ['--custom-arg', '--verbose'],
					customEnvVars: { CUSTOM_VAR: 'value', ANOTHER: 'val2' },
				})
			);
		});

		it('should use correct agent binary name from agent config', async () => {
			const agent = createMockAgent({ binaryName: 'codex' });
			const sshStore = {} as any;
			vi.mocked(wrapSpawnWithSsh).mockResolvedValue({
				command: 'ssh',
				args: [],
				cwd: '/',
				prompt: '',
				customEnvVars: undefined,
				sshRemoteUsed: null,
			});

			await spawnGroupChatAgent(
				createBaseConfig({
					agent,
					agentId: 'codex',
					sshRemoteConfig: { enabled: true, remoteId: 'r1' },
				}),
				{ processManager: mockProcessManager, sshStore }
			);

			expect(wrapSpawnWithSsh).toHaveBeenCalledWith(
				expect.objectContaining({ agentBinaryName: 'codex' }),
				expect.any(Object),
				sshStore
			);
		});

		it('should pass agentConfigValues to getContextWindowValue', async () => {
			const agent = createMockAgent();
			const configValues = { maxTokens: 100000 };

			await spawnGroupChatAgent(createBaseConfig({ agent, agentConfigValues: configValues }), {
				processManager: mockProcessManager,
			});

			expect(getContextWindowValue).toHaveBeenCalledWith(agent, configValues);
		});

		it('should pass readOnlyMode through to spawn', async () => {
			await spawnGroupChatAgent(createBaseConfig({ readOnlyMode: true }), {
				processManager: mockProcessManager,
			});

			expect(mockProcessManager.spawn).toHaveBeenCalledWith(
				expect.objectContaining({ readOnlyMode: true })
			);
		});
	});
});
