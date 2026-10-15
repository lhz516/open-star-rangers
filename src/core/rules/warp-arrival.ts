/**
 * The Warp arrival (docs/plan/p3/02/spec.md, MW-08 and MW-12; docs/original/formats/executable.md, Warp progress,
 * completion and interruptions, completion steps 3–9): the rules `0x2bf08` applies to the player's position, its
 * interval base and the arrival sound's test, apart from the world they are applied to. The completion stage
 * (systems/warp.ts) runs them in order with the world's draws.
 *
 * - The arrival point: the destination pulled toward its sector's corner (`0x3a6e8` with `0x3a61c`) and offset in
 *   height by ±k, both scaled by the Warp error s, so an error-free Warp keeps the destination; the first world draw
 *   picks the sign.
 * - The nearest-object snap over every kind 0–25 whatever its state, activity or dead flag: strictly within 600 units
 *   (score < 360000) the arrival moves 600 above it. The search sees only Core's entities: effects that belong to the
 *   presentation are not candidates (CR-11 difference 1, within its approved scope).
 * - The interval base t from the arrival's distance to the origin, at least 0x280 units.
 * - `0x3c040`, whether a live hostile in state ≥ 7 or 4 lies strictly within the player craft's +0x0C of the arrival.
 *
 * Every step stores f32 as the original does; the sums and products are double operations in its order.
 */
import type { Vec3 } from '../contracts/domain-events.ts';
import { isActiveState, type Entity } from '../world/entity-table.ts';
import type { RandSource } from './original-random.ts';
import { squaredDistance } from './speed-match.ts';
import { GRID_SCALE } from './warp-path.ts';

const vec = (x: number, y: number, z: number): Vec3 => Object.freeze({ x, y, z });

/** The sector size S (`0x186b34`, f32), its reciprocal (`0x186b40`, stored f32) and half a sector (`0x186b3c` = F(S × 0.5)). */
const SECTOR = GRID_SCALE;
const PER_SECTOR = Math.fround(1 / SECTOR);
const HALF_SECTOR = Math.fround(SECTOR * 0.5);

/** One axis of `0x3a61c`: trunc(x × (1 ÷ S)), a negative x first moved back one sector; the low 16 bits as i16. */
function sectorIndex(value: number): number {
  const shifted = 0 > value ? value - SECTOR : value;
  return (Math.trunc(shifted * PER_SECTOR) << 16) >> 16;
}

/** One axis of a sector's centre (`0x3a6b0`'s arithmetic in `0x3a6e8`): F(index × S + S/2). */
const sectorCentre = (value: number): number => Math.fround(sectorIndex(value) * SECTOR + HALF_SECTOR);

/**
 * `0x3a6e8` while the player is in Warp: the destination's sector centre c = F(index × S + S/2) per axis, then the
 * corner on the destination's side, ±S/2 on x (x ≥ cx) and y (y > cy), z = +0. An unordered comparison takes the
 * negative side.
 */
export function sectorCorner(destination: Vec3): Vec3 {
  const cx = sectorCentre(destination.x);
  const cy = sectorCentre(destination.y);
  const x = destination.x >= cx ? Math.fround(cx + HALF_SECTOR) : Math.fround(cx - HALF_SECTOR);
  const y = destination.y > cy ? Math.fround(cy + HALF_SECTOR) : Math.fround(cy - HALF_SECTOR);
  return vec(x, y, 0);
}

/** The height offset's unit, the f64 constant `0x170f5c`: k = F((group + 1) × 5000). */
const HEIGHT_STEP = 5000;

/**
 * Completion steps 4 and 5, from the destination X: X := X + F(s × F(Z − X)) per axis with Z the sector corner; then
 * the first draw, rand % 2, gives +k when odd and −k when even, and X := X + F(s × (0, 0, ±k)). Each sum is stored f32.
 * `group` is the mission's difficulty group (`0x694f0`).
 */
