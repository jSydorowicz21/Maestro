// src/main/process-manager/ProcessManager.ts

import { EventEmitter } from 'events';
import type {
	ProcessConfig,
	AgentExecution,
	SpawnResult,
	CommandResult,
	ParsedEvent,
	AgentOutputParser,
} from './types';
import { PtySpawner } from './spawners/PtySpawner';
import { ChildProcessSpawner } from './spawners/ChildProcessSpawner';
import { DataBufferManager } from './handlers/DataBufferManager';
import { LocalCommandRunner } from './runners/LocalCommandRunner';
import { SshCommandRunner } from './runners/SshCommandRunner';
import { selectExecutionMode } from './utils/executionMode';
import { createHarness } from '../harness/harness-registry';
import { logger } from '../utils/logger';
import type { SshRemoteConfig, ToolType, AgentExecutionConfig } from '../../shared/types';
import type { InteractionResponse } from '../../shared/interaction-types';
import type { HarnessRuntimeSettings } from '../../shared/harness-types';

/**
 * ProcessManager orchestrates spawning and managing processes for sessions.
 *
 * Responsibilities:
 * - Spawn PTY and child processes
 * - Route data events from processes
 * - Provide process lifecycle management (write, resize, interrupt, kill)
 * - Execute commands (local and SSH remote)
 */
export class ProcessManager extends EventEmitter {
	private processes: Map<string, AgentExecution> = new Map();
	private bufferManager: DataBufferManager;
	private ptySpawner: PtySpawner;
	private childProcessSpawner: ChildProcessSpawner;
	private localCommandRunner: LocalCommandRunner;
	private sshCommandRunner: SshCommandRunner;

	constructor() {
		super();
		this.bufferManager = new DataBufferManager(this.processes, this);
		this.ptySpawner = new PtySpawner(this.processes, this, this.bufferManager);
		this.childProcessSpawner = new ChildProcessSpawner(this.processes, this, this.bufferManager);
		this.localCommandRunner = new LocalCommandRunner(this);
		this.sshCommandRunner = new SshCommandRunner(this);
	}

	/**
	 * Spawn a new execution for a session.
	 *
	 * Selects execution mode (classic vs harness) based on agent capabilities,
	 * query context, and caller preferences. Classic mode uses PTY or child-process
	 * spawners. Harness mode delegates to an AgentHarness adapter when a factory
	 * is registered for the agent type; falls back to classic otherwise.
	 */
	spawn(config: ProcessConfig): SpawnResult {
		const { mode } = selectExecutionMode(config);

		if (mode === 'harness') {
			const harness = createHarness(config.toolType);

			if (!harness) {
				// No factory registered — fall back to classic with warning
				logger.warn(
					'[ProcessManager] Harness mode selected but no harness factory registered; falling back to classic',
					'ProcessManager',
					{ sessionId: config.sessionId, toolType: config.toolType }
				);
			} else {
				// Subscribe to all standard ProcessManager events emitted by the harness
				const standardEvents = [
					'data', 'exit', 'stderr', 'session-id', 'usage',
					'thinking-chunk', 'tool-execution', 'agent-error',
					'query-complete', 'slash-commands',
				] as const;

				for (const eventName of standardEvents) {
					harness.on(eventName, (...args: unknown[]) => {
						this.emit(eventName, ...args);
					});
				}

				// Subscribe to harness-specific events and re-emit through ProcessManager
				harness.on('interaction-request', (sessionId: string, request: unknown) => {
					this.emit('interaction-request', sessionId, request);
				});
				harness.on('runtime-metadata', (sessionId: string, metadata: unknown) => {
					this.emit('runtime-metadata', sessionId, metadata);
				});

				// Create the AgentExecution record
				const execution: AgentExecution = {
					sessionId: config.sessionId,
					toolType: config.toolType,
					backend: 'harness',
					harness,
					cwd: config.cwd,
					pid: null,
					isTerminal: false,
					startTime: Date.now(),
					querySource: config.querySource,
					tabId: config.tabId,
					projectPath: config.projectPath,
					contextWindow: config.contextWindow,
				};

				// Store the execution record
				this.processes.set(config.sessionId, execution);

				// Build AgentExecutionConfig from ProcessConfig
				const executionConfig: AgentExecutionConfig = {
					sessionId: config.sessionId,
					toolType: config.toolType as ToolType,
					cwd: config.cwd,
					prompt: config.prompt,
					images: config.images,
					customEnvVars: config.customEnvVars,
					contextWindow: config.contextWindow,
					querySource: config.querySource,
					tabId: config.tabId,
					projectPath: config.projectPath,
					preferredExecutionMode: config.preferredExecutionMode,
					providerOptions: config.providerOptions,
					permissionMode: config.permissionMode,
				};

				// Spawn async — fire-and-forget with error handling
				harness.spawn(executionConfig).then(
					(spawnResult) => {
						if (spawnResult.pid != null) {
							execution.pid = spawnResult.pid;
						}
						if (!spawnResult.success) {
							logger.error(
								'[ProcessManager] Harness spawn reported failure',
								'ProcessManager',
								{ sessionId: config.sessionId, toolType: config.toolType }
							);
							harness.dispose();
							this.processes.delete(config.sessionId);
							this.emit('agent-error', config.sessionId, {
								type: 'agent_crashed',
								message: 'Harness spawn failed',
								recoverable: false,
							});
							this.emit('exit', config.sessionId, 1);
						} else {
							logger.info(
								`[ProcessManager] Harness spawn succeeded — pid=${spawnResult.pid ?? null}`,
								'ProcessManager',
								{ sessionId: config.sessionId, toolType: config.toolType }
							);
						}
					},
					(error) => {
						logger.error(
							`[ProcessManager] Harness spawn threw: ${String(error)}`,
							'ProcessManager',
							{ sessionId: config.sessionId, toolType: config.toolType }
						);
						harness.dispose();
						this.processes.delete(config.sessionId);
						this.emit('agent-error', config.sessionId, {
							type: 'agent_crashed',
							message: `Harness spawn error: ${String(error)}`,
							recoverable: false,
						});
						this.emit('exit', config.sessionId, 1);
					}
				);

				logger.debug(
					'[ProcessManager] spawn() completed — backend=harness, pid=null',
					'ProcessManager',
					{ sessionId: config.sessionId, toolType: config.toolType, selectedMode: mode }
				);

				return { pid: null, success: true };
			}
		}

		// Classic execution path (also serves as fallback for unregistered harnesses)
		const usePty = this.shouldUsePty(config);
		const result = usePty
			? this.ptySpawner.spawn(config)
			: this.childProcessSpawner.spawn(config);

		logger.debug(
			`[ProcessManager] spawn() completed — backend=${usePty ? 'pty' : 'child-process'}, pid=${result.pid}, success=${result.success}`,
			'ProcessManager',
			{ sessionId: config.sessionId, toolType: config.toolType, selectedMode: mode }
		);

		return result;
	}

