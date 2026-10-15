import { COMM_MENUS_LIMITS, type CategoryItem, type CommandItem, type CommMenus } from '../../content/rule-data/comm-menus.ts';
import { COMM_MESSAGES_LIMITS } from '../../content/rule-data/comm-messages.ts';
import type { ByteString } from '../../content/rule-data/rule-data-fields.ts';
import type { ArchiveEntryRead } from '../archive/archive-reader.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import { PayloadBlock } from './payload-block.ts';

// Directed parsing of the five COMM.NOB menu tables (docs/original/formats/comm.md) into `data/comm-menus` content (P3-03
// spec, S-06). A table is a list of 8-byte items {u32 text pointer, u32 value} from offset 0, read up to and including the
// first item whose value is 0 (§1); TABL 2009 is read as its item 0 only (§2). Texts are kept as stored (text rule 8): the
// bytes the builders replace, draw or match as keys are P3-10's and P3-13's. Bytes no read item names are not checked.

/** Entry limit of a COMM menu table: twice the largest, 166 bytes (comm.md §5), rounded up to a power of two. */
export const COMM_MENU_ENTRY_BYTES = 512;

/** Entry limit of a COMM name list, TABL 2001 or 2011: twice the larger, 229 bytes (comm.md §9), rounded up to a power of two. */
export const COMM_NAME_LIST_ENTRY_BYTES = 512;

const ITEM_BYTES = 8;

/** The entry read of each menu table, keyed by the condition that selects it (comm.md §2); the caller pairs them. */
export type CommMenuReads = { readonly [K in keyof CommMenus]: ArchiveEntryRead };

/**
 * The NUL-terminated text the pointer at `offset` names, as a byte string of at most `limit` bytes kept as stored; at
 * most one byte past the limit is examined, and no relocation may overlap the text or its NUL. Field rule 4: the pointer
 * must target a text, which lies past the `listBytes` of the item list.
 */
function readText(block: PayloadBlock, bytes: Uint8Array, offset: number, listBytes: number, path: string, limit = COMM_MENUS_LIMITS.textBytes): ByteString {
  const start = block.target(offset, 1, path);
  if (start < listBytes) block.unsupported(path, 'the pointer targets the item list');
  const scanned = bytes.subarray(start, Math.min(bytes.length, start + limit + 1));
  const length = scanned.indexOf(0);
  if (length === -1) {
    if (scanned.length <= limit) block.invalid(path, 'the text has no terminating NUL');
    block.limit(path, 'textBytes', limit, scanned.length);
  }
  for (let at = start - 3; at <= start + length; at++) {
    if (block.isRelocated(at)) block.invalid(path, 'a relocation overlaps the text');
  }
  return String.fromCharCode(...scanned.subarray(0, length));
}

/** The items of a command or category table as [text, value] pairs, the last one being the first whose value is 0. */
function readItems(archive: DiscPath, read: ArchiveEntryRead, field: 'command' | 'kindMask'): [ByteString, number][] {
  const block = new PayloadBlock(archive, read, COMM_MENU_ENTRY_BYTES);
  const values: number[] = [];
  do {
    const index = values.length;
    block.require(index * ITEM_BYTES, ITEM_BYTES, '/items');
    block.limit('/items', 'commMenuItems', COMM_MENUS_LIMITS.items, index + 1);
    values.push(block.u32(index * ITEM_BYTES + 4, `/items[${index}]/${field}`));
  } while (values.at(-1) !== 0);
  const listBytes = values.length * ITEM_BYTES;
  return values.map((value, index) => [readText(block, read.bytes, index * ITEM_BYTES, listBytes, `/items[${index}]/text`), value]);
}

const commands = (archive: DiscPath, read: ArchiveEntryRead): readonly CommandItem[] =>
  Object.freeze(readItems(archive, read, 'command').map(([text, command]) => Object.freeze({ text, command })));

const categories = (archive: DiscPath, read: ArchiveEntryRead): readonly CategoryItem[] =>
  Object.freeze(readItems(archive, read, 'kindMask').map(([text, kindMask]) => Object.freeze({ text, kindMask })));

/** TABL 2009: item 0's text. Its value is not read and is zero in the baseline, so a non-zero one is unsupported (field rule 6). */
function objectListLastEntry(archive: DiscPath, read: ArchiveEntryRead): ByteString {
  const block = new PayloadBlock(archive, read, COMM_MENU_ENTRY_BYTES);
  if (block.u32(4, '/items[0]/value') !== 0) block.unsupported('/items[0]/value', 'the value of the item is not zero');
  return readText(block, read.bytes, 0, ITEM_BYTES, '/items[0]/text');
}

/** Parses the five menu tables of `archive` into `data/comm-menus` content, each table from the read its key names. */
export function parseCommMenus(archive: DiscPath, reads: CommMenuReads): CommMenus {
  return Object.freeze({
    gatedTargetCommands: commands(archive, reads.gatedTargetCommands),
    otherTargetCommands: commands(archive, reads.otherTargetCommands),
    categories: categories(archive, reads.categories),
    objectListLastEntry: objectListLastEntry(archive, reads.objectListLastEntry),
    kind2TargetCommands: commands(archive, reads.kind2TargetCommands),
  });
}

/**
 * A COMM name list, TABL 2001 or 2011 (comm.md §9): relocated pointers from offset 0 up to the first null pointer, each
 * naming a NUL-terminated name past the list, kept as stored. The list length is checked before each name is read; an
 * empty name, which the baseline lacks and the name index could match, is unsupported.
 */
export function parseCommNames(archive: DiscPath, read: ArchiveEntryRead): readonly ByteString[] {
  const block = new PayloadBlock(archive, read, COMM_NAME_LIST_ENTRY_BYTES);
  const limit = COMM_MESSAGES_LIMITS.names;
  let count = 0;
  for (; count < limit; count++) if (block.pointer(count * 4, `/names[${count}]`) === null) break;
  if (count === limit) {
    // Past the limit only the terminator may follow; anything else is one name too many, judged before it is read.
    const at = limit * 4;
    block.require(at, 4, `/names[${limit}]`);
    if (block.isRelocated(at) || block.hasNonZero(at, 4, `/names[${limit}]`)) block.limit('/names', 'commNames', limit, limit + 1);
  }
  const listBytes = (count + 1) * 4;
  return Object.freeze(Array.from({ length: count }, (_, index) => {
    const path = `/names[${index}]`;
    const name = readText(block, read.bytes, index * 4, listBytes, path, COMM_MESSAGES_LIMITS.nameBytes);
    if (name.length === 0) block.unsupported(path, 'the name is empty');
    return name;
  }));
}
