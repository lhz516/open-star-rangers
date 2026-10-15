/**
 * The rule-data inputs of world creation and the world's static rule data (docs/plan/p3/02/spec.md, CR-01;
 * docs/plan/p3/07/spec.md, 规则数据输入). Beside the craft info, creation takes nine top-level inputs of the package the
 * logic Assets came from, which the caller decoded with that package's payload readers:
 *
 * - `debrisParameters` `{ id, content }`: `data/debris-parameters`, read strictly with readDebrisParameters;
 * - `projectileVisuals` `{ id, content }`: the `data/projectile-visuals` effect content; Core reads only `kind` and every
 *   record's `length`;
 * - `explosions` `{ id, content }`: `data/explosions`, read strictly with readExplosionTable; Core keeps each entry's
 *   animation reference;
 * - `explosionAnimations` `{ id, content }[]`: each read strictly with readExplosionAnimation; Core keeps the frame count;
 * - `models` `{ id, content }[]`: model payload content; Core reads only `kind` and the length of part list 1;
 * - `aiPrograms` `{ id, content }`: `data/ai-programs`, read strictly with readAiPrograms; the rules read only built-in
 *   program records 1 and 2's +0x14, +0x24 and +0x2C, the homing missiles' programs (steering.ts). P3-08 extends its
 *   reading of the same input;
 * - `commMenus` `{ id, content }`: `data/comm-menus`, read strictly with readCommMenus;
 * - `baseRepairItems` `{ id, content }`: `data/base-repair-items`, read strictly with readBaseRepairItems;
 * - `commMessages` `{ id, content }`: `data/comm-messages`, read strictly with readCommMessages. P3-10 checks these three
 *   against the setup and derives `communications` from them (comm-input.ts; docs/plan/p3/02/spec.md, CB-01).
 *
 * Core checks the limits before it copies, freezes what it keeps and keeps nothing of the input. The two lists are in
 * strictly ascending Asset ID order, and each is exactly the set the rules read: the animations the explosion table
 * names, and the models the instantiable craft are bound to (setup-check.ts, instantiableRecords). Craft-info and DEBRIS
 * records the run cannot reach are neither read nor rejected; built-in program records 1 and 2 are always checked, since
 * whether a missile homes depends on its launch.
 *
 * The static rule data (CR-01) is computed once from them and the craft info, in the original's storage types
 * (load-transforms.ts), for the reachable records only, with the two homing programs; it is never part of a snapshot,
 * as setupHash binds its inputs.
 *
 * Errors, before any world exists: a missing or extra field, a wrong kind or role and every semantic failure are
 * CoreInputError at a structural path with a fixed reason; a malformed Asset ID and the content readers' failures keep
 * their ContentContractError. No error repeats an imported value.
 */
