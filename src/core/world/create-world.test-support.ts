import { readAssetId } from '../../content/asset-id.ts';
import { readContentIdentity } from '../../content/content-identity.ts';
import { compareText } from '../../content/contract-validation.ts';
import { declaration, LOGIC_IDS, MARKER, ruleInputs, syntheticMission } from '../../content/logic/logic-content.test-support.ts';
import {
  builtInProgram, parameterEntry, script, scriptItem, syntheticAiPrograms, syntheticCraftInfo, syntheticDebrisParameters, tableProgram,
} from '../../content/rule-data/rule-data.test-support.ts';
import { syntheticIdentity } from '../../content/synthetic-content.test-support.ts';
import { loadMission } from '../mission/load-mission.ts';
import { RandStream } from '../rules/original-random.ts';
import { buildSpawnState, PLAYER_KIND_BIT, WINGMAN_KIND_BIT } from '../rules/spawn-schedule.ts';
import type { CreateWorldInput } from './create-world.ts';
import { PRODUCTION_CRAFT_INFO } from './craft-info-input.ts';
import { PRODUCTION_RULE_DATA, transponderModel } from './rule-data.ts';
import { difficultyGroup, readRunConfig } from './run-config.ts';
import { checkSetup, instantiableRecords } from './setup-check.ts';

// Synthetic world creation input for Core tests: code-generated, never original data. Builders return fresh mutable
// plain data that a test may change. Names carry MARKER so privacy assertions can prove they never reach diagnostics.
// The slice-shaped mission follows the structure of the selected mission's instantiation list
// (docs/original/formats/scenario.md#selected-mission-instantiation-p3-0203) with synthetic values.

export { declaration, MARKER, ruleInputs };

/** Reference scale 8000 gives the runtime factor q = 1.875 exactly. */
export const REFERENCE_SCALE = 8000;
/** A 6 × 6 sector world: X = 45000, inset 44800. */
export const SECTORS = 6;

/** Player-relative side and interaction category of every craft type the tests use (craft-binding masks). */
const BINDINGS: Readonly<Record<number, { readonly side: string; readonly baseInteraction: boolean }>> = {
  0: { side: 'player', baseInteraction: false },
  1: { side: 'friendly', baseInteraction: false },
  2: { side: 'friendly', baseInteraction: false },
  7: { side: 'enemy', baseInteraction: false },
  8: { side: 'enemy', baseInteraction: false },
  13: { side: 'enemy', baseInteraction: false },
  14: { side: 'friendly', baseInteraction: false },
  15: { side: 'friendly', baseInteraction: true },
  16: { side: 'enemy', baseInteraction: false },
  17: { side: 'friendly', baseInteraction: true },
  18: { side: 'friendly', baseInteraction: true },
  25: { side: 'friendly', baseInteraction: false },
};

export const modelOf = (craftType: number): string => `model/craft-${craftType}`;

/** A craft type table binding exactly `types`, each to its own model. */
export function craftTypesContent(types: Iterable<number>) {
  return {
    entries: [...new Set(types)].sort((left, right) => left - right).map((craftType) => {
      const binding = BINDINGS[craftType];
      if (!binding) throw new Error(`No test binding for craft type ${craftType}`);
      return { craftType, ...binding, model: { id: modelOf(craftType), kind: 'model' } };
    }),
  };
}

export type DeclarationDraft = ReturnType<typeof declaration>;

/** A wingman option of kind bit 1 with one candidate. */
export const wingmanOption = (index: number, overrides: Record<string, unknown> = {}): DeclarationDraft =>
  declaration(index, { origins: ['wingman-option'], craftType: 1, nameCandidates: [`${MARKER}-wingman-${index}`], ...overrides });

export function rosterContent(count = 5) {
  return { references: { craftTypes: LOGIC_IDS.craftTypes }, options: Array.from({ length: count }, (_, index) => wingmanOption(index)) };
}

const offset = (x: number, y: number, z: number) => ({ x, y, z });

