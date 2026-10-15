import type { AssetReference } from '../../content/asset-contract.ts';
import { chargeBudget, EMPTY_BUDGET_USAGE, readBudgetRecord, type BudgetRecord } from '../../content/budget.ts';
import {
  LOGIC_LIMITS, LOGIC_PAYLOAD_SCHEMA_VERSION, type LogicPayload, type MissionContent, type MissionDeclaration, type MissionGroup,
  type StrategicMapFrame,
} from '../../content/logic/logic-content.ts';
import { encodeLogicPayload } from '../../content/logic/logic-payload.ts';
import type { GroupDraft } from '../../content/manifest-identity.ts';
import { readAssetDescriptors } from '../../content/manifest.ts';
import { readPayloadRecords } from '../../content/payload.ts';
import { sha256Fingerprint } from '../../content/sha256.ts';
import { CLASSIC_P2_SLICE } from '../../content/slice-definition.ts';
import { parseModelIdList } from '../formats/m2id.ts';
import { entryLocation } from '../formats/payload-block.ts';
import { parseScenario, type ParsedScenario } from '../formats/scen.ts';
import { archiveLocator, type ArchiveEntryLocator, type SourceMappingTable } from '../source-mapping.ts';
import { SourceError } from '../source-error.ts';
import type { VerifiedSource } from '../source/open-verified-source.ts';
import { readConversionUsage } from './conversion-budget.ts';
import { bindCraftTypes, type ModelBinding } from './craft-binding.ts';
import { LOGIC_ASSETS, logicEntryReader, verifyLogicSources } from './logic-sources.ts';

// The logic conversion step (P2-09 spec, 规范逻辑数据 and 限值与预算): the three payloads of the `logic` group, their
// descriptors and source states, charged to the job budget. Every value comes from the source; nothing is defaulted.

/**
 * This converter's `ConverterVersion` component; any change to its output for the same source increments it. Version 2
 * writes the mission's event triggers (logic payload schema 2) and adds the P3-03 rule-data Assets to the logic group;
 * version 3 adds `data/comm-messages` (P3-03 spec, revision 2).
 */
export const LOGIC_CONVERTER_COMPONENT = 'logic-3';

/**
 * The approved budget share of the logic step; the job adds it to its read limits and the other steps' shares
 * (P2-05 budget shares). Mission objects count mission and wingman declarations together.
 */
export const PRODUCTION_LOGIC_SHARE: BudgetRecord = Object.freeze({
  ...EMPTY_BUDGET_USAGE,
  assets: 8,
  dependencyEdges: 32,
  payloadBytes: LOGIC_LIMITS.payloadBytes,
  missionObjects: 256,
  missionReferences: 4_096,
});

/** Charges the job budget on top of earlier steps' conversion usage, failing at the charged Asset's source. */
class BudgetMeter {
  readonly #limits: BudgetRecord;
  usage: BudgetRecord;

  constructor(limits: unknown, usage: unknown) {
    this.#limits = readBudgetRecord(limits, 'limits');
    this.usage = readConversionUsage(usage);
  }

