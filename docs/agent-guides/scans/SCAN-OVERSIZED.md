# SCAN-OVERSIZED.md - Oversized Files

Generated: 2026-03-20
Refreshed: 2026-04-10 against `origin/rc` (06e5a2eb3)

Methodology: `wc -l` across `src/` excluding `node_modules`. Tests and sources counted separately.

---

## Source Files Over 800 Lines (excluding tests)

| Lines | File                                                          | Delta since 2026-03-20                                 |
| ----- | ------------------------------------------------------------- | ------------------------------------------------------ |
| 3350  | `web/mobile/App.tsx`                                          | +2020 **NEW critical** (was 1330)                      |
| 3318  | `main/ipc/handlers/symphony.ts`                               | unchanged                                              |
| 3093  | `renderer/App.tsx`                                            | **-941 (partial decomp in rc)**, still 3x target       |
| 3057  | `renderer/global.d.ts`                                        | **NEW critical**, not previously flagged               |
| 2620  | `renderer/components/SymphonyModal.tsx`                       | +10                                                    |
| 2448  | `main/web-server/handlers/messageHandlers.ts`                 | +1497 **NEW critical** (was 951)                       |
| 2300  | `generated/prompts.ts`                                        | +325 (generated file, exclude from dedup)              |
| 2136  | `renderer/components/DocumentGraph/DocumentGraphView.tsx`     | -6                                                     |
| 2107  | `renderer/utils/tabHelpers.ts`                                | +179                                                   |
| 2092  | `renderer/hooks/batch/useBatchProcessor.ts`                   | +45                                                    |
| 2037  | `main/group-chat/group-chat-router.ts`                        | +462 **REGRESSION**                                    |
| 1992  | `renderer/stores/settingsStore.ts`                            | +69                                                    |
| 1975  | `renderer/components/ProcessMonitor.tsx`                      | +226 **REGRESSION**                                    |
| 1950  | `renderer/components/QuickActionsModal.tsx`                   | +282 **REGRESSION**                                    |
| 1908  | `main/ipc/handlers/claude.ts`                                 | unchanged                                              |
| 1895  | `renderer/components/TerminalOutput.tsx`                      | +110                                                   |
| 1815  | `main/web-server/web-server-factory.ts`                       | **NEW** (not previously flagged)                       |
| 1759  | `main/storage/opencode-session-storage.ts`                    | unchanged                                              |
| 1650  | `renderer/hooks/tabs/useTabHandlers.ts`                       | +25                                                    |
| 1626  | `renderer/components/FileExplorerPanel.tsx`                   | +87                                                    |
| 1614  | `renderer/hooks/agent/useAgentListeners.ts`                   | +36                                                    |
| 1614  | `main/storage/codex-session-storage.ts`                       | +222                                                   |
| 1608  | `renderer/components/PlaygroundPanel.tsx`                     | unchanged                                              |
| 1575  | `web/mobile/AllSessionsView.tsx`                              | **NEW**                                                |
| 1538  | `renderer/components/AgentSessionsBrowser.tsx`                | +4                                                     |
| 1479  | `renderer/components/Wizard/screens/ConversationScreen.tsx`   | -42                                                    |
| 1468  | `renderer/hooks/batch/useInlineWizard.ts`                     | **NEW**                                                |
| 1441  | `renderer/components/MarketplaceModal.tsx`                    | +7                                                     |
| 1437  | `main/ipc/handlers/git.ts`                                    | -23                                                    |
| 1411  | `web/mobile/MobileHistoryPanel.tsx`                           | unchanged                                              |
| 1377  | `renderer/components/SessionList/SessionList.tsx`             | +38                                                    |
| 1375  | `renderer/components/LeaderboardRegistrationModal.tsx`        | unchanged                                              |
| 1368  | `renderer/components/Wizard/services/phaseGenerator.ts`       | +15                                                    |
| 1366  | `renderer/components/DocumentGraph/MindMap.tsx`               | unchanged                                              |
| 1358  | `renderer/components/Wizard/screens/AgentSelectionScreen.tsx` | -67                                                    |
| 1354  | `web/mobile/LeftPanel.tsx`                                    | **NEW**                                                |
| 1341  | `renderer/hooks/wizard/useWizardHandlers.ts`                  | +12                                                    |
| 1334  | `renderer/components/InputArea.tsx`                           | +162                                                   |
| 1322  | `renderer/components/FilePreview/FilePreview.tsx`             | +2 (already decomposed)                                |
| 1318  | `main/ipc/handlers/agents.ts`                                 | +233                                                   |
| 1313  | `renderer/services/inlineWizardDocumentGeneration.ts`         | +19                                                    |
| 1307  | `renderer/components/DocumentsPanel.tsx`                      | unchanged                                              |
| 1302  | `renderer/components/AchievementCard.tsx`                     | **NEW**                                                |
| 1289  | `web/mobile/SessionPillBar.tsx`                               | +122                                                   |
| 1286  | `main/ipc/handlers/autorun.ts`                                | unchanged                                              |
| 1254  | `web/hooks/useWebSocket.ts`                                   | +320                                                   |
| 1241  | `renderer/hooks/input/useInputProcessing.ts`                  | +45                                                    |
| 1234  | `renderer/components/InlineWizard/DocumentGenerationView.tsx` | unchanged                                              |
| 1228  | `renderer/components/UsageDashboard/UsageDashboardModal.tsx`  | unchanged                                              |
| 1200  | `renderer/components/DocumentGraph/graphDataBuilder.ts`       | unchanged                                              |
| 1161  | `main/storage/claude-session-storage.ts`                      | +19                                                    |
| 1156  | `renderer/components/FeedbackChatView.tsx`                    | **NEW**                                                |
| 1129  | `main/preload/process.ts`                                     | **NEW**                                                |
| 1105  | `renderer/components/Settings/tabs/GeneralTab.tsx`            | +43                                                    |
| 1094  | `renderer/components/AppModals/AppModals.tsx`                 | +38                                                    |
| 1088  | `renderer/stores/modalStore.ts`                               | +22                                                    |
| 1070  | `web/mobile/ResponseViewer.tsx`                               | unchanged                                              |
| 1060  | `main/ipc/handlers/groupChat.ts`                              | +160                                                   |
| 1055  | `renderer/components/MergeSessionModal.tsx`                   | -10                                                    |
| 1040  | `renderer/components/Wizard/services/conversationManager.ts`  | -9                                                     |
| 1038  | `main/ipc/handlers/feedback.ts`                               | **NEW**                                                |
| 1033  | `renderer/hooks/keyboard/useMainKeyboardHandler.ts`           | +96                                                    |
| 1033  | `renderer/components/TabSwitcherModal.tsx`                    | -13                                                    |
| 1020  | `renderer/components/Wizard/WizardContext.tsx`                | unchanged                                              |
| 1015  | `main/index.ts`                                               | +88                                                    |
| 1011  | `main/ipc/handlers/process.ts`                                | +137                                                   |
| 1006  | `main/parsers/error-patterns.ts`                              | +5                                                     |
| 1000  | `main/ipc/handlers/marketplace.ts`                            | unchanged                                              |
| 999   | `renderer/types/index.ts`                                     | +25                                                    |
| 999   | `renderer/components/Settings/tabs/EncoreTab.tsx`             | **NEW**                                                |
| 989   | `renderer/hooks/modal/useModalHandlers.ts`                    | +24                                                    |
| 975   | `renderer/components/UsageDashboard/ActivityHeatmap.tsx`      | unchanged                                              |
| 971   | `main/ipc/handlers/agentSessions.ts`                          | unchanged                                              |
| 967   | `renderer/components/CueHelpModal.tsx`                        | +24                                                    |
| 962   | `renderer/components/DocumentGraph/mindMapLayouts.ts`         | unchanged                                              |
| 960   | `web/mobile/RightDrawer.tsx`                                  | **NEW**                                                |
| 952   | `main/web-server/WebServer.ts`                                | +1 (new - tracked as factory earlier)                  |
| 951   | `main/parsers/codex-output-parser.ts`                         | **NEW**                                                |
| 949   | `renderer/components/BatchRunnerModal.tsx`                    | unchanged                                              |
| 929   | `web/mobile/TabBar.tsx`                                       | **NEW**                                                |
| 913   | `renderer/components/Wizard/screens/PreparingPlanScreen.tsx`  | -1                                                     |
| 908   | `web/mobile/CommandInputBar.tsx`                              | -27                                                    |
| 885   | `renderer/components/LogViewer.tsx`                           | **NEW**                                                |
| 884   | `renderer/hooks/remote/useRemoteIntegration.ts`               | **NEW**                                                |
| 879   | `renderer/utils/markdownConfig.ts`                            | **NEW**                                                |
| 868   | `renderer/services/inlineWizardConversation.ts`               | -4                                                     |
| 860   | `renderer/components/Wizard/screens/DirectorySelectionScreen.tsx` | unchanged                                          |
| 845   | `renderer/hooks/worktree/useWorktreeHandlers.ts`              | unchanged                                              |
| 844   | `renderer/components/AutoRun/AutoRun.tsx`                     | (decomposed from AutoRun.tsx, was 2287)                |

