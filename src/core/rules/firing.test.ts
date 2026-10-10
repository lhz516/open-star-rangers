import { describe, expect, it } from 'vitest';
import { readCraftInfo } from '../../content/rule-data/craft-info.ts';
import { craft, gun, missile, mount, syntheticCraftInfo } from '../../content/rule-data/rule-data.test-support.ts';
import type { ShotTrigger, Vec3 } from '../contracts/domain-events.ts';
import { CoreFaultError } from '../errors.ts';
import { blankCraftCombat, EntityTable, type Entity, type Matrix3 } from '../world/entity-table.ts';
import type { WorldRuleData } from '../world/rule-data.ts';
import { entityInit, expectFault } from '../world/world.test-support.ts';
import { buildWeaponBlock, type CraftEntity } from './combat-init.ts';
import {
  acquireAutomaticTarget, aimSolution, fireAutomaticMounts, fireList, inArc, inHemisphere, updateLock, type FiringData, type Launch, type ShotTarget,
} from './firing.ts';
import { craftMovementBlock } from './flight-state.ts';
import { normalise } from './load-transforms.ts';
import { rowOf } from './movement-builders.ts';
import { RAND_SCALE } from './original-random.ts';
import { DIRECTION_TABLE } from './random-direction.ts';
import { scriptedRand } from './rand.test-support.ts';

// Expectations follow docs/original/formats/executable.md W5–W10 and W12–W13 and docs/plan/p3/02/spec.md CR-05 and
// CR-11, worked out by hand from synthetic records; nothing here is original data.

const f = Math.fround;
const vec = (x: number, y: number, z: number): Vec3 => Object.freeze({ x, y, z });
const matrix = (...rows: number[]) => Object.freeze(rows) as unknown as Matrix3;
const IDENTITY = matrix(1, 0, 0, 0, 1, 0, 0, 0, 1);
const plain = (rows: readonly number[]) => rows.map((value) => value + 0);
const CLOCK = 100;

/**
 * Guns: 0 fixed (cooldown 4, cost 5), 1 fixed (cost 7), 2 aimed (speed 100, cost 2), 3 automatic (cooldown 2, burst 3,
 * cost 99). Missiles: 0 guided (cooldown 6; lock cone 0.5, stages 8 and 20, grace 30), 1 unguided.
 * Mounts of kinds 0 and 7: 0 gun 0 firing together with 1; 1 gun 1; 2 gun 2 alternating with 3 (arc: row 3 ≥ 0.5);
 * 3 gun 2; 4 missile 0 alternating with 5 (one round); 5 missile 0 (one round); 6 missile 1 (two rounds); 7 gun 3; 8 gun 2
 * firing together with 9, offset in the aim; 9 gun 2, offset in the aim. Lists: [0, 2, 8], [4, 6], [6].
 */
function info(change: (content: ReturnType<typeof syntheticCraftInfo>) => void = () => {}) {
  const content = syntheticCraftInfo();
  content.guns = [
    gun({ at08: 100, at14: 4, at18: 5, at28: 0 }),
    gun({ at08: 100, at14: 4, at18: 7, at28: 0 }),
    gun({ at08: 100, at14: 4, at18: 2, at28: 1 }),
    gun({ at08: 50, at14: 2, at18: 99, at28: 2, at2C: 3 }),
  ];
  content.missiles = [
    missile({ body: 0, at18: 1, at1C: 6, at20: 0, at28: 0.5, at30: 8, at34: 20, at38: 30, at3C: 0, at40: 0.5 }),
    missile({ body: 1, at18: 0, at1C: 6, at20: 0 }),
  ];
  const arc = { at20: 0x01, at24: [0.5, 0, 0], at30: 0, at34: 0 };
  const mounts = [
    mount({ weapon: 0, at18: 1, at20: 0, at34: 0 }),
    mount({ weapon: 1, at20: 0, at34: 0 }),
    mount({ weapon: 2, at1C: 3, ...arc }),
    mount({ weapon: 2, ...arc }),
    mount({ at10: 1, weapon: 0, at0C: 1, at1C: 5 }),
    mount({ at10: 1, weapon: 0, at0C: 1 }),
    mount({ at10: 1, weapon: 1, at0C: 2 }),
    mount({ weapon: 3, ...arc }),
    mount({ weapon: 2, at18: 9, ...arc, at34: 1 }),
    mount({ weapon: 2, ...arc, at34: 1 }),
  ];
  const lists = [[0, 2, 8], [4, 6], [6]];
  content.craft[0] = craft({ mounts, mountLists: lists });
  content.craft[7] = craft({ mounts, mountLists: lists });
  change(content);
  return readCraftInfo(content);
}

const OFFSETS = [vec(1, 0, 0), vec(-1, 0, 0), vec(0, 1, 2), vec(0, -1, 2), vec(0, 0, 3), vec(0, 0, -3), vec(2, 2, 2), vec(0, 0, 5), vec(0, 0, 10), vec(5, 0, 10)];
const RANGE_SQUARED = 10_000;

