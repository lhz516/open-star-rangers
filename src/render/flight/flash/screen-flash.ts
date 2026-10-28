/**
 * The screen flashes of one run (docs/plan/p3/12/spec.md, 爆炸精灵与屏幕闪光; docs/original/formats/executable.md, SF1–SF5,
 * WT3, WT4, WT7, HS1; S-10, AC-14). GPU-free: it steps once per successful Core tick, in the order the original's
 * dispatcher and the following frame render touch its one global flash state, and gives the palette table and the
 * screen offset that the screen stage (flash-screen-stage.ts) applies to the whole game image. No tick, no change: a
 * paused or held run keeps its flash where it stopped.
 *
 * One tick:
 * 1. **Dispatcher:** a view switch selects a cockpit layout, which installs that layout's palette (cockpit.md, Palette):
 *    the shown table becomes 0 until an update writes one. A `warp-started` starts flash 2 (WT3).
 * 2. **Update `0x48e6c`,** in views 1, 8 and 0xC–0x12 only (SF3): the flash ends at the first update whose elapsed
 *    time exceeds its duration, writing level 0 and offset 0; otherwise it draws r = rand AND mask when the sample is
 *    past the next draw (unsigned, strict; the next draw is then sample + interval), else r = −1, and writes level
 *    chop((duration − e) ÷ duration × levelMax). Level L shows table L SAR 1; an r ≥ 0 sets the global offset, r = −1
 *    keeps it (SF4).
 * 3. **Render starts,** after the update: in view 1 a `warp-wall-contact` starts flash 0 (WT7); with the player's
 *    entity present, the tick's flash-check requests start flash 1, then a `hit` on the player outside view 0x11
 *    starts flash 0 (HS1; a parked engagement posts no hit item); in view 1, D(D(n + u) ÷ L) > 0.95 starts flash 2
 *    (WT4). Every start replaces the whole state with the latest flash, weaker or not, and touches neither the palette
 *    nor the offset (SF1, SF4).
 *
 * Flash checks run in request handling and projectile and collision hits in the later movement and collision stages,
 * hence that order; a missile blast's hits also come from request handling, where their order relative to a flash
 * check of the same tick is not modelled (only a tick's last start matters).
 *
 * The run's flash records must keep the original inside its 32 tables and away from a level computed from 0 ÷ 0:
 * levels 0–63 and a non-zero duration; other values are refused before the run starts.
 */
import type { ScreenFlash as ScreenFlashRecord } from '../../../content/flight/flight-data-content.ts';
import type { DomainEvent } from '../../../core/contracts/domain-events.ts';
import type { RenderState, RenderWarp } from '../../../core/projections/render-state.ts';
import type { RandSource } from '../../../core/rules/original-random.ts';
import type { ExplosionFlashRequest } from '../presentation/effects/presentation-effects.ts';
import { MAP_VIEW_MODE, WARP_VIEW_MODE } from '../../../core/systems/view-switch.ts';
import { DESTRUCTION_VIEW_MODE } from '../presentation/presentation-camera.ts';
import { FlightRenderError } from '../renderer/flight-render-error.ts';
import { isSpriteView } from '../sprites/sprite-rules.ts';

export type FlashNumber = 0 | 1 | 2;

/** The 1/64-s mission clock: t = F(sample ÷ 64) seconds (SF5). */
const CLOCK_UNITS_PER_SECOND = 64;
/** The end of a Warp, f64 `0x171f7c`, compared strictly (WT4). */
const WARP_END_PROGRESS = 0.95;
/** The largest level whose table, level SAR 1, is one of the 32 tables (SF4). */
export const MAX_FLASH_LEVEL = 63;

const PATH = 'flash';

/** One successful tick, as the Runtime reported it, with the presentation effects' flash-check requests of that tick. */
export interface ScreenFlashTick {
  readonly tick: number;
  readonly clock: number;
  /** The tick's Render State: the view the tick's frame render ran in. */
  readonly render: RenderState;
  readonly events: readonly DomainEvent[];
  /** `FlightPresentationEffects.flashRequests(tick)`. */
  readonly explosionFlashes: readonly ExplosionFlashRequest[];
}

/** What the updates last wrote, for the whole game image. */
export interface ScreenFlashScreen {
  /** The running flash, null when none runs. */
  readonly active: FlashNumber | null;
  /** The level last written, 0 without a flash. */
  readonly level: number;
  /** The palette table shown: every 6-bit component v shows as min(v + 2 × table, 63). */
  readonly table: number;
  /** The global offset r last written, 0 at the start. */
  readonly offset: number;
  /** The whole game image moves up (offset AND 0xFFFE) ÷ 2 logical rows (SF4, HI). */
  readonly shiftRows: number;
}

export interface ScreenFlashes {
  /** Steps one tick; ticks follow each other from the first one stepped. */
  step(tick: ScreenFlashTick): void;
  screen(): ScreenFlashScreen;
}

export interface ScreenFlashInput {
  /** `data/scene-settings.screenFlashes`: flashes 0, 1 and 2. */
  readonly records: readonly ScreenFlashRecord[];
  /** The run's presentation random source, never the world's. */
  readonly random: RandSource;
}

interface RunningFlash {
  readonly number: FlashNumber;
  readonly record: ScreenFlashRecord;
  /** f32 seconds. */
  readonly start: number;
  /** The u32 sample after which the next random draw happens. */
  next: number;
}

