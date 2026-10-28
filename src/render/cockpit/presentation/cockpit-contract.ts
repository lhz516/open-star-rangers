/**
 * The composition contract of the cockpit presentation (docs/plan/p3/13/spec.md, 驾驶舱表现模型与时间, 驾驶舱表现层契约
 * and D-01 定稿 DC-04/DC-05): the closed per-frame input, the per-tick contexts, and the hooks through which each
 * instrument module (gauges, radar, frame, left display, messages, Warp display, target display, overlay, map picture)
 * joins one run's presentation. A module keeps its own state and exposes its own read-only queries; the presentation
 * owns the order of the hooks, the layout select, the due decisions, the random stream and the two surfaces.
 *
 * Per tick, in this order (DC-04): ① each event in emission order, the layout select of a `view-switched` event first,
 * then every module's `beforeDraw`; ② every module's `prepare`; ③ one logical display of the selected layout (see
 * `CockpitModule`); ④ each event in order through every module's `afterDraw`. Modules are called in registration
 * order, which is also the order of the global callbacks (the original registers types 8, 6, 9 and 12 in that order).
 * Nothing here enters Core, a snapshot or a replay.
 */
import type { CockpitInstruments, ElementSchedule, InstrumentRecord, InstrumentSlot, InstrumentType } from '../../../content/hud/instruments-payload.ts';
import type { DomainEvent } from '../../../core/contracts/domain-events.ts';
import type { CombatReady, CommunicationsProjection, MapReady, MotionReady, Projection } from '../../../core/projections/projection.ts';
import type { RenderState } from '../../../core/projections/render-state.ts';
import type { RandSource } from '../../../core/rules/original-random.ts';
import type { PresentationCamera } from '../../flight/presentation/presentation-contract.ts';
import type { IndexedSurface, PixelRect } from '../raster/indexed-surface.ts';

/** One event of a tick as the Event Bus delivered it; P3-04's `TickEvent` fits. */
export interface CockpitTickEvent {
  readonly event: DomainEvent;
}

/** One successful tick of a frame (P3-04 `TickOutput`, which fits structurally). */
export interface CockpitTickOutput {
  readonly tick: number;
  readonly clock: number;
  readonly render: RenderState;
  readonly projection: Projection;
  readonly events: readonly CockpitTickEvent[];
}

/** DC-04: one tick's input. */
export interface CockpitTick {
  readonly output: CockpitTickOutput;
  /** P3-12's camera after the same tick's step. */
  readonly camera: PresentationCamera;
  /** The map's right-button level for this tick (DC-09). */
  readonly mapRightButton: boolean;
}

/** DC-04: one frame's successful ticks, 0 to `COCKPIT_LIMITS.ticksPerAdvance`, for one owner and run. */
export interface CockpitAdvance {
  readonly ownerId: number;
  readonly runId: number;
  readonly ticks: readonly CockpitTick[];
}

/** The run's tick-0 state the presentation starts from; nothing is advanced for it. */
export interface CockpitInitial {
  readonly render: RenderState;
  readonly projection: Projection;
  readonly camera: PresentationCamera;
}

/** A projection whose partitions the cockpit reads are ready (DC-04 rejects every other). */
export type CockpitProjection = Projection & {
  readonly flight: { readonly motion: MotionReady; readonly combat: CombatReady };
  readonly map: MapReady;
  readonly communications: CommunicationsProjection;
};

/**
 * What a view mode shows of the cockpit (spec, 视角与绘制内容): `flight` 0xC and `warp` 1 (slot 0), `map` 8 (slot 2),
 * `external` 0x11 (slot 7; the slice reaches only sub-mode 8, the destruction view), `base` 6 (no cockpit picture; only
 * the global callbacks run), `none` for every other view (no call at all, as in 0x13).
 */
export type CockpitView = 'flight' | 'warp' | 'map' | 'external' | 'base' | 'none';

/** Inclusive rows of the 640 × 480 screen. */
export interface RowRange {
  readonly top: number;
  readonly bottom: number;
}

/** The selected layout and how its picture is shown (DC-05). */
export interface CockpitLayout {
  /** The view mode the last layout select chose for. */
  readonly viewMode: number;
  readonly view: CockpitView;
  /** The content slot of the view's layout number; null for `base` and `none`. */
  readonly slot: InstrumentSlot | null;
  /** `flight` is `palette/flight/cockpit-hud-map`, `map` the slot-2 group palette `palette/map/screen`. */
  readonly palette: 'flight' | 'map' | null;
  /** Rows of the screen surface S the cockpit layer shows opaque: the band 316–479, or the whole map screen. */
  readonly screenRows: RowRange | null;
  /** World rows where only the covered pixels of the back surface B show over P3-12's world. */
  readonly worldRows: RowRange | null;
}

/** The two indexed surfaces (DC-05); read-only outside the presentation's hooks. */
export interface CockpitSurfaces {
  /** B, the original's frame buffer: handlers, elements and the overlay draw here; its coverage marks 2-D pixels. */
  readonly back: IndexedSurface;
  /** S, the original's video memory: changed only by the copies (publish, element copies, frame-end copy, selects). */
  readonly screen: IndexedSurface;
}