function data(change?: Parameters<typeof info>[0]): FiringData {
  const content = info(change);
  const rules = {
    craft: Array.from({ length: 20 }, (_, kindBit) => (kindBit === 0 || kindBit === 7 ? { mountOffsets: OFFSETS } : null)),
    guns: content.guns.map(() => ({ range: 100, rangeSquared: RANGE_SQUARED })),
    missiles: content.missiles.map(() => ({ range: 100, rangeSquared: RANGE_SQUARED, fuseRadiusSquared: 1 })),
  } as unknown as WorldRuleData;
  return { info: content, rules };
}

/** A shooter of `kindBit` at the origin facing +z at speed 40, charge 100, and a table to add targets to. */
function shooter(kindBit = 0, change?: Parameters<typeof info>[0]): [CraftEntity, EntityTable, FiringData] {
  const firing = data(change);
  const table = new EntityTable();
  const entity = table.allocate(entityInit(kindBit, {
    position: vec(0, 0, 0),
    orientation: IDENTITY,
    movement: craftMovementBlock(0x80, 40, 80),
    combat: { ...blankCraftCombat(), charge: 100, weapons: buildWeaponBlock(firing.info.craft[kindBit]) },
  })) as CraftEntity;
  return [entity, table, firing];
}

/** A hostile craft (kind 7) at `position` with row 3 `forward` and speed `speed`. */
function target(table: EntityTable, position: Vec3, speed = 0, orientation = IDENTITY): Entity {
  return table.allocate(entityInit(7, { position, orientation, movement: craftMovementBlock(0x80, speed, 80) }));
}

const NO_TARGET: ShotTarget = { id: null, entity: undefined };
const at = (entity: Entity): ShotTarget => ({ id: entity.id, entity });
const PRIMARY: ShotTrigger = { type: 'command', channel: 'primary', commandIndex: 2 };

/** Fires `list` of `entity` and collects its launches. */
function fire(entity: CraftEntity, firing: FiringData, list: 0 | 1 | 2, shot: ShotTarget = NO_TARGET, rand = scriptedRand([]), trigger = PRIMARY) {
  const launches: Launch[] = [];
  const outcome = fireList(firing, entity, list, shot, trigger, CLOCK, rand, (launch) => launches.push(launch));
  return { outcome, launches };
}

const select = (entity: CraftEntity, list: 0 | 1, index: number, mountIndex: number) => Object.assign(entity.combat.weapons.selections[list], { index, mount: mountIndex });
const mountsOf = (entity: CraftEntity) => entity.combat.weapons.mounts;

describe('the trigger routine 0x2d578 on a list (W5, AC-06)', () => {
  it('fires nothing without a current mount', () => {
    const [entity, , firing] = shooter();
    entity.combat.weapons.selections[0].mount = null;
    expect(fire(entity, firing, 0).outcome).toBeNull();
  });

  it('fires each group of the fire-together chain once, restarting each cooldown and spending the player\'s charge', () => {
    const [entity, , firing] = shooter();
    const { outcome, launches } = fire(entity, firing, 0);
    expect(outcome).toEqual({ launched: 2, last: 'launched' });
    expect(launches).toEqual([
      { family: 'gun', shooter: entity.id, gun: 0, mount: 0, offset: OFFSETS[0], orientation: null, trigger: PRIMARY },
      { family: 'gun', shooter: entity.id, gun: 1, mount: 1, offset: OFFSETS[1], orientation: null, trigger: PRIMARY },
    ]);
    expect(mountsOf(entity).slice(0, 2).map(({ lastShotClock }) => lastShotClock)).toEqual([CLOCK, CLOCK]);
    expect(entity.combat.charge).toBe(100 - 5 - 7);
  });

  it('fires at equality of the cooldown and refuses one unit before it', () => {
    const [entity, , firing] = shooter();
    mountsOf(entity)[0].lastShotClock = CLOCK - 4;
    mountsOf(entity)[1].lastShotClock = CLOCK - 3;
    const { outcome, launches } = fire(entity, firing, 0);
    expect(launches.map(({ mount: index }) => index)).toEqual([0]);
    expect(outcome).toEqual({ launched: 1, last: 'cooldown' });
    expect(mountsOf(entity)[1].lastShotClock).toBe(CLOCK - 3);
  });

  it('faults on a cooldown deadline past the safe integers instead of wrapping', () => {
    const [entity, , firing] = shooter();
    mountsOf(entity)[0].lastShotClock = Number.MAX_SAFE_INTEGER - 1;
    expectFault(() => fire(entity, firing, 0), 'budget-exhausted', 'firing.cooldown-clock');
  });

  it('gates and charges only the player, the cost against the charge in i32 with equality passing', () => {
    const [player, , firing] = shooter();
    player.combat.charge = 5;
    expect(fire(player, firing, 0).outcome).toEqual({ launched: 1, last: 'insufficient-charge' });
    expect(player.combat.charge).toBe(0);
    const [ai, , aiFiring] = shooter(7);
    ai.combat.charge = 0;
    expect(fire(ai, aiFiring, 0).outcome).toEqual({ launched: 2, last: 'launched' });
    expect(ai.combat.charge).toBe(0);
  });

  it.each([
    ['charge before a destroyed mount (the player)', 0, { charge: 0, damage: 2 }, 'insufficient-charge'],
    ['a destroyed mount before the charge of an AI shooter', 7, { charge: 0, damage: 2 }, 'weapon-disabled'],
    ['a destroyed mount before the cooldown', 0, { damage: 2, lastShotClock: CLOCK }, 'weapon-disabled'],
    ['the cooldown before a misfire draw', 0, { damage: 1, lastShotClock: CLOCK }, 'cooldown'],
  ] as const)('orders the gun reasons: %s', (_, kindBit, change, reason) => {
    const [entity, , firing] = shooter(kindBit);
    select(entity, 0, 1, 3);
    if ('charge' in change) entity.combat.charge = change.charge;
    Object.assign(mountsOf(entity)[3], { damage: change.damage, lastShotClock: 'lastShotClock' in change ? change.lastShotClock : null });
    const rand = scriptedRand([]);
    expect(fire(entity, firing, 0, NO_TARGET, rand).outcome).toEqual({ launched: 0, last: reason });
  });

  it('misfires a damaged gun on an odd draw, restarting its cooldown without charge, and fires on an even one', () => {
    const [entity, , firing] = shooter();
    select(entity, 0, 1, 3);
    mountsOf(entity)[3].damage = 1;
    const odd = scriptedRand([7]);
    expect(fire(entity, firing, 0, NO_TARGET, odd)).toEqual({ outcome: { launched: 0, last: 'misfire' }, launches: [] });
    expect([odd.used, mountsOf(entity)[3].lastShotClock, entity.combat.charge]).toEqual([1, CLOCK, 100]);
    mountsOf(entity)[3].lastShotClock = null;
    const even = scriptedRand([32766]);
    expect(fire(entity, firing, 0, NO_TARGET, even).outcome).toEqual({ launched: 1, last: 'launched' });
    expect(even.used).toBe(1);
  });

  it('keeps the reason of the last attempt over the groups', () => {
    const [entity, , firing] = shooter();
    mountsOf(entity)[0].damage = 2;
    mountsOf(entity)[1].lastShotClock = CLOCK;
    expect(fire(entity, firing, 0).outcome).toEqual({ launched: 0, last: 'cooldown' });
    mountsOf(entity)[0].damage = 0;
    mountsOf(entity)[0].lastShotClock = CLOCK;
    mountsOf(entity)[1].damage = 2;
    expect(fire(entity, firing, 0).outcome).toEqual({ launched: 0, last: 'weapon-disabled' });
  });
});