export function arrivalPoint(destination: Vec3, error: number, group: number, rand: RandSource): Vec3 {
  const corner = sectorCorner(destination);
  const pull = (axis: keyof Vec3): number => Math.fround(destination[axis] + Math.fround(error * Math.fround(corner[axis] - destination[axis])));
  const pulled = vec(pull('x'), pull('y'), pull('z'));
  const k = Math.fround((group + 1) * HEIGHT_STEP);
  const height = rand.next() % 2 !== 0 ? k : -k;
  const flat = Math.fround(error * 0);
  return vec(Math.fround(pulled.x + flat), Math.fround(pulled.y + flat), Math.fround(pulled.z + Math.fround(error * height)));
}

/** The snap's walk: kinds 0–25 (`0x3ffffff`). */
export const SNAP_KINDS = 0x3ffffff;
/** The snap's bound, f32 `0x170f64`: 600² (strict). */
const SNAP_SCORE = 360_000;
/** The snap's height above the object, f64 `0x170f68`. */
const SNAP_HEIGHT = 600;

/** The snap's score of `position` from X: F((dy·F(dy) + dz·F(dz)) + dx·F(dx)), differences unrounded. */
function snapScore(point: Vec3, { x, y, z }: Vec3): number {
  const dx = x - point.x;
  const dy = y - point.y;
  const dz = z - point.z;
  return Math.fround(dy * Math.fround(dy) + dz * Math.fround(dz) + dx * Math.fround(dx));
}

/** The snap's result: the arrival, and the object it moved above (null without a snap). */
export interface Snap {
  readonly position: Vec3;
  readonly snapped: Entity | null;
}

/**
 * Completion step 6: of `candidates` (the walk of kinds 0–25 in the original's order, the player first and already at
 * the destination), the first with the smallest score, a strictly smaller score replacing it; when its score is below
 * 360000 (an unordered score too) the arrival is its position + (0, 0, 600), z stored f32.
 */
export function snapToNearest(point: Vec3, candidates: Iterable<Entity>): Snap {
  let best: Entity | null = null;
  // The original's sentinel −1: an unordered first score is kept, as its comparisons keep it.
  let bestScore = -1;
  for (const entity of candidates) {
    const score = snapScore(point, entity.position);
    if (bestScore < 0 || bestScore > score) {
      best = entity;
      bestScore = score;
    }
  }
  if (best === null || bestScore >= SNAP_SCORE) return { position: point, snapped: null };
  const { x, y, z } = best.position;
  return { position: vec(x, y, Math.fround(z + SNAP_HEIGHT)), snapped: best };
}

/** The clock units per second of the interval: craft +0xA4 `SHL` 6. */
const UNITS_PER_SECOND = 64;
/** The distance at which the interval reaches its full length, as the f64 constant `0x170f70` = 1 ÷ 30000. */
const PER_FULL_DISTANCE = 1 / 30000;
/** The interval's floor, compared unsigned. */
const MINIMUM_INTERVAL = 0x280;

/**
 * Completion step 8's interval base t, added to the clock as the new +0xC8: with +0xA4 ≠ 0, trunc(64 × +0xA4 ×
 * min(1, D × (1 ÷ 30000))) raised to 0x280 when not above it; with +0xA4 = 0, 0. `distance` is D, the f32 store of the
 * arrival's distance to the origin (MW-01 keeps +0xA4 in [0, 2²⁵), so 64 × +0xA4 is an i32).
 */
export function warpInterval(distance: number, intervalSeconds: number): number {
  if (intervalSeconds === 0) return 0;
  const share = distance * PER_FULL_DISTANCE;
  const units = Math.trunc(UNITS_PER_SECOND * intervalSeconds * (1 >= share ? share : 1));
  return units > MINIMUM_INTERVAL ? units : MINIMUM_INTERVAL;
}

/**
 * `0x3c040`: whether some entity of `candidates` (the walk of the hostile kinds `0x93780`), not destroyed and in state ≥ 7 or 4,
 * lies strictly within `radius` (the player craft's +0x0C) of `point`: the squared distance against F(r × r), an
 * unordered distance counting as within.
 */
export function isHostileNear(point: Vec3, radius: number, candidates: Iterable<Entity>): boolean {
  const limit = Math.fround(radius * radius);
  for (const entity of candidates) {
    if (entity.destroyed || !(entity.state === 'destroyed-source' || isActiveState(entity.state))) continue;
    if (!(squaredDistance(point, entity.position) >= limit)) return true;
  }
  return false;
}
