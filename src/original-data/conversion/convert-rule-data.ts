import type { AssetReference } from '../../content/asset-contract.ts';
import { EMPTY_BUDGET_USAGE, readBudgetRecord, type BudgetRecord } from '../../content/budget.ts';
import type { GroupDraft } from '../../content/manifest-identity.ts';
import { readAssetDescriptors } from '../../content/manifest.ts';
import { readPayloadRecords } from '../../content/payload.ts';
import { AI_PROGRAMS_LIMITS } from '../../content/rule-data/ai-programs.ts';
import {
  checkRuleDataBinding, encodeRuleDataPayload, RULE_DATA_SCHEMA_VERSIONS, type RuleDataPayload,
} from '../../content/rule-data/rule-data-payload.ts';
import { sha256Fingerprint } from '../../content/sha256.ts';
import type { ArchiveEntryRead } from '../archive/archive-reader.ts';
import type { ImfatEntry } from '../archive/imfat-rules.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import { AI_LAYOUT, AI_SOURCE_LIMITS, parseAiPrograms, type AiRegionRead } from '../formats/ai.ts';
import { BASE_REPAIR_ENTRY_BYTES, parseBaseRepairItems } from '../formats/base-repair.ts';
import { COMM_MENU_ENTRY_BYTES, COMM_NAME_LIST_ENTRY_BYTES, parseCommMenus, type CommMenuReads } from '../formats/comm.ts';
import { COMM_FACE_SOURCE_LIMITS, parseCommMessages } from '../formats/comm-face.ts';
import { CRAFT_INFO_ENTRY_BYTES, CRAFT_TABLE_FORMAT, parseCraftInfo, parseCraftTable } from '../formats/craft.ts';
import { DEBRIS_ENTRY_BYTES, parseDebrisParameters } from '../formats/debris.ts';
import { parseFlightMessages, type FlightMessageRegions } from '../formats/executable-text.ts';
import { requireEntryBytes } from '../formats/payload-block.ts';
import {
  assetSourceStates, compareLocators, executableRegion, readSourceMappingTable, type ArchiveEntryLocator, type OriginalAssetLocator,
  type SourceMappingTable,
} from '../source-mapping.ts';
import { SourceError } from '../source-error.ts';
import type { VerifiedSource } from '../source/open-verified-source.ts';
import { verifySourceMappings } from '../source/verify-source-mappings.ts';
import { chargeConversionBudget, readConversionUsage } from './conversion-budget.ts';
import {
  PRODUCTION_RULE_DATA_SOURCES, RULE_DATA_ASSETS, ruleDataLocators, ruleDataMappings, type RuleDataLocators, type RuleDataSources,
} from './production-rule-data.ts';
import { stepEntryReader, stepRegionReaders } from './step-entry-reader.ts';

// The conversion of the seven rule-data Assets of the `logic` group (P3-03 spec S-03 to S-08 and S-18, 来源映射与核验 and 限值与预算):
// their mappings are verified with step-local reads of one verified source, the parsers of formats/ turn the mapped parts
// into canonical content, the ID chains are checked against the mapping, and each payload is charged before it is
// allocated. The result is a partition of the logic group that the job merges with the logic step's draft.

export interface RuleDataConversion {
  /** The rule-data Assets of the `logic` group in ascending ID order, their payloads and fingerprinted source states. */
  readonly partition: GroupDraft;
  /** Conversion usage after the starting usage; `sourceReadBytes` is never charged here. */
  readonly usage: BudgetRecord;
}

/** What one rule-data Asset adds to the conversion usage: itself and its payload bytes; it has no dependencies. */
export const ruleDataIncrement = (payloadBytes: number): Partial<BudgetRecord> => ({ assets: 1, dependencyEdges: 0, payloadBytes });

const entryKey = (discPath: string, { id, type }: Pick<ImfatEntry, 'id' | 'type'>): string => `${discPath}\u0000${type}\u0000${id}`;

/** The payload size limit of each mapped entry, by the parser that reads it; an entry mapped twice gets the smaller. */
function entryLimits({ craftInfo, debrisParameters, aiPrograms, commMenus, baseRepairItems, commMessages }: RuleDataLocators): ReadonlyMap<string, number> {
  const limits = new Map<string, number>();
  const limit = ({ discPath, entry }: ArchiveEntryLocator, bytes: number) => {
    const key = entryKey(discPath, entry);
    limits.set(key, Math.min(bytes, limits.get(key) ?? bytes));
  };
  limit(craftInfo.table, CRAFT_TABLE_FORMAT.entryBytes);
  limit(craftInfo.craftInfo, CRAFT_INFO_ENTRY_BYTES);
  limit(debrisParameters.table, DEBRIS_ENTRY_BYTES);
  limit(aiPrograms.globals, AI_SOURCE_LIMITS.globalsEntryBytes);
  limit(aiPrograms.table, AI_SOURCE_LIMITS.programTableEntryBytes);
  for (const locator of aiPrograms.entries) {
    limit(locator, locator.entry.type === 'DFPG' ? AI_SOURCE_LIMITS.parameterEntryBytes : AI_SOURCE_LIMITS.scriptEntryBytes);
  }
  for (const locator of Object.values(commMenus)) limit(locator, COMM_MENU_ENTRY_BYTES);
  limit(baseRepairItems.table, BASE_REPAIR_ENTRY_BYTES);
  for (const locator of [...commMessages.faceTables, commMessages.direct, ...commMessages.subTables]) limit(locator, COMM_FACE_SOURCE_LIMITS.tableEntryBytes);
  for (const locator of commMessages.messages) limit(locator, COMM_FACE_SOURCE_LIMITS.messageEntryBytes);
  for (const locator of [commMessages.names2001, commMessages.names2011]) limit(locator, COMM_NAME_LIST_ENTRY_BYTES);
  return limits;
}

