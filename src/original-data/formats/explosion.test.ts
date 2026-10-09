import { describe, expect, it } from 'vitest';
import { FLIGHT_DATA_LIMITS } from '../../content/flight/flight-data-content.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import type { SourceLimit } from '../source-error.ts';
import { sourceFailure } from '../source-error.test-support.ts';
import { ByteWriter } from '../synthetic.test-support.ts';
import { EXPLOSION_LIMITS, parseExplosionLists, parseExplosionRecord } from './explosion.ts';
import { entryRead, type SyntheticBlock } from './formats.test-support.ts';

const SR_NOB = 'MAIN/SR.NOB' as DiscPath;
/** Synthetic entry IDs, not the original EXIC and EXPL IDs. */
const [EXIC_ID, EXPL_ID] = [30_021, 30_031];
const exicAt = `archive:/${SR_NOB}#${EXIC_ID}`;
const explAt = `archive:/${SR_NOB}#${EXPL_ID}`;
/** An ID that every rejected entry holds; no diagnostic may contain it. */
const SECRET_ID = 61_043;
const LISTS = [[40_001, SECRET_ID, 40_005, 40_007, 40_009], [40_011, 40_013], [40_015, 40_015, SECRET_ID]];

/**
 * An EXIC block: three {pointer, count} headers, one padding byte so the lists are unaligned, then each non-empty list
 * in order, followed by `tail` bytes. An empty list has a null pointer and no relocation; relocations are listed in
 * reverse order.
 */
function syntheticLists(lists: readonly (readonly number[])[], tail = 0): SyntheticBlock {
  const writer = new ByteWriter();
  let at = 25;
  const relocations: number[] = [];
  lists.forEach((ids, list) => {
    writer.u32(ids.length ? at : 0, ids.length);
    if (ids.length) relocations.push(list * 8);
    at += ids.length * 4;
  });
  writer.u8(0);
  for (const ids of lists) writer.u32(...ids);
  writer.raw(new Array<number>(tail).fill(0));
  return { bytes: writer.toBytes(), relocations: relocations.reverse() };
}

const parseLists = (block: SyntheticBlock) => parseExplosionLists(SR_NOB, entryRead(EXIC_ID, 'EXIC', block));
const parseRecord = (bytes: Uint8Array, relocations: number[] = []) => parseExplosionRecord(SR_NOB, entryRead(EXPL_ID, 'EXPL', { bytes, relocations }));
const view = (block: SyntheticBlock) => new DataView(block.bytes.buffer, block.bytes.byteOffset);
const edited = (change: (view: DataView, block: SyntheticBlock) => void, lists: readonly (readonly number[])[] = LISTS): SyntheticBlock => {
  const block = syntheticLists(lists);
  change(view(block), block);
  return block;
};

/** Expects a diagnostic in the location grammar that does not echo SECRET_ID. */
const rejects = async (action: () => unknown, code: string, location: string, limit: SourceLimit | null = null): Promise<void> =>
  expect(await sourceFailure(action, new RegExp(String(SECRET_ID)))).toEqual({ code, location, limit });

