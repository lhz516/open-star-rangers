import { describe, expect, it } from 'vitest';
import { CRAFT_INFO_LIMITS, readCraftInfo, type CraftInfo, type CraftRecord } from '../../content/rule-data/craft-info.ts';
import { F32_DENORMAL, deepFrozen, syntheticCraftInfo } from '../../content/rule-data/rule-data.test-support.ts';
import { CLASSIC_P2_SLICE } from '../../content/slice-definition.ts';
import { CRAFT_INFO_ENTRY_BYTES, CRAFT_TABLE_FORMAT, parseCraftInfo, parseCraftTable } from './craft.ts';
import {
  CRAFT_BYTES, CRAFT_INFO_ID, CRAFT_NOB, CRAFT_TABLE_ID, GUN_BYTES, JUNK, MISSILE_BYTES, MOUNT_BYTES, BOX_BYTES, PAIR_BYTES,
  craftTableCell, defaultCraftInfo, entryRead, expectSourceError, resized, syntheticCraftInfoBlock, syntheticCraftTable, text,
  type CinfOffsets, type CraftTableCell,
} from './craft.test-support.ts';
import type { SyntheticBlock } from './formats.test-support.ts';

const tableAt = `archive:/${CRAFT_NOB}#${CRAFT_TABLE_ID}`;
const infoAt = `archive:/${CRAFT_NOB}#${CRAFT_INFO_ID}`;

const parseTable = (block: SyntheticBlock, candidate = CLASSIC_P2_SLICE.candidate) =>
  parseCraftTable(CRAFT_NOB, entryRead(CRAFT_TABLE_ID, 'TABL', block), candidate);
const parseInfo = (block: SyntheticBlock, scale = 0.75) => parseCraftInfo(CRAFT_NOB, entryRead(CRAFT_INFO_ID, 'CINF', block), scale);

/** A view of a block for raw edits; `pointTo` lists the pointer it writes, `unlist` removes one. */
function editor(block: SyntheticBlock) {
  const view = new DataView(block.bytes.buffer, block.bytes.byteOffset, block.bytes.byteLength);
  return {
    view,
    word: (at: number, value: number) => view.setUint32(at, value >>> 0, true),
    f32: (at: number, value: number) => view.setFloat32(at, value, true),
    pointTo: (at: number, target: number) => {
      view.setUint32(at, target, true);
      if (!block.relocations.includes(at)) block.relocations.push(at);
    },
    unlist: (at: number) => {
      expect(block.relocations).toContain(at);
      block.relocations.splice(block.relocations.indexOf(at), 1);
    },
  };
}

