/**
 * The communications rule data of world creation (docs/plan/p3/02/spec.md, CB-01; docs/plan/p3/10/spec.md, 规则输入与读模型边界
 * and D-03 item 4): the semantic checks of the three P3-10 rule-data inputs (rule-data.ts) against the setup, and the
 * static `WorldRuleData.communications` computed from them. Checks run in CB-01's order and read only what P3-10's rules
 * read:
 *
 * 1. Menu keys (comm.md §4, §7.2): byte 1 of an item's text is its key. Every item of the three command tables, the
 *    category table's exit item and the object list's exit text have at least 2 bytes. A command item other than the
 *    exit has a key `1`–`9`, which `select-number` expresses; every exit key folds to `x`, which `communications close`
 *    expresses. The exit is therefore each table's first item folding to `x`: the other command keys are digits, and a
 *    category's generated key is its position, 1–9 by check 2. Duplicate keys are kept with their first-match order.
 *    Any command code the reader admits (u32, 0 exactly in the exit) is one CB-04 stores, so none is rejected here.
 * 2. Generated keys (comm.md §7.3, §8): a conservative bound of each category's objects and of the shown categories,
 *    exit items excluded, is at most 9. A category's bound is the instances of its kinds over the run's lifetime: every
 *    spawn queue entry that posts requests (direct and delayed records, each request of a group for every member, the
 *    selected wingman), as each entry fires once. A mask with a kind only runtime construction allocates (bits 14 and
 *    20–25) has no bound and is rejected. Command menus are not bounded: their keys are data keys (check 1).
 * 3. Service selectors (hud.md TABL 10165; executable.md BS3, BS10): each is 0–18 or a group 33 or 34. 19–31 address
 *    subsystem fields Core does not have, 32 and above 34 the original's 32-entry slot tables.
 * 4. The base energy rate (BS1, BS10): the player kind's craft record +0x54 is not negative, as the original divides it
 *    unsigned; +0x9C is CR-01 check 5's.
 * 5. Message metadata: the reader holds its structure; a failed lookup is the original's no-message branch (RQ4).
 *
 * Name indexes (RX1; comm.md §9) are computed here once, by byte equality of every name a NameReference can stand for
 * with the two name lists; rules look them up and never compare texts while running.
 *
 * Errors are CoreInputError at a structural path with a fixed reason that never repeats an imported value.
 */
import type { CategoryItem, CommandItem } from '../../content/rule-data/comm-menus.ts';
import type { CommMessage } from '../../content/rule-data/comm-messages.ts';
import type { ByteString } from '../../content/rule-data/rule-data-fields.ts';
import type { CraftInfo } from '../../content/rule-data/craft-info.ts';
import { CoreFaultError, CoreInputError } from '../errors.ts';
import type { MissionSetup } from '../mission/load-mission.ts';
import { PLAYER_KIND_BIT, postsRequests, WINGMAN_KIND_BIT } from '../rules/spawn-schedule.ts';
import type { NameReference } from './entity-table.ts';
import type { MenuCommandTable } from './player-state.ts';
import type { RuleDataInputs } from './rule-data.ts';
import type { SpawnState } from './spawn-state.ts';

/** The most generated keys a menu may need: `select-number` expresses 1–9 only. */
const MAX_GENERATED_KEYS = 9;

/** Kind bits only runtime construction allocates (comm.md §8): 0x4000 and bits 20–25. */
const RUNTIME_CONSTRUCTED_KINDS = 0x3f04000;

/** The selectors the base service supports (BS3): subsystem fields 0–18, and the groups 0x21 and 0x22. */
const isSupportedSelector = (selector: number): boolean => selector <= 18 || selector === 0x21 || selector === 0x22;

/** A name's positions in COMM TABL 2001 and 2011, null where absent (RX1's −1). */
export interface NameIndex {
  readonly in2001: number | null;
  readonly in2011: number | null;
}

/** The name index of every NameReference the run can hold. */
export interface NameIndexTable {
  readonly none: NameIndex;
  /** By collection, declaration and candidate. */
  readonly candidates: { readonly [Collection in 'mission' | 'wingman']: readonly (readonly NameIndex[])[] };
  /** By name pool index. */
  readonly pool: readonly NameIndex[];
  /** By kind bit: the craft info record's name. */
  readonly craftTypes: readonly NameIndex[];
}

/** A message table entry: null for an entry of 0, otherwise its frames' durations (i32, 1/8 s). */
export type MessageFrames = readonly number[] | null;