/** Views whose frame render calls the update (SF3): Warp, the map and the views that also draw sprites. */
const hasUpdate = (viewMode: number): boolean => viewMode === WARP_VIEW_MODE || viewMode === MAP_VIEW_MODE || isSpriteView(viewMode);

/** The end-of-Warp window: n, u and L are f32, summed and divided in double before the strict compare (WT4). */
export const inWarpEndWindow = ({ segments, fraction, length }: RenderWarp): boolean => (segments + fraction) / length > WARP_END_PROGRESS;

const isU32 = (value: number): boolean => Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff;

/** Refuses flash records outside the domain the original's tables and level formula support (see the module comment). */
export function checkFlashRecords(records: readonly ScreenFlashRecord[]): void {
  if (!Array.isArray(records) || records.length !== 3) throw new FlightRenderError('invalid-input', `${PATH}.screenFlashes`, 'must hold three flashes');
  records.forEach(({ randomMask, duration, drawIntervalTicks, level }, at) => {
    const path = `${PATH}.screenFlashes[${at}]`;
    if (!isU32(randomMask)) throw new FlightRenderError('invalid-input', `${path}.randomMask`, 'must be a u32');
    if (!isU32(drawIntervalTicks)) throw new FlightRenderError('invalid-input', `${path}.drawIntervalTicks`, 'must be a u32');
    if (!Number.isFinite(duration) || duration === 0) throw new FlightRenderError('invalid-input', `${path}.duration`, 'must be finite and not zero');
    if (!Number.isInteger(level) || level < 0 || level > MAX_FLASH_LEVEL) throw new FlightRenderError('invalid-input', `${path}.level`, `must be an integer from 0 to ${MAX_FLASH_LEVEL}`);
  });
}

class Flashes implements ScreenFlashes {
  readonly #records: readonly ScreenFlashRecord[];
  readonly #random: RandSource;
  #running: RunningFlash | null = null;
  #level = 0;
  #table = 0;
  #offset = 0;
  #tick: number | null = null;
  #screen: ScreenFlashScreen | null = null;

  constructor({ records, random }: ScreenFlashInput) {
    checkFlashRecords(records);
    if (typeof random?.next !== 'function') throw new FlightRenderError('invalid-input', `${PATH}.random`, 'needs a random source');
    this.#records = records;
    this.#random = random;
  }

  step({ tick, clock, render, events, explosionFlashes }: ScreenFlashTick): void {
    if (!Number.isSafeInteger(tick) || (this.#tick !== null && tick !== this.#tick + 1)) {
      throw new FlightRenderError('invalid-input', `${PATH}.step`, `must follow tick ${this.#tick}, not tick ${tick}`);
    }
    if (!Number.isSafeInteger(clock) || clock < 0) throw new FlightRenderError('invalid-input', `${PATH}.step.clock`, 'must be a non-negative safe integer');
    this.#tick = tick;
    this.#screen = null;
    const t = Math.fround(clock / CLOCK_UNITS_PER_SECOND);

    const { viewMode, observedEntityId: player, warp } = render;
    let wallContact = false;
    let playerHit = false;
    for (const event of events) {
      if (event.type === 'view-switched' && event.viewMode !== event.fromViewMode) this.#table = 0;
      else if (event.type === 'warp-started') this.#start(2, t);
      else if (event.type === 'warp-wall-contact') wallContact = true;
      else if (event.type === 'hit' && event.victimEntityId === player && event.cause !== 'parked') playerHit = true;
    }

    if (hasUpdate(viewMode)) this.#update(clock, t);

    if (viewMode === WARP_VIEW_MODE && wallContact) this.#start(0, t);
    if (player !== null && explosionFlashes.length > 0) this.#start(1, t);
    if (playerHit && viewMode !== DESTRUCTION_VIEW_MODE) this.#start(0, t);
    if (viewMode === WARP_VIEW_MODE && warp !== null && inWarpEndWindow(warp)) this.#start(2, t);
  }

  screen(): ScreenFlashScreen {
    this.#screen ??= Object.freeze({
      active: this.#running?.number ?? null, level: this.#level, table: this.#table, offset: this.#offset, shiftRows: (this.#offset & 0xfffe) / 2,
    });
    return this.#screen;
  }

  /** `0x48d64`, `0x48dbc`, `0x48e14` (SF1). */
  #start(number: FlashNumber, start: number): void {
    this.#running = { number, record: this.#records[number], start, next: 0 };
  }

  /** `0x48e6c` (SF3). */
  #update(clock: number, t: number): void {
    const flash = this.#running;
    if (flash === null) return;
    const { randomMask, duration, drawIntervalTicks, level } = flash.record;
    const elapsed = t - flash.start;
    if (elapsed > duration) {
      this.#running = null;
      this.#write(0, 0);
      return;
    }
    let r = -1;
    const sample = clock >>> 0;
    if (sample > flash.next) {
      r = this.#random.next() & randomMask;
      flash.next = (sample + drawIntervalTicks) >>> 0;
    }
    const e = Math.fround(elapsed);
    // chop; the level stays within ±64, so `| 0` also makes a −0 a 0.
    this.#write(Math.trunc(((duration - e) / duration) * level) | 0, r);
  }

  /** `0x48f14(level, r)` (SF4). */
  #write(level: number, r: number): void {
    this.#level = level;
    this.#table = level >> 1;
    if (r >= 0) this.#offset = r;
  }
}

export function createScreenFlashes(input: ScreenFlashInput): ScreenFlashes {
  return new Flashes(input);
}
