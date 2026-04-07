/**
 * Tests for useBatchProcessor hook - Pure Functions and Hook Behavior
 *
 * This file tests the pure utility functions exported from useBatchProcessor
 * and the hook behavior with mocked IPC.
 *
 * Note: The hook itself (useBatchProcessor) has complex async state management
 * that requires careful mocking of the window.maestro IPC bridge.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type {
	Session,
	Group,
	HistoryEntry,
	UsageStats,
	BatchRunConfig,
	AgentError,
} from '../../../renderer/types';

// Import the exported functions directly
import { countUnfinishedTasks, uncheckAllTasks, useBatchProcessor } from '../../../renderer/hooks';
import { useBatchStore } from '../../../renderer/stores/batchStore';

// Mock notifyToast so we can verify toast notifications
const { mockNotifyToast } = vi.hoisted(() => ({
	mockNotifyToast: vi.fn(),
}));
vi.mock('../../../renderer/stores/notificationStore', () => ({
	notifyToast: (...args: unknown[]) => mockNotifyToast(...args),
}));

// ============================================================================
// Tests for countUnfinishedTasks
// ============================================================================

describe('countUnfinishedTasks', () => {
	describe('empty and no-checkbox content', () => {
		it('should return 0 for empty string', () => {
			expect(countUnfinishedTasks('')).toBe(0);
		});

		it('should return 0 for whitespace only', () => {
			expect(countUnfinishedTasks('   \n\t\n   ')).toBe(0);
		});

		it('should return 0 for content with no checkboxes', () => {
			const content = `# My Document

This is some text without any checkboxes.
- Regular list item
- Another item`;
			expect(countUnfinishedTasks(content)).toBe(0);
		});

		it('should return 0 for content with only regular markdown', () => {
			const content = `# Heading
## Subheading
Some **bold** and *italic* text.
- Item 1
- Item 2
1. Numbered item
2. Another numbered item`;
			expect(countUnfinishedTasks(content)).toBe(0);
		});
	});

	describe('counting unchecked tasks', () => {
		it('should count single unchecked task', () => {
			const content = '- [ ] Task one';
			expect(countUnfinishedTasks(content)).toBe(1);
		});

		it('should count multiple unchecked tasks', () => {
			const content = `# Tasks
- [ ] Task one
- [ ] Task two
- [ ] Task three`;
			expect(countUnfinishedTasks(content)).toBe(3);
		});

		it('should count unchecked tasks at various document positions', () => {
			const content = `- [ ] First task at start

Some content in between

- [ ] Middle task

More content

- [ ] Last task at end`;
			expect(countUnfinishedTasks(content)).toBe(3);
		});
	});

	describe('ignoring checked tasks', () => {
		it('should not count checked tasks (lowercase x)', () => {
			const content = `- [x] Completed task
- [ ] Pending task`;
			expect(countUnfinishedTasks(content)).toBe(1);
		});

		it('should not count checked tasks (uppercase X)', () => {
			const content = `- [X] Completed task
- [ ] Pending task`;
			expect(countUnfinishedTasks(content)).toBe(1);
		});

		it('should not count any checked task variants', () => {
			const content = `- [x] Done lowercase
- [X] Done uppercase
- [✓] Done checkmark
- [✔] Done heavy checkmark`;
			expect(countUnfinishedTasks(content)).toBe(0);
		});
	});

	describe('mixed checked and unchecked tasks', () => {
		it('should handle mixed checked and unchecked tasks', () => {
			const content = `# Project Tasks
- [x] Setup project
- [ ] Write tests
- [X] Configure CI
- [ ] Deploy
- [ ] Document`;
			expect(countUnfinishedTasks(content)).toBe(3);
		});

		it('should handle alternating checked/unchecked pattern', () => {
			const content = `- [x] Done 1
- [ ] Todo 1
- [x] Done 2
- [ ] Todo 2
- [x] Done 3
- [ ] Todo 3`;
			expect(countUnfinishedTasks(content)).toBe(3);
		});
	});

	describe('indentation handling', () => {
		it('should handle indented checkboxes', () => {
			const content = `# Nested Tasks
- [ ] Parent task
  - [ ] Child task 1
    - [ ] Grandchild task
  - [ ] Child task 2`;
			expect(countUnfinishedTasks(content)).toBe(4);
		});

		it('should handle deeply nested checkboxes', () => {
			const content = `- [ ] Level 0
    - [ ] Level 1
        - [ ] Level 2
            - [ ] Level 3
                - [ ] Level 4`;
			expect(countUnfinishedTasks(content)).toBe(5);
		});

		it('should handle tabs as indentation', () => {
			const content = `\t- [ ] Tabbed task
\t\t- [ ] Double tabbed task`;
			expect(countUnfinishedTasks(content)).toBe(2);
		});

		it('should handle mixed tabs and spaces', () => {
			const content = `  - [ ] Space indented
\t- [ ] Tab indented
  \t- [ ] Mixed indented`;
			expect(countUnfinishedTasks(content)).toBe(3);
		});
	});

	describe('checkbox format variations', () => {
		it('should handle extra spaces in checkbox (still matches with \\s*)', () => {
			const content = `- [  ] Task with extra space
- [ ] Normal task`;
			// The regex uses \s* which allows any whitespace, so both match
			expect(countUnfinishedTasks(content)).toBe(2);
		});

		it('should handle no space in checkbox', () => {
			const content = '- [] Task with no space';
			// The regex allows \s* so [] should match
			expect(countUnfinishedTasks(content)).toBe(1);
		});
	});

	describe('task content variations', () => {
		it('should handle checkboxes with various content after', () => {
			const content = `- [ ] Simple task
- [ ] Task with **bold** text
- [ ] Task with \`code\`
- [ ] Task with [link](url)
- [ ] Task with emoji 🎉`;
			expect(countUnfinishedTasks(content)).toBe(5);
		});

		it('should match checkbox followed by trailing space (.+ matches space)', () => {
			// The regex uses .+ which matches any character including space
			// But .+$ requires non-empty content at end of line - trailing space counts!
			const content = '- [ ] ';
			// Actually .+ in multiline mode requires at least one character
			// A trailing space IS a character, so this should match
			expect(countUnfinishedTasks(content)).toBe(1);
		});

		it('should match checkbox with single character content', () => {
			const content = '- [ ] x';
			expect(countUnfinishedTasks(content)).toBe(1);
		});

		it('should handle very long task descriptions', () => {
			const longDescription = 'a'.repeat(1000);
			const content = `- [ ] ${longDescription}`;
			expect(countUnfinishedTasks(content)).toBe(1);
		});
	});

	describe('line position requirements', () => {
		it('should handle checkboxes at start of lines only', () => {
			const content = `Some text - [ ] not a task
- [ ] Real task
Text - [ ] also not a task`;
			// The regex uses ^ with multiline flag, so only line-start checkboxes match
			expect(countUnfinishedTasks(content)).toBe(1);
		});

		it('should not match checkbox in middle of text', () => {
			const content = 'This is some text with - [ ] embedded checkbox';
			expect(countUnfinishedTasks(content)).toBe(0);
		});
	});

	describe('line ending handling', () => {
		it('should handle Windows line endings (CRLF)', () => {
			const content = '- [ ] Task one\r\n- [ ] Task two\r\n- [ ] Task three';
			expect(countUnfinishedTasks(content)).toBe(3);
		});

		it('should handle Unix line endings (LF)', () => {
			const content = '- [ ] Task one\n- [ ] Task two\n- [ ] Task three';
			expect(countUnfinishedTasks(content)).toBe(3);
		});

		it('should handle mixed line endings', () => {
			const content = '- [ ] Task one\r\n- [ ] Task two\n- [ ] Task three';
			expect(countUnfinishedTasks(content)).toBe(3);
		});

		it('should handle task at end of file without newline', () => {
			const content = '- [ ] Only task';
			expect(countUnfinishedTasks(content)).toBe(1);
		});
	});

	describe('special characters', () => {
		it('should handle tasks with special regex characters', () => {
			const content = `- [ ] Task with (parentheses)
- [ ] Task with [brackets]
- [ ] Task with {braces}
- [ ] Task with $dollar and ^caret`;
			expect(countUnfinishedTasks(content)).toBe(4);
		});

		it('should handle unicode content', () => {
			const content = `- [ ] タスク (Japanese)
- [ ] 任务 (Chinese)
- [ ] задача (Russian)`;
			expect(countUnfinishedTasks(content)).toBe(3);
		});
	});
});

// ============================================================================
// Tests for uncheckAllTasks
// ============================================================================

describe('uncheckAllTasks', () => {
	describe('empty and no-checkbox content', () => {
		it('should return empty string for empty input', () => {
			expect(uncheckAllTasks('')).toBe('');
		});

		it('should not modify content without checkboxes', () => {
			const content = `# My Document
Just some text here.`;
			expect(uncheckAllTasks(content)).toBe(content);
		});

		it('should not modify unchecked checkboxes', () => {
			const content = '- [ ] Unchecked task';
			expect(uncheckAllTasks(content)).toBe(content);
		});

		it('should preserve regular markdown formatting', () => {
			const content = `# Heading
Some **bold** and *italic* text.
- Regular item
1. Numbered item`;
			expect(uncheckAllTasks(content)).toBe(content);
		});
	});

	describe('checked task conversion', () => {
		it('should convert lowercase x checkbox to unchecked', () => {
			const content = '- [x] Completed task';
			expect(uncheckAllTasks(content)).toBe('- [ ] Completed task');
		});

		it('should convert uppercase X checkbox to unchecked', () => {
			const content = '- [X] Completed task';
			expect(uncheckAllTasks(content)).toBe('- [ ] Completed task');
		});

		it('should convert checkmark checkbox to unchecked', () => {
			const content = '- [✓] Completed task';
			expect(uncheckAllTasks(content)).toBe('- [ ] Completed task');
		});

		it('should convert heavy checkmark checkbox to unchecked', () => {
			const content = '- [✔] Completed task';
			expect(uncheckAllTasks(content)).toBe('- [ ] Completed task');
		});
	});

	describe('multiple task handling', () => {
		it('should handle multiple checked tasks', () => {
			const content = `- [x] Task one
- [X] Task two
- [✓] Task three
- [✔] Task four`;
			const expected = `- [ ] Task one
- [ ] Task two
- [ ] Task three
- [ ] Task four`;
			expect(uncheckAllTasks(content)).toBe(expected);
		});

		it('should preserve unchecked tasks while converting checked ones', () => {
			const content = `- [x] Completed
- [ ] Pending
- [X] Also completed
- [ ] Also pending`;
			const expected = `- [ ] Completed
- [ ] Pending
- [ ] Also completed
- [ ] Also pending`;
			expect(uncheckAllTasks(content)).toBe(expected);
		});

		it('should handle alternating checked/unchecked pattern', () => {
			const content = `- [x] Done
- [ ] Not done
- [x] Done
- [ ] Not done`;
			const expected = `- [ ] Done
- [ ] Not done
- [ ] Done
- [ ] Not done`;
			expect(uncheckAllTasks(content)).toBe(expected);
		});
	});

	describe('indentation preservation', () => {
		it('should preserve indentation', () => {
			const content = `- [x] Parent task
  - [x] Child task
    - [x] Grandchild task`;
			const expected = `- [ ] Parent task
  - [ ] Child task
    - [ ] Grandchild task`;
			expect(uncheckAllTasks(content)).toBe(expected);
		});

		it('should preserve deep indentation', () => {
			const content = `- [x] Level 0
    - [x] Level 1
        - [x] Level 2
            - [x] Level 3`;
			const expected = `- [ ] Level 0
    - [ ] Level 1
        - [ ] Level 2
            - [ ] Level 3`;
			expect(uncheckAllTasks(content)).toBe(expected);
		});

		it('should handle tabbed indentation', () => {
			const content = `\t- [x] Tabbed task
\t\t- [X] Double tabbed task`;
			const expected = `\t- [ ] Tabbed task
\t\t- [ ] Double tabbed task`;
			expect(uncheckAllTasks(content)).toBe(expected);
		});

		it('should preserve mixed indentation styles', () => {
			const content = `  - [x] Space indented
\t- [x] Tab indented`;
			const expected = `  - [ ] Space indented
\t- [ ] Tab indented`;
			expect(uncheckAllTasks(content)).toBe(expected);
		});
	});

	describe('content preservation', () => {
		it('should preserve other content around checkboxes', () => {
			const content = `# Tasks

## Phase 1
- [x] Setup project

## Phase 2
- [x] Write code

Some other text here.`;
			const expected = `# Tasks

## Phase 1
- [ ] Setup project

## Phase 2
- [ ] Write code

Some other text here.`;
			expect(uncheckAllTasks(content)).toBe(expected);
		});

		it('should preserve task descriptions', () => {
			const content = '- [x] This is a **very** important task with `code` and [links](url)';
			const expected = '- [ ] This is a **very** important task with `code` and [links](url)';
			expect(uncheckAllTasks(content)).toBe(expected);
		});

		it('should preserve emoji in task descriptions', () => {
			const content = '- [x] Task with emoji 🎉';
			const expected = '- [ ] Task with emoji 🎉';
			expect(uncheckAllTasks(content)).toBe(expected);
		});
	});

	describe('line ending handling', () => {
		it('should handle Windows line endings', () => {
			const content = '- [x] Task one\r\n- [x] Task two';
			const expected = '- [ ] Task one\r\n- [ ] Task two';
			expect(uncheckAllTasks(content)).toBe(expected);
		});

		it('should handle Unix line endings', () => {
			const content = '- [x] Task one\n- [x] Task two';
			const expected = '- [ ] Task one\n- [ ] Task two';
			expect(uncheckAllTasks(content)).toBe(expected);
		});

		it('should handle mixed line endings', () => {
			const content = '- [x] Task one\r\n- [x] Task two\n- [x] Task three';
			const expected = '- [ ] Task one\r\n- [ ] Task two\n- [ ] Task three';
			expect(uncheckAllTasks(content)).toBe(expected);
		});
	});

	describe('edge cases', () => {
		it('should handle single checked task', () => {
			const content = '- [x] Only task';
			const expected = '- [ ] Only task';
			expect(uncheckAllTasks(content)).toBe(expected);
		});

		it('should handle task at end of file without newline', () => {
			const content = '- [x] Last task';
			const expected = '- [ ] Last task';
			expect(uncheckAllTasks(content)).toBe(expected);
		});

		it('should handle inline patterns (regex matches at line start only)', () => {
			// The CHECKED_TASK_REGEX uses ^ anchor, so only line-start checkboxes are modified
			// But "- [x]" in middle of line starts with "- " so it CAN match
			// Actually: /^(\s*-\s*)\[[xX✓✔]\]/gm - the ^ in multiline mode matches start of line
			// "This text has [x]" - the "[x]" is not preceded by "- " so it won't match
			// "but - [x]" - this ALSO won't match because the line doesn't START with "-"
			const content = 'This text has [x] in the middle but - [x] also in middle';
			// Neither should be converted - neither is at line start
			expect(uncheckAllTasks(content)).toBe(content);
		});

		it('should handle unicode task descriptions', () => {
			const content = `- [x] タスク完了 (Japanese)
- [x] 任务完成 (Chinese)`;
			const expected = `- [ ] タスク完了 (Japanese)
- [ ] 任务完成 (Chinese)`;
			expect(uncheckAllTasks(content)).toBe(expected);
		});
	});

	describe('idempotency', () => {
		it('should be idempotent - running twice produces same result', () => {
			const content = `- [x] Task 1
- [X] Task 2
- [ ] Task 3`;
			const firstPass = uncheckAllTasks(content);
			const secondPass = uncheckAllTasks(firstPass);
			expect(firstPass).toBe(secondPass);
		});

		it('should not change already unchecked content', () => {
			const content = `- [ ] Task 1
- [ ] Task 2
- [ ] Task 3`;
			expect(uncheckAllTasks(content)).toBe(content);
		});
	});
});

// ============================================================================
// Integration: countUnfinishedTasks + uncheckAllTasks
// ============================================================================

describe('countUnfinishedTasks + uncheckAllTasks integration', () => {
	it('should count same number of tasks after unchecking', () => {
		const content = `- [x] Task 1
- [X] Task 2
- [✓] Task 3`;

		// Initially no unchecked tasks
		expect(countUnfinishedTasks(content)).toBe(0);

		// After unchecking, should have 3 unchecked tasks
		const unchecked = uncheckAllTasks(content);
		expect(countUnfinishedTasks(unchecked)).toBe(3);
	});

	it('should preserve count of already unchecked tasks', () => {
		const content = `- [x] Completed
- [ ] Pending 1
- [x] Also completed
- [ ] Pending 2`;

		const originalCount = countUnfinishedTasks(content);
		expect(originalCount).toBe(2);

		const unchecked = uncheckAllTasks(content);
		const newCount = countUnfinishedTasks(unchecked);
		expect(newCount).toBe(4);
	});

	it('should handle complex document', () => {
		const content = `# Project Status

## Phase 1 - Setup
- [x] Initialize repository
- [x] Configure CI/CD
- [ ] Write documentation

## Phase 2 - Development
- [x] Implement feature A
- [ ] Implement feature B
- [ ] Add tests

## Phase 3 - Launch
- [ ] Review code
- [ ] Deploy to staging
- [ ] Deploy to production`;

		// Check initial state
		const initialUnchecked = countUnfinishedTasks(content);
		expect(initialUnchecked).toBe(6);

		// After unchecking all
		const unchecked = uncheckAllTasks(content);
		const finalUnchecked = countUnfinishedTasks(unchecked);
		expect(finalUnchecked).toBe(9);
	});
});
