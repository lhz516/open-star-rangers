/**
 * Collision shapes and their point tests (docs/original/formats/craft.md §3.5.1; docs/original/formats/executable.md,
 * H7): the shape of a craft record (+0x10) and of a DEBRIS record (+0x18), as world creation's load transforms leave
 * them (load-transforms.ts), and the two tests that ask whether a point lies in one. The collision passes (P3-07/19)
 * use them; the missile fuse's strict test and the projectile's segment test belong to P3-07/20 and 17.
 *
 * Arithmetic, read from native instructions under the start-up control word (53-bit precision, round to nearest):
 * - `0x56dc0` (point into a frame): the differences point − origin in double; the first local component dots them
 *   with row 1, the other two dot their f32-rounded copies with rows 2 and 3; each dot product sums the y term and the
 *   x term first, then adds the z term, in double, and is stored as f32.
 * - the squared distance of both tests: each double difference times its f32-rounded copy, (y² + x²) + z² in double;
 *   `0x29bf4` rounds it to f32 before the non-strict comparison with r² and returns it, `0x29d58` compares it unrounded.
 * Products of an f32 and a double, and every sum, round to double as JavaScript's do.
 */
import type { Vec3 } from '../contracts/domain-events.ts';
import type { Matrix3 } from '../world/entity-table.ts';

/** An axis-aligned box in a shape's frame: f32 corners. */
export interface ShapeBox {
  readonly lower: Vec3;
  readonly upper: Vec3;
}

/** A collision shape after the load transforms; every number is f32. */
export interface CollisionShape {
  /** Shape +0x00: the radius. */
  readonly radius: number;
  /** Shape +0x04: the radius squared, which the point tests compare with. */
  readonly radiusSquared: number;
  /** Shape +0x08–+0x1C: the world-axis bounds the projectile test reads (P3-07/17). */
  readonly bounds: ShapeBox;
  /** Shape +0x20/+0x24, in stored order; empty when the sphere alone decides. */
  readonly boxes: readonly ShapeBox[];
  /** Shape +0x2C–+0x40 when the flag +0x28 is non-zero: points strictly inside it skip the box test. */
  readonly innerBox: ShapeBox | null;
}

const vec = (x: number, y: number, z: number): Vec3 => Object.freeze({ x, y, z });

/** `0x56dc0`: `point` in the frame of `orientation`'s rows placed at `origin`; see the module comment. */
export function pointInFrame(orientation: Matrix3, origin: Vec3, point: Vec3): Vec3 {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const dz = point.z - origin.z;
  const fx = Math.fround(dx);
  const fy = Math.fround(dy);
  const fz = Math.fround(dz);
  const [r0, r1, r2, r3, r4, r5, r6, r7, r8] = orientation;
  return vec(
    Math.fround(dy * r1 + dx * r0 + dz * r2),
    Math.fround(fy * r4 + fx * r3 + fz * r5),
    Math.fround(fy * r7 + fx * r6 + fz * r8),
  );
}

/** The squared distance both point tests form, in double: each difference times its f32 copy, (y² + x²) + z². */
function squaredDistance(point: Vec3, origin: Vec3): number {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const dz = point.z - origin.z;
  return dy * Math.fround(dy) + dx * Math.fround(dx) + dz * Math.fround(dz);
}

const strictlyInside = (local: Vec3, { lower, upper }: ShapeBox): boolean =>
  local.x > lower.x && local.x < upper.x && local.y > lower.y && local.y < upper.y && local.z > lower.z && local.z < upper.z;

/** The box part of both tests, for a point already within the radius of a shape with boxes. */
function inBoxes(shape: CollisionShape, position: Vec3, orientation: Matrix3, point: Vec3): boolean {
  const local = pointInFrame(orientation, position, point);
  if (shape.innerBox !== null && strictlyInside(local, shape.innerBox)) return false;
  return shape.boxes.some((box) => strictlyInside(local, box));
}

/** The result of `0x29bf4`: whether the point hits, and the f32 squared distance it computed (the collision passes keep it). */
export interface CraftPointTest {
  readonly hit: boolean;
  readonly distanceSquared: number;
}

/**
 * `0x29bf4`: whether `point` lies in a craft's `shape` at `position` and `orientation`. The f32 squared distance must be
 * at most r²; a shape without boxes then hits; otherwise the point, in the craft's frame, must not lie strictly inside
 * the inner box and must lie strictly inside one of the boxes.
 */
export function craftContainsPoint(shape: CollisionShape, position: Vec3, orientation: Matrix3, point: Vec3): CraftPointTest {
  const distanceSquared = Math.fround(squaredDistance(point, position));
  const hit = distanceSquared <= shape.radiusSquared && (shape.boxes.length === 0 || inBoxes(shape, position, orientation, point));
  return { hit, distanceSquared };
}

/**
 * `0x29d58`: whether `point` lies in a fragment's DEBRIS `shape` at `position` and `orientation`; as craftContainsPoint,
 * but the squared distance is compared unrounded and not returned.
 */
export function debrisContainsPoint(shape: CollisionShape, position: Vec3, orientation: Matrix3, point: Vec3): boolean {
  return squaredDistance(point, position) <= shape.radiusSquared && (shape.boxes.length === 0 || inBoxes(shape, position, orientation, point));
}
