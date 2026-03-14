/**
 * Image encoding helper for the Claude Code Harness.
 *
 * Reads image files from disk, base64-encodes them, detects MIME type
 * from file extension, and returns SDK image content blocks.
 *
 * This module is testable in isolation — it has no dependency on the
 * harness class or SDK query objects.
 */

import { readFile, stat } from 'fs/promises';
import { extname } from 'path';
import type { SDKUserContentBlock } from './claude-sdk-types';
import { logger } from '../utils/logger';

const LOG_CONTEXT = '[ClaudeImageEncoding]';

/** Maximum image file size in bytes (20 MB). */
export const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024;

/**
 * Supported image MIME types keyed by lowercase file extension.
 */
const EXTENSION_TO_MIME: Record<string, string> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
};

/**
 * Get the set of supported image extensions (for informational use).
 */
export function getSupportedExtensions(): string[] {
	return Object.keys(EXTENSION_TO_MIME);
}

/**
 * Detect MIME type from a file path's extension.
 * Returns undefined for unsupported extensions.
 */
export function detectMimeType(filePath: string): string | undefined {
	const ext = extname(filePath).toLowerCase();
	return EXTENSION_TO_MIME[ext];
}

/**
 * Read an image file from disk, base64-encode it, and return an SDK
 * image content block.
 *
 * Returns `null` (with a warning log) if:
 * - The file extension is unsupported
 * - The file does not exist or cannot be read
 * - The file exceeds MAX_IMAGE_SIZE_BYTES
 *
 * A single image failure must not prevent the rest of the message
 * from being sent — callers should filter out null results.
 */
export async function encodeImageFile(
	filePath: string,
	maxSizeBytes: number = MAX_IMAGE_SIZE_BYTES,
): Promise<SDKUserContentBlock | null> {
	// Detect MIME type from extension
	const mimeType = detectMimeType(filePath);
	if (!mimeType) {
		const ext = extname(filePath).toLowerCase() || '(none)';
		logger.warn(
			`${LOG_CONTEXT} Unsupported image format "${ext}" for file: ${filePath}. ` +
			`Supported formats: ${getSupportedExtensions().join(', ')}. Skipping.`,
			LOG_CONTEXT
		);
		return null;
	}

	// Check file size before reading
	try {
		const fileStat = await stat(filePath);
		if (fileStat.size > maxSizeBytes) {
			const sizeMB = (fileStat.size / (1024 * 1024)).toFixed(1);
			const limitMB = (maxSizeBytes / (1024 * 1024)).toFixed(0);
			logger.warn(
				`${LOG_CONTEXT} Image file too large (${sizeMB} MB, limit ${limitMB} MB): ${filePath}. Skipping.`,
				LOG_CONTEXT
			);
			return null;
		}
	} catch (error) {
		logger.warn(
			`${LOG_CONTEXT} Cannot stat image file: ${filePath}. ${String(error)}. Skipping.`,
			LOG_CONTEXT
		);
		return null;
	}

	// Read and base64-encode
	try {
		const buffer = await readFile(filePath);
		const data = buffer.toString('base64');

		return {
			type: 'image',
			source: {
				type: 'base64',
				media_type: mimeType,
				data,
			},
		};
	} catch (error) {
		logger.warn(
			`${LOG_CONTEXT} Failed to read image file: ${filePath}. ${String(error)}. Skipping.`,
			LOG_CONTEXT
		);
		return null;
	}
}

/**
 * Encode multiple image file paths into SDK image content blocks.
 *
 * Skips individual failures gracefully — a single bad image does not
 * prevent the rest from being encoded. Returns only successfully
 * encoded blocks.
 */
export async function encodeImageFiles(filePaths: string[]): Promise<SDKUserContentBlock[]> {
	const results = await Promise.all(filePaths.map((fp) => encodeImageFile(fp)));
	return results.filter((block): block is SDKUserContentBlock => block !== null);
}
