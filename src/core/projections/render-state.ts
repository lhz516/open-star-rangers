/**
 * Render State of formal Core (docs/plan/p3/02/spec.md, Projection 与 Render State): what a renderer draws after a
 * tick, deeply frozen and detached from the world. Entities are listed in ascending ID order. A parked entity is not
 * presentable (the original keeps no renderer object for it); a destroyed one stays listed until it is removed, and a
 * removed one is gone. A new ID is drawn from its current pose only; a changed placement serial on the same ID marks a
 * discontinuous move that renderers do not interpolate across. Each entity carries its presentation selector (CR-02)
 * and the clocks of a craft's latest hit and an explosion's activation (CR-12); renderers judge the original's
 * conditions for the hit shimmer and the screen flash themselves. Consumers other than renderers never derive rule
 * information (map markers, target lists) from it. The Runtime keeps two frames of one run (P3-04).
 *
 * P3-09 (docs/plan/p3/02/spec.md, MW-03, MW-11): the map marker is listed with its `map-marker` presentation, which no
 * renderer draws in 3D. In view mode 1 `warp` gives the Warp transit's serial, progress p (warp-path.ts's warpProgress),
 * completed segments n, fraction u, length L and the tunnel path's 15 control points, for P3-12's tunnel effect; it is
 * null in every other view (and in the unreachable view 1 without a transit). The placement serial grows at a Warp
 * start, an arrival and a marker move.
 *
 * P3-12 (docs/plan/p3/02/spec.md, FS-01, FS-04): the player state's sub-mode and followed entity, the active area's
 * centre, and per entity its `inWarp`, an explosion's or fragment's source kind bit and its closed display stage, all
 * sampled at the tick's end. Renderers test the area with rules/active-area.ts's isWithinActiveArea and read no
 * projection to judge the view.
 *
 * P3-12 (docs/plan/p3/02/spec.md, FS-12): the speed dust's speed share at the tick's end (speed-share.ts).
 */
import type { Vec3 } from '../contracts/domain-events.ts';
import { activeAreaCentre } from '../rules/active-area.ts';
import { warpProgress } from '../rules/warp-path.ts';
import { WARP_VIEW_MODE } from '../systems/view-switch.ts';
import { frozenVec, type Entity, type EntityId, type EntityPresentation, type Matrix3 } from '../world/entity-table.ts';
import type { WorldState } from '../world/world-state.ts';
import { speedShare } from './speed-share.ts';

export interface RenderEntity {
  readonly id: EntityId;
  readonly kindBit: number;
  readonly presentation: EntityPresentation;
  /** Runtime units. */
  readonly position: Vec3;
  readonly orientation: Matrix3;
  readonly placementSerial: number;
  /** A craft's latest hit feedback clock (CR-12); null for every other kind and before a craft's first hit. */
  readonly hitShimmerStart: number | null;
  /** An explosion's activation clock (CR-12); null for every other kind and before activation. */
  readonly explosionStart: number | null;
  /** The entity's +0xCC, for every kind. */
  readonly inWarp: boolean;
  /** An explosion's or a fragment's source kind bit (mb +0x104, +0xF0); null for every other kind. */
  readonly sourceKindBit: number | null;
  readonly display: RenderDisplay;
}

/**
 * The original visual's stage at the tick's end (FS-01), the first that holds: `released` in area-switch or pending
 * removal (the original has handled its removal; it leaves the table next tick); `pending` before its first pose item
 * (new, presentation-ready, awaiting-presentation); `hidden` for the player's entity while its model is not shown;
 * `shown` otherwise. Only `shown` and `hidden` entities get a pose item in the original.
 */
export type RenderDisplay = 'pending' | 'shown' | 'hidden' | 'released';

export interface RenderState {
  readonly tick: number;
  /** Mission clock units, which the presentation clocks above count in. */
  readonly clock: number;
  readonly viewMode: number;
  /** The entity the view follows: the player's, null before its instantiation and after its removal. */
  readonly observedEntityId: EntityId | null;
  /** Presentable entities in ascending ID order. */
  readonly entities: readonly RenderEntity[];
  /** The Warp transit in view mode 1, null otherwise. */
  readonly warp: RenderWarp | null;
  /** The player state's sub-mode (ps +0x2A). */
  readonly subMode: number;
  /** ps +0x90, the player's escape pod while it lasts; given even once that entity has left the table. */
  readonly followedEntityId: EntityId | null;
  /** rules/active-area.ts's activeAreaCentre, the area check's centre; null without a player entity. */
  readonly activeAreaCentre: Vec3 | null;
  /** The original's i16 `0x1b0758` (FS-12): 0–100 for a non-negative speed whose × 100 fits in i32. */
  readonly speedShare: number;
}

/** The Warp transit's presentation inputs (MW-11). */
export interface RenderWarp {
  /** The world's Warp start number, which relates the effect to `warp-started` and `warp-completed`. */
  readonly serial: number;
  /** p = F((n + u) × F(1 ÷ L)), 1.0 at or past 1. */
  readonly progress: number;
  readonly segments: number;
  readonly fraction: number;
  readonly length: number;
  /** The tunnel path's 15 control points, in its private frame. */
  readonly path: readonly Vec3[];
}

function renderWarp(world: WorldState): RenderWarp | null {
  const transit = world.player.viewMode === WARP_VIEW_MODE ? world.player.warp : null;
  if (transit === null) return null;
  const { serial, segments, fraction, length, path } = transit;
  return Object.freeze({ serial, progress: warpProgress(transit), segments, fraction, length, path: Object.freeze(path.map(frozenVec)) });
}

function renderDisplay({ id, state }: Entity, hiddenId: EntityId | null): RenderDisplay {
  switch (state) {
    case 'area-switch':
    case 'pending-removal':
      return 'released';
    case 'new':
    case 'presentation-ready':
    case 'awaiting-presentation':
      return 'pending';
    default:
      return id === hiddenId ? 'hidden' : 'shown';
  }
}

/** `hiddenId` is the player's entity while its model is not shown (FS-02), otherwise null. */
function renderEntity(entity: Entity, hiddenId: EntityId | null): RenderEntity {
  const { id, kindBit, presentation, position: { x, y, z }, orientation, placementSerial, combat, inWarp } = entity;
  return Object.freeze({
    id,
    kindBit,
    // Frozen at allocation and never replaced.
    presentation,
    position: Object.freeze({ x, y, z }),
    orientation: Object.freeze([...orientation]) as unknown as Matrix3,
    placementSerial,
    hitShimmerStart: combat.type === 'craft' ? combat.hitFeedbackClock : null,
    explosionStart: combat.type === 'explosion' ? combat.activationClock : null,
    inWarp,
    sourceKindBit: combat.type === 'explosion' || combat.type === 'fragment' ? combat.sourceKindBit : null,
    display: renderDisplay(entity, hiddenId),
  });
}

export function renderWorld(world: WorldState): RenderState {
  const entities: RenderEntity[] = [];
  const { player } = world;
  const hiddenId = player.modelShown ? null : player.entityId;
  for (const entity of world.entities.byId()) {
    if (entity.activity !== 'parked') entities.push(renderEntity(entity, hiddenId));
  }
  const centre = activeAreaCentre(world);
  return Object.freeze({
    tick: world.tick,
    clock: world.clock,
    viewMode: player.viewMode,
    observedEntityId: player.entityId,
    entities: Object.freeze(entities),
    warp: renderWarp(world),
    subMode: player.subMode,
    followedEntityId: player.followedEntity,
    activeAreaCentre: centre === null ? null : frozenVec(centre),
    speedShare: speedShare(world),
  });
}
