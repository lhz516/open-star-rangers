import {
  CRAFT_INFO_COUNTS, CRAFT_INFO_LIMITS, type Box, type BodyCollisionShape, type CraftCollisionShape, type CraftInfo,
  type CraftRecord, type F32x3, type F32x6, type GunRecord, type Int32x4, type MissileBodyRecord, type MissileRecord, type Mount,
  type Pair,
} from '../../content/rule-data/craft-info.ts';
import type { ByteString } from '../../content/rule-data/rule-data-fields.ts';
import { CLASSIC_P2_SLICE, type SliceCandidate } from '../../content/slice-definition.ts';
import type { ArchiveEntryRead } from '../archive/archive-reader.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import { SourceError } from '../source-error.ts';
import { PayloadBlock } from './payload-block.ts';

// Directed parsing of CRAFT.NOB TABL 4003 and CINF (docs/original/formats/craft.md §2–3) under the P3-03 field handling
// (spec, 字段处理规则): values keep their stored types, pointers become positions in the content, and the positions the
// load code `0x2cf38` overwrites are neither converted nor checked (craft.md §3.8). Its rewrite of each record's first word
// with the record's index is carried by the record's position. Untyped bytes that are zero in every baseline instance must
// be zero, and no two structures may share bytes. The shared field readers also serve DEBRIS TABL 4501 (debris.ts).

/** TABL 4003 (craft.md §2): 18 rows (SCCT slots) of 3 pairs (group columns). The fixed size is a format rule. */
export const CRAFT_TABLE_FORMAT = Object.freeze({ rows: 18, pairs: 3, entryBytes: 18 * 3 * 8 });

/** Entry limit of a CINF block: twice the 18,619 bytes of CINF 4037 (craft.md §3.9), rounded up to a power of two. */
export const CRAFT_INFO_ENTRY_BYTES = 65_536;

const TABLE_PAIR_BYTES = 8;
const HEADER_BYTES = 0x20;
const GUN_BYTES = 48;
const MISSILE_BYTES = 104;
/** Craft records and missile body records share the 236-byte layout (craft.md §3.5). */
const CRAFT_BYTES = 236;
const MOUNT_BYTES = 56;
const BOX_BYTES = 24;
const PAIR_BYTES = 8;
const MOUNT_LIST_ENTRY_BYTES = 4;
const NO_POINTERS: ReadonlySet<number> = new Set();
/** Record offsets of pointer fields; a relocation anywhere else is not part of the format. */
const GUN_POINTERS: ReadonlySet<number> = new Set([0x04]);
const MISSILE_POINTERS: ReadonlySet<number> = new Set([0x04, 0x14]);
const CRAFT_POINTERS: ReadonlySet<number> = new Set([0x00, 0x04, 0x30, 0x94, 0xcc, 0xd4, 0xdc, 0xe4]);
const MOUNT_POINTERS: ReadonlySet<number> = new Set([0x14, 0x18, 0x1c]);
/** Craft record offsets of the three mount lists. */
const MOUNT_LISTS = [0xcc, 0xd4, 0xdc] as const;
/** A missile body record's text and {pointer, count} positions, with their content paths; all must be zero (craft.md §3.5). */
const BODY_TEXTS = [[0x00, 'at00'], [0x04, 'name']] as const;
const BODY_ARRAYS = [[0x30, 'collision/boxes'], [0x94, 'pairs'], ...MOUNT_LISTS.map((at, list) => [at, `mountLists[${list}]`] as const), [0xe4, 'mounts']] as const;

/** The selected TABL 4003 pair. */
export interface CraftTablePair {
  /** Pair +0x00 u32: the CINF entry ID, which the converter checks against the mapped CINF part (not carried). */
  readonly craftInfoEntryId: number;
  /** Pair +0x04 f32: `CraftInfo.hitDamageScale`. */
  readonly hitDamageScale: number;
}

