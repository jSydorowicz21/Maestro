/**
 * Tests for claude-image-encoding.ts
 *
 * Covers:
 * - Valid PNG encoding
 * - Valid JPEG encoding (.jpg and .jpeg)
 * - Valid GIF encoding
 * - Valid WebP encoding
 * - Unsupported format (warns + returns null)
 * - Missing file (warns + returns null)
 * - Oversized file (warns + returns null)
 * - Empty image list (returns empty array)
 * - Mixed valid/invalid batch encoding
 * - MIME type detection helper
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { encodeImageFile, encodeImageFiles, detectMimeType, getSupportedExtensions, MAX_IMAGE_SIZE_BYTES } from '../claude-image-encoding';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Mock the logger
vi.mock('../../utils/logger', () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

// Import logger after mock so we can assert on calls
import { logger } from '../../utils/logger';

// ============================================================================
// Test Fixtures
// ============================================================================

let tmpDir: string;

beforeEach(async () => {
	tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-img-test-'));
});

afterEach(async () => {
	await fs.rm(tmpDir, { recursive: true, force: true });
	vi.clearAllMocks();
});

/** Create a small test image file with given extension and content */
async function createTestImage(name: string, content?: Buffer): Promise<string> {
	const filePath = path.join(tmpDir, name);
	await fs.writeFile(filePath, content ?? Buffer.from('fake-image-data'));
	return filePath;
}

// ============================================================================
// detectMimeType
// ============================================================================

describe('detectMimeType', () => {
	it('returns image/png for .png', () => {
		expect(detectMimeType('/path/to/image.png')).toBe('image/png');
	});

	it('returns image/jpeg for .jpg', () => {
		expect(detectMimeType('/path/to/photo.jpg')).toBe('image/jpeg');
	});

	it('returns image/jpeg for .jpeg', () => {
		expect(detectMimeType('/path/to/photo.jpeg')).toBe('image/jpeg');
	});

	it('returns image/gif for .gif', () => {
		expect(detectMimeType('/path/to/anim.gif')).toBe('image/gif');
	});

	it('returns image/webp for .webp', () => {
		expect(detectMimeType('/path/to/modern.webp')).toBe('image/webp');
	});

	it('returns undefined for unsupported extension', () => {
		expect(detectMimeType('/path/to/file.bmp')).toBeUndefined();
		expect(detectMimeType('/path/to/file.svg')).toBeUndefined();
		expect(detectMimeType('/path/to/file.tiff')).toBeUndefined();
	});

	it('is case-insensitive', () => {
		expect(detectMimeType('/path/to/image.PNG')).toBe('image/png');
		expect(detectMimeType('/path/to/image.JPG')).toBe('image/jpeg');
		expect(detectMimeType('/path/to/image.WEBP')).toBe('image/webp');
	});

	it('returns undefined for files with no extension', () => {
		expect(detectMimeType('/path/to/noext')).toBeUndefined();
	});
});

// ============================================================================
// getSupportedExtensions
// ============================================================================

describe('getSupportedExtensions', () => {
	it('includes all supported formats', () => {
		const exts = getSupportedExtensions();
		expect(exts).toContain('.png');
		expect(exts).toContain('.jpg');
		expect(exts).toContain('.jpeg');
		expect(exts).toContain('.gif');
		expect(exts).toContain('.webp');
	});
});

// ============================================================================
// encodeImageFile
// ============================================================================

