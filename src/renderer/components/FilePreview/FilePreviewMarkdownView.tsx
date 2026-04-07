import React, { useMemo, useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSlug from 'rehype-slug';
import remarkFrontmatter from 'remark-frontmatter';
import { remarkFrontmatterTable } from '../../utils/remarkFrontmatterTable';
import { REMARK_GFM_PLUGINS, createMarkdownComponents } from '../../utils/markdownConfig';
import { remarkFileLinks, buildFileTreeIndices } from '../../utils/remarkFileLinks';
import { getHomeDir, getHomeDirAsync } from '../../utils/homeDir';
import { MermaidRenderer } from '../MermaidRenderer';
import { MarkdownImage } from './MarkdownImage';
import { remarkHighlight } from './remarkHighlight';
import type { FileNode } from '../../types/fileTree';

interface FilePreviewMarkdownViewProps {
	file: { name: string; content: string; path: string };
	theme: any;
	showRemoteImages: boolean;
	onFileClick?: (path: string, options?: { openInNewTab?: boolean }) => void;
	fileTree?: FileNode[];
	cwd?: string;
	sshRemoteId?: string;
	markdownContainerRef: React.RefObject<HTMLDivElement>;
}

/** Markdown renderer with scoped prose styles and remark/rehype plugins. */
export const FilePreviewMarkdownView = React.memo(function FilePreviewMarkdownView({
	file,
	theme,
	showRemoteImages,
	onFileClick,
	fileTree,
	cwd,
	sshRemoteId,
	markdownContainerRef,
}: FilePreviewMarkdownViewProps) {
	// Memoize file tree indices to avoid O(n) traversal on every render
	const fileTreeIndices = useMemo(() => {
		if (fileTree && fileTree.length > 0) {
			return buildFileTreeIndices(fileTree);
		}
		return null;
	}, [fileTree]);

	// Resolve homeDir for tilde path expansion
	const [homeDir, setHomeDir] = useState<string | undefined>(getHomeDir);
	useEffect(() => {
		if (!homeDir) {
			getHomeDirAsync()?.then(setHomeDir);
		}
	}, [homeDir]);

	// Memoize remarkPlugins to prevent infinite render loops
	const remarkPlugins = useMemo(
		() => [
			...REMARK_GFM_PLUGINS,
			remarkFrontmatter,
			remarkFrontmatterTable,
			remarkHighlight,
			...(fileTree && fileTree.length > 0 && cwd !== undefined
				? [[remarkFileLinks, { indices: fileTreeIndices || undefined, cwd, homeDir }] as any]
				: homeDir
					? [[remarkFileLinks, { cwd: cwd || '', homeDir }] as any]
					: []),
		],
		[fileTree, fileTreeIndices, cwd, homeDir]
	);

	// Memoize rehypePlugins array to prevent unnecessary re-renders
	const rehypePlugins = useMemo(() => [rehypeRaw, rehypeSlug], []);

	// Memoize ReactMarkdown components to prevent infinite render loops
	const markdownComponents = useMemo(() => {
		const components = createMarkdownComponents({
			theme,
			customLanguageRenderers: {
				mermaid: ({ code, theme: t }) => <MermaidRenderer chart={code} theme={t} />,
			},
			onFileClick: (filePath, options) => onFileClick?.(filePath, options),
			onExternalLinkClick: (href) => {
				if (/^file:\/\//.test(href)) {
					void window.maestro.shell.openPath(href.replace(/^file:\/\//, ''));
					return;
				}
				if (/^https?:\/\/|^mailto:/.test(href)) {
					void window.maestro.shell.openExternal(href);
				}
			},
			containerRef: markdownContainerRef,
		});
		return {
			...components,
			img: ({ src, alt, ...props }: any) => {
				// Check if this image came from file tree (set by remarkFileLinks)
				const isFromTree = props['data-maestro-from-tree'] === 'true';
				let projectRootForImage: string | undefined;

				if (isFromTree && cwd && file) {
					// Resolve project root so relative image links from tree render correctly.
					const cwdIndex = file.path.indexOf(`/${cwd}/`);
					if (cwdIndex !== -1) {
						projectRootForImage = file.path.substring(0, cwdIndex);
					} else {
						const firstCwdSegment = cwd.split('/')[0];
						const segmentIndex = file.path.indexOf(`/${firstCwdSegment}/`);
						if (segmentIndex !== -1) {
							projectRootForImage = file.path.substring(0, segmentIndex);
						}
					}
				}

				return (
					<MarkdownImage
						src={src}
						alt={alt}
						markdownFilePath={file?.path || ''}
						theme={theme}
						showRemoteImages={showRemoteImages}
						isFromFileTree={isFromTree}
						projectRoot={projectRootForImage}
						sshRemoteId={sshRemoteId}
					/>
				);
			},
			// Strip event handler attributes (e.g. onToggle) that rehype-raw may
			// pass through as strings from AI-generated HTML, which React rejects.
			// Fixes MAESTRO-8Q
			details: ({ node: _node, onToggle: _onToggle, ...props }: any) => <details {...props} />,
		};
	}, [onFileClick, theme, cwd, file, showRemoteImages, sshRemoteId]);

	return (
		<div
			ref={markdownContainerRef}
			className="file-preview-content prose prose-sm max-w-none"
			style={{ color: theme.colors.textMain }}
		>
			{/* Scoped prose styles to avoid CSS conflicts with other prose containers */}
			<style>{`
              .file-preview-content.prose h1 { color: ${theme.colors.accent}; font-size: 2em; font-weight: bold; margin: 0.67em 0; }
              .file-preview-content.prose h2 { color: ${theme.colors.success}; font-size: 1.5em; font-weight: bold; margin: 0.75em 0; }
              .file-preview-content.prose h3 { color: ${theme.colors.warning}; font-size: 1.17em; font-weight: bold; margin: 0.83em 0; }
              .file-preview-content.prose h4 { color: ${theme.colors.textMain}; font-size: 1em; font-weight: bold; margin: 1em 0; opacity: 0.9; }
              .file-preview-content.prose h5 { color: ${theme.colors.textMain}; font-size: 0.83em; font-weight: bold; margin: 1.17em 0; opacity: 0.8; }
              .file-preview-content.prose h6 { color: ${theme.colors.textDim}; font-size: 0.67em; font-weight: bold; margin: 1.33em 0; }
              .file-preview-content.prose p { color: ${theme.colors.textMain}; margin: 0.5em 0; }
              .file-preview-content.prose ul, .file-preview-content.prose ol { color: ${theme.colors.textMain}; margin: 0.5em 0; padding-left: 1.5em; }
              .file-preview-content.prose li { margin: 0.25em 0; }
              .file-preview-content.prose li:has(> input[type="checkbox"]) { list-style: none; margin-left: -1.5em; }
              .file-preview-content.prose code { background-color: ${theme.colors.bgActivity}; color: ${theme.colors.textMain}; padding: 0.2em 0.4em; border-radius: 3px; font-size: 0.9em; }
              .file-preview-content.prose pre { background-color: ${theme.colors.bgActivity}; color: ${theme.colors.textMain}; padding: 1em; border-radius: 6px; overflow-x: auto; }
              .file-preview-content.prose pre code { background: none; padding: 0; }
              .file-preview-content.prose blockquote { border-left: 4px solid ${theme.colors.border}; padding-left: 1em; margin: 0.5em 0; color: ${theme.colors.textDim}; }
              .file-preview-content.prose a { color: ${theme.colors.accent}; text-decoration: underline; }
              .file-preview-content.prose hr { border: none; border-top: 2px solid ${theme.colors.border}; margin: 1em 0; }
              .file-preview-content.prose table { border-collapse: collapse; width: 100%; margin: 0.5em 0; }
              .file-preview-content.prose th, .file-preview-content.prose td { border: 1px solid ${theme.colors.border}; padding: 0.5em; text-align: left; }
              .file-preview-content.prose th { background-color: ${theme.colors.bgActivity}; font-weight: bold; }
              .file-preview-content.prose strong { font-weight: bold; }
              .file-preview-content.prose em { font-style: italic; }
              .file-preview-content.prose img { display: block; max-width: 100%; height: auto; }
            `}</style>
			<ReactMarkdown
				remarkPlugins={remarkPlugins}
				rehypePlugins={rehypePlugins}
				components={markdownComponents}
			>
				{file.content}
			</ReactMarkdown>
		</div>
	);
});
