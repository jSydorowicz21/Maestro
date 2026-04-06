# Phase 11-B: Add Sentry to Catch Blocks Missing Error Reporting

## Objective

Audit 252 catch blocks that use `console.error` without `captureException`/`captureMessage` and add Sentry reporting where errors are unexpected (not recoverable/expected failures).

**Evidence:** `docs/agent-guides/scans/SCAN-PATTERNS.md`, "try-catch with console.error only"
**Risk:** Low - adding error reporting doesn't change behavior
**Estimated savings:** Improved production error visibility

---

## Pre-flight Checks

- [x] Phase 11-A (console.log migration) is complete
  - All 7 tasks in 11A are checked off. Group chat files, high-frequency files, and full build verified.
- [x] `rtk npm run lint` passes
  - Lint passes cleanly.

---

## Important Context

From CLAUDE.md:

- **DO let exceptions bubble up** when they represent unexpected failures
- **DO handle expected/recoverable errors explicitly** (network errors, file not found, etc.)
- **DO use Sentry utilities** for explicit reporting

Sentry imports:

- Main process: `import { captureException, captureMessage } from '../utils/sentry';`
- Renderer: `import { captureException } from '../components/ErrorBoundary';` (or similar)

---

## Tasks

### 1. Prioritize catch blocks by risk category

- [x] Categorize as MUST add Sentry (unexpected failures): main process IPC handlers, data persistence/storage, agent spawn failures, session state corruption
  - 19 files identified across 5 priority tiers (P1-P5): 2 main process, 3 stores, 10 hooks, 2 services/utils, 2 components
- [x] Categorize as SKIP Sentry (expected/recoverable): network timeouts, file not found, parse errors on user input, git operations on non-git directories
  - ~80+ files categorized as SKIP: CLI (17 files, user-facing), UI components (~40), hooks (~20), services/utils (7), main process (3)
- [x] Create a list of files grouped by priority
  - Full prioritized list: `auto-runs/Working/sentry-catch-block-priority-list.md`
  - 47 files already have Sentry coverage

### 2. Audit main process files (highest priority)

- [x] Run: `rtk grep "catch" src/main/ --glob "*.ts" -A 2` (filter for `console.error` without `captureException`)
  - Audited all catch blocks across src/main/. Found 7 catch blocks with console.error and no Sentry across 5 files.
- [x] For each catch block: read the try block to understand what can fail
  - Analyzed each try block to determine if errors are unexpected or expected/recoverable.
- [x] If error is unexpected: add `captureException(error, { operation: 'operationName', context })` after the `console.error`
  - Added captureException to 2 P1 files:
    - `src/main/ipc/handlers/context.ts:441` - IPC handler registration failure (operation: registerSendGroomingPromptHandler)
    - `src/main/cue/cue-file-watcher.ts:72` - File watcher error (operation: cueFileWatcher, with triggerName and watchGlob context)
- [x] If error is expected: add a comment explaining why Sentry is skipped (e.g., `// Expected: file may not exist yet on first run`)
  - Added skip comments to 3 SKIP files:
    - `src/main/ipc/handlers/system.ts` - Font detection fallback (fc-list may not be installed)
    - `src/main/utils/logger.ts` - 5 catch blocks, all circular dependency risk with Sentry
    - `src/main/stores/utils.ts` - Input validation for user-provided paths
- [x] Run targeted tests: `CI=1 rtk vitest run` (filter for main process tests)
  - 214 tests pass, 0 failures (cue-file-watcher, logger, system, stores/utils, context)

### 3. Audit CLI files (14 files)

- [x] Add Sentry only for internal/system errors, NOT for user input validation failures
  - **Result: No changes needed.** All 17 CLI files are SKIP - Sentry is not initialized in the CLI context (CLI runs as a standalone commander process, not within the Electron app where Sentry is configured). All catch blocks handle user-facing errors: wrong args, disconnected app, file I/O failures, non-JSON parse, network timeouts. No internal/system errors warrant Sentry reporting.
- [x] Run targeted tests after changes
  - No CLI-specific test files exist. Full test suite baseline: 23,659 pass, 55 pre-existing failures (none CLI-related). Zero regressions from this audit.

### 4. Audit renderer components (40+ files)

