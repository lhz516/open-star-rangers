import type { Vec3 } from '../../../core/contracts/domain-events.ts';
import type { RenderState } from '../../../core/projections/render-state.ts';
import { WARP_PATH_POINTS } from '../../../core/rules/warp-path.ts';
import { WARP_VIEW_MODE } from '../../../core/systems/view-switch.ts';
import { IDENTITY, renderEntity, renderState, vec } from '../presentation/presentation.test-support.ts';
import type { CameraPose } from '../presentation/presentation-contract.ts';

// Code-generated synthetic Warp inputs for the tunnel effect's tests; never original data.

/**
 * A straight tunnel path along +z with the set-up's spacing (warp-path.ts): point 0 and point 1 at z = 10000, then a
 * step of 2000 per point. Every path frame is the identity, and each segment start lies on its point.
 */
export const STRAIGHT_PATH: readonly Vec3[] = Object.freeze(Array.from({ length: WARP_PATH_POINTS }, (_, index) => vec(0, 0, 10000 + 2000 * Math.max(0, index - 1))));

/** A camera at (0, 0, z) looking along +z. */
export const cameraAt = (z: number, rows = IDENTITY): CameraPose => Object.freeze({ position: vec(0, 0, z), rows });

/** A Render State of view 1 in Warp `serial`, on `path`, observing entity 1 at `observed` when given. */
export function warpState(tick: number, serial: number, path: readonly Vec3[] = STRAIGHT_PATH, observed: CameraPose | null = null): RenderState {
  const entities = observed === null ? [] : [renderEntity(1, { position: observed.position, orientation: observed.rows })];
  return Object.freeze({
    ...renderState(tick, { viewMode: WARP_VIEW_MODE, observedEntityId: observed === null ? null : 1, entities }),
    warp: Object.freeze({ serial, progress: 0, segments: 0, fraction: 0, length: 10, path }),
  });
}

/** A Render State outside a Warp (view 0xC). */
export const flightState = (tick: number): RenderState => renderState(tick);
