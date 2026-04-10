/**
 * Symphony Modal - Card and tile components
 *
 * Presentational components for repository tiles, issue cards,
 * contribution cards, and achievement cards.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import {
	ExternalLink,
	GitBranch,
	GitPullRequest,
	GitMerge,
	Clock,
	RefreshCw,
	CheckCircle,
	FileText,
	Hash,
	Lock,
	Star,
	Terminal,
	X,
} from 'lucide-react';
import type { Theme } from '../../types';
import type {
	RegisteredRepository,
	SymphonyIssue,
	ActiveContribution,
	CompletedContribution,
} from '../../../shared/symphony-types';
import { SYMPHONY_CATEGORIES, SYMPHONY_BLOCKING_LABEL } from '../../../shared/symphony-constants';
import type { Achievement } from '../../hooks/symphony/useContributorStats';
import {
	STATUS_COLORS,
	compactNumber,
	formatDurationMs,
	formatDate,
	getStatusInfo,
} from './helpers';

// ============================================================================
// Skeleton Components
// ============================================================================

export function RepositoryTileSkeleton({ theme }: { theme: Theme }) {
	return (
		<div
			className="p-4 rounded-lg border animate-pulse"
			style={{ backgroundColor: theme.colors.bgActivity, borderColor: theme.colors.border }}
		>
			<div className="flex items-center gap-2 mb-2">
				<div className="w-16 h-5 rounded" style={{ backgroundColor: theme.colors.bgMain }} />
			</div>
			<div className="h-5 w-3/4 rounded mb-1" style={{ backgroundColor: theme.colors.bgMain }} />
			<div className="h-4 w-full rounded mb-1" style={{ backgroundColor: theme.colors.bgMain }} />
			<div className="h-4 w-2/3 rounded mb-3" style={{ backgroundColor: theme.colors.bgMain }} />
			<div className="flex justify-between">
				<div className="h-3 w-20 rounded" style={{ backgroundColor: theme.colors.bgMain }} />
				<div className="h-3 w-12 rounded" style={{ backgroundColor: theme.colors.bgMain }} />
			</div>
		</div>
	);
}

// ============================================================================
// Repository Tile
// ============================================================================

export function RepositoryTile({
	repo,
	theme,
	isSelected,
	onSelect,
	issueCount,
}: {
	repo: RegisteredRepository;
	theme: Theme;
	isSelected: boolean;
	onSelect: () => void;
	issueCount: number | null;
}) {
	const tileRef = useRef<HTMLButtonElement>(null);
	const categoryInfo = SYMPHONY_CATEGORIES[repo.category] ?? { label: repo.category, emoji: '📦' };
	const hasNoIssues = issueCount !== null && issueCount === 0;

	useEffect(() => {
		if (isSelected && tileRef.current) {
			tileRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		}
	}, [isSelected]);

	return (
		<button
			ref={tileRef}
			onClick={onSelect}
			className={`p-4 rounded-lg border text-left transition-all hover:scale-[1.02] ${isSelected ? 'ring-2' : ''}`}
			style={{
				backgroundColor: theme.colors.bgActivity,
				borderColor: isSelected ? theme.colors.accent : theme.colors.border,
				opacity: hasNoIssues ? 0.45 : 1,
				...(isSelected && { boxShadow: `0 0 0 2px ${theme.colors.accent}` }),
			}}
		>
			<div className="flex items-center justify-between mb-2">
				<span
					className="px-2 py-0.5 rounded text-xs flex items-center gap-1"
					style={{ backgroundColor: `${theme.colors.accent}20`, color: theme.colors.accent }}
				>
					<span>{categoryInfo.emoji}</span>
					<span>{categoryInfo.label}</span>
				</span>
				{repo.stars != null && (
					<span
						className="flex items-center gap-1 text-xs tabular-nums"
						style={{ color: theme.colors.textDim }}
					>
						<Star className="w-3 h-3" style={{ fill: 'currentColor' }} />
						{compactNumber.format(repo.stars)}
					</span>
				)}
			</div>

			<h3
				className="font-semibold mb-1 line-clamp-1"
				style={{ color: theme.colors.textMain }}
				title={repo.name}
			>
				{repo.name}
			</h3>

			<p className="text-sm line-clamp-2 mb-3" style={{ color: theme.colors.textDim }}>
				{repo.description}
			</p>

			<div
				className="flex items-center justify-between text-xs"
				style={{ color: theme.colors.textDim }}
			>
				<span>{repo.maintainer.name}</span>
				{issueCount === null ? (
					<span className="flex items-center gap-1" style={{ color: theme.colors.accent }}>
						<Hash className="w-3 h-3" />
						View Issues
					</span>
				) : issueCount > 0 ? (
					<span className="flex items-center gap-1" style={{ color: theme.colors.accent }}>
						<Hash className="w-3 h-3" />
						View {issueCount} {issueCount === 1 ? 'Issue' : 'Issues'}
					</span>
				) : (
					<span className="flex items-center gap-1" style={{ color: theme.colors.textDim }}>
						No Issues
					</span>
				)}
			</div>
		</button>
	);
}

// ============================================================================
// Issue Card (for Projects Tab detail view)
// ============================================================================

export function IssueCard({
	issue,
	theme,
	isSelected,
	onSelect,
}: {
	issue: SymphonyIssue;
	theme: Theme;
	isSelected: boolean;
	onSelect: () => void;
}) {
	const isBlocked = issue.labels?.some(
		(l) => l.name.toLowerCase() === SYMPHONY_BLOCKING_LABEL.toLowerCase()
	);
	const isAvailable = issue.status === 'available' && !isBlocked;
	const isClaimed = issue.status === 'in_progress';
	const isSelectable = isAvailable || isBlocked;

	return (
		<div
			role="button"
			tabIndex={isSelectable ? 0 : -1}
			onClick={isSelectable ? onSelect : undefined}
			onKeyDown={
				isSelectable
					? (e) => {
							if (e.target !== e.currentTarget) return;
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								onSelect();
							}
						}
					: undefined
			}
			className={`w-full p-3 rounded-lg border text-left transition-all outline-none focus-visible:ring-2 ${
				isBlocked
					? 'opacity-75 hover:bg-white/5 cursor-pointer'
					: !isAvailable
						? 'opacity-60'
						: 'hover:bg-white/5 cursor-pointer'
			} ${isSelected ? 'ring-2' : ''}`}
			style={{
				backgroundColor: isSelected ? theme.colors.bgActivity : theme.colors.bgMain,
				borderColor: isSelected ? theme.colors.accent : theme.colors.border,
				...(isSelected && { boxShadow: `0 0 0 2px ${theme.colors.accent}` }),
			}}
		>
			<div className="flex items-start justify-between gap-2 mb-1">
				<h4
					className="font-medium text-sm flex items-center gap-2"
					style={{ color: isBlocked ? theme.colors.textDim : theme.colors.textMain }}
				>
					<span className="text-xs" style={{ color: theme.colors.textDim }}>
						#{issue.number}
					</span>
					{issue.title}
				</h4>
				<div className="flex items-center gap-1.5 shrink-0">
					{isBlocked && (
						<span
							className="px-1.5 py-0.5 rounded text-xs flex items-center gap-1"
							style={{
								backgroundColor: `${STATUS_COLORS.cancelled}20`,
								color: STATUS_COLORS.cancelled,
							}}
						>
							<Lock className="w-3 h-3" />
							Blocked
						</span>
					)}
					{isClaimed && (
						<span
							className="px-1.5 py-0.5 rounded text-xs flex items-center gap-1"
							style={{
								backgroundColor: `${STATUS_COLORS.running}20`,
								color: STATUS_COLORS.running,
							}}
						>
							<GitPullRequest className="w-3 h-3" />
							Claimed
						</span>
					)}
				</div>
			</div>

			<div
				className="flex flex-wrap items-center gap-3 text-xs"
				style={{ color: theme.colors.textDim }}
			>
				<span className="flex items-center gap-1">
					<FileText className="w-3 h-3" />
					{issue.documentPaths.length} {issue.documentPaths.length === 1 ? 'document' : 'documents'}
				</span>
				{isClaimed && issue.claimedByPr && (
					<button
						type="button"
						className="flex items-center gap-1 cursor-pointer hover:underline"
						style={{ color: theme.colors.accent, pointerEvents: 'auto' }}
						onClick={(e) => {
							e.stopPropagation();
							window.maestro.shell.openExternal(issue.claimedByPr!.url);
						}}
					>
						<GitPullRequest className="w-3 h-3" />
						{issue.claimedByPr.isDraft ? 'Draft ' : ''}PR #{issue.claimedByPr.number} by @
						{issue.claimedByPr.author}
						<ExternalLink className="w-2.5 h-2.5" />
					</button>
				)}
			</div>

			{issue.documentPaths.length > 0 && (
				<div className="mt-2 text-xs" style={{ color: theme.colors.textDim }}>
					{issue.documentPaths.slice(0, 2).map((doc) => (
						<div key={doc.path} className="truncate">
							• {doc.name}
						</div>
					))}
					{issue.documentPaths.length > 2 && (
						<div>...and {issue.documentPaths.length - 2} more</div>
					)}
				</div>
			)}
		</div>
	);
}

// ============================================================================
// Active Contribution Card
// ============================================================================

export function ActiveContributionCard({
	contribution,
	theme,
	onFinalize,
	onSync,
	isSyncing,
	sessionName,
	onNavigateToSession,
}: {
	contribution: ActiveContribution;
	theme: Theme;
	onFinalize: () => void;
	onSync: () => void;
	isSyncing: boolean;
	sessionName: string | null;
	onNavigateToSession: () => void;
}) {
	const statusInfo = getStatusInfo(contribution.status);
	const docProgress =
		contribution.progress.totalDocuments > 0
			? Math.round(
					(contribution.progress.completedDocuments / contribution.progress.totalDocuments) * 100
				)
			: 0;

	const canFinalize = contribution.status === 'ready_for_review';

	const handleOpenExternal = useCallback((url: string) => {
		window.maestro.shell.openExternal(url);
	}, []);

	return (
		<div
			className="p-4 rounded-lg border"
			style={{ backgroundColor: theme.colors.bgActivity, borderColor: theme.colors.border }}
		>
			<div className="flex items-start justify-between mb-2">
				<div className="flex-1 min-w-0">
					<h4
						className="font-medium text-sm truncate flex items-center gap-2"
						style={{ color: theme.colors.textMain }}
					>
						<span className="text-xs" style={{ color: theme.colors.textDim }}>
							#{contribution.issueNumber}
						</span>
						{contribution.issueTitle}
					</h4>
					<p className="text-xs truncate" style={{ color: theme.colors.textDim }}>
						{contribution.repoSlug}
					</p>
					{sessionName && (
						<button
							onClick={onNavigateToSession}
							className="flex items-center gap-1 text-xs mt-0.5 hover:underline cursor-pointer"
							style={{ color: theme.colors.accent }}
							title={`Go to session: ${sessionName}`}
						>
							<Terminal className="w-3 h-3" />
							<span className="truncate">{sessionName}</span>
						</button>
					)}
				</div>
				<div className="flex items-center gap-2 shrink-0">
					<button
						onClick={onSync}
						disabled={isSyncing}
						className="p-1 rounded hover:bg-white/10 transition-colors disabled:opacity-50"
						title="Sync status with GitHub"
					>
						<RefreshCw
							className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`}
							style={{ color: theme.colors.textDim }}
						/>
					</button>
					<div
						className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs"
						style={{ backgroundColor: statusInfo.color + '20', color: statusInfo.color }}
					>
						{statusInfo.icon}
						<span>{statusInfo.label}</span>
					</div>
				</div>
			</div>

			{contribution.draftPrUrl ? (
				<button
					type="button"
					className="flex items-center gap-1 text-xs mb-2 hover:underline"
					style={{ color: theme.colors.accent }}
					onClick={() => handleOpenExternal(contribution.draftPrUrl!)}
				>
					<GitPullRequest className="w-3 h-3" />
					Draft PR #{contribution.draftPrNumber}
					<ExternalLink className="w-3 h-3" />
				</button>
			) : (
				<div
					className="flex items-center gap-1 text-xs mb-2"
					style={{ color: theme.colors.textDim }}
				>
					<GitBranch className="w-3 h-3" />
					<span>PR will be created on first commit</span>
				</div>
			)}

			<div className="mb-2">
				<div className="flex items-center justify-between text-xs mb-1">
					<span style={{ color: theme.colors.textDim }}>
						{contribution.progress.completedDocuments} / {contribution.progress.totalDocuments}{' '}
						documents
					</span>
					<span style={{ color: theme.colors.textDim }}>
						<Clock className="w-3 h-3 inline mr-1" />
						{formatDurationMs(contribution.timeSpent)}
					</span>
				</div>
				<div
					className="h-1.5 rounded-full overflow-hidden"
					style={{ backgroundColor: theme.colors.bgMain }}
				>
					<div
						className="h-full rounded-full transition-all duration-300"
						style={{ width: `${docProgress}%`, backgroundColor: theme.colors.accent }}
					/>
				</div>
				{contribution.progress.currentDocument && (
					<p className="text-xs mt-1 truncate" style={{ color: theme.colors.textDim }}>
						Current: {contribution.progress.currentDocument}
					</p>
				)}
			</div>

			{contribution.tokenUsage && (
				<div
					className="flex items-center gap-4 text-xs mb-2"
					style={{ color: theme.colors.textDim }}
				>
					<span>In: {Math.round(contribution.tokenUsage.inputTokens / 1000)}K</span>
					<span>Out: {Math.round(contribution.tokenUsage.outputTokens / 1000)}K</span>
					<span>${contribution.tokenUsage.estimatedCost.toFixed(2)}</span>
				</div>
			)}

			{contribution.error && (
				<p
					className="text-xs mb-2 p-2 rounded"
					style={{ backgroundColor: `${STATUS_COLORS.failed}20`, color: STATUS_COLORS.failed }}
				>
					{contribution.error}
				</p>
			)}

			{canFinalize && (
				<button
					onClick={onFinalize}
					className="w-full py-1.5 rounded text-xs flex items-center justify-center gap-1"
					style={{ backgroundColor: theme.colors.accent, color: theme.colors.accentForeground }}
				>
					<GitPullRequest className="w-3 h-3" /> Finalize PR
				</button>
			)}
		</div>
	);
}

// ============================================================================
// Completed Contribution Card
// ============================================================================

export function CompletedContributionCard({
	contribution,
	theme,
}: {
	contribution: CompletedContribution;
	theme: Theme;
}) {
	const handleOpenPR = useCallback(() => {
		window.maestro.shell.openExternal(contribution.prUrl);
	}, [contribution.prUrl]);

	// Check both wasMerged (preferred) and merged (legacy) for backward compatibility
	const isMerged = contribution.wasMerged ?? contribution.merged ?? false;
	const isClosed = contribution.wasClosed ?? false;

	// Format token count (e.g., 666.0K)
	const totalTokens = contribution.tokenUsage.inputTokens + contribution.tokenUsage.outputTokens;
	const formattedTokens =
		totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}K` : String(totalTokens);

	return (
		<div
			className="p-4 rounded-lg border"
			style={{ backgroundColor: theme.colors.bgActivity, borderColor: theme.colors.border }}
		>
			<div className="flex items-start justify-between mb-2">
				<div className="flex-1 min-w-0">
					<h4
						className="font-medium text-sm truncate flex items-center gap-2"
						style={{ color: theme.colors.textMain }}
					>
						<span className="text-xs" style={{ color: theme.colors.textDim }}>
							#{contribution.issueNumber}
						</span>
						{contribution.issueTitle}
					</h4>
					<p className="text-xs truncate" style={{ color: theme.colors.textDim }}>
						{contribution.repoSlug}
					</p>
				</div>
				{isMerged ? (
					<span
						className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs"
						style={{
							backgroundColor: `${STATUS_COLORS.ready_for_review}20`,
							color: STATUS_COLORS.ready_for_review,
						}}
					>
						<GitMerge className="w-3 h-3" /> Merged
					</span>
				) : isClosed ? (
					<span
						className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs"
						style={{
							backgroundColor: `${STATUS_COLORS.cancelled}20`,
							color: STATUS_COLORS.cancelled,
						}}
					>
						<X className="w-3 h-3" /> Closed
					</span>
				) : (
					<span
						className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs"
						style={{ backgroundColor: `${STATUS_COLORS.running}20`, color: STATUS_COLORS.running }}
					>
						<GitPullRequest className="w-3 h-3" /> Open
					</span>
				)}
			</div>

			<div className="flex items-center gap-3 text-xs mb-2">
				<span style={{ color: theme.colors.textDim }}>
					Completed {formatDate(contribution.completedAt)}
				</span>
				<button
					onClick={handleOpenPR}
					className="flex items-center gap-1 hover:underline"
					style={{ color: theme.colors.accent }}
				>
					<GitPullRequest className="w-3 h-3" />
					PR #{contribution.prNumber}
					<ExternalLink className="w-2.5 h-2.5" />
				</button>
			</div>

			<div className="grid grid-cols-4 gap-2 text-xs">
				<div>
					<span style={{ color: theme.colors.textDim }}>Documents</span>
					<p style={{ color: theme.colors.textMain }}>{contribution.documentsProcessed}</p>
				</div>
				<div>
					<span style={{ color: theme.colors.textDim }}>Tasks</span>
					<p style={{ color: theme.colors.textMain }}>{contribution.tasksCompleted}</p>
				</div>
				<div>
					<span style={{ color: theme.colors.textDim }}>Tokens</span>
					<p style={{ color: theme.colors.textMain }}>{formattedTokens}</p>
				</div>
				<div>
					<span style={{ color: theme.colors.textDim }}>Cost</span>
					<p style={{ color: theme.colors.accent }}>
						${contribution.tokenUsage.totalCost.toFixed(2)}
					</p>
				</div>
			</div>
		</div>
	);
}

// ============================================================================
// Achievement Card
// ============================================================================

export function AchievementCard({
	achievement,
	theme,
}: {
	achievement: Achievement;
	theme: Theme;
}) {
	return (
		<div
			className="p-3 rounded-lg border"
			style={{
				backgroundColor: theme.colors.bgActivity,
				borderColor: achievement.earned ? theme.colors.accent : theme.colors.border,
				opacity: achievement.earned ? 1 : 0.5,
			}}
		>
			<div className="flex items-center gap-3">
				<div className="text-2xl" style={{ opacity: achievement.earned ? 1 : 0.7 }}>
					{achievement.icon}
				</div>
				<div className="flex-1 min-w-0">
					<h4 className="font-medium text-sm" style={{ color: theme.colors.textMain }}>
						{achievement.title}
					</h4>
					<p className="text-xs" style={{ color: theme.colors.textDim }}>
						{achievement.description}
					</p>
					{!achievement.earned && achievement.progress !== undefined && (
						<div className="mt-1">
							<div
								className="h-1 rounded-full overflow-hidden"
								style={{ backgroundColor: theme.colors.bgMain }}
							>
								<div
									className="h-full rounded-full"
									style={{
										width: `${achievement.progress}%`,
										backgroundColor: theme.colors.accent,
									}}
								/>
							</div>
						</div>
					)}
				</div>
				{achievement.earned && (
					<CheckCircle className="w-5 h-5 shrink-0" style={{ color: STATUS_COLORS.running }} />
				)}
			</div>
		</div>
	);
}
