/**
 * The authoritative state of one formal Core world (docs/plan/p3/02/spec.md, 运行配置与世界创建). Only the world's
 * pipeline changes it; projection and Render State read it and copy what they return. World creation (subtask 07)
 * validates the configuration and adds the spawn queue and the other instantiation state.
 */
import type { AssetId } from '../../content/asset-id.ts';
import type { RngState } from '../determinism/rng.ts';
import { EntityTable } from './entity-table.ts';
import { createPlayerState, type PlayerState } from './player-state.ts';

/** The run's configuration, fixed for the world's lifetime and validated by world creation. */
export interface WorldConfig {
  readonly mission: AssetId;
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
  /** The number of the last completed step; 0 at creation. */
  tick: number;
  /** Mission clock units (1/64 s) since creation. */
  clock: number;
  /** The world's own Mulberry32 generator; every rule draw comes from it. */
  rngState: RngState;
  missionStatus: MissionStatus;
  readonly entities: EntityTable;
  readonly player: PlayerState;
}

/** The state of a world just created from a validated configuration: tick 0, clock 0, no entities, view mode 0xC. */
export function createWorldState(config: WorldConfig): WorldState {
  const { mission, group, slot, rawDifficulty, wingman, seed, clockUnitsPerTick } = config;
  return {
    config: Object.freeze({ mission, group, slot, rawDifficulty, wingman, seed, clockUnitsPerTick }),
    tick: 0,
    clock: 0,
    rngState: seed,
    missionStatus: 'built',
    entities: new EntityTable(),
    player: createPlayerState(),
  };
}
