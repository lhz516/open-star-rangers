/**
 * The projectile hit test (docs/plan/p3/02/spec.md, CR-03 and CR-06; docs/original/formats/executable.md, H3, H4, H7 and
 * H8): the segment tests `0x2874c` and `0x28efc` with its box test `0x28b48`, the two passes of `0x28450` that pick the
 * one object a projectile strikes, its choice off a fragment and the ricochet `0x25dc4`. They change nothing and draw
 * only in those two; systems/projectiles.ts applies the hit (`0x2a40c`, the removal, the fragment's durability).
 *
 * The segment runs from p0, the block's position before this tick's move, to p1, the position after it. Shapes are the
 * world's static rule data (craft §3.5.1 after the load transforms): never model bounds, render meshes or a sphere.
 * - `0x2874c`, the coarse test: a box along the world axes, each corner F(P + bound) from shape +0x08–+0x1C; the
 *   target's rows are not read. It misses when both endpoints lie strictly beyond the same face, hits when either lies
 *   strictly inside on all three axes, and otherwise tries each face of the axes along which d = F(p1 − p0) is not ±0.
 * - a face (`0x294c0`, `0x29550`, `0x295dc`): t = F((face − p0) ÷ d) must lie in [0, 1], and each other coordinate
 *   F(d × t + p0) within the box, all inclusive; the faces go x lower, x upper, y lower, …, z upper.
 * - `0x28efc`, the refined test, only for a shape with boxes: both endpoints in the target's frame (`0x56dc0`); a miss
 *   when the inner box exists and both lie strictly inside it; otherwise every box by `0x28b48`, which has the coarse
 *   test's strict rejection and face crossings but no inside test, so a segment wholly inside a box does not hit it.
 *   The smallest t over every face of every box wins, replaced only when strictly smaller (ties keep the earlier box
 *   and face); the face codes are x lower 0, y lower 1, z lower 2, x upper 3, y upper 4, z upper 5. The impact is the
 *   world point F((p1 − p0) × t + p0) and the local point the same of the local endpoints, the difference unrounded.
 * Arithmetic in double precision with f32 stores, as the x87 at the start-up control word (W13); a stored t that is not
 * finite is a fault, as the original unmasks overflow.
 */
import type { HitEvent, Vec3 } from '../contracts/domain-events.ts';
import { CoreFaultError } from '../errors.ts';
import { FRAGMENT_KIND_BIT, isActiveState, type Entity, type EntityId, type EntityTable, type FragmentCombat, type Matrix3 } from '../world/entity-table.ts';
import type { CraftRuleData } from '../world/rule-data.ts';
import { pointInFrame, type CollisionShape, type ShapeBox } from './collision-shapes.ts';
import { rotateRows } from './flight-motion.ts';
import type { DebrisRuleData } from './load-transforms.ts';
import { rowOf } from './movement-builders.ts';
import { RAND_SCALE, type RandSource } from './original-random.ts';

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `hit-tests.${site}`);

/** An f32 store F(x), and a fault when it is not finite. */
function store(value: number): number {
  const stored = Math.fround(value);
  if (!Number.isFinite(stored)) throw fault('result');
  return stored;
}

const vec = (x: number, y: number, z: number): Vec3 => Object.freeze({ x, y, z });

/** Where a projectile struck: the `hit` event's impact (CR-06). */
export type Impact = NonNullable<HitEvent['impact']>;
type Face = Impact['face'];

/** The segment of one move: from the position before it to the position after it. */
export interface Segment {
  readonly from: Vec3;
  readonly to: Vec3;
}

type Axis = 'x' | 'y' | 'z';
const AXES: readonly Axis[] = ['x', 'y', 'z'];
/** The two coordinates a crossing of an axis's faces checks, in the original's order. */
const OTHER_AXES: Readonly<Record<Axis, readonly [Axis, Axis]>> = { x: ['y', 'z'], y: ['x', 'z'], z: ['x', 'y'] };
/** Face codes of `0x28b48` by axis: the lower face, then the upper one. */
const FACES: Readonly<Record<Axis, readonly [Face, Face]>> = { x: [0, 3], y: [1, 4], z: [2, 5] };

const strictlyInside = (point: Vec3, { lower, upper }: ShapeBox): boolean =>
  point.x > lower.x && point.x < upper.x && point.y > lower.y && point.y < upper.y && point.z > lower.z && point.z < upper.z;

/** Both values strictly below `lower` or both strictly above `upper`. */
const beyond = (a: number, b: number, lower: number, upper: number): boolean => (a < lower && b < lower) || (a > upper && b > upper);

/** Both endpoints strictly beyond the same face of the box: the strict rejection of `0x2874c` and `0x28b48`. */
const separated = (p0: Vec3, p1: Vec3, { lower, upper }: ShapeBox): boolean =>
  beyond(p1.x, p0.x, lower.x, upper.x) || beyond(p1.y, p0.y, lower.y, upper.y) || beyond(p1.z, p0.z, lower.z, upper.z);

