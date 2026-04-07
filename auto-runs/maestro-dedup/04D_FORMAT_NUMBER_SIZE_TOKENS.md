# Phase 04-D: Consolidate formatNumber, formatFileSize, estimateTokens, stripAnsi, generateId

## Objective

Consolidate the remaining formatter/utility duplications:

- 5 redundant `formatNumber` definitions (canonical at `shared/formatters.ts:41`)
- 2 redundant `formatFileSize` definitions (canonical `formatSize` at `shared/formatters.ts:27`)
- 4 redundant `estimateTokens` definitions (canonical at `shared/formatters.ts:176`)
- 2 `stripAnsi` definitions (canonical at `shared/stringUtils.ts:36`)
- 5 redundant `generateId`/`generateUUID` definitions (canonical at `shared/uuid.ts:10`)

**Evidence:** `docs/agent-guides/scans/SCAN-FORMATTERS.md`
**Risk:** Low - pure utility functions
**Estimated savings:** ~155 lines total

---

## Pre-flight Checks

- [x] Phase 04-C (formatTimestamp) is complete
- [x] `rtk npm run lint` passes

---

## Tasks

### Task 1: Consolidate formatNumber (5 definitions)

Canonical: `src/shared/formatters.ts:41` - `formatNumber`

- [x] Remove local `formatNumber` from `symphony.ts:928`, add import from `shared/formatters`
  - Note: SKIPPED. The `symphony.ts` `formatNumber` is `(n) => n.toLocaleString('en-US')` (comma-separated display), NOT the K/M suffix formatter. This is a different function, not a duplicate.
- [x] Remove local `formatNumber` from `AgentComparisonChart.tsx:93`, add import from `shared/formatters`
- [x] Remove local `formatNumber` from `AutoRunStats.tsx:70`, add import from `shared/formatters`
- [x] Remove local `formatNumber` from `LocationDistributionChart.tsx:40`, add import from `shared/formatters`
- [x] Remove local `formatNumber` from `SourceDistributionChart.tsx:62`, add import from `shared/formatters`
- [x] Remove local `formatNumber` from `SummaryCards.tsx:72`, add import from `shared/formatters`
  - Note: Updated canonical `formatNumber` to use uppercase `K` and `toString()` for small numbers to match all 5 consumer expectations. Updated shared formatters test accordingly.
- [x] Run related tests: `CI=1 rtk vitest run src/__tests__/renderer/components/UsageDashboard/`

### Task 2: Consolidate formatFileSize (2 definitions)

Canonical: `src/shared/formatters.ts:27` - `formatSize`

- [x] Read local `formatFileSize` in `FilePreview.tsx:265` and confirm it matches canonical `formatSize`
  - Note: Actually in `filePreviewUtils.ts:149`, imported by FilePreview.tsx and FilePreviewHeader.tsx
- [x] Read local `formatFileSize` in `documentStats.ts:92` and confirm it matches canonical `formatSize`
- [x] Rename call sites from `formatFileSize` to `formatSize` (preferred since only 2 sites)
  - Note: Used re-export approach for backwards compat: both files re-export `formatSize as formatFileSize`
- [x] Replace with import: `import { formatSize } from '../../shared/formatters';` (adjust path)

### Task 3: Consolidate estimateTokens (4 redundant + 2 canonical)

- [x] Decide canonical source: prefer `shared/formatters.ts:176` (accessible from both main and renderer)
- [x] Compare `renderer/utils/tokenCounter.ts:55` with `shared/formatters.ts:176` for extra logic
  - Note: Identical logic (Math.ceil(text.length / 4)). tokenCounter.ts now re-exports from shared.
- [x] If tokenCounter has extra logic, move it to `shared/formatters.ts` and re-export from tokenCounter
- [x] Remove local copy from `MergeSessionModal.tsx`, add import from `shared/formatters`
  - Note: Local versions operated on `{ text: string }[]` arrays. Added `estimateTokensFromLogs` to shared/formatters.ts.
