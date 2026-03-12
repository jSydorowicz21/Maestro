/**
 * InteractionRequestModal - Generic modal for harness mid-turn interactions.
 *
 * Subscribes directly to harnessStore and sessionStore to display the oldest
 * pending interaction for the currently active session. Dispatches to
 * kind-specific views (ToolApprovalView, ClarificationView) based on the
 * interaction's `kind` discriminator.
 *
 * Design principles:
 * - Provider-neutral: never references Claude, Codex, or any specific agent.
 * - Kind-extensible: new interaction kinds can be added by adding a case
 *   to the switch without touching existing views.
 * - Self-contained store subscription: the parent only needs to render
 *   <InteractionRequestModal theme={theme} /> unconditionally.
 */

import React, { useRef, useCallback, memo } from 'react';
import { MessageSquare } from 'lucide-react';
import type { Theme, InteractionRequest, InteractionResponse } from '../../types';
import { MODAL_PRIORITIES } from '../../constants/modalPriorities';
import { Modal } from '../ui/Modal';
import { useHarnessStore } from '../../stores/harnessStore';
import { useSessionStore } from '../../stores/sessionStore';
import { ToolApprovalView } from './ToolApprovalView';
import { ClarificationView } from './ClarificationView';

export interface InteractionRequestModalProps {
	theme: Theme;
}

/** Stable empty array to avoid infinite re-render when no interactions exist */
const EMPTY_INTERACTIONS: InteractionRequest[] = [];

/**
 * Get a human-readable title for an interaction kind.
 */
function getInteractionTitle(request: InteractionRequest): string {
	switch (request.kind) {
		case 'tool-approval':
			return 'Tool Approval Required';
		case 'clarification':
			return 'Agent Needs Input';
		default:
			return 'Agent Interaction';
	}
}

/**
 * Get the header icon for an interaction kind.
 */
function getInteractionIcon(request: InteractionRequest, theme: Theme): React.ReactNode {
	switch (request.kind) {
		case 'tool-approval':
			return (
				<MessageSquare
					className="w-4 h-4"
					style={{ color: theme.colors.warning }}
				/>
			);
		case 'clarification':
			return (
				<MessageSquare
					className="w-4 h-4"
					style={{ color: theme.colors.accent }}
				/>
			);
		default:
			return (
				<MessageSquare
					className="w-4 h-4"
					style={{ color: theme.colors.textDim }}
				/>
			);
	}
}

export const InteractionRequestModal = memo(function InteractionRequestModal({
	theme,
}: InteractionRequestModalProps) {
	const primaryButtonRef = useRef<HTMLButtonElement>(null);

	// Subscribe to active session and pending interactions
	const activeSessionId = useSessionStore((s) => s.activeSessionId);
	const interactions = useHarnessStore((state) =>
		activeSessionId
			? (state.pendingInteractions[activeSessionId] ?? EMPTY_INTERACTIONS)
			: EMPTY_INTERACTIONS
	);

	// Show the oldest pending interaction (FIFO)
	const currentRequest = interactions.length > 0 ? interactions[0] : null;
	const remainingCount = interactions.length - 1;

	const respondToInteraction = useHarnessStore((s) => s.respondToInteraction);

	const handleRespond = useCallback(
		(response: InteractionResponse) => {
			if (!activeSessionId || !currentRequest) return;
			respondToInteraction(activeSessionId, currentRequest.interactionId, response);
		},
		[activeSessionId, currentRequest, respondToInteraction]
	);

	const handleCancel = useCallback(() => {
		handleRespond({ kind: 'cancel' });
	}, [handleRespond]);

	// Don't render if there's nothing to show
	if (!currentRequest) return null;

	const title = getInteractionTitle(currentRequest);
	const icon = getInteractionIcon(currentRequest, theme);

	return (
		<Modal
			theme={theme}
			title={title}
			priority={MODAL_PRIORITIES.INTERACTION_REQUEST}
			onClose={handleCancel}
			width={480}
			zIndex={10002}
			headerIcon={icon}
			initialFocusRef={primaryButtonRef}
			testId="interaction-request-modal"
		>
			{/* Timestamp and queue info */}
			<div
				className="flex items-center justify-between text-xs mb-4"
				style={{ color: theme.colors.textDim }}
			>
				<span>{new Date(currentRequest.timestamp).toLocaleTimeString()}</span>
				{remainingCount > 0 && (
					<span data-testid="remaining-count">
						+{remainingCount} more pending
					</span>
				)}
			</div>

			{/* Kind-specific view */}
			<InteractionContent
				theme={theme}
				request={currentRequest}
				onRespond={handleRespond}
				primaryButtonRef={primaryButtonRef}
			/>
		</Modal>
	);
});

// ============================================================================
// InteractionContent - Dispatches to kind-specific views
// ============================================================================

interface InteractionContentProps {
	theme: Theme;
	request: InteractionRequest;
	onRespond: (response: InteractionResponse) => void;
	primaryButtonRef: React.RefObject<HTMLButtonElement>;
}

/**
 * Dispatches rendering to the correct view based on interaction kind.
 * New kinds can be handled by adding cases here without modifying
 * existing view components.
 */
const InteractionContent = memo(function InteractionContent({
	theme,
	request,
	onRespond,
	primaryButtonRef,
}: InteractionContentProps) {
	switch (request.kind) {
		case 'tool-approval':
			return (
				<ToolApprovalView
					theme={theme}
					request={request}
					onRespond={onRespond}
					primaryButtonRef={primaryButtonRef}
				/>
			);
		case 'clarification':
			return (
				<ClarificationView
					theme={theme}
					request={request}
					onRespond={onRespond}
					primaryButtonRef={primaryButtonRef}
				/>
			);
		default: {
			// Defensive: unknown kind — show a generic fallback
			const _exhaustive: never = request;
			return (
				<div
					className="text-sm py-4 text-center"
					style={{ color: theme.colors.textDim }}
				>
					Unsupported interaction type
				</div>
			);
		}
	}
});

export default InteractionRequestModal;
