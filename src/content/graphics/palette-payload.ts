import { GRAPHICS_LIMITS, copyBytes, invalid, payloadView, requireBytes, requireInteger, requireLength } from './graphics-format.ts';

// Palette payload schema 1, little-endian:
//   0  u16  entry count, 1–256
//   2  entry count × (R, G, B), 8 bits each

export interface PalettePayload {
  readonly kind: 'palette';
  /** One 8-bit (R, G, B) triple per entry, 1–256 entries, with no transparency. */
  readonly entries: Uint8Array;
}

const HEADER_BYTES = 2;

const entryCount = (value: unknown, path: string): number => requireInteger(value, 1, GRAPHICS_LIMITS.paletteEntryCount, path);

/** Encodes a palette into a new buffer that the result owns entirely. */
export function encodePalettePayload(palette: Omit<PalettePayload, 'kind'>, path = 'palette'): Uint8Array<ArrayBuffer> {
  const entries = requireBytes(palette.entries, `${path}.entries`);
  const count = entryCount(entries.length / 3, `${path}.entries`);
  const bytes = new Uint8Array(HEADER_BYTES + entries.length);
  new DataView(bytes.buffer).setUint16(0, count, true);
  bytes.set(entries, HEADER_BYTES);
  return bytes;
}

/** Strictly reads a palette payload into frozen data whose entries are the caller's own copy. */
export function readPalettePayload(bytes: unknown, schemaVersion: unknown, path = 'payload'): PalettePayload {
  const view = payloadView(bytes, schemaVersion, path);
  if (view.byteLength < HEADER_BYTES) invalid(path, 'is truncated');
  const count = entryCount(view.getUint16(0, true), `${path}.entryCount`);
  requireLength(view, HEADER_BYTES + count * 3, path);
  return Object.freeze({ kind: 'palette', entries: copyBytes(view, HEADER_BYTES, count * 3) });
}