describe('alternates and aimed guns (W5–W7)', () => {
  it('without a target fails the aimed head (alternate, +0x30 = 0) and fires the alternate unaimed', () => {
    const [entity, , firing] = shooter();
    select(entity, 0, 1, 2);
    const { outcome, launches } = fire(entity, firing, 0);
    expect(outcome).toEqual({ launched: 1, last: 'launched' });
    expect(launches).toMatchObject([{ gun: 2, mount: 3, orientation: IDENTITY }]);
    expect(mountsOf(entity).slice(2, 4).map(({ lastShotClock }) => lastShotClock)).toEqual([null, CLOCK]);
  });

  it('fires the aimed head along the aim solution in its arc, one shot for the group', () => {
    const [entity, table, firing] = shooter();
    select(entity, 0, 1, 2);
    const ahead = target(table, vec(0, 2, 1000));
    const { launches } = fire(entity, firing, 0, at(ahead));
    const aim = aimSolution(entity, OFFSETS[2], firing.info.craft[0].mounts[2], 100, ahead, 0);
    expect(launches).toEqual([{ family: 'gun', shooter: entity.id, gun: 2, mount: 2, offset: OFFSETS[2], orientation: aim, trigger: PRIMARY }]);
    expect(aim).not.toEqual(IDENTITY);
  });

  it('gives out-of-arc for a target behind and fires the alternate unaimed, rows 1 and 3 negated for arc bit 0x08', () => {
    const [entity, table, firing] = shooter();
    select(entity, 0, 1, 2);
    const behind = target(table, vec(0, 0, -1000));
    expect(fire(entity, firing, 0, at(behind)).outcome).toEqual({ launched: 1, last: 'launched' });
    // The alternate fired at this clock, so it is not tried after the head: the head's reason is the last.
    expect(fire(entity, firing, 0, at(behind)).outcome).toEqual({ launched: 0, last: 'out-of-arc' });
    mountsOf(entity)[3].lastShotClock = null;
    mountsOf(entity)[3].damage = 2;
    expect(fire(entity, firing, 0, at(behind)).outcome).toEqual({ launched: 0, last: 'weapon-disabled' });

    const [flipped, flippedTable, flippedData] = shooter(0, (content) => { content.craft[0].mounts[3].at20 = 0x08; });
    select(flipped, 0, 1, 2);
    const { launches } = fire(flipped, flippedData, 0, at(target(flippedTable, vec(0, 0, -1000))));
    expect(plain(launches[0].family === 'gun' ? launches[0].orientation ?? [] : [])).toEqual([-1, 0, 0, 0, 1, 0, 0, 0, -1]);
  });

  it('fires an aimed head without an alternate, or with +0x30 ≠ 0, unaimed when the aim fails', () => {
    const [entity, table, firing] = shooter();
    select(entity, 0, 1, 3);
    expect(fire(entity, firing, 0, at(target(table, vec(0, 0, -1000)))).launches).toMatchObject([{ mount: 3, orientation: IDENTITY }]);
  });

  it('tries the alternate that fired least recently first, the first on a tie, an unset clock before any', () => {
    const [entity, table, firing] = shooter();
    select(entity, 0, 1, 2);
    const ahead = target(table, vec(0, 0, 1000));
    mountsOf(entity)[2].lastShotClock = CLOCK - 10;
    mountsOf(entity)[3].lastShotClock = CLOCK - 20;
    expect(fire(entity, firing, 0, at(ahead)).launches.map(({ mount: index }) => index)).toEqual([3]);
    mountsOf(entity)[2].lastShotClock = CLOCK - 20;
    mountsOf(entity)[3].lastShotClock = CLOCK - 20;
    expect(fire(entity, firing, 0, at(ahead)).launches.map(({ mount: index }) => index)).toEqual([2]);
    mountsOf(entity)[2].lastShotClock = 0;
    mountsOf(entity)[3].lastShotClock = null;
    expect(fire(entity, firing, 0, at(ahead)).launches.map(({ mount: index }) => index)).toEqual([3]);
  });

  it('attempts only the head when every alternate fired at this clock already', () => {
    const [entity, , firing] = shooter();
    select(entity, 0, 1, 2);
    mountsOf(entity)[2].lastShotClock = CLOCK;
    mountsOf(entity)[3].lastShotClock = CLOCK;
    mountsOf(entity)[3].damage = 2;
    expect(fire(entity, firing, 0).outcome).toEqual({ launched: 0, last: 'cooldown' });
  });

  it('reuses the first aimed mount\'s solution for later aimed mounts of the call, whatever their offsets', () => {
    const [entity, table, firing] = shooter();
    select(entity, 0, 2, 8);
    const ahead = target(table, vec(30, 0, 1000), 20, matrix(0, 0, -1, 0, 1, 0, 1, 0, 0));
    const { launches } = fire(entity, firing, 0, at(ahead));
    const { mounts } = firing.info.craft[0];
    const first = aimSolution(entity, OFFSETS[8], mounts[8], 100, ahead, 20);
    expect(launches.map((launch) => (launch.family === 'gun' ? launch.orientation : null))).toEqual([first, first]);
    expect(aimSolution(entity, OFFSETS[9], mounts[9], 100, ahead, 20)).not.toEqual(first);
  });
});