import { readAssetId, type AssetId } from '../../content/asset-id.ts';
import type { ContentIdentity } from '../../content/content-identity.ts';
import { compareText } from '../../content/contract-validation.ts';
import { EFFECT_LIMITS } from '../../content/effects/effect-payload.ts';
import { FLIGHT_DATA_FORMAT, FLIGHT_DATA_LIMITS } from '../../content/flight/flight-data-content.ts';
import { readExplosionAnimation, readExplosionTable } from '../../content/flight/flight-data-readers.ts';
import { MODEL_LIMITS } from '../../content/models/model-payload.ts';
import { CRAFT_INFO_COUNTS, type CraftInfo, type CraftRecord, type Mount } from '../../content/rule-data/craft-info.ts';
import { readAiPrograms, type AiPrograms } from '../../content/rule-data/ai-programs.ts';
import { readBaseRepairItems, type BaseRepairItems } from '../../content/rule-data/base-repair-items.ts';
import { readCommMenus, type CommMenus } from '../../content/rule-data/comm-menus.ts';
import { readCommMessages, type CommMessages } from '../../content/rule-data/comm-messages.ts';
import { readDebrisParameters, type DebrisParameters } from '../../content/rule-data/debris-parameters.ts';
import type { Vec3 } from '../contracts/domain-events.ts';
import { readDataRecord, readExactRecord, readList, readNumber } from '../contracts/validation.ts';
import { CoreInputError } from '../errors.ts';
import type { CollisionShape, ShapeBox } from '../rules/collision-shapes.ts';
import { initialHull, resourceArithmetic } from '../rules/combat-init.ts';
import { INITIAL_ALLOCATION } from '../rules/flight-state.ts';
import { isFiniteFloat32 } from '../rules/float32.ts';
import { invalidGuidanceField } from '../rules/guidance.ts';
import {
  AUTOMATIC_GUN, craftShape, debrisRuleData, gunRuleData, missileRuleData, mountOffsets,
  type DebrisRuleData, type GunRuleData, type MissileRuleData,
} from '../rules/load-transforms.ts';
import { toInt32 } from '../rules/record-defaults.ts';
import { PLAYER_KIND_BIT, WINGMAN_KIND_BIT } from '../rules/spawn-schedule.ts';
import type { SteeringProgram } from '../rules/steering.ts';
import type { CommunicationsRuleData } from './comm-input.ts';
import type { Level } from './entity-table.ts';
import type { InstantiableRecord } from './setup-check.ts';

/** The top-level rule-data inputs of world creation, in their order. */
export const RULE_DATA_FIELDS = [
  'debrisParameters', 'projectileVisuals', 'explosions', 'explosionAnimations', 'models', 'aiPrograms', 'commMenus', 'baseRepairItems', 'commMessages',
] as const;

/** The Asset of each single rule-data input in the slice (P3-03, P2-11); `original-import` content uses no other. */
export const PRODUCTION_RULE_DATA = Object.freeze({
  debrisParameters: 'data/debris-parameters',
  projectileVisuals: 'data/projectile-visuals',
  explosions: 'data/explosions',
  aiPrograms: 'data/ai-programs',
  commMenus: 'data/comm-menus',
  baseRepairItems: 'data/base-repair-items',
  commMessages: 'data/comm-messages',
});
/** The production explosion animations are `data/explosion-animation/<nn>`, numbered from 01. */
const PRODUCTION_ANIMATION = /^data\/explosion-animation\/(?!00)\d{2}$/;

/**
 * Limits checked before anything is copied, from the content's structural limits: the explosion table names at most
 * 3 × 16 animations, a model is bound to each of at most 20 craft kinds, effect content holds at most 64 projectile
 * records and a model at most 256 parts.
 */
export const RULE_DATA_LIMITS = Object.freeze({
  explosionAnimations: FLIGHT_DATA_FORMAT.explosionLists * FLIGHT_DATA_LIMITS.explosionListItems,
  models: CRAFT_INFO_COUNTS.craft,
  projectileRecords: EFFECT_LIMITS.effectRecords,
  modelParts: MODEL_LIMITS.modelParts,
});

/** The rule-data inputs as Core keeps them: what setupHash binds (setup-hash.ts). */
export interface RuleDataInputs {
  readonly debrisParameters: { readonly id: AssetId; readonly content: DebrisParameters };
  /** Every record's length, in record order: the record of gun g is record g (`0x2cf38`). */
  readonly projectileVisuals: { readonly id: AssetId; readonly lengths: readonly number[] };
  /** The animation of every entry of the three lists, in order. */
  readonly explosions: { readonly id: AssetId; readonly lists: readonly [readonly AssetId[], readonly AssetId[], readonly AssetId[]] };
  readonly explosionAnimations: readonly { readonly id: AssetId; readonly frames: number }[];
  /** Part list 1's part count of each model. */
  readonly models: readonly { readonly id: AssetId; readonly parts: number }[];
  /** The complete content as read. */
  readonly aiPrograms: { readonly id: AssetId; readonly content: AiPrograms };
  /** The complete content as read, as are the next two. */
  readonly commMenus: { readonly id: AssetId; readonly content: CommMenus };
  readonly baseRepairItems: { readonly id: AssetId; readonly content: BaseRepairItems };
  readonly commMessages: { readonly id: AssetId; readonly content: CommMessages };
}

