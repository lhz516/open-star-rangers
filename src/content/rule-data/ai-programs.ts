import {
  byteStrings, invalid, listOf, mismatch, readF32, readI32, readIndex, readList, readNullable, readPlainRecord, readU32, records,
  requireTarget, tuples, type ByteString, type Shape,
} from './rule-data-fields.ts';

// Canonical content of `data/ai-programs` (P3-03 spec S-05): AICO 6001 as the group-0 slice reads it, the program table
// TABL 6003, the 25 entries its ID chain names, and the EXE built-in program table 0x1762f8, with the structure of
// docs/original/formats/ai.md. `atXX` is the source position +0xXX in its structure. Values are kept as stored (field
// rules 2–6): the load transforms of ai.md §6 are not performed, positions the load code overwrites and unused positions
// are not carried, and entry IDs become positions in `entries`. A 32-bit integer whose sign the code never observes is
// kept as u32 (ai.md §6). Meanings are Unconfirmed (U-001, U-022); how programs and scripts run belongs to P3-08.

/** Fixed counts of the format (ai.md §2, §4). */
export const AI_PROGRAMS_COUNTS = Object.freeze({ triple: 3, elementValues: 4, stateScriptLists: 6 });

/** The opcode of the item that ends a script (ai.md §5). */
export const AI_SCRIPT_END_OPCODE = 10000;

/**
 * Structural limits: twice the maximum recorded in ai.md §8, rounded up to a power of two (10 records in one program table,
 * the built-in one; names 20 bytes; 5 AICO elements; 25 entries; 6 IDs in one DFPG list; 40 items in one script; script
 * texts 37 bytes).
 */
export const AI_PROGRAMS_LIMITS = Object.freeze({
  programRecords: 32,
  programNameBytes: 64,
  globalElements: 16,
  entries: 64,
  stateScriptItems: 16,
  scriptItems: 128,
  scriptTextBytes: 128,
});

export type I32x3 = readonly [number, number, number];
export type F32x4 = readonly [number, number, number, number];

/**
 * An opaque code identity (spec field rule 4): the LE object number and the offset in that object that an EXE fixup
 * record names. Only equality is meaningful; no rule may be derived from the numbers.
 */
export interface CodeIdentity {
  /** LE object number, from 1. */
  readonly object: number;
  /** Offset in the object. */
  readonly offset: number;
}

/** AICO 6001 fields the loop reads regardless of the difficulty group (ai.md §2; U-001, U-022). */
export interface AiGlobals {
  /** +0x08 i32. */
  readonly at08: number;
  /** +0x0C f32. */
  readonly at0C: number;
  /** +0x10 f32. */
  readonly at10: number;
  /** +0x14 f32. */
  readonly at14: number;
  /** +0x18 pointer and +0x1C count: the 16-byte elements, four f32 each, in source order. */
  readonly elements: readonly F32x4[];
  /** +0x20 f32. */
  readonly at20: number;
  /** +0x24 f32. */
  readonly at24: number;
  /** +0x28 i32. */
  readonly at28: number;
  /** +0x2C i32. */
  readonly at2C: number;
  /** +0x30 i32. */
  readonly at30: number;
  /** +0x34 f32. */
  readonly at34: number;
  /** +0x38 u32. */
  readonly at38: number;
  /** +0x3C f32. */
  readonly at3C: number;
  /** +0x40 f32. */
  readonly at40: number;
  /** +0x44 f32. */
  readonly at44: number;
  /** +0x48 f32. */
  readonly at48: number;
}

/** Program record fields before the handler (ai.md §3.1). */
interface ProgramHead {
  /** +0x00 pointer to the record's name (text Likely: no reader). */
  readonly name: ByteString;
  /** +0x04 u32 (sign not observable; compared with 1 only). */
  readonly at04: number;
}

interface ProgramMiddle {
  /** +0x0C i32. */
  readonly at0C: number;
  /** +0x10 i32. */
  readonly at10: number;
  /** +0x14 i32. */
  readonly at14: number;
}