describe('encodeImageFile', () => {
	it('encodes a valid PNG file', async () => {
		const content = Buffer.from('png-pixel-data');
		const filePath = await createTestImage('test.png', content);

		const result = await encodeImageFile(filePath);

		expect(result).not.toBeNull();
		expect(result).toEqual({
			type: 'image',
			source: {
				type: 'base64',
				media_type: 'image/png',
				data: content.toString('base64'),
			},
		});
	});

	it('encodes a valid JPEG file (.jpg)', async () => {
		const content = Buffer.from('jpeg-pixel-data');
		const filePath = await createTestImage('photo.jpg', content);

		const result = await encodeImageFile(filePath);

		expect(result).not.toBeNull();
		expect(result!.type).toBe('image');
		expect((result as any).source.media_type).toBe('image/jpeg');
		expect((result as any).source.data).toBe(content.toString('base64'));
	});

	it('encodes a valid JPEG file (.jpeg)', async () => {
		const content = Buffer.from('jpeg-pixel-data');
		const filePath = await createTestImage('photo.jpeg', content);

		const result = await encodeImageFile(filePath);

		expect(result).not.toBeNull();
		expect((result as any).source.media_type).toBe('image/jpeg');
	});

	it('encodes a valid GIF file', async () => {
		const content = Buffer.from('gif-frame-data');
		const filePath = await createTestImage('anim.gif', content);

		const result = await encodeImageFile(filePath);

		expect(result).not.toBeNull();
		expect((result as any).source.media_type).toBe('image/gif');
		expect((result as any).source.data).toBe(content.toString('base64'));
	});

	it('encodes a valid WebP file', async () => {
		const content = Buffer.from('webp-image-data');
		const filePath = await createTestImage('modern.webp', content);

		const result = await encodeImageFile(filePath);

		expect(result).not.toBeNull();
		expect((result as any).source.media_type).toBe('image/webp');
		expect((result as any).source.data).toBe(content.toString('base64'));
	});

	it('returns null and warns for unsupported format', async () => {
		const filePath = await createTestImage('icon.bmp');

		const result = await encodeImageFile(filePath);

		expect(result).toBeNull();
		expect(logger.warn).toHaveBeenCalledWith(
			expect.stringContaining('Unsupported image format'),
			expect.any(String)
		);
	});

	it('returns null and warns for missing file', async () => {
		const filePath = path.join(tmpDir, 'does-not-exist.png');

		const result = await encodeImageFile(filePath);

		expect(result).toBeNull();
		expect(logger.warn).toHaveBeenCalledWith(
			expect.stringContaining('Cannot stat image file'),
			expect.any(String)
		);
	});

	it('returns null and warns for oversized file', async () => {
		// Use a tiny maxSizeBytes to trigger the size check without
		// writing a 20MB+ file in a unit test.
		const content = Buffer.from('this-is-bigger-than-5-bytes');
		const filePath = await createTestImage('huge.png', content);

		const result = await encodeImageFile(filePath, 5);

		expect(result).toBeNull();
		expect(logger.warn).toHaveBeenCalledWith(
			expect.stringContaining('Image file too large'),
			expect.any(String)
		);
	});

	it('uses 20MB default size limit', () => {
		expect(MAX_IMAGE_SIZE_BYTES).toBe(20 * 1024 * 1024);
	});

	it('returns correct base64 encoding', async () => {
		// Use known binary data
		const knownData = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
		const filePath = await createTestImage('binary.png', knownData);

		const result = await encodeImageFile(filePath);

		expect(result).not.toBeNull();
		expect((result as any).source.data).toBe(knownData.toString('base64'));
		// Verify round-trip
		const decoded = Buffer.from((result as any).source.data, 'base64');
		expect(decoded).toEqual(knownData);
	});
});

// ============================================================================
// encodeImageFiles (batch)
// ============================================================================

describe('encodeImageFiles', () => {
	it('returns empty array for empty input', async () => {
		const result = await encodeImageFiles([]);
		expect(result).toEqual([]);
	});

	it('encodes multiple valid images', async () => {
		const png = await createTestImage('a.png', Buffer.from('png'));
		const jpg = await createTestImage('b.jpg', Buffer.from('jpg'));

		const result = await encodeImageFiles([png, jpg]);

		expect(result).toHaveLength(2);
		expect((result[0] as any).source.media_type).toBe('image/png');
		expect((result[1] as any).source.media_type).toBe('image/jpeg');
	});

	it('skips invalid files and returns valid ones', async () => {
		const validPng = await createTestImage('good.png', Buffer.from('valid'));
		const unsupported = await createTestImage('bad.bmp', Buffer.from('nope'));
		const missingFile = path.join(tmpDir, 'gone.png');

		const result = await encodeImageFiles([validPng, unsupported, missingFile]);

		expect(result).toHaveLength(1);
		expect((result[0] as any).source.media_type).toBe('image/png');
	});
});
