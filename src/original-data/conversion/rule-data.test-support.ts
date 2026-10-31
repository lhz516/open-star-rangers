import type { AiPrograms } from '../../content/rule-data/ai-programs.ts';
import { readBaseRepairItems } from '../../content/rule-data/base-repair-items.ts';
import { readFlightMessages } from '../../content/rule-data/flight-messages.ts';
import type { RuleDataPayload, RuleDataRole } from '../../content/rule-data/rule-data-payload.ts';
import {
  builtInProgram, syntheticAiPrograms, syntheticBaseRepairItems, syntheticFlightMessages, text,
} from '../../content/rule-data/rule-data.test-support.ts';
import { CLASSIC_P2_SLICE } from '../../content/slice-definition.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import { AI_LAYOUT } from '../formats/ai.ts';
import { aiContent, syntheticAiSources, syntheticBuiltIn, syntheticKeywordTables, type SyntheticKeywordTables } from '../formats/ai.test-support.ts';
import type { RegionFixup } from '../formats/le-executable.ts';
import { BASE_REPAIR_RECORD } from '../formats/base-repair.ts';
import { COMM_MENU_IDS, COMM_NOB, defaultCommMenus, syntheticCommTables } from '../formats/comm.test-support.ts';
import { COMMFACE_NOB, defaultCommMessages, syntheticCommFace } from '../formats/comm-face.test-support.ts';
import { CRAFT_NOB, craftTableCell, defaultCraftInfo, syntheticCraftInfoBlock, syntheticCraftTable } from '../formats/craft.test-support.ts';
import { DEBRIS_NOB, defaultDebrisParameters, syntheticDebrisBlock } from '../formats/debris.test-support.ts';
import type { SyntheticBlock } from '../formats/formats.test-support.ts';
import type { ExecutableRegion } from '../source-mapping.ts';
import { buildImfat, internalOffsetFixupRecord, syntheticLeExecutable, type SyntheticEntry } from '../synthetic.test-support.ts';
import { PRODUCTION_EXECUTABLE } from './production-executable.ts';
import type { RuleDataSources } from './production-rule-data.ts';

// Code-generated synthetic archives and an LE executable holding the seven rule-data Assets' sources, with the mapping
// plan that names them, for P3-03 conversion tests. They never hold original data: their entry IDs, offsets and values are
// arbitrary synthetic ones (only the COMM menu table IDs are the comm support's), and texts carry the content support's
// MARKER. Every archive also holds entries no mapping names, and the disc a second face archive, which a conversion must
// never read.

export { MARKER } from '../../content/rule-data/rule-data.test-support.ts';

export const AISTUFF_NOB = 'MAIN/AISTUFF.NOB' as DiscPath;
export const SR_NOB = 'MAIN/SR.NOB' as DiscPath;
export const EXECUTABLE = PRODUCTION_EXECUTABLE as DiscPath;
/** The second face archive, which the conversion never reads (P3-10 D-03). */
export const COMMFAC2_NOB = 'MAIN/COMMFAC2.NOB' as DiscPath;

/** Synthetic entry IDs of the mapped entries and of the decoys beside them. */
export const SYNTHETIC_RULE_DATA_IDS = Object.freeze({
  craftTable: 5_003,
  craftInfo: 5_037,
  /** A second CINF in the craft archive, which no pair of the slice candidate names. */
  otherCraftInfo: 5_039,
  debris: 5_501,
  /** A script and a DFPG in the AI archive outside the ID chain. */
  aiDecoyScript: 7_301,
  aiDecoyParameters: 7_303,
  /** COMM tables no mapping names. */
  commDecoys: Object.freeze([2_015, 2_017]),
  /** A COMMFACE TABL and CMOV no table names. */
  faceDecoyTable: 31_301,
  faceDecoyMessage: 31_303,
  baseRepair: 11_165,
  srDecoy: 11_167,
});

/** The canonical content of each rule-data role. */
export type RuleDataContents = { readonly [R in RuleDataRole]: Extract<RuleDataPayload, { readonly role: R }>['content'] };

