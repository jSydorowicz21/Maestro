/**
 * Tests for RuntimeMetadataBar component
 *
 * Covers:
 * - Rendering when metadata is present/absent
 * - Showing correct counts for skills, slash commands, models, agents
 * - Tooltip hover behavior showing detailed metadata
 * - Provider-neutral rendering (no agent-specific branching)
 * - Session isolation
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useHarnessStore } from '../../../renderer/stores/harnessStore';
import { RuntimeMetadataBar } from '../../../renderer/components/RuntimeMetadataBar';
import type { Theme } from '../../../renderer/types';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('lucide-react', () => ({
	Sparkles: ({ className }: any) => <svg data-testid="sparkles-icon" className={className} />,
	Terminal: ({ className }: any) => <svg data-testid="terminal-icon" className={className} />,
	Cpu: ({ className }: any) => <svg data-testid="cpu-icon" className={className} />,
	Bot: ({ className }: any) => <svg data-testid="bot-icon" className={className} />,
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

// ============================================================================
// Helpers
// ============================================================================

function renderBar(sessionId = 'session-1') {
	return render(
		<RuntimeMetadataBar sessionId={sessionId} theme={testTheme} />
	);
}

// ============================================================================
// Tests
// ============================================================================

beforeEach(() => {
	useHarnessStore.setState({
		pendingInteractions: {},
		runtimeMetadata: {},
	});
});

describe('RuntimeMetadataBar', () => {
	it('renders nothing when no metadata exists', () => {
		const { container } = renderBar();
		expect(container.firstChild).toBeNull();
	});

	it('renders nothing when metadata exists but has no items', () => {
		act(() => {
			useHarnessStore.getState().applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				capabilities: { supportsSkillsEnumeration: true },
			});
		});

		const { container } = renderBar();
		// Capabilities alone don't produce visible items
		expect(container.firstChild).toBeNull();
	});

	it('shows skills count when skills are present', () => {
		act(() => {
			useHarnessStore.getState().applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [
					{ id: 'commit', name: 'Commit' },
					{ id: 'review-pr', name: 'Review PR' },
				],
			});
		});

		renderBar();
		expect(screen.getByTestId('sparkles-icon')).toBeTruthy();
		expect(screen.getByText('2')).toBeTruthy();
	});

	it('shows slash commands count when commands are present', () => {
		act(() => {
			useHarnessStore.getState().applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				slashCommands: ['/help', '/compact', '/review'],
			});
		});

		renderBar();
		expect(screen.getByTestId('terminal-icon')).toBeTruthy();
		expect(screen.getByText('3')).toBeTruthy();
	});

	it('shows model count when models are present', () => {
		act(() => {
			useHarnessStore.getState().applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				availableModels: [
					{ id: 'claude-opus-4-6', label: 'Opus 4.6' },
				],
			});
		});

		renderBar();
		expect(screen.getByTestId('cpu-icon')).toBeTruthy();
		expect(screen.getByText('1')).toBeTruthy();
	});

	it('shows agent count when sub-agents are present', () => {
		act(() => {
			useHarnessStore.getState().applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				availableAgents: [
					{ id: 'code-reviewer', label: 'Code Reviewer' },
					{ id: 'test-runner', label: 'Test Runner' },
					{ id: 'explorer', label: 'Explorer' },
				],
			});
		});

		renderBar();
		expect(screen.getByTestId('bot-icon')).toBeTruthy();
		expect(screen.getByText('3')).toBeTruthy();
	});

	it('shows all metadata counts when all types are present', () => {
		act(() => {
			useHarnessStore.getState().applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [{ id: 'commit', name: 'Commit' }],
				slashCommands: ['/help'],
				availableModels: [{ id: 'claude-opus-4-6' }],
				availableAgents: [{ id: 'reviewer' }],
			});
		});

		renderBar();
		expect(screen.getByTestId('sparkles-icon')).toBeTruthy();
		expect(screen.getByTestId('terminal-icon')).toBeTruthy();
		expect(screen.getByTestId('cpu-icon')).toBeTruthy();
		expect(screen.getByTestId('bot-icon')).toBeTruthy();
	});

	it('shows tooltip with skill details on hover', async () => {
		act(() => {
			useHarnessStore.getState().applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [
					{ id: 'commit', name: 'Commit', description: 'Commit changes to git' },
					{ id: 'review-pr', name: 'Review PR' },
				],
			});
		});

		renderBar();

		// Hover to open tooltip
		const widget = screen.getByTitle('Agent runtime metadata');
		fireEvent.mouseEnter(widget.parentElement!);

		// Tooltip should show skill names and descriptions
		expect(screen.getByText('Runtime Metadata')).toBeTruthy();
		expect(screen.getByText('Skills')).toBeTruthy();
		expect(screen.getByText('Commit')).toBeTruthy();
		expect(screen.getByText('Commit changes to git')).toBeTruthy();
		expect(screen.getByText('Review PR')).toBeTruthy();
	});

	it('shows tooltip with model details on hover', () => {
		act(() => {
			useHarnessStore.getState().applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				availableModels: [
					{ id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
					{ id: 'claude-sonnet-4-6' },
				],
			});
		});

		renderBar();

		// Hover to open tooltip
		const widget = screen.getByTitle('Agent runtime metadata');
		fireEvent.mouseEnter(widget.parentElement!);

		expect(screen.getByText('Available Models')).toBeTruthy();
		expect(screen.getByText('claude-opus-4-6')).toBeTruthy();
		expect(screen.getByText('(Claude Opus 4.6)')).toBeTruthy();
		expect(screen.getByText('claude-sonnet-4-6')).toBeTruthy();
	});

	it('shows tooltip with slash command details on hover', () => {
		act(() => {
			useHarnessStore.getState().applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				slashCommands: ['help', '/compact'],
			});
		});

		renderBar();

		const widget = screen.getByTitle('Agent runtime metadata');
		fireEvent.mouseEnter(widget.parentElement!);

		expect(screen.getByText('Slash Commands')).toBeTruthy();
		// Commands without / prefix should get it added in tooltip
		expect(screen.getByText('/help')).toBeTruthy();
		expect(screen.getByText('/compact')).toBeTruthy();
	});

	it('renders identically for different agent types (provider-neutral)', () => {
		// Test with codex agent
		act(() => {
			useHarnessStore.getState().applyRuntimeMetadata('session-codex', {
				sessionId: 'session-codex',
				source: 'codex',
				skills: [{ id: 'test', name: 'Test Skill' }],
				availableModels: [{ id: 'gpt-4o' }],
			});
		});

		const { container: codexContainer } = render(
			<RuntimeMetadataBar sessionId="session-codex" theme={testTheme} />
		);

		// Test with opencode agent
		act(() => {
			useHarnessStore.getState().applyRuntimeMetadata('session-opencode', {
				sessionId: 'session-opencode',
				source: 'opencode',
				skills: [{ id: 'test', name: 'Test Skill' }],
				availableModels: [{ id: 'gpt-4o' }],
			});
		});

		const { container: opencodeContainer } = render(
			<RuntimeMetadataBar sessionId="session-opencode" theme={testTheme} />
		);

		// Both should render the same structure (no provider-specific branching)
		expect(codexContainer.innerHTML).toBe(opencodeContainer.innerHTML);
	});

	it('isolates metadata between different sessions', () => {
		act(() => {
			useHarnessStore.getState().applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [{ id: 'commit', name: 'Commit' }],
			});
		});

		// Session 1 should render
		const { container: c1 } = renderBar('session-1');
		expect(c1.firstChild).not.toBeNull();

		// Session 2 has no metadata — should not render
		const { container: c2 } = renderBar('session-2');
		expect(c2.firstChild).toBeNull();
	});

	it('updates when metadata changes', () => {
		const { rerender } = render(
			<RuntimeMetadataBar sessionId="session-1" theme={testTheme} />
		);

		// Initially empty
		expect(screen.queryByTestId('sparkles-icon')).toBeNull();

		// Add skills
		act(() => {
			useHarnessStore.getState().applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [{ id: 'commit', name: 'Commit' }],
			});
		});

		rerender(
			<RuntimeMetadataBar sessionId="session-1" theme={testTheme} />
		);

		expect(screen.getByTestId('sparkles-icon')).toBeTruthy();
	});

	it('disappears when session metadata is cleared', () => {
		act(() => {
			useHarnessStore.getState().applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				skills: [{ id: 'commit', name: 'Commit' }],
			});
		});

		const { container, rerender } = render(
			<RuntimeMetadataBar sessionId="session-1" theme={testTheme} />
		);
		expect(container.firstChild).not.toBeNull();

		act(() => {
			useHarnessStore.getState().clearSession('session-1');
		});

		rerender(
			<RuntimeMetadataBar sessionId="session-1" theme={testTheme} />
		);
		expect(container.firstChild).toBeNull();
	});

	it('shows sub-agent details in tooltip on hover', () => {
		act(() => {
			useHarnessStore.getState().applyRuntimeMetadata('session-1', {
				sessionId: 'session-1',
				source: 'claude-code',
				availableAgents: [
					{ id: 'code-reviewer', label: 'Code Reviewer' },
				],
			});
		});

		renderBar();

		const widget = screen.getByTitle('Agent runtime metadata');
		fireEvent.mouseEnter(widget.parentElement!);

		expect(screen.getByText('Sub-Agents')).toBeTruthy();
		expect(screen.getByText('Code Reviewer')).toBeTruthy();
		expect(screen.getByText('code-reviewer')).toBeTruthy();
	});
});
