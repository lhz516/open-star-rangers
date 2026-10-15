import { describe, expect, it } from 'vitest';
import type { CraftRecord, MissileBodyRecord, MissileRecord } from '../../content/rule-data/craft-info.ts';
import { craft, missileBody, mount } from '../../content/rule-data/rule-data.test-support.ts';
import { EntityTable, MISSILE_KIND_BIT, type CraftCombat, type EntityInit, type Matrix3 } from '../world/entity-table.ts';
import { busyCombat, entityInit, expectFault, kindDefaults, TEST_RULE_INPUTS } from '../world/world.test-support.ts';
import {
  buildWeaponBlock, craftMaximumSpeed, initialHull, initialiseCraftCombat, initialiseResources, missileBodyRecord, missileMaximumSpeed, rebuildWeaponBlock,
  resourceArithmetic, runtimeKindDefaults, type CraftEntity,
} from './combat-init.ts';
import { scriptedRand } from './rand.test-support.ts';

// Expectations derived from W1, D13, D7 and instantiation (docs/original/formats/executable.md) and the instruction
// order of 0x67938 and 0x3060c, not from the helpers.

const asCraft = (overrides: Record<string, unknown> = {}) => craft(overrides) as unknown as CraftRecord;

/** A craft record with mounts in two lists, a shield and an energy-limited player maximum at levels 1 and 2. */
function armedCraft(overrides: Record<string, unknown> = {}): CraftRecord {
  return asCraft({
    at54: 1250, at58: 50, at5C: 300, at60: 7, at64: [1, 10, 2, 3], at74: 40, at78: [4, 5, 5, 6], at88: 500, at9C: 1000, atB8: 100.75,
    mountLists: [[2, 0], [], [1]],
    mounts: [mount({ at0C: 0 }), mount({ at10: 1, weapon: 1, at0C: 4 }), mount({ at10: 1, weapon: 0, at0C: -2 })],
    ...overrides,
  });
}

/**
 * A craft of `kindBit` as the allocator leaves it at instantiation: maximum speed 0 and a blank combat state; its
 * record's percentages are TEST_RULE_INPUTS' (+0x60 100, +0x64 90, +0x68 80).
 */
function allocated(kindBit: number, overrides: Partial<EntityInit> = {}): CraftEntity {
  return new EntityTable().allocate(entityInit(kindBit, { maximumSpeed: 0, activity: 'parked', ...overrides })) as CraftEntity;
}

describe('the weapon block, 0x2d400 (W1)', () => {
  it('selects entry 0 of each list, its first mount or none, and zeroes every mount state but its ammunition', () => {
    const block = buildWeaponBlock(armedCraft());
    expect(block.selections).toEqual([{ index: 0, mount: 2 }, { index: 0, mount: null }, { index: 0, mount: 1 }]);
    expect(block.lock).toEqual({ level: 0, stageDueClock: 0, losing: false, graceDueClock: 0, nextUpdateClock: 0 });
    const zero = { lastShotClock: null, damage: 0, burst: 0, aim: [0, 0, 0, 0, 0, 0, 0, 0, 0], autoTarget: null, retargetClock: 0 };
    expect(block.mounts).toEqual([{ ...zero, ammunition: 0 }, { ...zero, ammunition: 4 }, { ...zero, ammunition: -2 }]);
  });

  it('gives a craft without mounts empty lists and no mount states, and builds fresh state at every call', () => {
    expect(buildWeaponBlock(asCraft())).toEqual({
      selections: [{ index: 0, mount: null }, { index: 0, mount: null }, { index: 0, mount: null }],
      lock: { level: 0, stageDueClock: 0, losing: false, graceDueClock: 0, nextUpdateClock: 0 },
      mounts: [],
    });
    const first = buildWeaponBlock(armedCraft());
    const second = buildWeaponBlock(armedCraft());
    expect(second.selections[0]).not.toBe(first.selections[0]);
    expect(second.mounts[0]).not.toBe(first.mounts[0]);
    expect(Object.isFrozen(first.mounts) && Object.isFrozen(first.selections)).toBe(true);
  });
});

describe('the hull at instantiation', () => {
  it('is chop((the record\'s +0x60 × the f64 0.01) × c9C), each product in double', () => {
    expect(initialHull(asCraft({ at9C: 12 }), 100)).toBe(12);
    expect(initialHull(asCraft({ at9C: 7 }), 50)).toBe(3);
    // 29 × 0.01 × 100 is 28.999999999999996 in double, so 28 and not 29.
    expect(initialHull(asCraft({ at9C: 100 }), 29)).toBe(28);
    expect(initialHull(asCraft({ at9C: -7 }), 50)).toBe(-3);
    expect(Object.is(initialHull(asCraft({ at9C: -1 }), 50), 0)).toBe(true);
  });
});

