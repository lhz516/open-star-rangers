import { expect } from 'vitest';
import { BUDGET_DIMENSIONS, type BudgetRecord } from '../../content/budget.ts';
import type { ModelGeometry } from '../../content/models/model-payload.ts';
import { kindOf } from '../../content/synthetic-content.test-support.ts';
import { openDiscImage } from '../disc/disc-image.ts';
import { syntheticFileDisc, type SyntheticFileContent } from '../disc/disc.test-support.ts';
import { animFrame, syntheticAnimation, type SyntheticFrame } from '../formats/anim.test-support.ts';
import type { SyntheticBlock } from '../formats/formats.test-support.ts';
import type { SourceLimit } from '../source-error.ts';
import { identifySource, type VerifiedSource } from '../source/identify-source.ts';
import { catalogFor } from '../source/source.test-support.ts';
import { buildImfat, ByteWriter, imageRecord, syntheticMesh, type SyntheticEntry } from '../synthetic.test-support.ts';

// Code-generated original-format blocks and graphics declarations for conversion tests; never original data.

// The closed P2-05 location grammar (docs/plan/p2/05/spec.md, error codes), written from the spec as an oracle: the
// declaration set, a declaration's field path, or a field of a canonical Asset. P2-07 adds the CCKD container fields,
// and its 2026-10-08 revision the SNIP frame and DIAG fields and their regions; P3-03 the HUD text's region parts.
const GRAPHICS_LOCATION = new RegExp(`^graphics(?:${[
  String.raw`\.declarations(?:\[\d+\](?:\.[A-Za-z]+(?:\[\d+\])?)*)?`,
  String.raw`\[[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)+\]\.(?:record|palette|pixels|mask|glyphs|charMap|fonts|display|alpha|rowOrder|groups|frames|colours|messages|format|elements(?:\[\d+\](?:\.[xy])?)?|regions)`,
].join('|')})$`);

/** Whether a conversion diagnostic location belongs to the P2-05 grammar. */
export const inGraphicsLocationGrammar = (location: string): boolean => GRAPHICS_LOCATION.test(location);

// The closed P2-06 model location grammar (docs/plan/p2/06/spec.md, error codes), written from the spec as an oracle:
// the declaration set or a declaration's field path, or a model Asset followed by its MODL, a part, a part's mesh or
// texture, or a sound slot. No entry IDs or offsets can appear.
const MODEL_LOCATION = new RegExp(`^models(?:${[
  String.raw`\.declarations(?:\[\d+\](?:\.[A-Za-z]+(?:\[\d+\])?)*)?`,
  String.raw`\[[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)+\](?:\.model|\.parts\[\d+\]\[\d+\](?:\.mesh|\.texture)?|\.sounds\[\d+\])`,
].join('|')})$`);

/** Whether a conversion diagnostic location belongs to the P2-06 model grammar. */
const inModelLocationGrammar = (location: string): boolean => MODEL_LOCATION.test(location);

// The P2-06 effect location grammar (spec, effect geometry data and error codes), written from the spec as an oracle:
// the declaration set or a declaration's field path, or an effect Asset alone or followed by its source, a region, a
// record or a template. No entry IDs or offsets can appear.
const EFFECT_LOCATION = new RegExp(`^effects(?:${[
  String.raw`\.declarations(?:\[\d+\](?:\.[A-Za-z]+(?:\[\d+\])?)*)?`,
  String.raw`\[[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)+\](?:\.source|\.(?:regions|records|templates)\[\d+\])?`,
].join('|')})$`);

/** Whether a conversion diagnostic location belongs to the P2-06 effect grammar. */
export const inEffectLocationGrammar = (location: string): boolean => EFFECT_LOCATION.test(location);

// What a P2-06 diagnostic reason must never name (spec S-08, AC-16): a file name, a path, a hexadecimal value, or an
// entry number, offset or byte value.
const PRIVATE_REASON_DETAIL = /\b\w+\.[a-z]\w{0,2}\b|[/\\]|\b0x[0-9a-f]|\b(?:entry|entries|offsets?|bytes?)\b\W{0,3}(?:id\b\W{0,3})?\d/i;

/** Whether a diagnostic reason names a file, path, offset, entry number or byte value. */
export const namesPrivateDetail = (reason: string): boolean => PRIVATE_REASON_DETAIL.test(reason);

