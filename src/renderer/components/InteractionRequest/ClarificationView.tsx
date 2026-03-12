/**
 * ClarificationView - Renders a clarification interaction request.
 *
 * Displays one or more questions with selectable options and optional
 * free-text input. Supports single-select and multi-select question modes.
 *
 * This component is provider-neutral: it reads only from the shared
 * ClarificationRequest shape and never references provider-specific payloads.
 */

import React, { useState, useCallback, memo } from 'react';
import { HelpCircle, Check, Send, X } from 'lucide-react';
import type {
	Theme,
	ClarificationRequest,
	ClarificationQuestion,
	ClarificationAnswer,
	InteractionResponse,
} from '../../types';

export interface ClarificationViewProps {
	theme: Theme;
	request: ClarificationRequest;
	onRespond: (response: InteractionResponse) => void;
	/** Ref forwarded to the primary action button for auto-focus */
	primaryButtonRef?: React.RefObject<HTMLButtonElement>;
}

/**
 * Tracks selected options per question.
 * Key: question index, Value: set of selected option labels.
 */
type SelectionState = Record<number, Set<string>>;

export const ClarificationView = memo(function ClarificationView({
	theme,
	request,
	onRespond,
	primaryButtonRef,
}: ClarificationViewProps) {
	const [selections, setSelections] = useState<SelectionState>(() => {
		const initial: SelectionState = {};
		request.questions.forEach((_, i) => {
			initial[i] = new Set();
		});
		return initial;
	});
	const [freeText, setFreeText] = useState('');

	const toggleOption = useCallback(
		(questionIndex: number, label: string, multiSelect: boolean) => {
			setSelections((prev) => {
				const current = new Set(prev[questionIndex]);
				if (multiSelect) {
					if (current.has(label)) {
						current.delete(label);
					} else {
						current.add(label);
					}
				} else {
					// Single-select: replace the selection
					current.clear();
					current.add(label);
				}
				return { ...prev, [questionIndex]: current };
			});
		},
		[]
	);

	const hasAnySelection = Object.values(selections).some((s) => s.size > 0);
	const hasFreeText = freeText.trim().length > 0;
	const canSubmit = hasAnySelection || (request.allowFreeText && hasFreeText);

	const handleSubmit = useCallback(() => {
		if (!canSubmit) return;

		const answers: ClarificationAnswer[] = request.questions.map((_, i) => ({
			questionIndex: i,
			selectedOptionLabels: Array.from(selections[i] || []),
			text: undefined,
		}));

		// If free text is provided, attach it to the first question's answer
		if (request.allowFreeText && hasFreeText) {
			if (answers.length > 0) {
				answers[0] = { ...answers[0], text: freeText.trim() };
			} else {
				answers.push({ questionIndex: 0, text: freeText.trim() });
			}
		}

		onRespond({ kind: 'clarification-answer', answers });
	}, [canSubmit, selections, freeText, hasFreeText, request, onRespond]);

	const handleCancel = useCallback(() => {
		onRespond({ kind: 'cancel' });
	}, [onRespond]);

	return (
		<div className="space-y-4" data-testid="clarification-view">
			{/* Questions */}
			{request.questions.map((question, qIdx) => (
				<QuestionBlock
					key={qIdx}
					theme={theme}
					question={question}
					questionIndex={qIdx}
					selectedLabels={selections[qIdx] || new Set()}
					onToggle={toggleOption}
				/>
			))}

			{/* Free text input */}
			{request.allowFreeText && (
				<div className="space-y-1">
					<label
						className="text-xs font-medium"
						style={{ color: theme.colors.textDim }}
						htmlFor="clarification-free-text"
					>
						Or type a response
					</label>
					<textarea
						id="clarification-free-text"
						value={freeText}
						onChange={(e) => setFreeText(e.target.value)}
						placeholder="Type your response..."
						rows={2}
						className="w-full px-3 py-2 rounded border text-sm resize-none outline-none focus:ring-1"
						style={{
							borderColor: theme.colors.border,
							backgroundColor: `${theme.colors.bgMain}80`,
							color: theme.colors.textMain,
						}}
						data-testid="free-text-input"
					/>
				</div>
			)}

			{/* Actions */}
			<div className="flex gap-2 pt-2">
				<button
					type="button"
					onClick={handleCancel}
					className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded border hover:bg-white/5 transition-colors text-sm"
					style={{
						borderColor: theme.colors.border,
						color: theme.colors.textMain,
					}}
					data-testid="cancel-button"
				>
					<X className="w-4 h-4" />
					Cancel
				</button>
				<button
					ref={primaryButtonRef}
					type="button"
					onClick={handleSubmit}
					disabled={!canSubmit}
					className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
					style={{
						backgroundColor: theme.colors.accent,
						color: theme.colors.accentForeground,
					}}
					data-testid="submit-button"
				>
					<Send className="w-4 h-4" />
					Submit
				</button>
			</div>
		</div>
	);
});

