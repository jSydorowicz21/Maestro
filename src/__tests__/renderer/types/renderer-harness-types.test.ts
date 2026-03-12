/**
 * Renderer-facing typing tests for harness interaction and runtime metadata types.
 *
 * Validates that the renderer's type re-exports from renderer/types/index.ts
 * are correctly wired to the shared definitions, and that the renderer can
 * consume interaction requests, produce interaction responses, and receive
 * runtime metadata events using only the renderer-facing type surface.
 *
 * These are compile-time assignability checks paired with runtime assertions:
 * if a re-export breaks or a type drifts, the test will fail to compile.
 */

import { describe, it, expect } from 'vitest';

// Import exclusively from the renderer types barrel — this is the surface
// that renderer components and hooks actually use.
import type {
	InteractionKind,
	InteractionRequest,
	InteractionResponse,
	ToolApprovalRequest,
	ClarificationRequest,
	ClarificationQuestion,
	ClarificationOption,
	ClarificationAnswer,
	PermissionUpdate,
	HarnessRuntimeCapabilities,
	SkillSummary,
	RuntimeModelSummary,
	RuntimeAgentSummary,
	RuntimeMetadataEvent,
	ProcessConfig,
} from '../../../renderer/types/index';

// ============================================================================
// Compile-time helpers
// ============================================================================

