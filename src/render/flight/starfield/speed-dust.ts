/**
 * The speed dust (docs/plan/p3/12/spec.md, 星点与速度尘埃, S-15, Q-14, 技术决定 1 and 7; docs/original/formats/executable.md,
 * SD4–SD7, FC2 step 13, WT8): 50 particles fixed in the world, respawned in a box ahead of the camera, drawn as single
 * logical pixels, or in view 1 (Warp) as lines from the previous pass's position. The original runs `0x44f74` once per
 * render pass; here it runs once per successful Core tick with that tick's Render State, events and the presentation
 * camera the tick ends with, and a display frame shows the latest tick's marks, so a frame without a tick draws no
 * random number and changes nothing.
 *
 * Per tick, in the original's order:
 * 1. **Reset (`0x44edc`):** a `view-switched` event of the tick to another view, or to view 0x11, clears the initialised
 *    flag and marks every particle "not drawn" (positions stay). A run starts uninitialised.
 * 2. Nothing outside views 0xC–0x12 and 1, or without a player entity (`observedEntityId`).
 * 3. **Initialisation (`0x44d94`)** when not initialised, before the share test: three draws per particle (x, y, z) in
 *    the box of the current view, placed along the camera's rows; 150 draws.
 * 4. **Share (FS-12):** at most 1, nothing further: no draw, no change, no mark.
 * 5. **Pass:** every particle, in order, is respawned (four draws: x, y, the near/far selector, z; not drawn this pass)
 *    when behind the camera, at an L1 distance at or past the limit, or projected outside the viewport shrunk by one
 *    pixel; otherwise drawn in colour 2–7 by distance, with near brightness 7 in views 0x11 and 1 and (5 × share) idiv
 *    100 in the others. Its projection is the event-0x10 gate's (scale `right`, centre `right >> 1`, `bottom >> 1`),
 *    not the 3D one.
 *
 * Draws come only from the run's presentation random source, as rand values 0–32767. Arithmetic follows the original's
 * store points: double operations, `Math.fround` for f32 stores, truncation for its chop-mode integer conversions.
 */
import type { DomainEvent, Vec3 } from '../../../core/contracts/domain-events.ts';
import type { RenderState } from '../../../core/projections/render-state.ts';
import { pointInFrame } from '../../../core/rules/collision-shapes.ts';
import { RAND_MAX, RAND_SCALE, type RandSource } from '../../../core/rules/original-random.ts';
import { WARP_VIEW_MODE } from '../../../core/systems/view-switch.ts';
import type { Matrix3 } from '../../../core/world/entity-table.ts';
import type { PresentationCamera } from '../presentation/presentation-contract.ts';
import { DESTRUCTION_VIEW_MODE } from '../presentation/presentation-camera.ts';
import { FlightRenderError } from '../renderer/flight-render-error.ts';

export const DUST_PARTICLE_COUNT = 50;

/** One successful tick: its Render State and events (a `TickOutput`, structurally) and `PresentationTick.afterStep`. */
export interface SpeedDustTick {
  readonly render: RenderState;
  readonly events: readonly { readonly event: DomainEvent }[];
  readonly camera: PresentationCamera;
}

/** What one pass draws, logical pixels; a later mark overwrites an earlier one. */
export type DustMark =
  | { readonly type: 'pixel'; readonly x: number; readonly y: number; readonly colour: number }
  /** View 1: from the previous pass's position to this pass's, both ends drawn. */
  | { readonly type: 'line'; readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number; readonly colour: number };

export interface SpeedDustPass {
  readonly tick: number;
  readonly marks: readonly DustMark[];
}

/** A particle after the last tick, for inspection. */
export interface DustParticle {
  readonly position: Vec3;
  /** The screen position of its last draw; (−1, 0) before its first. */
  readonly screenX: number;
  readonly screenY: number;
  /** Drawn in the last pass that ran: the next Warp pass draws it as a line from (screenX, screenY). */
  readonly drawn: boolean;
}

interface Particle {
  position: Vec3;
  screenX: number;
  screenY: number;
  drawn: boolean;
}

/** The box of a view: half-width, limit (also the initial depth) and near depth. */
interface DustBox {
  readonly half: number;
  readonly limit: number;
  readonly near: number;
}

