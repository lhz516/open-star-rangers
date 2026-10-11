import { describe, expect, it } from 'vitest';
import { readAssetId } from '../../content/asset-id.ts';
import type { DebrisRecord } from '../../content/rule-data/debris-parameters.ts';
import type { Vec3 } from '../contracts/domain-events.ts';
import { EntityTable, type Entity, type FragmentCombat, type Matrix3, type SpinningMovementBlock } from '../world/entity-table.ts';
import { entityInit, expectFault } from '../world/world.test-support.ts';
import { motionStep, rotateRows } from './flight-motion.ts';
import { craftMovementBlock } from './flight-state.ts';
import {
  debrisIndex, expiryOutcome, firstExpiry, fragmentInit, isExpiryDue, isLargeKind, shootDown, spinFragment, SPENT_EXPIRY,
} from './fragments.ts';
import { debrisRuleData, type DebrisRuleData } from './load-transforms.ts';
import { scriptedRand } from './rand.test-support.ts';

// docs/original/formats/executable.md X6, X7, X11, H1 and H4; docs/plan/p3/02/spec.md CR-02, CR-03 and CR-08. Every
// expectation is worked out by hand from the recorded arithmetic: C = f32(1/32767) = 32769 / 2^30, a real draw is
// F(rand × C × span + base) with the f64 spans and bases of `0x25124`, and every f32 store is Math.fround.

const f = Math.fround;
const C = 32769 / 2 ** 30;
const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const matrix = (...rows: number[]) => Object.freeze(rows) as unknown as Matrix3;
const IDENTITY = matrix(1, 0, 0, 0, 1, 0, 0, 0, 1);
/** Row 1 along +y, row 2 along −x, row 3 along +z. */
const TURNED = matrix(0, 1, 0, -1, 0, 0, 0, 0, 1);
const MODEL = readAssetId('model/fragment-source');
const AT = vec(100, 200, 300);
const POD_SPIN = f(-0.08726647);

const SHAPE = debrisRuleData({ at00: [1, 0, 0], collision: { boxes: [], at28: 0, at2C: [0, 0, 0, 0, 0, 0] } } as unknown as DebrisRecord).shape;
/** DEBRIS parameters after the load with these weights (the load-negated +0x00–+0x08) and class. */
const debris = (weights: Vec3, small = true): DebrisRuleData => ({ weights, direction: vec(0, 0, 0), shape: SHAPE, small });

/** A craft of `kindBit` at AT with `rows`, moving at `speed`. */
function source(kindBit: number, rows: Matrix3 = IDENTITY, speed = 48): Entity {
  return new EntityTable().allocate(entityInit(kindBit, { position: AT, orientation: rows, movement: craftMovementBlock(0x80, speed, speed * 2) }));
}

const fragmentOf = (overrides: Partial<FragmentCombat>): FragmentCombat => ({
  type: 'fragment', sourceKindBit: 7, part: 1, debris: 1, durability: 1200, explodeOnExpiry: false, expiry: { type: 'pending' }, handOff: null, ...overrides,
});

describe('kinds and parts (X6, craft §4.1)', () => {
  it('takes mask 0xf9c7c as the large kinds', () => {
    const large = [2, 3, 4, 5, 6, 10, 11, 12, 15, 16, 17, 18, 19];
    expect(Array.from({ length: 32 }, (_, kindBit) => kindBit).filter(isLargeKind)).toEqual(large);
  });

  it('maps a part to its DEBRIS parameters: part − 3 for kinds 1 and 2 (kind bits 0 and 1), none below 3; the part otherwise', () => {
    expect([0, 3, 6].map((part) => debrisIndex(0, part))).toEqual([null, 0, 3]);
    expect([0, 3].map((part) => debrisIndex(1, part))).toEqual([null, 0]);
    expect([0, 1, 4].map((part) => debrisIndex(7, part))).toEqual([0, 1, 4]);
  });
});

