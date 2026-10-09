/**
 * Building the spawn state: the scheduling routine `0x6721c` with its defaults and the queue order of `0x67584`
 * (docs/original/formats/executable.md#spawn-queue-p3-0203; Q-01, Q-04, Q-06). World creation calls it once, after it
 * has validated the setup and converted its coordinates.
 *
 * Scheduling walks the section-1 records (declarations with origin `object`) in array order. Each is filled with its
 * defaults; one with a kind and no group membership is queued at its spawn time; the player record, kind bit 0, is
 * followed by the selected wingman option, filled and queued at time 0. Then each group is queued at its template's
 * spawn time. Entries fire in ascending due order and, among equal due times, in this insertion order.
 */
import type { SpawnRegion, Vector3 } from '../../content/logic/logic-content.ts';
import { secondsToClockUnits } from '../contracts/time.ts';
import type { MissionSetup, ResolvedDeclaration } from '../mission/load-mission.ts';
import type { DeclarationReference } from '../world/entity-table.ts';
import type { RecordRuleInputs, RuntimeRecord, SpawnEntry, SpawnState } from '../world/spawn-state.ts';
import type { RuntimeFrame } from './coordinates.ts';
import type { RandSource } from './original-random.ts';
import { fillRecordDefaults, missionDefault, toInt32, unfilledRuleInputs } from './record-defaults.ts';

/** The player's kind 1 is kind bit 0. */
export const PLAYER_KIND_BIT = 0;

/** The setup's coordinates in runtime units, as world creation validated and converted them. */
export interface RuntimeGeometry {
  readonly frame: RuntimeFrame;
  /** One per mission declaration. */
  readonly positions: readonly Vector3[];
  /** The selected wingman option's, or null without a wingman. */
  readonly wingmanPosition: Vector3 | null;
  readonly regions: readonly SpawnRegion[];
  /** One layout per group. */
  readonly layouts: readonly (readonly Vector3[])[];
}

/** The run choices scheduling reads. */
export interface ScheduleOptions {
  /** The difficulty group. */
  readonly group: number;
  /** Null, or the selected wingman option's index. */
  readonly wingman: number | null;
}

/** Whether `0x6721c` queues a section-1 record by itself: it has a kind and is no group's member (+0x3C is zero). */
export function isScheduledRecord(declaration: ResolvedDeclaration): boolean {
  return declaration.origins.includes('object') && declaration.craftType !== null && declaration.memberOf === null;
}

function runtimeRecord(
  declaration: ResolvedDeclaration,
  reference: DeclarationReference,
  position: Vector3,
  regions: readonly SpawnRegion[],
  anchor: number | null,
  ruleInputs: RecordRuleInputs,
): RuntimeRecord {
  const { region } = declaration.placement;
  return {
    declaration: Object.freeze({ ...reference }),
    position,
    region: region === null ? null : regions[region],
    anchor,
    gridSpacing: declaration.gridSpacing,
    ruleInputs,
    aiTarget: declaration.aiTarget,
    aiTargetCraftTypes: declaration.aiTargetCraftTypes,
    spawnCount: 0,
  };
}

/** Clock units of a spawn time in seconds; world creation has rejected times whose product leaves the u32 range. */
const dueOf = (seconds: number): number => secondsToClockUnits(seconds, 'spawnTime');

/**
 * The spawn state of a new world: records filled in the original's order, drawing from `rand` (+0x78 defaults only),
 * and the ordered queue. The setup's mission number for the defaults is its campaign slot.
 */
export function buildSpawnState(setup: MissionSetup, geometry: RuntimeGeometry, options: ScheduleOptions, rand: RandSource): SpawnState {
  const defaultForMission = missionDefault(options.group, setup.campaign.slot);
  const fill = (declaration: ResolvedDeclaration): RecordRuleInputs => fillRecordDefaults(declaration.ruleInputs, defaultForMission, rand);
  const entries: SpawnEntry[] = [];
  const records: RuntimeRecord[] = [];
  let wingman: RuntimeRecord | null = null;
  setup.declarations.forEach((declaration, index) => {
    const sectionOne = declaration.origins.includes('object');
    const ruleInputs = sectionOne ? fill(declaration) : unfilledRuleInputs(declaration.ruleInputs);
    records.push(runtimeRecord(declaration, { collection: 'mission', index }, geometry.positions[index], geometry.regions, declaration.placement.anchor, ruleInputs));
    if (!isScheduledRecord(declaration)) return;
    entries.push({ due: dueOf(declaration.spawnTime), source: 'record', index, requests: ruleInputs.craftCount });
    if (declaration.craftType === PLAYER_KIND_BIT && options.wingman !== null) {
      const option = setup.wingmanOptions[options.wingman];
      // Every fill of a kind-2 record anchors it on the player record; its own spawn time is not read.
      wingman = runtimeRecord(option, { collection: 'wingman', index: options.wingman }, geometry.wingmanPosition as Vector3, geometry.regions, index, fill(option));
      entries.push({ due: 0, source: 'wingman', index: options.wingman, requests: 1 });
    }
  });
  setup.groups.forEach((group, index) => {
    entries.push({ due: dueOf(setup.declarations[group.template].spawnTime), source: 'group', index, requests: toInt32(group.spawnCount) });
  });

  // Array.prototype.sort is stable, so equal due times keep their insertion order.
  const queue = entries.sort((left, right) => left.due - right.due).map((entry) => Object.freeze(entry));
  return {
    frame: geometry.frame,
    records,
    wingman,
    groups: geometry.layouts.map((layout) => ({ layout, spawnCount: 0, leader: null })),
    queue,
    enabled: true,
    namePoolUses: setup.namePool.map(() => 0),
  };
}
