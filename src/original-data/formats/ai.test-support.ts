import {
  readAiPrograms, type AiParameterEntry, type AiPrograms, type AiScriptEntry, type BuiltInProgram, type KeywordTables,
} from '../../content/rule-data/ai-programs.ts';
import { syntheticAiPrograms } from '../../content/rule-data/rule-data.test-support.ts';
import type { ExecutableRegion } from '../source-mapping.ts';
import { syntheticLeExecutable } from '../synthetic.test-support.ts';
import { AI_LAYOUT, type AiProgramSources } from './ai.ts';
import type { ObjectPosition, RegionFixup } from './le-executable.ts';
import { entryRead, type SyntheticBlock } from './formats.test-support.ts';

// Code-generated synthetic AISTUFF entries and EXE built-in table regions for P3-03 tests; they never hold original data,
// and their IDs, offsets and values deliberately differ from the original's. They encode typed `ai-programs` content in
// the layouts of docs/original/formats/ai.md, so a parse must give the content back. Relocation tables are written in
// reverse order, and positions the load code overwrites hold non-zero values that a parse must not read.

/** Synthetic entry IDs: AICO, the program table, and the entries from `entries[0]`, two apart as in IMFAT. */
export const SYNTHETIC_AI_IDS = Object.freeze({ globals: 7_101, table: 7_103, entries: 7_201 });

/** Diagnostic locations of the synthetic regions, standing for their source mapping paths. */
export const BUILT_IN_LOCATION = 'aiPrograms.regions[0]';
export const nameLocation = (index: number): string => `aiPrograms.regions[${index + 1}]`;
export const keywordTableLocation = (index: number): string => `aiPrograms.keywordTables[${index}]`;
export const keywordNameLocation = (index: number): string => `aiPrograms.keywordNames[${index}]`;

/** The synthetic object and first offset of the built-in names. */
const BUILT_IN_NAMES_AT = Object.freeze({ object: 3, offset: 0x235 });
/** The synthetic object and offset of the first keyword table, and the first offset of the keyword names (in object 4). */
const KEYWORD_TABLES_AT = Object.freeze({ object: 2, offset: 0x1a8 });
const KEYWORD_NAMES_AT = Object.freeze({ object: AI_LAYOUT.keywordNameObject, offset: 0x13b });

/** The typed content of the rule-data tests' synthetic AI programs, or of `plain` content. */
export const aiContent = (plain: unknown = syntheticAiPrograms()): AiPrograms => readAiPrograms(plain);

/** A growable little-endian block whose pointer writes are recorded as relocations. */
class Block {
  readonly #bytes: number[] = [];
  readonly #relocations: number[] = [];

  get length(): number {
    return this.#bytes.length;
  }

  /** Appends `size` zero bytes and returns their offset. */
  alloc(size: number): number {
    const at = this.#bytes.length;
    for (let index = 0; index < size; index++) this.#bytes.push(0);
    return at;
  }

  u32(at: number, value: number): this {
    for (let index = 0; index < 4; index++) this.#bytes[at + index] = (value >>> (index * 8)) & 0xff;
    return this;
  }

  f32(at: number, value: number): this {
    const view = new DataView(new ArrayBuffer(4));
    view.setFloat32(0, value, true);
    return this.u32(at, view.getUint32(0, true));
  }

  pointer(at: number, target: number): this {
    this.#relocations.push(at);
    return this.u32(at, target);
  }

  /** Appends a NUL-terminated byte string, one byte per code unit, and returns its offset. */
  text(text: string): number {
    const at = this.alloc(text.length + 1);
    for (let index = 0; index < text.length; index++) this.#bytes[at + index] = text.charCodeAt(index);
    return at;
  }

