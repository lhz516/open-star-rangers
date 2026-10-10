import type { AssetDescriptor, ResourceGroup } from '../../content/asset-contract.ts';
import type { AssetId } from '../../content/asset-id.ts';
import { ContentContractError } from '../../content/contract-validation.ts';
import type { MissionContent } from '../../content/logic/logic-content.ts';
import { decodeLogicPayload } from '../../content/logic/logic-payload.ts';
import { readGroupManifest } from '../../content/manifest.ts';
import { readPayloadRecords } from '../../content/payload.ts';
import { decodeRuleDataPayload } from '../../content/rule-data/rule-data-payload.ts';
import type { LoadMissionInput, LogicAssetInput } from '../../core/mission/load-mission.ts';

// The world creation content decoded from a held package's logic group: the mission's three logic Assets, shared by the
// mission load diagnostics (P2-11 S-06) and the mission owner (P3-04 任务开始配置), so both read the same Assets of the
// same package the same way, and the craft info the mission owner adds to them (P3-06 D-01).

/** A complete group of a package: its raw manifest and payload records, as the holder keeps them. */
export interface PackageGroup {
  readonly group: ResourceGroup;
  readonly manifest: unknown;
  readonly payloads: unknown;
}

type Decoder = (bytes: Uint8Array, descriptor: AssetDescriptor) => { readonly content: unknown };

/**
 * The logic group's Asset descriptors, and a decoder of the Asset a descriptor describes, or undefined for none. A
 * decoding error keeps its code and reason at `logic[<Asset ID>].<path>`.
 */
function logicAssets(logic: PackageGroup) {
  const { assets } = readGroupManifest(logic.manifest, 'groups.logic.manifest');
  const payloads = readPayloadRecords(logic.payloads, 'groups.logic.payloads');
  const asset = (descriptor: AssetDescriptor | undefined, decode: Decoder): LogicAssetInput | undefined => {
    if (!descriptor) return undefined;
    // A complete group has a payload for every descriptor.
    const { bytes } = payloads.find(({ id }) => id === descriptor.id)!;
    try {
      return { id: descriptor.id, content: decode(bytes, descriptor).content };
    } catch (error) {
      if (error instanceof ContentContractError) throw new ContentContractError(error.code, `logic[${descriptor.id}].${error.path}`, error.reason);
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
  const { assets, asset } = logicAssets(logic);
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
  const { assets, asset } = logicAssets(logic);
  return asset(assets.find(({ role }) => role === 'craft-info'), decodeRuleDataPayload);
}
