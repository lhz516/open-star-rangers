import { readCommMenus, type CommMenus } from '../../content/rule-data/comm-menus.ts';
import { syntheticCommMenus } from '../../content/rule-data/rule-data.test-support.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import type { CommMenuReads } from './comm.ts';
import { BlockWriter } from './craft.test-support.ts';
import { entryRead, type SyntheticBlock } from './formats.test-support.ts';

// Code-generated synthetic COMM menu tables for P3-03 tests, laid out from canonical content with the structure of
// docs/original/formats/comm.md §1: the items {text pointer, value} from offset 0, then the texts in item order. Every text
// starts at an odd offset, so pointers are unaligned, and relocation tables are out of order. They never hold original
// data; their numbers are arbitrary synthetic values and their texts carry MARKER.

export const COMM_NOB = 'MAIN/COMM.NOB' as DiscPath;

/** The menu tables' entry IDs by content key (comm.md §2). */
export const COMM_MENU_IDS: Readonly<Record<keyof CommMenus, number>> = Object.freeze({
  gatedTargetCommands: 2003, otherTargetCommands: 2005, categories: 2007, objectListLastEntry: 2009, kind2TargetCommands: 2013,
});

export const COMM_ITEM_BYTES = 8;

/** A synthetic table and the offset of each item's text, for tests that corrupt specific fields. */
export type CommTable = SyntheticBlock & { readonly texts: readonly number[] };

export type CommTables = { [K in keyof CommMenus]: CommTable };

/** Lays out a menu table of `items`: the item array, then each text after one padding byte when it would start at an even offset. */
export function syntheticCommTable(items: readonly (readonly [text: string, value: number])[]): CommTable {
  const writer = new BlockWriter();
  writer.alloc(items.length * COMM_ITEM_BYTES);
  const texts = items.map(([text, value], index) => {
    if (writer.length % 2 === 0) writer.alloc(1);
    const at = writer.text(text);
    writer.pointer(index * COMM_ITEM_BYTES, at).word(index * COMM_ITEM_BYTES + 4, value);
    return at;
  });
  return { ...writer.toBlock(), texts };
}

/** Lays out the five menu tables of `menus`; TABL 2009 holds one item whose value is 0. */
export function syntheticCommTables(menus: CommMenus): CommTables {
  const commands = (list: CommMenus['gatedTargetCommands']) => syntheticCommTable(list.map(({ text, command }) => [text, command]));
  return {
    gatedTargetCommands: commands(menus.gatedTargetCommands),
    otherTargetCommands: commands(menus.otherTargetCommands),
    categories: syntheticCommTable(menus.categories.map(({ text, kindMask }) => [text, kindMask])),
    objectListLastEntry: syntheticCommTable([[menus.objectListLastEntry, 0]]),
    kind2TargetCommands: commands(menus.kind2TargetCommands),
  };
}

/** The entry read of each table, as `ImfatArchiveHandle.read` returns it. */
export function commMenuReads(tables: Readonly<Record<keyof CommMenus, SyntheticBlock>>): CommMenuReads {
  const read = (key: keyof CommMenus) => entryRead(COMM_MENU_IDS[key], 'TABL', tables[key]);
  return {
    gatedTargetCommands: read('gatedTargetCommands'),
    otherTargetCommands: read('otherTargetCommands'),
    categories: read('categories'),
    objectListLastEntry: read('objectListLastEntry'),
    kind2TargetCommands: read('kind2TargetCommands'),
  };
}

/**
 * The content test support's menus, read strictly: lists of 1 to 3 items, texts of 0 to 32 bytes with 0x80 and 0xFF, and
 * a command code with bit 31 set.
 */
export const defaultCommMenus = (): CommMenus => readCommMenus(syntheticCommMenus());
