/**
 * The speed share of P3-12's speed dust (docs/plan/p3/02/spec.md, FS-12; docs/original/formats/executable.md, SD4):
 * the original's i16 `0x1b0758`, which the camera step stores from the speed its view's camera function reports and
 * the Warp view replaces in mode 1. It is derived from the world at the tick's end, persists nothing and draws nothing.
 * The original's cache of K and its keeping of the old value without a player object are not observable in P3 and are
 * not modelled.
 */
import { CoreFaultError } from '../errors.ts';
import { speedOf } from '../rules/movement-builders.ts';
import { WARP_VIEW_MODE } from '../systems/view-switch.ts';
import type { WorldState } from '../world/world-state.ts';
import { craftRecord } from './combat.ts';

/** The views whose camera function reports the player's speed (`0x31400`, `0x31424`, `0x314ac`, `0x31524`, `0x315bc`). */
const PLAYER_CAMERA_VIEWS: ReadonlySet<number> = new Set([0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x12]);
const MODEL_VIEW_MODE = 0x11;
/** The destruction camera's sub-mode of view 0x11 (`0x31bdc`). */
const DESTRUCTION_SUB_MODE = 8;
/** The speed the destruction camera reports before the explosion: a speed, not a share. */
const RECEDING_SPEED = 30;
const SHARE_LIMIT = 100;

/** FISTP dword under the chop mode: truncation, and −2³¹ (integer indefinite) beyond i32. */
function chop32(value: number): number {
  const chopped = Math.trunc(value);
  return (chopped | 0) === chopped ? chopped : -0x8000_0000;
}

/**
 * min(100, share) stored as the original's i16: its low 16 bits, signed (−0 becomes 0), so a share below −32768 can
 * wrap above 100.
 */
const storedShare = (share: number): number => (Math.min(SHARE_LIMIT, share) << 16) >> 16;

/**
 * A(v) of the camera step: min(100, chop(D(v × 100)) idiv K) with K = trunc(B), signed and truncating, no lower clamp.
 * World creation keeps the player's K ≥ 1 (craft-info-input.ts's checkPlayerWarp).
 */
export function cameraSpeedShare(speed: number, base: number): number {
  return storedShare(Math.trunc(chop32(speed * 100) / Math.trunc(base)));
}

/** W(v) of the Warp view `0x50a28`: min(100, chop(D(D(v × 100) ÷ B))), dividing by the f32 B itself. */
export function warpSpeedShare(speed: number, base: number): number {
  return storedShare(chop32((speed * 100) / base));
}

/**
 * FS-12's share at the tick's end: 0 without a player entity; A of the player's speed in views 0xC–0x10 and 0x12; in
 * the destruction view 0x11/8, A(30) before the explosion, A of the followed entity's speed while it is in the table
 * and 0 once it has left; W of the player's speed in the Warp view 1; 0 in every view without a camera function. View
 * 0x11's other sub-modes (P4's cameras) are not reachable in P3 and fault.
 */
export function speedShare(world: WorldState): number {
  const { player, entities } = world;
  const entity = player.entityId === null ? undefined : entities.get(player.entityId);
  if (entity === undefined) return 0;
  const { atB8 } = craftRecord(world, entity.kindBit);
  const { viewMode } = player;
  if (viewMode === WARP_VIEW_MODE) return warpSpeedShare(speedOf(entity), atB8);
  if (PLAYER_CAMERA_VIEWS.has(viewMode)) return cameraSpeedShare(speedOf(entity), atB8);
  if (viewMode !== MODEL_VIEW_MODE) return 0;
  if (player.subMode !== DESTRUCTION_SUB_MODE) throw new CoreFaultError('invariant-violated', 'render.speed-share-sub-mode');
  if (player.followedEntity === null) return cameraSpeedShare(RECEDING_SPEED, atB8);
  const followed = entities.get(player.followedEntity);
  return followed === undefined ? 0 : cameraSpeedShare(speedOf(followed), atB8);
}
