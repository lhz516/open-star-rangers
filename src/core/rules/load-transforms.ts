/**
 * The load transforms the original applies to the craft info and the DEBRIS parameters (docs/original/formats/craft.md
 * §3.8, `0x2cf38`, and §4.4, `0x246a0`), which the content keeps untransformed: world creation computes them once, in
 * the original's storage types, as the world's static rule data (docs/plan/p3/02/spec.md, CR-01).
 *
 * The constants are code rules of the executable's data object (craft.md §5), implemented here rather than imported.
 * Arithmetic, read from native instructions under the start-up control word (53-bit precision, round to nearest):
 * - ranges: the i32 lifetime (`FILD`) times the f32 1/64 times the f32 speed, then the square of the stored range;
 * - a gun mount's offset: f32(mount +0x08 + projectile length), the length first multiplied by the f64 0.5 for the
 *   craft records of kind bits 0 and 1;
 * - a shape with boxes: r is the largest f32 length of any box corner, each √((y² + x²) + z²) for a lower corner and
 *   √((x² + y²) + z²) for an upper one, rounded to f32 (the original compares the unrounded root with the f32 maximum,
 *   which selects the same value); the bounds are −r and r, the radius r and r² its f32 square;
 * - a DEBRIS record: the stored vector normalised by `0x56aa8` into a copy, then negated in place; each box corner
 *   component moved outward by the f64 3.5 twice, with an f32 store after each step; then r and its square as for a
 *   craft shape, and the class flag +0x5C when r − 3.5 < 20 in double.
 * Every f32 store is Math.fround; double products and sums are JavaScript's.
 */
import type { Box, CraftRecord, F32x3, F32x6, GunRecord, MissileBodyRecord, MissileRecord } from '../../content/rule-data/craft-info.ts';
import type { DebrisRecord } from '../../content/rule-data/debris-parameters.ts';
import type { Vec3 } from '../contracts/domain-events.ts';
import type { CollisionShape, ShapeBox } from './collision-shapes.ts';
import { PLAYER_KIND_BIT, WINGMAN_KIND_BIT } from './spawn-schedule.ts';

/** f32 `0x170fa2`: seconds per clock unit, turning a lifetime in clock units into a range. */
export const SECONDS_PER_CLOCK_UNIT = 1 / 64;
/** f64 `0x170fa6`: the share of the projectile length added to the gun mounts of kind bits 0 and 1. */
export const OWN_PROJECTILE_LENGTH_FACTOR = 0.5;
/** f64 `0x170c27` and `0x170c2f`: the step that moves each DEBRIS box corner outward, applied twice. */
export const DEBRIS_BOX_STEP = 3.5;
/** f64 `0x170c37`: a DEBRIS record is small (+0x5C = 1) when its radius − 3.5 lies below it. */
export const SMALL_DEBRIS_LIMIT = 20;
/** Gun +0x28: an automatic gun, whose mounts keep their offset. */
export const AUTOMATIC_GUN = 2;

const vec = (x: number, y: number, z: number): Vec3 => Object.freeze({ x, y, z });
const vecOf = ([x, y, z]: F32x3): Vec3 => vec(x, y, z);
const squared = (value: number): number => Math.fround(value * value);

/** The f32 range of a lifetime in clock units at an f32 speed: gun +0x0C from +0x24 and +0x08, missile +0x0C from +0x44 and +0x08. */
export const weaponRange = (lifetime: number, speed: number): number => Math.fround(lifetime * SECONDS_PER_CLOCK_UNIT * speed);

/** A gun record's transformed fields. */
export interface GunRuleData {
  /** +0x0C. */
  readonly range: number;
  /** +0x10. */
  readonly rangeSquared: number;
}

/** A missile record's transformed fields; +0x2C (the arc cosine of +0x28) is P3-08's and is not computed. */
export interface MissileRuleData {
  /** +0x0C, at the speed +0x08 that the load copies from the body record's +0xB8. */
  readonly range: number;
  /** +0x10. */
  readonly rangeSquared: number;
  /** +0x50 = (+0x4C)². */
  readonly fuseRadiusSquared: number;
}

export function gunRuleData(gun: GunRecord): GunRuleData {
  const range = weaponRange(gun.at24, gun.at08);
  return Object.freeze({ range, rangeSquared: squared(range) });
}

export function missileRuleData(missile: MissileRecord, body: MissileBodyRecord): MissileRuleData {
  const range = weaponRange(missile.at44, body.atB8);
  return Object.freeze({ range, rangeSquared: squared(range), fuseRadiusSquared: squared(missile.at4C) });
}

const lowerCornerLength = ([x, y, z]: F32x3): number => Math.fround(Math.sqrt(y * y + x * x + z * z));
const upperCornerLength = ([x, y, z]: F32x3): number => Math.fround(Math.sqrt(x * x + y * y + z * z));

