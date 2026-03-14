/**
 * Claude Agent SDK type definitions for the harness adapter.
 *
 * SDK version: @anthropic-ai/claude-agent-sdk v0.2.74
 * Last synced: 2026-03-12
 * Provenance: Hand-transcribed from SDK source types. Run the drift
 *   detection test (`claude-sdk-types.test.ts`) to verify compatibility
 *   when the SDK is installed as a dependency.
 *
 * These types represent the subset of the @anthropic-ai/claude-agent-sdk API
 * surface that ClaudeCodeHarness depends on. They live inside the harness
 * directory because Claude SDK types must NEVER leak across the process
 * boundary or into shared code.
 *
 * When the SDK is installed as a dependency, these can be replaced with
 * direct imports. Until then, they serve as the compile-time contract.
 */

// ============================================================================
// SDK Message Types
// ============================================================================

export interface SDKSystemMessage {
	type: 'system';
	subtype: 'init';
	session_id: string;
	tools?: Array<{ name: string }>;
	model?: string;
	slash_commands?: Array<{ name: string; description?: string }>;
	skills?: Array<{ name: string; description?: string }>;
	agents?: Array<{ name: string; description?: string }>;
	mcp_servers?: Array<{ name: string; status?: string }>;
	plugins?: unknown[];
}

export interface SDKAssistantMessage {
	type: 'assistant';
	message: {
		content: SDKContentBlock[];
	};
	session_id?: string;
}

export interface SDKPartialAssistantMessage {
	type: 'assistant';
	subtype: 'partial';
	message: {
		content: SDKContentBlock[];
	};
}

