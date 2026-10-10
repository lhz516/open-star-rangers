import { describe, expect, it } from 'vitest';
import type { CraftRecord } from '../../content/rule-data/craft-info.ts';
import { CoreFaultError } from '../errors.ts';
import { INITIAL_DIAGONAL } from './placement.ts';
import {
  advanced,
  formationPosition,
  goalDistance,
  hasArrived,
  headingTowards,
  isInWarpTransit,
  isParkedUpdateDue,
  isWarpAllowed,
  isWarpJumpDistance,
  jittered,
  normalized,
  offsetGoal,
  randomTargetOffset,
  travelLength,
  warpJumpLength,
  type GoalDistance,
} from './parked-travel.ts';
import { scriptedRand } from './rand.test-support.ts';
import type { Matrix3 } from '../world/entity-table.ts';

// Expectations are written out from docs/original/formats/executable.md, world boundary, active area, parking and
// autopilot (P3-06/04): the cadence 64 + rand % 64, the transit and eligibility times in clock units (× 64), the
// arrival below 100², the jump test (+0x0C)² × 4, the offset lengths and the jitter spans. Geometry uses axis-aligned
// directions, whose f32 results are exact.

const at = (x: number, y: number, z: number) => ({ x, y, z });
const record = (fields: Partial<CraftRecord>) => fields as CraftRecord;
const distanceOf = (difference: { x: number; y: number; z: number }, squared32: number): GoalDistance => ({ difference, squared: squared32, squared32 });

describe('parked update cadence 0x2f1b0 (P3-06 AC-06)', () => {
  it('is due at or past the last update plus 64 + rand % 64', () => {
    expect(isParkedUpdateDue(164, 100, 0)).toBe(true);
    expect(isParkedUpdateDue(163, 100, 0)).toBe(false);
    expect(isParkedUpdateDue(227, 100, 63)).toBe(true);
    expect(isParkedUpdateDue(226, 100, 63)).toBe(false);
    // rand % 64: 64 acts as 0, 32767 as 63.
    expect(isParkedUpdateDue(164, 100, 64)).toBe(true);
    expect(isParkedUpdateDue(226, 100, 32767)).toBe(false);
  });
});

describe('Warp transit 0x2f298 and eligibility 0x2ff98 (P3-06 AC-06, M-07)', () => {
  it('keeps a transit until the timer plus +0xA8 seconds', () => {
    expect(isInWarpTransit(1000, record({ atA8: 3 }), 1191)).toBe(true);
    expect(isInWarpTransit(1000, record({ atA8: 3 }), 1192)).toBe(false);
    expect(isInWarpTransit(1000, record({ atA8: 0 }), 1000)).toBe(false);
  });

  it('allows a Warp with +0xA4 positive, an unset timer or a clock past the timer plus +0xA8 + +0xA4 seconds', () => {
    expect(isWarpAllowed(0, record({ atA4: 1, atA8: 1000 }), 2)).toBe(true);
    expect(isWarpAllowed(0, record({ atA4: 0, atA8: 1000 }), 2)).toBe(false);
    expect(isWarpAllowed(0, record({ atA4: -1, atA8: 1000 }), 2)).toBe(false);
    expect(isWarpAllowed(1000, record({ atA4: 2, atA8: 3 }), 1320)).toBe(false);
    expect(isWarpAllowed(1000, record({ atA4: 2, atA8: 3 }), 1321)).toBe(true);
    expect(isWarpAllowed(1000, record({ atA4: 0, atA8: 3 }), 99999)).toBe(false);
  });

  it('takes negative durations as exact integers: a transit ends at its first check and no Warp is postponed (project rule)', () => {
    // The original's u32 sums would wrap below its absolute counter's 0; Core's clock never wraps.
    expect(isInWarpTransit(100, record({ atA8: -14 }), 102)).toBe(false);
    expect(isInWarpTransit(2000, record({ atA8: -14 }), 2000)).toBe(false);
    expect(isWarpAllowed(100, record({ atA4: 13, atA8: -14 }), 102)).toBe(true);
    expect(isWarpAllowed(2000, record({ atA4: 1, atA8: -14 }), 2000)).toBe(true);
  });
});