**Total: 90 source files exceed 800-line limit (was 82).**

### Fully/partially resolved in rc since 2026-03-20

- **`TabBar.tsx`** FULLY RESOLVED. Decomposed into `TabBar/` directory (TabBar.tsx 568, AITab 567, FileTab 567, TerminalTabItem 440, AITabOverlayMenu 371, NewTabPopover 141, SearchPopover 127). Largest file 568 lines.
- **`FilePreview.tsx`** PARTIALLY RESOLVED. Decomposed into `FilePreview/` directory with FilePreviewHeader (412), FilePreviewToc (168), ImageViewer (197), MarkdownImage (202). Main `FilePreview.tsx` is still 1,322 lines.
- **`MainPanel.tsx`** NEWLY RESOLVED (since scan). Decomposed into `MainPanel/` directory (MainPanel 707, MainPanelContent 703, MainPanelHeader 658, AgentErrorBanner 57, CopyNotificationToast 30). Largest 707, all under 800.
- **`AutoRun.tsx`** NEWLY RESOLVED. Decomposed into `AutoRun/` directory (largest file `AutoRun.tsx` at 844 lines, still slightly over target but vastly improved from 2,287).
- **`NewInstanceModal.tsx`** RESOLVED. Decomposed into `NewInstanceModal/` directory, no longer in top list.

