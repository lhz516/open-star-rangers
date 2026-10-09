import { describe, expect, it } from 'vitest';
import { DEBRIS_PARAMETERS_LIMITS, readDebrisParameters, type DebrisParameters, type DebrisRecord } from '../../content/rule-data/debris-parameters.ts';
import { deepFrozen, syntheticDebrisParameters } from '../../content/rule-data/rule-data.test-support.ts';
import { BOX_BYTES, JUNK, entryRead, expectSourceError, resized } from './craft.test-support.ts';
import { DEBRIS_ENTRY_BYTES, parseDebrisParameters } from './debris.ts';
import { DEBRIS_NOB, DEBRIS_TABLE_ID, defaultDebrisParameters, syntheticDebrisBlock, type DebrisOffsets } from './debris.test-support.ts';
import type { SyntheticBlock } from './formats.test-support.ts';

const debrisAt = `archive:/${DEBRIS_NOB}#${DEBRIS_TABLE_ID}`;
const parse = (block: SyntheticBlock) => parseDebrisParameters(DEBRIS_NOB, entryRead(DEBRIS_TABLE_ID, 'TABL', block));

/** The default parameters with the records of `kind` replaced. */
const withKind = (parameters: DebrisParameters, kind: number, records: readonly DebrisRecord[]): DebrisParameters =>
  ({ byCraftType: parameters.byCraftType.map((list, index) => (index === kind ? records : list)) });

