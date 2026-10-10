import type { AssetDescriptor, ResourceGroup } from '../../content/asset-contract.ts';
import type { AssetId } from '../../content/asset-id.ts';
import { compareText, ContentContractError } from '../../content/contract-validation.ts';
import { checkEffectBinding, readEffectPayload } from '../../content/effects/effect-payload.ts';
import type { ExplosionTable } from '../../content/flight/flight-data-content.ts';
import { decodeFlightDataPayload } from '../../content/flight/flight-data-payload.ts';
import type { MissionContent } from '../../content/logic/logic-content.ts';
import { decodeLogicPayload } from '../../content/logic/logic-payload.ts';
import { readGroupManifest } from '../../content/manifest.ts';
import { checkModelBinding, readModelPayload } from '../../content/models/model-payload.ts';
import { readPayloadRecords } from '../../content/payload.ts';
import { decodeRuleDataPayload } from '../../content/rule-data/rule-data-payload.ts';
import type { LoadMissionInput, LogicAssetInput } from '../../core/mission/load-mission.ts';
import { CoreInputError } from '../../core/errors.ts';
import { instantiableModelIds } from '../../core/world/create-world.ts';

// The world creation content decoded from a held package: the mission's three logic Assets, shared by the mission load
// diagnostics (P2-11 S-06) and the mission owner (P3-04 任务开始配置), so both read the same Assets of the same package
// the same way; and the craft info (P3-06 D-01) and rule-data inputs (docs/plan/p3/02/spec.md, CR-01) the mission owner,
// the replay check and the scenario tests add to them from the same package.

/** A complete group of a package: its raw manifest and payload records, as the holder keeps them. */
export interface PackageGroup {
  readonly group: ResourceGroup;
  readonly manifest: unknown;
  readonly payloads: unknown;
}

type Decoder = (bytes: Uint8Array, descriptor: AssetDescriptor) => { readonly content: unknown };

/**
 * A group's Asset descriptors, and a decoder of the Asset a descriptor describes, or undefined for none. A decoding
 * error keeps its code and reason at `<group>[<Asset ID>].<path>`.
 */
function groupAssets({ group, manifest, payloads: records }: PackageGroup) {
  const { assets } = readGroupManifest(manifest, `groups.${group}.manifest`);
  const payloads = new Map(readPayloadRecords(records, `groups.${group}.payloads`).map(({ id, bytes }) => [id, bytes]));
  const asset = (descriptor: AssetDescriptor | undefined, decode: Decoder): LogicAssetInput | undefined => {
    if (!descriptor) return undefined;
    // A complete group has a payload for every descriptor.
    const bytes = payloads.get(descriptor.id)!;
    try {
      return { id: descriptor.id, content: decode(bytes, descriptor).content };
    } catch (error) {
      if (error instanceof ContentContractError) throw new ContentContractError(error.code, `${group}[${descriptor.id}].${error.path}`, error.reason);
      throw error;
    }
  };
  return { assets, asset };
}


/**
 * The decoded mission, the only Asset of its role, and the craft type table and wingman roster it references by Asset
 * ID, since the group may hold other Assets of those roles. An Asset the group lacks stays undefined, which
 * `loadMission` rejects at its input position. A decoding error keeps its code and reason at `logic[<Asset ID>].<path>`.
 */
export function missionInput(logic: PackageGroup): LoadMissionInput {
  const { assets, asset } = groupAssets(logic);
  const mission = asset(assets.find(({ role }) => role === 'mission'), decodeLogicPayload);
  const references = (mission?.content as MissionContent | undefined)?.references;
  const referenced = (id: AssetId | undefined) => asset(id === undefined ? undefined : assets.find(descriptor => descriptor.id === id), decodeLogicPayload);
  return { mission, craftTypes: referenced(references?.craftTypes), wingmanRoster: referenced(references?.wingmanRoster) } as LoadMissionInput;
}

/**
 * The craft info of world creation (docs/plan/p3/06/spec.md, D-01): the group's `craft-info` Asset, the only one of its
 * role in a complete group, decoded with `decodeRuleDataPayload`. Undefined when the group lacks it, which world
 * creation rejects at `input.craftInfo`; a decoding error keeps its code and reason at `logic[<Asset ID>].<path>`.
 */
export function craftInfoInput(logic: PackageGroup): LogicAssetInput | undefined {
  const { assets, asset } = groupAssets(logic);
  return asset(assets.find(({ role }) => role === 'craft-info'), decodeRuleDataPayload);
}

/** The rule-data inputs of world creation that do not depend on the run (CR-01); an input the package lacks is undefined. */
export interface RuleDataInputs {
  readonly debrisParameters: LogicAssetInput | undefined;
  readonly projectileVisuals: LogicAssetInput | undefined;
  readonly explosions: LogicAssetInput | undefined;
  readonly explosionAnimations: readonly LogicAssetInput[];
  readonly aiPrograms: LogicAssetInput | undefined;
}