/** The built-in program records homing missiles install, by record number (steering.ts, programRecord). */
export type HomingPrograms = { readonly [Record in 1 | 2]: SteeringProgram };

/** The static rule data of an instantiable craft kind. */
export interface CraftRuleData {
  /** The craft record's collision shape after the load (craft §3.8). */
  readonly shape: CollisionShape;
  /** Each mount's shot offset after the load: a non-automatic gun mount's +0x08 lengthened by its projectile. */
  readonly mountOffsets: readonly Vec3[];
  /** The part count of part list 1 of the kind's model: its fragments (X6). */
  readonly parts: number;
  /** The kind's DEBRIS records after the load, one per fragment part with parameters (craft §4.1). */
  readonly debris: readonly DebrisRuleData[];
}

/** The world's static rule data (CR-01): fixed at creation, never in a snapshot. */
export interface WorldRuleData {
  readonly inputs: RuleDataInputs;
  /** n₁₂: the frame count of every animation of lists 1 and 2; n₃: of list 3, null when it is empty. */
  readonly explosionFrames: { readonly lists12: number; readonly list3: number | null };
  /** By gun record; null for a gun no instantiable craft mounts. */
  readonly guns: readonly (GunRuleData | null)[];
  /** By missile record; null for a missile no instantiable craft mounts. */
  readonly missiles: readonly (MissileRuleData | null)[];
  /** By kind bit 0–19; null for a kind the run cannot instantiate. */
  readonly craft: readonly (CraftRuleData | null)[];
  /** Built-in program records 1 and 2's +0x14, +0x24 and +0x2C, copied from `inputs.aiPrograms`. */
  readonly homingPrograms: HomingPrograms;
  /** The menus, service selectors, message metadata and name indexes P3-10's rules read (comm-input.ts, CB-01). */
  readonly communications: CommunicationsRuleData;
}

const INPUT = 'input';
const CRAFT_INFO = 'input.craftInfo.content';
const DEBRIS = 'input.debrisParameters.content';
const EXPLOSIONS = 'input.explosions.content';
const AI_PROGRAMS = 'input.aiPrograms.content';

/** An Asset ID of a `data` input; for original-import content only the production Asset is accepted. */
function readDataId(value: unknown, path: string, identity: ContentIdentity, production: (id: AssetId) => boolean): AssetId {
  const id = readAssetId(value, path);
  if (!id.startsWith('data/')) throw new CoreInputError(path, 'must be a data Asset ID');
  if (identity.origin.type === 'original-import' && !production(id)) {
    throw new CoreInputError(path, 'must be the production Asset of its role for original-import content');
  }
  return id;
}

const isFiniteF32Rule = [isFiniteFloat32, 'must be a finite f32 value'] as const;

/** The projectile records' lengths, the only field of the effect content Core reads; see the module comment. */
function readProjectileLengths(value: unknown, path: string): readonly number[] {
  const content = readDataRecord(value, path, 3);
  if (content.kind !== 'projectile') throw new CoreInputError(`${path}.kind`, 'must be projectile');
  return readList(content.records, `${path}.records`, RULE_DATA_LIMITS.projectileRecords, (item, at) =>
    readNumber(readDataRecord(item, at, 4).length, `${at}.length`, isFiniteF32Rule));
}