/**
 * Asserts that `action` throws a SourceError with exactly this code, location and limit, and a reason the Worker
 * boundary can carry (1 to 512 printable ASCII characters), equal to `reason` when given; `graphics…`, `models…` and
 * `effects…` locations must be in their grammars, and `models…` and `effects…` reasons must name no file, path, offset
 * or entry number.
 */
export const expectSourceError = (action: () => unknown, code: string, location: string, limit: SourceLimit | null = null, reason?: string): void => {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toEqual(expect.objectContaining({ name: 'SourceError', code, location, limit }));
  const { reason: actual } = thrown as { reason: string };
  expect(actual).toMatch(/^[ -~]{1,512}$/);
  if (reason !== undefined) expect(actual).toBe(reason);
  const models = location.startsWith('models');
  const effects = location.startsWith('effects');
  if (location.startsWith('graphics')) expect(inGraphicsLocationGrammar(location), location).toBe(true);
  if (models) expect(inModelLocationGrammar(location), location).toBe(true);
  if (effects) expect(inEffectLocationGrammar(location), location).toBe(true);
  if (models || effects) expect(namesPrivateDetail(actual), actual).toBe(false);
};

/** A complete budget record allowing the most of every dimension, for tests whose subject is not the budget. */
export const UNLIMITED_BUDGET: BudgetRecord = Object.freeze(Object.fromEntries(BUDGET_DIMENSIONS.map(dimension => [dimension, Number.MAX_SAFE_INTEGER])) as BudgetRecord);

/** `source` with every MESH entry read replaced by `read`, such as a failure at the disc layer. */
export function withMeshReads(source: VerifiedSource, read: () => Promise<never>): VerifiedSource {
  return {
    identity: source.identity,
    openFile: path => source.openFile(path),
    usage: () => source.usage(),
    openArchive: async path => {
      const handle = await source.openArchive(path);
      return {
        path: handle.path, entries: handle.entries, entry: (id, type) => handle.entry(id, type),
        read: (id, type) => (type === 'MESH' ? read() : handle.read(id, type)),
      };
    },
  };
}

/** A MESH data block holding `geometry` exactly: its floats bit for bit, triangles in order and their corner slots. */
export const meshBlockFor = ({ positions, uvs, normals, indices, cornerShading, shadingSlotCount }: ModelGeometry): Uint8Array => syntheticMesh({
  positions, uvs, normals, shadingSlotCount,
  faces: Array.from({ length: indices.length / 3 }, (_, face) =>
    [0, 1, 2].map(corner => [indices[face * 3 + corner], cornerShading[face * 3 + corner]] as const)),
}).data;

/** A MESH data block of one triangle over three vertices with one shading slot. */
export const triangleMeshBlock = (): Uint8Array => syntheticMesh({
  positions: [0, 0, 0, 2, 0, 0, 0, 3, 0], uvs: [0, 0, 1, 0, 0, 1], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1], shadingSlotCount: 1, faces: [[[0, 0], [1, 0], [2, 0]]],
}).data;

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

/** A CCKD element for `cockpitLayoutBlock`: a whole-entry record block (see `recordBlock`), its position and flags. */
export interface SyntheticElement {
  readonly record: Uint8Array;
  readonly x: number;
  readonly y: number;
  /** The fields after the position; 0 and 0 unless a test needs other values. */
  readonly flags?: readonly [number, number];
}

/** The 36-byte header of a whole-entry record whose data, everything after the header, moves to block offset `dataAt`. */
function movedRecordHeader(record: Uint8Array, dataAt: number): Uint8Array {
  const header = record.slice(0, 36);
  const view = new DataView(header.buffer);
  const move = (field: number) => view.setUint32(field, view.getUint32(field, true) - 36 + dataAt, true);
  if (view.getUint32(24, true) > 0) move(20);
  move(28);
  return header;
}

/** Allocates consecutive block ranges from `start`. */
function blockLayout(start: number): (length: number) => number {
  let end = start;
  return length => {
    const at = end;
    end += length;
    return at;
  };
}

/**
 * A CCKD entry (cockpit §1): the font directory pointer at 0x00 and the group directory pointer at 0x08, the font
 * directory, one 32-byte directory record per slot, the 52-byte element arrays, the font tables, the slot palettes and
 * then each element record's data under block-relative pointers. A slot with a palette (768 DATA-format bytes) points
 * to it at +0x04 with its length at +0x08; both are 0 otherwise. The unexplained directory fields are nonzero filler,
 * and an empty slot's element pointer lies past the block because it addresses nothing.
 */