/** An empty mission frame: no declarations yet, a 6 × 6 world, no regions, groups, pool or event triggers. */
export function missionFrame() {
  return {
    campaign: { group: 0, slot: 1 },
    coordinates: { unit: 'scen-reference', referenceScale: REFERENCE_SCALE, layoutUnit: 'scen-runtime' },
    references: { craftTypes: LOGIC_IDS.craftTypes, wingmanRoster: LOGIC_IDS.wingmanRoster },
    mapFrame: { rightAxis: '+x', upAxis: '-y', center: { right: 0, up: 0 }, halfExtent: (SECTORS * REFERENCE_SCALE) / 2 },
    namePool: [] as string[],
    spawnRegions: [] as { x0: number; y0: number; x1: number; y1: number }[],
    declarations: [] as DeclarationDraft[],
    groups: [] as { template: number; members: number[]; spawnCount: number; layout: { x: number; y: number; z: number }[] }[],
    eventTriggers: [] as { ranges: { lower: number; upper: number; messages: string[]; summarySelector: number }[] }[],
  };
}

/** A mission with only the player, a stored position at the origin's side. */
export function playerOnlyMission() {
  const mission = missionFrame();
  mission.declarations.push(declaration(0, { craftType: 0, position: { x: 100, y: 200, z: 0 } }));
  return mission;
}

/**
 * The slice-shaped mission. Records: 0 player (rectangle 0); 1 and 2 kind-0 templates (rectangles 1 and 2, record 2
 * at 300 s); 3 two craft of kind bit 7 anchored on the player; 4, 5 members of kind bit 7 and 6 of kind bit 8; 7 four
 * craft of kind bit 17 with four candidates (rectangle 3); 8 thirty-five craft of kind bit 14 (rectangle 3). Groups: 0
 * and 1 from template 1 (2 requests × members 4, 4 and 6, 6), 2 from template 2 (3 requests × 5, 5). Rule inputs:
 * the player's +0x70 is 6 and record 3's +0x78 is 30; every other is a source 0.
 */
export function sliceMission() {
  const mission = missionFrame();
  mission.namePool = [`${MARKER}-pool-0`, `${MARKER}-pool-1`];
  mission.spawnRegions = [
    { x0: -2000, y0: -2000, x1: 2000, y1: 2000 },
    { x0: 16000, y0: 16000, x1: 20000, y1: 20000 },
    { x0: -20000, y0: 16000, x1: -16000, y1: 20000 },
    { x0: -4000, y0: -4000, x1: 4000, y1: 4000 },
  ];
  mission.declarations = [
    declaration(0, { craftType: 0, placement: { region: 0, anchor: null }, ruleInputs: ruleInputs({ aiValueA: 6 }) }),
    declaration(1, { origins: ['object', 'group-template'], placement: { region: 1, anchor: null } }),
    declaration(2, { origins: ['object', 'group-template'], placement: { region: 2, anchor: null }, spawnTime: 300 }),
    declaration(3, { craftType: 7, placement: { region: null, anchor: 0 }, ruleInputs: ruleInputs({ craftCount: 2, aiValueC: 30 }) }),
    declaration(4, { origins: ['object', 'group-member'], craftType: 7, memberOf: 0 }),
    declaration(5, { origins: ['object', 'group-member'], craftType: 7, memberOf: 2 }),
    declaration(6, { origins: ['object', 'group-member'], craftType: 8, memberOf: 1 }),
    declaration(7, {
      craftType: 17,
      placement: { region: 3, anchor: null },
      nameCandidates: [0, 1, 2, 3].map((index) => `${MARKER}-base-${index}`),
      ruleInputs: ruleInputs({ craftCount: 4 }),
    }),
    declaration(8, { craftType: 14, placement: { region: 3, anchor: null }, ruleInputs: ruleInputs({ craftCount: 35 }) }),
  ];
  mission.groups = [
    { template: 1, members: [4, 4], spawnCount: 2, layout: [offset(0, 0, 0), offset(250, 0, 0)] },
    { template: 1, members: [6, 6], spawnCount: 2, layout: [offset(0, 0, 0), offset(250, 0, 0)] },
    { template: 2, members: [5, 5], spawnCount: 3, layout: [offset(0, 0, 0), offset(0, 250, 0)] },
  ];
  return mission;
}