/** Part list 1's part count, the only field of a model's content Core reads; its parts are not read. */
function readModelParts(value: unknown, path: string): number {
  const content = readDataRecord(value, path, 4);
  if (content.kind !== 'model') throw new CoreInputError(`${path}.kind`, 'must be model');
  const lists = readList(content.partLists, `${path}.partLists`, MODEL_LIMITS.partLists, (list) => list);
  if (lists.length !== MODEL_LIMITS.partLists) throw new CoreInputError(`${path}.partLists`, `must have ${MODEL_LIMITS.partLists} part lists`);
  return readList(lists[1], `${path}.partLists[1]`, RULE_DATA_LIMITS.modelParts, () => null).length;
}

/** Reads a list of `{ id, content }` whose IDs strictly ascend. */
function readAscending<Item extends { readonly id: AssetId }>(value: unknown, path: string, limit: number, read: (id: unknown, content: unknown, at: string) => Item): readonly Item[] {
  const items = readList(value, path, limit, (item, at) => {
    const { id, content } = readExactRecord(item, at, ['id', 'content']);
    return Object.freeze(read(id, content, at));
  });
  items.forEach(({ id }, index) => {
    if (index > 0 && compareText(items[index - 1].id, id) >= 0) throw new CoreInputError(`${path}[${index}].id`, 'must follow the previous ID in strictly ascending order');
  });
  return items;
}

/** Reads the nine rule-data inputs of `input` (the creation input record) for content of `identity`. */
export function readRuleDataInputs(input: Record<string, unknown>, identity: ContentIdentity): RuleDataInputs {
  const asset = (field: (typeof RULE_DATA_FIELDS)[number]) => readExactRecord(input[field], `${INPUT}.${field}`, ['id', 'content']);
  const production = (field: keyof typeof PRODUCTION_RULE_DATA) => (id: AssetId): boolean => id === PRODUCTION_RULE_DATA[field];
  /** A single input read whole by its content reader. */
  const whole = <Content>(field: keyof typeof PRODUCTION_RULE_DATA, read: (value: unknown, path: string) => Content) => {
    const { id, content } = asset(field);
    return Object.freeze({ id: readDataId(id, `${INPUT}.${field}.id`, identity, production(field)), content: read(content, `${INPUT}.${field}.content`) });
  };

  const debrisParameters = whole('debrisParameters', readDebrisParameters);
  const visuals = asset('projectileVisuals');
  const projectileVisuals = Object.freeze({
    id: readDataId(visuals.id, `${INPUT}.projectileVisuals.id`, identity, production('projectileVisuals')),
    lengths: readProjectileLengths(visuals.content, `${INPUT}.projectileVisuals.content`),
  });
  const table = asset('explosions');
  const explosionsId = readDataId(table.id, `${INPUT}.explosions.id`, identity, production('explosions'));
  const lists = readExplosionTable(table.content, EXPLOSIONS).lists.map((list) => Object.freeze(list.map(({ animation }) => animation.id)));
  const explosions = Object.freeze({ id: explosionsId, lists: Object.freeze(lists) as RuleDataInputs['explosions']['lists'] });
  const explosionAnimations = readAscending(input.explosionAnimations, `${INPUT}.explosionAnimations`, RULE_DATA_LIMITS.explosionAnimations, (id, content, at) => ({
    id: readDataId(id, `${at}.id`, identity, (read) => PRODUCTION_ANIMATION.test(read)),
    frames: readExplosionAnimation(content, `${at}.content`).frames.length,
  }));
  const models = readAscending(input.models, `${INPUT}.models`, RULE_DATA_LIMITS.models, (value, content, at) => {
    const id = readAssetId(value, `${at}.id`);
    if (!id.startsWith('model/')) throw new CoreInputError(`${at}.id`, 'must be a model Asset ID');
    return { id, parts: readModelParts(content, `${at}.content`) };
  });
  const aiPrograms = whole('aiPrograms', readAiPrograms);
  const commMenus = whole('commMenus', readCommMenus);
  const baseRepairItems = whole('baseRepairItems', readBaseRepairItems);
  const commMessages = whole('commMessages', readCommMessages);
  return Object.freeze({ debrisParameters, projectileVisuals, explosions, explosionAnimations, models, aiPrograms, commMenus, baseRepairItems, commMessages });
}

