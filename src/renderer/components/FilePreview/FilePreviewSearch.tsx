import React from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface FilePreviewSearchProps {
	searchQuery: string;
	setSearchQuery: (q: string) => void;
	setSearchOpen: (v: boolean) => void;
	currentMatchIndex: number;
	totalMatches: number;
	goToNextMatch: () => void;
	goToPrevMatch: () => void;
	searchInputRef: React.RefObject<HTMLInputElement>;
	theme: any;
	containerRef: React.RefObject<HTMLDivElement>;
}

/** Floating search bar for in-file text search. */
export const FilePreviewSearch = React.memo(function FilePreviewSearch({
	searchQuery,
	setSearchQuery,
	setSearchOpen,
	currentMatchIndex,
	totalMatches,
	goToNextMatch,
	goToPrevMatch,
	searchInputRef,
	theme,
	containerRef,
}: FilePreviewSearchProps) {
	return (
		<div className="sticky top-0 z-10 pb-4">
			<div className="flex items-center gap-2">
				<input
					ref={searchInputRef}
					type="text"
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === 'Escape') {
							e.preventDefault();
							e.stopPropagation();
							setSearchOpen(false);
							setSearchQuery('');
							// Refocus container so keyboard navigation still works
							containerRef.current?.focus();
						} else if (e.key === 'Enter' && !e.shiftKey) {
							e.preventDefault();
							goToNextMatch();
						} else if (e.key === 'Enter' && e.shiftKey) {
							e.preventDefault();
							goToPrevMatch();
						}
					}}
					placeholder="Search in file... (Enter: next, Shift+Enter: prev)"
					className="flex-1 px-3 py-2 rounded border bg-transparent outline-none text-sm"
					style={{
						borderColor: theme.colors.accent,
						color: theme.colors.textMain,
						backgroundColor: theme.colors.bgSidebar,
					}}
					autoFocus
				/>
				{searchQuery.trim() && (
					<>
						<span className="text-xs whitespace-nowrap" style={{ color: theme.colors.textDim }}>
							{totalMatches > 0 ? `${currentMatchIndex + 1}/${totalMatches}` : 'No matches'}
						</span>
						<button
							onClick={goToPrevMatch}
							disabled={totalMatches === 0}
							className="p-1.5 rounded hover:bg-white/10 transition-colors disabled:opacity-30"
							style={{ color: theme.colors.textDim }}
							title="Previous match (Shift+Enter)"
						>
							<ChevronUp className="w-4 h-4" />
						</button>
						<button
							onClick={goToNextMatch}
							disabled={totalMatches === 0}
							className="p-1.5 rounded hover:bg-white/10 transition-colors disabled:opacity-30"
							style={{ color: theme.colors.textDim }}
							title="Next match (Enter)"
						>
							<ChevronDown className="w-4 h-4" />
						</button>
					</>
				)}
			</div>
		</div>
	);
});