/** The static communications rule data (CB-01): fixed at creation, never in a snapshot. Keys are raw bytes, folded when matched. */
export interface CommunicationsRuleData {
  readonly menus: {
    /** TABL 2007 in order, the exit (kindMask 0) last. Only the exit's key is read; another item's is byte 1 or 0, as stored. */
    readonly categories: readonly { readonly key: number; readonly kindMask: number }[];
    /** TABL 2009's key. */
    readonly objectListExitKey: number;
    /** TABL 2003, 2005 and 2013 in order, the exit (code 0) last. */
    readonly commands: { readonly [Table in MenuCommandTable]: readonly { readonly key: number; readonly code: number }[] };
  };
  /** Exactly 11: record 0–10's selector +0x6C. */
  readonly serviceSelectors: readonly number[];
  readonly messages: {
    /** By table, face and index. */
    readonly faceTables: { readonly [Table in 20011 | 20019 | 20985]: readonly (readonly MessageFrames[])[] };
    /** TABL 20983 by index. */
    readonly direct: readonly MessageFrames[];
  };
  readonly nameIndexes: NameIndexTable;
}

const MENUS = 'input.commMenus.content';
const SELECTORS = 'input.baseRepairItems.content.subsystemSelectors';
const KEY_X = 0x78;
const isDigitKey = (key: number): boolean => key >= 0x31 && key <= 0x39;

/** `0x754d9` as the menus use it: A–Z to a–z, every other byte unchanged. */
export const foldKey = (key: number): number => (key >= 0x41 && key <= 0x5a ? key + 0x20 : key);

/** Byte 1 of a text of at least 2 bytes (check 1). */
function dataKey(text: ByteString, path: string): number {
  if (text.length < 2) throw new CoreInputError(path, 'must have at least 2 bytes, as byte 1 is the item\'s key');
  return text.charCodeAt(1);
}

function exitKey(text: ByteString, path: string): number {
  const key = dataKey(text, path);
  if (foldKey(key) !== KEY_X) throw new CoreInputError(path, 'must have a key that folds to x, the only key communications close expresses');
  return key;
}

function commandKeys(items: readonly CommandItem[], path: string) {
  return Object.freeze(items.map(({ text, command }, index) => {
    const at = `${path}[${index}].text`;
    if (command === 0) return Object.freeze({ key: exitKey(text, at), code: command });
    const key = dataKey(text, at);
    if (!isDigitKey(key)) throw new CoreInputError(at, 'must have a key of 1 to 9, the keys select-number expresses');
    return Object.freeze({ key, code: command });
  }));
}

function categoryKeys(items: readonly CategoryItem[]) {
  return Object.freeze(items.map(({ text, kindMask }, index) => Object.freeze({
    key: kindMask === 0 ? exitKey(text, `${MENUS}.categories[${index}].text`) : text.length > 1 ? text.charCodeAt(1) : 0,
    kindMask,
  })));
}

/** Instances of each kind bit over the run's lifetime; see check 2 of the module comment. */
function lifetimeInstances(setup: MissionSetup, spawn: SpawnState): readonly number[] {
  const counts = new Array<number>(32).fill(0);
  const add = (kindBit: number | null, count: number): void => {
    // checkSetup admits no instantiable record without a kind.
    if (kindBit !== null) counts[kindBit] += count;
  };
  for (const entry of spawn.queue) {
    if (!postsRequests(spawn, setup, entry)) continue;
    if (entry.source === 'record') add(setup.declarations[entry.index].craftType, entry.requests);
    else if (entry.source === 'group') for (const member of setup.groups[entry.index].members) add(setup.declarations[member].craftType, entry.requests);
    else add(WINGMAN_KIND_BIT, entry.requests);
  }
  return counts;
}

/** The instances of every kind in `mask`. */
function instancesIn(mask: number, instances: readonly number[]): number {
  let sum = 0;
  for (let bit = 0; bit < 32; bit++) if (((mask >>> bit) & 1) === 1) sum += instances[bit];
  return sum;
}

/** Check 2: the generated keys of the category menu and of each category's object list. */
function checkGeneratedKeys(categories: readonly CategoryItem[], setup: MissionSetup, spawn: SpawnState): void {
  const instances = lifetimeInstances(setup, spawn);
  let shown = 0;
  categories.forEach(({ kindMask }, index) => {
    if (kindMask === 0) return;
    const path = `${MENUS}.categories[${index}].kindMask`;
    if ((kindMask & RUNTIME_CONSTRUCTED_KINDS) !== 0) throw new CoreInputError(path, 'includes a kind only runtime construction allocates, whose object count has no bound');
    const bound = instancesIn(kindMask, instances);
    if (bound > MAX_GENERATED_KEYS) throw new CoreInputError(path, `can list more than ${MAX_GENERATED_KEYS} objects, past the keys select-number expresses`);
    if (bound > 0) shown += 1;
  });
  if (shown > MAX_GENERATED_KEYS) throw new CoreInputError(`${MENUS}.categories`, `can show more than ${MAX_GENERATED_KEYS} categories, past the keys select-number expresses`);
}

