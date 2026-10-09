import { BOX, CRAFT_INFO_COUNTS, type Box, type F32x3, type F32x6 } from './craft-info.ts';
import { listOf, readF32, readInt32, readTuple, records, tuples, type Shape } from './rule-data-fields.ts';

// Canonical content of `data/debris-parameters` (P3-03 spec S-04): every record of DEBRIS TABL 4501, with the structure of
// docs/original/formats/craft.md §4. `atXX` is the source position +0xXX. The positions the load code `0x246a0` writes
// (+0x0C–+0x34 and +0x5C) are not carried; its negation of +0x00–+0x08 and its widening of the boxes are consumer
// transforms (craft.md §4.4), so the stored values are kept. Meanings are Unconfirmed (U-001, U-027); the rules belong to
// P3-07 and P3-12.

/**
 * Structural limits: twice the DEBRIS 4501 maximum recorded in craft.md §4.2, rounded up to a power of two (8 records for
 * one kind bit, 1 box per record).
 */
export const DEBRIS_PARAMETERS_LIMITS = Object.freeze({ records: 16, boxes: 2 });

/** The collision shape at record +0x18 (craft.md §3.5.1); `atXX` is the shape offset. The radius and bounds are not carried. */
export interface DebrisCollisionShape {
  /** Shape +0x20 pointer and +0x24 i32 count (record +0x38/+0x3C); the load code widens the corners (craft.md §4.4). */
  readonly boxes: readonly Box[];
  /** Shape +0x28 int32 (record +0x40). */
  readonly at28: number;
  /** Shape +0x2C–+0x40 f32 × 6 (record +0x44–+0x58). */
  readonly at2C: F32x6;
}

/** Record, 96 bytes (craft.md §4.3; U-001, U-027). */
export interface DebrisRecord {
  /** +0x00–+0x08 f32 × 3, as stored; the load code negates them (craft.md §4.4). */
  readonly at00: F32x3;
  /** +0x18–+0x5B. */
  readonly collision: DebrisCollisionShape;
}

export interface DebrisParameters {
  /** The 20 header pairs {pointer, i32 count}, one per kind bit 0–19 by kind bit; each a record array in source order. */
  readonly byCraftType: readonly (readonly DebrisRecord[])[];
}

const SHAPE: Shape<DebrisCollisionShape> = {
  boxes: listOf(DEBRIS_PARAMETERS_LIMITS.boxes, records(BOX)),
  at28: readInt32,
  at2C: tuples<F32x6>(6, readF32),
};

const RECORD: Shape<DebrisRecord> = { at00: tuples<F32x3>(3, readF32), collision: records(SHAPE) };

const readRecords = listOf(DEBRIS_PARAMETERS_LIMITS.records, records(RECORD));

const readParameters = records<DebrisParameters>({
  byCraftType: (value, path) => readTuple(value, path, CRAFT_INFO_COUNTS.craft, readRecords),
});

/** Strictly reads `data/debris-parameters` content into frozen data isolated from `value`. */
export const readDebrisParameters = (value: unknown, path = 'debrisParameters'): DebrisParameters => readParameters(value, path);
