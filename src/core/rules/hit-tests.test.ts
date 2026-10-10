import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../contracts/domain-events.ts';
import type { Entity, EntityTable, FragmentCombat, Matrix3 } from '../world/entity-table.ts';
import type { CraftRuleData } from '../world/rule-data.ts';
import { entityInit, expectFault, stillEntityInit, TEST_MODEL, TEST_ORIENTATION, testState } from '../world/world.test-support.ts';
import type { CollisionShape, ShapeBox } from './collision-shapes.ts';
import { deflectsOffFragment, findProjectileHit, refinedImpact, ricochet, segmentHitsShape, segmentMeetsBounds, type Segment } from './hit-tests.ts';
import type { DebrisRuleData } from './load-transforms.ts';
import { RAND_SCALE } from './original-random.ts';
import { scriptedRand } from './rand.test-support.ts';

// docs/plan/p3/02/spec.md, CR-03 and CR-06; docs/original/formats/executable.md, H3, H4 and H8. Every expectation is
// worked out by hand from the segment, the boxes and the f32 grid (between 2^23 and 2^24 the f32 values are the
// integers, between 2^24 and 2^25 the even integers), not by the functions under test.

const f = Math.fround;
const at = (x: number, y: number, z: number): Vec3 => Object.freeze({ x, y, z });
const segment = (from: Vec3, to: Vec3): Segment => ({ from, to });
const box = (lower: [number, number, number], upper: [number, number, number]): ShapeBox => ({ lower: at(...lower), upper: at(...upper) });
const cube = (half: number): ShapeBox => box([-half, -half, -half], [half, half, half]);
const IDENTITY = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]) as unknown as Matrix3;
/** Rows (0, 1, 0), (−1, 0, 0), (0, 0, 1): local x is world y, local y is −world x. */
const QUARTER_TURN = TEST_ORIENTATION;
const ORIGIN = at(0, 0, 0);

/** A shape whose radius no test reads: the segment tests use only the bounds, the boxes and the inner box. */
const shape = (bounds: ShapeBox, boxes: readonly ShapeBox[] = [], innerBox: ShapeBox | null = null): CollisionShape =>
  ({ radius: 0, radiusSquared: 0, bounds, boxes, innerBox });

describe('segmentMeetsBounds, the coarse test 0x2874c', () => {
  const bounds = cube(1);

  it('places the bounds along the world axes at the target\'s position', () => {
    expect(segmentMeetsBounds(segment(at(100, 0, -5), at(100, 0, 5)), at(100, 0, 0), bounds)).toBe(true);
    expect(segmentMeetsBounds(segment(at(0, 0, -5), at(0, 0, 5)), at(100, 0, 0), bounds)).toBe(false);
  });

  it('rounds each corner of the placed box to f32', () => {
    // Bounds x from 1 to 4 at x = 2^24: the lower face f32(2^24 + 1) is 2^24, so a segment along x = 2^24 touches it.
    // At x = 0 the same segment lies below the face x = 1 at both ends.
    const offset = box([1, -1, -1], [4, 1, 1]);
    expect(segmentMeetsBounds(segment(at(2 ** 24, 0, -5), at(2 ** 24, 0, 5)), at(2 ** 24, 0, 0), offset)).toBe(true);
    expect(segmentMeetsBounds(segment(at(0, 0, -5), at(0, 0, 5)), ORIGIN, offset)).toBe(false);
  });

  it('rejects both endpoints strictly beyond one face; endpoints on the face graze it, inclusively', () => {
    expect(segmentMeetsBounds(segment(at(1.5, 0, -5), at(2, 0, 5)), ORIGIN, bounds)).toBe(false);
    // Along x = 1: the z faces are crossed at t = 0.4 and 0.6 with x = 1 within [−1, 1].
    expect(segmentMeetsBounds(segment(at(1, 0, -5), at(1, 0, 5)), ORIGIN, bounds)).toBe(true);
    expect(segmentMeetsBounds(segment(at(f(1 + 2 ** -23), 0, -5), at(f(1 + 2 ** -23), 0, 5)), ORIGIN, bounds)).toBe(false);
  });

  it('hits when either endpoint is strictly inside, even for a segment of length 0, but not on a face', () => {
    expect(segmentMeetsBounds(segment(at(0.5, 0, 0), at(0.5, 0, 0)), ORIGIN, bounds)).toBe(true);
    expect(segmentMeetsBounds(segment(at(5, 5, 5), at(0, 0, 0.5)), ORIGIN, bounds)).toBe(true);
    expect(segmentMeetsBounds(segment(at(1, 0, 0), at(1, 0, 0)), ORIGIN, bounds)).toBe(false);
  });

  it('detects a segment many times the box\'s size crossing it with both ends outside, and misses one passing a corner', () => {
    expect(segmentMeetsBounds(segment(at(0, 0, -1000), at(0, 0, 1000)), ORIGIN, bounds)).toBe(true);
    // From (0, 3) to (3, 0): x = 1 is crossed at y = 2 and y = 1 at x = 2, both outside.
    expect(segmentMeetsBounds(segment(at(0, 3, 0), at(3, 0, 0)), ORIGIN, bounds)).toBe(false);
  });

  it('takes t = 0 and t = 1 as crossings', () => {
    expect(segmentMeetsBounds(segment(at(0, 0, -5), at(0, 0, -1)), ORIGIN, bounds)).toBe(true);
    expect(segmentMeetsBounds(segment(at(0, 0, -1), at(0, 0, -5)), ORIGIN, bounds)).toBe(true);
  });

  it('skips an axis whose difference is −0, which would otherwise divide by it', () => {
    // d.x = −0 − 0 = −0: tried, the x lower face would give t = −1 ÷ −0 = +∞, which no f32 store holds.
    expect(segmentMeetsBounds(segment(at(0, 0, -5), at(-0, 0, 5)), ORIGIN, bounds)).toBe(true);
  });
});

