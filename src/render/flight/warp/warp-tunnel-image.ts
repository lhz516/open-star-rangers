/**
 * One drawing of the Warp effect `0x505cc` (docs/original/formats/executable.md, WT3–WT6; docs/plan/p3/12/spec.md,
 * Warp 隧道效果, Q-11): the 40 ring slots on segments 1–4 of the tunnel path, each slot's template carried by the path
 * frame and projected with the effect's own projection, then the rails and the drawn ring edges, back to front, in two
 * ramps of the Warp palette chosen by each slot's distance from the camera. It neither reads nor writes depth.
 *
 * The image is the logical screen's rows 0–314, where every line stays (columns 1–638, rows 1–314). A pixel no line
 * wrote is transparent: the effect covers the stars, the world and the speed dust only where it draws.
 *
 * - **Projection scratch:** like the original's slot table `0x1acf10`, each entry keeps its last screen y while its point
 *   is on or behind the camera plane (x := −1). It persists between drawings of one Warp and is cleared to (0, 0) when a
 *   new Warp (serial) is drawn first (06's recommended reset; the original carries it over, which only affects the rare
 *   rail drawn towards the left edge at a stale y, WT6).
 * - **Arithmetic:** double operations with `Math.fround` where the original stores f32, in its order; `chop` truncates
 *   towards zero, and a quotient outside i32 gives the x87 integer indefinite −2³¹.
 */
import type { Vec3 } from '../../../core/contracts/domain-events.ts';
import { evaluateWarpPath, type WarpPathPose } from '../../../core/rules/warp-path.ts';
import type { CameraPose } from '../presentation/presentation-contract.ts';
import { FlightRenderError } from '../renderer/flight-render-error.ts';
import { LOGICAL_WIDTH } from '../composition/logical-screen.ts';
import { drawWarpLine, WARP_LINE_MAX_Y } from './warp-line.ts';
import { WARP_RING_POINTS, WARP_TEMPLATES } from './warp-templates.ts';

export const WARP_SLOT_COUNT = 40;
/** The image's size: the logical width and rows 0–314. */
export const WARP_IMAGE_WIDTH = LOGICAL_WIDTH;
export const WARP_IMAGE_HEIGHT = WARP_LINE_MAX_Y + 2;

/** The path parameter's step per slot, an f64 constant summed in f32. */
const SLOT_STEP = 0.1;
/** The effect's projection in HI (WT5): 800 pixels per unit of x/z about (320, 158), not the library's 640. */
const PROJECTION_SCALE = 800;
const CENTRE_X = 320;
const CENTRE_Y = 158;
/** The x of an entry on or behind the camera plane. */
const BEHIND = -1;
const INDEFINITE = -(2 ** 31);
/** The brightness factors (f64 `0x171f6c`, `0x171f74`): q = F(d²) × 1.5 × 1.5625e-8, at most 1. */
const DISTANCE_FACTOR = 1.5;
const DISTANCE_SCALE = 1.5625e-8;

/** The Warp palette's two ramps (WT3 step 3): h = 107 >> 1 levels, each L₀ = 63 and Lᵢ₊₁ = F(Lᵢ − F(63 ÷ h)). */
const RAMP_LENGTH = 107 >> 1;
const RAMP_TOP = 63;

/** The 6-bit levels of both ramps, level 0 the brightest: 63, 61, 60, …, 2, 1. */
export const WARP_RAMP_LEVELS: readonly number[] = (() => {
  const step = Math.fround(RAMP_TOP / RAMP_LENGTH);
  const levels: number[] = [];
  let level = RAMP_TOP;
  for (let index = 0; index < RAMP_LENGTH; index++) {
    levels.push(Math.max(0, Math.trunc(level)));
    level = Math.fround(level - step);
  }
  return Object.freeze(levels);
})();

/** A 6-bit VGA component as 8 bits, by bit replication like every DATA palette entry. */
const expand = (component: number): number => (component << 2) | (component >> 4);

/** 0xRRGGBB of level k's edge (green ramp entry idx[k]) and centre (grey ramp entry idx[53 + k]). */
export const WARP_EDGE_COLOURS: readonly number[] = Object.freeze(WARP_RAMP_LEVELS.map((level) => expand(level) << 8));
export const WARP_CENTRE_COLOURS: readonly number[] = Object.freeze(WARP_RAMP_LEVELS.map((level) => expand(level) * 0x010101));

/** One ring slot's place on the path: its segment and f32 parameter t. */
interface SlotParameter {
  readonly segment: number;
  readonly t: number;
}

/**
 * WT4 step 2: slot i lies at the running (segment, t) from (1, +0), t := F(t + 0.1) and, when 1.0 > t fails, t := +0
 * and the next segment; that is, 10 slots per segment on segments 1–4, slots 0, 10, 20 and 30 at t = +0.
 */