const isInt32 = (value: number): boolean => toInt32(value) === value;
const isFiniteVec = ({ x, y, z }: Vec3): boolean => isFiniteFloat32(x) && isFiniteFloat32(y) && isFiniteFloat32(z);
const isFiniteBox = ({ lower, upper }: ShapeBox): boolean => isFiniteVec(lower) && isFiniteVec(upper);
const isFiniteShape = ({ radius, radiusSquared, bounds, boxes }: CollisionShape): boolean =>
  isFiniteFloat32(radius) && isFiniteFloat32(radiusSquared) && isFiniteBox(bounds) && boxes.every(isFiniteBox);

/** The explosion lists' frame counts (check 1 of CR-01): n₁₂ and n₃, or a rejection. */
function explosionFrames(inputs: RuleDataInputs, missileMount: boolean): WorldRuleData['explosionFrames'] {
  const frames = new Map(inputs.explosionAnimations.map(({ id, frames: count }) => [id, count] as const));
  const named = new Set(inputs.explosions.lists.flat());
  inputs.explosionAnimations.forEach(({ id }, index) => {
    if (!named.has(id)) throw new CoreInputError(`${INPUT}.explosionAnimations[${index}].id`, 'is not an animation the explosion table names');
  });
  // Every entry's frame count, by list: equal within lists 1 and 2 together and within list 3.
  const counts = inputs.explosions.lists.map((list, at) => list.map((id, entry) => {
    const count = frames.get(id);
    if (count === undefined) throw new CoreInputError(`${EXPLOSIONS}.lists[${at}][${entry}].animation`, 'names an animation missing from input.explosionAnimations');
    return count;
  }));
  const common = (lists: readonly number[], from: number): number | null => {
    for (const at of lists) {
      const index = counts[at].findIndex((count) => count !== counts[from][0]);
      if (index >= 0) throw new CoreInputError(`${EXPLOSIONS}.lists[${at}][${index}].animation`, `must have as many frames as every other animation of its list group`);
    }
    return counts[from][0] ?? null;
  };
  for (const at of [0, 1]) if (counts[at].length === 0) throw new CoreInputError(`${EXPLOSIONS}.lists[${at}]`, 'must not be empty');
  if (counts[2].length === 0 && missileMount) {
    throw new CoreInputError(`${EXPLOSIONS}.lists[2]`, 'must not be empty, as an instantiable craft has a missile mount');
  }
  return Object.freeze({ lists12: common([0, 1], 0) as number, list3: counts[2].length === 0 ? null : common([2], 2) });
}

/** The models of the instantiable records, exactly (CR-01): part list 1's count of each kind's model. */
function modelParts(inputs: RuleDataInputs, records: readonly InstantiableRecord[]): Map<AssetId, { readonly parts: number; readonly index: number }> {
  const models = new Map(inputs.models.map(({ id, parts }, index) => [id, { parts, index }] as const));
  const bound = new Set<AssetId>();
  for (const { model, path } of records) {
    if (!models.has(model)) throw new CoreInputError(`${path}.craftType`, 'binds a model missing from input.models');
    bound.add(model);
  }
  inputs.models.forEach(({ id }, index) => {
    if (!bound.has(id)) throw new CoreInputError(`${INPUT}.models[${index}].id`, 'is not the model of an instantiable craft');
  });
  return models;
}

/**
 * The DEBRIS mapping (craft §4.1, CR-01 check 2): kinds 1 and 2 (kind bits 0 and 1) need max(c − 3, 0) records and
 * at least one part, as their part 0 is the parameterless escape pod; every other kind needs c records.
 */