describe('the constructor 0x25124 (X6)', () => {
  it('makes nothing and draws nothing for parts 1 and 2 of kinds 1 and 2', () => {
    for (const kindBit of [0, 1]) {
      for (const part of [1, 2]) {
        const rand = scriptedRand([]);
        expect(fragmentInit(source(kindBit), MODEL, [debris(vec(1, 0, 0))], part, rand)).toBeNull();
      }
    }
  });

  it('builds the player\'s escape pod: no flag, no parameters, pushed along row 2 by one draw, the fixed spin about axis 2', () => {
    const owner = source(0, TURNED);
    const rand = scriptedRand([16384]);
    const init = fragmentInit(owner, MODEL, [], 0, rand)!;
    // s = F(16384 × C × 6 + 2); base velocity F(row 3 × 48) = (0, 0, 48); push = row 2 = (−1, 0, 0), not normalised.
    const speed = f(16384 * C * 6 + 2);
    expect(rand.used).toBe(1);
    expect(init).toMatchObject({
      kindBit: 24, activity: 'active', source: null, side: null, maximumSpeed: 0,
      presentation: { type: 'fragment', model: MODEL, part: 0, display: 'parts-0-2' },
      position: AT, orientation: TURNED,
      movement: { mode: 'spinning', speed: 48, velocity: vec(-speed, 0, 48), spin: POD_SPIN, spinAxis: 2 },
      combat: { type: 'fragment', sourceKindBit: 0, part: 0, debris: null, durability: 0, explodeOnExpiry: false, expiry: { type: 'pending' }, handOff: owner.id },
    });
    expect(new EntityTable().allocate(init).combat).toEqual(init.combat);
  });

  it('gives the wingman\'s pod the same fixed values', () => {
    const init = fragmentInit(source(1), MODEL, [], 0, scriptedRand([0]))!;
    expect(init.movement).toMatchObject({ spin: POD_SPIN, spinAxis: 2 });
    expect(init.combat).toMatchObject({ debris: null, durability: 0, explodeOnExpiry: false });
  });

  it('places a small kind\'s fragment at P + d, pushes it along d normalised, and draws flag, push, spin and axis', () => {
    const owner = source(7);
    // Draws: 8 & 7 = 0 sets the flag; push F(32767 × C × 8 + 2); spin F(0 + 0.01745329277777778); axis 5 % 3 = 2.
    const rand = scriptedRand([8, 32767, 0, 5]);
    const init = fragmentInit(owner, MODEL, [debris(vec(3, 0, 4))], 0, rand)!;
    const speed = f(32767 * C * 8 + 2);
    // With the identity rows d = (3, 0, 4); normalised by its f32 length 5 it is (f(0.6), 0, f(0.8)).
    expect(rand.used).toBe(4);
    expect(init).toMatchObject({
      position: vec(103, 200, 304),
      presentation: { part: 0, display: 'part' },
      movement: { speed: 48, velocity: vec(f(f(0.6) * speed), 0, f(48 + f(0.8) * speed)), spin: f(0.01745329277777778), spinAxis: 2 },
      combat: { sourceKindBit: 7, part: 0, debris: 0, durability: 1200, explodeOnExpiry: true, handOff: owner.id },
    });
  });

  it('keeps part 3 of the player as an ordinary fragment with DEBRIS record 0, which draws its flag', () => {
    const init = fragmentInit(source(0), MODEL, [debris(vec(0, 0, 1))], 3, scriptedRand([9, 0, 0, 0]))!;
    expect(init.combat).toMatchObject({ part: 3, debris: 0, explodeOnExpiry: false, handOff: null });
    expect(init.presentation).toMatchObject({ display: 'part' });
  });

  it('gives a large kind no flag, the slow push and spin, and durability 4000 for a large DEBRIS class', () => {
    const rand = scriptedRand([0, 32767, 3]);
    const init = fragmentInit(source(10), MODEL, [debris(vec(1, 0, 0)), debris(vec(0, 1, 0), false)], 1, rand)!;
    expect(rand.used).toBe(3);
    // Push F(0 × C × 3 + 2) = 2 along (0, 1, 0); base (0, 0, 48).
    expect(init.movement).toMatchObject({ velocity: vec(0, 2, 48), spin: f(32767 * C * 0.01047197566666666 + 0.001745329277777778), spinAxis: 0 });
    expect(init.combat).toMatchObject({ debris: 1, durability: 4000, explodeOnExpiry: false, handOff: null });
  });

  it('sums the offset as (row 2 term + row 3 term) + row 1 term, in double, stored once', () => {
    // Every row (1, 0, 0) with weights (1, 2^60, −2^60): (2^60 − 2^60) + 1 = 1, where (1 + 2^60) − 2^60 would be 0.
    const rows = matrix(1, 0, 0, 1, 0, 0, 1, 0, 0);
    const rand = scriptedRand([1, 0, 0, 0]);
    const init = fragmentInit(source(7, rows), MODEL, [debris(vec(1, 2 ** 60, -(2 ** 60)))], 0, rand)!;
    expect(init.position).toEqual(vec(101, 200, 300));
    expect(init.movement).toMatchObject({ velocity: vec(f(48 + 1 * 2), 0, 0) });
  });

  it('rounds the velocity once: F(base + push × s), the product not stored', () => {
    // Speed 1 along row 3; push z = f(0.8); s = F(4 × C × 8 + 2): one rounding gives a different f32 than two.
    const init = fragmentInit(source(7, IDENTITY, 1), MODEL, [debris(vec(3, 0, 4))], 0, scriptedRand([1, 4, 0, 0]))!;
    const speed = f(4 * C * 8 + 2);
    const z = (init.movement as SpinningMovementBlock).velocity.z;
    expect(z).toBe(f(1 + f(0.8) * speed));
    expect(z).not.toBe(f(1 + f(f(0.8) * speed)));
  });

  it('faults on a part without its DEBRIS record and on a source without a movement block', () => {
    expectFault(() => fragmentInit(source(7), MODEL, [], 0, scriptedRand([1])), 'invariant-violated', 'fragments.debris');
    const parked = new EntityTable().allocate(entityInit(7, { activity: 'parked' }));
    expectFault(() => fragmentInit(parked, MODEL, [debris(vec(1, 0, 0))], 0, scriptedRand([])), 'invariant-violated', 'fragments.source');
  });
});

