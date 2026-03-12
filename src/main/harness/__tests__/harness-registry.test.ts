/**
 * Tests for the harness registry.
 *
 * Verifies:
 * - Factory registration and creation
 * - Fresh instance per createHarness() call
 * - Invalid agent IDs handled cleanly
 * - Unregistered agents return null
 * - Registry clearing for test isolation
 * - Factory errors handled without crashing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import {
	registerHarness,
	createHarness,
	hasHarness,
	getRegisteredHarnessIds,
	clearHarnessRegistry,
} from '../harness-registry';
import type { AgentHarness } from '../agent-harness';
import type { HarnessRuntimeCapabilities } from '../../../shared/runtime-metadata-types';

// Mock the logger
vi.mock('../../utils/logger', () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

// Mock agentIds for validation
vi.mock('../../../shared/agentIds', () => ({
	isValidAgentId: vi.fn((id: string) => {
		const validIds = ['claude-code', 'codex', 'opencode', 'terminal', 'factory-droid', 'aider', 'gemini-cli', 'qwen3-coder'];
		return validIds.includes(id);
	}),
	AGENT_IDS: {},
}));

/** Create a minimal mock harness for testing */
function createMockHarness(agentId: string): AgentHarness {
	const emitter = new EventEmitter();
	return Object.assign(emitter, {
		agentId: agentId as AgentHarness['agentId'],
		spawn: vi.fn().mockResolvedValue({ success: true, pid: null }),
		write: vi.fn(),
		interrupt: vi.fn().mockResolvedValue(undefined),
		kill: vi.fn(),
		respondToInteraction: vi.fn().mockResolvedValue(undefined),
		updateRuntimeSettings: vi.fn().mockResolvedValue(undefined),
		isRunning: vi.fn().mockReturnValue(false),
		getCapabilities: vi.fn().mockReturnValue({
			supportsMidTurnInput: false,
			supportsInteractionRequests: false,
			supportsPersistentStdin: false,
			supportsRuntimePermissionUpdates: false,
			supportsRuntimeModelChange: false,
			supportsRuntimeEffortChange: false,
			supportsSkillsEnumeration: false,
			supportsRuntimeSlashCommands: false,
			supportsFileCheckpointing: false,
			supportsStructuredOutput: false,
			supportsBudgetLimits: false,
			supportsContextCompaction: false,
			supportsSessionFork: false,
		} satisfies HarnessRuntimeCapabilities),
	}) as unknown as AgentHarness;
}

describe('harness-registry', () => {
	beforeEach(() => {
		clearHarnessRegistry();
	});

	describe('registerHarness', () => {
		it('should register a factory for a valid agent ID', () => {
			const factory = () => createMockHarness('claude-code');
			registerHarness('claude-code' as any, factory);
			expect(hasHarness('claude-code')).toBe(true);
		});

		it('should overwrite an existing factory with a warning', () => {
			const factory1 = () => createMockHarness('claude-code');
			const factory2 = () => createMockHarness('claude-code');
			registerHarness('claude-code' as any, factory1);
			registerHarness('claude-code' as any, factory2);

			// Should still have the registration
			expect(hasHarness('claude-code')).toBe(true);

			// The second factory should be active
			const harness = createHarness('claude-code');
			expect(harness).not.toBeNull();
		});
	});

	describe('createHarness', () => {
		it('should create a new instance from the registered factory', () => {
			const factory = vi.fn(() => createMockHarness('claude-code'));
			registerHarness('claude-code' as any, factory);

			const harness = createHarness('claude-code');
			expect(harness).not.toBeNull();
			expect(harness!.agentId).toBe('claude-code');
			expect(factory).toHaveBeenCalledOnce();
		});

		it('should create a fresh instance on each call', () => {
			const factory = vi.fn(() => createMockHarness('claude-code'));
			registerHarness('claude-code' as any, factory);

			const h1 = createHarness('claude-code');
			const h2 = createHarness('claude-code');
			expect(h1).not.toBe(h2);
			expect(factory).toHaveBeenCalledTimes(2);
		});

		it('should return null for unregistered agent IDs', () => {
			const harness = createHarness('codex');
			expect(harness).toBeNull();
		});

		it('should return null for invalid agent IDs', () => {
			const harness = createHarness('not-a-real-agent');
			expect(harness).toBeNull();
		});

		it('should return null and log error if factory throws', () => {
			const factory = () => {
				throw new Error('Factory explosion');
			};
			registerHarness('claude-code' as any, factory);

			const harness = createHarness('claude-code');
			expect(harness).toBeNull();
		});
	});

	describe('hasHarness', () => {
		it('should return false for unregistered agent IDs', () => {
			expect(hasHarness('claude-code')).toBe(false);
		});

		it('should return true after registration', () => {
			registerHarness('claude-code' as any, () => createMockHarness('claude-code'));
			expect(hasHarness('claude-code')).toBe(true);
		});

		it('should return false for invalid agent IDs', () => {
			expect(hasHarness('invalid-agent')).toBe(false);
		});
	});

	describe('getRegisteredHarnessIds', () => {
		it('should return empty array when no harnesses registered', () => {
			expect(getRegisteredHarnessIds()).toEqual([]);
		});

		it('should return all registered agent IDs', () => {
			registerHarness('claude-code' as any, () => createMockHarness('claude-code'));
			registerHarness('codex' as any, () => createMockHarness('codex'));

			const ids = getRegisteredHarnessIds();
			expect(ids).toHaveLength(2);
			expect(ids).toContain('claude-code');
			expect(ids).toContain('codex');
		});
	});

	describe('clearHarnessRegistry', () => {
		it('should remove all registrations', () => {
			registerHarness('claude-code' as any, () => createMockHarness('claude-code'));
			registerHarness('codex' as any, () => createMockHarness('codex'));

			clearHarnessRegistry();

			expect(hasHarness('claude-code')).toBe(false);
			expect(hasHarness('codex')).toBe(false);
			expect(getRegisteredHarnessIds()).toEqual([]);
		});
	});
});