describe('refinedImpact, the box test 0x28efc', () => {
  it('tests in the target\'s frame and reports the nearest entry\'s world point, local point and face', () => {
    // At (10, 10, 0) turned a quarter, world (10, 2) to (10, 18) is local x from −8 to 8, entering x = −1 at t = 7/16.
    const boxed = shape(cube(9), [box([-1, -2, -3], [1, 2, 3])]);
    expect(refinedImpact(segment(at(10, 2, 0), at(10, 18, 0)), at(10, 10, 0), QUARTER_TURN, boxed))
      .toEqual({ point: at(10, 9, 0), local: at(-1, 0, 0), face: 0 });
  });

  it('codes the faces x lower 0, y lower 1, z lower 2, x upper 3, y upper 4, z upper 5', () => {
    const unit = shape(cube(2), [cube(1)]);
    const entries: [Vec3, Vec3, number][] = [
      [at(-4, 0, 0), at(4, 0, 0), 0], [at(0, -4, 0), at(0, 4, 0), 1], [at(0, 0, -4), at(0, 0, 4), 2],
      [at(4, 0, 0), at(-4, 0, 0), 3], [at(0, 4, 0), at(0, -4, 0), 4], [at(0, 0, 4), at(0, 0, -4), 5],
    ];
    for (const [from, to, face] of entries) {
      const impact = refinedImpact(segment(from, to), ORIGIN, IDENTITY, unit);
      // Every entry is at t = 3/8, one unit from the centre towards `from`.
      expect(impact).toMatchObject({ face, point: at(from.x / 4, from.y / 4, from.z / 4) });
    }
  });

  it('keeps the nearest entry over every box, the earlier face on a tie', () => {
    // Box A is entered at z = 4 (t = 0.7), box B, later in the list, at z = −6 (t = 0.2).
    const twoBoxes = shape(cube(9), [box([-1, -1, 4], [1, 1, 6]), box([-1, -1, -6], [1, 1, -4])]);
    expect(refinedImpact(segment(at(0, 0, -10), at(0, 0, 10)), ORIGIN, IDENTITY, twoBoxes)).toEqual({ point: at(0, 0, -6), local: at(0, 0, -6), face: 2 });
    // Through the edge x = y = −1: the x and y lower faces both at t = 0.25; x lower comes first.
    expect(refinedImpact(segment(at(-2, -2, 0), at(2, 2, 0)), ORIGIN, IDENTITY, shape(cube(2), [cube(1)]))).toEqual({ point: at(-1, -1, 0), local: at(-1, -1, 0), face: 0 });
  });

  it('has no inside test: a segment wholly inside a box misses it, and one leaving it hits its exit face', () => {
    const unit = shape(cube(2), [cube(1)]);
    expect(refinedImpact(segment(at(0, 0, -0.5), at(0, 0, 0.5)), ORIGIN, IDENTITY, unit)).toBeNull();
    expect(segmentHitsShape(segment(at(0, 0, -0.5), at(0, 0, 0.5)), ORIGIN, IDENTITY, unit)).toBeNull();
    // Leaving through z = 1 at t = f32(0.2); the point F(5 × f32(0.2)) rounds to 1.
    expect(refinedImpact(segment(at(0, 0, 0), at(0, 0, 5)), ORIGIN, IDENTITY, unit)).toEqual({ point: at(0, 0, 1), local: at(0, 0, 1), face: 5 });
  });

  it('misses when both endpoints are strictly inside the inner box, whatever they cross', () => {
    const withInner = shape(cube(9), [box([0, 0, 0], [1, 1, 1])], cube(4));
    expect(refinedImpact(segment(at(-2, 0.5, 0.5), at(2, 0.5, 0.5)), ORIGIN, IDENTITY, withInner)).toBeNull();
    // One endpoint outside the inner box: the box is entered at x = 0, t = 2/8.
    expect(refinedImpact(segment(at(-2, 0.5, 0.5), at(6, 0.5, 0.5)), ORIGIN, IDENTITY, withInner)).toEqual({ point: at(0, 0.5, 0.5), local: at(0, 0.5, 0.5), face: 0 });
    // An endpoint on the inner box's face is not strictly inside it.
    expect(refinedImpact(segment(at(-2, 0.5, 0.5), at(4, 0.5, 0.5)), ORIGIN, IDENTITY, withInner)?.face).toBe(0);
  });

  it('computes the impact point from the unrounded difference of the endpoints', () => {
    // x from −0.5 to 16,777,218, y from −1 to 1: the y lower face y = 0 is crossed at t = 0.5. The difference
    // 16,777,218.5 is no f32; unrounded, x = F(8,388,609.25 − 0.5) = 8,388,609, while F(16,777,218) × 0.5 − 0.5 would
    // give 8,388,608.5 and round to the even 8,388,608. The x upper face is crossed later (t ≈ 0.596).
    const wide = shape(cube(2e7), [box([-1e7, 0, -1], [1e7, 1, 1])]);
    expect(refinedImpact(segment(at(-0.5, -1, 0), at(16_777_218, 1, 0)), ORIGIN, IDENTITY, wide))
      .toEqual({ point: at(8_388_609, 0, 0), local: at(8_388_609, 0, 0), face: 1 });
  });
});

