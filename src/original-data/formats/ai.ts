import {
  AI_PROGRAMS_LIMITS, AI_SCRIPT_END_OPCODE, foldKeywordName, type AiEntry, type AiGlobals, type AiParameterEntry,
  type AiPrograms, type AiScriptEntry, type BuiltInProgram, type F32x4, type I32x3, type KeywordEntry, type KeywordTable,
  type KeywordTables, type ScriptItem, type StateScripts, type TableProgram,
} from '../../content/rule-data/ai-programs.ts';
import type { ByteString } from '../../content/rule-data/rule-data-fields.ts';
import type { ArchiveEntryRead } from '../archive/archive-reader.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import { SourceError } from '../source-error.ts';
import type { ExecutableRegion } from '../source-mapping.ts';
import type { FixedUpRegion, RegionFixup } from './le-executable.ts';
import { entryLocation, PayloadBlock } from './payload-block.ts';

// Parsing of the AISTUFF group-0 closure, the EXE built-in program table and the EXE keyword tables into `data/ai-programs`
// content (P3-03 spec S-05 and S-19; layouts, load transforms and evidence in docs/original/formats/ai.md). The parser
// receives only what the caller has read: AICO 6001, the selected group's program table, the entries its ID chain names,
// the built-in table region with its LE fixups, one region per built-in name, the four keyword table regions with their
// fixups and one region per keyword name. Values keep their stored values: the load transforms of ai.md §6
// are the consumer's, positions the load code overwrites are not read, the code pointers become opaque {object, offset}
// identities (field rule 4), and entry IDs become positions in `entries`, in the order the table loader 0x649c8 first
// reaches them. Diagnostics name the entry or region and a structure path, never names, texts or values.

/** Layout of the AI structures (ai.md §2–§5). */
export const AI_LAYOUT = Object.freeze({
  globalsHeaderBytes: 0x4c,
  tripleBytes: 12,
  elementBytes: 16,
  programBytes: 0x54,
  parameterHeaderBytes: 0x6c,
  scriptItemBytes: 0x18,
  /** A keyword table pair: the name pointer, then the i32 value (ai.md §5.3). */
  keywordEntryBytes: 8,
  /** The LE object every keyword name pointer targets (ai.md §5.3). */
  keywordNameObject: 4,
});

/**
 * Source structural limits (P3-03 spec, 限值与预算), from the group-0 maxima of ai.md §8: twice the observed value
 * rounded up to a power of two, raised where needed to hold the payload limits of `AI_PROGRAMS_LIMITS`. AICO 6001 is 192
 * bytes with 3 triples. TABL 6003 is 572 bytes, which gives 2,048, below the 2,772 bytes of `programRecords` records and
 * the terminator record, so 4,096. DFPGs are at most 160 bytes (six full lists take 492). Scripts are at most 1,217
 * bytes (`scriptItems` items take 3,072). The keyword tables name 14 regions of 111 bytes with their NULs (revision 3).
 */
export const AI_SOURCE_LIMITS = Object.freeze({
  globalsEntryBytes: 512,
  groupTriples: 8,
  programTableEntryBytes: 4_096,
  parameterEntryBytes: 512,
  scriptEntryBytes: 4_096,
  keywordNames: 32,
  keywordNameBytes: 256,
});

/** An EXE region the caller has read, located in diagnostics by `location`, such as its source mapping path. */
export interface AiRegionRead {
  readonly region: ExecutableRegion;
  readonly bytes: Uint8Array;
  readonly location: string;
}

/** An EXE region read with its fixups (`LeExecutable.readFixedUpRegion`). */
export interface AiFixedUpRegionRead extends AiRegionRead {
  readonly fixups: readonly RegionFixup[];
}