describe('goal distance and arrival (P3-06 AC-06)', () => {
  it('arrives strictly within 100 units, measuring with each difference times its f32', () => {
    expect(hasArrived(goalDistance(at(60, 80, 0), at(0, 0, 0)))).toBe(false);
    expect(hasArrived(goalDistance(at(60, 79.5, 0), at(0, 0, 0)))).toBe(true);
    expect(hasArrived(goalDistance(at(0, 0, -99.5), at(0, 0, 0)))).toBe(true);
    expect(goalDistance(at(100, 200, 300), at(40, 120, 300))).toEqual({ difference: at(60, 80, 0), squared: 10000, squared32: 10000 });
  });

  it('rounds the stored differences to f32 and keeps each double difference in the sum', () => {
    const position = Math.fround(0.1);
    const { difference, squared, squared32 } = goalDistance(at(3_000_000, 0, 0), at(position, 0, 0));
    // 2,999,999.9 lies nearer 3,000,000 than the f32 below it, 2,999,999.75.
    expect(difference.x).toBe(3_000_000);
    expect(squared).toBe((3_000_000 - position) * 3_000_000);
    expect(squared32).toBe(Math.fround(squared));
  });

  it('jumps only when (+0x0C)² × 4 is below the f32 squared distance', () => {
    const near = distanceOf(at(500, 0, 0), 250_000);
    const far = distanceOf(at(500, 0, 0), Math.fround(250_000.02));
    expect(far.squared32).toBeGreaterThan(250_000);
    expect(isWarpJumpDistance(record({ at0C: 250 }), near)).toBe(false);
    expect(isWarpJumpDistance(record({ at0C: 250 }), far)).toBe(true);
  });
});

describe('random target offset (P3-06 AC-06, 0x2f314)', () => {
  // Direction entry 0 is (0, 0, 1); octant 3 negates z.
  it('draws rand % 500 + 800 for the length, then the direction', () => {
    const rand = scriptedRand([1234, 0, 0]);
    expect(randomTargetOffset(null, rand)).toEqual(at(0, 0, 1034));
    expect(rand.used).toBe(3);
    expect(randomTargetOffset(null, scriptedRand([499, 0, 3]))).toEqual(at(0, 0, -1299));
  });

  it("draws rand % trunc(the target's +0x0C), at least 800, for a target record", () => {
    expect(randomTargetOffset(record({ at0C: 250.9 }), scriptedRand([1003, 0, 0]))).toEqual(at(0, 0, 800));
    expect(randomTargetOffset(record({ at0C: 1000.9 }), scriptedRand([1900, 0, 0]))).toEqual(at(0, 0, 900));
    expect(randomTargetOffset(record({ at0C: 1000.9 }), scriptedRand([1800, 0, 0]))).toEqual(at(0, 0, 800));
  });

  it('faults on a modulus the original cannot divide by or convert', () => {
    for (const at0C of [0.9, -3, 2 ** 31]) {
      const error = (() => {
        try {
          randomTargetOffset(record({ at0C }), scriptedRand([1, 0, 0]));
        } catch (thrown) {
          return thrown;
        }
        return undefined;
      })();
      expect(error).toBeInstanceOf(CoreFaultError);
      expect(error).toMatchObject({ code: 'invariant-violated', site: 'parked-travel.offset-modulus' });
    }
  });

  it('adds the offset to the target position in f32', () => {
    expect(offsetGoal(at(2 ** 24, 1, -1), at(1, 0.5, 0.25))).toEqual(at(2 ** 24, 1.5, -0.75));
  });
});

describe('pose rebuild facing the goal (P3-06 AC-06, 0x2f314, 0x56aa8)', () => {
  it('normalises by the f32 length, leaving a zero vector', () => {
    expect(normalized(at(1, 1, 0))).toEqual(at(INITIAL_DIAGONAL, INITIAL_DIAGONAL, 0));
    expect(normalized(at(0, 3, 4))).toEqual(at(0, Math.fround(0.6), Math.fround(0.8)));
    expect(normalized(at(0, 0, 0))).toEqual(at(0, 0, 0));
  });

  it('faces a goal in the x/y plane with the z axis as reference up', () => {
    const heading = headingTowards(distanceOf(at(1000, 0, 0), 1_000_000));
    expect(heading.distance).toBe(1000);
    expect(heading.forward).toEqual(at(1, 0, 0));
    expect(heading.orientation).toEqual([0, 1, 0, 0, 0, 1, 1, 0, 0]);
  });

  it('takes the x axis as reference up when the forward z exceeds 0.5, the z axis at 0.5', () => {
    const steep = headingTowards(distanceOf(at(0, 0, -500), 250_000));
    expect(steep.forward).toEqual(at(0, 0, -1));
    // up × forward = (1, 0, 0) × (0, 0, −1) = (0, 1, 0); forward × that = (1, 0, 0).
    expect(steep.orientation.map((value) => value + 0)).toEqual([0, 1, 0, 1, 0, 0, 0, 0, -1]);
    const half = headingTowards(distanceOf(at(0, 886.75, 512), 1_048_576));
    expect(half.forward.z).toBe(0.5);
    // z up: (0, 0, 1) × (0, f, 0.5) = (−f, 0, 0) normalised (−1, 0, 0).
    expect(half.orientation.slice(0, 3).map((value) => value + 0)).toEqual([-1, 0, 0]);
    const over = headingTowards(distanceOf(at(0, 886.75, Math.fround(512.0001)), 1_048_576));
    expect(over.forward.z).toBeGreaterThan(0.5);
    // x up: (1, 0, 0) × (0, f, z) = (0, −z, f), normalised in the y/z plane.
    expect(over.orientation[0]).toBe(0);
  });
});

