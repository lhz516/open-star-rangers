/**
 * The authoritative state of one formal Core world (docs/plan/p3/02/spec.md, 运行配置与世界创建). Only the world's
 * pipeline changes it; projection and Render State read it and copy what they return. World creation
 * (create-world.ts) validates the input and builds it.
 */
import type { AssetId } from '../../content/asset-id.ts';
import type { ContentIdentity } from '../../content/content-identity.ts';
import type { RngState } from '../determinism/rng.ts';
import type { MissionSetup } from '../mission/load-mission.ts';
import type { WorldCraftInfo } from './craft-info-input.ts';
import { EntityTable } from './entity-table.ts';
import { createPlayerState, type PlayerState } from './player-state.ts';
import type { SpawnState } from './spawn-state.ts';

/** The run's configuration, fixed for the world's lifetime and validated by world creation. */
export interface WorldConfig {
  /** The identity of the package the logic Assets came from. */
  readonly content: ContentIdentity;
  readonly mission: AssetId;
  /** fnv1a64 of the canonical text of the validated setup and the craft info (setup-hash.ts). */
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

export interface WorldState {
  readonly config: WorldConfig;
  /** The validated mission setup: read-only input, never part of a snapshot. */
  readonly setup: MissionSetup;
  /** The craft info as read, the rules' frozen content: read-only input, never part of a snapshot; setupHash binds it. */
  readonly craftInfo: WorldCraftInfo;
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
}

/**
 * The state of a world just created: tick 0, clock 0, no entities, view mode 0xC, with the spawn state and the RNG
 * state the build's defaults left (spawn-schedule.ts).
 */
export function createWorldState(config: WorldConfig, setup: MissionSetup, craftInfo: WorldCraftInfo, spawn: SpawnState, rngState: RngState): WorldState {
  const { content, mission, setupHash, group, slot, rawDifficulty, wingman, seed, clockUnitsPerTick } = config;
  return {
    config: Object.freeze({ content, mission, setupHash, group, slot, rawDifficulty, wingman, seed, clockUnitsPerTick }),
    setup,
    craftInfo,
    tick: 0,
    clock: 0,
    rngState,
    missionStatus: 'built',
    entities: new EntityTable(),
    player: createPlayerState(),
    spawn,
  };
}
