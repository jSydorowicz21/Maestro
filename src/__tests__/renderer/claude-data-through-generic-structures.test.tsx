/**
 * Validation: Claude-specific data can be displayed through generic structures.
 *
 * Proves that realistic Claude Code payloads — tool approvals for Claude's tools
 * (Edit, Bash, Write, Read), clarification requests, runtime metadata with Claude
 * models/skills/commands, and harness capabilities — all render correctly through
 * the provider-neutral UI components, store, and hooks without any Claude-specific
 * branching or special-casing.
 *
 * This is the inverse of the provider-neutral boundary tests: those proved the UI
 * works with _non_-Claude agents; these prove that Claude's _actual_ data shapes
 * survive the generic layer without loss.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LayerStackProvider } from '../../renderer/contexts/LayerStackContext';
import { useHarnessStore } from '../../renderer/stores/harnessStore';
import { useSessionStore } from '../../renderer/stores/sessionStore';
import { InteractionRequestModal } from '../../renderer/components/InteractionRequest/InteractionRequestModal';
import { ToolApprovalView } from '../../renderer/components/InteractionRequest/ToolApprovalView';
import { ClarificationView } from '../../renderer/components/InteractionRequest/ClarificationView';
import { RuntimeMetadataBar } from '../../renderer/components/RuntimeMetadataBar';
import { useSessionRuntimeMetadata } from '../../renderer/hooks/agent/useSessionRuntimeMetadata';
import { useSessionRuntimeCapabilities } from '../../renderer/hooks/agent/useSessionRuntimeCapabilities';
import {
	selectSessionRuntimeMetadata,
	selectSessionRuntimeCapabilities,
} from '../../renderer/stores/harnessStore';
import type {
	Theme,
	ToolApprovalRequest,
	ClarificationRequest,
} from '../../renderer/types';
import type { RuntimeMetadataEvent } from '../../shared/runtime-metadata-types';

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
	Sparkles: ({ className }: any) => <svg data-testid="sparkles-icon" className={className} />,
	Terminal: ({ className }: any) => <svg data-testid="terminal-icon" className={className} />,
	Cpu: ({ className }: any) => <svg data-testid="cpu-icon" className={className} />,
	Bot: ({ className }: any) => <svg data-testid="bot-icon" className={className} />,
}));

vi.mock('../../renderer/components/CollapsibleJsonViewer', () => ({
	CollapsibleJsonViewer: ({ data }: { data: unknown }) => (
		<pre data-testid="json-viewer">{JSON.stringify(data)}</pre>
	),
}));

// ============================================================================
// Test fixtures — realistic Claude Code payloads
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

/**
 * Claude Code Edit tool — toolInput has file_path, old_string, new_string.
 * This is the most common Claude-specific tool shape.
 */
function claudeEditApproval(overrides: Partial<ToolApprovalRequest> = {}): ToolApprovalRequest {
	return {
		interactionId: 'int-claude-edit',
		sessionId: 'session-claude',
		agentId: 'claude-code',
		kind: 'tool-approval',
		timestamp: Date.now(),
		toolUseId: 'toolu_01ABC123',
		toolName: 'Edit',
		toolInput: {
			file_path: '/src/renderer/App.tsx',
			old_string: 'const [count, setCount] = useState(0);',
			new_string: 'const [count, setCount] = useState<number>(0);',
		},
		decisionReason: 'File is outside the allowed directory',
		blockedPath: '/src/renderer/App.tsx',
		...overrides,
	};
}

/**
 * Claude Code Bash tool — toolInput has command string.
 */
function claudeBashApproval(overrides: Partial<ToolApprovalRequest> = {}): ToolApprovalRequest {
	return {
		interactionId: 'int-claude-bash',
		sessionId: 'session-claude',
		agentId: 'claude-code',
		kind: 'tool-approval',
		timestamp: Date.now(),
		toolUseId: 'toolu_01DEF456',
		toolName: 'Bash',
		toolInput: {
			command: 'npm run build && npm test -- --reporter=json',
		},
		decisionReason: 'Command execution requires approval',
		suggestedPermissions: [
			{ tool: 'Bash', command: 'npm *', allow: true },
		],
		...overrides,
	};
}

/**
 * Claude Code Write tool — toolInput has file_path and content.
 */