describe('jump and travel lengths (P3-06 AC-06)', () => {
  it('caps a jump at +0xA0 only strictly between 1 and the distance', () => {
    expect(warpJumpLength(record({ atA0: 1.5 }), 1000)).toBe(1.5);
    expect(warpJumpLength(record({ atA0: 999.5 }), 1000)).toBe(999.5);
    expect(warpJumpLength(record({ atA0: 1 }), 1000)).toBe(1000);
    expect(warpJumpLength(record({ atA0: 1000 }), 1000)).toBe(1000);
    expect(warpJumpLength(record({ atA0: -5 }), 1000)).toBe(1000);
  });

  it('travels elapsed ÷ 64 × the base +0xB8, at most the distance', () => {
    expect(travelLength(128, record({ atB8: 64 }), 1000)).toBe(128);
    expect(travelLength(128, record({ atB8: 64 }), 128)).toBe(128);
    expect(travelLength(128, record({ atB8: 64 }), 127.5)).toBe(127.5);
    expect(travelLength(96, record({ atB8: -2 }), 1000)).toBe(-3);
    expect(travelLength(3, record({ atB8: Math.fround(0.1) }), 1000)).toBe(Math.fround((3 / 64) * Math.fround(0.1)));
  });

  it('moves along the forward row with f32 stores', () => {
    expect(advanced(at(1, 2, 3), at(0, 1, 0), 10.5)).toEqual(at(1, 12.5, 3));
    // 2^24 + 1 rounds to even, 2^24.
    expect(advanced(at(2 ** 24, 0, 0), at(1, 0, 0), 1)).toEqual(at(2 ** 24, 0, 0));
  });
});

describe('jitter (P3-06 AC-06)', () => {
  it('adds a signed rand % span per axis, x then y then z, sign first: odd adds, even subtracts', () => {
    const rand = scriptedRand([1, 1234, 2, 999, 4, 0]);
    const moved = jittered(at(10, 20, -0), 1000, rand);
    expect(moved).toEqual(at(244, -979, 0));
    expect(Object.is(moved.z, 0)).toBe(true);
    expect(rand.used).toBe(6);
    expect(jittered(at(0, 0, 0), 20, scriptedRand([3, 1234, 0, 19, 5, 20]))).toEqual(at(14, -19, 0));
  });
});

describe('formation snap 0x56e34 (P3-06 AC-06)', () => {
  it("adds the offset along the leader's rows to the leader's position", () => {
    const rows = Object.freeze([0, 1, 0, -1, 0, 0, 0, 0, 1]) as unknown as Matrix3;
    // 2 × (0, 1, 0) + 3 × (−1, 0, 0) + 4 × (0, 0, 1) = (−3, 2, 4).
    expect(formationPosition(rows, at(10, 20, 30), at(2, 3, 4))).toEqual(at(7, 22, 34));
  });

  it('rounds the offset sum to f32 before adding it', () => {
    const rows = Object.freeze([1, 0, 0, 1, 1, 0, 0, 0, 1]) as unknown as Matrix3;
    // x: the offset sum 2^-24 + 1 ties and rounds to even, 1; 2^-23 + 1 is then exact. Unrounded, 1 + 1.5 × 2^-23
    // would tie the other way, to 1 + 2^-22.
    expect(formationPosition(rows, at(2 ** -23, 0, 0), at(1, 2 ** -24, 0))).toEqual(at(1 + 2 ** -23, 2 ** -24, 0));
  });
});
