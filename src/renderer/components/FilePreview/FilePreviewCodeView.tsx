import React from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { getSyntaxStyle } from '../../utils/syntaxTheme';
import { AlertTriangle } from 'lucide-react';
import { formatFileSize, LARGE_FILE_PREVIEW_LIMIT } from './filePreviewUtils';

interface FilePreviewCodeViewProps {
	language: string;
	displayContent: string;
	isContentTruncated: boolean;
	fullContentLength: number;
	showFullContent: boolean;
	setShowFullContent: (v: boolean) => void;
	theme: any;
	codeContainerRef: React.RefObject<HTMLDivElement>;
}

/** Syntax-highlighted code view with large-file truncation banner. */
export const FilePreviewCodeView = React.memo(function FilePreviewCodeView({
	language,
	displayContent,
	isContentTruncated,
	fullContentLength,
	showFullContent,
	setShowFullContent,
	theme,
	codeContainerRef,
}: FilePreviewCodeViewProps) {
	return (
		<div ref={codeContainerRef}>
			{/* Large file truncation banner */}
			{isContentTruncated && (
				<div
					className="px-4 py-2 flex items-center gap-2 text-sm"
					style={{
						backgroundColor: theme.colors.warning + '20',
						borderBottom: `1px solid ${theme.colors.warning}40`,
						color: theme.colors.warning,
					}}
				>
					<AlertTriangle className="w-4 h-4 flex-shrink-0" />
					<span>
						Large file preview truncated. Showing first {formatFileSize(LARGE_FILE_PREVIEW_LIMIT)}{' '}
						of {formatFileSize(fullContentLength)}.
					</span>
					<button
						className="px-2 py-0.5 rounded text-xs font-medium hover:brightness-125 transition-all"
						style={{
							backgroundColor: theme.colors.warning + '30',
							border: `1px solid ${theme.colors.warning}60`,
							color: theme.colors.warning,
						}}
						onClick={() => setShowFullContent(true)}
					>
						Load full file
					</button>
				</div>
			)}
			<SyntaxHighlighter
				language={language}
				style={getSyntaxStyle(theme.mode)}
				customStyle={{
					margin: 0,
					padding: '24px',
					background: 'transparent',
					fontSize: '13px',
				}}
				showLineNumbers
				PreTag="div"
			>
				{displayContent}
			</SyntaxHighlighter>
		</div>
	);
});