describe('TABL 4003 parsing', () => {
  it('selects the pair of each candidate across rows and columns', () => {
    const block = syntheticCraftTable();
    for (const [slot, group] of [[0, 0], [1, 0], [1, 1], [1, 2], [9, 2], [17, 1], [17, 2]]) {
      const [craftInfoEntryId, hitDamageScale] = craftTableCell(slot, group);
      const pair = parseTable(block, { campaignGroup: group, campaignSlot: slot });
      expect(pair).toEqual({ craftInfoEntryId, hitDamageScale });
      expect(Object.isFrozen(pair)).toBe(true);
    }
    const [craftInfoEntryId, hitDamageScale] = craftTableCell(CLASSIC_P2_SLICE.candidate.campaignSlot, CLASSIC_P2_SLICE.candidate.campaignGroup);
    expect(parseTable(block)).toEqual({ craftInfoEntryId, hitDamageScale });
    expect(CRAFT_TABLE_FORMAT).toEqual({ rows: 18, pairs: 3, entryBytes: 432 });
  });

  it('keeps the stored entry ID and scale, and reads only the selected pair', () => {
    const cells = new Map<string, CraftTableCell>([['1,0', [0x8000_0001, F32_DENORMAL]], ['2,0', [7, -1e30]], ['3,0', [0, 0]]]);
    const block = syntheticCraftTable((row, pair) => cells.get(`${row},${pair}`) ?? [1, Number.NaN]);
    expect(parseTable(block)).toEqual({ craftInfoEntryId: 0x8000_0001, hitDamageScale: F32_DENORMAL });
    expect(parseTable(block, { campaignGroup: 0, campaignSlot: 2 })).toEqual({ craftInfoEntryId: 7, hitDamageScale: Math.fround(-1e30) });
    expect(Object.is(parseTable(block, { campaignGroup: 0, campaignSlot: 3 }).hitDamageScale, 0)).toBe(true);
  });

  it('rejects a candidate outside the table as a subresource mismatch', () => {
    const block = syntheticCraftTable();
    expectSourceError(() => parseTable(block, { campaignGroup: 0, campaignSlot: 18 }), 'subresource-mismatch', `${tableAt}/rows[18]`);
    expectSourceError(() => parseTable(block, { campaignGroup: 3, campaignSlot: 1 }), 'subresource-mismatch', `${tableAt}/rows[1]/pairs[3]`);
  });

  it.each<[string, () => SyntheticBlock, 'invalid-payload' | 'unsupported-payload', string]>([
    ['a table shorter than 18 × 3 pairs', () => resized(syntheticCraftTable(), 431), 'invalid-payload', '/rows'],
    ['17 rows', () => syntheticCraftTable(craftTableCell, 17), 'invalid-payload', '/rows'],
    ['a relocation', () => {
      const block = syntheticCraftTable();
      block.relocations.push(0x101);
      return block;
    }, 'invalid-payload', '/rows'],
    ['a NaN scale', () => syntheticCraftTable((row, pair) => (row === 1 && pair === 0 ? [1, Number.NaN] : [1, 1])), 'invalid-payload', '/rows[1]/pairs[0]/hitDamageScale'],
    ['an infinite scale', () => syntheticCraftTable((row, pair) => (row === 1 && pair === 0 ? [1, -Infinity] : [1, 1])), 'invalid-payload', '/rows[1]/pairs[0]/hitDamageScale'],
    ['a negative zero scale', () => syntheticCraftTable((row, pair) => (row === 1 && pair === 0 ? [1, -0] : [1, 1])), 'unsupported-payload', '/rows[1]/pairs[0]/hitDamageScale'],
  ])('rejects %s', (_, block, code, path) => expectSourceError(() => parseTable(block()), code, `${tableAt}${path}`));

  it('limits the entry to the format size before reading it', () => {
    expectSourceError(() => parseTable(resized(syntheticCraftTable(), 433)), 'limit-exceeded', tableAt, { name: 'payloadEntryBytes', limit: 432, observed: 433 });
  });
});

