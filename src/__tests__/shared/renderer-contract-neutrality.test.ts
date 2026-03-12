/**
 * Renderer contract neutrality verification.
 *
 * Verifies that no shared IPC contract (interaction types, runtime metadata)
 * requires Claude-specific or provider-specific decoding in the renderer.
 *
 * This test scans the actual renderer source files that consume shared contracts
 * to ensure they remain provider-neutral pass-throughs.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const rendererDir = path.resolve(__dirname, '../../renderer');
const sharedDir = path.resolve(__dirname, '../../shared');

// ============================================================================
// Helpers
// ============================================================================

/**
 * Reads a source file and returns its content.
 */
function readSource(filePath: string): string {
	return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Extracts import lines from TypeScript source.
 */
function extractImportLines(source: string): string[] {
	return source.split('\n').filter((line) => /^\s*import\s/.test(line));
}

/**
 * Provider SDK package patterns that must never appear in shared contract consumers.
 */
const PROVIDER_SDK_PATTERNS = [
	/@anthropic-ai\/sdk/,
	/from\s+['"]openai/,
	/from\s+['"]@openai/,
	/from\s+['"]claude/,
	/from\s+['"]@claude/,
];

/**
 * Provider-specific type names that indicate decoding logic
 * (not agent IDs or UI labels, but SDK type consumption).
 */
const PROVIDER_DECODE_PATTERNS = [
	/ToolUseBlock/,
	/ContentBlock(?:Param)?/,
	/MessageStreamEvent/,
	/TextBlock/,
	/ToolResultBlockParam/,
	/BetaMessage/,
	/ChatCompletion/,
	/ChatCompletionMessage/,
];

// ============================================================================
// Tests
// ============================================================================

describe('renderer contract neutrality', () => {
	describe('shared contract files import only from shared modules', () => {
		it('interaction-types.ts has no provider SDK imports', () => {
			const source = readSource(path.join(sharedDir, 'interaction-types.ts'));
			const imports = extractImportLines(source);

			for (const line of imports) {
				for (const pattern of PROVIDER_SDK_PATTERNS) {
					expect(line).not.toMatch(pattern);
				}
				// Must not import from layer-specific directories
				expect(line).not.toMatch(/from\s+['"].*\/(main|renderer|preload)\//);
			}
		});

		it('runtime-metadata-types.ts has no provider SDK imports', () => {
			const source = readSource(path.join(sharedDir, 'runtime-metadata-types.ts'));
			const imports = extractImportLines(source);

			for (const line of imports) {
				for (const pattern of PROVIDER_SDK_PATTERNS) {
					expect(line).not.toMatch(pattern);
				}
				expect(line).not.toMatch(/from\s+['"].*\/(main|renderer|preload)\//);
			}
		});
	});

	describe('renderer service layer has no provider-specific decoding', () => {
		it('process.ts imports only from shared contract modules', () => {
			const source = readSource(path.join(rendererDir, 'services/process.ts'));
			const imports = extractImportLines(source);

			for (const line of imports) {
				for (const pattern of PROVIDER_SDK_PATTERNS) {
					expect(line).not.toMatch(pattern);
				}
			}
		});

		it('process.ts does not reference provider SDK types', () => {
			const source = readSource(path.join(rendererDir, 'services/process.ts'));

			for (const pattern of PROVIDER_DECODE_PATTERNS) {
				expect(source).not.toMatch(pattern);
			}
		});

		it('process.ts passes interaction requests through without transformation', () => {
			const source = readSource(path.join(rendererDir, 'services/process.ts'));

			// Should have handler functions but no JSON.parse, decode, transform, convert calls
			// on interaction/runtime data
			const lines = source.split('\n');
			const interactionBlock = lines.filter(
				(line) =>
					line.includes('InteractionRequest') ||
					line.includes('InteractionResponse') ||
					line.includes('RuntimeMetadataEvent')
			);

			// Type references exist (imports and signatures)
			expect(interactionBlock.length).toBeGreaterThan(0);

			// No decoding/transformation of the shared contract payloads
			expect(source).not.toMatch(/JSON\.parse.*[Ii]nteraction/);
			expect(source).not.toMatch(/JSON\.parse.*[Mm]etadata/);
			expect(source).not.toMatch(/decode.*[Ii]nteraction/);
			expect(source).not.toMatch(/transform.*[Ii]nteraction/);
			expect(source).not.toMatch(/convert.*[Ii]nteraction/);
		});
	});

	describe('renderer type barrel re-exports without modification', () => {
		it('renderer types/index.ts re-exports interaction types from shared', () => {
			const source = readSource(path.join(rendererDir, 'types/index.ts'));

			// Must re-export from shared, not define locally
			expect(source).toMatch(/InteractionRequest/);
			expect(source).toMatch(/InteractionResponse/);

			// Re-exports come from shared
			expect(source).toMatch(/from\s+['"].*shared/);
		});

		it('renderer types/index.ts re-exports runtime metadata types from shared', () => {
			const source = readSource(path.join(rendererDir, 'types/index.ts'));

			expect(source).toMatch(/RuntimeMetadataEvent/);
			expect(source).toMatch(/HarnessRuntimeCapabilities/);

			// Re-exports come from shared
			expect(source).toMatch(/from\s+['"].*shared/);
		});

		it('renderer types/index.ts does not define provider-specific contract extensions', () => {
			const source = readSource(path.join(rendererDir, 'types/index.ts'));

			// Should not define local interfaces that extend shared contracts with provider data
			expect(source).not.toMatch(/interface\s+Claude.*Interaction/);
			expect(source).not.toMatch(/interface\s+Claude.*Metadata/);
			expect(source).not.toMatch(/interface\s+Anthropic.*Request/);
			expect(source).not.toMatch(/interface\s+Codex.*Request/);
		});
	});

	describe('global.d.ts window types reference shared contracts', () => {
		it('InteractionRequestPayload aliases shared InteractionRequest', () => {
			const source = readSource(path.join(rendererDir, 'global.d.ts'));

			// Should use import() type alias, not a local interface
			expect(source).toMatch(
				/type\s+InteractionRequestPayload\s*=\s*import\(['"].*interaction-types['"]\)\.InteractionRequest/
			);
		});

		it('InteractionResponsePayload aliases shared InteractionResponse', () => {
			const source = readSource(path.join(rendererDir, 'global.d.ts'));

			expect(source).toMatch(
				/type\s+InteractionResponsePayload\s*=\s*import\(['"].*interaction-types['"]\)\.InteractionResponse/
			);
		});

		it('RuntimeMetadataPayload aliases shared RuntimeMetadataEvent', () => {
			const source = readSource(path.join(rendererDir, 'global.d.ts'));

			expect(source).toMatch(
				/type\s+RuntimeMetadataPayload\s*=\s*import\(['"].*runtime-metadata-types['"]\)\.RuntimeMetadataEvent/
			);
		});

		it('window.maestro.process types do not include provider-specific parameters', () => {
			const source = readSource(path.join(rendererDir, 'global.d.ts'));

			// Extract the process namespace block
			const processMatch = source.match(/process:\s*\{[\s\S]*?\n\t\t\}/);
			if (processMatch) {
				const processBlock = processMatch[0];
				// Should not have Claude/Anthropic-specific method signatures
				expect(processBlock).not.toMatch(/[Cc]laude[A-Z]/);
				expect(processBlock).not.toMatch(/[Aa]nthropic[A-Z]/);
				expect(processBlock).not.toMatch(/ToolUseBlock/);
				expect(processBlock).not.toMatch(/ContentBlock/);
			}
		});
	});

	describe('no renderer component decodes provider payloads', () => {
		it('no renderer TypeScript file imports from provider SDK packages', () => {
			const rendererFiles = collectTsFiles(rendererDir);

			for (const file of rendererFiles) {
				const source = readSource(file);
				const imports = extractImportLines(source);
				const relPath = path.relative(rendererDir, file);

				for (const line of imports) {
					for (const pattern of PROVIDER_SDK_PATTERNS) {
						expect(
							pattern.test(line),
							`${relPath} imports provider SDK: ${line.trim()}`
						).toBe(false);
					}
				}
			}
		});

		it('no renderer TypeScript file references provider SDK decode types', () => {
			// Check files that import interaction or runtime metadata types
			const rendererFiles = collectTsFiles(rendererDir);
			const contractConsumers = rendererFiles.filter((file) => {
				const source = readSource(file);
				return (
					source.includes('InteractionRequest') ||
					source.includes('InteractionResponse') ||
					source.includes('RuntimeMetadataEvent')
				);
			});

			for (const file of contractConsumers) {
				const source = readSource(file);
				const relPath = path.relative(rendererDir, file);

				for (const pattern of PROVIDER_DECODE_PATTERNS) {
					expect(
						pattern.test(source),
						`${relPath} references provider SDK type: ${pattern}`
					).toBe(false);
				}
			}
		});
	});
});

// ============================================================================
// File collection helper
// ============================================================================

/**
 * Recursively collects .ts and .tsx files from a directory.
 */
function collectTsFiles(dir: string): string[] {
	const results: string[] = [];
	const entries = fs.readdirSync(dir, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory() && entry.name !== 'node_modules') {
			results.push(...collectTsFiles(fullPath));
		} else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
			results.push(fullPath);
		}
	}

	return results;
}
