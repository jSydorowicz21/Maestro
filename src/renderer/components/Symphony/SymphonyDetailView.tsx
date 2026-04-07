/**
 * Symphony Modal - Repository Detail View
 *
 * Shows the selected repository's issues with a document preview panel.
 * Used when a user clicks into a repository from the Projects tab.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import {
	Music,
	ArrowLeft,
	ExternalLink,
	GitBranch,
	Play,
	Lock,
	CheckCircle,
	FileText,
	ChevronDown,
	GitPullRequest,
	Loader2,
} from 'lucide-react';
import type { Theme } from '../../types';
import type { RegisteredRepository, SymphonyIssue } from '../../../shared/symphony-types';
import { SYMPHONY_CATEGORIES, SYMPHONY_BLOCKING_LABEL } from '../../../shared/symphony-constants';
import {
	REMARK_GFM_PLUGINS,
	generateProseStyles,
	createMarkdownComponents,
} from '../../utils/markdownConfig';
import { IssueCard } from './SymphonyCards';
import { STATUS_COLORS } from './helpers';

export function RepositoryDetailView({
	theme,
	repo,
	issues,
	isLoadingIssues,
	selectedIssue,
	documentPreview,
	isLoadingDocument,
	isStarting,
	onBack,
	onSelectIssue,
	onStartContribution,
	onPreviewDocument,
}: {
	theme: Theme;
	repo: RegisteredRepository;
	issues: SymphonyIssue[];
	isLoadingIssues: boolean;
	selectedIssue: SymphonyIssue | null;
	documentPreview: string | null;
	isLoadingDocument: boolean;
	isStarting: boolean;
	onBack: () => void;
	onSelectIssue: (issue: SymphonyIssue) => void;
	onStartContribution: () => void;
	onPreviewDocument: (path: string, isExternal: boolean) => void;
}) {
	const categoryInfo = SYMPHONY_CATEGORIES[repo.category] ?? { label: repo.category, emoji: '📦' };
	const isIssueBlocked = (i: SymphonyIssue) =>
		i.labels?.some((l) => l.name.toLowerCase() === SYMPHONY_BLOCKING_LABEL.toLowerCase());
	const availableIssues = issues.filter((i) => i.status === 'available' && !isIssueBlocked(i));
	const blockedIssues = issues.filter((i) => i.status === 'available' && isIssueBlocked(i));
	const inProgressIssues = issues.filter((i) => i.status === 'in_progress');
	const [selectedDocIndex, setSelectedDocIndex] = useState<number>(0);
	const [showDocDropdown, setShowDocDropdown] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	// Generate prose styles scoped to symphony preview panel
	const proseStyles = useMemo(
		() =>
			generateProseStyles({
				theme,
				coloredHeadings: true,
				compactSpacing: false,
				includeCheckboxStyles: true,
				scopeSelector: '.symphony-preview',
			}),
		[theme]
	);

	// Create markdown components with link handling
	const markdownComponents = useMemo(
		() =>
			createMarkdownComponents({
				theme,
				onExternalLinkClick: (href) => {
					if (/^https?:\/\/|^mailto:/.test(href)) {
						void window.maestro.shell.openExternal(href);
					}
				},
			}),
		[theme]
	);

	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
				setShowDocDropdown(false);
			}
		};
		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, []);

	// Auto-load first document when issue is selected
	useEffect(() => {
		if (selectedIssue && selectedIssue.documentPaths.length > 0) {
			const firstDoc = selectedIssue.documentPaths[0];
			setSelectedDocIndex(0);
			onPreviewDocument(firstDoc.path, firstDoc.isExternal);
		}
	}, [selectedIssue, onPreviewDocument]);

	// Keyboard shortcuts for document navigation: Cmd+Shift+[ and Cmd+Shift+]
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (!selectedIssue || selectedIssue.documentPaths.length === 0) return;

			if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === '[' || e.key === ']')) {
				e.preventDefault();

				const docCount = selectedIssue.documentPaths.length;
				let newIndex: number;

				if (e.key === '[') {
					// Go backwards, wrap around
					newIndex = selectedDocIndex <= 0 ? docCount - 1 : selectedDocIndex - 1;
				} else {
					// Go forwards, wrap around
					newIndex = selectedDocIndex >= docCount - 1 ? 0 : selectedDocIndex + 1;
				}

				const doc = selectedIssue.documentPaths[newIndex];
				setSelectedDocIndex(newIndex);
				onPreviewDocument(doc.path, doc.isExternal);
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [selectedIssue, selectedDocIndex, onPreviewDocument]);

	const handleSelectDoc = (index: number) => {
		if (!selectedIssue) return;
		const doc = selectedIssue.documentPaths[index];
		setSelectedDocIndex(index);
		setShowDocDropdown(false);
		onPreviewDocument(doc.path, doc.isExternal);
	};

	const handleOpenExternal = useCallback((url: string) => {
		window.maestro.shell.openExternal(url);
	}, []);

	return (
		<div className="flex flex-col h-full overflow-hidden">
			{/* Header */}
			<div
				className="flex items-center justify-between px-4 py-3 border-b shrink-0"
				style={{ borderColor: theme.colors.border }}
			>
				<div className="flex items-center gap-3">
					<button
						onClick={onBack}
						className="p-1.5 rounded hover:bg-white/10 transition-colors"
						title="Back (Esc)"
					>
						<ArrowLeft className="w-5 h-5" style={{ color: theme.colors.textDim }} />
					</button>
					<div className="flex items-center gap-2">
						<Music className="w-5 h-5" style={{ color: theme.colors.accent }} />
						<h2 className="text-lg font-semibold" style={{ color: theme.colors.textMain }}>
							Maestro Symphony: {repo.name}
						</h2>
					</div>
				</div>
				<div className="flex items-center gap-3">
					<span
						className="px-2 py-0.5 rounded text-xs flex items-center gap-1"
						style={{ backgroundColor: `${theme.colors.accent}20`, color: theme.colors.accent }}
					>
						<span>{categoryInfo.emoji}</span>
						<span>{categoryInfo.label}</span>
					</span>
					<button
						type="button"
						className="p-1.5 rounded hover:bg-white/10 transition-colors"
						title="View repository on GitHub"
						onClick={() => handleOpenExternal(repo.url)}
					>
						<ExternalLink className="w-5 h-5" style={{ color: theme.colors.textDim }} />
					</button>
				</div>
			</div>

			{/* Content */}
			<div className="flex-1 flex min-h-0 overflow-hidden">
				{/* Left: Repository info + Issue list */}
				<div
					className="w-80 shrink-0 p-4 border-r overflow-y-auto"
					style={{ borderColor: theme.colors.border }}
				>
					<div className="mb-4">
						<h4
							className="text-xs font-semibold mb-1 uppercase tracking-wide"
							style={{ color: theme.colors.textDim }}
						>
							About
						</h4>
						<p className="text-sm" style={{ color: theme.colors.textMain }}>
							{repo.description}
						</p>
					</div>

					<div className="mb-4">
						<h4
							className="text-xs font-semibold mb-1 uppercase tracking-wide"
							style={{ color: theme.colors.textDim }}
						>
							Maintainer
						</h4>
						{repo.maintainer.url ? (
							<button
								type="button"
								className="text-sm hover:underline inline-flex items-center gap-1"
								style={{ color: theme.colors.accent }}
								onClick={() => handleOpenExternal(repo.maintainer.url!)}
							>
								{repo.maintainer.name}
								<ExternalLink className="w-3 h-3" />
							</button>
						) : (
							<p className="text-sm" style={{ color: theme.colors.textMain }}>
								{repo.maintainer.name}
							</p>
						)}
					</div>

					{repo.tags && repo.tags.length > 0 && (
						<div className="mb-4">
							<h4
								className="text-xs font-semibold mb-1 uppercase tracking-wide"
								style={{ color: theme.colors.textDim }}
							>
								Tags
							</h4>
							<div className="flex flex-wrap gap-1">
								{repo.tags.map((tag) => (
									<span
										key={tag}
										className="px-2 py-0.5 rounded text-xs"
										style={{ backgroundColor: theme.colors.bgMain, color: theme.colors.textDim }}
									>
										{tag}
									</span>
								))}
							</div>
						</div>
					)}

					<div className="border-t my-4" style={{ borderColor: theme.colors.border }} />

					{isLoadingIssues ? (
						<div className="space-y-2">
							{['issue-skeleton-1', 'issue-skeleton-2', 'issue-skeleton-3'].map((skeletonId) => (
								<div
									key={skeletonId}
									className="h-20 rounded animate-pulse"
									style={{ backgroundColor: theme.colors.bgMain }}
								/>
							))}
						</div>
					) : issues.length === 0 ? (
						<p className="text-sm text-center py-4" style={{ color: theme.colors.textDim }}>
							No issues with runmaestro.ai label
						</p>
					) : (
						<>
							{/* In-Progress Issues Section */}
							{inProgressIssues.length > 0 && (
								<div className="mb-4">
									<h4
										className="text-xs font-semibold mb-2 uppercase tracking-wide flex items-center gap-2"
										style={{ color: STATUS_COLORS.running }}
									>
										<GitPullRequest className="w-3 h-3" />
										<span>In Progress ({inProgressIssues.length})</span>
									</h4>
									<div className="space-y-2">
										{inProgressIssues.map((issue) => (
											<IssueCard
												key={issue.number}
												issue={issue}
												theme={theme}
												isSelected={selectedIssue?.number === issue.number}
												onSelect={() => onSelectIssue(issue)}
											/>
										))}
									</div>
								</div>
							)}

							{/* Available Issues Section */}
							<div>
								<h4
									className="text-xs font-semibold mb-2 uppercase tracking-wide flex items-center justify-between"
									style={{ color: theme.colors.textDim }}
								>
									<span>Available Issues ({availableIssues.length})</span>
									{isLoadingIssues && (
										<Loader2
											className="w-3 h-3 animate-spin"
											style={{ color: theme.colors.accent }}
										/>
									)}
								</h4>
								{availableIssues.length === 0 && blockedIssues.length === 0 ? (
									<p className="text-sm text-center py-4" style={{ color: theme.colors.textDim }}>
										All issues are currently being worked on
									</p>
								) : (
									<div className="space-y-2">
										{availableIssues.map((issue) => (
											<IssueCard
												key={issue.number}
												issue={issue}
												theme={theme}
												isSelected={selectedIssue?.number === issue.number}
												onSelect={() => onSelectIssue(issue)}
											/>
										))}
									</div>
								)}
							</div>

							{/* Blocked Issues Section */}
							{blockedIssues.length > 0 && (
								<div className="mt-4">
									<h4
										className="text-xs font-semibold mb-2 uppercase tracking-wide flex items-center gap-2"
										style={{ color: STATUS_COLORS.cancelled }}
									>
										<Lock className="w-3 h-3" />
										<span>Blocked ({blockedIssues.length})</span>
									</h4>
									<div className="space-y-2">
										{blockedIssues.map((issue) => (
											<IssueCard
												key={issue.number}
												issue={issue}
												theme={theme}
												isSelected={selectedIssue?.number === issue.number}
												onSelect={() => onSelectIssue(issue)}
											/>
										))}
									</div>
								</div>
							)}
						</>
					)}
				</div>

				{/* Right: Issue preview */}
				<div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
					{selectedIssue ? (
						<>
							<div
								className="px-4 py-3 border-b shrink-0"
								style={{ borderColor: theme.colors.border }}
							>
								<div className="flex items-center justify-between mb-1">
									<div className="flex items-center gap-2">
										<span className="text-sm" style={{ color: theme.colors.textDim }}>
											#{selectedIssue.number}
										</span>
										<h3 className="font-semibold" style={{ color: theme.colors.textMain }}>
											{selectedIssue.title}
										</h3>
									</div>
									<button
										type="button"
										className="text-xs hover:underline flex items-center gap-1"
										style={{ color: theme.colors.accent }}
										onClick={() => handleOpenExternal(selectedIssue.htmlUrl)}
										title="View issue on GitHub"
									>
										View Issue
										<ExternalLink className="w-3 h-3" />
									</button>
								</div>
								<div
									className="flex items-center gap-2 text-xs"
									style={{ color: theme.colors.textDim }}
								>
									<FileText className="w-3 h-3" />
									<span>{selectedIssue.documentPaths.length} Auto Run documents to process</span>
								</div>
							</div>

							{/* Document selector dropdown */}
							<div
								className="px-4 py-3 border-b shrink-0"
								style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgMain }}
							>
								<div className="relative" ref={dropdownRef}>
									<button
										onClick={() => setShowDocDropdown(!showDocDropdown)}
										className="w-full flex items-center justify-between px-3 py-2 rounded text-sm"
										style={{
											backgroundColor: theme.colors.bgActivity,
											color: theme.colors.textMain,
											border: `1px solid ${theme.colors.border}`,
										}}
									>
										<span>
											{selectedIssue.documentPaths[selectedDocIndex]?.name || 'Select document'}
										</span>
										<ChevronDown
											className={`w-4 h-4 transition-transform ${showDocDropdown ? 'rotate-180' : ''}`}
										/>
									</button>

									{showDocDropdown && (
										<div
											className="absolute top-full left-0 right-0 mt-1 rounded shadow-lg z-10 overflow-hidden max-h-64 overflow-y-auto"
											style={{
												backgroundColor: theme.colors.bgSidebar,
												border: `1px solid ${theme.colors.border}`,
											}}
										>
											{selectedIssue.documentPaths.map((doc, index) => (
												<button
													key={doc.name}
													onClick={() => handleSelectDoc(index)}
													className="w-full px-3 py-2 text-sm text-left hover:bg-white/5 transition-colors"
													style={{
														color:
															selectedDocIndex === index
																? theme.colors.accent
																: theme.colors.textMain,
														backgroundColor:
															selectedDocIndex === index ? theme.colors.bgActivity : 'transparent',
													}}
												>
													{doc.name}
												</button>
											))}
										</div>
									)}
								</div>
							</div>

							{/* Document preview - Markdown preview scrollable container with prose styles */}
							<div
								className="symphony-preview flex-1 min-h-0 p-4"
								style={{ backgroundColor: theme.colors.bgMain, overflowY: 'auto' }}
							>
								<style>{proseStyles}</style>
								{isLoadingDocument ? (
									<div className="flex items-center justify-center h-32">
										<Loader2
											className="w-6 h-6 animate-spin"
											style={{ color: theme.colors.accent }}
										/>
									</div>
								) : documentPreview ? (
									<div
										className="prose prose-sm max-w-none"
										style={{ color: theme.colors.textMain }}
									>
										<ReactMarkdown
											remarkPlugins={REMARK_GFM_PLUGINS}
											components={markdownComponents}
										>
											{documentPreview}
										</ReactMarkdown>
									</div>
								) : (
									<div className="flex flex-col items-center justify-center h-full">
										<FileText className="w-12 h-12 mb-3" style={{ color: theme.colors.textDim }} />
										<p style={{ color: theme.colors.textDim }}>Select a document to preview</p>
									</div>
								)}
							</div>
						</>
					) : (
						<div
							className="flex-1 flex items-center justify-center"
							style={{ backgroundColor: theme.colors.bgMain }}
						>
							<div className="text-center">
								{!isLoadingIssues && issues.length === 0 ? (
									<>
										<CheckCircle
											className="w-12 h-12 mx-auto mb-3"
											style={{ color: theme.colors.textDim }}
										/>
										<p className="text-sm" style={{ color: theme.colors.textMain }}>
											No outstanding work for this project
										</p>
										<p className="text-xs mt-1" style={{ color: theme.colors.textDim }}>
											There are no issues labeled with runmaestro.ai
										</p>
									</>
								) : (
									<>
										<Music
											className="w-12 h-12 mx-auto mb-3"
											style={{ color: theme.colors.textDim }}
										/>
										<p style={{ color: theme.colors.textDim }}>Select an issue to see details</p>
									</>
								)}
							</div>
						</div>
					)}
				</div>
			</div>

			{/* Footer */}
			{selectedIssue && selectedIssue.status === 'available' && (
				<div
					className="shrink-0 px-4 py-3 border-t flex items-center justify-between"
					style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgActivity }}
				>
					<div className="flex items-center gap-2 text-sm" style={{ color: theme.colors.textDim }}>
						{isIssueBlocked(selectedIssue) ? (
							<>
								<Lock className="w-4 h-4" />
								<span>
									Blocked by a dependency - the maintainer will unblock when prerequisites are met
								</span>
							</>
						) : (
							<>
								<GitBranch className="w-4 h-4" />
								<span>Will clone repo, create draft PR, and run all documents</span>
							</>
						)}
					</div>
					<button
						onClick={isIssueBlocked(selectedIssue) ? undefined : onStartContribution}
						disabled={isStarting || isIssueBlocked(selectedIssue)}
						className="px-4 py-2 rounded font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
						style={{ backgroundColor: theme.colors.accent, color: theme.colors.accentForeground }}
					>
						{isStarting ? (
							<>
								<Loader2 className="w-4 h-4 animate-spin" />
								Starting...
							</>
						) : (
							<>
								<Play className="w-4 h-4" />
								Start Symphony
							</>
						)}
					</button>
				</div>
			)}
		</div>
	);
}
