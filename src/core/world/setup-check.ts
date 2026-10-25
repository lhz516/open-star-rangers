/**
 * Semantic checks of world creation (docs/plan/p3/02/spec.md, 运行配置与世界创建 and 任务实例化). `loadMission` proves
 * only its own content and cross-Asset contracts; a formal world additionally needs the original kinds and bindings Core
 * implements, convertible coordinates, canonical rule inputs, no path outside the slice, spawns within the budget and
 * summary selectors with a supported meaning.
 * Every failure is a CoreInputError at the offending structure's path with a fixed reason that never repeats a name, a
 * coordinate or other imported value.
 */
import type { AssetId } from '../../content/asset-id.ts';
import type { CraftSide, RuleInputs, Vector3 } from '../../content/logic/logic-content.ts';
import { fitsLimit, productFitsLimit } from '../contracts/limits.ts';
import { CLOCK_UNITS_PER_SECOND } from '../contracts/time.ts';
import { CoreInputError } from '../errors.ts';
import type { MissionSetup, ResolvedDeclaration } from '../mission/load-mission.ts';
import { runtimeFrame, runtimePosition, runtimeRegion, runtimeVector } from '../rules/coordinates.ts';
import { toInt32 } from '../rules/record-defaults.ts';
import { isScheduledRecord, PLAYER_KIND_BIT, postsRequests, WINGMAN_KIND_BIT, type RuntimeGeometry } from '../rules/spawn-schedule.ts';
import type { RecordRuleInputs, SpawnState } from './spawn-state.ts';

export const MISSION_PATH = 'input.mission.content';
export const ROSTER_PATH = 'input.wingmanRoster.content';

/**
 * Player-relative sides by kind (docs/original/formats/executable.md, player target modes): the player's own kind,
 * then the enemy and friendly masks; the interaction category is mask 0x68000 (U-022). The converter binds craft types
 * by the same masks; any other binding is one Core does not implement.
 */
const ENEMY_KINDS = 0x93780;
const FRIENDLY_KINDS = 0x206c87e;
const INTERACTION_KINDS = 0x68000;
/** Kinds the original places at a fixed height of 1000 (`0x68398`); Core does not implement that path. */
const FIXED_HEIGHT_KINDS = 0x87c;

const inMask = (mask: number, kindBit: number): boolean => ((mask >>> kindBit) & 1) === 1;
/** u32 due times: a spawn time in seconds times 64 must not leave the u32 range. */
const MAX_SPAWN_SECONDS = Math.floor(0xffffffff / CLOCK_UNITS_PER_SECOND);
const RULE_INPUT_FIELDS = ['percentA', 'craftCount', 'percentB', 'percentC', 'percentD', 'aiValueA', 'aiValueB', 'aiValueC'] as const satisfies readonly (keyof RuleInputs)[];

function supportedSide(kindBit: number): CraftSide | null {
  if (kindBit === PLAYER_KIND_BIT) return 'player';
  if (inMask(ENEMY_KINDS, kindBit)) return 'enemy';
  return inMask(FRIENDLY_KINDS, kindBit) ? 'friendly' : null;
}

/** The kind's binding and the canonical rule inputs every declaration and wingman option must have. */
function checkDeclaration(declaration: ResolvedDeclaration, path: string): void {
  const { craftType } = declaration;
  if (craftType !== null) {
    if (declaration.side !== supportedSide(craftType) || declaration.baseInteraction !== inMask(INTERACTION_KINDS, craftType)) {
      throw new CoreInputError(`${path}.craftType`, 'is bound to a side or interaction category Core does not support');
    }
    if (inMask(FIXED_HEIGHT_KINDS, craftType)) throw new CoreInputError(`${path}.craftType`, 'is a fixed-height kind (mask 0x87c), which Core does not implement');
  }
  for (const field of RULE_INPUT_FIELDS) {
    if (declaration.ruleInputs[field] === 0) throw new CoreInputError(`${path}.ruleInputs.${field}`, 'must be null instead of an explicit 0');
  }
}

