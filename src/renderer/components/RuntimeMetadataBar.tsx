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
 */

import { useState, useRef, useEffect, memo } from 'react';
import { Sparkles, Terminal, Cpu, Bot } from 'lucide-react';
import type { Theme } from '../types';
import { useSessionRuntimeMetadata } from '../hooks/agent/useSessionRuntimeMetadata';

interface RuntimeMetadataBarProps {
	/** Session ID to look up runtime metadata */
	sessionId: string;
	theme: Theme;
}

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
	const totalItems = skills.length + slashCommands.length + availableModels.length + availableAgents.length;
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
				{skills.length > 0 && (
					<span className="flex items-center gap-1" style={{ color: theme.colors.textDim }}>
						<Sparkles className="w-3 h-3" />
						<span>{skills.length}</span>
					</span>
				)}
				{slashCommands.length > 0 && (
					<span className="flex items-center gap-1" style={{ color: theme.colors.textDim }}>
						<Terminal className="w-3 h-3" />
						<span>{slashCommands.length}</span>
					</span>
				)}
				{availableModels.length > 0 && (
					<span className="flex items-center gap-1" style={{ color: theme.colors.textDim }}>
						<Cpu className="w-3 h-3" />
						<span>{availableModels.length}</span>
					</span>
				)}
				{availableAgents.length > 0 && (
					<span className="flex items-center gap-1" style={{ color: theme.colors.textDim }}>
						<Bot className="w-3 h-3" />
						<span>{availableAgents.length}</span>
					</span>
				)}
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
							{/* Skills section */}
							{skills.length > 0 && (
								<MetadataSection
									icon={<Sparkles className="w-3 h-3" />}
									label="Skills"
									theme={theme}
								>
									{skills.map((skill) => (
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
									))}
								</MetadataSection>
							)}

							{/* Slash commands section */}
							{slashCommands.length > 0 && (
								<MetadataSection
									icon={<Terminal className="w-3 h-3" />}
									label="Slash Commands"
									theme={theme}
								>
									{slashCommands.map((cmd) => (
										<div
											key={cmd}
											className="px-3 py-1 text-xs font-mono"
											style={{ color: theme.colors.textMain }}
										>
											{cmd.startsWith('/') ? cmd : `/${cmd}`}
										</div>
									))}
								</MetadataSection>
							)}

							{/* Available models section */}
							{availableModels.length > 0 && (
								<MetadataSection
									icon={<Cpu className="w-3 h-3" />}
									label="Available Models"
									theme={theme}
								>
									{availableModels.map((model) => (
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
									))}
								</MetadataSection>
							)}

							{/* Available agents section */}
							{availableAgents.length > 0 && (
								<MetadataSection
									icon={<Bot className="w-3 h-3" />}
									label="Sub-Agents"
									theme={theme}
								>
									{availableAgents.map((agent) => (
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
									))}
								</MetadataSection>
							)}
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
