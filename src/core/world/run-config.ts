/**
 * The run configuration of world creation (docs/plan/p3/02/spec.md, 运行配置与世界创建): `{ rawDifficulty, wingman,
 * seed, clockUnitsPerTick? }`. The raw difficulty selects the campaign group at thresholds 34 and 67 (`0x38428`), which
 * must be the mission's. Content of origin `original-import` runs only as the P3-01 slice: difficulty 19, group 0 /
 * slot 1, the production mission Asset and the default step; every other value is for contract tests on `synthetic`
 * content and claims no support of other missions.
 */
import type { AssetId } from '../../content/asset-id.ts';
import type { ContentIdentity } from '../../content/content-identity.ts';
import { CLOCK_UNITS_PER_TICK, DEFAULT_CLOCK_UNITS_PER_TICK } from '../contracts/time.ts';
import { integerIn, readDataRecord, readNumber } from '../contracts/validation.ts';
import { CoreInputError } from '../errors.ts';
import type { MissionSetup } from '../mission/load-mission.ts';

/** What the caller passes. */
export interface RunConfig {
  /** 0–100, the original's difficulty setting. */
  readonly rawDifficulty: number;
  /** Null, or an index of the roster's wingman options (original selector = index + 1). */
  readonly wingman: number | null;
  /** uint32. */
  readonly seed: number;
  /** A positive even safe integer; 2 when omitted. */
  readonly clockUnitsPerTick?: number;
}

/** The configuration in effect, with the default applied, as worlds, snapshots and replays record it. */
export type EffectiveRunConfig = Required<RunConfig>;

/** The production mission Asset of the slice (P2-09); `original-import` content runs no other. */
export const PRODUCTION_MISSION = 'mission/first-campaign';
/** The difficulty of the P3-01 baseline run (B-003). */
export const PRODUCTION_RAW_DIFFICULTY = 19;

const REQUIRED_FIELDS = ['rawDifficulty', 'wingman', 'seed'] as const;
const OPTIONAL_FIELD = 'clockUnitsPerTick';

/** The campaign group of a raw difficulty (`0x38428`): below 34 group 0, below 67 group 1, otherwise group 2. */
export function difficultyGroup(rawDifficulty: number): number {
  if (rawDifficulty < 34) return 0;
  return rawDifficulty < 67 ? 1 : 2;
}

/**
 * Reads the run configuration at `path` for `setup` loaded from content of `identity`, and applies the default step.
 * Throws CoreInputError at the offending field.
 */
export function readRunConfig(value: unknown, path: string, setup: MissionSetup, identity: ContentIdentity): EffectiveRunConfig {
  const record = readDataRecord(value, path, REQUIRED_FIELDS.length + 1);
  for (const field of REQUIRED_FIELDS) {
    if (!Object.hasOwn(record, field)) throw new CoreInputError(`${path}.${field}`, 'is required');
  }
  for (const key of Object.keys(record)) {
    if (key !== OPTIONAL_FIELD && !(REQUIRED_FIELDS as readonly string[]).includes(key)) throw new CoreInputError(path, 'contains unknown fields');
  }
  const rawDifficulty = readNumber(record.rawDifficulty, `${path}.rawDifficulty`, integerIn(0, 100));
  const wingman = record.wingman === null
    ? null
    : readNumber(record.wingman, `${path}.wingman`, [(index) => Number.isInteger(index) && index >= 0 && index < setup.wingmanOptions.length, 'must be null or the index of a wingman option']);
  const seed = readNumber(record.seed, `${path}.seed`, integerIn(0, 0xffffffff));
  const hasStep = Object.hasOwn(record, OPTIONAL_FIELD);
  const clockUnitsPerTick = hasStep ? readNumber(record[OPTIONAL_FIELD], `${path}.${OPTIONAL_FIELD}`, CLOCK_UNITS_PER_TICK) : DEFAULT_CLOCK_UNITS_PER_TICK;

  if (difficultyGroup(rawDifficulty) !== setup.campaign.group) throw new CoreInputError(`${path}.rawDifficulty`, 'must select the campaign group of the mission');
  if (identity.origin.type === 'original-import') checkProductionRun(setup.mission, rawDifficulty, clockUnitsPerTick, path);
  return Object.freeze({ rawDifficulty, wingman, seed, clockUnitsPerTick });
}

/** The mission content reader already admits only the slice's campaign group 0 / slot 1, whatever the origin. */
function checkProductionRun(mission: AssetId, rawDifficulty: number, clockUnitsPerTick: number, path: string): void {
  if (mission !== PRODUCTION_MISSION) throw new CoreInputError('input.mission.id', 'must be the production slice mission for original-import content');
  if (rawDifficulty !== PRODUCTION_RAW_DIFFICULTY) throw new CoreInputError(`${path}.rawDifficulty`, 'must be 19 for original-import content');
  if (clockUnitsPerTick !== DEFAULT_CLOCK_UNITS_PER_TICK) throw new CoreInputError(`${path}.clockUnitsPerTick`, 'must be the default for original-import content');
}
