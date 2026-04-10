/**
 * SymphonyModal
 *
 * Unified modal for Maestro Symphony feature with four tabs:
 * - Projects: Browse repositories with runmaestro.ai labeled issues
 * - Active: Manage in-progress contributions
 * - History: View completed contributions
 * - Stats: View achievements and contributor statistics
 *
 * UI matches the Playbook Marketplace pattern.
 * This file is the coordinator shell that composes sub-components.
 */

import React from 'react';
import { createPortal } from 'react-dom';
import {
	Music,
	RefreshCw,
	X,
	Search,
	Loader2,
	AlertCircle,
	Trophy,
	Flame,
	Zap,
	Clock,
	HelpCircle,
	Github,
} from 'lucide-react';
import { SYMPHONY_CATEGORIES } from '../../../shared/symphony-constants';
import { formatShortcutKeys } from '../../utils/shortcutFormatter';
import { buildMaestroUrl } from '../../utils/buildMaestroUrl';
import { AgentCreationDialog } from '../AgentCreationDialog';
import type { SymphonyModalProps, ModalTab } from './helpers';
import { STATUS_COLORS, formatCacheAge } from './helpers';
import {
	RepositoryTile,
	RepositoryTileSkeleton,
	ActiveContributionCard,
	CompletedContributionCard,
	AchievementCard,
} from './SymphonyCards';
import { RepositoryDetailView } from './SymphonyDetailView';
import { SymphonyPreflightDialog } from './SymphonyPreflightDialog';
import { useSymphonyModal } from './useSymphonyModal';

