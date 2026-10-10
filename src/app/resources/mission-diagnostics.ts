import type { AssetId } from '../../content/asset-id.ts';
import { ContentContractError } from '../../content/contract-validation.ts';
import type { MapAxis, MissionCoordinates } from '../../content/logic/logic-content.ts';
import { readGroupManifest } from '../../content/manifest.ts';
import { CoreInputError } from '../../core/errors.ts';
import { loadMission, type MissionSetup } from '../../core/mission/load-mission.ts';
import { missionInput, type PackageGroup } from './mission-input.ts';

// Mission load diagnostics of a held package (P2-11 S-06, technical decision 10): the logic group's three Assets are
// decoded and loaded into Core, and only the structure of the result is kept: counts, Asset IDs and enumerations,
// never names, messages or any other original text.

/** The structure of a loaded mission. */
export interface MissionSummary {
  readonly mission: AssetId;
  readonly campaign: { readonly group: number; readonly slot: number };
  readonly mapAxes: { readonly right: MapAxis; readonly up: MapAxis };
  readonly units: { readonly coordinates: MissionCoordinates['unit']; readonly layout: MissionCoordinates['layoutUnit'] };
  /** Index of the player declaration. */
  readonly player: number;
  readonly counts: {
    readonly declarations: number;
    readonly groups: number;
    readonly spawnRegions: number;
    readonly wingmanOptions: number;
    readonly namePool: number;
  };
  /** Declarations per resolved side; `none` counts those without a craft type. */
  readonly sides: { readonly player: number; readonly friendly: number; readonly enemy: number; readonly none: number };
}

/** The models the mission's declarations and wingman options resolve to, checked against the held models group. */
export interface MissionReferences {
  readonly declarationsWithModel: number;
  readonly wingmanOptionsWithModel: number;
  /** Whether the package holds a complete models group; when not, no model is present. */
  readonly modelsGroup: 'held' | 'not-held';
  /** Every resolved model, in ascending ID order. */
  readonly models: readonly { readonly id: AssetId; readonly present: boolean }[];
}

export interface MissionFailure {
  /** `CoreInputError` for cross-Asset preconditions, `ContentContractError` for a single payload. */
  readonly kind: 'core-input' | 'content';
  readonly path: string;
  readonly reason: string;
}

export type MissionLoadState =
  | { readonly status: 'not-attempted' }
  | { readonly status: 'loaded'; readonly summary: MissionSummary; readonly references: MissionReferences }
  | { readonly status: 'failed'; readonly failure: MissionFailure };

export const MISSION_NOT_ATTEMPTED: MissionLoadState = Object.freeze({ status: 'not-attempted' });

/** The structural failure of a Core input or content error, as loading or creating a mission throws them; null otherwise. */
export function missionFailureOf(error: unknown): MissionFailure | null {
  if (!(error instanceof CoreInputError) && !(error instanceof ContentContractError)) return null;
  return Object.freeze({ kind: error instanceof CoreInputError ? 'core-input' : 'content', path: error.path, reason: error.reason });
}

function summarize(setup: MissionSetup): MissionSummary {
  const sides = { player: 0, friendly: 0, enemy: 0, none: 0 };
  for (const { side } of setup.declarations) sides[side ?? 'none'] += 1;
  return Object.freeze({
    mission: setup.mission,
    campaign: Object.freeze({ group: setup.campaign.group, slot: setup.campaign.slot }),
    mapAxes: Object.freeze({ right: setup.mapFrame.rightAxis, up: setup.mapFrame.upAxis }),
    units: Object.freeze({ coordinates: setup.coordinates.unit, layout: setup.coordinates.layoutUnit }),
    player: setup.player,
    counts: Object.freeze({
      declarations: setup.declarations.length,
      groups: setup.groups.length,
      spawnRegions: setup.spawnRegions.length,
      wingmanOptions: setup.wingmanOptions.length,
      namePool: setup.namePool.length,
    }),
    sides: Object.freeze(sides),
  });
}

function checkReferences(setup: MissionSetup, models: PackageGroup | undefined): MissionReferences {
  const held = new Set(models ? readGroupManifest(models.manifest, 'groups.models.manifest').assets.map(({ id }) => id) : []);
  const resolved = [...setup.declarations, ...setup.wingmanOptions].flatMap(({ model }) => (model === null ? [] : [model]));
  return Object.freeze({
    declarationsWithModel: setup.declarations.filter(({ model }) => model !== null).length,
    wingmanOptionsWithModel: setup.wingmanOptions.filter(({ model }) => model !== null).length,
    modelsGroup: models ? 'held' : 'not-held',
    models: Object.freeze([...new Set(resolved)].sort().map(id => Object.freeze({ id, present: held.has(id) }))),
  });
}

/**
 * Loads the held logic group's mission into Core and keeps the structural result: `not-attempted` without a logic
 * group, `loaded` with the summary and reference check, or `failed` with the error's kind, path and reason. Any other
 * exception is a defect and propagates.
 */
export function diagnoseMission(groups: readonly PackageGroup[]): MissionLoadState {
  const logic = groups.find(({ group }) => group === 'logic');
  if (!logic) return MISSION_NOT_ATTEMPTED;
  let setup: MissionSetup;
  try {
    setup = loadMission(missionInput(logic));
  } catch (error) {
    const failure = missionFailureOf(error);
    if (failure) return Object.freeze({ status: 'failed', failure });
    throw error;
  }
  const models = groups.find(({ group }) => group === 'models');
  return Object.freeze({ status: 'loaded', summary: summarize(setup), references: checkReferences(setup, models) });
}