export interface AiProgramSources {
  /** AICO 6001. */
  readonly globals: ArchiveEntryRead;
  /** The program table of the selected difficulty group: TABL 6003 for group 0. */
  readonly table: ArchiveEntryRead;
  /** The entries the table's ID chain names (DFPGs and TABL scripts), each once, in any order. */
  readonly entries: readonly ArchiveEntryRead[];
  /** The built-in table read with its fixups (`LeExecutable.readFixedUpRegion`): the records, then their i32 count. */
  readonly builtIn: FixedUpRegion & { readonly location: string };
  /** One region per name the built-in records point to, each covering the name and its NUL exactly, in any order. */
  readonly builtInNames: readonly AiRegionRead[];
  /** The four keyword table regions in address order, each its pairs and its null terminator pair. */
  readonly keywordTables: readonly [AiFixedUpRegionRead, AiFixedUpRegionRead, AiFixedUpRegionRead, AiFixedUpRegionRead];
  /** One region per distinct name the keyword pairs point to, each covering the name and its NUL exactly, in any order. */
  readonly keywordNames: readonly AiRegionRead[];
}

export interface ParsedAiPrograms {
  readonly content: AiPrograms;
  /**
   * The IDs of the entries the ID chain names, in `content.entries` order. The given entries are exactly these, so the
   * caller can hold them against the mapping's parts.
   */
  readonly entryIds: readonly number[];
}

const NEGATIVE_ZERO_BITS = 0x8000_0000;
const GLOBALS_POINTERS: ReadonlySet<number> = new Set([0x00, 0x18]);
const NAME_POINTER: ReadonlySet<number> = new Set([0x00]);
const ITEM_POINTERS: ReadonlySet<number> = new Set([0x04, 0x14]);
/** The DFPG script lists by state, in offset order (ai.md §4). */
const STATE_LISTS = [['state1', 0x3c], ['state2', 0x44], ['state3', 0x4c], ['state5', 0x54], ['state4', 0x5c], ['state6', 0x64]] as const;
const LIST_POINTERS: ReadonlySet<number> = new Set(STATE_LISTS.map(([, offset]) => offset));

type ByState<T> = { readonly [State in keyof StateScripts]: T };

/** `value` of each DFPG state, in list offset order. */
function byState<T>(value: (state: keyof StateScripts, offset: number) => T): ByState<T> {
  const result = {} as Record<keyof StateScripts, T>;
  for (const [state, offset] of STATE_LISTS) result[state] = value(state, offset);
  return Object.freeze(result);
}

const mismatch = (location: string, reason: string): never => {
  throw new SourceError('subresource-mismatch', location, reason);
};

/** Typed reads of a structure's value fields; `f32` rejects a stored −0.0, which canonical JSON cannot carry (field rule 4). */
interface Fields {
  u32(offset: number, path: string): number;
  i32(offset: number, path: string): number;
  f32(offset: number, path: string): number;
}

function blockFields(block: PayloadBlock): Fields {
  return {
    u32: (offset, path) => block.u32(offset, path),
    i32: (offset, path) => block.i32(offset, path),
    f32: (offset, path) => {
      if (block.u32(offset, path) === NEGATIVE_ZERO_BITS) block.unsupported(path, 'the value is negative zero');
      return block.f32(offset, path);
    },
  };
}

/** Fields of a region whose length the caller has checked. */
function regionFields(bytes: Uint8Array, location: string): Fields {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    u32: offset => view.getUint32(offset, true),
    i32: offset => view.getInt32(offset, true),
    f32: (offset, path) => {
      if (view.getUint32(offset, true) === NEGATIVE_ZERO_BITS) throw new SourceError('unsupported-payload', `${location}${path}`, 'the value is negative zero');
      const value = view.getFloat32(offset, true);
      if (!Number.isFinite(value)) throw new SourceError('invalid-payload', `${location}${path}`, 'the value is not a finite number');
      return value;
    },
  };
}

/**
 * The NUL-terminated byte string at `offset`, of 0 to `limit` bytes kept as stored (text rule 8); at most one byte past
 * the limit is examined, and no relocation may overlap the text or its NUL.
 */
function readText(block: PayloadBlock, bytes: Uint8Array, offset: number, limit: number, path: string): ByteString {
  block.require(offset, 1, path);
  const scanned = bytes.subarray(offset, Math.min(bytes.length, offset + limit + 1));
  const length = scanned.indexOf(0);
  if (length === -1) {
    if (scanned.length <= limit) block.invalid(path, 'the text has no terminating NUL');
    block.limit(path, 'textBytes', limit, scanned.length);
  }
  for (let at = offset - 3; at <= offset + length; at++) {
    if (block.isRelocated(at)) block.invalid(path, 'a relocation overlaps the text');
  }
  return String.fromCharCode(...scanned.subarray(0, length));
}