function claudeWriteApproval(overrides: Partial<ToolApprovalRequest> = {}): ToolApprovalRequest {
	return {
		interactionId: 'int-claude-write',
		sessionId: 'session-claude',
		agentId: 'claude-code',
		kind: 'tool-approval',
		timestamp: Date.now(),
		toolUseId: 'toolu_01GHI789',
		toolName: 'Write',
		toolInput: {
			file_path: '/src/utils/helpers.ts',
			content: 'export function formatDate(d: Date): string {\n\treturn d.toISOString();\n}\n',
		},
		blockedPath: '/src/utils/helpers.ts',
		subagentId: 'code-architect',
		...overrides,
	};
}

/**
 * Claude Code multi-tool subagent approval.
 * Subagent uses the Agent tool which invokes nested tool calls.
 */
function claudeAgentToolApproval(overrides: Partial<ToolApprovalRequest> = {}): ToolApprovalRequest {
	return {
		interactionId: 'int-claude-agent',
		sessionId: 'session-claude',
		agentId: 'claude-code',
		kind: 'tool-approval',
		timestamp: Date.now(),
		toolUseId: 'toolu_01JKL012',
		toolName: 'Agent',
		toolInput: {
			prompt: 'Explore the codebase and find all uses of the deprecated API',
			subagent_type: 'Explore',
		},
		subagentId: 'feature-dev:code-explorer',
		decisionReason: 'Subagent tool use requires approval',
		...overrides,
	};
}

/**
 * Claude Code clarification — model asks user to choose between approaches.
 * This mirrors what Claude actually sends when it needs direction.
 */
function claudeClarification(overrides: Partial<ClarificationRequest> = {}): ClarificationRequest {
	return {
		interactionId: 'int-claude-clarify',
		sessionId: 'session-claude',
		agentId: 'claude-code',
		kind: 'clarification',
		timestamp: Date.now(),
		questions: [
			{
				question: 'I found two possible approaches to fix the race condition. Which do you prefer?',
				header: 'Fix approach',
				options: [
					{
						label: 'Mutex lock',
						description: 'Add a mutex around the shared resource access. Simple but may reduce throughput.',
					},
					{
						label: 'Event queue',
						description: 'Serialize operations through an event queue. More complex but better throughput.',
					},
					{
						label: 'Optimistic locking',
						description: 'Use optimistic locking with retry. Best throughput but more code paths.',
					},
				],
				multiSelect: false,
			},
		],
		allowFreeText: true,
		...overrides,
	};
}

/**
 * Claude Code runtime metadata event — skills, models, slash commands
 * as Claude would report them.
 */
