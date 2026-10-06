import type { AssetReference } from '../../content/asset-contract.ts';
import { readAssetId, readAssetKind } from '../../content/asset-id.ts';
import type { SourceStateSet } from '../../content/source-state.ts';
import { CLASSIC_P2_SLICE } from '../../content/slice-definition.ts';
import { MODEL_LIST_LIMITS } from '../formats/m2id.ts';
import { requireEntryBytes } from '../formats/payload-block.ts';
import { CAMPAIGN_LIMITS, parseCampaignTable, type ParsedCampaignTable } from '../formats/scct.ts';
import { SCENARIO_LIMITS } from '../formats/scen.ts';
import { assetSourceStates, readSourceMappingTable, type SourceMappingTable } from '../source-mapping.ts';
import { SourceError } from '../source-error.ts';
import type { VerifiedSource } from '../source/open-verified-source.ts';
import { verifySourceMappings, type EntryReader } from '../source/verify-source-mappings.ts';
import { stepEntryReader } from './step-entry-reader.ts';

// The production source mapping of the `logic` group (P2-09 spec, `logic` 组的 Asset) and the converter's check of the
// sub-resources `verifySourceMappings` leaves declared. Entry IDs are structural facts recorded in docs/original.

const { campaignGroup, campaignSlot } = CLASSIC_P2_SLICE.candidate;
/** The SCCT sub-resource of the slice's campaign slot. */
export const CAMPAIGN_SLOT_SUBRESOURCE = `group-${campaignGroup}/slot-${campaignSlot}`;
/** The SCCT sub-resource of the selectable wingman records. */
export const WINGMEN_SUBRESOURCE = 'wingmen';

const reference = (id: string, kind: string): AssetReference => Object.freeze({ id: readAssetId(id), kind: readAssetKind(kind) });
/** The Assets of the `logic` group (P2-09 spec, `logic` 组的 Asset). */
export const LOGIC_ASSETS = Object.freeze({
  craftTypes: reference('data/craft-types', 'data'),
  wingmanRoster: reference('data/wingman-roster', 'data'),
  mission: reference('mission/first-campaign', 'mission'),
});

const SCENARIO_NOB = 'MAIN/SCENARIO.NOB';
/** Entry IDs from docs/original/formats/scenario.md §4 (SCCT, SCEN of group 0 / slot 1) and hud.md §3 (M2ID). */
export const LOGIC_SOURCE_ENTRIES = Object.freeze({ campaign: 3123, scenario: 3019, modelList: 10649 });

const SCENARIO_EVIDENCE = [
  'docs/original/formats/scenario.md#4-scct-campaign-table-confirmed-structure-likely-meaning',
  'docs/original/formats/scenario.md#selected-mission-field-inventory-confirmed-structure',
];

/** Declared by research and bound to no source; an import verifies it against the identified source. */
export const LOGIC_SOURCE_MAPPINGS: SourceMappingTable = readSourceMappingTable({
  sourceFingerprint: null,
  mappings: [
    {
      asset: LOGIC_ASSETS.craftTypes,
      parts: [{ alternatives: [{ discPath: 'MAIN/SR.NOB', entry: { id: LOGIC_SOURCE_ENTRIES.modelList, type: 'M2ID' }, subresource: null }] }],
      confidence: 'likely',
      unknowns: ['U-022', 'U-028'],
      evidence: [
        'docs/original/formats/executable.md#player-target-modes-and-enemy-classification',
        'docs/original/formats/hud.md#3-id-lists-confirmed-structure',
      ],
      resolution: 'declared',
    },
    {
      asset: LOGIC_ASSETS.wingmanRoster,
      parts: [{ alternatives: [{ discPath: SCENARIO_NOB, entry: { id: LOGIC_SOURCE_ENTRIES.campaign, type: 'SCCT' }, subresource: WINGMEN_SUBRESOURCE }] }],
      confidence: 'likely',
      unknowns: ['U-023'],
      evidence: SCENARIO_EVIDENCE,
      resolution: 'declared',
    },
    {
      asset: LOGIC_ASSETS.mission,
      parts: [
        { alternatives: [{ discPath: SCENARIO_NOB, entry: { id: LOGIC_SOURCE_ENTRIES.campaign, type: 'SCCT' }, subresource: CAMPAIGN_SLOT_SUBRESOURCE }] },
        { alternatives: [{ discPath: SCENARIO_NOB, entry: { id: LOGIC_SOURCE_ENTRIES.scenario, type: 'SCEN' }, subresource: null }] },
      ],
      confidence: 'likely',
      unknowns: ['U-022'],
      evidence: SCENARIO_EVIDENCE,
      resolution: 'declared',
    },
  ],
});

