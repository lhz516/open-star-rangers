/**
 * The flight scene of one run (docs/plan/p3/12/spec.md, Render State 的消费, 相机、投影与视口, 行为与边界; AC-04, AC-05):
 * what each display frame draws of the world, from the Runtime's two Render States, the frame's alpha and the
 * presentation module's cameras. It reads nothing else and advances nothing; it keeps only the library's last accepted
 * orientations (drawn-pose.ts), resolved once per Render State and camera, so drawing a frame again gives the same result.
 *
 * - **Views:** 0xC (F1) and 1 (Warp) draw the world from the observed entity's pose, view 0x11 sub-mode 8 from the
 *   destruction camera; 6 (base), 8 (map) and 0x13 draw no world; every other view is `unsupported-view`.
 * - **Camera:** the presentation camera after each step (in F1 and Warp the observed entity's pose, PV7), mixed between
 *   the previous tick's and the current tick's.
 * - **Folds:** nothing is mixed across a change of view or sub-mode, observed or followed entity, or Warp transit, or
 *   when the two Render States are not consecutive ticks (a held or paused frame shows the current state); an entity is
 *   mixed only from the previous state's drawn entry with the same ID and placement serial (a visual first shown is
 *   drawn at its current pose: none is drawn before its first pose, PV6), and the camera of views 0xC and 1
 *   not across a placement serial change of the observed entity (a Warp start or arrival). An entity without such an
 *   entry is drawn at its current pose.
 * - **Visible set (PV6):** entities whose display is `shown` (not `pending` before their first pose, `hidden` while the
 *   player's model is hidden, or `released` from the pass that removes their visual), except map markers and, in F1 and
 *   Warp, the observed entity. Explosions are listed for their sprites; each pass draws only its own presentations.
 */
import type { RenderFrame } from '../../../app/runtime/game-runtime.ts';
import type { RenderEntity, RenderState } from '../../../core/projections/render-state.ts';
import { BASE_VIEW_MODE, MAP_VIEW_MODE, WARP_VIEW_MODE } from '../../../core/systems/view-switch.ts';
import { COCKPIT_VIEW_MODE } from '../../../core/world/player-state.ts';
import type { Matrix3 } from '../../../core/world/entity-table.ts';
import type { SceneDeviceValues } from '../../../content/flight/flight-data-content.ts';
import { isDestructionView } from '../presentation/presentation-camera.ts';
import type { PresentationCamera, PresentationViewport } from '../presentation/presentation-contract.ts';
import { FlightRenderError } from '../renderer/flight-render-error.ts';
import { DrawnOrientations, interpolatePose, type DrawnPose } from './drawn-pose.ts';
import { backPlane, checkSceneDevice } from './projection.ts';

const NO_WORLD_VIEW_MODES: ReadonlySet<number> = new Set([BASE_VIEW_MODE, MAP_VIEW_MODE, 0x13]);

export type FlightViewKind = 'flight' | 'warp' | 'destruction' | 'no-world';

/** The kind of view `viewMode`, `subMode` shows; `unsupported-view` for one P3 does not draw. */
export function flightViewKind(viewMode: number, subMode: number): FlightViewKind {
  if (viewMode === COCKPIT_VIEW_MODE) return 'flight';
  if (viewMode === WARP_VIEW_MODE) return 'warp';
  if (isDestructionView(viewMode, subMode)) return 'destruction';
  if (NO_WORLD_VIEW_MODES.has(viewMode)) return 'no-world';
  throw new FlightRenderError('unsupported-view', 'scene.view', `cannot draw view ${viewMode}, sub-mode ${subMode}`);
}

/** The presentation cameras after the previous tick's step (null before the run's first tick) and the current tick's. */
export interface SceneCameras {
  readonly previous: PresentationCamera | null;
  readonly current: PresentationCamera;
}

export interface FlightSceneInput {
  readonly render: RenderFrame;
  readonly cameras: SceneCameras;
}

/** A drawn entity: its current Render State entry at its drawn pose. */
export interface SceneEntity extends DrawnPose {
  readonly entity: RenderEntity;
}

export interface FlightSceneFrame {
  readonly view: Exclude<FlightViewKind, 'no-world'>;
  /** Logical pixels, ends included. */
  readonly viewport: PresentationViewport;
  readonly camera: DrawnPose;
  /** The back plane B, camera-space depth. */
  readonly backPlane: number;
  /** The visible set in ascending ID order. */
  readonly entities: readonly SceneEntity[];
}

const CAMERA_KEY = 'camera';
const entityKey = (id: number): string => `entity:${id}`;

/** Whether nothing may be mixed from `previous` to `current`. */
export function foldsFrame(previous: RenderState, current: RenderState): boolean {
  return previous === current || previous.tick + 1 !== current.tick
    || previous.viewMode !== current.viewMode || previous.subMode !== current.subMode
    || previous.observedEntityId !== current.observedEntityId || previous.followedEntityId !== current.followedEntityId
    || (previous.warp?.serial ?? null) !== (current.warp?.serial ?? null);
}

