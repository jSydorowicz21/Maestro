/**
 * Tests for runtime metadata emission, merge, and cleanup.
 *
 * Validates the end-to-end lifecycle of RuntimeMetadataEvent through the
 * store and selector pipeline:
 * - Event shape contracts and documented merge rules
 * - mergeById / mergeSlashCommands helper behavior through the store
 * - Composite session ID parsing (aiTabMatch pattern)
 * - Cleanup completeness across all paths and selector visibility
 * - Interaction + metadata coexistence guarantees
 * - Edge cases: falsy replace values, null fields, empty capabilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	useHarnessStore,
	selectSessionRuntimeMetadata,
	selectSessionRuntimeCapabilities,
	selectSessionInteractions,
	selectHasPendingInteractions,
	getHarnessState,
	getHarnessActions,
} from '../../renderer/stores/harnessStore';
import type { SessionRuntimeMetadata } from '../../renderer/stores/harnessStore';
import type {
	RuntimeMetadataEvent,
	SkillSummary,
	RuntimeModelSummary,
	RuntimeAgentSummary,
	HarnessRuntimeCapabilities,
} from '../../shared/runtime-metadata-types';
import type { ToolApprovalRequest } from '../../shared/interaction-types';

// ============================================================================
// Helpers
// ============================================================================

function makeMetadataEvent(overrides: Partial<RuntimeMetadataEvent> = {}): RuntimeMetadataEvent {
	return {
		sessionId: 'session-1',
		source: 'claude-code',
		...overrides,
	};
}

function makeToolApproval(overrides: Partial<ToolApprovalRequest> = {}): ToolApprovalRequest {
	return {
		interactionId: `int-${Math.random().toString(36).slice(2, 8)}`,
		sessionId: 'session-1',
		agentId: 'claude-code',
		kind: 'tool-approval',
		timestamp: Date.now(),
		toolUseId: 'tool-use-1',
		toolName: 'Edit',
		toolInput: { file_path: '/test.ts' },
		...overrides,
	};
}

/**
 * Simulates the composite session ID parsing from useAgentListeners.
 * This is the exact regex used in the renderer listener hookup.
 */
function parseCompositeSessionId(sessionId: string): string {
	const aiTabMatch = sessionId.match(/^(.+)-ai-(.+)$/);
	return aiTabMatch ? aiTabMatch[1] : sessionId;
}

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
	useHarnessStore.setState({
		pendingInteractions: {},
		runtimeMetadata: {},
	});
});

// ============================================================================
// Tests
// ============================================================================