interface ProgramLimits {
  /** +0x24 f32. */
  readonly at24: number;
  /** +0x28 f32. */
  readonly at28: number;
}

interface ProgramTail {
  /** +0x30 f32. */
  readonly at30: number;
  /** +0x34 u32 flag. */
  readonly at34: number;
  /** +0x38 u32 flag. */
  readonly at38: number;
  /** +0x3C f32. */
  readonly at3C: number;
  /** +0x40 f32. */
  readonly at40: number;
  /** +0x44 u32 flag. */
  readonly at44: number;
  /** +0x48 f32. */
  readonly at48: number;
  /** +0x4C f32. */
  readonly at4C: number;
  /** +0x50 u32 flag. */
  readonly at50: number;
}

/** A 0x54-byte record of TABL 6003 before its terminator record (ai.md §3.1–§3.2; U-001, U-022). +0x18 and +0x20 are overwritten at load. */
export interface TableProgram extends ProgramHead, ProgramMiddle, ProgramLimits, ProgramTail {
  /** +0x08 u32 kind mask, or null for a source 0, which the load code replaces by 0x380 (ai.md §6). */
  readonly kindMask: number | null;
  /** +0x1C entry ID: index of a `parameters` entry. */
  readonly parameters: number;
  /** +0x2C f32, or null for a source +0.0 or -0.0, which the load code replaces by 1.0 (ai.md §6). */
  readonly at2C: number | null;
}

/** A 0x54-byte record of the built-in table (ai.md §3.3; U-001, U-022); no load transform applies. +0x1C and +0x20 are not read. */
export interface BuiltInProgram extends ProgramHead, ProgramMiddle, ProgramLimits, ProgramTail {
  /** +0x08 u32 kind mask. */
  readonly kindMask: number;
  /** +0x18 code pointer: the handler the record's LE fixup names. */
  readonly handler: CodeIdentity;
  /** +0x2C f32. */
  readonly at2C: number;
}

/** The six script lists of a DFPG at +0x3C … +0x68 (each a pointer and an i32 count), keyed by the state of `0x64d58` that uses them, in source order. */
export interface StateScripts {
  /** +0x3C/+0x40. */
  readonly state1: readonly number[];
  /** +0x44/+0x48. */
  readonly state2: readonly number[];
  /** +0x4C/+0x50. */
  readonly state3: readonly number[];
  /** +0x54/+0x58. */
  readonly state5: readonly number[];
  /** +0x5C/+0x60. */
  readonly state4: readonly number[];
  /** +0x64/+0x68. */
  readonly state6: readonly number[];
}

/** A DFPG, the entry a table program names at +0x1C (ai.md §4; U-001, U-022). +0x00 is unused and +0x0C is overwritten at load. */
export interface AiParameterEntry {
  readonly kind: 'parameters';
  /** +0x04 i32. */
  readonly at04: number;
  /** +0x08 f32. */
  readonly at08: number;
  /** +0x10 f32. */
  readonly at10: number;
  /** +0x14 f32. */
  readonly at14: number;
  /** +0x18 u32. */
  readonly at18: number;
  /** +0x1C u32. */
  readonly at1C: number;
  /** +0x20 f32. */
  readonly at20: number;
  /** +0x24 u32. */
  readonly at24: number;
  /** +0x28 u32. */
  readonly at28: number;
  /** +0x2C f32. */
  readonly at2C: number;
  /** +0x30 f32. */
  readonly at30: number;
  /** +0x34 u32 flag. */
  readonly at34: number;
  /** +0x38 entry ID: index of the `script` entry run once when the program is installed, or null for 0 (none). */
  readonly installScript: number | null;
  /** Indexes of `script` entries; an index may repeat. */
  readonly stateScripts: StateScripts;
}