/** A region holding exactly a name of at most `limit` bytes and its NUL. */
function regionText({ bytes, location }: AiRegionRead, limit = AI_PROGRAMS_LIMITS.programNameBytes): ByteString {
  const length = bytes.indexOf(0);
  if (length === -1) throw new SourceError('invalid-payload', location, 'the text has no terminating NUL');
  if (length !== bytes.length - 1) throw new SourceError('invalid-payload', location, 'the NUL is not the last byte of the region');
  if (length > limit) throw new SourceError('limit-exceeded', location, 'the text exceeds its payload limit', { name: 'textBytes', limit, observed: length });
  return String.fromCharCode(...bytes.subarray(0, length));
}

/** The regions of `names` by their object and offset; a region given twice is a mismatch. */
function regionsByStart(names: readonly AiRegionRead[]): Map<string, AiRegionRead> {
  const regions = new Map<string, AiRegionRead>();
  for (const name of names) {
    const key = `${name.region.object}/${name.region.offset}`;
    if (regions.has(key)) mismatch(name.location, 'the region is given twice');
    regions.set(key, name);
  }
  return regions;
}

/** The value fields both program tables convert alike (ai.md §3.1). */
type SharedProgramFields = Omit<BuiltInProgram, 'name' | 'kindMask' | 'handler' | 'at2C'>;

function programFields(fields: Fields, record: number, path: string): SharedProgramFields {
  const u32 = (offset: number, name: string) => fields.u32(record + offset, `${path}/${name}`);
  const i32 = (offset: number, name: string) => fields.i32(record + offset, `${path}/${name}`);
  const f32 = (offset: number, name: string) => fields.f32(record + offset, `${path}/${name}`);
  return {
    at04: u32(0x04, 'at04'), at0C: i32(0x0c, 'at0C'), at10: i32(0x10, 'at10'), at14: i32(0x14, 'at14'), at24: f32(0x24, 'at24'),
    at28: f32(0x28, 'at28'), at30: f32(0x30, 'at30'), at34: u32(0x34, 'at34'), at38: u32(0x38, 'at38'), at3C: f32(0x3c, 'at3C'),
    at40: f32(0x40, 'at40'), at44: u32(0x44, 'at44'), at48: f32(0x48, 'at48'), at4C: f32(0x4c, 'at4C'), at50: u32(0x50, 'at50'),
  };
}

/** AICO 6001: the triple of `group` and the fields read regardless of the group (ai.md §2). */
function parseGlobals(archive: DiscPath, read: ArchiveEntryRead, group: number): { groupTriple: I32x3; globals: AiGlobals } {
  const block = new PayloadBlock(archive, read, AI_SOURCE_LIMITS.globalsEntryBytes);
  const { globalsHeaderBytes: header, tripleBytes, elementBytes } = AI_LAYOUT;
  block.require(0, header, '/header');
  block.requireRelocations(0, header, GLOBALS_POINTERS, '/header');
  const triples = block.array(0x00, tripleBytes, AI_SOURCE_LIMITS.groupTriples, '/groupTriples');
  const elements = block.array(0x18, elementBytes, AI_PROGRAMS_LIMITS.globalElements, '/elements');
  // No code reads the two counts: they are the element counts only when the arrays fill the block as the layout fixes.
  const elementsAt = header + triples.count * tripleBytes;
  if (triples.count > 0 && triples.start !== header) block.unsupported('/groupTriples', 'the triples do not follow the header');
  if (elements.count > 0 && elements.start !== elementsAt) block.unsupported('/elements', 'the elements do not follow the triples');
  if (read.bytes.length !== elementsAt + elements.count * elementBytes) block.unsupported('/elements', 'the arrays do not fill the block');
  const triplePath = `/groupTriples[${group}]`;
  if (!Number.isSafeInteger(group) || group < 0 || group >= triples.count) mismatch(block.at(triplePath), 'the difficulty group has no triple');
  const tripleAt = header + group * tripleBytes;
  const groupTriple = Object.freeze([0, 4, 8].map(offset => block.i32(tripleAt + offset, triplePath))) as unknown as I32x3;
  const fields = blockFields(block);
  const f32 = (offset: number, name: string) => fields.f32(offset, `/${name}`);
  const i32 = (offset: number, name: string) => fields.i32(offset, `/${name}`);
  const globals: AiGlobals = Object.freeze({
    at08: i32(0x08, 'at08'), at0C: f32(0x0c, 'at0C'), at10: f32(0x10, 'at10'), at14: f32(0x14, 'at14'),
    elements: Object.freeze(Array.from({ length: elements.count }, (_, index) => Object.freeze(
      [0, 4, 8, 12].map(offset => fields.f32(elementsAt + index * elementBytes + offset, `/elements[${index}]`)),
    ) as unknown as F32x4)),
    at20: f32(0x20, 'at20'), at24: f32(0x24, 'at24'), at28: i32(0x28, 'at28'), at2C: i32(0x2c, 'at2C'), at30: i32(0x30, 'at30'),
    at34: f32(0x34, 'at34'), at38: fields.u32(0x38, '/at38'), at3C: f32(0x3c, 'at3C'), at40: f32(0x40, 'at40'),
    at44: f32(0x44, 'at44'), at48: f32(0x48, 'at48'),
  });
  return { groupTriple, globals };
}