describe('runtime metadata emission, merge, and cleanup', () => {

	// ========================================================================
	// 1. Event shape contracts
	// ========================================================================

	describe('RuntimeMetadataEvent shape contracts', () => {
		it('minimal event requires only sessionId and source', () => {
			const event: RuntimeMetadataEvent = {
				sessionId: 'session-1',
				source: 'claude-code',
			};
			// All data fields should be absent
			expect(event.replace).toBeUndefined();
			expect(event.skills).toBeUndefined();
			expect(event.slashCommands).toBeUndefined();
			expect(event.availableModels).toBeUndefined();
			expect(event.availableAgents).toBeUndefined();
			expect(event.capabilities).toBeUndefined();
		});

		it('full snapshot event includes all optional fields', () => {
			const event: RuntimeMetadataEvent = {
				sessionId: 'session-1',
				source: 'claude-code',
				replace: true,
				skills: [{ id: 'commit', name: 'Commit', description: 'Create git commits' }],
				slashCommands: ['/help', '/compact'],
				availableModels: [{ id: 'opus', label: 'Claude Opus 4.6' }],
				availableAgents: [{ id: 'reviewer', label: 'Code Reviewer' }],
				capabilities: {
					supportsInteractionRequests: true,
					supportsMidTurnInput: true,
				},
			};

			expect(event.replace).toBe(true);
			expect(event.skills).toHaveLength(1);
			expect(event.slashCommands).toHaveLength(2);
			expect(event.availableModels).toHaveLength(1);
			expect(event.availableAgents).toHaveLength(1);
			expect(event.capabilities?.supportsInteractionRequests).toBe(true);
		});

		it('source field accepts all supported agent types', () => {
			const sources: RuntimeMetadataEvent['source'][] = [
				'claude-code', 'codex', 'opencode', 'factory-droid', 'terminal',
			];
			for (const source of sources) {
				const event = makeMetadataEvent({ source });
				expect(event.source).toBe(source);
			}
		});

		it('SkillSummary description field is optional', () => {
			const withDesc: SkillSummary = { id: 's1', name: 'Skill', description: 'Desc' };
			const withoutDesc: SkillSummary = { id: 's2', name: 'Skill' };
			expect(withDesc.description).toBe('Desc');
			expect(withoutDesc.description).toBeUndefined();
		});

		it('RuntimeModelSummary label field is optional', () => {
			const withLabel: RuntimeModelSummary = { id: 'm1', label: 'Model' };
			const withoutLabel: RuntimeModelSummary = { id: 'm2' };
			expect(withLabel.label).toBe('Model');
			expect(withoutLabel.label).toBeUndefined();
		});

		it('RuntimeAgentSummary label field is optional', () => {
			const withLabel: RuntimeAgentSummary = { id: 'a1', label: 'Agent' };
			const withoutLabel: RuntimeAgentSummary = { id: 'a2' };
			expect(withLabel.label).toBe('Agent');
			expect(withoutLabel.label).toBeUndefined();
		});
	});

	// ========================================================================
	// 2. Emission rules: replace semantics through the store
	// ========================================================================

	describe('emission rules — replace vs incremental through the store', () => {
		it('replace: undefined is treated as incremental (same as replace: false)', () => {
			const actions = useHarnessStore.getState();

			// Populate
			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				skills: [{ id: 's1', name: 'Original' }],
			}));

			// Update with replace: undefined (implicit incremental)
			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				skills: [{ id: 's2', name: 'New' }],
			}));

			const metadata = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1');
			// Both skills should exist (merged, not replaced)
			expect(metadata!.skills).toHaveLength(2);
		});

		it('replace: false is treated as incremental (same as replace: undefined)', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				skills: [{ id: 's1', name: 'Original' }],
			}));

			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				replace: false,
				skills: [{ id: 's2', name: 'New' }],
			}));

			const metadata = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1');
			expect(metadata!.skills).toHaveLength(2);
		});

		it('replace: true with omitted fields preserves those fields', () => {
			const actions = useHarnessStore.getState();

			// Populate all fields
			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				skills: [{ id: 's1', name: 'Skill' }],
				slashCommands: ['/help'],
				availableModels: [{ id: 'm1' }],
				availableAgents: [{ id: 'a1' }],
				capabilities: { supportsInteractionRequests: true },
			}));

			// Replace with only skills — everything else preserved
			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				replace: true,
				skills: [{ id: 's2', name: 'New Skill' }],
			}));

			const metadata = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1');
			expect(metadata!.skills).toHaveLength(1);
			expect(metadata!.skills[0].id).toBe('s2');
			// Preserved: not in replace event
			expect(metadata!.slashCommands).toEqual(['/help']);
			expect(metadata!.availableModels).toHaveLength(1);
			expect(metadata!.availableAgents).toHaveLength(1);
			expect(metadata!.capabilities.supportsInteractionRequests).toBe(true);
		});

		it('replace: true with empty array clears that field', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				skills: [{ id: 's1', name: 'Skill' }],
				slashCommands: ['/help', '/compact'],
			}));

			// Replace with empty skills — clears skills, preserves slashCommands
			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				replace: true,
				skills: [],
			}));

			const metadata = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1');
			expect(metadata!.skills).toHaveLength(0);
			expect(metadata!.slashCommands).toEqual(['/help', '/compact']);
		});

		it('replace: true with empty capabilities object replaces capabilities', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				capabilities: {
					supportsInteractionRequests: true,
					supportsMidTurnInput: true,
				},
			}));

			// Replace with empty capabilities — clears all flags
			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				replace: true,
				capabilities: {},
			}));

			const caps = selectSessionRuntimeCapabilities(useHarnessStore.getState(), 'session-1');
			expect(caps).toEqual({});
		});

		it('incremental event with omitted fields leaves those fields untouched', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				skills: [{ id: 's1', name: 'Skill' }],
				slashCommands: ['/help'],
				capabilities: { supportsInteractionRequests: true },
			}));

			// Incremental update with only models — other fields untouched
			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				availableModels: [{ id: 'm1', label: 'Model' }],
			}));

			const metadata = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1');
			expect(metadata!.skills).toHaveLength(1);
			expect(metadata!.slashCommands).toEqual(['/help']);
			expect(metadata!.capabilities.supportsInteractionRequests).toBe(true);
			expect(metadata!.availableModels).toHaveLength(1);
		});
	});

	// ========================================================================
	// 3. mergeById behavior through the store
	// ========================================================================

	describe('mergeById behavior through the store', () => {
		it('incoming skill with same ID replaces entire skill object', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				skills: [{ id: 's1', name: 'Commit', description: 'Old description' }],
			}));

			// Same ID, different name and description
			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				skills: [{ id: 's1', name: 'Commit v2', description: 'New description' }],
			}));

			const metadata = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1');
			expect(metadata!.skills).toHaveLength(1);
			expect(metadata!.skills[0].name).toBe('Commit v2');
			expect(metadata!.skills[0].description).toBe('New description');
		});

		it('incoming skill with same ID but no description removes description', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				skills: [{ id: 's1', name: 'Commit', description: 'Has description' }],
			}));

			// Same ID, no description — replaces entirely
			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				skills: [{ id: 's1', name: 'Commit' }],
			}));

			const metadata = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1');
			expect(metadata!.skills).toHaveLength(1);
			expect(metadata!.skills[0].description).toBeUndefined();
		});

		it('incoming model with same ID and new label updates the label', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				availableModels: [{ id: 'opus', label: 'Opus 4.5' }],
			}));

			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				availableModels: [{ id: 'opus', label: 'Opus 4.6' }],
			}));

			const metadata = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1');
			expect(metadata!.availableModels).toHaveLength(1);
			expect(metadata!.availableModels[0].label).toBe('Opus 4.6');
		});

		it('mergeById preserves existing items not present in incoming batch', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				skills: [
					{ id: 's1', name: 'Commit' },
					{ id: 's2', name: 'Review' },
					{ id: 's3', name: 'Lint' },
				],
			}));

			// Update s2 only — s1 and s3 preserved
			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				skills: [{ id: 's2', name: 'Review v2' }],
			}));

			const metadata = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1');
			expect(metadata!.skills).toHaveLength(3);
			expect(metadata!.skills.find(s => s.id === 's1')!.name).toBe('Commit');
			expect(metadata!.skills.find(s => s.id === 's2')!.name).toBe('Review v2');
			expect(metadata!.skills.find(s => s.id === 's3')!.name).toBe('Lint');
		});

		it('mergeById ordering: existing items first, then new items appended', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				availableAgents: [
					{ id: 'a1', label: 'First' },
					{ id: 'a2', label: 'Second' },
				],
			}));

			// Add a3, update a1
			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				availableAgents: [
					{ id: 'a1', label: 'First Updated' },
					{ id: 'a3', label: 'Third' },
				],
			}));

			const metadata = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1');
			const agents = metadata!.availableAgents;
			expect(agents).toHaveLength(3);
			// a1 is in its original position (updated in-place via Map)
			expect(agents[0].id).toBe('a1');
			expect(agents[0].label).toBe('First Updated');
			// a2 preserved in its position
			expect(agents[1].id).toBe('a2');
			// a3 appended
			expect(agents[2].id).toBe('a3');
		});

		it('mergeById with empty incoming preserves all existing (through store)', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				skills: [{ id: 's1', name: 'Skill' }],
			}));

			// Empty incoming skills in incremental mode
			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				skills: [],
			}));

			const metadata = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1');
			expect(metadata!.skills).toHaveLength(1);
			expect(metadata!.skills[0].id).toBe('s1');
		});
	});

	// ========================================================================
	// 4. mergeSlashCommands behavior through the store
	// ========================================================================

	describe('mergeSlashCommands behavior through the store', () => {
		it('deduplicates identical commands', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				slashCommands: ['/help', '/compact'],
			}));

			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				slashCommands: ['/help', '/review'],
			}));

			const metadata = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1');
			expect(metadata!.slashCommands).toHaveLength(3);
			expect(metadata!.slashCommands).toContain('/help');
			expect(metadata!.slashCommands).toContain('/compact');
			expect(metadata!.slashCommands).toContain('/review');
		});

		it('preserves order: existing commands first, then new', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				slashCommands: ['/help', '/compact'],
			}));

			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				slashCommands: ['/review', '/test'],
			}));

			const metadata = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1');
			const cmds = metadata!.slashCommands;
			// Existing first, then new
			expect(cmds.indexOf('/help')).toBeLessThan(cmds.indexOf('/review'));
			expect(cmds.indexOf('/compact')).toBeLessThan(cmds.indexOf('/test'));
		});

		it('empty incoming commands in incremental mode preserves existing', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				slashCommands: ['/help'],
			}));

			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				slashCommands: [],
			}));

			const metadata = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1');
			expect(metadata!.slashCommands).toEqual(['/help']);
		});

		it('all-duplicate incoming produces no new entries', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				slashCommands: ['/help', '/compact', '/review'],
			}));

			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				slashCommands: ['/help', '/compact', '/review'],
			}));

			const metadata = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1');
			expect(metadata!.slashCommands).toHaveLength(3);
		});
	});

	// ========================================================================
	// 5. Capabilities shallow merge through the store
	// ========================================================================

	describe('capabilities shallow merge through the store', () => {
		it('new flags are added alongside existing', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				capabilities: { supportsInteractionRequests: true },
			}));

			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				capabilities: { supportsRuntimeModelChange: true },
			}));

			const caps = selectSessionRuntimeCapabilities(useHarnessStore.getState(), 'session-1');
			expect(caps!.supportsInteractionRequests).toBe(true);
			expect(caps!.supportsRuntimeModelChange).toBe(true);
		});

		it('same flag toggled from true to false', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				capabilities: { supportsRuntimeModelChange: true },
			}));

			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				capabilities: { supportsRuntimeModelChange: false },
			}));

			const caps = selectSessionRuntimeCapabilities(useHarnessStore.getState(), 'session-1');
			expect(caps!.supportsRuntimeModelChange).toBe(false);
		});

		it('unmentioned flags preserved during incremental capability update', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				capabilities: {
					supportsInteractionRequests: true,
					supportsMidTurnInput: true,
					supportsSkillsEnumeration: false,
				},
			}));

			// Update only one flag
			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				capabilities: { supportsSkillsEnumeration: true },
			}));

			const caps = selectSessionRuntimeCapabilities(useHarnessStore.getState(), 'session-1');
			expect(caps!.supportsInteractionRequests).toBe(true);
			expect(caps!.supportsMidTurnInput).toBe(true);
			expect(caps!.supportsSkillsEnumeration).toBe(true);
		});

		it('replace: true with capabilities replaces entire capabilities object', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				capabilities: {
					supportsInteractionRequests: true,
					supportsMidTurnInput: true,
					supportsRuntimeModelChange: true,
				},
			}));

			// Replace with only one flag — others gone
			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				replace: true,
				capabilities: { supportsInteractionRequests: true },
			}));

			const caps = selectSessionRuntimeCapabilities(useHarnessStore.getState(), 'session-1');
			expect(caps!.supportsInteractionRequests).toBe(true);
			expect(caps!.supportsMidTurnInput).toBeUndefined();
			expect(caps!.supportsRuntimeModelChange).toBeUndefined();
		});
	});

	// ========================================================================
	// 6. Composite session ID parsing
	// ========================================================================

	describe('composite session ID parsing (aiTabMatch pattern)', () => {
		it('plain session ID passes through unchanged', () => {
			expect(parseCompositeSessionId('session-1')).toBe('session-1');
		});

		it('composite "sessionId-ai-tabId" extracts sessionId', () => {
			expect(parseCompositeSessionId('session-1-ai-tab-0')).toBe('session-1');
		});

		it('composite with UUID-style session ID extracts correctly', () => {
			const compositeId = 'abc-def-123-ai-tab-main';
			expect(parseCompositeSessionId(compositeId)).toBe('abc-def-123');
		});

		it('session ID without -ai- suffix passes through unchanged', () => {
			expect(parseCompositeSessionId('session-main-primary')).toBe('session-main-primary');
		});

		it('session ID that starts with "ai" passes through unchanged', () => {
			expect(parseCompositeSessionId('ai-session')).toBe('ai-session');
		});

		it('session ID containing "-ai-" in the middle extracts greedily', () => {
			// The regex is greedy (.+) so "a-ai-b-ai-c" matches a-ai-b as session, c as tab
			const result = parseCompositeSessionId('a-ai-b-ai-c');
			expect(result).toBe('a-ai-b');
		});

		it('metadata applied via parsed composite ID is accessible with actual session ID', () => {
			const compositeId = 'my-session-ai-tab-1';
			const actualSessionId = parseCompositeSessionId(compositeId);

			useHarnessStore.getState().applyRuntimeMetadata(actualSessionId, makeMetadataEvent({
				sessionId: compositeId,
				skills: [{ id: 's1', name: 'Skill' }],
			}));

			const metadata = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'my-session');
			expect(metadata).toBeDefined();
			expect(metadata!.skills).toHaveLength(1);
		});

		it('metadata from different tabs of same session merges into one entry', () => {
			const actions = useHarnessStore.getState();

			// Tab 1 sends skills
			const actualId1 = parseCompositeSessionId('my-session-ai-tab-1');
			actions.applyRuntimeMetadata(actualId1, makeMetadataEvent({
				sessionId: 'my-session-ai-tab-1',
				skills: [{ id: 's1', name: 'Skill A' }],
			}));

			// Tab 2 sends models (same actual session)
			const actualId2 = parseCompositeSessionId('my-session-ai-tab-2');
			actions.applyRuntimeMetadata(actualId2, makeMetadataEvent({
				sessionId: 'my-session-ai-tab-2',
				availableModels: [{ id: 'm1' }],
			}));

			expect(actualId1).toBe(actualId2);
			const metadata = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'my-session');
			expect(metadata!.skills).toHaveLength(1);
			expect(metadata!.availableModels).toHaveLength(1);
		});
	});

	// ========================================================================
	// 7. Cleanup across all paths and selector visibility
	// ========================================================================

	describe('cleanup completeness and selector visibility', () => {
		it('clearSessionMetadata makes selectSessionRuntimeMetadata return undefined', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				skills: [{ id: 's1', name: 'Skill' }],
				capabilities: { supportsInteractionRequests: true },
			}));

			expect(selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1')).toBeDefined();
			expect(selectSessionRuntimeCapabilities(useHarnessStore.getState(), 'session-1')).toBeDefined();

			actions.clearSessionMetadata('session-1');

			expect(selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1')).toBeUndefined();
			expect(selectSessionRuntimeCapabilities(useHarnessStore.getState(), 'session-1')).toBeUndefined();
		});

		it('clearSession makes both metadata and capability selectors return undefined', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				skills: [{ id: 's1', name: 'Skill' }],
				capabilities: { supportsInteractionRequests: true },
			}));
			actions.addInteraction('session-1', makeToolApproval());

			actions.clearSession('session-1');

			expect(selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1')).toBeUndefined();
			expect(selectSessionRuntimeCapabilities(useHarnessStore.getState(), 'session-1')).toBeUndefined();
			expect(selectSessionInteractions(useHarnessStore.getState(), 'session-1')).toEqual([]);
			expect(selectHasPendingInteractions(useHarnessStore.getState(), 'session-1')).toBe(false);
		});

		it('clearSessionInteractions does not affect metadata selectors', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				skills: [{ id: 's1', name: 'Skill' }],
				capabilities: { supportsInteractionRequests: true },
			}));
			actions.addInteraction('session-1', makeToolApproval());

			actions.clearSessionInteractions('session-1');

			// Metadata intact
			expect(selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1')).toBeDefined();
			expect(selectSessionRuntimeCapabilities(useHarnessStore.getState(), 'session-1')!.supportsInteractionRequests).toBe(true);
			// Interactions cleared
			expect(selectSessionInteractions(useHarnessStore.getState(), 'session-1')).toEqual([]);
		});

		it('cleanup after multiple merge cycles produces fully clean state', () => {
			const actions = useHarnessStore.getState();

			// Multiple merge cycles
			for (let i = 0; i < 5; i++) {
				actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
					skills: [{ id: `s${i}`, name: `Skill ${i}` }],
					slashCommands: [`/cmd${i}`],
					availableModels: [{ id: `m${i}` }],
					capabilities: { supportsInteractionRequests: i % 2 === 0 },
				}));
			}

			const metadataBefore = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1');
			expect(metadataBefore!.skills.length).toBeGreaterThan(0);

			actions.clearSession('session-1');

			expect(selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1')).toBeUndefined();
			expect(useHarnessStore.getState().runtimeMetadata).not.toHaveProperty('session-1');
		});

		it('re-population after cleanup starts from empty metadata', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				skills: [{ id: 's1', name: 'Old' }, { id: 's2', name: 'Old2' }],
				slashCommands: ['/old'],
				capabilities: { supportsMidTurnInput: true },
			}));

			actions.clearSession('session-1');

			// Re-populate
			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				skills: [{ id: 's3', name: 'New' }],
			}));

			const metadata = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1');
			// Only the new skill — old ones gone
			expect(metadata!.skills).toHaveLength(1);
			expect(metadata!.skills[0].id).toBe('s3');
			// Old slash commands gone
			expect(metadata!.slashCommands).toEqual([]);
			// Old capabilities gone
			expect(metadata!.capabilities).toEqual({});
		});

		it('clearSession of one session does not affect other sessions metadata', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				sessionId: 'session-1',
				skills: [{ id: 's1', name: 'Skill 1' }],
			}));
			actions.applyRuntimeMetadata('session-2', makeMetadataEvent({
				sessionId: 'session-2',
				skills: [{ id: 's2', name: 'Skill 2' }],
			}));

			actions.clearSession('session-1');

			expect(selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1')).toBeUndefined();
			expect(selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-2')).toBeDefined();
			expect(selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-2')!.skills).toHaveLength(1);
		});
	});

	// ========================================================================
	// 8. Interaction + metadata coexistence guarantees
	// ========================================================================

	describe('interaction and metadata coexistence', () => {
		it('adding interactions does not create or modify metadata entries', () => {
			const actions = useHarnessStore.getState();

			actions.addInteraction('session-1', makeToolApproval());

			expect(selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1')).toBeUndefined();
			expect(selectSessionRuntimeCapabilities(useHarnessStore.getState(), 'session-1')).toBeUndefined();
		});

		it('applying metadata does not create or modify interaction entries', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				skills: [{ id: 's1', name: 'Skill' }],
			}));

			expect(selectSessionInteractions(useHarnessStore.getState(), 'session-1')).toEqual([]);
			expect(selectHasPendingInteractions(useHarnessStore.getState(), 'session-1')).toBe(false);
		});

		it('interleaved interaction and metadata operations are independent', () => {
			const actions = useHarnessStore.getState();

			actions.addInteraction('session-1', makeToolApproval({ interactionId: 'int-1' }));
			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				skills: [{ id: 's1', name: 'Skill' }],
			}));
			actions.addInteraction('session-1', makeToolApproval({ interactionId: 'int-2' }));
			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				availableModels: [{ id: 'm1' }],
			}));

			const state = useHarnessStore.getState();
			expect(selectSessionInteractions(state, 'session-1')).toHaveLength(2);
			expect(selectSessionRuntimeMetadata(state, 'session-1')!.skills).toHaveLength(1);
			expect(selectSessionRuntimeMetadata(state, 'session-1')!.availableModels).toHaveLength(1);
		});

		it('clearSession removes both interactions and metadata atomically', () => {
			const actions = useHarnessStore.getState();

			actions.addInteraction('session-1', makeToolApproval());
			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				skills: [{ id: 's1', name: 'Skill' }],
				capabilities: { supportsInteractionRequests: true },
			}));

			actions.clearSession('session-1');

			const state = useHarnessStore.getState();
			expect(state.pendingInteractions['session-1']).toBeUndefined();
			expect(state.runtimeMetadata['session-1']).toBeUndefined();
		});
	});

	// ========================================================================
	// 9. New session initialization and emptyMetadata contract
	// ========================================================================

	describe('new session initialization', () => {
		it('first event for a session initializes all fields to empty defaults', () => {
			useHarnessStore.getState().applyRuntimeMetadata('session-1', makeMetadataEvent({
				skills: [{ id: 's1', name: 'Skill' }],
			}));

			const metadata = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1')!;
			// Provided field set
			expect(metadata.skills).toHaveLength(1);
			// All other fields initialized to empty
			expect(metadata.slashCommands).toEqual([]);
			expect(metadata.availableModels).toEqual([]);
			expect(metadata.availableAgents).toEqual([]);
			expect(metadata.capabilities).toEqual({});
		});

		it('event with no data fields initializes empty metadata entry', () => {
			useHarnessStore.getState().applyRuntimeMetadata('session-1', makeMetadataEvent({}));

			const metadata = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1');
			expect(metadata).toBeDefined();
			expect(metadata!.skills).toEqual([]);
			expect(metadata!.slashCommands).toEqual([]);
			expect(metadata!.availableModels).toEqual([]);
			expect(metadata!.availableAgents).toEqual([]);
			expect(metadata!.capabilities).toEqual({});
		});

		it('SessionRuntimeMetadata has exactly 5 fields', () => {
			useHarnessStore.getState().applyRuntimeMetadata('session-1', makeMetadataEvent({}));

			const metadata = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1')!;
			const keys = Object.keys(metadata);
			expect(keys).toHaveLength(5);
			expect(keys.sort()).toEqual([
				'availableAgents',
				'availableModels',
				'capabilities',
				'skills',
				'slashCommands',
			]);
		});
	});

	// ========================================================================
	// 10. Multi-session isolation through selectors
	// ========================================================================

	describe('multi-session isolation through selectors', () => {
		it('different providers can emit to different sessions independently', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-claude', makeMetadataEvent({
				sessionId: 'session-claude',
				source: 'claude-code',
				skills: [{ id: 'commit', name: 'Commit' }],
				capabilities: { supportsInteractionRequests: true },
			}));

			actions.applyRuntimeMetadata('session-codex', makeMetadataEvent({
				sessionId: 'session-codex',
				source: 'codex',
				skills: [{ id: 'test-gen', name: 'Test Gen' }],
				capabilities: { supportsRuntimeModelChange: true },
			}));

			const claudeMetadata = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-claude');
			const codexMetadata = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-codex');

			expect(claudeMetadata!.skills[0].id).toBe('commit');
			expect(codexMetadata!.skills[0].id).toBe('test-gen');

			const claudeCaps = selectSessionRuntimeCapabilities(useHarnessStore.getState(), 'session-claude');
			const codexCaps = selectSessionRuntimeCapabilities(useHarnessStore.getState(), 'session-codex');

			expect(claudeCaps!.supportsInteractionRequests).toBe(true);
			expect(claudeCaps!.supportsRuntimeModelChange).toBeUndefined();
			expect(codexCaps!.supportsRuntimeModelChange).toBe(true);
			expect(codexCaps!.supportsInteractionRequests).toBeUndefined();
		});

		it('clearing one session does not invalidate selectors for other sessions', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-A', makeMetadataEvent({
				sessionId: 'session-A',
				skills: [{ id: 's1', name: 'Skill A' }],
			}));
			actions.applyRuntimeMetadata('session-B', makeMetadataEvent({
				sessionId: 'session-B',
				skills: [{ id: 's2', name: 'Skill B' }],
			}));
			actions.applyRuntimeMetadata('session-C', makeMetadataEvent({
				sessionId: 'session-C',
				skills: [{ id: 's3', name: 'Skill C' }],
			}));

			actions.clearSession('session-B');

			expect(selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-A')!.skills).toHaveLength(1);
			expect(selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-B')).toBeUndefined();
			expect(selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-C')!.skills).toHaveLength(1);
		});
	});

	// ========================================================================
	// 11. Full lifecycle: emission → merge → selectors → cleanup
	// ========================================================================

	describe('full lifecycle: emission → merge → selectors → cleanup', () => {
		it('initial snapshot → incremental updates → provider change → repopulate', () => {
			const actions = useHarnessStore.getState();

			// 1. Initial snapshot (replace: true)
			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				replace: true,
				skills: [
					{ id: 'commit', name: 'Commit' },
					{ id: 'review', name: 'Review PR' },
				],
				slashCommands: ['/help', '/compact'],
				availableModels: [{ id: 'opus' }, { id: 'sonnet' }],
				capabilities: {
					supportsInteractionRequests: true,
					supportsSkillsEnumeration: true,
				},
			}));

			let metadata = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1')!;
			expect(metadata.skills).toHaveLength(2);
			expect(metadata.slashCommands).toHaveLength(2);
			expect(metadata.availableModels).toHaveLength(2);

			// 2. Incremental update: add new skill and model
			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				skills: [{ id: 'lint', name: 'Lint' }],
				availableModels: [{ id: 'haiku' }],
			}));

			metadata = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1')!;
			expect(metadata.skills).toHaveLength(3);
			expect(metadata.availableModels).toHaveLength(3);
			// Existing preserved
			expect(metadata.slashCommands).toHaveLength(2);

			// 3. Incremental update: update existing skill
			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				skills: [{ id: 'commit', name: 'Commit v2', description: 'Improved commit workflow' }],
			}));

			metadata = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1')!;
			expect(metadata.skills).toHaveLength(3);
			expect(metadata.skills.find(s => s.id === 'commit')!.name).toBe('Commit v2');
			expect(metadata.skills.find(s => s.id === 'commit')!.description).toBe('Improved commit workflow');

			// 4. Provider change: full cleanup
			actions.clearSession('session-1');

			expect(selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1')).toBeUndefined();
			expect(selectSessionRuntimeCapabilities(useHarnessStore.getState(), 'session-1')).toBeUndefined();

			// 5. Repopulate: new session starts clean
			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				replace: true,
				skills: [{ id: 'new-skill', name: 'Completely New' }],
				capabilities: { supportsRuntimeModelChange: true },
			}));

			metadata = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1')!;
			expect(metadata.skills).toHaveLength(1);
			expect(metadata.skills[0].id).toBe('new-skill');
			// Old capabilities gone, new one present
			const caps = selectSessionRuntimeCapabilities(useHarnessStore.getState(), 'session-1');
			expect(caps!.supportsRuntimeModelChange).toBe(true);
			expect(caps!.supportsInteractionRequests).toBeUndefined();
		});

		it('concurrent sessions with independent lifecycles', () => {
			const actions = useHarnessStore.getState();

			// Session 1: populate
			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				sessionId: 'session-1',
				source: 'claude-code',
				replace: true,
				skills: [{ id: 's1', name: 'Skill 1' }],
			}));

			// Session 2: populate
			actions.applyRuntimeMetadata('session-2', makeMetadataEvent({
				sessionId: 'session-2',
				source: 'codex',
				replace: true,
				skills: [{ id: 's2', name: 'Skill 2' }],
			}));

			// Session 1: incremental
			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				sessionId: 'session-1',
				availableModels: [{ id: 'm1' }],
			}));

			// Session 2: cleanup
			actions.clearSession('session-2');

			// Session 1 unaffected
			const meta1 = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1')!;
			expect(meta1.skills).toHaveLength(1);
			expect(meta1.availableModels).toHaveLength(1);

			// Session 2 gone
			expect(selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-2')).toBeUndefined();

			// Session 2: repopulate
			actions.applyRuntimeMetadata('session-2', makeMetadataEvent({
				sessionId: 'session-2',
				source: 'codex',
				skills: [{ id: 's3', name: 'New Skill' }],
			}));

			const meta2 = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-2')!;
			expect(meta2.skills).toHaveLength(1);
			expect(meta2.skills[0].id).toBe('s3');
		});
	});

	// ========================================================================
	// 12. Edge cases
	// ========================================================================

	describe('edge cases', () => {
		it('event with all fields as empty arrays creates metadata with all empty arrays', () => {
			useHarnessStore.getState().applyRuntimeMetadata('session-1', makeMetadataEvent({
				skills: [],
				slashCommands: [],
				availableModels: [],
				availableAgents: [],
				capabilities: {},
			}));

			const metadata = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1')!;
			expect(metadata.skills).toEqual([]);
			expect(metadata.slashCommands).toEqual([]);
			expect(metadata.availableModels).toEqual([]);
			expect(metadata.availableAgents).toEqual([]);
			expect(metadata.capabilities).toEqual({});
		});

		it('rapid sequential events produce consistent final state', () => {
			const actions = useHarnessStore.getState();

			// 20 rapid events
			for (let i = 0; i < 20; i++) {
				actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
					skills: [{ id: `s${i}`, name: `Skill ${i}` }],
					slashCommands: [`/cmd${i}`],
				}));
			}

			const metadata = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1')!;
			// 20 unique skills
			expect(metadata.skills).toHaveLength(20);
			// 20 unique commands
			expect(metadata.slashCommands).toHaveLength(20);
		});

		it('skills with same name but different IDs are distinct', () => {
			const actions = useHarnessStore.getState();

			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				skills: [
					{ id: 's1', name: 'Commit' },
					{ id: 's2', name: 'Commit' },
				],
			}));

			const metadata = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1')!;
			expect(metadata.skills).toHaveLength(2);
		});

		it('HarnessRuntimeCapabilities has exactly 13 boolean fields', () => {
			const allCaps: HarnessRuntimeCapabilities = {
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
			const keys = Object.keys(allCaps);
			expect(keys).toHaveLength(13);
			for (const val of Object.values(allCaps)) {
				expect(typeof val).toBe('boolean');
			}
		});

		it('metadata survives store access via getHarnessState()', () => {
			useHarnessStore.getState().applyRuntimeMetadata('session-1', makeMetadataEvent({
				skills: [{ id: 's1', name: 'Skill' }],
			}));

			const state = getHarnessState();
			expect(state.runtimeMetadata['session-1']).toBeDefined();
			expect(state.runtimeMetadata['session-1'].skills).toHaveLength(1);
		});

		it('metadata operations work via getHarnessActions()', () => {
			const actions = getHarnessActions();
			actions.applyRuntimeMetadata('session-1', makeMetadataEvent({
				skills: [{ id: 's1', name: 'Skill' }],
			}));

			const metadata = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1');
			expect(metadata!.skills).toHaveLength(1);

			actions.clearSessionMetadata('session-1');
			expect(selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-1')).toBeUndefined();
		});
	});
});
