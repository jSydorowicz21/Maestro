/**
 * Cross-layer type convergence tests.
 *
 * Verifies that interaction, runtime metadata, and execution config types
 * remain aligned across the shared, preload, and renderer layers.
 * These are compile-time assignability checks: if a type drifts in one layer,
 * the test will fail to compile before it even runs.
 */

import { describe, it, expect } from 'vitest';
import type {
	InteractionRequest,
	InteractionResponse,
	InteractionKind,
	ToolApprovalRequest,
	ClarificationRequest,
	ClarificationAnswer,
	PermissionUpdate,
} from '../../shared/interaction-types';
import type {
	RuntimeMetadataEvent,
	HarnessRuntimeCapabilities,
	SkillSummary,
	RuntimeModelSummary,
	RuntimeAgentSummary,
} from '../../shared/runtime-metadata-types';
import type {
	AgentExecutionConfig,
	PermissionMode,
	StructuredOutputConfig,
} from '../../shared/types';
import type {
	ProcessConfig as PreloadProcessConfig,
} from '../../main/preload/process';

// ============================================================================
// Compile-time assignability helpers
// ============================================================================

/**
 * Asserts that A is assignable to B at compile time.
 * If A is NOT assignable to B, TypeScript will produce an error.
 */
type AssertAssignable<A, B> = A extends B ? true : never;

// ============================================================================
// Interaction type convergence
// ============================================================================