/** d = F(p1 − p0) per axis. */
const difference = (p0: Vec3, p1: Vec3): Vec3 => ({ x: store(p1.x - p0.x), y: store(p1.y - p0.y), z: store(p1.z - p0.z) });

/**
 * A face crossing at `face` along `axis`: its t = F((face − p0) ÷ d) when that lies in [0, 1] and the other two
 * coordinates F(d × t + p0) lie within the box, all inclusive; otherwise null.
 */
function crossing(axis: Axis, face: number, p0: Vec3, d: Vec3, { lower, upper }: ShapeBox): number | null {
  const t = store((face - p0[axis]) / d[axis]);
  if (!(t >= 0 && t <= 1)) return null;
  for (const other of OTHER_AXES[axis]) {
    const coordinate = store(d[other] * t + p0[other]);
    if (coordinate < lower[other] || !(coordinate <= upper[other])) return null;
  }
  return t;
}

/** Whether any face of the box is crossed, trying them in the original's order and stopping at the first. */
function crossesAnyFace(p0: Vec3, p1: Vec3, box: ShapeBox): boolean {
  const d = difference(p0, p1);
  for (const axis of AXES) {
    if (d[axis] === 0) continue;
    if (crossing(axis, box.lower[axis], p0, d, box) !== null || crossing(axis, box.upper[axis], p0, d, box) !== null) return true;
  }
  return false;
}

/**
 * `0x2874c`: whether the segment meets the box along the world axes at `position` + `bounds` (shape +0x08–+0x1C), each
 * corner rounded to f32. The target's rows are not read.
 */
export function segmentMeetsBounds({ from, to }: Segment, position: Vec3, bounds: ShapeBox): boolean {
  const box: ShapeBox = {
    lower: { x: store(position.x + bounds.lower.x), y: store(position.y + bounds.lower.y), z: store(position.z + bounds.lower.z) },
    upper: { x: store(position.x + bounds.upper.x), y: store(position.y + bounds.upper.y), z: store(position.z + bounds.upper.z) },
  };
  if (separated(from, to, box)) return false;
  return strictlyInside(to, box) || strictlyInside(from, box) || crossesAnyFace(from, to, box);
}

/** The nearest entry so far: its t and face code. */
interface Entry {
  readonly t: number;
  readonly face: Face;
}

/** The crossing at `t` (null: none) replaces `best` only when strictly nearer, so ties keep the earlier face and box. */
const nearer = (best: Entry | null, t: number | null, face: Face): Entry | null => (t !== null && (best === null || t < best.t) ? { t, face } : best);

/**
 * `0x28b48`, one box of the refined test: after the strict rejection, every face of the axes along which d is not ±0,
 * in the original's order; no inside test. Returns the nearest entry over `best` and this box.
 */
function enterBox(p0: Vec3, p1: Vec3, box: ShapeBox, best: Entry | null): Entry | null {
  if (separated(p0, p1, box)) return best;
  const d = difference(p0, p1);
  let nearest = best;
  for (const axis of AXES) {
    if (d[axis] === 0) continue;
    const [lowerFace, upperFace] = FACES[axis];
    nearest = nearer(nearest, crossing(axis, box.lower[axis], p0, d, box), lowerFace);
    nearest = nearer(nearest, crossing(axis, box.upper[axis], p0, d, box), upperFace);
  }
  return nearest;
}

/** F((p1 − p0) × t + p0) per axis, the difference and product unrounded. */
const along = (p0: Vec3, p1: Vec3, t: number): Vec3 =>
  vec(store((p1.x - p0.x) * t + p0.x), store((p1.y - p0.y) * t + p0.y), store((p1.z - p0.z) * t + p0.z));

/**
 * `0x28efc`: the segment against the boxes of `shape` in the frame of a target at `position` with `orientation`: the
 * nearest entry over every box (`0x28b48`), or null for a miss, including both endpoints strictly inside the inner box.
 */
export function refinedImpact({ from, to }: Segment, position: Vec3, orientation: Matrix3, shape: CollisionShape): Impact | null {
  const local0 = pointInFrame(orientation, position, from);
  const local1 = pointInFrame(orientation, position, to);
  const { innerBox } = shape;
  if (innerBox !== null && strictlyInside(local1, innerBox) && strictlyInside(local0, innerBox)) return null;
  let best: Entry | null = null;
  for (const box of shape.boxes) best = enterBox(local0, local1, box, best);
  if (best === null) return null;
  return Object.freeze({ point: along(from, to, best.t), local: along(local0, local1, best.t), face: best.face });
}

/** A segment that met a shape: the impact of the refined test, or null when the shape has no boxes and only the coarse test ran. */
export interface ShapeHit {
  readonly impact: Impact | null;
}

/**
 * The test `0x28450` makes of one object: the coarse test, then the refined test for a shape with boxes, which must
 * pass too. Null for a miss.
 */
