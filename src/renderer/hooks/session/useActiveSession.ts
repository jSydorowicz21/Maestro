import { useSessionStore, selectActiveSession } from '../../stores/sessionStore';
import type { Session } from '../../types';

/**
 * Returns the currently active session from the store.
 * Shorthand for `useSessionStore(selectActiveSession)`.
 *
 * Falls back to the first session if activeSessionId doesn't match, then null.
 *
 * NOTE: For callback-scope access (not in render), use
 * `selectActiveSession(useSessionStore.getState())` instead.
 */
export function useActiveSession(): Session | null {
	return useSessionStore(selectActiveSession);
}
