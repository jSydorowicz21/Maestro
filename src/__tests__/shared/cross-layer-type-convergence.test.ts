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

		it('interaction responses should cover all response kinds', () => {
			const responses: InteractionResponse[] = [
				{ kind: 'approve' },
				{ kind: 'deny', message: 'No', interrupt: true },
				{ kind: 'text', text: 'Free text' },
				{ kind: 'clarification-answer', answers: [{ questionIndex: 0, selectedOptionLabels: ['main'] }] },
				{ kind: 'cancel', message: 'Cancelled' },
				{ kind: 'timeout', interactionKind: 'tool-approval', message: 'Timed out' },
			];
			expect(responses).toHaveLength(6);

			const responseKinds = responses.map((r) => r.kind);
			expect(responseKinds).toContain('approve');
			expect(responseKinds).toContain('deny');
			expect(responseKinds).toContain('text');
			expect(responseKinds).toContain('clarification-answer');
			expect(responseKinds).toContain('cancel');
			expect(responseKinds).toContain('timeout');
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

		it('HarnessRuntimeCapabilities should include all design-doc fields', () => {
			// Full capabilities object — validates all 13 fields from the design doc compile
			const fullCaps: HarnessRuntimeCapabilities = {
				// Interaction
				supportsMidTurnInput: true,
				supportsInteractionRequests: true,
				supportsPersistentStdin: false,
				// Runtime changes
				supportsRuntimePermissionUpdates: true,
				supportsRuntimeModelChange: true,
				supportsRuntimeEffortChange: true,
				// Feature discovery
				supportsSkillsEnumeration: true,
				supportsRuntimeSlashCommands: true,
				// Data features
				supportsFileCheckpointing: true,
				supportsStructuredOutput: true,
				supportsBudgetLimits: true,
				supportsContextCompaction: true,
				supportsSessionFork: true,
			};
			expect(Object.keys(fullCaps)).toHaveLength(13);
		});

		it('RuntimeMetadataEvent should carry all design-doc data fields', () => {
			// Validates that the event shape includes all top-level fields from the design doc
			const snapshot: RuntimeMetadataEvent = {
				sessionId: 'session-full',
				source: 'claude-code',
				replace: true,
				skills: [{ id: 'sk1', name: 'Skill' }],
				slashCommands: ['/help'],
				availableModels: [{ id: 'model-1' }],
				availableAgents: [{ id: 'agent-1' }],
				capabilities: { supportsInteractionRequests: true },
			};
			// Every optional data field is present
			expect(snapshot.skills).toBeDefined();
			expect(snapshot.slashCommands).toBeDefined();
			expect(snapshot.availableModels).toBeDefined();
			expect(snapshot.availableAgents).toBeDefined();
			expect(snapshot.capabilities).toBeDefined();
			expect(snapshot.replace).toBe(true);
		});

		it('SkillSummary, RuntimeModelSummary, RuntimeAgentSummary should match design doc', () => {
			const skill: SkillSummary = { id: 'sk1', name: 'Test', description: 'desc' };
			const model: RuntimeModelSummary = { id: 'model-1', label: 'Model One' };
			const agent: RuntimeAgentSummary = { id: 'agent-1', label: 'Agent One' };
			// description and label are optional
			const minSkill: SkillSummary = { id: 'sk2', name: 'Minimal' };
			const minModel: RuntimeModelSummary = { id: 'model-2' };
			const minAgent: RuntimeAgentSummary = { id: 'agent-2' };
			expect(skill.description).toBe('desc');
			expect(minSkill.description).toBeUndefined();
			expect(model.label).toBe('Model One');
			expect(minModel.label).toBeUndefined();
			expect(agent.label).toBe('Agent One');
			expect(minAgent.label).toBeUndefined();
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

	describe('clarification response structural separation', () => {
		it('clarification-answer kind should carry structured ClarificationAnswer[], not text', () => {
			const response: InteractionResponse = {
				kind: 'clarification-answer',
				answers: [
					{ questionIndex: 0, selectedOptionLabels: ['main'] },
					{ questionIndex: 1, text: 'Custom free-text answer' },
				],
			};
			expect(response.kind).toBe('clarification-answer');
			// Narrow via discriminator — `answers` is only available on clarification-answer
			if (response.kind === 'clarification-answer') {
				expect(response.answers).toHaveLength(2);
				expect(response.answers[0].questionIndex).toBe(0);
				expect(response.answers[0].selectedOptionLabels).toEqual(['main']);
				expect(response.answers[1].text).toBe('Custom free-text answer');
			}
		});

		it('text kind should NOT be used for clarification answers', () => {
			// The 'text' kind is a generic fallback — structurally it cannot
			// carry ClarificationAnswer data without JSON-encoding it,
			// which would break provider-neutral harness translation.
			const textResponse: InteractionResponse = {
				kind: 'text',
				text: 'Some free-text input',
			};
			if (textResponse.kind === 'text') {
				// 'text' variant only has a flat string, no structured answers
				expect(typeof textResponse.text).toBe('string');
				expect(textResponse).not.toHaveProperty('answers');
			}
		});

		it('ClarificationAnswer should be structurally richer than a plain string', () => {
			const answer: ClarificationAnswer = {
				questionIndex: 0,
				selectedOptionLabels: ['option-a', 'option-b'],
				text: 'additional context',
			};
			// ClarificationAnswer carries semantic fields that a flat text string cannot
			expect(answer.questionIndex).toBe(0);
			expect(answer.selectedOptionLabels).toEqual(['option-a', 'option-b']);
			expect(answer.text).toBe('additional context');
		});

		it('clarification-answer response should round-trip through JSON without losing structure', () => {
			const original: InteractionResponse = {
				kind: 'clarification-answer',
				answers: [
					{ questionIndex: 0, selectedOptionLabels: ['main'] },
					{ questionIndex: 1, text: 'free text' },
				],
			};
			const serialized = JSON.stringify(original);
			const deserialized = JSON.parse(serialized) as InteractionResponse;

			expect(deserialized.kind).toBe('clarification-answer');
			if (deserialized.kind === 'clarification-answer') {
				expect(deserialized.answers).toHaveLength(2);
				expect(deserialized.answers[0].selectedOptionLabels).toEqual(['main']);
				expect(deserialized.answers[1].text).toBe('free text');
			}
		});

		it('clarification-answer and text responses should be distinguishable by kind discriminator', () => {
			const clarificationResponse: InteractionResponse = {
				kind: 'clarification-answer',
				answers: [{ questionIndex: 0, selectedOptionLabels: ['yes'] }],
			};
			const textResponse: InteractionResponse = {
				kind: 'text',
				text: 'yes',
			};

			// The kind discriminator is the only way to distinguish them
			expect(clarificationResponse.kind).not.toBe(textResponse.kind);

			// Each can be serialized and deserialized independently
			const parsedClarification = JSON.parse(JSON.stringify(clarificationResponse));
			const parsedText = JSON.parse(JSON.stringify(textResponse));
			expect(parsedClarification.kind).toBe('clarification-answer');
			expect(parsedText.kind).toBe('text');
			expect(parsedClarification).toHaveProperty('answers');
			expect(parsedText).not.toHaveProperty('answers');
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

		it('shared interaction types should only import from shared modules', () => {
			// This is a structural test: interaction-types.ts imports only from shared/types.ts.
			// If someone adds an import from a provider-specific module, this file-read test catches it.
			const fs = require('fs');
			const path = require('path');
			const interactionSource = fs.readFileSync(
				path.resolve(__dirname, '../../shared/interaction-types.ts'),
				'utf-8'
			);
			const importLines = interactionSource
				.split('\n')
				.filter((line: string) => /^\s*import\s/.test(line));

			for (const line of importLines) {
				// Must only import from ./types or other shared modules
				expect(line).not.toMatch(/from\s+['"].*\/(main|renderer|preload)\//);
				expect(line).not.toMatch(/from\s+['"]@anthropic-ai/);
				expect(line).not.toMatch(/from\s+['"]openai/);
			}
		});

		it('shared runtime metadata types should only import from shared modules', () => {
			const fs = require('fs');
			const path = require('path');
			const runtimeSource = fs.readFileSync(
				path.resolve(__dirname, '../../shared/runtime-metadata-types.ts'),
				'utf-8'
			);
			const importLines = runtimeSource
				.split('\n')
				.filter((line: string) => /^\s*import\s/.test(line));

			for (const line of importLines) {
				expect(line).not.toMatch(/from\s+['"].*\/(main|renderer|preload)\//);
				expect(line).not.toMatch(/from\s+['"]@anthropic-ai/);
				expect(line).not.toMatch(/from\s+['"]openai/);
			}
		});

		it('ToolApprovalRequest fields should all be provider-neutral primitives', () => {
			// Every field on ToolApprovalRequest should be a JSON-safe primitive
			// or Record<string, unknown> — no SDK class instances
			const request: ToolApprovalRequest = {
				interactionId: 'int-1',
				sessionId: 's1',
				agentId: 'claude-code',
				kind: 'tool-approval',
				timestamp: Date.now(),
				toolUseId: 'tu-1',
				toolName: 'Edit',
				toolInput: { file_path: '/a.ts', new_string: 'hello' },
				decisionReason: 'Needs approval',
				suggestedPermissions: [{ tool: 'Edit', scope: '/src' }],
				blockedPath: '/a.ts',
				subagentId: 'sub-1',
			};
			// All values should survive JSON round-trip without loss
			const roundTripped = JSON.parse(JSON.stringify(request));
			expect(roundTripped).toEqual(request);
		});

		it('ClarificationRequest fields should all be provider-neutral primitives', () => {
			const request: ClarificationRequest = {
				interactionId: 'int-2',
				sessionId: 's2',
				agentId: 'codex',
				kind: 'clarification',
				timestamp: Date.now(),
				questions: [{
					question: 'Which database?',
					header: 'DB',
					options: [
						{ label: 'Postgres', description: 'PostgreSQL' },
						{ label: 'SQLite', description: 'SQLite embedded', preview: '```sql\nSELECT 1;\n```' },
					],
					multiSelect: false,
				}],
				allowFreeText: true,
			};
			const roundTripped = JSON.parse(JSON.stringify(request));
			expect(roundTripped).toEqual(request);
		});

		it('all InteractionResponse variants should be provider-neutral', () => {
			// Each response variant uses only primitives and Record<string, unknown>
			const responses: InteractionResponse[] = [
				{
					kind: 'approve',
					updatedInput: { file_path: '/b.ts' },
					updatedPermissions: [{ tool: 'Bash' }],
					message: 'Approved',
				},
				{ kind: 'deny', message: 'Denied', interrupt: true },
				{ kind: 'text', text: 'Free text' },
				{
					kind: 'clarification-answer',
					answers: [
						{ questionIndex: 0, selectedOptionLabels: ['Postgres'] },
						{ questionIndex: 1, text: 'Custom answer' },
					],
				},
				{ kind: 'cancel', message: 'User cancelled' },
				{ kind: 'timeout', interactionKind: 'tool-approval', message: 'Timed out' },
			];

			for (const response of responses) {
				const roundTripped = JSON.parse(JSON.stringify(response));
				expect(roundTripped).toEqual(response);
			}
		});

		it('providerOptions must be opaque — compile-time assignability to Record<string, unknown>', () => {
			// providerOptions should accept arbitrary provider data without type narrowing
			const claudeOpts: Record<string, unknown> = {
				thinking: { type: 'enabled', budget: 10000 },
				effort: 'high',
				mcpServers: [{ name: 'test' }],
			};
			const codexOpts: Record<string, unknown> = {
				httpTimeout: 30000,
				maxRetries: 3,
			};
			const openCodeOpts: Record<string, unknown> = {
				sessionMode: 'persistent',
			};

			// All should be assignable to the config's providerOptions field
			const configs: Pick<AgentExecutionConfig, 'providerOptions'>[] = [
				{ providerOptions: claudeOpts },
				{ providerOptions: codexOpts },
				{ providerOptions: openCodeOpts },
				{ providerOptions: undefined },
			];
			expect(configs).toHaveLength(4);
		});

		it('HarnessRuntimeCapabilities should not contain provider-specific field names', () => {
			// Capability names should be generic (supports*), not provider-prefixed (claude*, codex*)
			const fullCaps: HarnessRuntimeCapabilities = {
				supportsMidTurnInput: true,
				supportsInteractionRequests: true,
				supportsPersistentStdin: true,
				supportsRuntimePermissionUpdates: true,
				supportsRuntimeModelChange: true,
				supportsRuntimeEffortChange: true,
				supportsSkillsEnumeration: true,
				supportsRuntimeSlashCommands: true,
				supportsFileCheckpointing: true,
				supportsStructuredOutput: true,
				supportsBudgetLimits: true,
				supportsContextCompaction: true,
				supportsSessionFork: true,
			};
			const fieldNames = Object.keys(fullCaps);
			for (const name of fieldNames) {
				// No provider-prefixed fields
				expect(name).not.toMatch(/^claude/i);
				expect(name).not.toMatch(/^codex/i);
				expect(name).not.toMatch(/^opencode/i);
				expect(name).not.toMatch(/^openai/i);
				// All should start with 'supports'
				expect(name).toMatch(/^supports/);
			}
		});

		it('RuntimeMetadataEvent data fields should use provider-neutral summary types', () => {
			// Summary types use generic id/name/label/description — not SDK-specific shapes
			const skill: SkillSummary = { id: 'commit', name: 'Commit' };
			const model: RuntimeModelSummary = { id: 'model-x' };
			const agent: RuntimeAgentSummary = { id: 'agent-y' };

			// All summary types should have only 'id' as required, plus optional label/name/description
			expect(Object.keys(skill)).toEqual(expect.arrayContaining(['id', 'name']));
			expect(Object.keys(model)).toEqual(expect.arrayContaining(['id']));
			expect(Object.keys(agent)).toEqual(expect.arrayContaining(['id']));

			// None should reference provider-specific SDK fields
			const allKeys = [...Object.keys(skill), ...Object.keys(model), ...Object.keys(agent)];
			for (const key of allKeys) {
				expect(key).not.toMatch(/^claude|^anthropic|^openai|^codex/i);
			}
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