export type SDKContentBlock =
	| { type: 'text'; text: string }
	| { type: 'thinking'; thinking: string }
	| { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
	| { type: 'tool_result'; tool_use_id: string; content: string };

export type SDKResultSubtype = 'success' | 'error_max_turns' | 'error_budget' | 'error_tool_use' | 'error_unknown';

export interface SDKResultMessage {
	type: 'result';
	subtype: SDKResultSubtype;
	session_id?: string;
	result?: string;
	total_cost_usd?: number;
	usage?: {
		input_tokens?: number;
		output_tokens?: number;
		cache_read_input_tokens?: number;
		cache_creation_input_tokens?: number;
	};
	modelUsage?: Record<string, {
		input_tokens?: number;
		output_tokens?: number;
		cache_read_input_tokens?: number;
		cache_creation_input_tokens?: number;
	}>;
	num_turns?: number;
	duration_ms?: number;
	errors?: Array<{ message: string }>;
	permission_denials?: unknown[];
}

export interface SDKUserMessage {
	role: 'user';
	content: SDKUserContentBlock[];
}

export type SDKUserContentBlock =
	| { type: 'text'; text: string }
	| { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

export interface SDKToolUseSummaryMessage {
	type: 'tool_use_summary';
	tool_name: string;
	tool_use_id: string;
	input?: Record<string, unknown>;
	output?: string;
	error?: string;
}

export interface SDKRateLimitEvent {
	type: 'rate_limit';
	message?: string;
	retry_after_ms?: number;
}

export interface SDKStatusMessage {
	type: 'status';
	message: string;
}

export interface SDKCompactBoundaryMessage {
	type: 'compact_boundary';
}

export interface SDKToolProgressMessage {
	type: 'tool_progress';
	tool_use_id: string;
	tool_name?: string;
	content?: string;
}

export interface SDKAuthStatusMessage {
	type: 'auth_status';
	status: 'ok' | 'error' | 'expired';
	message?: string;
}

/**
 * Background task started event.
 * SDK version: @anthropic-ai/claude-agent-sdk v0.2.74 (Day 2 message type)
 */
export interface SDKTaskStartedMessage {
	type: 'task_started';
	task_id: string;
	task_name?: string;
	message?: string;
	session_id?: string;
}

/**
 * Background task progress event.
 * SDK version: @anthropic-ai/claude-agent-sdk v0.2.74 (Day 2 message type)
 */
export interface SDKTaskProgressMessage {
	type: 'task_progress';
	task_id: string;
	task_name?: string;
	message?: string;
	progress?: number;
	session_id?: string;
}

/**
 * Background task notification event.
 * SDK version: @anthropic-ai/claude-agent-sdk v0.2.74 (Day 2 message type)
 */
export interface SDKTaskNotificationMessage {
	type: 'task_notification';
	task_id: string;
	task_name?: string;
	message?: string;
	notification_type?: string;
	session_id?: string;
}

/**
 * Files persisted event — internal SDK bookkeeping for file checkpointing.
 * Not surfaced to the UI; logged only.
 * SDK version: @anthropic-ai/claude-agent-sdk v0.2.74 (Day 2 message type)
 */
export interface SDKFilesPersistedEvent {
	type: 'files_persisted';
	message_id?: string;
	file_paths?: string[];
	session_id?: string;
}

/**
 * Prompt suggestion event — the SDK suggests a follow-up prompt.
 * Surfaced to the renderer so it can display autocomplete hints.
 * SDK version: @anthropic-ai/claude-agent-sdk v0.2.74 (Day 2 message type)
 */
export interface SDKPromptSuggestionMessage {
	type: 'prompt_suggestion';
	suggestion?: string;
	suggestions?: string[];
	session_id?: string;
}

/**
 * Hook started event — a Claude SDK hook has begun execution.
 * Logged only for debug observability; not surfaced to the UI.
 * SDK version: @anthropic-ai/claude-agent-sdk v0.2.74 (Day 2 message type)
 */
export interface SDKHookStartedMessage {
	type: 'hook_started';
	hook_name?: string;
	hook_type?: string;
	tool_name?: string;
	session_id?: string;
}

/**
 * Hook progress event — a Claude SDK hook reports progress.
 * Logged only for debug observability; not surfaced to the UI.
 * SDK version: @anthropic-ai/claude-agent-sdk v0.2.74 (Day 2 message type)
 */
export interface SDKHookProgressMessage {
	type: 'hook_progress';
	hook_name?: string;
	hook_type?: string;
	message?: string;
	session_id?: string;
}

/**
 * Hook response event — a Claude SDK hook has completed with a result.
 * Logged only for debug observability; not surfaced to the UI.
 * SDK version: @anthropic-ai/claude-agent-sdk v0.2.74 (Day 2 message type)
 */
export interface SDKHookResponseMessage {
	type: 'hook_response';
	hook_name?: string;
	hook_type?: string;
	result?: string;
	session_id?: string;
}

/**
 * Union of all SDK message types that the harness needs to handle.
 */
export type SDKMessage =
	| SDKSystemMessage
	| SDKAssistantMessage
	| SDKPartialAssistantMessage
	| SDKResultMessage
	| SDKToolUseSummaryMessage
	| SDKRateLimitEvent
	| SDKStatusMessage
	| SDKCompactBoundaryMessage
	| SDKToolProgressMessage
	| SDKAuthStatusMessage
	| SDKTaskStartedMessage
	| SDKTaskProgressMessage
	| SDKTaskNotificationMessage
	| SDKFilesPersistedEvent
	| SDKPromptSuggestionMessage
	| SDKHookStartedMessage
	| SDKHookProgressMessage
	| SDKHookResponseMessage
	| { type: string; [key: string]: unknown };

// ============================================================================
// SDK Permission Types
// ============================================================================

export interface SDKPermissionUpdate {
	[key: string]: unknown;
}

export interface SDKPermissionAllow {
	behavior: 'allow';
	updatedInput?: Record<string, unknown>;
	updatedPermissions?: SDKPermissionUpdate[];
	toolUseID?: string;
}

export interface SDKPermissionDeny {
	behavior: 'deny';
	message: string;
	interrupt?: boolean;
	toolUseID?: string;
}

export type SDKPermissionResult = SDKPermissionAllow | SDKPermissionDeny;

export interface SDKCanUseToolOptions {
	signal: AbortSignal;
	suggestions?: SDKPermissionUpdate[];
	blockedPath?: string;
	decisionReason?: string;
	toolUseID: string;
	agentID?: string;
}

export type SDKCanUseTool = (
	toolName: string,
	input: Record<string, unknown>,
	options: SDKCanUseToolOptions,
) => Promise<SDKPermissionResult>;

// ============================================================================
// SDK Query Types
// ============================================================================

export type SDKPermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk';

export interface SDKQueryOptions {
	prompt: string | AsyncIterable<SDKUserMessage>;
	options?: {
		allowedTools?: string[];
		disallowedTools?: string[];
		permissionMode?: SDKPermissionMode;
		canUseTool?: SDKCanUseTool;
		model?: string;
		systemPrompt?: string | { type: 'preset'; preset: 'claude_code'; append?: string };
		maxTurns?: number;
		maxBudgetUsd?: number;
		effort?: 'low' | 'medium' | 'high' | 'max';
		resume?: string;
		continue?: boolean;
		forkSession?: boolean;
		sessionId?: string;
		persistSession?: boolean;
		cwd?: string;
		env?: Record<string, string | undefined>;
		includePartialMessages?: boolean;
		enableFileCheckpointing?: boolean;
		outputFormat?: { type: 'json_schema'; schema: Record<string, unknown> };
		abortController?: AbortController;
		thinking?: { type: 'adaptive' } | { type: 'enabled'; budget_tokens: number };
		sandbox?: Record<string, unknown>;
		settingSources?: string[];
		stderr?: (data: string) => void;
		[key: string]: unknown;
	};
}

/**
 * Represents the Query object returned by the Claude SDK's query() function.
 * Extends AsyncGenerator<SDKMessage> with runtime control methods.
 */
export interface SDKQuery extends AsyncGenerator<SDKMessage, void, undefined> {
	interrupt(): void;
	setPermissionMode(mode: SDKPermissionMode): void;
	setModel(model?: string): void;
	streamInput(stream: AsyncIterable<SDKUserMessage>): void;
	close(): void;
	supportedCommands(): Promise<Array<{ name: string; description?: string }>>;
	supportedModels(): Promise<Array<{ id: string; label?: string }>>;
	supportedAgents(): Promise<Array<{ id: string; label?: string }>>;
	initializationResult(): Promise<SDKSystemMessage>;

	// -- MCP Server Management (SDK v0.2.74+) --

	/** Returns the current status of all connected MCP servers. */
	mcpServerStatus(): Promise<Array<{ name: string; status?: string }>>;
	/** Dynamically replace the full MCP server configuration. */
	setMcpServers(servers: Record<string, unknown>): void;
	/** Reconnect a specific MCP server by name. */
	reconnectMcpServer(name: string): Promise<void>;
	/** Enable or disable a specific MCP server by name. */
	toggleMcpServer(name: string, enabled: boolean): void;

	// -- File Checkpointing (SDK v0.2.74+, requires enableFileCheckpointing) --

	/**
	 * Restore files to their state at a given message ID.
	 * Only available when `enableFileCheckpointing: true` was passed at spawn.
	 */
	rewindFiles(messageId: string, opts?: { filePaths?: string[] }): Promise<void>;

	// -- Background Task Control (SDK v0.2.74+) --

	/** Stop a running background task by ID. */
	stopTask(taskId: string): Promise<void>;
}

/**
 * The SDK's query() function signature.
 */
export type SDKQueryFunction = (config: SDKQueryOptions) => SDKQuery;

// ============================================================================
// AskUserQuestion Input Types
// ============================================================================

export interface SDKAskUserQuestionOption {
	label: string;
	description: string;
	preview?: string;
}

export interface SDKAskUserQuestion {
	question: string;
	header: string;
	options: SDKAskUserQuestionOption[];
	multiSelect: boolean;
}

export interface SDKAskUserQuestionInput {
	questions: SDKAskUserQuestion[];
	[key: string]: unknown;
}
