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

// ============================================================================
// Kind-neutral behavior tests
// ============================================================================

describe('InteractionRequestModal — kind-neutral behavior', () => {
	it('clarification interaction shows "Agent Needs Input" title, not tool-approval title', () => {
		const request = createClarification({
			interactionId: 'int-c1',
			sessionId: 'session-1',
		});
		useSessionStore.setState({ activeSessionId: 'session-1' });
		useHarnessStore.setState({
			pendingInteractions: { 'session-1': [request] },
		});

		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);

		expect(screen.getByText('Agent Needs Input')).toBeInTheDocument();
		expect(screen.queryByText('Tool Approval Required')).not.toBeInTheDocument();
	});

	it('clarification submit through modal dispatches structured answer via IPC', async () => {
		const request = createClarification({
			interactionId: 'int-c2',
			sessionId: 'session-1',
			allowFreeText: false,
		});
		useSessionStore.setState({ activeSessionId: 'session-1' });
		useHarnessStore.setState({
			pendingInteractions: { 'session-1': [request] },
		});

		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);

		// Select an option and submit
		fireEvent.click(screen.getByTestId('option-Option A'));
		fireEvent.click(screen.getByTestId('submit-button'));

		await waitFor(() => {
			expect(mockRespondToInteraction).toHaveBeenCalledWith(
				'session-1',
				'int-c2',
				{
					kind: 'clarification-answer',
					answers: [
						{
							questionIndex: 0,
							selectedOptionLabels: ['Option A'],
							text: undefined,
						},
					],
				}
			);
		});
	});

	it('clarification modal close sends cancel response, not deny', async () => {
		const request = createClarification({
			interactionId: 'int-c3',
			sessionId: 'session-1',
		});
		useSessionStore.setState({ activeSessionId: 'session-1' });
		useHarnessStore.setState({
			pendingInteractions: { 'session-1': [request] },
		});

		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);

		const closeButton = screen.getByLabelText('Close modal');
		fireEvent.click(closeButton);

		await waitFor(() => {
			expect(mockRespondToInteraction).toHaveBeenCalledWith(
				'session-1',
				'int-c3',
				{ kind: 'cancel' }
			);
		});
		// Must NOT send deny — that's tool-approval-specific
		expect(mockRespondToInteraction).not.toHaveBeenCalledWith(
			'session-1',
			'int-c3',
			expect.objectContaining({ kind: 'deny' })
		);
	});

	it('mixed-kind queue renders correct view as items are resolved', async () => {
		const toolReq = createToolApproval({
			interactionId: 'int-tool',
			sessionId: 'session-1',
			toolName: 'Bash',
			timestamp: 1000,
		});
		const clarReq = createClarification({
			interactionId: 'int-clar',
			sessionId: 'session-1',
			timestamp: 2000,
		});
		useSessionStore.setState({ activeSessionId: 'session-1' });
		useHarnessStore.setState({
			pendingInteractions: { 'session-1': [toolReq, clarReq] },
		});

		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);

		// First in queue: tool-approval
		expect(screen.getByTestId('tool-approval-view')).toBeInTheDocument();
		expect(screen.queryByTestId('clarification-view')).not.toBeInTheDocument();
		expect(screen.getByText('Tool Approval Required')).toBeInTheDocument();

		// Approve the tool request — should advance to clarification
		fireEvent.click(screen.getByTestId('approve-button'));

		await waitFor(() => {
			expect(screen.getByTestId('clarification-view')).toBeInTheDocument();
		});

		// Now the clarification view should be showing with correct title
		expect(screen.queryByTestId('tool-approval-view')).not.toBeInTheDocument();
		expect(screen.getByText('Agent Needs Input')).toBeInTheDocument();
	});

	it('clarification-first queue does not show tool-approval UI', () => {
		const clarReq = createClarification({
			interactionId: 'int-clar',
			sessionId: 'session-1',
			timestamp: 1000,
		});
		const toolReq = createToolApproval({
			interactionId: 'int-tool',
			sessionId: 'session-1',
			toolName: 'Edit',
			timestamp: 2000,
		});
		useSessionStore.setState({ activeSessionId: 'session-1' });
		useHarnessStore.setState({
			pendingInteractions: { 'session-1': [clarReq, toolReq] },
		});

		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);

		// Clarification should be shown first (FIFO)
		expect(screen.getByTestId('clarification-view')).toBeInTheDocument();
		expect(screen.queryByTestId('tool-approval-view')).not.toBeInTheDocument();
		expect(screen.getByText('Agent Needs Input')).toBeInTheDocument();

		// Approve/Deny buttons should NOT be present
		expect(screen.queryByTestId('approve-button')).not.toBeInTheDocument();
		expect(screen.queryByTestId('deny-button')).not.toBeInTheDocument();

		// Submit/Cancel buttons SHOULD be present
		expect(screen.getByTestId('submit-button')).toBeInTheDocument();
		expect(screen.getByTestId('cancel-button')).toBeInTheDocument();
	});

	it('removes clarification from store after responding', async () => {
		const request = createClarification({
			interactionId: 'int-c4',
			sessionId: 'session-1',
			allowFreeText: true,
		});
		useSessionStore.setState({ activeSessionId: 'session-1' });
		useHarnessStore.setState({
			pendingInteractions: { 'session-1': [request] },
		});

		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);

		// Type free text and submit
		const input = screen.getByTestId('free-text-input');
		fireEvent.change(input, { target: { value: 'My answer' } });
		fireEvent.click(screen.getByTestId('submit-button'));

		await waitFor(() => {
			const state = useHarnessStore.getState();
			expect(state.pendingInteractions['session-1'] ?? []).toHaveLength(0);
		});
	});
});