function checkDebris(kindBit: number, parts: number, modelIndex: number, debris: DebrisParameters): void {
  const own = kindBit === PLAYER_KIND_BIT || kindBit === WINGMAN_KIND_BIT;
  if (own && parts < 1) throw new CoreInputError(`${INPUT}.models[${modelIndex}].content.partLists[1]`, 'must have a part for the player or the wingman, whose part 0 is the escape pod');
  if (debris.byCraftType[kindBit].length !== (own ? Math.max(parts - 3, 0) : parts)) {
    throw new CoreInputError(`${DEBRIS}.byCraftType[${kindBit}]`, 'must have one record per part of the kind\'s model with parameters (craft.md §4.1)');
  }
}

/** Whether following `link` from `start` comes back to a mount already visited. */
function linksCycle(mounts: readonly Mount[], start: number, link: 'at18' | 'at1C'): boolean {
  const seen = new Set<number>();
  for (let at: number | null = start; at !== null; at = mounts[at][link]) {
    if (seen.has(at)) return true;
    seen.add(at);
  }
  return false;
}

/**
 * The mount links (CR-01 check 4): no cycle along either link; a list entry's mount has at most one of the two links,
 * and no later group of its fire-together chain alternates, the two arrangements whose tried flags outlive a call (W5).
 */
function checkMountLinks(craft: CraftRecord, path: string): void {
  const { mounts } = craft;
  mounts.forEach((_, index) => {
    for (const link of ['at18', 'at1C'] as const) {
      if (linksCycle(mounts, index, link)) throw new CoreInputError(`${path}.mounts[${index}].${link}`, 'is in a cycle of mount links');
    }
  });
  craft.mountLists.forEach((list, at) => list.forEach((head, entry) => {
    const entryPath = `${path}.mountLists[${at}][${entry}]`;
    if (mounts[head].at18 !== null && mounts[head].at1C !== null) {
      throw new CoreInputError(entryPath, 'names a mount with both links, whose tried flags would outlive a trigger call');
    }
    for (let group = mounts[head].at18; group !== null; group = mounts[group].at18) {
      if (mounts[group].at1C !== null) throw new CoreInputError(entryPath, 'leads a fire-together chain whose later group alternates, whose tried flags would outlive a trigger call');
    }
  }));
}

/**
 * The divisors and domains of an instantiable kind's record (CR-01 check 5, the craft part): the player's hull and shield
 * capacities, which the status display divides by; the shield recharge's c60 of a shielded craft and its i32 product
 * with c5C.
 */
function checkCraftDomain(kindBit: number, craft: CraftRecord, path: string): void {
  if (kindBit === PLAYER_KIND_BIT) {
    if (craft.at9C <= 0) throw new CoreInputError(`${path}.at9C`, 'must be positive for the player, as the status display divides by it');
    if (craft.at5C <= 0) throw new CoreInputError(`${path}.at5C`, 'must be positive for the player, as the status display divides by it');
  }
  if (craft.at5C > 0) {
    if (craft.at60 === 0) throw new CoreInputError(`${path}.at60`, 'must not be 0 for a craft with a shield, as the shield recharge divides by it');
    if (!isInt32(craft.at60 * craft.at5C)) throw new CoreInputError(`${path}.at60`, 'overflows i32 in the shield recharge together with at5C');
  }
}

/**
 * The i32 arithmetic of instantiation at a record's percentages (CR-01 check 5): the hull and every step of
 * `0x3060c` at the kind's initial levels. The player's other levels are P3-06's check.
 */
function checkInstantiation({ kindBit, ruleInputs, path }: InstantiableRecord, craft: CraftRecord): void {
  if (!isInt32(initialHull(craft, ruleInputs.percentB))) throw new CoreInputError(`${path}.ruleInputs.percentB`, 'makes the initial hull leave i32 with the craft record');
  const player = kindBit === PLAYER_KIND_BIT;
  const shieldLevel: Level = player ? INITIAL_ALLOCATION.shield : 0;
  const chargeLevel: Level = player ? INITIAL_ALLOCATION.gun : 0;
  if (!resourceArithmetic(craft, ruleInputs.percentD, ruleInputs.percentC, shieldLevel, chargeLevel).steps.every(isInt32)) {
    throw new CoreInputError(`${path}.ruleInputs`, 'makes the initial resources overflow i32 with the craft record');
  }
}

