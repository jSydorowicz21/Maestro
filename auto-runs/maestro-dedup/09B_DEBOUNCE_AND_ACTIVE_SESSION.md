# Phase 09-B: Consolidate Debounce/Throttle and activeSession Re-derivation

## Objective

1. Migrate 15+ files with inline debounce/throttle to use existing shared hooks
2. Consolidate 28 files that re-derive `activeSession` from the store

**Evidence:** `docs/agent-guides/scans/SCAN-HOOKS.md`
**Risk:** Low - using existing hooks
**Estimated savings:** ~150 lines

---

## Pre-flight Checks

- [x] Phase 09-A (focus and event hooks) is complete
- [x] `rtk npm run lint` passes

---

## Tasks

### Part 1: Debounce/Throttle Consolidation

### 1. Identify existing shared hooks

- [x] Run: `rtk grep "useDebounce|useThrottle|useDebouncedPersistence|useSessionDebounce" src/renderer/hooks/ --glob "*.ts"`
- [x] Read each hook to understand its API and parameters

**Shared Hook APIs (2026-04-06):**
- **`useDebouncedValue<T>(value: T, delay: number): T`** - in `hooks/utils/useThrottle.ts` - Debounces a reactive value
- **`useThrottledCallback<T>(callback: T, delay: number): T`** - in `hooks/utils/useThrottle.ts` - Leading-edge throttled callback
- **`useDebouncedCallback<T>(callback: T, delay: number): { debouncedCallback: T, flush, cancel }`** - in `hooks/utils/useThrottle.ts` - Trailing-edge debounced callback with flush/cancel
- **`useDebouncedPersistence(sessions, initialLoadComplete, delay): { isPending, flushNow }`** - in `hooks/utils/useDebouncedPersistence.ts` - Specialized session persistence debounce
- **`useSessionDebounce<T>(options: { delayMs, onUpdate }): { scheduleUpdate, cancelUpdate, flushUpdate, isMounted }`** - in `hooks/batch/useSessionDebounce.ts` - Per-session-ID keyed debounce with composable updaters
- All re-exported from `hooks/utils/index.ts` (except useSessionDebounce, which is in `hooks/batch/index.ts`)

### 2. Find inline debounce/throttle implementations

- [x] Run: `rtk grep "setTimeout|debounce|throttle" src/renderer/ --glob "*.{ts,tsx}"` (exclude `__tests__`, `node_modules`, `hooks/utils`)
- [x] Filter for files implementing their own debounce/throttle rather than importing shared hooks
- [x] List each file and the pattern it uses

**Inline Debounce/Throttle Inventory (2026-04-06):**

Files already using shared hooks (no migration needed):
- `hooks/batch/useBatchProcessor.ts` - uses `useSessionDebounce`
- `hooks/stats/useStats.ts` - uses `useDebouncedCallback`
- `hooks/ui/useScrollPosition.ts` - uses `useThrottledCallback` (but also has inline `positionSaveTimerRef` debounce for nested position persistence)
- `hooks/input/useInputHandlers.ts` - uses `useDebouncedValue`
- `components/DocumentGraph/DocumentGraphView.tsx` - uses `useDebouncedCallback`
- `components/HistoryPanel.tsx` - uses `useThrottledCallback`
- `components/CuePipelineEditor/panels/AgentConfigPanel.tsx` - uses `useDebouncedCallback`
- `components/CuePipelineEditor/panels/EdgePromptRow.tsx` - uses `useDebouncedCallback`
- `components/CuePipelineEditor/panels/triggers/TriggerConfig.tsx` - uses `useDebouncedCallback`
- `components/TerminalOutput.tsx` - uses `useDebouncedValue` + `useThrottledCallback`

**Category A - True debounce patterns (clear+reset timer, candidate for `useDebouncedCallback`):**

| # | File | Ref Name | Delay | Pattern |
|---|------|----------|-------|---------|
| 1 | `hooks/cue/usePipelineLayout.ts` | `layoutSaveTimerRef` | 500ms | Debounces layout persistence to disk |
| 2 | `hooks/batch/useAutoRunSearch.ts` | `searchCountTimeoutRef` | 150ms | Debounces regex match counting on keystrokes |
| 3 | `hooks/git/useGitStatusPolling.ts` | `activityDebounceRef` | 100ms | Debounces activity detection for polling restart |
| 4 | `hooks/batch/useAutoRunScrollSync.ts` | `previewScrollDebounceRef` | trailing | Debounces parent state update on scroll |
| 5 | `components/AgentSessionsBrowser.tsx` | `searchTimeoutRef` | trailing | Debounces backend content search API calls |
| 6 | `components/CueYamlEditor/CueYamlEditor.tsx` | `validateTimerRef` | 500ms | Debounces YAML validation |
| 7 | `components/XTerminal.tsx` | `resizeTimerRef` | trailing | Debounces terminal resize/fit |
| 8 | `components/FilePreview/FilePreview.tsx` | `scrollSaveTimerRef` | 200ms | Debounces scroll position persistence |
| 9 | `hooks/ui/useScrollPosition.ts` | `positionSaveTimerRef` | configurable | Nested debounce for position save (alongside `useThrottledCallback`) |

