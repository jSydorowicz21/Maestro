/**
 * RuntimeMetadataBar - Displays harness runtime metadata (skills, models, agents)
 * as a compact widget in the MainPanel header.
 *
 * Follows the GitStatusWidget pattern:
 * - Memoized to prevent cascade re-renders
 * - Tooltip-based detail view on hover
 * - Reads from harnessStore via useSessionRuntimeMetadata (Layer 3)
 * - Provider-neutral: no agent-specific branching or styling
 *
 * Only renders when the session has non-empty runtime metadata to display.
 *
 * Category configuration is data-driven: add a new metadata category by
 * appending one entry to the METADATA_CATEGORIES array.
 */

import { useState, useRef, useEffect, memo } from 'react';
import { Sparkles, Terminal, Cpu, Bot } from 'lucide-react';
import type { Theme } from '../types';
import {
	useSessionRuntimeMetadata,
	type UseSessionRuntimeMetadataReturn,
} from '../hooks/agent/useSessionRuntimeMetadata';

interface RuntimeMetadataBarProps {
	/** Session ID to look up runtime metadata */
	sessionId: string;
	theme: Theme;
}

// ============================================================================
// Config-driven category definitions
// ============================================================================

/**
 * Metadata fields available to category extractors.
 */
type MetadataFields = Pick<
	UseSessionRuntimeMetadataReturn,
	'skills' | 'slashCommands' | 'availableModels' | 'availableAgents'
>;

/**
 * Configuration for a single metadata category displayed in the bar and tooltip.
 *
 * To add a new category, append an entry to METADATA_CATEGORIES with these fields.
 */
interface MetadataCategoryConfig {
	/** Unique key for React iteration */
	key: string;
	/** Section header label in the tooltip */
	label: string;
	/** Icon component for the summary pill and section header */
	icon: React.ComponentType<{ className?: string }>;
	/** Extract the item count for the summary pill */
	getCount: (data: MetadataFields) => number;
	/** Extract normalized items (each must have an `id`) for the tooltip section */
	getItems: (data: MetadataFields) => { id: string }[];
	/** Render a single tooltip item */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	renderItem: (item: any, theme: Theme) => React.ReactNode;
}

/**
 * Category configuration array. Each entry produces one summary pill and one
 * tooltip section. Adding a new metadata category is a one-entry addition here.
 */
const METADATA_CATEGORIES: MetadataCategoryConfig[] = [
	{
		key: 'skills',
		label: 'Skills',
		icon: Sparkles,
		getCount: (data) => data.skills.length,
		getItems: (data) => data.skills,
		renderItem: (skill: { id: string; name: string; description?: string }, theme) => (
			<div
				key={skill.id}
				className="px-3 py-1.5 text-xs"
				style={{ color: theme.colors.textMain }}
			>
				<span className="font-medium">{skill.name}</span>
				{skill.description && (
					<span
						className="ml-1.5"
						style={{ color: theme.colors.textDim }}
					>
						{skill.description}
					</span>
				)}
			</div>
		),
	},
	{
		key: 'slashCommands',
		label: 'Slash Commands',
		icon: Terminal,
		getCount: (data) => data.slashCommands.length,
		getItems: (data) => data.slashCommands.map((cmd) => ({ id: cmd, name: cmd })),
		renderItem: (item: { id: string; name: string }, theme) => (
			<div
				key={item.id}
				className="px-3 py-1 text-xs font-mono"
				style={{ color: theme.colors.textMain }}
			>
				{item.name.startsWith('/') ? item.name : `/${item.name}`}
			</div>
		),
	},
	{
		key: 'availableModels',
		label: 'Available Models',
		icon: Cpu,
		getCount: (data) => data.availableModels.length,
		getItems: (data) => data.availableModels,
		renderItem: (model: { id: string; label?: string }, theme) => (
			<div
				key={model.id}
				className="px-3 py-1 text-xs"
				style={{ color: theme.colors.textMain }}
			>
				<span className="font-mono">{model.id}</span>
				{model.label && model.label !== model.id && (
					<span
						className="ml-1.5"
						style={{ color: theme.colors.textDim }}
					>
						({model.label})
					</span>
				)}
			</div>
		),
	},
	{
		key: 'availableAgents',
		label: 'Sub-Agents',
		icon: Bot,
		getCount: (data) => data.availableAgents.length,
		getItems: (data) => data.availableAgents,
		renderItem: (agent: { id: string; label?: string }, theme) => (
			<div
				key={agent.id}
				className="px-3 py-1 text-xs"
				style={{ color: theme.colors.textMain }}
			>
				<span className="font-medium">
					{agent.label || agent.id}
				</span>
				{agent.label && (
					<span
						className="ml-1.5 font-mono"
						style={{ color: theme.colors.textDim }}
					>
						{agent.id}
					</span>
				)}
			</div>
		),
	},
];