- [x] For API call catch blocks: add Sentry for unexpected failures
  - Added `captureException` to 2 P5 infrastructure components:
    - `src/renderer/components/ProcessMonitor.tsx` - 2 catch blocks (fetchActiveProcesses, killProcess)
    - `src/renderer/components/SymphonyModal.tsx` - 3 catch blocks (fetchDocumentPreview, syncContribution, checkPRStatuses)
- [x] For DOM operation catch blocks: usually expected, skip Sentry but add comment
  - Added `// Expected: <reason>` skip comments to ~37 SKIP component files (~72 catch blocks total)
  - Categories: wizard screens, modal dialogs, data display, visual, settings UI, group chat, notifications
- [x] For data parsing catch blocks: add Sentry if data comes from our systems, skip if user input
  - Data parsing blocks (graphDataBuilder, phaseGenerator, MermaidRenderer) all handle user/external input - marked as SKIP with comments
- [x] Run targeted tests after each batch
  - 23,659 tests pass, 55 pre-existing failures (identical to baseline). Zero regressions. Lint passes.

### 5. Audit renderer hooks (24 files)

- [x] Focus on hooks that call IPC or external services
  - Audited all 41 hook files with `console.error`. Categorized into P3 (10 hooks needing Sentry) and SKIP (~28 hooks with expected failures).
- [x] Add Sentry for unexpected IPC failures
  - Added `captureException` to 10 P3 hooks (27 catch blocks total):
    - `useAgentExecution.ts` - 4 catch blocks (agent spawn, background synopsis)
    - `useAgentListeners.ts` - 8 catch blocks (data routing, exit verification, synopsis, session origin, SSH git)
    - `useAgentSessionManagement.ts` - 1 catch block (session resume)
    - `useQueueProcessing.ts` - 1 catch block (queue item processing)
    - `useInterruptHandler.ts` - 4 catch blocks (interrupt, kill, queue processing)
    - `useSessionRestoration.ts` - 5 catch blocks (agent validation, data corruption, restore, load)
    - `useSessionCrud.ts` - 2 catch blocks (agent lookup, session creation) + 4 skip comments (cleanup kills)
    - `useBatchProcessor.ts` - 4 catch blocks (debounce, working copy, task processing) + 2 skip comments (audio, kill)
    - `useDocumentProcessor.ts` - 1 catch block (session origin registration)
    - `useAppHandlers.ts` - 1 catch block (file read)
  - Added `// Expected:` skip comments to ~28 SKIP hook files (~75 catch blocks total):
    - Remote/SSH: useRemoteIntegration, useSshRemotes, useLiveMode, useLiveOverlay, useCliActivityMonitoring
    - Git/Worktree: useWorktreeHandlers, useWorktreeValidation
    - Agent detection: useAvailableAgents, useAgentCapabilities, useAgentConfiguration
    - Batch/Playbook: useAutoRunMarkdown, useAutoRunContentSync, usePlaybookManagement, useMarketplace, useInlineWizard
    - Summarization: useSummarizeAndContinue
    - UI: useTabHandlers, useSessionPagination, useSessionViewer, useInputProcessing, useTabExportHandlers
    - Stats: useStats, useContributorStats
    - Wizard: useWizardHandlers
    - Symphony: useSymphony, useSymphonyContribution
    - Cue: useCueAutoDiscovery
    - Init: useAppInitialization (4 skip comments)
- [x] Run targeted tests after changes
  - 225 tests pass across 7 modified hook test files (0 regressions). useBatchProcessor: 23 pre-existing failures (unrelated to sentry changes). Lint passes cleanly.

### 6. Audit renderer services/stores/utils (14 files)

- [ ] These handle data flow and are often most critical
- [ ] Add Sentry for unexpected data pipeline failures
- [ ] Run targeted tests after changes

### 7. Verify full build

- [ ] Run lint: `rtk npm run lint`
- [ ] Run tests: `CI=1 rtk vitest run`
- [ ] Verify types: `rtk tsc -p tsconfig.main.json --noEmit && rtk tsc -p tsconfig.lint.json --noEmit`

### 8. Count improvement

- [ ] Count files with `console.error` but no Sentry: `rtk grep "console.error" src/ --glob "*.{ts,tsx}"` and cross-check against `rtk grep "captureException|captureMessage" src/ --glob "*.{ts,tsx}"`
- [ ] Target: fewer than 30 remaining (expected-error-only files)

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

- High-priority catch blocks (main process, data persistence) have Sentry reporting
- Expected/recoverable errors are documented with comments
- No behavioral changes
- Lint and tests pass
