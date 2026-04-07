import React, { useCallback } from 'react';
import { captureException } from '../../utils/sentry';
import { safeClipboardWrite, safeClipboardWriteBlob } from '../../utils/clipboard';

interface UseFilePreviewKeyboardOptions {
	file: { name: string; content: string; path: string } | null;
	shortcuts: Record<string, any>;
	isMarkdown: boolean;
	isImage: boolean;
	isEditableText: boolean;
	markdownEditMode: boolean;
	setMarkdownEditMode: (value: boolean) => void;
	canGoBack?: boolean;
	canGoForward?: boolean;
	onNavigateBack?: () => void;
	onNavigateForward?: () => void;
	onOpenFuzzySearch?: () => void;
	onOpenInGraph?: () => void;
	onShortcutUsed?: (shortcutId: string) => void;
	showTocOverlay: boolean;
	setShowTocOverlay: (v: boolean) => void;
	searchOpen: boolean;
	setSearchOpen: (v: boolean) => void;
	setSearchQuery: (q: string) => void;
	searchInputRef: React.RefObject<HTMLInputElement>;
	contentRef: React.RefObject<HTMLDivElement>;
	containerRef: React.RefObject<HTMLDivElement>;
	handleSave: () => void;
	showNotification: (message: string) => void;
}

