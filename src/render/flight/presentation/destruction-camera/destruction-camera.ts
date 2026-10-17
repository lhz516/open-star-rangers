/**
 * The destruction-view camera (docs/plan/p3/12/spec.md, 被毁视角; docs/original/formats/executable.md, automatic views
 * and cameras and PV8): the camera of view 0x11, sub-mode 8, stepped once per Core tick through the presentation
 * module's `DestructionCamera` seam. It keeps the original's camera state (`0x1864e0`–`0x186538`) for one run.
 *
 * - **Entry** (`0x31094`), at every `view-switched` to 0x11/8, in event order: the player's rows and position at the
 *   switch, the rows turned by the f32 32° about row 0 (`0x228cc`), the follow distance unset and the entry time the
 *   clock sample in seconds, F(clock ÷ 64). A switch before the `clock` stage reads the previous tick's sample, as the
 *   original reads `0x18641c` before that pass's sample; P3-11's destruction entry is always later (FS-03).
 * - **Camera step** (`0x31bdc`), once at the tick's end while the view is 0x11/8 and the player state holds a player
 *   entity (`0x21584`); without one the stored pose stays.
 *   - No followed entity (before the explosion): s = D(D(now − entry) × −30), and each position component is
 *     F(P + F(R2 × s)) of the player's position at the tick's end; the rows stay.
 *   - A followed entity that is no longer listed (an invalid handle): the stored pose stays (frozen camera).
 *   - A listed followed entity at F: R2 := F(F − position); a negative (unset) distance becomes F(√((y² + z²) + x²))
 *     of that R2; then R2 := normalise(R2) (`0x56aa8`), R0 := normalise(R1 × R2) and R1 := R2 × R0, not normalised,
 *     each cross-product component F(D(a·b − c·d)): Core's orthonormalFrame. The distance moves a quarter of the way
 *     towards 30 in double, stored f32; each position component is F(F + F(R2 × −distance)). A zero R2 (camera at F)
 *     or an R2 parallel to the old R1 gives zero rows, which stay zero for the rest of the follow while R2 recovers:
 *     they are given as they are, never NaN.
 * - **Leaving** the view drops the state; the presentation camera returns to the observed entity's pose. A rescue and
 *   a new destruction sequence, even of the same entity, start again from their own entry.
 *
 * The easing is per tick, where the original eases per dispatcher pass at a variable frame rate (spec, 技术决定 7).
 */
import { PIPELINE_STAGE_NAMES, type DomainEvent, type PipelineStageName, type Vec3, type ViewSwitchedEvent } from '../../../../core/contracts/domain-events.ts';
import { CLOCK_UNITS_PER_SECOND } from '../../../../core/contracts/time.ts';
import type { RenderState } from '../../../../core/projections/render-state.ts';
import { rotateRows } from '../../../../core/rules/flight-motion.ts';
import { orthonormalFrame, rowOf } from '../../../../core/rules/movement-builders.ts';
import { frozenVec, type Matrix3 } from '../../../../core/world/entity-table.ts';
import { PresentationError } from '../presentation-budget.ts';
import { isDestructionView } from '../presentation-camera.ts';
import type { CameraPose, DestructionCamera, PresentationStep } from '../presentation-contract.ts';

/** The f32 entry turn about row 0 (bits 0x3F0EFA35), 32° in radians. */
export const ENTRY_ANGLE = Math.fround((32 * Math.PI) / 180);
/** The recession per second before the explosion (f64 −30.0). */
const RECESSION = -30;
/** The follow distance the camera eases towards (f32 and f64 30.0), and the share of the gap it closes per step. */
const FOLLOW_DISTANCE = 30;
const EASING = 0.25;
/** The distance of a fresh entry: unset. */
const UNSET = -1;

const PATH = 'presentation.destructionCamera';
const CLOCK_STAGE = PIPELINE_STAGE_NAMES.indexOf('clock');