/** A table record whose +0x1C entry ID has yet to become a position in `entries`. */
interface TableRecord {
  readonly parametersId: number;
  readonly values: Omit<TableProgram, 'parameters'>;
}

/**
 * TABL 6003 (ai.md §3.2): the records before the first whose first word is zero and unrelocated, that all-zero terminator
 * record, then the records' names in record order, filling the block.
 */
function parseTable(block: PayloadBlock, bytes: Uint8Array): TableRecord[] {
  const { programBytes } = AI_LAYOUT;
  const limit = AI_PROGRAMS_LIMITS.programRecords;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Only the first word decides where the records end; record `limit` is looked at only to tell a terminator from one record too many.
  const isRecord = (index: number) => {
    block.require(index * programBytes, 4, `/programs[${index}]/name`);
    return block.isRelocated(index * programBytes) || view.getUint32(index * programBytes, true) !== 0;
  };
  let count = 0;
  while (count <= limit && isRecord(count)) count++;
  block.limit('/programs', 'aiProgramRecords', limit, count);
  const terminator = count * programBytes;
  block.require(terminator, programBytes, '/terminator');
  if (block.hasNonZero(terminator + 4, programBytes - 4, '/terminator')) block.unsupported('/terminator', 'an unused position is not zero');
  let names = terminator + programBytes;
  const fields = blockFields(block);
  const records = Array.from({ length: count }, (_, index) => {
    const record = index * programBytes;
    const path = `/programs[${index}]`;
    block.requireRelocations(record, programBytes, NAME_POINTER, path);
    const nameAt = block.target(record, 1, `${path}/name`);
    // Field rule 4: each name starts where the previous one ends.
    if (nameAt !== names) block.unsupported(`${path}/name`, 'the pointer does not target the next name');
    const name = readText(block, bytes, nameAt, AI_PROGRAMS_LIMITS.programNameBytes, `${path}/name`);
    names += name.length + 1;
    // The load code replaces a kind mask of 0 by 0x380 and a +0x2C of +0.0 or −0.0 by 1.0 (ai.md §6); +0x18 and +0x20
    // are overwritten and not read.
    const kindMask = fields.u32(record + 0x08, `${path}/kindMask`);
    const at2C = (fields.u32(record + 0x2c, `${path}/at2C`) & 0x7fff_ffff) === 0 ? null : fields.f32(record + 0x2c, `${path}/at2C`);
    return {
      parametersId: fields.u32(record + 0x1c, `${path}/parameters`),
      values: { name, ...programFields(fields, record, path), kindMask: kindMask === 0 ? null : kindMask, at2C },
    };
  });
  if (names !== bytes.length) block.unsupported('/names', 'the names do not fill the block');
  return records;
}

/** A DFPG with its script references still entry IDs. */
interface ParameterSource {
  readonly values: Omit<AiParameterEntry, 'installScript' | 'stateScripts'>;
  readonly installScript: number | null;
  readonly stateScripts: ByState<readonly number[]>;
  readonly location: string;
}

/**
 * A DFPG (ai.md §4): +0x00 is unused and +0x0C is overwritten at load. The non-empty lists' IDs follow the header in list
 * order, filling the block.
 */
