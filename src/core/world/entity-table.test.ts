import { describe, expect, it } from 'vitest';
import { deepFrozen } from '../../content/logic/logic-content.test-support.ts';
import { CORE_LIMITS } from '../contracts/limits.ts';
import { initialMovementBlock } from '../rules/flight-state.ts';
import {
  ALL_KINDS, allocatorAiState, allocatorFlightState, EntityTable, isActiveState, isLive, setActivity, type Entity, type EntityInit,
  type MovementBlock, type ObjectState,
} from './entity-table.ts';
import { entityInit, expectFault, TEST_ORIENTATION } from './world.test-support.ts';

const ids = (entities: Iterable<Entity>): number[] => [...entities].map(({ id }) => id);

function tableWith(...kindBits: number[]): EntityTable {
  const table = new EntityTable();
  for (const kindBit of kindBits) table.allocate(entityInit(kindBit));
  return table;
}

describe('entity table identity (P3-02 S-05, AC-09 Q-08)', () => {
  it('allocates IDs from 1 in creation order and never reuses them', () => {
    const table = tableWith(3, 0, 3);
    expect(ids(table.byId())).toEqual([1, 2, 3]);
    table.remove(table.get(2)!);
    expect(table.get(2)).toBeUndefined();
    expect(table.nextId).toBe(4);
    expect(table.allocate(entityInit(0)).id).toBe(4);
    expect(ids(table.byId())).toEqual([1, 3, 4]);
    expect(table.size).toBe(3);
  });

  it('starts an entity new when parked, presentation-ready when active, at serial 0 and not destroyed', () => {
    const table = new EntityTable();
    const active = table.allocate(entityInit(1));
    const parked = table.allocate(entityInit(1, { activity: 'parked' }));
    expect(active).toMatchObject({ state: 'presentation-ready', activity: 'active', placementSerial: 0, destroyed: false });
    expect(parked).toMatchObject({ state: 'new', activity: 'parked', placementSerial: 0, destroyed: false });
  });

  it('copies and freezes what instantiation supplies', () => {
    const init = {
      ...entityInit(4),
      source: { collection: 'mission', index: 2, group: { index: 1, request: 0, member: 3 } },
      name: { type: 'candidate', declaration: { collection: 'mission', index: 2 }, candidate: 1 },
      position: { x: 1, y: 2, z: 3 },
      orientation: [...TEST_ORIENTATION],
      ruleInputs: { percentB: 1, percentC: 2, percentD: 3, aiValueA: 4, aiValueB: -5, aiValueC: 6 },
    } as unknown as EntityInit;
    const entity = new EntityTable().allocate(init);
    const before = JSON.stringify(entity);
    Object.assign(init.ruleInputs, { aiValueA: 99 });
    Object.assign((init.source as { group: object }).group, { member: 9 });
    Object.assign((init.name as { declaration: object }).declaration, { index: 7 });
    Object.assign(init.position, { x: 100 });
    (init.orientation as unknown as number[])[0] = 100;
    expect(JSON.stringify(entity)).toBe(before);
    for (const field of ['source', 'name', 'presentation', 'position', 'orientation', 'ruleInputs'] as const) expect(deepFrozen(entity[field])).toBe(true);
    expect(entity.ruleInputs).toEqual({ percentB: 1, percentC: 2, percentD: 3, aiValueA: 4, aiValueB: -5, aiValueC: 6 });
  });

  it.each([
    ['a negative kind bit', entityInit(-1), 'entities.kind'],
    ['a kind bit above 31', entityInit(32), 'entities.kind'],
    ['a fractional kind bit', entityInit(1.5), 'entities.kind'],
    ['a non-finite position', entityInit(1, { position: { x: Number.NaN, y: 0, z: 0 } }), 'entities.pose'],
    ['a short orientation', entityInit(1, { orientation: [1, 0, 0] as unknown as EntityInit['orientation'] }), 'entities.pose'],
    ['a non-finite orientation', entityInit(1, { orientation: [Infinity, 0, 0, 0, 1, 0, 0, 0, 1] }), 'entities.pose'],
  ])('rejects %s as a broken invariant', (_, init, site) => {
    const table = new EntityTable();
    expectFault(() => table.allocate(init), 'invariant-violated', site);
    expect(table.size).toBe(0);
    expect(table.nextId).toBe(1);
  });

  it('holds at most CORE_LIMITS.entities live entities, a budget fault beyond', () => {
    const table = new EntityTable();
    for (let count = 0; count < CORE_LIMITS.entities; count++) table.allocate(entityInit(count % 32));
    expect(table.size).toBe(CORE_LIMITS.entities);
    expectFault(() => table.allocate(entityInit(0)), 'budget-exhausted', 'entities.count');
    expect(table.nextId).toBe(CORE_LIMITS.entities + 1);
    // The budget counts live entities, not allocations.
    table.remove(table.get(1)!);
    expect(table.allocate(entityInit(0)).id).toBe(CORE_LIMITS.entities + 1);
  });

  it('refuses to remove an entity that is not in the table', () => {
    const table = tableWith(0);
    const entity = table.get(1)!;
    table.remove(entity);
    expectFault(() => table.remove(entity), 'invariant-violated', 'entities.remove');
    expectFault(() => table.remove({ ...tableWith(0).get(1)! }), 'invariant-violated', 'entities.remove');
  });
});