/** A record the placement routine `0x68398` places, and whose queue entry the probability roll reads. */
function checkPlaced(declaration: ResolvedDeclaration, path: string): void {
  const { percentA } = declaration.ruleInputs;
  if (percentA !== null && percentA !== 100) throw new CoreInputError(`${path}.ruleInputs.percentA`, 'is a spawn probability other than 100, which Core does not implement');
  if (declaration.gridSpacing !== 0) throw new CoreInputError(`${path}.gridSpacing`, 'selects grid placement, which Core does not implement');
}

/** A record whose spawn time a queue entry takes. */
function checkScheduled(declaration: ResolvedDeclaration, path: string): void {
  if (declaration.spawnTime > MAX_SPAWN_SECONDS) throw new CoreInputError(`${path}.spawnTime`, 'leaves the u32 range in clock units');
  checkPlaced(declaration, path);
}

function checkPlayer(setup: MissionSetup): void {
  const path = `${MISSION_PATH}.declarations[${setup.player}]`;
  const player = setup.declarations[setup.player];
  if (player.craftType !== PLAYER_KIND_BIT) throw new CoreInputError(`${path}.craftType`, 'must be kind bit 0 for the player');
  if (player.origins.length !== 1 || player.origins[0] !== 'object') throw new CoreInputError(`${path}.origins`, 'must make the player a section-1 record outside every group');
  if (player.ruleInputs.craftCount !== null && player.ruleInputs.craftCount !== 1) {
    throw new CoreInputError(`${path}.ruleInputs.craftCount`, 'must give the player one request');
  }
}

/**
 * The spawn work one world may schedule, within CORE_LIMITS.spawnExpansion: requests × members summed, where a request
 * of a group without members still counts once. This bounds both the instances and the spawn requests of the world's
 * lifetime, so of any one tick.
 */
function checkExpansion(setup: MissionSetup, wingman: number | null): void {
  let total = 0;
  const add = (count: number, path: string): void => {
    if (!fitsLimit('spawnExpansion', total, count)) throw new CoreInputError(path, 'takes the scheduled instances past CORE_LIMITS.spawnExpansion');
    total += count;
  };
  setup.declarations.forEach((declaration, index) => {
    if (!isScheduledRecord(declaration)) return;
    // A source 0 defaults to 1; a negative i32 posts none.
    add(Math.max(0, toInt32(declaration.ruleInputs.craftCount ?? 1)), `${MISSION_PATH}.declarations[${index}].ruleInputs.craftCount`);
    if (declaration.craftType === PLAYER_KIND_BIT && wingman !== null) add(1, 'input.run.wingman');
  });
  setup.groups.forEach(({ spawnCount, members }, index) => {
    const path = `${MISSION_PATH}.groups[${index}].spawnCount`;
    const requests = Math.max(0, toInt32(spawnCount));
    const each = Math.max(1, members.length);
    if (!productFitsLimit('spawnExpansion', requests, each)) throw new CoreInputError(path, 'takes the scheduled instances past CORE_LIMITS.spawnExpansion');
    add(requests * each, path);
  });
}

/**
 * The summary selectors Core supports (docs/plan/p3/02/spec.md, ME-02; ME-17 decision 5): at most 0 (no mission clip)
 * or 13–19, the mission clips the 52 missions use. 1–11 select clip rows that are not mission clips, 12 collides with
 * the "none" sentinel, 20–35 are medal, promotion and ending rows and 36 and above leave the 36-row table
 * (docs/original/formats/scenario.md, summary selection: rule meaning).
 */
function checkSummarySelectors(setup: MissionSetup): void {
  setup.eventTriggers.forEach(({ ranges }, trigger) => {
    ranges.forEach(({ summarySelector }, range) => {
      if (summarySelector <= 0 || (summarySelector >= 13 && summarySelector <= 19)) return;
      throw new CoreInputError(`${MISSION_PATH}.eventTriggers[${trigger}].ranges[${range}].summarySelector`, 'selects no mission clip Core supports (only 0 or below, or 13 to 19)');
    });
  });
}

/**
 * Checks a loaded setup for world creation with the selected wingman option (an index already checked against the
 * roster) and returns its coordinates in runtime units.
 */
