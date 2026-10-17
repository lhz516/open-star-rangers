/**
 * The AI support closure of a world and its creation-time checks (docs/plan/p3/02/spec.md, CR-15, CR-26;
 * docs/original/formats/ai.md §1, §10). The content readers have already checked the complete AI content's structure,
 * references and limits; this module decides which part of it the configured run can execute and requires executable
 * semantics of that part only.
 *
 * Reachability is conservative and draws nothing: for every object source of the run (instantiableRecords: direct and
 * delayed declarations, group members and the selected wingman option) it enumerates every start of the selection
 * `0x5dbc8`/`0x5de18` with the source's kind, +0xDC and +0xE0 after the build's defaults, and takes the union. The
 * selection happens once per object and the reinstall after parking, resuming or rescue keeps the record, so nothing
 * else can reach another record (ai §1). The closure then holds every script a reachable record's DFPG names (its
 * install script and all six state lists) with every opcode up to the script's 10000, and the reachable built-in
 * records' handlers. Kind 0x4000, the player and run-time kinds select nothing; a missile gets built-in record 1 or 2
 * only through `0x2ab00` (P3-07, rule-data.ts).
 *
 * Every failure is a CoreInputError at a structural path with one of CR-15's stable reasons; none repeats an imported
 * value. Run-time limits (the execution budget, the Xpon throttle index) remain Core faults (CR-15, CR-25).
 */
import type { AiParameterEntry, AiPrograms, AiScriptEntry, CodeIdentity, TableProgram } from '../../content/rule-data/ai-programs.ts';
import type { CraftInfo, CraftRecord } from '../../content/rule-data/craft-info.ts';
import { CoreInputError } from '../errors.ts';
import type { InstantiableRecord } from '../world/setup-check.ts';
import { planArgument, type ArgumentPlan } from './ai-parameters.ts';
import { toInt32 } from './record-defaults.ts';
import { WINGMAN_KIND_BIT } from './spawn-schedule.ts';

const AI_PROGRAMS = 'input.aiPrograms.content';
const CRAFT_INFO = 'input.craftInfo.content';

/** The kinds `0x20990` selects a program for: 2, 8, 0x10, 0x40, 0x80–0x2000 and 0x8000–0x80000 (ai §1). */
export const SELECTION_KINDS = 0xfbfda;

/** SCEN header +0x0C, the selection flag: the mission reader rejects any other value (CR-26). */
export const SELECTION_FLAG = 0;

/** A table record's kind mask when its stored +0x08 is 0 (ai §6). */
export const DEFAULT_KIND_MASK = 0x380;
/** A table record's +0x2C when its stored value is +0.0 or −0.0 (ai §6). */
export const DEFAULT_SATURATION = 1;

/** A table record after the load transforms of `0x649c8` (ai §6); its name is never read. */
export type LoadedTableProgram = Omit<TableProgram, 'name' | 'kindMask' | 'at2C'> & { readonly kindMask: number; readonly at2C: number };

/** The record fields the selection `0x5de18` reads. */
export type SelectableRecord = Pick<LoadedTableProgram, 'kindMask' | 'at04' | 'at0C' | 'at10'>;

/** The values the selection reads of an object: its kind and runtime +0xDC and +0xE0, i32. */
export interface SelectionSubject {
  readonly kindBit: number;
  readonly dc: number;
  readonly e0: number;
}

/** The built-in handlers Core implements for AI selection, by their code identity (CR-15). */
export type BuiltInHandler = 'wingman' | 'base';

/**
 * The supported handler identities: Ghidra addresses `0x610c8` (wingman) and `0x62c10` (bases) in LE object 2, which
 * the loader maps at 0x20000 (executable.md §4). Identities are compared for equality only; the missiles' records 1
 * and 2 are installed by number, not through this map (P3-07).
 */
export const AI_HANDLER_IDENTITIES: ReadonlyMap<BuiltInHandler, CodeIdentity> = new Map<BuiltInHandler, CodeIdentity>([
  ['wingman', Object.freeze({ object: 2, offset: 0x410c8 })],
  ['base', Object.freeze({ object: 2, offset: 0x42c10 })],
]);

/** The handler Core implements for `identity`, or null. */
export function builtInHandler(identity: CodeIdentity): BuiltInHandler | null {
  for (const [handler, { object, offset }] of AI_HANDLER_IDENTITIES) if (identity.object === object && identity.offset === offset) return handler;
  return null;
}

/** `0x5de18`'s match result for one start: the first full match, and the last partial match in scan order. */
export interface TableScan {
  readonly full: number | null;
  readonly partial: number | null;
}

