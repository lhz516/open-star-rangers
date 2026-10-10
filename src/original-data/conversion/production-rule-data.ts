import type { AssetReference } from '../../content/asset-contract.ts';
import { readAssetId, readAssetKind } from '../../content/asset-id.ts';
import { EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import { compareText } from '../../content/contract-validation.ts';
import type { CommMenus } from '../../content/rule-data/comm-menus.ts';
import type { FlightMessages } from '../../content/rule-data/flight-messages.ts';
import { RULE_DATA_ROLES, type RuleDataRole } from '../../content/rule-data/rule-data-payload.ts';
import { CLASSIC_P2_SLICE, type SliceCandidate } from '../../content/slice-definition.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import {
  compareLocators, readSourceMappingTable, type ArchiveEntryLocator, type ExecutableRegion, type ExecutableRegionLocator,
  type OriginalAssetLocator, type SourceConfidence, type SourceMappingTable,
} from '../source-mapping.ts';
import { objectOffset, PRODUCTION_EXECUTABLE } from './production-executable.ts';

// The production sources of the six rule-data Assets of the `logic` group (P3-03 spec, Asset 与角色 and 来源映射与核验),
// their source mapping table and the budget share they add. Entry IDs, addresses and lengths are structural facts of
// docs/original (craft.md, ai.md, comm.md, hud.md and executable.md); only they are here, never the bytes they hold.

/** The Asset of each rule-data role: `data/<role>`, a `data` Asset. */
export const RULE_DATA_ASSETS: Readonly<Record<RuleDataRole, AssetReference>> = Object.freeze(Object.fromEntries(
  RULE_DATA_ROLES.map(role => [role, Object.freeze({ id: readAssetId(`data/${role}`), kind: readAssetKind('data') })]),
) as Record<RuleDataRole, AssetReference>);

/**
 * The source parts of the rule-data Assets, by the role each plays in conversion. The converter reads exactly these and
 * builds the source mappings from them, so a mapping and its conversion cannot disagree.
 */
export interface RuleDataSources {
  /** The slice candidate whose selections the mappings record (field rule 7): TABL 4003's pair and the AICO group. */
  readonly candidate: SliceCandidate;
  /** TABL 4003 and the CINF entry its selected pair names, both in `archive`. */
  readonly craftInfo: { readonly archive: DiscPath; readonly table: number; readonly craftInfo: number };
  /** DEBRIS TABL 4501. */
  readonly debrisParameters: { readonly archive: DiscPath; readonly table: number };
  /**
   * AICO with the candidate group's triple, that group's program table and the DFPG and script TABL entries its ID chain
   * names, all in `archive`; then the EXE built-in table (its records and count word) and one region per name it points
   * to, each exactly the name and its NUL.
   */
  readonly aiPrograms: {
    readonly archive: DiscPath;
    readonly globals: number;
    readonly table: number;
    readonly parameters: readonly number[];
    readonly scripts: readonly number[];
    readonly builtIn: ExecutableRegion;
    readonly builtInNames: readonly ExecutableRegion[];
  };
  /** The five menu tables in `archive`, by the content key the selecting condition names. */
  readonly commMenus: { readonly archive: DiscPath; readonly tables: { readonly [K in keyof CommMenus]: number } };
  /** TABL 10165, read only for its records' subsystem selector field. */
  readonly baseRepairItems: { readonly archive: DiscPath; readonly table: number };
  /** One EXE region per message, each exactly the string and its NUL. */
  readonly flightMessages: { readonly [K in keyof FlightMessages]: ExecutableRegion };
}

/** TABL 4003's sub-resource: the pair of `candidate`, named as the SCCT slot is (row = slot, column = group). */
const craftTableSubresource = ({ campaignGroup, campaignSlot }: SliceCandidate): string => `group-${campaignGroup}/slot-${campaignSlot}`;
/** AICO's sub-resource: the triple of `candidate`'s difficulty group. */
const aiGroupSubresource = ({ campaignGroup }: SliceCandidate): string => `group-${campaignGroup}`;
/** TABL 10165's sub-resource: the subsystem selector field of its records (+0x6C). */
const BASE_REPAIR_SUBRESOURCE = 'records/subsystem-selector';

const entry = (discPath: DiscPath, id: number, type: string, subresource: string | null = null): ArchiveEntryLocator =>
  Object.freeze({ discPath, entry: Object.freeze({ id, type }), subresource });

const region = ({ object, offset, length }: ExecutableRegion): ExecutableRegionLocator =>
  Object.freeze({ discPath: PRODUCTION_EXECUTABLE as DiscPath, entry: null, subresource: `le/${object}/0x${offset.toString(16)}/${length}` });

