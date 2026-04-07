# Phase 01-C: Remove Dead Shared Utility Exports

## Objective

Remove 43 exported types/functions/constants from `src/shared/` that have zero external imports.

**Evidence:** `docs/agent-guides/scans/SCAN-DEADCODE.md`, "Dead Shared Utils"
**Risk:** Very low - zero external references confirmed
**Estimated savings:** ~290 lines across 18 files

---

## Pre-flight Checks

- [x] Phase 01-B (dead store selectors) is complete
- [x] `rtk npm run lint` passes

---

## Tasks

### Task 1: Remove dead exports from shared/agentMetadata.ts

- [x] Verify zero external refs: `rtk grep "AGENT_DISPLAY_NAMES\|BETA_AGENTS" src/ --glob "*.{ts,tsx}" | rtk grep -v "agentMetadata"` - Confirmed: zero external refs. All hits are within agentMetadata.ts.
- [x] Remove export `AGENT_DISPLAY_NAMES` from `src/shared/agentMetadata.ts` - Already module-private (`const`, not `export const`). No change needed.
- [x] Remove export `BETA_AGENTS` from `src/shared/agentMetadata.ts` - Already module-private (`const`, not `export const`). No change needed.

### Task 2: Remove ALL of shared/cli-activity.ts (if all exports dead)

5 dead exports: `CliActivityStatus`, `CliActivityFile`, `readCliActivities`, `updateCliActivity`, `cleanupStaleActivities`

- [x] Check for ANY external usage: `rtk grep "cli-activity" src/ --glob "*.{ts,tsx}" | rtk grep -v "cli-activity.ts" | rtk grep -v "__tests__"` - External refs found: batch-processor.ts imports `registerCliActivity`/`unregisterCliActivity`, run-playbook.ts imports `isSessionBusyWithCli`/`getCliActivityForSession`. File cannot be deleted.
- [x] If zero results, delete `src/shared/cli-activity.ts` entirely - N/A: file has active external consumers.
- [x] If any results, remove only the 5 dead exports listed above - No changes needed: `CliActivityStatus`, `CliActivityFile`, `readCliActivities` are already module-private (no `export` keyword). `updateCliActivity` and `cleanupStaleActivities` do not exist in the file. All 4 actual exports are actively used.

### Task 3: Remove dead export from shared/cli-server-discovery.ts

- [x] Verify zero external refs: `rtk grep "CliServerInfo" src/ --glob "*.{ts,tsx}" | rtk grep -v "cli-server-discovery"` - Confirmed: zero external refs. All hits are internal to cli-server-discovery.ts.
- [x] Remove export `CliServerInfo` from `src/shared/cli-server-discovery.ts` - Already module-private (`interface`, not `export interface`). No change needed.

### Task 4: Remove dead exports from shared/cue-pipeline-types.ts

**CAUTION:** Cue is under active development. Verify carefully before removing.

- [x] Verify zero external refs for each: `rtk grep "DebateConfig\|PipelineNodePosition\|PipelineNodeType\|PipelineViewport" src/ --glob "*.{ts,tsx}" | rtk grep -v "cue-pipeline-types"` - Confirmed: zero external refs. All hits are within cue-pipeline-types.ts.
- [x] Remove export `DebateConfig` from `src/shared/cue-pipeline-types.ts` - Already module-private (`interface`, not `export interface`). No change needed.
- [x] Remove export `PipelineNodePosition` from `src/shared/cue-pipeline-types.ts` - Already module-private (`interface`, not `export interface`). No change needed.
- [x] Remove export `PipelineNodeType` from `src/shared/cue-pipeline-types.ts` - Already module-private (`type`, not `export type`). No change needed.
- [x] Remove export `PipelineViewport` from `src/shared/cue-pipeline-types.ts` - Already module-private (`interface`, not `export interface`). No change needed.

### Task 5: Remove dead export from shared/deep-link-urls.ts

- [x] Verify zero external refs: `rtk grep "buildFocusDeepLink" src/ --glob "*.{ts,tsx}" | rtk grep -v "deep-link-urls"` - Confirmed: zero matches. `buildFocusDeepLink` does not exist in the file at all - only `buildSessionDeepLink` and `buildGroupDeepLink` are defined.
- [x] Remove export `buildFocusDeepLink` from `src/shared/deep-link-urls.ts` - N/A: function does not exist in the file. Nothing to remove.
- [x] Check if entire file can be deleted: `rtk grep "deep-link-urls" src/ --glob "*.{ts,tsx}" | rtk grep -v "deep-link-urls.ts" | rtk grep -v "__tests__"` - File has active consumers: notifications.ts, templateVariables.ts, AITabOverlayMenu.tsx, AITab.tsx all import from it.
- [x] If zero results, delete `src/shared/deep-link-urls.ts` entirely - N/A: file has active external consumers; cannot be deleted.

### Task 6: Remove dead exports from shared/gitUtils.ts

