/**
 * Spec Command Manager (Shared Base)
 *
 * Shared logic for managing bundled prompt-based command systems (SpecKit, OpenSpec).
 * Each feature creates an instance with its own config, then delegates all common
 * operations to this class. Feature-specific logic (like refreshPrompts) stays in
 * the thin wrapper files.
 */

import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';
import { logger } from './utils/logger';

// --- Public types ---

export interface SpecCommand {
	id: string;
	command: string;
	description: string;
	prompt: string;
	isCustom: boolean;
	isModified: boolean;
}

export interface SpecCommandMetadata {
	lastRefreshed: string;
	commitSha: string;
	sourceVersion: string;
	sourceUrl: string;
}

// --- Config types ---

export interface CommandDefinition {
	readonly id: string;
	readonly command: string;
	readonly description: string;
	readonly isCustom: boolean;
}

export interface SpecCommandManagerConfig {
	readonly featureName: string;
	readonly logContext: string;
	readonly customizationsFile: string;
	readonly promptsSubdir: string;
	readonly filePrefix: string;
	readonly commands: readonly CommandDefinition[];
	readonly defaultMetadata: SpecCommandMetadata;
}

// --- Internal types ---

interface StoredPrompt {
	content: string;
	isModified: boolean;
	modifiedAt?: string;
}

interface StoredData {
	metadata: SpecCommandMetadata;
	prompts: Record<string, StoredPrompt>;
}

export class SpecCommandManager {
	constructor(private readonly config: SpecCommandManagerConfig) {}

	// --- Public API (used by IPC handlers via thin wrappers) ---

	async getMetadata(): Promise<SpecCommandMetadata> {
		const customizations = await this.loadUserCustomizations();
		if (customizations?.metadata) {
			return customizations.metadata;
		}
		return this.getBundledMetadata();
	}

	async getPrompts(): Promise<SpecCommand[]> {
		const bundled = await this.getBundledPrompts();
		const customizations = await this.loadUserCustomizations();

		const commands: SpecCommand[] = [];

		for (const [id, data] of Object.entries(bundled)) {
			const customPrompt = customizations?.prompts?.[id];
			const isModified = customPrompt?.isModified ?? false;
			const prompt = isModified && customPrompt ? customPrompt.content : data.prompt;

			commands.push({
				id,
				command: `/${this.config.filePrefix}.${id}`,
				description: data.description,
				prompt,
				isCustom: data.isCustom,
				isModified,
			});
		}

		return commands;
	}

	async savePrompt(id: string, content: string): Promise<void> {
		const customizations = (await this.loadUserCustomizations()) ?? {
			metadata: await this.getBundledMetadata(),
			prompts: {},
		};

		customizations.prompts[id] = {
			content,
			isModified: true,
			modifiedAt: new Date().toISOString(),
		};

		await this.saveUserCustomizations(customizations);
		logger.info(`Saved customization for ${this.config.filePrefix}.${id}`, this.config.logContext);
	}

	async resetPrompt(id: string): Promise<string> {
		const bundled = await this.getBundledPrompts();
		const defaultPrompt = bundled[id];

		if (!defaultPrompt) {
			throw new Error(`Unknown ${this.config.featureName} command: ${id}`);
		}

		const customizations = await this.loadUserCustomizations();
		if (customizations?.prompts?.[id]) {
			delete customizations.prompts[id];
			await this.saveUserCustomizations(customizations);
			logger.info(
				`Reset ${this.config.filePrefix}.${id} to bundled default`,
				this.config.logContext
			);
		}

		return defaultPrompt.prompt;
	}

	async getCommand(id: string): Promise<SpecCommand | null> {
		const commands = await this.getPrompts();
		return commands.find((cmd) => cmd.id === id) ?? null;
	}

	async getCommandBySlash(slashCommand: string): Promise<SpecCommand | null> {
		const commands = await this.getPrompts();
		return commands.find((cmd) => cmd.command === slashCommand) ?? null;
	}

	// --- Semi-public (used by refresh implementations in thin wrappers) ---

	getUserPromptsPath(): string {
		return path.join(app.getPath('userData'), `${this.config.featureName}-prompts`);
	}

