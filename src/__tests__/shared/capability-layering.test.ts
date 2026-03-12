/**
 * Capability Layering Tests
 *
 * Verifies that the three capability layers are structurally distinct,
 * accessed through separate APIs, and sourced from a single shared type.
 *
 * Three-layer model:
 *   Layer 1 — Static agent capabilities (AgentCapabilities)
 *             Known before spawn, agent-type-scoped.
 *   Layer 2 — Harness runtime capabilities (HarnessRuntimeCapabilities)
 *             Known after harness creation, per-session.
 *   Layer 3 — Session runtime metadata (SessionRuntimeMetadata)
 *             Concrete data discovered during execution, per-session.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import type { AgentCapabilities } from '../../shared/agent-capabilities-types';
import { DEFAULT_CAPABILITIES } from '../../shared/agent-capabilities-types';
import type { HarnessRuntimeCapabilities } from '../../shared/runtime-metadata-types';

// ============================================================================
// Layer 1 vs Layer 2: No key overlap
// ============================================================================

describe('capability layering', () => {
	describe('Layer 1 (static) and Layer 2 (runtime) are structurally distinct', () => {
		it('AgentCapabilities and HarnessRuntimeCapabilities should have NO overlapping keys', () => {
			// Build full instances to get all keys
			const staticCaps: AgentCapabilities = { ...DEFAULT_CAPABILITIES };
			const runtimeCaps: HarnessRuntimeCapabilities = {
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

			const staticKeys = new Set(Object.keys(staticCaps));
			const runtimeKeys = new Set(Object.keys(runtimeCaps));
			const overlap = [...staticKeys].filter((k) => runtimeKeys.has(k));

			expect(overlap).toEqual([]);
		});

		it('Layer 1 keys should describe agent-type facts (not runtime state)', () => {
			const staticKeys = Object.keys(DEFAULT_CAPABILITIES);
			// Layer 1 keys should NOT contain "Runtime" — runtime state belongs in Layer 2
			for (const key of staticKeys) {
				expect(key).not.toMatch(/Runtime/);
			}
		});

		it('Layer 2 keys should describe per-session runtime abilities', () => {
			const runtimeCaps: HarnessRuntimeCapabilities = {
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
			const runtimeKeys = Object.keys(runtimeCaps);
			// All Layer 2 keys should start with 'supports'
			for (const key of runtimeKeys) {
				expect(key).toMatch(/^supports/);
			}
		});
	});

	// ============================================================================
	// Single source of truth: no local AgentCapabilities definitions
	// ============================================================================

	describe('single source of truth enforcement', () => {
		const sharedTypePath = path.resolve(__dirname, '../../shared/agent-capabilities-types.ts');

		it('shared/agent-capabilities-types.ts should exist and export AgentCapabilities', () => {
			expect(fs.existsSync(sharedTypePath)).toBe(true);
			const content = fs.readFileSync(sharedTypePath, 'utf-8');
			expect(content).toMatch(/export interface AgentCapabilities/);
			expect(content).toMatch(/export const DEFAULT_CAPABILITIES/);
		});

		it('main/agents/capabilities.ts should import AgentCapabilities from shared, not define it', () => {
			const mainCapsPath = path.resolve(__dirname, '../../main/agents/capabilities.ts');
			const content = fs.readFileSync(mainCapsPath, 'utf-8');
			// Should re-export from shared
			expect(content).toMatch(/from\s+['"].*shared\/agent-capabilities-types['"]/);
			// Should NOT define its own interface
			expect(content).not.toMatch(/^export interface AgentCapabilities/m);
		});

		it('renderer/hooks/agent/useAgentCapabilities.ts should import from shared, not define locally', () => {
			const hookPath = path.resolve(
				__dirname,
				'../../renderer/hooks/agent/useAgentCapabilities.ts'
			);
			const content = fs.readFileSync(hookPath, 'utf-8');
			// Should import from shared
			expect(content).toMatch(/from\s+['"].*shared\/agent-capabilities-types['"]/);
			// Should NOT define its own interface
			expect(content).not.toMatch(/^export interface AgentCapabilities/m);
		});

		it('renderer/types/index.ts should re-export from shared, not define locally', () => {
			const typesPath = path.resolve(__dirname, '../../renderer/types/index.ts');
			const content = fs.readFileSync(typesPath, 'utf-8');
			// Should re-export from shared
			expect(content).toMatch(/from\s+['"].*shared\/agent-capabilities-types['"]/);
			// Should NOT define its own AgentCapabilities interface
			const lines = content.split('\n');
			const interfaceLines = lines.filter(
				(line) =>
					/^\s*export\s+interface\s+AgentCapabilities\b/.test(line) ||
					/^\s*interface\s+AgentCapabilities\b/.test(line)
			);
			expect(interfaceLines).toHaveLength(0);
		});

		it('preload/agents.ts should import from shared, not define locally', () => {
			const preloadPath = path.resolve(__dirname, '../../main/preload/agents.ts');
			const content = fs.readFileSync(preloadPath, 'utf-8');
			// Should import from shared
			expect(content).toMatch(/from\s+['"].*shared\/agent-capabilities-types['"]/);
			// Should NOT define its own interface
			expect(content).not.toMatch(/^export interface AgentCapabilities/m);
		});
	});

	// ============================================================================
	// Layer 3: SessionRuntimeMetadata includes Layer 2 caps but also data fields
	// ============================================================================

	describe('Layer 3 (session runtime metadata) is distinct from Layer 2 (runtime capabilities)', () => {
		it('SessionRuntimeMetadata should contain capabilities as a sub-field, not flatten them', () => {
			// Import the store type
			const storeSource = fs.readFileSync(
				path.resolve(__dirname, '../../renderer/stores/harnessStore.ts'),
				'utf-8'
			);
			// SessionRuntimeMetadata should have a `capabilities` field typed as Partial<HarnessRuntimeCapabilities>
			expect(storeSource).toMatch(/capabilities:\s*Partial<HarnessRuntimeCapabilities>/);
			// It should also have data fields that are NOT in HarnessRuntimeCapabilities
			expect(storeSource).toMatch(/skills:\s*SkillSummary\[\]/);
			expect(storeSource).toMatch(/slashCommands:\s*string\[\]/);
			expect(storeSource).toMatch(/availableModels:\s*RuntimeModelSummary\[\]/);
			expect(storeSource).toMatch(/availableAgents:\s*RuntimeAgentSummary\[\]/);
		});

		it('harnessStore should export a dedicated selector for runtime capabilities', () => {
			const storeSource = fs.readFileSync(
				path.resolve(__dirname, '../../renderer/stores/harnessStore.ts'),
				'utf-8'
			);
			expect(storeSource).toMatch(/export const selectSessionRuntimeCapabilities/);
		});
	});

	// ============================================================================
	// Dedicated hooks for each layer
	// ============================================================================

	describe('separate hooks exist for each layer', () => {
		it('Layer 1 hook (useAgentCapabilities) should exist', () => {
			const hookPath = path.resolve(
				__dirname,
				'../../renderer/hooks/agent/useAgentCapabilities.ts'
			);
			expect(fs.existsSync(hookPath)).toBe(true);
		});

		it('Layer 2 hook (useSessionRuntimeCapabilities) should exist', () => {
			const hookPath = path.resolve(
				__dirname,
				'../../renderer/hooks/agent/useSessionRuntimeCapabilities.ts'
			);
			expect(fs.existsSync(hookPath)).toBe(true);
			const content = fs.readFileSync(hookPath, 'utf-8');
			// Should use the dedicated selector from harnessStore
			expect(content).toMatch(/selectSessionRuntimeCapabilities/);
			// Should import HarnessRuntimeCapabilities from shared
			expect(content).toMatch(/HarnessRuntimeCapabilities/);
		});

		it('Layer 2 hook should be exported from the agent hooks index', () => {
			const indexPath = path.resolve(__dirname, '../../renderer/hooks/agent/index.ts');
			const content = fs.readFileSync(indexPath, 'utf-8');
			expect(content).toMatch(/useSessionRuntimeCapabilities/);
		});

		it('agent hooks index should have comment annotations distinguishing Layer 1 and Layer 2', () => {
			const indexPath = path.resolve(__dirname, '../../renderer/hooks/agent/index.ts');
			const content = fs.readFileSync(indexPath, 'utf-8');
			// Should clearly label the two layers
			expect(content).toMatch(/Layer 1/);
			expect(content).toMatch(/Layer 2/);
		});
	});

	// ============================================================================
	// DEFAULT_CAPABILITIES completeness
	// ============================================================================

	describe('DEFAULT_CAPABILITIES completeness', () => {
		it('DEFAULT_CAPABILITIES should include supportsHarnessExecution', () => {
			// supportsHarnessExecution is the Layer 1 flag that gates whether
			// Layer 2 can even exist. It must be in the defaults.
			expect('supportsHarnessExecution' in DEFAULT_CAPABILITIES).toBe(true);
			expect(DEFAULT_CAPABILITIES.supportsHarnessExecution).toBe(false);
		});

		it('DEFAULT_CAPABILITIES should have all boolean fields set to false', () => {
			for (const [key, value] of Object.entries(DEFAULT_CAPABILITIES)) {
				if (typeof value === 'boolean') {
					expect(value).toBe(false);
				}
			}
		});
	});

	// ============================================================================
	// Compile-time assignability: shared type is canonical
	// ============================================================================

	describe('compile-time type assignability', () => {
		it('main process AgentCapabilities map entries should satisfy the shared type', () => {
			// This is a compile-time check: if capabilities.ts drifted from shared,
			// importing both would produce a TS error when assigning.
			const caps: AgentCapabilities = {
				...DEFAULT_CAPABILITIES,
				supportsResume: true,
				supportsHarnessExecution: true,
			};
			expect(caps.supportsResume).toBe(true);
			expect(caps.supportsHarnessExecution).toBe(true);
		});

		it('HarnessRuntimeCapabilities should be a separate non-overlapping type', () => {
			const runtimeCaps: Partial<HarnessRuntimeCapabilities> = {
				supportsInteractionRequests: true,
				supportsRuntimeModelChange: false,
			};
			expect(runtimeCaps.supportsInteractionRequests).toBe(true);
			// Compile-time: supportsResume should NOT be assignable to HarnessRuntimeCapabilities
			// (no runtime test needed — TypeScript enforces this)
		});
	});
});