const SLOT_PARAMETERS: readonly SlotParameter[] = (() => {
  const slots: SlotParameter[] = [];
  let segment = 1;
  let t = 0;
  for (let slot = 0; slot < WARP_SLOT_COUNT; slot++) {
    slots.push(Object.freeze({ segment, t }));
    t = Math.fround(t + SLOT_STEP);
    if (!(1 > t)) {
      t = 0;
      segment++;
    }
  }
  return Object.freeze(slots);
})();

/** The slots whose ring edges are drawn, in drawing order (39 → 1): those at t = ±0 except slot 0, a rail end only. */
export const WARP_EDGE_SLOTS: readonly number[] = Object.freeze(
  SLOT_PARAMETERS.flatMap(({ t }, slot) => (t === 0 && slot > 0 ? [slot] : [])).reverse(),
);

/** The ring-edge draws of one pass: 20 per edge slot (60). */
export const WARP_EDGE_DRAWS = WARP_EDGE_SLOTS.length * WARP_RING_POINTS;

/** The 40 ring slots' path frames; segment s is evaluated on points s − 1 to s + 2, so segments 1–4 read points 0–6. */
export function warpRingSlots(path: readonly Vec3[]): readonly WarpPathPose[] {
  return Object.freeze(SLOT_PARAMETERS.map(({ segment, t }) => evaluateWarpPath(path.slice(segment - 1, segment + 3), t)));
}

/** x87 `chop` into an i32. */
const chop = (value: number): number => (value >= 2 ** 31 || value < INDEFINITE || Number.isNaN(value) ? INDEFINITE : Math.trunc(value));

/** WT4 step 3: the ramp level of a slot whose centre is at the f32 squared distance `squared` from the camera. */
export function warpRampLevel(squared: number): number {
  let q = squared * DISTANCE_FACTOR * DISTANCE_SCALE;
  if (1 < q) q = 1;
  return chop((RAMP_LENGTH - 1) * q);
}

/** WT4 step 2: d² = F(D(D(dy·F(dy) + dz·F(dz)) + dx·F(dx))), d = P − C. */
function squaredDistance(p: Vec3, c: Vec3): number {
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  const dz = p.z - c.z;
  return Math.fround(dy * Math.fround(dy) + dz * Math.fround(dz) + dx * Math.fround(dx));
}

/** What one drawing reads. */
export interface WarpTunnelDrawing {
  /** The Warp the slots belong to; a new one clears the projection scratch first. */
  readonly serial: number;
  /** `RenderWarp.path`. */
  readonly path: readonly Vec3[];
  /** Slot i's template index (`WARP_TEMPLATES`). */
  readonly templates: readonly number[];
  /** The pass's ring-edge draws in drawing order (WARP_EDGE_SLOTS × j = 0–19): draw the edge when true. */
  readonly edges: readonly boolean[];
  /** The camera position and rows (row 0 right, row 1 up, row 2 forward). */
  readonly camera: CameraPose;
}

/** The effect's RGBA image and its projection scratch. */
export class WarpTunnelImage {
  /** RGBA, row-major from logical row 0; alpha 0 where nothing is drawn. */
  readonly pixels: Uint8Array<ArrayBufferLike>;
  /** Entry (slot, j) at 2 × (slot × 20 + j): screen x, then y. */
  readonly #screen = new Int32Array(WARP_SLOT_COUNT * WARP_RING_POINTS * 2);
  #serial: number | null = null;
  /** The last path's slots, which change only when Core shifts the path. */
  #slots: { readonly path: readonly Vec3[]; readonly slots: readonly WarpPathPose[] } | null = null;

  /** Draws into `pixels`, WARP_IMAGE_WIDTH × WARP_IMAGE_HEIGHT RGBA, when given. */
  constructor(pixels: Uint8Array<ArrayBufferLike> = new Uint8Array(WARP_IMAGE_WIDTH * WARP_IMAGE_HEIGHT * 4)) {
    if (pixels.length !== WARP_IMAGE_WIDTH * WARP_IMAGE_HEIGHT * 4) throw new FlightRenderError('invalid-input', 'warpTunnel.pixels', 'must hold the image');
    this.pixels = pixels;
  }