describe('the resources, 0x3060c (D13)', () => {
  it('divides the energy capacity before the percentage, the shield and charge after', () => {
    // energy (1250 ÷ 100) × 80 = 960, not 1000; shield 300 × 90 ÷ 100 = 270; charge 40 × 100 ÷ 100 = 40.
    // E = 50 − (c64[1] + c78[2]) = 50 − 15 = 35; T = chop(100.75) × 500 ÷ 1000 = 50.
    const { resources, steps } = resourceArithmetic(armedCraft(), 80, 90, 1, 2);
    expect(resources).toEqual({ energy: 960, shield: 270, charge: 40, shieldLevel: 1, chargeLevel: 2, sparePower: 35, fullSpeedPower: 50 });
    expect(steps).toEqual([960, 27_000, 4000, 15, 35, 100, 50_000]);
  });

  it('truncates every division toward zero and lists the unwrapped steps world creation bounds', () => {
    const { resources, steps } = resourceArithmetic(asCraft({ at54: -150, at5C: 7, at74: 3, atB8: -1.5, at88: 999 }), 100, 50, 0, 0);
    expect(resources).toMatchObject({ energy: -100, shield: 3, charge: 3, fullSpeedPower: 0 });
    expect(Object.is(resources.fullSpeedPower, 0)).toBe(true);
    expect(steps[5]).toBe(-1);
    const wide = resourceArithmetic(asCraft({ at5C: 2 ** 30 }), 100, 4, 0, 0);
    expect(wide.steps[1]).toBe(2 ** 32);
  });

  it('gives the player its energy-limited maximum from E, T and field 2, every other kind its base', () => {
    const record = armedCraft();
    const combat = { sparePower: 35, fullSpeedPower: 50, subsystems: Array(19).fill(0) } as unknown as CraftCombat;
    // E < T: trunc(35 × 1000 ÷ 500) = 70.
    expect(craftMaximumSpeed(0, record, combat)).toBe(70);
    expect(craftMaximumSpeed(0, record, { ...combat, subsystems: [0, 0, 2, ...Array(16).fill(0)] } as CraftCombat)).toBe(17.5);
    expect(craftMaximumSpeed(0, record, { ...combat, sparePower: 50 })).toBe(100.75);
    expect(craftMaximumSpeed(7, record, combat)).toBe(100.75);
  });
});

describe('initialiseResources, 0x3060c on an entity', () => {
  it('writes the player\'s resources at levels 1 and 2, its maximum, both energy clocks with one draw, and clears the latch', () => {
    const player = allocated(0);
    player.combat.depleted = true;
    const rand = scriptedRand([64 * 7 + 5]);
    initialiseResources(player, armedCraft(), 1000, rand);
    expect(rand.used).toBe(1);
    expect(player.combat).toMatchObject({
      energy: 960, shield: 270, charge: 40, shieldLevel: 1, chargeLevel: 2, sparePower: 35, fullSpeedPower: 50,
      lastEnergyClock: 1000, nextEnergyClock: 1000 + 0x80 + 5, depleted: false,
    });
    expect(player.maximumSpeed).toBe(70);
  });

  it('keeps the levels of any other kind, and its base maximum', () => {
    const other = allocated(7);
    Object.assign(other.combat, { shieldLevel: 3, chargeLevel: 0 });
    initialiseResources(other, armedCraft(), 2, scriptedRand([63]));
    // E = 50 − (c64[3] + c78[0]) = 43.
    expect(other.combat).toMatchObject({ shieldLevel: 3, chargeLevel: 0, sparePower: 43, nextEnergyClock: 2 + 0x80 + 63 });
    expect(other.maximumSpeed).toBe(100.75);
  });

  it('writes only its own fields, so the rescue can reuse it', () => {
    const player = allocated(0, { combat: busyCombat(0) });
    const before = structuredClone(player.combat);
    initialiseResources(player, armedCraft(), 640, scriptedRand([0]));
    const owned = ['energy', 'shield', 'charge', 'shieldLevel', 'chargeLevel', 'sparePower', 'fullSpeedPower', 'lastEnergyClock', 'nextEnergyClock', 'depleted'];
    const rest = (combat: CraftCombat) => Object.fromEntries(Object.entries(combat).filter(([key]) => !owned.includes(key)));
    expect(rest(player.combat)).toEqual(rest(before));
  });

  it('faults on an energy clock past the safe integers or a step past i32', () => {
    expectFault(() => initialiseResources(allocated(0), armedCraft(), Number.MAX_SAFE_INTEGER - 0x7f, scriptedRand([0])), 'budget-exhausted', 'combat-init.energy-clock');
    const wide = asCraft({ at5C: 2 ** 30 });
    expectFault(() => initialiseResources(allocated(7), wide, 0, scriptedRand([0])), 'invariant-violated', 'combat-init.resources');
  });
});