describe('the aim solution 0x2e9d4 (W7)', () => {
  const fixedMount = (at34: number) => ({ at34 }) as Parameters<typeof aimSolution>[2];
  const shooterPose = { position: vec(0, 0, 0), orientation: IDENTITY };

  it('aims straight at a still target ahead', () => {
    expect(aimSolution(shooterPose, vec(0, 0, 0), fixedMount(0), 100, { position: vec(0, 0, 1000), orientation: IDENTITY }, 0)).toEqual(IDENTITY);
  });

  it('leads a moving target by its speed times the time of flight along its row 3', () => {
    // Distance 1000 at speed 100: t = 10; lead 50 × 10 = 500 along +x.
    const moving = { position: vec(0, 0, 1000), orientation: matrix(0, 0, -1, 0, 1, 0, 1, 0, 0) };
    const aim = aimSolution(shooterPose, vec(0, 0, 0), fixedMount(0), 100, moving, 50);
    expect(rowOf(aim, 2)).toEqual(normalise(vec(500, 0, 1000)));
    // Row 1 is the old row 2 × row 3, normalised; row 2 = row 3 × row 1.
    const { x, z } = rowOf(aim, 2);
    expect(rowOf(aim, 0)).toEqual(normalise(vec(f(1 * z), 0, f(-x))));
  });

  it('starts from the mount offset along the shooter\'s rows only for mount +0x34 ≠ 0', () => {
    const moving = { position: vec(0, 0, 1000), orientation: matrix(0, 0, -1, 0, 1, 0, 1, 0, 0) };
    const aim = aimSolution(shooterPose, vec(0, 0, 10), fixedMount(1), 100, moving, 50);
    // Distance 990: t = F(9.9); the aim point x = F(50 × t); row 3 = (that, 0, 990).
    expect(rowOf(aim, 2)).toEqual(normalise(vec(f(50 * f(9.9)), 0, 990)));
    expect(aimSolution(shooterPose, vec(0, 0, 10), fixedMount(0), 100, moving, 50)).toEqual(aimSolution(shooterPose, vec(0, 0, 0), fixedMount(0), 100, moving, 50));
  });

  it('stores the x and y of the aim point but keeps z unrounded until row 3', () => {
    // Shooter at 2^24 − 1 on x and z, target at 2^24, its row 3 (0.5, 0, 0.5) at speed 1; distance √2 at speed F(√2): t = 1.
    const edge = 2 ** 24;
    const aim = aimSolution(
      { position: vec(edge - 1, 0, edge - 1), orientation: IDENTITY }, vec(0, 0, 0), fixedMount(0), f(Math.SQRT2),
      { position: vec(edge, 0, edge), orientation: matrix(1, 0, 0, 0, 1, 0, 0.5, 0, 0.5) }, 1,
    );
    // x: F(F(0.5) + 2^24) = 2^24, minus 2^24 − 1 is 1; z: 0.5 + 2^24 − (2^24 − 1) = 1.5.
    expect(rowOf(aim, 2)).toEqual(normalise(vec(1, 0, 1.5)));
  });

  it('faults on a zero speed, as the original\'s unmasked division', () => {
    expect(() => aimSolution(shooterPose, vec(0, 0, 0), fixedMount(0), 0, { position: vec(0, 0, 1), orientation: IDENTITY }, 0)).toThrow(CoreFaultError);
  });
});

