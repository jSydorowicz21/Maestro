# Phase 13-B: Decompose Other Oversized Files

## Objective

Address the remaining oversized files after App.tsx. Priority targets are files over 2,000 lines that contain significant duplication identified in earlier phases.

**Evidence:** `docs/agent-guides/scans/SCAN-OVERSIZED.md`
**Risk:** Medium-high - these are complex files. Work incrementally.
**Estimated savings:** Improved maintainability

---

## Pre-flight Checks

- [x] Phase 13-A (App.tsx decomposition) is complete (all 10 tasks checked, App.tsx reduced from 4,034 to 2,918 lines)
- [x] `rtk npm run lint` passes (18 pre-existing errors from prior phases - 0 new; all `setSessions` missing property, `updateSessionWith`/`Spinner`/`EditingCommand` broken imports)
- [x] `CI=1 rtk vitest run` passes (baseline: 24,573 passed, 42 pre-existing failures, 107 pending)

---

## Important Context

Current oversized files status:

- `App.tsx` - 4,034 lines (REGRESSION, addressed in Phase 13-A)
- `symphony.ts` handler - 3,318 lines
- `TabBar.tsx` - FULLY RESOLVED (2,839 to 542)
- `FilePreview.tsx` - PARTIALLY RESOLVED (2,662 to 1,320)
- `SymphonyModal.tsx` - large (check current size)
- `useTabHandlers.ts` - large (should be smaller after Phase 07)
- `useInputProcessing.ts` - large (should be smaller after Phase 07)

---

## Tasks

### 1. Re-measure after prior phases

- [x] Run: `find src/ -name "*.ts" -o -name "*.tsx" | xargs wc -l | sort -rn | head -30`
- [x] Only target files still over 1,500 lines
- [x] Document updated line counts for decision-making

**Updated measurements (excluding test files and generated files, files >1,500 lines):**

| File                                                          | Lines | Notes                          |
| ------------------------------------------------------------- | ----- | ------------------------------ |
| `src/web/mobile/App.tsx`                                      | 3,350 | Mobile app - separate concern  |
| `src/main/ipc/handlers/symphony.ts`                           | 3,318 | **TARGET** - Task 2            |
| `src/renderer/global.d.ts`                                    | 3,161 | Type declarations - skip       |
| `src/renderer/App.tsx`                                        | 2,918 | Addressed in 13-A, coordinator |
| `src/renderer/components/SymphonyModal.tsx`                   | 2,620 | **TARGET** - Task 3            |
| `src/main/web-server/handlers/messageHandlers.ts`             | 2,450 | Web server handlers            |
| `src/renderer/components/DocumentGraph/DocumentGraphView.tsx` | 2,136 |                                |
| `src/renderer/hooks/batch/useBatchProcessor.ts`               | 2,092 |                                |
| `src/main/group-chat/group-chat-router.ts`                    | 2,037 |                                |
| `src/renderer/stores/settingsStore.ts`                        | 2,016 |                                |
| `src/renderer/utils/tabHelpers.ts`                            | 2,001 |                                |
| `src/renderer/components/MainPanel.tsx`                       | 1,986 |                                |
| `src/renderer/components/ProcessMonitor.tsx`                  | 1,975 |                                |
| `src/main/ipc/handlers/claude.ts`                             | 1,908 |                                |
| `src/renderer/components/TerminalOutput.tsx`                  | 1,847 |                                |
| `src/renderer/components/NewInstanceModal.tsx`                | 1,836 |                                |
| `src/main/web-server/web-server-factory.ts`                   | 1,816 |                                |
| `src/main/storage/opencode-session-storage.ts`                | 1,759 |                                |
| `src/renderer/components/QuickActionsModal.tsx`               | 1,708 |                                |
| `src/renderer/hooks/tabs/useTabHandlers.ts`                   | 1,625 | **TARGET** - Task 5 (>800)     |
| `src/main/storage/codex-session-storage.ts`                   | 1,614 |                                |
| `src/renderer/components/PlaygroundPanel.tsx`                 | 1,608 |                                |
| `src/renderer/hooks/agent/useAgentListeners.ts`               | 1,607 |                                |
| `src/web/mobile/AllSessionsView.tsx`                          | 1,575 | Mobile - separate concern      |
| `src/renderer/components/FileExplorerPanel.tsx`               | 1,557 |                                |
| `src/renderer/components/AgentSessionsBrowser.tsx`            | 1,538 |                                |