describe('instantiation\'s steps (CR-07) and the rescue\'s reuse (CR-13)', () => {
  it('builds the weapon block and the hull, then 0x3060c with its one draw, then clears fields 0–18', () => {
    const player = allocated(0, { ruleInputs: { ...TEST_RULE_INPUTS, percentB: 29 }, combat: busyCombat(0) });
    const record = armedCraft({ at9C: 100 });
    const rand = scriptedRand([3]);
    initialiseCraftCombat(player, record, 64, rand);
    expect(rand.used).toBe(1);
    expect(player.combat.weapons).toEqual(buildWeaponBlock(record));
    // 29 % of 100 in double: 28.999999999999996.
    expect(player.combat.hull).toBe(28);
    expect(player.combat.subsystems).toEqual(Array(19).fill(0));
    expect(player.combat).toMatchObject({ energy: 960, nextEnergyClock: 64 + 0x80 + 3 });
    // 0x3060c reads field 2 before the fields are cleared: 2 in this state, so 70 × 0.25.
    expect(player.maximumSpeed).toBe(17.5);
  });

  it('reads the live field 2 before clearing it, as a rescue after the repair would', () => {
    const player = allocated(0);
    player.combat.subsystems = [0, 0, 1, ...Array(16).fill(0)];
    initialiseCraftCombat(player, armedCraft(), 0, scriptedRand([0]));
    expect(player.maximumSpeed).toBe(35);
    expect(player.combat.subsystems[2]).toBe(0);
  });

  it('rebuilds only the weapon block for the rescue', () => {
    const player = allocated(0, { combat: busyCombat(0) });
    const before = structuredClone(player.combat);
    rebuildWeaponBlock(player, armedCraft());
    expect(player.combat.weapons).toEqual(buildWeaponBlock(armedCraft()));
    expect({ ...player.combat, weapons: null }).toEqual({ ...before, weapons: null });
  });
});

describe('the runtime kinds (CR-02)', () => {
  it('give a missile its body\'s +0xB8, the non-craft branch of 0x3060c', () => {
    expect(missileMaximumSpeed(missileBody({ atB8: 412.5 }) as unknown as MissileBodyRecord)).toBe(412.5);
  });

  it('find a missile record\'s body record by its +0x14, or nothing when either record is missing (W11)', () => {
    const missileBodies = [missileBody({ atB8: 1 }), missileBody({ atB8: 2 })] as unknown as MissileBodyRecord[];
    const missiles = [{ body: 1 }, { body: 2 }] as unknown as MissileRecord[];
    expect([0, 1, 2].map((missile) => missileBodyRecord({ missiles, missileBodies }, missile))).toEqual([missileBodies[1], undefined, undefined]);
  });

  it('take the allocator\'s fields, which the entity table accepts for every runtime kind', () => {
    expect(runtimeKindDefaults()).toEqual({
      source: null, name: { type: 'none' }, side: null, baseInteraction: false, activity: 'active',
      ruleInputs: { percentB: 0, percentC: 0, percentD: 0, aiValueA: 0, aiValueB: 0, aiValueC: 0 },
      lastParkedUpdateClock: 0, warpClock: 0, inWarp: false,
      ai: { mode: 5, target: null, goal: { x: 0, y: 0, z: 0 }, targetOffset: { x: 0, y: 0, z: 0 }, objectTarget: null, pendingCommand: null },
      formation: null,
    });
    const table = new EntityTable();
    for (const kindBit of [20, 21, 22, 24]) {
      const { combat, presentation, movement } = kindDefaults(kindBit);
      const maximumSpeed = kindBit === MISSILE_KIND_BIT ? 412.5 : 0;
      const orientation: Matrix3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      const init: EntityInit = { kindBit, presentation, movement, combat, position: { x: 0, y: 0, z: 0 }, orientation, ...runtimeKindDefaults(), maximumSpeed };
      expect(table.allocate(init).kindBit).toBe(kindBit);
    }
  });
});
