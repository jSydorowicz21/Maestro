# Phase 10-B: Consolidate Group Chat Spawn Boilerplate and Store resolve()

## Objective

1. Extract shared `spawnGroupChatAgent()` helper to replace 5 spawn sites with ~150 lines of repeated SSH wrapping + Windows config each
2. Extract shared `resolve<T>()` store utility (1 confirmed copy)

**Evidence:** `docs/agent-guides/scans/SCAN-PATTERNS.md`, "Group chat spawn sites" and "resolve() definitions in stores"
**Risk:** Medium - group chat spawn touches SSH and process management. Test thoroughly.
**Estimated savings:** ~128 lines

---

## Pre-flight Checks

- [x] Phase 10-A (modal layer migration) is complete
- [x] `rtk npm run lint` passes
- [x] `CI=1 rtk vitest run` passes (pre-existing 55 failures, same baseline as 10-A)

---

## Tasks

### Part 1: Group Chat Spawn Helper

### 1. Read the 5 spawn sites and document variations

- [x] Read `main/group-chat/group-chat-agent.ts:226`
- [x] Read `main/group-chat/group-chat-router.ts:583`
- [x] Read `main/group-chat/group-chat-router.ts:976`
- [x] Read `main/group-chat/group-chat-router.ts:1352`
- [x] Read `main/group-chat/group-chat-router.ts:1553`
- [x] Document what parameters vary between sites (agent type, session config, working dir)
  - `agentId`/`toolType`: moderator agent vs participant agent
  - `sessionId`: generated differently per context
  - `cwd`: `os.homedir()` for moderators, `cwd` param for participants
  - `readOnlyMode`: `true` for moderators, `false`/configurable for participants
  - `prompt`: different prompt builders per role
  - `sshRemoteConfig` source: `chat.moderatorConfig`, `sessionOverrides`, or `matchingSession`
  - `customEnvVars`: different fallback chains per site
- [x] Document what is identical across all sites (SSH wrapping, Windows config, process manager call)
  - SSH wrapping: `wrapSpawnWithSsh()` with `SshSpawnWrapConfig` shape, reassigning 6 vars from result
  - Windows config: `getWindowsSpawnConfig()` + conditional shell/runInShell assignment
  - Process manager call: `processManager.spawn()` with same 15 fields
  - Debug logging pattern after spawn

### 2. Design and create the helper

- [x] Create `src/main/group-chat/spawnGroupChatAgent.ts`
- [x] Define `GroupChatSpawnConfig` interface with: `agentId`, `sessionId`, `cwd`, `command`, `args`, `prompt`, `readOnlyMode`, `agent`, `agentConfigValues`, `customEnvVars`, `sshRemoteConfig`
- [x] Implement `spawnGroupChatAgent(config, deps)` function (deps = `{ processManager, sshStore }`)
- [x] Include SSH wrapping logic (via `wrapSpawnWithSsh` when `sshRemoteConfig` is provided and `sshStore` is available)
- [x] Include Windows-specific shell adjustments (via `getWindowsSpawnConfig` which checks `isWindows()` internally)
- [x] Export the function

### 3. Write tests for spawnGroupChatAgent

- [x] Create `src/__tests__/main/group-chat/spawnGroupChatAgent.test.ts`
- [x] Test spawns with basic config (no SSH, no Windows)
- [x] Test wraps with SSH when `sshRemoteConfig.enabled` is true
- [x] Test applies Windows adjustments on win32 platform
- [x] Test passes through custom path, args, and env vars
- [x] Test uses correct agent binary name
- [x] Run tests: `CI=1 rtk vitest run src/__tests__/main/group-chat/spawnGroupChatAgent.test.ts` - 11/11 pass

### 4. Replace the 5 spawn sites

- [x] Replace inline spawn logic at `group-chat-agent.ts:226` with `spawnGroupChatAgent()` call
- [x] Replace inline spawn logic at `group-chat-router.ts:583` with `spawnGroupChatAgent()` call
- [x] Replace inline spawn logic at `group-chat-router.ts:976` with `spawnGroupChatAgent()` call
- [x] Replace inline spawn logic at `group-chat-router.ts:1352` with `spawnGroupChatAgent()` call
- [x] Replace inline spawn logic at `group-chat-router.ts:1553` with `spawnGroupChatAgent()` call
- [x] Run targeted tests after each replacement: `CI=1 rtk vitest run src/__tests__/main/group-chat/` - 242/242 pass

### 5. Verify spawn consolidation

- [x] Run lint: `rtk npm run lint` - passes clean
- [x] Run tests: `CI=1 rtk vitest run` - 23659 pass, 55 fail (pre-existing), zero new failures

### Part 2: Store resolve() Utility

### 6. Check if resolve() is still duplicated

- [x] Run: `rtk grep "function resolve|const resolve" src/renderer/stores/ --glob "*.ts"`
- [x] Found 5 identical copies: `batchStore.ts:86`, `fileExplorerStore.ts:81`, `groupChatStore.ts:136`, `sessionStore.ts:145`, `uiStore.ts:129`. Extraction warranted.

### 7. Extract if multiple copies exist

- [x] Created `src/renderer/stores/utils.ts` with exported `resolve<T>()` function
- [x] Replaced all 5 copies with `import { resolve } from './utils'` in: batchStore, fileExplorerStore, groupChatStore, sessionStore, uiStore
- [x] N/A (5 copies found, extraction performed)

### 8. Verify full build

- [x] Run lint: `rtk npm run lint` - passes clean
- [x] Run tests: `CI=1 rtk vitest run` - 23659 pass, 55 fail (pre-existing), zero new failures
- [x] Verify types: `rtk tsc -p tsconfig.main.json --noEmit && rtk tsc -p tsconfig.lint.json --noEmit` - both compile clean

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

- `spawnGroupChatAgent()` helper created with tests
- 5 spawn sites consolidated
- SSH and Windows patterns handled correctly
- Store `resolve()` extracted if warranted
- Lint and tests pass