function parseParameters(archive: DiscPath, read: ArchiveEntryRead): ParameterSource {
  const block = new PayloadBlock(archive, read, AI_SOURCE_LIMITS.parameterEntryBytes);
  const header = AI_LAYOUT.parameterHeaderBytes;
  block.require(0, header, '/header');
  block.requireRelocations(0, header, LIST_POINTERS, '/header');
  if (block.hasNonZero(0x00, 4, '/at00')) block.unsupported('/at00', 'an unused position is not zero');
  const fields = blockFields(block);
  const u32 = (offset: number, name: string) => fields.u32(offset, `/${name}`);
  const f32 = (offset: number, name: string) => fields.f32(offset, `/${name}`);
  const values = Object.freeze({
    kind: 'parameters' as const, at04: fields.i32(0x04, '/at04'), at08: f32(0x08, 'at08'), at10: f32(0x10, 'at10'),
    at14: f32(0x14, 'at14'), at18: u32(0x18, 'at18'), at1C: u32(0x1c, 'at1C'), at20: f32(0x20, 'at20'), at24: u32(0x24, 'at24'),
    at28: u32(0x28, 'at28'), at2C: f32(0x2c, 'at2C'), at30: f32(0x30, 'at30'), at34: u32(0x34, 'at34'),
  });
  const install = u32(0x38, 'installScript');
  let lists = header;
  const stateScripts = byState((state, offset) => {
    const path = `/stateScripts/${state}`;
    const { start, count } = block.array(offset, 4, AI_PROGRAMS_LIMITS.stateScriptItems, path);
    // Field rule 4: each list starts where the previous one ends.
    if (count > 0 && start !== lists) block.unsupported(path, 'the pointer does not target the next list');
    lists += count * 4;
    return Array.from({ length: count }, (_, index) => block.u32(start + index * 4, `${path}[${index}]`));
  });
  if (lists !== read.bytes.length) block.unsupported('/stateScripts', 'the lists do not fill the block');
  return { values, installScript: install === 0 ? null : install, stateScripts, location: entryLocation(archive, read.entry) };
}

/** A script TABL (ai.md §5): items up to and including the first with the end opcode, then their texts in item order, filling the block. */
function parseScript(archive: DiscPath, read: ArchiveEntryRead): AiScriptEntry {
  const block = new PayloadBlock(archive, read, AI_SOURCE_LIMITS.scriptEntryBytes);
  const size = AI_LAYOUT.scriptItemBytes;
  const limit = AI_PROGRAMS_LIMITS.scriptItems;
  const opcodes: number[] = [];
  while (opcodes.at(-1) !== AI_SCRIPT_END_OPCODE && opcodes.length < limit) {
    opcodes.push(block.u32(opcodes.length * size, `/items[${opcodes.length}]/opcode`));
  }
  // Without the end item among the first `limit` items, the script has more, which are not read.
  if (opcodes.at(-1) !== AI_SCRIPT_END_OPCODE) block.limit('/items', 'aiScriptItems', limit, limit + 1);
  const itemsEnd = opcodes.length * size;
  block.require(0, itemsEnd, '/items');
  let texts = itemsEnd;
  const items = opcodes.map((opcode, index): ScriptItem => {
    const item = index * size;
    const path = `/items[${index}]`;
    block.requireRelocations(item, size, ITEM_POINTERS, path);
    const textAt = block.pointer(item + 0x04, `${path}/argument`);
    if (textAt !== null) {
      block.require(textAt, 1, `${path}/argument`);
      // Field rule 4: each text starts where the previous one ends.
      if (textAt !== texts) block.unsupported(`${path}/argument`, 'the pointer does not target the next text');
    }
    const argument = textAt === null ? null : readText(block, read.bytes, textAt, AI_PROGRAMS_LIMITS.scriptTextBytes, `${path}/argument`);
    if (argument !== null) texts += argument.length + 1;
    // The run-time words: the parser reads +0x10, and the executor and the release read +0x08 and +0x0C of an item the
    // parser leaves alone, so stored values would change the program (ai.md §6).
    if (block.hasNonZero(item + 0x08, 12, `${path}/runtime`)) block.unsupported(`${path}/runtime`, 'a run-time word is not zero');
    const branchAt = block.pointer(item + 0x14, `${path}/branch`);
    if (branchAt !== null) {
      block.require(branchAt, 1, `${path}/branch`);
      if (branchAt % size !== 0 || branchAt >= itemsEnd) block.unsupported(`${path}/branch`, 'the pointer does not target an item');
    }
    return Object.freeze({ opcode, argument, branch: branchAt === null ? null : branchAt / size });
  });
  if (texts !== read.bytes.length) block.unsupported('/texts', 'the texts do not fill the block');
  return Object.freeze({ kind: 'script', items: Object.freeze(items) });
}

