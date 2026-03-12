/**
 * ToolApprovalView - Renders a tool-approval interaction request.
 *
 * Displays the tool name, decision reason, blocked path, and input parameters.
 * Provides Approve / Deny buttons that dispatch the matching InteractionResponse.
 *
 * This component is provider-neutral: it reads only from the shared
 * ToolApprovalRequest shape and never references Claude-specific payloads.
 */

import React, { useRef, useState, useCallback, memo } from 'react';
import { Shield, ShieldCheck, ShieldX, ChevronDown, ChevronRight, Code2 } from 'lucide-react';
import type { Theme, ToolApprovalRequest, InteractionResponse } from '../../types';
import { CollapsibleJsonViewer } from '../CollapsibleJsonViewer';

export interface ToolApprovalViewProps {
	theme: Theme;
	request: ToolApprovalRequest;
	onRespond: (response: InteractionResponse) => void;
	/** Ref forwarded to the primary action button for auto-focus */
	primaryButtonRef?: React.RefObject<HTMLButtonElement>;
}

export const ToolApprovalView = memo(function ToolApprovalView({
	theme,
	request,
	onRespond,
	primaryButtonRef,
}: ToolApprovalViewProps) {
	const [showInput, setShowInput] = useState(false);

	const handleApprove = useCallback(() => {
		onRespond({ kind: 'approve' });
	}, [onRespond]);

	const handleDeny = useCallback(() => {
		onRespond({ kind: 'deny' });
	}, [onRespond]);

	return (
		<div className="space-y-4" data-testid="tool-approval-view">
			{/* Tool identity */}
			<div className="flex items-center gap-3">
				<div
					className="p-2 rounded-full shrink-0"
					style={{ backgroundColor: `${theme.colors.warning}20` }}
				>
					<Shield className="w-5 h-5" style={{ color: theme.colors.warning }} />
				</div>
				<div className="min-w-0">
					<div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>
						{request.toolName}
					</div>
					{request.subagentId && (
						<div className="text-xs" style={{ color: theme.colors.textDim }}>
							via {request.subagentId}
						</div>
					)}
				</div>
			</div>

			{/* Decision reason */}
			{request.decisionReason && (
				<p
					className="text-sm leading-relaxed"
					style={{ color: theme.colors.textMain }}
					data-testid="decision-reason"
				>
					{request.decisionReason}
				</p>
			)}

			{/* Blocked path */}
			{request.blockedPath && (
				<div
					className="text-xs px-2 py-1 rounded font-mono truncate"
					style={{
						color: theme.colors.textDim,
						backgroundColor: `${theme.colors.textDim}10`,
					}}
					title={request.blockedPath}
					data-testid="blocked-path"
				>
					{request.blockedPath}
				</div>
			)}

			{/* Collapsible tool input */}
			{request.toolInput && Object.keys(request.toolInput).length > 0 && (
				<div className="border rounded" style={{ borderColor: theme.colors.border }}>
					<button
						type="button"
						onClick={() => setShowInput(!showInput)}
						className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5 transition-colors rounded"
						style={{ color: theme.colors.textDim }}
						data-testid="toggle-input"
					>
						{showInput ? (
							<ChevronDown className="w-3 h-3" />
						) : (
							<ChevronRight className="w-3 h-3" />
						)}
						<Code2 className="w-3 h-3" />
						<span>Tool Input</span>
					</button>
					{showInput && (
						<div className="px-2 pb-2">
							<CollapsibleJsonViewer
								data={request.toolInput}
								theme={theme}
								initialExpandLevel={2}
								maxStringLength={120}
							/>
						</div>
					)}
				</div>
			)}

			{/* Actions */}
			<div className="flex gap-2 pt-2">
				<button
					type="button"
					onClick={handleDeny}
					className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded border hover:bg-white/5 transition-colors text-sm"
					style={{
						borderColor: theme.colors.border,
						color: theme.colors.textMain,
					}}
					data-testid="deny-button"
				>
					<ShieldX className="w-4 h-4" />
					Deny
				</button>
				<button
					ref={primaryButtonRef}
					type="button"
					onClick={handleApprove}
					className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded transition-colors text-sm font-medium"
					style={{
						backgroundColor: theme.colors.accent,
						color: theme.colors.accentForeground,
					}}
					data-testid="approve-button"
				>
					<ShieldCheck className="w-4 h-4" />
					Approve
				</button>
			</div>
		</div>
	);
});

export default ToolApprovalView;
