/**
 * Shared interaction types for the Agent Harness execution model.
 *
 * These types define the provider-neutral contract for mid-turn interactions
 * (tool approvals, clarification questions) between harness-backed agents
 * and the renderer. They cross the main → preload → renderer boundary.
 *
 * BOUNDARY INVARIANT: This module must NEVER import from provider-specific
 * code (main/harness/*, @anthropic-ai/sdk, openai, etc.). All types here
 * must be expressible as JSON-safe primitives and Record<string, unknown>
 * so that any provider's harness adapter can produce or consume them without
 * the renderer needing provider-specific decoding logic.
 *
 * Phase 1 interaction kinds: tool-approval, clarification.
 * Future kinds (auth prompts, file pickers, etc.) can be added later
 * without breaking existing contracts.
 */

import type { ToolType } from './types';

// ============================================================================
// Interaction Kinds
// ============================================================================

/**
 * Discriminator for interaction request types.
 * Phase 1 supports tool approvals and clarification questions only.
 */
export type InteractionKind = 'tool-approval' | 'clarification';

// ============================================================================
// Interaction Requests
// ============================================================================

/**
 * Base fields shared by all interaction requests.
 * Every request carries enough metadata for the renderer to display it
 * without needing to understand provider-specific payload internals.
 */
export interface BaseInteractionRequest {
	/** Unique ID for correlating request ↔ response */
	interactionId: string;
	/** Maestro session ID */
	sessionId: string;
	/** Agent type that produced this request (e.g., 'claude-code') */
	agentId: ToolType;
	/** Discriminator for the request type */
	kind: InteractionKind;
	/** When the request was created (epoch ms) */
	timestamp: number;
	/** How long the renderer has to respond before timeout (ms) */
	timeoutMs?: number;
}

/**
 * Permission update — provider-specific at the shared level.
 * Claude harness populates these from SDK suggestions;
 * non-Claude harnesses may ignore them.
 */
export type PermissionUpdate = Record<string, unknown>;

/**
 * Tool approval request — the agent wants to use a tool and needs user consent.
 */
export interface ToolApprovalRequest extends BaseInteractionRequest {
	kind: 'tool-approval';
	/** SDK-assigned tool use ID */
	toolUseId: string;
	/** Human-readable tool name (e.g., 'Edit', 'Bash') */
	toolName: string;
	/** Tool input parameters (serializable, provider-neutral at this layer) */
	toolInput: Record<string, unknown>;
	/** Why the tool was blocked (human-readable) */
	decisionReason?: string;
	/** SDK-suggested "remember this" rules the user can accept */
	suggestedPermissions?: PermissionUpdate[];
	/** File path that triggered the permission check */
	blockedPath?: string;
	/** SDK subagent that made the request (if not root agent) */
	subagentId?: string;
}

/**
 * A single option within a clarification question.
 */
export interface ClarificationOption {
	/** Short label for the option */
	label: string;
	/** Longer description */
	description: string;
	/** Optional visual preview (markdown) */
	preview?: string;
}

/**
 * A single question within a clarification request.
 */
export interface ClarificationQuestion {
	/** Full question text */
	question: string;
	/** Short label (≤12 chars) for compact display */
	header: string;
	/** 2-4 choices */
	options: ClarificationOption[];
	/** Whether the user can select multiple options */
	multiSelect: boolean;
}

/**
 * Clarification request — the agent is asking the user a question
 * before proceeding.
 */
export interface ClarificationRequest extends BaseInteractionRequest {
	kind: 'clarification';
	/** One or more questions to present */
	questions: ClarificationQuestion[];
	/** Whether the user may type free-text instead of choosing an option */
	allowFreeText: boolean;
}

/**
 * Union of all interaction request types.
 * Discriminate on `kind` to narrow.
 */
export type InteractionRequest = ToolApprovalRequest | ClarificationRequest;

// ============================================================================
// Interaction Responses
// ============================================================================

/**
 * Answer to a single clarification question.
 */
export interface ClarificationAnswer {
	/** Index into the request's `questions` array */
	questionIndex: number;
	/** Labels of selected options (for option-based answers) */
	selectedOptionLabels?: string[];
	/** Free-text answer (for free-text responses) */
	text?: string;
}

/**
 * Union of all interaction response shapes.
 * Discriminate on `kind` to narrow.
 *
 * - approve: user approves the tool use (optionally with modified input)
 * - deny: user denies the tool use (optionally requesting full interrupt)
 * - text: free-text response (generic fallback for non-structured input).
 *         MUST NOT be used for clarification answers — use 'clarification-answer'
 *         with structured ClarificationAnswer[] instead. Stuffing JSON into the
 *         text field defeats provider-neutral typing and breaks harness translation.
 * - clarification-answer: structured answer to clarification questions.
 *         Always use this kind (not 'text') when responding to a ClarificationRequest.
 *         Harness adapters translate this into provider-specific formats internally.
 * - cancel: user cancels the interaction without providing an answer
 */
export type InteractionResponse =
	| { kind: 'approve'; updatedInput?: Record<string, unknown>; updatedPermissions?: PermissionUpdate[]; message?: string }
	| { kind: 'deny'; message?: string; interrupt?: boolean }
	| { kind: 'text'; text: string }
	| { kind: 'clarification-answer'; answers: ClarificationAnswer[] }
	| { kind: 'cancel'; message?: string };