const frames = (message: CommMessage): MessageFrames => (message.present ? message.frameDurations : null);
const faceTable = (table: readonly (readonly CommMessage[])[]) => Object.freeze(table.map((face) => Object.freeze(face.map(frames))));

/** The name indexes of every name the run can hold; see the module comment. */
function nameIndexes(setup: MissionSetup, info: CraftInfo, names2001: readonly ByteString[], names2011: readonly ByteString[]): NameIndexTable {
  const first = (names: readonly ByteString[]) => {
    const positions = new Map<ByteString, number>();
    names.forEach((name, index) => { if (!positions.has(name)) positions.set(name, index); });
    return positions;
  };
  const in2001 = first(names2001);
  const in2011 = first(names2011);
  const index = (name: ByteString): NameIndex => Object.freeze({ in2001: in2001.get(name) ?? null, in2011: in2011.get(name) ?? null });
  const candidates = (records: MissionSetup['declarations']) => Object.freeze(records.map(({ nameCandidates }) => Object.freeze(nameCandidates.map(index))));
  return Object.freeze({
    none: index(''),
    candidates: Object.freeze({ mission: candidates(setup.declarations), wingman: candidates(setup.wingmanOptions) }),
    pool: Object.freeze(setup.namePool.map(index)),
    craftTypes: Object.freeze(info.craft.map(({ name }) => index(name))),
  });
}

/** The name index a reference stands for. */
export function nameIndexOf(table: NameIndexTable, name: NameReference): NameIndex {
  switch (name.type) {
    case 'none':
      return table.none;
    case 'candidate':
      return table.candidates[name.declaration.collection][name.declaration.index][name.candidate];
    case 'pool':
      return table.pool[name.index];
    case 'craft-type':
      return table.craftTypes[name.kindBit];
    case 'map-marker':
      // P3-09's marker (MW-03) is named from hud-text, which is not a rule input; it is never hit, destroyed or listed in
      // a menu (its kind bit 25 is runtime-constructed), so no rule asks for its index.
      throw new CoreFaultError('invariant-violated', 'comm-input.name-index');
  }
}

/**
 * The checks of the module comment and the static communications rule data. `setup` and `spawn` are the run's; `info`
 * is the craft info as read.
 */
export function communicationsRuleData(inputs: RuleDataInputs, info: CraftInfo, setup: MissionSetup, spawn: SpawnState): CommunicationsRuleData {
  const menus = inputs.commMenus.content;
  const commands = (field: 'gatedTargetCommands' | 'otherTargetCommands' | 'kind2TargetCommands') => commandKeys(menus[field], `${MENUS}.${field}`);
  const gated = commands('gatedTargetCommands');
  const other = commands('otherTargetCommands');
  const categories = categoryKeys(menus.categories);
  const objectListExitKey = exitKey(menus.objectListLastEntry, `${MENUS}.objectListLastEntry`);
  const kind2 = commands('kind2TargetCommands');
  checkGeneratedKeys(menus.categories, setup, spawn);

  const selectors = inputs.baseRepairItems.content.subsystemSelectors;
  selectors.forEach((selector, index) => {
    if (!isSupportedSelector(selector)) throw new CoreInputError(`${SELECTORS}[${index}]`, 'must be 0 to 18, 33 or 34, the selectors Core\'s 19 subsystem fields support');
  });
  if (info.craft[PLAYER_KIND_BIT].at54 < 0) {
    throw new CoreInputError(`input.craftInfo.content.craft[${PLAYER_KIND_BIT}].at54`, 'must not be negative for the player, as the base energy rate divides it unsigned');
  }

  const { faceTables, direct, names2001, names2011 } = inputs.commMessages.content;
  return Object.freeze({
    menus: Object.freeze({ categories, objectListExitKey, commands: Object.freeze({ gated, other, kind2 }) }),
    serviceSelectors: Object.freeze([...selectors]),
    messages: Object.freeze({
      faceTables: Object.freeze({ 20011: faceTable(faceTables[0]), 20019: faceTable(faceTables[1]), 20985: faceTable(faceTables[2]) }),
      direct: Object.freeze(direct.map(frames)),
    }),
    nameIndexes: nameIndexes(setup, info, names2001, names2011),
  });
}
