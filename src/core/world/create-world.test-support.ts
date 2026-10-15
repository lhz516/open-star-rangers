import { readAssetId } from '../../content/asset-id.ts';
import { readContentIdentity } from '../../content/content-identity.ts';
import { compareText } from '../../content/contract-validation.ts';
import { declaration, LOGIC_IDS, MARKER, ruleInputs, syntheticMission } from '../../content/logic/logic-content.test-support.ts';
import { builtInProgram, syntheticAiPrograms, syntheticCraftInfo, syntheticDebrisParameters } from '../../content/rule-data/rule-data.test-support.ts';
import { syntheticIdentity } from '../../content/synthetic-content.test-support.ts';
import { loadMission } from '../mission/load-mission.ts';
import { RandStream } from '../rules/original-random.ts';
import { buildSpawnState, PLAYER_KIND_BIT, WINGMAN_KIND_BIT } from '../rules/spawn-schedule.ts';
import type { CreateWorldInput } from './create-world.ts';
import { PRODUCTION_CRAFT_INFO } from './craft-info-input.ts';
import { PRODUCTION_RULE_DATA } from './rule-data.ts';
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
 * byte above 0x7E and a control byte; the second, counted by record 8, has one range without messages. Core carries
 * them without interpreting them.
 */
export function eventMission() {
  const mission = sliceMission();
  mission.declarations[3].eventTrigger = 0;
  mission.declarations[7].eventTrigger = 0;
  mission.declarations[8].eventTrigger = 1;
  mission.eventTriggers = syntheticMission().eventTriggers;
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

/**
 * The content readers' synthetic AI programs (syntheticAiPrograms) with three built-in records, so that records 1 and
 * 2, the homing missiles' programs, exist: record 1 has period 16, angle 30 and saturation 0.75, record 2 period 0,
 * angle 2.5 and saturation 1; record 0 keeps the builder's values.
 */
export function aiProgramsContent() {
  const programs = syntheticAiPrograms();
  programs.builtInPrograms = [
    builtInProgram(0x100),
    builtInProgram(0x140, { at14: 16, at24: 30, at2C: 0.75 }),
    builtInProgram(0x180, { at14: 0, at24: 2.5, at2C: 1 }),
  ];
  return programs;
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
  readonly identity?: Record<string, unknown>;
  readonly run?: Record<string, unknown>;
}

export const SYNTHETIC_RUN = Object.freeze({ rawDifficulty: 19, wingman: null, seed: 0x1234_5678 });

/** An original-import identity: Core does not verify provenance, so synthetic content can exercise its gate. */
export const originalImportIdentity = () => syntheticIdentity({ origin: { type: 'original-import', sourceFingerprint: 'source:synthetic-disc' } });

/**
 * The kind bit and model of every craft the run of `input` can instantiate, as world creation finds them
 * (instantiableRecords); for input whose setup creation rejects, every kind the craft type table binds, since creation
 * fails before it reads the models.
 */
export function instantiableModels(input: Pick<ReturnType<typeof worldInputBase>, 'mission' | 'craftTypes' | 'wingmanRoster' | 'identity' | 'run'>): [number, string][] {
  try {
    const setup = loadMission({ mission: input.mission, craftTypes: input.craftTypes, wingmanRoster: input.wingmanRoster } as never);
    const run = readRunConfig(input.run, 'input.run', setup, readContentIdentity(input.identity, 'input.identity'));
    const geometry = checkSetup(setup, run.wingman);
    const spawn = buildSpawnState(setup, geometry, { group: difficultyGroup(run.rawDifficulty), wingman: run.wingman }, new RandStream(run.seed));
    return instantiableRecords(setup, spawn).map(({ kindBit, model }) => [kindBit, model]);
  } catch {
    const entries = (input.craftTypes.content as { entries?: { craftType: number; model: { id: string } }[] }).entries ?? [];
    return entries.map(({ craftType, model }) => [craftType, model.id]);
  }
}

function worldInputBase(parts: WorldInputParts) {
  const mission = parts.mission ?? sliceMission();
  const roster = parts.roster ?? rosterContent();
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