	private shouldUsePty(config: ProcessConfig): boolean {
		const { toolType, requiresPty, prompt } = config;
		return (toolType === 'terminal' || requiresPty === true) && !prompt;
	}

	/**
	 * Write data to an execution's backend.
	 *
	 * Routes to the correct backend based on the execution record:
	 * - 'pty': writes to the PTY process
	 * - 'child-process': writes to the child process stdin
	 * - 'harness': delegates to the harness write() (Phase 2+)
	 */
	write(sessionId: string, data: string): boolean {
		const execution = this.processes.get(sessionId);
		if (!execution) {
			logger.error('[ProcessManager] write() - No execution found for session', 'ProcessManager', {
				sessionId,
			});
			return false;
		}

		try {
			switch (execution.backend) {
				case 'pty':
					if (execution.ptyProcess) {
						const command = data.replace(/\r?\n$/, '');
						if (command.trim()) {
							execution.lastCommand = command.trim();
						}
						execution.ptyProcess.write(data);
						return true;
					}
					logger.warn('[ProcessManager] write() - pty backend has no ptyProcess handle', 'ProcessManager', {
						sessionId,
					});
					return false;

				case 'child-process':
					if (execution.childProcess?.stdin) {
						execution.childProcess.stdin.write(data);
						return true;
					}
					logger.warn('[ProcessManager] write() - child-process backend has no stdin handle', 'ProcessManager', {
						sessionId,
						hasChildProcess: !!execution.childProcess,
					});
					return false;

				case 'harness':
					// Harness write delegation — Phase 2+
					// This path should be unreachable in Phase 1: harness-backed executions
					// use the SDK's streaming input API (streamInput), not raw write().
					logger.error(
						'[ProcessManager] write() called on harness-backed execution — unreachable in Phase 1',
						'ProcessManager',
						{ sessionId }
					);
					return true;

				default:
					logger.warn('[ProcessManager] write() - unknown backend type', 'ProcessManager', {
						sessionId,
						backend: execution.backend,
					});
					return false;
			}
		} catch (error) {
			logger.error('[ProcessManager] Failed to write to execution', 'ProcessManager', {
				sessionId,
				backend: execution.backend,
				error: String(error),
			});
			return false;
		}
	}

