import { addBudgets, EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import { readAiPrograms, type AiPrograms } from '../../content/rule-data/ai-programs.ts';
import { readBaseRepairItems } from '../../content/rule-data/base-repair-items.ts';
import { readCommMenus, type CommandItem, type CommMenus } from '../../content/rule-data/comm-menus.ts';
import { readCraftInfo } from '../../content/rule-data/craft-info.ts';
import { readDebrisParameters } from '../../content/rule-data/debris-parameters.ts';
import { readFlightMessages, type FlightMessages } from '../../content/rule-data/flight-messages.ts';
import { encodeRuleDataPayload, type RuleDataPayload } from '../../content/rule-data/rule-data-payload.ts';
import {
  builtInProgram, keyword, parameterEntry, script, scriptItem, syntheticAiPrograms, syntheticBaseRepairItems, tableProgram, text,
} from '../../content/rule-data/rule-data.test-support.ts';
import { CLASSIC_P2_SLICE } from '../../content/slice-definition.ts';
import { AI_LAYOUT } from '../formats/ai.ts';
import { SYNTHETIC_AI_IDS, syntheticAiSources, syntheticBuiltIn } from '../formats/ai.test-support.ts';
import { COMM_MENU_IDS, defaultCommMenus, syntheticCommTables } from '../formats/comm.test-support.ts';
import { generatedCommMessages, layoutCommFace } from '../formats/comm-face.test-support.ts';
import { craftTableCell, defaultCraftInfo, syntheticCraftInfoBlock, syntheticCraftTable } from '../formats/craft.test-support.ts';
import { defaultDebrisParameters, syntheticDebrisBlock } from '../formats/debris.test-support.ts';
import type { ExecutableRegion } from '../source-mapping.ts';
import { buildImfat, type SyntheticEntry } from '../synthetic.test-support.ts';
import { ruleDataIncrement } from './convert-rule-data.ts';
import type { PositionedFixup, RegionWrite } from './production-graphics.test-support.ts';
import { PRODUCTION_RULE_DATA_SOURCES } from './production-rule-data.ts';
import { baseRepairBlock, entryOf, type RuleDataContents } from './rule-data.test-support.ts';

// Code-generated sources of the seven rule-data Assets in the production structure, generated in code; never original
// data. The entries sit at the production entry IDs and the executable regions at the production addresses of
// `PRODUCTION_RULE_DATA_SOURCES`, so the production job converts them; their content is the format supports' made-up
// content, shaped only as far as the production plan requires: three table programs with a parameter entry each, the 22
// scripts they reach, ten built-in programs whose names fill the production name regions, flight messages that fill
// the production message regions, and communications messages whose 13 sub-tables and 481 CMOVs take the production IDs
// in a made-up assignment, and keyword tables of the production pair counts whose 14 distinct names fill the production
// name regions, the fourth table naming the first one's. Every archive also holds entries the plan does not name, and the disc a second face archive,
// which no job may read.

const PLAN = PRODUCTION_RULE_DATA_SOURCES;

/** Archive entries outside the production plan: another CINF, a script and a DFPG of other groups, and a COMM table. */
const DECOYS = Object.freeze({ craftInfo: 4_039, script: 6_047, parameters: 6_049, comm: Object.freeze([2_015]) });

/** The second face archive, which the production plan never reads (P3-10 D-03). */
export const COMMFAC2_NOB = 'MAIN/COMMFAC2.NOB';

/**
 * Script entries of varying shapes, made up, whose opcodes and arguments world creation supports (P3-02 CR-15), since
 * the synthetic mission reaches them: a test that branches over a wait, or a boolean test and a float action.
 */
const scripts = (count: number, seed: number) => Array.from({ length: count }, (_, index) => ((seed + index) % 2 === 0
  ? script([scriptItem(240, String(10 + index), 2), scriptItem(1_000, '[16 64]'), scriptItem(10_000)])
  : script([scriptItem(200, 'Y', 2), scriptItem(104, `0.${index + 1}`), scriptItem(10_000, '1')])));

/** A record every object of its kinds selects fully: any +0xDC is at most +0x0C, any |+0xE0| at least 0. */
const ALWAYS = Object.freeze({ at0C: 0x7fff_ffff, at10: 0 });
/** The wingman's and the bases' handler identities in LE object 2 (core/rules/ai-support.ts, AI_HANDLER_IDENTITIES). */
const WINGMAN_HANDLER = 0x41_0c8;
const BASE_HANDLER = 0x42_c10;

/**
 * AI programs whose three table programs each name their own parameter entry, which reaches its install script and its
 * state lists: 3 parameter entries and 22 scripts in first-reach order, as many as the production plan maps. Records 0
 * and 1 select kinds 0x80 and 0x100, record 2 kind 0x10, which the mission never instantiates. The ten built-in
 * programs' names are one byte shorter than the production name regions, which hold them with their NUL; records 4 and
 * 5 are the wingman's and record 6 the bases', with the handlers Core implements, as in the production table (ai.md
 * §10.3). Eight AICO elements cover the synthetic roster's +0x70 of 3 to 7.
 */
function productionAiPrograms(): AiPrograms {
  const plain = syntheticAiPrograms();
  plain.globals.elements = Array.from({ length: 8 }, (_, index) => [1 - index / 16, 0.5 + index / 32, 0, 0]);
  plain.programs = [
    tableProgram(0, { kindMask: 0x180, ...ALWAYS }), tableProgram(9, { kindMask: null, at2C: null }),
    tableProgram(17, { name: text(1), kindMask: 0x10 }),
  ];
  plain.entries = [
    parameterEntry(1, { state1: [2, 3], state2: [4], state3: [5, 2], state5: [6], state4: [7], state6: [8] }), ...scripts(8, 0),
    parameterEntry(10, { state1: [11, 12], state2: [13], state3: [14], state5: [15], state4: [16] }), ...scripts(7, 1),
    parameterEntry(18, { state1: [19, 20], state2: [21], state3: [22], state5: [23], state4: [24, 18] }), ...scripts(7, 0),
  ] as typeof plain.entries;
  const builtInRoles: Readonly<Record<number, Record<string, unknown>>> = {
    4: { kindMask: 0x2, ...ALWAYS }, 5: { kindMask: 0x2, ...ALWAYS }, 6: { kindMask: 0x20000, ...ALWAYS },
  };
  const handlerOf = (index: number) => (index === 4 || index === 5 ? WINGMAN_HANDLER : index === 6 ? BASE_HANDLER : 0x100 + index * 0x40);
  plain.builtInPrograms = PLAN.aiPrograms.builtInNames.map(({ length }, index) => builtInProgram(handlerOf(index), { name: text(length - 1), ...builtInRoles[index] }));
  const names = PLAN.aiPrograms.keywordNames.map(({ length }, index) => `${text(length - 2)}${String.fromCharCode(0x41 + index)}`);
  const [first, second, third] = keywordNameIndexes();
  const table = (indexes: readonly number[], seed: number) => indexes.map((name, index) => keyword(names[name], index === 1 ? -seed : seed + index));
  plain.keywordTables = [table(first, 0), table(second, 10), table(third, 20), table(first, 0)];
  return readAiPrograms(plain);
}

/**
 * The name region each pair of the first three production keyword tables names, in region order: the tables take the 14
 * regions in turn, as many as their pairs; the fourth table names the first one's.
 */
function keywordNameIndexes(): readonly (readonly number[])[] {
  let next = 0;
  return PLAN.aiPrograms.keywordTables.slice(0, 3).map(({ length }) => Array.from({ length: length / AI_LAYOUT.keywordEntryBytes - 1 }, () => next++));
}

/** Flight messages that fill the production message regions with their NULs. */
function productionFlightMessages(): FlightMessages {
  const keys = Object.keys(PLAN.flightMessages) as (keyof FlightMessages)[];
  return readFlightMessages(Object.fromEntries(keys.map((key, index) => [key, `${text(PLAN.flightMessages[key].length - 1).slice(0, -1)}${String.fromCharCode(0x41 + index)}`])));
}

/**
 * The format support's craft info, changed only so that world creation accepts it, as in Core's own synthetic craft
 * info: every record's +0x0C is 250, a positive modulus of the parked travel (P3-06 D-01); and the player's mount 1
 * fires together with mount 2 without also alternating, as a mount list entry has at most one of the two links, and
 * every gun's cooldown +0x14 is 7, within the 0 to 32 the parked engagement multiplies by (docs/plan/p3/02/spec.md,
 * CR-01 checks 4 and 5); and the player's +0xA8 is positive, which the Warp progress divides by (MW-01 check 4).
 * So that the app can complete a Warp (P3-09 AC-12), the player's energy capacity +0x54 is 100000 (100000 energy), its
 * one Warp cost pair charges 10 per 1000 units, and its transit +0xA8 is 14 s, as in Core's map and Warp chain. That
 * +0x54 is also non-negative, as P3-10's base energy rate requires (CB-01).
 */
function productionCraftInfo() {
  const info = defaultCraftInfo();
  const craft = info.craft.map(record => ({ ...record, at0C: 250 }));
  craft[0] = { ...craft[0], at54: 100_000, pairs: [{ at00: 1_000, at04: 10 }], atA8: 14, mounts: craft[0].mounts.map((mount, index) => (index === 1 ? { ...mount, at1C: null } : mount)) };
  return readCraftInfo({ ...info, craft, guns: info.guns.map(gun => ({ ...gun, at14: 7 })) });
}

/**
 * Part list 1's part count of the model each kind bit the slice disc's missions instantiate is bound to
 * (production-models.test-support.ts): the player and wingman share the player ship.
 */
const SLICE_MODEL_PARTS: Readonly<Record<number, number>> = Object.freeze({ 0: 1, 1: 1, 7: 1, 8: 0, 14: 0, 17: 0 });

/**
 * The format support's DEBRIS parameters, changed only so that world creation accepts them with the slice disc's models
 * (docs/plan/p3/02/spec.md, CR-01 check 2; craft.md §4.1): each instantiable kind keeps one record per part of its
 * model's part list 1, three fewer and at least none for kind bits 0 and 1, whose part 0 is the escape pod. Every
 * other kind keeps its records.
 */
function productionDebrisParameters() {
  const { byCraftType } = defaultDebrisParameters();
  return readDebrisParameters({
    byCraftType: byCraftType.map((records, kindBit) => {
      const parts = SLICE_MODEL_PARTS[kindBit];
      if (parts === undefined) return records;
      return records.slice(0, kindBit <= 1 ? Math.max(parts - 3, 0) : parts);
    }),
  });
}

/** Replaces byte 1, a menu item's key, keeping byte 0 and the rest. */
const keyed = (text: string, key: string): string => `${text.slice(0, 1) || '\x80'}${key}${text.slice(2)}`;

/**
 * The format support's made-up menus with keys world creation accepts (P3-02 CB-01 check 1): a command item's key is
 * its position, every exit's `x`.
 */
function productionCommMenus(): CommMenus {
  const menus = defaultCommMenus();
  const commands = (items: readonly CommandItem[]) => items.map(({ text, command }, index) => ({ text: keyed(text, command === 0 ? 'x' : String(index + 1)), command }));
  return readCommMenus({
    gatedTargetCommands: commands(menus.gatedTargetCommands),
    otherTargetCommands: commands(menus.otherTargetCommands),
    categories: menus.categories.map(({ text, kindMask }) => ({ text: kindMask === 0 ? keyed(text, 'x') : text, kindMask })),
    objectListLastEntry: keyed(menus.objectListLastEntry, 'x'),
    kind2TargetCommands: commands(menus.kind2TargetCommands),
  });
}

/** The format support's made-up selectors within the domain world creation accepts (CB-01 check 3): 19–31 become 18. */
const productionBaseRepairItems = () =>
  readBaseRepairItems({ subsystemSelectors: syntheticBaseRepairItems().subsystemSelectors.map((selector) => (selector > 18 && selector < 32 ? 18 : selector)) });

/** The canonical content of each rule-data role on the production structure. */
export function productionRuleDataContents(): RuleDataContents {
  return {
    'ai-programs': productionAiPrograms(),
    'base-repair-items': productionBaseRepairItems(),
    'comm-menus': productionCommMenus(),
    'craft-info': productionCraftInfo(),
    'debris-parameters': productionDebrisParameters(),
    'flight-messages': productionFlightMessages(),
    'comm-messages': generatedCommMessages(PLAN.commMessages.subTables.length, PLAN.commMessages.messages.length),
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
  /** The CRAFT, DEBRIS, AISTUFF, COMM, COMMFACE and COMMFAC2 archives by disc path. */
  readonly archives: Readonly<Record<string, Uint8Array>>;
  /** The `MAIN/SR.NOB` entry of the plan, TABL 10165, to add to that archive. */
  readonly srEntries: readonly SyntheticEntry[];
  /** The executable regions: the flight messages, the built-in table and its names, filler for the handler targets, and the keyword tables and their names. */
  readonly writes: readonly RegionWrite[];
  /** The built-in table's name and handler fixups, and the keyword tables' name fixups. */
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
  const comm = PLAN.commMessages;
  // The CMOV IDs in descending order, so the assignment of IDs to messages is made up.
  const face = layoutCommFace(contents['comm-messages'], { ...comm, messages: [...comm.messages].reverse() });
  const faceEntries = () => [...face.faceTables, face.direct, ...face.subTables, ...face.messages].map(entry => ({ ...entry }));
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
      face.names2001, face.names2011,
    ]),
    [comm.archive]: archive(faceEntries()),
    [COMMFAC2_NOB]: archive(faceEntries()),
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
  // The keyword tables at their production regions, each pair naming the production region of its name.
  const keywordNameAt = new Map<string, ExecutableRegion>();
  const keywordWrites: RegionWrite[] = [];
  const keywordFixups: PositionedFixup[] = [];
  contents['ai-programs'].keywordTables.forEach((entries, index) => {
    const region = PLAN.aiPrograms.keywordTables[index];
    const bytes = new Uint8Array(region.length);
    entries.forEach(({ name, value }, pair) => {
      const target = keywordNameAt.get(name) ?? PLAN.aiPrograms.keywordNames[keywordNameAt.size];
      if (!keywordNameAt.has(name)) {
        keywordNameAt.set(name, target);
        keywordWrites.push({ object: target.object, offset: target.offset, bytes: regionText(name) });
      }
      word(bytes).setUint32(pair * AI_LAYOUT.keywordEntryBytes, target.offset, true);
      word(bytes).setInt32(pair * AI_LAYOUT.keywordEntryBytes + 4, value, true);
      keywordFixups.push({ object: region.object, offset: region.offset + pair * AI_LAYOUT.keywordEntryBytes, target: { object: target.object, offset: target.offset } });
    });
    keywordWrites.push({ object: region.object, offset: region.offset, bytes });
  });
  if (keywordNameAt.size !== PLAN.aiPrograms.keywordNames.length) throw new Error('the keyword names do not fill the production name regions');
  const handlersEnd = Math.max(...contents['ai-programs'].builtInPrograms.map(({ handler }) => handler.offset)) + 4;
  const messages = contents['flight-messages'];
  const writes: RegionWrite[] = [
    { object: PLAN.aiPrograms.builtIn.object, offset: PLAN.aiPrograms.builtIn.offset, bytes: table },
    ...contents['ai-programs'].builtInPrograms.map(({ name }, index) => ({ object: names[index].object, offset: names[index].offset, bytes: regionText(name) })),
    ...(Object.keys(messages) as (keyof FlightMessages)[]).map(key => ({ ...PLAN.flightMessages[key], bytes: regionText(messages[key]) })),
    // The handler targets lie in object 2; a fixup must target a position inside its object. Only the object's end is
    // written, so the regions of other Assets in object 2 keep their bytes.
    { object: 2, offset: handlersEnd - 4, bytes: new Uint8Array(4).fill(0xcc) },
    ...keywordWrites,
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
    fixups: [...fixups, ...keywordFixups],
    usage,
  };
}
