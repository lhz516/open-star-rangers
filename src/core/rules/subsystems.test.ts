import { describe, expect, it } from 'vitest';
import type { CraftRecord } from '../../content/rule-data/craft-info.ts';
import { craft as craftRecord, mount } from '../../content/rule-data/rule-data.test-support.ts';
import { SUBSYSTEM_COUNT, type SteeredMovementBlock, type SubsystemState } from '../world/entity-table.ts';
import { entityInit, testState } from '../world/world.test-support.ts';
import { buildWeaponBlock, type CraftEntity } from './combat-init.ts';
import { craftMovementBlock } from './flight-state.ts';
import { scriptedRand } from './rand.test-support.ts';
import { damageSubsystems, disturb, type SubsystemHit } from './subsystems.ts';
import type { RandSource } from './original-random.ts';

// Expectations follow docs/original/formats/executable.md D4 steps 2–10, D6, D11, D12 and the disturbance writer of
// the flight controls (`0x21bd4`: rand % 193 − 96 per bias), worked out by hand from the rand values scripted below.
// Preimage counts come from 32,768 = 19 × 1,724 + 12 = 9 × 3,640 + 8 = 193 × 169 + 151 and 128 rand values per low byte.

const PLAIN = craftRecord() as unknown as CraftRecord;
/** Mount 0 a gun without ammunition in list 0, mount 1 a missile mount with 4 in list 1. */
const ARMED = craftRecord({
  mounts: [mount({ at10: 0, weapon: 0, at0C: 0 }), mount({ at10: 1, weapon: 0, at0C: 4 })],
  mountLists: [[0], [1], []],
}) as unknown as CraftRecord;

/** A craft of `kindBit` with these subsystem states (the rest 0) and a mode-0 block. */
function craftOf(kindBit: number, states: Readonly<Record<number, SubsystemState>> = {}, record: CraftRecord = PLAIN): CraftEntity {
  const entity = testState().entities.allocate(entityInit(kindBit, { movement: craftMovementBlock(0, 48, 96) })) as CraftEntity;
  setStates(entity, states);
  entity.combat.weapons = buildWeaponBlock(record);
  return entity;
}

function setStates(entity: CraftEntity, states: Readonly<Record<number, SubsystemState>>): void {
  const subsystems = Array.from({ length: SUBSYSTEM_COUNT }, (_, index): SubsystemState => states[index] ?? 0);
  entity.combat.subsystems = Object.freeze(subsystems);
}

/** The roll on `entity` with its hull already at `hull` after `hullDamage`, from an attacker and no missile unless `overrides` say so. */
function roll(entity: CraftEntity, record: CraftRecord, hullDamage: number, hull: number, rand: RandSource, overrides: Partial<SubsystemHit> = {}) {
  entity.combat.hull = hull;
  return damageSubsystems(entity, record, { hullDamage, noAttacker: false, sourceKindBit: null, ...overrides }, rand);
}