/**
 * The slice-shaped mission with the content readers' synthetic event triggers (syntheticMission): the first, counted by
 * records 3 and 7, has a range with one message and a negative selector and a range with two messages, one holding a
 * byte above 0x7E and a control byte; the second, counted by record 8, has one range without messages, whose selector
 * becomes 16, as world creation accepts only 0 or below and 13–19 (docs/plan/p3/02/spec.md, ME-02).
 */
export function eventMission() {
  const mission = sliceMission();
  mission.declarations[3].eventTrigger = 0;
  mission.declarations[7].eventTrigger = 0;
  mission.declarations[8].eventTrigger = 1;
  mission.eventTriggers = syntheticMission().eventTriggers;
  mission.eventTriggers[1].ranges[0].summarySelector = 16;
  return mission;
}

/**
 * The content readers' synthetic craft info (syntheticCraftInfo), changed only so that Core's semantic checks pass:
 * every record's +0x0C is 250 and its energy capacity +0x54 1000; the guns' cooldowns +0x14 are 7; the player's mount 1
 * fires together with its missile mount 2 instead of also alternating with mount 0. In it the player's record (kind bit
 * 0) takes the base maximum at every allocation level. The player mounts gun 0 (automatic), gun 1 (fixed, so its
 * projectile length lengthens the mount) and missile 1.
 */
export function craftInfoContent() {
  const info = syntheticCraftInfo();
  for (const record of info.craft) Object.assign(record, { at0C: 250, at54: 1000 });
  // The player's Warp fields within MW-01's check 4: +0xA8 positive (the builder's is negative).
  info.craft[0].atA8 = 14;
  for (const gun of info.guns) gun.at14 = 7;
  info.craft[0].mounts[1].at1C = null;
  return info;
}

/**
 * Map geometry content (P3-03 修订 2), the values of the synthetic production cockpit's map record: a main map of side
 * 400 at (21, 45), whose cursor starts at (178, 154), information and zoom windows 190 × 200, capacity 25 lines.
 */
export function mapGeometryContent() {
  return { rectangle: { x0: 21, y0: 45, x1: 611, y1: 444 }, redrawInterval: 0, informationLineHeight: 8 };
}

/** DEBRIS parameters with records for some kinds (syntheticDebrisParameters): (kind bit mod 3) + 1, none for 13 and 14. */
export const debrisContent = () => syntheticDebrisParameters();

/** The code identities of the wingman and base handlers in LE object 2 (ai-support.ts, AI_HANDLER_IDENTITIES). */
export const WINGMAN_HANDLER = 0x410c8;
export const BASE_HANDLER = 0x42c10;

/** A table or built-in record every object of its kinds selects fully: any +0xDC is at most +0x0C, any |+0xE0| at least 0. */
const always = { at0C: 0x7fff_ffff, at10: 0 };

/**
 * A script that uses each of the 25 supported opcodes once (CR-15) with an argument of its class, keywords by the
 * keyword tables' names in another case and with trailing spaces; it ends, after a yield, at 9999. Without
 * `attackPass` it leaves out 1101, whose attack pass divides by the craft's top speed.
 */