/** |runtime +0xE0| as `NEG` gives it: 0x80000000 stays negative. */
const magnitude = (value: number): number => (value < 0 ? toInt32(-value) : value);

/**
 * The scan of `0x5de18` over `records` from `start`: records start … count − 1, then 0 … start − 1, stopping after the
 * first full match. A record matches partially when the flag is set or its +0x04 is not 1, the kind shares a bit with
 * its mask and +0xDC ≤ +0x0C (signed); fully when also |+0xE0| ≥ +0x10 (signed).
 */
export function scanProgramTable(records: readonly SelectableRecord[], start: number, subject: SelectionSubject, flag = SELECTION_FLAG): TableScan {
  const kind = 2 ** subject.kindBit;
  const e0 = magnitude(subject.e0);
  let partial: number | null = null;
  for (let step = 0; step < records.length; step++) {
    const index = (start + step) % records.length;
    const record = records[index];
    if ((flag === 0 && record.at04 === 1) || ((record.kindMask >>> 0) & kind) === 0 || subject.dc > record.at0C) continue;
    partial = index;
    if (e0 >= record.at10) return { full: index, partial };
  }
  return { full: null, partial };
}

/** The records one table can give `subject`, over every start; empty when no record matches even partially. */
function tableResults(records: readonly SelectableRecord[], subject: SelectionSubject): Set<number> {
  const results = new Set<number>();
  for (let start = 0; start < records.length; start++) {
    const { full, partial } = scanProgramTable(records, start, subject);
    const result = full ?? partial;
    if (result !== null) results.add(result);
  }
  return results;
}

/** The static AI data of a world (CR-15): fixed at creation from setupHash-bound inputs, never in a snapshot. */
export interface AiRuleData {
  /** Every TABL 6003 record after the load transforms, in content order. */
  readonly tablePrograms: readonly LoadedTableProgram[];
  /** By built-in record: the handler Core implements for its identity, or null. A reachable record never has null. */
  readonly builtInHandlers: readonly (BuiltInHandler | null)[];
  /** By entry index: F(+0x08²) of a reachable DFPG (`0x649c8`), else null. */
  readonly thresholdsSquared: readonly (number | null)[];
  /** By entry index: a reachable script's parse plans, one per item, else null. */
  readonly scripts: readonly (readonly ArgumentPlan[] | null)[];
  /** The reachability result, for diagnostics and tests only: indexes in ascending order. */
  readonly reachable: {
    readonly tablePrograms: readonly number[];
    readonly builtInPrograms: readonly number[];
    readonly parameters: readonly number[];
    readonly scripts: readonly number[];
  };
}

/** `0x649c8`'s transforms of a table record: +0x08 0 → 0x380, +0x2C ±0 → 1.0 (stored as null by the import). */
export function loadTableProgram({ name: _name, kindMask, at2C, ...rest }: TableProgram): LoadedTableProgram {
  return Object.freeze({ ...rest, kindMask: kindMask ?? DEFAULT_KIND_MASK, at2C: at2C ?? DEFAULT_SATURATION });
}

const ascending = (values: Iterable<number>): readonly number[] => Object.freeze([...values].sort((left, right) => left - right));

/** A scale `0x5c768` can give the steering block: its smallest magnitude, and where it comes from (null: a code value). */
interface Scale {
  readonly value: number;
  readonly path: string | null;
}

/** The speed and turn scales a steering block can hold and the craft fields its divisors multiply them by. */
interface RateUse {
  readonly kindBit: number;
  readonly speed: readonly Scale[];
  readonly turn: readonly Scale[];
  /** S+0x4C (+0xB8 × speed) is a divisor. */
  readonly speedLimit: boolean;
  /** Turn-rate fields that are divisors: +0xAC (S+0x54), +0xB4 (S+0x58), +0xB0 (S+0x5C). */
  readonly turnRates: ReadonlySet<'atAC' | 'atB4' | 'atB0'>;
}

/** `0x5c530`'s 1.0, and `0x5e4d0`'s floors of v1 (0.65) and v2 (0.5), whose values only grow from there (ai §11.2). */
const UNIT_SCALE: Scale = { value: 1, path: null };
const SPEED_FLOOR: Scale = { value: Math.fround(0.65), path: null };
const TURN_FLOOR: Scale = { value: 0.5, path: null };

/**
 * `zero-rate`: a divisor of the AI paths, F(craft field × scale), is 0 for some scale that reaches the kind (CR-15).
 * A product is 0 when the field is 0 or the scale is, or when it underflows; a larger scale only moves it from 0.
 */