/**
 * Why a missile record's guidance field is rejected (CR-01 check 5): the first callback's guard (guidance.ts) would
 * fault. The craft-info reader already holds +0x48 to 0–2³¹−1, +0x54 to u32 and +0x58 to i32, so of these only a
 * negative +0x44 reaches the check from content; the others keep the shared predicate whole.
 */
const GUIDANCE_FIELD_REASONS = Object.freeze({
  at44: 'must not be negative, as it is the lifetime of the missile\'s guidance',
  at48: 'must not be negative, as it is the arming delay of the missile\'s guidance',
  at54: 'must not be negative, as it is the detonation delay of the missile\'s guidance',
  at58: 'must be an i32, as it is the check interval of the missile\'s guidance',
});

/** Reachable guns and missiles: the weapons the mounts of instantiable kinds name. */
function reachableWeapons(info: CraftInfo, kinds: Iterable<number>): { guns: Set<number>; missiles: Set<number> } {
  const guns = new Set<number>();
  const missiles = new Set<number>();
  for (const kindBit of kinds) for (const { at10, weapon } of info.craft[kindBit].mounts) (at10 === 0 ? guns : missiles).add(weapon);
  return { guns, missiles };
}

/**
 * The checks of CR-01 that need the setup, and the static rule data: see the module comment. `records` are the run's
 * instantiable records (setup-check.ts); `info` is the craft info as read; `communications` was checked and derived by
 * communicationsRuleData.
 */
