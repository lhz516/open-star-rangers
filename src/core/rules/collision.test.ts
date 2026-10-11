import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../contracts/domain-events.ts';
import { CoreFaultError } from '../errors.ts';
import type { Matrix3, TimedRotation } from '../world/entity-table.ts';
import {
  bounceContact, collisionDamage, fragmentContactLimit, glancingContact, halved, PLAYER_CONTACT_KINDS, POINT_GROUP_KINDS, SHAPE_GROUP_KINDS,
  type ContactBody, type ContactResponse, type Tumble,
} from './collision.ts';
import { scriptedRand } from './rand.test-support.ts';

// docs/original/formats/executable.md, H6–H8; docs/plan/p3/02/spec.md, CR-03 and CR-09. Expected values are worked out
// here from the recorded formulas, step by step at the recorded rounding points: products and sums in double, every
// stored value f32; C = f32(1/32767) = 32769 / 2^30; lo's factor is the f64 one ulp above 1/140.

const f = Math.fround;
const C = 32769 / 2 ** 30;
const LOW_FACTOR = 0.0071428571428571435;
const FLOOR = f(0.08726647);
const DECAY = f(Math.PI / 4);

/** Rows whose third row (the heading, the original's R2) is `forward`; the other two rows do not matter here. */
const facing = (forward: Vec3): Matrix3 => Object.freeze([1, 0, 0, 0, 1, 0, forward.x, forward.y, forward.z]) as unknown as Matrix3;
const body = (position: Vec3, forward: Vec3, speed: number): ContactBody => ({ position, orientation: facing(forward), speed });
const at = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

/**
 * The tumble H6 records for an unrounded X (or Y) with hi's factor, the six draws in order and t; `lowValue` stands in
 * for X in lo, so that a test can tell readings apart.
 */
function expectedTumble(value: number, highFactor: number, draws: readonly number[], time: number, lowValue = value): Tumble {
  const high = f(value * highFactor);
  const low = lowValue * LOW_FACTOR < 0.0872664638888889 ? FLOOR : f(lowValue * LOW_FACTOR);
  const axis = (index: number): TimedRotation | null => {
    const magnitude = draws[2 * index];
    const flips = (draws[2 * index + 1] & 2) !== 0;
    const rate = f(magnitude * C * (high - low) + low) * (flips ? -1 : 1);
    const decay = flips ? -DECAY : DECAY;
    const end = f(rate / decay + time - 0.5);
    return end > time ? { rate, decay, end } : null;
  };
  return { pitch: axis(0), yaw: axis(1), roll: axis(2) };
}

const equalTumbles = (left: Tumble, right: Tumble): boolean => JSON.stringify(left) === JSON.stringify(right);

const negated = (tumble: Tumble): Tumble => {
  const flip = (timed: TimedRotation | null) => timed && { rate: -timed.rate, decay: -timed.decay, end: timed.end };
  return { pitch: flip(tumble.pitch), yaw: flip(tumble.yaw), roll: flip(tumble.roll) };
};

/**
 * The bounce's knock direction as H6 records it: the offset P₁ − P₂ (stored f32 when `stored`), normalised as `0x56aa8`
 * does (length F(√((y² + x²) + z²)), each component F(c × 1/length)); v = −row3₁; for k = x, y, z in turn
 * v_k := F(((n_y v_y + n_z v_z) + n_x v_x) × 2 × n_k) with v as already overwritten; the knock F(row3₂ + v).
 */
function expectedKnock(first: Vec3, second: Vec3, forward: Vec3, other: Vec3, stored: boolean): Vec3 {
  const keep = stored ? f : (value: number) => value;
  const d = [keep(first.x - second.x), keep(first.y - second.y), keep(first.z - second.z)];
  const length = f(Math.sqrt(d[1] * d[1] + d[0] * d[0] + d[2] * d[2]));
  const n = length === 0 ? d : d.map((value) => f(value * (1 / length)));
  const v = [-forward.x, -forward.y, -forward.z];
  for (let k = 0; k < 3; k++) v[k] = f((n[1] * v[1] + n[2] * v[2] + n[0] * v[0]) * 2 * n[k]);
  return at(f(other.x + v[0]), f(other.y + v[1]), f(other.z + v[2]));
}