describe('entity table walks (P3-02 AC-09 Q-08)', () => {
  it('visits the mask’s kind bits in ascending order, each in allocation order', () => {
    const table = tableWith(5, 0, 31, 5, 2, 0);
    expect(ids(table.walk(ALL_KINDS))).toEqual([2, 6, 5, 1, 4, 3]);
    expect(ids(table.walk((1 << 5) | 1))).toEqual([2, 6, 1, 4]);
    expect(ids(table.walk(0x8000_0000))).toEqual([3]);
    expect(ids(table.walk(0))).toEqual([]);
  });

  it('is live: entities appended to the current or a higher bit are visited in the same walk, lower bits are not', () => {
    const table = tableWith(0, 2, 4);
    const visited: number[] = [];
    for (const entity of table.walk(ALL_KINDS)) {
      visited.push(entity.id);
      if (entity.id === 2) {
        table.allocate(entityInit(0)); // 4: lower bit, already walked
        table.allocate(entityInit(2)); // 5: current bit, after 2
        table.allocate(entityInit(9)); // 6: higher bit
        table.allocate(entityInit(4)); // 7: higher bit, after 3
      }
    }
    expect(visited).toEqual([1, 2, 5, 3, 7, 6]);
    expect(ids(table.walk(ALL_KINDS))).toEqual([1, 4, 2, 5, 3, 7, 6]);
  });

  it('forbids removal during a walk, including nested walks, and allows it once the walk ends early', () => {
    const table = tableWith(0, 1);
    for (const outer of table.walk(ALL_KINDS)) {
      for (const inner of table.walk(1)) expectFault(() => table.remove(inner), 'invariant-violated', 'entities.remove-during-walk');
      expectFault(() => table.remove(outer), 'invariant-violated', 'entities.remove-during-walk');
      break;
    }
    table.remove(table.get(1)!);
    expect(ids(table.walk(ALL_KINDS))).toEqual([2]);
  });

  it('keeps removed-state and destroyed entities in their lists; queries filter them', () => {
    const table = tableWith(0, 1, 1);
    const [first, second, third] = [table.get(1)!, table.get(2)!, table.get(3)!];
    first.state = 'active';
    second.state = 'pending-removal';
    third.state = 'active';
    third.destroyed = true;
    expect(ids(table.walk(ALL_KINDS))).toEqual([1, 2, 3]);
    expect([first, second, third].map(isLive)).toEqual([true, false, false]);
  });

  it('counts only original states 7 and above as active', () => {
    const states: Record<ObjectState, boolean> = {
      new: false,
      'presentation-ready': false,
      'awaiting-presentation': false,
      'destroyed-source': false,
      'area-switch': false,
      'pending-removal': false,
      active: true,
      'projectile-hit': true,
    };
    for (const [state, active] of Object.entries(states)) expect(isActiveState(state as ObjectState)).toBe(active);
  });
});

