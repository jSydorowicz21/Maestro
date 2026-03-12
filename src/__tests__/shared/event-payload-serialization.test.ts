/**
 * Event payload serialization and typing verification tests.
 *
 * Verifies that all IPC event payloads crossing the main → preload → renderer
 * boundary are fully JSON-serializable and cleanly typed. This catches:
 * - Non-JSON-safe values (functions, symbols, class instances, BigInt, undefined-as-value)
 * - Data loss through serialization (undefined optional fields being stripped)
 * - Circular references
 * - Nested object integrity
 * - Discriminator-based narrowing after deserialization
 */

import { describe, it, expect } from 'vitest';
import type {
	InteractionRequest,
	InteractionResponse,
	ToolApprovalRequest,
	ClarificationRequest,
	ClarificationAnswer,
	ClarificationQuestion,
	ClarificationOption,
	PermissionUpdate,
} from '../../shared/interaction-types';
import type {
	RuntimeMetadataEvent,
	HarnessRuntimeCapabilities,
	SkillSummary,
	RuntimeModelSummary,
	RuntimeAgentSummary,
} from '../../shared/runtime-metadata-types';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Round-trips a value through JSON.stringify → JSON.parse.
 * Throws if serialization fails (e.g., circular refs, BigInt).
 */
function jsonRoundTrip<T>(value: T): T {
	return JSON.parse(JSON.stringify(value));
}

/**
 * Asserts that a value survives JSON round-trip with deep equality.
 */
function expectSerializable<T>(value: T): void {
	const roundTripped = jsonRoundTrip(value);
	expect(roundTripped).toEqual(value);
}

// ============================================================================
// InteractionRequest payload serialization
// ============================================================================