export function cockpitLayoutBlock(
  groups: readonly (readonly SyntheticElement[])[],
  fonts: readonly Uint8Array[] = hudFontTables(),
  palettes: readonly (Uint8Array | null)[] = [],
): Uint8Array {
  const directory = 16 + fonts.length * 8;
  const take = blockLayout(directory + groups.length * 32);
  const arrays = groups.map(elements => take(elements.length * 52));
  const tables = fonts.map(table => take(table.length));
  const paletteAt = groups.map((_, slot) => (palettes[slot] ? take(palettes[slot].length) : 0));
  const data = groups.map(elements => elements.map(({ record }) => take(record.length - 36)));
  const writer = new ByteWriter().u32(16, fonts.length, directory, groups.length);
  fonts.forEach((table, index) => writer.u32(tables[index], table.length));
  groups.forEach((elements, slot) => {
    writer.u32(0xa5a5_a5a5, paletteAt[slot], palettes[slot]?.length ?? 0, 0xffff_ffff, elements.length ? arrays[slot] : 0xffff_fff0, elements.length, 0xc3c3_c3c3, 7);
  });
  groups.forEach((elements, slot) => elements.forEach(({ record, x, y, flags = [0, 0] }, index) => {
    writer.raw(movedRecordHeader(record, data[slot][index])).u32(x, y, ...flags);
  }));
  fonts.forEach(table => writer.raw(table));
  palettes.forEach(palette => palette && writer.raw(palette));
  groups.forEach(elements => elements.forEach(({ record }) => writer.raw(record.subarray(36))));
  return writer.toBytes();
}

/** A TABL image list (hud §2): the records packed from offset 0, then each record's data in record order. */
export function tableBlock(records: readonly Uint8Array[]): Uint8Array {
  const take = blockLayout(records.length * 36);
  const data = records.map(record => take(record.length - 36));
  const writer = new ByteWriter();
  records.forEach((record, index) => writer.raw(movedRecordHeader(record, data[index])));
  records.forEach(record => writer.raw(record.subarray(36)));
  return writer.toBytes();
}

/** An MFDD entry (cockpit §2): the {pointer, count} of lists 0 and 1, both record arrays, then each record's data. */
export function mfdBlock(lists: readonly [readonly Uint8Array[], readonly Uint8Array[]]): Uint8Array {
  const take = blockLayout(16);
  const arrays = lists.map(records => take(records.length * 36));
  const data = lists.map(records => records.map(record => take(record.length - 36)));
  const writer = new ByteWriter();
  lists.forEach((records, list) => writer.u32(arrays[list], records.length));
  lists.forEach((records, list) => records.forEach((record, index) => writer.raw(movedRecordHeader(record, data[list][index]))));
  lists.forEach(records => records.forEach(record => writer.raw(record.subarray(36))));
  return writer.toBytes();
}

export const paletteDeclaration = (id: string, group = 'cockpit-hud-map'): Record<string, unknown> =>
  ({ asset: { id, kind: 'palette' }, role: 'flight-palette', group });

export const imageDeclaration = (id: string, palette: string, overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  asset: { id, kind: 'image' }, role: 'hud-mfd', group: 'cockpit-hud-map', palette, display: 'direct', alpha: 'encoding', rowOrder: 'stored',
  ...overrides,
});

export const fontDeclaration = (id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  asset: { id, kind: 'font' }, role: 'font', group: 'cockpit-hud-map', cell: { width: 8, height: 8 }, glyphRows: 8, charMap: [], ...overrides,
});

export const GRAPHICS_ARCHIVE = 'MAIN/SR.NOB';
export const GRAPHICS_ENTRIES = Object.freeze({ data: 10_001, texture: 10_003, cockpit: 10_005, mfd: 10_009, table: 10_011, labels: 10_013 });

/** A 4×2 raw texture with distinct indices and an 8-colour embedded BGR palette. */
export const textureBlock = (): Uint8Array =>
  rawImageBlock(4, 2, [0, 1, 2, 3, 4, 5, 6, 7], Array.from({ length: 24 }, (_, index) => (index * 9) & 0xff));

/**
 * An archive with one DATA, one TEX and one CCKD entry, any of which a test may replace, and MFDD, TABL image list and
 * TABL view label entries when given.
 */