	/**
	 * Resize terminal (for pty processes)
	 */
	resize(sessionId: string, cols: number, rows: number): boolean {
		const process = this.processes.get(sessionId);
		if (!process || !process.isTerminal || !process.ptyProcess) return false;

		try {
			process.ptyProcess.resize(cols, rows);
			return true;
		} catch (error) {
			logger.error('[ProcessManager] Failed to resize terminal', 'ProcessManager', {
				sessionId,
				error: String(error),
			});
			return false;
		}
	}

	/**
	 * Send interrupt signal to an execution.
	 *
	 * Routes based on backend:
	 * - 'pty': sends Ctrl+C character
	 * - 'child-process': sends SIGINT, escalates to SIGTERM after timeout
	 * - 'harness': delegates to harness interrupt() (Phase 2+)
	 */
	interrupt(sessionId: string): boolean {
		const execution = this.processes.get(sessionId);
		if (!execution) {
			logger.warn('[ProcessManager] interrupt() - No execution found for session', 'ProcessManager', {
				sessionId,
			});
			return false;
		}

		try {
			switch (execution.backend) {
				case 'pty':
					if (execution.ptyProcess) {
						execution.ptyProcess.write('\x03');
						return true;
					}
					logger.warn('[ProcessManager] interrupt() - pty backend has no ptyProcess handle', 'ProcessManager', {
						sessionId,
					});
					return false;

				case 'child-process':
					if (execution.childProcess) {
						const child = execution.childProcess;
						child.kill('SIGINT');

						// Escalate to SIGTERM if the process doesn't exit promptly.
						// Some agents (e.g., Claude Code --print) may not exit on SIGINT alone.
						const escalationTimer = setTimeout(() => {
							const stillRunning = this.processes.get(sessionId);
							if (stillRunning?.childProcess && !stillRunning.childProcess.killed) {
								logger.warn(
									'[ProcessManager] Process did not exit after SIGINT, escalating to SIGTERM',
									'ProcessManager',
									{ sessionId, pid: stillRunning.pid }
								);
								this.kill(sessionId);
							}
						}, 2000);

						// Clear the timer if the process exits on its own
						child.once('exit', () => {
							clearTimeout(escalationTimer);
						});

						return true;
					}
					logger.warn('[ProcessManager] interrupt() - child-process backend has no childProcess handle', 'ProcessManager', {
						sessionId,
					});
					return false;

				case 'harness':
					// Harness interrupt delegation — Phase 2+
					// This path should be unreachable in Phase 1: harness-backed executions
					// use the SDK's interrupt API, not raw interrupt().
					logger.error(
						'[ProcessManager] interrupt() called on harness-backed execution — unreachable in Phase 1',
						'ProcessManager',
						{ sessionId }
					);
					return true;

				default:
					logger.warn('[ProcessManager] interrupt() - unknown backend type', 'ProcessManager', {
						sessionId,
						backend: execution.backend,
					});
					return false;
			}
		} catch (error) {
			logger.error('[ProcessManager] Failed to interrupt execution', 'ProcessManager', {
				sessionId,
				backend: execution.backend,
				error: String(error),
			});
			return false;
		}
	}

	/**
	 * Kill a specific execution.
	 *
	 * Cleans up buffers and removes the execution record regardless of backend.
	 * Routes the actual kill signal based on backend type.
	 */
	kill(sessionId: string): boolean {
		const execution = this.processes.get(sessionId);
		if (!execution) {
			logger.warn('[ProcessManager] kill() - No execution found for session', 'ProcessManager', {
				sessionId,
			});
			return false;
		}

		try {
			// Common cleanup: flush buffers (applies to all backends)
			if (execution.dataBufferTimeout) {
				clearTimeout(execution.dataBufferTimeout);
			}
			this.bufferManager.flushDataBuffer(sessionId);

			// Backend-specific termination
			switch (execution.backend) {
				case 'pty':
					if (execution.ptyProcess) {
						execution.ptyProcess.kill();
					}
					break;

				case 'child-process':
					if (execution.childProcess) {
						execution.childProcess.kill('SIGTERM');
					}
					break;

				case 'harness':
					// Deterministic cleanup: dispose the harness to release all resources.
					// dispose() is synchronous and idempotent. Errors must not prevent
					// the execution record from being deleted.
					if (execution.harness) {
						try {
							execution.harness.dispose();
						} catch (disposeError) {
							logger.error(
								'[ProcessManager] kill() - harness.dispose() threw, continuing with cleanup',
								'ProcessManager',
								{ sessionId, error: String(disposeError) }
							);
						}
					} else {
						logger.warn(
							'[ProcessManager] kill() - harness-backed execution has no harness instance',
							'ProcessManager',
							{ sessionId }
						);
					}
					break;
			}

			// Always remove the execution record
			this.processes.delete(sessionId);

			logger.debug('[ProcessManager] kill() completed', 'ProcessManager', {
				sessionId,
				backend: execution.backend,
				pid: execution.pid,
			});

			return true;
		} catch (error) {
			logger.error('[ProcessManager] Failed to kill execution', 'ProcessManager', {
				sessionId,
				backend: execution.backend,
				error: String(error),
			});
			return false;
		}
	}

