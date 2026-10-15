/**
 * World creation, the formal Core entry (docs/plan/p3/02/spec.md, 运行配置与世界创建; 技术决定 7, 8). Input: the
 * three logic Assets, the craft info (docs/plan/p3/06/spec.md, D-01), the ten rule-data inputs (rule-data.ts;
 * docs/plan/p3/02/spec.md, CR-01, MW-01 and CB-01), the package's ContentIdentity and the run configuration. Creation corresponds to the original's mission build: it validates, converts coordinates, fills the
 * records' defaults (drawing only the +0x78 defaults) and orders the spawn queue, and returns a world at tick 0 with
 * clock 0, no entities, view mode 0xC and mission status built. It returns no events: spawns due at time 0 are
 * instantiated by the first step.
 *
 * Errors, before any world exists: the content readers' ContentContractError passes through, as for a malformed
 * identity; every other failure is a CoreInputError with a structural path and a fixed reason, never an imported name,
 * coordinate or payload. Creation is pure: equal input gives equal worlds, and no world shares mutable state with its
 * input or with another world.
 */
import type { AssetId } from '../../content/asset-id.ts';
import { readContentIdentity, type ContentIdentity } from '../../content/content-identity.ts';
import { compareText } from '../../content/contract-validation.ts';
import { readExactRecord } from '../contracts/validation.ts';
import { loadMission, type LogicAssetInput } from '../mission/load-mission.ts';
import { RandStream } from '../rules/original-random.ts';
import { buildSpawnState } from '../rules/spawn-schedule.ts';
import { communicationsRuleData } from './comm-input.ts';
import { checkCraftInfo, checkPlayerWarp, readCraftInfoInput } from './craft-info-input.ts';
import { buildMapRuleData } from './map-rule-data.ts';
import { difficultyGroup, readRunConfig, type RunConfig } from './run-config.ts';
import { buildRuleData, readRuleDataInputs, RULE_DATA_FIELDS, transponderModel } from './rule-data.ts';
import { checkSetup, instantiableRecords } from './setup-check.ts';
import { setupHash } from './setup-hash.ts';
import { constructWorld, type World } from './world.ts';
import { createWorldState, type WorldState } from './world-state.ts';

export interface CreateWorldInput {
  readonly mission: LogicAssetInput;
  readonly craftTypes: LogicAssetInput;
  readonly wingmanRoster: LogicAssetInput;
  /** The `data/craft-info` rule-data Asset of the same package (craft-info-input.ts). */
  readonly craftInfo: LogicAssetInput;
  /** `data/debris-parameters` of the same package (rule-data.ts). */
  readonly debrisParameters: LogicAssetInput;
  /** The `data/projectile-visuals` effect content of the same package. */
  readonly projectileVisuals: LogicAssetInput;
  /** `data/explosions` of the same package. */
  readonly explosions: LogicAssetInput;
  /** The explosion animations the table names, in ascending Asset ID order. */
  readonly explosionAnimations: readonly LogicAssetInput[];
  /** The models of the instantiable craft, in ascending Asset ID order. */
  readonly models: readonly LogicAssetInput[];
  /** `data/ai-programs` of the same package (rule-data.ts). */
  readonly aiPrograms: LogicAssetInput;
  /** `data/hud/map-geometry` of the same package (rule-data.ts, map-rule-data.ts; docs/plan/p3/02/spec.md, MW-01). */
  readonly mapGeometry: LogicAssetInput;
  /** `data/comm-menus` of the same package (rule-data.ts; comm-input.ts). */
  readonly commMenus: LogicAssetInput;
  /** `data/base-repair-items` of the same package. */
  readonly baseRepairItems: LogicAssetInput;
  /** `data/comm-messages` of the same package. */
  readonly commMessages: LogicAssetInput;
  /** The identity of the validated package every Asset above was decoded from (P3-04, local checks). */
  readonly identity: ContentIdentity;
  readonly run: RunConfig;
}

/** The content fields of the input, in order: everything but the run configuration, which replay takes from its record. */
export const CONTENT_INPUT_FIELDS = ['mission', 'craftTypes', 'wingmanRoster', 'craftInfo', ...RULE_DATA_FIELDS, 'identity'] as const;
const INPUT_FIELDS = [...CONTENT_INPUT_FIELDS, 'run'] as const;

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
  const craftInfo = readCraftInfoInput(input.craftInfo, content);
  const ruleInputs = readRuleDataInputs(input, content);
  const group = difficultyGroup(run.rawDifficulty);
  const rand = new RandStream(run.seed);
  const spawn = buildSpawnState(setup, geometry, { group, wingman: run.wingman }, rand);
  // MW-01's checks in its order, before the other craft info checks: the map geometry's three, then the player's Warp fields.
  const map = buildMapRuleData(ruleInputs.mapGeometry.content, geometry.frame, run.clockUnitsPerTick);
  checkPlayerWarp(craftInfo.content);
  checkCraftInfo(craftInfo.content, setup, spawn);
  const communications = communicationsRuleData(ruleInputs, craftInfo.content, setup, spawn);
  const ruleData = buildRuleData(ruleInputs, craftInfo.content, instantiableRecords(setup, spawn), transponderModel(setup), map, communications);
  const config = { content, mission: setup.mission, setupHash: setupHash(setup, craftInfo, ruleInputs), group, slot: setup.campaign.slot, ...run };
  return createWorldState(config, setup, craftInfo, ruleData, spawn, rand.state);
}

const MODEL_SET_FIELDS = ['mission', 'craftTypes', 'wingmanRoster', 'identity', 'run'] as const;

/**
 * The model Asset IDs `models` must hold for a run of `value` (docs/plan/p3/02/spec.md, CR-01, CR-15): those the craft
 * type table binds to the craft the run can instantiate (setup-check.ts, instantiableRecords) and to kind 0x4000, which
 * `b` constructs in any run, once each in ascending ID order, so a caller decodes exactly these from the package. It reads these fields as createWorld does and throws its
 * errors for them; its draws come from its own stream.
 */
export function instantiableModelIds(value: Pick<CreateWorldInput, (typeof MODEL_SET_FIELDS)[number]>): readonly AssetId[] {
  const input = readExactRecord(value, 'input', MODEL_SET_FIELDS);
  const setup = loadMission({ mission: input.mission, craftTypes: input.craftTypes, wingmanRoster: input.wingmanRoster } as Parameters<typeof loadMission>[0]);
  const run = readRunConfig(input.run, 'input.run', setup, readContentIdentity(input.identity, 'input.identity'));
  const geometry = checkSetup(setup, run.wingman);
  const spawn = buildSpawnState(setup, geometry, { group: difficultyGroup(run.rawDifficulty), wingman: run.wingman }, new RandStream(run.seed));
  const transponder = transponderModel(setup);
  const models = instantiableRecords(setup, spawn).map(({ model }) => model);
  return Object.freeze([...new Set(transponder === null ? models : [...models, transponder])].sort(compareText));
}

/** Creates a world from logic content, the craft info, the rule data, their identity and a run configuration; see the module comment. */
export function createWorld(input: CreateWorldInput): World {
  return constructWorld(initialWorldState(input));
}
