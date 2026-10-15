import { describe, expect, it } from 'vitest';
import type { CraftRecord } from '../../content/rule-data/craft-info.ts';
import { craft as craftRecord, mount } from '../../content/rule-data/rule-data.test-support.ts';
import { blankCraftCombat, SUBSYSTEM_COUNT, type SubsystemState } from '../world/entity-table.ts';
import { expectFault, stillEntityInit, testState } from '../world/world.test-support.ts';
import type { BaseService } from '../world/world-state.ts';
import { confirmRow, energyStep, hullStep, navigateCursor, repairStep } from './base-service.ts';
import { buildWeaponBlock, type CraftEntity } from './combat-init.ts';
import { craftMovementBlock } from './flight-state.ts';
import { scriptedRand } from './rand.test-support.ts';

// Expectations are written out from docs/original/formats/executable.md BS3–BS8 and BS10 and docs/plan/p3/02/spec.md
// CB-11: the cursor clamps at rows 0 and 10; Enter moves a row needing service to the top; each step runs when the
// sample is strictly past its due and re-arms it at sample + 0x200, 0x40 or 4; the repair step works on the head only.

/** The 11 records' selectors, record i at index i: fields 0–4, the list-1 mounts 5, 6, the steering 7, the list-0 mounts 8, the groups 33 and 34. */
const SELECTORS = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 0x21, 0x22]);

const gun = (overrides: Record<string, unknown> = {}) => mount({ at10: 0, ...overrides });
const missile = (ammunition: number, overrides: Record<string, unknown> = {}) => mount({ at10: 1, at0C: ammunition, ...overrides });

/**
 * Mounts: 0 gun alternating with gun 1; 2 missile (+0x0C 4) alternating with 3 (2), the chain's end; 4 missile (3)
 * alone. Lists: 0 = [0], 1 = [2, 4]. c9C 900, c54 2400: rates 15 and 10.
 */
const CRAFT = craftRecord({
  at9C: 900,
  at54: 2400,
  mounts: [gun({ at1C: 1 }), gun(), missile(4, { at1C: 3 }), missile(2), missile(3)],
  mountLists: [[0], [2, 4], []],
}) as unknown as CraftRecord;

function player(fields: Record<number, SubsystemState> = {}): CraftEntity {
  const entity = testState().entities.allocate(stillEntityInit(0, { combat: { ...blankCraftCombat(), weapons: buildWeaponBlock(CRAFT) } })) as CraftEntity;
  const subsystems = Array.from({ length: SUBSYSTEM_COUNT }, (_, index): SubsystemState => fields[index] ?? 0);
  Object.assign(entity.combat, { hull: 100, energy: 2400, subsystems: Object.freeze(subsystems) });
  return entity;
}

/** A base service with `rows` (record order by default), every due at 100, rates 15 and 10 and no flag set. */
function service(rows: number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], cursor = 0): BaseService {
  return {
    rows, cursor, dues: { repair: 100, hull: 100, energy: 100 }, rates: { hull: 15, energy: 10 },
    flags: { repairsComplete: false, energyAndMissilesFull: false, hullFull: false },
  };
}