describe('DEBRIS TABL 4501 parsing', () => {
  it('converts the records of every kind bit as stored', () => {
    const parameters = defaultDebrisParameters();
    const parsed = parse(syntheticDebrisBlock(parameters));
    expect(parsed).toEqual(parameters);
    expect(deepFrozen(parsed)).toBe(true);
    expect(readDebrisParameters(parsed)).toEqual(parsed);
    expect(parsed.byCraftType).toHaveLength(20);
    expect([parsed.byCraftType[13], parsed.byCraftType[14]]).toEqual([[], []]);
    // The load code's negation of +0x00–+0x08 and widening of the boxes are left to the consumer.
    expect(parsed.byCraftType[0][0]).toEqual({
      at00: [-0.75, 0.125, 3],
      collision: { boxes: [{ lower: [-1, -2, -3], upper: [1, 2, 3] }, { lower: [0, -9, 0.5], upper: [2, 9, 4] }], at28: 7, at2C: [-1, -1, -1, 1, 1, 1] },
    });
  });

  it('follows the input values', () => {
    const plain = readDebrisParameters(syntheticDebrisParameters());
    expect(parse(syntheticDebrisBlock(plain))).toEqual(plain);
    expect(parse(syntheticDebrisBlock(plain))).not.toEqual(parse(syntheticDebrisBlock(defaultDebrisParameters())));
  });

  it('reads unaligned pointers through an unordered relocation table, ignoring the positions the load code writes', () => {
    const block = syntheticDebrisBlock(defaultDebrisParameters());
    const starts = [...block.offsets.records.flatMap(list => list.slice(0, 1)), ...block.offsets.boxes.flat()];
    expect(starts.every(start => start % 2 === 1)).toBe(true);
    const sorted = [...block.relocations].sort((left, right) => left - right);
    expect(block.relocations).not.toEqual(sorted);
    expect(block.relocations).not.toEqual([...sorted].reverse());
    // +0x0C–+0x34 and +0x5C hold a NaN with bit 31 set, which reading would reject (craft.md §4.4).
    const view = new DataView(block.bytes.buffer);
    const record = block.offsets.records[0][0];
    const written = [...Array.from({ length: 11 }, (_, index) => record + 0x0c + index * 4), record + 0x5c];
    expect(written.map(at => view.getUint32(at, true))).toEqual(written.map(() => JUNK));
    expect(() => parse(block)).not.toThrow();
  });

  it('accepts records and boxes at their limits and rejects one more before reading them', () => {
    const parameters = defaultDebrisParameters();
    const { records: recordLimit, boxes: boxLimit } = DEBRIS_PARAMETERS_LIMITS;
    const records = (count: number) => withKind(parameters, 4, Array.from({ length: count }, () => parameters.byCraftType[4][0]));
    expect(parse(syntheticDebrisBlock(records(recordLimit)))).toEqual(records(recordLimit));
    expectSourceError(() => parse(syntheticDebrisBlock(records(recordLimit + 1))), 'limit-exceeded', `${debrisAt}/byCraftType[4]`,
      { name: 'payloadItems', limit: recordLimit, observed: recordLimit + 1 });

    const [first] = parameters.byCraftType[0];
    const boxes = (count: number) => withKind(parameters, 0, [{ ...first, collision: { ...first.collision, boxes: Array.from({ length: count }, () => first.collision.boxes[1]) } }]);
    expect(parse(syntheticDebrisBlock(boxes(boxLimit)))).toEqual(boxes(boxLimit));
    expectSourceError(() => parse(syntheticDebrisBlock(boxes(boxLimit + 1))), 'limit-exceeded', `${debrisAt}/byCraftType[0]/records[0]/collision/boxes`,
      { name: 'payloadItems', limit: boxLimit, observed: boxLimit + 1 });
  });

  it('limits the entry before reading it and a declared count before the array bounds', () => {
    const block = syntheticDebrisBlock(defaultDebrisParameters());
    expect(parse(resized(block, DEBRIS_ENTRY_BYTES))).toEqual(defaultDebrisParameters());
    expectSourceError(() => parse(resized(block, DEBRIS_ENTRY_BYTES + 1)), 'limit-exceeded', debrisAt,
      { name: 'payloadEntryBytes', limit: DEBRIS_ENTRY_BYTES, observed: DEBRIS_ENTRY_BYTES + 1 });
    expect(DEBRIS_ENTRY_BYTES).toBe(2 ** Math.ceil(Math.log2(8_200 * 2)));
    new DataView(block.bytes.buffer).setUint32(7 * 8 + 4, 0x7fff_ffff, true);
    expectSourceError(() => parse(block), 'limit-exceeded', `${debrisAt}/byCraftType[7]`,
      { name: 'payloadItems', limit: DEBRIS_PARAMETERS_LIMITS.records, observed: 0x7fff_ffff });
  });

  type Edit = (view: DataView, block: SyntheticBlock & { offsets: DebrisOffsets }) => void;
  const word = (value: number) => (at: number): Edit => view => view.setUint32(at, value >>> 0, true);
  const f32 = (value: number, at: (offsets: DebrisOffsets) => number): Edit => (view, { offsets }) => view.setFloat32(at(offsets), value, true);
  const recordWord = (kind: number, index: number, offset: number, value: number): Edit =>
    (view, { offsets }) => view.setUint32(offsets.records[kind][index] + offset, value >>> 0, true);

  it.each<[string, Edit, 'invalid-payload' | 'unsupported-payload', string]>([
    ['a block shorter than its header', (_, block) => {
      block.bytes = block.bytes.slice(0, 159);
      block.relocations = block.relocations.filter(at => at < 156);
    }, 'invalid-payload', '/header'],
    ['a negative record count', word(-1)(3 * 8 + 4), 'unsupported-payload', '/byCraftType[3]'],
    ['a null record pointer with a count', (view, block) => {
      view.setUint32(2 * 8, 0, true);
      block.relocations.splice(block.relocations.indexOf(2 * 8), 1);
    }, 'invalid-payload', '/byCraftType[2]'],
    ['a record pointer with a zero count', (view, block) => {
      view.setUint32(13 * 8, 0x200, true);
      block.relocations.push(13 * 8);
    }, 'unsupported-payload', '/byCraftType[13]'],
    ['a record array overlapping the header', word(0x10)(5 * 8), 'invalid-payload', '/byCraftType[5]'],
    ['a record array past the block end', word(16)(19 * 8 + 4), 'invalid-payload', '/byCraftType[19]'],
    ['an unlisted box pointer', (_, block) => {
      const at = block.offsets.records[0][0] + 0x38;
      block.relocations.splice(block.relocations.indexOf(at), 1);
    }, 'invalid-payload', '/byCraftType[0]/records[0]/collision/boxes'],
    ['a relocation at a position the load code writes', (_, block) => {
      block.relocations.push(block.offsets.records[0][0] + 0x0c);
    }, 'invalid-payload', '/byCraftType[0]/records[0]'],
    ['a negative box count', recordWord(1, 0, 0x3c, -1), 'unsupported-payload', '/byCraftType[1]/records[0]/collision/boxes'],
    ['an int32 with bit 31 set', recordWord(1, 0, 0x40, 0x8000_0000), 'unsupported-payload', '/byCraftType[1]/records[0]/collision/at28'],
    ['a negative zero vector component', f32(-0, offsets => offsets.records[2][1] + 0x04), 'unsupported-payload', '/byCraftType[2]/records[1]/at00'],
    ['a NaN shape value', recordWord(2, 0, 0x48, 0x7fc0_0001), 'invalid-payload', '/byCraftType[2]/records[0]/collision/at2C'],
    ['an infinite box corner', f32(-Infinity, offsets => offsets.boxes[0][0] + BOX_BYTES + 4), 'invalid-payload', '/byCraftType[0]/records[0]/collision/boxes[1]/lower'],
    ['a negative zero box corner', f32(-0, offsets => offsets.boxes[5][0] + 16), 'unsupported-payload', '/byCraftType[5]/records[0]/collision/boxes[0]/upper'],
    // Structures own their bytes: the load code writes records and boxes in place.
    ['two kinds sharing a record array', (view, { offsets }) => view.setUint32(3 * 8, offsets.records[2][0], true), 'unsupported-payload', '/byCraftType[3]'],
    ['a box array shared by two records', (view, { offsets }) => view.setUint32(offsets.records[2][1] + 0x38, offsets.boxes[2][0], true),
      'unsupported-payload', '/byCraftType[2]/records[1]/collision/boxes'],
    ['a box array inside a record', (view, { offsets }) => view.setUint32(offsets.records[1][0] + 0x38, offsets.records[1][0] + 0x0c, true),
      'unsupported-payload', '/byCraftType[1]/records[0]/collision/boxes'],
  ])('rejects %s', (_, change, code, path) => {
    const block = syntheticDebrisBlock(defaultDebrisParameters());
    change(new DataView(block.bytes.buffer), block);
    expectSourceError(() => parse(block), code, `${debrisAt}${path}`);
  });
});