/**
 * The built-in table (ai.md §3.3): records whose +0x00 and +0x18 the loader fixes up, then their i32 count. Every
 * record's name pointer must target the start of a given name region, and every given region must be named.
 */
function parseBuiltIn({ bytes, fixups, location }: AiProgramSources['builtIn'], names: readonly AiRegionRead[]): BuiltInProgram[] {
  const { programBytes } = AI_LAYOUT;
  if (bytes.length < 4) throw new SourceError('invalid-payload', `${location}/count`, 'the region has no record count');
  const count = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt32(bytes.length - 4, true);
  const limit = AI_PROGRAMS_LIMITS.programRecords;
  if (count > limit) {
    throw new SourceError('limit-exceeded', `${location}/programs`, 'the structure exceeds its payload limit', { name: 'aiProgramRecords', limit, observed: count });
  }
  const recordsEnd = bytes.length - 4;
  if (count * programBytes !== recordsEnd) throw new SourceError('invalid-payload', `${location}/count`, 'the record count does not match the region');
  for (const { at } of fixups) {
    const path = at >= recordsEnd ? '/count' : `/programs[${Math.floor(at / programBytes)}]`;
    if (at >= recordsEnd || (at % programBytes !== 0x00 && at % programBytes !== 0x18)) {
      throw new SourceError('invalid-payload', `${location}${path}`, 'a fixup patches a value field');
    }
  }
  const fixupAt = new Map(fixups.map(fixup => [fixup.at, fixup]));
  const regions = regionsByStart(names);
  const named = new Set<string>();
  const fields = regionFields(bytes, location);
  const programs = Array.from({ length: count }, (_, index): BuiltInProgram => {
    const record = index * programBytes;
    const path = `/programs[${index}]`;
    const pointer = (offset: number, field: string): RegionFixup => {
      const fixup = fixupAt.get(record + offset);
      if (!fixup) throw new SourceError('invalid-payload', `${location}${path}/${field}`, 'the pointer has no fixup');
      return fixup;
    };
    const nameTarget = pointer(0x00, 'name');
    const handler = pointer(0x18, 'handler');
    const key = `${nameTarget.object}/${nameTarget.offset}`;
    const region = regions.get(key) ?? mismatch(`${location}${path}/name`, 'no given region starts at the name');
    named.add(key);
    // Read only for table programs: no built-in field carries them, so they must be zero.
    for (const [offset, field] of [[0x1c, 'at1C'], [0x20, 'at20']] as const) {
      if (fields.u32(record + offset, field) !== 0) {
        throw new SourceError('unsupported-payload', `${location}${path}/${field}`, 'a position built-in programs do not use is not zero');
      }
    }
    return Object.freeze({
      name: regionText(region), ...programFields(fields, record, path), kindMask: fields.u32(record + 0x08, `${path}/kindMask`),
      handler: Object.freeze({ object: handler.object, offset: handler.offset }), at2C: fields.f32(record + 0x2c, `${path}/at2C`),
    });
  });
  for (const [key, region] of regions) {
    if (!named.has(key)) mismatch(region.location, 'no built-in program names the region');
  }
  return programs;
}

const unsupported = (location: string, reason: string): never => {
  throw new SourceError('unsupported-payload', location, reason);
};

/**
 * The number of pairs before the terminator pair of a keyword table region of `length` bytes, checked against the
 * structure and the limit before any pair is read; the converter judges region lengths with it before reading them.
 */
