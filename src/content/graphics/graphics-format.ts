import { readAssetId, type AssetId } from '../asset-id.ts';
import { ContentContractError, fail } from '../contract-validation.ts';
import { exclusiveBytes, isDetached } from '../ownership.ts';

/** Schema version of the palette, image and font payloads; a layout or meaning change needs a new version. */
export const GRAPHICS_SCHEMA_VERSION = 1;

/**
 * Structural limits shared by the payload readers and the original-data converters. Palette entries, the font cell
 * width, the glyph count and the character map size are format rules; the image size and font height are approved
 * safety caps (see the source structure guide).
 */
export const GRAPHICS_LIMITS = Object.freeze({
  imageWidth: 640,
  imageHeight: 480,
  paletteEntryCount: 256,
  fontCellWidth: 8,
  fontHeight: 8,
  glyphCount: 256,
  charMapEntries: 256,
});

export function invalid(path: string, reason: string): never {
  fail('invalid-graphics-payload', path, reason);
}

export function requireInteger(value: unknown, minimum: number, maximum: number, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) {
    invalid(path, `must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

/** Checks encoder input bytes: an attached Uint8Array, of exactly `length` bytes when given. */
export function requireBytes(value: unknown, path: string, length?: number): Uint8Array {
  if (!(value instanceof Uint8Array)) invalid(path, 'must be a Uint8Array');
  if (isDetached(value.buffer)) fail('payload-detached', path, 'was transferred away and can no longer be used');
  if (length !== undefined && value.length !== length) invalid(path, `must be ${length} bytes`);
  return value;
}

/** Checks the schema and returns a view of exactly the payload bytes. */
export function payloadView(bytes: unknown, schemaVersion: unknown, path: string): DataView {
  if (schemaVersion !== GRAPHICS_SCHEMA_VERSION) fail('unsupported-payload-schema', `${path}.schemaVersion`, 'must be graphics payload schema 1');
  const { buffer, byteOffset, byteLength } = requireBytes(bytes, path);
  return new DataView(buffer, byteOffset, byteLength);
}

/** Rejects truncated or trailing bytes; `length` comes from header fields that are already range-checked. */
export function requireLength(view: DataView, length: number, path: string): void {
  if (view.byteLength < length) invalid(path, 'is truncated');
  if (view.byteLength > length) invalid(path, 'has trailing bytes');
}

/** A view of `length` payload bytes at `offset`, sharing the caller's memory. */
export const bytesAt = (view: DataView, offset: number, length: number): Uint8Array =>
  new Uint8Array(view.buffer, view.byteOffset + offset, length);

/** An exclusive copy of `length` payload bytes at `offset`. */
export const copyBytes = (view: DataView, offset: number, length: number): Uint8Array => exclusiveBytes(bytesAt(view, offset, length));

/** A palette Asset ID: valid Asset ID syntax whose kind segment is `palette`. */
export function readPaletteReference(value: unknown, path: string): AssetId {
  try {
    const id = readAssetId(value, path);
    if (id.startsWith('palette/')) return id;
  } catch (error) {
    if (!(error instanceof ContentContractError)) throw error;
  }
  invalid(path, 'must be a palette Asset ID');
}

/** The pure program has no TextEncoder; Asset IDs are ASCII by construction. */
export const asciiBytes = (text: string): Uint8Array => Uint8Array.from(text, character => character.charCodeAt(0));

export const asciiText = (bytes: Uint8Array): string => String.fromCharCode(...bytes);
