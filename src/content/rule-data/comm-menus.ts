import { byteStrings, invalid, readList, readU32, records, type ByteString, type Shape } from './rule-data-fields.ts';

// Canonical content of `data/comm-menus` (P3-03 spec S-06): the five menu tables of COMM.NOB the flight loop loads, with
// the structure of docs/original/formats/comm.md. Texts are byte strings as stored (comm.md §4): which bytes the menus
// replace, show or match as keys is P3-10's and P3-13's. Item values are kept as stored; the menu state machine and the
// commands belong to P3-10 and P3-08 (U-001).

/** Structural limits: twice the maximum of comm.md §5, rounded up to a power of two (8 items in one menu, texts 15 bytes). */
export const COMM_MENUS_LIMITS = Object.freeze({ items: 16, textBytes: 32 });

/** An item of a command menu (comm.md §1, §3; U-001). */
export interface CommandItem {
  /** +0x00 pointer to the item text. */
  readonly text: ByteString;
  /** +0x04 u32 command code; 0 exactly in the last item, which ends the list. */
  readonly command: number;
}

/** An item of the category menu (comm.md §1, §3; U-001). */
export interface CategoryItem {
  /** +0x00 pointer to the item text. */
  readonly text: ByteString;
  /** +0x04 u32 kind mask; 0 exactly in the last item, which ends the list. */
  readonly kindMask: number;
}

/** The menus by the condition that selects them (comm.md §2), in entry ID order; each list is in source order up to and including its last item. */
export interface CommMenus {
  /** TABL 2003: the command menu of a target whose kind is in the mask 0x68000 while `0x394c4(0, target)` and `0x33390()` both return 1. */
  readonly gatedTargetCommands: readonly CommandItem[];
  /** TABL 2005: the command menu of any other target. */
  readonly otherTargetCommands: readonly CommandItem[];
  /** TABL 2007: the category menu of key `c` in flight. */
  readonly categories: readonly CategoryItem[];
  /** TABL 2009: item 0's text, the last entry of the object list built for a chosen category; its value is not read. */
  readonly objectListLastEntry: ByteString;
  /** TABL 2013: the command menu of a target whose kind is exactly 2. */
  readonly kind2TargetCommands: readonly CommandItem[];
}

const readText = byteStrings(COMM_MENUS_LIMITS.textBytes);

/** A list of 1 to `items` items whose value field is 0 in the last item only, as the builders end each list there. */
function menus<T>(shape: Shape<T>, value: keyof T & string) {
  const readItem = records(shape);
  return (input: unknown, path: string): readonly T[] => {
    const items = readList(input, path, COMM_MENUS_LIMITS.items, readItem, 1);
    items.forEach((item, index) => {
      if ((item[value] === 0) !== (index === items.length - 1)) invalid(`${path}[${index}].${value}`, 'must be 0 exactly in the last item');
    });
    return items;
  };
}

const COMMAND: Shape<CommandItem> = { text: readText, command: readU32 };
const CATEGORY: Shape<CategoryItem> = { text: readText, kindMask: readU32 };
const readCommands = menus(COMMAND, 'command');

const readMenus = records<CommMenus>({
  gatedTargetCommands: readCommands,
  otherTargetCommands: readCommands,
  categories: menus(CATEGORY, 'kindMask'),
  objectListLastEntry: readText,
  kind2TargetCommands: readCommands,
});

/** Strictly reads `data/comm-menus` content into frozen data isolated from `value`. */
export const readCommMenus = (value: unknown, path = 'commMenus'): CommMenus => readMenus(value, path);