describe('EXIC lists', () => {
  it('reads exactly three lists of EXPL entry IDs in stored order, repeats included', () => {
    const lists = parseLists(syntheticLists(LISTS));
    expect(lists).toEqual(LISTS);
    expect(Object.isFrozen(lists) && lists.every(Object.isFrozen)).toBe(true);
  });

  it('accepts empty lists with a null pointer', () => {
    expect(parseLists(syntheticLists([[], [40_003], []]))).toEqual([[], [40_003], []]);
    expect(parseLists(syntheticLists([[], [], []]))).toEqual([[], [], []]);
  });

  it.each<[string, () => SyntheticBlock, string, string]>([
    ['a truncated header', () => ({ bytes: syntheticLists(LISTS).bytes.subarray(0, 23), relocations: [] }), 'invalid-payload', `${exicAt}/lists`],
    ['a fourth list pointer', () => syntheticLists([...LISTS, [SECRET_ID]]), 'invalid-payload', `${exicAt}/lists`],
    ['a relocated ID', () => edited((_, block) => block.relocations.push(25 + 8)), 'invalid-payload', `${exicAt}/lists`],
    ['an unlisted list pointer', () => edited((_, block) => block.relocations.splice(block.relocations.indexOf(8), 1)), 'invalid-payload', `${exicAt}/lists[1]`],
    ['a list inside the headers', () => edited(data => data.setUint32(16, 20, true)), 'invalid-payload', `${exicAt}/lists[2]`],
    ['a list past the block', () => edited(data => data.setUint32(4, 11, true)), 'invalid-payload', `${exicAt}/lists[0]`],
    ['a null pointer with a count', () => edited(data => data.setUint32(12, 1, true), [[40_001], [], [SECRET_ID]]), 'invalid-payload', `${exicAt}/lists[1]`],
  ])('rejects %s', async (_, block, code, location) => rejects(() => parseLists(block()), code, location));

  it('rejects a pointer with an empty list as unsupported', async () => {
    await rejects(() => parseLists(edited(data => data.setUint32(20, 0, true))), 'unsupported-payload', `${exicAt}/lists[2]`);
  });

  it('accepts 16 IDs per list and an entry of 256 bytes, and rejects one more of either before reading it', async () => {
    expect(EXPLOSION_LIMITS.listItems).toBe(FLIGHT_DATA_LIMITS.explosionListItems);
    const full = Array.from({ length: 3 }, (_, list) => Array.from({ length: 16 }, (_, item) => 40_001 + list * 100 + item * 2));
    expect(parseLists(syntheticLists(full))).toEqual(full);
    const largest = syntheticLists(full, 256 - 25 - 3 * 16 * 4);
    expect(largest.bytes).toHaveLength(EXPLOSION_LIMITS.listEntryBytes);
    expect(parseLists(largest)).toEqual(full);
    await rejects(() => parseLists(syntheticLists(full, 256 - 25 - 3 * 16 * 4 + 1)), 'limit-exceeded', exicAt, { name: 'payloadEntryBytes', limit: 256, observed: 257 });
    await rejects(() => parseLists(syntheticLists([[SECRET_ID], new Array<number>(17).fill(40_001), []])), 'limit-exceeded', `${exicAt}/lists[1]`,
      { name: 'payloadItems', limit: 16, observed: 17 });
    await rejects(() => parseLists(edited(data => data.setUint32(20, 0xffff_ffff, true))), 'limit-exceeded', `${exicAt}/lists[2]`,
      { name: 'payloadItems', limit: 16, observed: 0xffff_ffff });
  });
});

describe('EXPL records', () => {
  const RECORD = new ByteWriter().u32(40_101, 40_203).toBytes();

  it('reads the SND and ANIM entry IDs', () => {
    const record = parseRecord(RECORD);
    expect(record).toEqual({ sound: 40_101, animation: 40_203 });
    expect(Object.isFrozen(record)).toBe(true);
  });

  it.each<[string, Uint8Array, number[], string]>([
    ['a truncated record', RECORD.subarray(0, 7), [], `${explAt}/record`],
    ['a relocated sound', new ByteWriter().u32(SECRET_ID, 40_203).toBytes(), [0], `${explAt}/sound`],
    ['a relocation inside the sound', new ByteWriter().u32(SECRET_ID, 40_203).toBytes(), [2], `${explAt}/sound`],
    ['a relocated animation', new ByteWriter().u32(40_101, SECRET_ID).toBytes(), [4], `${explAt}/animation`],
  ])('rejects %s', async (_, bytes, relocations, location) => rejects(() => parseRecord(bytes, relocations), 'invalid-payload', location));

  it('accepts exactly 8 bytes and rejects a longer record before reading it', async () => {
    expect(EXPLOSION_LIMITS.recordBytes).toBe(8);
    await rejects(() => parseRecord(new ByteWriter().u32(SECRET_ID, 40_203).u8(0).toBytes()), 'limit-exceeded', explAt, { name: 'payloadEntryBytes', limit: 8, observed: 9 });
  });
});