function claudeRuntimeMetadata(overrides: Partial<RuntimeMetadataEvent> = {}): RuntimeMetadataEvent {
	return {
		sessionId: 'session-claude',
		source: 'claude-code',
		skills: [
			{ id: 'commit', name: 'commit', description: 'Create git commits with structured messages' },
			{ id: 'review-pr', name: 'review-pr', description: 'Review pull requests for issues and improvements' },
			{ id: 'brainstorming', name: 'brainstorming', description: 'Explore requirements before implementation' },
			{ id: 'tdd', name: 'test-driven-development', description: 'Write tests before implementation code' },
			{ id: 'debugging', name: 'systematic-debugging', description: 'Debug issues with systematic root cause analysis' },
		],
		slashCommands: ['/commit', '/help', '/review-pr', '/compact', '/clear'],
		availableModels: [
			{ id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
			{ id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
			{ id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
		],
		availableAgents: [
			{ id: 'code-explorer', label: 'Code Explorer' },
			{ id: 'code-architect', label: 'Code Architect' },
			{ id: 'code-reviewer', label: 'Code Reviewer' },
		],
		capabilities: {
			supportsInteractionRequests: true,
			supportsMidTurnInput: true,
			supportsRuntimePermissionUpdates: true,
			supportsSkillsEnumeration: true,
			supportsRuntimeSlashCommands: true,
			supportsRuntimeModelChange: true,
			supportsContextCompaction: true,
			supportsFileCheckpointing: true,
		},
		...overrides,
	};
}

// ============================================================================
// Helpers
// ============================================================================

const renderWithLayerStack = (ui: React.ReactElement) => {
	return render(<LayerStackProvider>{ui}</LayerStackProvider>);
};

const mockRespondToInteraction = vi.fn().mockResolvedValue(undefined);

(window as any).maestro = {
	...(window as any).maestro,
	process: {
		...((window as any).maestro?.process ?? {}),
		respondToInteraction: mockRespondToInteraction,
	},
};

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
// Claude tool-approval payloads through generic ToolApprovalView
// ============================================================================

describe('Claude Code tool approvals through generic ToolApprovalView', () => {
	it('renders Claude Edit tool with file_path, old_string, new_string in toolInput', () => {
		const request = claudeEditApproval();
		renderWithLayerStack(
			<ToolApprovalView theme={testTheme} request={request} onRespond={vi.fn()} />
		);

		expect(screen.getByText('Edit')).toBeInTheDocument();
		expect(screen.getByTestId('decision-reason')).toHaveTextContent('File is outside the allowed directory');
		expect(screen.getByTestId('blocked-path')).toHaveTextContent('/src/renderer/App.tsx');

		// Expand tool input — Claude-specific keys rendered as opaque JSON
		fireEvent.click(screen.getByTestId('toggle-input'));
		const jsonViewer = screen.getByTestId('json-viewer');
		const parsed = JSON.parse(jsonViewer.textContent ?? '{}');
		expect(parsed.file_path).toBe('/src/renderer/App.tsx');
		expect(parsed.old_string).toBe('const [count, setCount] = useState(0);');
		expect(parsed.new_string).toBe('const [count, setCount] = useState<number>(0);');
	});

	it('renders Claude Bash tool with command string in toolInput', () => {
		const request = claudeBashApproval();
		renderWithLayerStack(
			<ToolApprovalView theme={testTheme} request={request} onRespond={vi.fn()} />
		);

		expect(screen.getByText('Bash')).toBeInTheDocument();
		expect(screen.getByTestId('decision-reason')).toHaveTextContent('Command execution requires approval');

		fireEvent.click(screen.getByTestId('toggle-input'));
		const parsed = JSON.parse(screen.getByTestId('json-viewer').textContent ?? '{}');
		expect(parsed.command).toBe('npm run build && npm test -- --reporter=json');
	});

	it('renders Claude Write tool with file_path and content in toolInput', () => {
		const request = claudeWriteApproval();
		renderWithLayerStack(
			<ToolApprovalView theme={testTheme} request={request} onRespond={vi.fn()} />
		);

		expect(screen.getByText('Write')).toBeInTheDocument();
		expect(screen.getByText('via code-architect')).toBeInTheDocument();
		expect(screen.getByTestId('blocked-path')).toHaveTextContent('/src/utils/helpers.ts');

		fireEvent.click(screen.getByTestId('toggle-input'));
		const parsed = JSON.parse(screen.getByTestId('json-viewer').textContent ?? '{}');
		expect(parsed.file_path).toBe('/src/utils/helpers.ts');
		expect(parsed.content).toContain('export function formatDate');
	});

	it('renders Claude Agent tool with prompt and subagent_type in toolInput', () => {
		const request = claudeAgentToolApproval();
		renderWithLayerStack(
			<ToolApprovalView theme={testTheme} request={request} onRespond={vi.fn()} />
		);

		expect(screen.getByText('Agent')).toBeInTheDocument();
		expect(screen.getByText('via feature-dev:code-explorer')).toBeInTheDocument();

		fireEvent.click(screen.getByTestId('toggle-input'));
		const parsed = JSON.parse(screen.getByTestId('json-viewer').textContent ?? '{}');
		expect(parsed.prompt).toContain('deprecated API');
		expect(parsed.subagent_type).toBe('Explore');
	});

	it('Claude suggestedPermissions are carried but not rendered in the DOM', () => {
		const request = claudeBashApproval({
			suggestedPermissions: [
				{ tool: 'Bash', command: 'npm *', allow: true },
				{ tool: 'Edit', path: '/src/**', allow: true },
			],
		});
		useSessionStore.setState({ activeSessionId: 'session-claude' });
		useHarnessStore.setState({
			pendingInteractions: { 'session-claude': [request] },
		});

		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);

		// Modal renders, but no permission-specific content appears
		expect(screen.getByTestId('tool-approval-view')).toBeInTheDocument();
		expect(screen.queryByText('npm *')).not.toBeInTheDocument();
		expect(screen.queryByText('/src/**')).not.toBeInTheDocument();
		expect(screen.queryByText('suggestedPermissions')).not.toBeInTheDocument();
	});
});

// ============================================================================
// Claude tool-approval approve/deny responses through generic modal
// ============================================================================

describe('Claude Code tool approval responses through generic modal', () => {
	it('approving Claude Edit sends generic approve response via IPC', async () => {
		const request = claudeEditApproval({ interactionId: 'int-edit-resp' });
		useSessionStore.setState({ activeSessionId: 'session-claude' });
		useHarnessStore.setState({
			pendingInteractions: { 'session-claude': [request] },
		});

		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);
		fireEvent.click(screen.getByTestId('approve-button'));

		await waitFor(() => {
			expect(mockRespondToInteraction).toHaveBeenCalledWith(
				'session-claude',
				'int-edit-resp',
				{ kind: 'approve' }
			);
		});

		// Response is a plain shared type — no Claude-specific updatedPermissions or SDK keys
		const response = mockRespondToInteraction.mock.calls[0][2];
		expect(Object.keys(response)).toEqual(['kind']);
	});

	it('denying Claude Bash sends generic deny response via IPC', async () => {
		const request = claudeBashApproval({ interactionId: 'int-bash-deny' });
		useSessionStore.setState({ activeSessionId: 'session-claude' });
		useHarnessStore.setState({
			pendingInteractions: { 'session-claude': [request] },
		});

		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);
		fireEvent.click(screen.getByTestId('deny-button'));

		await waitFor(() => {
			expect(mockRespondToInteraction).toHaveBeenCalledWith(
				'session-claude',
				'int-bash-deny',
				{ kind: 'deny' }
			);
		});

		const response = mockRespondToInteraction.mock.calls[0][2];
		expect(Object.keys(response)).toEqual(['kind']);
	});

	it('queue of Claude tools drains through generic FIFO: Edit → Bash → Write', async () => {
		const edit = claudeEditApproval({ interactionId: 'int-q-edit', timestamp: 1000 });
		const bash = claudeBashApproval({ interactionId: 'int-q-bash', timestamp: 2000 });
		const write = claudeWriteApproval({ interactionId: 'int-q-write', timestamp: 3000 });

		useSessionStore.setState({ activeSessionId: 'session-claude' });
		useHarnessStore.setState({
			pendingInteractions: { 'session-claude': [edit, bash, write] },
		});

		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);

		// First: Edit
		expect(screen.getByText('Edit')).toBeInTheDocument();
		expect(screen.getByTestId('remaining-count')).toHaveTextContent('+2 more pending');
		fireEvent.click(screen.getByTestId('approve-button'));

		// Second: Bash
		await waitFor(() => expect(screen.getByText('Bash')).toBeInTheDocument());
		expect(screen.getByTestId('remaining-count')).toHaveTextContent('+1 more pending');
		fireEvent.click(screen.getByTestId('deny-button'));

		// Third: Write
		await waitFor(() => expect(screen.getByText('Write')).toBeInTheDocument());
		expect(screen.queryByTestId('remaining-count')).not.toBeInTheDocument();
		fireEvent.click(screen.getByTestId('approve-button'));

		// Modal gone
		await waitFor(() => {
			expect(screen.queryByTestId('interaction-request-modal')).not.toBeInTheDocument();
		});

		// Verify all three IPC calls dispatched with correct IDs
		expect(mockRespondToInteraction).toHaveBeenCalledTimes(3);
		expect(mockRespondToInteraction.mock.calls[0][1]).toBe('int-q-edit');
		expect(mockRespondToInteraction.mock.calls[1][1]).toBe('int-q-bash');
		expect(mockRespondToInteraction.mock.calls[2][1]).toBe('int-q-write');
	});
});