describe('the arc and hemisphere tests (W7)', () => {
  const arc = (at20: number, at24: [number, number, number]) => ({ at20, at24 }) as unknown as Parameters<typeof inArc>[2];

  it('compares each F(d · row) with the thresholds, equality passing', () => {
    const ahead = matrix(1, 0, 0, 0, 1, 0, 0, 0, 1);
    expect(inArc(ahead, IDENTITY, arc(0x01, [1, 0, 0]))).toBe(true);
    expect(inArc(ahead, IDENTITY, arc(0x01, [f(1.0000001), 0, 0]))).toBe(false);
    expect(inArc(ahead, IDENTITY, arc(0x08, [-1, 0, 0]))).toBe(true);
    expect(inArc(ahead, IDENTITY, arc(0x08, [0, 0, 0]))).toBe(false);
    // Row 1 (+0x28) and row 2 (+0x2C): d · row 1 = 0, d · row 2 = 0.
    expect(inArc(ahead, IDENTITY, arc(0x02 | 0x10 | 0x04 | 0x20, [9, 0, 0]))).toBe(true);
    expect(inArc(ahead, IDENTITY, arc(0x02, [9, 0.5, 0]))).toBe(false);
    expect(inArc(ahead, IDENTITY, arc(0x20, [9, 0, 0.5]))).toBe(false);
    expect(inArc(ahead, IDENTITY, arc(0x20, [9, 0, -0.5]))).toBe(true);
    expect(inArc(ahead, IDENTITY, arc(0, [9, 9, 9]))).toBe(true);
  });

  it('rounds each product to f32 before comparing', () => {
    // d · row 3 = (−2^-13 × 2^-13 + 1 × 0.5) + 0 = 0.5 − 2^-26, which rounds to 0.5.
    const aim = matrix(1, 0, 0, 0, 1, 0, 0, -(2 ** -13), 1);
    const rows = matrix(1, 0, 0, 0, 1, 0, 0, 2 ** -13, 0.5);
    expect(inArc(aim, rows, arc(0x01, [0.5, 0, 0]))).toBe(true);
  });

  it('accepts a target within range (equality passing) and on the sides the bits ask for, 0 counting as ahead', () => {
    const [entity, , firing] = shooter();
    const near = { position: vec(0, 0, 100), orientation: IDENTITY };
    // Mount 2: bit 0x01 (ahead along row 3); its gun's range² is 10000.
    expect(inHemisphere(firing, entity, near, 2)).toBe(true);
    expect(inHemisphere(firing, entity, { position: vec(0, 0, 100.0001), orientation: IDENTITY }, 2)).toBe(false);
    expect(inHemisphere(firing, entity, { position: vec(0, 0, -10), orientation: IDENTITY }, 2)).toBe(false);
    expect(inHemisphere(firing, entity, { position: vec(10, 0, 0), orientation: IDENTITY }, 2)).toBe(true);
    // Mount 0 has no arc bits.
    expect(inHemisphere(firing, entity, { position: vec(0, 0, -10), orientation: IDENTITY }, 0)).toBe(true);
  });
});

