import { describe, expect, it } from 'vitest';
import type { SpawnRegion, Vector3 } from '../../content/logic/logic-content.ts';
import { nextRandom } from '../determinism/rng.ts';
import { CoreFaultError } from '../errors.ts';
import { runtimeFrame, runtimeRegion, type WorldFrame } from './coordinates.ts';
import { expectedPull, expectedRectangle, expectedWorld, float32Bits, float32OfDouble } from './derivation.test-support.ts';
import { RandStream, type RandSource } from './original-random.ts';
import { INITIAL_DIAGONAL, memberPosition, placeRecord, type AttitudeRows, type PlacementRecord } from './placement.ts';

// Expectations follow the Q-02 derivation (02 完成证据, items 4–8) with every f32 store rounded toward zero (goal
// 执行记录, Q-11). X = 7500 × n; the inset rectangle is |x|, |y| ≤ X − 200.

const SIX: WorldFrame = Object.freeze({ sectors: 6 });
const THREE: WorldFrame = Object.freeze({ sectors: 3 });
const ORIGIN: Vector3 = Object.freeze({ x: 0, y: 0, z: 0 });
const c = INITIAL_DIAGONAL;

/** A rand source that replays `values` and fails on any draw beyond them. */
function scripted(values: readonly number[]): RandSource & { readonly used: number } {
  let used = 0;
  return {
    next() {
      if (used >= values.length) throw new Error('drew more rand values than scripted');
      return values[used++];
    },
    get used() {
      return used;
    },
  };
}

function record(fields: Partial<PlacementRecord>): PlacementRecord {
  return { gridSpacing: 0, anchor: null, position: ORIGIN, region: null, ...fields };
}

/** Item 7: forward row f = (±c, ±c, 0) by the signs of x and y (−0 counts as positive), up (0, 0, 1), first row (−f_y, f_x, 0). */
function attitude(forwardX: number, forwardY: number): AttitudeRows {
  return [{ x: -forwardY, y: forwardX, z: 0 }, { x: 0, y: 0, z: 1 }, { x: forwardX, y: forwardY, z: 0 }];
}

const REGION: SpawnRegion = Object.freeze({ x0: -5625, y0: -5625, x1: 5625, y1: 0 });

describe('placement route selection (0x68398)', () => {
  it('prefers the anchor over a stored position and a rectangle, drawing sign then size for x, y and z', () => {
    const rand = scripted([0, 0, 1, 199, 2, 32767]);
    const target = { x: 1000, y: -2000, z: Math.fround(0.7) };
    const placement = placeRecord(record({ anchor: { target }, position: { x: 5, y: 0, z: 0 }, region: REGION }), SIX, rand);
    expect(rand.used).toBe(6);
    expect(placement.route).toBe('anchor');
    // Offsets: x +400 (even, 0 mod 200), y −599 (odd, 199), z +567 (even, 32767 mod 200 = 167). The z sum is exact in
    // double precision and rounds once, toward zero.
    expect(placement.position).toEqual({ x: 1400, y: -2599, z: float32OfDouble(Math.fround(0.7) + 567, 'toward-zero') });
    expect(placement.position.z).not.toBe(Math.fround(Math.fround(0.7) + 567));
    expect(placement.attitude).toEqual(attitude(c, -c));
  });

  it('falls back to the whole-world default, two draws, when the anchored object does not exist', () => {
    const rand = scripted([16384, 8192]);
    const placement = placeRecord(record({ anchor: { target: null }, position: { x: 5, y: 0, z: 0 }, region: REGION }), SIX, rand);
    expect(rand.used).toBe(2);
    expect(placement.route).toBe('world');
    expect(placement.position).toEqual({ x: expectedWorld(6, 16384), y: expectedWorld(6, 8192), z: 0 });
  });

  it('copies a stored position bit for bit without drawing, before the rectangle', () => {
    const rand = scripted([]);
    const stored = placeRecord(record({ position: { x: 0, y: 0, z: 5 }, region: REGION }), SIX, rand);
    expect(stored).toMatchObject({ route: 'stored', position: { x: 0, y: 0, z: 5 } });
    const signed = placeRecord(record({ position: { x: -0, y: 3, z: 0 }, region: REGION }), SIX, rand);
    expect(signed.route).toBe('stored');
    expect(Object.is(signed.position.x, -0)).toBe(true);
    // −0 counts as positive for the attitude.
    expect(signed.attitude).toEqual(attitude(c, c));
    expect(rand.used).toBe(0);
  });

  it('treats signed zeros as a zero position and uses the rectangle, x then y', () => {
    const rand = scripted([0, 32767]);
    const placement = placeRecord(record({ position: { x: -0, y: -0, z: -0 }, region: REGION }), SIX, rand);
    expect(rand.used).toBe(2);
    expect(placement.route).toBe('region');
    // Upper end 0 with rand 32767: the tiny negative −5625 × 2^-30, not 0, so the attitude faces −y.
    expect(placement.position).toEqual({ x: -5625, y: -5625 * 2 ** -30, z: 0 });
    expect(placement.attitude).toEqual(attitude(-c, -c));
  });

  it('uses the whole-world default when nothing else is set', () => {
    const rand = scripted([100, 32000]);
    const placement = placeRecord(record({}), SIX, rand);
    expect(rand.used).toBe(2);
    expect(placement).toMatchObject({ route: 'world', position: { x: expectedWorld(6, 100), y: expectedWorld(6, 32000), z: 0 } });
  });

  it('refuses the grid route before drawing, as an invariant violation', () => {
    const rand = scripted([]);
    let caught: unknown;
    try {
      placeRecord(record({ gridSpacing: 40, anchor: { target: ORIGIN } }), SIX, rand);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CoreFaultError);
    expect(caught).toMatchObject({ code: 'invariant-violated', site: 'placement.grid' });
    expect(rand.used).toBe(0);
  });

  it('draws from the world RNG, one step per rand value', () => {
    const stream = new RandStream(0x2468ace0);
    placeRecord(record({}), SIX, stream);
    expect(stream.state).toBe(nextRandom(nextRandom(0x2468ace0).state).state);
    const anchored = new RandStream(7);
    placeRecord(record({ anchor: { target: ORIGIN } }), SIX, anchored);
    let state = 7;
    for (let draw = 0; draw < 6; draw++) state = nextRandom(state).state;
    expect(anchored.state).toBe(state);
  });

  it('returns frozen results detached from the inputs', () => {
    const position = { x: 10, y: -20, z: 5 };
    const placement = placeRecord(record({ position }), SIX, scripted([]));
    expect(placement.position).not.toBe(position);
    expect(Object.isFrozen(placement)).toBe(true);
    expect(Object.isFrozen(placement.position)).toBe(true);
    expect(Object.isFrozen(placement.attitude)).toBe(true);
    for (const row of placement.attitude) expect(Object.isFrozen(row)).toBe(true);
  });
});

