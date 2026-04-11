/**
 * Shared window.maestro mock helpers for tests.
 *
 * Purpose
 * -------
 * `src/__tests__/setup.ts` installs a comprehensive `window.maestro` mock for
 * every test file (all namespaces stubbed with vi.fn() defaults). Tests that
 * need custom behaviour used to reach in with `(window as any).maestro = { ... }`
 * which CLOBBERS the centralized mock and breaks any code under test that
 * touches another namespace. This helper provides a targeted-override API so
 * tests can customise a single namespace without destroying the rest.
 *
 * Usage
 * -----
 *
 * 1. Targeted namespace override (recommended):
 *
 *    import { mockMaestroNamespace } from '../../helpers/mockMaestro';
 *
 *    beforeEach(() => {
 *        mockMaestroNamespace('agents', {
 *            detect: vi.fn().mockResolvedValue([]),
 *            getConfig: vi.fn().mockResolvedValue({ model: 'opus' }),
 *        });
 *    });
 *
 * 2. Reset all mocks between tests:
 *
 *    import { resetMaestroMocks } from '../../helpers/mockMaestro';
 *
 *    afterEach(() => {
 *        resetMaestroMocks();
 *    });
 *
 * 3. Set platform (common case for platform-specific tests):
 *
 *    import { setMaestroPlatform } from '../../helpers/mockMaestro';
 *
 *    beforeEach(() => {
 *        setMaestroPlatform('darwin');
 *    });
 *
 * Do NOT use this helper in tests that need to assert behaviour when
 * window.maestro is undefined/null/missing (e.g. logger.test.ts,
 * platformUtils.test.ts, shortcutFormatter.test.ts). Those are legitimate
 * edge-case tests and should keep their local `(window as any).maestro = ...`
 * pattern.
 */

import { vi } from 'vitest';

type MaestroNamespace = string;
type MaestroOverrides = Record<string, unknown>;

/**
 * Merge overrides into an existing `window.maestro.<namespace>`.
 *
 * Preserves all other namespaces installed by `src/__tests__/setup.ts`.
 * Uses `Object.assign` so existing vi.fn() defaults stay intact unless the
 * caller explicitly replaces them.
 *
 * If the namespace does not exist yet (e.g. tests running outside of jsdom
 * or against a namespace missing from setup.ts), it is created as an empty
 * object first.
 */
export function mockMaestroNamespace(
	namespace: MaestroNamespace,
	overrides: MaestroOverrides
): void {
	if (typeof window === 'undefined') return;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const maestro = (window as any).maestro as Record<string, unknown> | undefined;
	if (!maestro) {
		// setup.ts should have installed it, but guard anyway
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(window as any).maestro = { [namespace]: { ...overrides } };
		return;
	}

	const existing = maestro[namespace];
	if (existing && typeof existing === 'object') {
		Object.assign(existing as object, overrides);
	} else {
		maestro[namespace] = { ...overrides };
	}
}

/**
 * Reset every `vi.fn()` on every `window.maestro.*` namespace.
 *
 * Uses `mockReset()` (not `mockClear()`) so return values and implementations
 * are cleared back to no-op. Safe to call from `beforeEach`/`afterEach`.
 */
export function resetMaestroMocks(): void {
	if (typeof window === 'undefined') return;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const maestro = (window as any).maestro as Record<string, unknown> | undefined;
	if (!maestro) return;

	for (const value of Object.values(maestro)) {
		if (!value || typeof value !== 'object') continue;
		for (const fn of Object.values(value as Record<string, unknown>)) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			if (fn && typeof fn === 'function' && 'mockReset' in (fn as any)) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(fn as any).mockReset();
			}
		}
	}
}

/**
 * Override only `window.maestro.platform` while preserving all other namespaces.
 *
 * Common case for tests that branch on platform (Windows vs macOS vs Linux)
 * without otherwise modifying the maestro mock.
 */
export function setMaestroPlatform(platform: 'darwin' | 'win32' | 'linux' | string): void {
	if (typeof window === 'undefined') return;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const maestro = (window as any).maestro as Record<string, unknown> | undefined;
	if (!maestro) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(window as any).maestro = { platform };
		return;
	}
	maestro.platform = platform;
}