  toBlock(): SyntheticBlock {
    return { bytes: Uint8Array.from(this.#bytes), relocations: [...this.#relocations].reverse() };
  }
}

type Field = readonly [offset: number, type: 'u32' | 'f32', value: number];

const write = (block: Block, at: number, fields: readonly Field[]): void => {
  for (const [offset, type, value] of fields) block[type](at + offset, value);
};

/** The fields both program tables share, by offset (ai.md §3.1). */
const programFields = (program: Omit<BuiltInProgram, 'handler' | 'kindMask' | 'at2C'>): Field[] => [
  [0x04, 'u32', program.at04], [0x0c, 'u32', program.at0C], [0x10, 'u32', program.at10], [0x14, 'u32', program.at14],
  [0x24, 'f32', program.at24], [0x28, 'f32', program.at28], [0x30, 'f32', program.at30], [0x34, 'u32', program.at34],
  [0x38, 'u32', program.at38], [0x3c, 'f32', program.at3C], [0x40, 'f32', program.at40], [0x44, 'u32', program.at44],
  [0x48, 'f32', program.at48], [0x4c, 'f32', program.at4C], [0x50, 'u32', program.at50],
];

interface AicoOptions {
  /** Number of group triples; the content's triple is at index `group`, and the others hold other synthetic values. */
  triples?: number;
  group?: number;
}

/** AICO 6001: the header, then the triples and the 16-byte elements filling the block (ai.md §2). */
function syntheticAico({ groupTriple, globals }: AiPrograms, { triples = 3, group = 0 }: AicoOptions = {}): SyntheticBlock {
  const block = new Block();
  block.alloc(AI_LAYOUT.globalsHeaderBytes);
  const triplesAt = block.alloc(triples * AI_LAYOUT.tripleBytes);
  const elementsAt = block.alloc(globals.elements.length * AI_LAYOUT.elementBytes);
  if (triples > 0) block.pointer(0x00, triplesAt);
  block.u32(0x04, triples);
  if (globals.elements.length > 0) block.pointer(0x18, elementsAt);
  block.u32(0x1c, globals.elements.length);
  write(block, 0, [
    [0x08, 'u32', globals.at08], [0x0c, 'f32', globals.at0C], [0x10, 'f32', globals.at10], [0x14, 'f32', globals.at14],
    [0x20, 'f32', globals.at20], [0x24, 'f32', globals.at24], [0x28, 'u32', globals.at28], [0x2c, 'u32', globals.at2C],
    [0x30, 'u32', globals.at30], [0x34, 'f32', globals.at34], [0x38, 'u32', globals.at38], [0x3c, 'f32', globals.at3C],
    [0x40, 'f32', globals.at40], [0x44, 'f32', globals.at44], [0x48, 'f32', globals.at48],
  ]);
  for (let index = 0; index < triples; index++) {
    const values = index === group ? groupTriple : [index * 1_000 + 17, -(index + 23), 0x4000_0000 + index];
    values.forEach((value, item) => block.u32(triplesAt + index * AI_LAYOUT.tripleBytes + item * 4, value));
  }
  globals.elements.forEach((element, index) => element.forEach((value, item) => block.f32(elementsAt + index * AI_LAYOUT.elementBytes + item * 4, value)));
  return block.toBlock();
}

/** TABL 6003: the records, the all-zero terminator record, then the names in record order (ai.md §3.2). */
function syntheticProgramTable({ programs }: AiPrograms, ids: readonly number[]): SyntheticBlock {
  const { programBytes } = AI_LAYOUT;
  const block = new Block();
  block.alloc((programs.length + 1) * programBytes);
  programs.forEach((program, index) => {
    const record = index * programBytes;
    block.pointer(record, block.text(program.name));
    write(block, record, [
      ...programFields(program), [0x08, 'u32', program.kindMask ?? 0], [0x1c, 'u32', ids[program.parameters]],
      [0x2c, 'f32', program.at2C ?? 0],
      // Overwritten at load (ai.md §6): never read.
      [0x18, 'u32', 0x0bad_0018 + index], [0x20, 'u32', 0x00ab_cd01 + index],
    ]);
  });
  return block.toBlock();
}

/** A DFPG: the 0x6C-byte header, then the non-empty lists' IDs in list order (ai.md §4). */
function syntheticParameters(entry: AiParameterEntry, ids: readonly number[]): SyntheticBlock {
  const block = new Block();
  block.alloc(AI_LAYOUT.parameterHeaderBytes);
  write(block, 0, [
    [0x04, 'u32', entry.at04], [0x08, 'f32', entry.at08], [0x10, 'f32', entry.at10], [0x14, 'f32', entry.at14],
    [0x18, 'u32', entry.at18], [0x1c, 'u32', entry.at1C], [0x20, 'f32', entry.at20], [0x24, 'u32', entry.at24],
    [0x28, 'u32', entry.at28], [0x2c, 'f32', entry.at2C], [0x30, 'f32', entry.at30], [0x34, 'u32', entry.at34],
    [0x38, 'u32', entry.installScript === null ? 0 : ids[entry.installScript]],
    // Overwritten at load with (+0x08)² (ai.md §6): never read.
    [0x0c, 'f32', 1234.5],
  ]);
  (['state1', 'state2', 'state3', 'state5', 'state4', 'state6'] as const).forEach((state, index) => {
    const list = entry.stateScripts[state];
    const header = 0x3c + index * 8;
    block.u32(header + 4, list.length);
    if (list.length === 0) return;
    const start = block.alloc(list.length * 4);
    block.pointer(header, start);
    list.forEach((script, item) => block.u32(start + item * 4, ids[script]));
  });
  return block.toBlock();
}

/** A script TABL: the 0x18-byte items, then their texts in item order (ai.md §5). */
function syntheticScript({ items }: AiScriptEntry): SyntheticBlock {
  const size = AI_LAYOUT.scriptItemBytes;
  const block = new Block();
  block.alloc(items.length * size);
  items.forEach(({ opcode, argument, branch }, index) => {
    const item = index * size;
    block.u32(item, opcode);
    if (argument !== null) block.pointer(item + 0x04, block.text(argument));
    if (branch !== null) block.pointer(item + 0x14, branch * size);
  });
  return block.toBlock();
}

/** A built-in table region with the fixups the loader applies, and one region per name. */
interface SyntheticBuiltIn {
  bytes: Uint8Array;
  fixups: RegionFixup[];
  names: { region: ExecutableRegion; bytes: Uint8Array }[];
}

/**
 * The built-in table: the records, then their i32 count (ai.md §3.3). Each record's +0x00 and +0x18 hold the target
 * offsets of their fixups; the names are consecutive regions from `namesAt`, one per record.
 */
export function syntheticBuiltIn(programs: readonly BuiltInProgram[], namesAt = BUILT_IN_NAMES_AT): SyntheticBuiltIn {
  const { programBytes } = AI_LAYOUT;
  const block = new Block();
  block.alloc(programs.length * programBytes + 4);
  block.u32(programs.length * programBytes, programs.length);
  const fixups: RegionFixup[] = [];
  const names: SyntheticBuiltIn['names'] = [];
  let nameOffset = namesAt.offset;
  programs.forEach((program, index) => {
    const record = index * programBytes;
    const bytes = Uint8Array.from({ length: program.name.length + 1 }, (_, at) => at < program.name.length ? program.name.charCodeAt(at) : 0);
    names.push({ region: { object: namesAt.object, offset: nameOffset, length: bytes.length }, bytes });
    fixups.push({ at: record, object: namesAt.object, offset: nameOffset }, { at: record + 0x18, ...program.handler });
    write(block, record, [
      ...programFields(program), [0x00, 'u32', nameOffset], [0x08, 'u32', program.kindMask], [0x18, 'u32', program.handler.offset],
      [0x2c, 'f32', program.at2C],
    ]);
    nameOffset += bytes.length;
  });
  return { bytes: block.toBlock().bytes, fixups, names };
}

/** Four keyword table regions with the fixups the loader applies, and one region per distinct name. */
export interface SyntheticKeywordTables {
  tables: { region: ExecutableRegion; bytes: Uint8Array; fixups: RegionFixup[] }[];
  names: { region: ExecutableRegion; bytes: Uint8Array }[];
}

/**
 * The keyword tables (ai.md §5.3): consecutive regions from `tablesAt`, each its {name pointer, i32 value} pairs and a
 * null pair. Equal names share one name region; the name regions follow one another from `namesAt` with a filler byte
 * after every other one, so that some start at odd offsets. Each pair's name word holds its fixup's target offset.
 */
export function syntheticKeywordTables(
  tables: KeywordTables, tablesAt: ObjectPosition = KEYWORD_TABLES_AT, namesAt: ObjectPosition = KEYWORD_NAMES_AT,
): SyntheticKeywordTables {
  const size = AI_LAYOUT.keywordEntryBytes;
  const names: SyntheticKeywordTables['names'] = [];
  const nameOffsets = new Map<string, number>();
  let nameOffset = namesAt.offset;
  let tableOffset = tablesAt.offset;
  const regions = tables.map(entries => {
    const block = new Block();
    block.alloc((entries.length + 1) * size);
    const fixups: RegionFixup[] = [];
    entries.forEach(({ name, value }, index) => {
      let offset = nameOffsets.get(name);
      if (offset === undefined) {
        offset = nameOffset;
        nameOffsets.set(name, offset);
        const bytes = Uint8Array.from({ length: name.length + 1 }, (_, at) => (at < name.length ? name.charCodeAt(at) : 0));
        names.push({ region: { object: namesAt.object, offset, length: bytes.length }, bytes });
        nameOffset += bytes.length + (names.length % 2);
      }
      fixups.push({ at: index * size, object: namesAt.object, offset });
      block.u32(index * size, offset).u32(index * size + 4, value);
    });
    const bytes = block.toBlock().bytes;
    const region = { object: tablesAt.object, offset: tableOffset, length: bytes.length };
    tableOffset += bytes.length;
    return { region, bytes, fixups };
  });
  return { tables: regions, names };
}

/** The synthetic sources of `content`, as blocks and regions that a test may corrupt before wrapping them with `aiSources`. */
export interface SyntheticAiSources {
  globals: { id: number; block: SyntheticBlock };
  table: { id: number; block: SyntheticBlock };
  /** In `content.entries` order. */
  entries: { id: number; type: string; block: SyntheticBlock }[];
  builtIn: SyntheticBuiltIn;
  keywords: SyntheticKeywordTables;
}

export function syntheticAiSources(content: AiPrograms = aiContent(), aico: AicoOptions = {}): SyntheticAiSources {
  const ids = content.entries.map((_, index) => SYNTHETIC_AI_IDS.entries + index * 2);
  return {
    globals: { id: SYNTHETIC_AI_IDS.globals, block: syntheticAico(content, aico) },
    table: { id: SYNTHETIC_AI_IDS.table, block: syntheticProgramTable(content, ids) },
    entries: content.entries.map((entry, index) => entry.kind === 'parameters'
      ? { id: ids[index], type: 'DFPG', block: syntheticParameters(entry, ids) }
      : { id: ids[index], type: 'TABL', block: syntheticScript(entry) }),
    builtIn: syntheticBuiltIn(content.builtInPrograms),
    keywords: syntheticKeywordTables(content.keywordTables),
  };
}

/** The parser's sources for `synthetic`, with the given entries and keyword names in reverse order to show the order is free. */
export function aiSources({ globals, table, entries, builtIn, keywords }: SyntheticAiSources): AiProgramSources {
  return {
    globals: entryRead(globals.id, 'AICO', globals.block),
    table: entryRead(table.id, 'TABL', table.block),
    entries: entries.map(({ id, type, block }) => entryRead(id, type, block)).reverse(),
    builtIn: { bytes: builtIn.bytes, fixups: builtIn.fixups, location: BUILT_IN_LOCATION },
    builtInNames: builtIn.names.map((name, index) => ({ ...name, location: nameLocation(index) })),
    keywordTables: keywords.tables.map((table, index) => ({ ...table, location: keywordTableLocation(index) })) as unknown as AiProgramSources['keywordTables'],
    keywordNames: keywords.names.map((name, index) => ({ ...name, location: keywordNameLocation(index) })).reverse(),
  };
}

const LE_PAGE = 4_096;

/** A fixup record for a non-additive internal 32-bit offset at `offset` of its page (negative on the later of two pages). */
function fixupRecord(offset: number, object: number, target: number): number[] {
  const wide = target > 0xffff;
  const record = [0x07, wide ? 0x10 : 0x00, offset & 0xff, (offset >>> 8) & 0xff, object];
  for (let index = 0; index < (wide ? 4 : 2); index++) record.push((target >>> (index * 8)) & 0xff);
  return record;
}

/**
 * An LE file holding `builtIn`: object 1 is filler, object 2 the handler targets, object `namesAt.object` (3) the names
 * and object 4 the table at `tableAt`, by default so that a fixup crosses a page boundary. Returns the file and the
 * regions of the table and of each name.
 */
export function syntheticBuiltInExecutable(builtIn: SyntheticBuiltIn, tableAt = LE_PAGE - AI_LAYOUT.programBytes - 2) {
  const filled = (length: number, seed: number) => Uint8Array.from({ length }, (_, index) => (index * 13 + seed) & 0xff);
  const names = filled(builtIn.names.reduce((end, { region }) => Math.max(end, region.offset + region.length), 0) + 7, 3);
  for (const { region, bytes } of builtIn.names) names.set(bytes, region.offset);
  const table = filled(tableAt + builtIn.bytes.length + 9, 4);
  table.set(builtIn.bytes, tableAt);
  const objects = [{ bytes: filled(64, 1) }, { bytes: filled(0x300, 2) }, { bytes: names }, { bytes: table }];
  // Page map indexes: objects 1–3 take one page each, so object 4 starts at index 4.
  const fixups: Record<number, number[]> = {};
  for (const { at, object, offset } of builtIn.fixups) {
    const position = tableAt + at;
    const page = Math.floor(position / LE_PAGE);
    for (const recorded of position + 4 > (page + 1) * LE_PAGE ? [page, page + 1] : [page]) {
      (fixups[4 + recorded] ??= []).push(...fixupRecord(position - recorded * LE_PAGE, object, offset));
    }
  }
  return {
    file: syntheticLeExecutable({ objects, fixups }),
    table: { object: 4, offset: tableAt, length: builtIn.bytes.length } satisfies ExecutableRegion,
    names: builtIn.names.map(({ region }) => region),
  };
}

/**
 * An LE file holding `keywords`: object 1 is filler, object 2 the tables, object 3 filler and object 4 the names, all
 * within one page each. `record` writes each name fixup's record, by default a non-additive internal 32-bit offset.
 */
export function syntheticKeywordExecutable(
  keywords: SyntheticKeywordTables,
  record: (offset: number, object: number, target: number) => number[] = fixupRecord,
) {
  const filled = (length: number, seed: number) => Uint8Array.from({ length }, (_, index) => (index * 11 + seed) & 0xff);
  const end = (regions: readonly { region: ExecutableRegion }[]) => regions.reduce((last, { region }) => Math.max(last, region.offset + region.length), 0);
  const tables = filled(end(keywords.tables) + 5, 2);
  const names = filled(end(keywords.names) + 3, 4);
  for (const { region, bytes } of keywords.tables) tables.set(bytes, region.offset);
  for (const { region, bytes } of keywords.names) names.set(bytes, region.offset);
  const fixups: Record<number, number[]> = { 2: keywords.tables.flatMap(({ region, fixups: list }) => list.flatMap(({ at, object, offset }) => record(region.offset + at, object, offset))) };
  return {
    file: syntheticLeExecutable({ objects: [{ bytes: filled(64, 1) }, { bytes: tables }, { bytes: filled(64, 3) }, { bytes: names }], fixups }),
    tables: keywords.tables.map(({ region }) => region),
    names: keywords.names.map(({ region }) => region),
  };
}
