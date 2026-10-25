import { describe, expect, it } from 'vitest';
import type { MissionSetup } from '../mission/load-mission.ts';
import type { Entity } from '../world/entity-table.ts';
import type { SpawnEntry } from '../world/spawn-state.ts';
import { entityInit, testState } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { ALL_CLEAR_KINDS, ENEMY_ENTRY_KINDS, hasRemainingEnemies } from './all-clear.ts';

// docs/plan/p3/02/spec.md, ME-08; docs/original/formats/executable.md, all-clear and summary selection (P3-11/01).
// The kind sets are written out bit by bit here, independently of the masks' hexadecimal values.

const bits = (...kindBits: number[]): number => kindBits.reduce((mask, bit) => mask | (2 ** bit), 0) >>> 0;

/** Declarations 0–4 of kinds null (a kind-0 template), 7, 13, 17 and 19; group 0 of 2 and 3, group 1 of 3 and 4. */
const SETUP = {
  declarations: [null, 7, 13, 17, 19].map((craftType) => ({ craftType })),
  groups: [{ members: [3, 2, 3] }, { members: [3, 4] }],
} as unknown as Pick<MissionSetup, 'declarations' | 'groups'>;

const entry = (source: SpawnEntry['source'], index: number, due = 0): SpawnEntry => ({ due, source, index, requests: 1 });

function stateWith(kindBit: number, overrides: Partial<Entity> = {}): { readonly state: WorldState; readonly entity: Entity } {
  const state = testState();
  const entity = state.entities.allocate(entityInit(kindBit));
  Object.assign(entity, overrides);
  return { state, entity };
}

describe('all-clear kind sets', () => {
  it('are bits 7–10, 12, 13, 16 and 19 for the entry, the same without 13 for the test', () => {
    expect(ENEMY_ENTRY_KINDS).toBe(bits(7, 8, 9, 10, 12, 13, 16, 19));
    expect(ALL_CLEAR_KINDS).toBe(bits(7, 8, 9, 10, 12, 16, 19));
  });
});

describe('hasRemainingEnemies (0x69a70)', () => {
  it('finds nothing in an empty world with an empty queue', () => {
    expect(hasRemainingEnemies(testState().entities, [], SETUP, null)).toBe(false);
  });

  it('counts an entity of every kind of the set, and of no other kind', () => {
    for (const kindBit of [7, 8, 9, 10, 12, 16, 19]) expect(hasRemainingEnemies(stateWith(kindBit).state.entities, [], SETUP, null)).toBe(true);
    for (const kindBit of [0, 1, 2, 3, 6, 11, 13, 14, 15, 17, 18, 20, 21, 22, 24, 25]) {
      expect(hasRemainingEnemies(stateWith(kindBit).state.entities, [], SETUP, null)).toBe(false);
    }
  });

  it('counts any activity and any state but pending removal, and never the excluded entity or a destroyed one', () => {
    for (const activity of ['parked', 'active', 'docked'] as const) {
      expect(hasRemainingEnemies(stateWith(7, { activity }).state.entities, [], SETUP, null)).toBe(true);
    }
    for (const objectState of ['new', 'presentation-ready', 'awaiting-presentation', 'destroyed-source', 'area-switch', 'active', 'projectile-hit'] as const) {
      expect(hasRemainingEnemies(stateWith(8, { state: objectState }).state.entities, [], SETUP, null)).toBe(true);
    }
    expect(hasRemainingEnemies(stateWith(8, { inWarp: true }).state.entities, [], SETUP, null)).toBe(true);
    expect(hasRemainingEnemies(stateWith(8, { state: 'pending-removal' }).state.entities, [], SETUP, null)).toBe(false);
    expect(hasRemainingEnemies(stateWith(8, { destroyed: true }).state.entities, [], SETUP, null)).toBe(false);
    const { state, entity } = stateWith(16);
    expect(hasRemainingEnemies(state.entities, [], SETUP, entity)).toBe(false);
    const other = state.entities.allocate(entityInit(16));
    expect(hasRemainingEnemies(state.entities, [], SETUP, entity)).toBe(true);
    expect(hasRemainingEnemies(state.entities, [], SETUP, other)).toBe(true);
  });

  it('counts a queued record or group with a kind of the set, due or not, and never the wingman\'s entry', () => {
    const { entities } = testState();
    expect(hasRemainingEnemies(entities, [entry('record', 1)], SETUP, null)).toBe(true);
    expect(hasRemainingEnemies(entities, [entry('record', 4, 0xffff_ffff)], SETUP, null)).toBe(true);
    // Kind 13 is in the entry set but not counted; kind 17 is in neither; a kind-0 template has no kind.
    for (const index of [0, 2, 3]) expect(hasRemainingEnemies(entities, [entry('record', index)], SETUP, null)).toBe(false);
    expect(hasRemainingEnemies(entities, [entry('group', 0)], SETUP, null)).toBe(false);
    // Group 1's second member is of kind 19.
    expect(hasRemainingEnemies(entities, [entry('group', 0), entry('group', 1)], SETUP, null)).toBe(true);
    expect(hasRemainingEnemies(entities, [entry('wingman', 1)], SETUP, null)).toBe(false);
  });
});