/** The format supports' default contents; the built-in programs' handlers lie in the synthetic handler object. */
export function defaultRuleDataContents(): RuleDataContents {
  const ai = syntheticAiPrograms();
  ai.builtInPrograms = [builtInProgram(0x100), builtInProgram(0x2f0, { name: text(4) }), builtInProgram(0x18, { name: text(1) })];
  return {
    'ai-programs': aiContent(ai),
    'base-repair-items': readBaseRepairItems(syntheticBaseRepairItems()),
    'comm-menus': defaultCommMenus(),
    'craft-info': defaultCraftInfo(),
    'debris-parameters': defaultDebrisParameters(),
    'flight-messages': readFlightMessages(syntheticFlightMessages()),
    'comm-messages': defaultCommMessages(),
  };
}

/** Synthetic sources: each archive's entries, which a test may change before building files, and the executable. */
export interface SyntheticRuleData {
  readonly contents: RuleDataContents;
  readonly sources: RuleDataSources;
  readonly archives: Record<string, SyntheticEntry[]>;
  readonly executable: Uint8Array;
}

/** The archive entry `id` of type `type` holding `block`. */
export const entryOf = (id: number, type: string, { bytes, relocations }: SyntheticBlock): SyntheticEntry => ({ id, type, data: bytes, relocations });

/** TABL 10165: one 0x7C-byte record per selector over filler, with two image pointers to the trailing data, then that data. */
export function baseRepairBlock(selectors: readonly number[]): SyntheticBlock {
  const recordsEnd = selectors.length * BASE_REPAIR_RECORD.bytes;
  const bytes = Uint8Array.from({ length: recordsEnd + 64 }, (_, index) => ((index * 29) % 255) + 1);
  const view = new DataView(bytes.buffer);
  const relocations = selectors.flatMap((_, index) => [0x5c, 0x14].map(offset => index * BASE_REPAIR_RECORD.bytes + offset));
  for (const at of relocations) view.setUint32(at, recordsEnd + 1, true);
  selectors.forEach((selector, index) => view.setUint32(index * BASE_REPAIR_RECORD.bytes + BASE_REPAIR_RECORD.selector, selector, true));
  return { bytes, relocations };
}

/** Object 1: non-zero filler with each string and its NUL at an odd offset. Returns the object and each string's region. */
function messageObject(strings: readonly string[]): { readonly bytes: Uint8Array; readonly regions: readonly ExecutableRegion[] } {
  const bytes = Uint8Array.from({ length: 1_024 }, (_, index) => ((index * 7) % 255) + 1);
  let at = 33;
  const regions = strings.map(string => {
    const offset = at;
    bytes.set(Array.from(string, character => character.charCodeAt(0)), offset);
    bytes[offset + string.length] = 0;
    // The NUL, at least one filler byte, and the next string again at an odd offset.
    at = offset + string.length + 2 + (1 - ((offset + string.length) % 2));
    return Object.freeze({ object: 1, offset, length: string.length + 1 });
  });
  return { bytes, regions };
}

const LE_PAGE = 4_096;

/** Adds the fixup records of `regionFixups`, patching a region at `regionAt` of the object whose first page is `firstPage`. */
function recordFixups(records: Record<number, number[]>, firstPage: number, regionAt: number, regionFixups: readonly RegionFixup[]): void {
  for (const { at, ...target } of regionFixups) {
    const position = regionAt + at;
    const page = Math.floor(position / LE_PAGE);
    for (const recorded of position + 4 > (page + 1) * LE_PAGE ? [page, page + 1] : [page]) {
      (records[firstPage + recorded] ??= []).push(...internalOffsetFixupRecord(position - recorded * LE_PAGE, target));
    }
  }
}

/** Where the keyword tables start in object 2, after the handler targets, at an odd offset. */
const KEYWORD_TABLES_AT = 0x31b;

/**
 * The LE file: object 1 the flight messages, object 2 the handler targets and then the keyword tables, object 3 the
 * built-in names and object 4 the built-in table, placed so that a fixup crosses a page boundary, followed by the
 * keyword names. Objects 1–3 take one page each. `changeKeywords` may change the keyword tables before they are written.
 */