export function keywordTableEntries(length: number, location: string): number {
  const size = AI_LAYOUT.keywordEntryBytes;
  if (length % size !== 0 || length < 2 * size) throw new SourceError('invalid-payload', location, 'the region is not one or more pairs and a terminator pair');
  const count = length / size - 1;
  const limit = AI_PROGRAMS_LIMITS.keywordEntries;
  if (count > limit) throw new SourceError('limit-exceeded', `${location}/entries`, 'the structure exceeds its payload limit', { name: 'aiKeywordEntries', limit, observed: count });
  return count;
}

/**
 * Checks the keyword name regions' count and total bytes with their NULs against the source limits, failing at the
 * first region past a limit; the converter judges region lengths with it before reading them.
 */
export function checkKeywordNameRegions(regions: readonly { readonly length: number; readonly location: string }[]): void {
  const { keywordNames, keywordNameBytes } = AI_SOURCE_LIMITS;
  if (regions.length > keywordNames) {
    throw new SourceError('limit-exceeded', regions[keywordNames].location, 'the structure exceeds its payload limit',
      { name: 'aiKeywordNames', limit: keywordNames, observed: regions.length });
  }
  const total = regions.reduce((sum, { length }) => sum + length, 0);
  if (total <= keywordNameBytes) return;
  let bytes = 0;
  const { location } = regions.find(({ length }) => (bytes += length) > keywordNameBytes)!;
  throw new SourceError('limit-exceeded', location, 'the structure exceeds its payload limit', { name: 'aiKeywordNameBytes', limit: keywordNameBytes, observed: total });
}

/**
 * The keyword tables (ai.md §5.3): four consecutive regions of {name pointer, i32 value} pairs, each ended by one null
 * pair at its end. Exactly the name word of every other pair is patched, by a fixup with a 16-bit target offset to the
 * start of a given name region in object 4 whose stored word is the target offset; every given region is named, and the
 * names of a table differ with A–Z folded. A pair may share a name region with others; the region is read once.
 */