describe('the first callback\'s expiry and the state-7 check (X7)', () => {
  it('times the pods from the callback: 0x140 for the player\'s, 0x780 for the wingman\'s, without a draw', () => {
    const rand = scriptedRand([]);
    expect(firstExpiry(fragmentOf({ sourceKindBit: 0, part: 0, debris: null }), 100, rand)).toEqual({ type: 'at', clock: 100 + 0x140 });
    expect(firstExpiry(fragmentOf({ sourceKindBit: 1, part: 0, debris: null }), 100, rand)).toEqual({ type: 'at', clock: 100 + 0x780 });
  });

  it('times a flagged fragment 0x80 + rand % 0xC0 after, before the large-kind rule', () => {
    expect(firstExpiry(fragmentOf({ explodeOnExpiry: true }), 100, scriptedRand([0xc0 + 5]))).toEqual({ type: 'at', clock: 100 + 0x80 + 5 });
    expect(firstExpiry(fragmentOf({ sourceKindBit: 10, explodeOnExpiry: true }), 100, scriptedRand([0xbf]))).toEqual({ type: 'at', clock: 100 + 0x80 + 0xbf });
  });

  it('never expires a large kind\'s fragment, without a draw; any other 0x3C0 + rand % 0x200 after', () => {
    expect(firstExpiry(fragmentOf({ sourceKindBit: 10 }), 100, scriptedRand([]))).toEqual({ type: 'never' });
    expect(firstExpiry(fragmentOf({ sourceKindBit: 7 }), 100, scriptedRand([0x200 * 3 + 7]))).toEqual({ type: 'at', clock: 100 + 0x3c0 + 7 });
    expect(firstExpiry(fragmentOf({ sourceKindBit: 8, part: 0 }), 100, scriptedRand([0]))).toEqual({ type: 'at', clock: 100 + 0x3c0 });
  });

  it('faults past the safe integers', () => {
    expectFault(() => firstExpiry(fragmentOf({ sourceKindBit: 0, part: 0, debris: null }), Number.MAX_SAFE_INTEGER - 0x100, scriptedRand([])),
      'budget-exhausted', 'fragments.expiry');
  });

  it('finds an expiry due at and after its clock, never one unset or spent', () => {
    expect([99, 100, 101].map((clock) => isExpiryDue({ type: 'at', clock: 100 }, clock))).toEqual([false, true, true]);
    expect([isExpiryDue({ type: 'pending' }, 100), isExpiryDue({ type: 'never' }, 100), isExpiryDue(SPENT_EXPIRY, 100)]).toEqual([false, false, false]);
  });
});

