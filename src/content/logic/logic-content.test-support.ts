import { syntheticGroup } from '../synthetic-content.test-support.ts';
import type { LogicRole } from './logic-content.ts';
import { encodeLogicPayload } from './logic-payload.ts';

// Code-generated synthetic logic content for tests; it never holds original data. Builders return fresh mutable plain
// data that a test may corrupt. Names carry MARKER so privacy assertions can prove they never reach diagnostics.

/** Carried by every synthetic name; content tests cannot import the original-data test marker. */
export const MARKER = 'PRIVATE-MARKER-logic-5c1d';

export const LOGIC_IDS: Readonly<Record<'mission' | 'craftTypes' | 'wingmanRoster', string>> = Object.freeze({
  mission: 'mission/first-campaign',
  craftTypes: 'data/craft-types',
  wingmanRoster: 'data/wingman-roster',
});

/** Whether every object reachable from `value` is frozen, as read results must be. */
export const deepFrozen = (value: unknown): boolean =>
  typeof value !== 'object' || value === null || (Object.isFrozen(value) && Object.values(value).every(deepFrozen));

export const ruleInputs = (overrides: Record<string, unknown> = {}) => ({
  percentA: null as number | null, craftCount: null as number | null, percentB: null as number | null,
  percentC: null as number | null, percentD: null as number | null, aiValueA: null as number | null,
  aiValueB: null as number | null, aiValueC: null as number | null, ...overrides,
});

export const declaration = (index: number, overrides: Record<string, unknown> = {}) => ({
  index,
  origins: ['object'] as string[],
  craftType: null as number | null,
  nameCandidates: [] as string[],
  position: { x: 0, y: 0, z: 0 },
  spawnTime: 0,
  gridSpacing: 0,
  placement: { region: null as number | null, anchor: null as number | null },
  memberOf: null as number | null,
  aiTarget: null as number | null,
  ruleInputs: ruleInputs(),
  aiTargetCraftTypes: [] as number[],
  ...overrides,
});

/**
 * A mission covering every field in canonical declaration order: a player, a kind-0 template and a craft template, a
 * member listed twice and, last, one only reachable through its group; placement by rectangle and anchor, an AI target,
 * layouts and a name pool.
 */
export function syntheticMission() {
  return {
    campaign: { group: 0, slot: 1 },
    coordinates: { unit: 'scen-reference', referenceScale: 1250, layoutUnit: 'scen-runtime' },
    references: { craftTypes: LOGIC_IDS.craftTypes, wingmanRoster: LOGIC_IDS.wingmanRoster },
    mapFrame: { rightAxis: '+x', upAxis: '-y', center: { right: 0, up: 0 }, halfExtent: 3750 },
    namePool: [`${MARKER}-pool-1`, `${MARKER}-pool-2`],
    spawnRegions: [{ x0: -3000, y0: -2000, x1: 3000, y1: 0 }, { x0: -3750, y0: 1500, x1: 3750, y1: 3500 }],
    declarations: [
      declaration(0, { craftType: 0, placement: { region: 0, anchor: null }, ruleInputs: ruleInputs({ aiValueA: 6 }) }),
      declaration(1, { origins: ['object', 'group-template'], placement: { region: 1, anchor: null }, spawnTime: 0xffffffff }),
      declaration(2, {
        origins: ['object', 'group-member'], craftType: 7, memberOf: 0, nameCandidates: [`${MARKER}-a`, `${MARKER}-b`],
        aiTargetCraftTypes: [0, 17], ruleInputs: ruleInputs({ percentA: 0xffffffff, craftCount: 2, percentB: -5 }),
      }),
      declaration(3, { origins: ['object', 'group-template'], craftType: 7, placement: { region: null, anchor: 0 }, aiTarget: 0, spawnTime: 180 }),
      declaration(4, { craftType: 17, placement: { region: 0, anchor: null } }),
      declaration(5, { origins: ['group-member'], craftType: 8, memberOf: 1, gridSpacing: -40, position: { x: 1.5, y: -2.25, z: 0.125 } }),
    ],
    groups: [
      { template: 1, members: [2, 2], spawnCount: 2, layout: [{ x: 0, y: 0, z: 0 }, { x: 25, y: 0, z: 0 }] },
      { template: 3, members: [5], spawnCount: 3, layout: [{ x: 0, y: 5, z: -5 }, { x: 0, y: 0, z: 60 }] },
    ],
  };
}

export function syntheticCraftTypes() {
  const model = (id: string) => ({ id, kind: 'model' });
  return {
    entries: [
      { craftType: 0, side: 'player', baseInteraction: false, model: model('model/player-ship') },
      { craftType: 1, side: 'friendly', baseInteraction: false, model: model('model/player-ship') },
      { craftType: 7, side: 'enemy', baseInteraction: false, model: model('model/enemy-ship-1') },
      { craftType: 8, side: 'enemy', baseInteraction: false, model: model('model/enemy-ship-2') },
      { craftType: 17, side: 'friendly', baseInteraction: true, model: model('model/base-1') },
    ],
  };
}

export function syntheticRoster() {
  return {
    references: { craftTypes: LOGIC_IDS.craftTypes },
    options: [
      declaration(0, { origins: ['wingman-option'], craftType: 1, nameCandidates: [`${MARKER}-w1`], ruleInputs: ruleInputs({ aiValueA: 3, aiValueB: 4 }) }),
      declaration(1, { origins: ['wingman-option'], craftType: 1, nameCandidates: [`${MARKER}-w2`] }),
    ],
  };
}

/** Each role's Asset ID and dependency IDs, matching the synthetic payloads. */
const ASSETS: Readonly<Record<LogicRole, { readonly id: string; readonly dependencies: readonly string[] }>> = {
  mission: { id: LOGIC_IDS.mission, dependencies: [LOGIC_IDS.craftTypes, LOGIC_IDS.wingmanRoster] },
  'craft-types': { id: LOGIC_IDS.craftTypes, dependencies: ['model/base-1', 'model/enemy-ship-1', 'model/enemy-ship-2', 'model/player-ship'] },
  'wingman-roster': { id: LOGIC_IDS.wingmanRoster, dependencies: [LOGIC_IDS.craftTypes] },
};

/** The canonical bytes and a matching mutable descriptor for one role's synthetic content. */
export function syntheticLogicAsset(role: LogicRole, content: unknown = { mission: syntheticMission, 'craft-types': syntheticCraftTypes, 'wingman-roster': syntheticRoster }[role]()) {
  const bytes = encodeLogicPayload({ role, content } as Parameters<typeof encodeLogicPayload>[0]);
  const [descriptor] = syntheticGroup('logic', [{ ...ASSETS[role], role, bytes }]).manifest.assets;
  return { bytes, descriptor };
}
