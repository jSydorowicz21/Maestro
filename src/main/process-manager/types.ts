import type { ChildProcess } from 'child_process';
import type { IPty } from 'node-pty';
import type { AgentOutputParser } from '../parsers';
import type { AgentError, PermissionMode } from '../../shared/types';

/**
 * Discriminator for the execution backend powering a run.
 * - 'pty': PTY-based process (terminals, agents requiring TTY)
 * - 'child-process': Standard child process (batch-mode agents)
 * - 'harness': SDK-backed agent harness (future harness executions)
 */
export type ExecutionBackend = 'pty' | 'child-process' | 'harness';

/**
 * Configuration for spawning a new process
 */
export interface ProcessConfig {
	sessionId: string;
	toolType: string;
	cwd: string;
	command: string;
	args: string[];
	requiresPty?: boolean;
	prompt?: string;
	shell?: string;
	shellArgs?: string;
	shellEnvVars?: Record<string, string>;
	images?: string[];
	imageArgs?: (imagePath: string) => string[];
	promptArgs?: (prompt: string) => string[];
	contextWindow?: number;
	customEnvVars?: Record<string, string>;
	noPromptSeparator?: boolean;
	sshRemoteId?: string;
	sshRemoteHost?: string;
	querySource?: 'user' | 'auto';
	tabId?: string;
	projectPath?: string;
	/** If true, always spawn in a shell (for PATH resolution on Windows) */
	runInShell?: boolean;
	/** If true, send the prompt via stdin as JSON instead of command line */
	sendPromptViaStdin?: boolean;
	/** If true, send the prompt via stdin as raw text instead of command line */
	sendPromptViaStdinRaw?: boolean;
	/** Script to send via stdin for SSH execution (bypasses shell escaping) */
	sshStdinScript?: string;
	/** Permission mode for this execution */
	permissionMode?: PermissionMode;
	/** Hint from callers; ProcessManager has final say on execution mode */
	preferredExecutionMode?: 'auto' | 'classic' | 'harness';
	/** Provider-specific options (adapter-owned, opaque to ProcessManager) */
	providerOptions?: Record<string, unknown>;
}

/**
 * Shared execution record for all AI runs managed by ProcessManager.
 *
 * Represents classic child-process, PTY, and future harness executions
 * under one model. The `backend` discriminator determines which process
 * handle fields are populated.
 *
 * Previously named ManagedProcess — the old name is retained as an alias
 * for backwards compatibility.
 */
export interface AgentExecution {
	sessionId: string;
	toolType: string;
	/** Discriminator for the execution backend */
	backend: ExecutionBackend;
	/** PTY process handle (populated when backend is 'pty') */
	ptyProcess?: IPty;
	/** Child process handle (populated when backend is 'child-process') */
	childProcess?: ChildProcess;
	cwd: string;
	/**
	 * OS process ID. Null or undefined for harness-backed runs
	 * that don't spawn a system process.
	 */
	pid?: number | null;
	isTerminal: boolean;
	isBatchMode?: boolean;
	isStreamJsonMode?: boolean;
	jsonBuffer?: string;
	lastCommand?: string;
	sessionIdEmitted?: boolean;
	resultEmitted?: boolean;
	errorEmitted?: boolean;
	startTime: number;
	outputParser?: AgentOutputParser;
	stderrBuffer?: string;
	stdoutBuffer?: string;
	streamedText?: string;
	contextWindow?: number;
	tempImageFiles?: string[];
	command?: string;
	args?: string[];
	lastUsageTotals?: UsageTotals;
	usageIsCumulative?: boolean;
	querySource?: 'user' | 'auto';
	tabId?: string;
	projectPath?: string;
	sshRemoteId?: string;
	sshRemoteHost?: string;
	dataBuffer?: string;
	dataBufferTimeout?: NodeJS.Timeout;
}

/**
 * @deprecated Use AgentExecution instead. Retained for backwards compatibility.
 */
export type ManagedProcess = AgentExecution;

export interface UsageTotals {
	inputTokens: number;
	outputTokens: number;
	cacheReadInputTokens: number;
	cacheCreationInputTokens: number;
	reasoningTokens: number;
}

export interface UsageStats {
	inputTokens: number;
	outputTokens: number;
	cacheReadInputTokens: number;
	cacheCreationInputTokens: number;
	totalCostUsd: number;
	contextWindow: number;
	reasoningTokens?: number;
}

export interface SpawnResult {
	/**
	 * OS process ID. Null for harness-backed runs that don't spawn
	 * a system process. Never use sentinel values like -1.
	 */
	pid: number | null;
	success: boolean;
}

export interface CommandResult {
	exitCode: number;
}

/**
 * Events emitted by ProcessManager
 */
export interface ProcessManagerEvents {
	data: (sessionId: string, data: string) => void;
	stderr: (sessionId: string, data: string) => void;
	exit: (sessionId: string, code: number) => void;
	'command-exit': (sessionId: string, code: number) => void;
	usage: (sessionId: string, stats: UsageStats) => void;
	'session-id': (sessionId: string, agentSessionId: string) => void;
	'agent-error': (sessionId: string, error: AgentError) => void;
	'thinking-chunk': (sessionId: string, text: string) => void;
	'tool-execution': (sessionId: string, tool: ToolExecution) => void;
	'slash-commands': (sessionId: string, commands: unknown[]) => void;
	'query-complete': (sessionId: string, data: QueryCompleteData) => void;
}

export interface ToolExecution {
	toolName: string;
	state: unknown;
	timestamp: number;
}

export interface QueryCompleteData {
	sessionId: string;
	agentType: string;
	source: 'user' | 'auto';
	startTime: number;
	duration: number;
	projectPath?: string;
	tabId?: string;
}

// Re-export for backwards compatibility
export type { ParsedEvent, AgentOutputParser } from '../parsers';
export type { AgentError, AgentErrorType, SshRemoteConfig, PermissionMode, AgentExecutionConfig, StructuredOutputConfig } from '../../shared/types';