function parseKeywordTables(tables: AiProgramSources['keywordTables'], names: readonly AiRegionRead[]): KeywordTables {
  const size = AI_LAYOUT.keywordEntryBytes;
  checkKeywordNameRegions(names.map(({ bytes, location }) => ({ length: bytes.length, location })));
  const regions = regionsByStart(names);
  const texts = new Map<string, ByteString>();
  const result = tables.map(({ region, bytes, fixups, location }, table): KeywordTable => {
    const count = keywordTableEntries(bytes.length, location);
    const previous = tables[table - 1]?.region;
    if (previous && (region.object !== previous.object || region.offset !== previous.offset + previous.length)) {
      throw new SourceError('invalid-payload', location, 'the region does not follow the previous keyword table');
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const fixupAt = new Map<number, RegionFixup>();
    for (const fixup of fixups) {
      const index = Math.floor(fixup.at / size);
      const path = index < count ? `/entries[${index}]` : '/terminator';
      if (fixup.at % size !== 0 || index >= count) unsupported(`${location}${path}`, 'a fixup patches a value word or the terminator pair');
      if (fixup.object !== AI_LAYOUT.keywordNameObject) unsupported(`${location}${path}/name`, 'the fixup targets another object');
      if (fixup.targetBits !== 16) unsupported(`${location}${path}/name`, 'the fixup stores its target offset in other than 16 bits');
      fixupAt.set(fixup.at, fixup);
    }
    const terminator = count * size;
    if (view.getUint32(terminator, true) !== 0) unsupported(`${location}/terminator`, 'the last pair is not a null pair');
    if (view.getInt32(terminator + 4, true) !== 0) unsupported(`${location}/terminator`, 'the value of the terminator pair is not zero');
    const seen = new Set<ByteString>();
    return Object.freeze(Array.from({ length: count }, (_, index): KeywordEntry => {
      const path = `${location}/entries[${index}]`;
      const stored = view.getUint32(index * size, true);
      // A zero name word ends the table for the lookup, whatever its fixup.
      if (stored === 0) unsupported(`${path}/name`, 'a null pair precedes the terminator pair');
      const fixup = fixupAt.get(index * size) ?? unsupported(`${path}/name`, 'the name pointer has no fixup');
      if (stored !== fixup.offset) unsupported(`${path}/name`, 'the stored pointer is not the fixup target offset');
      const key = `${fixup.object}/${fixup.offset}`;
      let name = texts.get(key);
      if (name === undefined) {
        const target = regions.get(key) ?? mismatch(`${path}/name`, 'no given region starts at the name');
        name = regionText(target, AI_PROGRAMS_LIMITS.keywordNameBytes);
        if (name.length === 0) throw new SourceError('invalid-payload', target.location, 'the name is empty');
        texts.set(key, name);
      }
      const folded = foldKeywordName(name);
      if (seen.has(folded)) unsupported(`${path}/name`, 'the name repeats an earlier name of the table, A to Z folded');
      seen.add(folded);
      return Object.freeze({ name, value: view.getInt32(index * size + 4, true) });
    }));
  });
  for (const [key, region] of regions) {
    if (!texts.has(key)) mismatch(region.location, 'no keyword pair names the region');
  }
  return Object.freeze(result) as KeywordTables;
}

/**
 * Parses `data/ai-programs` content for difficulty group `group` from `sources` of `archive` (AISTUFF.NOB). The given
 * entries must be exactly those the table's ID chain names; a missing, extra or mistyped entry, and a group without a
 * triple, are `subresource-mismatch`. Structural failures are `invalid-payload`, positions this contract does not
 * support `unsupported-payload`, and overruns `limit-exceeded`, before the structure is read.
 */
export function parseAiPrograms(archive: DiscPath, sources: AiProgramSources, group: number): ParsedAiPrograms {
  const { groupTriple, globals } = parseGlobals(archive, sources.globals, group);
  const table = new PayloadBlock(archive, sources.table, AI_SOURCE_LIMITS.programTableEntryBytes);
  const records = parseTable(table, sources.table.bytes);

  const given = new Map<number, ArchiveEntryRead>();
  for (const read of sources.entries) {
    if (given.has(read.entry.id)) mismatch(entryLocation(archive, read.entry), 'the entry is given twice');
    given.set(read.entry.id, read);
  }
  // The ID chain in the loader's order: each record's +0x1C entry, then that entry's install script and lists.
  const entryIds: number[] = [];
  const position = new Map<number, number>();
  const parameters = new Map<number, ParameterSource>();
  const reach = (id: number, type: 'DFPG' | 'TABL', location: string): boolean => {
    const known = position.has(id);
    if (!known) table.limit('/entries', 'aiEntries', AI_PROGRAMS_LIMITS.entries, entryIds.length + 1);
    const read = given.get(id) ?? mismatch(location, 'the ID chain names an entry that is not given');
    if (read.entry.type !== type) mismatch(location, 'the ID chain names an entry of another type');
    if (known) return false;
    position.set(id, entryIds.length);
    entryIds.push(id);
    return true;
  };
  records.forEach(({ parametersId }, index) => {
    if (!reach(parametersId, 'DFPG', table.at(`/programs[${index}]/parameters`))) return;
    const source = parseParameters(archive, given.get(parametersId)!);
    parameters.set(parametersId, source);
    if (source.installScript !== null) reach(source.installScript, 'TABL', `${source.location}/installScript`);
    for (const [state] of STATE_LISTS) {
      source.stateScripts[state].forEach((id, item) => reach(id, 'TABL', `${source.location}/stateScripts/${state}[${item}]`));
    }
  });
  for (const read of sources.entries) {
    if (!position.has(read.entry.id)) mismatch(entryLocation(archive, read.entry), 'the ID chain does not name the entry');
  }

  const index = (id: number) => position.get(id)!;
  const entries = entryIds.map((id): AiEntry => {
    const source = parameters.get(id);
    if (!source) return parseScript(archive, given.get(id)!);
    return Object.freeze({
      ...source.values,
      installScript: source.installScript === null ? null : index(source.installScript),
      stateScripts: byState(state => Object.freeze(source.stateScripts[state].map(index))),
    });
  });
  const content: AiPrograms = Object.freeze({
    groupTriple,
    globals,
    programs: Object.freeze(records.map(({ parametersId, values }) => Object.freeze({ ...values, parameters: index(parametersId) }))),
    entries: Object.freeze(entries),
    builtInPrograms: Object.freeze(parseBuiltIn(sources.builtIn, sources.builtInNames)),
    keywordTables: parseKeywordTables(sources.keywordTables, sources.keywordNames),
  });
  return Object.freeze({ content, entryIds: Object.freeze(entryIds) });
}