describe('segmentHitsShape, one object of 0x28450', () => {
  it('without boxes hits on the coarse test alone, without an impact', () => {
    expect(segmentHitsShape(segment(at(0, 0, -5), at(0, 0, 5)), ORIGIN, IDENTITY, shape(cube(1)))).toEqual({ impact: null });
  });

  it('with boxes also needs the refined test', () => {
    // Both segments start inside the bounds; only the second meets the box, at t = 3/8.
    const offset = shape(cube(5), [box([2, 2, -1], [3, 3, 1])]);
    expect(segmentHitsShape(segment(at(0, 0, -4), at(0, 0, 4)), ORIGIN, IDENTITY, offset)).toBeNull();
    expect(segmentHitsShape(segment(at(2.5, 2.5, -4), at(2.5, 2.5, 4)), ORIGIN, IDENTITY, offset)).toEqual({
      impact: { point: at(2.5, 2.5, -1), local: at(2.5, 2.5, -1), face: 2 },
    });
  });
});

describe('findProjectileHit, the walk of 0x28450', () => {
  /** Cubes of half-size 1 for every craft kind; kind 7's DEBRIS records: 0 with a box, 1 without one. */
  function scene(): { entities: EntityTable; craft: CraftRuleData[] } {
    const debris = (boxes: readonly ShapeBox[]): DebrisRuleData => ({ weights: ORIGIN, direction: ORIGIN, shape: shape(cube(1), boxes), small: false });
    const craft = Array.from({ length: 20 }, (_, kindBit): CraftRuleData =>
      ({ shape: shape(cube(1)), mountOffsets: [], parts: 0, debris: kindBit === 7 ? [debris([cube(1)]), debris([])] : [] }));
    return { entities: testState().entities, craft };
  }
  /** Along x from −10 to 100 at y = z = 0. */
  const PATH = segment(at(-10, 0, 0), at(100, 0, 0));

  function craftAt(entities: EntityTable, kindBit: number, x: number): Entity {
    const entity = entities.allocate(stillEntityInit(kindBit, { position: at(x, 0, 0) }));
    entity.state = 'active';
    return entity;
  }

  function fragmentAt(entities: EntityTable, x: number, combat: Partial<FragmentCombat> = {}): Entity {
    const sourceKindBit = combat.sourceKindBit ?? 7;
    const part = combat.part ?? 0;
    const entity = entities.allocate(entityInit(24, {
      position: at(x, 0, 0),
      presentation: { type: 'fragment', model: TEST_MODEL, part, display: combat.debris === null ? 'parts-0-2' : 'part' },
      combat: { type: 'fragment', sourceKindBit, part, debris: 0, durability: 1200, explodeOnExpiry: false, expiry: { type: 'never' }, handOff: null, ...combat },
    }));
    entity.state = 'active';
    return entity;
  }

  it('returns the first eligible craft in kind-bit and allocation order, not the nearest', () => {
    const { entities, craft } = scene();
    craftAt(entities, 5, 10);
    const first = craftAt(entities, 3, 80);
    craftAt(entities, 3, 20);
    expect(findProjectileHit(entities, craft, PATH, null)).toEqual({ type: 'craft', target: first, impact: null });
  });

  it('skips parked, docked and not yet active craft, destroyed sources and the shooter, but not a friendly craft', () => {
    const { entities, craft } = scene();
    const parked = entities.allocate(stillEntityInit(2, { position: at(10, 0, 0), activity: 'parked', movement: null }));
    parked.state = 'active';
    craftAt(entities, 2, 20).activity = 'docked';
    entities.allocate(stillEntityInit(2, { position: at(30, 0, 0) }));
    craftAt(entities, 2, 40).state = 'destroyed-source';
    const shooter = craftAt(entities, 2, 50);
    const friend = craftAt(entities, 2, 60);
    expect(friend.side).toBe('friendly');
    expect(findProjectileHit(entities, craft, PATH, shooter.id)?.target).toBe(friend);
    expect(findProjectileHit(entities, craft, PATH, null)?.target).toBe(shooter);
  });

  it('stops at a destroyed craft still in state 7, so nothing behind it is tested', () => {
    const { entities, craft } = scene();
    fragmentAt(entities, 5);
    const dead = craftAt(entities, 4, 50);
    dead.destroyed = true;
    craftAt(entities, 9, 70);
    expect(findProjectileHit(entities, craft, PATH, null)?.target).toBe(dead);
  });

  it('walks the fragments only when no craft is struck: active ones with DEBRIS parameters and durability above 0', () => {
    const { entities, craft } = scene();
    fragmentAt(entities, 5, { sourceKindBit: 0, debris: null, durability: 1200 });
    fragmentAt(entities, 10, { durability: 0 });
    fragmentAt(entities, 15).state = 'presentation-ready';
    fragmentAt(entities, 20).activity = 'docked';
    const struck = fragmentAt(entities, 30, { debris: 1, durability: 1 });
    const boxed = fragmentAt(entities, 40);
    expect(findProjectileHit(entities, craft, PATH, null)).toEqual({
      type: 'fragment', target: struck, fragment: struck.combat, debris: craft[7].debris[1], impact: null,
    });
    (struck.combat as FragmentCombat).durability = 0;
    // Record 0 has a box: the refined test finds its face along the path (local y, as the fragment is turned a quarter).
    const refined = findProjectileHit(entities, craft, PATH, null);
    expect(refined).toMatchObject({ type: 'fragment', target: boxed, impact: { face: 4 } });
    expect(refined?.impact?.point.x).toBeCloseTo(39, 4);
    const before = craftAt(entities, 19, 90);
    expect(findProjectileHit(entities, craft, PATH, null)?.target).toBe(before);
  });

  it('returns null when nothing is struck, and faults without rule data for a craft it tests', () => {
    const { entities, craft } = scene();
    craftAt(entities, 6, -50);
    expect(findProjectileHit(entities, craft, PATH, null)).toBeNull();
    craft[6] = null as unknown as CraftRuleData;
    expectFault(() => findProjectileHit(entities, craft, PATH, null), 'invariant-violated', 'hit-tests.shape');
  });
});

