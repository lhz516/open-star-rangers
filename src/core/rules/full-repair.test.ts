import { describe, expect, it } from 'vitest';
import type { CraftRecord } from '../../content/rule-data/craft-info.ts';
import { craft as craftRecord, mount } from '../../content/rule-data/rule-data.test-support.ts';
import { blankCraftCombat, SUBSYSTEM_COUNT, type MovementBlock, type SubsystemState } from '../world/entity-table.ts';
import { expectFault, stillEntityInit, testState } from '../world/world.test-support.ts';
import { buildWeaponBlock, type CraftEntity } from './combat-init.ts';
import { craftMovementBlock } from './flight-state.ts';
import { refillMissileChain, repairFully, resetDisturbance } from './full-repair.ts';
import type { Selection } from './mounts.ts';

// Expectations follow docs/original/formats/executable.md BS9 and D7 (`0x39820`) and docs/plan/p3/02/spec.md CB-10,
// written out by hand: fields 0–18 := 0, every damaged list-0/1 mount intact, hull c9C and energy c54, each visited
// missile chain refilled to its mounts' +0x0C, both selections walked once round, the disturbance reset; nothing else.

const gun = (overrides: Record<string, unknown> = {}) => mount({ at10: 0, ...overrides });
const missile = (ammunition: number, overrides: Record<string, unknown> = {}) => mount({ at10: 1, at0C: ammunition, ...overrides });

/**
 * Mounts: 0 gun (+0x0C 3); 1 missile (4) alternating with 2; 2 missile (2), the chain's end; 3 missile (5) alone;
 * 4 gun in list 2 only; 5 gun alternating with missile 6 (7). Lists: 0 = [0, 1, 5], 1 = [3, 2], 2 = [4]. c9C 900,
 * c54 2400.
 */
function record(lists: number[][] = [[0, 1, 5], [3, 2], [4]]): CraftRecord {
  return craftRecord({
    at9C: 900,
    at54: 2400,
    mounts: [gun({ at0C: 3 }), missile(4, { at1C: 2 }), missile(2), missile(5), gun({ at0C: 1 }), gun({ at0C: 9, at1C: 6 }), missile(7)],
    mountLists: lists,
  }) as unknown as CraftRecord;
}

/** A damaged craft of kind bit 1 with `craft`'s weapon block and every field this rule keeps set to a marker. */
function damagedCraft(craft: CraftRecord): CraftEntity {
  const movement = craftMovementBlock(0x40, 40, 80);
  Object.assign(movement, { locked: true, commandedSpeed: 0, disturbance: { level: 2, biases: [5, -6, 7] } });
  const init = stillEntityInit(1, { movement, combat: { ...blankCraftCombat(), weapons: buildWeaponBlock(craft) } });
  const entity = testState().entities.allocate(init) as CraftEntity;
  const { weapons } = entity.combat;
  Object.assign(entity.combat, {
    energy: -3, shield: 11, charge: 12, shieldLevel: 1, chargeLevel: 3, sparePower: 13, fullSpeedPower: 14, lastEnergyClock: 15,
    nextEnergyClock: 16, depleted: true, hull: -40,
    subsystems: Object.freeze(Array.from({ length: SUBSYSTEM_COUNT }, (_, index): SubsystemState => ((index % 3) + 1) as SubsystemState)),
  });
  weapons.mounts.forEach((state, index) => Object.assign(state, { ammunition: 0, damage: index === 4 ? 2 : index % 3, lastShotClock: 100 + index }));
  Object.assign(weapons.lock, { level: 4, stageDueClock: 17 });
  return entity;
}

/** Runs the rule and returns every advance it reports. */
function repair(entity: CraftEntity, craft: CraftRecord): [0 | 1, Selection][] {
  const advances: [0 | 1, Selection][] = [];
  repairFully(entity, craft, (list, selection) => void advances.push([list, selection]));
  return advances;
}

