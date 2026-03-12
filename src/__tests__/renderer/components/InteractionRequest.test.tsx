/**
 * Tests for InteractionRequest UI components
 *
 * Covers:
 * - ToolApprovalView: rendering, approve/deny actions, collapsible input
 * - ClarificationView: rendering, option selection, free text, submit/cancel
 * - InteractionRequestModal: store integration, kind dispatch, FIFO ordering
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { LayerStackProvider } from '../../../renderer/contexts/LayerStackContext';
import { useHarnessStore } from '../../../renderer/stores/harnessStore';
import { useSessionStore } from '../../../renderer/stores/sessionStore';
import { ToolApprovalView } from '../../../renderer/components/InteractionRequest/ToolApprovalView';
import { ClarificationView } from '../../../renderer/components/InteractionRequest/ClarificationView';
import { InteractionRequestModal } from '../../../renderer/components/InteractionRequest/InteractionRequestModal';
import type { Theme, ToolApprovalRequest, ClarificationRequest, InteractionResponse } from '../../../renderer/types';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('lucide-react', () => ({
	Shield: ({ className, style }: any) => <svg data-testid="shield-icon" className={className} style={style} />,
	ShieldCheck: ({ className }: any) => <svg data-testid="shield-check-icon" className={className} />,
	ShieldX: ({ className }: any) => <svg data-testid="shield-x-icon" className={className} />,
	HelpCircle: ({ className, style }: any) => <svg data-testid="help-circle-icon" className={className} style={style} />,
	MessageSquare: ({ className, style }: any) => <svg data-testid="message-square-icon" className={className} style={style} />,
	Check: ({ className, style }: any) => <svg data-testid="check-icon" className={className} style={style} />,
	Send: ({ className }: any) => <svg data-testid="send-icon" className={className} />,
	X: ({ className }: any) => <svg data-testid="x-icon" className={className} />,
	ChevronDown: ({ className }: any) => <svg data-testid="chevron-down" className={className} />,
	ChevronRight: ({ className }: any) => <svg data-testid="chevron-right" className={className} />,
	Code2: ({ className }: any) => <svg data-testid="code2-icon" className={className} />,
}));

// Mock CollapsibleJsonViewer — just show a placeholder
vi.mock('../../../renderer/components/CollapsibleJsonViewer', () => ({
	CollapsibleJsonViewer: ({ data }: { data: unknown }) => (
		<pre data-testid="json-viewer">{JSON.stringify(data)}</pre>
	),
}));

// ============================================================================
// Test fixtures
// ============================================================================

const testTheme: Theme = {
	id: 'test-theme' as any,
	name: 'Test Theme',
	mode: 'dark',
	colors: {
		bgMain: '#1e1e1e',
		bgSidebar: '#252526',
		bgActivity: '#333333',
		textMain: '#d4d4d4',
		textDim: '#808080',
		accent: '#007acc',
		accentDim: '#007acc80',
		accentText: '#007acc',
		accentForeground: '#ffffff',
		border: '#404040',
		error: '#f14c4c',
		warning: '#cca700',
		success: '#89d185',
	},
};

function createToolApproval(overrides: Partial<ToolApprovalRequest> = {}): ToolApprovalRequest {
	return {
		interactionId: overrides.interactionId ?? `int-${Math.random().toString(36).slice(2, 8)}`,
		sessionId: overrides.sessionId ?? 'session-1',
		agentId: overrides.agentId ?? 'claude-code',
		kind: 'tool-approval',
		timestamp: overrides.timestamp ?? Date.now(),
		toolUseId: overrides.toolUseId ?? 'tool-use-1',
		toolName: overrides.toolName ?? 'Edit',
		toolInput: overrides.toolInput ?? { file_path: '/src/app.ts' },
		...overrides,
	};
}

function createClarification(overrides: Partial<ClarificationRequest> = {}): ClarificationRequest {
	return {
		interactionId: overrides.interactionId ?? `int-${Math.random().toString(36).slice(2, 8)}`,
		sessionId: overrides.sessionId ?? 'session-1',
		agentId: overrides.agentId ?? 'claude-code',
		kind: 'clarification',
		timestamp: overrides.timestamp ?? Date.now(),
		questions: overrides.questions ?? [
			{
				question: 'Which approach do you prefer?',
				header: 'Approach',
				options: [
					{ label: 'Option A', description: 'The first approach' },
					{ label: 'Option B', description: 'The second approach' },
				],
				multiSelect: false,
			},
		],
		allowFreeText: overrides.allowFreeText ?? true,
		...overrides,
	};
}

const renderWithLayerStack = (ui: React.ReactElement) => {
	return render(<LayerStackProvider>{ui}</LayerStackProvider>);
};

// ============================================================================
// Mock IPC
// ============================================================================

const mockRespondToInteraction = vi.fn().mockResolvedValue(undefined);

(window as any).maestro = {
	...(window as any).maestro,
	process: {
		...((window as any).maestro?.process ?? {}),
		respondToInteraction: mockRespondToInteraction,
	},
};

// ============================================================================
// Setup
// ============================================================================

function resetStores() {
	useHarnessStore.setState({ pendingInteractions: {}, runtimeMetadata: {} });
	useSessionStore.setState({ activeSessionId: '' });
}

beforeEach(() => {
	resetStores();
	vi.clearAllMocks();
});

afterEach(() => {
	vi.restoreAllMocks();
});

// ============================================================================
// ToolApprovalView Tests
// ============================================================================

describe('ToolApprovalView', () => {
	it('renders tool name', () => {
		const request = createToolApproval({ toolName: 'Bash' });
		renderWithLayerStack(
			<ToolApprovalView theme={testTheme} request={request} onRespond={vi.fn()} />
		);

		expect(screen.getByText('Bash')).toBeInTheDocument();
	});

	it('renders decision reason when present', () => {
		const request = createToolApproval({
			decisionReason: 'File is outside allowed directories',
		});
		renderWithLayerStack(
			<ToolApprovalView theme={testTheme} request={request} onRespond={vi.fn()} />
		);

		expect(screen.getByTestId('decision-reason')).toHaveTextContent(
			'File is outside allowed directories'
		);
	});

	it('renders blocked path when present', () => {
		const request = createToolApproval({ blockedPath: '/etc/passwd' });
		renderWithLayerStack(
			<ToolApprovalView theme={testTheme} request={request} onRespond={vi.fn()} />
		);

		expect(screen.getByTestId('blocked-path')).toHaveTextContent('/etc/passwd');
	});

	it('renders subagent ID when present', () => {
		const request = createToolApproval({ subagentId: 'research-agent' });
		renderWithLayerStack(
			<ToolApprovalView theme={testTheme} request={request} onRespond={vi.fn()} />
		);

		expect(screen.getByText('via research-agent')).toBeInTheDocument();
	});

	it('renders approve and deny buttons', () => {
		renderWithLayerStack(
			<ToolApprovalView
				theme={testTheme}
				request={createToolApproval()}
				onRespond={vi.fn()}
			/>
		);

		expect(screen.getByTestId('approve-button')).toHaveTextContent('Approve');
		expect(screen.getByTestId('deny-button')).toHaveTextContent('Deny');
	});

	it('calls onRespond with approve when Approve is clicked', () => {
		const onRespond = vi.fn();
		renderWithLayerStack(
			<ToolApprovalView
				theme={testTheme}
				request={createToolApproval()}
				onRespond={onRespond}
			/>
		);

		fireEvent.click(screen.getByTestId('approve-button'));
		expect(onRespond).toHaveBeenCalledWith({ kind: 'approve' });
	});

	it('calls onRespond with deny when Deny is clicked', () => {
		const onRespond = vi.fn();
		renderWithLayerStack(
			<ToolApprovalView
				theme={testTheme}
				request={createToolApproval()}
				onRespond={onRespond}
			/>
		);

		fireEvent.click(screen.getByTestId('deny-button'));
		expect(onRespond).toHaveBeenCalledWith({ kind: 'deny' });
	});

	it('toggles tool input viewer on click', () => {
		const request = createToolApproval({
			toolInput: { file_path: '/src/app.ts', content: 'hello' },
		});
		renderWithLayerStack(
			<ToolApprovalView theme={testTheme} request={request} onRespond={vi.fn()} />
		);

		// Input should be collapsed initially
		expect(screen.queryByTestId('json-viewer')).not.toBeInTheDocument();

		// Click to expand
		fireEvent.click(screen.getByTestId('toggle-input'));
		expect(screen.getByTestId('json-viewer')).toBeInTheDocument();

		// Click to collapse
		fireEvent.click(screen.getByTestId('toggle-input'));
		expect(screen.queryByTestId('json-viewer')).not.toBeInTheDocument();
	});

	it('does not render input toggle when toolInput is empty', () => {
		const request = createToolApproval({ toolInput: {} });
		renderWithLayerStack(
			<ToolApprovalView theme={testTheme} request={request} onRespond={vi.fn()} />
		);

		expect(screen.queryByTestId('toggle-input')).not.toBeInTheDocument();
	});

	it('does not render decision reason when absent', () => {
		const request = createToolApproval({ decisionReason: undefined });
		renderWithLayerStack(
			<ToolApprovalView theme={testTheme} request={request} onRespond={vi.fn()} />
		);

		expect(screen.queryByTestId('decision-reason')).not.toBeInTheDocument();
	});
});

// ============================================================================
// ClarificationView Tests
// ============================================================================

describe('ClarificationView', () => {
	it('renders question text', () => {
		const request = createClarification({
			questions: [
				{
					question: 'Pick your database',
					header: 'Database',
					options: [
						{ label: 'PostgreSQL', description: 'Relational' },
						{ label: 'MongoDB', description: 'Document store' },
					],
					multiSelect: false,
				},
			],
		});
		renderWithLayerStack(
			<ClarificationView theme={testTheme} request={request} onRespond={vi.fn()} />
		);

		expect(screen.getByText('Pick your database')).toBeInTheDocument();
		expect(screen.getByText('Database')).toBeInTheDocument();
	});

	it('renders all options', () => {
		renderWithLayerStack(
			<ClarificationView
				theme={testTheme}
				request={createClarification()}
				onRespond={vi.fn()}
			/>
		);

		expect(screen.getByTestId('option-Option A')).toBeInTheDocument();
		expect(screen.getByTestId('option-Option B')).toBeInTheDocument();
	});

	it('renders option descriptions', () => {
		renderWithLayerStack(
			<ClarificationView
				theme={testTheme}
				request={createClarification()}
				onRespond={vi.fn()}
			/>
		);

		expect(screen.getByText('The first approach')).toBeInTheDocument();
		expect(screen.getByText('The second approach')).toBeInTheDocument();
	});

	it('renders free text input when allowFreeText is true', () => {
		renderWithLayerStack(
			<ClarificationView
				theme={testTheme}
				request={createClarification({ allowFreeText: true })}
				onRespond={vi.fn()}
			/>
		);

		expect(screen.getByTestId('free-text-input')).toBeInTheDocument();
	});

	it('does not render free text input when allowFreeText is false', () => {
		renderWithLayerStack(
			<ClarificationView
				theme={testTheme}
				request={createClarification({ allowFreeText: false })}
				onRespond={vi.fn()}
			/>
		);

		expect(screen.queryByTestId('free-text-input')).not.toBeInTheDocument();
	});

	it('submit button is disabled when nothing is selected and no text', () => {
		renderWithLayerStack(
			<ClarificationView
				theme={testTheme}
				request={createClarification({ allowFreeText: false })}
				onRespond={vi.fn()}
			/>
		);

		expect(screen.getByTestId('submit-button')).toBeDisabled();
	});

	it('submit button enables after selecting an option', () => {
		renderWithLayerStack(
			<ClarificationView
				theme={testTheme}
				request={createClarification({ allowFreeText: false })}
				onRespond={vi.fn()}
			/>
		);

		fireEvent.click(screen.getByTestId('option-Option A'));
		expect(screen.getByTestId('submit-button')).not.toBeDisabled();
	});

	it('single-select replaces previous selection', () => {
		const onRespond = vi.fn();
		renderWithLayerStack(
			<ClarificationView
				theme={testTheme}
				request={createClarification({ allowFreeText: false })}
				onRespond={onRespond}
			/>
		);

		// Select A, then B (single-select should replace)
		fireEvent.click(screen.getByTestId('option-Option A'));
		fireEvent.click(screen.getByTestId('option-Option B'));
		fireEvent.click(screen.getByTestId('submit-button'));

		expect(onRespond).toHaveBeenCalledWith({
			kind: 'clarification-answer',
			answers: [
				{
					questionIndex: 0,
					selectedOptionLabels: ['Option B'],
					text: undefined,
				},
			],
		});
	});

	it('multi-select accumulates selections', () => {
		const onRespond = vi.fn();
		const request = createClarification({
			allowFreeText: false,
			questions: [
				{
					question: 'Select features',
					header: 'Features',
					options: [
						{ label: 'Auth', description: 'Authentication' },
						{ label: 'DB', description: 'Database' },
						{ label: 'Cache', description: 'Caching' },
					],
					multiSelect: true,
				},
			],
		});
		renderWithLayerStack(
			<ClarificationView theme={testTheme} request={request} onRespond={onRespond} />
		);

		fireEvent.click(screen.getByTestId('option-Auth'));
		fireEvent.click(screen.getByTestId('option-Cache'));
		fireEvent.click(screen.getByTestId('submit-button'));

		const response = onRespond.mock.calls[0][0] as { kind: string; answers: any[] };
		expect(response.kind).toBe('clarification-answer');
		expect(response.answers[0].selectedOptionLabels).toContain('Auth');
		expect(response.answers[0].selectedOptionLabels).toContain('Cache');
		expect(response.answers[0].selectedOptionLabels).not.toContain('DB');
	});

	it('multi-select deselects on second click', () => {
		const onRespond = vi.fn();
		const request = createClarification({
			allowFreeText: false,
			questions: [
				{
					question: 'Select',
					header: 'Q',
					options: [
						{ label: 'X', description: '' },
						{ label: 'Y', description: '' },
					],
					multiSelect: true,
				},
			],
		});
		renderWithLayerStack(
			<ClarificationView theme={testTheme} request={request} onRespond={onRespond} />
		);

		// Select X, then deselect X
		fireEvent.click(screen.getByTestId('option-X'));
		fireEvent.click(screen.getByTestId('option-X'));

		// Only Y should be submittable now — but nothing is selected
		expect(screen.getByTestId('submit-button')).toBeDisabled();
	});

	it('submits free text response', () => {
		const onRespond = vi.fn();
		renderWithLayerStack(
			<ClarificationView
				theme={testTheme}
				request={createClarification({ allowFreeText: true })}
				onRespond={onRespond}
			/>
		);

		const input = screen.getByTestId('free-text-input');
		fireEvent.change(input, { target: { value: 'Custom answer' } });
		fireEvent.click(screen.getByTestId('submit-button'));

		const response = onRespond.mock.calls[0][0] as { kind: string; answers: any[] };
		expect(response.kind).toBe('clarification-answer');
		expect(response.answers[0].text).toBe('Custom answer');
	});

	it('calls onRespond with cancel when Cancel is clicked', () => {
		const onRespond = vi.fn();
		renderWithLayerStack(
			<ClarificationView
				theme={testTheme}
				request={createClarification()}
				onRespond={onRespond}
			/>
		);

		fireEvent.click(screen.getByTestId('cancel-button'));
		expect(onRespond).toHaveBeenCalledWith({ kind: 'cancel' });
	});

	it('renders multiple questions', () => {
		const request = createClarification({
			questions: [
				{
					question: 'First question?',
					header: 'Q1',
					options: [{ label: 'A1', description: '' }],
					multiSelect: false,
				},
				{
					question: 'Second question?',
					header: 'Q2',
					options: [{ label: 'A2', description: '' }],
					multiSelect: false,
				},
			],
		});
		renderWithLayerStack(
			<ClarificationView theme={testTheme} request={request} onRespond={vi.fn()} />
		);

		expect(screen.getByTestId('question-0')).toBeInTheDocument();
		expect(screen.getByTestId('question-1')).toBeInTheDocument();
		expect(screen.getByText('First question?')).toBeInTheDocument();
		expect(screen.getByText('Second question?')).toBeInTheDocument();
	});

	it('shows multi-select hint for multi-select questions', () => {
		const request = createClarification({
			questions: [
				{
					question: 'Pick many',
					header: 'Multi',
					options: [
						{ label: 'X', description: '' },
						{ label: 'Y', description: '' },
					],
					multiSelect: true,
				},
			],
		});
		renderWithLayerStack(
			<ClarificationView theme={testTheme} request={request} onRespond={vi.fn()} />
		);

		expect(screen.getByText('Select one or more options')).toBeInTheDocument();
	});
});

// ============================================================================
// InteractionRequestModal Tests
// ============================================================================

describe('InteractionRequestModal', () => {
	it('does not render when there are no pending interactions', () => {
		useSessionStore.setState({ activeSessionId: 'session-1' });
		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);

		expect(screen.queryByTestId('interaction-request-modal')).not.toBeInTheDocument();
	});

	it('does not render when there is no active session', () => {
		useHarnessStore.setState({
			pendingInteractions: {
				'session-1': [createToolApproval({ sessionId: 'session-1' })],
			},
		});
		useSessionStore.setState({ activeSessionId: '' });

		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);
		expect(screen.queryByTestId('interaction-request-modal')).not.toBeInTheDocument();
	});

	it('renders a modal for a tool-approval interaction', () => {
		const request = createToolApproval({
			interactionId: 'int-1',
			sessionId: 'session-1',
			toolName: 'Write',
		});
		useSessionStore.setState({ activeSessionId: 'session-1' });
		useHarnessStore.setState({
			pendingInteractions: { 'session-1': [request] },
		});

		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);

		expect(screen.getByTestId('interaction-request-modal')).toBeInTheDocument();
		expect(screen.getByTestId('tool-approval-view')).toBeInTheDocument();
		expect(screen.getByText('Write')).toBeInTheDocument();
		expect(screen.getByText('Tool Approval Required')).toBeInTheDocument();
	});

	it('renders a modal for a clarification interaction', () => {
		const request = createClarification({
			interactionId: 'int-2',
			sessionId: 'session-1',
		});
		useSessionStore.setState({ activeSessionId: 'session-1' });
		useHarnessStore.setState({
			pendingInteractions: { 'session-1': [request] },
		});

		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);

		expect(screen.getByTestId('interaction-request-modal')).toBeInTheDocument();
		expect(screen.getByTestId('clarification-view')).toBeInTheDocument();
		expect(screen.getByText('Agent Needs Input')).toBeInTheDocument();
	});

	it('shows the oldest interaction first (FIFO)', () => {
		const older = createToolApproval({
			interactionId: 'int-old',
			sessionId: 'session-1',
			toolName: 'OldTool',
			timestamp: 1000,
		});
		const newer = createClarification({
			interactionId: 'int-new',
			sessionId: 'session-1',
			timestamp: 2000,
		});
		useSessionStore.setState({ activeSessionId: 'session-1' });
		useHarnessStore.setState({
			pendingInteractions: { 'session-1': [older, newer] },
		});

		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);

		// Should show tool approval (older), not clarification
		expect(screen.getByTestId('tool-approval-view')).toBeInTheDocument();
		expect(screen.queryByTestId('clarification-view')).not.toBeInTheDocument();
		expect(screen.getByText('OldTool')).toBeInTheDocument();
	});

	it('shows remaining count when multiple interactions are queued', () => {
		const req1 = createToolApproval({ interactionId: 'int-1', sessionId: 'session-1' });
		const req2 = createClarification({ interactionId: 'int-2', sessionId: 'session-1' });
		const req3 = createToolApproval({ interactionId: 'int-3', sessionId: 'session-1' });

		useSessionStore.setState({ activeSessionId: 'session-1' });
		useHarnessStore.setState({
			pendingInteractions: { 'session-1': [req1, req2, req3] },
		});

		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);

		expect(screen.getByTestId('remaining-count')).toHaveTextContent('+2 more pending');
	});

	it('does not show remaining count when only one interaction', () => {
		const req = createToolApproval({ interactionId: 'int-1', sessionId: 'session-1' });
		useSessionStore.setState({ activeSessionId: 'session-1' });
		useHarnessStore.setState({
			pendingInteractions: { 'session-1': [req] },
		});

		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);

		expect(screen.queryByTestId('remaining-count')).not.toBeInTheDocument();
	});

	it('calls respondToInteraction on approve', async () => {
		const request = createToolApproval({
			interactionId: 'int-1',
			sessionId: 'session-1',
		});
		useSessionStore.setState({ activeSessionId: 'session-1' });
		useHarnessStore.setState({
			pendingInteractions: { 'session-1': [request] },
		});

		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);

		fireEvent.click(screen.getByTestId('approve-button'));

		await waitFor(() => {
			expect(mockRespondToInteraction).toHaveBeenCalledWith(
				'session-1',
				'int-1',
				{ kind: 'approve' }
			);
		});
	});

	it('calls respondToInteraction on deny', async () => {
		const request = createToolApproval({
			interactionId: 'int-1',
			sessionId: 'session-1',
		});
		useSessionStore.setState({ activeSessionId: 'session-1' });
		useHarnessStore.setState({
			pendingInteractions: { 'session-1': [request] },
		});

		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);

		fireEvent.click(screen.getByTestId('deny-button'));

		await waitFor(() => {
			expect(mockRespondToInteraction).toHaveBeenCalledWith(
				'session-1',
				'int-1',
				{ kind: 'deny' }
			);
		});
	});

	it('removes interaction from store after responding', async () => {
		const request = createToolApproval({
			interactionId: 'int-1',
			sessionId: 'session-1',
		});
		useSessionStore.setState({ activeSessionId: 'session-1' });
		useHarnessStore.setState({
			pendingInteractions: { 'session-1': [request] },
		});

		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);

		fireEvent.click(screen.getByTestId('approve-button'));

		await waitFor(() => {
			const state = useHarnessStore.getState();
			expect(state.pendingInteractions['session-1'] ?? []).toHaveLength(0);
		});
	});

	it('only shows interactions for the active session', () => {
		const activeReq = createToolApproval({
			interactionId: 'int-active',
			sessionId: 'session-1',
			toolName: 'ActiveTool',
		});
		const otherReq = createToolApproval({
			interactionId: 'int-other',
			sessionId: 'session-2',
			toolName: 'OtherTool',
		});
		useSessionStore.setState({ activeSessionId: 'session-1' });
		useHarnessStore.setState({
			pendingInteractions: {
				'session-1': [activeReq],
				'session-2': [otherReq],
			},
		});

		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);

		expect(screen.getByText('ActiveTool')).toBeInTheDocument();
		expect(screen.queryByText('OtherTool')).not.toBeInTheDocument();
	});

	it('sends cancel response when modal close is triggered', async () => {
		const request = createToolApproval({
			interactionId: 'int-1',
			sessionId: 'session-1',
		});
		useSessionStore.setState({ activeSessionId: 'session-1' });
		useHarnessStore.setState({
			pendingInteractions: { 'session-1': [request] },
		});

		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);

		// Click the X close button in the modal header
		const closeButton = screen.getByLabelText('Close modal');
		fireEvent.click(closeButton);

		await waitFor(() => {
			expect(mockRespondToInteraction).toHaveBeenCalledWith(
				'session-1',
				'int-1',
				{ kind: 'cancel' }
			);
		});
	});
});