/** An array of `count` items starting at block offset `start`. */
export interface Span {
  readonly start: number;
  readonly count: number;
}

/** A finite `f32`. Canonical content cannot spell -0 (P3-03 08), so a stored -0.0 is unsupported. */
export function readF32(block: PayloadBlock, at: number, path: string): number {
  const value = block.f32(at, path);
  if (value === 0 && block.u32(at, path) !== 0) block.unsupported(path, 'the value is a negative zero');
  return value;
}

/**
 * A 32-bit integer whose traced uses do not depend on its sign (craft.md, integer types): converted only from 0 to 2³¹−1,
 * where its signed and unsigned readings agree.
 */
export function readInt32(block: PayloadBlock, at: number, path: string): number {
  const value = block.u32(at, path);
  if (value > 0x7fff_ffff) block.unsupported(path, 'the sign of the value is undetermined');
  return value;
}

const tuple = <T extends readonly number[]>(length: number, read: (index: number) => number): T =>
  Object.freeze(Array.from({ length }, (_, index) => read(index))) as unknown as T;

/** Readers of the fields of the structure at `base`; a field's path is `path/atXX` for its offset unless named. */
export class Fields {
  readonly #block: PayloadBlock;
  readonly #base: number;
  readonly #path: string;

  constructor(block: PayloadBlock, base: number, path: string) {
    this.#block = block;
    this.#base = base;
    this.#path = path;
  }

  /** The path of the field at `offset`: `atXX`, as the content names neutral fields. */
  at(offset: number): string {
    return `${this.#path}/at${offset.toString(16).toUpperCase().padStart(2, '0')}`;
  }

  i32(offset: number): number {
    return this.#block.i32(this.#base + offset, this.at(offset));
  }

  u32(offset: number): number {
    return this.#block.u32(this.#base + offset, this.at(offset));
  }

