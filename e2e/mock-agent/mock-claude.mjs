#!/usr/bin/env node

/**
 * Mock Claude Code agent for E2E testing.
 *
 * Emits stream-JSON output (JSONL) matching the real Claude Code format.
 *
 * Keyword triggers (detected in the last CLI arg or stdin prompt):
 *   __ERROR_AUTH__  - exit with code 1 (authentication failure)
 *   __CRASH__       - exit with code 137 (simulated crash / OOM)
 *   __SLOW__        - add a 5-second delay before responding
 *   __THINKING__    - include thinking blocks in the response
 *
 * Default behavior: emit init -> assistant chunks -> result
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SESSION_ID = 'mock-session-' + Date.now();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadResponse(name) {
	const filePath = resolve(__dirname, 'responses', `${name}.json`);
	try {
		return JSON.parse(readFileSync(filePath, 'utf-8'));
	} catch {
		return null;
	}
}

function writeLine(obj) {
	process.stdout.write(JSON.stringify(obj) + '\n');
}

function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Prompt extraction
// ---------------------------------------------------------------------------

function getPrompt() {
	const args = process.argv.slice(2);

	// Look for prompt after "--"
	const dashIdx = args.indexOf('--');
	if (dashIdx !== -1 && dashIdx < args.length - 1) {
		return args.slice(dashIdx + 1).join(' ');
	}

	// Fall back to the last arg
	if (args.length > 0) {
		return args[args.length - 1];
	}

	return '';
}

// ---------------------------------------------------------------------------
// Emitters
// ---------------------------------------------------------------------------

function emitInit() {
	writeLine({
		type: 'system',
		subtype: 'init',
		session_id: SESSION_ID,
		slash_commands: [],
	});
}

function emitAssistantChunks(chunks) {
	for (const chunk of chunks) {
		writeLine({
			type: 'assistant',
			message: {
				role: 'assistant',
				content: [{ type: 'text', text: chunk }],
			},
			session_id: SESSION_ID,
		});
	}
}

function emitThinkingChunks(thinkingText) {
	writeLine({
		type: 'assistant',
		message: {
			role: 'assistant',
			content: [{ type: 'thinking', thinking: thinkingText }],
		},
		session_id: SESSION_ID,
	});
}

function emitResult(fullText) {
	writeLine({
		type: 'result',
		result: fullText,
		session_id: SESSION_ID,
		usage: { input_tokens: 100, output_tokens: 50 },
		total_cost_usd: 0.001,
	});
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	const prompt = getPrompt();

	// Keyword: authentication error
	if (prompt.includes('__ERROR_AUTH__')) {
		const resp = loadResponse('error-auth');
		if (resp && resp.message) {
			process.stderr.write(resp.message + '\n');
		} else {
			process.stderr.write('Authentication error: invalid API key\n');
		}
		process.exit(1);
	}

	// Keyword: rate limit error
	if (prompt.includes('__ERROR_RATE_LIMIT__')) {
		const resp = loadResponse('error-rate-limit');
		if (resp && resp.message) {
			process.stderr.write(resp.message + '\n');
		} else {
			process.stderr.write('Rate limit exceeded. Please try again later.\n');
		}
		process.exit(1);
	}

	// Keyword: crash / OOM
	if (prompt.includes('__CRASH__')) {
		process.exit(137);
	}

	// Keyword: slow response
	if (prompt.includes('__SLOW__')) {
		await sleep(5000);
	}

	// Emit init
	emitInit();

	// Small pause to mimic real startup
	await sleep(50);

	// Keyword: thinking blocks
	if (prompt.includes('__THINKING__')) {
		const resp = loadResponse('thinking');
		if (resp) {
			emitThinkingChunks(resp.thinking || 'Thinking about the problem...');
			await sleep(100);
			emitAssistantChunks(resp.chunks || ['Done thinking.']);
			emitResult(resp.text || 'Done thinking.');
		} else {
			emitThinkingChunks('Analyzing the request...');
			await sleep(100);
			emitAssistantChunks(['Thought complete.']);
			emitResult('Thought complete.');
		}
		process.exit(0);
	}

	// Default: simple response
	const resp = loadResponse('simple');
	const chunks = resp?.chunks || ['Hello', ' from', ' mock', ' Claude.'];
	const fullText = resp?.text || chunks.join('');

	emitAssistantChunks(chunks);
	emitResult(fullText);

	process.exit(0);
}

main().catch((err) => {
	process.stderr.write(`Mock agent error: ${err.message}\n`);
	process.exit(1);
});