describe('world check after every route', () => {
  const stored = (x: number, y: number, z = 0) => placeRecord(record({ position: { x, y, z } }), SIX, scripted([])).position;

  it('keeps points inside the rectangle inset by 200, bounds included', () => {
    expect(stored(44800, -44800, 7)).toEqual({ x: 44800, y: -44800, z: 7 });
    expect(stored(-44800, 44800, 7)).toEqual({ x: -44800, y: 44800, z: 7 });
  });

  it('moves a point beyond the inset once by 300 toward the origin, keeping z', () => {
    // 1/65536 and 65536 × 2^-16 are exact: dx = −300 exactly, and y = 0 gives dy = −0 and y' = +0.
    const east = stored(65536, 0, 9);
    expect(east).toEqual({ x: 65236, y: 0, z: 9 });
    expect(Object.is(east.y, 0)).toBe(true);
    expect(stored(-65536, 0)).toEqual({ x: -65236, y: 0, z: 0 });
    expect(stored(0, -65536)).toEqual({ x: 0, y: -65236, z: 0 });
    // One float32 step past the bound (spacing 2^-8) is already outside.
    const justOutside = 44800 + 2 ** -8;
    expect(stored(justOutside, 0)).toEqual({ ...expectedPull(justOutside, 0), z: 0 });
  });

  it('does not clamp or check again', () => {
    expect(stored(200000, 0)).toEqual({ x: 199700, y: 0, z: 0 });
  });

  it('rounds each f32 store toward zero, within one float32 ulp of round-to-nearest', () => {
    const moved = stored(49152, 49152);
    const pull = expectedPull(49152, 49152);
    expect(moved).toEqual({ ...pull, z: 0 });
    const inverse = 1 / Math.sqrt(2 * 49152 * 49152);
    const nearest = Math.fround(49152 + Math.fround(49152 * inverse * -300));
    // Spacing 2^-8 in [32768, 65536).
    expect(Math.abs(moved.x - nearest)).toBeLessThanOrEqual(2 ** -8);
    expect(float32Bits(moved.x)).toBe(float32Bits(pull.x));
  });

  it('pulls a slice-like rectangle placement that reaches the edge band', () => {
    // Reference rectangle x 20000–24000, y 0–0 at q = 1.875 becomes x 37500–45000 in a six-sector world. The largest r
    // with 37500 + 7500 × r × 32769 × 2^-30 ≤ 44800 is floor(7300 × 2^30 ÷ (7500 × 32769)) = 31893.
    const region = runtimeRegion({ x0: 20000, y0: 0, x1: 24000, y1: 0 }, 1.875, 'region');
    expect(region).toEqual({ x0: 37500, y0: 0, x1: 45000, y1: 0 });
    const place = (rand: number) => placeRecord(record({ region }), SIX, scripted([rand, 0])).position;
    expect(place(31893)).toEqual({ x: expectedRectangle(37500, 45000, 31893), y: 0, z: 0 });
    expect(place(31893).x).toBeLessThanOrEqual(44800);
    for (const rand of [31894, 32767]) {
      const x = expectedRectangle(37500, 45000, rand);
      expect(x).toBeGreaterThan(44800);
      expect(place(rand)).toEqual({ ...expectedPull(x, 0), z: 0 });
    }
    expect(place(32767).x).toBe(float32OfDouble(45000 - 2 ** -8 - 300, 'toward-zero'));
  });

  it('always ends a whole-world default point inside the inset in a world of 3 sectors', () => {
    // Item 6: for n ≥ 3 the move takes every point of the band inside. Each axis is swept over all of D against the
    // extremes and the middle of the other.
    const limit = 22500 - 200;
    const unset = record({});
    const draws = [0, 0];
    let used = 0;
    const source: RandSource = { next: () => draws[used++ % 2] };
    const outside: number[][] = [];
    for (const other of [0, 16384, 32767]) {
      for (let rand = 0; rand <= 32767; rand++) {
        for (const pair of [[rand, other], [other, rand]] as const) {
          [draws[0], draws[1]] = pair;
          const { x, y } = placeRecord(unset, THREE, source).position;
          if (!(Math.abs(x) <= limit && Math.abs(y) <= limit)) outside.push([...pair]);
        }
      }
    }
    expect(outside).toEqual([]);
    expect(used).toBe(3 * 32768 * 2 * 2);
  });
});