function checkRates(info: CraftInfo, { kindBit, speed, turn, speedLimit, turnRates }: RateUse): void {
  const craft: CraftRecord = info.craft[kindBit];
  const check = (field: 'atB8' | 'atAC' | 'atB4' | 'atB0', scales: readonly Scale[]) => {
    for (const scale of scales) {
      if (Math.fround(craft[field] * scale.value) !== 0) continue;
      const path = craft[field] === 0 || scale.path === null ? `${CRAFT_INFO}.craft[${kindBit}].${field}` : scale.path;
      throw new CoreInputError(path, 'zero-rate');
    }
  };
  if (speedLimit) check('atB8', speed);
  for (const field of ['atAC', 'atB4', 'atB0'] as const) if (turnRates.has(field)) check(field, turn);
}

/** The divisors a script's opcodes use: 1001–1003 a turn rate each, 1101 (the attack pass `0x63c00`) S+0x4C and S+0x58. */
const TURN_RATE_OPCODES = new Map([[1001, 'atAC'], [1002, 'atB4'], [1003, 'atB0']] as const);
const ATTACK_PASS_OPCODE = 1101;

/**
 * The static AI data of a run and the checks of CR-15 on it, in this order: the selection of every object source; the
 * reachable table records, built-in records, DFPGs and scripts with their items; the rate divisors; the wingman's
 * element and divisors; the attack pass's weave period. `records` are the run's instantiable records (setup-check.ts).
 */