/** Extracts all keyboard handling, clipboard operations, and shortcut matching from FilePreview. */
export function useFilePreviewKeyboard({
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
}: UseFilePreviewKeyboardOptions) {
	const copyPathToClipboard = useCallback(async () => {
		if (!file) return;
		try {
			const ok = await safeClipboardWrite(file.path);
			showNotification(ok ? 'File Path Copied to Clipboard' : 'Failed to Copy Path');
		} catch (err) {
			captureException(err);
			showNotification('Failed to Copy Path');
		}
	}, [file, showNotification]);

	const copyContentToClipboard = useCallback(async () => {
		if (!file) return;
		if (isImage) {
			try {
				const response = await fetch(file.content);
				const blob = await response.blob();
				const ok = await safeClipboardWriteBlob([new ClipboardItem({ [blob.type]: blob })]);
				if (ok) {
					showNotification('Image Copied to Clipboard');
				} else {
					const fallbackOk = await safeClipboardWrite(file.content);
					showNotification(fallbackOk ? 'Image URL Copied to Clipboard' : 'Failed to Copy Image');
				}
			} catch (err) {
				captureException(err);
				const fallbackOk = await safeClipboardWrite(file.content);
				showNotification(fallbackOk ? 'Image URL Copied to Clipboard' : 'Failed to Copy Image');
			}
		} else {
			const ok = await safeClipboardWrite(file.content);
			showNotification(ok ? 'Content Copied to Clipboard' : 'Failed to Copy Content');
		}
	}, [file, isImage, showNotification]);

	// Helper to check if a shortcut matches
	const isShortcut = useCallback(
		(e: React.KeyboardEvent, shortcutId: string) => {
			const shortcut = shortcuts[shortcutId];
			if (!shortcut) return false;

			const hasModifier = (key: string) => {
				if (key === 'Meta') return e.metaKey;
				if (key === 'Ctrl') return e.ctrlKey;
				if (key === 'Alt') return e.altKey;
				if (key === 'Shift') return e.shiftKey;
				return false;
			};

			const modifiers = shortcut.keys.filter((k: string) =>
				['Meta', 'Ctrl', 'Alt', 'Shift'].includes(k)
			);
			const mainKey = shortcut.keys.find(
				(k: string) => !['Meta', 'Ctrl', 'Alt', 'Shift'].includes(k)
			);

			const modifiersMatch = modifiers.every((m: string) => hasModifier(m));
			const keyMatches = mainKey?.toLowerCase() === e.key.toLowerCase();

			return modifiersMatch && keyMatches;
		},
		[shortcuts]
	);

	// Handle keyboard events
	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			// Handle Escape key - dismiss overlays in priority order
			// In tab mode, layer system isn't registered, so we handle Escape directly here
			if (e.key === 'Escape') {
				if (showTocOverlay) {
					e.preventDefault();
					e.stopPropagation();
					setShowTocOverlay(false);
					containerRef.current?.focus();
					return;
				}
				if (searchOpen) {
					e.preventDefault();
					e.stopPropagation();
					setSearchOpen(false);
					setSearchQuery('');
					containerRef.current?.focus();
					return;
				}
				// If not in tab mode and nothing is open, let the layer system handle it
				return;
			}

			if (e.key === 'f' && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				e.stopPropagation();
				setSearchOpen(true);
				setTimeout(() => searchInputRef.current?.focus(), 0);
			} else if (e.key === 's' && (e.metaKey || e.ctrlKey) && isEditableText && markdownEditMode) {
				// Cmd+S to save in edit mode
				e.preventDefault();
				e.stopPropagation();
				handleSave();
			} else if (isShortcut(e, 'copyFilePath')) {
				e.preventDefault();
				e.stopPropagation();
				copyPathToClipboard();
				onShortcutUsed?.('copyFilePath');
			} else if (isEditableText && isShortcut(e, 'toggleMarkdownMode')) {
				e.preventDefault();
				e.stopPropagation();
				setMarkdownEditMode(!markdownEditMode);
			} else if (e.key === 'ArrowUp') {
				// In edit mode, let the textarea handle arrow keys for cursor movement
				if (isEditableText && markdownEditMode) return;

				e.preventDefault();
				const container = contentRef.current;
				if (!container) return;

				if (e.metaKey || e.ctrlKey) {
					container.scrollTop = 0;
				} else if (e.altKey) {
					container.scrollTop -= container.clientHeight;
				} else {
					container.scrollTop -= 40;
				}
			} else if (e.key === 'ArrowDown') {
				if (isEditableText && markdownEditMode) return;

				e.preventDefault();
				const container = contentRef.current;
				if (!container) return;

				if (e.metaKey || e.ctrlKey) {
					container.scrollTop = container.scrollHeight;
				} else if (e.altKey) {
					container.scrollTop += container.clientHeight;
				} else {
					container.scrollTop += 40;
				}
			} else if (e.key === 'ArrowLeft' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
				if (isEditableText && markdownEditMode) return;
				e.preventDefault();
				e.stopPropagation();
				if (canGoBack && onNavigateBack) {
					onNavigateBack();
					onShortcutUsed?.('filePreviewBack');
				}
			} else if (e.key === 'ArrowRight' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
				if (isEditableText && markdownEditMode) return;
				e.preventDefault();
				e.stopPropagation();
				if (canGoForward && onNavigateForward) {
					onNavigateForward();
					onShortcutUsed?.('filePreviewForward');
				}
			} else if (
				e.key === 'g' &&
				(e.metaKey || e.ctrlKey) &&
				e.shiftKey &&
				isMarkdown &&
				onOpenInGraph
			) {
				e.preventDefault();
				e.stopPropagation();
				onOpenInGraph();
			} else if (isShortcut(e, 'fuzzyFileSearch') && onOpenFuzzySearch) {
				if (isEditableText && markdownEditMode) return;
				e.preventDefault();
				e.stopPropagation();
				onOpenFuzzySearch();
			} else if (e.key === 'c' && (e.metaKey || e.ctrlKey) && isImage) {
				e.preventDefault();
				e.stopPropagation();
				copyContentToClipboard().catch(captureException);
			}
		},
		[
			showTocOverlay,
			setShowTocOverlay,
			searchOpen,
			setSearchOpen,
			setSearchQuery,
			searchInputRef,
			containerRef,
			contentRef,
			isEditableText,
			markdownEditMode,
			setMarkdownEditMode,
			isMarkdown,
			isImage,
			canGoBack,
			canGoForward,
			onNavigateBack,
			onNavigateForward,
			onOpenFuzzySearch,
			onOpenInGraph,
			onShortcutUsed,
			handleSave,
			isShortcut,
			copyPathToClipboard,
			copyContentToClipboard,
		]
	);

	return {
		handleKeyDown,
		copyPathToClipboard,
		copyContentToClipboard,
	};
}
