import { readDebrisParameters, type DebrisParameters } from '../../content/rule-data/debris-parameters.ts';
import { box, debrisRecord, syntheticDebrisParameters } from '../../content/rule-data/rule-data.test-support.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import { BlockWriter, BOX_BYTES, JUNK } from './craft.test-support.ts';
import type { SyntheticBlock } from './formats.test-support.ts';

// Code-generated synthetic DEBRIS TABL 4501 blocks for P3-03 tests, laid out from canonical content with the structure of
// docs/original/formats/craft.md §4; they never hold original data. As for CINF, arrays start at odd offsets, relocations
// are out of order, and the positions the load code writes (+0x0C–+0x34, +0x5C) hold JUNK.

export const DEBRIS_NOB = 'MAIN/DEBRIS.NOB' as DiscPath;
export const DEBRIS_TABLE_ID = 4501;
const DEBRIS_RECORD_BYTES = 96;

/** Starts of the laid-out arrays, per kind bit and record, for tests that corrupt specific fields. */
export interface DebrisOffsets {
  readonly records: readonly (readonly number[])[];
  /** Each record's box array start. */
  readonly boxes: readonly (readonly number[])[];
}

/** Lays out a TABL 4501 block from content: the header of 20 pairs, then each kind's records, each followed by its boxes. */
export function syntheticDebrisBlock({ byCraftType }: DebrisParameters): SyntheticBlock & { readonly offsets: DebrisOffsets } {
  const writer = new BlockWriter();
  writer.alloc(byCraftType.length * 8);
  const records: number[][] = [];
  const boxes = byCraftType.map((kind, index) => {
    const start = writer.oddAlloc(kind.length * DEBRIS_RECORD_BYTES);
    writer.array(index * 8, start, kind.length);
    records.push(kind.map((_, position) => start + position * DEBRIS_RECORD_BYTES));
    return kind.map((record, position) => {
      const at = start + position * DEBRIS_RECORD_BYTES;
      const { collision } = record;
      const array = writer.oddAlloc(collision.boxes.length * BOX_BYTES);
      collision.boxes.forEach((item, entry) => writer.f32s(array + entry * BOX_BYTES, [...item.lower, ...item.upper]));
      writer.f32s(at, record.at00).words(at + 0x0c, Array<number>(11).fill(JUNK)).array(at + 0x38, array, collision.boxes.length)
        .words(at + 0x40, [collision.at28]).f32s(at + 0x44, collision.at2C).words(at + 0x5c, [JUNK]);
      return array;
    });
  });
  return { ...writer.toBlock(), offsets: { records, boxes } };
}

/** The content test support's debris parameters, with a kind-0 record holding two boxes and a non-zero inner box. */
export function defaultDebrisParameters(): DebrisParameters {
  const parameters = syntheticDebrisParameters();
  parameters.byCraftType[0][0] = debrisRecord({
    at00: [-0.75, 0.125, 3], collision: { boxes: [box(), box([0, -9, 0.5], [2, 9, 4])], at28: 7, at2C: [-1, -1, -1, 1, 1, 1] },
  });
  return readDebrisParameters(parameters);
}
