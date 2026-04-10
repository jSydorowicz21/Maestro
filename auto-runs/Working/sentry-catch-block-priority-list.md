---
type: analysis
title: Sentry Catch Block Priority List
created: 2026-04-06
tags:
  - sentry
  - error-handling
  - phase-11B
related:
  - '[[11B_SENTRY_ERROR_HANDLING]]'
  - '[[SCAN-PATTERNS]]'
---

# Sentry Catch Block Priority List

Cross-referenced 100+ renderer files + 16 main process files with `console.error` against
47 files already using `captureException`/`captureMessage`. Below are files that have
`console.error` in catch blocks but **lack** Sentry reporting, grouped by priority.

---

## P1 - Critical: Main Process Infrastructure

These are main process files where failures silently drop events or break handler registration.

| File                                   | Catch Block Context          | Why MUST                                                           |
| -------------------------------------- | ---------------------------- | ------------------------------------------------------------------ |
| `src/main/cue/cue-file-watcher.ts:69`  | File watcher error callback  | Silent event drops - Cue subscriptions stop working without notice |
| `src/main/ipc/handlers/context.ts:440` | Handler registration failure | IPC handler not registered - feature silently broken               |

---

## P2 - High: Renderer Stores (Data Pipeline)

Stores manage application state. Failures here can corrupt data or silently lose user work.

| File                                        | Catch Block Context                            | Why MUST                                     |
| ------------------------------------------- | ---------------------------------------------- | -------------------------------------------- |
| `src/renderer/stores/sessionStore.ts`       | Session state operations                       | Session data corruption risk                 |
| `src/renderer/stores/settingsStore.ts`      | Settings persistence                           | User settings silently lost                  |
| `src/renderer/stores/agentStore.ts:236,262` | Queue processing - session/tab lookup failures | Agent spawn silently fails, queued work lost |

---

## P3 - High: Renderer Hooks - Agent Lifecycle

Hooks that manage agent spawning, execution, and session state. Failures here
mean agents silently fail to start or user work is lost.

| File                                                        | Catch Block Context       | Why MUST                           |
| ----------------------------------------------------------- | ------------------------- | ---------------------------------- |
| `src/renderer/hooks/agent/useAgentExecution.ts`             | Agent spawn and execution | Core agent spawn failures          |
| `src/renderer/hooks/agent/useAgentListeners.ts`             | Agent event listeners     | Missed agent events, state desync  |
| `src/renderer/hooks/agent/useAgentSessionManagement.ts:290` | Session resume failure    | User loses session state           |
| `src/renderer/hooks/agent/useQueueProcessing.ts:152`        | Queue item processing     | Queued prompts silently dropped    |
| `src/renderer/hooks/agent/useInterruptHandler.ts`           | Agent interrupt handling  | Interrupt fails silently           |
| `src/renderer/hooks/session/useSessionRestoration.ts`       | Session restoration       | Data corruption on restore         |
| `src/renderer/hooks/session/useSessionCrud.ts`              | Session CRUD operations   | Data loss on create/update/delete  |
| `src/renderer/hooks/batch/useBatchProcessor.ts`             | Batch document processing | Batch items silently fail          |
| `src/renderer/hooks/batch/useDocumentProcessor.ts`          | Document processing       | Document processing silently fails |
| `src/renderer/hooks/ui/useAppHandlers.ts`                   | App-level error handlers  | Top-level failures invisible       |

---

## P4 - Medium: Renderer Services/Utils (Data Operations)

Services and utilities that form the data flow pipeline.

| File                                   | Catch Block Context       | Why MUST                           |
| -------------------------------------- | ------------------------- | ---------------------------------- |
| `src/renderer/services/ipcWrapper.ts`  | IPC call failures         | Silent IPC failures across the app |
| `src/renderer/utils/sessionHelpers.ts` | Session helper operations | Data operations fail silently      |

---

## P5 - Low: Renderer Components (Infrastructure Role)

Components with infrastructure responsibilities beyond pure UI rendering.

| File                                         | Catch Block Context      | Why MUST                     |
| -------------------------------------------- | ------------------------ | ---------------------------- |
| `src/renderer/components/ProcessMonitor.tsx` | Process monitoring       | Missed process state changes |
| `src/renderer/components/SymphonyModal.tsx`  | Group chat orchestration | Group chat silently fails    |

---

## SKIP - Expected/Recoverable Errors

These files have `console.error` in catch blocks for **expected failure modes** where
Sentry reporting would create noise. Each should get a comment explaining why Sentry
is skipped (if not already documented).

### Main Process (SKIP)

| File                              | Reason                                                             |
| --------------------------------- | ------------------------------------------------------------------ |
| `src/main/stores/utils.ts`        | Input validation - user-provided paths may be invalid              |
| `src/main/ipc/handlers/system.ts` | Font detection - has fallback to common fonts                      |
| `src/main/utils/logger.ts`        | Logger's own errors - cannot use Sentry (circular dependency risk) |

### CLI (SKIP - all 17 files)

All CLI files use `console.error` for user-facing error messages. Sentry runs in the
desktop app context, not CLI. These are expected user-facing failures (wrong args,
disconnected app, file not found).

| File                                 | Reason                          |
| ------------------------------------ | ------------------------------- |
| `src/cli/commands/auto-run.ts`       | CLI user errors                 |
| `src/cli/commands/status.ts`         | CLI status failures             |
| `src/cli/commands/send.ts`           | CLI communication errors        |
| `src/cli/commands/run-playbook.ts`   | CLI playbook execution          |
| `src/cli/services/storage.ts`        | File not found (expected)       |
| `src/cli/services/maestro-client.ts` | Network/connection failures     |
| ... (11 more CLI files)              | All CLI-level expected failures |

