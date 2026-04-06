# Phase 11-A: Migrate console.log to Structured Logger

## Objective

Replace 130+ `console.log` calls in the group chat router (and 26 in group-chat-agent) with the structured logger from `main/utils/logger.ts`. Also address high-frequency console.log in other main process files.

**Evidence:** `docs/agent-guides/scans/SCAN-MAIN.md`, "console.log vs logger Usage by File"
**Risk:** Low - logging changes don't affect behavior, only observability
**Estimated savings:** Improved debuggability, no net line count change

---

## Pre-flight Checks

- [x] Phase 10 (modal/spawn consolidation) is complete
- [x] `rtk npm run lint` passes

---

## Important Notes

- **DO NOT change log levels blindly.** Read each `console.log` to determine appropriate level:
  - `logger.debug()` - detailed debugging info (most console.logs)
  - `logger.info()` - notable state transitions
  - `logger.warn()` - unexpected but recoverable situations
  - `logger.error()` - actual errors (should already be console.error)
- **Preserve the log message content.** Only change the function call, not the message.
- **DO NOT touch `src/main/cue/` files** - under active development.

---

## Tasks

### 1. Read the logger API

- [x] Read `src/main/utils/logger.ts` to understand available log levels
  - Levels: `debug`, `info`, `warn`, `error`, `toast`, `autorun`, `cue`
- [x] Note how to create a scoped logger (e.g., `createLogger('group-chat-router')`)
  - No `createLogger` factory exists. Codebase pattern: singleton `logger` + context string constant (e.g., `const LOG_CONTEXT = 'group-chat-router'`; `logger.info('msg', LOG_CONTEXT)`)
- [x] Note any structured data parameters (e.g., `logger.info('msg', { key: value })`)
  - Signature: `logger.info(message: string, context?: string, data?: unknown)` - structured data is the third parameter

### 2. Create scoped loggers for group chat files

- [x] Add `import { createLogger } from '../utils/logger';` and `const logger = createLogger('group-chat-router');` at top of `group-chat-router.ts`
  - **Already present:** `import { logger }` (line 37) and `const LOG_CONTEXT = '[GroupChatRouter]'` (line 48) were already in place. No `createLogger` factory exists - codebase uses singleton `logger` + `LOG_CONTEXT` pattern.
- [x] Add `const logger = createLogger('group-chat-agent');` at top of `group-chat-agent.ts`
  - Added `import { logger } from '../utils/logger'` and `const LOG_CONTEXT = '[GroupChatAgent]'` following codebase convention (no `createLogger` exists).

### 3. Migrate group-chat-router.ts (130 calls)

- [x] Work section by section through the file
- [x] Replace `console.log('[GroupChat] ...')` with `logger.info('...')` or `logger.debug('...')` based on message importance
- [x] For messages with data objects: use `logger.debug('msg', { data })` instead of `console.log('msg:', data)`
- [x] Preserve all existing log message content
- [x] Run targeted tests after completing: `CI=1 rtk vitest run` (filter for group-chat-router tests)
  - All 4 related test files pass (group-chat-router.test.ts, group-chat.integration.test.ts). Zero console.* calls remain in the file. Log levels assigned: debug for trace/diagnostic, info for significant actions (spawn success, history entries, auto-add, synthesis start), warn for recoverable warnings, error for failure cases.

### 4. Migrate group-chat-agent.ts (26 calls)

- [x] Apply same pattern as Task 3
- [x] Run targeted tests: `CI=1 rtk vitest run` (filter for group-chat-agent tests)
  - All 71 tests pass across group-chat-agent.test.ts (22 tests) and groupChat.test.ts (49 tests). Zero console.* calls remain. Log levels: debug for trace/diagnostic messages, info for notable state (participant already exists, participant added), error for failure cases (chat not found, moderator not active, agent not available, spawn failed) with structured data context.

### 5. Migrate other high-frequency files

- [ ] Migrate `useRemoteHandlers.ts` (14 calls) - use `console.debug` or renderer-side logger
- [ ] Migrate `phaseGenerator.ts` (14 calls)
- [ ] Migrate `graphDataBuilder.ts` (11 calls)
- [ ] Migrate `groupChat.ts` IPC handler (11 calls)
- [ ] Run targeted tests after each file

### 6. Verify full build

- [ ] Run lint: `rtk npm run lint`
- [ ] Run tests: `CI=1 rtk vitest run`
- [ ] Verify types: `rtk tsc -p tsconfig.main.json --noEmit && rtk tsc -p tsconfig.lint.json --noEmit`

### 7. Count remaining raw console.log in group chat

- [ ] Run: `rtk grep "console\.log" src/main/group-chat/ --glob "*.ts"`
- [ ] Target: 0 remaining

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

- 130+ console.log calls in group-chat-router.ts replaced with structured logger
- 26 calls in group-chat-agent.ts replaced
- Appropriate log levels assigned
- Lint and tests pass