// ============================================================================
// Provider-neutral boundary tests
// ============================================================================

describe('InteractionRequestModal — provider-neutral boundary', () => {
	it('renders tool-approval from a non-Claude agent identically', () => {
		const request = createToolApproval({
			interactionId: 'int-codex-1',
			sessionId: 'session-1',
			agentId: 'codex',
			toolName: 'shell',
			toolInput: { cmd: 'npm test', timeout: 30000 },
			decisionReason: 'Command requires approval',
		});
		useSessionStore.setState({ activeSessionId: 'session-1' });
		useHarnessStore.setState({
			pendingInteractions: { 'session-1': [request] },
		});

		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);

		// Renders the same tool-approval UI regardless of agentId
		expect(screen.getByTestId('tool-approval-view')).toBeInTheDocument();
		expect(screen.getByText('shell')).toBeInTheDocument();
		expect(screen.getByText('Command requires approval')).toBeInTheDocument();
		expect(screen.getByTestId('approve-button')).toBeInTheDocument();
		expect(screen.getByTestId('deny-button')).toBeInTheDocument();
	});

	it('renders clarification from a non-Claude agent identically', () => {
		const request = createClarification({
			interactionId: 'int-opencode-1',
			sessionId: 'session-1',
			agentId: 'opencode',
			questions: [
				{
					question: 'Which model to use?',
					header: 'Model',
					options: [
						{ label: 'gpt-4o', description: 'OpenAI GPT-4o' },
						{ label: 'o3-mini', description: 'OpenAI o3-mini' },
					],
					multiSelect: false,
				},
			],
			allowFreeText: false,
		});
		useSessionStore.setState({ activeSessionId: 'session-1' });
		useHarnessStore.setState({
			pendingInteractions: { 'session-1': [request] },
		});

		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);

		expect(screen.getByTestId('clarification-view')).toBeInTheDocument();
		expect(screen.getByText('Which model to use?')).toBeInTheDocument();
		expect(screen.getByTestId('option-gpt-4o')).toBeInTheDocument();
		expect(screen.getByTestId('option-o3-mini')).toBeInTheDocument();
	});

	it('renders tool-approval with opaque toolInput as generic JSON', () => {
		// Use a completely unfamiliar tool input shape — the UI must not
		// assume Claude-specific keys like file_path, command, etc.
		const request = createToolApproval({
			interactionId: 'int-opaque-1',
			sessionId: 'session-1',
			agentId: 'factory-droid',
			toolName: 'deploy_artifact',
			toolInput: {
				artifact_uri: 's3://bucket/artifact.tar.gz',
				target_env: 'staging',
				rollback_enabled: true,
				metadata: { version: '2.1.0', build: 1234 },
			},
		});
		useSessionStore.setState({ activeSessionId: 'session-1' });
		useHarnessStore.setState({
			pendingInteractions: { 'session-1': [request] },
		});

		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);

		// The UI should render the tool name and offer the input toggle
		expect(screen.getByText('deploy_artifact')).toBeInTheDocument();
		expect(screen.getByTestId('toggle-input')).toBeInTheDocument();

		// Expand to see the JSON viewer (mocked)
		fireEvent.click(screen.getByTestId('toggle-input'));
		const jsonViewer = screen.getByTestId('json-viewer');
		expect(jsonViewer).toBeInTheDocument();

		// The JSON viewer receives the raw input — it must NOT parse specific keys
		const jsonContent = JSON.parse(jsonViewer.textContent ?? '{}');
		expect(jsonContent.artifact_uri).toBe('s3://bucket/artifact.tar.gz');
		expect(jsonContent.target_env).toBe('staging');
	});

	it('does not render suggestedPermissions in the UI', () => {
		// suggestedPermissions is an opaque Record<string, unknown>[] that
		// varies by provider. The UI must not attempt to render or parse it.
		const request = createToolApproval({
			interactionId: 'int-perms-1',
			sessionId: 'session-1',
			suggestedPermissions: [
				{ tool: 'Edit', path: '/src/**', allow: true },
				{ tool: 'Bash', command: 'npm *', allow: true },
			],
		});
		useSessionStore.setState({ activeSessionId: 'session-1' });
		useHarnessStore.setState({
			pendingInteractions: { 'session-1': [request] },
		});

		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);

		// The modal should render, but none of the suggestedPermissions
		// content should appear in the DOM
		expect(screen.getByTestId('tool-approval-view')).toBeInTheDocument();
		expect(screen.queryByText('npm *')).not.toBeInTheDocument();
		expect(screen.queryByText('/src/**')).not.toBeInTheDocument();
	});

	it('renders minimal payload with only required fields', () => {
		// A bare-minimum tool-approval: only required fields, no optional ones.
		// This proves the UI doesn't crash or degrade on minimal payloads.
		const request: ToolApprovalRequest = {
			interactionId: 'int-minimal',
			sessionId: 'session-1',
			agentId: 'claude-code',
			kind: 'tool-approval',
			timestamp: Date.now(),
			toolUseId: 'tu-1',
			toolName: 'Read',
			toolInput: {},
		};
		useSessionStore.setState({ activeSessionId: 'session-1' });
		useHarnessStore.setState({
			pendingInteractions: { 'session-1': [request] },
		});

		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);

		expect(screen.getByTestId('tool-approval-view')).toBeInTheDocument();
		expect(screen.getByText('Read')).toBeInTheDocument();
		// No optional fields should cause missing elements, not errors
		expect(screen.queryByTestId('decision-reason')).not.toBeInTheDocument();
		expect(screen.queryByTestId('blocked-path')).not.toBeInTheDocument();
		expect(screen.queryByTestId('toggle-input')).not.toBeInTheDocument(); // Empty toolInput
	});

	it('approve response does not include provider-specific fields', async () => {
		const request = createToolApproval({
			interactionId: 'int-resp-1',
			sessionId: 'session-1',
			agentId: 'codex',
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
				'int-resp-1',
				{ kind: 'approve' }
			);
		});

		// The response should be a plain { kind: 'approve' } without any
		// provider-specific fields like updatedPermissions or updatedInput
		const response = mockRespondToInteraction.mock.calls[0][2];
		expect(Object.keys(response)).toEqual(['kind']);
	});

	it('deny response does not include provider-specific fields', async () => {
		const request = createToolApproval({
			interactionId: 'int-resp-2',
			sessionId: 'session-1',
			agentId: 'opencode',
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
				'int-resp-2',
				{ kind: 'deny' }
			);
		});

		// The response should be a plain { kind: 'deny' } without any
		// provider-specific interrupt or message fields
		const response = mockRespondToInteraction.mock.calls[0][2];
		expect(Object.keys(response)).toEqual(['kind']);
	});

	it('clarification answer response uses shared structure, not provider wire format', async () => {
		const request = createClarification({
			interactionId: 'int-resp-3',
			sessionId: 'session-1',
			agentId: 'codex',
			allowFreeText: false,
		});
		useSessionStore.setState({ activeSessionId: 'session-1' });
		useHarnessStore.setState({
			pendingInteractions: { 'session-1': [request] },
		});

		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);
		fireEvent.click(screen.getByTestId('option-Option A'));
		fireEvent.click(screen.getByTestId('submit-button'));

		await waitFor(() => {
			expect(mockRespondToInteraction).toHaveBeenCalled();
		});

		// The response must use the shared ClarificationAnswer structure
		// (questionIndex + selectedOptionLabels), not provider-specific formats
		const response = mockRespondToInteraction.mock.calls[0][2];
		expect(response.kind).toBe('clarification-answer');
		expect(response.answers).toEqual([
			{
				questionIndex: 0,
				selectedOptionLabels: ['Option A'],
				text: undefined,
			},
		]);
		// Must not contain any provider-specific keys
		expect(Object.keys(response)).toEqual(['kind', 'answers']);
	});
});