export function everyOpcodeScript(keywords = syntheticAiPrograms().keywordTables, attackPass = true) {
  const keyword = (table: number, entry: number) => `${keywords[table][entry].name.toLowerCase()}  `;
  return script([
    scriptItem(100, '1 x [0.5 1.5 -] 2'), scriptItem(104, '0.75'), scriptItem(106), scriptItem(107), scriptItem(111, '1, 2, 3'),
    scriptItem(200, 'Y'), scriptItem(210, '1.5'), scriptItem(211, '-2'), scriptItem(222, 'no'), scriptItem(231, keyword(0, 0)),
    scriptItem(232, 'T'), scriptItem(240, '[10 20]'), scriptItem(300, keyword(1, 0)), scriptItem(301, keyword(2, 1)), scriptItem(400, '32'),
    scriptItem(401, '[1 4 +]'), scriptItem(402), scriptItem(1000, '[16 64]'), scriptItem(1001, '45'), scriptItem(1002, '[10 20]'),
    scriptItem(1003, '5'), ...(attackPass ? [scriptItem(1101, 'f')] : []), scriptItem(9500), scriptItem(9999, '1'), scriptItem(10000),
  ]);
}

/**
 * AI programs whose reachable part Core supports (CR-15), with the content readers' synthetic globals and keyword
 * tables (syntheticAiPrograms) and five AICO elements:
 * - table records: 0 for kinds 0x80 and 0x100, naming DFPG 0, whose install script sets a lead mode and a size class and
 *   whose lists name the every-opcode script without 1101 (so a craft of top speed 0 stays accepted) and a short one;
 *   1 (+0x08 and +0x2C stored 0) only ever a partial match, which every scan meets after record 0's full match; 2 for
 *   kind 0x10, which no test binding has, naming DFPG 4 with the builders' script of unsupported opcodes;
 * - built-in records: 0 the builder's; 1 and 2 the homing missiles' programs (record 1 period 16, angle 30 and
 *   saturation 0.75, record 2 period 0, angle 2.5 and saturation 1); 3 the wingman's (kind 2) and 4 the bases' (kind
 *   0x20000) with the supported handlers.
 */
export function aiProgramsContent() {
  const programs = syntheticAiPrograms();
  const keywords = programs.keywordTables;
  programs.globals.elements = [[1, 1, 0, 0], [0.75, 0.5, 0.25, 0], [0.5, 0.5, 0, 0], [0.25, 0.75, 0, 0], [1, 0.25, 0, 0]];
  programs.programs = [
    tableProgram(0, { kindMask: 0x180, ...always }),
    tableProgram(0, { kindMask: null, at2C: null, ...always, at0C: 0, at10: 0x7fff_ffff, at50: 0 }),
    tableProgram(4, { kindMask: 0x10, ...always }),
  ];
  programs.entries = [
    parameterEntry(1, { state1: [2], state2: [3, 2], state3: [2], state5: [3], state4: [3] }),
    script([scriptItem(300, keywords[1][1].name), scriptItem(301, keywords[2][0].name), scriptItem(10000)]),
    everyOpcodeScript(keywords, false),
    script([scriptItem(240, '50', 2), scriptItem(1000, '8'), scriptItem(10000, '0')]),
    parameterEntry(null, { state1: [5] }),
    script(),
  ] as typeof programs.entries;
  programs.builtInPrograms = [
    builtInProgram(0x100),
    builtInProgram(0x140, { at14: 16, at24: 30, at2C: 0.75 }),
    builtInProgram(0x180, { at14: 0, at24: 2.5, at2C: 1 }),
    builtInProgram(WINGMAN_HANDLER, { kindMask: 0x2, ...always }),
    builtInProgram(BASE_HANDLER, { kindMask: 0x20000, ...always }),
  ];
  return programs;
}

/** A menu item text whose key, byte 1, is `key`; byte 0 is never read and MARKER follows the key. */
export const menuText = (key: string): string => `\x80${key}${MARKER}`;
const command = (key: string, code: number) => ({ text: menuText(key), command: code });
const category = (key: string, kindMask: number) => ({ text: menuText(key), kindMask });

/**
 * Menus shaped like the selected mission's (comm.md §5, §8) for the slice-shaped mission: the wingman category (kind bit
 * 1), the base category (kind bit 17, four objects) and a category of kind bit 18, which nothing instantiates; command
 * menus of 2, 1 and 7 commands with keys equal to their positions, the kind-2 menu 8 items with the exit. Exit keys are
 * `x` or `X`, both folding to `x`.
 */