// ============================================================================
// Component
// ============================================================================

/**
 * RuntimeMetadataBar - Compact header widget for harness runtime metadata.
 *
 * Shows a summary pill with counts of skills, slash commands, models, and agents.
 * Hover reveals a tooltip with full details. Only renders when metadata is present.
 */
export const RuntimeMetadataBar = memo(function RuntimeMetadataBar({
	sessionId,
	theme,
}: RuntimeMetadataBarProps) {
	const { skills, slashCommands, availableModels, availableAgents, hasMetadata } =
		useSessionRuntimeMetadata(sessionId);

	const metadataFields: MetadataFields = { skills, slashCommands, availableModels, availableAgents };

	// Tooltip hover state with timeout for smooth UX
	const [tooltipOpen, setTooltipOpen] = useState(false);
	const tooltipTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Cleanup hover timeout on unmount
	useEffect(() => {
		return () => {
			if (tooltipTimeout.current) {
				clearTimeout(tooltipTimeout.current);
			}
		};
	}, []);

	// Don't render if no metadata or nothing to show
	const totalItems = METADATA_CATEGORIES.reduce(
		(sum, cat) => sum + cat.getCount(metadataFields),
		0
	);
	if (!hasMetadata || totalItems === 0) {
		return null;
	}

	return (
		<div
			className="relative shrink-0"
			onMouseEnter={() => {
				if (tooltipTimeout.current) {
					clearTimeout(tooltipTimeout.current);
					tooltipTimeout.current = null;
				}
				setTooltipOpen(true);
			}}
			onMouseLeave={() => {
				tooltipTimeout.current = setTimeout(() => {
					setTooltipOpen(false);
				}, 150);
			}}
		>
			<div
				className="flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors hover:bg-white/5 cursor-default"
				style={{ color: theme.colors.textMain }}
				title="Agent runtime metadata"
			>
				{METADATA_CATEGORIES.map((cat) => {
					const count = cat.getCount(metadataFields);
					if (count === 0) return null;
					const Icon = cat.icon;
					return (
						<span key={cat.key} className="flex items-center gap-1" style={{ color: theme.colors.textDim }}>
							<Icon className="w-3 h-3" />
							<span>{count}</span>
						</span>
					);
				})}
			</div>

			{/* Hover tooltip showing full metadata details */}
			{tooltipOpen && (
				<>
					{/* Invisible bridge to prevent hover gap */}
					<div
						className="absolute left-0 right-0 h-3 pointer-events-auto"
						style={{ top: '100%' }}
						onMouseEnter={() => {
							if (tooltipTimeout.current) {
								clearTimeout(tooltipTimeout.current);
								tooltipTimeout.current = null;
							}
							setTooltipOpen(true);
						}}
					/>
					<div
						className="absolute top-full left-0 mt-2 w-max max-w-[350px] rounded shadow-xl z-[100] pointer-events-auto"
						style={{
							backgroundColor: theme.colors.bgSidebar,
							border: `1px solid ${theme.colors.border}`,
						}}
						onMouseEnter={() => {
							if (tooltipTimeout.current) {
								clearTimeout(tooltipTimeout.current);
								tooltipTimeout.current = null;
							}
							setTooltipOpen(true);
						}}
						onMouseLeave={() => {
							tooltipTimeout.current = setTimeout(() => {
								setTooltipOpen(false);
							}, 150);
						}}
					>
						<div
							className="text-[10px] uppercase font-bold p-3 border-b"
							style={{
								color: theme.colors.textDim,
								borderColor: theme.colors.border,
							}}
						>
							Runtime Metadata
						</div>
						<div className="max-h-80 overflow-y-auto scrollbar-thin">
							{METADATA_CATEGORIES.map((cat) => {
								const items = cat.getItems(metadataFields);
								if (items.length === 0) return null;
								const Icon = cat.icon;
								return (
									<MetadataSection
										key={cat.key}
										icon={<Icon className="w-3 h-3" />}
										label={cat.label}
										theme={theme}
									>
										{items.map((item) => cat.renderItem(item, theme))}
									</MetadataSection>
								);
							})}
						</div>
					</div>
				</>
			)}
		</div>
	);
});

/**
 * Section within the tooltip with a header icon and label.
 */
function MetadataSection({
	icon,
	label,
	theme,
	children,
}: {
	icon: React.ReactNode;
	label: string;
	theme: Theme;
	children: React.ReactNode;
}) {
	return (
		<div className="border-b last:border-b-0" style={{ borderColor: theme.colors.border }}>
			<div
				className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-[10px] uppercase font-semibold"
				style={{ color: theme.colors.textDim }}
			>
				{icon}
				{label}
			</div>
			{children}
		</div>
	);
}