describe('missile launches 0x2e86c (W8, AC-06)', () => {
  it.each([
    ['no ammunition before a destroyed mount', { ammunition: 0, damage: 2 }, true, 'no-ammunition'],
    ['a destroyed mount before the target', { damage: 2 }, false, 'weapon-disabled'],
    ['the target of a guided missile before the cooldown', { lastShotClock: CLOCK }, false, 'no-target'],
    ['the cooldown', { lastShotClock: CLOCK - 5 }, true, 'cooldown'],
  ] as const)('orders the missile reasons: %s', (_, change, targeted, reason) => {
    const [entity, table, firing] = shooter();
    // Mount 5 (guided, no alternate) as the current list-1 mount.
    select(entity, 1, 0, 5);
    Object.assign(mountsOf(entity)[5], change);
    const shot = targeted ? at(target(table, vec(0, 0, 500))) : NO_TARGET;
    expect(fire(entity, firing, 1, shot).outcome).toEqual({ launched: 0, last: reason });
  });

  it('takes a round, restarts the cooldown and posts the lock level and the target it read; the cooldown passes at equality', () => {
    const [entity, table, firing] = shooter();
    const enemy = target(table, vec(0, 0, 500));
    entity.combat.weapons.lock.level = 3;
    mountsOf(entity)[4].lastShotClock = CLOCK - 6;
    mountsOf(entity)[5].lastShotClock = CLOCK - 1;
    const secondary: ShotTrigger = { type: 'command', channel: 'secondary', commandIndex: 0 };
    const { outcome, launches } = fire(entity, firing, 1, at(enemy), scriptedRand([]), secondary);
    expect(outcome).toEqual({ launched: 1, last: 'launched' });
    expect(launches).toEqual([
      { family: 'missile', shooter: entity.id, missile: 0, mount: 4, offset: OFFSETS[4], launchByte: 3, target: enemy.id, trigger: secondary },
    ]);
    expect([mountsOf(entity)[4].ammunition, mountsOf(entity)[4].lastShotClock]).toEqual([0, CLOCK]);
  });

  it('posts one level less from a damaged mount, at least 0', () => {
    const [entity, table, firing] = shooter();
    const enemy = target(table, vec(0, 0, 500));
    mountsOf(entity)[4].damage = 1;
    entity.combat.weapons.lock.level = 3;
    expect(fire(entity, firing, 1, at(enemy)).launches).toMatchObject([{ launchByte: 2 }]);
    mountsOf(entity)[5].damage = 1;
    entity.combat.weapons.lock.level = 0;
    expect(fire(entity, firing, 1, at(enemy)).launches).toMatchObject([{ mount: 5, launchByte: 0 }]);
  });

  it('keeps the player\'s lock while the alternate chain from the fired mount has ammunition, and clears it otherwise', () => {
    const [entity, table, firing] = shooter();
    const enemy = target(table, vec(0, 0, 500));
    const { lock } = entity.combat.weapons;
    lock.level = 4;
    fire(entity, firing, 1, at(enemy));
    // Mount 4 fired: its chain (4, 5) keeps one round.
    expect(lock.level).toBe(4);
    fire(entity, firing, 1, at(enemy));
    // Mount 4 is empty and mount 5 fires: its chain has nothing left.
    expect([mountsOf(entity)[5].ammunition, lock.level]).toEqual([0, 0]);
  });

  it('always clears an AI shooter\'s lock after a guided launch, and never after an unguided one', () => {
    const [ai, table, firing] = shooter(7);
    const enemy = target(table, vec(0, 0, 500));
    ai.combat.weapons.lock.level = 4;
    fire(ai, firing, 1, at(enemy));
    expect(ai.combat.weapons.lock.level).toBe(0);
    const [player, , playerData] = shooter();
    select(player, 1, 1, 6);
    player.combat.weapons.lock.level = 4;
    expect(fire(player, playerData, 1).launches).toMatchObject([{ missile: 1, mount: 6, launchByte: 4, target: null }]);
    expect(player.combat.weapons.lock.level).toBe(4);
  });

  it('fires list 2 for the AI with its trigger', () => {
    const [ai, , firing] = shooter(7);
    const trigger: ShotTrigger = { type: 'ai', channel: 2 };
    expect(fire(ai, firing, 2, NO_TARGET, scriptedRand([]), trigger).launches).toMatchObject([{ family: 'missile', mount: 6, trigger }]);
  });
});

