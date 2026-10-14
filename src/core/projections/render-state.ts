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
 */
import type { Vec3 } from '../contracts/domain-events.ts';
import { warpProgress } from '../rules/warp-path.ts';
import { WARP_VIEW_MODE } from '../systems/view-switch.ts';
import { frozenVec, type Entity, type EntityId, type EntityPresentation, type Matrix3 } from '../world/entity-table.ts';
import type { WorldState } from '../world/world-state.ts';

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
}

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

function renderEntity({ id, kindBit, presentation, position: { x, y, z }, orientation, placementSerial, combat }: Entity): RenderEntity {
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
  });
}

export function renderWorld(world: WorldState): RenderState {
  const entities: RenderEntity[] = [];
  for (const entity of world.entities.byId()) {
    if (entity.activity !== 'parked') entities.push(renderEntity(entity));
  }
  return Object.freeze({
    tick: world.tick,
    clock: world.clock,
    viewMode: world.player.viewMode,
    observedEntityId: world.player.entityId,
    entities: Object.freeze(entities),
    warp: renderWarp(world),
  });
}
