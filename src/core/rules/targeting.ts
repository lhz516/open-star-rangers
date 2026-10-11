/**
 * The player's target candidates (docs/original/formats/executable.md, T2 and T10; docs/plan/p3/02/spec.md, CR-05): the
 * selection helpers behind the target commands and the automatic selection. They read positions and poses as the
 * previous movement left them, change nothing and draw nothing.
 *
 * A candidate is an entity of the mask, walked by kind bit and then allocation order (`0x5261c`), that is active
 * (activity 1, so neither parked nor docked), in state 7 or above (a projectile that has hit included) and not in Warp
 * (+0xCC). Neither the destroyed flag nor the parked history is tested: a destroyed craft stays a candidate until its
 * state leaves 7 and 8. The player's kind bit 0 is in neither mode's mask, so the nearer and farther searches never
 * meet the player itself; the forward search skips it explicitly.
 *
 * Arithmetic (T10), 53-bit precision, round to nearest:
 * - `0x637e4`: the differences of the f32 positions in double; x² is f32(dx)·f32(dx), y² and z² are dy·f32(dy) and
 *   dz·f32(dz); (x² + y²) + z² in double, returned unrounded. Callers keep it as d32, its f32 store; such a store
 *   overflowing f32 is a fault, as the original's unmasked overflow exception is;
 * - `0x63858` (farther): a reference's distance is kept as d32_ref (0 without a reference); a candidate other than the
 *   reference is eligible when its unrounded d ≥ d32_ref, and the search keeps the smallest d32, strictly, so ties keep
 *   the earliest;
 * - `0x63954` (nearer): eligible when d32 < d32_ref (with a reference) and d32 > the best so far, which starts at +0.0,
 *   both strict, so a candidate at distance 0 is never chosen; it keeps the largest d32, ties the earliest;
 * - `0x63a4c` (forward): the candidate's position in the self's frame (`0x56dc0`, collision-shapes.ts) must lie more
 *   than the f32 5.0 ahead and laterally within the candidate's craft r²: x² + y² in double from the f32 components,
 *   compared unrounded and non-strictly with r². It keeps the smallest depth, strictly, ties the earliest. There is no
 *   range limit, and the current target is not excluded.
 */
import type { Vec3 } from '../contracts/domain-events.ts';
import { CoreFaultError } from '../errors.ts';
import { isActiveState, type Entity, type EntityTable } from '../world/entity-table.ts';
import type { TargetMode } from '../world/player-state.ts';
import { pointInFrame } from './collision-shapes.ts';

/** Mode 0's kind mask: kind bits 7, 8, 9, 10, 12, 13, 16 and 19. */
export const ENEMY_KINDS = 0x93780;
/** Mode 1's kind mask: kind bits 1–6, 11, 14, 15, 17, 18 and 25 (the map and Warp marker). */
export const FRIENDLY_KINDS = 0x206c87e;
/** The forward search's mask: every model kind, bits 0–19. */
export const FORWARD_KINDS = 0xfffff;
/** The friendly model kinds and the player's, by which the forward choice (`0x27a04`) and the radar classify. */
const FRIENDLY_CLASS_KINDS = 0x6c87f;
/** f32 `0x1724cc`: a forward candidate must lie strictly more than this ahead. */
const FORWARD_MINIMUM_DEPTH = 5;

/** The kind mask of a target mode. */
export function modeKinds(mode: TargetMode): number {
  return mode === 'enemy' ? ENEMY_KINDS : FRIENDLY_KINDS;
}

/** Whether `kindBit` is in the friendly class `0x6c87f`. */
export function isFriendlyKind(kindBit: number): boolean {
  return ((FRIENDLY_CLASS_KINDS >>> kindBit) & 1) === 1;
}

/** `0x27a04`: the mode a forward choice of `kindBit` writes. */
export function forwardMode(kindBit: number): TargetMode {
  return isFriendlyKind(kindBit) ? 'friendly' : 'enemy';
}

/** The candidate filter the four helpers share: active, in state 7 or above, not in Warp. */
export function isTargetCandidate({ activity, state, inWarp }: Entity): boolean {
  return activity === 'active' && isActiveState(state) && !inWarp;
}

/** `0x637e4`: the squared distance in double, unrounded; see the module comment. */
export function targetDistance(from: Vec3, to: Vec3): number {
  const dx = Math.fround(to.x - from.x);
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  return dx * dx + dy * Math.fround(dy) + dz * Math.fround(dz);
}

/** d32: a caller's f32 store of a `targetDistance`. */
function stored(distance: number): number {
  const rounded = Math.fround(distance);
  if (!Number.isFinite(rounded)) throw new CoreFaultError('invariant-violated', 'targeting.distance');
  return rounded;
}

/**
 * `0x63858`: the nearest candidate of `mask` at least as far from `self` as `reference` (any, without one), the
 * reference itself excluded; null when none qualifies.
 */
export function fartherCandidate(entities: EntityTable, self: Entity, reference: Entity | null, mask: number): Entity | null {
  const bound = reference === null ? 0 : stored(targetDistance(self.position, reference.position));
  let best: Entity | null = null;
  let bestDistance = Infinity;
  for (const candidate of entities.walk(mask)) {
    if (candidate === reference || !isTargetCandidate(candidate)) continue;
    const distance = targetDistance(self.position, candidate.position);
    if (distance < bound) continue;
    const rounded = stored(distance);
    if (rounded < bestDistance) {
      best = candidate;
      bestDistance = rounded;
    }
  }
  return best;
}

/**
 * `0x63954`: the farthest candidate of `mask` strictly nearer to `self` than `reference` (any, without one) and not at
 * distance 0; null when none qualifies.
 */
export function nearerCandidate(entities: EntityTable, self: Entity, reference: Entity | null, mask: number): Entity | null {
  const bound = reference === null ? null : stored(targetDistance(self.position, reference.position));
  let best: Entity | null = null;
  let bestDistance = 0;
  for (const candidate of entities.walk(mask)) {
    if (!isTargetCandidate(candidate)) continue;
    const rounded = stored(targetDistance(self.position, candidate.position));
    if ((bound === null || rounded < bound) && rounded > bestDistance) {
      best = candidate;
      bestDistance = rounded;
    }
  }
  return best;
}

/**
 * `0x63a4c`: the nearest candidate of `mask` other than `self` in front of it within the candidate's lateral radius,
 * whose r² `radiusSquared` gives; null when none qualifies.
 */
export function forwardCandidate(entities: EntityTable, self: Entity, mask: number, radiusSquared: (candidate: Entity) => number): Entity | null {
  let best: Entity | null = null;
  let bestDepth = 0;
  for (const candidate of entities.walk(mask)) {
    if (candidate === self || !isTargetCandidate(candidate)) continue;
    const { x, y, z } = pointInFrame(self.orientation, self.position, candidate.position);
    if (!(z > FORWARD_MINIMUM_DEPTH) || x * x + y * y > radiusSquared(candidate)) continue;
    if (best === null || z < bestDepth) {
      best = candidate;
      bestDepth = z;
    }
  }
  return best;
}
