# Phase 01-A: Delete Dead Component Files

## Objective

Remove 7 component files that have ZERO production imports. These files are completely unreferenced in the codebase and can be safely deleted.

**Evidence:** `docs/agent-guides/scans/SCAN-DEADCODE.md`, "Dead Component Files"
**Risk:** None - zero production imports confirmed 2026-04-01
**Estimated savings:** ~7 files deleted entirely

---

## Pre-flight Checks

- [x] Completed 2026-04-02. `npm run lint` passes clean. `vitest run` shows 602 test files passed (24003 tests passed), 9 pre-existing failures (26 tests) all unrelated to dead component deletions - they are Windows path handling issues in cue-yaml-loader, pathUtils, messageHandlers, agents discovery, and SessionList rendering tests.
- [x] Baseline confirmed 2026-04-02. No test failures related to the 7 deleted component files or their 3 deleted test files.

---

## Tasks

### Task 1: Verify each component has zero production imports

- [x] Completed 2026-04-02. All 7 components verified to have zero production imports.
- [x] Verify `AgentSessionsModal` - only `AgentSessionsModalData` interface in modalStore.ts (type, not component import)
- [x] Verify `GitWorktreeSection` - only a comment in BatchRunnerModal.test.tsx
- [x] Verify `GroupChatParticipants` - only a JSDoc comment in GroupChatRightPanel.tsx
- [x] Verify `MergeProgressModal` - only a JSDoc comment in TransferProgressModal.tsx
- [x] Verify `ShortcutEditor` - zero production refs (test file also deleted)
- [x] Verify `SummarizeProgressModal` - zero references anywhere
- [x] Verify `ThemePicker` - only `handleThemePickerKeyDown` name and aria-label in ThemeTab.tsx (not imports)

### Task 2: Delete the 7 dead component files

- [x] Completed 2026-04-02. All 7 files deleted.
- [x] Delete `src/renderer/components/AgentSessionsModal.tsx`
- [x] Delete `src/renderer/components/GitWorktreeSection.tsx`
- [x] Delete `src/renderer/components/GroupChatParticipants.tsx`
- [x] Delete `src/renderer/components/MergeProgressModal.tsx`
- [x] Delete `src/renderer/components/ShortcutEditor.tsx`
- [x] Delete `src/renderer/components/SummarizeProgressModal.tsx`
- [x] Delete `src/renderer/components/ThemePicker.tsx`

### Task 3: Delete associated test files (if they exist)

- [x] Completed 2026-04-02. 3 test files found and deleted. No test files exist for the other 4 components.
- [x] Check for test files - found 3: AgentSessionsModal, ShortcutEditor, ThemePicker
- [x] Delete `src/__tests__/renderer/components/AgentSessionsModal.test.tsx`
- [x] Delete `src/__tests__/renderer/components/ShortcutEditor.test.tsx`
- [x] Delete `src/__tests__/renderer/components/ThemePicker.test.tsx`
- [x] Checked remaining 4 components - no test files exist

### Task 4: Check for stale imports in barrel files

- [x] Completed 2026-04-02. No stale re-exports found in any index files.
- [x] Search for stale re-exports - none found
- [x] No stale re-exports to remove

### Task 5: Verify - lint and tests pass

- [x] Run lint: `rtk npm run lint` - passed clean
- [x] Run lint:eslint: `rtk npm run lint:eslint` - passed clean
- [x] Run targeted tests: BatchRunnerModal.test.tsx (104 passed), TransferProgressModal.test.tsx (27 passed) - zero new failures. Pre-existing failures in cue/path/SSH tests are unrelated.

---

## Verification

After completing changes, run targeted tests for the files you modified:

```bash
CI=1 rtk vitest run <path-to-relevant-test-files>
```

**Rule: Zero new test failures from your changes.** Pre-existing failures on the baseline are acceptable. If a test you didn't touch starts failing, investigate whether your refactoring broke it. If your change removed code that a test depended on, update that test.

Do NOT run the full test suite (it takes too long). Only run tests relevant to the files you changed. Use `rtk grep` to find related test files:

```bash
rtk grep "import.*from.*<module-you-changed>" --glob "*.test.*"
```

Also verify types:

```bash
rtk tsc -p tsconfig.main.json --noEmit
rtk tsc -p tsconfig.lint.json --noEmit
```

---

## Success Criteria

- 7 component files deleted
- Associated test files deleted
- No lint errors
- All tests pass
- Zero references to deleted components remain in production code