function syntheticExecutable({ builtInPrograms, keywordTables }: AiPrograms, messages: readonly string[], changeKeywords?: (keywords: SyntheticKeywordTables) => void) {
  // The names are consecutive regions in object 3.
  const builtIn = syntheticBuiltIn(builtInPrograms);
  const namesEnd = builtIn.names.reduce((end, { region }) => Math.max(end, region.offset + region.length), 0);
  const names = Uint8Array.from({ length: namesEnd + 5 }, (_, index) => (index % 200) + 3);
  for (const { region, bytes } of builtIn.names) names.set(bytes, region.offset);
  const tableAt = LE_PAGE - AI_LAYOUT.programBytes - 2;
  const builtInEnd = tableAt + builtIn.bytes.length + 9;
  const keywords = syntheticKeywordTables(keywordTables, { object: 2, offset: KEYWORD_TABLES_AT }, { object: 4, offset: builtInEnd + 3 });
  changeKeywords?.(keywords);
  const keywordNamesEnd = keywords.names.reduce((end, { region }) => Math.max(end, region.offset + region.length), 0);
  const table = Uint8Array.from({ length: keywordNamesEnd + 6 }, (_, index) => ((index * 3) & 0xff) || 1);
  table.set(builtIn.bytes, tableAt);
  for (const { region, bytes } of keywords.names) table.set(bytes, region.offset);
  const keywordEnd = keywords.tables.reduce((end, { region }) => Math.max(end, region.offset + region.length), 0);
  const handlers = new Uint8Array(keywordEnd + 5).fill(0xcc);
  for (const { region, bytes } of keywords.tables) handlers.set(bytes, region.offset);
  const fixups: Record<number, number[]> = {};
  recordFixups(fixups, 4, tableAt, builtIn.fixups);
  for (const { region, fixups: tableFixups } of keywords.tables) recordFixups(fixups, 2, region.offset, tableFixups);
  const message = messageObject(messages);
  const file = syntheticLeExecutable({
    objects: [{ bytes: message.bytes }, { bytes: handlers }, { bytes: names }, { bytes: table }],
    fixups,
  });
  return {
    file,
    builtIn: Object.freeze({ object: 4, offset: tableAt, length: builtIn.bytes.length }),
    names: builtIn.names.map(({ region }) => Object.freeze(region)),
    keywordTables: Object.freeze(keywords.tables.map(({ region }) => Object.freeze(region))) as RuleDataSources['aiPrograms']['keywordTables'],
    keywordNames: keywords.names.map(({ region }) => Object.freeze(region)),
    messages: message.regions,
  };
}

/**
 * The synthetic sources of `contents`, mapped by a plan of synthetic IDs and regions for the slice candidate.
 * `changeKeywords` may change the executable's keyword tables before they are written.
 */