const mapValues = <T, U>(record: T, map: (value: T[keyof T]) => U): { readonly [K in keyof T]: U } =>
  Object.freeze(Object.fromEntries(Object.entries(record as object).map(([key, value]) => [key, map(value as T[keyof T])]))) as { readonly [K in keyof T]: U };

/** The locators of `sources`' parts by the role the converter reads each in; the AI entries are the DFPGs, then the scripts. */
export function ruleDataLocators(sources: RuleDataSources) {
  const { candidate, craftInfo, debrisParameters, aiPrograms: ai, commMenus, baseRepairItems, flightMessages } = sources;
  return Object.freeze({
    craftInfo: Object.freeze({
      table: entry(craftInfo.archive, craftInfo.table, 'TABL', craftTableSubresource(candidate)),
      craftInfo: entry(craftInfo.archive, craftInfo.craftInfo, 'CINF'),
    }),
    debrisParameters: Object.freeze({ table: entry(debrisParameters.archive, debrisParameters.table, 'TABL') }),
    aiPrograms: Object.freeze({
      globals: entry(ai.archive, ai.globals, 'AICO', aiGroupSubresource(candidate)),
      table: entry(ai.archive, ai.table, 'TABL'),
      entries: Object.freeze([...ai.parameters.map(id => entry(ai.archive, id, 'DFPG')), ...ai.scripts.map(id => entry(ai.archive, id, 'TABL'))]),
      builtIn: region(ai.builtIn),
      builtInNames: Object.freeze(ai.builtInNames.map(region)),
    }),
    commMenus: mapValues(commMenus.tables, id => entry(commMenus.archive, id, 'TABL')),
    baseRepairItems: Object.freeze({ table: entry(baseRepairItems.archive, baseRepairItems.table, 'TABL', BASE_REPAIR_SUBRESOURCE) }),
    flightMessages: mapValues(flightMessages, region),
  });
}

export type RuleDataLocators = ReturnType<typeof ruleDataLocators>;

/** Research confidence, U items and evidence of each mapping (spec, Asset 与角色); only flight messages are confirmed. */
const MAPPING_FACTS: Readonly<Record<RuleDataRole, { readonly confidence: SourceConfidence; readonly unknowns: readonly string[]; readonly evidence: readonly string[] }>> = {
  'craft-info': {
    confidence: 'likely',
    unknowns: ['U-001', 'U-008', 'U-026'],
    evidence: [
      'docs/original/formats/craft.md#2-tabl-4003-confirmed',
      'docs/original/formats/craft.md#3-cinf',
      'docs/original/formats/scenario.md#difficulty-readers-p3-01',
    ],
  },
  'debris-parameters': { confidence: 'likely', unknowns: ['U-001', 'U-027'], evidence: ['docs/original/formats/craft.md#4-debris-tabl-4501'] },
  'ai-programs': {
    confidence: 'likely',
    unknowns: ['U-001', 'U-022'],
    evidence: [
      'docs/original/formats/ai.md#1-loading-the-id-chain-and-the-group-0-closure-confirmed',
      'docs/original/formats/ai.md#33-built-in-program-table-0x1762f8',
    ],
  },
  'comm-menus': {
    confidence: 'likely',
    unknowns: ['U-001'],
    evidence: ['docs/original/formats/comm.md#1-item-list-confirmed', 'docs/original/formats/comm.md#2-builders-and-selection-confirmed-code'],
  },
  'base-repair-items': {
    confidence: 'likely',
    unknowns: ['U-030'],
    evidence: ['docs/original/formats/hud.md#tabl-10165-selectors-and-tabl-10399-labels-p3-0304'],
  },
  'flight-messages': {
    confidence: 'confirmed',
    unknowns: [],
    evidence: ['docs/original/formats/executable.md#flight-message-strings-and-the-rens-header-p3-0304'],
  },
};

/** Every part of each role's Asset; a mapping lists them in canonical locator order. */
function partsOf(locators: RuleDataLocators): Readonly<Record<RuleDataRole, readonly OriginalAssetLocator[]>> {
  const { craftInfo, debrisParameters, aiPrograms: ai, commMenus, baseRepairItems, flightMessages } = locators;
  return {
    'craft-info': [craftInfo.table, craftInfo.craftInfo],
    'debris-parameters': [debrisParameters.table],
    'ai-programs': [ai.globals, ai.table, ...ai.entries, ai.builtIn, ...ai.builtInNames],
    'comm-menus': Object.values(commMenus),
    'base-repair-items': [baseRepairItems.table],
    'flight-messages': Object.values(flightMessages),
  };
}