**Category B - Copy notification auto-dismiss (clear+reset one-shot timer):**

| # | File | Ref Name | Delay | Pattern |
|---|------|----------|-------|---------|
| 10 | `components/TabBar/AITab.tsx` | `copyTimeoutRef` | 1500ms | Auto-dismiss copy notification |
| 11 | `components/TabBar/FileTab.tsx` | `copyTimeoutRef` | 1500ms | Auto-dismiss copy notification |
| 12 | `components/CueYamlEditor/PatternPreviewModal.tsx` | `copyTimeoutRef` | 2000ms | Auto-dismiss copy notification |
| 13 | `components/FilePreview/FilePreview.tsx` | `notificationTimeoutRef` | 2000ms | Auto-dismiss copy notification |

**Category C - Hover/popup delay patterns (UI interaction delays):**

| # | File | Ref Name | Delay | Pattern |
|---|------|----------|-------|---------|
| 14 | `components/FileExplorerPanel.tsx` | `hoverTimeoutRef` | varies | Hover delay for tooltip |
| 15 | `components/GitStatusWidget.tsx` | `tooltipTimeout` | varies | Tooltip hover delay |
| 16 | `components/SessionList/SessionContextMenu.tsx` | `submenuTimeoutRef` | varies | Submenu open delay |
| 17 | `components/FilePreview/FilePreviewHeader.tsx` | `backPopupTimeoutRef`, `forwardPopupTimeoutRef` | varies | Popup hover delays |

**Category D - Other timers (not debounce/throttle, skip migration):**

| # | File | Ref Name | Pattern |
|---|------|----------|---------|
| 18 | `hooks/batch/useAutoRunUndo.ts` | `undoSnapshotTimeoutRef` | Timed undo snapshot capture |
| 19 | `components/FileExplorerPanel.tsx` | `autoRefreshTimerRef` | Periodic auto-refresh interval |
| 20 | `components/ExecutionQueueBrowser.tsx` | `pressTimerRef` | Long-press detection |
| 21 | `components/KeyboardMasteryCelebration.tsx` | `timeoutsRef` | Animation scheduling |
| 22 | `components/TerminalView.tsx` | `spawnFailureTimerRef` | Spawn timeout detection |
| 23 | `components/LeaderboardRegistrationModal.tsx` | `pollingIntervalRef` | Polling interval |

**Migration candidates:** Categories A (9 files) and B (4 files, 3 unique since FilePreview has both) = 12 unique files with clear debounce patterns suitable for `useDebouncedCallback`. Category C (4 files) could use `useHoverTooltip` or `useDebouncedCallback`. Total: ~16 files with inline debounce/throttle implementations.

### 3. Migrate to shared hooks (15+ files)

- [x] For each file: identify the debounce/throttle pattern used
- [x] Match to the appropriate shared hook (`useDebounce`, `useThrottle`, `useDebouncedPersistence`, or `useSessionDebounce`)
- [x] Replace the inline implementation with the shared hook import
- [x] Run file-level tests after each migration: `CI=1 rtk vitest run <relevant-test>`

**Migration Results (2026-04-06):**

15 debounce/throttle implementations migrated across 14 unique files to use `useDebouncedCallback`:

**Category A (9 true debounce patterns):**
1. `hooks/cue/usePipelineLayout.ts` - `layoutSaveTimerRef` -> `useDebouncedCallback` (500ms)
2. `hooks/batch/useAutoRunSearch.ts` - `searchCountTimeoutRef` -> `useDebouncedCallback` (150ms)
3. `hooks/git/useGitStatusPolling.ts` - `activityDebounceRef` -> `useDebouncedCallback` (100ms)
4. `hooks/batch/useAutoRunScrollSync.ts` - `previewScrollDebounceRef` -> `useDebouncedCallback` (500ms)
5. `components/AgentSessionsBrowser.tsx` - `searchTimeoutRef` -> `useDebouncedCallback` (300ms)
6. `components/CueYamlEditor/CueYamlEditor.tsx` - `validateTimerRef` -> `useDebouncedCallback` (500ms)
7. `components/XTerminal.tsx` - `resizeTimerRef` -> `useDebouncedCallback` (100ms)
8. `components/FilePreview/FilePreview.tsx` - `scrollSaveTimerRef` -> `useDebouncedCallback` (200ms)
9. `hooks/ui/useScrollPosition.ts` - `positionSaveTimerRef` -> `useDebouncedCallback` (configurable)

