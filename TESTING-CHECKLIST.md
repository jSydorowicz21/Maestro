# Dedup Integration Testing Checklist

Test the combined changes from Phases 01A through 05 on branch `dedup/all-phases-integration`.

---

## Phase 01A: Dead Component Deletion

These 7 components were deleted. Verify nothing references them at runtime:

- [ ] Open and close the Agent Sessions Browser (Cmd/Ctrl+Shift+S) - should work normally (AgentSessionsModal was dead, AgentSessionsBrowser is the live replacement)
- [ ] Open Settings > Shortcuts tab - should work (ShortcutEditor was dead, settings still functional)
- [ ] Open Settings > Theme tab - theme picker should work (ThemePicker was dead, ThemeTab is the live component)
- [ ] Start a group chat - right panel participants should render (GroupChatParticipants was dead, GroupChatRightPanel is the live replacement)
- [ ] Trigger a context transfer between sessions - progress modal should appear (MergeProgressModal was dead, TransferProgressModal is live)

## Phase 01B: Dead Store Exports

Store internals were cleaned up. Verify stores still work:

- [ ] Create/delete/rename sessions - sessionStore working
- [ ] Open/close modals (settings, quick actions, new instance) - modalStore working
- [ ] Trigger a notification/toast - notificationStore working
- [ ] Switch between AI tabs within a session - tabStore working
- [ ] Change a setting and restart - settingsStore persists
- [ ] Start a batch run - batchStore working
- [ ] Open file explorer panel - fileExplorerStore working
- [ ] Start a group chat - groupChatStore working

## Phase 01C: Dead Shared Util Exports

Shared utilities were cleaned up. Verify features that used nearby code:

- [ ] Agent display names show correctly in the left bar (agentMetadata.ts touched)
- [ ] Beta badges show on OpenCode and Factory Droid (BETA_AGENTS demoted to private)
- [ ] Git status indicators work in the right panel (gitUtils.ts touched)
- [ ] History panel loads and paginates (history.ts touched)
- [ ] CLI server discovery works (start a second Maestro instance, verify detection)
- [ ] Symphony/group chat labels render correctly (symphony-types.ts touched)
- [ ] File tree renders in the right panel (treeUtils.ts touched)

## Phase 01D: Dead Main Process Exports

Main process internals were cleaned up:

- [ ] Agent detection completes on startup (agents appear in left bar)
- [ ] Group chat starts and moderator works
- [ ] Shell escape works for terminal commands with special characters
- [ ] SSH remote connection works (if configured)
- [ ] Stats/usage data loads in Usage Dashboard

## Phase 02: AgentCapabilities Consolidation

6 duplicate AgentCapabilities types merged to 1 canonical in shared/types.ts:

- [ ] Claude Code capabilities work: resume, read-only mode, image input, slash commands, session storage, model selection, thinking display
- [ ] Codex capabilities work: batch mode, JSON output
- [ ] OpenCode capabilities work: plan mode
- [ ] Factory Droid capabilities work: batch mode
- [ ] Context merge/export between sessions works
- [ ] Wizard inline conversations work
- [ ] Group chat moderation works
- [ ] The CONTEXT button popover shows all capability-driven fields correctly

## Phase 03A: Mock Session Factory

Test-only changes. No production testing needed, but verify:

- [ ] `npm run test` (or targeted vitest) still passes for session-related tests
- [ ] No runtime errors on app startup (imports are test-only)

## Phase 03B: Mock Theme Factory

Test-only changes:

- [ ] Theme switching works (dark/light themes render correctly)
- [ ] Custom theme builder works
- [ ] No visual regressions in component styling

## Phase 03C: Window Maestro Mocks

Test-only changes:

- [ ] IPC calls work (all window.maestro.* namespaces functional)
- [ ] Settings load/save works
- [ ] File operations work (read, write, list)

## Phase 03D: Mock Tab Factory

Test-only changes:

- [ ] AI tabs create/switch/close correctly
- [ ] File preview tabs work
- [ ] Terminal tabs work
- [ ] Tab export works

## Phase 04: Formatter Consolidation

Production formatters were deduplicated. Check formatting everywhere:

- [ ] Usage Dashboard: costs display correctly ($X.XX format)
- [ ] Usage Dashboard: token counts display correctly (e.g., "12.5K")
- [ ] Usage Dashboard: durations display correctly (e.g., "2m 30s", "1h 15m")
- [ ] Context bar: elapsed time formats correctly
- [ ] History panel: timestamps show correctly (relative time like "2 hours ago")
- [ ] Tab export: timestamps in exported markdown are formatted
- [ ] Group chat export: timestamps formatted correctly
- [ ] Transfer/merge progress modals: elapsed time counter works
- [ ] About modal: session duration displays correctly
- [ ] File sizes in file explorer show correct units (KB, MB, GB)
- [ ] Auto Run: document timestamps render correctly
- [ ] Mobile web: all of the above also work in the mobile interface

## Phase 05: Type Deduplication

Shared types were consolidated. Verify cross-process type compatibility:

- [ ] App boots without TypeScript runtime errors
- [ ] Agent configs load correctly (AgentConfig type consolidated)
- [ ] Usage stats display in header and Usage Dashboard (UsageStats consolidated)
- [ ] Shell selection works in settings (ShellInfo consolidated)
- [ ] File browser directory listing works (DirectoryEntry consolidated)
- [ ] Update checker works (UpdateStatus consolidated)
- [ ] Stats aggregation in Usage Dashboard works (StatsAggregation consolidated)
- [ ] Auto Run sessions tracked correctly (AutoRunSession/AutoRunTask consolidated)
- [ ] Web/mobile WebSocket connection works (types shared to web/)

---

## Quick Smoke Test (covers most of the above)

If you want a fast pass instead of checking every item:

1. [ ] App boots cleanly with `npm run dev:win`
2. [ ] Create a new Claude Code session, send a message, get a response
3. [ ] Open Usage Dashboard - costs, tokens, durations all display correctly
4. [ ] Open History panel - timestamps render, entries expandable
5. [ ] Switch themes (dark to light and back) - no visual breakage
6. [ ] Open Settings - all tabs load, changes persist after restart
7. [ ] Create a group chat with 2 agents - moderator works
8. [ ] Open Agent Sessions Browser - sessions list and load
9. [ ] Click CONTEXT button in header - popover renders fully (z-20 fix)
10. [ ] Open file explorer - tree renders, files openable
11. [ ] Start an Auto Run - document loads, progress shows
12. [ ] Export a tab to markdown - formatting correct
13. [ ] Run `npm run test` - no new failures vs baseline

---

## Known Issues (NOT caused by dedup)

- `npm run dev` does not work on Windows with Node 25+ (use `npm run dev:win` instead). Regression from commit 4d01c32ec on origin/rc.
- Context Details popover clipped by chat area without the local z-20 patch. Fix PRs: #799 (rc), #800 (main).
- Pre-existing test flakes: BatchRunnerModal "Agent Prompt Validation" STACK_TRACE, Windows path failures in cue-yaml-loader/pathUtils/messageHandlers/agents discovery, transient timeout flakes in useAgentExecution/useSessionRestoration/FileExplorerPanel.