// ============================================================================
// QuestionBlock - Renders a single question with its options
// ============================================================================

interface QuestionBlockProps {
	theme: Theme;
	question: ClarificationQuestion;
	questionIndex: number;
	selectedLabels: Set<string>;
	onToggle: (questionIndex: number, label: string, multiSelect: boolean) => void;
}

const QuestionBlock = memo(function QuestionBlock({
	theme,
	question,
	questionIndex,
	selectedLabels,
	onToggle,
}: QuestionBlockProps) {
	return (
		<div data-testid={`question-${questionIndex}`}>
			{/* Header and question text */}
			<div className="flex items-start gap-3 mb-3">
				<div
					className="p-2 rounded-full shrink-0"
					style={{ backgroundColor: `${theme.colors.accent}20` }}
				>
					<HelpCircle className="w-4 h-4" style={{ color: theme.colors.accent }} />
				</div>
				<div className="min-w-0">
					{question.header && (
						<div
							className="text-xs font-medium mb-0.5"
							style={{ color: theme.colors.textDim }}
						>
							{question.header}
						</div>
					)}
					<div className="text-sm" style={{ color: theme.colors.textMain }}>
						{question.question}
					</div>
				</div>
			</div>

			{/* Options */}
			<div className="space-y-1.5 ml-11">
				{question.options.map((option) => {
					const isSelected = selectedLabels.has(option.label);
					return (
						<button
							key={option.label}
							type="button"
							onClick={() => onToggle(questionIndex, option.label, question.multiSelect)}
							className="w-full flex items-start gap-3 px-3 py-2 rounded border text-left transition-colors hover:bg-white/5"
							style={{
								borderColor: isSelected ? theme.colors.accent : theme.colors.border,
								backgroundColor: isSelected ? `${theme.colors.accent}10` : 'transparent',
							}}
							data-testid={`option-${option.label}`}
						>
							{/* Selection indicator */}
							<div
								className="w-4 h-4 rounded shrink-0 mt-0.5 border flex items-center justify-center"
								style={{
									borderColor: isSelected ? theme.colors.accent : theme.colors.border,
									backgroundColor: isSelected ? theme.colors.accent : 'transparent',
									borderRadius: question.multiSelect ? '4px' : '50%',
								}}
							>
								{isSelected && (
									<Check
										className="w-3 h-3"
										style={{ color: theme.colors.accentForeground }}
									/>
								)}
							</div>
							{/* Label and description */}
							<div className="min-w-0 flex-1">
								<div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>
									{option.label}
								</div>
								{option.description && (
									<div className="text-xs mt-0.5" style={{ color: theme.colors.textDim }}>
										{option.description}
									</div>
								)}
							</div>
						</button>
					);
				})}
			</div>

			{/* Multi-select hint */}
			{question.multiSelect && (
				<div
					className="text-xs mt-1.5 ml-11"
					style={{ color: theme.colors.textDim }}
				>
					Select one or more options
				</div>
			)}
		</div>
	);
});

export default ClarificationView;
