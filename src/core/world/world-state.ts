/**
 * The authoritative state of one formal Core world (docs/plan/p3/02/spec.md, 运行配置与世界创建). Only the world's
 * pipeline changes it; projection and Render State read it and copy what they return. World creation
 * (create-world.ts) validates the input and builds it.
 */
import type { AssetId } from '../../content/asset-id.ts';
import type { ContentIdentity } from '../../content/content-identity.ts';
import type { Vec3 } from '../contracts/domain-events.ts';
import type { RngState } from '../determinism/rng.ts';
import type { MissionSetup } from '../mission/load-mission.ts';
import type { WorldCraftInfo } from './craft-info-input.ts';
import { EntityTable, type EntityId } from './entity-table.ts';
import type { MapPoint } from './map-rule-data.ts';
import { createPlayerState, type PlayerState } from './player-state.ts';
import type { WorldRuleData } from './rule-data.ts';
import type { SpawnState } from './spawn-state.ts';

/** The run's configuration, fixed for the world's lifetime and validated by world creation. */
export interface WorldConfig {
  /** The identity of the package the logic Assets came from. */
  readonly content: ContentIdentity;
  readonly mission: AssetId;
  /** fnv1a64 of the canonical text of the validated setup, the craft info and the rule-data inputs (setup-hash.ts). */
  readonly setupHash: string;
  readonly group: number;
  /** The campaign slot, the mission number the defaults use. */
  readonly slot: number;
  readonly rawDifficulty: number;
  /** Null, or an index of `MissionSetup.wingmanOptions` (original selector = index + 1). */
  readonly wingman: number | null;
  /** uint32. */
  readonly seed: number;
  readonly clockUnitsPerTick: number;
}

/** The original mission status byte `0x1b46fc`: 1 once the mission is built. P3-11 adds the later states. */
export type MissionStatus = 'built';

/**
 * The craft object sets (`0x174b74`, `0x174b78`; docs/plan/p3/02/spec.md, MW-02, MW-06): the `object-sets` stage
 * rebuilds them every tick and the reveal drops stale IDs, keeping the order. The wingman's AI reads the last rebuild
 * in the next tick, so they persist across ticks. Empty at creation.
 */
export interface ObjectSets {
  readonly friendly: readonly EntityId[];
  readonly hostile: readonly EntityId[];
}

/** The part of a 100-byte map icon entry (`0x1a34e0`) the rules read (MW-02). */
export interface MapIcon {
  readonly entityId: EntityId;
  /** Entry +0x24; the selection excludes only bit 0, the player. */
  readonly kindBit: number;
  /** Entry +0x00–+0x08, f32: the position when the list was built; a selection's z reads it. */
  readonly position: Vec3;
  /** Entry +0x0C/+0x0E: `0x4c524`'s main map pixel (the i32's low 16 bits as signed i16), then moved by `0x4b3a8`. */
  readonly pixel: MapPoint;
  /** Entry +0x28: `0x4c524`'s result, bounds included. */
  readonly inWorld: boolean;
}

export interface WorldState {
  readonly config: WorldConfig;
  /** The validated mission setup: read-only input, never part of a snapshot. */
  readonly setup: MissionSetup;
  /** The craft info as read, the rules' frozen content: read-only input, never part of a snapshot; setupHash binds it. */
  readonly craftInfo: WorldCraftInfo;
  /**
   * The static rule data (docs/plan/p3/02/spec.md, CR-01): the rule-data inputs as read and what the load transforms
   * derive from them and the craft info. Read-only, never part of a snapshot; setupHash binds its inputs.
   */
  readonly ruleData: WorldRuleData;
  /** The number of the last completed step; 0 at creation. */
  tick: number;
  /** Mission clock units (1/64 s) since creation. */
  clock: number;
  /** The world's own Mulberry32 generator; every rule draw comes from it. */
  rngState: RngState;
  missionStatus: MissionStatus;
  readonly entities: EntityTable;
  readonly player: PlayerState;
  readonly spawn: SpawnState;
  /** MW-02, MW-06. */
  objectSets: ObjectSets;
  /** The map icon list (MW-02, MW-07): built by a view mode 8 frame end, emptied by any other; empty at creation. */
  mapIcons: readonly MapIcon[];
}

/**
 * The state of a world just created: tick 0, clock 0, no entities, view mode 0xC, with the spawn state and the RNG
 * state the build's defaults left (spawn-schedule.ts), the map cursor at its start pixel, empty object sets and no map
 * icons.
 */
export function createWorldState(
  config: WorldConfig,
  setup: MissionSetup,
  craftInfo: WorldCraftInfo,
  ruleData: WorldRuleData,
  spawn: SpawnState,
  rngState: RngState,
): WorldState {
  const { content, mission, setupHash, group, slot, rawDifficulty, wingman, seed, clockUnitsPerTick } = config;
  return {
    config: Object.freeze({ content, mission, setupHash, group, slot, rawDifficulty, wingman, seed, clockUnitsPerTick }),
    setup,
    craftInfo,
    ruleData,
    tick: 0,
    clock: 0,
    rngState,
    missionStatus: 'built',
    entities: new EntityTable(),
    player: createPlayerState(ruleData.map.startPixel),
    spawn,
    objectSets: Object.freeze({ friendly: Object.freeze([]), hostile: Object.freeze([]) }),
    mapIcons: Object.freeze([]),
  };
}
