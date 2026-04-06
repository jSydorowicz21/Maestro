# Phase 10-A: Migrate Modal Boilerplate to useModalLayer Hook

## Objective

Migrate 50+ files from manual `registerLayer`/`unregisterLayer` boilerplate to the existing `useModalLayer` hook (currently used by only 1-2 files).

**Evidence:** `docs/agent-guides/scans/SCAN-BLOCKS.md`, "registerLayer/unregisterLayer by File"
**Risk:** Low-medium - modal behavior must be preserved (Escape handling, layer priority)
**Estimated savings:** ~200 lines (4 lines per file x 50 files)

---

## Pre-flight Checks

- [x] Phase 09 (shared hooks) is complete
- [x] `rtk npm run lint` passes (fixed stale `setSessions` prop in useInputHandlers.ts)
- [x] `CI=1 rtk vitest run` passes (pre-existing cue test failures only)

---

## Tasks

### 1. Read the existing useModalLayer hook

- [x] Read `src/renderer/hooks/ui/useModalLayer.ts`
- [x] Document what parameters it accepts: `priority: number`, `ariaLabel: string`, `onEscape: () => void`, `options: { isDirty?, onBeforeClose?, focusTrap?, blocksLowerLayers?, capturesFocus? }`
- [x] Confirm it handles the `isOpen` conditional logic - it does NOT have internal isOpen gating; components must be conditionally rendered (standard React pattern)
- [x] Confirm it accepts priority from `modalPriorities.ts` - yes, takes numeric priority as first arg
- [x] Confirm it handles the `onCloseRef` pattern internally - yes, uses `updateLayerHandler` to update onEscape without re-registering

### 2. Verify useModalLayer covers all manual patterns

- [x] Compare the manual boilerplate pattern (`useLayerStack` + `useRef` + `useEffect` with `registerLayer`/`unregisterLayer`) against what `useModalLayer` provides
  - Hook already covered: modal type, priority, ariaLabel, onEscape, isDirty, onBeforeClose, focusTrap, blocksLowerLayers, capturesFocus, updateLayerHandler
  - Gap found: no support for `type: 'overlay'` + `allowClickOutside` (~10 overlay registrations across 6 files)
  - `parentModalId` defined in types but unused by any component - no gap
  - `isOpen` gating is component-level, not hook-level (by design) - no gap
- [x] If the hook is missing any capability (e.g., custom layer type, conditional priority), extend it before migration
  - Extended `UseModalLayerOptions` with `type?: LayerType` (defaults to 'modal') and `allowClickOutside?: boolean` (overlay-only, defaults to true)
  - Overlay defaults differ from modal: `focusTrap: 'none'`, `blocksLowerLayers: false`, `capturesFocus: false`
  - All defaults can be overridden per-component
- [x] Run hook tests after any extension: `CI=1 rtk vitest run <hook-test-path>`
  - 17/17 tests pass (12 existing + 5 new overlay tests). Lint passes.

### 3. Find all files with manual boilerplate

- [x] Run: `rtk grep "registerLayer|unregisterLayer" src/renderer/ --glob "*.{ts,tsx}"` (exclude `__tests__`, `useModalLayer`, `LayerStackContext`)
- [x] List all files and count total instances
  - **49 component files** with manual `registerLayer`/`unregisterLayer` boilerplate (226 total instances across 53 files, minus 4 infrastructure: `useModalLayer.ts`, `useLayerStack.ts`, `LayerStackContext.tsx`, `layer.ts`)
  - **DocumentGraphView.tsx** is the most complex with 17 instances (multiple nested layers)
  - All other component files have 4-5 instances each (typical pattern: destructure, registerLayer call, unregisterLayer cleanup, dependency array refs)
  - Files by category:
    - **Simple modals** (~12): `AgentCreationDialog`, `CreateWorktreeModal`, `CreatePRModal`, `ExecutionQueueBrowser`, `MarketplaceModal`, `TerminalSearchBar`, `WorktreeConfigModal`, `UsageDashboardModal`, `SymphonyModal`, `TourOverlay`, `MaestroWizard`, `LeaderboardRegistrationModal`
    - **Modals with updateLayerHandler** (~26): `FirstRunCelebration`, `BatchRunnerModal`, `FileSearchModal`, `FilePreview`, `DirectorNotesModal`, `GitLogViewer`, `GitDiffViewer`, `HistoryDetailModal`, `KeyboardMasteryCelebration`, `LogViewer`, `AutoRunExpandedModal`, `LightboxModal`, `MergeSessionModal`, `PlaygroundPanel`, `ProcessMonitor`, `QuickActionsModal`, `QuitConfirmModal`, `AgentSessionsBrowser`, `SendToAgentModal`, `TabSwitcherModal`, `TransferProgressModal`, `StandingOvationOverlay`, `ExistingDocsModal`, `WizardResumeModal`, `WizardExitConfirmModal`, `WizardExitConfirmDialog`, `ExistingAutoRunDocsModal`, `TerminalOutput`
    - **Special behavior** (~4): `AgentPromptComposerModal` (autocomplete interaction), `PromptComposerModal`, `CueModal`, `SettingsModal`
    - **Panels/overlays** (~5): `DocumentsPanel`, `FileExplorerPanel`, `AutoRunSearchBar`, `AutoRunLightbox`
    - **Complex** (1): `DocumentGraphView` (17 registerLayer calls, 5 distinct layers)