export function commMenusContent() {
  return {
    gatedTargetCommands: [command('1', 7), command('2', 9), command('X', 0)],
    otherTargetCommands: [command('1', 7), command('x', 0)],
    categories: [category('W', 0x2), category('B', 0x20000), category('N', 0x40000), category('x', 0)],
    objectListLastEntry: menuText('X'),
    kind2TargetCommands: [...[1, 2, 3, 4, 5, 6, 7].map((code) => command(String(code), code)), command('x', 0)],
  };
}

/** Eleven service selectors within Core's domain: subsystem fields, both groups and the largest field 18. */
export const baseRepairItemsContent = () => ({ subsystemSelectors: [0, 33, 34, 5, 7, 8, 1, 2, 18, 3, 9] });

const frames = (...frameDurations: number[]) => ({ present: true, frameDurations });
const absent = () => ({ present: false });

/**
 * Communications messages: three face tables of 2, 1 and 2 faces and a direct table, with absent entries; TABL 2001
 * names base candidate 2 twice and pool name 1, TABL 2011 base candidate 0 and a name nothing holds.
 */
export function commMessagesContent() {
  return {
    faceTables: [
      [[frames(3, 9), absent()], [frames(6)]],
      [[absent(), frames(1, 1)]],
      [[absent()], [frames(4, 0, 5)]],
    ],
    direct: [frames(5), absent(), frames(0)],
    names2001: [`${MARKER}-base-2`, `${MARKER}-pool-1`, `${MARKER}-base-2`],
    names2011: [`${MARKER}-other`, `${MARKER}-base-0`],
  };
}

/** Projectile visuals with one record per length, in the effect content's shape; Core reads only the lengths. */
export function projectileVisualsContent(lengths: readonly number[] = [1.5, 6]) {
  return {
    kind: 'projectile',
    templates: [],
    records: lengths.map((length, index) => ({ selector: index, width: 0.25, length, colour: [1, 0.5, 0] })),
  };
}

export const animationId = (number: number): string => `data/explosion-animation/${String(number).padStart(2, '0')}`;
const explosionEntry = (animation: number) => ({ sound: { id: 'sound/synthetic/boom', kind: 'sound' }, animation: { id: animationId(animation), kind: 'data' } });

/** An explosion table: lists 1 and 2 name animations 1–3 (animation 2 twice), list 3 animation 4. */
export const explosionsContent = () => ({ lists: [[explosionEntry(2), explosionEntry(1)], [explosionEntry(3), explosionEntry(2)], [explosionEntry(4)]] });

/** An explosion animation of `frames` frames. */
export const animationContent = (frames: number) => ({
  frames: Array.from({ length: frames }, (_, index) => ({ id: `image/synthetic-frame/${index + 1}`, kind: 'image' })),
});

/** n₁₂ = 12 and n₃ = 6, as in the slice (X4). */
export const animationsContent = () => [1, 2, 3, 4].map((number) => ({ id: animationId(number), content: animationContent(number === 4 ? 6 : 12) }));

/** A model's content in the payload's shape; Core reads only part list 1's length. */
export function modelContent(parts: number) {
  const part = { sourceFlags: 0, colour: [128, 128, 128], geometry: 0, texture: null };
  return { kind: 'model', geometries: [], partLists: [[part], Array.from({ length: parts }, () => ({ ...part })), []], soundSlots: [null, null, null, null, null] };
}

/** The part count of kind `kindBit`'s model that `debris` maps to (craft.md §4.1): c, or c + 3 for kind bits 0 and 1. */
export function partsFor(kindBit: number, debris: { byCraftType: readonly (readonly unknown[])[] } = debrisContent()): number {
  // Kinds outside 0–19 occur only in setups creation rejects first.
  const records = debris.byCraftType[kindBit]?.length ?? 0;
  return kindBit === PLAYER_KIND_BIT || kindBit === WINGMAN_KIND_BIT ? records + 3 : records;
}