/** Read-only state of a tick's hooks. `layout` and `fullRedraw` are live: a layout select during ① changes them. */
export interface CockpitTickContext {
  readonly tick: number;
  /** Mission clock units (u32 in the original; compare differences with `>>> 0`). */
  readonly clock: number;
  readonly clockUnitsPerTick: number;
  readonly render: RenderState;
  readonly projection: CockpitProjection;
  readonly camera: PresentationCamera;
  readonly mapRightButton: boolean;
  /** The tick's events in emission order. */
  readonly events: readonly DomainEvent[];
  /** The view mode at the end of the previous tick (tick 0's for tick 1). */
  readonly previousViewMode: number;
  readonly layout: CockpitLayout;
  /** The original's `0x175c70`: set by every layout select, cleared at the end of the next logical display. */
  readonly fullRedraw: boolean;
  readonly content: CockpitInstruments;
}

/** A tick context during ③, the only phase that may draw or draw random numbers. */
export interface CockpitDrawContext extends CockpitTickContext {
  /** The cockpit presentation stream; drawing outside a ③ hook is `invariant-violated`. */
  readonly random: RandSource;
  /** B. */
  readonly back: IndexedSurface;
  /** Copies the inclusive rectangle of B to S, clipped to the screen (`0x583fc`). */
  publish(rect: PixelRect): void;
  /** Copies columns x0–x1 of row y of B to S, clipped (row-segment copy `0x58578`). */
  publishRow(y: number, x0: number, x1: number): void;
}

/** The callbacks the original registers for one instrument type (`0x49db4`), called with each record of that type. */
export interface InstrumentHandler {
  /** When a layout select changes the slot to one holding the record (`0x49848`), in record order. */
  activate?(context: CockpitTickContext, record: InstrumentRecord): void;
  /** The per-frame pre-pass callback (`0x49a6c`), every logical display of views 0xC, 1 and 0x11, in record order. */
  prePass?(context: CockpitDrawContext, record: InstrumentRecord): void;
  /** The draw callback, when the record is due or the draw is forced (`0x49b2c`). */
  draw(context: CockpitDrawContext, record: InstrumentRecord): void;
}

/**
 * One instrument module; every hook is optional. ③, one logical display of the selected layout (DC-04/DC-05):
 *
 * 1. `warp` and `map`: B is filled with index 0 (`0x599e8`);
 * 2. `flight` and `external`: every `eraseOverlay` (`0x456e4`);
 * 3. `flight`, `warp` and `external`: each record's `prePass` (`0x49a6c`);
 * 4. `flight` and `external`: every `drawOverlay` (`0x45de0`);
 * 5. `0x49b2c` (also in `base`, which has no slot): every `global`; then, with a slot, the pass-0 elements, the due
 *    records in source order, the pass-1 elements; then the full redraw is cleared;
 * 6. the frame-end copy of B to S: rows 0–315 in `flight` and `warp`, the whole screen in `map` and `external`.
 *
 * `none` runs none of it.
 */
export interface CockpitModule {
  /** Names the module in error paths. */
  readonly name: string;
  /** Handlers by type; across all modules each type of every slot has exactly one. */
  readonly instruments?: { readonly [Type in InstrumentType]?: InstrumentHandler };
  /** ① One event, after the layout select a `view-switched` event makes. */
  beforeDraw?(context: CockpitTickContext, event: DomainEvent, index: number): void;
  /** ② Before the logical display, every tick (DC-09's map read call). */
  prepare?(context: CockpitTickContext): void;
  eraseOverlay?(context: CockpitDrawContext): void;
  drawOverlay?(context: CockpitDrawContext): void;
  /** A per-frame global callback of `0x1a23a0` (message expiry, page callback, type-9 warning, type-12 lamp). */
  global?(context: CockpitDrawContext): void;
  /**
   * Draws element `index` of the selected slot into B and returns its screen rectangle; called when it is drawn
   * (`everyFrame` or a full redraw, `0x49c98`). One module at most provides it, and one must when a slot has elements.
   */
  paintElement?(context: CockpitDrawContext, element: ElementSchedule, index: number): PixelRect;
  /** ④ One event, after the logical display (for example `incoming-started` entering the message queue). */
  afterDraw?(context: CockpitTickContext, event: DomainEvent, index: number): void;
  /** Called once by the presentation's dispose. */
  dispose?(): void;
}

/** A snapshot of the schedule after the last processed tick. */
export interface CockpitSchedule {
  readonly tick: number;
  readonly clock: number;
  readonly viewMode: number;
  readonly fullRedraw: boolean;
  /** Per content slot, in content order, each record's last draw sample (0 before its first draw). */
  readonly lastDraw: readonly (readonly number[])[];
  /** Numbers drawn from the cockpit presentation stream since the start. */
  readonly randomDraws: number;
}

export type CockpitStatus = 'ready' | 'failed' | 'disposed';

export interface CockpitPresentation {
  readonly ownerId: number;
  readonly runId: number;
  /** Never throws. */
  status(): CockpitStatus;
  layout(): CockpitLayout;
  /** The live surfaces; callers only read them. */
  surfaces(): CockpitSurfaces;
  schedule(): CockpitSchedule;
  /**
   * Validates the whole batch before any change or draw (`invalid-input`, model unchanged), then processes each tick.
   * A failure while processing latches `failed`; an empty batch changes nothing.
   */
  advance(batch: CockpitAdvance): void;
  /** Idempotent; disposes every module once and rejects every later use. */
  dispose(): void;
}
