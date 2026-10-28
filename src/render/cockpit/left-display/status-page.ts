/**
 * Left page 0, the status display `0x4d0e0` (docs/plan/p3/13/spec.md, 左显示屏 页 0 and D-01 定稿 DC-06;
 * docs/original/formats/hud.md §4.4 and DIAG 10489).
 *
 * - **Picture (`0x4d50c`, DC-06):** a 96 × 100 off-screen picture, recomposed only when Core's
 *   `statusDisplay.rebuilds` differs from the last value seen (none at first). `observe` runs every tick: a change
 *   captures that tick's shield and fields 0–8 with the phase of the write, which is the previous tick's `blink`
 *   (tick 0's for tick 1), because Core writes before it flips (CK-01). The next page-0 call composes it: background
 *   MFDD list 0 record 0/1/2 by (shield << 8) ÷ c5C, opaque; then the overlays of fields 1, 0, 2, …, 8 with colour key
 *   0, state 2 always, state 1 when (i & 1) equals the phase. Core owns the phase, the fields and the blink timer.
 * - **Call:** without a player nothing happens. Otherwise compose a pending picture, make each released line's next
 *   message, and when composed, a line is due or the call is forced: copy 97 columns × 96 rows of the picture opaque
 *   to (x0, y0 + 1), draw row y0 in index 0 and step-and-draw the upper line at (x0 + 4, y0 + 5) and the lower at
 *   (x0 + 4, y1 − 20), fonts/1. Publish the rectangle when composed or due and not forced. Then release each line
 *   typed out and past its hold end.
 * - **Messages:** upper (colour 8, DIAG upper timing) cycles formats 0–3: 100 × shield ÷ c5C; max(0, 100 × hull ÷
 *   c9C); the rating text of the summed 19 field states (the last rating whose maximum is not below the sum; when the
 *   sum exceeds every maximum, format 2 itself is the argument); the raw energy. Lower (DIAG lower timing): while
 *   start-up messages exist, one rand per message, low byte < 0x55 shows the next start-up message (colour 0xC);
 *   otherwise subsystem 0–14 in turn, its name and the word of its state through the subsystem format (colour 0xF).
 *   The cycle indices persist for the run (Δ-04); the view rebuild `0x4cd68` releases both lines (`releaseLines`).
 */
import type { CombatPlayer, Projection } from '../../../core/projections/projection.ts';
import type { InclusiveRectangle } from '../../../content/hud/instruments-payload.ts';
import type { CockpitDrawContext } from '../presentation/cockpit-contract.ts';
import { COCKPIT_LIMITS, PresentationError } from '../presentation/cockpit-limits.ts';
import { blit, createIndexedSurface, drawLine, type IndexedSurface } from '../raster/indexed-surface.ts';
import { formatText } from '../raster/text-format.ts';
import { DiagLine, type DiagLineState } from './diag-line.ts';
import { STATUS_OVERLAY_FIELDS, type LeftDisplayAssets } from './left-display-content.ts';
import { blitColumns, idiv } from './left-display-raster.ts';

/** Palette indices of `0x4d308` and `0x4d44c` (hud §4.4; one colour each on the 48 page-0 captures). */
export const STATUS_COLOURS = Object.freeze({ upper: 0x08, startup: 0x0c, subsystem: 0x0f });

/** Text positions from the HI parameter block: x0 + 4, y0 + 5 and y1 − 20. */
const TEXT_X = 4;
const UPPER_Y = 5;
const LOWER_FROM_BOTTOM = 20;
/** The copy to B reads 97 columns and 96 rows of the picture (the 97th is the next row's first pixel). */
const COPY = Object.freeze({ x0: 0, y0: 0, x1: 96, y1: 95 });
const UPPER_FORMATS = 4;
/** Subsystems the lower line cycles. */
const LOWER_SUBSYSTEMS = 15;
const STARTUP_THRESHOLD = 0x55;

interface Composition {
  readonly shield: { readonly current: number; readonly maximum: number };
  readonly fields: readonly number[];
  readonly blink: 0 | 1;
}

/** The read-only state of the status page. */
export interface StatusPageState {
  readonly pending: boolean;
  readonly seenRebuilds: number | null;
  readonly blink: 0 | 1;
  readonly upper: DiagLineState | null;
  readonly lower: DiagLineState | null;
  readonly upperIndex: number;
  readonly lowerIndex: number;
  readonly startupIndex: number;
}

function invariant(path: string, reason: string): never {
  throw new PresentationError('invariant-violated', `leftDisplay.status.${path}`, reason);
}

export class StatusPage {
  readonly #assets: LeftDisplayAssets;
  readonly #picture: IndexedSurface;
  #pending: Composition | null = null;
  #seenRebuilds: number | null = null;
  /** The previous tick's `blink`. */
  #blink: 0 | 1;
  #upper: DiagLine | null = null;
  #lower: DiagLine | null = null;
  #upperIndex = 0;
  #lowerIndex = 0;
  #startupIndex = 0;

  constructor(assets: LeftDisplayAssets, initial: Projection) {
    this.#assets = assets;
    const { width, height } = COCKPIT_LIMITS.statusPicture;
    this.#picture = createIndexedSurface(width, height);
    this.#blink = initial.flight.combat.readiness === 'ready' ? initial.flight.combat.player?.statusDisplay.blink ?? 0 : 0;
  }