// ============================================================================
// Claude clarification payloads through generic ClarificationView
// ============================================================================

describe('Claude Code clarifications through generic ClarificationView', () => {
	it('renders Claude multi-option clarification with descriptions', () => {
		const request = claudeClarification();
		renderWithLayerStack(
			<ClarificationView theme={testTheme} request={request} onRespond={vi.fn()} />
		);

		expect(screen.getByText(/race condition/)).toBeInTheDocument();
		expect(screen.getByTestId('option-Mutex lock')).toBeInTheDocument();
		expect(screen.getByTestId('option-Event queue')).toBeInTheDocument();
		expect(screen.getByTestId('option-Optimistic locking')).toBeInTheDocument();
		expect(screen.getByText(/reduce throughput/)).toBeInTheDocument();
		expect(screen.getByText(/Serialize operations/)).toBeInTheDocument();
	});

	it('submitting Claude clarification produces generic clarification-answer', async () => {
		const request = claudeClarification({ interactionId: 'int-clar-resp' });
		useSessionStore.setState({ activeSessionId: 'session-claude' });
		useHarnessStore.setState({
			pendingInteractions: { 'session-claude': [request] },
		});

		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);

		// Select "Event queue" and add free text
		fireEvent.click(screen.getByTestId('option-Event queue'));
		fireEvent.change(screen.getByTestId('free-text-input'), {
			target: { value: 'Use a bounded channel with backpressure' },
		});
		fireEvent.click(screen.getByTestId('submit-button'));

		await waitFor(() => {
			expect(mockRespondToInteraction).toHaveBeenCalledWith(
				'session-claude',
				'int-clar-resp',
				{
					kind: 'clarification-answer',
					answers: [
						{
							questionIndex: 0,
							selectedOptionLabels: ['Event queue'],
							text: 'Use a bounded channel with backpressure',
						},
					],
				}
			);
		});

		// Verify response structure is purely shared types — no Claude SDK keys
		const response = mockRespondToInteraction.mock.calls[0][2];
		expect(Object.keys(response)).toEqual(['kind', 'answers']);
		expect(Object.keys(response.answers[0]).sort()).toEqual(
			['questionIndex', 'selectedOptionLabels', 'text'].sort()
		);
	});

	it('mixed Claude tool + clarification queue renders correct views in FIFO order', async () => {
		const tool = claudeEditApproval({ interactionId: 'int-mix-tool', timestamp: 1000 });
		const clar = claudeClarification({ interactionId: 'int-mix-clar', timestamp: 2000 });

		useSessionStore.setState({ activeSessionId: 'session-claude' });
		useHarnessStore.setState({
			pendingInteractions: { 'session-claude': [tool, clar] },
		});

		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);

		// Tool-approval first
		expect(screen.getByTestId('tool-approval-view')).toBeInTheDocument();
		expect(screen.queryByTestId('clarification-view')).not.toBeInTheDocument();

		// Approve → transitions to clarification
		fireEvent.click(screen.getByTestId('approve-button'));

		await waitFor(() => {
			expect(screen.getByTestId('clarification-view')).toBeInTheDocument();
		});
		expect(screen.queryByTestId('tool-approval-view')).not.toBeInTheDocument();
		expect(screen.getByText(/race condition/)).toBeInTheDocument();
	});
});

