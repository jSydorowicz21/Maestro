import React from 'react';

interface FilePreviewEditorProps {
	editContent: string;
	setEditContent: (content: string) => void;
	theme: any;
	handleSave: () => void;
	setMarkdownEditMode: (value: boolean) => void;
	textareaRef: React.RefObject<HTMLTextAreaElement>;
}

/** Edit-mode textarea with cursor/page navigation keyboard handlers. */
export const FilePreviewEditor = React.memo(function FilePreviewEditor({
	editContent,
	setEditContent,
	theme,
	handleSave,
	setMarkdownEditMode,
	textareaRef,
}: FilePreviewEditorProps) {
	return (
		<textarea
			ref={textareaRef}
			value={editContent}
			onChange={(e) => setEditContent(e.target.value)}
			className="w-full h-full font-mono text-sm resize-none outline-none bg-transparent"
			style={{
				color: theme.colors.textMain,
				caretColor: theme.colors.accent,
				lineHeight: '1.6',
			}}
			spellCheck={false}
			onKeyDown={(e) => {
				// Handle Cmd+S for save
				if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
					e.preventDefault();
					e.stopPropagation();
					handleSave();
				}
				// Handle Escape to exit edit mode (without save)
				else if (e.key === 'Escape') {
					e.preventDefault();
					e.stopPropagation();
					setMarkdownEditMode(false);
				}
				// Handle Cmd+Up: Move cursor to beginning (Shift: select to beginning)
				else if (e.key === 'ArrowUp' && (e.metaKey || e.ctrlKey)) {
					e.preventDefault();
					const textarea = e.currentTarget;
					if (e.shiftKey) {
						const anchor =
							textarea.selectionDirection === 'backward'
								? textarea.selectionEnd
								: textarea.selectionStart;
						textarea.setSelectionRange(0, anchor, 'backward');
					} else {
						textarea.setSelectionRange(0, 0);
					}
					textarea.scrollTop = 0;
				}
				// Handle Cmd+Down: Move cursor to end (Shift: select to end)
				else if (e.key === 'ArrowDown' && (e.metaKey || e.ctrlKey)) {
					e.preventDefault();
					const textarea = e.currentTarget;
					const len = textarea.value.length;
					if (e.shiftKey) {
						const anchor =
							textarea.selectionDirection === 'forward'
								? textarea.selectionStart
								: textarea.selectionEnd;
						textarea.setSelectionRange(anchor, len, 'forward');
					} else {
						textarea.setSelectionRange(len, len);
					}
					textarea.scrollTop = textarea.scrollHeight;
				}
				// Handle Opt+Up: Page up (move cursor up by roughly a page)
				else if (e.key === 'ArrowUp' && e.altKey) {
					e.preventDefault();
					const textarea = e.currentTarget;
					const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 24;
					const linesPerPage = Math.floor(textarea.clientHeight / lineHeight);
					const lines = textarea.value.substring(0, textarea.selectionStart).split('\n');
					const currentLine = lines.length - 1;
					const targetLine = Math.max(0, currentLine - linesPerPage);
					// Calculate new cursor position
					let newPos = 0;
					for (let i = 0; i < targetLine; i++) {
						newPos += lines[i].length + 1; // +1 for newline
					}
					// Preserve column position if possible
					const currentCol =
						lines[currentLine].length -
						(lines[currentLine].length -
							(textarea.selectionStart - (newPos - (currentLine > 0 ? 1 : 0))));
					const targetLineText = textarea.value.split('\n')[targetLine] || '';
					newPos =
						textarea.value.split('\n').slice(0, targetLine).join('\n').length +
						(targetLine > 0 ? 1 : 0);
					newPos += Math.min(currentCol, targetLineText.length);
					textarea.setSelectionRange(newPos, newPos);
					// Scroll to show the cursor
					textarea.scrollTop -= textarea.clientHeight;
				}
				// Handle Opt+Down: Page down (move cursor down by roughly a page)
				else if (e.key === 'ArrowDown' && e.altKey) {
					e.preventDefault();
					const textarea = e.currentTarget;
					const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 24;
					const linesPerPage = Math.floor(textarea.clientHeight / lineHeight);
					const allLines = textarea.value.split('\n');
					const textBeforeCursor = textarea.value.substring(0, textarea.selectionStart);
					const currentLine = textBeforeCursor.split('\n').length - 1;
					const targetLine = Math.min(allLines.length - 1, currentLine + linesPerPage);
					// Calculate column position in current line
					const linesBeforeCurrent = textBeforeCursor.split('\n');
					const currentCol = linesBeforeCurrent[linesBeforeCurrent.length - 1].length;
					// Calculate new cursor position
					let newPos = allLines.slice(0, targetLine).join('\n').length + (targetLine > 0 ? 1 : 0);
					newPos += Math.min(currentCol, allLines[targetLine].length);
					textarea.setSelectionRange(newPos, newPos);
					// Scroll to show the cursor
					textarea.scrollTop += textarea.clientHeight;
				}
			}}
		/>
	);
});
