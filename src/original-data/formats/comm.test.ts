import { describe, expect, it } from 'vitest';
import { COMM_MENUS_LIMITS, readCommMenus, type CommMenus } from '../../content/rule-data/comm-menus.ts';
import { commandItem, deepFrozen, syntheticCommMenus } from '../../content/rule-data/rule-data.test-support.ts';
import { COMM_MENU_ENTRY_BYTES, parseCommMenus } from './comm.ts';
import {
  COMM_ITEM_BYTES, COMM_MENU_IDS, COMM_NOB, commMenuReads, defaultCommMenus, syntheticCommTable, syntheticCommTables, type CommTable,
} from './comm.test-support.ts';
import type { SourceErrorCode } from '../source-error.ts';
import { MARKER, expectSourceError, resized, text } from './craft.test-support.ts';
import type { SyntheticBlock } from './formats.test-support.ts';

// P3-03 AC-06 (COMM part), AC-14 and AC-18: code-generated COMM menu tables only.

type Tables = Readonly<Record<keyof CommMenus, SyntheticBlock>>;

const location = (key: keyof CommMenus) => `archive:/${COMM_NOB}#${COMM_MENU_IDS[key]}`;
const parse = (tables: Tables) => parseCommMenus(COMM_NOB, commMenuReads(tables));
const command = (itemText: string, value: number) => ({ text: itemText, command: value });
const powerOfTwoAbove = (observed: number) => 2 ** Math.ceil(Math.log2(observed * 2));

/** The default menus with every 2003 text long enough to carry the whole MARKER, which no diagnostic may show. */
const markedMenus = (): CommMenus =>
  readCommMenus({ ...syntheticCommMenus(), gatedTargetCommands: [commandItem(1, 24), commandItem(0xffff_ffff, 20), commandItem(0, 17)] });

/** The marked menus' tables after `edit` changed the 2003 table. */
function edited(edit: (table: CommTable, view: DataView) => void): Tables {
  const tables = syntheticCommTables(markedMenus());
  edit(tables.gatedTargetCommands, new DataView(tables.gatedTargetCommands.bytes.buffer));
  return tables;
}