/** Draw values whose second, fourth and sixth (the sign draws) flip, keep and flip. */
const DRAWS = [0, 2, 16384, 1, 32767, 0x7fff];
const T = 100;

function respond(contact: typeof glancingContact, first: ContactBody, second: ContactBody, draws: readonly number[] = DRAWS, time = T): ContactResponse {
  const rand = scriptedRand(draws);
  const response = contact(first, second, time, rand);
  expect(rand.used).toBe(6);
  return response;
}

describe('the kind masks of the passes (H6)', () => {
  it('test the player against kinds 2–0x80000, group A of kinds 2, 0x80, 0x100 and 0x200, and group B of the rest but the player', () => {
    expect([PLAYER_CONTACT_KINDS, POINT_GROUP_KINDS, SHAPE_GROUP_KINDS]).toEqual([0xffffe, 0x382, 0xffc7c]);
    expect(POINT_GROUP_KINDS & SHAPE_GROUP_KINDS).toBe(0);
    expect(POINT_GROUP_KINDS | SHAPE_GROUP_KINDS).toBe(PLAYER_CONTACT_KINDS);
  });
});

describe('the glance 0x29eb8 (H6)', () => {
  it('knocks each object along the other\'s heading, the second at twice the first\'s speed, and tumbles them opposite', () => {
    // Head on: row3₁ · row3₂ = −1, so X = |−1 − 1| × (10 + 30) = 80, hi = f32(0.8) and lo = f32(80 × LOW_FACTOR).
    const first = body(at(0, 0, 0), at(0, 0, 1), 10);
    const second = body(at(0, 0, 3), at(0, 0, -1), 30);
    const response = respond(glancingContact, first, second);
    const tumble = expectedTumble(80, 0.01, DRAWS, T);
    expect(response).toEqual({
      raw: 2 * 80 + 150,
      first: { impulse: { direction: at(0, 0, -1), magnitude: 30 }, timedRotation: tumble },
      second: { impulse: { direction: at(0, 0, 1), magnitude: 20 }, timedRotation: negated(tumble) },
    });
    // Draw 0 gives the rate lo itself, a draw of 32767 nearly hi; the sign draws 2 and 0x7fff flip, 1 keeps.
    expect(tumble.pitch).toEqual({ rate: -f(80 * LOW_FACTOR), decay: -DECAY, end: f(f(80 * LOW_FACTOR) / DECAY + T - 0.5) });
    expect(tumble.roll!.rate).toBeLessThan(-0.79);
    expect(tumble.yaw!.rate).toBeGreaterThan(0);
  });

  it('copies the headings bit for bit and stores the second\'s knock as f32(speed₁ × 2.0)', () => {
    const forward = at(f(0.6), f(0.8), 0);
    const other = at(0, f(-0.28), f(0.96));
    const response = respond(glancingContact, body(at(0, 0, 0), forward, f(1.1)), body(at(1, 1, 1), other, f(2.3)));
    expect(response.first.impulse).toEqual({ direction: other, magnitude: f(2.3) });
    expect(response.second!.impulse).toEqual({ direction: forward, magnitude: f(f(1.1) * 2) });
  });

  it('takes hi and lo from the unrounded X and the raw damage from its f32 store: 2 × trunc(f32 X) + 150', () => {
    // dot = (y·y + z·z) + x·x; X = |dot − 1| × (speed₁ + speed₂) in double.
    const forward = at(f(0.6), f(0.8), 0);
    const other = at(f(0.28), 0, f(0.96));
    const dot = forward.y * other.y + forward.z * other.z + forward.x * other.x;
    // Only speeds where rounding X first would change the tumble through hi, or through lo, tell the readings apart.
    const found = { high: 0, low: 0 };
    for (let speed = f(37.1); found.high < 2 || found.low < 2; speed = f(speed + 0.37)) {
      const x = Math.abs(dot - 1) * (speed + f(5.3));
      const tumble = expectedTumble(x, 0.01, DRAWS, T);
      const roundedHigh = !equalTumbles(tumble, expectedTumble(f(x), 0.01, DRAWS, T, x));
      const roundedLow = !equalTumbles(tumble, expectedTumble(x, 0.01, DRAWS, T, f(x)));
      if (!roundedHigh && !roundedLow) continue;
      if (roundedHigh) found.high++;
      if (roundedLow) found.low++;
      const response = respond(glancingContact, body(at(0, 0, 0), forward, speed), body(at(0, 0, 0), other, f(5.3)));
      expect(response.first.timedRotation).toEqual(tumble);
      expect(response.raw).toBe(2 * Math.trunc(f(x)) + 150);
    }
  });

  it('floors lo at f32 ≈5°, where no axis turns: hi is then below 0.123 and every end before t', () => {
    // Same heading: X = 0, hi = 0 and lo is the floor; every rate is at most the floor.
    const response = respond(glancingContact, body(at(0, 0, 0), at(0, 0, 1), 4), body(at(0, 0, 0), at(0, 0, 1), 6), [0, 0, 16384, 0, 32767, 0]);
    expect(response.raw).toBe(150);
    expect(response.first.timedRotation).toEqual({ pitch: null, yaw: null, roll: null });
    expect(response.second!.timedRotation).toEqual({ pitch: null, yaw: null, roll: null });
    // At the floor's limit X ≈ 12.2, the largest rate hi ≈ 0.122 gives rate ÷ decay < 0.5, the end margin.
    const limit = f(0.0872664638888889 / LOW_FACTOR + 0.001);
    const above = respond(glancingContact, body(at(0, 0, 0), at(0, 0, 1), limit), body(at(0, 0, 0), at(1, 0, 0), 0), [32767, 0, 32767, 0, 32767, 0]);
    expect(above.first.timedRotation).toEqual({ pitch: null, yaw: null, roll: null });
  });

  it('turns an axis only when its end is strictly after t', () => {
    // lo = π/4 ÷ 2 exactly: rate ÷ decay = 0.5, so the end is t itself and the axis does not turn.
    const half = DECAY / 2;
    let speed = f(half / LOW_FACTOR);
    while (f(speed * LOW_FACTOR) !== half) speed = f(speed * LOW_FACTOR) < half ? f(speed + 2 ** -18) : f(speed - 2 ** -18);
    const response = respond(glancingContact, body(at(0, 0, 0), at(0, 0, 1), speed), body(at(0, 0, 0), at(1, 0, 0), 0), [0, 0, 0, 0, 0, 0], 64);
    expect(response.first.timedRotation.pitch).toBeNull();
  });

  it('wraps 2 × trunc(f32 X) + 150 as i32 additions do, and faults where the truncation leaves i32', () => {
    // Perpendicular headings: X = speed₁ + speed₂.
    const wrapped = respond(glancingContact, body(at(0, 0, 0), at(0, 0, 1), 2 ** 30), body(at(0, 0, 0), at(1, 0, 0), 0));
    expect(wrapped.raw).toBe(-(2 ** 31) + 150);
    expect(() => glancingContact(body(at(0, 0, 0), at(0, 0, 1), 2 ** 31), body(at(0, 0, 0), at(1, 0, 0), 0), T, scriptedRand(DRAWS)))
      .toThrow(new CoreFaultError('invariant-violated', 'collision.raw'));
  });
});

