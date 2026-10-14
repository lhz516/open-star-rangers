import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../contracts/domain-events.ts';
import type { Entity, ObjectState } from '../world/entity-table.ts';
import { scriptedRand } from './rand.test-support.ts';
import { arrivalPoint, isHostileNear, sectorCorner, snapToNearest, warpInterval } from './warp-arrival.ts';

// The arrival rules of MW-08 (docs/plan/p3/02/spec.md) and completion steps 4–9 of docs/original/formats/executable.md
// (Warp progress, completion and interruptions), with the sector mapping 0x3a61c and its half sector F(S × 0.5).
// Expectations are worked out by hand from those records, not from the module.

const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
/** A stand-in entity: the rules read only these fields. */
const entity = (id: number, position: Vec3, fields: Partial<Pick<Entity, 'destroyed' | 'state' | 'kindBit'>> = {}): Entity =>
  ({ id, position, destroyed: false, state: 'active', kindBit: 7, ...fields }) as Entity;

describe('the sector corner 0x3a6e8 (0x3a61c, centre ± half a sector)', () => {
  it.each([
    // Sector 0 spans [0, 15000) with centre 7500; the corner is on the point's side, x ≥ cx and y > cy.
    ['below the centre on both axes', vec(100, 200, 50), vec(0, 0, 0)],
    ['x at the centre counts as above, y at the centre as below', vec(7500, 7500, 0), vec(15000, 0, 0)],
    ['above on both', vec(8000, 9000, 0), vec(15000, 15000, 0)],
    // A negative coordinate first moves back a sector: −100 → trunc(−15100 ÷ 15000) = −1, centre −7500.
    ['a negative y', vec(8000, -100, 0), vec(15000, 0, 0)],
    ['x = −15000, the start of sector −1', vec(-15000, -7600, 0), vec(-15000, -15000, 0)],
    // 31000 → sector 2 (centre 37500); 42000 → sector 2.
    ['far sectors', vec(31000, 42000, 300), vec(30000, 45000, 0)],
  ])('%s', (_, destination, corner) => {
    expect(sectorCorner(destination)).toEqual(corner);
  });

  it('maps with the f32 reciprocal F(1 ÷ 15000), so 15000 and 30000 fall one sector short', () => {
    // 15000 × F(1/15000) = 0.99999999747… → sector 0 (centre 7500); 30000 → 1.9999999949… → sector 1 (centre 22500).
    expect(sectorCorner(vec(15000, 30000, 0))).toEqual(vec(15000, 30000, 0));
    expect(sectorCorner(vec(15000.001953125, 0, 0)).x).toBe(15000);
  });

  it('puts z at +0', () => {
    expect(Object.is(sectorCorner(vec(1, 1, -5)).z, 0)).toBe(true);
  });
});

describe('the arrival point (completion steps 4 and 5)', () => {
  const destination = vec(31000, 42000, 300);

  it('keeps the destination for an error-free Warp, still drawing the sign once', () => {
    const rand = scriptedRand([1]);
    expect(arrivalPoint(destination, 0, 0, rand)).toEqual(destination);
    expect(rand.used).toBe(1);
  });

  it('pulls toward the corner by s and offsets z by s × ±k, k = (group + 1) × 5000', () => {
    // s = 0.5: x = 31000 + 0.5 × (30000 − 31000), y = 42000 + 0.5 × 3000, z = 300 + 0.5 × (0 − 300) = 150; then ±2500.
    expect(arrivalPoint(destination, 0.5, 0, scriptedRand([7]))).toEqual(vec(30500, 43500, 2650));
    expect(arrivalPoint(destination, 0.5, 0, scriptedRand([8]))).toEqual(vec(30500, 43500, -2350));
    // s = 1 reaches the corner, z = 0 ± k; groups 1 and 2 give 10000 and 15000.
    expect(arrivalPoint(destination, 1, 1, scriptedRand([1]))).toEqual(vec(30000, 45000, 10000));
    expect(arrivalPoint(destination, 1, 2, scriptedRand([0]))).toEqual(vec(30000, 45000, -15000));
  });

  it('gives +k for exactly half of the rand domain (odd values) and −k for the other half', () => {
    const counts = { up: 0, down: 0 };
    for (let value = 0; value <= 32767; value++) {
      const { z } = arrivalPoint(vec(0, 0, 0), 1, 0, scriptedRand([value]));
      if (z === 5000) counts.up++;
      else if (z === -5000) counts.down++;
    }
    expect(counts).toEqual({ up: 16384, down: 16384 });
  });

  it('stores each step as an f32', () => {
    const point = arrivalPoint(vec(31000.25, 42000.5, 300.125), Math.fround(0.3), 0, scriptedRand([3]));
    expect([point.x, point.y, point.z].every((value) => Math.fround(value) === value)).toBe(true);
    expect(point.x).toBe(Math.fround(31000.25 + Math.fround(Math.fround(0.3) * Math.fround(30000 - 31000.25))));
  });
});