### 4. Migrate simple modals (~30 files)

- [x] For each file with direct `isOpen` + `onClose` props: replace the manual `useLayerStack` + `useRef` + `useEffect` block with `useModalLayer({ isOpen, priority, onEscape: onClose })`
  - Extended `useModalLayer` with `isOpen?: boolean` option (defaults to true) to gate registration without breaking React hook rules
  - Added 5 new tests for isOpen behavior (transitions true/false, defaults)
  - Migrated 36 component files across 5 parallel batches:
    - Batch 1 (6 files): isOpen-guarded modals (AgentCreationDialog, CreateWorktreeModal, CreatePRModal, ExecutionQueueBrowser, UsageDashboardModal, WorktreeConfigModal)
    - Batch 2 (8 files): Always-mounted simple modals (GitLogViewer, GitDiffViewer, FileSearchModal, MergeSessionModal, SendToAgentModal, TabSwitcherModal, HistoryDetailModal, PlaygroundPanel)
    - Batch 3 (8 files): Wizard/confirm modals (ExistingAutoRunDocsModal, ExistingDocsModal, WizardExitConfirmModal, WizardExitConfirmDialog, WizardResumeModal, QuitConfirmModal, TourOverlay, MaestroWizard)
    - Batch 4 (10 files): Celebrations and misc (FirstRunCelebration, KeyboardMasteryCelebration, StandingOvationOverlay, LeaderboardRegistrationModal, AutoRunExpandedModal, AutoRunLightbox, LightboxModal, TransferProgressModal, ProcessMonitor, QuickActionsModal)
    - Batch 5 (4 files): Panels/overlays (DocumentsPanel, AutoRunSearchBar, TerminalSearchBar, TerminalOutput)
- [x] Remove now-unused imports of `useLayerStack`, `useRef` (if no longer needed), and `useEffect` (if no longer needed)
  - All unused imports cleaned up in each migrated file
- [x] Run targeted tests after each batch: `CI=1 rtk vitest run <relevant-test>`
  - Fixed 5 test files with incomplete `useLayerStack` mocks (missing `updateLayerHandler`)
  - Fixed 2 ExecutionQueueBrowser tests that checked exact registerLayer args (now uses `expect.objectContaining`) and ref-based handler update (now verifies via `updateLayerHandler`)
  - All 22 useModalLayer tests pass, all 73 ExecutionQueueBrowser tests pass
  - Lint passes, zero new test failures from migration

### 5. Migrate complex modals (~15 files)

- [x] For modals with conditional open states or multiple close paths: adapt the `useModalLayer` call to match the existing behavior
  - Migrated 12 component files across 4 parallel agent batches:
    - Batch A (3 files): CueModal, DirectorNotesModal, SettingsModal (ref-based stable escape handlers)
    - Batch B (3 files): SymphonyModal, MarketplaceModal, PromptComposerModal (isOpen-gated with ref-based handlers)
    - Batch C (3 files): AgentPromptComposerModal, LogViewer, AgentSessionsBrowser (dynamic escape handlers with state deps)
    - Batch D (3 files): BatchRunnerModal, FilePreview (overlay), FileExplorerPanel (overlay)
  - Also migrated AgentSessionsModal (discovered during verification, 13th file)
  - Each file uses `useCallback` for the escape handler to work with `useModalLayer`'s internal `updateLayerHandler`
  - Complex modals with multiple close paths (BatchRunnerModal: 3 paths, LogViewer: search close, CueModal: help/dirty check)
  - isOpen-gated modals: SettingsModal, SymphonyModal, MarketplaceModal, PromptComposerModal, AgentPromptComposerModal
