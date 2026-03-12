/**
 * Tests for Claude provider option helpers.
 *
 * Covers:
 * - buildClaudeProviderOptions() typed builder
 * - buildClaudeRuntimeOptions() typed builder
 * - CLAUDE_PROVIDER_OPTION_KEYS and CLAUDE_RUNTIME_OPTION_KEYS sets
 * - Only defined fields appear in output (undefined fields omitted)
 * - All known keys accepted, unknown keys not present
 */

import { describe, it, expect } from 'vitest';
import {
	buildClaudeProviderOptions,
	buildClaudeRuntimeOptions,
	CLAUDE_PROVIDER_OPTION_KEYS,
	CLAUDE_RUNTIME_OPTION_KEYS,
} from '../claude-provider-options';
import type { ClaudeProviderOptions } from '../claude-provider-options';

describe('buildClaudeProviderOptions', () => {
	it('should return empty object for empty input', () => {
		const result = buildClaudeProviderOptions({});
		expect(result).toEqual({});
	});

	it('should include only defined fields', () => {
		const result = buildClaudeProviderOptions({
			effort: 'max',
			maxBudgetUsd: 5.0,
		});

		expect(result).toEqual({
			effort: 'max',
			maxBudgetUsd: 5.0,
		});
		expect(Object.keys(result)).toHaveLength(2);
	});

	it('should omit explicitly undefined fields', () => {
		const result = buildClaudeProviderOptions({
			effort: 'high',
			continueSession: undefined,
		});

		expect(result).toEqual({ effort: 'high' });
		expect(result).not.toHaveProperty('continueSession');
	});

	it('should pass through all known Claude options', () => {
		const allOptions: ClaudeProviderOptions = {
			continueSession: true,
			forkSession: true,
			thinking: { type: 'adaptive' },
			effort: 'max',
			allowedTools: ['Bash', 'Read'],
			disallowedTools: ['Write'],
			maxBudgetUsd: 10.0,
			enableFileCheckpointing: true,
			includePartialMessages: true,
			settingSources: ['claude.md'],
			mcpServers: { test: { url: 'http://localhost' } },
			sandbox: { enabled: true },
		};

		const result = buildClaudeProviderOptions(allOptions);

		expect(result.continueSession).toBe(true);
		expect(result.forkSession).toBe(true);
		expect(result.thinking).toEqual({ type: 'adaptive' });
		expect(result.effort).toBe('max');
		expect(result.allowedTools).toEqual(['Bash', 'Read']);
		expect(result.disallowedTools).toEqual(['Write']);
		expect(result.maxBudgetUsd).toBe(10.0);
		expect(result.enableFileCheckpointing).toBe(true);
		expect(result.includePartialMessages).toBe(true);
		expect(result.settingSources).toEqual(['claude.md']);
		expect(result.mcpServers).toEqual({ test: { url: 'http://localhost' } });
		expect(result.sandbox).toEqual({ enabled: true });
	});

	it('should handle thinking with budget_tokens', () => {
		const result = buildClaudeProviderOptions({
			thinking: { type: 'enabled', budget_tokens: 8192 },
		});

		expect(result.thinking).toEqual({ type: 'enabled', budget_tokens: 8192 });
	});

	it('should handle false boolean values (not omit them)', () => {
		const result = buildClaudeProviderOptions({
			continueSession: false,
			enableFileCheckpointing: false,
		});

		expect(result.continueSession).toBe(false);
		expect(result.enableFileCheckpointing).toBe(false);
	});

	it('should handle empty arrays', () => {
		const result = buildClaudeProviderOptions({
			allowedTools: [],
			disallowedTools: [],
		});

		expect(result.allowedTools).toEqual([]);
		expect(result.disallowedTools).toEqual([]);
	});

	it('should produce output assignable to Record<string, unknown>', () => {
		const result: Record<string, unknown> = buildClaudeProviderOptions({
			effort: 'high',
		});

		expect(result.effort).toBe('high');
	});
});

describe('buildClaudeRuntimeOptions', () => {
	it('should return empty object for empty input', () => {
		const result = buildClaudeRuntimeOptions({});
		expect(result).toEqual({});
	});

	it('should include effort when defined', () => {
		const result = buildClaudeRuntimeOptions({ effort: 'max' });
		expect(result).toEqual({ effort: 'max' });
	});

	it('should omit effort when undefined', () => {
		const result = buildClaudeRuntimeOptions({ effort: undefined });
		expect(result).toEqual({});
	});

	it('should produce output assignable to Record<string, unknown>', () => {
		const result: Record<string, unknown> = buildClaudeRuntimeOptions({
			effort: 'low',
		});

		expect(result.effort).toBe('low');
	});
});

describe('CLAUDE_PROVIDER_OPTION_KEYS', () => {
	it('should contain all known spawn-time option keys', () => {
		const expectedKeys = [
			'continueSession', 'forkSession', 'thinking', 'effort',
			'allowedTools', 'disallowedTools', 'maxBudgetUsd',
			'enableFileCheckpointing', 'includePartialMessages',
			'settingSources', 'mcpServers', 'sandbox',
		];

		for (const key of expectedKeys) {
			expect(CLAUDE_PROVIDER_OPTION_KEYS.has(key)).toBe(true);
		}
		expect(CLAUDE_PROVIDER_OPTION_KEYS.size).toBe(expectedKeys.length);
	});
});

describe('CLAUDE_RUNTIME_OPTION_KEYS', () => {
	it('should contain effort', () => {
		expect(CLAUDE_RUNTIME_OPTION_KEYS.has('effort')).toBe(true);
	});

	it('should be a subset of CLAUDE_PROVIDER_OPTION_KEYS', () => {
		for (const key of CLAUDE_RUNTIME_OPTION_KEYS) {
			expect(CLAUDE_PROVIDER_OPTION_KEYS.has(key)).toBe(true);
		}
	});
});
