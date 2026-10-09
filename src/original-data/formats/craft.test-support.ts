import { expect } from 'vitest';
import { readCraftInfo, type CraftInfo, type CraftRecord, type MissileBodyRecord } from '../../content/rule-data/craft-info.ts';
import { MARKER, box, craft, mount, syntheticCraftInfo, text } from '../../content/rule-data/rule-data.test-support.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import { SourceError, type SourceErrorCode, type SourceLimit } from '../source-error.ts';
import { inLocationGrammar } from '../source-error.test-support.ts';
import { CRAFT_TABLE_FORMAT } from './craft.ts';
import { entryRead, type SyntheticBlock } from './formats.test-support.ts';

// Code-generated synthetic TABL 4003 and CINF blocks for P3-03 tests, laid out from canonical content with the structure of
// docs/original/formats/craft.md; they never hold original data, and their numbers are arbitrary synthetic values. Every
// array starts at an odd offset, so pointers and values are unaligned, and relocation tables are out of order. Positions
// the load code overwrites hold JUNK, an f32 NaN with bit 31 set, which a parser must neither convert nor check. Texts carry
// MARKER for privacy assertions.

export { MARKER, entryRead, text };

export const CRAFT_NOB = 'MAIN/CRAFT.NOB' as DiscPath;
export const CRAFT_TABLE_ID = 4003;
export const CRAFT_INFO_ID = 4037;

/** The stored word of positions the load code overwrites. */
export const JUNK = 0xffff_ffff;

export const GUN_BYTES = 48;
export const MISSILE_BYTES = 104;
export const CRAFT_BYTES = 236;
export const MOUNT_BYTES = 56;
export const BOX_BYTES = 24;
export const PAIR_BYTES = 8;

/** A growable little-endian block whose pointer writes are recorded as relocations. */
export class BlockWriter {
  #bytes = new Uint8Array(1024);
  #view = new DataView(this.#bytes.buffer);
  length = 0;
  readonly relocations: number[] = [];