describe('event payload serialization', () => {
	describe('ToolApprovalRequest payloads', () => {
		it('minimal tool approval request survives round-trip', () => {
			const request: ToolApprovalRequest = {
				interactionId: 'int-001',
				sessionId: 'session-1',
				agentId: 'claude-code',
				kind: 'tool-approval',
				timestamp: 1710000000000,
				toolUseId: 'tu-1',
				toolName: 'Bash',
				toolInput: { command: 'ls' },
			};
			expectSerializable(request);
		});

		it('tool approval with all optional fields survives round-trip', () => {
			const request: ToolApprovalRequest = {
				interactionId: 'int-002',
				sessionId: 'session-2',
				agentId: 'codex',
				kind: 'tool-approval',
				timestamp: 1710000000000,
				timeoutMs: 30000,
				toolUseId: 'tu-2',
				toolName: 'Edit',
				toolInput: {
					file_path: '/src/main.ts',
					old_string: 'foo',
					new_string: 'bar',
				},
				decisionReason: 'File edit requires approval',
				suggestedPermissions: [
					{ tool: 'Edit', scope: '/src', glob: '**/*.ts' },
					{ tool: 'Edit', scope: '/tests' },
				],
				blockedPath: '/src/main.ts',
				subagentId: 'sub-agent-1',
			};
			expectSerializable(request);
		});

		it('deeply nested toolInput survives round-trip', () => {
			const request: ToolApprovalRequest = {
				interactionId: 'int-003',
				sessionId: 'session-3',
				agentId: 'opencode',
				kind: 'tool-approval',
				timestamp: 1710000000000,
				toolUseId: 'tu-3',
				toolName: 'Write',
				toolInput: {
					file_path: '/config.json',
					content: {
						nested: {
							deeply: {
								value: [1, 2, { key: 'val' }],
							},
						},
					},
				},
			};
			expectSerializable(request);
		});

		it('empty toolInput object survives round-trip', () => {
			const request: ToolApprovalRequest = {
				interactionId: 'int-004',
				sessionId: 'session-4',
				agentId: 'claude-code',
				kind: 'tool-approval',
				timestamp: 1710000000000,
				toolUseId: 'tu-4',
				toolName: 'Read',
				toolInput: {},
			};
			expectSerializable(request);
		});

		it('empty suggestedPermissions array survives round-trip', () => {
			const request: ToolApprovalRequest = {
				interactionId: 'int-005',
				sessionId: 'session-5',
				agentId: 'claude-code',
				kind: 'tool-approval',
				timestamp: 1710000000000,
				toolUseId: 'tu-5',
				toolName: 'Bash',
				toolInput: { command: 'echo hello' },
				suggestedPermissions: [],
			};
			expectSerializable(request);
		});
	});

	describe('ClarificationRequest payloads', () => {
		it('single-question clarification survives round-trip', () => {
			const request: ClarificationRequest = {
				interactionId: 'int-010',
				sessionId: 'session-10',
				agentId: 'claude-code',
				kind: 'clarification',
				timestamp: 1710000000000,
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
				allowFreeText: false,
			};
			expectSerializable(request);
		});

		it('multi-question clarification survives round-trip', () => {
			const request: ClarificationRequest = {
				interactionId: 'int-011',
				sessionId: 'session-11',
				agentId: 'codex',
				kind: 'clarification',
				timestamp: 1710000000000,
				timeoutMs: 60000,
				questions: [
					{
						question: 'Which database engine?',
						header: 'DB',
						options: [
							{ label: 'Postgres', description: 'PostgreSQL', preview: '```sql\nSELECT 1;\n```' },
							{ label: 'SQLite', description: 'Embedded SQLite' },
						],
						multiSelect: false,
					},
					{
						question: 'Which testing framework?',
						header: 'Tests',
						options: [
							{ label: 'vitest', description: 'Vitest runner' },
							{ label: 'jest', description: 'Jest runner' },
							{ label: 'mocha', description: 'Mocha runner' },
						],
						multiSelect: true,
					},
				],
				allowFreeText: true,
			};
			expectSerializable(request);
		});

		it('option with markdown preview survives round-trip', () => {
			const option: ClarificationOption = {
				label: 'Code Example',
				description: 'Shows a code example',
				preview: '```typescript\nconst x = 1;\nconsole.log(x);\n```',
			};
			expectSerializable(option);
		});

		it('question with empty options array survives round-trip', () => {
			const question: ClarificationQuestion = {
				question: 'Please describe what you want',
				header: 'Input',
				options: [],
				multiSelect: false,
			};
			expectSerializable(question);
		});
	});

	describe('InteractionResponse payloads', () => {
		it('approve response with no optional fields survives round-trip', () => {
			const response: InteractionResponse = { kind: 'approve' };
			expectSerializable(response);
		});

		it('approve response with all optional fields survives round-trip', () => {
			const response: InteractionResponse = {
				kind: 'approve',
				updatedInput: { file_path: '/new-path.ts', content: 'updated' },
				updatedPermissions: [
					{ tool: 'Bash', scope: '/src', remember: true },
				],
				message: 'Approved with modifications',
			};
			expectSerializable(response);
		});

		it('deny response with interrupt survives round-trip', () => {
			const response: InteractionResponse = {
				kind: 'deny',
				message: 'Too dangerous',
				interrupt: true,
			};
			expectSerializable(response);
		});

		it('deny response with interrupt=false survives round-trip', () => {
			const response: InteractionResponse = {
				kind: 'deny',
				message: 'Skip this tool',
				interrupt: false,
			};
			expectSerializable(response);
		});

		it('text response survives round-trip', () => {
			const response: InteractionResponse = {
				kind: 'text',
				text: 'User-typed free text with unicode: 日本語 🎉',
			};
			expectSerializable(response);
		});

		it('clarification-answer with option selections survives round-trip', () => {
			const response: InteractionResponse = {
				kind: 'clarification-answer',
				answers: [
					{ questionIndex: 0, selectedOptionLabels: ['main'] },
					{ questionIndex: 1, selectedOptionLabels: ['vitest', 'jest'] },
				],
			};
			expectSerializable(response);
		});

		it('clarification-answer with free text survives round-trip', () => {
			const response: InteractionResponse = {
				kind: 'clarification-answer',
				answers: [
					{ questionIndex: 0, text: 'A custom answer with\nnewlines' },
				],
			};
			expectSerializable(response);
		});

		it('clarification-answer with mixed option and text survives round-trip', () => {
			const answer: ClarificationAnswer = {
				questionIndex: 0,
				selectedOptionLabels: ['Option A'],
				text: 'Additional context',
			};
			expectSerializable(answer);
		});

		it('cancel response with message survives round-trip', () => {
			const response: InteractionResponse = {
				kind: 'cancel',
				message: 'User cancelled the interaction',
			};
			expectSerializable(response);
		});

		it('cancel response without message survives round-trip', () => {
			const response: InteractionResponse = { kind: 'cancel' };
			expectSerializable(response);
		});

		it('all six response kinds survive round-trip in batch', () => {
			const responses: InteractionResponse[] = [
				{ kind: 'approve', updatedInput: { a: 1 } },
				{ kind: 'deny', interrupt: true },
				{ kind: 'text', text: 'hello' },
				{ kind: 'clarification-answer', answers: [{ questionIndex: 0, selectedOptionLabels: ['x'] }] },
				{ kind: 'cancel' },
				{ kind: 'timeout', interactionKind: 'tool-approval', message: 'Timed out' },
			];
			for (const response of responses) {
				expectSerializable(response);
			}
		});
	});

	describe('RuntimeMetadataEvent payloads', () => {
		it('minimal metadata event survives round-trip', () => {
			const event: RuntimeMetadataEvent = {
				sessionId: 'session-100',
				source: 'claude-code',
			};
			expectSerializable(event);
		});

		it('full snapshot metadata event survives round-trip', () => {
			const event: RuntimeMetadataEvent = {
				sessionId: 'session-101',
				source: 'claude-code',
				replace: true,
				skills: [
					{ id: 'commit', name: 'Commit', description: 'Create git commits' },
					{ id: 'review', name: 'Code Review' },
				],
				slashCommands: ['/help', '/clear', '/commit'],
				availableModels: [
					{ id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
					{ id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
				],
				availableAgents: [
					{ id: 'task-agent', label: 'Task Agent' },
					{ id: 'code-reviewer' },
				],
				capabilities: {
					supportsMidTurnInput: true,
					supportsInteractionRequests: true,
					supportsPersistentStdin: false,
					supportsRuntimePermissionUpdates: true,
					supportsRuntimeModelChange: true,
					supportsRuntimeEffortChange: false,
					supportsSkillsEnumeration: true,
					supportsRuntimeSlashCommands: true,
					supportsFileCheckpointing: false,
					supportsStructuredOutput: false,
					supportsBudgetLimits: true,
					supportsContextCompaction: true,
					supportsSessionFork: false,
				},
			};
			expectSerializable(event);
		});

		it('partial metadata update (skills only) survives round-trip', () => {
			const event: RuntimeMetadataEvent = {
				sessionId: 'session-102',
				source: 'codex',
				skills: [{ id: 'test-gen', name: 'Test Generator' }],
			};
			expectSerializable(event);
			// Verify omitted fields stay omitted after round-trip
			const roundTripped = jsonRoundTrip(event);
			expect(roundTripped.replace).toBeUndefined();
			expect(roundTripped.slashCommands).toBeUndefined();
			expect(roundTripped.availableModels).toBeUndefined();
			expect(roundTripped.availableAgents).toBeUndefined();
			expect(roundTripped.capabilities).toBeUndefined();
		});

		it('partial metadata update (capabilities only) survives round-trip', () => {
			const event: RuntimeMetadataEvent = {
				sessionId: 'session-103',
				source: 'opencode',
				capabilities: {
					supportsRuntimeModelChange: true,
				},
			};
			expectSerializable(event);
		});

		it('empty arrays in metadata event survive round-trip', () => {
			const event: RuntimeMetadataEvent = {
				sessionId: 'session-104',
				source: 'factory-droid',
				skills: [],
				slashCommands: [],
				availableModels: [],
				availableAgents: [],
			};
			expectSerializable(event);
			const roundTripped = jsonRoundTrip(event);
			expect(roundTripped.skills).toEqual([]);
			expect(roundTripped.slashCommands).toEqual([]);
		});

		it('summary types with minimal fields survive round-trip', () => {
			const skill: SkillSummary = { id: 'sk1', name: 'Skill' };
			const model: RuntimeModelSummary = { id: 'model-1' };
			const agent: RuntimeAgentSummary = { id: 'agent-1' };
			expectSerializable(skill);
			expectSerializable(model);
			expectSerializable(agent);
		});

		it('full HarnessRuntimeCapabilities (all 13 booleans) survives round-trip', () => {
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
			expectSerializable(caps);
			const roundTripped = jsonRoundTrip(caps);
			// Verify boolean values are preserved (not coerced to strings)
			for (const [key, val] of Object.entries(roundTripped)) {
				expect(typeof val).toBe('boolean');
			}
		});
	});

	describe('optional field handling across JSON boundary', () => {
		it('undefined optional fields are stripped by JSON.stringify', () => {
			const request: ToolApprovalRequest = {
				interactionId: 'int-020',
				sessionId: 'session-20',
				agentId: 'claude-code',
				kind: 'tool-approval',
				timestamp: 1710000000000,
				toolUseId: 'tu-20',
				toolName: 'Bash',
				toolInput: { command: 'pwd' },
				// These optional fields are explicitly undefined
				timeoutMs: undefined,
				decisionReason: undefined,
				suggestedPermissions: undefined,
				blockedPath: undefined,
				subagentId: undefined,
			};
			const serialized = JSON.stringify(request);
			const parsed = JSON.parse(serialized);

			// JSON.stringify strips undefined values — this is expected IPC behavior
			expect(parsed).not.toHaveProperty('timeoutMs');
			expect(parsed).not.toHaveProperty('decisionReason');
			expect(parsed).not.toHaveProperty('suggestedPermissions');
			expect(parsed).not.toHaveProperty('blockedPath');
			expect(parsed).not.toHaveProperty('subagentId');

			// Required fields remain
			expect(parsed.interactionId).toBe('int-020');
			expect(parsed.kind).toBe('tool-approval');
			expect(parsed.toolName).toBe('Bash');
		});

		it('null values in toolInput are preserved (unlike undefined)', () => {
			const request: ToolApprovalRequest = {
				interactionId: 'int-021',
				sessionId: 'session-21',
				agentId: 'claude-code',
				kind: 'tool-approval',
				timestamp: 1710000000000,
				toolUseId: 'tu-21',
				toolName: 'Write',
				toolInput: { file_path: '/test.ts', content: null },
			};
			const roundTripped = jsonRoundTrip(request);
			expect(roundTripped.toolInput.content).toBeNull();
		});

		it('RuntimeMetadataEvent replace=false is preserved (not stripped like undefined)', () => {
			const event: RuntimeMetadataEvent = {
				sessionId: 'session-22',
				source: 'claude-code',
				replace: false,
			};
			const roundTripped = jsonRoundTrip(event);
			expect(roundTripped.replace).toBe(false);
		});
	});

	describe('discriminator narrowing after deserialization', () => {
		it('InteractionRequest kind discriminator enables narrowing after JSON parse', () => {
			const requests: InteractionRequest[] = [
				{
					interactionId: 'int-030',
					sessionId: 's1',
					agentId: 'claude-code',
					kind: 'tool-approval',
					timestamp: 1710000000000,
					toolUseId: 'tu-1',
					toolName: 'Bash',
					toolInput: { command: 'ls' },
				},
				{
					interactionId: 'int-031',
					sessionId: 's2',
					agentId: 'codex',
					kind: 'clarification',
					timestamp: 1710000000000,
					questions: [{ question: 'Q?', header: 'Q', options: [], multiSelect: false }],
					allowFreeText: true,
				},
			];

			for (const original of requests) {
				const parsed = jsonRoundTrip(original) as InteractionRequest;
				switch (parsed.kind) {
					case 'tool-approval':
						// After narrowing, tool-approval-specific fields are accessible
						expect(parsed.toolUseId).toBeDefined();
						expect(parsed.toolName).toBeDefined();
						expect(parsed.toolInput).toBeDefined();
						break;
					case 'clarification':
						// After narrowing, clarification-specific fields are accessible
						expect(parsed.questions).toBeDefined();
						expect(typeof parsed.allowFreeText).toBe('boolean');
						break;
					default: {
						// Exhaustiveness check — if a new kind is added without updating
						// this test, TypeScript will flag it (compile-time guarantee)
						const _exhaustive: never = parsed;
						throw new Error(`Unknown kind: ${(_exhaustive as any).kind}`);
					}
				}
			}
		});

		it('InteractionResponse kind discriminator enables narrowing after JSON parse', () => {
			const responses: InteractionResponse[] = [
				{ kind: 'approve', updatedInput: { x: 1 }, message: 'ok' },
				{ kind: 'deny', message: 'no', interrupt: true },
				{ kind: 'text', text: 'hello' },
				{ kind: 'clarification-answer', answers: [{ questionIndex: 0, selectedOptionLabels: ['A'] }] },
				{ kind: 'cancel', message: 'bye' },
				{ kind: 'timeout', interactionKind: 'tool-approval', message: 'Timed out' },
			];

			for (const original of responses) {
				const parsed = jsonRoundTrip(original) as InteractionResponse;
				switch (parsed.kind) {
					case 'approve':
						expect(parsed).toHaveProperty('kind', 'approve');
						break;
					case 'deny':
						expect(typeof parsed.interrupt).toBe('boolean');
						break;
					case 'text':
						expect(typeof parsed.text).toBe('string');
						break;
					case 'clarification-answer':
						expect(Array.isArray(parsed.answers)).toBe(true);
						break;
					case 'cancel':
						expect(parsed).toHaveProperty('kind', 'cancel');
						break;
					case 'timeout':
						expect(parsed.interactionKind).toBe('tool-approval');
						expect(typeof parsed.message).toBe('string');
						break;
					default: {
						const _exhaustive: never = parsed;
						throw new Error(`Unknown kind: ${(_exhaustive as any).kind}`);
					}
				}
			}
		});
	});

	describe('IPC channel tuple serialization', () => {
		it('interaction request IPC tuple [sessionId, request] survives round-trip', () => {
			// Simulates the shape sent through process:interaction-request channel
			const sessionId = 'session-40';
			const request: InteractionRequest = {
				interactionId: 'int-040',
				sessionId: 'session-40',
				agentId: 'claude-code',
				kind: 'tool-approval',
				timestamp: 1710000000000,
				toolUseId: 'tu-40',
				toolName: 'Bash',
				toolInput: { command: 'npm test' },
			};
			const tuple = [sessionId, request];
			const roundTripped = jsonRoundTrip(tuple);
			expect(roundTripped[0]).toBe(sessionId);
			expect(roundTripped[1].kind).toBe('tool-approval');
			expect(roundTripped[1].toolName).toBe('Bash');
		});

		it('interaction response IPC tuple [sessionId, interactionId, response] survives round-trip', () => {
			// Simulates the shape sent through process:respond-interaction channel
			const tuple = ['session-41', 'int-041', { kind: 'approve', message: 'ok' } as InteractionResponse];
			const roundTripped = jsonRoundTrip(tuple);
			expect(roundTripped[0]).toBe('session-41');
			expect(roundTripped[1]).toBe('int-041');
			expect(roundTripped[2].kind).toBe('approve');
		});

		it('runtime metadata IPC tuple [sessionId, metadata] survives round-trip', () => {
			// Simulates the shape sent through process:runtime-metadata channel
			const metadata: RuntimeMetadataEvent = {
				sessionId: 'session-42',
				source: 'codex',
				replace: true,
				skills: [{ id: 'test', name: 'Test Skill' }],
				capabilities: { supportsInteractionRequests: true },
			};
			const tuple = ['session-42', metadata];
			const roundTripped = jsonRoundTrip(tuple);
			expect(roundTripped[0]).toBe('session-42');
			expect(roundTripped[1].source).toBe('codex');
			expect(roundTripped[1].skills[0].id).toBe('test');
		});
	});

	describe('edge cases for clean typing', () => {
		it('PermissionUpdate accepts arbitrary provider data without type narrowing', () => {
			const permissions: PermissionUpdate[] = [
				{ tool: 'Bash', scope: '/src', remember: true },
				{ tool: 'Edit', glob: '**/*.ts', priority: 10 },
				{ customProvider: 'codex', action: 'allow-all' },
				{},
			];
			for (const perm of permissions) {
				expectSerializable(perm);
			}
		});

		it('toolInput with special JSON values (null, booleans, numbers, nested arrays)', () => {
			const input: Record<string, unknown> = {
				stringVal: 'hello',
				numberVal: 42,
				floatVal: 3.14,
				zeroVal: 0,
				negativeVal: -1,
				boolTrue: true,
				boolFalse: false,
				nullVal: null,
				arrayVal: [1, 'two', null, true],
				nestedObj: { a: { b: { c: 'deep' } } },
				emptyObj: {},
				emptyArr: [],
			};
			expectSerializable(input);
		});

		it('string fields with special characters survive round-trip', () => {
			const request: ToolApprovalRequest = {
				interactionId: 'int-050',
				sessionId: 'session-50',
				agentId: 'claude-code',
				kind: 'tool-approval',
				timestamp: 1710000000000,
				toolUseId: 'tu-50',
				toolName: 'Write',
				toolInput: {
					content: 'Line 1\nLine 2\tTabbed\r\nWindows line',
				},
				decisionReason: 'Path contains "quotes" and \'apostrophes\' and <angle> & ampersand',
			};
			expectSerializable(request);
		});

		it('large numeric timestamp values survive round-trip', () => {
			const request: ToolApprovalRequest = {
				interactionId: 'int-051',
				sessionId: 'session-51',
				agentId: 'claude-code',
				kind: 'tool-approval',
				timestamp: Number.MAX_SAFE_INTEGER,
				toolUseId: 'tu-51',
				toolName: 'Read',
				toolInput: { file_path: '/test.ts' },
			};
			const roundTripped = jsonRoundTrip(request);
			expect(roundTripped.timestamp).toBe(Number.MAX_SAFE_INTEGER);
		});
	});
});