export function aiRuleData(programs: AiPrograms, info: CraftInfo, records: readonly InstantiableRecord[]): AiRuleData {
  const tablePrograms = Object.freeze(programs.programs.map(loadTableProgram));
  const builtInHandlers = Object.freeze(programs.builtInPrograms.map(({ handler }) => builtInHandler(handler)));
  // The sources that can reach each record.
  const reachedTable = new Map<number, InstantiableRecord[]>();
  const reachedBuiltIn = new Map<number, InstantiableRecord[]>();

  // Selection (0x5dbc8): the group table's match, else the built-in table's; rand % count faults on an empty table.
  for (const record of records) {
    if (((SELECTION_KINDS >>> record.kindBit) & 1) === 0) continue;
    const subject = { kindBit: record.kindBit, dc: record.ruleInputs.aiValueA, e0: record.ruleInputs.aiValueB };
    if (tablePrograms.length === 0) throw new CoreInputError(`${AI_PROGRAMS}.programs`, 'zero-divisor');
    let results = tableResults(tablePrograms, subject);
    let reached = reachedTable;
    if (results.size === 0) {
      if (programs.builtInPrograms.length === 0) throw new CoreInputError(`${AI_PROGRAMS}.builtInPrograms`, 'zero-divisor');
      results = tableResults(programs.builtInPrograms, subject);
      reached = reachedBuiltIn;
    }
    for (const result of results) {
      const sources = reached.get(result);
      if (sources === undefined) reached.set(result, [record]);
      else sources.push(record);
    }
  }

  const tableIndexes = ascending(reachedTable.keys());
  for (const index of tableIndexes) {
    const { at0C, at14, at50 } = tablePrograms[index];
    const path = `${AI_PROGRAMS}.programs[${index}]`;
    // 0x5e4d0 divides by +0x0C and triples the period in i32.
    if (at50 !== 0 && at0C === 0) throw new CoreInputError(`${path}.at0C`, 'zero-divisor');
    if (at14 < 0 || (at50 !== 0 && at14 > 0x2aaa_aaaa)) throw new CoreInputError(`${path}.at14`, 'negative-period');
  }
  const builtInIndexes = ascending(reachedBuiltIn.keys());
  for (const index of builtInIndexes) {
    const path = `${AI_PROGRAMS}.builtInPrograms[${index}]`;
    if (builtInHandlers[index] === null) throw new CoreInputError(`${path}.handler`, 'unsupported-handler');
    if (programs.builtInPrograms[index].at14 < 0) throw new CoreInputError(`${path}.at14`, 'negative-period');
  }

  const parameterIndexes = ascending(new Set(tableIndexes.map((index) => tablePrograms[index].parameters)));
  const scriptsOf = (entry: AiParameterEntry): number[] => [
    ...(entry.installScript === null ? [] : [entry.installScript]), ...Object.values(entry.stateScripts).flat(),
  ];
  const scriptIndexes = ascending(new Set(parameterIndexes.flatMap((index) => scriptsOf(programs.entries[index] as AiParameterEntry))));
  const thresholdsSquared: (number | null)[] = programs.entries.map(() => null);
  for (const index of parameterIndexes) {
    const entry = programs.entries[index] as AiParameterEntry;
    // 0x63250 adds rand % +0x04 to the clock: a negative period never expires.
    if (entry.at04 < 0) throw new CoreInputError(`${AI_PROGRAMS}.entries[${index}].at04`, 'negative-period');
    thresholdsSquared[index] = Math.fround(entry.at08 * entry.at08);
  }
  const scripts: (readonly ArgumentPlan[] | null)[] = programs.entries.map(() => null);
  const opcodes = new Map<number, ReadonlySet<number>>();
  for (const index of scriptIndexes) {
    const { items } = programs.entries[index] as AiScriptEntry;
    scripts[index] = Object.freeze(items.map(({ opcode, argument }, item) =>
      planArgument(opcode, argument, programs.keywordTables, `${AI_PROGRAMS}.entries[${index}].items[${item}]`)));
    opcodes.set(index, new Set(items.map(({ opcode }) => opcode)));
  }

  // The rate divisors of every reachable table record, for each kind that reaches it (0x5c768 through 0x5e4d0 or +0x34).
  let attackPass = false;
  for (const index of tableIndexes) {
    const program = tablePrograms[index];
    const path = `${AI_PROGRAMS}.programs[${index}]`;
    const used = new Set(scriptsOf(programs.entries[program.parameters] as AiParameterEntry).flatMap((script) => [...(opcodes.get(script) as ReadonlySet<number>)]));
    const pass = used.has(ATTACK_PASS_OPCODE);
    attackPass ||= pass;
    const turnRates = new Set([...TURN_RATE_OPCODES].filter(([opcode]) => used.has(opcode)).map(([, field]) => field));
    if (pass) turnRates.add('atB4');
    const scales = (floor: Scale, field: 'at40' | 'at3C'): Scale[] => [
      UNIT_SCALE, ...(program.at50 !== 0 ? [floor] : []), ...(program.at34 !== 0 ? [{ value: program[field], path: `${path}.${field}` }] : []),
    ];
    const speed = scales(SPEED_FLOOR, 'at40');
    const turn = scales(TURN_FLOOR, 'at3C');
    for (const kindBit of ascending(new Set((reachedTable.get(index) as InstantiableRecord[]).map((record) => record.kindBit)))) {
      checkRates(info, { kindBit, speed, turn, speedLimit: pass, turnRates });
    }
  }

  // The AICO element of a source's +0xDC − 1 (0x60f80 reads it unchecked, the reply voice too).
  const elements = programs.globals.elements;
  const elementOf = (record: InstantiableRecord): number => {
    const element = record.ruleInputs.aiValueA - 1;
    if (element < 0 || element >= elements.length) throw new CoreInputError(`${record.path}.ruleInputs.aiValueA`, 'element-out-of-range');
    return element;
  };
  const wingman = records.find(({ kindBit }) => kindBit === WINGMAN_KIND_BIT);
  if (wingman !== undefined) elementOf(wingman);
  // Whatever kind reaches the wingman handler steers with its element's +0x00/+0x04 (0x60f80) and runs the attack pass.
  for (const index of builtInIndexes) {
    if (builtInHandlers[index] !== 'wingman') continue;
    attackPass = true;
    for (const record of reachedBuiltIn.get(index) as InstantiableRecord[]) {
      const element = elementOf(record);
      const at = `${AI_PROGRAMS}.globals.elements[${element}]`;
      const [speed, turn] = elements[element];
      checkRates(info, {
        kindBit: record.kindBit, speed: [UNIT_SCALE, { value: speed, path: at }], turn: [UNIT_SCALE, { value: turn, path: at }], speedLimit: true, turnRates: new Set(['atB4']),
      });
    }
  }
  // The wingman's status reply divides by its hull capacity.
  if (wingman !== undefined && info.craft[WINGMAN_KIND_BIT].at9C === 0) {
    throw new CoreInputError(`${CRAFT_INFO}.craft[${WINGMAN_KIND_BIT}].at9C`, 'zero-craft-divisor');
  }
  if (attackPass) {
    const { at3C, at40 } = programs.globals;
    if (Math.min(at3C, at40) <= 0 && Math.max(at3C, at40) >= 0) throw new CoreInputError(`${AI_PROGRAMS}.globals.at3C`, 'zero-craft-divisor');
  }

  return Object.freeze({
    tablePrograms,
    builtInHandlers,
    thresholdsSquared: Object.freeze(thresholdsSquared),
    scripts: Object.freeze(scripts),
    reachable: Object.freeze({ tablePrograms: tableIndexes, builtInPrograms: builtInIndexes, parameters: parameterIndexes, scripts: scriptIndexes }),
  });
}
