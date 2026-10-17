/**
 * The Warp tunnel path (docs/plan/p3/02/spec.md, MW-02, MW-04, MW-07 and MW-12 R-B; P3-09/28): the transit length
 * `0x50068`, the 15 control points of `0x1a9f70` in the path's private frame, their set-up `0x51618(path, 0.8, 2000, 300)` and the evaluation `0x513e0`
 * with the cardinal spline `0x517f4` and the rows taken from its tangent. Every call site evaluates segment 1, so the
 * curve runs from point 1 to point 2 with points 0 and 3 as neighbours. The Warp step (`0x50508` with `0x50a28`)
 * advances along it and holds the player near it; the progress `0x509c0` is what the completion tests.
 *
 * The original computes in double precision, rounding to nearest, and stores f32 at each step; the order below is
 * the original's, with every product of two f32 values exact in double, so double operations and `Math.fround` at
 * each store reproduce it bit for bit.
 */
import type { Vec3 } from '../contracts/domain-events.ts';
import { CoreFaultError } from '../errors.ts';
import type { Matrix3 } from '../world/entity-table.ts';
import type { WarpTransit } from '../world/player-state.ts';
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
export const GRID_SCALE = Math.fround(RUNTIME_SCALE);
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

/**
 * `0x5172c`: points 1–14 move down to 0–13, and the new point 14 follows the new point 13 by the set-up's rule bit for
 * bit (its own constants give the same double steps): x, then y, one draw each, and z one z step higher.
 */
export function shiftWarpPath(path: readonly Vec3[], rand: RandSource): readonly Vec3[] {
  const kept = path.slice(1);
  const last = kept[kept.length - 1];
  const x = lateral(last.x, rand);
  const y = lateral(last.y, rand);
  return Object.freeze([...kept, vec(x, y, Math.fround(last.z + Z_STEP))]);
}

/** The counters the progress reads: n, u and L. */
export type WarpProgressCounters = Pick<WarpTransit, 'segments' | 'fraction' | 'length'>;

/**
 * `0x509c0`, the progress p = F((n + u) × F(1 ÷ L)), with n + u unrounded; 1.0 when it is not below 1 (an unordered
 * value included). Not stored: the completion and the page compute it from the transit.
 */
export function warpProgress({ segments, fraction, length }: WarpProgressCounters): number {
  const progress = Math.fround((segments + fraction) * Math.fround(1 / length));
  return progress < 1 ? progress : 1;
}

/** The cone's angle (f64 `0x171f14`, a decimal approximation of π ÷ 6) as start-up `0x4ff40` reads it. */
const CONE_ANGLE = 0.5235987833333333;
const CONE_COSINE_EXACT = Math.cos(CONE_ANGLE);
/** K (`0x1b062c`): F(cos 30°). The double cosine lies 0.2 f32 ulp from K, far from a rounding boundary. */
const CONE_COSINE = Math.fround(CONE_COSINE_EXACT);
/** `0x1b0614`: F(√(1 − cos × K)), exactly 0.5. */
const CONE_SINE = Math.fround(Math.sqrt(1 - CONE_COSINE_EXACT * CONE_COSINE));
/** The factor of the lateral motion's distance (f64 `0x171f8c`). */
const LATERAL_FACTOR = 1.15;
/** The tube's radius² (f32 `0x171f94`) and radius (f64 `0x171fe0`). */
const TUBE_RADIUS_SQUARED = 2500;
const TUBE_RADIUS = 50;
/** c = 1 − min(d², 2500) × 4e-4 (f64 `0x171f98`): 1 on the centre line, 0 at the wall. */
const CENTRING_SLOPE = 4e-4;
/** The error's window on (n + u) ÷ L, both strict (f64 `0x171fa0`, `0x171fa8`). */
const WINDOW_START = 0.05;
const WINDOW_END = 0.95;
/** The error's increments by centring band (f64 `0x171fb0`–`0x171fd8`), and a wall contact's (`0x171fe8`). */
const ERROR_BANDS: readonly (readonly [above: number, increment: number])[] = [[0.9, 1e-4], [0.8, 5e-5], [0.7, 2e-5]];
const WALL_ERROR = 0.01;

const row = (rows: Matrix3, index: number): Vec3 => vec(rows[3 * index], rows[3 * index + 1], rows[3 * index + 2]);
const rowsOf = (r0: Vec3, r1: Vec3, r2: Vec3): Matrix3 => Object.freeze([r0.x, r0.y, r0.z, r1.x, r1.y, r1.z, r2.x, r2.y, r2.z]) as unknown as Matrix3;