describe('the missile lock 0x2ddbc (W8)', () => {
  /** The player with list-1 mount 4 (guided missile 0) and a hostile target; the lock due at the clock. */
  function locking(position = vec(0, 0, 50), kindBit = 7) {
    const [player, table, firing] = shooter();
    const enemy = table.allocate(entityInit(kindBit, { position, orientation: IDENTITY, movement: craftMovementBlock(0x80, 40, 80) }));
    return { player, enemy, firing, lock: player.combat.weapons.lock };
  }

  it.each([
    ['without a target', (setup: ReturnType<typeof locking>) => ({ ...setup, enemy: undefined })],
    ['without a list-1 mount', (setup: ReturnType<typeof locking>) => { setup.player.combat.weapons.selections[1].mount = null; return setup; }],
    ['with subsystem 3 destroyed', (setup: ReturnType<typeof locking>) => { setup.player.combat.subsystems = Object.freeze([0, 0, 0, 2, ...Array(15).fill(0)]); return setup; }],
    ['on a friendly kind', () => locking(vec(0, 0, 50), 14)],
    ['on the player kind', () => locking(vec(0, 0, 50), 0)],
  ])('drops to level 0 %s, before the update clock, without a draw', (_, change) => {
    const setup = change(locking());
    Object.assign(setup.lock, { level: 3, stageDueClock: 5, losing: true, graceDueClock: 6, nextUpdateClock: CLOCK + 50 });
    updateLock(setup.firing, setup.player, setup.enemy, CLOCK, scriptedRand([]));
    expect(setup.lock).toEqual({ level: 0, stageDueClock: 5, losing: true, graceDueClock: 6, nextUpdateClock: CLOCK + 50 });
  });

  it('waits for its update clock and needs a guided missile with ammunition on the chain', () => {
    const { player, enemy, firing, lock } = locking();
    lock.nextUpdateClock = CLOCK + 1;
    updateLock(firing, player, enemy, CLOCK, scriptedRand([]));
    expect(lock).toMatchObject({ level: 0, nextUpdateClock: CLOCK + 1 });
    lock.nextUpdateClock = 0;
    mountsOf(player)[4].ammunition = 0;
    mountsOf(player)[5].ammunition = 0;
    updateLock(firing, player, enemy, CLOCK, scriptedRand([]));
    expect(lock).toMatchObject({ level: 0, nextUpdateClock: 0 });
    select(player, 1, 1, 6);
    updateLock(firing, player, enemy, CLOCK, scriptedRand([]));
    expect(lock).toMatchObject({ level: 0, nextUpdateClock: 0 });
  });

  it('advances 0 → 1 → 2 → 3 → 4 at its deadlines, every 0x15 units', () => {
    const { player, enemy, firing, lock } = locking();
    const step = (clock: number) => {
      updateLock(firing, player, enemy, clock, scriptedRand([]));
      return [lock.level, lock.stageDueClock, lock.nextUpdateClock];
    };
    expect(step(100)).toEqual([1, 108, 121]);
    expect(step(121)).toEqual([2, 131, 142]);
    expect(step(142)).toEqual([3, 152, 163]);
    expect(step(163)).toEqual([4, 152, 184]);
    expect(step(184)).toEqual([4, 152, 205]);
    lock.level = 2;
    lock.stageDueClock = 300;
    expect(step(205)).toEqual([2, 300, 226]);
  });

  it('needs the target within range and the cone, both strict', () => {
    const inRange = locking(vec(0, 0, 99.99));
    updateLock(inRange.firing, inRange.player, inRange.enemy, CLOCK, scriptedRand([]));
    expect(inRange.lock.level).toBe(1);
    // At the range, behind, and 79° off row 3 (cos 10/51 < 0.5).
    for (const position of [vec(0, 0, 100), vec(0, 0, -50), vec(50, 0, 10)]) {
      const { player, enemy, firing, lock } = locking(position);
      updateLock(firing, player, enemy, CLOCK, scriptedRand([]));
      expect([lock.level, lock.losing]).toEqual([0, true]);
    }
  });

  it('also needs the target heading along the player for missile +0x3C ≠ 0', () => {
    const { player, enemy, firing, lock } = locking();
    const missileWithHeading = { ...firing.info.missiles[0], at3C: 1, at40: 0.5 };
    const withHeading: FiringData = { ...firing, info: { ...firing.info, missiles: [missileWithHeading, firing.info.missiles[1]] } };
    updateLock(withHeading, player, enemy, CLOCK, scriptedRand([]));
    expect(lock.level).toBe(1);
    const away = { ...enemy, orientation: matrix(1, 0, 0, 0, 1, 0, 0, 0, -1) } as Entity;
    lock.nextUpdateClock = 0;
    updateLock(withHeading, player, away, CLOCK, scriptedRand([]));
    expect([lock.level, lock.losing]).toEqual([1, true]);
  });

  it('replaces the geometry by one draw while subsystem 3 is damaged: (rand & 0xFF) > 0x80', () => {
    const behind = locking(vec(0, 0, -50));
    behind.player.combat.subsystems = Object.freeze([0, 0, 0, 1, ...Array(15).fill(0)]);
    const rand = scriptedRand([0x181]);
    updateLock(behind.firing, behind.player, behind.enemy, CLOCK, rand);
    expect([behind.lock.level, rand.used]).toEqual([1, 1]);
    const ahead = locking();
    ahead.player.combat.subsystems = behind.player.combat.subsystems;
    updateLock(ahead.firing, ahead.player, ahead.enemy, CLOCK, scriptedRand([0x80]));
    expect([ahead.lock.level, ahead.lock.losing]).toEqual([0, true]);
  });

  it('loses the lock only on a failure at or after the grace deadline, which each earlier failure renews', () => {
    const { player, firing, lock } = locking();
    const [, table] = shooter();
    const away = target(table, vec(0, 0, -50));
    Object.assign(lock, { level: 2, stageDueClock: 0 });
    updateLock(firing, player, away, 100, scriptedRand([]));
    expect(lock).toMatchObject({ level: 2, losing: true, graceDueClock: 130, nextUpdateClock: 121 });
    updateLock(firing, player, away, 121, scriptedRand([]));
    expect(lock).toMatchObject({ level: 2, losing: true, graceDueClock: 151 });
    updateLock(firing, player, away, 151, scriptedRand([]));
    expect(lock).toMatchObject({ level: 0, losing: true, nextUpdateClock: 172 });
  });

  it.each([
    [1, [1, 50, false]],
    [2, [2, 210, false]],
    [3, [3, 210, false]],
    [4, [3, 210, false]],
  ] as const)('resumes from level %i on a success while losing', (level, [after, due, losing]) => {
    const { player, enemy, firing, lock } = locking();
    Object.assign(lock, { level, stageDueClock: 50, losing: true, graceDueClock: 999 });
    updateLock(firing, player, enemy, 200, scriptedRand([]));
    expect([lock.level, lock.stageDueClock, lock.losing]).toEqual([level === 1 ? 2 : after, level === 1 ? 210 : due, losing]);
  });

  it('faults on a deadline before clock 0 rather than wrapping', () => {
    const { player, enemy, firing } = locking();
    const negative: FiringData = { ...firing, info: { ...firing.info, missiles: [{ ...firing.info.missiles[0], at30: -200 }, firing.info.missiles[1]] } };
    expectFault(() => updateLock(negative, player, enemy, CLOCK, scriptedRand([])), 'invariant-violated', 'firing.lock-clock');
  });
});