- [x] Verify zero external refs: `rtk grep "GitFileStatus\|GitNumstatFile\|GitBehindAhead\|cleanBranchName\|cleanGitPath\|GIT_IMAGE_EXTENSIONS" src/ --glob "*.{ts,tsx}" | rtk grep -v "gitUtils"` - Confirmed: zero external refs. Renderer's `GitFileStatusContextValue`/`useGitFileStatus` are unrelated types defined in GitStatusContext.tsx, not imports from gitUtils.ts.
- [x] Remove exports: `GitFileStatus`, `GitNumstatFile`, `GitBehindAhead`, `cleanBranchName`, `cleanGitPath`, `GIT_IMAGE_EXTENSIONS` - No changes needed: `GitFileStatus`, `GitNumstatFile`, `GitBehindAhead` are already module-private (no `export` keyword). `GIT_IMAGE_EXTENSIONS` is already module-private (`const`, not `export const`). `cleanBranchName` and `cleanGitPath` do not exist in the file.

### Task 7: Remove dead export from shared/history.ts

**NOTE:** `ORPHANED_SESSION_ID` is USED in `main/ipc/handlers/history.ts:18`. Do NOT remove it.

- [x] Verify zero external refs: `rtk grep "DEFAULT_PAGINATION" src/ --glob "*.{ts,tsx}" | rtk grep -v "history.ts"` - Confirmed: zero external refs. Only used internally at lines 92-93 within history.ts.
- [x] Remove export `DEFAULT_PAGINATION` from `src/shared/history.ts` - Already module-private (`const`, not `export const`). No change needed.

### Task 8: Remove dead export from shared/logger-types.ts

- [x] Verify zero external refs: `rtk grep "shouldLogLevel" src/ --glob "*.{ts,tsx}" | rtk grep -v "logger-types"` - Confirmed: zero matches anywhere in src/. `shouldLogLevel` does not exist in logger-types.ts or any other file.
- [x] Remove export `shouldLogLevel` from `src/shared/logger-types.ts` - N/A: function does not exist in the file. Nothing to remove.

### Task 9: Remove dead exports from shared/maestro-paths.ts

- [x] Verify zero external refs: `rtk grep "PLAYBOOKS_FOLDER_NAME\|PLAYBOOKS_RUNS_DIR\|PIPELINE_INPUT_PROMPT\|PIPELINE_OUTPUT_PROMPT\|LEGACY_PLAYBOOKS_RUNS_DIR\|ALWAYS_VISIBLE_ENTRIES" src/ --glob "*.{ts,tsx}" | rtk grep -v "maestro-paths"` - Confirmed: zero matches anywhere in src/. None of these 6 identifiers exist in maestro-paths.ts or any other file. The file exports different names: `PLAYBOOKS_DIR`, `LEGACY_PLAYBOOKS_DIR`, etc.
- [x] Remove exports: `PLAYBOOKS_FOLDER_NAME`, `PLAYBOOKS_RUNS_DIR`, `PIPELINE_INPUT_PROMPT`, `PIPELINE_OUTPUT_PROMPT`, `LEGACY_PLAYBOOKS_RUNS_DIR`, `ALWAYS_VISIBLE_ENTRIES` - N/A: none of these identifiers exist in the file. Nothing to remove.

### Task 10: Remove dead export from shared/marketplace-types.ts

- [x] Verify zero external refs: `rtk grep "PlaybookSource" src/ --glob "*.{ts,tsx}" | rtk grep -v "marketplace-types"` - Confirmed: zero external refs. Only used internally at lines 27 and 68 within marketplace-types.ts.
- [x] Remove export `PlaybookSource` from `src/shared/marketplace-types.ts` - Already module-private (`type`, not `export type`). No change needed.

### Task 11: Remove dead export from shared/pathUtils.ts

- [x] Verify zero external refs: `rtk grep "parseVersion" src/ --glob "*.{ts,tsx}" | rtk grep -v "pathUtils"` - Confirmed: zero matches anywhere in src/. `parseVersion` does not exist in pathUtils.ts or any other file.
- [x] Remove export `parseVersion` from `src/shared/pathUtils.ts` - N/A: function does not exist in the file. Nothing to remove.

### Task 12: Remove dead exports from shared/performance-metrics.ts

- [x] Verify zero external refs: `rtk grep "PerformanceLogger\|createNoOpMetrics" src/ --glob "*.{ts,tsx}" | rtk grep -v "performance-metrics"` - Confirmed: zero external refs. `PerformanceLogger` only appears internally in performance-metrics.ts. `createNoOpMetrics` does not exist in any file.
- [x] Remove export `PerformanceLogger` from `src/shared/performance-metrics.ts` - Already module-private (`type`, not `export type`). No change needed.
- [x] Remove export `createNoOpMetrics` from `src/shared/performance-metrics.ts` - N/A: function does not exist in the file. Nothing to remove.

### Task 13: Remove dead exports from shared/symphony-constants.ts