**Also checked (from Important Context):**

- `FilePreview.tsx` - 1,322 lines (partially resolved, >800 - Task 4 target)
- `useInputProcessing.ts` - 1,242 lines (>800 - Task 5 target)
- `useTabHandlers.ts` - 1,625 lines (>800 - Task 5 target)

### 2. Decompose symphony.ts handler (3,318 lines)

- [x] Read `src/main/ipc/handlers/symphony.ts` to identify logical sections
- [x] Create directory: `src/main/ipc/handlers/symphony/`
- [x] Extract and create `index.ts` - handler registration (entry point)
- [x] Extract and create `helpers.ts` - validation, path, cache/state, utility functions (433 lines)
- [x] Extract and create `git-operations.ts` - clone, branch, PR, auth operations (342 lines)
- [x] Extract and create `registry.ts` - registry fetching, issues, star counts (625 lines)
- [x] Extract and create `state.ts` - state/stats/cache operation handlers (140 lines)
- [x] Extract and create `contributions.ts` - contribution lifecycle handlers (1,117 lines)
- [x] Extract and create `workflow.ts` - session creation workflow handlers (801 lines)
- [x] Update imports in any files that referenced the old single-file path
- [x] Run lint and tests: `rtk npm run lint && CI=1 rtk vitest run`

**Note:** Task originally specified group-chat-oriented file names (create.ts, manage.ts, participants.ts, messages.ts, export.ts) but symphony.ts is a contribution management system, not group chat. Decomposed by actual logical sections instead: helpers, git-operations, registry, state, contributions, workflow. All 219 symphony unit tests pass. Baseline maintained: 24,573 passed, 42 pre-existing failures.

### 3. Decompose SymphonyModal.tsx

- [x] Read the file to identify extractable sub-panels and state logic
- [x] Extract `SymphonyCards.tsx` component (RepositoryTile, IssueCard, ActiveContributionCard, CompletedContributionCard, AchievementCard, RepositoryTileSkeleton - 623 lines)
- [x] Extract `SymphonyDetailView.tsx` component (RepositoryDetailView - 567 lines)
- [x] Extract `SymphonyPreflightDialog.tsx` component (build warning dialog - 236 lines)
- [x] Extract `useSymphonyModal.ts` state management hook (440 lines)
- [x] Keep the modal shell as the coordinator that imports and composes these (779 lines)
- [x] Run lint and tests: `rtk npm run lint && CI=1 rtk vitest run`

**Note:** Task originally specified group-chat-oriented component names (SymphonyParticipantList, SymphonyMessageView, SymphonyConfigPanel) but SymphonyModal is a contribution management UI, not a messaging system. Decomposed by actual logical sections: helpers (types/constants/utils), cards (6 presentational components), detail view (repository issue browser), preflight dialog (gh CLI check), and state hook. Created `Symphony/` directory with 7 focused modules. All 6 SymphonyModal tests pass. Old import path preserved via re-export barrel. Baseline maintained: 24,573 passed, 42 pre-existing failures.

### 4. Finish FilePreview.tsx decomposition (1,320 lines)

- [x] Read the file to identify remaining extractable sections
- [x] Extract language-specific renderers into separate components
- [x] Extract toolbar logic into a component or hook
- [x] Extract preview mode switching logic
- [x] Run lint and tests: `rtk npm run lint && CI=1 rtk vitest run`

**Note:** Decomposed FilePreview.tsx from 1,322 to 802 lines by extracting 5 focused modules into the existing `FilePreview/` directory:

- `FilePreviewEditor.tsx` (113 lines) - edit mode textarea with cursor/page navigation keyboard handlers
- `FilePreviewCodeView.tsx` (76 lines) - syntax-highlighted code view with large-file truncation banner
- `FilePreviewMarkdownView.tsx` (163 lines) - markdown renderer with scoped prose styles, remark/rehype plugins, and MarkdownImage integration
- `FilePreviewSearch.tsx` (97 lines) - floating in-file text search bar with match navigation
- `useFilePreviewKeyboard.ts` (234 lines) - keyboard handling hook (shortcuts, clipboard ops, scroll navigation, mode switching)

All 69 FilePreview tests pass. Baseline maintained: 24,573 passed, 42 pre-existing failures, 0 new.

### 5. Address useTabHandlers.ts and useInputProcessing.ts

- [x] Check current size of both files (should be smaller after Phase 07)
- [x] If `useTabHandlers.ts` still exceeds 800 lines: split by tab operation type (create, close, reorder, activate)
- [x] If `useInputProcessing.ts` still exceeds 800 lines: split by input type (text, slash commands, file drops)
- [x] Run lint and tests after any splits: `rtk npm run lint && CI=1 rtk vitest run`

**Note:** Both files exceeded 800 lines and were decomposed:

**useTabHandlers.ts** (1,625 -> 469 lines) - split into 3 focused sub-hooks composed by the main hook:

- `useFileTabHandlers.ts` (664 lines) - file tab creation, operations (edit, scroll, search, reload, select), unified tab reorder, and file tab navigation (back/forward/to-index)
- `useTabCloseHandlers.ts` (402 lines) - all tab close operations (single tab, all tabs, other tabs, tabs left/right, current tab) with draft/wizard confirmation modals
- `useTabPropertyHandlers.ts` (229 lines) - rename, reorder, star, mark unread, toggle read-only/save-to-history/show-thinking

**useInputProcessing.ts** (1,242 -> 752 lines) - split by extracting 3 helper modules:

- `processSlashCommand.ts` (221 lines) - slash command detection and execution (/history, /wizard, /skills, custom AI commands)
- `resolveTerminalCwd.ts` (133 lines) - terminal cd command tracking (bare cd, relative/absolute paths, tilde expansion, SSH remote)
- `spawnBatchAgent.ts` (216 lines) - batch mode agent spawning (agent config, system prompt, read-only mode, merged context, error recovery)

All 137 targeted tests pass (86 useTabHandlers + 51 useInputProcessing). Baseline maintained: 24,573 passed, 42 pre-existing failures, 0 new.

### 6. Verify full build

- [x] Run lint: `rtk npm run lint`
- [x] Run tests: `CI=1 rtk vitest run`
- [x] Verify types: `rtk tsc -p tsconfig.main.json --noEmit && rtk tsc -p tsconfig.lint.json --noEmit`

**Note:** All results match pre-existing baseline. Lint: 18 pre-existing errors (all `setSessions` missing property, `updateSessionWith`/`Spinner`/`EditingCommand` broken imports - 0 new). Tests: 24,573 passed, 42 pre-existing failures, 0 new. Types (main config): clean pass. Types (lint config): same 18 pre-existing errors. Push blocked by pre-push hook (tsc lint config) due to same 18 pre-existing errors - needs manual push with --no-verify or fixing the pre-existing errors first.

### 7. Final oversized file count

- [ ] Run: `find src/ -name "*.ts" -o -name "*.tsx" | xargs wc -l | awk '$1 > 800' | sort -rn | wc -l`
- [ ] Target: fewer than 40 files over 800 lines (down from 82)

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

- `symphony.ts` handler split into focused modules
- `SymphonyModal.tsx` split into sub-components
- `FilePreview.tsx` further decomposed if still >800 lines
- Post-Phase-07 files re-checked
- Lint and tests pass
- Fewer than 40 files over 800 lines