/** Views 0xC and 1, drawn from the observed entity's own pose, without its model. */
const fromObserved = (viewMode: number): boolean => viewMode === COCKPIT_VIEW_MODE || viewMode === WARP_VIEW_MODE;

export function isDrawnEntity(entity: RenderEntity, render: RenderState): boolean {
  if (entity.presentation.type === 'map-marker' || entity.display !== 'shown') return false;
  return !(fromObserved(render.viewMode) && entity.id === render.observedEntityId);
}

const serialOf = (render: RenderState, id: number | null): number | undefined =>
  id === null ? undefined : render.entities.find((entity) => entity.id === id)?.placementSerial;

export class FlightScene {
  readonly #device: SceneDeviceValues;
  readonly #orientations = new DrawnOrientations();
  /** The drawn orientation of each listed entity of every Render State resolved so far, by ID. */
  readonly #entityRows = new WeakMap<RenderState, ReadonlyMap<number, Matrix3>>();
  readonly #cameraRows = new WeakMap<PresentationCamera, Matrix3>();

  /** `device` is the run's RENS +0x1C/+0x20/+0x24; refused unless usable (projection.ts). */
  constructor(device: SceneDeviceValues) {
    checkSceneDevice(device);
    this.#device = device;
  }

  /** The world of this frame, or null in a view that draws none. Drawing the same frame again gives the same result. */
  frame({ render: { previous, current, alpha }, cameras }: FlightSceneInput): FlightSceneFrame | null {
    const view = flightViewKind(current.viewMode, current.subMode);
    // The library sets every listed visual's pose in every view, the ones that draw no world included.
    const before = this.#resolve(previous);
    const after = this.#resolve(current);
    if (view === 'no-world') return null;
    if (cameras.current.tick !== current.tick) {
      throw new FlightRenderError('invalid-state', 'scene.cameras', `give tick ${cameras.current.tick} for the Render State of tick ${current.tick}`);
    }
    const folded = foldsFrame(previous, current);
    const camera = this.#camera(cameras, folded, previous, current, alpha);
    const drawnBefore = folded ? null : new Map(previous.entities.filter((entity) => isDrawnEntity(entity, previous)).map((entity) => [entity.id, entity]));
    const entities: SceneEntity[] = [];
    for (const entity of current.entities) {
      if (!isDrawnEntity(entity, current)) continue;
      const to: DrawnPose = { position: entity.position, rows: after.get(entity.id)! };
      const from = drawnBefore?.get(entity.id);
      const pose = from !== undefined && from.placementSerial === entity.placementSerial
        ? interpolatePose({ position: from.position, rows: before.get(from.id)! }, to, alpha)
        : to;
      entities.push(Object.freeze({ ...pose, entity }));
    }
    return Object.freeze({
      view, viewport: cameras.current.viewport, camera, backPlane: backPlane(this.#device, current.entities), entities: Object.freeze(entities),
    });
  }

  /**
   * The library's orientations after the pose items of `render`, resolved once per Render State in tick order: later
   * redraws reuse them. A visual's frame is forgotten once its entity is released or no longer listed.
   */
  #resolve(render: RenderState): ReadonlyMap<number, Matrix3> {
    const known = this.#entityRows.get(render);
    if (known) return known;
    const rows = new Map<number, Matrix3>();
    const live = new Set<string>([CAMERA_KEY]);
    for (const { id, orientation, display, presentation } of render.entities) {
      if (display !== 'released') live.add(entityKey(id));
      // Only shown and hidden visuals get a pose item, and never a map marker's (PV6).
      if ((display === 'shown' || display === 'hidden') && presentation.type !== 'map-marker') rows.set(id, this.#orientations.set(entityKey(id), orientation));
    }
    this.#orientations.retain((key) => live.has(key));
    this.#entityRows.set(render, rows);
    return rows;
  }

  #camera({ previous: from, current: to }: SceneCameras, folded: boolean, previous: RenderState, current: RenderState, alpha: number): DrawnPose {
    const before = from === null ? null : this.#cameraPose(from);
    const after = this.#cameraPose(to);
    const observedMoved = fromObserved(current.viewMode)
      && serialOf(previous, current.observedEntityId) !== serialOf(current, current.observedEntityId);
    if (folded || observedMoved || before === null || from!.tick !== previous.tick) return after;
    return interpolatePose(before, after, alpha);
  }

  /** The drawn camera of a presentation camera, resolved once in the order cameras arrive. */
  #cameraPose(camera: PresentationCamera): DrawnPose {
    let rows = this.#cameraRows.get(camera);
    if (rows === undefined) {
      rows = this.#orientations.set(CAMERA_KEY, camera.rows);
      this.#cameraRows.set(camera, rows);
    }
    return Object.freeze({ position: camera.position, rows });
  }
}