const store = Math.fround;
const vec = (x: number, y: number, z: number): Vec3 => Object.freeze({ x, y, z });
/** Each component F(P + F(R2 × scale)): the product is stored before the sum. */
const along = (origin: Vec3, direction: Vec3, scale: number): Vec3 => vec(
  store(origin.x + store(direction.x * scale)), store(origin.y + store(direction.y * scale)), store(origin.z + store(direction.z * scale)));
/** `0x18641c`: the clock sample in f32 seconds. */
const seconds = (clock: number): number => store(clock / CLOCK_UNITS_PER_SECOND);

function invariant(reason: string): never {
  throw new PresentationError('invariant-violated', PATH, reason);
}

/** The original's camera globals for one entry. */
interface CameraState {
  position: Vec3;
  rows: Matrix3;
  /** `0x1864e0`, f32; UNSET until the first follow step. */
  distance: number;
  /** `0x186538`, f32 seconds. */
  readonly entry: number;
}

const isEntry = (event: DomainEvent): event is ViewSwitchedEvent => event.type === 'view-switched' && isDestructionView(event.viewMode, event.subMode);
const beforeClock = (stage: PipelineStageName): boolean => PIPELINE_STAGE_NAMES.indexOf(stage) < CLOCK_STAGE;

/** `0x31094` with sub-mode 8. */
function enter({ player }: ViewSwitchedEvent, clock: number): CameraState {
  if (player === null) return invariant('needs the player entity at the switch to view 0x11, sub-mode 8');
  return { position: frozenVec(player.position), rows: rotateRows(player.orientation, 'pitch', ENTRY_ANGLE), distance: UNSET, entry: seconds(clock) };
}

/** `0x31bdc`. */
function cameraStep(state: CameraState, { observedEntityId, followedEntityId, entities }: RenderState, clock: number): void {
  if (followedEntityId === null) {
    const craft = entities.find(({ id }) => id === observedEntityId) ?? invariant(`needs the player entity ${observedEntityId} in the Render State`);
    state.position = along(craft.position, rowOf(state.rows, 2), (seconds(clock) - state.entry) * RECESSION);
    return;
  }
  const followed = entities.find(({ id }) => id === followedEntityId);
  if (followed === undefined) return;
  const target = followed.position;
  const { position, rows } = state;
  const offset = vec(store(target.x - position.x), store(target.y - position.y), store(target.z - position.z));
  let { distance } = state;
  if (distance < 0) distance = store(Math.sqrt(offset.y * offset.y + offset.z * offset.z + offset.x * offset.x));
  // The original's branches above and below 30, d − (d − 30)·0.25 and d + (30 − d)·0.25, give the same double.
  distance = store(distance + (FOLLOW_DISTANCE - distance) * EASING);
  state.rows = orthonormalFrame(Object.freeze([...rows.slice(0, 6), offset.x, offset.y, offset.z]) as unknown as Matrix3);
  state.distance = distance;
  state.position = along(target, rowOf(state.rows, 2), -distance);
}

class OriginalDestructionCamera implements DestructionCamera {
  #state: CameraState | null = null;
  /** The last stepped tick's clock: the sample a switch before this tick's `clock` stage reads. */
  #clock: number | null = null;

  step({ clock, render, events }: PresentationStep): CameraPose | null {
    const sample = this.#clock ?? clock;
    this.#clock = clock;
    for (const event of events) {
      if (isEntry(event)) this.#state = enter(event, beforeClock(event.stage) ? sample : clock);
    }
    if (!isDestructionView(render.viewMode, render.subMode)) {
      this.#state = null;
      return null;
    }
    const state = this.#state ?? invariant('found view 0x11, sub-mode 8 without its entry');
    if (render.observedEntityId !== null) cameraStep(state, render, clock);
    return Object.freeze({ position: state.position, rows: state.rows });
  }
}

/** One run's destruction-view camera, for `FlightPresentationInput.destructionCamera`. */
export function createDestructionCamera(): DestructionCamera {
  return new OriginalDestructionCamera();
}
