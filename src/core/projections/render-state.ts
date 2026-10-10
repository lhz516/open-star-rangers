/**
 * Render State of formal Core (docs/plan/p3/02/spec.md, Projection 与 Render State): what a renderer draws after a
 * tick, deeply frozen and detached from the world. Entities are listed in ascending ID order. A parked entity is not
 * presentable (the original keeps no renderer object for it); a destroyed one stays listed until it is removed, and a
 * removed one is gone. A new ID is drawn from its current pose only; a changed placement serial on the same ID marks a
 * discontinuous move that renderers do not interpolate across. Consumers other than renderers never derive rule
 * information (map markers, target lists) from it. The Runtime keeps two frames of one run (P3-04).
 */
import type { Vec3 } from '../contracts/domain-events.ts';
import type { Entity, EntityId, EntityPresentation, Matrix3 } from '../world/entity-table.ts';
import type { WorldState } from '../world/world-state.ts';

export interface RenderEntity {
  readonly id: EntityId;
  readonly kindBit: number;
  readonly presentation: EntityPresentation;
  /** Runtime units. */
  readonly position: Vec3;
  readonly orientation: Matrix3;
  readonly placementSerial: number;
}

export interface RenderState {
  readonly tick: number;
  readonly viewMode: number;
  /** The entity the view follows: the player's, null before its instantiation and after its removal. */
  readonly observedEntityId: EntityId | null;
  /** Presentable entities in ascending ID order. */
  readonly entities: readonly RenderEntity[];
}

function renderEntity({ id, kindBit, presentation, position: { x, y, z }, orientation, placementSerial }: Entity): RenderEntity {
  return Object.freeze({
    id,
    kindBit,
    // Frozen at allocation and never replaced.
    presentation,
    position: Object.freeze({ x, y, z }),
    orientation: Object.freeze([...orientation]) as unknown as Matrix3,
    placementSerial,
  });
}

export function renderWorld(world: WorldState): RenderState {
  const entities: RenderEntity[] = [];
  for (const entity of world.entities.byId()) {
    if (entity.activity !== 'parked') entities.push(renderEntity(entity));
  }
  return Object.freeze({
    tick: world.tick,
    viewMode: world.player.viewMode,
    observedEntityId: world.player.entityId,
    entities: Object.freeze(entities),
  });
}