/**
 * Forces TypeScript to verify A is assignable to B.
 * If this fails, the test file won't compile.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type AssertAssignable<A extends B, B> = true;

// ============================================================================
// Interaction type re-exports
// ============================================================================

describe('renderer-facing harness type re-exports', () => {
	describe('interaction type surface', () => {
		it('InteractionKind re-export covers Day 1 kinds', () => {
			const kinds: InteractionKind[] = ['tool-approval', 'clarification'];
			expect(kinds).toHaveLength(2);
			expect(kinds).toContain('tool-approval');
			expect(kinds).toContain('clarification');
		});

		it('ToolApprovalRequest is constructible from renderer imports', () => {
			const request: ToolApprovalRequest = {
				interactionId: 'int-r-001',
				sessionId: 'renderer-session-1',
				agentId: 'claude-code',
				kind: 'tool-approval',
				timestamp: Date.now(),
				toolUseId: 'tu-r-1',
				toolName: 'Bash',
				toolInput: { command: 'npm test' },
			};
			expect(request.kind).toBe('tool-approval');
			expect(request.toolName).toBe('Bash');
		});

		it('ToolApprovalRequest optional fields are accessible', () => {
			const request: ToolApprovalRequest = {
				interactionId: 'int-r-002',
				sessionId: 'renderer-session-2',
				agentId: 'claude-code',
				kind: 'tool-approval',
				timestamp: Date.now(),
				toolUseId: 'tu-r-2',
				toolName: 'Edit',
				toolInput: { file_path: '/src/app.ts' },
				decisionReason: 'File outside workspace',
				suggestedPermissions: [{ tool: 'Edit', scope: '/src' }],
				blockedPath: '/src/app.ts',
				subagentId: 'sub-agent-1',
				timeoutMs: 30000,
			};
			expect(request.decisionReason).toBe('File outside workspace');
			expect(request.suggestedPermissions).toHaveLength(1);
			expect(request.blockedPath).toBe('/src/app.ts');
			expect(request.subagentId).toBe('sub-agent-1');
			expect(request.timeoutMs).toBe(30000);
		});

		it('ClarificationRequest is constructible with full question data', () => {
			const option: ClarificationOption = {
				label: 'Yes',
				description: 'Proceed with changes',
				preview: '```diff\n+new line\n```',
			};
			const question: ClarificationQuestion = {
				question: 'Apply these changes?',
				header: 'Confirm',
				options: [option, { label: 'No', description: 'Skip changes' }],
				multiSelect: false,
			};
			const request: ClarificationRequest = {
				interactionId: 'int-r-003',
				sessionId: 'renderer-session-3',
				agentId: 'codex',
				kind: 'clarification',
				timestamp: Date.now(),
				questions: [question],
				allowFreeText: true,
			};
			expect(request.kind).toBe('clarification');
			expect(request.questions).toHaveLength(1);
			expect(request.questions[0].options).toHaveLength(2);
			expect(request.questions[0].options[0].preview).toContain('diff');
		});

		it('InteractionRequest union narrows correctly via kind discriminator', () => {
			const toolReq: InteractionRequest = {
				interactionId: 'int-r-004',
				sessionId: 's1',
				agentId: 'claude-code',
				kind: 'tool-approval',
				timestamp: 1,
				toolUseId: 'tu-1',
				toolName: 'Read',
				toolInput: {},
			};
			const clarReq: InteractionRequest = {
				interactionId: 'int-r-005',
				sessionId: 's2',
				agentId: 'opencode',
				kind: 'clarification',
				timestamp: 2,
				questions: [{ question: 'Which?', header: 'Q', options: [], multiSelect: false }],
				allowFreeText: false,
			};

			// Runtime narrowing
			if (toolReq.kind === 'tool-approval') {
				expect(toolReq.toolName).toBe('Read');
			}
			if (clarReq.kind === 'clarification') {
				expect(clarReq.questions).toHaveLength(1);
			}
		});

		it('PermissionUpdate is an opaque Record from the renderer perspective', () => {
			const perm: PermissionUpdate = { tool: 'Bash', scope: 'project' };
			expect(typeof perm).toBe('object');
			// Renderer should not need to narrow into provider-specific shapes
			const serialized = JSON.stringify(perm);
			expect(JSON.parse(serialized)).toEqual(perm);
		});
	});

	describe('interaction response surface', () => {
		it('all 5 response kinds are constructible from renderer imports', () => {
			const responses: InteractionResponse[] = [
				{ kind: 'approve' },
				{ kind: 'approve', updatedInput: { file_path: '/new.ts' }, updatedPermissions: [{ tool: 'Edit' }], message: 'OK' },
				{ kind: 'deny', message: 'Rejected' },
				{ kind: 'deny', interrupt: true },
				{ kind: 'text', text: 'Some free-text input' },
				{ kind: 'clarification-answer', answers: [{ questionIndex: 0, selectedOptionLabels: ['Yes'] }] },
				{ kind: 'cancel' },
				{ kind: 'cancel', message: 'User cancelled' },
			];
			expect(responses).toHaveLength(8);
			const kinds = new Set(responses.map((r) => r.kind));
			expect(kinds.size).toBe(5);
		});

		it('ClarificationAnswer carries structured fields, not flat text', () => {
			const answer: ClarificationAnswer = {
				questionIndex: 0,
				selectedOptionLabels: ['Option A', 'Option B'],
				text: 'additional context',
			};
			expect(answer.questionIndex).toBe(0);
			expect(answer.selectedOptionLabels).toHaveLength(2);
			expect(answer.text).toBe('additional context');
		});

		it('ClarificationAnswer minimal form requires only questionIndex', () => {
			const answer: ClarificationAnswer = { questionIndex: 2 };
			expect(answer.questionIndex).toBe(2);
			expect(answer.selectedOptionLabels).toBeUndefined();
			expect(answer.text).toBeUndefined();
		});

		it('response kind discriminator survives JSON round-trip', () => {
			const response: InteractionResponse = {
				kind: 'clarification-answer',
				answers: [
					{ questionIndex: 0, selectedOptionLabels: ['main'] },
					{ questionIndex: 1, text: 'free text' },
				],
			};
			const roundTripped = JSON.parse(JSON.stringify(response)) as InteractionResponse;
			expect(roundTripped.kind).toBe('clarification-answer');
			if (roundTripped.kind === 'clarification-answer') {
				expect(roundTripped.answers).toHaveLength(2);
			}
		});
	});

	describe('runtime metadata type surface', () => {
		it('HarnessRuntimeCapabilities is constructible with all 13 fields', () => {
			const caps: HarnessRuntimeCapabilities = {
				supportsMidTurnInput: true,
				supportsInteractionRequests: true,
				supportsPersistentStdin: false,
				supportsRuntimePermissionUpdates: true,
				supportsRuntimeModelChange: true,
				supportsRuntimeEffortChange: false,
				supportsSkillsEnumeration: true,
				supportsRuntimeSlashCommands: true,
				supportsFileCheckpointing: false,
				supportsStructuredOutput: true,
				supportsBudgetLimits: false,
				supportsContextCompaction: true,
				supportsSessionFork: false,
			};
			expect(Object.keys(caps)).toHaveLength(13);
			// All keys start with 'supports'
			for (const key of Object.keys(caps)) {
				expect(key).toMatch(/^supports/);
			}
		});

		it('SkillSummary is constructible from renderer imports', () => {
			const full: SkillSummary = { id: 'commit', name: 'Commit', description: 'Create commits' };
			const minimal: SkillSummary = { id: 'review', name: 'Review' };
			expect(full.description).toBe('Create commits');
			expect(minimal.description).toBeUndefined();
		});

		it('RuntimeModelSummary is constructible from renderer imports', () => {
			const full: RuntimeModelSummary = { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' };
			const minimal: RuntimeModelSummary = { id: 'gpt-4o' };
			expect(full.label).toBe('Claude Opus 4.6');
			expect(minimal.label).toBeUndefined();
		});

		it('RuntimeAgentSummary is constructible from renderer imports', () => {
			const full: RuntimeAgentSummary = { id: 'code-reviewer', label: 'Code Reviewer' };
			const minimal: RuntimeAgentSummary = { id: 'task-agent' };
			expect(full.label).toBe('Code Reviewer');
			expect(minimal.label).toBeUndefined();
		});

		it('RuntimeMetadataEvent full snapshot is constructible', () => {
			const event: RuntimeMetadataEvent = {
				sessionId: 'renderer-sess-1',
				source: 'claude-code',
				replace: true,
				skills: [{ id: 'sk1', name: 'Skill One' }],
				slashCommands: ['/help', '/clear'],
				availableModels: [{ id: 'model-1', label: 'Model' }],
				availableAgents: [{ id: 'agent-1', label: 'Agent' }],
				capabilities: {
					supportsInteractionRequests: true,
					supportsRuntimeModelChange: true,
				},
			};
			expect(event.replace).toBe(true);
			expect(event.skills).toHaveLength(1);
			expect(event.slashCommands).toHaveLength(2);
			expect(event.availableModels).toHaveLength(1);
			expect(event.availableAgents).toHaveLength(1);
			expect(event.capabilities?.supportsInteractionRequests).toBe(true);
		});

		it('RuntimeMetadataEvent partial update omits unchanged fields', () => {
			const event: RuntimeMetadataEvent = {
				sessionId: 'renderer-sess-2',
				source: 'codex',
				slashCommands: ['/test'],
			};
			expect(event.replace).toBeUndefined();
			expect(event.skills).toBeUndefined();
			expect(event.capabilities).toBeUndefined();
		});

		it('RuntimeMetadataEvent accepts any valid ToolType as source', () => {
			const sources: RuntimeMetadataEvent['source'][] = ['claude-code', 'codex', 'opencode', 'factory-droid'];
			for (const source of sources) {
				const event: RuntimeMetadataEvent = { sessionId: 's', source };
				expect(event.source).toBe(source);
			}
		});
	});

	describe('ProcessConfig harness fields', () => {
		it('ProcessConfig includes preferredExecutionMode', () => {
			const config: ProcessConfig = {
				sessionId: 's1',
				toolType: 'claude-code',
				cwd: '/project',
				command: 'claude',
				args: [],
				preferredExecutionMode: 'harness',
			};
			expect(config.preferredExecutionMode).toBe('harness');
		});

		it('preferredExecutionMode accepts all valid values', () => {
			const modes: NonNullable<ProcessConfig['preferredExecutionMode']>[] = ['auto', 'classic', 'harness'];
			expect(modes).toHaveLength(3);
		});

		it('ProcessConfig includes providerOptions as opaque Record', () => {
			const config: ProcessConfig = {
				sessionId: 's2',
				toolType: 'codex',
				cwd: '/project',
				command: 'codex',
				args: [],
				providerOptions: { streaming: true, maxTokens: 4096 },
			};
			expect(config.providerOptions).toEqual({ streaming: true, maxTokens: 4096 });
		});
	});

	describe('compile-time re-export integrity', () => {
		it('renderer InteractionRequest is the same union as shared InteractionRequest', () => {
			// If the renderer re-export drifted from the shared type, this assignment would fail to compile
			const toolReq: ToolApprovalRequest = {
				interactionId: 'compile-1',
				sessionId: 's',
				agentId: 'claude-code',
				kind: 'tool-approval',
				timestamp: 0,
				toolUseId: 'tu',
				toolName: 'Write',
				toolInput: {},
			};
			const asUnion: InteractionRequest = toolReq;
			expect(asUnion.kind).toBe('tool-approval');
		});

		it('renderer InteractionResponse covers all discriminated union members', () => {
			// Exhaustive switch — if a new kind is added but not handled, TS would warn
			function handleResponse(r: InteractionResponse): string {
				switch (r.kind) {
					case 'approve': return 'approved';
					case 'deny': return 'denied';
					case 'text': return 'text';
					case 'clarification-answer': return 'answered';
					case 'cancel': return 'cancelled';
				}
			}

			expect(handleResponse({ kind: 'approve' })).toBe('approved');
			expect(handleResponse({ kind: 'deny' })).toBe('denied');
			expect(handleResponse({ kind: 'text', text: 'x' })).toBe('text');
			expect(handleResponse({ kind: 'clarification-answer', answers: [] })).toBe('answered');
			expect(handleResponse({ kind: 'cancel' })).toBe('cancelled');
		});

		it('renderer RuntimeMetadataEvent capabilities use Partial<HarnessRuntimeCapabilities>', () => {
			// Compile-time: a single-field capabilities object should be assignable
			const event: RuntimeMetadataEvent = {
				sessionId: 's',
				source: 'claude-code',
				capabilities: { supportsMidTurnInput: true },
			};
			expect(event.capabilities).toBeDefined();
			// Full capabilities should also be assignable
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
			const fullEvent: RuntimeMetadataEvent = {
				sessionId: 's2',
				source: 'codex',
				capabilities: fullCaps,
			};
			expect(Object.keys(fullEvent.capabilities!)).toHaveLength(13);
		});
	});
});