**Category B (4 copy notification patterns):**
10. `components/TabBar/AITab.tsx` - `copyTimeoutRef` -> `useDebouncedCallback` (1500ms)
11. `components/TabBar/FileTab.tsx` - `copyTimeoutRef` -> `useDebouncedCallback` (1500ms)
12. `components/CueYamlEditor/PatternPreviewModal.tsx` - `copyTimeoutRef` -> `useDebouncedCallback` (2000ms)
13. `components/FilePreview/FilePreview.tsx` - `notificationTimeoutRef` -> `useDebouncedCallback` (2000ms)

**Category C (2 hover/popup delay patterns):**
14. `components/SessionList/SessionContextMenu.tsx` - `submenuTimeoutRef` -> `useDebouncedCallback` (300ms)
15. `components/GitStatusWidget.tsx` - `tooltipTimeout` -> `useDebouncedCallback` (150ms)

Also widened `useDebouncedCallback` generic constraint from `unknown[]` to `any[]` to support typed callbacks.
Updated `useScrollPosition.test.ts` mock to include `useDebouncedCallback` with proper debounce simulation.

### Part 2: activeSession Re-derivation

### 4. Find all re-derivation patterns

- [x] Run: `rtk grep "sessions\.find.*activeSessionId|sessions\.find.*id === active" src/renderer/ --glob "*.{ts,tsx}"` (exclude `__tests__`, `sessionStore`)
- [x] Count total instances across files

**Re-derivation Inventory (2026-04-06):**

The scan identified 28 files. Analysis revealed three categories:
- **15 files** with render-scope `useSessionStore(selectActiveSession)` - migrated to `useActiveSession()`
- **2 files** with prop-driven `sessions.find(s => s.id === activeSessionId)` - can't use hooks (ExecutionQueueBrowser, QuickActionsModal)
- **11 files** with callback-scope `selectActiveSession(useSessionStore.getState())` or just `activeSessionId` usage - not applicable for hook migration
- **4 web files** - separate store pattern, skipped
- **1 source definition** (sessionStore.ts) - skipped

### 5. Create or promote a useActiveSession hook

- [x] Check if `useActiveSession` already exists: `rtk grep "useActiveSession" src/renderer/ --glob "*.{ts,tsx}"`
- [x] If it doesn't exist, create `src/renderer/hooks/session/useActiveSession.ts` that wraps `useSessionStore(selectActiveSession)`
- [x] Re-exported from `src/renderer/hooks/session/index.ts`

### 6. Migrate 15 files to useActiveSession

- [x] For each file that re-derives `activeSession`: replace the derivation with `useActiveSession()` import
- [x] Remove `selectActiveSession` from imports where no longer needed
- [x] Run targeted tests after each batch

**Migrated files (15 render-scope usages):**
1. `App.tsx` - kept `selectActiveSession` for callback usage
2. `AppModals.tsx` - removed `selectActiveSession` import
3. `RightPanel.tsx` - removed `selectActiveSession` import
4. `useWizardHandlers.ts` - removed `selectActiveSession` (no callback usage of selector)
5. `useTabHandlers.ts` - kept `selectActiveSession` for callback usage
6. `useInputHandlers.ts` - removed `selectActiveSession` import
7. `useSessionLifecycle.ts` - kept `selectActiveSession` for callback usage
8. `useQuickActionsHandlers.ts` - removed `selectActiveSession` import
9. `usePromptComposerHandlers.ts` - removed `selectActiveSession` import
10. `useFileExplorerEffects.ts` - removed `selectActiveSession` import
11. `useAutoRunDocumentLoader.ts` - removed `selectActiveSession` import
12. `useBatchHandlers.ts` - removed `selectActiveSession` import
13. `useModalHandlers.ts` - removed `selectActiveSession` import
14. `useInterruptHandler.ts` - removed `selectActiveSession` import
15. `useMergeTransferHandlers.ts` - removed `selectActiveSession` import

### 7. Verify full build

- [x] Run lint: `rtk npm run lint`
- [x] Run tests: `CI=1 rtk vitest run`
- [x] Verify types: lint passes (1 pre-existing TS error in useInputHandlers.ts unrelated to migration)

**Results:** 23,438 tests pass, 55 pre-existing failures (all Windows path separator issues in pathUtils/cue tests). Zero new failures from activeSession migration.

### 8. Count remaining derivations

- [x] Run: `rtk grep "sessions\.find.*activeSessionId" src/renderer/ --glob "*.{ts,tsx}"` (exclude `__tests__`, `sessionStore`, `useActiveSession`)
- [x] Remaining: 3 (all appropriate - 1 source definition in sessionStore, 2 prop-driven components)

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

- 15+ inline debounce/throttle implementations migrated to shared hooks
- 28 files using `useActiveSession()` instead of re-derivation
- Lint and tests pass