export function syntheticRuleData(
  contents: RuleDataContents = defaultRuleDataContents(), changeKeywords?: (keywords: SyntheticKeywordTables) => void,
): SyntheticRuleData {
  const ids = SYNTHETIC_RULE_DATA_IDS;
  const { campaignGroup, campaignSlot } = CLASSIC_P2_SLICE.candidate;
  const { hitDamageScale, ...info } = contents['craft-info'];
  const craftTable = syntheticCraftTable((row, pair) => (row === campaignSlot && pair === campaignGroup ? [ids.craftInfo, hitDamageScale] : craftTableCell(row, pair)));
  const craftInfo = syntheticCraftInfoBlock(info);

  const ai = syntheticAiSources(contents['ai-programs']);
  const decoyScript = ai.entries.find(({ type }) => type === 'TABL')!.block;
  const decoyParameters = ai.entries.find(({ type }) => type === 'DFPG')!.block;

  const commTables = syntheticCommTables(contents['comm-menus']);
  const face = syntheticCommFace(contents['comm-messages']);
  const messages = contents['flight-messages'];
  const messageKeys = Object.keys(messages) as (keyof typeof messages)[];
  const executable = syntheticExecutable(contents['ai-programs'], messageKeys.map(key => messages[key]), changeKeywords);

  const sources: RuleDataSources = {
    candidate: CLASSIC_P2_SLICE.candidate,
    craftInfo: { archive: CRAFT_NOB, table: ids.craftTable, craftInfo: ids.craftInfo },
    debrisParameters: { archive: DEBRIS_NOB, table: ids.debris },
    aiPrograms: {
      archive: AISTUFF_NOB,
      globals: ai.globals.id,
      table: ai.table.id,
      parameters: ai.entries.filter(({ type }) => type === 'DFPG').map(({ id }) => id),
      scripts: ai.entries.filter(({ type }) => type === 'TABL').map(({ id }) => id),
      builtIn: executable.builtIn,
      builtInNames: executable.names,
      keywordTables: executable.keywordTables,
      keywordNames: executable.keywordNames,
    },
    commMenus: { archive: COMM_NOB, tables: COMM_MENU_IDS },
    baseRepairItems: { archive: SR_NOB, table: ids.baseRepair },
    flightMessages: Object.fromEntries(messageKeys.map((key, index) => [key, executable.messages[index]])) as RuleDataSources['flightMessages'],
    commMessages: {
      archive: COMMFACE_NOB,
      faceTables: face.ids.faceTables,
      direct: face.ids.direct,
      subTables: face.ids.subTables,
      messages: face.ids.messages,
      namesArchive: COMM_NOB,
      names2001: face.ids.names2001,
      names2011: face.ids.names2011,
    },
  };
  const faceEntries = [...face.faceTables, face.direct, ...face.subTables, ...face.messages];
  const archives: Record<string, SyntheticEntry[]> = {
    [CRAFT_NOB]: [
      entryOf(ids.craftTable, 'TABL', craftTable), entryOf(ids.craftInfo, 'CINF', craftInfo), entryOf(ids.otherCraftInfo, 'CINF', craftInfo),
    ],
    [DEBRIS_NOB]: [entryOf(ids.debris, 'TABL', syntheticDebrisBlock(contents['debris-parameters']))],
    [AISTUFF_NOB]: [
      entryOf(ai.globals.id, 'AICO', ai.globals.block), entryOf(ai.table.id, 'TABL', ai.table.block),
      ...ai.entries.map(({ id, type, block }) => entryOf(id, type, block)),
      entryOf(ids.aiDecoyScript, 'TABL', decoyScript), entryOf(ids.aiDecoyParameters, 'DFPG', decoyParameters),
    ],
    [COMM_NOB]: [
      ...(Object.keys(COMM_MENU_IDS) as (keyof typeof COMM_MENU_IDS)[]).map(key => entryOf(COMM_MENU_IDS[key], 'TABL', commTables[key])),
      ...ids.commDecoys.map(id => entryOf(id, 'TABL', commTables.categories)),
      face.names2001, face.names2011,
    ],
    [COMMFACE_NOB]: [
      ...faceEntries,
      { ...face.subTables[0], id: ids.faceDecoyTable }, { ...face.messages[0], id: ids.faceDecoyMessage },
    ],
    // Every entry of the face archive again: a conversion that read it would find the same structure.
    [COMMFAC2_NOB]: faceEntries.map(entry => ({ ...entry })),
    [SR_NOB]: [
      entryOf(ids.baseRepair, 'TABL', baseRepairBlock(contents['base-repair-items'].subsystemSelectors)),
      entryOf(ids.srDecoy, 'TABL', baseRepairBlock([1, 2, 3])),
    ],
  };
  return { contents, sources, archives, executable: executable.file };
}

/** The disc files of synthetic sources: each archive with its entries in ascending ID order, and the executable. */
export function ruleDataFiles({ archives, executable }: Pick<SyntheticRuleData, 'archives' | 'executable'>): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = { [EXECUTABLE]: executable };
  for (const [path, entries] of Object.entries(archives)) files[path] = buildImfat(0, [...entries].sort((left, right) => left.id - right.id));
  return files;
}
