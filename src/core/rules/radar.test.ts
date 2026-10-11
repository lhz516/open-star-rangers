import { describe, expect, it } from 'vitest';
import { deepFrozen } from '../../content/logic/logic-content.test-support.ts';
import type { Vec3 } from '../contracts/domain-events.ts';
import type { Entity, EntityInit, SubsystemState } from '../world/entity-table.ts';
import { entityInit, expectFault, stateText, testState } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { contactClass, isNear, NEAR_DISTANCE, RADAR_CAPACITY, RADAR_KINDS, readRadar } from './radar.ts';

// Expectations derived by hand from T6, T10 and CR-12 (docs/plan/p3/02/spec.md), not by the module.

const at = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

/** A world with the player (kind bit 0) at `position`, active. */
function withPlayer(position: Vec3 = at(0, 0, 0)): [WorldState, Entity] {
  const state = testState();
  const player = state.entities.allocate(entityInit(0, { position }));
  player.state = 'active';
  state.player.entityId = player.id;
  return [state, player];
}

function add(state: WorldState, kindBit: number, position: Vec3, overrides: Partial<EntityInit> = {}): Entity {
  const entity = state.entities.allocate(entityInit(kindBit, { position, ...overrides }));
  if (entity.activity !== 'parked') entity.state = 'active';
  return entity;
}

function setRadarField(player: Entity, value: SubsystemState): void {
  if (player.combat.type !== 'craft') throw new Error('not a craft');
  const subsystems = [...player.combat.subsystems];
  subsystems[12] = value;
  player.combat.subsystems = subsystems;
}

const contactIds = (state: WorldState, player: Entity, target: number | null = null): number[] =>
  readRadar(state.entities, player, target).contacts.map(({ entityId }) => entityId);

describe('radar contacts (T6, CR-12)', () => {
  it('reads kinds 0x21fffff: every craft kind, missiles and the marker', () => {
    expect(Array.from({ length: 32 }, (_, bit) => bit).filter((bit) => ((RADAR_KINDS >>> bit) & 1) === 1))
      .toEqual([...Array.from({ length: 21 }, (_, bit) => bit), 25]);
  });

  it('lists craft and missiles that are not parked, in state 4, 7 or 8, with a block, other than the player, in walk order', () => {
    const [state, player] = withPlayer();
    const enemy = add(state, 8, at(0, 0, 10));
    const friendly = add(state, 1, at(0, 0, 20));
    const destroyed = add(state, 7, at(0, 0, 30));
    destroyed.state = 'destroyed-source';
    destroyed.destroyed = true;
    const docked = add(state, 17, at(0, 0, 40));
    docked.activity = 'docked';
    const hit = add(state, 7, at(0, 0, 45));
    hit.state = 'projectile-hit';
    const warping = add(state, 9, at(0, 0, 47), { inWarp: true });
    const missile = add(state, 20, at(0, 0, 50));
    add(state, 7, at(0, 0, 60), { activity: 'parked' });
    for (const objectState of ['presentation-ready', 'area-switch', 'pending-removal'] as const) add(state, 7, at(0, 0, 70)).state = objectState;
    add(state, 21, at(0, 0, 80));
    add(state, 22, at(0, 0, 90));
    add(state, 24, at(0, 0, 100));
    expect(contactIds(state, player)).toEqual([friendly.id, destroyed.id, hit.id, enemy.id, warping.id, docked.id, missile.id]);
  });

  it('gives each contact its f32 offset from the player', () => {
    // The x difference 1 + 2^−23 − 2^−30 rounds to the f32 1 + 2^−23.
    const [state, player] = withPlayer(at(2 ** -30, 100, -50));
    add(state, 7, at(1 + 2 ** -23, 90, 50));
    expect(readRadar(state.entities, player, null).contacts[0].offset).toEqual({ x: 1 + 2 ** -23, y: -10, z: 100 });
  });

  it('classifies by kind, a missile by its shooter while that resolves, hostile otherwise', () => {
    const [state, player] = withPlayer();
    const wingman = add(state, 1, at(0, 0, 10));
    const enemy = add(state, 7, at(0, 0, 20));
    const missile = (shooter: number | null): Entity => {
      const entity = add(state, 20, at(0, 0, 30));
      if (entity.combat.type === 'missile') entity.combat.shooter = shooter;
      return entity;
    };
    missile(wingman.id);
    missile(enemy.id);
    missile(999);
    missile(null);
    expect(readRadar(state.entities, player, null).contacts.map(({ class: kind, missile: blinks }) => [kind, blinks])).toEqual([
      ['friendly', false],
      ['hostile', false],
      ['friendly', true],
      ['hostile', true],
      ['hostile', true],
      ['hostile', true],
    ]);
  });

  it('classifies every craft kind bit by the friendly set 0x6c87f, and the marker apart', () => {
    const friendly = [0, 1, 2, 3, 4, 5, 6, 11, 14, 15, 17, 18];
    for (let kindBit = 0; kindBit < 20; kindBit++) expect(contactClass(kindBit, null)).toBe(friendly.includes(kindBit) ? 'friendly' : 'hostile');
    expect(contactClass(25, null)).toBe('marker');
    for (let kindBit = 0; kindBit < 20; kindBit++) expect(contactClass(20, kindBit)).toBe(friendly.includes(kindBit) ? 'friendly' : 'hostile');
    expect(contactClass(20, null)).toBe('hostile');
  });

  it('is near below a truncated Manhattan distance of 600', () => {
    expect(NEAR_DISTANCE).toBe(600);
    const origin = at(10, -10, 0);
    expect(isNear(origin, at(210, 190, 199.5))).toBe(true);
    expect(isNear(origin, at(-290, -10, Math.fround(-299.99997)))).toBe(true);
    expect(isNear(origin, at(210, 190, 200))).toBe(false);
    expect(isNear(origin, at(10, -10, 2 ** 30))).toBe(false);
  });

  it('faults on a Manhattan distance past the i32 range', () => {
    expectFault(() => isNear(at(0, 0, 0), at(2 ** 30, 2 ** 30, 1)), 'invariant-violated', 'radar.distance');
  });

  it('marks the player\'s target with the box', () => {
    const [state, player] = withPlayer();
    add(state, 7, at(0, 0, 10));
    const target = add(state, 7, at(0, 0, 20));
    expect(readRadar(state.entities, player, target.id).contacts.map((contact) => contact.target)).toEqual([false, true]);
    expect(readRadar(state.entities, player, 999).contacts.map((contact) => contact.target)).toEqual([false, false]);
  });
});