  /** Every tick: captures a Core write of fields 1, 5 and 8 for the next composition. */
  observe(player: CombatPlayer | null): void {
    if (player === null) return;
    const { blink, rebuilds } = player.statusDisplay;
    if (rebuilds !== this.#seenRebuilds) {
      this.#pending = { shield: player.resources.shield, fields: player.subsystems.slice(0, STATUS_OVERLAY_FIELDS), blink: this.#blink };
      this.#seenRebuilds = rebuilds;
    }
    this.#blink = blink;
  }

  /** `0x4cd68`: both current messages are released; the cycle indices stay. */
  releaseLines(): void {
    this.#upper = null;
    this.#lower = null;
  }

  draw(context: CockpitDrawContext, rect: InclusiveRectangle, forced: boolean): void {
    const player = context.projection.flight.combat.player;
    if (player === null) return;
    const composed = this.#pending !== null;
    if (this.#pending !== null) this.#compose(this.#pending);
    this.#pending = null;
    this.#upper ??= this.#upperMessage(player);
    this.#lower ??= this.#lowerMessage(player, context);
    const { clock, back } = context;
    const due = this.#upper.due(clock) || this.#lower.due(clock);
    if (forced || composed || due) {
      const { x0, y0, x1, y1 } = rect;
      blit(back, this.#picture, x0, y0 + 1, 'opaque', COPY);
      drawLine(back, x0, y0, x1, y0, 0);
      this.#upper.stepAndDraw(back, this.#assets.small, x0 + TEXT_X, y0 + UPPER_Y, clock);
      this.#lower.stepAndDraw(back, this.#assets.small, x0 + TEXT_X, y1 - LOWER_FROM_BOTTOM, clock);
    }
    if ((composed || due) && !forced) context.publish(rect);
    if (this.#upper.finished(clock)) this.#upper = null;
    if (this.#lower.finished(clock)) this.#lower = null;
  }

  state(): StatusPageState {
    return Object.freeze({
      pending: this.#pending !== null, seenRebuilds: this.#seenRebuilds, blink: this.#blink, upper: this.#upper?.state() ?? null,
      lower: this.#lower?.state() ?? null, upperIndex: this.#upperIndex, lowerIndex: this.#lowerIndex, startupIndex: this.#startupIndex,
    });
  }

  /** `0x4d50c`, drawing only (Core wrote the fields). */
  #compose({ shield, fields, blink }: Composition): void {
    const { statusBackgrounds, statusOverlays } = this.#assets;
    if (shield.maximum === 0) invariant('shield', 'needs a non-zero full scale c5C');
    const ratio = idiv(shield.current << 8, shield.maximum);
    const background = ratio >= 0xe6 ? 0 : ratio >= 0xc0 ? blink : ratio >= 0x80 ? 1 : ratio >= 0x40 ? 1 + blink : 2;
    blitColumns(this.#picture, statusBackgrounds[background], 0, 0, 'opaque');
    for (const field of [1, 0, 2, 3, 4, 5, 6, 7, 8]) {
      const state = fields[field];
      if (state === 2 || (state === 1 && (field & 1) === blink)) blitColumns(this.#picture, statusOverlays[field], 0, 0, 'key');
    }
  }

  /** `0x4d308`. */
  #upperMessage(player: CombatPlayer): DiagLine {
    const { statusFormats, ratings, upper } = this.#assets.statusMessages;
    if (this.#upperIndex >= UPPER_FORMATS) this.#upperIndex = 0;
    const index = this.#upperIndex;
    const { shield, hull, energy } = player.resources;
    let argument: number | string;
    if (index === 0) argument = percent(shield, 'shield');
    else if (index === 1) argument = Math.max(0, percent(hull, 'hull'));
    else if (index === 2) {
      const sum = player.subsystems.reduce<number>((total, state) => total + state, 0);
      const rating = ratings.findLast(({ maximum }) => sum <= maximum);
      argument = rating?.text ?? statusFormats[2];
    } else argument = energy.current;
    const text = formatText(statusFormats[index], [argument], COCKPIT_LIMITS.diagBytes, 'leftDisplay.status.upper');
    this.#upperIndex++;
    return new DiagLine(text, STATUS_COLOURS.upper, upper);
  }

  /** `0x4d44c`. */
  #lowerMessage(player: CombatPlayer, context: CockpitDrawContext): DiagLine {
    const { startupMessages, subsystemNames, stateWords, subsystemFormat, lower } = this.#assets.statusMessages;
    if (startupMessages.length > 0 && (context.random.next() & 0xff) < STARTUP_THRESHOLD) {
      if (this.#startupIndex >= startupMessages.length) this.#startupIndex = 0;
      return new DiagLine(startupMessages[this.#startupIndex++], STATUS_COLOURS.startup, lower);
    }
    if (this.#lowerIndex >= LOWER_SUBSYSTEMS) this.#lowerIndex = 0;
    const state = player.subsystems[this.#lowerIndex];
    // The original would read past the three state words (no writer of 3 is known, hud DIAG 10489).
    if (state > 2) invariant(`subsystems[${this.#lowerIndex}]`, 'must be 0 to 2 for its state word');
    const text = formatText(subsystemFormat, [subsystemNames[this.#lowerIndex], stateWords[state]], COCKPIT_LIMITS.diagBytes, 'leftDisplay.status.lower');
    this.#lowerIndex++;
    return new DiagLine(text, STATUS_COLOURS.subsystem, lower);
  }
}

/** 100 × value ÷ full scale, i32 multiply and truncating division. */
function percent({ current, maximum }: { readonly current: number; readonly maximum: number }, name: string): number {
  if (maximum === 0) invariant(name, 'needs a non-zero full scale');
  return idiv(Math.imul(100, current), maximum);
}