  /** Appends `size` zero bytes and returns their offset. */
  alloc(size: number): number {
    const at = this.length;
    if (at + size > this.#bytes.length) {
      const grown = new Uint8Array(Math.max(this.#bytes.length * 2, at + size));
      grown.set(this.#bytes);
      this.#bytes = grown;
      this.#view = new DataView(grown.buffer);
    }
    this.length += size;
    return at;
  }

  /** Appends `size` zero bytes at an odd offset, after one padding byte if needed. */
  oddAlloc(size: number): number {
    if (this.length % 2 === 0) this.alloc(1);
    return this.alloc(size);
  }

  /** A 32-bit integer word; negative values are written in two's complement. */
  word(at: number, value: number): this {
    this.#view.setUint32(at, value >>> 0, true);
    return this;
  }

  /** Consecutive words from `at`. */
  words(at: number, values: readonly number[]): this {
    values.forEach((value, index) => this.word(at + index * 4, value));
    return this;
  }

  f32s(at: number, values: readonly number[]): this {
    values.forEach((value, index) => this.#view.setFloat32(at + index * 4, value, true));
    return this;
  }

  pointer(at: number, target: number): this {
    this.relocations.push(at);
    return this.word(at, target);
  }

  /** A `{pointer, count}` header naming `count` items at `target`; an empty array keeps both zero. */
  array(at: number, target: number, count: number): this {
    return count > 0 ? this.pointer(at, target).word(at + 4, count) : this;
  }

  /** Appends a NUL-terminated byte string, one byte per code unit, and returns its offset. */
  text(value: string): number {
    const at = this.alloc(value.length + 1);
    for (let index = 0; index < value.length; index++) this.#bytes[at + index] = value.charCodeAt(index);
    return at;
  }

  /** The block, with its relocations neither ascending nor descending. */
  toBlock(): SyntheticBlock {
    const reversed = [...this.relocations].reverse();
    const half = reversed.length >> 1;
    return { bytes: this.#bytes.slice(0, this.length), relocations: [...reversed.slice(half), ...reversed.slice(0, half)] };
  }
}

export type CraftTableCell = readonly [craftInfoEntryId: number, hitDamageScale: number];

/** A distinct synthetic cell for every row and pair; the scales include negative values and zero. */
export const craftTableCell = (row: number, pair: number): CraftTableCell => [6_000 + row * 4 + pair, (row - 4) / 2 + pair / 8];

/** Lays out a TABL 4003 block of `rows` × `pairs` cells. */
export function syntheticCraftTable(
  cell: (row: number, pair: number) => CraftTableCell = craftTableCell,
  rows: number = CRAFT_TABLE_FORMAT.rows,
  pairs: number = CRAFT_TABLE_FORMAT.pairs,
): SyntheticBlock {
  const writer = new BlockWriter();
  const table = writer.alloc(rows * pairs * 8);
  for (let row = 0; row < rows; row++) {
    for (let pair = 0; pair < pairs; pair++) {
      const at = table + (row * pairs + pair) * 8;
      const [id, scale] = cell(row, pair);
      writer.word(at, id).f32s(at + 4, [scale]);
    }
  }
  return writer.toBlock();
}

/** Array starts of a laid-out CINF block, for tests that corrupt specific fields; an empty array's start is 0. */
export interface CinfOffsets {
  readonly guns: number;
  readonly missiles: number;
  readonly craft: number;
  readonly bodies: number;
  /** Per craft record. */
  readonly boxes: readonly number[];
  readonly pairs: readonly number[];
  readonly mountLists: readonly (readonly number[])[];
  readonly mounts: readonly number[];
}

type SharedValues = Omit<MissileBodyRecord, 'at08' | 'at0C' | 'collision'>;

/** Writes the fields craft and body records share after the collision shape, except arrays (craft.md §3.5). */
function writeValues(writer: BlockWriter, at: number, record: SharedValues): void {
  writer.words(at + 0x54, [record.at54, record.at58, record.at5C, record.at60, ...record.at64, record.at74, ...record.at78])
    .words(at + 0x88, [record.at88, record.at8C, record.at90])
    .words(at + 0x9c, [record.at9C]).f32s(at + 0xa0, [record.atA0]).words(at + 0xa4, [record.atA4, record.atA8])
    .f32s(at + 0xac, [record.atAC, record.atB0, record.atB4, record.atB8, record.atBC, record.atC0])
    .words(at + 0xc4, [record.atC4, record.atC8]);
}

/** Lays out a CINF block from content, in the original order: header, guns, missiles, craft with their structures, bodies. */
export function syntheticCraftInfoBlock(info: Omit<CraftInfo, 'hitDamageScale'>): SyntheticBlock & { readonly offsets: CinfOffsets } {
  const writer = new BlockWriter();
  writer.alloc(0x20);
  const guns = writer.oddAlloc(info.guns.length * GUN_BYTES);
  info.guns.forEach((gun, index) => {
    const at = guns + index * GUN_BYTES;
    writer.words(at, [JUNK]).pointer(at + 0x04, writer.text(gun.name)).f32s(at + 0x08, [gun.at08]).words(at + 0x0c, [JUNK, JUNK])
      .words(at + 0x14, [gun.at14, gun.at18, gun.at1C]).f32s(at + 0x20, [gun.at20]).words(at + 0x24, [gun.at24, gun.at28, gun.at2C]);
  });
  const missiles = writer.oddAlloc(info.missiles.length * MISSILE_BYTES);
  info.missiles.forEach((missile, index) => {
    const at = missiles + index * MISSILE_BYTES;
    writer.words(at, [JUNK]).pointer(at + 0x04, writer.text(missile.name)).words(at + 0x08, [JUNK, JUNK, JUNK])
      .words(at + 0x18, [missile.at18, missile.at1C, missile.at20, missile.at24]).f32s(at + 0x28, [missile.at28]).words(at + 0x2c, [JUNK])
      .words(at + 0x30, [missile.at30, missile.at34, missile.at38, missile.at3C]).f32s(at + 0x40, [missile.at40])
      .words(at + 0x44, [missile.at44, missile.at48]).f32s(at + 0x4c, [missile.at4C]).words(at + 0x50, [JUNK])
      .words(at + 0x54, [missile.at54, missile.at58, missile.at5C]).f32s(at + 0x60, [missile.at60, missile.at64]);
  });
  const craft = writer.oddAlloc(info.craft.length * CRAFT_BYTES);
  const structures = info.craft.map((record: CraftRecord, index) => {
    const at = craft + index * CRAFT_BYTES;
    const { collision } = record;
    writer.pointer(at, writer.text(record.at00)).pointer(at + 0x04, writer.text(record.name)).f32s(at + 0x08, [record.at08, record.at0C]);
    // Shape +0x04 is derived at load; with boxes, so are +0x00 and +0x08–+0x1C (craft.md §3.8).
    writer.words(at + 0x14, [JUNK]);
    if (collision.at00 === null || collision.at08 === null) writer.words(at + 0x10, [JUNK]).words(at + 0x18, Array<number>(6).fill(JUNK));
    else writer.f32s(at + 0x10, [collision.at00]).f32s(at + 0x18, collision.at08);
    const boxes = writer.oddAlloc(collision.boxes.length * BOX_BYTES);
    collision.boxes.forEach((item, position) => writer.f32s(boxes + position * BOX_BYTES, [...item.lower, ...item.upper]));
    writer.array(at + 0x30, boxes, collision.boxes.length).words(at + 0x38, [collision.at28]).f32s(at + 0x3c, collision.at2C);
    writeValues(writer, at, record);
    const pairs = writer.oddAlloc(record.pairs.length * PAIR_BYTES);
    record.pairs.forEach((pair, position) => writer.words(pairs + position * PAIR_BYTES, [pair.at00, pair.at04]));
    writer.array(at + 0x94, pairs, record.pairs.length);
    const mounts = writer.oddAlloc(record.mounts.length * MOUNT_BYTES);
    const lists = record.mountLists.map((list, position) => {
      const start = writer.oddAlloc(list.length * 4);
      list.forEach((mountIndex, entry) => writer.pointer(start + entry * 4, mounts + mountIndex * MOUNT_BYTES));
      writer.array(at + 0xcc + position * 8, start, list.length);
      return list.length ? start : 0;
    });
    record.mounts.forEach((item, position) => {
      const mountAt = mounts + position * MOUNT_BYTES;
      const weapon = item.at10 === 0 ? guns + item.weapon * GUN_BYTES : missiles + item.weapon * MISSILE_BYTES;
      writer.f32s(mountAt, item.at00).words(mountAt + 0x0c, [item.at0C, item.at10]).pointer(mountAt + 0x14, weapon)
        .words(mountAt + 0x20, [item.at20]).f32s(mountAt + 0x24, item.at24).words(mountAt + 0x30, [item.at30, item.at34]);
      if (item.at18 !== null) writer.pointer(mountAt + 0x18, mounts + item.at18 * MOUNT_BYTES);
      if (item.at1C !== null) writer.pointer(mountAt + 0x1c, mounts + item.at1C * MOUNT_BYTES);
    });
    writer.array(at + 0xe4, mounts, record.mounts.length);
    const start = (count: number, offset: number) => (count ? offset : 0);
    return { boxes: start(collision.boxes.length, boxes), pairs: start(record.pairs.length, pairs), mountLists: lists, mounts: start(record.mounts.length, mounts) };
  });
  const bodies = writer.oddAlloc(info.missileBodies.length * CRAFT_BYTES);
  info.missileBodies.forEach((body, index) => {
    const at = bodies + index * CRAFT_BYTES;
    const { collision } = body;
    writer.f32s(at + 0x08, [body.at08, body.at0C, collision.at00, collision.at04, ...collision.at08])
      .words(at + 0x38, [collision.at28]).f32s(at + 0x3c, collision.at2C);
    writeValues(writer, at, body);
  });
  info.missiles.forEach((missile, index) => writer.pointer(missiles + index * MISSILE_BYTES + 0x14, bodies + missile.body * CRAFT_BYTES));
  writer.array(0x00, guns, info.guns.length).array(0x08, missiles, info.missiles.length).array(0x10, craft, info.craft.length)
    .array(0x18, bodies, info.missileBodies.length);
  return {
    ...writer.toBlock(),
    offsets: {
      guns, missiles, craft, bodies,
      boxes: structures.map(item => item.boxes),
      pairs: structures.map(item => item.pairs),
      mountLists: structures.map(item => item.mountLists),
      mounts: structures.map(item => item.mounts),
    },
  };
}

/**
 * The content test support's craft info, with crossed missile bodies, non-zero body shapes and a second craft record
 * (index 5) with a box, pairs, mounts of both weapon kinds linked to each other and three mount lists.
 */
export function defaultCraftInfo(): CraftInfo {
  const info = syntheticCraftInfo();
  info.missiles[0].body = 1;
  info.missiles[1].body = 0;
  info.missileBodies[0].collision = { at00: 0.5, at04: 0.25, at08: [-1, -2, -3, 1, 2, 3], at28: 9, at2C: [-0.5, 0, 0, 0.5, 1, 1] };
  info.craft[5] = craft({
    at00: text(1),
    name: text(64),
    collision: { at00: null, at08: null, boxes: [box([-7, -7, 0], [7, 7, 0.125])], at28: 0, at2C: [0, 0, 0, 0, 0, 0] },
    pairs: [{ at00: -3, at04: 0 }],
    mountLists: [[1], [0, 1, 0], [1]],
    mounts: [mount({ at10: 1, weapon: 0, at1C: 1, at0C: 2 }), mount({ weapon: 1, at18: 0, at20: 0xffffffff })],
  });
  return readCraftInfo(info);
}

/** A block resized to `length` bytes, cut or padded with zeros; relocations are kept. */
export function resized(block: SyntheticBlock, length: number): SyntheticBlock {
  const bytes = new Uint8Array(length);
  bytes.set(block.bytes.subarray(0, length));
  return { bytes, relocations: block.relocations };
}

/** Expects `action` to throw a `SourceError` with `code` at `location` (and `limit`), whose diagnostic leaks no text. */
export function expectSourceError(action: () => unknown, code: SourceErrorCode, location: string, limit?: SourceLimit): void {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(SourceError);
  const data = (caught as SourceError).toData();
  expect({ code: data.code, location: data.location }).toEqual({ code, location });
  if (limit) expect(data.limit).toEqual(limit);
  expect(inLocationGrammar(data), data.location).toBe(true);
  expect(`${JSON.stringify(data)} ${(caught as Error).message}`).not.toContain(MARKER);
}
