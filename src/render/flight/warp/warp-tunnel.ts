/**
 * The Warp effect's per-pass state (docs/plan/p3/12/spec.md, Warp 隧道效果, 技术决定 1, 5, 7; docs/original/formats/
 * executable.md, WT3, WT4, WT9; AC-15): what the original advances in each render pass of view mode 1, advanced here
 * once per successful Core tick from that tick's Render State, never on a display frame without a tick. It reads only
 * the Render State's view and `warp` serial, and draws from the presentation random source it is given.
 *
 * - **Start (new serial):** 40 template picks, rand % 50 for slots 0–39 in order (WT3 step 1); the template cursor and,
 *   in the image, the projection scratch are reset (06's recommended contract: the original carries both over from the
 *   previous Warp, which is statistically indistinguishable for the cursor, since the picks are independent draws).
 * - **Each tick in Warp:** the pass's templates pick[(k₀ + i) mod 40] at the cursor k₀; then the 60 ring-edge draws,
 *   rand % 10 < 5, for slots 30, 20 and 10, edges 0–19 each (WT4 step 4); then the cursor := (k₀ + 1) mod 40, so the ring
 *   shapes move one slot towards the viewer per tick (step 5). The tick that starts a Warp makes its first pass.
 * - **Stop:** a tick outside view 1 or without `warp` ends the pass at once: nothing is drawn or drawn from.
 *
 * The geometry does not depend on the progress, n, u or L (WT4 step 2); the start and end-of-Warp flashes are the
 * screen flash's (P3-12/21).
 */
import type { RenderState } from '../../../core/projections/render-state.ts';
import type { RandSource } from '../../../core/rules/original-random.ts';
import { WARP_VIEW_MODE } from '../../../core/systems/view-switch.ts';
import { FlightRenderError } from '../renderer/flight-render-error.ts';
import { WARP_EDGE_DRAWS, WARP_SLOT_COUNT } from './warp-tunnel-image.ts';
import { WARP_TEMPLATE_COUNT } from './warp-templates.ts';

/** A ring edge is drawn when rand % 10 < 5: with probability 16385/32768. */
const EDGE_MODULUS = 10;
const EDGE_BELOW = 5;

/** One tick's pass of the effect. */
export interface WarpTunnelPass {
  readonly tick: number;
  readonly serial: number;
  /** Slot i's template index into `WARP_TEMPLATES`. */
  readonly templates: readonly number[];
  /** The ring-edge draws in drawing order (`WARP_EDGE_SLOTS`, edges 0–19 each): the edge is drawn when true. */
  readonly edges: readonly boolean[];
}

export class WarpTunnel {
  readonly #random: RandSource;
  #tick: number | null = null;
  #picks: readonly number[] = [];
  #cursor = 0;
  #pass: WarpTunnelPass | null = null;

  constructor(random: RandSource) {
    this.#random = random;
  }

  /** The latest tick's pass, or null when that tick was not in a Warp (or before the first tick). */
  get pass(): WarpTunnelPass | null {
    return this.#pass;
  }

  /** Advances by one successful Core tick, given that tick's Render State; ticks must increase. */
  step(state: RenderState): void {
    if (this.#tick !== null && !(state.tick > this.#tick)) {
      throw new FlightRenderError('invalid-state', 'warpTunnel.step', `steps tick ${state.tick} after tick ${this.#tick}`);
    }
    this.#tick = state.tick;
    const warp = state.viewMode === WARP_VIEW_MODE ? state.warp : null;
    if (warp === null) {
      this.#pass = null;
      return;
    }
    if (warp.serial !== this.#pass?.serial) {
      this.#picks = Object.freeze(Array.from({ length: WARP_SLOT_COUNT }, () => this.#random.next() % WARP_TEMPLATE_COUNT));
      this.#cursor = 0;
    }
    const first = this.#cursor;
    const templates = Object.freeze(Array.from({ length: WARP_SLOT_COUNT }, (_, slot) => this.#picks[(first + slot) % WARP_SLOT_COUNT]));
    const edges = Object.freeze(Array.from({ length: WARP_EDGE_DRAWS }, () => this.#random.next() % EDGE_MODULUS < EDGE_BELOW));
    this.#cursor = (first + 1) % WARP_SLOT_COUNT;
    this.#pass = Object.freeze({ tick: state.tick, serial: warp.serial, templates, edges });
  }
}