/** r of a shape with boxes: the largest corner length, from +0. */
function boxRadius(boxes: readonly Box[]): number {
  let radius = 0;
  for (const { lower, upper } of boxes) radius = Math.max(radius, lowerCornerLength(lower), upperCornerLength(upper));
  return radius;
}

const shapeBox = ({ lower, upper }: Box): ShapeBox => Object.freeze({ lower: vecOf(lower), upper: vecOf(upper) });
const boundsOf = (values: readonly number[]): ShapeBox =>
  Object.freeze({ lower: vec(values[0], values[1], values[2]), upper: vec(values[3], values[4], values[5]) });
const cubeOf = (radius: number): ShapeBox => Object.freeze({ lower: vec(-radius, -radius, -radius), upper: vec(radius, radius, radius) });

function shapeOf(radius: number, bounds: ShapeBox, boxes: readonly Box[], innerFlag: number, inner: readonly number[]): CollisionShape {
  return Object.freeze({
    radius,
    radiusSquared: squared(radius),
    bounds,
    boxes: Object.freeze(boxes.map(shapeBox)),
    innerBox: innerFlag === 0 ? null : boundsOf(inner),
  });
}

/** A craft record's collision shape after `0x2cf38`: the stored radius and bounds without boxes, r and ±r with them. */
export function craftShape({ collision }: CraftRecord): CollisionShape {
  const { at00, at08, boxes, at28, at2C } = collision;
  // The content keeps the radius and bounds exactly when the shape has no boxes.
  if (boxes.length === 0) return shapeOf(at00 as number, boundsOf(at08 as F32x6), boxes, at28, at2C);
  const radius = boxRadius(boxes);
  return shapeOf(radius, cubeOf(radius), boxes, at28, at2C);
}

/**
 * A craft's mount offsets after `0x2cf38`: mount +0x00–+0x08, with +0x08 lengthened by the projectile length of the
 * mount's gun for every gun mount whose gun is not automatic, by half of it for kind bits 0 and 1. `lengths` holds the
 * length of every gun such a mount names (world creation checks that).
 */
export function mountOffsets(kindBit: number, craft: CraftRecord, guns: readonly GunRecord[], lengths: readonly number[]): readonly Vec3[] {
  const own = kindBit === PLAYER_KIND_BIT || kindBit === WINGMAN_KIND_BIT;
  return Object.freeze(craft.mounts.map(({ at00: [x, y, z], at10, weapon }) => {
    if (at10 !== 0 || guns[weapon].at28 === AUTOMATIC_GUN) return vec(x, y, z);
    const length = own ? lengths[weapon] * OWN_PROJECTILE_LENGTH_FACTOR : lengths[weapon];
    return vec(x, y, Math.fround(length + z));
  }));
}

/** `0x56aa8`: `v` divided by its f32 length, f32(component × (1 ÷ length)); a zero length leaves it. */
export function normalise(v: Vec3): Vec3 {
  const length = Math.fround(Math.sqrt(v.y * v.y + v.x * v.x + v.z * v.z));
  if (length === 0) return v;
  const inverse = 1 / length;
  return vec(Math.fround(v.x * inverse), Math.fround(v.y * inverse), Math.fround(v.z * inverse));
}

/** A DEBRIS record after `0x246a0`. */
export interface DebrisRuleData {
  /** +0x00–+0x08 negated: the weights of the source's rows for a fragment's offset (X6). */
  readonly weights: Vec3;
  /** +0x0C–+0x14: the stored vector normalised (not negated). */
  readonly direction: Vec3;
  /** +0x18–+0x5B with the widened boxes. */
  readonly shape: CollisionShape;
  /** +0x5C ≠ 0: durability 1200, half contact damage within the per-frame limit (X6, H3, H6). */
  readonly small: boolean;
}

/** A corner moved by `step` twice per component, an f32 store after each. */
const widened = (corner: F32x3, step: number): F32x3 =>
  corner.map((value) => Math.fround(Math.fround(value + step) + step)) as readonly number[] as F32x3;

export function debrisRuleData({ at00, collision }: DebrisRecord): DebrisRuleData {
  const stored = vecOf(at00);
  const boxes = collision.boxes.map(({ lower, upper }): Box => ({ lower: widened(lower, -DEBRIS_BOX_STEP), upper: widened(upper, DEBRIS_BOX_STEP) }));
  const radius = boxRadius(boxes);
  return Object.freeze({
    weights: vec(-stored.x, -stored.y, -stored.z),
    direction: normalise(stored),
    shape: shapeOf(radius, cubeOf(radius), boxes, collision.at28, collision.at2C),
    small: radius - DEBRIS_BOX_STEP < SMALL_DEBRIS_LIMIT,
  });
}