- [x] Verify each modal's Escape key behavior works correctly after migration
  - All escape paths preserved: conditional close (search, help, detail view), dirty checks, ref-based handlers
- [x] Run targeted tests after each file
  - Fixed test mocks: CueModal (missing updateLayerHandler), SettingsModal (missing updateLayerHandler in one test), LogViewer (missing updateSessionWith), DirectorNotesModal (exact-match assertion updated to objectContaining), FileExplorerPanel (capturesFocus value corrected)
  - 712 tests pass across 11 test files, zero new failures from migration
  - 3 pre-existing failures in AgentSessionsBrowser (formatNumber case: "8.0k" vs "8.0K" from previous dedup phase)

### 6. Migrate non-modal layers (~5 files)

- [x] For drawers, panels, or other layers with escape handling: use `useModalLayer` with appropriate type/priority
  - FileExplorerPanel: overlay type, `isOpen: fileTreeFilterOpen`, `capturesFocus: true`, `blocksLowerLayers: false`, `focusTrap: 'none'`
  - FilePreview: overlay type, `isOpen: !isTabMode`, `allowClickOutside: false`, `blocksLowerLayers: true`, `focusTrap: 'lenient'`
- [x] Run targeted tests
  - All FileExplorerPanel and FilePreview tests pass

### 7. Handle DocumentGraphView.tsx (17 registerLayer calls)

- [x] Read the file to understand its multiple nested modal layers
  - 5 distinct layer registrations: main modal (isOpen-gated), depth slider overlay, layout dropdown overlay, legend overlay, preview panel overlay
  - Close confirmation uses `<Modal>` component which handles its own layer registration internally
  - Removed dead `onCloseRef` pattern (set but never read)
- [x] Migrate each layer to its own `useModalLayer` call with the correct priority
  - Main modal: `useModalLayer(DOCUMENT_GRAPH, 'Document Graph', handleEscapeRequest, { isOpen, focusTrap: 'lenient' })`
  - 3 toolbar overlays (depth/layout/legend): overlay type, priority +1, `isOpen` gated by dropdown state
  - Preview panel: overlay type with `capturesFocus: true`, `focusTrap: 'lenient'`, custom escape handler that closes preview and refocuses mind map
  - Removed `useLayerStack` import, added `useModalLayer` import
- [x] Verify stacked modal Escape behavior works correctly
  - All escape paths preserved: main modal shows confirmation, overlays close individually, preview returns focus to graph
- [x] Run tests: `CI=1 rtk vitest run` (filter for DocumentGraphView tests)
  - Updated test mock to include `updateLayerHandler`
  - 611 DocumentGraph tests pass, 22 useModalLayer tests pass, lint passes

### 8. Verify Escape key behavior across migrated modals

- [x] Escape closes the topmost modal
  - Verified by new test "should close only the topmost modal on Escape" (useModalLayer) and existing "should only call the top layer handler" (useLayerStack)
- [x] Stacked modals close in correct order (highest priority first)
  - Verified by new test "should close stacked modals in correct order (highest priority first)" plus existing priority sort tests
- [x] Escape does NOT close modals that are behind other modals
  - Verified by new tests "should not close lower-priority modals when higher-priority modal is open" and "should handle mixed modal and overlay stacking correctly"
  - Added 4 integration tests to `useModalLayer.test.ts` covering all three properties (26/26 pass)

### 9. Verify full build

- [ ] Run lint: `rtk npm run lint`
- [ ] Run tests: `CI=1 rtk vitest run`
- [ ] Verify types: `rtk tsc -p tsconfig.main.json --noEmit && rtk tsc -p tsconfig.lint.json --noEmit`

### 10. Count remaining manual registrations

- [ ] Run: `rtk grep "registerLayer" src/renderer/ --glob "*.{ts,tsx}"` (exclude `__tests__`, `useModalLayer`, `LayerStackContext`)
- [ ] Target: 0 remaining in component files

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

- 50+ files migrated to `useModalLayer` hook
- All modal Escape behavior preserved
- No manual `registerLayer`/`unregisterLayer` calls remain in components
- Lint and tests pass