export function buildRuleData(inputs: RuleDataInputs, info: CraftInfo, records: readonly InstantiableRecord[], communications: CommunicationsRuleData): WorldRuleData {
  const models = modelParts(inputs, records);
  const kinds = new Map<number, { readonly parts: number; readonly modelIndex: number }>();
  for (const { kindBit, model } of records) {
    const { parts, index } = models.get(model) as { parts: number; index: number };
    if (!kinds.has(kindBit)) kinds.set(kindBit, { parts, modelIndex: index });
  }
  const kindBits = [...kinds.keys()].sort((left, right) => left - right);
  const { lengths } = inputs.projectileVisuals;
  for (const kindBit of kindBits) {
    const path = `${CRAFT_INFO}.craft[${kindBit}]`;
    const craft = info.craft[kindBit];
    const { parts, modelIndex } = kinds.get(kindBit) as { parts: number; modelIndex: number };
    checkDebris(kindBit, parts, modelIndex, inputs.debrisParameters.content);
    craft.mounts.forEach(({ at10, weapon }, index) => {
      if (at10 === 0 && info.guns[weapon].at28 !== AUTOMATIC_GUN && weapon >= lengths.length) {
        throw new CoreInputError(`${path}.mounts[${index}].weapon`, 'names a gun without a projectile record length');
      }
    });
    checkMountLinks(craft, path);
    checkCraftDomain(kindBit, craft, path);
  }
  for (const record of records) checkInstantiation(record, info.craft[record.kindBit]);

  const reachable = reachableWeapons(info, kindBits);
  const explosionFramesValue = explosionFrames(inputs, reachable.missiles.size > 0);
  const guns = info.guns.map((gun, index) => {
    if (!reachable.guns.has(index)) return null;
    const path = `${CRAFT_INFO}.guns[${index}]`;
    if (gun.at28 === 1 && gun.at08 === 0) throw new CoreInputError(`${path}.at08`, 'must not be 0 for an aimed gun, as the aim divides by it');
    if (gun.at14 < 0 || gun.at14 > 32) throw new CoreInputError(`${path}.at14`, 'must be 0 to 32, as the parked engagement multiplies its shot count by it');
    if (gun.at24 < 0) throw new CoreInputError(`${path}.at24`, 'must not be negative, as it is the lifetime of the gun\'s projectiles');
    const data = gunRuleData(gun);
    if (!isFiniteFloat32(data.rangeSquared)) throw new CoreInputError(`${path}.at24`, 'makes the range or its square leave the f32 range');
    return data;
  });
  const missiles = info.missiles.map((missile, index) => {
    if (!reachable.missiles.has(index)) return null;
    const path = `${CRAFT_INFO}.missiles[${index}]`;
    if (missile.at60 === missile.at64) throw new CoreInputError(`${path}.at64`, 'must differ from at60, as the blast falloff divides by their difference');
    const timer = invalidGuidanceField(missile);
    if (timer !== null) throw new CoreInputError(`${path}.${timer}`, GUIDANCE_FIELD_REASONS[timer]);
    const data = missileRuleData(missile, info.missileBodies[missile.body]);
    if (!isFiniteFloat32(data.rangeSquared)) throw new CoreInputError(`${path}.at44`, 'makes the range or its square leave the f32 range');
    if (!isFiniteFloat32(data.fuseRadiusSquared)) throw new CoreInputError(`${path}.at4C`, 'makes the fuse radius squared leave the f32 range');
    return data;
  });
  const craft = info.craft.map((record, kindBit) => {
    const kind = kinds.get(kindBit);
    if (kind === undefined) return null;
    const path = `${CRAFT_INFO}.craft[${kindBit}]`;
    const shape = craftShape(record);
    if (!isFiniteShape(shape)) throw new CoreInputError(`${path}.collision`, 'makes the radius or its square leave the f32 range');
    const offsets = mountOffsets(kindBit, record, info.guns, lengths);
    const offset = offsets.findIndex((value) => !isFiniteVec(value));
    if (offset >= 0) throw new CoreInputError(`${path}.mounts[${offset}].at00`, 'leaves the f32 range once lengthened by its projectile');
    const debris = inputs.debrisParameters.content.byCraftType[kindBit].map((parameters, index) => {
      const data = debrisRuleData(parameters);
      if (!isFiniteShape(data.shape)) throw new CoreInputError(`${DEBRIS}.byCraftType[${kindBit}][${index}].collision`, 'makes the radius or its square leave the f32 range');
      return data;
    });
    return Object.freeze({ shape, mountOffsets: offsets, parts: kind.parts, debris: Object.freeze(debris) });
  });
  return Object.freeze({
    inputs,
    explosionFrames: explosionFramesValue,
    guns: Object.freeze(guns),
    missiles: Object.freeze(missiles),
    craft: Object.freeze(craft),
    homingPrograms: homingPrograms(inputs.aiPrograms.content),
    communications,
  });
}

/**
 * Built-in program records 1 and 2 (CR-01 check 6), which a guided missile installs (executable.md H5): both must exist
 * and the update period +0x14 must not be negative, which the original reads as a far u32 deadline. The content reader
 * already holds +0x14 to i32 and +0x24 and +0x2C to finite f32 values. Checked whatever the run mounts, as whether a
 * missile homes depends on its launch.
 */
function homingPrograms({ builtInPrograms }: AiPrograms): HomingPrograms {
  const record = (number: 1 | 2): SteeringProgram => {
    const program = builtInPrograms[number];
    if (program === undefined) throw new CoreInputError(`${AI_PROGRAMS}.builtInPrograms`, 'must have records 1 and 2, the homing missiles\' programs');
    if (program.at14 < 0) throw new CoreInputError(`${AI_PROGRAMS}.builtInPrograms[${number}].at14`, 'must not be negative, as it is a homing missile\'s update period');
    return Object.freeze({ at14: program.at14, at24: program.at24, at2C: program.at2C });
  };
  return Object.freeze({ 1: record(1), 2: record(2) });
}