describe('the nearest-object snap (completion step 6)', () => {
  const point = vec(1000, 2000, 300);

  it('moves 600 above the nearest candidate strictly within 600, the first one on a tie', () => {
    const near = entity(2, vec(1000, 2000, 0));
    const tie = entity(3, vec(1000, 2000, 600));
    const far = entity(4, vec(5000, 2000, 300));
    expect(snapToNearest(point, [far, near, tie])).toEqual({ position: vec(1000, 2000, 600), snapped: near });
    expect(snapToNearest(point, [far, tie, near]).snapped).toBe(tie);
  });

  it('includes the player itself at the destination, whatever any candidate\'s state, activity or dead flag', () => {
    const player = entity(1, point, { kindBit: 0, destroyed: true, state: 'pending-removal' });
    expect(snapToNearest(point, [player])).toEqual({ position: vec(1000, 2000, 900), snapped: player });
  });

  it('does not snap at exactly 600 (score 360000) or with no candidate', () => {
    expect(snapToNearest(point, [entity(2, vec(1600, 2000, 300))])).toEqual({ position: point, snapped: null });
    expect(snapToNearest(point, [])).toEqual({ position: point, snapped: null });
    expect(snapToNearest(point, [entity(2, vec(1599.75, 2000, 300))]).snapped?.id).toBe(2);
  });

  it('scores F(dy·F(dy) + dz·F(dz) + dx·F(dx)) and stores z + 600 as an f32', () => {
    // F(0.1) + 600 = 600.1000000015 is not an f32.
    const snapped = snapToNearest(point, [entity(2, vec(1000.5, 2000, Math.fround(0.1)))]);
    expect(snapped.position).toEqual(vec(1000.5, 2000, Math.fround(Math.fround(0.1) + 600)));
    expect(snapped.position.z).not.toBe(Math.fround(0.1) + 600);
  });
});

describe('the interval base (completion step 8)', () => {
  it.each([
    ['+0xA4 = 0: no interval', 50000, 0, 0],
    ['D = 0: the 0x280 floor', 0, 20, 0x280],
    // 64 × 20 = 1280 units at D ≥ 30000; 1280 × D ÷ 30000 below.
    ['half way: 640, not above 0x280', 15000, 20, 0x280],
    ['just above the floor', 15100, 20, 644],
    ['at 30000', 30000, 20, 1280],
    ['beyond 30000: capped', 120000, 20, 1280],
  ])('%s', (_, distance, seconds, units) => {
    expect(warpInterval(distance, seconds)).toBe(units);
  });
});

describe('0x3c040 (hostileNear)', () => {
  const point = vec(0, 0, 0);
  const at = (x: number, state: ObjectState = 'active', destroyed = false) => entity(5, vec(x, 0, 0), { state, destroyed });

  it('finds a live hostile in state ≥ 7 or 4 strictly within the radius', () => {
    expect(isHostileNear(point, 100, [at(99.5)])).toBe(true);
    expect(isHostileNear(point, 100, [at(50, 'projectile-hit')])).toBe(true);
    expect(isHostileNear(point, 100, [at(50, 'destroyed-source')])).toBe(true);
  });

  it('skips a destroyed one, the other states, and one at exactly the radius', () => {
    expect(isHostileNear(point, 100, [at(50, 'active', true)])).toBe(false);
    for (const state of ['new', 'presentation-ready', 'area-switch', 'pending-removal'] as const) expect(isHostileNear(point, 100, [at(50, state)])).toBe(false);
    expect(isHostileNear(point, 100, [at(100)])).toBe(false);
    expect(isHostileNear(point, 100, [])).toBe(false);
  });
});