  int32(offset: number): number {
    return readInt32(this.#block, this.#base + offset, this.at(offset));
  }

  f32(offset: number): number {
    return readF32(this.#block, this.#base + offset, this.at(offset));
  }

  f32s<T extends readonly number[]>(offset: number, length: T['length'], path = this.at(offset)): T {
    return tuple<T>(length, index => readF32(this.#block, this.#base + offset + index * 4, path));
  }

  int32s<T extends readonly number[]>(offset: number, length: T['length']): T {
    return tuple<T>(length, index => readInt32(this.#block, this.#base + offset + index * 4, this.at(offset)));
  }

  /** A u8 in the low byte of its word; the three bytes after it have no type and are zero in every baseline instance. */
  u8(offset: number): number {
    const word = this.#block.u32(this.#base + offset, this.at(offset));
    if (word > 0xff) this.#block.unsupported(this.at(offset + 1), 'an untyped byte is not zero');
    return word;
  }
}

/**
 * The byte ranges the structures of one block own: its header, arrays and texts. The load code writes into records in place
 * (craft.md §3.8, §4.4), so bytes two structures share would not keep the values converted for either. The baseline graphs
 * cover every byte once (§3.1, §4.2), so sharing is unsupported. A pointer that names an item of an array owns nothing.
 */
export class OwnedBytes {
  readonly block: PayloadBlock;
  readonly #ranges: { readonly start: number; readonly end: number }[] = [];

  constructor(block: PayloadBlock) {
    this.block = block;
  }

  claim(start: number, length: number, path: string): void {
    if (length === 0) return;
    const end = start + length;
    if (this.#ranges.some(range => start < range.end && range.start < end)) this.block.unsupported(path, 'the structure shares bytes with another structure');
    this.#ranges.push({ start, end });
  }

  /**
   * The `{pointer, count}` array at `offset`, which the block's structures then own. The original compares the count as
   * signed, so bit 31 set is unsupported.
   */
  array(offset: number, itemBytes: number, limit: number, path: string, after = 0): Span {
    if (this.block.i32(offset + 4, path) < 0) this.block.unsupported(path, 'the count has bit 31 set');
    const span = this.block.array(offset, itemBytes, limit, path, after);
    this.claim(span.start, span.count * itemBytes, path);
    return span;
  }
}

/** The 24-byte boxes of the `{pointer, i32 count}` array at `offset` (craft.md §3.6), at most `limit`. */
export function readBoxes(owned: OwnedBytes, offset: number, limit: number, path: string): readonly Box[] {
  const { block } = owned;
  const boxes = owned.array(offset, BOX_BYTES, limit, path);
  return Object.freeze(Array.from({ length: boxes.count }, (_, index): Box => {
    const at = `${path}[${index}]`;
    const box = new Fields(block, boxes.start + index * BOX_BYTES, at);
    return Object.freeze({ lower: box.f32s<F32x3>(0, 3, `${at}/lower`), upper: box.f32s<F32x3>(12, 3, `${at}/upper`) });
  }));
}

/** The index of the `size`-byte item of `span` that starts at `target`; any other target is unsupported (field rule 4). */
function itemIndex(block: PayloadBlock, target: number, span: Span, size: number, path: string, item: string): number {
  const index = (target - span.start) / size;
  if (!Number.isInteger(index) || index < 0 || index >= span.count) block.unsupported(path, `the pointer is not the start of ${item}`);
  return index;
}

/** The item of `span` that the set pointer at `offset` names. */
const pointedItem = (block: PayloadBlock, offset: number, span: Span, size: number, path: string, item: string): number =>
  itemIndex(block, block.target(offset, size, path), span, size, path, item);

/** A CINF block being parsed: its reader, its bytes for texts and the ranges its structures own. */
interface Source {
  readonly block: PayloadBlock;
  readonly bytes: Uint8Array;
  readonly owned: OwnedBytes;
}

/**
 * The NUL-terminated text the pointer at `offset` names, as a byte string of at most `nameBytes` bytes kept as stored (text
 * rule 8); at most one byte past the limit is examined, and no relocation may overlap the text or its NUL.
 */
function readText({ block, bytes, owned }: Source, offset: number, path: string): ByteString {
  const start = block.target(offset, 1, path);
  const limit = CRAFT_INFO_LIMITS.nameBytes;
  const scanned = bytes.subarray(start, Math.min(bytes.length, start + limit + 1));
  const length = scanned.indexOf(0);
  if (length === -1) {
    if (scanned.length <= limit) block.invalid(path, 'the text has no terminating NUL');
    block.limit(path, 'textBytes', limit, scanned.length);
  }
  for (let at = start - 3; at <= start + length; at++) {
    if (block.isRelocated(at)) block.invalid(path, 'a relocation overlaps the text');
  }
  owned.claim(start, length + 1, path);
  return String.fromCharCode(...scanned.subarray(0, length));
}

/**
 * Parses TABL 4003 `read` of `archive` and selects the pair of `candidate`: row = campaign slot, column = campaign group
 * (craft.md §1, field rule 7). A slot or group outside the table is `subresource-mismatch`.
 */
export function parseCraftTable(archive: DiscPath, read: ArchiveEntryRead, candidate: SliceCandidate = CLASSIC_P2_SLICE.candidate): CraftTablePair {
  const { rows, pairs, entryBytes } = CRAFT_TABLE_FORMAT;
  const block = new PayloadBlock(archive, read, entryBytes);
  if (read.bytes.length !== entryBytes) block.invalid('/rows', 'the table is not 18 rows of 3 pairs');
  block.requireRelocations(0, entryBytes, NO_POINTERS, '/rows');
  const { campaignSlot: row, campaignGroup: pair } = candidate;
  const rowPath = `/rows[${row}]`;
  if (row >= rows) throw new SourceError('subresource-mismatch', block.at(rowPath), 'the campaign slot is not a table row');
  const path = `${rowPath}/pairs[${pair}]`;
  if (pair >= pairs) throw new SourceError('subresource-mismatch', block.at(path), 'the campaign group is not a table column');
  const at = (row * pairs + pair) * TABLE_PAIR_BYTES;
  return Object.freeze({
    craftInfoEntryId: block.u32(at, `${path}/craftInfo`),
    hitDamageScale: readF32(block, at + 4, `${path}/hitDamageScale`),
  });
}

/** Gun record, 48 bytes (craft.md §3.3); +0x00 (index), +0x0C and +0x10 are written at load. */
function readGun(source: Source, at: number, path: string): GunRecord {
  const { block } = source;
  block.requireRelocations(at, GUN_BYTES, GUN_POINTERS, path);
  const field = new Fields(block, at, path);
  return Object.freeze({
    name: readText(source, at + 0x04, `${path}/name`),
    at08: field.f32(0x08),
    at14: field.i32(0x14),
    at18: field.int32(0x18),
    at1C: field.int32(0x1c),
    at20: field.f32(0x20),
    at24: field.i32(0x24),
    at28: field.u8(0x28),
    at2C: field.i32(0x2c),
  });
}

/** Missile record, 104 bytes (craft.md §3.4); +0x00 (index), +0x08–+0x10, +0x2C and +0x50 are written at load. */
function readMissile(source: Source, at: number, path: string, bodies: Span): MissileRecord {
  const { block } = source;
  block.requireRelocations(at, MISSILE_BYTES, MISSILE_POINTERS, path);
  const field = new Fields(block, at, path);
  return Object.freeze({
    name: readText(source, at + 0x04, `${path}/name`),
    body: pointedItem(block, at + 0x14, bodies, CRAFT_BYTES, `${path}/body`, 'a missile body record'),
    at18: field.u8(0x18),
    at1C: field.int32(0x1c),
    at20: field.int32(0x20),
    at24: field.u8(0x24),
    at28: field.f32(0x28),
    at30: field.int32(0x30),
    at34: field.i32(0x34),
    at38: field.int32(0x38),
    at3C: field.int32(0x3c),
    at40: field.f32(0x40),
    at44: field.i32(0x44),
    at48: field.int32(0x48),
    at4C: field.f32(0x4c),
    at54: field.u32(0x54),
    at58: field.i32(0x58),
    at5C: field.i32(0x5c),
    at60: field.f32(0x60),
    at64: field.f32(0x64),
  });
}

/** Mount, 56 bytes (craft.md §3.6), of the craft whose mounts are `mounts`. */
function readMount(block: PayloadBlock, at: number, path: string, mounts: Span, guns: Span, missiles: Span): Mount {
  block.requireRelocations(at, MOUNT_BYTES, MOUNT_POINTERS, path);
  const field = new Fields(block, at, path);
  const at10 = field.u8(0x10);
  if (at10 !== 0 && at10 !== 1) block.unsupported(field.at(0x10), 'the weapon kind selects no record array');
  const weapon = at10 === 0
    ? pointedItem(block, at + 0x14, guns, GUN_BYTES, `${path}/weapon`, 'a gun record')
    : pointedItem(block, at + 0x14, missiles, MISSILE_BYTES, `${path}/weapon`, 'a missile record');
  // A zero link is the absence the code tests for (field rule 3).
  const link = (offset: number): number | null => {
    const target = block.pointer(at + offset, field.at(offset));
    if (target === null) return null;
    block.require(target, MOUNT_BYTES, field.at(offset));
    return itemIndex(block, target, mounts, MOUNT_BYTES, field.at(offset), 'a mount of the craft');
  };
  return Object.freeze({
    at00: field.f32s<F32x3>(0x00, 3),
    at0C: field.int32(0x0c),
    at10,
    weapon,
    at18: link(0x18),
    at1C: link(0x1c),
    at20: field.u32(0x20),
    at24: field.f32s<F32x3>(0x24, 3),
    at30: field.int32(0x30),
    at34: field.int32(0x34),
  });
}

/** The fields craft and missile body records share after the collision shape, up to the pair array (craft.md §3.5). */
const readValues = (field: Fields) => ({
  at54: field.i32(0x54),
  at58: field.int32(0x58),
  at5C: field.i32(0x5c),
  at60: field.i32(0x60),
  at64: field.int32s<Int32x4>(0x64, 4),
  at74: field.i32(0x74),
  at78: field.int32s<Int32x4>(0x78, 4),
  at88: field.i32(0x88),
  at8C: field.i32(0x8c),
  at90: field.i32(0x90),
});

/** The fields craft and missile body records share between the pair array and the mount lists. */
const readTail = (field: Fields) => ({
  at9C: field.i32(0x9c),
  atA0: field.f32(0xa0),
  atA4: field.int32(0xa4),
  atA8: field.i32(0xa8),
  atAC: field.f32(0xac),
  atB0: field.f32(0xb0),
  atB4: field.f32(0xb4),
  atB8: field.f32(0xb8),
  atBC: field.f32(0xbc),
  atC0: field.f32(0xc0),
  atC4: field.int32(0xc4),
  atC8: field.int32(0xc8),
});

/**
 * Craft record, 236 bytes (craft.md §3.5). The load code overwrites shape +0x04, and shape +0x00 and +0x08–+0x1C when
 * the shape has boxes (§3.8), so those are not converted.
 */
function readCraft(source: Source, at: number, path: string, guns: Span, missiles: Span): CraftRecord {
  const { block, owned } = source;
  block.requireRelocations(at, CRAFT_BYTES, CRAFT_POINTERS, path);
  const field = new Fields(block, at, path);
  const shapePath = `${path}/collision`;
  const shape = new Fields(block, at + 0x10, shapePath);
  const boxes = readBoxes(owned, at + 0x30, CRAFT_INFO_LIMITS.boxes, `${shapePath}/boxes`);
  const boxed = boxes.length > 0;
  const collision: CraftCollisionShape = Object.freeze({
    at00: boxed ? null : shape.f32(0x00),
    at08: boxed ? null : shape.f32s<F32x6>(0x08, 6),
    boxes,
    at28: shape.int32(0x28),
    at2C: shape.f32s<F32x6>(0x2c, 6),
  });
  const pairs = owned.array(at + 0x94, PAIR_BYTES, CRAFT_INFO_LIMITS.pairs, `${path}/pairs`);
  const mounts = owned.array(at + 0xe4, MOUNT_BYTES, CRAFT_INFO_LIMITS.mounts, `${path}/mounts`);
  const mountList = (list: number): readonly number[] => {
    const listPath = `${path}/mountLists[${list}]`;
    const entries = owned.array(at + MOUNT_LISTS[list], MOUNT_LIST_ENTRY_BYTES, CRAFT_INFO_LIMITS.mountListEntries, listPath);
    return Object.freeze(Array.from({ length: entries.count }, (_, entry) =>
      pointedItem(block, entries.start + entry * MOUNT_LIST_ENTRY_BYTES, mounts, MOUNT_BYTES, `${listPath}/entries[${entry}]`, 'a mount of the craft')));
  };
  return Object.freeze({
    at00: readText(source, at, `${path}/at00`),
    name: readText(source, at + 0x04, `${path}/name`),
    at08: field.f32(0x08),
    at0C: field.f32(0x0c),
    collision,
    ...readValues(field),
    pairs: Object.freeze(Array.from({ length: pairs.count }, (_, index): Pair => {
      const pair = new Fields(block, pairs.start + index * PAIR_BYTES, `${path}/pairs[${index}]`);
      return Object.freeze({ at00: pair.i32(0x00), at04: pair.int32(0x04) });
    })),
    ...readTail(field),
    mountLists: Object.freeze([mountList(0), mountList(1), mountList(2)] as const),
    mounts: Object.freeze(Array.from({ length: mounts.count }, (_, index) =>
      readMount(block, mounts.start + index * MOUNT_BYTES, `${path}/mounts[${index}]`, mounts, guns, missiles))),
  });
}

/**
 * Missile body record (craft.md §3.5): the craft layout and types, which no load code writes. A body has no target
 * structures, so its text, array and count positions must be zero.
 */
function readBody(block: PayloadBlock, at: number, path: string): MissileBodyRecord {
  block.requireRelocations(at, CRAFT_BYTES, CRAFT_POINTERS, path);
  for (const [offset, name] of BODY_TEXTS) block.unsupportedPointer(at + offset, 1, `${path}/${name}`, 'a missile body record has a text');
  for (const [offset, name] of BODY_ARRAYS) {
    block.unsupportedPointer(at + offset, 1, `${path}/${name}`, 'a missile body record has an array');
    if (block.u32(at + offset + 4, `${path}/${name}`) !== 0) block.unsupported(`${path}/${name}`, 'a missile body record has an array');
  }
  const field = new Fields(block, at, path);
  const shape = new Fields(block, at + 0x10, `${path}/collision`);
  const collision: BodyCollisionShape = Object.freeze({
    at00: shape.f32(0x00),
    at04: shape.f32(0x04),
    at08: shape.f32s<F32x6>(0x08, 6),
    at28: shape.int32(0x28),
    at2C: shape.f32s<F32x6>(0x2c, 6),
  });
  return Object.freeze({ at08: field.f32(0x08), at0C: field.f32(0x0c), collision, ...readValues(field), ...readTail(field) });
}

/**
 * Parses the CINF entry `read` of `archive` into `data/craft-info` content, with `hitDamageScale` from the selected TABL
 * 4003 pair. The craft records must be exactly one per kind bit.
 */
export function parseCraftInfo(archive: DiscPath, read: ArchiveEntryRead, hitDamageScale: number): CraftInfo {
  const block = new PayloadBlock(archive, read, CRAFT_INFO_ENTRY_BYTES);
  block.require(0, HEADER_BYTES, '/header');
  const owned = new OwnedBytes(block);
  owned.claim(0, HEADER_BYTES, '/header');
  const guns = owned.array(0x00, GUN_BYTES, CRAFT_INFO_LIMITS.guns, '/guns', HEADER_BYTES);
  const missiles = owned.array(0x08, MISSILE_BYTES, CRAFT_INFO_LIMITS.missiles, '/missiles', HEADER_BYTES);
  if (block.i32(0x14, '/craft') !== CRAFT_INFO_COUNTS.craft) block.unsupported('/craft', 'the craft records are not one per kind bit');
  const craft = owned.array(0x10, CRAFT_BYTES, CRAFT_INFO_COUNTS.craft, '/craft', HEADER_BYTES);
  const bodies = owned.array(0x18, CRAFT_BYTES, CRAFT_INFO_LIMITS.missileBodies, '/missileBodies', HEADER_BYTES);
  const source: Source = { block, bytes: read.bytes, owned };
  const records = <T>(span: Span, size: number, name: string, readRecord: (at: number, path: string) => T): readonly T[] =>
    Object.freeze(Array.from({ length: span.count }, (_, index) => readRecord(span.start + index * size, `/${name}[${index}]`)));
  return Object.freeze({
    hitDamageScale,
    guns: records(guns, GUN_BYTES, 'guns', (at, path) => readGun(source, at, path)),
    missiles: records(missiles, MISSILE_BYTES, 'missiles', (at, path) => readMissile(source, at, path, bodies)),
    craft: records(craft, CRAFT_BYTES, 'craft', (at, path) => readCraft(source, at, path, guns, missiles)),
    missileBodies: records(bodies, CRAFT_BYTES, 'missileBodies', (at, path) => readBody(block, at, path)),
  });
}