  /** The projection scratch's entry `point` of slot `slot`, as the last drawing left it. */
  screenEntry(slot: number, point: number): { readonly x: number; readonly y: number } {
    const entry = 2 * (slot * WARP_RING_POINTS + point);
    return { x: this.#screen[entry], y: this.#screen[entry + 1] };
  }

  /** Redraws the image from `drawing`. */
  draw({ serial, path, templates, edges, camera }: WarpTunnelDrawing): void {
    if (templates.length !== WARP_SLOT_COUNT || edges.length !== WARP_EDGE_DRAWS) {
      throw new FlightRenderError('invalid-input', 'warpTunnel.drawing', `needs ${WARP_SLOT_COUNT} templates and ${WARP_EDGE_DRAWS} edge draws`);
    }
    const { position: { x, y, z }, rows } = camera;
    if (!(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) && rows.every(Number.isFinite))) throw new FlightRenderError('invalid-input', 'warpTunnel.camera', 'must be finite');
    if (serial !== this.#serial) {
      this.#screen.fill(0);
      this.#serial = serial;
    }
    if (this.#slots?.path !== path) this.#slots = { path, slots: warpRingSlots(path) };
    const { slots } = this.#slots;
    for (let slot = 0; slot < WARP_SLOT_COUNT; slot++) this.#project(slot, slots[slot], WARP_TEMPLATES[templates[slot]], camera);
    const pixels = this.pixels;
    pixels.fill(0);
    const plot = (x: number, y: number, colour: number): void => {
      if (x < 0 || x >= WARP_IMAGE_WIDTH || y < 0 || y >= WARP_IMAGE_HEIGHT) return;
      const offset = (y * WARP_IMAGE_WIDTH + x) * 4;
      pixels[offset] = colour >> 16;
      pixels[offset + 1] = (colour >> 8) & 0xff;
      pixels[offset + 2] = colour & 0xff;
      pixels[offset + 3] = 0xff;
    };
    const screen = this.#screen;
    let edge = 0;
    for (let slot = WARP_SLOT_COUNT - 1; slot >= 1; slot--) {
      const level = warpRampLevel(squaredDistance(slots[slot].position, camera.position));
      const centre = WARP_CENTRE_COLOURS[level];
      const rim = WARP_EDGE_COLOURS[level];
      const ring = slot * WARP_RING_POINTS;
      const edgeSlot = SLOT_PARAMETERS[slot].t === 0;
      for (let j = 0; j < WARP_RING_POINTS; j++) {
        const a = 2 * (ring + j);
        if (edgeSlot && edges[edge++]) {
          const b = 2 * (ring + (j === 0 ? WARP_RING_POINTS - 1 : j - 1));
          drawWarpLine(screen[b], screen[b + 1], screen[a], screen[a + 1], centre, rim, plot);
        }
        const c = a - 2 * WARP_RING_POINTS;
        if (!(screen[a] < 0 && screen[c] < 0)) drawWarpLine(screen[a], screen[a + 1], screen[c], screen[c + 1], centre, rim, plot);
      }
    }
  }

  /**
   * `0x514e4` for slot `index`: Qⱼ = F(P + F(D(D(y·R1 + x·R0) + z·R2))) per component (`0x56e34`), then `0x51544`:
   * v = M·(Q − C) with row 0 on the unrounded differences and rows 1 and 2 on their f32 stores (`0x56dc0`); when 0 < v.z
   * fails, x := −1 and y is kept; otherwise x = chop(v.x × 800 ÷ v.z) + 320 and y = chop(v.y × −800 ÷ v.z) + 158.
   */
  #project(index: number, { position: p, orientation: r }: WarpPathPose, template: readonly Vec3[], { position: c, rows: m }: CameraPose): void {
    for (let j = 0; j < WARP_RING_POINTS; j++) {
      const { x, y, z } = template[j];
      const qx = Math.fround(p.x + Math.fround(y * r[3] + x * r[0] + z * r[6]));
      const qy = Math.fround(p.y + Math.fround(y * r[4] + x * r[1] + z * r[7]));
      const qz = Math.fround(p.z + Math.fround(y * r[5] + x * r[2] + z * r[8]));
      const dx = qx - c.x;
      const dy = qy - c.y;
      const dz = qz - c.z;
      const fx = Math.fround(dx);
      const fy = Math.fround(dy);
      const fz = Math.fround(dz);
      const vx = Math.fround(dy * m[1] + dx * m[0] + dz * m[2]);
      const vy = Math.fround(fy * m[4] + fx * m[3] + fz * m[5]);
      const vz = Math.fround(fy * m[7] + fx * m[6] + fz * m[8]);
      const entry = 2 * (index * WARP_RING_POINTS + j);
      if (0 < vz) {
        this.#screen[entry] = chop((vx * PROJECTION_SCALE) / vz) + CENTRE_X;
        this.#screen[entry + 1] = chop((vy * -PROJECTION_SCALE) / vz) + CENTRE_Y;
      } else {
        this.#screen[entry] = BEHIND;
      }
    }
  }
}
