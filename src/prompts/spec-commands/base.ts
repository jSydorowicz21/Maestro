/**
 * Shared base for prompt template modules (SpecKit, OpenSpec).
 *
 * Each feature module defines its own command list and raw imports,
 * then delegates lookup and metadata logic to these shared helpers.
 */

import type { SpecCommandMetadata } from '../../main/spec-command-manager';

export interface SpecCommandDefinition {
	id: string;
	command: string;
	description: string;
	prompt: string;
	isCustom: boolean;
}

/**
 * Create lookup functions for a command list.
 */
export function createCommandLookup(commands: SpecCommandDefinition[]) {
	return {
		getCommand(id: string): SpecCommandDefinition | undefined {
			return commands.find((cmd) => cmd.id === id);
		},
		getCommandBySlash(command: string): SpecCommandDefinition | undefined {
			return commands.find((cmd) => cmd.command === command);
		},
	};
}

/**
 * Create a metadata getter from a metadata.json import.
 */
export function createMetadataGetter(metadataJson: {
	lastRefreshed: string;
	commitSha: string;
	sourceVersion: string;
	sourceUrl: string;
}): () => SpecCommandMetadata {
	return () => ({
		lastRefreshed: metadataJson.lastRefreshed,
		commitSha: metadataJson.commitSha,
		sourceVersion: metadataJson.sourceVersion,
		sourceUrl: metadataJson.sourceUrl,
	});
}