describe('flight state of an entity (P3-06 D-02, 检查点 A 定稿的状态与契约)', () => {
  /** A block with every optional part set, as other tasks' rules write them. */
  function busyBlock(): MovementBlock {
    const block = initialMovementBlock(70, 100);
    block.steering.yaw.rate = -0.5;
    block.steering.yaw.enabled = true;
    block.timedRotation.pitch = { rate: 1.5, decay: -0.25, end: 12 };
    block.impulse = { direction: { x: 0, y: 0, z: 1 }, magnitude: 4 };
    block.disturbance = { level: 2, biases: [3, -1, 0] };
    return block;
  }

  it('gives allocator defaults that runtime-kind constructors share: AI mode 5, no targets, zero vectors, no Warp, no formation', () => {
    expect(allocatorAiState()).toEqual({ mode: 5, target: null, goal: { x: 0, y: 0, z: 0 }, targetOffset: { x: 0, y: 0, z: 0 }, objectTarget: null });
    expect(allocatorAiState()).not.toBe(allocatorAiState());
    expect(allocatorFlightState()).toEqual({ warpClock: 0, inWarp: false, ai: allocatorAiState(), formation: null });
  });

  it('copies the flight state detached: a mutable block and AI state, frozen vectors, a frozen formation', () => {
    const init = entityInit(7, {
      maximumSpeed: 70, lastParkedUpdateClock: 6, warpClock: 900, inWarp: true, movement: busyBlock(),
      ai: { mode: 2, target: 4, goal: { x: 1, y: 2, z: 3 }, targetOffset: { x: -1, y: 0, z: 0 }, objectTarget: 5 },
      formation: { leader: 3, offset: { x: 1, y: 2, z: 3 } },
    }) as unknown as { movement: MovementBlock; ai: { goal: { x: number } }; formation: { offset: { x: number } } };
    const entity = new EntityTable().allocate(init as unknown as EntityInit);
    const before = JSON.stringify(entity);
    expect(entity).toMatchObject({ maximumSpeed: 70, lastParkedUpdateClock: 6, warpClock: 900, inWarp: true, movement: busyBlock(), ai: { mode: 2, target: 4, objectTarget: 5 } });
    const block = init.movement;
    block.speed = 1;
    block.steering.yaw.rate = 9;
    block.timedRotation.pitch!.rate = 9;
    (block.impulse!.direction as { z: number }).z = 9;
    (block.disturbance as unknown as { biases: number[] }).biases[0] = 9;
    init.ai.goal.x = 9;
    init.formation.offset.x = 9;
    expect(JSON.stringify(entity)).toBe(before);
    expect(deepFrozen(entity.formation)).toBe(true);
    for (const frozen of [entity.ai.goal, entity.ai.targetOffset, entity.movement!.steering, entity.movement!.impulse!.direction, entity.movement!.disturbance]) {
      expect(Object.isFrozen(frozen)).toBe(true);
    }
    // The rules write the block, its axes and the AI state in place.
    entity.movement!.speed = 2;
    entity.movement!.steering.pitch.rate = 2;
    entity.ai.mode = 4;
    expect(entity.movement).toMatchObject({ speed: 2, steering: { pitch: { rate: 2 } } });
  });

  it('holds a movement block exactly while not parked', () => {
    const table = new EntityTable();
    expectFault(() => table.allocate(entityInit(7, { movement: null })), 'invariant-violated', 'entities.movement');
    expectFault(() => table.allocate(entityInit(7, { activity: 'parked', movement: initialMovementBlock(1, 1) })), 'invariant-violated', 'entities.movement');
    expect(table.allocate(entityInit(7, { activity: 'parked' })).movement).toBeNull();
    expect(table.size).toBe(1);
  });

  it('switches the activity with its block, starting the state again, and refuses an inconsistent or invalid pair', () => {
    const entity = new EntityTable().allocate(entityInit(7, { activity: 'parked' }));
    const block = initialMovementBlock(1, 1);
    setActivity(entity, 'active', block);
    expect(entity).toMatchObject({ activity: 'active', state: 'presentation-ready' });
    expect(entity.movement).toBe(block);
    setActivity(entity, 'parked', null);
    expect(entity).toMatchObject({ activity: 'parked', state: 'new', movement: null });
    expectFault(() => setActivity(entity, 'docked', null), 'invariant-violated', 'entities.movement');
    expectFault(() => setActivity(entity, 'parked', initialMovementBlock(1, 1)), 'invariant-violated', 'entities.movement');
    expectFault(() => setActivity(entity, 'active', { ...initialMovementBlock(1, 1), speed: Number.NaN }), 'invariant-violated', 'entities.movement');
    expect(entity).toMatchObject({ activity: 'parked', state: 'new', movement: null });
  });

  const withBlock = (change: (block: Record<string, unknown>) => void): Partial<EntityInit> => {
    const block = busyBlock() as unknown as Record<string, unknown>;
    change(block);
    return { movement: block as unknown as MovementBlock };
  };
  const ai = (change: Record<string, unknown>): Partial<EntityInit> => ({ ai: { ...allocatorAiState(), ...change } as EntityInit['ai'] });

  it.each([
    ['a maximum speed that is not an f32', { maximumSpeed: 0.1 }],
    ['a non-finite maximum speed', { maximumSpeed: Number.POSITIVE_INFINITY }],
    ['a negative parked-update clock', { lastParkedUpdateClock: -1 }],
    ['a fractional Warp clock', { warpClock: 1.5 }],
    ['a mode outside the block\'s variant', withBlock((block) => { block.mode = 'linear'; })],
    ['a non-f32 speed', withBlock((block) => { block.speed = 0.1; })],
    ['a non-finite commanded speed', withBlock((block) => { block.commandedSpeed = Number.NaN; })],
    ['a non-finite steering rate', withBlock((block) => { (block.steering as Record<string, { rate: number }>).roll.rate = Number.NaN; })],
    ['a non-f32 timed-rotation end', withBlock((block) => { (block.timedRotation as Record<string, unknown>).yaw = { rate: 0, decay: 0, end: 0.1 }; })],
    ['a non-finite impulse direction', withBlock((block) => { block.impulse = { direction: { x: Number.NaN, y: 0, z: 0 }, magnitude: 1 }; })],
    ['a fractional disturbance bias', withBlock((block) => { block.disturbance = { level: 2, biases: [0.5, 0, 0] }; })],
    ['an unknown disturbance level', withBlock((block) => { block.disturbance = { level: 3 }; })],
    ['AI mode 3', ai({ mode: 3 })],
    ['a non-f32 AI goal', ai({ goal: { x: 0.1, y: 0, z: 0 } })],
    ['a non-finite AI target offset', ai({ targetOffset: { x: 0, y: Number.NaN, z: 0 } })],
    ['a non-finite formation offset', { formation: { leader: 1, offset: { x: 0, y: 0, z: Number.POSITIVE_INFINITY } } }],
  ] as [string, Partial<EntityInit>][])('rejects %s as a broken invariant', (_, overrides) => {
    const table = new EntityTable();
    expectFault(() => table.allocate(entityInit(7, overrides)), 'invariant-violated', 'entities.flight');
    expect(table.size).toBe(0);
  });
});