export function checkSetup(setup: MissionSetup, wingman: number | null): RuntimeGeometry {
  const frame = runtimeFrame(setup, MISSION_PATH);
  checkPlayer(setup);
  const positions = setup.declarations.map((declaration, index): Vector3 => {
    const path = `${MISSION_PATH}.declarations[${index}]`;
    checkDeclaration(declaration, path);
    if (declaration.craftType === WINGMAN_KIND_BIT) throw new CoreInputError(`${path}.craftType`, 'is the wingman kind, which only a wingman option may have');
    if (declaration.memberOf !== null && declaration.craftType === null) throw new CoreInputError(`${path}.craftType`, 'must name a kind for a group member');
    if (isScheduledRecord(declaration)) checkScheduled(declaration, path);
    return runtimePosition(declaration, frame.scaleFactor, path);
  });
  const regions = setup.spawnRegions.map((region, index) => runtimeRegion(region, frame.scaleFactor, `${MISSION_PATH}.spawnRegions[${index}]`));
  const layouts = setup.groups.map(({ template, layout }, index) => {
    checkScheduled(setup.declarations[template], `${MISSION_PATH}.declarations[${template}]`);
    return Object.freeze(layout.map((offset, at) => runtimeVector(offset, `${MISSION_PATH}.groups[${index}].layout[${at}]`)));
  });
  let wingmanPosition: Vector3 | null = null;
  setup.wingmanOptions.forEach((option, index) => {
    const path = `${ROSTER_PATH}.options[${index}]`;
    if (option.craftType !== WINGMAN_KIND_BIT) throw new CoreInputError(`${path}.craftType`, 'must be kind bit 1 for a wingman option');
    checkDeclaration(option, path);
    const position = runtimePosition(option, frame.scaleFactor, path);
    if (index !== wingman) return;
    checkPlaced(option, path);
    wingmanPosition = position;
  });
  checkExpansion(setup, wingman);
  checkSummarySelectors(setup);
  return Object.freeze({ frame, positions: Object.freeze(positions), wingmanPosition, regions: Object.freeze(regions), layouts: Object.freeze(layouts) });
}

/** A record the run can instantiate, with what P3-07's creation checks read of it (docs/plan/p3/02/spec.md, CR-01). */
export interface InstantiableRecord {
  readonly kindBit: number;
  /** The model its kind is bound to. */
  readonly model: AssetId;
  /** Its rule inputs after the build's defaults, whose percentages instantiation reads. */
  readonly ruleInputs: RecordRuleInputs;
  /** The structural path of its declaration or wingman option. */
  readonly path: string;
}

/**
 * Every record the run can instantiate, once each, in firing order: those of the queue entries that post requests
 * (postsRequests), a record entry's own record (direct or delayed), a group entry's members and the selected wingman
 * option. Its kinds are the instantiable kinds P3-06's craft info checks read.
 */
export function instantiableRecords(setup: MissionSetup, spawn: SpawnState): readonly InstantiableRecord[] {
  const records = new Map<string, InstantiableRecord>();
  const add = (declaration: ResolvedDeclaration, ruleInputs: RecordRuleInputs, path: string): void => {
    const { craftType, model } = declaration;
    // checkSetup admits no instantiable record without a kind, and loadMission binds every kind to a model.
    if (craftType === null || model === null) throw new CoreInputError(`${path}.craftType`, 'must name a kind bound to a model');
    if (!records.has(path)) records.set(path, Object.freeze({ kindBit: craftType, model, ruleInputs, path }));
  };
  const declarationRecord = (index: number): void => add(setup.declarations[index], spawn.records[index].ruleInputs, `${MISSION_PATH}.declarations[${index}]`);
  for (const entry of spawn.queue) {
    if (!postsRequests(spawn, setup, entry)) continue;
    const { source, index } = entry;
    if (source === 'record') declarationRecord(index);
    else if (source === 'group') setup.groups[index].members.forEach(declarationRecord);
    else if (spawn.wingman !== null) add(setup.wingmanOptions[index], spawn.wingman.ruleInputs, `${ROSTER_PATH}.options[${index}]`);
  }
  return Object.freeze([...records.values()]);
}
