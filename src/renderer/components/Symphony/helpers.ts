/**
 * Symphony Modal - Shared types, constants, and utility functions
 */

import React from 'react';
import { Play, Pause, AlertCircle, CheckCircle, GitPullRequest, X, Loader2 } from 'lucide-react';
import type { Theme, Session } from '../../types';
import type {
	RegisteredRepository,
	SymphonyIssue,
	ContributionStatus,
} from '../../../shared/symphony-types';
import { COLORBLIND_AGENT_PALETTE } from '../../constants/colorblindPalettes';

// ============================================================================
// Types
// ============================================================================

export interface SymphonyContributionData {
	contributionId: string;
	localPath: string;
	autoRunPath?: string;
	branchName?: string;
	draftPrNumber?: number;
	draftPrUrl?: string;
	agentType: string;
	sessionName: string;
	repo: RegisteredRepository;
	issue: SymphonyIssue;
	customPath?: string;
	customArgs?: string;
	customEnvVars?: Record<string, string>;
}

export interface SymphonyModalProps {
	theme: Theme;
	isOpen: boolean;
	onClose: () => void;
	onStartContribution: (data: SymphonyContributionData) => void;
	sessions: Session[];
	onSelectSession: (sessionId: string) => void;
}

export type ModalTab = 'projects' | 'active' | 'history' | 'stats';

// ============================================================================
// Status Colors (Colorblind-Accessible)
// ============================================================================

export const STATUS_COLORS: Record<string, string> = {
	cloning: COLORBLIND_AGENT_PALETTE[0], // #0077BB (Strong Blue)
	creating_pr: COLORBLIND_AGENT_PALETTE[0], // #0077BB
	running: COLORBLIND_AGENT_PALETTE[2], // #009988 (Teal - success)
	paused: COLORBLIND_AGENT_PALETTE[1], // #EE7733 (Orange - warning)
	completed: COLORBLIND_AGENT_PALETTE[2], // #009988 (Teal - success)
	completing: COLORBLIND_AGENT_PALETTE[0], // #0077BB
	ready_for_review: COLORBLIND_AGENT_PALETTE[8], // #AA4499 (Purple)
	failed: COLORBLIND_AGENT_PALETTE[3], // #CC3311 (Vermillion - error)
	cancelled: COLORBLIND_AGENT_PALETTE[6], // #BBBBBB (Gray)
};

// ============================================================================
// Helpers
// ============================================================================

export const compactNumber = new Intl.NumberFormat('en', {
	notation: 'compact',
	maximumFractionDigits: 1,
});

export function formatCacheAge(cacheAgeMs: number | null): string {
	if (cacheAgeMs === null || cacheAgeMs === 0) return 'just now';
	const seconds = Math.floor(cacheAgeMs / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	if (hours > 0) return `${hours}h ago`;
	if (minutes > 0) return `${minutes}m ago`;
	return 'just now';
}

export function formatDurationMs(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	if (totalSeconds < 60) return `${totalSeconds}s`;
	if (totalSeconds < 3600) return `${Math.floor(totalSeconds / 60)}m`;
	return `${Math.floor(totalSeconds / 3600)}h ${Math.floor((totalSeconds % 3600) / 60)}m`;
}

export function formatDate(isoString: string): string {
	return new Date(isoString).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	});
}

export function getStatusInfo(status: ContributionStatus): {
	label: string;
	color: string;
	icon: React.ReactNode;
} {
	const icons: Record<string, React.ReactNode> = {
		cloning: React.createElement(Loader2, { className: 'w-3 h-3 animate-spin' }),
		creating_pr: React.createElement(Loader2, { className: 'w-3 h-3 animate-spin' }),
		running: React.createElement(Play, { className: 'w-3 h-3' }),
		paused: React.createElement(Pause, { className: 'w-3 h-3' }),
		completed: React.createElement(CheckCircle, { className: 'w-3 h-3' }),
		completing: React.createElement(Loader2, { className: 'w-3 h-3 animate-spin' }),
		ready_for_review: React.createElement(GitPullRequest, { className: 'w-3 h-3' }),
		failed: React.createElement(AlertCircle, { className: 'w-3 h-3' }),
		cancelled: React.createElement(X, { className: 'w-3 h-3' }),
	};
	const labels: Record<string, string> = {
		cloning: 'Cloning',
		creating_pr: 'Creating PR',
		running: 'Running',
		paused: 'Paused',
		completed: 'Completed',
		completing: 'Completing',
		ready_for_review: 'Ready for Review',
		failed: 'Failed',
		cancelled: 'Cancelled',
	};
	return {
		label: labels[status] ?? status,
		color: STATUS_COLORS[status] ?? '#6b7280',
		icon: icons[status] ?? null,
	};
}