describe('COMM menu table parsing', () => {
  it('converts the five menus as stored, each list up to and including its last item', () => {
    const menus = defaultCommMenus();
    const parsed = parse(syntheticCommTables(menus));
    expect(parsed).toEqual(menus);
    expect(deepFrozen(parsed)).toBe(true);
    expect(readCommMenus(parsed)).toEqual(parsed);
    expect(parsed.gatedTargetCommands.map(item => item.command)).toEqual([1, 0xffff_ffff, 0]);
    expect(parsed.categories.map(item => item.kindMask)).toEqual([0x1, 0x8_0000, 0]);
    expect(parsed.otherTargetCommands).toHaveLength(1);
    // Bytes of 0x80 and above are kept, and an empty text is a text.
    expect(parsed.categories[2].text).toBe(text(32));
    expect([...parsed.categories[2].text].some(character => character.charCodeAt(0) === 0xff)).toBe(true);
    expect(parsed.gatedTargetCommands[0].text.charCodeAt(0)).toBe(0x80);
    expect(parsed.kind2TargetCommands.map(item => item.text)).toEqual([text(10), text(1), '']);
  });

  it('follows the input values, and the caller pairs each table with its key', () => {
    const other = readCommMenus({
      gatedTargetCommands: [command('Ax', 3), command('\x01\xfe', 0)],
      otherTargetCommands: [command('Bq', 2), command('Cr', 0x7fff_ffff), command('', 0)],
      categories: [{ text: 'Kx', kindMask: 0x40 }, { text: 'Lz', kindMask: 0 }],
      objectListLastEntry: '\x7f',
      kind2TargetCommands: [command('Zz', 0)],
    });
    expect(parse(syntheticCommTables(other))).toEqual(other);
    expect(other).not.toEqual(defaultCommMenus());
    const tables = syntheticCommTables(other);
    const swapped = parse({ ...tables, gatedTargetCommands: tables.otherTargetCommands, otherTargetCommands: tables.gatedTargetCommands });
    expect([swapped.gatedTargetCommands, swapped.otherTargetCommands]).toEqual([other.otherTargetCommands, other.gatedTargetCommands]);
  });

  it('reads unaligned text pointers through an unordered relocation table', () => {
    const tables = syntheticCommTables(defaultCommMenus());
    for (const table of Object.values(tables)) expect(table.texts.every(start => start % 2 === 1)).toBe(true);
    const { relocations } = tables.gatedTargetCommands;
    const sorted = [...relocations].sort((left, right) => left - right);
    expect(sorted).toEqual([0, 8, 16]);
    expect(relocations).not.toEqual(sorted);
    expect(relocations).not.toEqual([...sorted].reverse());
    expect(parse(tables)).toEqual(defaultCommMenus());
  });

  it('reads nothing past each last item, nor anything of TABL 2009 but item 0', () => {
    const menus = defaultCommMenus();
    const tables = syntheticCommTables(menus);
    // An item after the last one, trailing bytes and a relocation no read item names.
    const longer = syntheticCommTable([...menus.categories.map(({ text: itemText, kindMask }) => [itemText, kindMask] as const), [text(20), 0xffff_ffff]]);
    const trailing = resized(longer, longer.bytes.length + 9);
    trailing.bytes.fill(0xff, longer.bytes.length);
    trailing.relocations = [...trailing.relocations, longer.bytes.length + 2];
    const objectList = syntheticCommTable([[menus.objectListLastEntry, 0], ['\x01', 7], ['', 0xffff_ffff]]);
    expect(parse({ ...tables, categories: trailing, objectListLastEntry: objectList })).toEqual(menus);
  });

  it('accepts a list and a text at their limits and rejects one more before reading it', () => {
    const items = (count: number) => Array.from({ length: count }, (_, index) => command(`K${index}`, index === count - 1 ? 0 : index + 1));
    const withList = (list: ReturnType<typeof items>) => syntheticCommTables({ ...defaultCommMenus(), otherTargetCommands: list });
    expect(parse(withList(items(COMM_MENUS_LIMITS.items))).otherTargetCommands).toEqual(items(COMM_MENUS_LIMITS.items));
    expectSourceError(() => parse(withList(items(COMM_MENUS_LIMITS.items + 1))), 'limit-exceeded', `${location('otherTargetCommands')}/items`,
      { name: 'commMenuItems', limit: COMM_MENUS_LIMITS.items, observed: COMM_MENUS_LIMITS.items + 1 });

    const limit = COMM_MENUS_LIMITS.textBytes;
    const withText = (length: number) => syntheticCommTables({ ...defaultCommMenus(), categories: [{ text: text(length), kindMask: 4 }, { text: 'x', kindMask: 0 }] });
    expect(parse(withText(limit)).categories[0].text).toBe(text(limit));
    expectSourceError(() => parse(withText(limit + 1)), 'limit-exceeded', `${location('categories')}/items[0]/text`,
      { name: 'textBytes', limit, observed: limit + 1 });
    const withEntry = (length: number) => syntheticCommTables({ ...defaultCommMenus(), objectListLastEntry: text(length) });
    expect(parse(withEntry(limit)).objectListLastEntry).toBe(text(limit));
    expectSourceError(() => parse(withEntry(limit + 1)), 'limit-exceeded', `${location('objectListLastEntry')}/items[0]/text`,
      { name: 'textBytes', limit, observed: limit + 1 });
  });

  it('limits each entry before reading it', () => {
    const tables = syntheticCommTables(defaultCommMenus());
    expect(parse({ ...tables, kind2TargetCommands: resized(tables.kind2TargetCommands, COMM_MENU_ENTRY_BYTES) })).toEqual(defaultCommMenus());
    expectSourceError(() => parse({ ...tables, kind2TargetCommands: resized(tables.kind2TargetCommands, COMM_MENU_ENTRY_BYTES + 1) }),
      'limit-exceeded', location('kind2TargetCommands'), { name: 'payloadEntryBytes', limit: COMM_MENU_ENTRY_BYTES, observed: COMM_MENU_ENTRY_BYTES + 1 });
    // The largest observed table, TABL 2013, is 166 bytes; lists of 8 items and texts of 15 bytes (comm.md §5).
    expect(COMM_MENU_ENTRY_BYTES).toBe(powerOfTwoAbove(166));
    expect(COMM_MENUS_LIMITS).toEqual({ items: powerOfTwoAbove(8), textBytes: powerOfTwoAbove(15) });
  });

  it('rejects a list with no last item inside the block', () => {
    const tables = syntheticCommTables(defaultCommMenus());
    const open = syntheticCommTable([['a', 1], ['b', 2]]);
    expectSourceError(() => parse({ ...tables, otherTargetCommands: resized(open, 2 * COMM_ITEM_BYTES) }), 'invalid-payload',
      `${location('otherTargetCommands')}/items`);
  });

  const at2003 = location('gatedTargetCommands');
  it.each<[string, (table: CommTable, view: DataView) => void, SourceErrorCode, string]>([
    ['a relocation in a value field', table => table.relocations.push(COMM_ITEM_BYTES + 4), 'invalid-payload', '/items[1]/command'],
    ['a text pointer missing from the relocation table', table => table.relocations.splice(table.relocations.indexOf(COMM_ITEM_BYTES), 1), 'invalid-payload', '/items[1]/text'],
    ['a null text pointer', (table, view) => {
      table.relocations.splice(table.relocations.indexOf(COMM_ITEM_BYTES), 1);
      view.setUint32(COMM_ITEM_BYTES, 0, true);
    }, 'invalid-payload', '/items[1]/text'],
    ['a text pointer past the block', (table, view) => view.setUint32(COMM_ITEM_BYTES, table.bytes.length, true), 'invalid-payload', '/items[1]/text'],
    ['a text pointer into an item', (_table, view) => view.setUint32(COMM_ITEM_BYTES, 2 * COMM_ITEM_BYTES, true), 'unsupported-payload', '/items[1]/text'],
    ['a text pointer to the last byte of the list', (_table, view) => view.setUint32(COMM_ITEM_BYTES, 3 * COMM_ITEM_BYTES - 1, true), 'unsupported-payload', '/items[1]/text'],
    ['a relocation inside a text', table => table.relocations.push(table.texts[1] + 5), 'invalid-payload', '/items[1]/text'],
    ['a relocation over the NUL of a text', table => table.relocations.push(table.texts[1] + 20), 'invalid-payload', '/items[1]/text'],
    ['a relocation reaching into a text from the byte before it', table => table.relocations.push(table.texts[1] - 1), 'invalid-payload', '/items[1]/text'],
  ])('rejects %s', (_name, edit, code, path) => {
    expectSourceError(() => parse(edited(edit)), code, `${at2003}${path}`);
  });

  it('rejects a text without its NUL inside the block', () => {
    // The corrupted texts carry MARKER, which expectSourceError keeps out of every diagnostic.
    expect(markedMenus().gatedTargetCommands.every(item => item.text.includes(MARKER))).toBe(true);
    const tables = syntheticCommTables(markedMenus());
    const table = tables.gatedTargetCommands;
    expectSourceError(() => parse({ ...tables, gatedTargetCommands: resized(table, table.bytes.length - 1) }), 'invalid-payload', `${at2003}/items[2]/text`);
  });

  it('accepts a text pointer to the first byte past the list', () => {
    // The synthetic layout pads the first text to an odd offset with a zero byte, which is an empty text.
    const parsed = parse(edited((_table, view) => view.setUint32(COMM_ITEM_BYTES, 3 * COMM_ITEM_BYTES, true)));
    expect(parsed.gatedTargetCommands[1]).toEqual({ text: '', command: 0xffff_ffff });
  });

  it('rejects a non-zero TABL 2009 value as unsupported and a relocation over it as invalid', () => {
    const at2009 = `${location('objectListLastEntry')}/items[0]/value`;
    const tables = syntheticCommTables({ ...markedMenus(), objectListLastEntry: text(24) });
    const table = tables.objectListLastEntry;
    const view = new DataView(table.bytes.buffer);
    view.setUint32(4, 1, true);
    expectSourceError(() => parse(tables), 'unsupported-payload', at2009);
    view.setUint32(4, 0, true);
    table.relocations.push(4);
    expectSourceError(() => parse(tables), 'invalid-payload', at2009);
  });
});
