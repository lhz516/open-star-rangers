import { readAssetId } from '../../content/asset-id.ts';
import { declaration, LOGIC_IDS, MARKER, ruleInputs, syntheticMission } from '../../content/logic/logic-content.test-support.ts';
import { syntheticIdentity } from '../../content/synthetic-content.test-support.ts';
import type { CreateWorldInput } from './create-world.ts';

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

export type MissionDraft = ReturnType<typeof missionFrame>;
export type RosterDraft = ReturnType<typeof rosterContent>;

export interface WorldInputParts {
  readonly mission?: MissionDraft;
  readonly roster?: RosterDraft;
  /** Defaults to the table binding exactly the craft types the mission and roster use. */
  readonly craftTypes?: unknown;
  readonly identity?: Record<string, unknown>;
  readonly run?: Record<string, unknown>;
}

export const SYNTHETIC_RUN = Object.freeze({ rawDifficulty: 19, wingman: null, seed: 0x1234_5678 });

/** An original-import identity: Core does not verify provenance, so synthetic content can exercise its gate. */
export const originalImportIdentity = () => syntheticIdentity({ origin: { type: 'original-import', sourceFingerprint: 'source:synthetic-disc' } });

/** A complete world creation input, by default the slice-shaped mission without a wingman. */
export function worldInput(parts: WorldInputParts = {}) {
  const mission = parts.mission ?? sliceMission();
  const roster = parts.roster ?? rosterContent();
  const used = [...mission.declarations, ...roster.options].flatMap(({ craftType }) => (craftType === null ? [] : [craftType]));
  return {
    mission: { id: readAssetId(LOGIC_IDS.mission), content: mission as unknown },
    craftTypes: { id: readAssetId(LOGIC_IDS.craftTypes), content: parts.craftTypes ?? craftTypesContent(used) },
    wingmanRoster: { id: readAssetId(LOGIC_IDS.wingmanRoster), content: roster as unknown },
    identity: parts.identity ?? syntheticIdentity(),
    run: { ...SYNTHETIC_RUN, ...parts.run },
  };
}

/** The input as the creation entry types it; tests build it as plain mutable data. */
export const asCreateInput = (input: unknown): CreateWorldInput => input as CreateWorldInput;