/** The structural path of `locator`'s part in `asset`'s mapping of `table`, where it is the only alternative. */
const partPath = (table: SourceMappingTable, asset: AssetReference, locator: OriginalAssetLocator): string => {
  const index = table.mappings.findIndex(mapping => mapping.asset.id === asset.id);
  const part = table.mappings[index].parts.findIndex(({ alternatives: [first] }) => compareLocators(first, locator) === 0);
  return `sources.mappings[${index}].parts[${part}].alternatives[0]`;
};

/**
 * Verifies the mappings built from `sources` against `source` and parses their parts, in Asset ID order. A step-local
 * reader checks each entry's size against its parser's limit before reading it and shares the read with verification.
 * The parsers resolve the sub-resources (the candidate's TABL 4003 pair and AICO triple, the TABL 10165 selector field,
 * each CMOV's frames) and the regions from those reads; the selected pair must name the mapped CINF part, the AI ID
 * chain exactly the mapped DFPG and script parts, and the COMMFACE ID chain exactly the mapped sub-table and CMOV parts,
 * otherwise `subresource-mismatch`. The readers and their caches end with this call.
 */
async function parseRuleData(source: VerifiedSource, sources: RuleDataSources): Promise<{ readonly bound: SourceMappingTable; readonly payloads: readonly RuleDataPayload[] }> {
  const parts = ruleDataLocators(sources);
  const sizeLimits = entryLimits(parts);
  // Every read is of a mapped entry, so every read has a limit.
  const readEntry = stepEntryReader(source, (discPath: DiscPath, entry: ImfatEntry) => requireEntryBytes(discPath, entry, sizeLimits.get(entryKey(discPath, entry)) ?? 0));
  // Verification reads every entry part and binds the fingerprint; parts with a sub-resource or region stay declared.
  const bound = await verifySourceMappings(ruleDataMappings(sources), source, readEntry);
  const { read: readRegion, readFixedUp } = stepRegionReaders(source);
  const at = (asset: AssetReference, locator: OriginalAssetLocator) => partPath(bound, asset, locator);

  const ai = parts.aiPrograms;
  const aiAt = (locator: OriginalAssetLocator) => at(RULE_DATA_ASSETS['ai-programs'], locator);
  // As the parser judges them, but on the region lengths before any region is read: the records the table can hold and
  // each name's bytes before its NUL.
  const records = Math.floor((executableRegion(ai.builtIn).length - 4) / AI_LAYOUT.programBytes);
  if (records > AI_PROGRAMS_LIMITS.programRecords) {
    throw new SourceError('limit-exceeded', `${aiAt(ai.builtIn)}/programs`, 'the structure exceeds its payload limit',
      { name: 'aiProgramRecords', limit: AI_PROGRAMS_LIMITS.programRecords, observed: records });
  }
  for (const locator of ai.builtInNames) {
    const observed = executableRegion(locator).length - 1;
    const limit = AI_PROGRAMS_LIMITS.programNameBytes;
    if (observed > limit) throw new SourceError('limit-exceeded', aiAt(locator), 'the text exceeds its payload limit', { name: 'textBytes', limit, observed });
  }
  const builtIn = await readFixedUp(ai.builtIn, aiAt(ai.builtIn));
  const builtInNames: AiRegionRead[] = [];
  for (const locator of ai.builtInNames) {
    const location = aiAt(locator);
    builtInNames.push({ region: executableRegion(locator), bytes: await readRegion(locator, location), location });
  }
  const entries = [];
  for (const locator of ai.entries) entries.push(await readEntry(locator));
  // The parser requires the given entries to be exactly those the ID chain names: a part more or less is a mismatch.
  const aiPrograms = parseAiPrograms(ai.globals.discPath, {
    globals: await readEntry(ai.globals),
    table: await readEntry(ai.table),
    entries,
    builtIn: { ...builtIn, location: aiAt(ai.builtIn) },
    builtInNames,
  }, sources.candidate.campaignGroup).content;

  const { table: repairTable } = parts.baseRepairItems;
  const baseRepairItems = parseBaseRepairItems(repairTable.discPath, await readEntry(repairTable));

  const reads: Partial<Record<keyof CommMenuReads, ArchiveEntryRead>> = {};
  for (const [key, locator] of Object.entries(parts.commMenus) as [keyof CommMenuReads, ArchiveEntryLocator][]) reads[key] = await readEntry(locator);
  const commMenus = parseCommMenus(parts.commMenus.gatedTargetCommands.discPath, reads as CommMenuReads);

  const { table: craftTable, craftInfo: craftInfoPart } = parts.craftInfo;
  const pair = parseCraftTable(craftTable.discPath, await readEntry(craftTable), sources.candidate);
  if (pair.craftInfoEntryId !== craftInfoPart.entry.id) {
    throw new SourceError('subresource-mismatch', at(RULE_DATA_ASSETS['craft-info'], craftTable), 'the selected pair names another craft info entry than the mapping');
  }
  const craftInfo = parseCraftInfo(craftInfoPart.discPath, await readEntry(craftInfoPart), pair.hitDamageScale);

  const { table: debrisTable } = parts.debrisParameters;
  const debrisParameters = parseDebrisParameters(debrisTable.discPath, await readEntry(debrisTable));

  const messageRegions = Object.fromEntries(Object.entries(parts.flightMessages)
    .map(([key, locator]) => [key, { locator, path: at(RULE_DATA_ASSETS['flight-messages'], locator) }])) as FlightMessageRegions;
  const flightMessages = await parseFlightMessages(messageRegions, readRegion);

  const comm = parts.commMessages;
  const readAll = async (locators: readonly ArchiveEntryLocator[]) => {
    const reads: ArchiveEntryRead[] = [];
    for (const locator of locators) reads.push(await readEntry(locator));
    return reads;
  };
  // The parser requires the given sub-tables and CMOVs to be exactly those the ID chain names.
  const commMessages = parseCommMessages(comm.direct.discPath, comm.names2001.discPath, {
    faceTables: await readAll(comm.faceTables),
    direct: await readEntry(comm.direct),
    subTables: await readAll(comm.subTables),
    messages: await readAll(comm.messages),
    names2001: await readEntry(comm.names2001),
    names2011: await readEntry(comm.names2011),
  });

  return {
    bound,
    payloads: [
      { role: 'ai-programs', content: aiPrograms },
      { role: 'base-repair-items', content: baseRepairItems },
      { role: 'comm-menus', content: commMenus },
      { role: 'comm-messages', content: commMessages },
      { role: 'craft-info', content: craftInfo },
      { role: 'debris-parameters', content: debrisParameters },
      { role: 'flight-messages', content: flightMessages },
    ],
  };
}