describe('the full repair 0x39820 (BS9, D7; CB-10)', () => {
  it('zeroes fields 0–18, repairs lists 0 and 1 only, fills hull and energy from the record and refills the visited missile chains', () => {
    const craft = record();
    const entity = damagedCraft(craft);
    repair(entity, craft);
    const { combat } = entity;
    expect(combat.subsystems).toEqual(Array.from({ length: SUBSYSTEM_COUNT }, () => 0));
    expect(Object.isFrozen(combat.subsystems)).toBe(true);
    // Mount 4 is only in list 2: still destroyed. Mount 6 is on list 0's walk from 5 through the alternate link.
    expect(combat.weapons.mounts.map(({ damage }) => damage)).toEqual([0, 0, 0, 0, 2, 0, 0]);
    expect([combat.hull, combat.energy]).toEqual([900, 2400]);
    // Heads 1 (missile) and 3 refill their chains: 1 → 2, and 3; the guns 0, 4 and 5 keep theirs, and so does missile 6
    // behind gun head 5, as the head's type gates its chain.
    expect(combat.weapons.mounts.map(({ ammunition }) => ammunition)).toEqual([0, 4, 2, 5, 0, 0, 0]);
  });

  it('keeps every field it does not write: shield, charge, levels, power, clocks, the depleted latch, cooldowns and the control lock', () => {
    const craft = record();
    const entity = damagedCraft(craft);
    repair(entity, craft);
    expect(entity.combat).toMatchObject({
      shield: 11, charge: 12, shieldLevel: 1, chargeLevel: 3, sparePower: 13, fullSpeedPower: 14, lastEnergyClock: 15, nextEnergyClock: 16,
      depleted: true,
    });
    expect(entity.combat.weapons.mounts.map(({ lastShotClock }) => lastShotClock)).toEqual([100, 101, 102, 103, 104, 105, 106]);
    expect(entity.movement).toMatchObject({ locked: true, commandedSpeed: 0, disturbance: null });
    // The list-2 selection is not walked; the lock's stage clock is not written.
    expect(entity.combat.weapons.selections[2]).toEqual({ index: 0, mount: 4 });
    expect(entity.combat.weapons.lock.stageDueClock).toBe(17);
  });

  it('walks each list once round from its current entry, with no early stop and no extra list-1 advance, clearing the lock level', () => {
    const craft = record();
    const entity = damagedCraft(craft);
    const { selections, lock } = entity.combat.weapons;
    Object.assign(selections[0], { index: 1, mount: 1 });
    Object.assign(selections[1], { index: 1, mount: 2 });
    expect(repair(entity, craft)).toEqual([
      [0, { index: 2, mount: 5, changed: true }],
      [0, { index: 0, mount: 0, changed: true }],
      [0, { index: 1, mount: 1, changed: true }],
      [1, { index: 0, mount: 3, changed: true }],
      [1, { index: 1, mount: 2, changed: true }],
    ]);
    expect(selections.slice(0, 2)).toEqual([{ index: 1, mount: 1 }, { index: 1, mount: 2 }]);
    expect(lock.level).toBe(0);
  });

  it('ends the whole walk at a list without a current mount, still resetting the disturbance', () => {
    const craft = record([[], [3, 2], []]);
    const entity = damagedCraft(craft);
    expect(repair(entity, craft)).toEqual([]);
    expect(entity.combat.weapons.mounts[3].ammunition).toBe(0);
    expect(entity.combat.weapons.selections[1]).toEqual({ index: 0, mount: 3 });
    expect(entity.combat.weapons.lock.level).toBe(4);
    expect(entity.movement).toMatchObject({ disturbance: null });
  });

  it('repairs a parked craft, which has no movement block, the same way', () => {
    const craft = record();
    const entity = damagedCraft(craft);
    entity.movement = null;
    repair(entity, craft);
    expect([entity.combat.hull, entity.combat.energy, entity.movement]).toEqual([900, 2400, null]);
  });

  it('is a broken invariant when a selection names a mount its list never comes back to', () => {
    const craft = record();
    const entity = damagedCraft(craft);
    Object.assign(entity.combat.weapons.selections[0], { index: 0, mount: 4 });
    expectFault(() => repair(entity, craft), 'invariant-violated', 'full-repair.walk');
  });
});

describe('the missile chain refill and the disturbance reset', () => {
  it('refills a missile head\'s alternate chain below each mount\'s +0x0C and reports a refilled chain end', () => {
    const craft = record();
    const { weapons } = damagedCraft(craft).combat;
    expect(refillMissileChain(weapons, craft, 0)).toBe(false);
    expect(weapons.mounts[0].ammunition).toBe(0);
    weapons.mounts[2].ammunition = 2;
    expect(refillMissileChain(weapons, craft, 1)).toBe(false);
    expect(weapons.mounts.slice(1, 3).map(({ ammunition }) => ammunition)).toEqual([4, 2]);
    weapons.mounts[2].ammunition = 1;
    expect(refillMissileChain(weapons, craft, 1)).toBe(true);
    // Ammunition above +0x0C is kept (signed compare).
    weapons.mounts[3].ammunition = 9;
    expect(refillMissileChain(weapons, craft, 3)).toBe(false);
    expect(weapons.mounts[3].ammunition).toBe(9);
  });

  it('clears only a mode-0 block\'s disturbance', () => {
    const craft = craftMovementBlock(0, 40, 80);
    craft.disturbance = { level: 1 };
    resetDisturbance(craft);
    expect(craft.disturbance).toBeNull();
    const warp = { ...craftMovementBlock(0, 40, 80), mode: 'warp', disturbance: { level: 1 } } as unknown as MovementBlock;
    resetDisturbance(warp);
    expect(warp).toMatchObject({ disturbance: { level: 1 } });
    expect(() => resetDisturbance(null)).not.toThrow();
  });
});