	/**
	 * Respond to a pending interaction request from a harness-backed agent.
	 *
	 * Only valid for sessions running with the 'harness' backend. Classic
	 * (PTY / child-process) sessions do not use the structured interaction
	 * protocol. When harness adapters are registered (Phase 2+) this will
	 * delegate to harness.respondToInteraction().
	 */
	async respondToInteraction(
		sessionId: string,
		interactionId: string,
		response: InteractionResponse
	): Promise<void> {
		const execution = this.processes.get(sessionId);
		if (!execution) {
			logger.warn(
				'[ProcessManager] respondToInteraction() - No execution found for session',
				'ProcessManager',
				{ sessionId, interactionId }
			);
			return;
		}

		if (execution.backend !== 'harness') {
			logger.warn(
				'[ProcessManager] respondToInteraction() called on non-harness execution',
				'ProcessManager',
				{ sessionId, interactionId, backend: execution.backend }
			);
			return;
		}

		// Harness response delegation — Phase 2+
		// When harness adapters land, this will call:
		//   execution.harness.respondToInteraction(interactionId, response)
		logger.warn(
			'[ProcessManager] respondToInteraction() - harness adapters not yet registered',
			'ProcessManager',
			{ sessionId, interactionId, responseKind: response.kind }
		);
	}

	/**
	 * Update runtime settings on a harness-backed execution.
	 *
	 * Only valid for sessions running with the 'harness' backend. Classic
	 * (PTY / child-process) sessions do not support runtime settings updates.
	 * When harness adapters are registered (Phase 2+) this will delegate to
	 * harness.updateRuntimeSettings().
	 */
	async updateRuntimeSettings(
		sessionId: string,
		settings: HarnessRuntimeSettings
	): Promise<void> {
		const execution = this.processes.get(sessionId);
		if (!execution) {
			logger.warn(
				'[ProcessManager] updateRuntimeSettings() - No execution found for session',
				'ProcessManager',
				{ sessionId }
			);
			return;
		}

		if (execution.backend !== 'harness') {
			logger.warn(
				'[ProcessManager] updateRuntimeSettings() called on non-harness execution',
				'ProcessManager',
				{ sessionId, backend: execution.backend }
			);
			return;
		}

		// Harness settings delegation — Phase 2+
		// When harness adapters land, this will call:
		//   await execution.harness.updateRuntimeSettings(settings)
		logger.warn(
			'[ProcessManager] updateRuntimeSettings() - harness adapters not yet registered',
			'ProcessManager',
			{ sessionId, settingsKeys: Object.keys(settings) }
		);
	}

	/**
	 * Kill all managed processes
	 */
	killAll(): void {
		const count = this.processes.size;
		if (count > 0) {
			logger.info(`[ProcessManager] killAll() — terminating ${count} execution(s)`, 'ProcessManager');
		}
		for (const [sessionId] of this.processes) {
			this.kill(sessionId);
		}
	}

	/**
	 * Get all active processes
	 */
	getAll(): AgentExecution[] {
		return Array.from(this.processes.values());
	}

	/**
	 * Get a specific process
	 */
	get(sessionId: string): AgentExecution | undefined {
		return this.processes.get(sessionId);
	}

	/**
	 * Get the output parser for a session's agent type
	 */
	getParser(sessionId: string): AgentOutputParser | null {
		const process = this.processes.get(sessionId);
		return process?.outputParser || null;
	}

	/**
	 * Parse a JSON line using the appropriate parser for the session
	 */
	parseLine(sessionId: string, line: string): ParsedEvent | null {
		const parser = this.getParser(sessionId);
		if (!parser) return null;
		return parser.parseJsonLine(line);
	}

	/**
	 * Run a single command and capture stdout/stderr cleanly
	 */
	runCommand(
		sessionId: string,
		command: string,
		cwd: string,
		shell?: string,
		shellEnvVars?: Record<string, string>,
		sshRemoteConfig?: SshRemoteConfig | null
	): Promise<CommandResult> {
		if (sshRemoteConfig) {
			return this.sshCommandRunner.run(sessionId, command, cwd, sshRemoteConfig, shellEnvVars);
		}
		return this.localCommandRunner.run(sessionId, command, cwd, shell, shellEnvVars);
	}
}
