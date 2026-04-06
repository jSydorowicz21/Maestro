/**
 * useEncoreFeatures - Centralizes all Encore Feature gating logic.
 *
 * Responsibilities:
 * 1. Self-sources encoreFeatures flags from settingsStore
 * 2. Resets modal-open flags when their Encore Feature toggle is disabled
 * 3. Runs Cue auto-discovery (gated by maestroCue flag)
 * 4. Computes pre-gated callbacks that return undefined when their feature is disabled
 * 5. Returns encoreFeatures for pass-through to keyboard handler and AppStandaloneModals
 *
 * Extracted from App.tsx in Phase 13-A, Task 7.
 */
import { useEffect, useMemo } from 'react';
import type { EncoreFeatureFlags, Session } from '../../types';
import { useSettingsStore } from '../../stores/settingsStore';
import { getModalActions } from '../../stores/modalStore';
import { useSessionStore } from '../../stores/sessionStore';
import { useCueAutoDiscovery } from '../useCueAutoDiscovery';

export interface UseEncoreFeaturesDeps {
	handleConfigureCue: (session: Session) => void;
}

export interface UseEncorefeaturesReturn {
	encoreFeatures: EncoreFeatureFlags;
	/** setUsageDashboardOpen gated by usageStats flag */
	gatedSetUsageDashboardOpen: ((open: boolean) => void) | undefined;
	/** Opens Symphony modal, undefined when symphony is disabled */
	gatedOnOpenSymphony: (() => void) | undefined;
	/** Opens Director's Notes modal, undefined when directorNotes is disabled */
	gatedOnOpenDirectorNotes: (() => void) | undefined;
	/** Opens Maestro Cue modal, undefined when maestroCue is disabled */
	gatedOnOpenMaestroCue: (() => void) | undefined;
	/** Configure Cue for a session, undefined when maestroCue is disabled */
	gatedOnConfigureCue: ((session: Session) => void) | undefined;
}

export function useEncoreFeatures(deps: UseEncoreFeaturesDeps): UseEncorefeaturesReturn {
	const encoreFeatures = useSettingsStore((s) => s.encoreFeatures);
	const sessions = useSessionStore((s) => s.sessions);

	// Reset modal-open flags when their Encore Feature toggle is disabled
	useEffect(() => {
		if (!encoreFeatures.symphony) {
			getModalActions().setSymphonyModalOpen(false);
		}
	}, [encoreFeatures.symphony]);

	useEffect(() => {
		if (!encoreFeatures.usageStats) {
			getModalActions().setUsageDashboardOpen(false);
		}
	}, [encoreFeatures.usageStats]);

	// Cue auto-discovery (gated internally by maestroCue flag)
	useCueAutoDiscovery(sessions, encoreFeatures);

	// Pre-gated callbacks: undefined when their feature is disabled
	const gatedSetUsageDashboardOpen = useMemo(
		() =>
			encoreFeatures.usageStats
				? (open: boolean) => getModalActions().setUsageDashboardOpen(open)
				: undefined,
		[encoreFeatures.usageStats]
	);

	const gatedOnOpenSymphony = useMemo(
		() =>
			encoreFeatures.symphony ? () => getModalActions().setSymphonyModalOpen(true) : undefined,
		[encoreFeatures.symphony]
	);

	const gatedOnOpenDirectorNotes = useMemo(
		() =>
			encoreFeatures.directorNotes ? () => getModalActions().setDirectorNotesOpen(true) : undefined,
		[encoreFeatures.directorNotes]
	);

	const gatedOnOpenMaestroCue = useMemo(
		() => (encoreFeatures.maestroCue ? () => getModalActions().setCueModalOpen(true) : undefined),
		[encoreFeatures.maestroCue]
	);

	const gatedOnConfigureCue = useMemo(
		() => (encoreFeatures.maestroCue ? deps.handleConfigureCue : undefined),
		[encoreFeatures.maestroCue, deps.handleConfigureCue]
	);

	return {
		encoreFeatures,
		gatedSetUsageDashboardOpen,
		gatedOnOpenSymphony,
		gatedOnOpenDirectorNotes,
		gatedOnOpenMaestroCue,
		gatedOnConfigureCue,
	};
}
