/**
 * The active area and the world rectangle (docs/plan/p3/06/spec.md, 活动区域、停放与世界边界;
 * docs/original/formats/executable.md, world boundary, active area, parking and autopilot, P3-06/04). Instantiation and
 * the area check share one inside test (`0x3a540`); the parked travel's world-exit test reads the world rectangle
 * (`0x3a41c`) inset by 100. No rule bounds an active object: nothing here clamps, moves or refuses a position.
 */
import type { Vec3 } from '../contracts/domain-events.ts';
import type { WorldState } from '../world/world-state.ts';
import { worldHalfExtent, type WorldFrame } from './coordinates.ts';

/**
 * x/y radius² of the active area around its centre (`0x186b44`): the f32 runtime scale² × 0.25, 7500² exactly. A
 * position is inside when strictly within it.
 */
export const ACTIVE_AREA_RADIUS_SQUARED = 56_250_000;

/**
 * The active area's centre for `0x3a540`: the player entity's position, or null without a player entity. While the
 * player Warps the original takes the player state's point instead; P3-09 adds that here.
 */
export function activeAreaCentre({ player, entities }: Pick<WorldState, 'player' | 'entities'>): Vec3 | null {
  const entity = player.entityId === null ? undefined : entities.get(player.entityId);
  return entity === undefined ? null : entity.position;
}

/**
 * `0x3a540`: whether `position` is inside the active area around `centre` (activeAreaCentre); everything is outside
 * without one. z is ignored; the squares and their sum round in double precision.
 */
export function isWithinActiveArea(centre: Vec3 | null, { x, y }: Vec3): boolean {
  if (centre === null) return false;
  const dx = centre.x - x;
  const dy = centre.y - y;
  return dx * dx + dy * dy < ACTIVE_AREA_RADIUS_SQUARED;
}

/** Kinds 0x1f00000 (missiles, gun projectiles, explosions, 0x800000, fragments): removed instead of parked on leaving. */
const REMOVED_ON_LEAVING_KINDS = 0x1f00000;

/** Whether an entity of `kindBit` leaving the active area is removed rather than parked, without an event. */
export function isRemovedOnLeaving(kindBit: number): boolean {
  return ((REMOVED_ON_LEAVING_KINDS >>> kindBit) & 1) === 1;
}

/** How far inside the world rectangle the parked world-exit test's bounds lie. */
const EXIT_INSET = 100;

/**
 * The parked world-exit test (`0x2f314`): whether `position` lies outside the world rectangle inset by 100, comparing
 * strictly, so the inset bounds themselves count as inside. z is ignored.
 */
export function isOutsideExitBounds(frame: WorldFrame, { x, y }: Vec3): boolean {
  const limit = worldHalfExtent(frame) - EXIT_INSET;
  return x < -limit || x > limit || y < -limit || y > limit;
}