### By severity (refreshed):

- **3000+ lines (critical):** 4 files (`web/mobile/App.tsx`, `main/ipc/handlers/symphony.ts`, `renderer/App.tsx`, `renderer/global.d.ts`) — up from 3 in old scan
- **2000-3000 lines:** 7 files (including SymphonyModal, messageHandlers, DocumentGraphView, tabHelpers, useBatchProcessor, group-chat-router)
- **1500-2000 lines:** 10 files
- **1000-1500 lines:** 38 files
- **800-1000 lines:** 31 files

---

## Test Files Over 2000 Lines

| Lines | File                                                                     | Delta since 2026-03-20 |
| ----- | ------------------------------------------------------------------------ | ---------------------- |
| 6208  | `__tests__/main/ipc/handlers/symphony.test.ts`                           | +5                     |
| 5988  | `__tests__/renderer/hooks/useBatchProcessor.test.ts`                     | unchanged              |
| 5907  | `__tests__/renderer/components/TabBar.test.tsx`                          | +155                   |
| 4469  | `__tests__/main/ipc/handlers/git.test.ts`                                | +14                    |
| 3536  | `__tests__/renderer/components/AutoRun.test.tsx`                         | +22                    |
| 3474  | `__tests__/renderer/components/MainPanel.test.tsx`                       | +14                    |
| 3465  | `__tests__/renderer/utils/tabHelpers.test.ts`                            | +335                   |
| 3291  | `__tests__/renderer/components/SessionList.test.tsx`                     | +53                    |
| 3176  | `__tests__/renderer/components/DocumentGraph/DocumentGraphView.test.tsx` | unchanged              |
| 3101  | `__tests__/integration/symphony.integration.test.ts`                     | unchanged              |
| 3007  | `__tests__/renderer/components/AgentSessionsBrowser.test.tsx`            | unchanged              |
| 2981  | `__tests__/main/cue/cue-engine.test.ts`                                  | +205                   |
| 2791  | `__tests__/integration/provider-integration.test.ts`                     | unchanged              |
| 2676  | `__tests__/renderer/hooks/useMainKeyboardHandler.test.ts`                | +168                   |
| 2642  | `__tests__/renderer/components/NewInstanceModal.test.tsx`                | -47                    |
| 2581  | `__tests__/renderer/components/SettingsModal.test.tsx`                   | +112                   |
| 2547  | `__tests__/renderer/components/TabSwitcherModal.test.tsx`                | +10                    |
| 2508  | `__tests__/renderer/hooks/useWizardHandlers.test.ts`                     | +1                     |
| 2506  | `__tests__/renderer/components/BatchRunnerModal.test.tsx`                | unchanged              |
| 2504  | `__tests__/web/mobile/App.test.tsx`                                      | +178                   |
| 2465  | `__tests__/renderer/components/AgentSessionsModal.test.tsx`              | unchanged              |
| 2325  | `__tests__/renderer/components/TerminalOutput.test.tsx`                  | +101                   |
| 2263  | `__tests__/renderer/components/InputArea.test.tsx`                       | +1                     |
| 2176  | `__tests__/main/agents/session-storage.test.ts`                          | +32                    |
| 2166  | `__tests__/renderer/components/Wizard/WizardIntegration.test.tsx`        | unchanged              |
| 2147  | `__tests__/main/ipc/handlers/process.test.ts`                            | **NEW**                |
| 2103  | `__tests__/main/ipc/handlers/claude.test.ts`                             | unchanged              |
| 2065  | `__tests__/web/hooks/useWebSocket.test.ts`                               | unchanged              |
| 2013  | `__tests__/renderer/components/ProcessMonitor.test.tsx`                  | **NEW**                |
| 2007  | `__tests__/renderer/components/UsageDashboardModal.test.tsx`             | unchanged              |