describe('initial attitude', () => {
  it('uses the float32 0.70710677, bits 0x3F3504F3', () => {
    expect(float32Bits(INITIAL_DIAGONAL)).toBe(0x3f3504f3);
  });

  it.each([
    [10, 20, c, c],
    [-10, 20, -c, c],
    [10, -20, c, -c],
    [-10, -20, -c, -c],
    [-0, -20, c, -c],
    [10, -0, c, c],
  ])('faces away from the centre along the quadrant diagonal at (%d, %d)', (x, y, forwardX, forwardY) => {
    const placement = placeRecord(record({ position: { x, y, z: 1 } }), SIX, scripted([]));
    expect(placement.attitude).toEqual(attitude(forwardX, forwardY));
  });

  it('follows the moved point, not the routed one', () => {
    // (65536, −0.5) moves to x ≈ 65236 and keeps a negative y.
    const { position, attitude: rows } = placeRecord(record({ position: { x: 65536, y: -0.5, z: 0 } }), SIX, scripted([]));
    expect(position.y).toBeLessThan(0);
    expect(rows).toEqual(attitude(c, -c));
  });
});

describe('section-5 member positions', () => {
  it('adds the layout offset to the cycle anchor per axis, rounding toward zero', () => {
    // 1 + 2^-23 + 0.75 × 2^-23 chops to 1 + 2^-23 (nearest would give 1 + 2^-22).
    const anchor = { x: 1 + 2 ** -23, y: -(1 + 2 ** -23), z: 100 };
    const offset = { x: 3 * 2 ** -25, y: -3 * 2 ** -25, z: 25 };
    expect(memberPosition(anchor, offset)).toEqual({ x: 1 + 2 ** -23, y: -(1 + 2 ** -23), z: 125 });
    expect(Math.fround(anchor.x + offset.x)).toBe(1 + 2 ** -22);
    expect(Object.isFrozen(memberPosition(anchor, offset))).toBe(true);
  });

  it('keeps members of one cycle at fixed offsets from the anchor, with no world check', () => {
    const anchor = placeRecord(record({ region: { x0: 44000, y0: 0, x1: 44000, y1: 0 } }), SIX, scripted([0, 0])).position;
    expect(anchor).toEqual({ x: 44000, y: 0, z: 0 });
    const layout = [{ x: 0, y: 0, z: 0 }, { x: 25, y: 0, z: 0 }, { x: 1000, y: -5, z: 60 }];
    expect(layout.map(offset => memberPosition(anchor, offset))).toEqual([
      { x: 44000, y: 0, z: 0 },
      { x: 44025, y: 0, z: 0 },
      // Beyond the inset (44800) and kept there: members are not checked against the world.
      { x: 45000, y: -5, z: 60 },
    ]);
  });
});

describe('runtime frame and placement together', () => {
  it('places in the world the slice map frame describes', () => {
    const frame = runtimeFrame(
      { coordinates: { unit: 'scen-reference', referenceScale: 8000, layoutUnit: 'scen-runtime' }, mapFrame: { rightAxis: '+x', upAxis: '-y', center: { right: 0, up: 0 }, halfExtent: 24000 } },
      'mission',
    );
    const placement = placeRecord(record({}), frame, scripted([0, 32767]));
    // (−45000, 44999.99609375) is outside the inset and moves once toward the origin.
    expect(placement.position).toEqual({ ...expectedPull(-45000, 45000 - 2 ** -8), z: 0 });
  });
});
