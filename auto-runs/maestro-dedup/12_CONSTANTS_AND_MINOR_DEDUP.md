# Phase 12: Constants, Minor Dedup, and CSS Cleanup

## Objective

Clean up remaining P3 (nice-to-have) duplications:

- 3 redundant `AUTO_RUN_FOLDER_NAME` definitions
- 2 `DEFAULT_CAPABILITIES` definitions
- Compound CSS className patterns extracted to shared constants

**Evidence:** `docs/agent-guides/scans/SCAN-TYPES.md` (constants), `docs/agent-guides/scans/SCAN-COMPONENTS.md` (CSS)
**Risk:** Very low
**Estimated savings:** ~126 lines

---

## Pre-flight Checks

- [x] Phase 11 (logging) is complete
- [x] `rtk npm run lint` passes

---

## Tasks

### 1. Remove AUTO_RUN_FOLDER_NAME aliases (3 definitions)

- [x] Verify canonical `PLAYBOOKS_DIR` exists in `src/shared/maestro-paths.ts:14`
- [x] Remove local `AUTO_RUN_FOLDER_NAME` declaration in `phaseGenerator.ts:153` and replace all usages with `PLAYBOOKS_DIR`
- [x] Remove local `AUTO_RUN_FOLDER_NAME` declaration in `inlineWizardDocumentGeneration.ts:25` and replace all usages with `PLAYBOOKS_DIR`
- [x] Remove local `AUTO_RUN_FOLDER_NAME` declaration in `existingDocsDetector.ts:13` and replace all usages with `PLAYBOOKS_DIR`
- [x] Add `import { PLAYBOOKS_DIR } from '../../shared/maestro-paths';` to each file (adjust relative path as needed)
- [x] Run targeted tests: `CI=1 rtk vitest run` (filter for affected files)

> **Note:** Also updated 7 consumer files (App.tsx, useWizardHandlers.ts, useSessionRestoration.ts, useSessionCrud.ts, DebugWizardModal.tsx, ConversationScreen.tsx, DirectorySelectionScreen.tsx, PhaseReviewScreen.tsx) and 5 test files to import PLAYBOOKS_DIR from shared/maestro-paths. Removed re-exports from Wizard/index.ts and Wizard/services/index.ts. Template variable regex patterns ({{AUTO_RUN_FOLDER_NAME}}) in prompt templates and code correctly preserved. All 255 targeted tests pass.

### 2. Consolidate DEFAULT_CAPABILITIES (2 definitions)

- [x] Verify locations: `main/agents/capabilities.ts:98` (canonical) and `renderer/hooks/agent/useAgentCapabilities.ts:89`
- [x] Move `DEFAULT_CAPABILITIES` to `src/shared/agentConstants.ts` (accessible by both main and renderer)
- [x] Update import in `main/agents/capabilities.ts` to use shared location
- [x] Update import in `renderer/hooks/agent/useAgentCapabilities.ts` to use shared location
- [x] Remove the duplicate definition from the renderer hook
- [x] Run targeted tests: `CI=1 rtk vitest run` (filter for agent capability tests)

> **Note:** Phase 2 (02_AGENT_CAPABILITIES_BUG) had already consolidated the 2 duplicate `DEFAULT_CAPABILITIES` definitions into `src/shared/types.ts`. This task moved the canonical definition from `types.ts` to `agentConstants.ts` (alongside `DEFAULT_CONTEXT_WINDOWS`, `FALLBACK_CONTEXT_WINDOW`, and `COMBINED_CONTEXT_AGENTS`) for better organizational cohesion. A backward-compatible re-export was added to `types.ts`. Updated direct imports in `capabilities.ts`, `useAgentCapabilities.ts`, and `renderer/types/index.ts` to point to the new canonical location. All 42 capability-related tests pass.

### 3. Extract compound CSS className constants

- [x] Create `src/renderer/constants/classNames.ts`
- [x] Add `LIST_ITEM_CLASS = 'w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left'` (used 23x)
- [x] Add `SECTION_LABEL_CLASS = 'block text-xs font-bold opacity-70 uppercase mb-2'` (used 20x)
- [x] Find files using the list item pattern: `rtk grep "w-full flex items-center gap-3 px-3 py-2.5" src/renderer/ --glob "*.tsx"`
- [x] Find files using the section label pattern: `rtk grep "block text-xs font-bold opacity-70 uppercase mb-2" src/renderer/ --glob "*.tsx"`
- [x] Replace inline className strings with the imported constants in all found files
- [x] Run targeted tests after each batch of replacements

> **Note:** Created `src/renderer/constants/classNames.ts` with both constants. Replaced LIST_ITEM_CLASS in 2 files (24 occurrences: 8 in EmptyStateView.tsx, 16 in HamburgerMenuContent.tsx). Replaced SECTION_LABEL_CLASS in 11 files (32 occurrences: 21 exact matches using `className={SECTION_LABEL_CLASS}` and 11 extended matches using `className={\`${SECTION_LABEL_CLASS} flex items-center gap-2\`}`). Files updated: FontConfigurationPanel.tsx, GroupChatModal.tsx, NewInstanceModal.tsx, NotificationsPanel.tsx, SettingCheckbox.tsx, SshRemoteSelector.tsx, FormInput.tsx, SettingsModal.tsx, GeneralTab.tsx, DisplayTab.tsx, EncoreTab.tsx. Lint passes. All 23,659 tests pass; 55 pre-existing failures in unrelated modules (pathUtils, cue, stats, agents IPC).

### 4. Verify full build

- [x] Run lint: `rtk npm run lint`
- [x] Run tests: `CI=1 rtk vitest run`
- [x] Verify types: `rtk tsc -p tsconfig.main.json --noEmit && rtk tsc -p tsconfig.lint.json --noEmit`

> **Note:** All checks pass. Lint clean. TypeScript compiles with zero errors on both tsconfig.main.json and tsconfig.lint.json. Test suite: 23,659 pass / 55 fail - all 55 failures are pre-existing baseline issues in pathUtils, cue, stats, and agents IPC modules (none introduced by Phase 12 changes).

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

- `AUTO_RUN_FOLDER_NAME` aliases removed, using `PLAYBOOKS_DIR` directly
- `DEFAULT_CAPABILITIES` has single definition in shared code
- Top compound CSS patterns extracted to constants
- Lint and tests pass