	async updateMetadata(newMetadata: SpecCommandMetadata): Promise<void> {
		const customizations = (await this.loadUserCustomizations()) ?? {
			metadata: newMetadata,
			prompts: {},
		};
		customizations.metadata = newMetadata;
		await this.saveUserCustomizations(customizations);
	}

	// --- Private helpers ---

	private getUserDataPath(): string {
		return path.join(app.getPath('userData'), this.config.customizationsFile);
	}

	private async loadUserCustomizations(): Promise<StoredData | null> {
		try {
			const content = await fs.readFile(this.getUserDataPath(), 'utf-8');
			return JSON.parse(content);
		} catch {
			return null;
		}
	}

	private async saveUserCustomizations(data: StoredData): Promise<void> {
		await fs.writeFile(this.getUserDataPath(), JSON.stringify(data, null, 2), 'utf-8');
	}

	private getBundledPromptsPath(): string {
		if (app.isPackaged) {
			return path.join(process.resourcesPath, 'prompts', this.config.promptsSubdir);
		}
		return path.join(__dirname, '..', '..', 'src', 'prompts', this.config.promptsSubdir);
	}

	private async getBundledPrompts(): Promise<
		Record<string, { prompt: string; description: string; isCustom: boolean }>
	> {
		const bundledPromptsDir = this.getBundledPromptsPath();
		const userPromptsDir = this.getUserPromptsPath();
		const result: Record<string, { prompt: string; description: string; isCustom: boolean }> = {};

		for (const cmd of this.config.commands) {
			// For custom commands, always use bundled
			if (cmd.isCustom) {
				try {
					const promptPath = path.join(bundledPromptsDir, `${this.config.filePrefix}.${cmd.id}.md`);
					const prompt = await fs.readFile(promptPath, 'utf-8');
					result[cmd.id] = {
						prompt,
						description: cmd.description,
						isCustom: cmd.isCustom,
					};
				} catch (error) {
					logger.warn(
						`Failed to load bundled prompt for ${cmd.id}: ${error}`,
						this.config.logContext
					);
					result[cmd.id] = {
						prompt: `# ${cmd.id}\n\nPrompt not available.`,
						description: cmd.description,
						isCustom: cmd.isCustom,
					};
				}
				continue;
			}

			// For upstream commands, check user prompts directory first (downloaded updates)
			try {
				const userPromptPath = path.join(userPromptsDir, `${this.config.filePrefix}.${cmd.id}.md`);
				const prompt = await fs.readFile(userPromptPath, 'utf-8');
				result[cmd.id] = {
					prompt,
					description: cmd.description,
					isCustom: cmd.isCustom,
				};
				continue;
			} catch {
				// User prompt not found, try bundled
			}

			// Fall back to bundled prompts
			try {
				const promptPath = path.join(bundledPromptsDir, `${this.config.filePrefix}.${cmd.id}.md`);
				const prompt = await fs.readFile(promptPath, 'utf-8');
				result[cmd.id] = {
					prompt,
					description: cmd.description,
					isCustom: cmd.isCustom,
				};
			} catch (error) {
				logger.warn(
					`Failed to load bundled prompt for ${cmd.id}: ${error}`,
					this.config.logContext
				);
				result[cmd.id] = {
					prompt: `# ${cmd.id}\n\nPrompt not available.`,
					description: cmd.description,
					isCustom: cmd.isCustom,
				};
			}
		}

		return result;
	}

	private async getBundledMetadata(): Promise<SpecCommandMetadata> {
		const bundledPromptsDir = this.getBundledPromptsPath();
		const userPromptsDir = this.getUserPromptsPath();

		// Check user prompts directory first (downloaded updates)
		try {
			const userMetadataPath = path.join(userPromptsDir, 'metadata.json');
			const content = await fs.readFile(userMetadataPath, 'utf-8');
			return JSON.parse(content);
		} catch {
			// User metadata not found, try bundled
		}

		// Fall back to bundled metadata
		try {
			const metadataPath = path.join(bundledPromptsDir, 'metadata.json');
			const content = await fs.readFile(metadataPath, 'utf-8');
			return JSON.parse(content);
		} catch {
			// Return default metadata if file doesn't exist
			return { ...this.config.defaultMetadata };
		}
	}
}