/** The projectile visuals' effect payload, read strictly and checked against its descriptor. */
const decodeProjectileVisuals: Decoder = (bytes, descriptor) => {
  const content = readEffectPayload(bytes, descriptor.payloadIdentity.schemaVersion, 'projectile');
  checkEffectBinding(descriptor, content);
  return { content };
};

/** A model payload, read strictly and checked against its descriptor. */
const decodeModel: Decoder = (bytes, descriptor) => {
  const content = readModelPayload(bytes, descriptor.payloadIdentity.schemaVersion);
  checkModelBinding(descriptor, content);
  return { content };
};

const groupOf = (groups: readonly PackageGroup[], name: ResourceGroup): PackageGroup | undefined => groups.find(({ group }) => group === name);

/**
 * The run-independent rule-data inputs of world creation (docs/plan/p3/02/spec.md, CR-01) from a package's groups:
 * the logic group's `debris-parameters` and `ai-programs` Assets (decodeRuleDataPayload); the models group's `explosion-table` Asset and
 * the explosion animations its lists name, once each in ascending ID order (decodeFlightDataPayload); and its only
 * `data` Asset of role `projectile`, the projectile visuals (readEffectPayload). A complete package has exactly one Asset
 * of each of the first three roles. An Asset the package lacks, or a projectile `data` Asset that is not the only one,
 * stays undefined or out of the list, which world creation rejects at its input position. A decoding error keeps its
 * code and reason at `<group>[<Asset ID>].<path>`.
 */
export function ruleDataInputs(groups: readonly PackageGroup[]): RuleDataInputs {
  const logic = groupOf(groups, 'logic');
  const only = (group: PackageGroup | undefined, role: string, decode: Decoder) => {
    if (!group) return undefined;
    const { assets, asset } = groupAssets(group);
    return asset(assets.find((descriptor) => descriptor.role === role), decode);
  };
  const debrisParameters = only(logic, 'debris-parameters', decodeRuleDataPayload);
  const aiPrograms = only(logic, 'ai-programs', decodeRuleDataPayload);
  const models = groupOf(groups, 'models');
  if (!models) return Object.freeze({ debrisParameters, projectileVisuals: undefined, explosions: undefined, explosionAnimations: Object.freeze([]), aiPrograms });
  const { assets, asset } = groupAssets(models);
  const projectiles = assets.filter(({ role, kind }) => role === 'projectile' && kind === 'data');
  const projectileVisuals = projectiles.length === 1 ? asset(projectiles[0], decodeProjectileVisuals) : undefined;
  const explosions = asset(assets.find(({ role }) => role === 'explosion-table'), decodeFlightDataPayload);
  const named = new Set((explosions?.content as ExplosionTable | undefined)?.lists.flatMap((list) => list.map(({ animation }) => animation.id)));
  const explosionAnimations = assets.filter(({ id }) => named.has(id)).sort((left, right) => compareText(left.id, right.id))
    .map((descriptor) => asset(descriptor, decodeFlightDataPayload)!);
  return Object.freeze({ debrisParameters, projectileVisuals, explosions, explosionAnimations: Object.freeze(explosionAnimations), aiPrograms });
}

/**
 * The models group's model Assets of `ids`, in their order, read strictly with readModelPayload. An ID the group lacks
 * is left out, which world creation rejects; a decoding error keeps its code and reason at `models[<Asset ID>].<path>`.
 */
export function modelInputs(groups: readonly PackageGroup[], ids: readonly AssetId[]): readonly LogicAssetInput[] {
  const models = groupOf(groups, 'models');
  if (!models) return Object.freeze([]);
  const { assets, asset } = groupAssets(models);
  return Object.freeze(ids.flatMap((id) => {
    const descriptor = assets.find((item) => item.id === id && item.kind === 'model');
    return descriptor ? [asset(descriptor, decodeModel)!] : [];
  }));
}

/**
 * The models world creation takes for a run of `input` (CR-01): those of the craft it instantiates, as Core's
 * `instantiableModelIds` names them, decoded with `modelInputs`. When Core refuses the run's logic Assets, identity or
 * configuration there are none: world creation, given the same input, reports that refusal at its own path.
 */
export function runModelInputs(groups: readonly PackageGroup[], input: Parameters<typeof instantiableModelIds>[0]): readonly LogicAssetInput[] {
  let ids: readonly AssetId[] = [];
  try {
    ids = instantiableModelIds(input);
  } catch (error) {
    if (!(error instanceof CoreInputError || error instanceof ContentContractError)) throw error;
  }
  return modelInputs(groups, ids);
}