/** What `0x50a28` leaves: the player's pose and the page's three readings. */
export interface TunnelPose extends WarpPathPose {
  /** a, f32 in [0, 1]. */
  readonly angle: number;
  /** c, f32 in [0, 1]. */
  readonly centring: number;
  /** s, f32 in [0, 1]. */
  readonly error: number;
  /** Step 7 pulled the player back from the wall inside the error's window, the branch that adds 0.01 (FS-03). */
  readonly wallContact: boolean;
}

/**
 * `0x50a28` without the cheat's autopilot: holds the player (`player`, its pose after this tick's movement) in the
 * tunnel around the path pose `path`, given the previous path pose G, the f32 distance `distance` = F(δ) of this step,
 * whether (n + u) ÷ L lies in the error's window and the error s so far; the numbered steps below are the original's.
 *
 * The increments are per call, not scaled by the step (MW-12 difference 3). The x87 order is the original's, including
 * where it reuses a register's unrounded value rather than the f32 it stored (the y and z sums below).
 */
export function steerInTunnel(player: WarpPathPose, path: WarpPathPose, previous: WarpPathPose, distance: number, inWindow: boolean, error: number): TunnelPose {
  const { position: q } = player;
  const { position: n } = path;
  const n0 = row(path.orientation, 0);
  const n1 = row(path.orientation, 1);
  const n2 = row(path.orientation, 2);
  const g0 = row(previous.orientation, 0);
  const g1 = row(previous.orientation, 1);
  const g = previous.position;
  let r1 = row(player.orientation, 1);
  let r0 = row(player.orientation, 0);
  let r2 = row(player.orientation, 2);

  // 1. α = (Q − G)·G0 with the unrounded y and z differences, β = (Q − G)·G1 with their f32 stores.
  const dx = q.x - g.x;
  const dy = q.y - g.y;
  const dz = q.z - g.z;
  const fdx = Math.fround(dx);
  const alpha = dy * g0.y + dz * g0.z + fdx * g0.x;
  const beta = Math.fround(dy) * g1.y + Math.fround(dz) * g1.z + fdx * g1.x;
  const carried = (axis: keyof Vec3): number => Math.fround(n[axis] + Math.fround(Math.fround(n0[axis] * alpha) + Math.fround(n1[axis] * beta)));
  const base = vec(carried('x'), carried('y'), carried('z'));

  // 2. cos θ unrounded for the angle, its f32 store for the cone test.
  const cosine = n2.y * r2.y + n2.z * r2.z + n2.x * r2.x;
  const cosineStored = Math.fround(cosine);
  const ratio = Math.abs(cosine - CONE_COSINE) * (1 / (1 - CONE_COSINE));
  const angle = Math.fround(ratio < 1 ? ratio : 1);

  // 3. The cone, as the original builds it: from points about Q′ rather than from the rows alone.
  if (!(cosineStored >= CONE_COSINE)) {
    const scale = CONE_SINE / Math.fround(Math.sqrt(1 - cosineStored * cosineStored));
    const across = (axis: keyof Vec3): number =>
      Math.fround(Math.fround(base[axis] + r2[axis]) - Math.fround(base[axis] + Math.fround(n2[axis] * cosineStored)));
    // x and z start from the f32 stores of Q′ + K·N2; y from the register's unrounded sum.
    const fx = Math.fround(base.x + Math.fround(n2.x * CONE_COSINE)) + Math.fround(across('x') * scale) - base.x;
    const fy = base.y + Math.fround(n2.y * CONE_COSINE) + Math.fround(across('y') * scale) - base.y;
    const fz = Math.fround(base.z + Math.fround(CONE_COSINE * n2.z)) + Math.fround(scale * across('z')) - base.z;
    const [sx, sy, sz] = [Math.fround(fx), Math.fround(fy), Math.fround(fz)];
    const inverse = Math.fround(1 / Math.sqrt(fy * sy + fz * sz + fx * sx));
    r2 = vec(Math.fround(sx * inverse), Math.fround(sy * inverse), Math.fround(sz * inverse));
    r0 = normalise(vec(
      Math.fround(r1.y * r2.z - r1.z * r2.y),
      Math.fround(r1.z * r2.x - r1.x * r2.z),
      Math.fround(r1.x * r2.y - r1.y * r2.x),
    ));
    r1 = vec(
      Math.fround(r2.y * r0.z - r2.z * r0.y),
      Math.fround(r2.z * r0.x - r2.x * r0.z),
      Math.fround(r2.x * r0.y - r2.y * r0.x),
    );
  }

  // 4. w = v × 1.15 along R2, less its component along N2.
  const w = distance * LATERAL_FACTOR;
  const px = Math.fround(w * r2.x);
  const py = Math.fround(r2.y * w);
  const pz = Math.fround(r2.z * w);
  const along = -(n2.z * pz + n2.y * py + n2.x * px);
  const x = Math.fround(base.x + px + Math.fround(n2.x * along));
  const y = Math.fround(base.y + py + Math.fround(n2.y * along));
  const zUnrounded = base.z + pz + Math.fround(along * n2.z);

  // 5. e = Q″ − N with the unrounded z; d² stored f32.
  const ex = x - n.x;
  const ey = y - n.y;
  const ez = zUnrounded - n.z;
  const offset = vec(Math.fround(ex), Math.fround(ey), Math.fround(ez));
  const squared = Math.fround(ey * offset.y + ez * offset.z + ex * offset.x);
  const centring = Math.fround(1 - (TUBE_RADIUS_SQUARED >= squared ? squared : TUBE_RADIUS_SQUARED) * CENTRING_SLOPE);

  // 6. The error's band, on the stored c.
  let s = error;
  if (inWindow) {
    const band = ERROR_BANDS.find(([above]) => centring > above);
    if (band !== undefined) s = Math.fround(s + band[1]);
  }

  // 7. The wall: Q″ := N + e × (50 ÷ √d²), from the f32 offsets.
  let position = vec(x, y, Math.fround(zUnrounded));
  const wall = squared > TUBE_RADIUS_SQUARED;
  if (wall) {
    const pull = TUBE_RADIUS / Math.sqrt(squared);
    position = vec(
      Math.fround(n.x + Math.fround(offset.x * pull)),
      Math.fround(n.y + Math.fround(offset.y * pull)),
      Math.fround(n.z + Math.fround(offset.z * pull)),
    );
    if (inWindow) s = Math.fround(s + WALL_ERROR);
  }

  // 8.
  s = Math.fround(1 > s ? s : 1);
  const orientation = rowsOf(r0, r1, r2);
  if (!(Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z) && orientation.every(Number.isFinite))) throw new CoreFaultError('invariant-violated', 'warp-path.pose');
  return Object.freeze({ position, orientation, angle, centring, error: s, wallContact: wall && inWindow });
}

