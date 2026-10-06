import { expect } from 'vitest';
import type { SourceLimit } from '../source-error.ts';
import { ByteWriter, imageRecord } from '../synthetic.ts';

// Code-generated original-format blocks and graphics declarations for conversion tests; never original data.

/** Asserts that `action` throws a SourceError with exactly this code, location and limit. */
export const expectSourceError = (action: () => unknown, code: string, location: string, limit: SourceLimit | null = null): void => {
  expect(action).toThrowError(expect.objectContaining({ name: 'SourceError', code, location, limit }));
};

type RecordFields = Partial<Parameters<typeof imageRecord>[1]> & { width: number; height: number; size: number };

/** A whole-entry image record (raw, no palette, data at offset 36 by default) followed by `tail`. */
export function recordBlock(fields: RecordFields, ...tail: readonly (readonly number[])[]): Uint8Array {
  const writer = imageRecord(new ByteWriter(), { encoding: 0, paletteOffset: 0, paletteCount: 0, pixelOffset: 36, ...fields });
  for (const bytes of tail) writer.raw(bytes);
  return writer.toBytes();
}

/** A raw image record whose embedded BGR palette, if any, precedes its row-major indices. */
export function rawImageBlock(width: number, height: number, indices: readonly number[], bgr: readonly number[] = []): Uint8Array {
  const paletteCount = bgr.length / 3;
  return recordBlock({ width, height, paletteOffset: paletteCount ? 36 : 0, paletteCount, pixelOffset: 36 + bgr.length, size: indices.length }, bgr, indices);
}

/** A sprite RLE image record from its little-endian run bytes. */
export const spriteImageBlock = (width: number, height: number, runs: readonly number[]): Uint8Array =>
  recordBlock({ encoding: 2, width, height, size: runs.length }, runs);

/** A DATA entry: 256 RGB triples of 6-bit components, by default distinct per entry. */
export const dataPaletteBlock = (component: (index: number) => number = index => (index * 7) % 64): Uint8Array =>
  Uint8Array.from({ length: 768 }, (_, index) => component(index));

/** A bitmap font table with every glyph row different; bits beyond a narrow cell are set in some rows. */
export function fontTable(width: number, height: number, length = 4 + 256 * height): Uint8Array {
  const table = Uint8Array.from({ length }, (_, index) => (index * 29 + 7) & 0xff);
  table.set([0, 1, width, height]);
  return table;
}

/** A CCKD-shaped block: a {pointer, count} header, a directory of {offset, size} and the tables. */
export function cockpitBlock(tables: readonly Uint8Array[], count = tables.length): Uint8Array {
  const writer = new ByteWriter().u32(8, count);
  let offset = 8 + tables.length * 8;
  for (const table of tables) {
    writer.u32(offset, table.length);
    offset += table.length;
  }
  for (const table of tables) writer.raw(table);
  return writer.toBytes();
}

/** The HUD font directory shape: two 8×8 fonts and one 4×6 font. */
export const hudFontTables = (): Uint8Array[] => [fontTable(8, 8), fontTable(8, 8), fontTable(4, 6)];

export const paletteDeclaration = (id: string, group = 'cockpit-hud-map'): Record<string, unknown> =>
  ({ asset: { id, kind: 'palette' }, role: 'flight-palette', group });

export const imageDeclaration = (id: string, palette: string, overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  asset: { id, kind: 'image' }, role: 'hud-mfd', group: 'cockpit-hud-map', palette, display: 'direct', alpha: 'encoding', rowOrder: 'stored',
  ...overrides,
});

export const fontDeclaration = (id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  asset: { id, kind: 'font' }, role: 'font', group: 'cockpit-hud-map', cell: { width: 8, height: 8 }, charMap: [], ...overrides,
});