describe('automatic mounts 0x2dad0 and 0x2da58 (W9, AC-06)', () => {
  /** A shooter whose automatic mount 7 is loaded with `burst` rounds along the identity aim. */
  function automatic(kindBit = 7, burst = 2): [CraftEntity, EntityTable, FiringData] {
    const [entity, table, firing] = shooter(kindBit);
    Object.assign(mountsOf(entity)[7], { burst, aim: IDENTITY });
    return [entity, table, firing];
  }
  const shoot = (entity: CraftEntity, firing: FiringData, rand: ReturnType<typeof scriptedRand>) => {
    const launches: Launch[] = [];
    fireAutomaticMounts(firing, entity, CLOCK, rand, (launch) => launches.push(launch));
    return launches;
  };
  const jitter = (base: number, rand: number, component: number) => f(base + f((rand * RAND_SCALE * 3 + 2) * component));

  it('fires a ready automatic gun along its aim, from its offset plus a jitter of five draws', () => {
    const [entity, , firing] = automatic();
    const rand = scriptedRand([1, 3, 0, 32767, 16384]);
    const launches = shoot(entity, firing, rand);
    // Entry 1 of the direction table in octant 3 (z negated).
    const { x, y, z } = DIRECTION_TABLE[1];
    expect(launches).toEqual([{
      family: 'gun', shooter: entity.id, gun: 3, mount: 7, orientation: IDENTITY, trigger: { type: 'automatic' },
      offset: vec(jitter(OFFSETS[7].x, 0, x), jitter(OFFSETS[7].y, 32767, y), jitter(OFFSETS[7].z, 16384, -z)),
    }]);
    expect(rand.used).toBe(5);
    expect([mountsOf(entity)[7].burst, mountsOf(entity)[7].lastShotClock, entity.combat.charge]).toEqual([1, CLOCK, 100]);
  });

  it('needs no charge even for the player, and consumes a round on a failed damage draw', () => {
    const [player, , firing] = automatic(0);
    player.combat.charge = 0;
    expect(shoot(player, firing, scriptedRand([0, 0, 0, 0, 0]))).toHaveLength(1);
    const [damaged, , damagedData] = automatic();
    mountsOf(damaged)[7].damage = 1;
    const rand = scriptedRand([0x80]);
    expect(shoot(damaged, damagedData, rand)).toEqual([]);
    expect([rand.used, mountsOf(damaged)[7].burst, mountsOf(damaged)[7].lastShotClock]).toEqual([1, 1, CLOCK]);
    expect(shoot(damaged, damagedData, scriptedRand([])).length).toBe(0);
  });

  it('skips a mount with no burst, destroyed or cooling (equality fires), and every other mount', () => {
    for (const change of [{ burst: 0 }, { damage: 2 }, { lastShotClock: CLOCK - 1 }]) {
      const [entity, , firing] = automatic();
      Object.assign(mountsOf(entity)[7], change);
      const before = { ...mountsOf(entity)[7] };
      expect(shoot(entity, firing, scriptedRand([]))).toEqual([]);
      expect(mountsOf(entity)[7]).toEqual(before);
    }
    const [entity, , firing] = automatic();
    mountsOf(entity)[7].lastShotClock = CLOCK - 2;
    expect(shoot(entity, firing, scriptedRand([0, 0, 0, 0, 0]))).toHaveLength(1);
  });

  it('acquires a resolving target in the arc: the aim, then the burst', () => {
    const [entity, table, firing] = automatic(7, 0);
    const ahead = target(table, vec(0, 3, 1000));
    mountsOf(entity)[7].autoTarget = ahead.id;
    expect(acquireAutomaticTarget(firing, entity, 7, (id) => table.get(id))).toBe(true);
    expect(mountsOf(entity)[7]).toMatchObject({ burst: 3, aim: aimSolution(entity, OFFSETS[7], firing.info.craft[7].mounts[7], 50, ahead, 0) });
  });

  it('writes the aim even when the arc fails, and drops a target that no longer resolves', () => {
    const [entity, table, firing] = automatic(7, 0);
    const behind = target(table, vec(0, 0, -1000));
    mountsOf(entity)[7].autoTarget = behind.id;
    expect(acquireAutomaticTarget(firing, entity, 7, (id) => table.get(id))).toBe(false);
    expect(mountsOf(entity)[7]).toMatchObject({ burst: 0, autoTarget: behind.id });
    expect(mountsOf(entity)[7].aim).not.toEqual(IDENTITY);
    expect(acquireAutomaticTarget(firing, entity, 7, () => undefined)).toBe(false);
    expect(mountsOf(entity)[7].autoTarget).toBeNull();
    expectFault(() => acquireAutomaticTarget(firing, entity, 4, () => undefined), 'invariant-violated', 'firing.automatic-mount');
  });
});
