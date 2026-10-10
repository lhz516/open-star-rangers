import { addBudgets, EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import { readAiPrograms, type AiPrograms } from '../../content/rule-data/ai-programs.ts';
import { readBaseRepairItems } from '../../content/rule-data/base-repair-items.ts';
import { readFlightMessages, type FlightMessages } from '../../content/rule-data/flight-messages.ts';
import { encodeRuleDataPayload, type RuleDataPayload } from '../../content/rule-data/rule-data-payload.ts';
import {
  builtInProgram, parameterEntry, script, scriptItem, syntheticAiPrograms, syntheticBaseRepairItems, tableProgram, text,
} from '../../content/rule-data/rule-data.test-support.ts';
import { CLASSIC_P2_SLICE } from '../../content/slice-definition.ts';
import { AI_LAYOUT } from '../formats/ai.ts';
import { SYNTHETIC_AI_IDS, syntheticAiSources, syntheticBuiltIn } from '../formats/ai.test-support.ts';
import { COMM_MENU_IDS, defaultCommMenus, syntheticCommTables } from '../formats/comm.test-support.ts';
import { craftTableCell, defaultCraftInfo, syntheticCraftInfoBlock, syntheticCraftTable } from '../formats/craft.test-support.ts';
import { defaultDebrisParameters, syntheticDebrisBlock } from '../formats/debris.test-support.ts';
import { buildImfat, type SyntheticEntry } from '../synthetic.test-support.ts';
import { ruleDataIncrement } from './convert-rule-data.ts';
import type { PositionedFixup, RegionWrite } from './production-graphics.test-support.ts';
import { PRODUCTION_RULE_DATA_SOURCES } from './production-rule-data.ts';
import { baseRepairBlock, entryOf, type RuleDataContents } from './rule-data.test-support.ts';

// Code-generated sources of the six rule-data Assets in the production structure, generated in code; never original
// data. The entries sit at the production entry IDs and the executable regions at the production addresses of
// `PRODUCTION_RULE_DATA_SOURCES`, so the production job converts them; their content is the format supports' made-up
// content, shaped only as far as the production plan requires: three table programs with a parameter entry each, the 22
// scripts they reach, ten built-in programs whose names fill the production name regions, and flight messages that fill
// the production message regions. Every archive also holds entries the plan does not name, which no job may read.

const PLAN = PRODUCTION_RULE_DATA_SOURCES;

/** Archive entries outside the production plan: another CINF, a script and a DFPG of other groups, and COMM tables of G-03. */
const DECOYS = Object.freeze({ craftInfo: 4_039, script: 6_047, parameters: 6_049, comm: Object.freeze([2_001, 2_011]) });

/** Script entries of varying shapes, made up. */
const scripts = (count: number, seed: number) => Array.from({ length: count }, (_, index) => ((seed + index) % 2 === 0
  ? script()
  : script([scriptItem(1_101, text(2 + index)), scriptItem(10_000, text(1))])));

/**
 * AI programs whose three table programs each name their own parameter entry, which reaches its install script and its
 * state lists: 3 parameter entries and 22 scripts in first-reach order, as many as the production plan maps. The ten
 * built-in programs' names are one byte shorter than the production name regions, which hold them with their NUL.
 */
function productionAiPrograms(): AiPrograms {
  const plain = syntheticAiPrograms();
  plain.programs = [tableProgram(0), tableProgram(9, { kindMask: null, at2C: null }), tableProgram(17, { name: text(1) })];
  plain.entries = [
    parameterEntry(1, { state1: [2, 3], state2: [4], state3: [5, 2], state5: [6], state4: [7], state6: [8] }), ...scripts(8, 0),
    parameterEntry(10, { state1: [11, 12], state2: [13], state3: [14], state5: [15], state4: [16] }), ...scripts(7, 1),
    parameterEntry(18, { state1: [19, 20], state2: [21], state3: [22], state5: [23], state4: [24, 18] }), ...scripts(7, 0),
  ] as typeof plain.entries;
  plain.builtInPrograms = PLAN.aiPrograms.builtInNames.map(({ length }, index) => builtInProgram(0x100 + index * 0x40, { name: text(length - 1) }));
  return readAiPrograms(plain);
}

/** Flight messages that fill the production message regions with their NULs. */
function productionFlightMessages(): FlightMessages {
  const keys = Object.keys(PLAN.flightMessages) as (keyof FlightMessages)[];
  return readFlightMessages(Object.fromEntries(keys.map((key, index) => [key, `${text(PLAN.flightMessages[key].length - 1).slice(0, -1)}${String.fromCharCode(0x41 + index)}`])));
}

/** The canonical content of each rule-data role on the production structure. */
export function productionRuleDataContents(): RuleDataContents {
  return {
    'ai-programs': productionAiPrograms(),
    'base-repair-items': readBaseRepairItems(syntheticBaseRepairItems()),
    'comm-menus': defaultCommMenus(),
    'craft-info': defaultCraftInfo(),
    'debris-parameters': defaultDebrisParameters(),
    'flight-messages': productionFlightMessages(),
  };
}

const word = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/**
 * The AISTUFF entries of `content` at the production IDs: the format support lays them out with its synthetic IDs, and
 * every entry ID they store (a program's +0x1C, a DFPG's install script at +0x38 and its six script lists from +0x3C,
 * ai.md §3.2 and §4) is rewritten to the production ID of the same entry.
 */
function productionAiEntries(content: AiPrograms): SyntheticEntry[] {
  const sources = syntheticAiSources(content);
  const parameters = [...PLAN.aiPrograms.parameters];
  const scriptIds = [...PLAN.aiPrograms.scripts];
  const ids = content.entries.map(({ kind }) => (kind === 'parameters' ? parameters.shift()! : scriptIds.shift()!));
  const production = (synthetic: number) => ids[(synthetic - SYNTHETIC_AI_IDS.entries) / 2];
  const rewrite = (bytes: Uint8Array, at: number) => word(bytes).setUint32(at, production(word(bytes).getUint32(at, true)), true);
  const table = sources.table.block;
  content.programs.forEach((_, index) => rewrite(table.bytes, index * AI_LAYOUT.programBytes + 0x1c));
  const entries = sources.entries.map(({ type, block }, index) => {
    if (type === 'DFPG') {
      const view = word(block.bytes);
      if (view.getUint32(0x38, true) !== 0) rewrite(block.bytes, 0x38);
      for (let list = 0; list < 6; list++) {
        const header = 0x3c + list * 8;
        const count = view.getUint32(header + 4, true);
        for (let item = 0; item < count; item++) rewrite(block.bytes, view.getUint32(header, true) + item * 4);
      }
    }
    return entryOf(ids[index], type, block);
  });
  const decoyScript = sources.entries.find(({ type }) => type === 'TABL')!.block;
  const decoyParameters = sources.entries.find(({ type }) => type === 'DFPG')!.block;
  return [
    entryOf(PLAN.aiPrograms.globals, 'AICO', sources.globals.block), entryOf(PLAN.aiPrograms.table, 'TABL', table), ...entries,
    entryOf(DECOYS.script, 'TABL', decoyScript), entryOf(DECOYS.parameters, 'DFPG', decoyParameters),
  ];
}

/** The text of a region: its bytes and NUL. */
const regionText = (value: string): Uint8Array => Uint8Array.from(`${value}\0`, character => character.charCodeAt(0));

/** Rule-data sources in the production structure. */
export interface ProductionRuleData {
  readonly contents: RuleDataContents;
  /** The CRAFT, DEBRIS, AISTUFF and COMM archives by disc path. */
  readonly archives: Readonly<Record<string, Uint8Array>>;
  /** The `MAIN/SR.NOB` entry of the plan, TABL 10165, to add to that archive. */
  readonly srEntries: readonly SyntheticEntry[];
  /** The executable regions: the flight messages, the built-in table and its names, and filler for the handler targets. */
  readonly writes: readonly RegionWrite[];
  /** The built-in table's name and handler fixups. */
  readonly fixups: readonly PositionedFixup[];
  /** The rule-data conversion's usage on these sources. */
  readonly usage: BudgetRecord;
}

let defaults: ProductionRuleData | undefined;

/** The production-structure sources of `contents`; the default sources are built once and must not be changed. */
export function productionRuleData(contents?: RuleDataContents): ProductionRuleData {
  return contents === undefined ? (defaults ??= buildRuleData(productionRuleDataContents())) : buildRuleData(contents);
}

function buildRuleData(contents: RuleDataContents): ProductionRuleData {
  const { campaignGroup, campaignSlot } = CLASSIC_P2_SLICE.candidate;
  const { hitDamageScale, ...info } = contents['craft-info'];
  const craftTable = syntheticCraftTable((row, pair) => (row === campaignSlot && pair === campaignGroup ? [PLAN.craftInfo.craftInfo, hitDamageScale] : craftTableCell(row, pair)));
  const craftInfo = syntheticCraftInfoBlock(info);
  const commTables = syntheticCommTables(contents['comm-menus']);
  const archive = (entries: SyntheticEntry[]) => buildImfat(0, entries.sort((left, right) => left.id - right.id));
  const archives = {
    [PLAN.craftInfo.archive]: archive([
      entryOf(PLAN.craftInfo.table, 'TABL', craftTable), entryOf(PLAN.craftInfo.craftInfo, 'CINF', craftInfo), entryOf(DECOYS.craftInfo, 'CINF', craftInfo),
    ]),
    [PLAN.debrisParameters.archive]: archive([entryOf(PLAN.debrisParameters.table, 'TABL', syntheticDebrisBlock(contents['debris-parameters']))]),
    [PLAN.aiPrograms.archive]: archive(productionAiEntries(contents['ai-programs'])),
    [PLAN.commMenus.archive]: archive([
      ...(Object.keys(COMM_MENU_IDS) as (keyof typeof COMM_MENU_IDS)[]).map(key => entryOf(PLAN.commMenus.tables[key], 'TABL', commTables[key])),
      ...DECOYS.comm.map(id => entryOf(id, 'TABL', commTables.categories)),
    ]),
  };

  // The built-in table at its production region, each name at its production region and each name fixup retargeted.
  const builtIn = syntheticBuiltIn(contents['ai-programs'].builtInPrograms);
  const names = PLAN.aiPrograms.builtInNames;
  const table = builtIn.bytes.slice();
  names.forEach(({ offset }, index) => word(table).setUint32(index * AI_LAYOUT.programBytes, offset, true));
  const fixups = builtIn.fixups.map(({ at, object, offset }): PositionedFixup => {
    const name = at % AI_LAYOUT.programBytes === 0 ? names[at / AI_LAYOUT.programBytes] : null;
    const target: PositionedFixup['target'] = name ?? { object, offset };
    return { object: PLAN.aiPrograms.builtIn.object, offset: PLAN.aiPrograms.builtIn.offset + at, target: { object: target.object, offset: target.offset } };
  });
  const handlersEnd = Math.max(...contents['ai-programs'].builtInPrograms.map(({ handler }) => handler.offset)) + 4;
  const messages = contents['flight-messages'];
  const writes: RegionWrite[] = [
    { object: PLAN.aiPrograms.builtIn.object, offset: PLAN.aiPrograms.builtIn.offset, bytes: table },
    ...contents['ai-programs'].builtInPrograms.map(({ name }, index) => ({ object: names[index].object, offset: names[index].offset, bytes: regionText(name) })),
    ...(Object.keys(messages) as (keyof FlightMessages)[]).map(key => ({ ...PLAN.flightMessages[key], bytes: regionText(messages[key]) })),
    // The handler targets lie in object 2; a fixup must target a position inside its object.
    { object: 2, offset: 0, bytes: new Uint8Array(handlersEnd).fill(0xcc) },
  ];

  const usage = (Object.entries(contents) as [RuleDataPayload['role'], unknown][]).reduce(
    (total, [role, content]) => addBudgets(total, { ...EMPTY_BUDGET_USAGE, ...ruleDataIncrement(encodeRuleDataPayload({ role, content } as RuleDataPayload).length) }, 'usage'),
    EMPTY_BUDGET_USAGE,
  );
  return {
    contents,
    archives,
    srEntries: [entryOf(PLAN.baseRepairItems.table, 'TABL', baseRepairBlock(contents['base-repair-items'].subsystemSelectors))],
    writes,
    fixups,
    usage,
  };
}