/** The models of `bindings` (kind bit and model), once each in ascending ID order, with the parts `debris` maps to. */
export function modelsFor(bindings: Iterable<readonly [kindBit: number, model: string]>, debris = debrisContent()) {
  const models = new Map<string, number>();
  for (const [kindBit, model] of bindings) if (!models.has(model)) models.set(model, kindBit);
  return [...models].sort(([left], [right]) => compareText(left, right)).map(([id, kindBit]) => ({ id, content: modelContent(partsFor(kindBit, debris)) }));
}

export type MissionDraft = ReturnType<typeof missionFrame>;
export type RosterDraft = ReturnType<typeof rosterContent>;
export type CraftInfoDraft = ReturnType<typeof craftInfoContent>;

export interface WorldInputParts {
  readonly mission?: MissionDraft;
  readonly roster?: RosterDraft;
  /** Defaults to the table binding exactly the craft types the mission and roster use. */
  readonly craftTypes?: unknown;
  /** The craft info's content; defaults to craftInfoContent(). */
  readonly craftInfo?: unknown;
  /** The rule-data contents; each defaults to the builders above. */
  readonly debrisParameters?: unknown;
  readonly projectileVisuals?: unknown;
  readonly explosions?: unknown;
  /** `{ id, content }` items. */
  readonly explosionAnimations?: unknown;
  /** `{ id, content }` items; defaults to those of the craft the run can instantiate (instantiableModels). */
  readonly models?: unknown;
  /** Defaults to aiProgramsContent(). */
  readonly aiPrograms?: unknown;
  /** Defaults to mapGeometryContent(). */
  readonly mapGeometry?: unknown;
  /** Default to commMenusContent(), baseRepairItemsContent() and commMessagesContent(). */
  readonly commMenus?: unknown;
  readonly baseRepairItems?: unknown;
  readonly commMessages?: unknown;
  readonly identity?: Record<string, unknown>;
  readonly run?: Record<string, unknown>;
}

export const SYNTHETIC_RUN = Object.freeze({ rawDifficulty: 19, wingman: null, seed: 0x1234_5678 });

/** An original-import identity: Core does not verify provenance, so synthetic content can exercise its gate. */
export const originalImportIdentity = () => syntheticIdentity({ origin: { type: 'original-import', sourceFingerprint: 'source:synthetic-disc' } });

/**
 * The kind bit and model of every craft the run of `input` can instantiate, as world creation finds them
 * (instantiableRecords), and of kind 0x4000, which `b` constructs in any run (transponderModel); for input whose setup
 * creation rejects, every kind the craft type table binds, since creation fails before it reads the models.
 */
export function instantiableModels(input: Pick<ReturnType<typeof worldInputBase>, 'mission' | 'craftTypes' | 'wingmanRoster' | 'identity' | 'run'>): [number, string][] {
  try {
    const setup = loadMission({ mission: input.mission, craftTypes: input.craftTypes, wingmanRoster: input.wingmanRoster } as never);
    const run = readRunConfig(input.run, 'input.run', setup, readContentIdentity(input.identity, 'input.identity'));
    const geometry = checkSetup(setup, run.wingman);
    const spawn = buildSpawnState(setup, geometry, { group: difficultyGroup(run.rawDifficulty), wingman: run.wingman }, new RandStream(run.seed));
    const transponder = transponderModel(setup);
    const models = instantiableRecords(setup, spawn).map(({ kindBit, model }): [number, string] => [kindBit, model]);
    return transponder === null ? models : [...models, [14, transponder]];
  } catch {
    const entries = (input.craftTypes.content as { entries?: { craftType: number; model: { id: string } }[] }).entries ?? [];
    return entries.map(({ craftType, model }) => [craftType, model.id]);
  }
}

/**
 * A section-1 record of kind 0x4000 that requests no craft (+0x10 is −1 as an i32) and whose +0x78 is set, so it draws
 * nothing: it only binds the kind's model, which world creation requires, as `b` constructs one in any run (CR-15).
 */
