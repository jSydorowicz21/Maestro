# Phase 03-D: Consolidate createMockTab/createMockAITab Factories

## Objective

Replace 12 local `createMockTab`/`createMockAITab` factory definitions across test files with a shared factory.

**Evidence:** `docs/agent-guides/scans/SCAN-MOCKS.md`, "createMockAITab / createMockTab definitions"
**Risk:** Zero production risk - test-only changes
**Estimated savings:** ~80 lines

---

## Pre-flight Checks

- [x] Phase 03-C (window.maestro mocks) is complete
- [x] `CI=1 rtk vitest run` passes

**Completed 2026-04-02:** Consolidated 20 local `createMockTab`/`createMockAITab`/`createMockFileTab` factory definitions (more than the expected 12) into shared factories at `src/__tests__/helpers/mockTab.ts`.

Factory approach:

- Shared `createMockAITab(overrides)` accepts `Partial<AITab>` with sensible defaults
- Shared `createMockFileTab(overrides)` accepts `Partial<FilePreviewTab>` with sensible defaults
- 16 files migrated to use shared factory directly
- 3 files retain thin local wrappers for positional-arg signatures (useMergeSession, useSendToAgent, MergeSessionModal)
- 1 file (broadcastService.test.ts) correctly excluded - uses `AITabData` type, not `AITab`
- 2 files (useWizardHandlers, useTabExportHandlers) required default adjustments: old local factories had non-null `agentSessionId` and non-empty `logs` that the handler code depends on

Files created:

- `src/__tests__/helpers/mockTab.ts` - shared factory (createMockAITab, createMockFileTab)
- Updated `src/__tests__/helpers/index.ts` - barrel export

Verification: `tsc --noEmit` passes for tsconfig.lint.json. 959 tests pass across all 19 migrated files. Zero new failures.

---

## Tasks

### Task 1: Find all definitions

- [x] Find all tab factory definitions: `rtk grep "function createMockTab\|function createMockAITab\|const createMockTab\|const createMockAITab" src/__tests__/ --glob "*.{ts,tsx}"`
- [x] List all 12 files with local definitions

### Task 2: Read the AITab and Tab type definitions

- [x] Find AITab type: `rtk grep "interface AITab\|type AITab " src/ --glob "*.ts" | rtk grep -v "__tests__"`
- [x] Find FilePreviewTab type: `rtk grep "interface FilePreviewTab\|type FilePreviewTab " src/ --glob "*.ts" | rtk grep -v "__tests__"`
- [x] Read both type definitions and list all required fields

### Task 3: Create shared mockTab.ts

- [x] Create `src/__tests__/helpers/mockTab.ts`
- [x] Implement `createMockAITab(overrides: Partial<AITab> = {}): AITab` with sensible defaults for ALL required fields
- [x] Implement `createMockFileTab(overrides: Partial<FilePreviewTab> = {}): FilePreviewTab` with sensible defaults
- [x] Verify types: `rtk tsc -p tsconfig.lint.json --noEmit`

### Task 4: Export from helpers/index.ts

- [x] Add to `src/__tests__/helpers/index.ts`: `export { createMockAITab, createMockFileTab } from './mockTab';`

### Task 5: Migrate all 12 definitions

For each of the 12 files:

- [x] Remove the local factory function
- [x] Add import from `../helpers/mockTab` (adjust relative path)
- [x] Adjust any unique override patterns to work with the new signature
- [x] Run file-level test: `CI=1 rtk vitest run path/to/file.test.ts`

### Task 6: Final verification

- [x] Run all tests: `CI=1 rtk vitest run`
- [x] Confirm zero new test failures

### Task 7: Verify cleanup

- [x] Check for orphans: `rtk grep "function createMockTab\|function createMockAITab\|const createMockTab\|const createMockAITab" src/__tests__/ --glob "*.{ts,tsx}" | rtk grep -v "helpers/"`
- [x] Result should be 0

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

- Shared tab factories in `src/__tests__/helpers/mockTab.ts`
- 12 local definitions removed
- All tests pass