/**
 * The declared source mapping table of `sources`, without a fingerprint until an import verifies it: one mapping per
 * rule-data Asset, in Asset ID order, with the confidence, U items and evidence of the spec's Asset table.
 */
export function ruleDataMappings(sources: RuleDataSources): SourceMappingTable {
  const parts = partsOf(ruleDataLocators(sources));
  return readSourceMappingTable({
    sourceFingerprint: null,
    mappings: [...RULE_DATA_ROLES].sort(compareText).map(role => ({
      asset: RULE_DATA_ASSETS[role],
      parts: [...parts[role]].sort(compareLocators).map(locator => ({ alternatives: [locator] })),
      ...MAPPING_FACTS[role],
      resolution: 'declared',
    })),
  });
}

/** A region of `length` bytes at a documented address (executable.md §4). */
const regionAt = (address: number, length: number): ExecutableRegion => Object.freeze({ ...objectOffset(address), length });

/**
 * The production sources: the slice candidate's selections (group 0, slot 1); TABL 4003 and CINF 4037 (craft.md §1–§2);
 * DEBRIS TABL 4501 (craft.md §4); AICO 6001, TABL 6003 and the 3 DFPGs and 22 scripts of the group-0 closure (ai.md §1),
 * the built-in table at `0x1762f8` with its count word and its 10 names (ai.md §3.3); the COMM tables by selecting
 * condition (comm.md §2); TABL 10165 (hud.md); and the seven flight message regions (executable.md, flight message
 * strings).
 */
export const PRODUCTION_RULE_DATA_SOURCES: RuleDataSources = Object.freeze({
  candidate: CLASSIC_P2_SLICE.candidate,
  craftInfo: Object.freeze({ archive: 'MAIN/CRAFT.NOB' as DiscPath, table: 4_003, craftInfo: 4_037 }),
  debrisParameters: Object.freeze({ archive: 'MAIN/DEBRIS.NOB' as DiscPath, table: 4_501 }),
  aiPrograms: Object.freeze({
    archive: 'MAIN/AISTUFF.NOB' as DiscPath,
    globals: 6_001,
    table: 6_003,
    parameters: Object.freeze([6_013, 6_025, 6_031]),
    scripts: Object.freeze([
      6_009, 6_011, 6_015, 6_017, 6_019, 6_021, 6_023, 6_027, 6_029, 6_033, 6_035, 6_037, 6_039, 6_041, 6_043, 6_045,
      6_051, 6_053, 6_055, 6_057, 6_059, 6_061,
    ]),
    builtIn: regionAt(0x17_62f8, 10 * 0x54 + 4),
    builtInNames: Object.freeze(([
      [0x17_22b4, 10], [0x17_22c0, 12], [0x17_22cc, 11], [0x17_22d8, 17], [0x17_22ec, 8],
      [0x17_22f4, 13], [0x17_2304, 5], [0x17_230c, 8], [0x17_2314, 8], [0x17_231c, 5],
    ] as const).map(([address, length]) => regionAt(address, length))),
  }),
  commMenus: Object.freeze({
    archive: 'MAIN/COMM.NOB' as DiscPath,
    tables: Object.freeze({ gatedTargetCommands: 2_003, otherTargetCommands: 2_005, categories: 2_007, objectListLastEntry: 2_009, kind2TargetCommands: 2_013 }),
  }),
  baseRepairItems: Object.freeze({ archive: 'MAIN/SR.NOB' as DiscPath, table: 10_165 }),
  flightMessages: Object.freeze({
    missionComplete: regionAt(0x17_106c, 40),
    beacon: regionAt(0x17_1094, 46),
    speedAssistOn: regionAt(0x17_0db8, 16),
    speedAssistOff: regionAt(0x17_0dc8, 17),
    joystickSensitivity1: regionAt(0x17_0ddc, 28),
    joystickSensitivity2: regionAt(0x17_0df8, 26),
    joystickSensitivity0: regionAt(0x17_0e14, 25),
  }),
});

/** The declared production mappings of the rule-data Assets. */
export const PRODUCTION_RULE_DATA_MAPPINGS: SourceMappingTable = ruleDataMappings(PRODUCTION_RULE_DATA_SOURCES);

/**
 * The budget share the rule-data Assets add to the logic step (spec, 限值与预算): twice each dimension of their conversion
 * usage on the baseline, rounded up to a power of two (observations in the P3-03/19 completion evidence).
 */
export const PRODUCTION_RULE_DATA_SHARE: BudgetRecord = Object.freeze({ ...EMPTY_BUDGET_USAGE, assets: 16, payloadBytes: 262_144 });
