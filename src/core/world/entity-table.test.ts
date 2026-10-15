import { describe, expect, it } from 'vitest';
import { deepFrozen } from '../../content/logic/logic-content.test-support.ts';
import { CORE_LIMITS } from '../contracts/limits.ts';
import { initialMovementBlock } from '../rules/flight-state.ts';
import {
  ALL_KINDS, allocatorAiState, allocatorFlightState, blankCraftCombat, clearedControllerCommon, combatTypeOf, EntityTable, isActiveState, isLive,
  isValidAiProgram, markerInit, NO_AI_PROGRAM, setActivity, SUBSYSTEM_COUNT, TRANSPONDER_KIND_BIT,
  type AiController, type AiProgramSlot, type CraftCombat, type Entity, type EntityCombat, type EntityInit, type LinearMovementBlock, type MissileCombat, type MovementBlock, type ObjectState,
  type SpinningMovementBlock, type SteeredMovementBlock,
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
    expect(allocatorAiState()).toEqual({
      mode: 5, target: null, goal: { x: 0, y: 0, z: 0 }, targetOffset: { x: 0, y: 0, z: 0 }, objectTarget: null, pendingCommand: null, program: { type: 'none' },
    });
    expect(allocatorAiState()).not.toBe(allocatorAiState());
    expect(allocatorFlightState()).toEqual({ warpClock: 0, inWarp: false, ai: allocatorAiState(), formation: null });
  });

  it('copies the flight state detached: a mutable block and AI state, frozen vectors, a frozen formation', () => {
    const init = entityInit(7, {
      maximumSpeed: 70, lastParkedUpdateClock: 6, warpClock: 900, inWarp: true, movement: busyBlock(),
      ai: { mode: 2, target: 4, goal: { x: 1, y: 2, z: 3 }, targetOffset: { x: -1, y: 0, z: 0 }, objectTarget: 5, pendingCommand: null, program: { type: 'none' } },
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
    // P3-10 CB-04: the allocator and instantiation write no pending command.
    ['a pending command', ai({ pendingCommand: { code: 7, issuedTick: 0 } })],
    ['no pending command field', ai({ pendingCommand: undefined })],
    // P3-08 CR-16: the selection writes the program slot after allocation.
    ['a selected AI program', ai({ program: { type: 'table', record: 0, controller: null } })],
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

  it('gives each kind bit its combat type: craft 0–19, missile 20, projectile 21, explosion 22, fragment 24, marker 25, none otherwise', () => {
    const expected = Array.from({ length: 32 }, (_, kindBit) => (kindBit < 20 ? 'craft' : null));
    Object.assign(expected, { 20: 'missile', 21: 'projectile', 22: 'explosion', 24: 'fragment', 25: 'marker' });
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
    ['an escape pod with DEBRIS parameters', 24, { combat: { ...kindDefaults(24).combat, sourceKindBit: 1 } }],
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

  it('draws a kind 1 or 2 source\'s part 0 (kind bits 0 and 1), the escape pod without DEBRIS parameters, as parts 0–2', () => {
    const table = new EntityTable();
    for (const sourceKindBit of [0, 1]) {
      const combat = { ...kindDefaults(24).combat, sourceKindBit, debris: null };
      const presentation = { type: 'fragment', model: TEST_MODEL, part: 0, display: 'parts-0-2' } as const;
      expect(table.allocate(entityInit(24, { combat, presentation })).presentation).toEqual(presentation);
      expectFault(() => table.allocate(entityInit(24, { combat })), 'invariant-violated', 'entities.presentation');
    }
    // Part 3 of a player source has its parameters and is an ordinary fragment; part 0 of kind bit 2 is no pod.
    const part = { ...kindDefaults(24).combat, sourceKindBit: 0, part: 3, debris: 0 };
    expect(table.allocate(entityInit(24, { combat: part, presentation: { type: 'fragment', model: TEST_MODEL, part: 3, display: 'part' } })).combat).toEqual(part);
    const other = { ...kindDefaults(24).combat, sourceKindBit: 2 };
    expect(table.allocate(entityInit(24, { combat: other })).presentation).toMatchObject({ part: 0, display: 'part' });
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
      (entity.movement as LinearMovementBlock | SpinningMovementBlock).speed = 6;
      for (const broken of [{ speed: 0.1 }, { velocity: { x: Number.NaN, y: 0, z: 0 } }, kindBit === 21 ? { previousPosition: { x: 0.1, y: 0, z: 0 } } : { spinAxis: 3 }]) {
        expectFault(() => table.allocate(entityInit(kindBit, { movement: { ...movement, ...broken } as MovementBlock })), 'invariant-violated', 'entities.flight');
      }
    }
  });

  it('keeps the runtime kinds\' object target null: their +0x8C is in their combat state', () => {
    const table = new EntityTable();
    expect(table.allocate(entityInit(7, { ai: { ...allocatorAiState(), objectTarget: 2 } })).ai.objectTarget).toBe(2);
    for (const kindBit of [20, 21, 22, 24, 25]) {
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
  ] as [string, Partial<EntityInit>][])('refuses a runtime kind %s: it keeps the allocator\'s fields (CR-02, MW-03)', (_, overrides) => {
    for (const kindBit of [20, 21, 22, 24, 25]) {
      expectFault(() => new EntityTable().allocate(entityInit(kindBit, overrides)), 'invariant-violated', 'entities.runtime-kind');
    }
  });

  it('gives only a missile a maximum speed, its body record\'s', () => {
    const table = new EntityTable();
    expect(table.allocate(entityInit(20, { maximumSpeed: 64 })).maximumSpeed).toBe(64);
    for (const kindBit of [21, 22, 24, 25]) {
      expect(table.allocate(entityInit(kindBit)).maximumSpeed).toBe(0);
      expectFault(() => table.allocate(entityInit(kindBit, { maximumSpeed: 64 })), 'invariant-violated', 'entities.runtime-kind');
    }
  });
});

describe('the map marker and the map visibility flag (P3-09 AC-01; docs/plan/p3/02/spec.md MW-02, MW-03)', () => {
  it('allocates a kind-25 marker with its own name, presentation, combat and mode-4 block, active and not map-visible', () => {
    const entity = new EntityTable().allocate(entityInit(25));
    expect(entity).toMatchObject({
      kindBit: 25, name: { type: 'map-marker' }, presentation: { type: 'map-marker' }, combat: { type: 'marker' }, movement: { mode: 'marker', speed: 0 },
      activity: 'active', state: 'presentation-ready', source: null, side: null, baseInteraction: false, maximumSpeed: 0, warpClock: 0, inWarp: false,
      mapVisible: false, formation: null, ai: allocatorAiState(),
    });
    for (const part of [entity.name, entity.presentation, entity.combat, entity.movement]) expect(Object.isFrozen(part)).toBe(true);
  });

  it('builds the marker 0x3cb80 allocates at a position and attitude, with the allocator\'s defaults (MW-03)', () => {
    const position = { x: -4950, y: 10350, z: Math.fround(-2.5) };
    const init = markerInit(position, TEST_ORIENTATION);
    expect(init).toEqual({
      kindBit: 25, source: null, name: { type: 'map-marker' }, side: null, baseInteraction: false, presentation: { type: 'map-marker' },
      position, orientation: TEST_ORIENTATION, activity: 'active', ruleInputs: { percentB: 0, percentC: 0, percentD: 0, aiValueA: 0, aiValueB: 0, aiValueC: 0 },
      maximumSpeed: 0, lastParkedUpdateClock: 0, warpClock: 0, inWarp: false, ai: allocatorAiState(), formation: null,
      movement: { mode: 'marker', speed: 0 }, combat: { type: 'marker' },
    });
    const entity = new EntityTable().allocate(init);
    expect(entity).toMatchObject({ kindBit: 25, position, orientation: [...TEST_ORIENTATION], state: 'presentation-ready', placementSerial: 0, mapVisible: false });
  });

  it.each([
    ['a marker without its name', 25, { name: { type: 'none' } }, 'entities.runtime-kind'],
    ['a missile with the marker\'s name', 20, { name: { type: 'map-marker' } }, 'entities.runtime-kind'],
    ['a craft with the marker\'s name', 7, { name: { type: 'map-marker' } }, 'entities.name'],
    ['a marker drawn as a model', 25, { presentation: { type: 'model', model: TEST_MODEL } }, 'entities.presentation'],
    ['a craft drawn as the marker', 7, { presentation: { type: 'map-marker' } }, 'entities.presentation'],
    ['a marker with a steered block', 25, { movement: initialMovementBlock(1, 1) }, 'entities.movement'],
    ['a craft with the marker\'s block', 7, { movement: { mode: 'marker', speed: 0 } }, 'entities.movement'],
    ['a marker block with a speed', 25, { movement: { mode: 'marker', speed: 1 as 0 } }, 'entities.flight'],
    ['a marker parked', 25, { activity: 'parked', movement: null }, 'entities.runtime-kind'],
  ] as [string, number, Partial<EntityInit>, string][])('refuses %s', (_, kindBit, overrides, site) => {
    const table = new EntityTable();
    expectFault(() => table.allocate(entityInit(kindBit, overrides)), 'invariant-violated', site);
    expect(table.size).toBe(0);
  });

  it('allocates every kind not map-visible; only the rules set the flag', () => {
    const table = new EntityTable();
    const entities = [0, 7, 19, 20, 21, 22, 24, 25].map((kindBit) => table.allocate(entityInit(kindBit)));
    expect(entities.map(({ mapVisible }) => mapVisible)).toEqual(new Array(entities.length).fill(false));
    entities[1].mapVisible = true;
    expect(table.get(entities[1].id)!.mapVisible).toBe(true);
  });
});

describe('communications fields of an entity (P3-10 CB-04)', () => {
  it('allocates every kind with no portrait, no threat stamp and no pending command, which the rules write in place', () => {
    const table = new EntityTable();
    for (const kindBit of [0, 2, 7, 15, 20, 21, 22, 24]) {
      const entity = table.allocate(entityInit(kindBit));
      expect(entity.communications).toEqual({ face: null, threatStamp: null });
      expect(entity.ai.pendingCommand).toBeNull();
      expect(Object.isFrozen(entity.communications)).toBe(false);
    }
    const [first, second] = [table.allocate(entityInit(7)), table.allocate(entityInit(7))];
    expect(first.communications).not.toBe(second.communications);
    first.communications.face = 2;
    first.communications.threatStamp = 40;
    first.ai.pendingCommand = { code: 0xffffffff, issuedTick: 3 };
    expect(second.communications).toEqual({ face: null, threatStamp: null });
    expect(second.ai.pendingCommand).toBeNull();
  });
});

describe('AI program slot and transponder state of an entity (P3-08 AC-01; docs/plan/p3/02/spec.md CR-16 to CR-18, CR-20)', () => {
  const interpreter = (): AiController => ({
    ...clearedControllerCommon(),
    handler: 'interpreter',
    interpreter: {
      state: 3,
      execution: {
        script: 4, item: 2, variables: [0, -1, 2 ** 31 - 1, -(2 ** 31)], timers: [0, 5, 0, 0], returnStack: [1, 0], wait: { active: true, until: 9 },
        hold: { active: false, until: 0 },
      },
      lastRunEnded: false,
      steadyClock: 6,
      stateDeadline: 70,
      state4Deadline: 0,
    },
  });
  const wingman = (): AiController => ({
    ...clearedControllerCommon(),
    handler: 'wingman',
    wingman: { behaviour: 5, doNotAttack: 3, attackTarget: null, nextGunSwitchClock: 8, nextEngageSearchClock: 0 },
  });
  const base = (targetMask: number): AiController => ({ ...clearedControllerCommon(), handler: 'base', base: { targetMask } } as AiController);
  const parked = (): AiController => ({ ...clearedControllerCommon(), handler: 'parked' });
  const table = (controller: AiController | null): AiProgramSlot => ({ type: 'table', record: 2, controller } as AiProgramSlot);
  const builtIn = (controller: AiController | null): AiProgramSlot => ({ type: 'built-in', record: 5, controller } as AiProgramSlot);
  type Holder = Record<string | number, unknown>;
  /** A copy of `controller` with the field at `path` set to `value`. */
  const changed = (controller: AiController, path: readonly (string | number)[], value: unknown): AiController => {
    const copy = structuredClone(controller) as unknown as Holder;
    const holder = path.slice(0, -1).reduce<Holder>((at, key) => at[key] as Holder, copy);
    holder[path.at(-1)!] = value;
    return copy as unknown as AiController;
  };

  it('allocates every kind with no program, which only the rules write afterwards', () => {
    const entities = new EntityTable();
    for (const kindBit of [0, 1, 7, 14, 17, 20, 21, 22, 24, 25]) {
      const entity = entities.allocate(entityInit(kindBit));
      expect(entity.ai.program).toBe(NO_AI_PROGRAM);
    }
    expect(Object.isFrozen(NO_AI_PROGRAM)).toBe(true);
    const entity = entities.allocate(entityInit(7));
    entity.ai.program = table(null);
    expect(entities.get(entity.id)!.ai.program).toEqual({ type: 'table', record: 2, controller: null });
  });

  it('accepts selected and installed slots with the handlers their type allows, and none for every kind', () => {
    for (const slot of [table(null), table(interpreter()), table(parked()), builtIn(null), builtIn(wingman()), builtIn(base(0x93780)), builtIn(base(0x6c87f)), builtIn(parked())]) {
      expect(isValidAiProgram(1, slot), JSON.stringify(slot).slice(0, 60)).toBe(true);
    }
    for (const kindBit of [0, 14, 20, 25]) expect(isValidAiProgram(kindBit, NO_AI_PROGRAM)).toBe(true);
    // State 0 before the first choice and state 3 with an empty list have no execution.
    for (const state of [0, 3]) expect(isValidAiProgram(7, table(changed(changed(interpreter(), ['interpreter', 'execution'], null), ['interpreter', 'state'], state)))).toBe(true);
  });

  it.each([
    ['the player with a program', 0, table(null)],
    ['kind 0x4000 with a program', TRANSPONDER_KIND_BIT, builtIn(null)],
    ['a missile with a program', 20, table(null)],
    ['an unknown slot type', 7, { type: 'script', record: 0, controller: null }],
    ['a negative record', 7, { type: 'table', record: -1, controller: null }],
    ['a table record with the wingman handler', 7, table(wingman())],
    ['a built-in record with the interpreter', 7, builtIn(interpreter())],
    ['an unknown handler', 7, table(changed(parked(), ['handler'], 'pilot'))],
    ['another base mask', 17, builtIn(base(0xfbfff))],
    ['a negative period', 7, table(changed(parked(), ['period'], -1))],
    ['a fractional update clock', 7, table(changed(parked(), ['nextUpdateClock'], 0.5))],
    ['a non-f32 limit', 7, table(changed(parked(), ['limits', 'turn'], 0.1))],
    ['a missing trigger', 7, table(changed(parked(), ['triggers'], parked().triggers.slice(0, 2)))],
    ['an engagement mask beyond u32', 7, table(changed(parked(), ['engagement', 'mask'], 2 ** 32))],
    ['attack pass phase 3', 7, table(changed(parked(), ['attackPass', 'phase'], 3))],
    ['a size class beyond u8', 7, table(changed(parked(), ['steering', 'sizeClass'], 256))],
    ['relative flags beyond bits 0–2', 7, table(changed(parked(), ['steering', 'relativeFlags'], 8))],
    ['cone bits 4', 7, table(changed(parked(), ['steering', 'coneBits'], 4))],
    ['a non-f32 control value', 7, table(changed(parked(), ['steering', 'control', 'axes', 1, 'value'], 0.1))],
    ['a non-finite speed factor', 7, table(changed(parked(), ['steering', 'control', 'speedFactor'], Number.NaN))],
    ['a non-f32 noise bound', 7, table(changed(parked(), ['steering', 'throttleNoise', 'high'], 0.1))],
    ['interpreter state 7', 7, table(changed(interpreter(), ['interpreter', 'state'], 7))],
    ['no execution in state 4', 7, table(changed(changed(interpreter(), ['interpreter', 'execution'], null), ['interpreter', 'state'], 4))],
    ['a return stack deeper than 8', 7, table(changed(interpreter(), ['interpreter', 'execution', 'returnStack'], new Array(9).fill(0)))],
    ['a variable beyond i32', 7, table(changed(interpreter(), ['interpreter', 'execution', 'variables', 0], 2 ** 31))],
    ['wingman behaviour 6', 1, builtIn(changed(wingman(), ['wingman', 'behaviour'], 6))],
    ['an invalid wingman target', 1, builtIn(changed(wingman(), ['wingman', 'attackTarget'], 0))],
  ] as [string, number, AiProgramSlot][])('rejects %s', (_, kindBit, slot) => {
    expect(isValidAiProgram(kindBit, slot)).toBe(false);
  });

  it('gives cleared controller fields detached, with frozen vectors and lists', () => {
    const [first, second] = [clearedControllerCommon(), clearedControllerCommon()];
    expect(first).toEqual(second);
    expect(first.triggers).not.toBe(second.triggers);
    first.triggers[0].pressed = true;
    expect(second.triggers[0].pressed).toBe(false);
    expect([first.steering.point, first.steering.turnRates, first.steering.control, first.steering.control.axes[0]].every(Object.isFrozen)).toBe(true);
    expect(first.steering.control.speedFactor).toBeNull();
  });

  it('gives kind 0x4000 a transponder state, a declared one the declaration\'s, and no other kind one', () => {
    const entities = new EntityTable();
    const declared = entities.allocate(entityInit(TRANSPONDER_KIND_BIT, { source: { collection: 'mission', index: 3, group: null } }));
    expect(declared.transponder).toEqual({ creator: 'declaration', callback: { phase: 'none' } });
    for (const kindBit of [0, 1, 13, 15, 20, 25]) expect(entities.allocate(entityInit(kindBit)).transponder).toBeNull();
    declared.transponder!.callback = { phase: 'tumbling', since: 40 };
    expect(entities.get(declared.id)!.transponder!.callback).toEqual({ phase: 'tumbling', since: 40 });
  });

  /** A transponder `0x38780` constructs (CR-20 step 1): the allocator's fields, its creator and callback. */
  const constructed = (transponder: unknown, activity: 'active' | 'parked' = 'active'): EntityInit => entityInit(TRANSPONDER_KIND_BIT, {
    ...allocatorFlightState(), name: { type: 'none' }, side: null, baseInteraction: false, activity,
    ruleInputs: { percentB: 0, percentC: 0, percentD: 0, aiValueA: 0, aiValueB: 0, aiValueC: 0 }, transponder: transponder as EntityInit['transponder'],
  });

  it('copies a constructed transponder\'s state: the player\'s first update exactly while active, a wingman\'s parked drop without one', () => {
    const entities = new EntityTable();
    const supplied = { creator: 'player', callback: { phase: 'first-update' } } as const;
    const dropped = entities.allocate(constructed(supplied));
    expect(dropped.transponder).toEqual(supplied);
    expect(dropped.transponder).not.toBe(supplied);
    expect(Object.isFrozen(dropped.transponder!.callback)).toBe(true);
    // `b` while the player is not active makes a parked transponder (CR-20 step 2).
    expect(entities.allocate(constructed({ creator: 'player', callback: { phase: 'none' } }, 'parked')).transponder).toEqual({ creator: 'player', callback: { phase: 'none' } });
    expect(entities.allocate(constructed({ creator: 'wingman', callback: { phase: 'none' } }, 'parked')).transponder!.creator).toBe('wingman');
  });

  it.each([
    ['another kind with a transponder state', entityInit(7, { transponder: { creator: 'player', callback: { phase: 'none' } } })],
    ['a constructed transponder with a source', { ...constructed({ creator: 'player', callback: { phase: 'first-update' } }), source: { collection: 'mission', index: 0, group: null } }],
    ['a supplied declaration creator', constructed({ creator: 'declaration', callback: { phase: 'none' } })],
    ['an unknown creator', constructed({ creator: 'base', callback: { phase: 'none' } })],
    ['a wingman\'s drop at its first update', constructed({ creator: 'wingman', callback: { phase: 'first-update' } })],
    ['a parked first update', constructed({ creator: 'player', callback: { phase: 'first-update' } }, 'parked')],
    ['an active player\'s transponder without its first update', constructed({ creator: 'player', callback: { phase: 'none' } })],
    ['an active wingman\'s drop', constructed({ creator: 'wingman', callback: { phase: 'none' } })],
    ['a tumbling transponder', constructed({ creator: 'player', callback: { phase: 'tumbling', since: 3 } })],
    ['a constructed transponder with a name', { ...constructed({ creator: 'player', callback: { phase: 'first-update' } }), name: { type: 'craft-type', kindBit: 14 } }],
    ['a constructed transponder with rule inputs', { ...constructed({ creator: 'player', callback: { phase: 'first-update' } }), ruleInputs: { percentB: 1, percentC: 0, percentD: 0, aiValueA: 0, aiValueB: 0, aiValueC: 0 } }],
    ['a constructed transponder with an AI target', { ...constructed({ creator: 'player', callback: { phase: 'first-update' } }), ai: { ...allocatorAiState(), target: 1 } }],
  ] as [string, EntityInit][])('rejects %s', (_, init) => {
    const entities = new EntityTable();
    expectFault(() => entities.allocate(init), 'invariant-violated', 'entities.transponder');
    expect(entities.size).toBe(0);
  });

  it('lets 0x5e4d0 replace the rule inputs, which stay frozen', () => {
    const entity = new EntityTable().allocate(entityInit(7));
    entity.ruleInputs = Object.freeze({ ...entity.ruleInputs, aiValueB: 5 });
    expect(entity.ruleInputs.aiValueB).toBe(5);
    expect(Object.isFrozen(entity.ruleInputs)).toBe(true);
  });
});