/** How many of the 32,768 rand values give each key. */
function histogram<Key>(keyOf: (value: number) => Key): Map<Key, number> {
  const counts = new Map<Key, number>();
  for (let value = 0; value <= 32767; value++) {
    const key = keyOf(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

const steered = (entity: CraftEntity): SteeredMovementBlock => entity.movement as SteeredMovementBlock;

/** The fields whose state is not 0, by field. */
const damagedFields = (entity: CraftEntity): Record<number, SubsystemState> =>
  Object.fromEntries(entity.combat.subsystems.flatMap((state, index) => (state === 0 ? [] : [[index, state]])));

describe('the steering disturbance 0x21bd4', () => {
  it('sets level 1 on a mode-0 block without a draw', () => {
    const entity = craftOf(7);
    const rand = scriptedRand([]);
    disturb(entity.movement, 1, rand);
    expect([steered(entity).disturbance, rand.used]).toEqual([{ level: 1 }, 0]);
  });

  it('draws the three level-2 biases in order, rand % 193 − 96 each', () => {
    const entity = craftOf(7);
    const rand = scriptedRand([0, 192, 193 + 100]);
    disturb(entity.movement, 2, rand);
    expect(steered(entity).disturbance).toEqual({ level: 2, biases: [-96, 96, 4] });
    expect(Object.isFrozen(steered(entity).disturbance)).toBe(true);
    expect(rand.used).toBe(3);
  });

  it('gives biases −96…54 170 preimages each and 55…96 169', () => {
    const entity = craftOf(7);
    const counts = histogram((value) => {
      disturb(entity.movement, 2, scriptedRand([value, 0, 0]));
      const { disturbance } = steered(entity);
      if (disturbance?.level !== 2) throw new Error('no level-2 disturbance');
      return disturbance.biases[0];
    });
    const expected = new Map<number, number>();
    for (let bias = -96; bias <= 96; bias++) expected.set(bias, bias <= 54 ? 170 : 169);
    expect(counts).toEqual(expected);
  });

  it('writes and draws nothing without a block or on a Warp block', () => {
    const rand = scriptedRand([]);
    disturb(null, 2, rand);
    const entity = craftOf(7);
    const warp = { ...steered(entity), mode: 'warp' as const };
    disturb(warp, 2, rand);
    disturb(warp, 1, rand);
    expect([warp.disturbance, rand.used]).toEqual([null, 0]);
  });
});

describe('the forced roll, step 2 of 0x2a830 (D4)', () => {
  it('neither rolls nor draws for no hull damage from an attacker and no missile', () => {
    const entity = craftOf(7);
    for (const sourceKindBit of [null, 21, 0]) {
      const rand = scriptedRand([]);
      expect(roll(entity, PLAIN, 0, 100, rand, { sourceKindBit })).toEqual({ field: null, applied: false, heavyDamage: null });
      expect(rand.used).toBe(0);
    }
  });

  it('draws it without an attacker or from a missile: a failed one ends the roll after one draw', () => {
    for (const overrides of [{ noAttacker: true }, { sourceKindBit: 20 }]) {
      const entity = craftOf(7);
      const rand = scriptedRand([0x132]);
      expect(roll(entity, PLAIN, 0, 100, rand, overrides).field).toBeNull();
      expect(rand.used).toBe(1);
    }
  });

  it('succeeds for 50 × 128 = 6,400 rand values, low bytes 0–0x31; then the damage roll (t = 0) and the field are drawn', () => {
    const entity = craftOf(7);
    const counts = histogram((value) => {
      setStates(entity, {});
      const rand = scriptedRand([value, 0, 3]);
      const outcome = roll(entity, PLAIN, 0, 100, rand, { noAttacker: true });
      const forced = (value & 0xff) < 0x32;
      const expected = forced ? [{ field: 3, applied: true, heavyDamage: null }, 3, 1] : [{ field: null, applied: false, heavyDamage: null }, 1, 0];
      return JSON.stringify([outcome, rand.used, entity.combat.subsystems[3]]) === JSON.stringify(expected) ? forced : 'mismatch';
    });
    expect(counts).toEqual(new Map([[true, 6400], [false, 26368]]));
  });
});

describe('the damage roll, step 4 of 0x2a830 (D4)', () => {
  it('is certain without a draw when the hull is at 0 or below', () => {
    const entity = craftOf(7);
    const rand = scriptedRand([4]);
    expect(roll(entity, PLAIN, 10, 0, rand)).toEqual({ field: 4, applied: true, heavyDamage: null });
    expect(rand.used).toBe(1);
    expect(roll(craftOf(7), PLAIN, -5, -1, scriptedRand([2])).field).toBe(2);
  });

  it('beats a low byte with t = trunc(768 × 10 ÷ 90) = 85: 85 × 128 = 10,880 rand values', () => {
    const entity = craftOf(7);
    const counts = histogram((value) => {
      setStates(entity, {});
      const rolled = roll(entity, PLAIN, 10, 90, scriptedRand([value, 0])).field !== null;
      return rolled === (value & 0xff) < 85 ? rolled : 'mismatch';
    });
    expect(counts).toEqual(new Map([[true, 10880], [false, 21888]]));
  });

  it('is certain from t = 256 and never for t ≤ 0, drawing either way', () => {
    const always = scriptedRand([0xff, 1]);
    expect(roll(craftOf(7), PLAIN, 100, 50, always).field).toBe(1);
    expect(always.used).toBe(2);
    const negative = scriptedRand([0]);
    expect(roll(craftOf(7), PLAIN, -5, 100, negative).field).toBeNull();
    expect(negative.used).toBe(1);
  });

  it('multiplies by 768 in i32: 768 × 2^22 wraps to −2^30, so t < 0 never beats a low byte', () => {
    const rand = scriptedRand([0]);
    expect(roll(craftOf(7), PLAIN, 2 ** 22, 1, rand).field).toBeNull();
    expect(rand.used).toBe(1);
  });
});

describe('the field, steps 5–7 of 0x2a830 (D4, D12)', () => {
  it('draws rand % 19 for the player: fields 0–11 have 1,725 preimages, 12–18 1,724', () => {
    const entity = craftOf(0);
    const counts = histogram((value) => {
      setStates(entity, {});
      return roll(entity, PLAIN, 10, 0, scriptedRand([value])).field;
    });
    expect(counts).toEqual(new Map(Array.from({ length: 19 }, (_, field) => [field, field <= 11 ? 1725 : 1724])));
  });

  it('draws rand % 9 for any other craft, the wingman too: fields 0–7 have 3,641 preimages, 8 3,640', () => {
    for (const kindBit of [1, 7]) {
      const entity = craftOf(kindBit);
      const counts = histogram((value) => {
        setStates(entity, {});
        return roll(entity, PLAIN, 10, 0, scriptedRand([value])).field;
      });
      expect(counts).toEqual(new Map(Array.from({ length: 9 }, (_, field) => [field, field <= 7 ? 3641 : 3640])));
    }
  });

  it('keeps the drawn field for a damage roll, even a damaged one', () => {
    const entity = craftOf(7, { 3: 2 });
    expect(roll(entity, PLAIN, 10, 0, scriptedRand([3]))).toEqual({ field: 3, applied: false, heavyDamage: null });
    expect(damagedFields(entity)).toEqual({ 3: 2 });
  });

  it('moves a forced-only roll to the first undamaged field from the drawn one, then from 0', () => {
    // Forced (low byte 0), no damage roll (t = 0), field 3: 3 is damaged, 4 is not.
    const forward = craftOf(7, { 0: 1, 1: 1, 3: 1, 5: 2 });
    expect(roll(forward, PLAIN, 0, 100, scriptedRand([0, 0, 3]), { noAttacker: true }).field).toBe(4);
    expect(damagedFields(forward)).toEqual({ 0: 1, 1: 1, 3: 1, 4: 1, 5: 2 });
    // Field 6: 6–8 damaged, so from 0: 0 and 1 damaged, 2 is the first undamaged.
    const wrapped = craftOf(7, { 0: 1, 1: 2, 6: 1, 7: 1, 8: 2 });
    expect(roll(wrapped, PLAIN, 0, 100, scriptedRand([0, 0, 6]), { noAttacker: true }).field).toBe(2);
    // Only fields 0–8 count for other craft: 9–18 being undamaged does not stop the search.
    const full = craftOf(7, { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 2, 6: 1, 7: 1, 8: 2 });
    const rand = scriptedRand([0, 0, 4, 5]);
    expect(roll(full, PLAIN, 0, 100, rand, { noAttacker: true })).toEqual({ field: 5, applied: false, heavyDamage: null });
    expect(rand.used).toBe(4);
  });

  it('searches all 19 fields for the player', () => {
    const player = craftOf(0, Object.fromEntries(Array.from({ length: 18 }, (_, index) => [index, 1])) as Record<number, SubsystemState>);
    expect(roll(player, PLAIN, 0, 100, scriptedRand([0, 0, 4]), { noAttacker: true }).field).toBe(18);
  });
});

describe('the damage itself, step 8 of 0x2a830 (D4, D6)', () => {
  it('raises a field below state 2 by one and leaves states 2 and 3', () => {
    const entity = craftOf(7, { 1: 1, 2: 2, 3: 3 });
    expect(roll(entity, PLAIN, 10, 0, scriptedRand([0])).applied).toBe(true);
    expect(roll(entity, PLAIN, 10, 0, scriptedRand([1])).applied).toBe(true);
    expect(roll(entity, PLAIN, 10, 0, scriptedRand([2])).applied).toBe(false);
    expect(roll(entity, PLAIN, 10, 0, scriptedRand([3])).applied).toBe(false);
    expect(damagedFields(entity)).toEqual({ 0: 1, 1: 2, 2: 2, 3: 3 });
    expect(Object.isFrozen(entity.combat.subsystems)).toBe(true);
  });

  it('never takes fields 10 and 13 past state 1, yet counts the damage as applied', () => {
    const player = craftOf(0, { 13: 1 });
    expect(roll(player, PLAIN, 10, 0, scriptedRand([10]))).toMatchObject({ field: 10, applied: true });
    expect(roll(player, PLAIN, 10, 0, scriptedRand([10]))).toMatchObject({ field: 10, applied: true });
    expect(roll(player, PLAIN, 10, 0, scriptedRand([13]))).toMatchObject({ field: 13, applied: true });
    expect(damagedFields(player)).toEqual({ 10: 1, 13: 1 });
  });

  it('disturbs the steering with field 7: level 1 without a draw, level 2 with three', () => {
    const entity = craftOf(7);
    const first = scriptedRand([7]);
    roll(entity, PLAIN, 10, 0, first);
    expect([steered(entity).disturbance, first.used, entity.combat.subsystems[7]]).toEqual([{ level: 1 }, 1, 1]);
    const second = scriptedRand([7, 96, 0, 32767]);
    roll(entity, PLAIN, 10, 0, second);
    // 32767 = 193 × 169 + 150, so 150 − 96 = 54.
    expect([steered(entity).disturbance, second.used, entity.combat.subsystems[7]]).toEqual([{ level: 2, biases: [0, -96, 54] }, 4, 2]);
    const third = scriptedRand([7]);
    roll(entity, PLAIN, 10, 0, third);
    expect([steered(entity).disturbance, third.used]).toEqual([{ level: 2, biases: [0, -96, 54] }, 1]);
  });

  it('damages the drawn list-1 mount for field 5 and the list-0 mount for field 8, leaving both fields', () => {
    const entity = craftOf(7, {}, ARMED);
    // Field 5, entry 0 % 1 → mount 1 (missile, 4 left): damaged, keeps 7 % 4 = 3.
    const missiles = scriptedRand([5, 0, 7]);
    expect(roll(entity, ARMED, 10, 0, missiles)).toEqual({ field: 5, applied: true, heavyDamage: null });
    expect(missiles.used).toBe(3);
    // Field 8, entry 0 → mount 0 (gun, none left): damaged, no ammunition draw.
    const guns = scriptedRand([8, 0]);
    expect(roll(entity, ARMED, 10, 0, guns)).toEqual({ field: 8, applied: true, heavyDamage: null });
    expect(guns.used).toBe(2);
    expect(entity.combat.weapons.mounts.map(({ damage, ammunition }) => [damage, ammunition])).toEqual([[1, 0], [1, 3]]);
    expect(damagedFields(entity)).toEqual({});
  });

  it('does nothing to the mounts when field 5 or 8 is already at state 2, and draws nothing for a craft without mounts', () => {
    const player = craftOf(0, { 5: 2 }, ARMED);
    const blocked = scriptedRand([5]);
    expect(roll(player, ARMED, 10, 0, blocked).applied).toBe(false);
    expect([blocked.used, player.combat.weapons.mounts[1].damage]).toEqual([1, 0]);
    const unarmed = craftOf(7);
    const rand = scriptedRand([8]);
    expect(roll(unarmed, PLAIN, 10, 0, rand).applied).toBe(true);
    expect(rand.used).toBe(1);
    expect(unarmed.combat.weapons).toEqual(buildWeaponBlock(PLAIN));
  });
});

describe('the heavy-damage note 0x69e5c, step 9 of 0x2a830 (D4, D11)', () => {
  const firstFields = (count: number): Record<number, SubsystemState> =>
    Object.fromEntries(Array.from({ length: count }, (_, index) => [index, 1])) as Record<number, SubsystemState>;

  it('notes 0 from 9 damaged fields and 1 from 14, counted after the damage', () => {
    expect(roll(craftOf(0, firstFields(7)), PLAIN, 10, 0, scriptedRand([18])).heavyDamage).toBeNull();
    expect(roll(craftOf(0, firstFields(8)), PLAIN, 10, 0, scriptedRand([18])).heavyDamage).toBe(0);
    expect(roll(craftOf(0, firstFields(12)), PLAIN, 10, 0, scriptedRand([18])).heavyDamage).toBe(0);
    expect(roll(craftOf(0, firstFields(13)), PLAIN, 10, 0, scriptedRand([18])).heavyDamage).toBe(1);
  });

  it('notes on every roll that picks a field, also one already at state 2, but not without a roll', () => {
    const player = craftOf(0, { ...firstFields(9), 0: 2 });
    expect(roll(player, PLAIN, 10, 0, scriptedRand([0]))).toEqual({ field: 0, applied: false, heavyDamage: 0 });
    expect(roll(player, PLAIN, 0, 100, scriptedRand([])).heavyDamage).toBeNull();
  });

  it('counts the fields only for the player', () => {
    const other = craftOf(7, firstFields(19));
    expect(roll(other, PLAIN, 10, 0, scriptedRand([0])).heavyDamage).toBeNull();
  });
});
