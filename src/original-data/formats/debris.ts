import { CRAFT_INFO_COUNTS, type F32x3, type F32x6 } from '../../content/rule-data/craft-info.ts';
import {
  DEBRIS_PARAMETERS_LIMITS, type DebrisCollisionShape, type DebrisParameters, type DebrisRecord,
} from '../../content/rule-data/debris-parameters.ts';
import type { ArchiveEntryRead } from '../archive/archive-reader.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import { Fields, OwnedBytes, readBoxes } from './craft.ts';
import { PayloadBlock } from './payload-block.ts';

// Directed parsing of DEBRIS.NOB TABL 4501 (docs/original/formats/craft.md §4) under the P3-03 field handling. The load
// code `0x246a0` writes +0x0C–+0x34 and +0x5C of every record, so their stored values are not converted; its negation of
// +0x00–+0x08 and its widening of the box corners are arithmetic, consumer transforms (craft.md §4.4), so the stored values
// are kept and nothing is transformed here.

/** Entry limit of TABL 4501: twice its 8,200 bytes (craft.md §1), rounded up to a power of two. */
export const DEBRIS_ENTRY_BYTES = 32_768;

/** The header: one {pointer, i32 count} pair per kind bit. */
const HEADER_BYTES = CRAFT_INFO_COUNTS.craft * 8;
const RECORD_BYTES = 96;
/** Record offset of its only pointer field, the box array. */
const RECORD_POINTERS: ReadonlySet<number> = new Set([0x38]);

/** Record, 96 bytes (craft.md §4.3), with the collision shape at +0x18 (§3.5.1). */
function readRecord(owned: OwnedBytes, at: number, path: string): DebrisRecord {
  const { block } = owned;
  block.requireRelocations(at, RECORD_BYTES, RECORD_POINTERS, path);
  const shapePath = `${path}/collision`;
  const shape = new Fields(block, at + 0x18, shapePath);
  const collision: DebrisCollisionShape = Object.freeze({
    boxes: readBoxes(owned, at + 0x38, DEBRIS_PARAMETERS_LIMITS.boxes, `${shapePath}/boxes`),
    at28: shape.int32(0x28),
    at2C: shape.f32s<F32x6>(0x2c, 6),
  });
  return Object.freeze({ at00: new Fields(block, at, path).f32s<F32x3>(0x00, 3), collision });
}

/** Parses DEBRIS TABL 4501 `read` of `archive` into `data/debris-parameters` content: every record of every kind bit. */
export function parseDebrisParameters(archive: DiscPath, read: ArchiveEntryRead): DebrisParameters {
  const block = new PayloadBlock(archive, read, DEBRIS_ENTRY_BYTES);
  block.require(0, HEADER_BYTES, '/header');
  const owned = new OwnedBytes(block);
  owned.claim(0, HEADER_BYTES, '/header');
  return Object.freeze({
    byCraftType: Object.freeze(Array.from({ length: CRAFT_INFO_COUNTS.craft }, (_, kind) => {
      const path = `/byCraftType[${kind}]`;
      const records = owned.array(kind * 8, RECORD_BYTES, DEBRIS_PARAMETERS_LIMITS.records, path, HEADER_BYTES);
      return Object.freeze(Array.from({ length: records.count }, (__, index) =>
        readRecord(owned, records.start + index * RECORD_BYTES, `${path}/records[${index}]`)));
    })),
  });
}
