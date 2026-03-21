# E2E Test Harness

End-to-end tests for Maestro using Playwright with Electron integration.

## Running Tests

```bash
# Run all E2E tests
npx playwright test

# Run a specific project (spec group)
npx playwright test --project=infrastructure
npx playwright test --project=session-management

# Run a specific test file
npx playwright test e2e/specs/01-infrastructure/app-launch.spec.ts

# Run with headed browser (visible window)
npx playwright test --headed

# Run with Playwright UI mode
npx playwright test --ui

# View the HTML report after a run
npx playwright show-report
```

## Directory Structure

```
e2e/
├── fixtures/                  # Playwright test fixtures
│   ├── electron-app.ts        # Launches and manages the Electron app
│   ├── mock-agent.ts          # Injects the mock agent for deterministic tests
│   ├── session-factory.ts     # Creates sessions with pre-configured state
│   └── dialog-mock.ts         # Intercepts native Electron dialogs
├── mock-agent/                # Mock agent implementation
│   ├── mock-claude.mjs        # Lightweight Node script mimicking agent behavior
│   └── responses/             # Canned response files for different scenarios
├── specs/                     # Test spec directories (ordered by dependency)
│   ├── 01-infrastructure/     # App launch, window basics, IPC connectivity
│   ├── 02-session-management/ # Creating, switching, renaming, deleting sessions
│   ├── 03-agent-interaction/  # Sending prompts, receiving output, agent states
│   ├── 04-tab-management/     # Tab creation, reordering, closing, file preview
│   ├── 05-keyboard-navigation/# Keyboard shortcuts, focus management
│   ├── 06-settings/           # Settings persistence, theme switching
│   ├── 07-right-panel/        # Right panel tabs (Files, History, Auto Run)
│   ├── 08-modal-system/       # Modal opening, closing, stacking, escape handling
│   ├── 09-error-handling/     # Error boundaries, agent crash recovery
│   └── 10-advanced/           # Complex workflows spanning multiple features
├── utils/                     # Shared test utilities
│   ├── selectors.ts           # Centralized UI selectors (data-testid constants)
│   ├── keyboard.ts            # Keyboard shortcut helpers
│   └── wait-helpers.ts        # Custom wait/polling utilities
├── autorun-*.spec.ts          # Auto Run feature tests (top-level)
└── README.md                  # This file
```

## How Tests Are Organized

Tests use Playwright **projects** with dependency chains defined in `playwright.config.ts`:

- `infrastructure` runs first (no dependencies) - validates the app can launch
- Most spec groups depend on `infrastructure` and run in parallel after it passes
- `advanced` depends on `session-management` since it builds on session workflows
- `autorun` is a standalone project matching top-level `autorun-*.spec.ts` files

## Fixtures

Tests compose fixtures to get the environment they need. Import from the fixtures directory:

| Fixture | Purpose |
|---------|---------|
| `electron-app` | Launches the built Electron app, provides the `ElectronApplication` and `Page` objects |
| `mock-agent` | Starts the mock agent server so tests get deterministic, instant responses |
| `session-factory` | Creates pre-configured sessions (with agent, workspace, tabs) for tests that need existing state |
| `dialog-mock` | Intercepts `showOpenDialog`, `showSaveDialog`, and `showMessageBox` to prevent native dialogs from blocking tests |

Fixtures are designed to compose. A test that needs a session with a mock agent would use both `electron-app`, `mock-agent`, and `session-factory`.

## Mock Agent

The mock agent (`mock-agent/mock-claude.mjs`) is a lightweight Node script that:

- Accepts input on stdin, produces output on stdout (mimicking the real agent protocol)
- Returns canned responses from the `responses/` directory
- Supports configurable delays and error injection for testing edge cases
- Runs as a child process, same as a real agent would

This lets E2E tests run without network calls or API keys.

## Adding a New Test Spec

1. Identify which spec group your test belongs to (e.g., `04-tab-management`)
2. Create a new `.spec.ts` file in that directory
3. Import the session-factory fixture (provides a window with a session already created):
   ```typescript
   import { test, expect } from '../../fixtures/session-factory';
   import { SELECTORS } from '../../utils/selectors';

   test.describe('My Feature', () => {
     test('should do something', async ({ windowWithSession }) => {
       // windowWithSession is a Playwright Page with full UI rendered
       await expect(windowWithSession.locator(SELECTORS.INPUT_AREA)).toBeVisible();
     });
   });
   ```
4. Write your test using Playwright's `test` and `expect` APIs
5. Use selectors from `utils/selectors.ts` for UI elements
6. Use keyboard shortcuts instead of clicking right panel tabs (header-controls can intercept clicks)
6. If you need a new selector, add it to `selectors.ts` and the corresponding `data-testid` attribute in the source component

## Adding New Selectors

All test selectors live in `e2e/utils/selectors.ts`. When adding UI elements that tests need to target:

1. Add a `data-testid` attribute to the React component
2. Add the matching constant to `selectors.ts`
3. Use the constant in your test (never hardcode selector strings in specs)

## CI Pipeline

E2E tests run in GitHub Actions after the unit test job passes:

- The `e2e` job depends on the `test` job
- Runs on Ubuntu with `xvfb-run` for headless Electron rendering
- Installs Chromium via `npx playwright install --with-deps chromium`
- Builds the app with `npm run build` before testing
- On failure, uploads `e2e-results/` as a GitHub Actions artifact (traces, screenshots, videos)

## Troubleshooting

**Tests fail with "Cannot find module" or build errors**
- Run `npm run build` before running E2E tests. The Electron app must be built first.

**Tests hang or timeout on Linux**
- Electron needs a display server. Use `xvfb-run --auto-servernum npx playwright test`.

**Flaky tests on CI**
- CI retries failed tests up to 2 times (configured in `playwright.config.ts`).
- Check the uploaded `e2e-results` artifact for traces and screenshots.

**"GPU process isn't usable" errors**
- Set `ELECTRON_DISABLE_GPU=1` in your environment.

**Tests pass locally but fail on CI**
- CI runs with `forbidOnly: true`, so any `test.only()` left in code will fail the build.
- CI uses a single worker (`workers: 1`) and sequential execution to avoid resource contention.

**Need to debug a specific test**
- Use `npx playwright test --debug` to step through with the Playwright Inspector.
- Use `--project=<name>` to isolate a single spec group.