describe('the bounce 0x2a12c (H6)', () => {
  it('knocks only the first object, along the second\'s heading plus the reflection term, at f32(speed₁ × 1.2)', () => {
    // Head on, 10 apart: n = (0, 0, −1), v = −row3₁ = (0, 0, −1), so w = (0, 0, 2 × 1 × −1) and the knock (0, 0, −3).
    const response = respond(bounceContact, body(at(0, 0, 0), at(0, 0, 1), 10), body(at(0, 0, 10), at(0, 0, -1), 30));
    expect(response).toEqual({
      raw: 2 * 80 + 150,
      first: { impulse: { direction: at(0, 0, -3), magnitude: f(12) }, timedRotation: expectedTumble(80, 0.0125, DRAWS, T) },
      second: null,
    });
  });

  it('computes the reflection term in place over −row3₁, one component at a time, not as the exact projection', () => {
    // n = (1, 1, 0) normalised and v = (0, 1, 0): the exact projection 2(n·v)n is (1, 1, 0); in place, w_x ≈ 1 first
    // replaces v_x, so the dot product for w_y is n_y + n_x w_x and w_y ≈ 2.
    const other = at(f(0.6), 0, f(0.8));
    const response = respond(bounceContact, body(at(f(1.5), f(3.5), 7), at(0, -1, 0), 4), body(at(f(0.5), f(2.5), 7), other, 1));
    const knock = expectedKnock(at(f(1.5), f(3.5), 7), at(f(0.5), f(2.5), 7), at(0, -1, 0), other, true);
    expect(response.first.impulse).toEqual({ direction: knock, magnitude: f(4 * 1.2) });
    expect(knock.y - other.y).toBeGreaterThan(1.9);
  });

  it('stores the offset P₁ − P₂ as f32 before normalising it', () => {
    let found = 0;
    for (let index = 1; found < 2; index++) {
      const [first, second] = [at(f(1000 + index * 0.37), f(index * 0.0013), 3), at(f(index * 0.0007), f(999 - index * 0.11), -2)];
      const [forward, other] = [at(f(0.6), 0, f(-0.8)), at(0, f(0.28), f(0.96))];
      const knock = expectedKnock(first, second, forward, other, true);
      if (JSON.stringify(knock) === JSON.stringify(expectedKnock(first, second, forward, other, false))) continue;
      found++;
      expect(respond(bounceContact, body(first, forward, 1), body(second, other, 1)).first.impulse.direction).toEqual(knock);
    }
  });

  it('leaves the offset as it is when the centres coincide, so the knock is the second\'s heading', () => {
    const other = at(0, f(0.6), f(0.8));
    const response = respond(bounceContact, body(at(2, 3, 4), at(1, 0, 0), 5), body(at(2, 3, 4), other, 0));
    expect(response.first.impulse.direction).toEqual(other);
  });

  it('takes Y = (speed₁ + speed₂) × 2.0, hi = Y × 0.0125 and lo from Y unrounded, the raw damage from f32 Y', () => {
    const [first, second] = [f(3.7), f(0.15)];
    const y = (first + second) * 2;
    const response = respond(bounceContact, body(at(0, 0, 0), at(0, 0, 1), first), body(at(0, 0, 1), at(0, 1, 0), second));
    expect(response.first.timedRotation).toEqual(expectedTumble(y, 0.0125, DRAWS, T));
    expect(response.raw).toBe(2 * Math.trunc(f(y)) + 150);
    // A negative speed sum gives a raw damage below 150 (H8).
    expect(respond(bounceContact, body(at(0, 0, 0), at(0, 0, 1), -50), body(at(0, 0, 1), at(0, 1, 0), 0)).raw).toBe(2 * -100 + 150);
  });
});

describe('the damage arithmetic of the passes (H6, H8)', () => {
  it('divides the raw damage by 3 − g with IDIV, truncating toward zero', () => {
    expect([0, 1, 2].map((group) => collisionDamage(310, group))).toEqual([103, 155, 310]);
    expect([0, 1, 2].map((group) => collisionDamage(-7, group))).toEqual([-2, -3, -7]);
    expect(Object.is(collisionDamage(-1, 0), 0)).toBe(true);
  });

  it('halves with SAR 1, rounding toward −∞', () => {
    expect([halved(103), halved(155), halved(-3), halved(-(2 ** 31))]).toEqual([51, 77, -2, -(2 ** 30)]);
  });

  it('lets g × 2 + 2 small-fragment contacts damage the player per tick', () => {
    expect([0, 1, 2].map(fragmentContactLimit)).toEqual([2, 4, 6]);
  });

  it('faults on the division by zero group 3 would make', () => {
    expect(() => collisionDamage(10, 3)).toThrow(new CoreFaultError('invariant-violated', 'collision.damage'));
  });
});