describe('shot down 0x24a6c and the expiry 0x256e4 (H4, X7)', () => {
  it('flags a fragment with a timer and moves its expiry to clock 1, even a large kind\'s', () => {
    for (const expiry of [{ type: 'never' }, { type: 'at', clock: 5000 }] as const) {
      const fragment = fragmentOf({ sourceKindBit: 10, expiry });
      expect(shootDown(fragment)).toBe(true);
      expect(fragment).toMatchObject({ explodeOnExpiry: true, expiry: { type: 'at', clock: 1 } });
      expect(isExpiryDue(fragment.expiry, 2)).toBe(true);
    }
  });

  it('does nothing before the first callback, which has not made the timer', () => {
    const fragment = fragmentOf({});
    expect(shootDown(fragment)).toBe(false);
    expect(fragment).toEqual(fragmentOf({}));
  });

  it('names the outcome in 0x256e4\'s order: explodes, the player\'s pod, the wingman\'s pod, removed', () => {
    expect(expiryOutcome(fragmentOf({ explodeOnExpiry: true }))).toBe('explodes');
    expect(expiryOutcome(fragmentOf({ sourceKindBit: 0, part: 0, debris: null }))).toBe('escape-pod');
    expect(expiryOutcome(fragmentOf({ sourceKindBit: 1, part: 0, debris: null }))).toBe('wingman-pod');
    expect(expiryOutcome(fragmentOf({ sourceKindBit: 0, part: 3 }))).toBe('removed');
    expect(expiryOutcome(fragmentOf({ sourceKindBit: 2, part: 0 }))).toBe('removed');
  });
});

describe('the mode-2 move 0x2285c (H1)', () => {
  const block = (spinAxis: 0 | 1 | 2, spin = f(0.25)): SpinningMovementBlock => ({ mode: 'spinning', speed: 9, velocity: vec(f(0.1), -3, 64), spin, spinAxis });

  it('moves by F(P + v × step) per axis, then turns rows 1 and 2 by the spin about axis 0', () => {
    const step = motionStep(2, 64);
    const moved = spinFragment(vec(1, 2, 3), IDENTITY, block(0), step);
    expect(moved.position).toEqual(vec(f(1 + f(0.1) / 32), f(2 - 3 / 32), 5));
    // Row 1 (1, 0, 0) and row 2 (0, 1, 0): row 1 becomes (c, s, 0), row 2 (−s, c, 0), with c and s the f32 cosine and sine.
    const [c, s] = [f(Math.cos(f(0.25))), f(Math.sin(f(0.25)))];
    expect(moved.orientation.map((value) => value + 0)).toEqual([c, s, 0, -s, c, 0, 0, 0, 1]);
  });

  it('turns about row 1 for axis 2 and row 2 for axis 1, with P3-06\'s helpers', () => {
    const step = motionStep(2, 64);
    expect(spinFragment(AT, TURNED, block(2), step).orientation).toEqual(rotateRows(TURNED, 'pitch', f(0.25)));
    expect(spinFragment(AT, TURNED, block(1), step).orientation).toEqual(rotateRows(TURNED, 'yaw', f(0.25)));
  });

  it('turns by the same angle whatever the step: the spin is per move', () => {
    const short = spinFragment(AT, TURNED, block(1), motionStep(2, 64));
    const long = spinFragment(AT, TURNED, block(1), motionStep(8, 64));
    expect(long.orientation).toEqual(short.orientation);
    expect(long.position).not.toEqual(short.position);
  });
});
