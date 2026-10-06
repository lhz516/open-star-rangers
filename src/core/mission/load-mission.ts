import { readAssetId, type AssetId } from '../../content/asset-id.ts';
import { ContentContractError } from '../../content/contract-validation.ts';
import type {
  CraftSide, CraftTypeEntry, MissionContent, MissionDeclaration, MissionGroup, SpawnRegion, StrategicMapFrame,
} from '../../content/logic/logic-content.ts';
import { readCraftTypeTable, readMissionContent, readWingmanRoster } from '../../content/logic/logic-readers.ts';
import { CoreInputError } from '../errors.ts';

// Pure loading of the canonical logic data into a mission setup (P2-09 spec, Core 载入结果). Single-payload errors are
// the content readers' `ContentContractError`s, passed through; only cross-Asset preconditions are Core's to check.
// Nothing is defaulted, scheduled or randomised here: P3 builds the running world on top of the setup.

/** One logic Asset handed to Core: its ID and decoded content, which Core reads again instead of trusting its type. */
export interface LogicAssetInput {
  readonly id: AssetId;
  readonly content: unknown;
}

export interface LoadMissionInput {
  readonly mission: LogicAssetInput;
  readonly craftTypes: LogicAssetInput;
  readonly wingmanRoster: LogicAssetInput;
}

/** A declaration with its craft type resolved: all three are null, null and false for a declaration without one. */
export interface ResolvedDeclaration extends MissionDeclaration {
  readonly side: CraftSide | null;
  readonly model: AssetId | null;
  readonly baseInteraction: boolean;
}

export interface MissionSetup {
  readonly mission: AssetId;
  readonly campaign: MissionContent['campaign'];
  readonly coordinates: MissionContent['coordinates'];
  readonly mapFrame: StrategicMapFrame;
  readonly namePool: readonly string[];
  readonly spawnRegions: readonly SpawnRegion[];
  /** In `index` order. */
  readonly declarations: readonly ResolvedDeclaration[];
  /** Index of the only declaration whose side is `player`. */
  readonly player: number;
  readonly groups: readonly MissionGroup[];
  readonly wingmanOptions: readonly ResolvedDeclaration[];
}

function readInputRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new CoreInputError(path, 'must be an object');
  return value as Record<string, unknown>;
}

/** The Asset in `field`: its ID and content, neither trusted yet. */
function readAssetInput(input: Record<string, unknown>, field: keyof LoadMissionInput): { readonly id: unknown; readonly content: unknown } {
  const record = readInputRecord(input[field], `input.${field}`);
  return { id: record.id, content: record.content };
}

function readMissionId(value: unknown): AssetId {
  let id: AssetId;
  try {
    id = readAssetId(value, 'input.mission.id');
  } catch (error) {
    if (error instanceof ContentContractError) throw new CoreInputError('input.mission.id', 'must be an Asset ID');
    throw error;
  }
  if (!id.startsWith('mission/')) throw new CoreInputError('input.mission.id', 'must be a mission Asset ID');
  return id;
}

/**
 * Loads the mission setup from the three logic Assets. The input is checked at run time too, and each content is read
 * again with the content readers, so a single payload's errors arrive as `ContentContractError` at its
 * `input.<asset>.content` path. Cross-Asset failures
 * throw `CoreInputError` at the input position: Asset IDs that differ from the references, a craft type table that
 * does not cover exactly the referenced craft types, a mission without exactly one player declaration, or a player
 * wingman option. The result is frozen plain data, isolated from the input; equal input gives a deeply equal result.
 */
export function loadMission(value: LoadMissionInput): MissionSetup {
  const input = readInputRecord(value, 'input');
  const missionInput = readAssetInput(input, 'mission');
  const craftTypesInput = readAssetInput(input, 'craftTypes');
  const rosterInput = readAssetInput(input, 'wingmanRoster');
  const missionId = readMissionId(missionInput.id);
  const mission = readMissionContent(missionInput.content, 'input.mission.content');
  // The referenced Assets must be the ones given before their content is read.
  if (craftTypesInput.id !== mission.references.craftTypes) throw new CoreInputError('input.craftTypes.id', 'must be the craft type table the mission references');
  if (rosterInput.id !== mission.references.wingmanRoster) throw new CoreInputError('input.wingmanRoster.id', 'must be the wingman roster the mission references');
  const craftTypes = readCraftTypeTable(craftTypesInput.content, 'input.craftTypes.content');
  const roster = readWingmanRoster(rosterInput.content, 'input.wingmanRoster.content');
  if (roster.references.craftTypes !== mission.references.craftTypes) {
    throw new CoreInputError('input.wingmanRoster.content.references.craftTypes', 'must be the craft type table the mission references');
  }

  const entries = new Map<number, CraftTypeEntry>(craftTypes.entries.map(entry => [entry.craftType, entry]));
  const resolve = (declarations: readonly MissionDeclaration[], path: string): readonly ResolvedDeclaration[] =>
    Object.freeze(declarations.map((declaration, index): ResolvedDeclaration => {
      const { craftType } = declaration;
      if (craftType === null) return Object.freeze({ ...declaration, side: null, model: null, baseInteraction: false });
      const entry = entries.get(craftType);
      if (!entry) throw new CoreInputError(`${path}[${index}].craftType`, 'references a craft type the table lacks');
      return Object.freeze({ ...declaration, side: entry.side, model: entry.model.id, baseInteraction: entry.baseInteraction });
    }));
  const declarations = resolve(mission.declarations, 'input.mission.content.declarations');
  const wingmanOptions = resolve(roster.options, 'input.wingmanRoster.content.options');
  const players = declarations.filter(({ side }) => side === 'player');
  if (players.length === 0) throw new CoreInputError('input.mission.content.declarations', 'must have exactly one player declaration');
  if (players.length > 1) throw new CoreInputError(`input.mission.content.declarations[${players[1].index}].craftType`, 'is a second player declaration');
  const playerOption = wingmanOptions.find(({ side }) => side === 'player');
  if (playerOption) throw new CoreInputError(`input.wingmanRoster.content.options[${playerOption.index}].craftType`, 'must not be the player craft type');
  // Checked last: a missing player would otherwise surface as an unreferenced player craft type.
  const referenced = new Set([...declarations, ...wingmanOptions].flatMap(({ craftType }) => (craftType === null ? [] : [craftType])));
  craftTypes.entries.forEach(({ craftType }, index) => {
    if (!referenced.has(craftType)) throw new CoreInputError(`input.craftTypes.content.entries[${index}]`, 'is referenced by neither the mission nor the wingman roster');
  });

  return Object.freeze({
    mission: missionId,
    campaign: mission.campaign,
    coordinates: mission.coordinates,
    mapFrame: mission.mapFrame,
    namePool: mission.namePool,
    spawnRegions: mission.spawnRegions,
    declarations,
    player: players[0].index,
    groups: mission.groups,
    wingmanOptions,
  });
}
