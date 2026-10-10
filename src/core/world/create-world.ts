/**
 * World creation, the formal Core entry (docs/plan/p3/02/spec.md, 运行配置与世界创建; 技术决定 7, 8). Input: the
 * three logic Assets, the package's ContentIdentity and the run configuration. Creation corresponds to the original's
 * mission build: it validates, converts coordinates, fills the records' defaults (drawing only the +0x78 defaults) and
 * orders the spawn queue, and returns a world at tick 0 with clock 0, no entities, view mode 0xC and mission status
 * built. It returns no events: spawns due at time 0 are instantiated by the first step.
 *
 * Errors, before any world exists: the content readers' ContentContractError passes through, as for a malformed
 * identity; every other failure is a CoreInputError with a structural path and a fixed reason, never an imported name,
 * coordinate or payload. Creation is pure: equal input gives equal worlds, and no world shares mutable state with its
 * input or with another world.
 */
import { readContentIdentity, type ContentIdentity } from '../../content/content-identity.ts';
import { readExactRecord } from '../contracts/validation.ts';
import { loadMission, type LogicAssetInput } from '../mission/load-mission.ts';
import { RandStream } from '../rules/original-random.ts';
import { buildSpawnState } from '../rules/spawn-schedule.ts';
import { difficultyGroup, readRunConfig, type RunConfig } from './run-config.ts';
import { checkSetup } from './setup-check.ts';
import { setupHash } from './setup-hash.ts';
import { constructWorld, type World } from './world.ts';
import { createWorldState, type WorldState } from './world-state.ts';

export interface CreateWorldInput {
  readonly mission: LogicAssetInput;
  readonly craftTypes: LogicAssetInput;
  readonly wingmanRoster: LogicAssetInput;
  /** The identity of the validated package the three Assets were decoded from (P3-04, local checks). */
  readonly identity: ContentIdentity;
  readonly run: RunConfig;
}

const INPUT_FIELDS = ['mission', 'craftTypes', 'wingmanRoster', 'identity', 'run'] as const;

/**
 * The initial state of a world, for createWorld and Core tests; not a public entry. Throws as createWorld does and
 * returns a state nothing else references.
 */
export function initialWorldState(value: CreateWorldInput): WorldState {
  const input = readExactRecord(value, 'input', INPUT_FIELDS);
  const setup = loadMission({ mission: input.mission, craftTypes: input.craftTypes, wingmanRoster: input.wingmanRoster } as Parameters<typeof loadMission>[0]);
  const content = readContentIdentity(input.identity, 'input.identity');
  const run = readRunConfig(input.run, 'input.run', setup, content);
  const geometry = checkSetup(setup, run.wingman);
  const group = difficultyGroup(run.rawDifficulty);
  const rand = new RandStream(run.seed);
  const spawn = buildSpawnState(setup, geometry, { group, wingman: run.wingman }, rand);
  const config = { content, mission: setup.mission, setupHash: setupHash(setup), group, slot: setup.campaign.slot, ...run };
  return createWorldState(config, setup, spawn, rand.state);
}

/** Creates a world from logic content, its identity and a run configuration; see the module comment. */
export function createWorld(input: CreateWorldInput): World {
  return constructWorld(initialWorldState(input));
}