/** The transit's fields the Warp step writes. */
export type WarpStepTransit = Pick<WarpTransit, 'segments' | 'fraction' | 'error' | 'angle' | 'centring' | 'frame' | 'path'>;

/** One Warp step's result: the player's new pose, the transit's new fields and whether it touched the wall in the window. */
export interface WarpStep {
  readonly pose: WarpPathPose;
  readonly transit: WarpStepTransit;
  readonly wallContact: boolean;
}

/**
 * `0x50508` with `0x50a28`, once per tick (MW-07; MW-12 difference 3): δ = speed × step unrounded, v = F(δ);
 * u := F(u + δ ÷ +0xB8); when 1.0 > u fails (u ≥ 1, or unordered), u := +0, the path shifts with its 2 draws and
 * n := F(1 + n), the overshoot discarded; the path pose at u; then steerInTunnel with the window on (n + u) ÷ L, and G
 * := that path pose. `speed` is the player's block speed after this tick's movement and `seconds` the tick's step, both
 * f32; `segmentLength` is the player's craft +0xB8.
 */
export function stepWarp(transit: WarpTransit, player: WarpPathPose, speed: number, seconds: number, segmentLength: number, rand: RandSource): WarpStep {
  const travelled = speed * seconds;
  let fraction = Math.fround(transit.fraction + travelled / segmentLength);
  let { segments, path } = transit;
  if (!(1 > fraction)) {
    fraction = 0;
    path = shiftWarpPath(path, rand);
    segments = Math.fround(1 + segments);
  }
  const frame = evaluateWarpPath(path, fraction);
  const ratio = (segments + fraction) / transit.length;
  const steered = steerInTunnel(player, frame, transit.frame, Math.fround(travelled), ratio > WINDOW_START && ratio < WINDOW_END, transit.error);
  const { angle, centring, error, wallContact } = steered;
  return Object.freeze({
    pose: Object.freeze({ position: steered.position, orientation: steered.orientation }),
    transit: Object.freeze({ segments, fraction, error, angle, centring, frame, path }),
    wallContact,
  });
}