export function SymphonyModal({
	theme,
	isOpen,
	onClose,
	onStartContribution,
	sessions,
	onSelectSession,
}: SymphonyModalProps) {
	const {
		// Symphony data
		symphony,
		contributorStats,

		// UI state
		activeTab,
		setActiveTab,
		selectedTileIndex,
		showDetailView,
		selectedIssue,
		documentPreview,
		isLoadingDocument,
		isStarting,
		showAgentDialog,
		setShowAgentDialog,
		showBuildWarning,
		setShowBuildWarning,
		ghCliStatus,
		isCheckingGh,
		showHelp,
		setShowHelp,
		isCheckingPRStatuses,
		prStatusMessage,
		syncingContributionId,

		// Refs
		searchInputRef,
		tileGridRef,
		helpButtonRef,

		// Handlers
		handleCategoryChange,
		handleSearchChange,
		handleBack,
		handleSelectRepo,
		handleSelectIssue,
		handlePreviewDocument,
		handleStartContribution,
		handleBuildWarningConfirm,
		handleCreateAgent,
		handleFinalize,
		handleSyncContribution,
		handleCheckPRStatuses,
	} = useSymphonyModal({ isOpen, onClose, onStartContribution, onSelectSession });

	if (!isOpen) return null;

	const modalContent = (
		<div
			className="fixed inset-0 modal-overlay flex items-start justify-center pt-16 z-[9999] animate-in fade-in duration-100"
			style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="symphony-modal-title"
				tabIndex={-1}
				className="w-[1200px] max-w-[95vw] rounded-xl shadow-2xl border overflow-hidden flex flex-col max-h-[85vh] outline-none"
				style={{ backgroundColor: theme.colors.bgActivity, borderColor: theme.colors.border }}
			>
				{/* Detail view for projects */}
				{activeTab === 'projects' && showDetailView && symphony.selectedRepo ? (
					<RepositoryDetailView
						theme={theme}
						repo={symphony.selectedRepo}
						issues={symphony.repoIssues}
						isLoadingIssues={symphony.isLoadingIssues}
						selectedIssue={selectedIssue}
						documentPreview={documentPreview}
						isLoadingDocument={isLoadingDocument}
						isStarting={isStarting}
						onBack={handleBack}
						onSelectIssue={handleSelectIssue}
						onStartContribution={handleStartContribution}
						onPreviewDocument={handlePreviewDocument}
					/>
				) : (
					<>
						{/* Header */}
						<div
							className="flex items-center justify-between px-4 py-3 border-b"
							style={{ borderColor: theme.colors.border }}
						>
							<div className="flex items-center gap-2">
								<Music className="w-5 h-5" style={{ color: theme.colors.accent }} />
								<h2
									id="symphony-modal-title"
									className="text-lg font-semibold"
									style={{ color: theme.colors.textMain }}
								>
									Maestro Symphony
								</h2>
								{/* Help button */}
								<div className="relative">
									<button
										ref={helpButtonRef}
										onClick={() => setShowHelp(!showHelp)}
										className="p-1 rounded hover:bg-white/10 transition-colors"
										title="About Maestro Symphony"
										aria-label="Help"
									>
										<HelpCircle className="w-4 h-4" style={{ color: theme.colors.textDim }} />
									</button>
									{showHelp && (
										<div
											className="absolute top-full left-0 mt-2 w-80 p-4 rounded-lg shadow-xl z-50"
											style={{
												backgroundColor: theme.colors.bgSidebar,
												border: `1px solid ${theme.colors.border}`,
											}}
										>
											<h3
												className="text-sm font-semibold mb-2"
												style={{ color: theme.colors.textMain }}
											>
												About Maestro Symphony
											</h3>
											<p className="text-xs mb-3" style={{ color: theme.colors.textDim }}>
												Symphony connects Maestro users with open source projects seeking
												AI-assisted contributions. Browse projects, find issues labeled with{' '}
												<code
													className="px-1 py-0.5 rounded text-xs"
													style={{ backgroundColor: theme.colors.bgActivity }}
												>
													runmaestro.ai
												</code>
												, and contribute by running Auto Run documents that maintainers have
												prepared.
											</p>
											<h4
												className="text-xs font-semibold mb-1"
												style={{ color: theme.colors.textMain }}
											>
												Register Your Project
											</h4>
											<p className="text-xs mb-2" style={{ color: theme.colors.textDim }}>
												Want to receive Symphony contributions for your open source project? Add
												your repository to the registry:
											</p>
											<button
												onClick={() => {
													window.maestro.shell.openExternal(
														buildMaestroUrl('https://docs.runmaestro.ai/symphony')
													);
													setShowHelp(false);
												}}
												className="text-xs hover:opacity-80 transition-colors"
												style={{ color: theme.colors.accent }}
											>
												docs.runmaestro.ai/symphony
											</button>
											<div
												className="mt-3 pt-3 border-t"
												style={{ borderColor: theme.colors.border }}
											>
												<button
													onClick={() => setShowHelp(false)}
													className="text-xs px-2 py-1 rounded hover:bg-white/10 transition-colors"
													style={{ color: theme.colors.textDim }}
												>
													Close
												</button>
											</div>
										</div>
									)}
								</div>
								{/* Register Project link */}
								<button
									onClick={() => {
										window.maestro.shell.openExternal(
											buildMaestroUrl('https://docs.runmaestro.ai/symphony')
										);
									}}
									className="px-2 py-1 rounded hover:bg-white/10 transition-colors flex items-center gap-1.5 text-xs"
									title="Register your project for Symphony contributions"
									style={{ color: theme.colors.textDim }}
								>
									<Github className="w-3.5 h-3.5" />
									<span>Register Your Project</span>
								</button>
							</div>
							<div className="flex items-center gap-3">
								{activeTab === 'projects' && (
									<span className="text-xs" style={{ color: theme.colors.textDim }}>
										{symphony.fromCache ? `Cached ${formatCacheAge(symphony.cacheAge)}` : 'Live'}
									</span>
								)}
								<button
									onClick={() => symphony.refresh(true)}
									disabled={symphony.isRefreshing}
									className="p-1.5 rounded hover:bg-white/10 transition-colors disabled:opacity-50"
									title="Refresh"
								>
									<RefreshCw
										className={`w-4 h-4 ${symphony.isRefreshing ? 'animate-spin' : ''}`}
										style={{ color: theme.colors.textDim }}
									/>
								</button>
								<button
									onClick={onClose}
									className="p-1.5 rounded hover:bg-white/10 transition-colors"
									title="Close (Esc)"
								>
									<X className="w-4 h-4" style={{ color: theme.colors.textDim }} />
								</button>
							</div>
						</div>

						{/* Tab navigation */}
						<div
							className="flex items-center gap-1 px-4 py-2 border-b"
							style={{ borderColor: theme.colors.border }}
						>
							{(['projects', 'active', 'history', 'stats'] as ModalTab[]).map((tab) => (
								<button
									key={tab}
									onClick={() => setActiveTab(tab)}
									className={`px-3 py-1.5 rounded text-sm transition-colors ${activeTab === tab ? 'font-semibold' : ''}`}
									style={{
										backgroundColor: activeTab === tab ? theme.colors.accent + '20' : 'transparent',
										color: activeTab === tab ? theme.colors.accent : theme.colors.textDim,
									}}
								>
									{tab === 'projects' && 'Projects'}
									{tab === 'active' &&
										`Active${symphony.activeContributions.length > 0 ? ` (${symphony.activeContributions.length})` : ''}`}
									{tab === 'history' && 'History'}
									{tab === 'stats' && 'Stats'}
								</button>
							))}
						</div>

						{/* Tab content */}
						<div className="flex-1 overflow-hidden flex flex-col">
							{/* Projects Tab */}
							{activeTab === 'projects' && (
								<>
									{/* Search + Category tabs */}
									<div
										className="px-4 py-3 border-b"
										style={{
											borderColor: theme.colors.border,
											backgroundColor: theme.colors.bgMain,
										}}
									>
										<div className="flex items-center gap-4">
											<div className="relative flex-1 max-w-xs">
												<Search
													className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
													style={{ color: theme.colors.textDim }}
												/>
												<input
													ref={searchInputRef}
													type="text"
													value={symphony.searchQuery}
													onChange={(e) => handleSearchChange(e.target.value)}
													placeholder="Search repositories..."
													className="w-full pl-9 pr-3 py-2 rounded border outline-none text-sm focus:ring-1"
													style={{
														borderColor: theme.colors.border,
														color: theme.colors.textMain,
														backgroundColor: theme.colors.bgActivity,
													}}
												/>
											</div>

											<div className="flex items-center gap-1 flex-wrap">
												<button
													onClick={() => handleCategoryChange('all')}
													className={`px-3 py-1.5 rounded text-sm transition-colors ${symphony.selectedCategory === 'all' ? 'font-semibold' : ''}`}
													style={{
														backgroundColor:
															symphony.selectedCategory === 'all'
																? theme.colors.bgActivity
																: 'transparent',
														color:
															symphony.selectedCategory === 'all'
																? theme.colors.accent
																: theme.colors.textDim,
														border:
															symphony.selectedCategory === 'all'
																? `1px solid ${theme.colors.accent}`
																: '1px solid transparent',
													}}
												>
													All
												</button>
												{symphony.categories.map((cat) => {
													const info = SYMPHONY_CATEGORIES[cat];
													return (
														<button
															key={cat}
															onClick={() => handleCategoryChange(cat)}
															className={`px-3 py-1.5 rounded text-sm transition-colors flex items-center gap-1 ${
																symphony.selectedCategory === cat ? 'font-semibold' : ''
															}`}
															style={{
																backgroundColor:
																	symphony.selectedCategory === cat
																		? theme.colors.bgActivity
																		: 'transparent',
																color:
																	symphony.selectedCategory === cat
																		? theme.colors.accent
																		: theme.colors.textDim,
																border:
																	symphony.selectedCategory === cat
																		? `1px solid ${theme.colors.accent}`
																		: '1px solid transparent',
															}}
														>
															<span>{info?.emoji ?? '📦'}</span>
															<span>{info?.label ?? cat}</span>
														</button>
													);
												})}
											</div>
										</div>
									</div>

									{/* Repository grid */}
									<div
										className="flex-1 overflow-y-auto p-4"
										style={{ backgroundColor: theme.colors.bgMain }}
									>
										{symphony.isLoading ? (
											<div className="grid grid-cols-3 gap-4">
												{[
													'repo-skeleton-1',
													'repo-skeleton-2',
													'repo-skeleton-3',
													'repo-skeleton-4',
													'repo-skeleton-5',
													'repo-skeleton-6',
												].map((skeletonId) => (
													<RepositoryTileSkeleton key={skeletonId} theme={theme} />
												))}
											</div>
										) : symphony.error ? (
											<div className="flex flex-col items-center justify-center h-48">
												<AlertCircle
													className="w-8 h-8 mb-2"
													style={{ color: STATUS_COLORS.failed }}
												/>
												<p style={{ color: theme.colors.textDim }}>{symphony.error}</p>
												<button
													onClick={() => symphony.refresh(true)}
													className="mt-3 px-3 py-1.5 rounded text-sm"
													style={{
														backgroundColor: theme.colors.accent,
														color: theme.colors.accentForeground,
													}}
												>
													Retry
												</button>
											</div>
										) : symphony.filteredRepositories.length === 0 ? (
											<div className="flex flex-col items-center justify-center h-48">
												<Music className="w-8 h-8 mb-2" style={{ color: theme.colors.textDim }} />
												<p style={{ color: theme.colors.textDim }}>
													{symphony.searchQuery
														? 'No repositories match your search'
														: 'No repositories available'}
												</p>
											</div>
										) : (
											<div
												ref={tileGridRef}
												tabIndex={0}
												className="grid grid-cols-3 gap-4 outline-none"
												role="grid"
												aria-label="Repository tiles"
											>
												{symphony.filteredRepositories.map((repo, index) => (
													<RepositoryTile
														key={repo.slug}
														repo={repo}
														theme={theme}
														isSelected={index === selectedTileIndex}
														onSelect={() => handleSelectRepo(repo)}
														issueCount={symphony.issueCounts?.[repo.slug] ?? null}
													/>
												))}
											</div>
										)}
									</div>

									{/* Footer */}
									<div
										className="px-4 py-2 border-t flex items-center justify-between text-xs"
										style={{ borderColor: theme.colors.border, color: theme.colors.textDim }}
									>
										<span className="flex items-center gap-1">
											{symphony.filteredRepositories.length} repositories - Contribute to open
											source with AI
											{symphony.isLoadingIssueCounts && (
												<Loader2 className="w-3 h-3 animate-spin ml-1" />
											)}
										</span>
										<span>{`↑↓←→ navigate - Enter select - / search - ${formatShortcutKeys(['Meta', 'Shift'])}[] tabs`}</span>
									</div>
								</>
							)}

							{/* Active Tab */}
							{activeTab === 'active' && (
								<div className="flex-1 flex flex-col overflow-hidden">
									{/* Header with refresh button */}
									<div
										className="px-4 py-2 border-b flex items-center justify-between"
										style={{ borderColor: theme.colors.border }}
									>
										<span className="text-sm" style={{ color: theme.colors.textMain }}>
											{symphony.activeContributions.length} active contribution
											{symphony.activeContributions.length !== 1 ? 's' : ''}
										</span>
										<div className="flex items-center gap-2">
											{prStatusMessage && (
												<span className="text-xs" style={{ color: theme.colors.textDim }}>
													{prStatusMessage}
												</span>
											)}
											<button
												onClick={handleCheckPRStatuses}
												disabled={isCheckingPRStatuses}
												className="flex items-center gap-1.5 px-2 py-1 rounded text-xs hover:opacity-80 transition-opacity disabled:opacity-50"
												style={{
													backgroundColor: theme.colors.bgActivity,
													color: theme.colors.textMain,
												}}
												title="Check for merged or closed PRs"
											>
												<RefreshCw
													className={`w-3 h-3 ${isCheckingPRStatuses ? 'animate-spin' : ''}`}
												/>
												Check PR Status
											</button>
										</div>
									</div>

									{/* Content */}
									<div className="flex-1 overflow-y-auto p-4">
										{symphony.activeContributions.length === 0 ? (
											<div className="flex flex-col items-center justify-center h-64">
												<Music className="w-12 h-12 mb-3" style={{ color: theme.colors.textDim }} />
												<p className="text-sm mb-1" style={{ color: theme.colors.textMain }}>
													No active contributions
												</p>
												<p className="text-xs mb-4" style={{ color: theme.colors.textDim }}>
													Start a contribution from the Projects tab
												</p>
												<button
													onClick={() => setActiveTab('projects')}
													className="px-3 py-1.5 rounded text-sm"
													style={{
														backgroundColor: theme.colors.accent,
														color: theme.colors.accentForeground,
													}}
												>
													Browse Projects
												</button>
											</div>
										) : (
											<div className="grid grid-cols-2 gap-4">
												{symphony.activeContributions.map((contribution) => {
													const session = sessions.find((s) => s.id === contribution.sessionId);
													return (
														<ActiveContributionCard
															key={contribution.id}
															contribution={contribution}
															theme={theme}
															onFinalize={() => handleFinalize(contribution.id)}
															onSync={() => handleSyncContribution(contribution.id)}
															isSyncing={syncingContributionId === contribution.id}
															sessionName={session?.name ?? null}
															onNavigateToSession={() => {
																if (session) {
																	onSelectSession(session.id);
																	onClose();
																}
															}}
														/>
													);
												})}
											</div>
										)}
									</div>
								</div>
							)}

							{/* History Tab */}
							{activeTab === 'history' && (
								<div className="flex-1 overflow-y-auto">
									{/* Stats summary */}
									{contributorStats.stats && contributorStats.stats.totalContributions > 0 && (
										<div
											className="grid grid-cols-5 gap-4 p-4 border-b"
											style={{ borderColor: theme.colors.border }}
										>
											<div className="text-center">
												<p
													className="text-2xl font-semibold"
													style={{ color: theme.colors.textMain }}
												>
													{contributorStats.stats.totalContributions}
												</p>
												<p className="text-xs" style={{ color: theme.colors.textDim }}>
													PRs Created
												</p>
											</div>
											<div className="text-center">
												<p
													className="text-2xl font-semibold"
													style={{ color: STATUS_COLORS.running }}
												>
													{contributorStats.stats.totalMerged}
												</p>
												<p className="text-xs" style={{ color: theme.colors.textDim }}>
													Merged
												</p>
											</div>
											<div className="text-center">
												<p
													className="text-2xl font-semibold"
													style={{ color: theme.colors.textMain }}
												>
													{contributorStats.stats.totalTasksCompleted}
												</p>
												<p className="text-xs" style={{ color: theme.colors.textDim }}>
													Tasks
												</p>
											</div>
											<div className="text-center">
												<p
													className="text-2xl font-semibold"
													style={{ color: theme.colors.textMain }}
												>
													{contributorStats.formattedTotalTokens}
												</p>
												<p className="text-xs" style={{ color: theme.colors.textDim }}>
													Tokens
												</p>
											</div>
											<div className="text-center">
												<p
													className="text-2xl font-semibold"
													style={{ color: theme.colors.accent }}
												>
													{contributorStats.formattedTotalCost}
												</p>
												<p className="text-xs" style={{ color: theme.colors.textDim }}>
													Value
												</p>
											</div>
										</div>
									)}

									{/* Completed contributions */}
									<div className="p-4">
										{symphony.completedContributions.length === 0 ? (
											<div className="flex flex-col items-center justify-center h-48">
												<Music className="w-12 h-12 mb-3" style={{ color: theme.colors.textDim }} />
												<p className="text-sm mb-1" style={{ color: theme.colors.textMain }}>
													No completed contributions
												</p>
												<p className="text-xs" style={{ color: theme.colors.textDim }}>
													Your contribution history will appear here
												</p>
											</div>
										) : (
											<div className="grid grid-cols-2 gap-4">
												{symphony.completedContributions.map((contribution) => (
													<CompletedContributionCard
														key={contribution.id}
														contribution={contribution}
														theme={theme}
													/>
												))}
											</div>
										)}
									</div>
								</div>
							)}

							{/* Stats Tab */}
							{activeTab === 'stats' && (
								<div className="flex-1 overflow-y-auto p-4">
									{/* Stats cards */}
									<div className="grid grid-cols-3 gap-4 mb-6">
										<div
											className="p-4 rounded-lg border"
											style={{
												backgroundColor: theme.colors.bgActivity,
												borderColor: theme.colors.border,
											}}
										>
											<div className="flex items-center gap-2 mb-2">
												<Zap className="w-5 h-5" style={{ color: theme.colors.accent }} />
												<span
													className="text-sm font-medium"
													style={{ color: theme.colors.textMain }}
												>
													Tokens Donated
												</span>
											</div>
											<p
												className="text-2xl font-semibold"
												style={{ color: theme.colors.textMain }}
											>
												{contributorStats.formattedTotalTokens}
											</p>
											<p className="text-xs" style={{ color: theme.colors.textDim }}>
												Worth {contributorStats.formattedTotalCost}
											</p>
										</div>

										<div
											className="p-4 rounded-lg border"
											style={{
												backgroundColor: theme.colors.bgActivity,
												borderColor: theme.colors.border,
											}}
										>
											<div className="flex items-center gap-2 mb-2">
												<Clock className="w-5 h-5" style={{ color: theme.colors.accent }} />
												<span
													className="text-sm font-medium"
													style={{ color: theme.colors.textMain }}
												>
													Time Contributed
												</span>
											</div>
											<p
												className="text-2xl font-semibold"
												style={{ color: theme.colors.textMain }}
											>
												{contributorStats.formattedTotalTime}
											</p>
											<p className="text-xs" style={{ color: theme.colors.textDim }}>
												{contributorStats.uniqueRepos} repositories
											</p>
										</div>

										<div
											className="p-4 rounded-lg border"
											style={{
												backgroundColor: theme.colors.bgActivity,
												borderColor: theme.colors.border,
											}}
										>
											<div className="flex items-center gap-2 mb-2">
												<Flame className="w-5 h-5" style={{ color: '#f97316' }} />
												<span
													className="text-sm font-medium"
													style={{ color: theme.colors.textMain }}
												>
													Streak
												</span>
											</div>
											<p
												className="text-2xl font-semibold"
												style={{ color: theme.colors.textMain }}
											>
												{contributorStats.currentStreakWeeks} weeks
											</p>
											<p className="text-xs" style={{ color: theme.colors.textDim }}>
												Best: {contributorStats.longestStreakWeeks} weeks
											</p>
										</div>
									</div>

									{/* Achievements */}
									<div>
										<h3
											className="text-sm font-semibold mb-3 flex items-center gap-2"
											style={{ color: theme.colors.textMain }}
										>
											<Trophy className="w-4 h-4" style={{ color: '#eab308' }} />
											Achievements
										</h3>
										<div className="grid grid-cols-2 gap-3">
											{contributorStats.achievements.map((achievement) => (
												<AchievementCard
													key={achievement.id}
													achievement={achievement}
													theme={theme}
												/>
											))}
										</div>
									</div>
								</div>
							)}
						</div>
					</>
				)}
			</div>
		</div>
	);

	return (
		<>
			{createPortal(modalContent, document.body)}
			{/* Pre-flight Check Dialog */}
			{showBuildWarning && (
				<SymphonyPreflightDialog
					theme={theme}
					isCheckingGh={isCheckingGh}
					ghCliStatus={ghCliStatus}
					onClose={() => setShowBuildWarning(false)}
					onConfirm={handleBuildWarningConfirm}
				/>
			)}
			{/* Agent Creation Dialog */}
			{symphony.selectedRepo && selectedIssue && (
				<AgentCreationDialog
					theme={theme}
					isOpen={showAgentDialog}
					onClose={() => setShowAgentDialog(false)}
					repo={symphony.selectedRepo}
					issue={selectedIssue}
					onCreateAgent={handleCreateAgent}
				/>
			)}
		</>
	);
}

export default SymphonyModal;