/** A 0x18-byte script item (ai.md §5; U-001, U-022); the run-time words +0x08 … +0x10 are not carried. */
export interface ScriptItem {
  /** +0x00 u32. */
  readonly opcode: number;
  /** +0x04 pointer to the argument text as stored, or null for 0 (no argument). */
  readonly argument: ByteString | null;
  /** +0x14 pointer: index of an item of the same script, or null for 0 (no branch). */
  readonly branch: number | null;
}

/** A TABL script: its items up to and including the first one whose opcode is `AI_SCRIPT_END_OPCODE`. */
export interface AiScriptEntry {
  readonly kind: 'script';
  readonly items: readonly ScriptItem[];
}

export type AiEntry = AiParameterEntry | AiScriptEntry;

export interface AiPrograms {
  /** AICO +0x00: the i32 triple of difficulty group 0 (ai.md §2). */
  readonly groupTriple: I32x3;
  readonly globals: AiGlobals;
  /** TABL 6003 records in source order. */
  readonly programs: readonly TableProgram[];
  /**
   * The entries the programs' ID chain names, each once, in the order the table loader `0x649c8` first reaches them: per
   * program its +0x1C entry, then that entry's install script and its state lists in source order.
   */
  readonly entries: readonly AiEntry[];
  /** The built-in table's records in source order. */
  readonly builtInPrograms: readonly BuiltInProgram[];
}

const readF32x4 = tuples<F32x4>(AI_PROGRAMS_COUNTS.elementValues, readF32);
const readName = byteStrings(AI_PROGRAMS_LIMITS.programNameBytes);
const readNullableIndex = (value: unknown, path: string) => readNullable(value, path, readIndex);

const GLOBALS: Shape<AiGlobals> = {
  at08: readI32, at0C: readF32, at10: readF32, at14: readF32,
  elements: listOf(AI_PROGRAMS_LIMITS.globalElements, readF32x4),
  at20: readF32, at24: readF32, at28: readI32, at2C: readI32, at30: readI32, at34: readF32, at38: readU32, at3C: readF32,
  at40: readF32, at44: readF32, at48: readF32,
};

const HEAD: Shape<ProgramHead> = { name: readName, at04: readU32 };
const MIDDLE: Shape<ProgramMiddle> = { at0C: readI32, at10: readI32, at14: readI32 };
const LIMITS: Shape<ProgramLimits> = { at24: readF32, at28: readF32 };
const TAIL: Shape<ProgramTail> = {
  at30: readF32, at34: readU32, at38: readU32, at3C: readF32, at40: readF32, at44: readU32, at48: readF32, at4C: readF32,
  at50: readU32,
};

/** A value whose source 0 is carried as null, so 0 itself never occurs. */
function readNonZero(read: (value: unknown, path: string) => number) {
  return (value: unknown, path: string): number | null => {
    const number = readNullable(value, path, read);
    return number === 0 ? invalid(path, 'must be null for a source 0') : number;
  };
}

const TABLE_PROGRAM: Shape<TableProgram> = {
  ...HEAD, kindMask: readNonZero(readU32), ...MIDDLE, parameters: readIndex, ...LIMITS, at2C: readNonZero(readF32), ...TAIL,
};

const CODE_IDENTITY: Shape<CodeIdentity> = {
  object: (value, path) => {
    const object = readU32(value, path);
    return object >= 1 && object <= 0xffff ? object : invalid(path, 'must be an LE object number from 1 to 65535');
  },
  offset: readU32,
};

const BUILT_IN_PROGRAM: Shape<BuiltInProgram> = {
  ...HEAD, kindMask: readU32, ...MIDDLE, handler: records(CODE_IDENTITY), ...LIMITS, at2C: readF32, ...TAIL,
};

const readStateList = listOf(AI_PROGRAMS_LIMITS.stateScriptItems, readIndex);

const STATE_SCRIPTS: Shape<StateScripts> = {
  state1: readStateList, state2: readStateList, state3: readStateList, state5: readStateList, state4: readStateList,
  state6: readStateList,
};

const kindOf = <K extends AiEntry['kind']>(kind: K) => (value: unknown, path: string): K =>
  (value === kind ? kind : invalid(path, `must be ${kind}`));