describe('cross-layer type convergence', () => {
	describe('InteractionRequest shared types', () => {
		it('should have Day 1 interaction kinds', () => {
			const kinds: InteractionKind[] = ['tool-approval', 'clarification'];
			expect(kinds).toHaveLength(2);
		});

		it('tool approval request should satisfy base shape', () => {
			const request: ToolApprovalRequest = {
				interactionId: 'int-001',
				sessionId: 'session-123',
				agentId: 'claude-code',
				kind: 'tool-approval',
				timestamp: Date.now(),
				toolUseId: 'tool-use-abc',
				toolName: 'Edit',
				toolInput: { file_path: '/src/main.ts' },
			};
			// Verify it satisfies the union
			const asUnion: InteractionRequest = request;
			expect(asUnion.kind).toBe('tool-approval');
		});

		it('clarification request should satisfy base shape', () => {
			const request: ClarificationRequest = {
				interactionId: 'int-002',
				sessionId: 'session-456',
				agentId: 'codex',
				kind: 'clarification',
				timestamp: Date.now(),
				questions: [
					{
						question: 'Which branch?',
						header: 'Branch',
						options: [
							{ label: 'main', description: 'The main branch' },
						],
						multiSelect: false,
					},
				],
				allowFreeText: true,
			};
			const asUnion: InteractionRequest = request;
			expect(asUnion.kind).toBe('clarification');
		});

		it('interaction responses should cover all Day 1 response kinds', () => {
			const responses: InteractionResponse[] = [
				{ kind: 'approve' },
				{ kind: 'deny', message: 'No', interrupt: true },
				{ kind: 'text', text: 'Free text' },
				{ kind: 'clarification-answer', answers: [{ questionIndex: 0, selectedOptionLabels: ['main'] }] },
				{ kind: 'cancel', message: 'Cancelled' },
			];
			expect(responses).toHaveLength(5);

			const responseKinds = responses.map((r) => r.kind);
			expect(responseKinds).toContain('approve');
			expect(responseKinds).toContain('deny');
			expect(responseKinds).toContain('text');
			expect(responseKinds).toContain('clarification-answer');
			expect(responseKinds).toContain('cancel');
		});
	});

	describe('RuntimeMetadataEvent shared types', () => {
		it('should construct a full metadata snapshot', () => {
			const event: RuntimeMetadataEvent = {
				sessionId: 'session-123',
				source: 'claude-code',
				replace: true,
				skills: [{ id: 'commit', name: 'Commit', description: 'Create git commits' }],
				slashCommands: ['/help', '/clear'],
				availableModels: [{ id: 'claude-opus-4-6', label: 'Claude Opus 4.6' }],
				availableAgents: [{ id: 'task-agent', label: 'Task Agent' }],
				capabilities: {
					supportsRuntimeModelChange: true,
					supportsSkillsEnumeration: true,
					supportsInteractionRequests: true,
				},
			};
			expect(event.sessionId).toBe('session-123');
			expect(event.replace).toBe(true);
			expect(event.skills).toHaveLength(1);
		});

		it('should construct a partial metadata update', () => {
			const event: RuntimeMetadataEvent = {
				sessionId: 'session-456',
				source: 'codex',
				slashCommands: ['/test'],
			};
			expect(event.skills).toBeUndefined();
			expect(event.replace).toBeUndefined();
		});

		it('capabilities should be partial', () => {
			const caps: Partial<HarnessRuntimeCapabilities> = {
				supportsInteractionRequests: true,
			};
			const event: RuntimeMetadataEvent = {
				sessionId: 's1',
				source: 'opencode',
				capabilities: caps,
			};
			expect(event.capabilities?.supportsRuntimeModelChange).toBeUndefined();
		});
	});

	describe('AgentExecutionConfig convergence with PreloadProcessConfig', () => {
		it('shared fields should overlap between AgentExecutionConfig and PreloadProcessConfig', () => {
			// These fields exist in both types (the convergence target)
			const sharedFields: (keyof AgentExecutionConfig & keyof PreloadProcessConfig)[] = [
				'sessionId',
				'cwd',
				'prompt',
				'images',
				'modelId',
				'querySource',
				'tabId',
				'preferredExecutionMode',
				'providerOptions',
			];
			expect(sharedFields.length).toBeGreaterThan(0);
		});

		it('AgentExecutionConfig should use shared PermissionMode type', () => {
			const modes: PermissionMode[] = ['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk'];
			expect(modes).toHaveLength(5);
		});

		it('preferredExecutionMode should have same values in both types', () => {
			// Both PreloadProcessConfig and AgentExecutionConfig define this as:
			// 'auto' | 'classic' | 'harness'
			const validValues: NonNullable<PreloadProcessConfig['preferredExecutionMode']>[] = [
				'auto', 'classic', 'harness',
			];
			const execValues: NonNullable<AgentExecutionConfig['preferredExecutionMode']>[] = [
				'auto', 'classic', 'harness',
			];
			expect(validValues).toEqual(execValues);
		});

		it('providerOptions should be opaque Record in both types', () => {
			// Compile-time check: both should accept the same shape
			const opts: Record<string, unknown> = { claude: { streaming: true } };
			const preloadConfig: Pick<PreloadProcessConfig, 'providerOptions'> = { providerOptions: opts };
			const execConfig: Pick<AgentExecutionConfig, 'providerOptions'> = { providerOptions: opts };
			expect(preloadConfig.providerOptions).toBe(execConfig.providerOptions);
		});
	});

	describe('provider-neutral boundary', () => {
		it('InteractionRequest should not require Claude-specific decoding', () => {
			// ToolApprovalRequest.toolInput is Record<string, unknown>, not a Claude SDK type
			const toolInput: ToolApprovalRequest['toolInput'] = { file_path: '/test.ts' };
			expect(typeof toolInput).toBe('object');
		});

		it('PermissionUpdate should be opaque to shared code', () => {
			// PermissionUpdate is Record<string, unknown> — no provider coupling
			const perm: PermissionUpdate = { tool: 'Bash', scope: 'directory:/src' };
			expect(typeof perm).toBe('object');
		});

		it('RuntimeMetadataEvent.source should accept any valid ToolType', () => {
			// source is ToolType, not hardcoded to 'claude-code'
			const events: RuntimeMetadataEvent[] = [
				{ sessionId: 's1', source: 'claude-code' },
				{ sessionId: 's2', source: 'codex' },
				{ sessionId: 's3', source: 'opencode' },
			];
			const sources = events.map((e) => e.source);
			expect(sources).toContain('codex');
			expect(sources).toContain('opencode');
		});
	});

	describe('serialization safety', () => {
		it('InteractionRequest payloads should be JSON-serializable', () => {
			const request: InteractionRequest = {
				interactionId: 'int-001',
				sessionId: 'session-123',
				agentId: 'claude-code',
				kind: 'tool-approval',
				timestamp: 1710000000000,
				toolUseId: 'tu-1',
				toolName: 'Bash',
				toolInput: { command: 'ls -la' },
				decisionReason: 'Shell access requires approval',
			};
			const serialized = JSON.stringify(request);
			const deserialized = JSON.parse(serialized);
			expect(deserialized.kind).toBe('tool-approval');
			expect(deserialized.toolName).toBe('Bash');
		});

		it('InteractionResponse payloads should be JSON-serializable', () => {
			const response: InteractionResponse = {
				kind: 'clarification-answer',
				answers: [{ questionIndex: 0, selectedOptionLabels: ['main'], text: 'main branch' }],
			};
			const serialized = JSON.stringify(response);
			const deserialized = JSON.parse(serialized);
			expect(deserialized.kind).toBe('clarification-answer');
			expect(deserialized.answers[0].questionIndex).toBe(0);
		});

		it('RuntimeMetadataEvent payloads should be JSON-serializable', () => {
			const event: RuntimeMetadataEvent = {
				sessionId: 'session-789',
				source: 'claude-code',
				replace: true,
				skills: [{ id: 's1', name: 'Skill One' }],
				capabilities: { supportsInteractionRequests: true },
			};
			const serialized = JSON.stringify(event);
			const deserialized = JSON.parse(serialized);
			expect(deserialized.source).toBe('claude-code');
			expect(deserialized.skills[0].id).toBe('s1');
		});
	});
});