export const transponderBinding = (index: number): DeclarationDraft =>
  declaration(index, { craftType: 14, ruleInputs: ruleInputs({ craftCount: 0xffff_ffff, aiValueC: 20 }) });

function worldInputBase(parts: WorldInputParts) {
  const mission = parts.mission ?? sliceMission();
  const roster = parts.roster ?? rosterContent();
  // A mission of section-1 records only and without kind 0x4000 gets the binding as its last record, where the
  // canonical order allows one; the default craft type table then binds the kind.
  const declarations = mission.declarations as DeclarationDraft[];
  if (parts.craftTypes === undefined && declarations.every(({ origins }) => origins.includes('object'))
    && ![...declarations, ...roster.options].some(({ craftType }) => craftType === 14)) {
    declarations.push(transponderBinding(declarations.length));
  }
  const used = [...mission.declarations, ...roster.options].flatMap(({ craftType }) => (craftType === null ? [] : [craftType]));
  return {
    mission: { id: readAssetId(LOGIC_IDS.mission), content: mission as unknown },
    craftTypes: { id: readAssetId(LOGIC_IDS.craftTypes), content: parts.craftTypes ?? craftTypesContent(used) },
    wingmanRoster: { id: readAssetId(LOGIC_IDS.wingmanRoster), content: roster as unknown },
    craftInfo: { id: readAssetId(PRODUCTION_CRAFT_INFO), content: parts.craftInfo ?? (craftInfoContent() as unknown) },
    identity: parts.identity ?? syntheticIdentity(),
    run: { ...SYNTHETIC_RUN, ...parts.run } as Record<string, unknown>,
  };
}

/**
 * A complete world creation input, by default the slice-shaped mission without a wingman, with the production IDs of
 * the rule-data inputs and the models of the craft the run can instantiate.
 */
export function worldInput(parts: WorldInputParts = {}) {
  const base = worldInputBase(parts);
  const debris = parts.debrisParameters ?? debrisContent();
  const { mission, craftTypes, wingmanRoster, craftInfo, identity, run } = base;
  return {
    mission,
    craftTypes,
    wingmanRoster,
    craftInfo,
    debrisParameters: { id: readAssetId(PRODUCTION_RULE_DATA.debrisParameters), content: debris },
    projectileVisuals: { id: readAssetId(PRODUCTION_RULE_DATA.projectileVisuals), content: parts.projectileVisuals ?? projectileVisualsContent() },
    explosions: { id: readAssetId(PRODUCTION_RULE_DATA.explosions), content: parts.explosions ?? explosionsContent() },
    explosionAnimations: parts.explosionAnimations ?? animationsContent(),
    models: parts.models ?? modelsFor(instantiableModels(base), debris as ReturnType<typeof debrisContent>),
    aiPrograms: { id: readAssetId(PRODUCTION_RULE_DATA.aiPrograms), content: parts.aiPrograms ?? aiProgramsContent() },
    mapGeometry: { id: readAssetId(PRODUCTION_RULE_DATA.mapGeometry), content: parts.mapGeometry ?? mapGeometryContent() },
    commMenus: { id: readAssetId(PRODUCTION_RULE_DATA.commMenus), content: parts.commMenus ?? commMenusContent() },
    baseRepairItems: { id: readAssetId(PRODUCTION_RULE_DATA.baseRepairItems), content: parts.baseRepairItems ?? baseRepairItemsContent() },
    commMessages: { id: readAssetId(PRODUCTION_RULE_DATA.commMessages), content: parts.commMessages ?? commMessagesContent() },
    identity,
    run,
  };
}

/** Plain data with every object's keys in reverse order. */
export function reversedKeys<Value>(value: Value): Value {
  if (Array.isArray(value)) return value.map(reversedKeys) as Value;
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reversedKeys(item)])) as Value;
}

/** The input as the creation entry types it; tests build it as plain mutable data. */
export const asCreateInput = (input: unknown): CreateWorldInput => input as CreateWorldInput;