describe('deflectsOffFragment, the fragment choice of 0x28450', () => {
  const debris = (small: boolean): DebrisRuleData => ({ weights: ORIGIN, direction: ORIGIN, shape: shape(cube(1)), small });

  it('draws once off a fragment whose +0x5C is 0 and deflects when (rand & 3) = 0', () => {
    for (const [value, deflects] of [[0, true], [4, true], [32764, true], [1, false], [2, false], [32767, false]] as const) {
      const rand = scriptedRand([value]);
      expect(deflectsOffFragment(debris(false), rand)).toBe(deflects);
      expect(rand.used).toBe(1);
    }
  });

  it('never deflects off a small fragment, and draws nothing', () => {
    const rand = scriptedRand([]);
    expect(deflectsOffFragment(debris(true), rand)).toBe(false);
  });
});

describe('ricochet, 0x25dc4', () => {
  const TURN_SPAN = 1.221730494444444;
  const TURN_BASE = 2.530727452777778;
  /** u = rand × C, exact in double: 32767 × 32769 ÷ 2^30 = 1 − 2^−30. */
  const u = (rand: number): number => rand * RAND_SCALE;
  const IMPACT = { point: at(4, 5, 6), local: at(0, 0, -1), face: 2 as const };

  it('turns about row 2 for an odd coin by F(u × span + base), then sets each velocity component along the new row 3', () => {
    const rand = scriptedRand([7, 0, 0, 32767, 16384]);
    const result = ricochet(at(1, 2, 3), null, IDENTITY, rand);
    expect(rand.used).toBe(5);
    // Rows 1 and 3 of the identity turned by a about row 2 (0x22a50): row 1 (cos a, 0, sin a), row 3 (−sin a, 0, cos a).
    const angle = f(TURN_BASE);
    const [cos, sin] = [f(Math.cos(angle)), f(Math.sin(angle))];
    expect(angle * 180 / Math.PI).toBeCloseTo(145, 4);
    expect([result.orientation[0], result.orientation[2], result.orientation[6], result.orientation[8]]).toEqual([cos, sin, f(-sin), cos]);
    expect([result.orientation[3], result.orientation[4], result.orientation[5]]).toEqual([0, 1, 0]);
    expect(result.velocity.x).toBe(f(55 * f(-sin)));
    expect(Math.abs(result.velocity.y)).toBe(0);
    expect(result.velocity.z).toBe(f((u(16384) * 82.5 + 55) * cos));
    expect(result.position).toEqual(at(1, 2, 3));
  });

  it('turns about row 1 for an even coin, at most by about 215°, and moves to the impact point', () => {
    const rand = scriptedRand([4, 32767, 32767, 32767, 32767]);
    const result = ricochet(at(1, 2, 3), IMPACT, IDENTITY, rand);
    const angle = f(u(32767) * TURN_SPAN + TURN_BASE);
    expect(angle * 180 / Math.PI).toBeCloseTo(215, 4);
    // 0x228cc turns rows 2 and 3: row 2 (0, cos a, sin a), row 3 (0, −sin a, cos a); row 1 stays.
    const [cos, sin] = [f(Math.cos(angle)), f(Math.sin(angle))];
    expect([result.orientation[0], result.orientation[1], result.orientation[2]]).toEqual([1, 0, 0]);
    expect([result.orientation[4], result.orientation[5], result.orientation[7], result.orientation[8]]).toEqual([cos, sin, f(-sin), cos]);
    const speed = u(32767) * 82.5 + 55;
    expect(speed).toBeCloseTo(137.5, 6);
    expect([result.velocity.y, result.velocity.z]).toEqual([f(speed * f(-sin)), f(speed * cos)]);
    expect(result.position).toBe(IMPACT.point);
  });
});
