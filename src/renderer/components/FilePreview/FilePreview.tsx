import React, {
	useState,
	useRef,
	useEffect,
	useMemo,
	useCallback,
	forwardRef,
	useImperativeHandle,
} from 'react';
import { FileCode, RefreshCw, X, AlertTriangle } from 'lucide-react';
import { useLayerStack } from '../../contexts/LayerStackContext';
import { MODAL_PRIORITIES } from '../../constants/modalPriorities';
import { useClickOutside } from '../../hooks/ui/useClickOutside';
import { Modal, ModalFooter } from '../ui/Modal';
import { CsvTableRenderer } from '../CsvTableRenderer';
import { getEncoder } from '../../utils/tokenCounter';
import { isImageFile } from '../../../shared/gitUtils';
import type { FilePreviewProps, FilePreviewHandle, FileStats } from './types';
import {
	getLanguageFromFilename,
	isBinaryContent,
	isBinaryExtension,
	countMarkdownTasks,
	extractHeadings,
	LARGE_FILE_TOKEN_SKIP_THRESHOLD,
	LARGE_FILE_PREVIEW_LIMIT,
} from './filePreviewUtils';
import { useFilePreviewSearch } from '../../hooks/file';
import { FilePreviewHeader } from './FilePreviewHeader';
import { ImageViewer } from './ImageViewer';
import { FilePreviewToc } from './FilePreviewToc';
import { FilePreviewEditor } from './FilePreviewEditor';
import { FilePreviewCodeView } from './FilePreviewCodeView';
import { FilePreviewMarkdownView } from './FilePreviewMarkdownView';
import { FilePreviewSearch } from './FilePreviewSearch';
import { useFilePreviewKeyboard } from './useFilePreviewKeyboard';