describe('the base keys, sub-commands 1–3 (BS4, BS5)', () => {
  it('moves the cursor one row and clamps it at rows 0 and 10, reporting whether it moved', () => {
    const base = service();
    expect(navigateCursor(base, 'previous')).toBe(false);
    expect(base.cursor).toBe(0);
    expect(navigateCursor(base, 'next')).toBe(true);
    expect(base.cursor).toBe(1);
    base.cursor = 10;
    expect(navigateCursor(base, 'next')).toBe(false);
    expect(base.cursor).toBe(10);
    expect(navigateCursor(base, 'previous')).toBe(true);
    expect(base.cursor).toBe(9);
  });

  it('moves a row needing service to the top, the rows above it down one, and keeps the cursor value', () => {
    const base = service([3, 1, 4, 0, 2, 5, 6, 7, 8, 9, 10], 2);
    // Record 4's selector is field 4.
    expect(confirmRow(base, SELECTORS, player({ 4: 1 }).combat.subsystems)).toEqual({ record: 4, moved: true });
    expect(base.rows).toEqual([4, 3, 1, 0, 2, 5, 6, 7, 8, 9, 10]);
    expect(base.cursor).toBe(2);
    expect(base.dues).toEqual({ repair: 100, hull: 100, energy: 100 });
  });

  it('changes nothing for a row needing no service, or the top row', () => {
    const base = service([3, 1, 4, 0, 2, 5, 6, 7, 8, 9, 10], 1);
    expect(confirmRow(base, SELECTORS, player({ 4: 1 }).combat.subsystems)).toEqual({ record: 1, moved: false });
    base.cursor = 0;
    expect(confirmRow(base, SELECTORS, player({ 3: 2 }).combat.subsystems)).toEqual({ record: 3, moved: false });
    expect(base.rows).toEqual([3, 1, 4, 0, 2, 5, 6, 7, 8, 9, 10]);
  });

  it('asks a group the count of its fields above the running count, not their maximum (BS3)', () => {
    const base = service([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 10);
    // Fields 10–14 at 0, 0, 0, 0, 0: record 10 (34) needs nothing; field 12 at 2 makes it 1.
    expect(confirmRow(base, SELECTORS, player().combat.subsystems).moved).toBe(false);
    expect(confirmRow(base, SELECTORS, player({ 12: 2 }).combat.subsystems).moved).toBe(true);
    expect(base.rows[0]).toBe(10);
  });
});

describe('the repair step (BS6 step 1)', () => {
  it('runs when the sample is strictly past its due, re-arming it at the sample + 0x200 first', () => {
    const entity = player({ 0: 2 });
    const base = service();
    repairStep(base, 100, entity, CRAFT, SELECTORS);
    expect([base.dues.repair, entity.combat.subsystems[0]]).toEqual([100, 2]);
    repairStep(base, 102, entity, CRAFT, SELECTORS);
    expect([base.dues.repair, entity.combat.subsystems[0]]).toEqual([102 + 0x200, 0]);
    // Record 0 is done: it goes to the bottom.
    expect(base.rows).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0]);
  });

  it('sets repairs-complete for a head needing nothing, without rotating', () => {
    const base = service();
    repairStep(base, 102, player({ 1: 1 }), CRAFT, SELECTORS);
    expect(base.flags.repairsComplete).toBe(true);
    expect(base.rows[0]).toBe(0);
    expect(base.dues.repair).toBe(102 + 0x200);
  });

  it('clears every field of a group head at once', () => {
    const entity = player({ 15: 2, 16: 1, 18: 3, 14: 1 });
    const base = service([9, 10, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
    repairStep(base, 102, entity, CRAFT, SELECTORS);
    expect(entity.combat.subsystems.slice(10, 19)).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0]);
    expect(base.rows).toEqual([10, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('repairs one list-1 mount per step, restoring no ammunition, and stores the list status until the head is done', () => {
    const entity = player({ 5: 1 });
    const { mounts } = entity.combat.weapons;
    for (const index of [2, 3]) Object.assign(mounts[index], { damage: 2, ammunition: 0 });
    const base = service([5, 0, 1, 2, 3, 4, 6, 7, 8, 9, 10]);
    repairStep(base, 102, entity, CRAFT, SELECTORS);
    // One repair is not a full one: mount 3 is still destroyed, so the status is 1 and the head stays.
    expect(mounts.map(({ damage }) => damage)).toEqual([0, 0, 0, 2, 0]);
    expect(entity.combat.subsystems[5]).toBe(1);
    expect(base.rows[0]).toBe(5);
    repairStep(base, 102 + 0x202, entity, CRAFT, SELECTORS);
    expect(mounts.map(({ damage }) => damage)).toEqual([0, 0, 0, 0, 0]);
    expect(mounts.map(({ ammunition }) => ammunition)).toEqual([0, 0, 0, 0, 3]);
    expect(entity.combat.subsystems[5]).toBe(0);
    expect(base.rows.at(-1)).toBe(5);
  });

  it('clears a list-0 field whose mounts are intact at its first step, repairing nothing', () => {
    const entity = player({ 8: 2 });
    const base = service([8, 0, 1, 2, 3, 4, 5, 6, 7, 9, 10]);
    repairStep(base, 102, entity, CRAFT, SELECTORS);
    expect(entity.combat.subsystems[8]).toBe(0);
    expect(base.rows.at(-1)).toBe(8);
  });

  it('releases the steering: field 7, the disturbance and the control lock of a mode-0 block, keeping the commanded speed', () => {
    const entity = player({ 7: 2 });
    const block = craftMovementBlock(0, 40, 80);
    Object.assign(block, { locked: true, commandedSpeed: 0, disturbance: { level: 2, biases: [1, 2, 3] } });
    entity.movement = block;
    repairStep(service([7, 0, 1, 2, 3, 4, 5, 6, 8, 9, 10]), 102, entity, CRAFT, SELECTORS);
    expect(entity.combat.subsystems[7]).toBe(0);
    expect(block).toMatchObject({ locked: false, commandedSpeed: 0, disturbance: null });
  });

  it('is a budget fault when the due would leave the safe integer range', () => {
    expectFault(() => repairStep(service(), Number.MAX_SAFE_INTEGER, player(), CRAFT, SELECTORS), 'budget-exhausted', 'base-service.due');
  });
});

describe('the hull step (BS6 step 2, BS10)', () => {
  it('draws once and adds the rate and rand % 100 up to c9C, every 0x40 units', () => {
    const entity = player();
    const base = service();
    const rand = scriptedRand([250, 32767]);
    hullStep(base, 100, entity, CRAFT, rand);
    expect(rand.used).toBe(0);
    hullStep(base, 102, entity, CRAFT, rand);
    expect([entity.combat.hull, base.dues.hull, base.flags.hullFull]).toEqual([100 + 15 + 50, 102 + 0x40, false]);
    entity.combat.hull = 850;
    hullStep(base, 102 + 0x42, entity, CRAFT, rand);
    expect([entity.combat.hull, base.flags.hullFull]).toEqual([900, true]);
  });

  it('draws at full hull too, and raises a negative hull', () => {
    const entity = player();
    entity.combat.hull = 900;
    const base = service();
    const rand = scriptedRand([7]);
    hullStep(base, 102, entity, CRAFT, rand);
    expect([rand.used, entity.combat.hull, base.flags.hullFull]).toEqual([1, 900, true]);
    entity.combat.hull = -100;
    hullStep(base, 102 + 0x42, entity, CRAFT, scriptedRand([99]));
    expect(entity.combat.hull).toBe(-100 + 15 + 99);
  });
});

describe('the energy and missile step (BS6 step 3)', () => {
  it('raises the energy by its rate up to c54, clearing the flag, and sets the flag only when the energy was already full', () => {
    const entity = player();
    entity.combat.energy = 2385;
    const base = service();
    energyStep(base, 100, entity, CRAFT);
    expect(entity.combat.energy).toBe(2385);
    energyStep(base, 102, entity, CRAFT);
    expect([entity.combat.energy, base.flags.energyAndMissilesFull, base.dues.energy]).toEqual([2395, false, 106]);
    energyStep(base, 108, entity, CRAFT);
    expect([entity.combat.energy, base.flags.energyAndMissilesFull]).toEqual([2400, false]);
    energyStep(base, 114, entity, CRAFT);
    expect(base.flags.energyAndMissilesFull).toBe(true);
  });

  it('with nothing to refill, returns list 0 to its start and moves list 1 one entry on, clearing the lock level', () => {
    const entity = player();
    const { weapons } = entity.combat;
    weapons.lock.level = 3;
    const base = service();
    energyStep(base, 102, entity, CRAFT);
    expect(weapons.selections.slice(0, 2)).toEqual([{ index: 0, mount: 0 }, { index: 1, mount: 4 }]);
    expect(weapons.lock.level).toBe(0);
    expect(base.flags.energyAndMissilesFull).toBe(true);
    energyStep(base, 108, entity, CRAFT);
    expect(weapons.selections[1]).toEqual({ index: 0, mount: 2 });
  });

  it('stops after the head whose chain end it refilled, one entry on, clearing the flag', () => {
    const entity = player();
    const { weapons } = entity.combat;
    weapons.mounts[3].ammunition = 1;
    weapons.mounts[4].ammunition = 0;
    const base = service();
    energyStep(base, 102, entity, CRAFT);
    // Head 2 refills 3, the end of its chain: list 1 advances to 4 and the walk stops there, leaving 4 empty.
    expect(weapons.mounts.map(({ ammunition }) => ammunition)).toEqual([0, 0, 4, 2, 0]);
    expect(weapons.selections[1]).toEqual({ index: 1, mount: 4 });
    expect(base.flags.energyAndMissilesFull).toBe(false);
    energyStep(base, 108, entity, CRAFT);
    // Head 4 is its own chain end.
    expect(weapons.mounts[4].ammunition).toBe(3);
    expect(weapons.selections[1]).toEqual({ index: 0, mount: 2 });
  });

  it('refills a chain without its end and walks on, leaving the flag', () => {
    const entity = player();
    const { weapons } = entity.combat;
    weapons.mounts[2].ammunition = 0;
    const base = service();
    energyStep(base, 102, entity, CRAFT);
    expect(weapons.mounts[2].ammunition).toBe(4);
    expect(weapons.selections[1]).toEqual({ index: 1, mount: 4 });
    expect(base.flags.energyAndMissilesFull).toBe(true);
  });
});
