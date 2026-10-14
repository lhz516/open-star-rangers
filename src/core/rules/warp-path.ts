/**
 * The Warp tunnel path (docs/plan/p3/02/spec.md, MW-02, MW-04 and MW-12 R-B; P3-09/28): the transit length
 * `0x50068`, the 15 control points of `0x1a9f70` in the path's private frame, their set-up `0x51618(path, 0.8, 2000, 300)` and the evaluation `0x513e0`
 * with the cardinal spline `0x517f4` and the rows taken from its tangent. Every call site evaluates segment 1, so the
 * curve runs from point 1 to point 2 with points 0 and 3 as neighbours.
 *
 * The original computes in double precision, rounding to nearest, and stores f32 at each step; the order below is
 * the original's, with every product of two f32 values exact in double, so double operations and `Math.fround` at
 * each store reproduce it bit for bit.
 */
import type { Vec3 } from '../contracts/domain-events.ts';
import type { Matrix3 } from '../world/entity-table.ts';
import { RUNTIME_SCALE } from './coordinates.ts';
import { normalise } from './load-transforms.ts';
import type { RandSource } from './original-random.ts';

/** The path's control point count. */
export const WARP_PATH_POINTS = 15;

/** The tangent scale k, passed as an f32 (a cardinal spline; Catmull–Rom would be 0.5). */
const TANGENT_SCALE = Math.fround(0.8);
/** The z step between control points from point 2 on, passed as an f32. */
const Z_STEP = 2000;
/** The lateral offset w subtracted from each random step, passed as an f32. */
const LATERAL_OFFSET = 300;
/** The z of points 0 and 1. */
const START_Z = 10000;
/** Points 1–4 lie on the axis; from point 5 on each takes two draws, x then y. */
const FIRST_RANDOM_POINT = 5;
/** The random step's draw range, rand % 20000 (signed `IDIV`; rand is never negative). */
const STEP_RANGE = 20000;
/** The f64 constants of the step: (r × 1e-4 − 1) × 600. */
const STEP_SCALE = 1e-4;
const STEP_WIDTH = 600;

/** A path pose: the position and the rows R0 = V, R1 = W, R2 = N (forward). */
export interface WarpPathPose {
  readonly position: Vec3;
  readonly orientation: Matrix3;
}

const vec = (x: number, y: number, z: number): Vec3 => Object.freeze({ x, y, z });

/** The grid scale S (`0x186b34`, f32): the runtime scale, the sector size. */
const GRID_SCALE = Math.fround(RUNTIME_SCALE);
/** The f64 constants of `0x50068`: r = d ÷ ((S × 8) × 1.414). */
const SECTOR_SPAN = 8;
const DIAGONAL = 1.414;
/** The floor of the transit length's factor. */
const MINIMUM_FACTOR = 0.5;

/**
 * `0x50068(R(d))`, the transit length L in path segments: with r = d ÷ ((S × 8) × 1.414) in double, f = min(r, 1) when
 * that exceeds 0.5, else 0.5 (an unordered r gives 1, then f = 1); L = F(f × F(+0xA8)), the record's i32 loaded and
 * stored as an f32 first.
 */
export function transitLength(distance: number, transitSeconds: number): number {
  const ratio = distance / (GRID_SCALE * SECTOR_SPAN * DIAGONAL);
  const capped = ratio < 1 ? ratio : 1;
  const factor = capped > MINIMUM_FACTOR ? capped : MINIMUM_FACTOR;
  return Math.fround(factor * Math.fround(transitSeconds));
}

/** One random step from `previous`: F(D(D(D(D(r × 1e-4) + (−1.0)) × 600.0) + previous) − w)). */
function lateral(previous: number, rand: RandSource): number {
  const r = rand.next() % STEP_RANGE;
  return Math.fround((r * STEP_SCALE + -1) * STEP_WIDTH + previous - LATERAL_OFFSET);
}

/**
 * `0x51618`: point 0 at (+0, +0, 10000); points 1–14 take the running z before it advances by the z step, so point 1
 * repeats point 0's z; points 1–4 have x = y = +0, and points 5–14 each add a random step to the previous point's x and
 * then y, 20 draws in point order. The steps are a biased walk, not a uniform value.
 */
export function setUpWarpPath(rand: RandSource): readonly Vec3[] {
  const points: Vec3[] = [vec(0, 0, START_Z)];
  let z = START_Z;
  for (let index = 1; index < WARP_PATH_POINTS; index++) {
    const previous = points[index - 1];
    if (index < FIRST_RANDOM_POINT) {
      points.push(vec(0, 0, z));
    } else {
      const x = lateral(previous.x, rand);
      const y = lateral(previous.y, rand);
      points.push(vec(x, y, z));
    }
    z = Math.fround(z + Z_STEP);
  }
  return Object.freeze(points);
}

/**
 * `0x513e0` at segment 1 and the f32 parameter `u`: the position and tangent of the cubic Hermite curve from point 1 to
 * point 2 with tangents k·(p2 − p0) and k·(p3 − p1) (`0x517f4`), then the rows N = normalise(tangent),
 * V = normalise((0, 1, 0) × N) with the original's zero products (IEEE signed zeros) and W = N × V, not normalised.
 * At t = 0 the position is point 1 exactly. `t` is the f32 segment fraction u.
 */
export function evaluateWarpPath(path: readonly Vec3[], t: number): WarpPathPose {
  const [p0, p1, p2, p3] = path;
  const s = Math.fround(1 - t);
  const q = Math.fround(s * t);
  const a = Math.fround(q * s);
  const b = Math.fround(q * t);
  const c3 = Math.fround(3 * q);
  const t2 = Math.fround(t * t);
  const s2 = Math.fround(s * s);
  const w1 = Math.fround(s2 + 2 * a);
  const w2 = Math.fround(t2 + 2 * b);
  const ka = Math.fround(TANGENT_SCALE * a);
  const kb = Math.fround(TANGENT_SCALE * b);
  const g = Math.fround(6 * q);
  const gs = Math.fround(TANGENT_SCALE * (s - c3));
  const gt = Math.fround(TANGENT_SCALE * (t - c3));
  const component = (axis: keyof Vec3): { position: number; tangent: number } => {
    const m1 = Math.fround(p2[axis] - p0[axis]);
    const m2 = Math.fround(p3[axis] - p1[axis]);
    const d = Math.fround(p2[axis] - p1[axis]);
    return {
      position: Math.fround(w1 * p1[axis] + w2 * p2[axis] + ka * m1 - kb * m2),
      tangent: Math.fround(g * d + gs * m1 + gt * m2),
    };
  };
  const x = component('x');
  const y = component('y');
  const z = component('z');
  const n = normalise(vec(x.tangent, y.tangent, z.tangent));
  // (0, 1, 0) × N, each zero product an x87 FLDZ times the component.
  const v = normalise(vec(Math.fround(n.z - 0 * n.y), Math.fround(0 * n.x - 0 * n.z), Math.fround(0 * n.y - n.x)));
  const w = vec(
    Math.fround(n.y * v.z - n.z * v.y),
    Math.fround(n.z * v.x - n.x * v.z),
    Math.fround(n.x * v.y - n.y * v.x),
  );
  return Object.freeze({
    position: vec(x.position, y.position, z.position),
    orientation: Object.freeze([v.x, v.y, v.z, w.x, w.y, w.z, n.x, n.y, n.z]) as unknown as Matrix3,
  });
}