  /** A rejected charge changes nothing. */
  charge(increment: Partial<BudgetRecord>, location: string): void {
    const result = chargeBudget(this.#limits, this.usage, { ...EMPTY_BUDGET_USAGE, ...increment });
    if (result.status === 'over-budget') {
      const [{ dimension, limit, observed }] = result.violations;
      throw new SourceError('budget-exceeded', location, 'the conversion budget is exhausted', { name: dimension, limit, observed });
    }
    this.usage = result.usage;
  }
}

/**
 * References a declaration makes, each counted once: its craft type, spawn rectangle, anchor, group, AI target and
 * event trigger. Names, rule inputs, AI target craft types, layouts and event trigger contents are not references.
 */
const declarationReferences = (declarations: readonly MissionDeclaration[]): number => declarations.reduce((sum, { craftType, placement, memberOf, aiTarget, eventTrigger }) =>
  sum + [craftType, placement.region, placement.anchor, memberOf, aiTarget, eventTrigger].filter(value => value !== null).length, 0);

/** A group references its template and every member position. */
const groupReferences = (groups: readonly MissionGroup[]): number => groups.reduce((sum, { members }) => sum + 1 + members.length, 0);

/**
 * The main map frame (docs/original/formats/executable.md, world sector grid and strategic map projection): the map
 * shows the whole square sector grid centred on the origin, with x to the right and y downwards.
 */
const strategicMapFrame = ({ sectors, referenceScale }: ParsedScenario): StrategicMapFrame =>
  ({ rightAxis: '+x', upAxis: '-y', center: { right: 0, up: 0 }, halfExtent: sectors * referenceScale / 2 });

/** The first locator of `asset`'s mapping whose entry has `type`; the production table has exactly one. */
const locatorOf = (table: SourceMappingTable, asset: AssetReference, type: string): ArchiveEntryLocator =>
  archiveLocator(table.mappings.find(mapping => mapping.asset.id === asset.id)!.parts.map(({ alternatives }) => alternatives[0]).find(({ entry }) => entry?.type === type)!);

interface AssetPlan {
  readonly asset: AssetReference;
  readonly payload: LogicPayload;
  /** Ascending ID order. */
  readonly dependencies: readonly AssetReference[];
  readonly missionObjects: number;
  readonly missionReferences: number;
  /** The source structure a budget failure is reported at. */
  readonly location: string;
}

export interface LogicConversion {
  /** The `logic` group before its package identity is written. */
  readonly draft: GroupDraft;
  /** Conversion usage after the starting usage; `sourceReadBytes` is never charged here. */
  readonly usage: BudgetRecord;
  /** The craft type binding's model Assets, which the model step converts without rereading the mission or M2ID. */
  readonly models: readonly ModelBinding[];
}

/**
 * Runs the logic conversion step on `source`. The production mappings are verified first; then only the mapped
 * campaign table, mission and model list are read, each once and shared with verification, craft types are bound to
 * model Assets and the three payloads are encoded. Each Asset is charged against `limits` on top of `usage`, the
 * conversion usage of earlier steps, before its payload is encoded, and its byte length before the bytes are allocated.
 * Any failure rejects the whole group; reads already issued stay charged to the source.
 */
export async function convertLogic(source: VerifiedSource, limits: unknown, usage: unknown = EMPTY_BUDGET_USAGE): Promise<LogicConversion> {
  const meter = new BudgetMeter(limits, usage);
  const readEntry = logicEntryReader(source);
  const { table, sources, campaign } = await verifyLogicSources(source, readEntry);
  const at = ({ discPath, entry }: ArchiveEntryLocator, path = '') => `${entryLocation(discPath, entry)}${path}`;
  const missionAt = locatorOf(table, LOGIC_ASSETS.mission, 'SCEN');
  const modelListAt = locatorOf(table, LOGIC_ASSETS.craftTypes, 'M2ID');
  const rosterAt = locatorOf(table, LOGIC_ASSETS.wingmanRoster, 'SCCT');
  const scenario = parseScenario(missionAt.discPath, await readEntry(missionAt));
  const modelIds = parseModelIdList(modelListAt.discPath, await readEntry(modelListAt));
  const { declarations, groups, eventTriggers } = scenario;
  const { wingmen } = campaign;

  const referenced = [...declarations, ...wingmen].flatMap(({ craftType }) => (craftType === null ? [] : [craftType]));
  const { table: craftTypes, models } = bindCraftTypes(referenced, modelIds, at(modelListAt));
  const player = craftTypes.entries.find(({ side }) => side === 'player')!.craftType;
  const players = declarations.filter(({ craftType }) => craftType === player);
  if (players.length !== 1) {
    throw new SourceError('unsupported-payload', at(missionAt, players.length === 0 ? '/records' : `/records[${players[1].index}]/kind`), 'the mission does not have exactly one player record');
  }
  const playerOption = wingmen.find(({ craftType }) => craftType === player);
  if (playerOption) throw new SourceError('unsupported-payload', at(rosterAt, `/wingmen[${playerOption.index}]/kind`), 'a wingman option is the player craft type');

  const { campaignGroup, campaignSlot } = CLASSIC_P2_SLICE.candidate;
  const mission: MissionContent = {
    campaign: { group: campaignGroup, slot: campaignSlot },
    coordinates: { unit: 'scen-reference', referenceScale: scenario.referenceScale, layoutUnit: 'scen-runtime' },
    references: { craftTypes: LOGIC_ASSETS.craftTypes.id, wingmanRoster: LOGIC_ASSETS.wingmanRoster.id },
    mapFrame: strategicMapFrame(scenario),
    namePool: scenario.namePool,
    spawnRegions: scenario.spawnRegions,
    declarations,
    groups,
    eventTriggers,
  };
  const plans: readonly AssetPlan[] = [
    {
      asset: LOGIC_ASSETS.craftTypes,
      payload: { role: 'craft-types', content: craftTypes },
      dependencies: models.map(({ id }) => ({ id, kind: 'model' })),
      missionObjects: 0,
      // Each craft type references its model.
      missionReferences: craftTypes.entries.length,
      location: at(modelListAt),
    },
    {
      asset: LOGIC_ASSETS.wingmanRoster,
      payload: { role: 'wingman-roster', content: { references: { craftTypes: LOGIC_ASSETS.craftTypes.id }, options: wingmen } },
      dependencies: [LOGIC_ASSETS.craftTypes],
      missionObjects: wingmen.length,
      missionReferences: declarationReferences(wingmen) + 1,
      location: at(rosterAt, '/wingmen'),
    },
    {
      asset: LOGIC_ASSETS.mission,
      payload: { role: 'mission', content: mission },
      dependencies: [LOGIC_ASSETS.craftTypes, LOGIC_ASSETS.wingmanRoster],
      missionObjects: declarations.length,
      missionReferences: declarationReferences(declarations) + groupReferences(groups) + 2,
      location: at(missionAt),
    },
  ];

  const encoded = plans.map(({ asset, payload, dependencies, missionObjects, missionReferences, location }) => {
    // Counts are known before the payload is copied and encoded; its byte length before its bytes are allocated.
    meter.charge({ assets: 1, dependencyEdges: dependencies.length, missionObjects, missionReferences }, location);
    const bytes = encodeLogicPayload(payload, payloadBytes => meter.charge({ payloadBytes }, location));
    const payloadIdentity = { schemaVersion: LOGIC_PAYLOAD_SCHEMA_VERSION, byteLength: bytes.length, fingerprint: sha256Fingerprint(bytes) };
    return {
      descriptor: { ...asset, role: payload.role, group: 'logic', dependencies, payloadIdentity },
      payload: { id: asset.id, schemaVersion: LOGIC_PAYLOAD_SCHEMA_VERSION, bytes },
    };
  });
  const draft: GroupDraft = Object.freeze({
    group: 'logic',
    assets: readAssetDescriptors(encoded.map(({ descriptor }) => descriptor), 'assets'),
    payloads: readPayloadRecords(encoded.map(({ payload }) => payload)),
    sources,
  });
  return Object.freeze({ draft, usage: meter.usage, models });
}