export function segmentHitsShape(segment: Segment, position: Vec3, orientation: Matrix3, shape: CollisionShape): ShapeHit | null {
  if (!segmentMeetsBounds(segment, position, shape.bounds)) return null;
  if (shape.boxes.length === 0) return { impact: null };
  const impact = refinedImpact(segment, position, orientation, shape);
  return impact === null ? null : { impact };
}

/** The craft kinds `0xfffff` of the first pass. */
const CRAFT_KINDS = 0xfffff;

/** The object a projectile struck, with what the hit needs. */
export type ProjectileHit =
  | { readonly type: 'craft'; readonly target: Entity; readonly impact: Impact | null }
  | { readonly type: 'fragment'; readonly target: Entity; readonly fragment: FragmentCombat; readonly debris: DebrisRuleData; readonly impact: Impact | null };

/** Active (activity 1: neither parked nor docked) and in state 7 or above. */
const isEligible = ({ activity, state }: Entity): boolean => activity === 'active' && isActiveState(state);

function craftShape(craft: readonly (CraftRuleData | null)[], kindBit: number): CraftRuleData {
  const data = craft[kindBit];
  if (data === null || data === undefined) throw fault('shape');
  return data;
}

/**
 * The walk of `0x28450` (H3) for a projectile's `segment`; null when it strikes nothing. Pass 1 walks the craft kinds
 * in kind-bit and allocation order: eligible and not the `shooter` (no side test: friendly fire is possible, and the
 * destroyed flag is not read, so a destroyed craft still in state 7 stops the walk). Only when pass 1 meets nothing,
 * pass 2 walks the fragments: eligible, with DEBRIS parameters (not an escape pod) and durability above 0. The first
 * object whose test passes ends the walk, not the nearest one. `craft` is the world's static rule data by kind bit.
 */
export function findProjectileHit(entities: EntityTable, craft: readonly (CraftRuleData | null)[], segment: Segment, shooter: EntityId | null): ProjectileHit | null {
  for (const target of entities.walk(CRAFT_KINDS)) {
    if (!isEligible(target) || target.id === shooter) continue;
    const hit = segmentHitsShape(segment, target.position, target.orientation, craftShape(craft, target.kindBit).shape);
    if (hit !== null) return { type: 'craft', target, impact: hit.impact };
  }
  for (const target of entities.walk(1 << FRAGMENT_KIND_BIT)) {
    const fragment = target.combat;
    if (fragment.type !== 'fragment') throw fault('fragment');
    if (!isEligible(target) || fragment.debris === null || fragment.durability <= 0) continue;
    const debris = craftShape(craft, fragment.sourceKindBit).debris[fragment.debris];
    if (debris === undefined) throw fault('debris');
    const hit = segmentHitsShape(segment, target.position, target.orientation, debris.shape);
    if (hit !== null) return { type: 'fragment', target, fragment, debris, impact: hit.impact };
  }
  return null;
}

/**
 * The choice `0x28450` makes for a projectile striking a fragment (H3): off a fragment whose DEBRIS +0x5C is 0, one
 * draw, and the projectile ricochets when (rand & 3) = 0; off a small one (+0x5C ≠ 0) it is removed, without a draw.
 */
export const deflectsOffFragment = ({ small }: DebrisRuleData, rand: RandSource): boolean => !small && (rand.next() & 3) === 0;

/** f64 `0x170d10` and `0x170d18`: the ricochet's turn, u × 1.2217304944… + 2.5307274527… rad (145°–215°). */
const TURN_SPAN = 1.221730494444444;
const TURN_BASE = 2.530727452777778;
/** f64 `0x170d20` and `0x170d28`: the ricochet's speed, u × 82.5 + 55. */
const SPEED_SPAN = 82.5;
const SPEED_BASE = 55;

/** The pose and velocity a ricochet gives a projectile. */
export interface Ricochet {
  readonly position: Vec3;
  readonly orientation: Matrix3;
  readonly velocity: Vec3;
}

/**
 * `0x25dc4` (H4): the projectile moves to the impact's world point, or to the struck object's `struckPosition` without
 * an impact; a coin (rand & 1) turns its rows about row 2 when odd (`0x22a50`) and about row 1 when even (`0x228cc`) by
 * F(rand × C × span + base); then each velocity component is F((rand × C × 82.5 + 55) × row 3's component), one draw
 * per axis, from the turned rows. Five draws. The caller sets state 8; the block's speed and previous position stay.
 */
export function ricochet(struckPosition: Vec3, impact: Impact | null, orientation: Matrix3, rand: RandSource): Ricochet {
  const axis = (rand.next() & 1) === 1 ? 'yaw' : 'pitch';
  const turned = rotateRows(orientation, axis, store(rand.next() * RAND_SCALE * TURN_SPAN + TURN_BASE));
  const row = rowOf(turned, 2);
  const speed = (component: number): number => store((rand.next() * RAND_SCALE * SPEED_SPAN + SPEED_BASE) * component);
  return { position: impact?.point ?? struckPosition, orientation: turned, velocity: vec(speed(row.x), speed(row.y), speed(row.z)) };
}