// ============================================================================
// Import boundary enforcement tests
// ============================================================================

describe('InteractionRequest — import boundary enforcement', () => {
	it('InteractionRequest components do not import from provider SDKs or harness adapters', async () => {
		// Static analysis: read the actual source files and verify no prohibited imports.
		// This catches boundary violations that ESLint might miss if the rule is
		// accidentally disabled or overridden.
		const fs = await import('fs');
		const path = await import('path');

		const componentDir = path.resolve(
			__dirname,
			'../../../renderer/components/InteractionRequest'
		);

		const files = fs.readdirSync(componentDir).filter(
			(f: string) => f.endsWith('.ts') || f.endsWith('.tsx')
		);

		const prohibitedPatterns = [
			/@anthropic-ai\//,
			/from\s+['"]openai/,
			/from\s+['"].*\/main\/harness\//,
			/from\s+['"].*claude-code-harness/,
			/from\s+['"].*codex-harness/,
			/from\s+['"].*opencode-harness/,
		];

		for (const file of files) {
			const content = fs.readFileSync(path.join(componentDir, file), 'utf-8');
			for (const pattern of prohibitedPatterns) {
				expect(content).not.toMatch(pattern);
			}
		}
	});

	it('InteractionRequest components only import types from shared or renderer layers', async () => {
		const fs = await import('fs');
		const path = await import('path');

		const componentDir = path.resolve(
			__dirname,
			'../../../renderer/components/InteractionRequest'
		);

		const files = fs.readdirSync(componentDir).filter(
			(f: string) => f.endsWith('.ts') || f.endsWith('.tsx')
		);

		// Extract all import paths
		const importPattern = /from\s+['"]([^'"]+)['"]/g;

		for (const file of files) {
			const content = fs.readFileSync(path.join(componentDir, file), 'utf-8');
			let match;
			while ((match = importPattern.exec(content)) !== null) {
				const importPath = match[1];

				// Skip external packages that are UI-only (react, lucide-react, etc.)
				if (
					importPath === 'react' ||
					importPath.startsWith('lucide-react') ||
					importPath.startsWith('zustand')
				) {
					continue;
				}

				// Internal imports should only reference renderer or shared code
				if (importPath.startsWith('.') || importPath.startsWith('..')) {
					expect(importPath).not.toMatch(/main\//);
					expect(importPath).not.toMatch(/harness\//);
					expect(importPath).not.toMatch(/parsers\//);
				}
			}
		}
	});
});

// ============================================================================
// Validation: Interaction request display and response flow
// ============================================================================

describe('InteractionRequestModal — display and response flow validation', () => {
	it('modal unmounts from DOM after the last interaction is resolved', async () => {
		const request = createToolApproval({
			interactionId: 'int-last',
			sessionId: 'session-1',
		});
		useSessionStore.setState({ activeSessionId: 'session-1' });
		useHarnessStore.setState({
			pendingInteractions: { 'session-1': [request] },
		});

		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);

		// Modal should be visible
		expect(screen.getByTestId('interaction-request-modal')).toBeInTheDocument();

		// Approve the only interaction
		fireEvent.click(screen.getByTestId('approve-button'));

		// Modal should disappear from the DOM (not just store check)
		await waitFor(() => {
			expect(screen.queryByTestId('interaction-request-modal')).not.toBeInTheDocument();
		});
	});

	it('multi-item queue drains completely: approve first → approve second → modal gone', async () => {
		const req1 = createToolApproval({
			interactionId: 'int-q1',
			sessionId: 'session-1',
			toolName: 'First',
			timestamp: 1000,
		});
		const req2 = createToolApproval({
			interactionId: 'int-q2',
			sessionId: 'session-1',
			toolName: 'Second',
			timestamp: 2000,
		});
		useSessionStore.setState({ activeSessionId: 'session-1' });
		useHarnessStore.setState({
			pendingInteractions: { 'session-1': [req1, req2] },
		});

		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);

		// First interaction visible
		expect(screen.getByText('First')).toBeInTheDocument();
		expect(screen.getByTestId('remaining-count')).toHaveTextContent('+1 more pending');

		// Approve first
		fireEvent.click(screen.getByTestId('approve-button'));

		// Second interaction should now be showing
		await waitFor(() => {
			expect(screen.getByText('Second')).toBeInTheDocument();
		});
		expect(screen.queryByTestId('remaining-count')).not.toBeInTheDocument();

		// Approve second
		fireEvent.click(screen.getByTestId('approve-button'));

		// Modal should be fully gone
		await waitFor(() => {
			expect(screen.queryByTestId('interaction-request-modal')).not.toBeInTheDocument();
		});
	});

	it('renders request timestamp in the modal', () => {
		const timestamp = new Date('2026-03-12T10:30:00').getTime();
		const request = createToolApproval({
			interactionId: 'int-ts',
			sessionId: 'session-1',
			timestamp,
		});
		useSessionStore.setState({ activeSessionId: 'session-1' });
		useHarnessStore.setState({
			pendingInteractions: { 'session-1': [request] },
		});

		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);

		// The modal displays toLocaleTimeString() — verify the text is rendered
		const expectedTime = new Date(timestamp).toLocaleTimeString();
		expect(screen.getByText(expectedTime)).toBeInTheDocument();
	});

	it('submits combined option selection + free text in a single clarification response', async () => {
		const request = createClarification({
			interactionId: 'int-combo',
			sessionId: 'session-1',
			allowFreeText: true,
		});
		useSessionStore.setState({ activeSessionId: 'session-1' });
		useHarnessStore.setState({
			pendingInteractions: { 'session-1': [request] },
		});

		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);

		// Select an option AND type free text
		fireEvent.click(screen.getByTestId('option-Option A'));
		fireEvent.change(screen.getByTestId('free-text-input'), {
			target: { value: 'Additional context' },
		});
		fireEvent.click(screen.getByTestId('submit-button'));

		await waitFor(() => {
			expect(mockRespondToInteraction).toHaveBeenCalledWith(
				'session-1',
				'int-combo',
				{
					kind: 'clarification-answer',
					answers: [
						{
							questionIndex: 0,
							selectedOptionLabels: ['Option A'],
							text: 'Additional context',
						},
					],
				}
			);
		});
	});

	it('submits answers across multiple questions', async () => {
		const request = createClarification({
			interactionId: 'int-multi-q',
			sessionId: 'session-1',
			allowFreeText: false,
			questions: [
				{
					question: 'Framework?',
					header: 'Q1',
					options: [
						{ label: 'React', description: '' },
						{ label: 'Vue', description: '' },
					],
					multiSelect: false,
				},
				{
					question: 'Features?',
					header: 'Q2',
					options: [
						{ label: 'Auth', description: '' },
						{ label: 'DB', description: '' },
						{ label: 'Cache', description: '' },
					],
					multiSelect: true,
				},
			],
		});
		useSessionStore.setState({ activeSessionId: 'session-1' });
		useHarnessStore.setState({
			pendingInteractions: { 'session-1': [request] },
		});

		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);

		// Select in Q1 (single-select)
		fireEvent.click(screen.getByTestId('option-React'));

		// Select in Q2 (multi-select)
		fireEvent.click(screen.getByTestId('option-Auth'));
		fireEvent.click(screen.getByTestId('option-Cache'));

		fireEvent.click(screen.getByTestId('submit-button'));

		await waitFor(() => {
			expect(mockRespondToInteraction).toHaveBeenCalled();
		});

		const response = mockRespondToInteraction.mock.calls[0][2];
		expect(response.kind).toBe('clarification-answer');
		expect(response.answers).toHaveLength(2);

		// Q1 answer: single-select 'React'
		expect(response.answers[0].questionIndex).toBe(0);
		expect(response.answers[0].selectedOptionLabels).toEqual(['React']);

		// Q2 answer: multi-select 'Auth' + 'Cache'
		expect(response.answers[1].questionIndex).toBe(1);
		expect(response.answers[1].selectedOptionLabels).toContain('Auth');
		expect(response.answers[1].selectedOptionLabels).toContain('Cache');
		expect(response.answers[1].selectedOptionLabels).not.toContain('DB');
	});

	it('deny then approve across queued interactions dispatches correct IDs', async () => {
		const req1 = createToolApproval({
			interactionId: 'int-deny-1',
			sessionId: 'session-1',
			toolName: 'Bash',
			timestamp: 1000,
		});
		const req2 = createToolApproval({
			interactionId: 'int-deny-2',
			sessionId: 'session-1',
			toolName: 'Write',
			timestamp: 2000,
		});
		useSessionStore.setState({ activeSessionId: 'session-1' });
		useHarnessStore.setState({
			pendingInteractions: { 'session-1': [req1, req2] },
		});

		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);

		// Deny the first (Bash)
		expect(screen.getByText('Bash')).toBeInTheDocument();
		fireEvent.click(screen.getByTestId('deny-button'));

		await waitFor(() => {
			expect(mockRespondToInteraction).toHaveBeenCalledWith(
				'session-1',
				'int-deny-1',
				{ kind: 'deny' }
			);
		});

		// Second should now be visible
		await waitFor(() => {
			expect(screen.getByText('Write')).toBeInTheDocument();
		});

		// Approve the second (Write)
		fireEvent.click(screen.getByTestId('approve-button'));

		await waitFor(() => {
			expect(mockRespondToInteraction).toHaveBeenCalledWith(
				'session-1',
				'int-deny-2',
				{ kind: 'approve' }
			);
		});
	});

	it('switching active session shows the correct session interactions', async () => {
		const { act } = await import('@testing-library/react');

		const session1Req = createToolApproval({
			interactionId: 'int-s1',
			sessionId: 'session-1',
			toolName: 'Session1Tool',
		});
		const session2Req = createClarification({
			interactionId: 'int-s2',
			sessionId: 'session-2',
		});

		useHarnessStore.setState({
			pendingInteractions: {
				'session-1': [session1Req],
				'session-2': [session2Req],
			},
		});

		// Start with session-1 active
		useSessionStore.setState({ activeSessionId: 'session-1' });
		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);

		expect(screen.getByTestId('tool-approval-view')).toBeInTheDocument();
		expect(screen.getByText('Session1Tool')).toBeInTheDocument();

		// Switch to session-2 — wrap in act to flush store subscription re-renders
		act(() => {
			useSessionStore.setState({ activeSessionId: 'session-2' });
		});

		await waitFor(() => {
			expect(screen.getByTestId('clarification-view')).toBeInTheDocument();
		});
		expect(screen.queryByText('Session1Tool')).not.toBeInTheDocument();
	});
});
