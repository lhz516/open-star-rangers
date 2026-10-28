/**
 * The presentation camera (docs/plan/p3/02/spec.md, FS-07; docs/original/formats/executable.md, C1): the camera each
 * tick ends with, in every view. Views 0xC and 1 take the observed entity's pose (in view 1 the tunnel pose the Warp
 * step wrote), as do 6, 8 and 0x13, which have no camera function of their own; view 0x11, sub-mode 8 takes the
 * destruction camera. Without an observed entity the last pose stays. A run starts from the origin and the identity
 * rows, a run isolation choice, not the original's program-start initialisation. Every other view is unsupported.
 *
 * The viewport is `0x175200`'s rectangle in logical pixels, ends included: (0, 0)–(639, 315) in views 0xC, 1 and 6, and
 * (0, 0)–(639, 479) in 8, 0x11 and 0x13 (P3-12/01, A2).
 */
import type { RenderState } from '../../../core/projections/render-state.ts';
import type { Matrix3 } from '../../../core/world/entity-table.ts';
import { PresentationError } from './presentation-budget.ts';
import type { CameraPose, PresentationCamera, PresentationViewport } from './presentation-contract.ts';

export const DESTRUCTION_VIEW_MODE = 0x11;
export const DESTRUCTION_SUB_MODE = 8;

const viewport = (bottom: number): PresentationViewport => Object.freeze({ left: 0, top: 0, right: 639, bottom });
const FLIGHT_VIEWPORT = viewport(315);
const FULL_VIEWPORT = viewport(479);
const VIEWPORTS: ReadonlyMap<number, PresentationViewport> = new Map([
  [0x0c, FLIGHT_VIEWPORT], [1, FLIGHT_VIEWPORT], [6, FLIGHT_VIEWPORT], [8, FULL_VIEWPORT], [0x13, FULL_VIEWPORT],
]);

export const isDestructionView = (viewMode: number, subMode: number): boolean =>
  viewMode === DESTRUCTION_VIEW_MODE && subMode === DESTRUCTION_SUB_MODE;

/** The viewport of a supported view; `unsupported-view` otherwise. */
export function presentationViewport(viewMode: number, subMode: number): PresentationViewport {
  const found = isDestructionView(viewMode, subMode) ? FULL_VIEWPORT : VIEWPORTS.get(viewMode);
  if (found === undefined) throw new PresentationError('unsupported-view', 'presentation.camera', `has no camera for view ${viewMode}, sub-mode ${subMode}`);
  return found;
}

/** The pose of a new run's camera before tick 0. */
export const INITIAL_CAMERA_POSE: CameraPose = Object.freeze({
  position: Object.freeze({ x: 0, y: 0, z: 0 }),
  rows: Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]) as unknown as Matrix3,
});

/** The observed entity's pose at the tick's end, or null when it is not listed. */
function observedPose({ observedEntityId, entities }: RenderState): CameraPose | null {
  if (observedEntityId === null) return null;
  const entity = entities.find(({ id }) => id === observedEntityId);
  return entity === undefined ? null : Object.freeze({ position: entity.position, rows: entity.orientation });
}

/**
 * The camera `render` ends with, given the previous pose and the destruction camera's pose for this tick (null outside
 * that view, or without a destruction camera).
 */
export function cameraAfterStep(render: RenderState, previous: CameraPose, destruction: CameraPose | null): PresentationCamera {
  const { tick, viewMode, subMode } = render;
  const view = presentationViewport(viewMode, subMode);
  let pose: CameraPose | null;
  if (isDestructionView(viewMode, subMode)) {
    if (destruction === null) throw new PresentationError('unsupported-view', 'presentation.camera', 'has no destruction camera for view 0x11, sub-mode 8');
    pose = destruction;
  } else {
    pose = observedPose(render);
  }
  const { position, rows } = pose ?? previous;
  return Object.freeze({ tick, position, rows, viewMode, subMode, viewport: view });
}
