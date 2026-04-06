# Phase 09-A: Extract useFocusAfterRender and useEventListener Hooks

## Objective

Create two shared hooks to replace repetitive patterns:

1. `useFocusAfterRender` - replaces 45 `setTimeout(() => ref.current?.focus(), N)` patterns across 28 files
2. `useEventListener` - replaces manual `addEventListener`/`removeEventListener` pairs in 63+ files

**Evidence:** `docs/agent-guides/scans/SCAN-HOOKS.md`
**Risk:** Low - extracting patterns into hooks with identical behavior
**Estimated savings:** ~340 lines

---

## Pre-flight Checks

- [x] Phase 08 (UI components) is complete
- [x] `rtk npm run lint` passes
- [x] `CI=1 rtk vitest run` passes (21 pre-existing test file failures on baseline, 590 passed)

---

## Tasks

### Part 1: useFocusAfterRender

### 1. Survey the setTimeout focus pattern

- [x] Run: `rtk grep "setTimeout.*focus" src/renderer/ --glob "*.{ts,tsx}"` (exclude `__tests__`)
- [x] Note delay values used (0ms, 50ms, 100ms are common)
- [x] Determine the most common default delay

**Survey Results (2026-04-06):**
- 0ms: 18 instances (useModalHandlers x6, InputArea x2, App.tsx, FilePreview, GroupChatHistoryPanel, HistoryPanel, LightboxModal, useGroupChatHandlers, useKeyboardNavigation, useMainKeyboardHandler x2, SshRemoteModal)
- 50ms: 21 instances (AgentSessionsBrowser x6, AgentSessionsModal, App.tsx, CreateWorktreeModal, AgentDrawer, FileSearchModal, MarketplaceModal, MergeSessionModal, QuickActionsModal, SendToAgentModal, ShortcutsTab, ThemeTab, SymphonyModal, TabSwitcherModal, useSymphonyContribution, MobileHistoryPanel)
- 100ms: 4 instances (BatchRunnerModal, useMainKeyboardHandler x2, useWizardHandlers)
- const (FOCUS_AFTER_RENDER_DELAY_MS): 2 instances (useMainKeyboardHandler x2)
- **Most common: 50ms (21/45), followed by 0ms (18/45)**
- Recommendation: default delay = 50 (aligns with majority of call sites)

### 2. Create useFocusAfterRender hook

- [x] Create `src/renderer/hooks/utils/useFocusAfterRender.ts`
- [x] Implement with params: `ref` (RefObject), `shouldFocus` (boolean, default true), `delay` (number, default 0)
- [x] Use `useEffect` with `setTimeout` + `clearTimeout` cleanup
- [x] Export the function

### 3. Write tests for useFocusAfterRender

- [x] Create test file for the hook
- [x] Test focuses element after render
- [x] Test respects delay parameter
- [x] Test cleans up timeout on unmount
- [x] Test does nothing when `shouldFocus` is false
- [x] Run tests: `CI=1 rtk vitest run <hook-test-path>`

**Test Results (2026-04-06):**
- Test file: `src/__tests__/renderer/hooks/utils/useFocusAfterRender.test.ts`
- 10 tests across 4 describe blocks: basic focus, delay parameter, cleanup on unmount, shouldFocus parameter
- Also tests: null ref safety, shouldFocus toggling from false->true, cancellation when shouldFocus changes mid-delay
- All 10 tests pass (16ms)

### 4. Migrate setTimeout focus patterns (45 instances across 28 files)

- [x] For each file: identify whether the `setTimeout(() => ref.current?.focus(), N)` is inside a `useEffect` or an event handler
- [x] If inside `useEffect`: replace entirely with `useFocusAfterRender(ref, condition, delay)`
- [x] If inside an event handler: keep inline (the hook is for render-time focus only)
- [x] Run targeted tests after each batch of files

**Migration Results (2026-04-06):**
- **15 useEffect-based patterns migrated** across 15 files to use `useFocusAfterRender`
- **30 event-handler-based patterns kept inline** (inside useCallback/onClick handlers)
- Migrated files:
  - Group 1 (mount-only useEffect, entire useEffect replaced): AgentSessionsBrowser, FileSearchModal, QuickActionsModal, TabSwitcherModal, ShortcutsTab, ThemeTab, BatchRunnerModal
  - Group 2 (conditional useEffect, entire useEffect replaced): MarketplaceModal, MergeSessionModal, SendToAgentModal, SymphonyModal, AgentDrawer
  - Group 3 (mixed useEffect, setTimeout removed + hook added): CreateWorktreeModal, SshRemoteModal
  - Group 4 (complex useEffect, refactored): App.tsx (mode-switch transition)
- Unused `useEffect` imports cleaned from: ThemeTab, AgentDrawer
- All 10 useFocusAfterRender tests pass, lint clean, 23,426 tests pass (55 pre-existing failures unchanged)

### Part 2: useEventListener

### 5. Survey addEventListener/removeEventListener pairs

- [x] Run: `rtk grep "addEventListener" src/renderer/ --glob "*.{ts,tsx}"` (exclude `__tests__`, `node_modules`)
- [x] Identify top offenders: `App.tsx` (30), `activityBus.ts` (10), `MarketplaceModal.tsx` (10), `SymphonyModal.tsx` (8), `useMainKeyboardHandler.ts` (8)

