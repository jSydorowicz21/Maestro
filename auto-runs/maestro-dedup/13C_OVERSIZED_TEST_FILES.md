# Phase 13-C: Split Oversized Test Files

## Objective

Address 28 test files exceeding 2,000 lines. Many will shrink naturally after Phase 03 (mock consolidation). Focus on the worst offenders that remain oversized.

**Evidence:** `docs/agent-guides/scans/SCAN-OVERSIZED.md`, "Test Files Over 2000 Lines"
**Risk:** Zero production risk - test-only changes
**Estimated savings:** Improved test maintainability

---

## Pre-flight Checks

- [x] Phase 13-B (other oversized files) is complete
- [x] Phase 03 (mock consolidation) is complete
- [x] `CI=1 rtk vitest run` passes (baseline: 24,573 passed, 42 pre-existing failures, 107 pending)

---

## Tasks

### 1. Re-measure after mock consolidation

- [x] Run: `find src/__tests__/ -name "*.test.*" | xargs wc -l | sort -rn | head -30`
- [x] Only target files still over 2,000 lines
- [x] Document which files still need splitting

**Measurement (2026-04-06):** 30 test files over 2,000 lines. Top 3 targets:

- `symphony.test.ts` - 6,208 lines
- `useBatchProcessor.test.ts` - 5,988 lines
- `TabBar.test.tsx` - 5,757 lines

Other notable files (4,000+ lines): `git.test.ts` (4,469), `AutoRun.test.tsx` (3,536), `MainPanel.test.tsx` (3,474)

### 2. Split symphony.test.ts (was 6,208 lines)

- [x] Read the test file to identify logical test groups
- [x] Extract creation flow tests into `symphony.create.test.ts`
- [x] Extract participant management tests into `symphony.participants.test.ts`
- [x] No message handling tests found - file has no distinct message section (skipped `symphony.messages.test.ts`)
- [x] Extract export/history tests into `symphony.export.test.ts`
- [x] Ensure shared setup/mocks are imported from a common file
- [x] Run: `CI=1 rtk vitest run` (filter for symphony test files)

**Result:** Split 6,208-line file into 4 focused modules + shared setup:

- `symphony.test.ts` - 1,684 lines (validation, helpers, cache, state)
- `symphony.create.test.ts` - 1,600 lines (start, registerActive, cloneRepo, startContribution)
- `symphony.participants.test.ts` - 1,658 lines (updateStatus, complete, cancel, checkPRStatuses, syncContribution)
- `symphony.export.test.ts` - 1,526 lines (createDraftPR, fetchDocumentContent, git helpers, manualCredit, labels)
- `symphony.setup.ts` - 80 lines (shared test context factory)
  All 178 symphony tests pass (0 failures).

### 3. Split useBatchProcessor.test.ts (was 5,988 lines)

- [x] Read the test file to identify logical test groups
- [x] Extract lifecycle tests into `useBatchProcessor.lifecycle.test.ts`
- [x] Extract execution tests into `useBatchProcessor.execution.test.ts`
- [x] Extract worktree tests into `useBatchProcessor.worktree.test.ts`
- [x] Extract error handling tests into `useBatchProcessor.errors.test.ts`
- [x] Run: `CI=1 rtk vitest run` (filter for batch processor test files)

**Result:** Split 5,988-line file into 5 focused modules + shared setup:

- `useBatchProcessor.test.ts` - 572 lines (pure functions and hook behavior)
- `useBatchProcessor.lifecycle.test.ts` - 1,675 lines (initialization, state sync, prompts, audio, session management)
- `useBatchProcessor.execution.test.ts` - 1,034 lines (start/stop, document reading, template substitution, loop mode)
- `useBatchProcessor.worktree.test.ts` - 2,117 lines (worktree setup, checkout, PR creation, SSH remote)
- `useBatchProcessor.errors.test.ts` - 776 lines (task errors, pause/resume, skip-document, abort cleanup)
- `useBatchProcessor.setup.ts` - 157 lines (shared test context factory)
  All 161 batch processor tests pass (0 failures).

### 4. Split TabBar.test.tsx (was 5,757 lines)

- [x] Read the test file to identify logical test groups
- [x] Extract AI tab tests into `TabBar.aiTabs.test.tsx`
- [x] Extract file tab tests into `TabBar.fileTabs.test.tsx`
- [x] Extract drag-and-drop tests into `TabBar.dragDrop.test.tsx`
- [x] No distinct keyboard navigation section found - keyboard shortcuts are tested inline within tab indicators and other sections (skipped `TabBar.keyboard.test.tsx`)
- [x] Run: `CI=1 rtk vitest run` (filter for TabBar test files)

**Result:** Split 5,757-line file into 4 focused modules + shared setup:

- `TabBar.test.tsx` - 1,580 lines (rendering, display names, selection, close, new tab, indicators, unread filter, tab search, AI-only DnD, separators, scroll, styling, edge cases, overflow)
- `TabBar.aiTabs.test.tsx` - 2,131 lines (hover overlay, tab move operations, Send to Agent, Publish as GitHub Gist)
- `TabBar.fileTabs.test.tsx` - 2,163 lines (FileTab overlay menu, content/SSH support, extension badge styling, colorblind mode, performance)
- `TabBar.dragDrop.test.tsx` - 849 lines (unified tabs DnD, active tab styling consistency)
- `TabBar.setup.ts` - 62 lines (shared theme, createTab, createFileTab helpers)
  All 180 TabBar tests pass (0 failures).

### 5. Create shared test utilities if patterns emerge

- [ ] During splitting, identify common test setup/render patterns
- [ ] If common render setup exists: extract to `src/__tests__/helpers/renderWithProviders.ts`
- [ ] If common assertions exist: extract to `src/__tests__/helpers/testUtils.ts`
- [ ] Update split test files to import from shared utilities

### 6. Verify all tests pass after splitting

- [ ] Run full test suite: `CI=1 rtk vitest run`
- [ ] Run lint: `rtk npm run lint`
- [ ] Verify types: `rtk tsc -p tsconfig.main.json --noEmit && rtk tsc -p tsconfig.lint.json --noEmit`

### 7. Count remaining oversized test files

- [ ] Run: `find src/__tests__/ -name "*.test.*" | xargs wc -l | awk '$1 > 2000' | wc -l`
- [ ] Target: fewer than 10 files over 2,000 lines

---

## Verification

After completing changes, run targeted tests for the files you modified:

```bash
CI=1 rtk vitest run <path-to-relevant-test-files>
```

**Rule: Zero new test failures from your changes.** Pre-existing failures on the baseline are acceptable.

Find related test files:

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

- Worst offender test files split into focused modules
- Shared test utilities extracted where applicable
- All tests pass
- Fewer than 10 test files over 2,000 lines