const WARP_BOX: DustBox = Object.freeze({ half: 100, limit: 1000, near: 250 });
const WORLD_BOX: DustBox = Object.freeze({ half: 30, limit: 300, near: 75 });

/** The f64 `0x171b08`. */
const DISTANCE_STEP = 0.004;
const LEAST_COLOUR = 2;
/** The highest DATA index the dust draws. */
export const DUST_MOST_COLOUR = 7;
const FULL_BRIGHTNESS = 7;
/** r % 100 below this chooses the near part of a respawn's depth. */
const NEAR_BELOW = 60;
const INDEFINITE = -(2 ** 31);

const PATH = 'speedDust';

/** Views 0xC–0x12 and 1, which call `0x44f74` (FC2). */
const runsIn = (viewMode: number): boolean => viewMode === WARP_VIEW_MODE || (viewMode >= 0x0c && viewMode <= 0x12);

/** FISTP under the chop mode: truncation, and the integer indefinite −2³¹ beyond i32 or for NaN. */
const chop = (value: number): number => (value >= 2 ** 31 || value < INDEFINITE || Number.isNaN(value) ? INDEFINITE : Math.trunc(value));

/** `0x56e34`: the camera position plus `offset` along its rows, F(p + F((y·R1 + x·R0) + z·R2)) per component. */
function placed(rows: Matrix3, position: Vec3, { x, y, z }: Vec3): Vec3 {
  const axis = (column: number, from: number): number => Math.fround(from + Math.fround(y * rows[3 + column] + x * rows[column] + z * rows[6 + column]));
  return Object.freeze({ x: axis(0, position.x), y: axis(1, position.y), z: axis(2, position.z) });
}

function resets(events: SpeedDustTick['events']): boolean {
  return events.some(({ event }) => event.type === 'view-switched' && (event.viewMode !== event.fromViewMode || event.viewMode === DESTRUCTION_VIEW_MODE));
}