### Renderer - UI Components (SKIP - ~40 files)

Pure UI components where errors are recoverable and user-visible.

| Category       | Files                                                                                                                                                                                                                                                                | Reason                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Wizard screens | `PhaseReviewScreen`, `ConversationScreen`, `AgentSelectionScreen`, `DirectorySelectionScreen`                                                                                                                                                                        | User input validation                 |
| Modal dialogs  | `AgentSessionsModal`, `MarketplaceModal`, `LightboxModal`, `SendToAgentModal`, `MergeSessionModal`, `ExistingDocsModal`, `AgentCreationDialog`, `NewInstanceModal`, `RenameSessionModal`, `AboutModal`, `DebugPackageModal`, `DebugWizardModal`, `QuickActionsModal` | UI modals with graceful error states  |
| Data display   | `DocumentGraphView`, `LogViewer`, `UsageDashboardModal`, `FileExplorerPanel`, `HistoryPanel`, `UnifiedHistoryTab`, `GroupChatRightPanel`, `GroupChatInfoOverlay`, `NotificationsPanel`, `SpecCommandsPanel`, `AgentSessionsBrowser`                                  | Display failures are visible to user  |
| Visual         | `AutoRunLightbox`, `StandingOvationOverlay`, `AchievementCard`, `MermaidRenderer`                                                                                                                                                                                    | Non-critical visual elements          |
| Settings UI    | `GeneralTab`, `DisplayTab`, `SshRemotesSection`, `AgentConfigPanel`                                                                                                                                                                                                  | Settings UI with visible error states |
| File preview   | `FilePreview` (already has Sentry), `MainPanel`                                                                                                                                                                                                                      | File I/O expected failures            |
| Auto Run UI    | `AutoRun.tsx`, `AutoRunLightbox`                                                                                                                                                                                                                                     | UI rendering                          |

### Renderer - Hooks (SKIP - ~20 files)

Hooks where errors come from expected external failures.

| Category        | Files                                                                                                       | Reason                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Remote/SSH      | `useRemoteIntegration`, `useSshRemotes`, `useLiveMode`, `useLiveOverlay`, `useCliActivityMonitoring`        | Network/SSH timeouts expected           |
| Git/Worktree    | `useWorktreeHandlers`, `useWorktreeValidation`                                                              | Non-git directories expected            |
| Agent detection | `useAvailableAgents`, `useAgentCapabilities`, `useAgentConfiguration`                                       | Agent may not be installed              |
| Batch/Playbook  | `useAutoRunMarkdown`, `useAutoRunContentSync`, `usePlaybookManagement`, `useMarketplace`, `useInlineWizard` | File/network failures expected          |
| Summarization   | `useSummarizeAndContinue`                                                                                   | AI operation, can fail for many reasons |
| UI helpers      | `useTabHandlers`, `useSessionPagination`, `useSessionViewer`, `useInputProcessing`, `useTabExportHandlers`  | UI operations, recoverable              |
| Stats           | `useStats`, `useContributorStats`                                                                           | Analytics, non-critical                 |
| Wizard          | `useWizardHandlers`                                                                                         | User input validation                   |
| Symphony        | `useSymphony`, `useSymphonyContribution`                                                                    | Group chat, can fail                    |
| Cue             | `useCueAutoDiscovery`                                                                                       | Auto-discovery, expected                |

### Renderer - Services/Utils (SKIP)

| File                                | Reason                              |
| ----------------------------------- | ----------------------------------- |
| `contextSummarizer.ts`              | AI summarization, expected failures |
| `specCommands.ts`                   | Command parsing, user input         |
| `inlineWizardDocumentGeneration.ts` | Document generation, expected       |
| `tokenCounter.ts`                   | Token estimation, non-critical      |
| `fileExplorer.ts`                   | File system, expected failures      |
| `gitDiffParser.ts`                  | Parsing, malformed input expected   |
| `contextExtractor.ts`               | Extraction, expected                |

---

## Summary

| Priority       | Category                         | File Count | Action                          |
| -------------- | -------------------------------- | ---------- | ------------------------------- |
| P1             | Main process infrastructure      | 2          | Add `captureException`          |
| P2             | Renderer stores                  | 3          | Add `captureException`          |
| P3             | Renderer hooks (agent lifecycle) | 10         | Add `captureException`          |
| P4             | Renderer services/utils          | 2          | Add `captureException`          |
| P5             | Renderer components (infra)      | 2          | Add `captureException`          |
| SKIP           | Expected/recoverable             | ~80+       | Add skip comments where missing |
| **Total MUST** |                                  | **19**     |                                 |
| **Total SKIP** |                                  | **~80+**   |                                 |

### Already covered (47 files have Sentry)

These files already import and use `captureException` or `captureMessage`:

- Main: `group-chat-router`, `claude-session-storage`, `codex-session-storage`, `opencode-session-storage`, `factory-droid-session-storage`, `process-manager`, `cue-engine`, `detector`, `history-manager`, `shared-history-manager`, `bmad-manager`, `window-manager`, IPC handlers (`process`, `git`)
- Renderer: `App.tsx`, `ErrorBoundary`, `useAppInitialization`, `useRemoteHandlers`, `useAutoRunHandlers`, `useBatchHandlers`, `useWorktreeManager`, `useMergeTransferHandlers`, `useSessionLifecycle`, `useFileExplorerEffects`, `usePipelineLayout`, `usePipelineState`, `FilePreview`, `FilePreviewHeader`, `ChartErrorBoundary`, `TerminalView`, `CueModal`, `WorktreeRunSection`, `QRCode`, `BmadCommandsPanel`, `AutoRunStats`, `TasksByHourChart`, `LongestAutoRunsTable`, `EncoreTab`, `main.tsx`, `sentry.ts`