// ============================================================================
// Claude runtime metadata through generic store and hooks
// ============================================================================

describe('Claude Code runtime metadata through generic store', () => {
	it('Claude metadata event populates all store fields correctly', () => {
		const event = claudeRuntimeMetadata();
		useHarnessStore.getState().applyRuntimeMetadata('session-claude', event);

		const state = useHarnessStore.getState();
		const metadata = selectSessionRuntimeMetadata(state, 'session-claude');
		expect(metadata).toBeDefined();

		// Skills
		expect(metadata!.skills).toHaveLength(5);
		expect(metadata!.skills.find(s => s.id === 'commit')?.name).toBe('commit');
		expect(metadata!.skills.find(s => s.id === 'tdd')?.name).toBe('test-driven-development');

		// Slash commands
		expect(metadata!.slashCommands).toContain('/commit');
		expect(metadata!.slashCommands).toContain('/help');
		expect(metadata!.slashCommands).toContain('/compact');
		expect(metadata!.slashCommands).toHaveLength(5);

		// Models — all Claude model IDs present
		expect(metadata!.availableModels).toHaveLength(3);
		expect(metadata!.availableModels.find(m => m.id === 'claude-opus-4-6')?.label).toBe('Claude Opus 4.6');
		expect(metadata!.availableModels.find(m => m.id === 'claude-sonnet-4-6')?.label).toBe('Claude Sonnet 4.6');
		expect(metadata!.availableModels.find(m => m.id === 'claude-haiku-4-5-20251001')?.label).toBe('Claude Haiku 4.5');

		// Agents
		expect(metadata!.availableAgents).toHaveLength(3);
		expect(metadata!.availableAgents.map(a => a.id).sort()).toEqual(
			['code-architect', 'code-explorer', 'code-reviewer']
		);
	});

	it('Claude capabilities populate Layer 2 correctly', () => {
		const event = claudeRuntimeMetadata();
		useHarnessStore.getState().applyRuntimeMetadata('session-claude', event);

		const state = useHarnessStore.getState();
		const caps = selectSessionRuntimeCapabilities(state, 'session-claude');
		expect(caps).toBeDefined();

		expect(caps!.supportsInteractionRequests).toBe(true);
		expect(caps!.supportsMidTurnInput).toBe(true);
		expect(caps!.supportsRuntimePermissionUpdates).toBe(true);
		expect(caps!.supportsSkillsEnumeration).toBe(true);
		expect(caps!.supportsRuntimeSlashCommands).toBe(true);
		expect(caps!.supportsRuntimeModelChange).toBe(true);
		expect(caps!.supportsContextCompaction).toBe(true);
		expect(caps!.supportsFileCheckpointing).toBe(true);
	});

	it('incremental Claude metadata updates merge correctly', () => {
		const initial = claudeRuntimeMetadata();
		useHarnessStore.getState().applyRuntimeMetadata('session-claude', initial);

		// Incremental: add a new skill and update a model label
		const incremental: RuntimeMetadataEvent = {
			sessionId: 'session-claude',
			source: 'claude-code',
			skills: [
				{ id: 'linear', name: 'linear', description: 'Manage Linear issues' },
			],
			availableModels: [
				{ id: 'claude-opus-4-6', label: 'Claude Opus 4.6 (Updated)' },
			],
		};
		useHarnessStore.getState().applyRuntimeMetadata('session-claude', incremental);

		const metadata = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-claude');

		// Original 5 + 1 new = 6 skills
		expect(metadata!.skills).toHaveLength(6);
		expect(metadata!.skills.find(s => s.id === 'linear')?.name).toBe('linear');

		// Model label updated, count stays 3
		expect(metadata!.availableModels).toHaveLength(3);
		expect(metadata!.availableModels.find(m => m.id === 'claude-opus-4-6')?.label).toBe('Claude Opus 4.6 (Updated)');
		// Other models preserved
		expect(metadata!.availableModels.find(m => m.id === 'claude-sonnet-4-6')?.label).toBe('Claude Sonnet 4.6');

		// Slash commands preserved (not touched in incremental)
		expect(metadata!.slashCommands).toHaveLength(5);

		// Capabilities preserved
		expect(metadata!.capabilities.supportsInteractionRequests).toBe(true);
	});

	it('replace event with Claude data replaces included fields, preserves omitted', () => {
		const initial = claudeRuntimeMetadata();
		useHarnessStore.getState().applyRuntimeMetadata('session-claude', initial);

		// Replace: only update models — everything else is omitted (preserved)
		const replacement: RuntimeMetadataEvent = {
			sessionId: 'session-claude',
			source: 'claude-code',
			replace: true,
			availableModels: [
				{ id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
			],
		};
		useHarnessStore.getState().applyRuntimeMetadata('session-claude', replacement);

		const metadata = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-claude');

		// Models replaced — only 1 now
		expect(metadata!.availableModels).toHaveLength(1);
		expect(metadata!.availableModels[0].id).toBe('claude-opus-4-6');

		// Skills preserved (omitted in replace event)
		expect(metadata!.skills).toHaveLength(5);

		// Slash commands preserved
		expect(metadata!.slashCommands).toHaveLength(5);

		// Capabilities preserved
		expect(metadata!.capabilities.supportsInteractionRequests).toBe(true);
	});

	it('session cleanup clears all Claude metadata', () => {
		useHarnessStore.getState().applyRuntimeMetadata('session-claude', claudeRuntimeMetadata());
		useHarnessStore.getState().addInteraction('session-claude', claudeEditApproval());

		// Verify populated
		expect(selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-claude')).toBeDefined();

		// Clear
		useHarnessStore.getState().clearSession('session-claude');

		expect(selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-claude')).toBeUndefined();
		expect(selectSessionRuntimeCapabilities(useHarnessStore.getState(), 'session-claude')).toBeUndefined();
	});
});

// ============================================================================
// Claude runtime metadata through generic hooks
// ============================================================================

describe('Claude Code runtime metadata through generic hooks', () => {
	/**
	 * Test wrapper that exposes hook return values via data attributes.
	 */
	function MetadataHookTester({ sessionId }: { sessionId: string }) {
		const { skills, slashCommands, availableModels, availableAgents, hasMetadata } =
			useSessionRuntimeMetadata(sessionId);
		return (
			<div data-testid="hook-tester">
				<span data-testid="has-metadata">{String(hasMetadata)}</span>
				<span data-testid="skill-count">{skills.length}</span>
				<span data-testid="command-count">{slashCommands.length}</span>
				<span data-testid="model-count">{availableModels.length}</span>
				<span data-testid="agent-count">{availableAgents.length}</span>
				{skills.map(s => <span key={s.id} data-testid={`skill-${s.id}`}>{s.name}</span>)}
				{availableModels.map(m => <span key={m.id} data-testid={`model-${m.id}`}>{m.label}</span>)}
			</div>
		);
	}

	function CapabilitiesHookTester({ sessionId }: { sessionId: string }) {
		const { runtimeCapabilities, hasRuntimeCapability } =
			useSessionRuntimeCapabilities(sessionId);
		return (
			<div data-testid="caps-tester">
				<span data-testid="has-caps">{String(runtimeCapabilities !== undefined)}</span>
				<span data-testid="supports-interactions">{String(hasRuntimeCapability('supportsInteractionRequests'))}</span>
				<span data-testid="supports-model-change">{String(hasRuntimeCapability('supportsRuntimeModelChange'))}</span>
				<span data-testid="supports-compaction">{String(hasRuntimeCapability('supportsContextCompaction'))}</span>
				<span data-testid="supports-budget">{String(hasRuntimeCapability('supportsBudgetLimits'))}</span>
			</div>
		);
	}

	it('useSessionRuntimeMetadata returns Claude skills and models', () => {
		useHarnessStore.getState().applyRuntimeMetadata('session-claude', claudeRuntimeMetadata());

		render(<MetadataHookTester sessionId="session-claude" />);

		expect(screen.getByTestId('has-metadata')).toHaveTextContent('true');
		expect(screen.getByTestId('skill-count')).toHaveTextContent('5');
		expect(screen.getByTestId('command-count')).toHaveTextContent('5');
		expect(screen.getByTestId('model-count')).toHaveTextContent('3');
		expect(screen.getByTestId('agent-count')).toHaveTextContent('3');

		// Specific Claude skills visible
		expect(screen.getByTestId('skill-commit')).toHaveTextContent('commit');
		expect(screen.getByTestId('skill-tdd')).toHaveTextContent('test-driven-development');
		expect(screen.getByTestId('skill-debugging')).toHaveTextContent('systematic-debugging');

		// Specific Claude models visible
		expect(screen.getByTestId('model-claude-opus-4-6')).toHaveTextContent('Claude Opus 4.6');
		expect(screen.getByTestId('model-claude-sonnet-4-6')).toHaveTextContent('Claude Sonnet 4.6');
	});

	it('useSessionRuntimeCapabilities returns Claude capability flags', () => {
		useHarnessStore.getState().applyRuntimeMetadata('session-claude', claudeRuntimeMetadata());

		render(<CapabilitiesHookTester sessionId="session-claude" />);

		expect(screen.getByTestId('has-caps')).toHaveTextContent('true');
		expect(screen.getByTestId('supports-interactions')).toHaveTextContent('true');
		expect(screen.getByTestId('supports-model-change')).toHaveTextContent('true');
		expect(screen.getByTestId('supports-compaction')).toHaveTextContent('true');
		// supportsBudgetLimits was not set in Claude metadata → conservative false
		expect(screen.getByTestId('supports-budget')).toHaveTextContent('false');
	});
});

// ============================================================================
// Claude runtime metadata through generic RuntimeMetadataBar UI
// ============================================================================

describe('Claude Code runtime metadata through RuntimeMetadataBar', () => {
	it('renders pill counts for Claude skills, commands, models, and agents', () => {
		useHarnessStore.getState().applyRuntimeMetadata('session-claude', claudeRuntimeMetadata());

		render(<RuntimeMetadataBar sessionId="session-claude" theme={testTheme} />);

		// Should show all four category counts via their icons
		// Skills=5, Commands=5, Models=3, Agents=3
		const fives = screen.getAllByText('5');
		expect(fives).toHaveLength(2); // skills + commands
		const threes = screen.getAllByText('3');
		expect(threes).toHaveLength(2); // models + agents

		// Icons are rendered for each category
		expect(screen.getByTestId('sparkles-icon')).toBeInTheDocument(); // skills
		expect(screen.getByTestId('terminal-icon')).toBeInTheDocument(); // commands
		expect(screen.getByTestId('cpu-icon')).toBeInTheDocument(); // models
		expect(screen.getByTestId('bot-icon')).toBeInTheDocument(); // agents
	});

	it('does not render for session without metadata', () => {
		const { container } = render(
			<RuntimeMetadataBar sessionId="session-empty" theme={testTheme} />
		);
		expect(container.firstChild).toBeNull();
	});

	it('does not render after Claude session is cleared', () => {
		useHarnessStore.getState().applyRuntimeMetadata('session-claude', claudeRuntimeMetadata());

		const { rerender, container } = render(
			<RuntimeMetadataBar sessionId="session-claude" theme={testTheme} />
		);

		// Initially rendered
		expect(container.firstChild).not.toBeNull();

		// Clear session
		useHarnessStore.getState().clearSession('session-claude');

		rerender(<RuntimeMetadataBar sessionId="session-claude" theme={testTheme} />);
		expect(container.firstChild).toBeNull();
	});
});

// ============================================================================
// End-to-end: Claude data lifecycle through generic structures
// ============================================================================

describe('Claude Code end-to-end lifecycle through generic structures', () => {
	it('full lifecycle: spawn → metadata → interaction → respond → clear', async () => {
		// 1. Spawn: metadata arrives
		useHarnessStore.getState().applyRuntimeMetadata('session-claude', claudeRuntimeMetadata());

		// Verify metadata stored
		const metadata = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-claude');
		expect(metadata!.skills).toHaveLength(5);
		expect(metadata!.availableModels).toHaveLength(3);

		// 2. Interaction arrives
		const approval = claudeEditApproval({ interactionId: 'int-lifecycle' });
		useHarnessStore.getState().addInteraction('session-claude', approval);

		// 3. Render modal and approve
		useSessionStore.setState({ activeSessionId: 'session-claude' });
		renderWithLayerStack(<InteractionRequestModal theme={testTheme} />);

		expect(screen.getByTestId('tool-approval-view')).toBeInTheDocument();
		expect(screen.getByText('Edit')).toBeInTheDocument();

		fireEvent.click(screen.getByTestId('approve-button'));

		await waitFor(() => {
			expect(mockRespondToInteraction).toHaveBeenCalledWith(
				'session-claude',
				'int-lifecycle',
				{ kind: 'approve' }
			);
		});

		// 4. Interaction removed from store
		const postState = useHarnessStore.getState();
		expect(postState.pendingInteractions['session-claude'] ?? []).toHaveLength(0);

		// 5. Metadata still present (interactions clear independently)
		expect(selectSessionRuntimeMetadata(postState, 'session-claude')).toBeDefined();
		expect(selectSessionRuntimeMetadata(postState, 'session-claude')!.skills).toHaveLength(5);

		// 6. Session exit clears everything
		useHarnessStore.getState().clearSession('session-claude');
		expect(selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-claude')).toBeUndefined();
	});

	it('Claude data coexists with non-Claude session data without cross-contamination', () => {
		// Claude session
		useHarnessStore.getState().applyRuntimeMetadata('session-claude', claudeRuntimeMetadata());
		useHarnessStore.getState().addInteraction('session-claude', claudeEditApproval());

		// Codex session with different metadata
		const codexMetadata: RuntimeMetadataEvent = {
			sessionId: 'session-codex',
			source: 'codex',
			skills: [{ id: 'code-gen', name: 'Code Generation' }],
			availableModels: [{ id: 'o3-mini', label: 'OpenAI o3-mini' }],
			slashCommands: ['/run'],
		};
		useHarnessStore.getState().applyRuntimeMetadata('session-codex', codexMetadata);

		// Claude session has Claude data
		const claudeMeta = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-claude');
		expect(claudeMeta!.skills).toHaveLength(5);
		expect(claudeMeta!.availableModels).toHaveLength(3);
		expect(claudeMeta!.availableModels[0].id).toBe('claude-opus-4-6');

		// Codex session has Codex data — no Claude leakage
		const codexMeta = selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-codex');
		expect(codexMeta!.skills).toHaveLength(1);
		expect(codexMeta!.skills[0].id).toBe('code-gen');
		expect(codexMeta!.availableModels).toHaveLength(1);
		expect(codexMeta!.availableModels[0].id).toBe('o3-mini');

		// Clearing Claude doesn't affect Codex
		useHarnessStore.getState().clearSession('session-claude');
		expect(selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-codex')).toBeDefined();
		expect(selectSessionRuntimeMetadata(useHarnessStore.getState(), 'session-codex')!.skills).toHaveLength(1);
	});

	it('Claude toolUseId format (toolu_*) passes through without special parsing', () => {
		const request = claudeEditApproval({
			toolUseId: 'toolu_01BmYmXn3H5dDJBnVq84FfNc',
		});

		// The toolUseId is an opaque string — the store doesn't parse or validate it
		useHarnessStore.getState().addInteraction('session-claude', request);
		const interactions = useHarnessStore.getState().pendingInteractions['session-claude'];
		expect(interactions).toHaveLength(1);
		expect((interactions[0] as ToolApprovalRequest).toolUseId).toBe('toolu_01BmYmXn3H5dDJBnVq84FfNc');
	});
});
