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

- [ ] For API call catch blocks: add Sentry for unexpected failures
- [ ] For DOM operation catch blocks: usually expected, skip Sentry but add comment
- [ ] For data parsing catch blocks: add Sentry if data comes from our systems, skip if user input
- [ ] Run targeted tests after each batch

### 5. Audit renderer hooks (24 files)

- [ ] Focus on hooks that call IPC or external services
- [ ] Add Sentry for unexpected IPC failures
- [ ] Run targeted tests after changes

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