export function graphicsArchive(
  blocks: { data?: Uint8Array; texture?: Uint8Array; cockpit?: Uint8Array; mfd?: Uint8Array; table?: Uint8Array; labels?: SyntheticBlock } = {},
): Uint8Array {
  return buildImfat(10_000, [
    { id: GRAPHICS_ENTRIES.data, type: 'DATA', data: blocks.data ?? dataPaletteBlock() },
    { id: GRAPHICS_ENTRIES.texture, type: 'TEX', data: blocks.texture ?? textureBlock() },
    { id: GRAPHICS_ENTRIES.cockpit, type: 'CCKD', data: blocks.cockpit ?? cockpitBlock(hudFontTables()) },
    ...(blocks.mfd ? [{ id: GRAPHICS_ENTRIES.mfd, type: 'MFDD', data: blocks.mfd }] : []),
    ...(blocks.table ? [{ id: GRAPHICS_ENTRIES.table, type: 'TABL', data: blocks.table }] : []),
    ...(blocks.labels ? [blockEntry(GRAPHICS_ENTRIES.labels, 'TABL', blocks.labels)] : []),
  ]);
}

/** The archive entry `id` of type `type` holding a synthetic block and its relocations. */
export const blockEntry = (id: number, type: string, { bytes, relocations }: SyntheticBlock): SyntheticEntry => ({ id, type, data: bytes, relocations: [...relocations] });

/** An ANIM entry (textures §6) of `frames` in display order, each encoded by the documented encoding-1 rule. */
export const animEntry = (id: number, frames: readonly SyntheticFrame[]): SyntheticEntry => blockEntry(id, 'ANIM', syntheticAnimation(frames.map(animFrame)));

/**
 * A TABL view label entry (hud, TABL 10399): one relocated u32 pointer per label in label order, then each label's bytes
 * (character codes 1–255) and its NUL.
 */
export function viewLabelBlock(labels: readonly string[]): SyntheticBlock {
  const writer = new ByteWriter();
  let offset = labels.length * 4;
  for (const label of labels) {
    writer.u32(offset);
    offset += label.length + 1;
  }
  for (const label of labels) writer.raw(Array.from(label, character => character.charCodeAt(0))).u8(0);
  return { bytes: writer.toBytes(), relocations: labels.map((_, index) => index * 4) };
}

/** Thirteen made-up view labels with `label` at sub-mode 8; every other label differs from it and from each other. */
export const viewLabelTable = (label: string): SyntheticBlock =>
  viewLabelBlock(Array.from({ length: 13 }, (_, index) => (index === 8 ? label : `v${index}${'-'.repeat(index)}`)));

export const layoutDeclaration = (id: string, elements: readonly string[], overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  asset: { id, kind: 'layout' }, role: 'front-cockpit', group: 'cockpit-hud-map', frame: { width: 640, height: 480 }, elements, ...overrides,
});

/** A declared single-locator mapping in the graphics archive. */
export function graphicsMapping(id: string, type: string, entry: number, subresource: string | null = null): Record<string, unknown> {
  return {
    asset: { id, kind: kindOf(id) },
    parts: [{ alternatives: [{ discPath: GRAPHICS_ARCHIVE, entry: { id: entry, type }, subresource }] }],
    confidence: 'confirmed',
    unknowns: [],
    evidence: ['docs/original/formats/textures.md'],
    resolution: 'declared',
  };
}

/**
 * A verified source over a synthetic disc holding `files`, which its catalog covers, with a count of archive entry
 * reads by entry ID. Uncovered padding raises the default read budget, which equals the input size, above rereads.
 */
export async function countedVerifiedSource(files: Readonly<Record<string, SyntheticFileContent>>): Promise<{ source: VerifiedSource; reads: Map<number, number> }> {
  // Raises the read budget, the input size, above reads of many small entries such as the 498 of the COMMFACE plan.
  const padding = { byteLength: 2 << 20, read: (_: number, length: number) => new Uint8Array(length) };
  const disc = syntheticFileDisc({ ...files, 'DEMO/PAD.DAT': padding });
  const source = await identifySource(await openDiscImage(disc.files), catalogFor(files));
  const reads = new Map<number, number>();
  const counted: VerifiedSource = {
    identity: source.identity,
    openFile: path => source.openFile(path),
    openArchive: async path => {
      const handle = await source.openArchive(path);
      return {
        path: handle.path,
        entries: handle.entries,
        entry: (id, type) => handle.entry(id, type),
        read: (id, type) => {
          reads.set(id, (reads.get(id) ?? 0) + 1);
          return handle.read(id, type);
        },
      };
    },
    usage: () => source.usage(),
  };
  return { source: counted, reads };
}