describe('radar capacity (T6, CR-11 difference 7)', () => {
  /** The player and `count` enemy contacts, in walk order. */
  function crowded(count: number): [WorldState, Entity, Entity[]] {
    const [state, player] = withPlayer();
    return [state, player, Array.from({ length: count }, (_, index) => add(state, 7, at(0, 0, index + 1)))];
  }

  it('holds 120 entries: 120 contacts without a target box', () => {
    const [state, player, contacts] = crowded(125);
    expect(RADAR_CAPACITY).toBe(120);
    expect(contactIds(state, player)).toEqual(contacts.slice(0, 120).map(({ id }) => id));
  });

  it('counts the target box: 119 contacts when the target comes first', () => {
    const [state, player, contacts] = crowded(125);
    const radar = readRadar(state.entities, player, contacts[0].id);
    expect(radar.contacts.length).toBe(119);
    expect(radar.contacts[0].target).toBe(true);
  });

  it('stops at the box that fills the buffer: the 119th contact\'s box is the 120th entry', () => {
    const [state, player, contacts] = crowded(125);
    const radar = readRadar(state.entities, player, contacts[118].id);
    expect(radar.contacts.map(({ entityId }) => entityId)).toEqual(contacts.slice(0, 119).map(({ id }) => id));
    expect(radar.contacts[118].target).toBe(true);
  });

  it('has no room for the box of the 120th contact', () => {
    const [state, player, contacts] = crowded(125);
    const radar = readRadar(state.entities, player, contacts[119].id);
    expect(radar.contacts.length).toBe(120);
    expect(radar.contacts.some(({ target }) => target)).toBe(false);
  });
});

describe('radar status (subsystem 12)', () => {
  it.each([[0, 0, 1], [1, 1, 1], [2, 2, 0], [3, 0, 1]] as const)('field %i reads as status %i with %i real contacts', (field, status, count) => {
    const [state, player] = withPlayer();
    const target = add(state, 7, at(0, 0, 10));
    setRadarField(player, field);
    const radar = readRadar(state.entities, player, target.id);
    expect(radar.status).toBe(status);
    expect(radar.contacts.length).toBe(count);
  });

  it('needs a craft as the player', () => {
    const [state] = withPlayer();
    const missile = add(state, 20, at(0, 0, 0));
    expectFault(() => readRadar(state.entities, missile, null), 'invariant-violated', 'radar.player');
  });
});

describe('reading the radar', () => {
  it('changes nothing, draws nothing and returns deeply frozen data', () => {
    const [state, player] = withPlayer();
    const target = add(state, 7, at(0, 0, 10));
    add(state, 20, at(0, 0, 20));
    const before = stateText(state);
    const rng = state.rngState;
    const radar = readRadar(state.entities, player, target.id);
    expect(stateText(state)).toBe(before);
    expect(state.rngState).toBe(rng);
    expect(deepFrozen(radar)).toBe(true);
  });
});