**Survey Results (2026-04-06):**
- ~103 addEventListener/removeEventListener pairs across 64 files (excluding `__tests__`, `main.tsx` global error handlers)
- Top offenders (add+remove line count):
  1. `App.tsx` - 30 lines (15 pairs, mostly custom `maestro:*` events)
  2. `activityBus.ts` - 10 lines (5 pairs: keydown, mousedown, wheel, touchstart, click)
  3. `MarketplaceModal.tsx` - 10 lines (5 pairs: keydown x4, mousedown x1)
  4. `SymphonyModal.tsx` - 8 lines (4 pairs: mousedown, keydown x3)
  5. `useMainKeyboardHandler.ts` - 8 lines (4 pairs: keydown x2, keyup, blur)
  6. `useModalHandlers.ts` - 6 lines (3 pairs: visibilitychange, focus, mousemove)
  7. `useAppHandlers.ts` - 6 lines (3 pairs: dragend, dragover, drop)
  8. `MaestroWizard.tsx` - 6 lines (3 pairs: keydown x3)
  9. `SessionList.tsx` - 6 lines (3 pairs: mousedown, keydown, tour:action)
- Common event types: `keydown` (~35 pairs), `mousedown`/`click` (~12), `visibilitychange` (~5), custom `maestro:*` events (~16), `resize` (~3)
- Pattern: most are simple `useEffect` with add in body + remove in cleanup
- Notable exceptions: `activityBus.ts` is not a React hook (plain utility with init/cleanup functions), `useResizablePanel.ts` adds listeners in mousedown handler not useEffect, `AchievementCard.tsx` has conditional add/remove outside useEffect

### 6. Create useEventListener hook

- [x] Create `src/renderer/hooks/utils/useEventListener.ts`
- [x] Implement with params: `eventName`, `handler`, `element` (optional, defaults to window), `options` (optional)
- [x] Use `useRef` for handler to avoid re-attaching on handler changes
- [x] Handle null/undefined element gracefully
- [x] Export the function

### 7. Write tests for useEventListener

- [x] Create test file for the hook
- [x] Test attaches listener on mount
- [x] Test removes listener on unmount
- [x] Test updates handler without re-attaching listener
- [x] Test works with custom HTML elements
- [x] Test handles null element gracefully
- [x] Run tests: `CI=1 rtk vitest run <hook-test-path>`

**Test Results (2026-04-06):**
- Test file: `src/__tests__/renderer/hooks/utils/useEventListener.test.ts`
- 12 tests across 5 describe blocks: attach/detach, handler ref stability, custom element target, null element, options support
- Tests cover: mount attach, unmount detach, handler called on event, handler not called after unmount, handler update without re-attach, custom HTML element, document target, null element safety, capture/passive/boolean options
- All 12 tests pass (12ms)

### 8. Migrate event listener pairs (63+ files)

- [x] Start with top offenders: `activityBus.ts`, `MarketplaceModal.tsx`, `useMainKeyboardHandler.ts`, `SymphonyModal.tsx`, `App.tsx`
- [x] Replace each `useEffect` containing `addEventListener`/`removeEventListener` pair with `useEventListener(eventName, handler)`
- [x] Run targeted tests after each file

**Migration Results (2026-04-06):**
- **93 useEventListener calls** across **55 consumer files** (including barrel export)
- **~86 addEventListener/removeEventListener pairs migrated** from ~103 original pairs across 64 files
- **17 remaining addEventListener occurrences** across 9 files (all legitimate exceptions):
  - `main.tsx` (2): Global error handlers at module level, not React
  - `activityBus.ts` (5): Plain utility module with lazy init/cleanup, not a React hook
  - `useEventListener.ts` (1): The hook implementation itself
  - `useResizablePanel.ts` (2): Listeners added in mousedown handler, not useEffect
  - `AchievementCard.tsx` (2): setTimeout-wrapped addEventListener to delay attachment
  - `useClickOutside.ts` (2): setTimeout-wrapped path prevents migration without behavior change
  - `useThemeStyles.ts` (1): Mixed useEffect with RAF/timeout cleanup alongside listener
  - `FilePreview.tsx` (1): Mixed useEffect with ref element + scroll timer cleanup
  - `XTerminal.tsx` (1): Mixed useEffect with terminal lifecycle (WebGL, ResizeObserver, link provider)
- **2 ref-based patterns reverted** from useEventListener back to useEffect:
  - `WizardConversationView.tsx`: `containerRef.current` is null during render, listener never attached
  - `MindMap.tsx`: `canvasRef.current` is null during render, same issue
- **4 test files updated** to match useEventListener's 3-arg calling convention:
  - `GitDiffViewer.test.tsx`, `PlaygroundPanel.test.tsx`, `useMobileLandscape.test.ts`, `useRemoteHandlers.test.ts`
- Lint clean, types pass, 21 pre-existing test file failures unchanged, 23,438 tests pass

### 9. Export from hooks barrel

- [x] Add exports to `src/renderer/hooks/utils/index.ts` (create if doesn't exist):
  - `export { useFocusAfterRender } from './useFocusAfterRender';`
  - `export { useEventListener } from './useEventListener';`

### 10. Verify full build

- [x] Run lint: `rtk npm run lint`
- [x] Run tests: `CI=1 rtk vitest run`
- [x] Verify types: `rtk tsc -p tsconfig.main.json --noEmit && rtk tsc -p tsconfig.lint.json --noEmit`

**Verification Results (2026-04-06):**
- `npm run lint`: clean (no errors)
- `tsc -p tsconfig.main.json --noEmit`: clean
- `tsc -p tsconfig.lint.json --noEmit`: clean
- `CI=1 vitest run`: 21 failed (pre-existing), 592 passed, 1 skipped (614 total)
- Tests: 55 failed (pre-existing), 23,438 passed, 107 skipped (23,600 total)
- Zero new test failures from migration changes

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

- `useFocusAfterRender` hook created with tests
- `useEventListener` hook created with tests
- 45 setTimeout-focus patterns migrated
- 63+ addEventListener/removeEventListener pairs migrated
- Lint and tests pass
