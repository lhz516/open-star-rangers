import { describe, expect, it } from 'vitest';
import { deepFrozen } from '../../content/logic/logic-content.test-support.ts';
import { CORE_LIMITS } from '../contracts/limits.ts';
import { initialMovementBlock } from '../rules/flight-state.ts';
import {
  ALL_KINDS, allocatorAiState, allocatorFlightState, blankCraftCombat, combatTypeOf, EntityTable, isActiveState, isLive, setActivity, SUBSYSTEM_COUNT,
  type CraftCombat, type Entity, type EntityCombat, type EntityInit, type MissileCombat, type MovementBlock, type ObjectState, type SteeredMovementBlock,
} from './entity-table.ts';
import { busyCombat, entityInit, expectFault, kindDefaults, TEST_MODEL, TEST_ORIENTATION, TEST_VISUALS } from './world.test-support.ts';

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
    // Every craft kind; the runtime kinds are covered by the combat tests below.
    for (let count = 0; count < CORE_LIMITS.entities; count++) table.allocate(entityInit(count % 20));
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
    // Kind 24 is the highest kind with a combat type (P3-07 CR-02).
    const table = tableWith(5, 0, 24, 5, 2, 0);
    expect(ids(table.walk(ALL_KINDS))).toEqual([2, 6, 5, 1, 4, 3]);
    expect(ids(table.walk((1 << 5) | 1))).toEqual([2, 6, 1, 4]);
    expect(ids(table.walk(1 << 24))).toEqual([3]);
    expect(ids(table.walk(0x8000_0000))).toEqual([]);
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
  function busyBlock(): SteeredMovementBlock {
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
    }) as unknown as { movement: SteeredMovementBlock; ai: { goal: { x: number } }; formation: { offset: { x: number } } };
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
    const movement = entity.movement as SteeredMovementBlock;
    for (const frozen of [entity.ai.goal, entity.ai.targetOffset, movement.steering, movement.impulse!.direction, movement.disturbance]) {
      expect(Object.isFrozen(frozen)).toBe(true);
    }
    // The rules write the block, its axes and the AI state in place.
    movement.speed = 2;
    movement.steering.pitch.rate = 2;
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

  // P3-07 CR-03, H1: craft steered, missiles in mode 0, projectiles linear with the hit test, explosions linear without,
  // fragments spinning.
  it.each([
    ['a craft', 7, kindDefaults(21).movement],
    ['a craft', 7, { ...busyBlock(), mode: 'drift' }],
    ['a missile', 20, kindDefaults(24).movement],
    ['a missile', 20, { ...busyBlock(), mode: 'warp' }],
    ['a projectile', 21, busyBlock()],
    ['a projectile', 21, kindDefaults(22).movement],
    ['an explosion', 22, kindDefaults(24).movement],
    ['an explosion', 22, kindDefaults(21).movement],
    ['a fragment', 24, kindDefaults(21).movement],
  ] as [string, number, MovementBlock][])('refuses %s a movement block of another variant', (_, kindBit, movement) => {
    const table = new EntityTable();
    expectFault(() => table.allocate(entityInit(kindBit, { movement })), 'invariant-violated', 'entities.movement');
    expect(table.size).toBe(0);
  });

  it('refuses a craft a block of another variant when its activity switches', () => {
    const parked = new EntityTable().allocate(entityInit(7, { activity: 'parked' }));
    for (const movement of [kindDefaults(21).movement!, kindDefaults(24).movement!]) {
      expectFault(() => setActivity(parked, 'active', movement), 'invariant-violated', 'entities.movement');
    }
    expect(parked.movement).toBeNull();
    setActivity(parked, 'active', { ...busyBlock(), mode: 'warp' });
    expect(parked.movement).toMatchObject({ mode: 'warp' });
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

describe('combat state of an entity (P3-07 S-01, AC-01; P3-02 CR-02, CR-03)', () => {
  const busyCraft = (): CraftCombat => busyCombat(7) as CraftCombat;
  const missile = (overrides: Partial<MissileCombat> = {}): MissileCombat => ({ ...(kindDefaults(20).combat as MissileCombat), ...overrides });

  it('gives each kind bit its combat type: craft 0–19, missile 20, projectile 21, explosion 22, fragment 24, none otherwise', () => {
    const expected = Array.from({ length: 32 }, (_, kindBit) => (kindBit < 20 ? 'craft' : null));
    Object.assign(expected, { 20: 'missile', 21: 'projectile', 22: 'explosion', 24: 'fragment' });
    expect(Array.from({ length: 32 }, (_, kindBit) => combatTypeOf(kindBit))).toEqual(expected);
    for (const bad of [-1, 32, 1.5, Number.NaN]) expect(combatTypeOf(bad)).toBeNull();
  });

  it('allocates a craft with a blank combat state before instantiation writes it', () => {
    expect(blankCraftCombat()).toEqual({
      type: 'craft', energy: 0, shield: 0, charge: 0, shieldLevel: 0, chargeLevel: 0, sparePower: 0, fullSpeedPower: 0, lastEnergyClock: 0,
      nextEnergyClock: 0, depleted: false, hull: 0, subsystems: new Array(SUBSYSTEM_COUNT).fill(0),
      weapons: {
        selections: [{ index: -1, mount: null }, { index: -1, mount: null }, { index: -1, mount: null }],
        lock: { level: 0, stageDueClock: 0, losing: false, graceDueClock: 0, nextUpdateClock: 0 },
        mounts: [],
      },
      hitFeedbackClock: null, proximity: null, lastVictim: null, lastAttacker: null,
    });
    expect(blankCraftCombat().weapons).not.toBe(blankCraftCombat().weapons);
  });

  it('copies a craft\'s combat state detached: mutable state, frozen lists, vectors and references', () => {
    const combat = busyCraft();
    const entity = new EntityTable().allocate(entityInit(7, { combat }));
    expect(entity.combat).toEqual(busyCraft());
    const before = JSON.stringify(entity);
    combat.energy = 99;
    (combat.subsystems as number[])[0] = 3;
    combat.weapons.selections[0].index = 9;
    combat.weapons.lock.level = 0;
    combat.weapons.mounts[1].ammunition = 9;
    (combat.weapons.mounts[1].aim as unknown as number[])[0] = 9;
    (combat.proximity as { entity: number }).entity = 9;
    expect(JSON.stringify(entity)).toBe(before);
    const copy = entity.combat as CraftCombat;
    for (const frozen of [copy.subsystems, copy.weapons.selections, copy.weapons.mounts, copy.weapons.mounts[1].aim, copy.proximity, copy.lastVictim, copy.lastAttacker]) {
      expect(Object.isFrozen(frozen)).toBe(true);
    }
    // The rules write the resources, selections, lock and mounts in place.
    copy.energy = 1;
    copy.weapons.selections[1].index = 0;
    copy.weapons.lock.losing = false;
    copy.weapons.mounts[0].lastShotClock = 30;
    expect(copy).toMatchObject({ energy: 1, weapons: { lock: { losing: false } } });
  });

  it.each([
    ['a missile', 20, busyCombat(20)],
    ['a projectile', 21, busyCombat(21)],
    ['an explosion', 22, busyCombat(22)],
    ['a fragment', 24, busyCombat(24)],
  ] as [string, number, EntityCombat][])('copies %s\'s combat state detached', (_, kindBit, combat) => {
    const init = entityInit(kindBit, { combat });
    const entity = new EntityTable().allocate(init);
    expect(entity.combat).toEqual(combat);
    expect(entity.combat).not.toBe(combat);
    const before = JSON.stringify(entity);
    for (const part of Object.values(combat)) if (typeof part === 'object' && part !== null && !Object.isFrozen(part)) Object.assign(part, { clock: 999, phase: 4 });
    expect(JSON.stringify(entity)).toBe(before);
  });

  it.each([
    ['craft combat on a missile', 20, { combat: blankCraftCombat(), presentation: { type: 'model', model: TEST_MODEL } }],
    ['missile combat on a craft', 7, { combat: missile() }],
    ['projectile combat on an explosion', 22, { combat: kindDefaults(21).combat }],
    ['any combat on kind 23', 23, {}],
    ['any combat on kind 25', 25, { combat: kindDefaults(24).combat }],
    ['19 subsystem fields but one', 7, { combat: { ...blankCraftCombat(), subsystems: [0] } }],
    ['a subsystem field of 4', 7, { combat: { ...blankCraftCombat(), subsystems: [4, ...new Array(SUBSYSTEM_COUNT - 1).fill(0)] } }],
    ['an energy beyond i32', 7, { combat: { ...blankCraftCombat(), energy: 2 ** 31 } }],
    ['a fractional hull', 7, { combat: { ...blankCraftCombat(), hull: 0.5 } }],
    ['a level of 4', 7, { combat: { ...blankCraftCombat(), chargeLevel: 4 } }],
    ['a negative energy clock', 7, { combat: { ...blankCraftCombat(), nextEnergyClock: -1 } }],
    ['a selection below −1', 7, { combat: (() => { const combat = busyCraft(); combat.weapons.selections[0].index = -2; return combat; })() }],
    ['a selection of a mount the craft lacks', 7, { combat: (() => { const combat = busyCraft(); combat.weapons.selections[2].mount = 2; return combat; })() }],
    ['a lock level of 5', 7, { combat: (() => { const combat = busyCraft(); combat.weapons.lock.level = 5 as 4; return combat; })() }],
    ['a mount damage of 3', 7, { combat: (() => { const combat = busyCraft(); combat.weapons.mounts[0].damage = 3 as 2; return combat; })() }],
    ['a non-f32 aim', 7, { combat: (() => { const combat = busyCraft(); combat.weapons.mounts[0].aim = [0.1, 0, 0, 0, 0, 0, 0, 0, 0]; return combat; })() }],
    ['an automatic target of 0', 7, { combat: (() => { const combat = busyCraft(); combat.weapons.mounts[0].autoTarget = 0; return combat; })() }],
    ['a non-f32 proximity distance', 7, { combat: { ...blankCraftCombat(), proximity: { entity: 1, distanceSquared: 0.1 } } }],
    ['a fractional hit feedback clock', 7, { combat: { ...blankCraftCombat(), hitFeedbackClock: 0.5 } }],
    ['a launch byte of 5', 20, { combat: missile({ launchByte: 5 as 4 }) }],
    ['an unknown missile program', 20, { combat: missile({ program: 'drift' as 'homing' }) }],
    ['a guidance phase of 5', 20, { combat: missile({ guidance: { phase: 5 as 4, lifetimeClock: 0, armClock: 0, fuseRadiusSquared: 0, detonationClock: 0, checkInterval: 0, nextCheckClock: 0 } }) }],
    ['a non-f32 turn fraction', 20, { combat: missile({ homing: { period: 0, nextUpdateClock: 0, turnFraction: 0.65, speedFraction: 1, targetValid: false, targetDistance: 0 } }) }],
    ['a negative gun', 21, { combat: { type: 'projectile', gun: -1, shooter: null, expiry: null }, presentation: { type: 'projectile', visuals: TEST_VISUALS, record: -1 } }],
    ['an explosion of a projectile', 22, { combat: { ...kindDefaults(22).combat, sourceKindBit: 21 } }],
    ['an explosion from source 0', 22, { combat: { ...kindDefaults(22).combat, source: 0 } }],
    ['a fragment of a missile', 24, { combat: { ...kindDefaults(24).combat, sourceKindBit: 20 } }],
    ['a fragment expiring at a fractional clock', 24, { combat: { ...kindDefaults(24).combat, expiry: { type: 'at', clock: 0.5 } } }],
    ['a fragment without DEBRIS parameters that is no escape pod', 24, { combat: { ...kindDefaults(24).combat, debris: null } }],
    ['an escape pod with DEBRIS parameters', 24, { combat: { ...kindDefaults(24).combat, sourceKindBit: 2 } }],
    ['a depletion latch that is no boolean', 7, { combat: { ...blankCraftCombat(), depleted: 1 as unknown as boolean } }],
    ['a losing lock that is no boolean', 7, { combat: (() => { const combat = busyCraft(); combat.weapons.lock.losing = 'yes' as unknown as boolean; return combat; })() }],
    ['a detonation flag that is no boolean', 20, { combat: missile({ detonate: 0 as unknown as boolean }) }],
    ['a homing target flag that is no boolean', 20, { combat: { ...busyCombat(20), homing: { ...(busyCombat(20) as MissileCombat).homing!, targetValid: null as unknown as boolean } } }],
    ['a first-hit flag that is no boolean', 21, { combat: { type: 'projectile', gun: 0, shooter: null, expiry: { clock: 1, firstHitPending: 'yes' as unknown as boolean } } }],
    ['an explode-on-expiry flag that is no boolean', 24, { combat: { ...kindDefaults(24).combat, explodeOnExpiry: 1 as unknown as boolean } }],
  ] as [string, number, Partial<EntityInit>][])('rejects %s as a broken invariant', (_, kindBit, overrides) => {
    const table = new EntityTable();
    expectFault(() => table.allocate(entityInit(kindBit, overrides)), 'invariant-violated', 'entities.combat');
    expect(table.size).toBe(0);
  });

  it.each([
    ['a craft drawn as a missile', 7, { type: 'missile', missile: 0 }],
    ['a missile drawn from another record', 20, { type: 'missile', missile: 1 }],
    ['a projectile drawn from another record', 21, { type: 'projectile', visuals: TEST_VISUALS, record: 1 }],
    ['an explosion drawn as another variant', 22, { type: 'explosion', variant: 'large' }],
    ['a fragment drawn as another part', 24, { type: 'fragment', model: TEST_MODEL, part: 1, display: 'part' }],
    ['a fragment drawn as a model', 24, { type: 'model', model: TEST_MODEL }],
    ['a fragment drawn as an escape pod', 24, { type: 'fragment', model: TEST_MODEL, part: 0, display: 'parts-0-2' }],
  ] as [string, number, EntityInit['presentation']][])('refuses %s', (_, kindBit, presentation) => {
    expectFault(() => new EntityTable().allocate(entityInit(kindBit, { presentation })), 'invariant-violated', 'entities.presentation');
  });

  it('copies and freezes each presentation variant', () => {
    const table = new EntityTable();
    for (const [kindBit, presentation] of [[7, { type: 'model', model: TEST_MODEL }], [20, { type: 'missile', missile: 0 }],
      [21, { type: 'projectile', visuals: TEST_VISUALS, record: 0 }], [22, { type: 'explosion', variant: 'other' }],
      [24, { type: 'fragment', model: TEST_MODEL, part: 0, display: 'part' }]] as const) {
      const entity = table.allocate(entityInit(kindBit, { presentation }));
      expect(entity.presentation).toEqual(presentation);
      expect(entity.presentation).not.toBe(presentation);
      expect(Object.isFrozen(entity.presentation)).toBe(true);
    }
  });

  it('draws a kind 1 or 2 source\'s part 0, the escape pod without DEBRIS parameters, as parts 0–2', () => {
    const table = new EntityTable();
    for (const sourceKindBit of [1, 2]) {
      const combat = { ...kindDefaults(24).combat, sourceKindBit, debris: null };
      const presentation = { type: 'fragment', model: TEST_MODEL, part: 0, display: 'parts-0-2' } as const;
      expect(table.allocate(entityInit(24, { combat, presentation })).presentation).toEqual(presentation);
      expectFault(() => table.allocate(entityInit(24, { combat })), 'invariant-violated', 'entities.presentation');
    }
    // Part 3 of a player source has its parameters and is an ordinary fragment.
    const part = { ...kindDefaults(24).combat, sourceKindBit: 1, part: 3, debris: 0 };
    expect(table.allocate(entityInit(24, { combat: part, presentation: { type: 'fragment', model: TEST_MODEL, part: 3, display: 'part' } })).combat).toEqual(part);
  });

  it('copies the linear and spinning blocks detached and checks their f32 values', () => {
    const table = new EntityTable();
    for (const kindBit of [21, 24]) {
      const movement = { ...kindDefaults(kindBit).movement!, speed: 5, velocity: { x: 1, y: 2, z: 3 } } as MovementBlock;
      const entity = table.allocate(entityInit(kindBit, { movement }));
      expect(entity.movement).toEqual(movement);
      expect(Object.isFrozen((entity.movement as { velocity: object }).velocity)).toBe(true);
      Object.assign((movement as { velocity: object }).velocity, { x: 9 });
      expect(entity.movement).toMatchObject({ velocity: { x: 1 } });
      entity.movement!.speed = 6;
      for (const broken of [{ speed: 0.1 }, { velocity: { x: Number.NaN, y: 0, z: 0 } }, kindBit === 21 ? { previousPosition: { x: 0.1, y: 0, z: 0 } } : { spinAxis: 3 }]) {
        expectFault(() => table.allocate(entityInit(kindBit, { movement: { ...movement, ...broken } as MovementBlock })), 'invariant-violated', 'entities.flight');
      }
    }
  });

  it('keeps the runtime kinds\' object target null: their +0x8C is in their combat state', () => {
    const table = new EntityTable();
    expect(table.allocate(entityInit(7, { ai: { ...allocatorAiState(), objectTarget: 2 } })).ai.objectTarget).toBe(2);
    for (const kindBit of [20, 21, 22, 24]) {
      expectFault(() => table.allocate(entityInit(kindBit, { ai: { ...allocatorAiState(), objectTarget: 2 } })), 'invariant-violated', 'entities.runtime-kind');
    }
  });

  it.each([
    ['parked', { activity: 'parked', movement: null }],
    ['with a source', { source: { collection: 'mission', index: 0, group: null } }],
    ['with a side', { side: 'enemy' }],
    ['with a name', { name: { type: 'pool', index: 0 } }],
    ['in the interaction category', { baseInteraction: true }],
    ['with rule inputs', { ruleInputs: { percentB: 0, percentC: 0, percentD: 0, aiValueA: 0, aiValueB: 1, aiValueC: 0 } }],
    ['with another AI mode', { ai: { ...allocatorAiState(), mode: 4 } }],
    ['with an AI target', { ai: { ...allocatorAiState(), target: 1 } }],
    ['with an AI goal', { ai: { ...allocatorAiState(), goal: { x: 0, y: 1, z: 0 } } }],
    ['with an AI target offset', { ai: { ...allocatorAiState(), targetOffset: { x: 0, y: 0, z: -1 } } }],
    ['in a formation', { formation: { leader: 1, offset: { x: 0, y: 0, z: 0 } } }],
    ['with a parked-update clock', { lastParkedUpdateClock: 2 }],
    ['with a Warp clock', { warpClock: 2 }],
    ['in Warp', { inWarp: true }],
  ] as [string, Partial<EntityInit>][])('refuses a runtime kind %s: it keeps the allocator\'s fields (CR-02)', (_, overrides) => {
    for (const kindBit of [20, 21, 22, 24]) {
      expectFault(() => new EntityTable().allocate(entityInit(kindBit, overrides)), 'invariant-violated', 'entities.runtime-kind');
    }
  });

  it('gives only a missile a maximum speed, its body record\'s', () => {
    const table = new EntityTable();
    expect(table.allocate(entityInit(20, { maximumSpeed: 64 })).maximumSpeed).toBe(64);
    for (const kindBit of [21, 22, 24]) {
      expect(table.allocate(entityInit(kindBit)).maximumSpeed).toBe(0);
      expectFault(() => table.allocate(entityInit(kindBit, { maximumSpeed: 64 })), 'invariant-violated', 'entities.runtime-kind');
    }
  });
});