/**
 * Runs the rule-data conversion on `source`: the mappings built from `sources` are verified and their parts parsed
 * (`parseRuleData`), then each Asset is charged against `limits` on top of `usage`, the conversion usage of earlier
 * steps, before its payload is allocated. Only then are all mappings verified. Any failure rejects every Asset; reads
 * already issued stay charged to the source.
 */
export async function convertRuleData(
  source: VerifiedSource,
  limits: unknown,
  usage: unknown = EMPTY_BUDGET_USAGE,
  sources: RuleDataSources = PRODUCTION_RULE_DATA_SOURCES,
): Promise<RuleDataConversion> {
  const checkedLimits = readBudgetRecord(limits, 'limits');
  let current = readConversionUsage(usage);
  const { bound, payloads } = await parseRuleData(source, sources);
  const encoded = payloads.map(payload => {
    const asset = RULE_DATA_ASSETS[payload.role];
    const location = `sources.mappings[${bound.mappings.findIndex(mapping => mapping.asset.id === asset.id)}].parts[0].alternatives[0]`;
    // The byte length is charged before the bytes are allocated; a rejected charge changes no usage.
    const bytes = encodeRuleDataPayload(payload, payloadBytes => {
      current = chargeConversionBudget(checkedLimits, current, ruleDataIncrement(payloadBytes), location);
    });
    const schemaVersion = RULE_DATA_SCHEMA_VERSIONS[payload.role];
    const descriptor = {
      ...asset, role: payload.role, group: 'logic', dependencies: [],
      payloadIdentity: { schemaVersion, byteLength: bytes.length, fingerprint: sha256Fingerprint(bytes) },
    };
    return { descriptor, payload: { id: asset.id, schemaVersion, bytes } };
  });
  const assets = readAssetDescriptors(encoded.map(({ descriptor }) => descriptor), 'assets');
  assets.forEach((descriptor, index) => checkRuleDataBinding(descriptor, `assets[${index}]`));

  // Every part is now resolved: entries were read, sub-resources and regions parsed from the same reads.
  const verified = readSourceMappingTable({ ...bound, mappings: bound.mappings.map(mapping => ({ ...mapping, resolution: 'verified' })) });
  const partition: GroupDraft = Object.freeze({
    group: 'logic',
    assets,
    payloads: readPayloadRecords(encoded.map(({ payload }) => payload)),
    sources: assetSourceStates(verified),
  });
  return Object.freeze({ partition, usage: current });
}