export const FilePreview = React.memo(
	forwardRef<FilePreviewHandle, FilePreviewProps>(function FilePreview(
		{
			file,
			onClose,
			theme,
			markdownEditMode,
			setMarkdownEditMode,
			onSave,
			shortcuts,
			fileTree,
			cwd,
			onFileClick,
			canGoBack,
			canGoForward,
			onNavigateBack,
			onNavigateForward,
			backHistory,
			forwardHistory,
			onNavigateToIndex,
			currentHistoryIndex,
			onOpenFuzzySearch,
			onShortcutUsed,
			ghCliAvailable,
			onPublishGist,
			hasGist,
			onOpenInGraph,
			sshRemoteId,
			externalEditContent,
			onEditContentChange,
			initialScrollTop,
			onScrollPositionChange,
			initialSearchQuery,
			onSearchQueryChange,
			isTabMode,
			lastModified,
			onReloadFile,
		},
		ref
	) {
		const [showTocOverlay, setShowTocOverlay] = useState(false);
		const [fileStats, setFileStats] = useState<FileStats | null>(null);
		const [showStatsBar, setShowStatsBar] = useState(true);
		const [tokenCount, setTokenCount] = useState<number | null>(null);
		const [showRemoteImages, setShowRemoteImages] = useState(false);
		const [showFullContent, setShowFullContent] = useState(false);
		// Edit mode state - use external content when provided (for file tab persistence)
		const [internalEditContent, setInternalEditContent] = useState('');
		// Computed edit content - prefer external if provided
		const editContent = externalEditContent ?? internalEditContent;
		// Wrapper to update both internal state and notify parent
		const setEditContent = useCallback(
			(content: string) => {
				setInternalEditContent(content);
				onEditContentChange?.(content);
			},
			[onEditContentChange]
		);
		const [isSaving, setIsSaving] = useState(false);
		const [showUnsavedChangesModal, setShowUnsavedChangesModal] = useState(false);
		const [showCopyNotification, setShowCopyNotification] = useState(false);
		const [copyNotificationMessage, setCopyNotificationMessage] = useState('');
		const notificationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

		const codeContainerRef = useRef<HTMLDivElement>(null);
		const contentRef = useRef<HTMLDivElement>(null);
		const containerRef = useRef<HTMLDivElement>(null);
		const textareaRef = useRef<HTMLTextAreaElement>(null);
		const markdownContainerRef = useRef<HTMLDivElement>(null);
		const layerIdRef = useRef<string>();
		const cancelButtonRef = useRef<HTMLButtonElement>(null);
		const scrollSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
		const tocButtonRef = useRef<HTMLButtonElement>(null);
		const tocOverlayRef = useRef<HTMLDivElement>(null);

		// Clear notification timeout on unmount
		useEffect(() => {
			return () => {
				if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current);
			};
		}, []);

		const showNotification = useCallback((message: string) => {
			setCopyNotificationMessage(message);
			setShowCopyNotification(true);
			if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current);
			notificationTimeoutRef.current = setTimeout(() => setShowCopyNotification(false), 2000);
		}, []);

		// Reset full content view when file changes
		useEffect(() => {
			setShowFullContent(false);
		}, [file?.path]);

		// File change detection state
		const [fileChangedOnDisk, setFileChangedOnDisk] = useState(false);
		const lastModifiedRef = useRef(lastModified);

		// Keep ref in sync with prop (reset when parent reloads content with new lastModified)
		useEffect(() => {
			lastModifiedRef.current = lastModified;
			setFileChangedOnDisk(false);
		}, [lastModified]);

		// Poll file stat to detect external changes (every 3s for the active file)
		useEffect(() => {
			if (!file?.path || !lastModified || fileChangedOnDisk) return;

			const interval = setInterval(async () => {
				try {
					const stat = await window.maestro?.fs?.stat(file.path, sshRemoteId);
					if (!stat?.modifiedAt) return;
					const currentMtime = new Date(stat.modifiedAt).getTime();
					if (currentMtime > (lastModifiedRef.current ?? 0)) {
						setFileChangedOnDisk(true);
					}
				} catch {
					// Silently ignore - file may have been deleted or become inaccessible
				}
			}, 3000);

			return () => clearInterval(interval);
		}, [file?.path, lastModified, sshRemoteId, fileChangedOnDisk]);

		// Handle reload click
		const handleReloadFile = useCallback(() => {
			setFileChangedOnDisk(false);
			onReloadFile?.();
		}, [onReloadFile]);

		// Expose focus method to parent via ref
		useImperativeHandle(
			ref,
			() => ({
				focus: () => {
					containerRef.current?.focus();
				},
			}),
			[]
		);

		// Track if content has been modified
		const hasChanges = markdownEditMode && editContent !== file?.content;

		const { registerLayer, unregisterLayer, updateLayerHandler } = useLayerStack();

		// Compute derived values - must be before any early returns but after hooks
		const language = file ? getLanguageFromFilename(file.name) : '';
		const isMarkdown = language === 'markdown';
		const isCsv = language === 'csv';
		const csvDelimiter = file?.name.toLowerCase().endsWith('.tsv') ? '\t' : ',';
		const isImage = file ? isImageFile(file.name) : false;

		// Check for binary files - either by extension or by content analysis
		const isBinary = useMemo(() => {
			if (!file) return false;
			if (isImage) return false;
			return isBinaryExtension(file.name) || isBinaryContent(file.content);
		}, [isImage, file]);

		// Any non-binary, non-image file can be edited as text
		const isEditableText = !isImage && !isBinary;

		// Check if file is large (for performance optimizations)
		const isLargeFile = useMemo(() => {
			if (!file?.content) return false;
			return file.content.length > LARGE_FILE_TOKEN_SKIP_THRESHOLD;
		}, [file?.content]);

		// For very large files, truncate content for syntax highlighting to prevent freezes
		const displayContent = useMemo(() => {
			if (!file?.content) return '';
			if (
				!showFullContent &&
				!isMarkdown &&
				!isImage &&
				!isBinary &&
				file.content.length > LARGE_FILE_PREVIEW_LIMIT
			) {
				return file.content.substring(0, LARGE_FILE_PREVIEW_LIMIT);
			}
			return file.content;
		}, [file?.content, isMarkdown, isImage, isBinary, showFullContent]);

		// Search state and effects
		const {
			searchQuery,
			setSearchQuery,
			searchOpen,
			setSearchOpen,
			currentMatchIndex,
			totalMatches,
			goToNextMatch,
			goToPrevMatch,
			searchInputRef,
			setMatchCount,
		} = useFilePreviewSearch({
			codeContainerRef,
			markdownContainerRef,
			contentRef,
			textareaRef,
			isMarkdown,
			isImage,
			isCsv,
			isEditableText,
			markdownEditMode,
			editContent,
			fileContent: file?.content,
			accentColor: theme.colors.accent,
			displayedContentLength: displayContent.length,
			initialSearchQuery,
			onSearchQueryChange,
		});

		// Track if content is truncated for display
		const isContentTruncated = !!(file?.content && displayContent.length < file.content.length);

		// Calculate task counts for markdown files
		const taskCounts = useMemo(() => {
			if (!isMarkdown || !file?.content) return null;
			const counts = countMarkdownTasks(file.content);
			if (counts.open === 0 && counts.closed === 0) return null;
			return counts;
		}, [isMarkdown, file?.content]);

		// Extract table of contents entries for markdown files
		const tocEntries = useMemo(() => {
			if (!isMarkdown || !file?.content) return [];
			return extractHeadings(file.content);
		}, [isMarkdown, file?.content]);

		// Compute dynamic ToC overlay width based on longest heading text
		const tocWidth = useMemo(() => {
			if (tocEntries.length === 0) return 200;
			const MIN_WIDTH = 200;
			const MAX_WIDTH = 500;
			const CHAR_WIDTH = 7.5;
			const BASE_PADDING = 24;
			const HEADER_EXTRA = 100;

			let maxNeeded = HEADER_EXTRA;
			for (const entry of tocEntries) {
				const indent = (entry.level - 1) * 12 + 8;
				const textWidth = entry.text.length * CHAR_WIDTH;
				maxNeeded = Math.max(maxNeeded, indent + textWidth + BASE_PADDING);
			}
			return Math.min(Math.max(Math.ceil(maxNeeded), MIN_WIDTH), MAX_WIDTH);
		}, [tocEntries]);

		const scrollMarkdownToBoundary = useCallback((direction: 'top' | 'bottom') => {
			const container = contentRef.current;
			if (!container) return;
			const top = direction === 'top' ? 0 : container.scrollHeight;
			container.scrollTo({ top, behavior: 'smooth' });
		}, []);

		// Save handler
		const handleSave = useCallback(async () => {
			if (!file || !onSave || !hasChanges || isSaving) return;

			setIsSaving(true);
			try {
				await onSave(file.path, editContent);
				// Update lastModifiedRef so the file-change poller doesn't flag our own save
				try {
					const stat = await window.maestro?.fs?.stat(file.path, sshRemoteId);
					if (stat?.modifiedAt) {
						lastModifiedRef.current = new Date(stat.modifiedAt).getTime();
					}
				} catch {
					// Non-critical
				}
				showNotification('File Saved');
			} catch (err) {
				console.error('Failed to save file:', err);
				showNotification('Save Failed');
			} finally {
				setIsSaving(false);
			}
		}, [file, onSave, hasChanges, isSaving, editContent, sshRemoteId, showNotification]);

		// Keyboard handling hook
		const { handleKeyDown, copyPathToClipboard, copyContentToClipboard } = useFilePreviewKeyboard({
			file,
			shortcuts,
			isMarkdown,
			isImage,
			isEditableText,
			markdownEditMode,
			setMarkdownEditMode,
			canGoBack,
			canGoForward,
			onNavigateBack,
			onNavigateForward,
			onOpenFuzzySearch,
			onOpenInGraph,
			onShortcutUsed,
			showTocOverlay,
			setShowTocOverlay,
			searchOpen,
			setSearchOpen,
			setSearchQuery,
			searchInputRef,
			contentRef,
			containerRef,
			handleSave,
			showNotification,
		});

		// Track scroll position to show/hide stats bar and report changes
		useEffect(() => {
			const contentEl = contentRef.current;
			if (!contentEl) return;

			const handleScroll = () => {
				setShowStatsBar(contentEl.scrollTop <= 10);

				if (onScrollPositionChange) {
					if (scrollSaveTimerRef.current) {
						clearTimeout(scrollSaveTimerRef.current);
					}
					scrollSaveTimerRef.current = setTimeout(() => {
						onScrollPositionChange(contentEl.scrollTop);
						scrollSaveTimerRef.current = null;
					}, 200);
				}
			};

			contentEl.addEventListener('scroll', handleScroll, { passive: true });
			return () => {
				contentEl.removeEventListener('scroll', handleScroll);
				if (scrollSaveTimerRef.current) {
					clearTimeout(scrollSaveTimerRef.current);
					scrollSaveTimerRef.current = null;
				}
			};
		}, [onScrollPositionChange]);

		// Restore scroll position when initialScrollTop is provided (file tab switching)
		const hasRestoredScrollRef = useRef<string | null>(null);
		useEffect(() => {
			const contentEl = contentRef.current;
			if (!contentEl || !file?.path) return;

			if (
				initialScrollTop !== undefined &&
				initialScrollTop > 0 &&
				hasRestoredScrollRef.current !== file.path
			) {
				requestAnimationFrame(() => {
					contentEl.scrollTop = initialScrollTop;
				});
				hasRestoredScrollRef.current = file.path;
			} else if (hasRestoredScrollRef.current !== file.path) {
				hasRestoredScrollRef.current = file.path;
			}
		}, [file?.path, initialScrollTop]);

		// Fetch file stats when file changes
		useEffect(() => {
			if (file?.path) {
				window.maestro.fs
					.stat(file.path, sshRemoteId)
					.then((stats) =>
						setFileStats({
							size: stats.size,
							createdAt: stats.createdAt,
							modifiedAt: stats.modifiedAt,
						})
					)
					.catch((err) => {
						console.error('Failed to get file stats:', err);
						setFileStats(null);
					});
			}
		}, [file?.path, sshRemoteId]);

		// Count tokens when file content changes (skip for images, binary files, and large files)
		useEffect(() => {
			if (!file?.content || isImage || isBinary || isLargeFile) {
				setTokenCount(null);
				return;
			}

			getEncoder()
				.then((encoder) => {
					const tokens = encoder.encode(file.content);
					setTokenCount(tokens.length);
				})
				.catch((err) => {
					console.error('Failed to count tokens:', err);
					setTokenCount(null);
				});
		}, [file?.content, isImage, isBinary, isLargeFile]);

		// Sync internal edit content when file changes (only when NOT using external content)
		useEffect(() => {
			if (file?.content && externalEditContent === undefined) {
				setInternalEditContent(file.content);
			}
		}, [file?.content, file?.path, externalEditContent]);

		// Focus appropriate element and sync scroll position when mode changes
		const prevMarkdownEditModeRef = useRef(markdownEditMode);
		useEffect(() => {
			const wasEditMode = prevMarkdownEditModeRef.current;
			prevMarkdownEditModeRef.current = markdownEditMode;

			if (markdownEditMode && textareaRef.current) {
				if (!wasEditMode && contentRef.current) {
					const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
					const maxScroll = scrollHeight - clientHeight;
					const scrollPercent = maxScroll > 0 ? scrollTop / maxScroll : 0;

					requestAnimationFrame(() => {
						if (textareaRef.current) {
							const { scrollHeight: textareaScrollHeight, clientHeight: textareaClientHeight } =
								textareaRef.current;
							const textareaMaxScroll = textareaScrollHeight - textareaClientHeight;
							textareaRef.current.scrollTop = Math.round(scrollPercent * textareaMaxScroll);
						}
					});
				}
				textareaRef.current.focus();
			} else if (!markdownEditMode && wasEditMode && containerRef.current) {
				if (textareaRef.current && contentRef.current) {
					const { scrollTop, scrollHeight, clientHeight } = textareaRef.current;
					const maxScroll = scrollHeight - clientHeight;
					const scrollPercent = maxScroll > 0 ? scrollTop / maxScroll : 0;

					requestAnimationFrame(() => {
						if (contentRef.current) {
							const { scrollHeight: previewScrollHeight, clientHeight: previewClientHeight } =
								contentRef.current;
							const previewMaxScroll = previewScrollHeight - previewClientHeight;
							contentRef.current.scrollTop = Math.round(scrollPercent * previewMaxScroll);
						}
					});
				}
				containerRef.current.focus();
			}
		}, [markdownEditMode]);

		// Helper to handle escape key - shows confirmation modal if there are unsaved changes
		const handleEscapeRequest = useCallback(() => {
			if (showTocOverlay) {
				setShowTocOverlay(false);
				containerRef.current?.focus();
			} else if (searchOpen) {
				setSearchOpen(false);
				setSearchQuery('');
				containerRef.current?.focus();
			} else if (!isTabMode) {
				if (hasChanges) {
					setShowUnsavedChangesModal(true);
				} else {
					onClose();
				}
			}
		}, [showTocOverlay, searchOpen, hasChanges, onClose, isTabMode]);

		// Auto-focus on mount and when file changes so keyboard shortcuts work immediately
		useEffect(() => {
			containerRef.current?.focus();
			setShowTocOverlay(false);
		}, [file?.path]);

		// Register layer on mount - only for overlay mode (not tab mode)
		useEffect(() => {
			if (isTabMode) return;

			layerIdRef.current = registerLayer({
				type: 'overlay',
				priority: MODAL_PRIORITIES.FILE_PREVIEW,
				blocksLowerLayers: true,
				capturesFocus: true,
				focusTrap: 'lenient',
				ariaLabel: 'File Preview',
				onEscape: handleEscapeRequest,
				allowClickOutside: false,
			});

			return () => {
				if (layerIdRef.current) {
					unregisterLayer(layerIdRef.current);
				}
			};
		}, [registerLayer, unregisterLayer, isTabMode]);

		// Update handler when dependencies change (only for overlay mode)
		useEffect(() => {
			if (layerIdRef.current && !isTabMode) {
				updateLayerHandler(layerIdRef.current, handleEscapeRequest);
			}
		}, [handleEscapeRequest, updateLayerHandler, isTabMode]);

		// Click outside to dismiss
		useClickOutside(containerRef, handleEscapeRequest, !!file && !isTabMode, { delay: true });

		// Click outside ToC overlay to dismiss
		const closeTocOverlay = useCallback(() => setShowTocOverlay(false), []);
		useClickOutside<HTMLElement>([tocOverlayRef, tocButtonRef], closeTocOverlay, showTocOverlay, {
			delay: true,
		});

		// Extract directory path without filename
		const directoryPath = file ? file.path.substring(0, file.path.lastIndexOf('/')) : '';
		const showPath = showStatsBar && !!directoryPath;
		const headerIconClass = 'w-4 h-4';
		const headerBtnClass =
			'p-2 rounded hover:bg-white/10 transition-colors outline-none focus-visible:ring-1 focus-visible:ring-white/30';

		// Early return if no file - must be after all hooks
		if (!file) return null;

		return (
			<div
				ref={containerRef}
				className="flex flex-col h-full outline-none"
				style={{ backgroundColor: theme.colors.bgMain }}
				tabIndex={0}
				onKeyDown={handleKeyDown}
			>
				{/* CSS for Custom Highlight API */}
				<style>{`
        ::highlight(search-results) {
          background-color: #ffd700;
          color: #000;
        }
        ::highlight(search-current) {
          background-color: ${theme.colors.accent};
          color: #fff;
        }
      `}</style>

				{/* Header */}
				<FilePreviewHeader
					file={file}
					theme={theme}
					isMarkdown={isMarkdown}
					isImage={isImage}
					isEditableText={isEditableText}
					markdownEditMode={markdownEditMode}
					showRemoteImages={showRemoteImages}
					setShowRemoteImages={setShowRemoteImages}
					setMarkdownEditMode={setMarkdownEditMode}
					onSave={onSave ? handleSave : undefined}
					hasChanges={hasChanges}
					isSaving={isSaving}
					fileStats={fileStats}
					tokenCount={tokenCount}
					taskCounts={taskCounts}
					showStatsBar={showStatsBar}
					directoryPath={directoryPath}
					showPath={showPath}
					shortcuts={shortcuts}
					canGoBack={canGoBack}
					canGoForward={canGoForward}
					onNavigateBack={onNavigateBack}
					onNavigateForward={onNavigateForward}
					backHistory={backHistory}
					forwardHistory={forwardHistory}
					onNavigateToIndex={onNavigateToIndex}
					currentHistoryIndex={currentHistoryIndex}
					ghCliAvailable={ghCliAvailable}
					onPublishGist={onPublishGist}
					hasGist={hasGist}
					onOpenInGraph={onOpenInGraph}
					sshRemoteId={sshRemoteId}
					copyContentToClipboard={copyContentToClipboard}
					copyPathToClipboard={copyPathToClipboard}
					headerBtnClass={headerBtnClass}
					headerIconClass={headerIconClass}
				/>

				{/* File changed on disk banner */}
				{fileChangedOnDisk && (
					<div
						className="flex items-center gap-3 px-6 py-2 border-b shrink-0"
						style={{
							backgroundColor: theme.colors.accent + '15',
							borderColor: theme.colors.accent + '40',
						}}
					>
						<RefreshCw className="w-3.5 h-3.5 shrink-0" style={{ color: theme.colors.accent }} />
						<span className="flex-1 text-xs" style={{ color: theme.colors.textMain }}>
							{hasChanges
								? 'File changed on disk. You have unsaved edits - reloading will discard them.'
								: 'File changed on disk.'}
						</span>
						<div className="flex items-center gap-2 shrink-0">
							<button
								onClick={handleReloadFile}
								className="px-2 py-1 text-xs font-medium rounded hover:opacity-80 transition-opacity"
								style={{
									backgroundColor: theme.colors.accent,
									color: theme.colors.accentForeground ?? '#000',
								}}
							>
								Reload
							</button>
							<button
								onClick={() => setFileChangedOnDisk(false)}
								className="p-1 rounded hover:bg-white/10 transition-colors"
								title="Dismiss"
							>
								<X className="w-3 h-3" style={{ color: theme.colors.textDim }} />
							</button>
						</div>
					</div>
				)}

				{/* Content - isolated scroll to prevent scroll chaining */}
				<div
					ref={contentRef}
					className="flex-1 overflow-y-auto px-6 pt-3 pb-6 scrollbar-thin"
					style={{ overscrollBehavior: 'contain' }}
				>
					{/* Floating Search */}
					{searchOpen && (
						<FilePreviewSearch
							searchQuery={searchQuery}
							setSearchQuery={setSearchQuery}
							setSearchOpen={setSearchOpen}
							currentMatchIndex={currentMatchIndex}
							totalMatches={totalMatches}
							goToNextMatch={goToNextMatch}
							goToPrevMatch={goToPrevMatch}
							searchInputRef={searchInputRef}
							theme={theme}
							containerRef={containerRef}
						/>
					)}
					{isImage ? (
						<ImageViewer src={file.content} alt={file.name} theme={theme} />
					) : isBinary ? (
						<div className="flex flex-col items-center justify-center h-full gap-4">
							<FileCode className="w-16 h-16" style={{ color: theme.colors.textDim }} />
							<div className="text-center">
								<p className="text-lg font-medium" style={{ color: theme.colors.textMain }}>
									Binary File
								</p>
								<p className="text-sm mt-1" style={{ color: theme.colors.textDim }}>
									This file cannot be displayed as text.
								</p>
								<button
									onClick={() => window.maestro.shell.openPath(file.path)}
									className="mt-4 px-4 py-2 rounded text-sm hover:opacity-80 transition-opacity"
									style={{
										backgroundColor: theme.colors.accent,
										color: theme.colors.accentForeground,
									}}
								>
									Open in Default App
								</button>
							</div>
						</div>
					) : isEditableText && markdownEditMode ? (
						<FilePreviewEditor
							editContent={editContent}
							setEditContent={setEditContent}
							theme={theme}
							handleSave={handleSave}
							setMarkdownEditMode={setMarkdownEditMode}
							textareaRef={textareaRef}
						/>
					) : isCsv && !markdownEditMode ? (
						<CsvTableRenderer
							content={file.content}
							theme={theme}
							delimiter={csvDelimiter}
							searchQuery={searchQuery}
							onMatchCount={setMatchCount}
						/>
					) : isMarkdown ? (
						<FilePreviewMarkdownView
							file={file}
							theme={theme}
							showRemoteImages={showRemoteImages}
							onFileClick={onFileClick}
							fileTree={fileTree}
							cwd={cwd}
							sshRemoteId={sshRemoteId}
							markdownContainerRef={markdownContainerRef}
						/>
					) : (
						<FilePreviewCodeView
							language={language}
							displayContent={displayContent}
							isContentTruncated={isContentTruncated}
							fullContentLength={file.content.length}
							showFullContent={showFullContent}
							setShowFullContent={setShowFullContent}
							theme={theme}
							codeContainerRef={codeContainerRef}
						/>
					)}

					{/* Table of Contents */}
					<FilePreviewToc
						theme={theme}
						tocEntries={tocEntries}
						tocWidth={tocWidth}
						showTocOverlay={showTocOverlay}
						setShowTocOverlay={setShowTocOverlay}
						scrollMarkdownToBoundary={scrollMarkdownToBoundary}
						markdownContainerRef={markdownContainerRef}
						tocButtonRef={tocButtonRef}
						tocOverlayRef={tocOverlayRef}
						isMarkdown={isMarkdown}
						markdownEditMode={markdownEditMode}
					/>
				</div>

				{/* Copy Notification Toast */}
				{showCopyNotification && (
					<div
						className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 px-6 py-4 rounded-lg shadow-2xl text-base font-bold animate-in fade-in zoom-in-95 duration-200 z-50"
						style={{
							backgroundColor: theme.colors.accent,
							color: theme.colors.accentForeground,
							textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
						}}
					>
						{copyNotificationMessage}
					</div>
				)}

				{/* Unsaved Changes Confirmation Modal */}
				{showUnsavedChangesModal && (
					<Modal
						theme={theme}
						title="Unsaved Changes"
						priority={MODAL_PRIORITIES.CONFIRM}
						onClose={() => setShowUnsavedChangesModal(false)}
						width={450}
						zIndex={10000}
						headerIcon={
							<AlertTriangle className="w-5 h-5" style={{ color: theme.colors.warning }} />
						}
						initialFocusRef={cancelButtonRef}
						footer={
							<ModalFooter
								theme={theme}
								onCancel={() => setShowUnsavedChangesModal(false)}
								onConfirm={() => {
									setShowUnsavedChangesModal(false);
									onClose();
								}}
								cancelLabel="No, Stay"
								confirmLabel="Yes, Discard"
								destructive
								cancelButtonRef={cancelButtonRef}
							/>
						}
					>
						<p className="text-sm leading-relaxed" style={{ color: theme.colors.textMain }}>
							You have unsaved changes. Are you sure you want to close without saving?
						</p>
					</Modal>
				)}
			</div>
		);
	})
);