export class SpeedDust {
  readonly #random: RandSource;
  readonly #particles: Particle[] = Array.from({ length: DUST_PARTICLE_COUNT }, () => ({
    position: Object.freeze({ x: 0, y: 0, z: 0 }), screenX: -1, screenY: 0, drawn: false,
  }));
  #initialised = false;
  #lastTick: number | null = null;
  #pass: SpeedDustPass | null = null;

  constructor(random: RandSource) {
    this.#random = random;
  }

  /** The marks of the last stepped tick; null before the first. */
  get pass(): SpeedDustPass | null {
    return this.#pass;
  }

  get initialised(): boolean {
    return this.#initialised;
  }

  get particles(): readonly DustParticle[] {
    return Object.freeze(this.#particles.map((particle) => Object.freeze({ ...particle })));
  }

  /** One successful Core tick; call for every tick, in order. */
  step({ render, events, camera }: SpeedDustTick): void {
    const { tick } = render;
    if (camera.tick !== tick) throw new FlightRenderError('invalid-input', `${PATH}.step`, `has the camera of tick ${camera.tick} for tick ${tick}`);
    if (this.#lastTick !== null && tick <= this.#lastTick) throw new FlightRenderError('invalid-state', `${PATH}.step`, `steps tick ${tick} after tick ${this.#lastTick}`);
    this.#lastTick = tick;
    this.#pass = Object.freeze({ tick, marks: Object.freeze(this.#run(render, events, camera)) });
  }

  #run({ viewMode, observedEntityId, speedShare }: RenderState, events: SpeedDustTick['events'], camera: PresentationCamera): DustMark[] {
    if (resets(events)) {
      this.#initialised = false;
      for (const particle of this.#particles) particle.drawn = false;
    }
    if (!runsIn(viewMode) || observedEntityId === null) return [];
    const warp = viewMode === WARP_VIEW_MODE;
    const box = warp ? WARP_BOX : WORLD_BOX;
    if (!this.#initialised) {
      for (const particle of this.#particles) {
        const x = this.#across(box);
        const y = this.#across(box);
        const z = Math.fround(this.#fraction() * box.limit);
        particle.position = placed(camera.rows, camera.position, { x, y, z });
        particle.screenX = -1;
        particle.drawn = false;
      }
      this.#initialised = true;
    }
    if (speedShare <= 1) return [];
    const { left, top, right, bottom } = camera.viewport;
    const cx = right >> 1;
    const cy = bottom >> 1;
    const scale = Math.fround(right);
    const fullNear = warp || viewMode === DESTRUCTION_VIEW_MODE;
    const bright = fullNear ? FULL_BRIGHTNESS : Math.trunc((5 * speedShare) / 100);
    const marks: DustMark[] = [];
    const c = camera.position;
    for (const particle of this.#particles) {
      const { position: p } = particle;
      const local = pointInFrame(camera.rows, c, p);
      const distance = Math.fround((Math.abs(c.y - p.y) + Math.abs(c.x - p.x)) + Math.abs(c.z - p.z));
      let sx = 0;
      let sy = 0;
      let shown = !(0 > local.z) && distance < box.limit;
      if (shown) {
        const inverse = 1 / local.z;
        sx = chop((scale * local.x) * inverse) + cx;
        sy = chop((-scale * local.y) * inverse) + cy;
        shown = left + 1 <= sx && sx <= right - 1 && top + 1 <= sy && sy <= bottom - 1;
      }
      if (!shown) {
        this.#respawn(particle, box, camera);
        continue;
      }
      const reach = fullNear ? distance : distance + box.near;
      const colour = Math.min(DUST_MOST_COLOUR, Math.max(LEAST_COLOUR, LEAST_COLOUR + bright - bright * chop(reach * DISTANCE_STEP)));
      marks.push(warp && particle.drawn
        ? Object.freeze({ type: 'line', x0: particle.screenX, y0: particle.screenY, x1: sx, y1: sy, colour })
        : Object.freeze({ type: 'pixel', x: sx, y: sy, colour }));
      particle.screenX = sx;
      particle.screenY = sy;
      particle.drawn = true;
    }
    return marks;
  }

  /** x := F(D(D(r × c) × F(2h)) − h). */
  #across({ half }: DustBox): number {
    return Math.fround(this.#fraction() * (2 * half) - half);
  }

  /** D(r × c) of the next draw. */
  #fraction(): number {
    return this.#rand() * RAND_SCALE;
  }

  #rand(): number {
    const value = this.#random.next();
    if (!Number.isInteger(value) || value < 0 || value > RAND_MAX) throw new FlightRenderError('invalid-input', `${PATH}.random`, 'must give integers from 0 to 32767');
    return value;
  }

  #respawn(particle: Particle, box: DustBox, camera: PresentationCamera): void {
    const x = this.#across(box);
    const y = this.#across(box);
    const near = this.#rand() % 100 < NEAR_BELOW;
    const fraction = this.#fraction();
    const z = near ? Math.fround(fraction * box.near) : Math.fround(fraction * (box.limit - box.near) + box.near);
    particle.position = placed(camera.rows, camera.position, { x, y, z });
    particle.drawn = false;
  }
}

/**
 * `0x5ad00`: a one-pixel line from (x0, y0) to (x1, y1), both ends drawn, along x when |dx| > |dy| and along y
 * otherwise; the error starts at 2|d_minor| − |d_major| and the minor axis steps when it is ≥ 0. No clipping.
 */
export function drawDustLine(x0: number, y0: number, x1: number, y1: number, plot: (x: number, y: number) => void): void {
  const dx2 = 2 * Math.abs(x1 - x0);
  const dy2 = 2 * Math.abs(y1 - y0);
  const sx = x1 - x0 < 0 ? -1 : 1;
  const sy = y1 - y0 < 0 ? -1 : 1;
  let x = x0;
  let y = y0;
  if (dx2 > dy2) {
    let error = dy2 - dx2 / 2;
    for (;;) {
      plot(x, y);
      if (x === x1) return;
      if (error >= 0) {
        error -= dx2;
        y += sy;
      }
      error += dy2;
      x += sx;
    }
  }
  let error = dx2 - dy2 / 2;
  for (;;) {
    plot(x, y);
    if (y === y1) return;
    if (error >= 0) {
      error -= dy2;
      x += sx;
    }
    error += dx2;
    y += sy;
  }
}