const PARAMETER_ENTRY: Shape<AiParameterEntry> = {
  kind: kindOf('parameters'),
  at04: readI32, at08: readF32, at10: readF32, at14: readF32, at18: readU32, at1C: readU32, at20: readF32, at24: readU32,
  at28: readU32, at2C: readF32, at30: readF32, at34: readU32,
  installScript: readNullableIndex,
  stateScripts: records(STATE_SCRIPTS),
};

const readScriptText = byteStrings(AI_PROGRAMS_LIMITS.scriptTextBytes);
const readScriptItem = records<ScriptItem>({
  opcode: readU32,
  argument: (value, path) => readNullable(value, path, readScriptText),
  branch: readNullableIndex,
});

function readScriptItems(value: unknown, path: string): readonly ScriptItem[] {
  const items = readList(value, path, AI_PROGRAMS_LIMITS.scriptItems, readScriptItem, 1);
  items.forEach(({ opcode, branch }, index) => {
    const at = `${path}[${index}]`;
    if ((opcode === AI_SCRIPT_END_OPCODE) !== (index === items.length - 1)) {
      invalid(`${at}.opcode`, 'must end the script exactly at its last item');
    }
    if (branch !== null) requireTarget(branch, items.length, `${at}.branch`, 'an item of the script');
  });
  return items;
}

const readParameterEntry = records(PARAMETER_ENTRY);
const readScriptEntry = records<AiScriptEntry>({ kind: kindOf('script'), items: readScriptItems });

function readEntry(value: unknown, path: string): AiEntry {
  const record = readPlainRecord(value, path);
  switch (record.kind) {
    case 'parameters': return readParameterEntry(record, path);
    case 'script': return readScriptEntry(record, path);
    default: return invalid(`${path}.kind`, 'must be parameters or script');
  }
}

const readPrograms = records<AiPrograms>({
  groupTriple: tuples<I32x3>(AI_PROGRAMS_COUNTS.triple, readI32),
  globals: records(GLOBALS),
  programs: listOf(AI_PROGRAMS_LIMITS.programRecords, records(TABLE_PROGRAM)),
  entries: listOf(AI_PROGRAMS_LIMITS.entries, readEntry),
  builtInPrograms: listOf(AI_PROGRAMS_LIMITS.programRecords, records(BUILT_IN_PROGRAM)),
});

/**
 * Every entry reference names an entry of the kind its field requires, and the entries are exactly those the programs
 * reach, in first-reach order.
 */
function checkEntries({ programs, entries }: AiPrograms, path: string): void {
  let reached = 0;
  const reach = (index: number, kind: AiEntry['kind'], at: string): void => {
    requireTarget(index, entries.length, at, 'an entry');
    if (entries[index].kind !== kind) mismatch(at, `must index a ${kind} entry`);
    if (index > reached) mismatch(at, 'must name the entries in the order the table loader first reaches them');
    if (index === reached) reached++;
  };
  programs.forEach((program, programIndex) => {
    const at = `${path}.programs[${programIndex}].parameters`;
    reach(program.parameters, 'parameters', at);
    const entry = entries[program.parameters] as AiParameterEntry;
    const entryAt = `${path}.entries[${program.parameters}]`;
    if (entry.installScript !== null) reach(entry.installScript, 'script', `${entryAt}.installScript`);
    for (const [state, list] of Object.entries(entry.stateScripts) as [keyof StateScripts, readonly number[]][]) {
      list.forEach((script, index) => reach(script, 'script', `${entryAt}.stateScripts.${state}[${index}]`));
    }
  });
  if (reached !== entries.length) mismatch(`${path}.entries[${reached}]`, 'must be reached from the programs');
}

/** Strictly reads `data/ai-programs` content into frozen data isolated from `value`. */
export function readAiPrograms(value: unknown, path = 'aiPrograms'): AiPrograms {
  const programs = readPrograms(value, path);
  checkEntries(programs, path);
  return programs;
}