- [x] Remove local copy from `SendToAgentModal.tsx`, add import from `shared/formatters`
- [x] Remove local copy from `useMergeSession.ts`, add import from `shared/formatters`
- [x] Remove local copy from `useSendToAgent.ts`, add import from `shared/formatters`

### Task 4: Consolidate stripAnsi (2 definitions)

Canonical: `shared/stringUtils.ts:36` - `stripAnsiCodes`

- [x] Find all importers of `main/utils/stripAnsi.ts`: `rtk grep "stripAnsi" src/ --glob "*.{ts,tsx}" | rtk grep "import"`
  - Note: Only 1 consumer: `main/ipc/handlers/agents.ts`
- [x] Update each importer to use `import { stripAnsiCodes } from '../../shared/stringUtils';` (adjust path)
  - Note: Used re-export approach: `main/utils/stripAnsi.ts` now re-exports from shared, keeping existing imports working.
- [x] Either delete `main/utils/stripAnsi.ts` entirely, or replace with re-export: `export { stripAnsiCodes as stripAnsi } from '../../shared/stringUtils';`

### Task 5: Consolidate generateId/generateUUID (5 redundant)

Canonical: `shared/uuid.ts:10` (main process) and `renderer/utils/ids.ts:2` (renderer)

- [x] Remove local `generateId`/`generateUUID` from `main/stats/utils.ts:29`, import from `shared/uuid.ts`
  - Note: Re-exported as `generateId = generateUUID` for backwards compat with existing importers.
- [x] Remove local from `useBatchedSessionUpdates.ts:99`, import from `renderer/utils/ids.ts`
- [x] Remove local from `useLayerStack.ts:35`, import from `renderer/utils/ids.ts`
- [x] Remove local from `useCommandHistory.ts:67`, import from `renderer/utils/ids.ts`
  - Note: Used `shared/uuid.ts` instead of `renderer/utils/ids.ts` since web hooks shouldn't cross-import from renderer.
- [x] Remove local from `useOfflineQueue.ts:107`, import from `renderer/utils/ids.ts`
  - Note: Used `shared/uuid.ts` instead of `renderer/utils/ids.ts` since web hooks shouldn't cross-import from renderer.

### Task 6: Verify

- [x] Run lint: `rtk npm run lint`
- [x] Run related tests: `CI=1 rtk vitest run src/__tests__/shared/ src/__tests__/renderer/`
- [x] Confirm zero new test failures
  - Note: 3 pre-existing failures (2 PATH-related shared tests, 1 formatElapsedTime(0) returning '0ms' vs test expecting '0s'). None caused by this phase.

### Task 7: Final cleanup check

- [x] Check formatNumber: `rtk grep "function formatNumber\b" src/ --glob "*.{ts,tsx}" | rtk grep -v "shared/formatters" | rtk grep -v "__tests__"` (expect 0)
- [x] Check formatFileSize: `rtk grep "function formatFileSize\|function formatSize\b" src/ --glob "*.{ts,tsx}" | rtk grep -v "shared/formatters" | rtk grep -v "__tests__"` (expect 0)
- [x] Check estimateTokens: `rtk grep "function estimateToken" src/ --glob "*.{ts,tsx}" | rtk grep -v "shared/formatters" | rtk grep -v "tokenCounter" | rtk grep -v "__tests__"` (expect 0)
  - Note: `contextExtractor.ts:estimateTokenCount(context: ContextSource)` has a different signature (takes ContextSource, not string) - not a duplicate.
- [x] Check stripAnsi: `rtk grep "function stripAnsi" src/ --glob "*.{ts,tsx}" | rtk grep -v "shared/stringUtils" | rtk grep -v "__tests__"` (expect 0)
- [x] Check generateId: `rtk grep "function generateId\|function generateUUID" src/ --glob "*.{ts,tsx}" | rtk grep -v "shared/uuid" | rtk grep -v "renderer/utils/ids" | rtk grep -v "__tests__"` (expect 0)

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

- All formatter/utility duplications consolidated to canonical sources
- ~155 lines removed
- Re-exports added where needed for backwards compatibility
- Lint and tests pass
