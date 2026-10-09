import { describe, expect, it } from 'vitest';
import { BASE_REPAIR_ITEM_COUNT, readBaseRepairItems } from '../../content/rule-data/base-repair-items.ts';
import { deepFrozen, syntheticBaseRepairItems } from '../../content/rule-data/rule-data.test-support.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import { BASE_REPAIR_ENTRY_BYTES, BASE_REPAIR_RECORD, parseBaseRepairItems } from './base-repair.ts';
import { MARKER, entryRead, expectSourceError, resized } from './craft.test-support.ts';
import type { SyntheticBlock } from './formats.test-support.ts';

// P3-03 AC-06 (TABL 10165 part), AC-14 and AC-18: code-generated TABL 10165 blocks only. Their selectors and filler are
// arbitrary synthetic values.

const SR_NOB = 'MAIN/SR.NOB' as DiscPath;
const ENTRY_ID = 10165;
const location = `archive:/${SR_NOB}#${ENTRY_ID}`;
const { bytes: RECORD_BYTES, selector: SELECTOR } = BASE_REPAIR_RECORD;
const RECORDS_BYTES = BASE_REPAIR_ITEM_COUNT * RECORD_BYTES;
const SELECTORS = Object.freeze(syntheticBaseRepairItems().subsystemSelectors);
/** Pointer fields of a record besides the selector: each image's palette and pixel pointers, then +0x70 and +0x74 (hud.md). */
const POINTERS = Object.freeze([0x14, 0x1c, 0x38, 0x40, 0x5c, 0x64, 0x70, 0x74]);

const selectorAt = (index: number) => index * RECORD_BYTES + SELECTOR;
const parse = (block: SyntheticBlock) => parseBaseRepairItems(SR_NOB, entryRead(ENTRY_ID, 'TABL', block));

/**
 * A block of one record per selector around a `seed` pattern, with relocations at the records' pointer fields and
 * trailing data that holds MARKER, as the base-interior texts would.
 */
function syntheticBaseRepair(selectors: readonly number[], seed = 1, trailing = 300): SyntheticBlock {
  const recordsEnd = selectors.length * RECORD_BYTES;
  const bytes = Uint8Array.from({ length: recordsEnd + trailing }, (_, index) => (index * 31 + seed * 17) & 0xff);
  if (trailing > MARKER.length) bytes.set(Array.from(MARKER, character => character.charCodeAt(0)), recordsEnd + 1);
  const view = new DataView(bytes.buffer);
  selectors.forEach((selector, index) => view.setUint32(selectorAt(index), selector, true));
  return { bytes, relocations: selectors.flatMap((_, index) => POINTERS.map(offset => index * RECORD_BYTES + offset)).reverse() };
}


describe('TABL 10165 selector parsing', () => {
  it('reads the 11 selectors in record order and nothing else', () => {
    const parsed = parse(syntheticBaseRepair(SELECTORS));
    expect(parsed).toEqual({ subsystemSelectors: SELECTORS });
    expect(Object.keys(parsed)).toEqual(['subsystemSelectors']);
    expect(deepFrozen(parsed)).toBe(true);
    expect(readBaseRepairItems(parsed)).toEqual(parsed);
  });

  it('follows the input selectors', () => {
    const other = [34, 33, 9, 4, 6, 10, 11, 12, 13, 14, 15];
    expect(parse(syntheticBaseRepair(other)).subsystemSelectors).toEqual(other);
  });

  it('neither converts nor checks the rest of the block', () => {
    const expected = { subsystemSelectors: SELECTORS };
    expect(parse(syntheticBaseRepair(SELECTORS, 7, 1_000))).toEqual(expected);
    // Records only, every other byte 0xFF and no relocations.
    const bare = syntheticBaseRepair(SELECTORS, 1, 1);
    const view = new DataView(bare.bytes.buffer);
    bare.bytes.fill(0xff);
    SELECTORS.forEach((selector, index) => view.setUint32(selectorAt(index), selector, true));
    expect(parse({ bytes: bare.bytes.slice(0, RECORDS_BYTES), relocations: [] })).toEqual(expected);
    // A relocation at every position that does not overlap a selector, in any order.
    const everywhere = Array.from({ length: bare.bytes.length - 3 }, (_, at) => at)
      .filter(at => SELECTORS.every((_, index) => at + 3 < selectorAt(index) || at > selectorAt(index) + 3));
    expect(parse({ bytes: bare.bytes, relocations: everywhere.reverse() })).toEqual(expected);
    // A twelfth record is not read: the count is the EXE's.
    expect(parse(syntheticBaseRepair([...SELECTORS, 0xffff_ffff]))).toEqual(expected);
  });

  it.each([0, 31, 33, 34])('accepts the selector %i', selector => {
    const selectors = SELECTORS.map((value, index) => (index === 4 ? selector : value));
    expect(parse(syntheticBaseRepair(selectors)).subsystemSelectors[4]).toBe(selector);
  });

  it.each([32, 35, 0x7fff_ffff, 0x8000_0000, 0xffff_ffff])('rejects the selector %i as unsupported', selector => {
    for (const index of [0, 10]) {
      const selectors = SELECTORS.map((value, at) => (at === index ? selector : value));
      expectSourceError(() => parse(syntheticBaseRepair(selectors)), 'unsupported-payload', `${location}/subsystemSelectors[${index}]`);
    }
  });

  it.each([-3, 0, 3])('rejects a relocation overlapping a selector, at %i from it', delta => {
    const block = syntheticBaseRepair(SELECTORS);
    block.relocations.push(selectorAt(6) + delta);
    expectSourceError(() => parse(block), 'invalid-payload', `${location}/subsystemSelectors[6]`);
  });

  it('requires the 11 records inside the block', () => {
    const block = syntheticBaseRepair(SELECTORS, 1, 1);
    expect(parse(resized(block, RECORDS_BYTES))).toEqual({ subsystemSelectors: SELECTORS });
    expectSourceError(() => parse(resized(block, RECORDS_BYTES - 1)), 'invalid-payload', `${location}/records`);
    expect(RECORDS_BYTES).toBe(1_364);
  });

  it('limits the entry before reading it', () => {
    const block = syntheticBaseRepair(SELECTORS);
    expect(parse(resized(block, BASE_REPAIR_ENTRY_BYTES))).toEqual({ subsystemSelectors: SELECTORS });
    expectSourceError(() => parse(resized(block, BASE_REPAIR_ENTRY_BYTES + 1)), 'limit-exceeded', location,
      { name: 'payloadEntryBytes', limit: BASE_REPAIR_ENTRY_BYTES, observed: BASE_REPAIR_ENTRY_BYTES + 1 });
    // The baseline entry is 69,407 bytes (hud.md).
    expect(BASE_REPAIR_ENTRY_BYTES).toBe(2 ** Math.ceil(Math.log2(69_407 * 2)));
  });
});