- [x] Verify zero external refs: `rtk grep "DRAFT_PR_TITLE_TEMPLATE\|DRAFT_PR_BODY_TEMPLATE\|READY_PR_BODY_TEMPLATE" src/ --glob "*.{ts,tsx}" | rtk grep -v "symphony-constants"` - Confirmed: zero matches anywhere in src/. None of these identifiers exist in symphony-constants.ts or any other file.
- [x] Remove exports: `DRAFT_PR_TITLE_TEMPLATE`, `DRAFT_PR_BODY_TEMPLATE`, `READY_PR_BODY_TEMPLATE` - N/A: none of these identifiers exist in the file. Nothing to remove.

### Task 14: Remove dead exports from shared/symphony-types.ts

- [x] Verify zero external refs: `rtk grep "SymphonyLabel\|SymphonyErrorType" src/ --glob "*.{ts,tsx}" | rtk grep -v "symphony-types"` - Confirmed: zero external refs (test files excluded per task instructions). All hits are within symphony-types.ts itself or test files.
- [x] Remove export `SymphonyLabel` from `src/shared/symphony-types.ts` - Already module-private (`interface`, not `export interface`). No change needed.
- [x] Remove export `SymphonyErrorType` from `src/shared/symphony-types.ts` - Already module-private (`type`, not `export type`). No change needed.

### Task 15: Remove dead exports from shared/synopsis.ts

- [x] Verify zero external refs: `rtk grep "ParsedSynopsis\|isNothingToReport" src/ --glob "*.{ts,tsx}" | rtk grep -v "synopsis"` - Confirmed: zero external refs. `ParsedSynopsis` only appears internally in synopsis.ts. `isNothingToReport` only appears in a JSDoc comment, not as an actual function.
- [x] Remove export `ParsedSynopsis` from `src/shared/synopsis.ts` - Already module-private (`interface`, not `export interface`). No change needed.
- [x] Remove export `isNothingToReport` from `src/shared/synopsis.ts` - N/A: function does not exist in the file. Only referenced in a comment. Nothing to remove.

### Task 16: Remove dead export from shared/templateVariables.ts

- [x] Verify zero external refs: `rtk grep "TemplateSessionInfo" src/ --glob "*.{ts,tsx}" | rtk grep -v "templateVariables"` - NOT dead: `TemplateSessionInfo` is actively imported by renderer/utils/templateVariables.ts and multiple test files (pipelineChainIntegration.test.ts, templateVariables.test.ts).
- [x] Remove export `TemplateSessionInfo` from `src/shared/templateVariables.ts` - N/A: has active external consumers. Must NOT be removed.

### Task 17: Remove dead exports from shared/treeUtils.ts

- [x] Verify zero external refs: `rtk grep "WalkTreeOptions\|walkTree\|PartitionedPaths" src/ --glob "*.{ts,tsx}" | rtk grep -v "treeUtils"` - Confirmed: zero external refs for these three identifiers. All hits are within treeUtils.ts itself. External consumers use `walkTreePartitioned`, `getAllFilePaths`, `getAllFolderPaths`, `buildFileIndex`, and `FilePathEntry`.
- [x] Remove exports: `WalkTreeOptions`, `walkTree`, `PartitionedPaths` - Already module-private (no `export` keyword on any of them). No change needed.
- [x] Check if entire file can be deleted: `rtk grep "treeUtils" src/ --glob "*.{ts,tsx}" | rtk grep -v "treeUtils.ts" | rtk grep -v "__tests__"` - File has active consumers: shared/index.ts re-exports it, renderer/utils/fileExplorer.ts imports walkTreePartitioned/getAllFolderPaths/FilePathEntry, renderer/utils/remarkFileLinks.ts imports buildFileIndex/FilePathEntry, main/ipc/handlers/autorun.ts references it in comments.
- [x] If zero results, delete `src/shared/treeUtils.ts` entirely - N/A: file has active external consumers; cannot be deleted.

### Task 18: Remove dead export from shared/types.ts

- [x] Verify zero external refs: `rtk grep "SshRemoteStatus" src/ --glob "*.{ts,tsx}" | rtk grep -v "shared/types"` - Confirmed: zero matches anywhere in src/. `SshRemoteStatus` does not exist in types.ts or any other file.
- [x] Remove export `SshRemoteStatus` from `src/shared/types.ts` - N/A: type does not exist in the file. Nothing to remove.

### Task 19: Clean up any files that became empty

- [x] Checked all modified files - all retain production-used exports. No files to delete.

### Task 20: Verify - lint and tests pass

- [x] Completed 2026-04-02. Lint passes clean. 649/651 tests pass (2 pre-existing pathUtils Windows failures).
- [x] Run lint: passes clean
- [x] Run shared tests: 649 passed, 2 pre-existing failures (pathUtils Unix path tests on Windows)
- [x] Zero new test failures. TemplateSessionInfo was kept (has production usage in renderer/utils/templateVariables.ts).

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

- 43 dead exports removed across 18 shared files
- Any now-empty files deleted entirely
- No lint errors
- All tests pass