/** Payload limits by entry type, judged on directory sizes before any mapped entry is read. */
const ENTRY_LIMITS: Readonly<Record<string, number>> = Object.freeze({
  SCCT: CAMPAIGN_LIMITS.entryBytes,
  SCEN: SCENARIO_LIMITS.entryBytes,
  M2ID: MODEL_LIST_LIMITS.entryBytes,
});

/**
 * The logic step's entry reader: the shared step-local reader, so mapping verification and conversion read each entry
 * once, with the payload size limits checked on the directory entry before its bytes are read.
 */
export const logicEntryReader = (source: VerifiedSource): EntryReader => stepEntryReader(source, (discPath, entry) => {
  const limit = ENTRY_LIMITS[entry.type];
  if (limit !== undefined) requireEntryBytes(discPath, entry, limit);
});

export interface LogicSources {
  /** The mappings bound to the source fingerprint, every one verified. */
  readonly table: SourceMappingTable;
  /** Locator-free source states for the `logic` group. */
  readonly sources: SourceStateSet;
  /** The campaign table parsed from the mapped SCCT for the slice candidate. */
  readonly campaign: ParsedCampaignTable;
}

/**
 * Verifies the logic mappings against `source` with the step's `readEntry` (from `logicEntryReader`), so a mapping is
 * verified only by reads of that source: `verifySourceMappings` reads every locator, then the mapped SCCT is parsed for
 * the slice candidate from the same read. A sub-resource is confirmed when the campaign slot names an SCEN entry of
 * the same mapping or the wingman records parsed; any other sub-resource or disagreement is `subresource-mismatch` at
 * the locator's structural path.
 */
export async function verifyLogicSources(source: VerifiedSource, readEntry: EntryReader, mappings: unknown = LOGIC_SOURCE_MAPPINGS): Promise<LogicSources> {
  const verified = await verifySourceMappings(mappings, source, readEntry);
  let campaign: { readonly entryId: number; readonly table: ParsedCampaignTable } | null = null;
  const upgraded = [];
  for (const [index, mapping] of verified.mappings.entries()) {
    let checked = false;
    for (const [part, { alternatives }] of mapping.parts.entries()) {
      for (const [alternative, locator] of alternatives.entries()) {
        const { discPath, entry, subresource } = locator;
        if (subresource === null) continue;
        checked = true;
        const at = `sources.mappings[${index}].parts[${part}].alternatives[${alternative}]`;
        const mismatch = (reason: string): never => { throw new SourceError('subresource-mismatch', at, reason); };
        if (discPath !== SCENARIO_NOB || entry.type !== 'SCCT') mismatch('the sub-resource is not in a campaign table');
        if (campaign === null) {
          campaign = { entryId: entry.id, table: parseCampaignTable(discPath, await readEntry(locator)) };
        } else if (campaign.entryId !== entry.id) {
          mismatch('the sub-resource is in another campaign table');
        }
        const { scenarioEntryId } = campaign.table;
        if (subresource === CAMPAIGN_SLOT_SUBRESOURCE) {
          const named = mapping.parts.some(({ alternatives: others }) =>
            others.some(other => other.discPath === discPath && other.entry.type === 'SCEN' && other.entry.id === scenarioEntryId && other.subresource === null));
          if (!named) mismatch('the campaign slot names another mission than the mapping');
        } else if (subresource !== WINGMEN_SUBRESOURCE) {
          mismatch('the sub-resource is not one the converter resolves');
        }
      }
    }
    upgraded.push(checked ? { ...mapping, resolution: 'verified' } : mapping);
  }
  if (campaign === null) throw new SourceError('invalid-request', 'sources.mappings', 'no mapping names the campaign table');
  const table = readSourceMappingTable({ sourceFingerprint: verified.sourceFingerprint, mappings: upgraded });
  return Object.freeze({ table, sources: assetSourceStates(table), campaign: campaign.table });
}