**Total: 30 test files exceed 2000-line limit (was 28).**

---

## Summary

| Metric                    | Count | Delta        |
| ------------------------- | ----- | ------------ |
| Source files > 800 lines  | 90    | +8           |
| Source files > 2000 lines | 11    | +1           |
| Source files > 3000 lines | 4     | +1           |
| Test files > 2000 lines   | 30    | +2           |
| Files with 20+ functions  | ~12   | needs re-scan |

### Top 5 worst offenders (current):

1. **`web/mobile/App.tsx`** - 3,350 lines. Ballooned from 1,330 due to mobile UX parity work. **NEW critical target.**
2. **`main/ipc/handlers/symphony.ts`** - 3,318 lines, 49 functions. Unchanged since scan. Still #1 decomposition priority.
3. **`renderer/App.tsx`** - 3,093 lines. **Down from 4,034** (partial decomposition landed in rc). Still 3x the 1,000-line target.
4. **`renderer/global.d.ts`** - 3,057 lines. **NEW critical target** — previously not flagged. Type-only file but warrants split by domain.
5. **`renderer/components/SymphonyModal.tsx`** - 2,620 lines. Unchanged since scan. #1 component decomposition target.

### Notable regressions:

- **`main/group-chat/group-chat-router.ts`**: +462 lines (1,575 → 2,037)
- **`renderer/components/ProcessMonitor.tsx`**: +226 lines (1,749 → 1,975)
- **`renderer/components/QuickActionsModal.tsx`**: +282 lines (1,668 → 1,950)
- **`main/web-server/handlers/messageHandlers.ts`**: +1,497 lines (951 → 2,448)
- **`web/mobile/App.tsx`**: +2,020 lines (1,330 → 3,350)

### Notable wins:

- **`renderer/App.tsx`**: -941 lines (4,034 → 3,093)
- **`renderer/components/TabBar.tsx`**: 2,839 → 568 (directory split)
- **`renderer/components/MainPanel.tsx`**: 1,987 → 707 (directory split)
- **`renderer/components/AutoRun.tsx`**: 2,287 → 844 (directory split)
- **`renderer/components/NewInstanceModal.tsx`**: 1,845 → <800 (directory split)