describe('CINF parsing', () => {
  it('converts every record field by field', () => {
    const info = defaultCraftInfo();
    const parsed = parseInfo(syntheticCraftInfoBlock(info), info.hitDamageScale);
    expect(parsed).toEqual(info);
    expect(deepFrozen(parsed)).toBe(true);
    expect(readCraftInfo(parsed)).toEqual(parsed);
    expect(parsed.craft).toHaveLength(20);
    // Signed negatives, unsigned bit 31, denormals and bytes 0x80–0xFF keep their stored values.
    expect([parsed.guns[0].at14, parsed.craft[0].at54, parsed.craft[0].pairs[0].at00, parsed.missiles[0].at60]).toEqual([-7, -100, -1000, -0.125]);
    expect([parsed.missiles[0].at54, parsed.craft[0].mounts[0].at20, parsed.craft[5].mounts[1].at20]).toEqual([0xffffffff, 0x80000001, 0xffffffff]);
    expect(parsed.missiles[0].at40).toBe(F32_DENORMAL);
    expect([...parsed.guns[0].name].some(code => code.charCodeAt(0) >= 0x80)).toBe(true);
    // Pointers are positions: crossed bodies, both weapon arrays, mount links and lists within each craft.
    expect(parsed.missiles.map(({ body }) => body)).toEqual([1, 0]);
    expect(parsed.craft[0].mounts.map(({ at10, weapon, at18, at1C }) => [at10, weapon, at18, at1C])).toEqual([[0, 0, null, null], [0, 1, 2, 0], [1, 1, null, null]]);
    expect(parsed.craft[5].mounts.map(({ at10, weapon, at18, at1C }) => [at10, weapon, at18, at1C])).toEqual([[1, 0, null, 1], [0, 1, 0, null]]);
    expect(parsed.craft[5].mountLists).toEqual([[1], [0, 1, 0], [1]]);
    // Boxed shapes do not carry the radius and bounds the load code derives; unboxed shapes keep them.
    expect([parsed.craft[0].collision.at00, parsed.craft[0].collision.at08, parsed.craft[1].collision.at00]).toEqual([null, null, 0]);
    expect(parsed.missileBodies[0].collision).toEqual({ at00: 0.5, at04: 0.25, at08: [-1, -2, -3, 1, 2, 3], at28: 9, at2C: [-0.5, 0, 0, 0.5, 1, 1] });
    expect(parsed.hitDamageScale).toBe(info.hitDamageScale);
  });

  it('follows the input values', () => {
    const plain = readCraftInfo(syntheticCraftInfo());
    expect(parseInfo(syntheticCraftInfoBlock(plain), plain.hitDamageScale)).toEqual(plain);
    expect(parseInfo(syntheticCraftInfoBlock(plain), -2).hitDamageScale).toBe(-2);
    expect(parseInfo(syntheticCraftInfoBlock(plain))).not.toEqual(parseInfo(syntheticCraftInfoBlock(defaultCraftInfo())));
  });

  it('reads unaligned pointers through an unordered relocation table, ignoring the positions the load code writes', () => {
    const block = syntheticCraftInfoBlock(defaultCraftInfo());
    const { guns, missiles, craft, bodies } = block.offsets;
    expect([guns, missiles, craft, bodies].every(start => start % 2 === 1)).toBe(true);
    const sorted = [...block.relocations].sort((left, right) => left - right);
    expect(block.relocations).not.toEqual(sorted);
    expect(block.relocations).not.toEqual([...sorted].reverse());
    // Index words and derived values (craft.md §3.8) hold a NaN with bit 31 set, which reading would reject.
    const view = new DataView(block.bytes.buffer);
    const overwritten = [
      ...[0x00, 0x0c, 0x10].map(offset => guns + offset),
      ...[0x00, 0x08, 0x0c, 0x10, 0x2c, 0x50].map(offset => missiles + offset),
      ...[0x10, 0x14, 0x18, 0x1c, 0x20, 0x24, 0x28, 0x2c].map(offset => craft + offset),
      craft + CRAFT_BYTES + 0x14,
    ];
    expect(overwritten.map(at => view.getUint32(at, true))).toEqual(overwritten.map(() => JUNK));
    expect(() => parseInfo(block)).not.toThrow();
  });

  const with0 = (info: CraftInfo, change: Partial<CraftRecord>): CraftInfo =>
    ({ ...info, craft: info.craft.map((record, index) => (index === 0 ? { ...record, ...change } : record)) });
  const repeat = <T>(count: number, item: T): T[] => Array.from({ length: count }, () => item);

  it.each<[string, number, string, (count: number, info: CraftInfo) => CraftInfo]>([
    ['guns', CRAFT_INFO_LIMITS.guns, '/guns', (count, info) => ({ ...info, guns: repeat(count, info.guns[0]) })],
    ['missiles', CRAFT_INFO_LIMITS.missiles, '/missiles', (count, info) => ({ ...info, missiles: repeat(count, info.missiles[1]) })],
    ['missile bodies', CRAFT_INFO_LIMITS.missileBodies, '/missileBodies', (count, info) => ({ ...info, missileBodies: repeat(count, info.missileBodies[0]) })],
    ['mounts', CRAFT_INFO_LIMITS.mounts, '/craft[0]/mounts', (count, info) => with0(info, { mounts: repeat(count, info.craft[0].mounts[0]) })],
    ['boxes', CRAFT_INFO_LIMITS.boxes, '/craft[0]/collision/boxes', (count, info) =>
      with0(info, { collision: { ...info.craft[0].collision, boxes: repeat(count, info.craft[0].collision.boxes[1]) } })],
    ['mount-list entries', CRAFT_INFO_LIMITS.mountListEntries, '/craft[0]/mountLists[2]', (count, info) =>
      with0(info, { mountLists: [info.craft[0].mountLists[0], info.craft[0].mountLists[1], repeat(count, 2)] })],
    ['pairs', CRAFT_INFO_LIMITS.pairs, '/craft[0]/pairs', (count, info) => with0(info, { pairs: repeat(count, info.craft[0].pairs[1]) })],
  ])('accepts %s at the limit and rejects one more before reading them', (_, limit, path, build) => {
    const info = build(limit, defaultCraftInfo());
    expect(parseInfo(syntheticCraftInfoBlock(info), info.hitDamageScale)).toEqual(info);
    expectSourceError(() => parseInfo(syntheticCraftInfoBlock(build(limit + 1, info))), 'limit-exceeded', `${infoAt}${path}`,
      { name: 'payloadItems', limit, observed: limit + 1 });
  });

  it('accepts texts and entries at the limit and rejects one byte more', () => {
    const limit = CRAFT_INFO_LIMITS.nameBytes;
    const info = defaultCraftInfo();
    const named = (length: number): CraftInfo => ({ ...info, guns: [{ ...info.guns[0], name: text(length) }, info.guns[1]] });
    expect(parseInfo(syntheticCraftInfoBlock(named(limit)), info.hitDamageScale)).toEqual(named(limit));
    expect(parseInfo(syntheticCraftInfoBlock(named(0)), info.hitDamageScale).guns[0].name).toBe('');
    expectSourceError(() => parseInfo(syntheticCraftInfoBlock(named(limit + 1))), 'limit-exceeded', `${infoAt}/guns[0]/name`,
      { name: 'textBytes', limit, observed: limit + 1 });

    const block = syntheticCraftInfoBlock(info);
    expect(parseInfo(resized(block, CRAFT_INFO_ENTRY_BYTES), info.hitDamageScale)).toEqual(info);
    expectSourceError(() => parseInfo(resized(block, CRAFT_INFO_ENTRY_BYTES + 1)), 'limit-exceeded', infoAt,
      { name: 'payloadEntryBytes', limit: CRAFT_INFO_ENTRY_BYTES, observed: CRAFT_INFO_ENTRY_BYTES + 1 });
    expect(CRAFT_INFO_ENTRY_BYTES).toBe(2 ** Math.ceil(Math.log2(18_619 * 2)));
  });

  it('checks a declared count against its limit before the array bounds', () => {
    const block = syntheticCraftInfoBlock(defaultCraftInfo());
    editor(block).word(0x04, 0x7fff_ffff);
    expectSourceError(() => parseInfo(block), 'limit-exceeded', `${infoAt}/guns`, { name: 'payloadItems', limit: CRAFT_INFO_LIMITS.guns, observed: 0x7fff_ffff });
  });

  /** A case edits the default block through its offsets: the record starts by array and index. */
  type Edit = (edit: ReturnType<typeof editor>, at: Records, block: SyntheticBlock & { offsets: CinfOffsets }) => void;
  interface Records {
    gun(index: number): number;
    missile(index: number): number;
    craft(index: number): number;
    body(index: number): number;
    mount(craft: number, index: number): number;
  }
  const records = ({ guns, missiles, craft, bodies, mounts }: CinfOffsets): Records => ({
    gun: index => guns + index * GUN_BYTES,
    missile: index => missiles + index * MISSILE_BYTES,
    craft: index => craft + index * CRAFT_BYTES,
    body: index => bodies + index * CRAFT_BYTES,
    mount: (record, index) => mounts[record] + index * MOUNT_BYTES,
  });

  it.each<[string, Edit, 'invalid-payload' | 'unsupported-payload', string]>([
    // Header and arrays.
    ['a block shorter than its header', (_, __, block) => {
      block.bytes = block.bytes.slice(0, 0x1f);
      block.relocations = block.relocations.filter(at => at < 0x1c);
    }, 'invalid-payload', '/header'],
    ['19 craft records', edit => edit.word(0x14, 19), 'unsupported-payload', '/craft'],
    ['21 craft records', edit => edit.word(0x14, 21), 'unsupported-payload', '/craft'],
    ['a negative gun count', edit => edit.word(0x04, -1), 'unsupported-payload', '/guns'],
    ['a body count with bit 31 set', edit => edit.word(0x1c, 0x8000_0001), 'unsupported-payload', '/missileBodies'],
    ['an array past the block end', edit => edit.word(0x1c, 3), 'invalid-payload', '/missileBodies'],
    ['a null array pointer with a count', edit => {
      edit.word(0x00, 0);
      edit.unlist(0x00);
    }, 'invalid-payload', '/guns'],
    ['an array pointer with a zero count', edit => edit.word(0x0c, 0), 'unsupported-payload', '/missiles'],
    ['an array overlapping the header', edit => edit.word(0x00, 0x10), 'invalid-payload', '/guns'],
    // Pointers and relocations.
    ['an unlisted text pointer', (edit, at) => edit.unlist(at.gun(0) + 0x04), 'invalid-payload', '/guns[0]/name'],
    ['a relocation at a value field', (edit, at) => edit.pointTo(at.gun(0) + 0x08, 0x40), 'invalid-payload', '/guns[0]'],
    ['a relocation at an overwritten position', (edit, at) => edit.pointTo(at.missile(0) + 0x2c, 0x40), 'invalid-payload', '/missiles[0]'],
    ['a relocation inside a text', (edit, at, block) => {
      const name = edit.view.getUint32(at.gun(1) + 0x04, true);
      block.relocations.push(name + 1);
    }, 'invalid-payload', '/guns[1]/name'],
    ['a text without a NUL before the block end', (edit, at, block) => {
      block.bytes[block.bytes.length - 1] = 0x41;
      edit.pointTo(at.gun(0) + 0x04, block.bytes.length - 1);
    }, 'invalid-payload', '/guns[0]/name'],
    ['a null missile body pointer', (edit, at) => {
      edit.word(at.missile(0) + 0x14, 0);
      edit.unlist(at.missile(0) + 0x14);
    }, 'invalid-payload', '/missiles[0]/body'],
    ['a missile body pointer at a gun record', (edit, at) => edit.pointTo(at.missile(0) + 0x14, at.gun(0)), 'unsupported-payload', '/missiles[0]/body'],
    ['a missile body pointer inside a body record', (edit, at) => edit.pointTo(at.missile(1) + 0x14, at.body(0) + 4), 'unsupported-payload', '/missiles[1]/body'],
    ['a gun mount naming a missile record', (edit, at) => edit.pointTo(at.mount(0, 0) + 0x14, at.missile(0)), 'unsupported-payload', '/craft[0]/mounts[0]/weapon'],
    ['a missile mount naming a gun record', (edit, at) => edit.pointTo(at.mount(0, 2) + 0x14, at.gun(1)), 'unsupported-payload', '/craft[0]/mounts[2]/weapon'],
    ['a weapon kind of 2', (edit, at) => edit.word(at.mount(0, 0) + 0x10, 2), 'unsupported-payload', '/craft[0]/mounts[0]/at10'],
    ['a mount link to another craft\'s mount', (edit, at) => edit.pointTo(at.mount(0, 1) + 0x18, at.mount(5, 0)), 'unsupported-payload', '/craft[0]/mounts[1]/at18'],
    ['a mount link inside a mount', (edit, at) => edit.pointTo(at.mount(5, 0) + 0x1c, at.mount(5, 0) + 8), 'unsupported-payload', '/craft[5]/mounts[0]/at1C'],
    ['a mount-list entry naming another craft\'s mount', (edit, at, block) =>
      edit.pointTo(block.offsets.mountLists[5][1] + 8, at.mount(0, 0)), 'unsupported-payload', '/craft[5]/mountLists[1]/entries[2]'],
    ['a negative box count', (edit, at) => edit.word(at.craft(0) + 0x34, -1), 'unsupported-payload', '/craft[0]/collision/boxes'],
    ['a negative mount-list count', (edit, at) => edit.word(at.craft(0) + 0xd0, -2), 'unsupported-payload', '/craft[0]/mountLists[0]'],
    // Structures own their bytes: the load code writes records in place.
    ['a text inside another text', (edit, at) => edit.pointTo(at.gun(1) + 0x04, edit.view.getUint32(at.gun(0) + 0x04, true) + 2), 'unsupported-payload', '/guns[1]/name'],
    ['a missile array overlapping the gun array', (edit, _, block) => edit.word(0x08, block.offsets.guns + GUN_BYTES), 'unsupported-payload', '/missiles'],
    ['a box array shared by two craft records', (edit, at, block) => edit.pointTo(at.craft(5) + 0x30, block.offsets.boxes[0]), 'unsupported-payload', '/craft[5]/collision/boxes'],
    ['a pair array inside a gun record', (edit, at) => edit.pointTo(at.craft(0) + 0x94, at.gun(0) + 0x0c), 'unsupported-payload', '/craft[0]/pairs'],
    ['a mount array over the header', (edit, at) => edit.pointTo(at.craft(0) + 0xe4, 0), 'unsupported-payload', '/craft[0]/mounts'],
    // Untyped bytes that are zero in the baseline.
    ['a non-zero gun +0x29', (edit, at) => edit.word(at.gun(1) + 0x28, 0x100), 'unsupported-payload', '/guns[1]/at29'],
    ['a non-zero gun +0x2B', (edit, at) => edit.word(at.gun(1) + 0x28, 0x0100_0000), 'unsupported-payload', '/guns[1]/at29'],
    ['a non-zero missile +0x19', (edit, at) => edit.word(at.missile(0) + 0x18, 0x201), 'unsupported-payload', '/missiles[0]/at19'],
    ['a non-zero missile +0x27', (edit, at) => edit.word(at.missile(1) + 0x24, 0x8000_0000), 'unsupported-payload', '/missiles[1]/at25'],
    ['a non-zero mount +0x13', (edit, at) => edit.word(at.mount(5, 1) + 0x10, 0x0100_0000), 'unsupported-payload', '/craft[5]/mounts[1]/at11'],
    // Sign-neutral integers and f32 values.
    ['a gun int32 with bit 31 set', (edit, at) => edit.word(at.gun(0) + 0x18, 0x8000_0000), 'unsupported-payload', '/guns[0]/at18'],
    ['a craft int32 element with bit 31 set', (edit, at) => edit.word(at.craft(2) + 0x6c, -1), 'unsupported-payload', '/craft[2]/at64'],
    ['a pair int32 with bit 31 set', (edit, _, block) => edit.word(block.offsets.pairs[0] + PAIR_BYTES + 4, -3), 'unsupported-payload', '/craft[0]/pairs[1]/at04'],
    ['a shape int32 with bit 31 set', (edit, at) => edit.word(at.craft(1) + 0x38, 0x9000_0000), 'unsupported-payload', '/craft[1]/collision/at28'],
    ['a body int32 with bit 31 set', (edit, at) => edit.word(at.body(0) + 0xc8, -1), 'unsupported-payload', '/missileBodies[0]/atC8'],
    ['a negative zero gun f32', (edit, at) => edit.f32(at.gun(0) + 0x08, -0), 'unsupported-payload', '/guns[0]/at08'],
    ['a negative zero shape bound', (edit, at) => edit.f32(at.craft(1) + 0x20, -0), 'unsupported-payload', '/craft[1]/collision/at08'],
    ['a negative zero mount f32', (edit, at) => edit.f32(at.mount(0, 0) + 0x28, -0), 'unsupported-payload', '/craft[0]/mounts[0]/at24'],
    ['a negative zero body shape f32', (edit, at) => edit.f32(at.body(1) + 0x14, -0), 'unsupported-payload', '/missileBodies[1]/collision/at04'],
    ['a NaN missile f32', (edit, at) => edit.word(at.missile(0) + 0x40, 0x7fc0_0000), 'invalid-payload', '/missiles[0]/at40'],
    ['an infinite box corner', (edit, _, block) => edit.f32(block.offsets.boxes[0] + BOX_BYTES + 20, Infinity), 'invalid-payload', '/craft[0]/collision/boxes[1]/upper'],
    // Missile body records have no target structures.
    ['a body pair count', (edit, at) => edit.word(at.body(0) + 0x98, 1), 'unsupported-payload', '/missileBodies[0]/pairs'],
    ['a body mount-list count', (edit, at) => edit.word(at.body(0) + 0xe0, 1), 'unsupported-payload', '/missileBodies[0]/mountLists[2]'],
    ['a body text pointer', (edit, at) => edit.pointTo(at.body(1) + 0x04, at.gun(0)), 'unsupported-payload', '/missileBodies[1]/name'],
    ['a body mount pointer', (edit, at) => edit.pointTo(at.body(0) + 0xe4, at.craft(0)), 'unsupported-payload', '/missileBodies[0]/mounts'],
    ['an unlisted body box pointer', (edit, at) => edit.word(at.body(1) + 0x30, 0x40), 'invalid-payload', '/missileBodies[1]/collision/boxes'],
  ])('rejects %s', (_, change, code, path) => {
    const block = syntheticCraftInfoBlock(defaultCraftInfo());
    change(editor(block), records(block.offsets), block);
    expectSourceError(() => parseInfo(block), code, `${infoAt}${path}`);
  });
});
