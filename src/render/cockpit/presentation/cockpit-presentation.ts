/**
 * The cockpit presentation model (docs/plan/p3/13/spec.md, 驾驶舱表现模型与时间, 驾驶舱表现层契约, D-01 定稿
 * DC-04/DC-05/DC-08): one per run, free of DOM, GPU and the app layers.
 *
 * - **Start:** for one owner and run, from the checked instruments content, the modules, the tick-0 state and the run's
 *   host seed, from which the cockpit stream is derived (cockpit-random.ts). The flight initialisation's layout select
 *   (`0x49848`) runs for tick 0's view: B and S are filled with 0, the full redraw is set and the slot's records are
 *   activated. No tick is advanced and nothing is drawn.
 * - **Advance:** a frame's ticks, validated as a whole before any change (`invalid-input`, model unchanged): owner and
 *   run, at most five ticks continuing from the last processed one, each tick's output, Render State, projection and
 *   camera agreeing in tick, clock and view, the clock stepping by `clockUnitsPerTick`, the read partitions ready, and
 *   the view changing only through `view-switched` events (Core emits one for every view write, view-switch.ts), so
 *   each tick ends in its last event's view, or in the previous tick's without one. Then each tick runs ① to ④
 *   (cockpit-contract.ts). A failure while processing latches `failed`.
 * - **Layout select:** at every `view-switched` event during ①: it fills B and S with 0 and sets the full redraw, and
 *   activates the records when the slot changes (cockpit.md, full redraw).
 * - **Queries:** read the state after the last processed tick; they never draw or advance. A 0-tick batch, a repeated
 *   query or a redraw of the surfaces changes nothing.
 * - **Lifetime:** a retry or a new run creates a new instance. `dispose` is idempotent.
 */
import type { CockpitInstruments, InstrumentRecord, InstrumentSlot, InstrumentType } from '../../../content/hud/instruments-payload.ts';
import type { DomainEvent } from '../../../core/contracts/domain-events.ts';
import type { Projection } from '../../../core/projections/projection.ts';
import type { RandSource } from '../../../core/rules/original-random.ts';
import { clearRect, createIndexedSurface, type PixelRect } from '../raster/indexed-surface.ts';
import type {
  CockpitAdvance, CockpitDrawContext, CockpitInitial, CockpitLayout, CockpitModule, CockpitPresentation, CockpitProjection,
  CockpitSchedule, CockpitStatus, CockpitSurfaces, CockpitTick, CockpitTickContext, InstrumentHandler,
} from './cockpit-contract.ts';
import { clockExceeds, copyRect, frameEndRows, layoutOf } from './cockpit-layout.ts';
import { COCKPIT_LIMITS, PresentationError } from './cockpit-limits.ts';
import { cockpitRandom } from './cockpit-random.ts';

export interface CockpitPresentationInput {
  readonly ownerId: number;
  readonly runId: number;
  /** `data/hud/instruments`, read and cross-checked (readCockpitInstruments, checkCockpitInstruments). */
  readonly content: CockpitInstruments;
  /** In registration order. */
  readonly modules: readonly CockpitModule[];
  readonly initial: CockpitInitial;
  /** The run's uint32 host presentation seed. */
  readonly seed: number;
}

/** Everything one tick's hooks read. */
interface TickInput {
  readonly tick: number;
  readonly clock: number;
  readonly render: CockpitInitial['render'];
  readonly projection: CockpitProjection;
  readonly camera: CockpitInitial['camera'];
  readonly mapRightButton: boolean;
  readonly events: readonly DomainEvent[];
}

const PATH = 'cockpit';
const { width: WIDTH, height: HEIGHT } = COCKPIT_LIMITS.surface;

const isSafeCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

function invalidInput(path: string, reason: string): never {
  throw new PresentationError('invalid-input', `${PATH}.${path}`, reason);
}

function invariant(path: string, reason: string): never {
  throw new PresentationError('invariant-violated', `${PATH}.${path}`, reason);
}

/** Checks the read partitions are ready, which makes the projection a CockpitProjection. */
function requireReady(projection: Projection, path: string): CockpitProjection {
  const partitions = { 'flight.motion': projection.flight?.motion, 'flight.combat': projection.flight?.combat, map: projection.map, communications: projection.communications };
  for (const [name, partition] of Object.entries(partitions)) {
    if (partition?.readiness !== 'ready') invalidInput(`${path}.${name}`, 'must be ready');
  }
  return projection as CockpitProjection;
}

class Presentation implements CockpitPresentation {
  readonly ownerId: number;
  readonly runId: number;
  readonly #content: CockpitInstruments;
  readonly #modules: readonly CockpitModule[];
  readonly #handlers: ReadonlyMap<InstrumentType, InstrumentHandler>;
  readonly #painter: CockpitModule | null;
  readonly #stream: RandSource;
  /** The stream as the hooks see it: drawable only while `#drawing`. */
  readonly #random: RandSource;
  readonly #back = createIndexedSurface(WIDTH, HEIGHT, true);
  readonly #screen = createIndexedSurface(WIDTH, HEIGHT);
  readonly #surfaces: CockpitSurfaces;
  /** Per content slot, each record's last draw sample. */
  readonly #lastDraw: number[][];
  readonly #clockUnitsPerTick: number;
  #layout: CockpitLayout;
  #fullRedraw = false;
  #tick = 0;
  #clock: number;
  /** The view at the end of the last processed tick. */
  #viewMode: number;
  #subMode: number;
  #drawing = false;
  #draws = 0;
  #status: CockpitStatus = 'ready';

  constructor({ ownerId, runId, content, modules, initial, seed }: CockpitPresentationInput) {
    if (!isSafeCount(ownerId)) invalidInput('ownerId', 'must be a non-negative safe integer');
    if (!isSafeCount(runId)) invalidInput('runId', 'must be a non-negative safe integer');
    const { render, projection, camera } = initial;
    if (render?.tick !== 0 || projection?.clock?.tick !== 0 || camera?.tick !== 0) invalidInput('initial', 'must be tick 0 of the run');
    if (!isSafeCount(render.clock) || projection.clock.clock !== render.clock) invalidInput('initial.clock', 'must be one non-negative clock');
    const { clockUnitsPerTick } = projection.clock;
    if (!Number.isSafeInteger(clockUnitsPerTick) || clockUnitsPerTick <= 0) invalidInput('initial.projection.clock.clockUnitsPerTick', 'must be a positive integer');
    const ready = requireReady(projection, 'initial.projection');
    this.ownerId = ownerId;
    this.runId = runId;
    this.#content = content;
    this.#modules = Object.freeze([...modules]);
    this.#handlers = this.#registerHandlers();
    this.#painter = this.#registerPainter();
    this.#stream = cockpitRandom(seed);
    this.#random = Object.freeze({ next: () => this.#nextRandom() });
    this.#surfaces = Object.freeze({ back: this.#back, screen: this.#screen });
    this.#lastDraw = content.slots.map(({ instruments }) => instruments.map(() => 0));
    this.#clockUnitsPerTick = clockUnitsPerTick;
    this.#clock = render.clock;
    this.#viewMode = render.viewMode;
    this.#subMode = render.subMode;
    this.#layout = layoutOf(-1, content);
    const input: TickInput = { tick: 0, clock: render.clock, render, projection: ready, camera, mapRightButton: false, events: Object.freeze([]) };
    this.#select(render.viewMode, this.#context(input));
  }

  status(): CockpitStatus {
    return this.#status;
  }

  layout(): CockpitLayout {
    this.#require('layout');
    return this.#layout;
  }

  surfaces(): CockpitSurfaces {
    this.#require('surfaces');
    return this.#surfaces;
  }

  schedule(): CockpitSchedule {
    this.#require('schedule');
    return Object.freeze({
      tick: this.#tick,
      clock: this.#clock,
      viewMode: this.#viewMode,
      fullRedraw: this.#fullRedraw,
      lastDraw: Object.freeze(this.#lastDraw.map((slot) => Object.freeze([...slot]))),
      randomDraws: this.#draws,
    });
  }

  advance(batch: CockpitAdvance): void {
    this.#require('advance');
    const inputs = this.#check(batch);
    try {
      for (const input of inputs) this.#step(input);
    } catch (error) {
      this.#status = 'failed';
      this.#drawing = false;
      throw error;
    }
  }

  dispose(): void {
    if (this.#status === 'disposed') return;
    this.#status = 'disposed';
    const errors: unknown[] = [];
    for (const module of this.#modules) {
      try {
        module.dispose?.();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, 'cockpit modules failed to dispose');
  }

  #require(operation: string): void {
    if (this.#status !== 'ready') throw new PresentationError('invalid-state', `${PATH}.${operation}`, `is not allowed once the presentation is ${this.#status}`);
  }

  /** One handler per type of every slot, across all modules. */
  #registerHandlers(): Map<InstrumentType, InstrumentHandler> {
    const handlers = new Map<InstrumentType, InstrumentHandler>();
    this.#modules.forEach((module, at) => {
      if (!isObject(module) || typeof module.name !== 'string') invalidInput(`modules[${at}]`, 'must be a named module');
      for (const [key, handler] of Object.entries(module.instruments ?? {})) {
        const type = Number(key) as InstrumentType;
        if (handlers.has(type)) invalidInput(`modules.${module.name}.instruments.${key}`, 'registers a type another module handles');
        if (typeof handler?.draw !== 'function') invalidInput(`modules.${module.name}.instruments.${key}`, 'needs a draw callback');
        handlers.set(type, handler);
      }
    });
    for (const { slot, instruments } of this.#content.slots) {
      for (const { type } of instruments) if (!handlers.has(type)) invalidInput(`modules`, `handle no type ${type} of slot ${slot}`);
    }
    return handlers;
  }

  #registerPainter(): CockpitModule | null {
    const painters = this.#modules.filter((module) => typeof module.paintElement === 'function');
    if (painters.length > 1) invalidInput('modules', `may have one element painter, not ${painters.map(({ name }) => name).join(', ')}`);
    if (painters.length === 0 && this.#content.slots.some(({ elements }) => elements.length > 0)) invalidInput('modules', 'need an element painter');
    return painters[0] ?? null;
  }

  #nextRandom(): number {
    if (!this.#drawing) invariant('random', 'is drawn only by a draw routine of a logical display');
    this.#draws++;
    return this.#stream.next();
  }

  /** Validates the whole batch; returns each tick's input. */
  #check(batch: CockpitAdvance): TickInput[] {
    if (!isObject(batch)) invalidInput('batch', 'must be an object');
    const { ownerId, runId, ticks } = batch;
    if (ownerId !== this.ownerId || runId !== this.runId) invalidInput('batch', `belongs to owner ${ownerId}, run ${runId}, not owner ${this.ownerId}, run ${this.runId}`);
    if (!Array.isArray(ticks)) invalidInput('batch.ticks', 'must be an array');
    if (ticks.length > COCKPIT_LIMITS.ticksPerAdvance) invalidInput('batch.ticks', `must not exceed ${COCKPIT_LIMITS.ticksPerAdvance} ticks`);
    let tick = this.#tick;
    let clock = this.#clock;
    let view = { viewMode: this.#viewMode, subMode: this.#subMode };
    return ticks.map((item: CockpitTick, at) => {
      tick++;
      clock += this.#clockUnitsPerTick;
      const input = this.#checkTick(item, `batch.ticks[${at}]`, tick, clock, view);
      view = input.render;
      return input;
    });
  }

  /** `view` is where the previous tick ended. */
  #checkTick(item: CockpitTick, path: string, tick: number, clock: number, view: { readonly viewMode: number; readonly subMode: number }): TickInput {
    if (!isObject(item) || !isObject(item.output)) invalidInput(path, 'must hold a tick output');
    const { output: { tick: outputTick, clock: outputClock, render, projection, events }, camera, mapRightButton } = item;
    if (outputTick !== tick) invalidInput(`${path}.output.tick`, `must be ${tick}: ticks continue from the last processed one without a gap`);
    if (outputClock !== clock) invalidInput(`${path}.output.clock`, `must be ${clock}: the clock steps by ${this.#clockUnitsPerTick} units a tick`);
    if (!isObject(render) || render.tick !== tick || render.clock !== clock) invalidInput(`${path}.output.render`, 'must be the Render State of its tick');
    if (!isObject(projection) || !isObject(projection.clock) || projection.clock.tick !== tick || projection.clock.clock !== clock
      || projection.clock.clockUnitsPerTick !== this.#clockUnitsPerTick) invalidInput(`${path}.output.projection.clock`, 'must be the clock of its tick');
    if (projection.player?.viewMode !== render.viewMode || projection.player.subMode !== render.subMode) invalidInput(`${path}.output.projection.player`, 'must be in the view of its Render State');
    if (!isObject(camera) || camera.tick !== tick || camera.viewMode !== render.viewMode || camera.subMode !== render.subMode) invalidInput(`${path}.camera`, 'must be the camera after its tick');
    if (typeof mapRightButton !== 'boolean') invalidInput(`${path}.mapRightButton`, 'must be a boolean');
    if (!Array.isArray(events)) invalidInput(`${path}.output.events`, 'must be an array');
    if (events.length > COCKPIT_LIMITS.eventsPerTick) invalidInput(`${path}.output.events`, `must not exceed ${COCKPIT_LIMITS.eventsPerTick} events`);
    let end = view;
    const tickEvents = events.map((delivery: unknown, at) => {
      const event = isObject(delivery) ? delivery.event : undefined;
      if (!isObject(event) || typeof event.type !== 'string' || event.tick !== tick) invalidInput(`${path}.output.events[${at}]`, 'must be an event of its tick');
      if (event.type === 'view-switched') {
        if (!Number.isSafeInteger(event.viewMode) || !Number.isSafeInteger(event.subMode)) invalidInput(`${path}.output.events[${at}]`, 'must switch to integer modes');
        end = { viewMode: event.viewMode as number, subMode: event.subMode as number };
      }
      return event as unknown as DomainEvent;
    });
    if (end.viewMode !== render.viewMode || end.subMode !== render.subMode) invalidInput(`${path}.output.render`, 'must end in the view its view-switched events, or the previous tick, left');
    const ready = requireReady(projection, `${path}.output.projection`);
    return { tick, clock, render, projection: ready, camera, mapRightButton, events: Object.freeze(tickEvents) };
  }

  /** The context of one tick; `layout` and `fullRedraw` read the live state. */
  #context(input: TickInput): CockpitDrawContext {
    const layout = () => this.#layout;
    const fullRedraw = () => this.#fullRedraw;
    return Object.freeze({
      ...input,
      clockUnitsPerTick: this.#clockUnitsPerTick,
      previousViewMode: this.#viewMode,
      content: this.#content,
      get layout() {
        return layout();
      },
      get fullRedraw() {
        return fullRedraw();
      },
      random: this.#random,
      back: this.#back,
      publish: (rect: PixelRect) => this.#publish(rect),
      publishRow: (y: number, x0: number, x1: number) => this.#publish({ x0, y0: y, x1, y1: y }),
    });
  }

  #publish(rect: PixelRect): void {
    if (!this.#drawing) invariant('publish', 'is only allowed in a draw routine of a logical display');
    if (![rect.x0, rect.y0, rect.x1, rect.y1].every(Number.isSafeInteger)) invariant('publish', 'needs integer coordinates');
    copyRect(this.#back, this.#screen, rect);
  }

  #select(viewMode: number, context: CockpitTickContext): void {
    const next = layoutOf(viewMode, this.#content);
    const changed = next.slot !== this.#layout.slot;
    clearRect(this.#back, 0, 0, WIDTH - 1, HEIGHT - 1);
    this.#screen.indices.fill(0);
    this.#fullRedraw = true;
    this.#layout = next;
    if (!changed || next.slot === null) return;
    for (const record of next.slot.instruments) this.#handler(record).activate?.(context, record);
  }

  #handler(record: InstrumentRecord): InstrumentHandler {
    return this.#handlers.get(record.type) ?? invariant('instruments', `handle no type ${record.type}`);
  }

  #step(input: TickInput): void {
    const context = this.#context(input);
    const { events, render } = input;
    events.forEach((event, index) => {
      if (event.type === 'view-switched') this.#select(event.viewMode, context);
      for (const module of this.#modules) module.beforeDraw?.(context, event, index);
    });
    for (const module of this.#modules) module.prepare?.(context);
    this.#drawing = true;
    this.#display(context);
    this.#drawing = false;
    events.forEach((event, index) => {
      for (const module of this.#modules) module.afterDraw?.(context, event, index);
    });
    this.#tick = input.tick;
    this.#clock = input.clock;
    this.#viewMode = render.viewMode;
    this.#subMode = render.subMode;
  }

  /** ③: one logical display of the selected layout (cockpit-contract.ts, CockpitModule). */
  #display(context: CockpitDrawContext): void {
    const { view, slot } = this.#layout;
    if (view === 'none') return;
    if (view === 'warp' || view === 'map') clearRect(this.#back, 0, 0, WIDTH - 1, HEIGHT - 1);
    const overlay = view === 'flight' || view === 'external';
    if (overlay) for (const module of this.#modules) module.eraseOverlay?.(context);
    if (slot !== null && view !== 'map') for (const record of slot.instruments) this.#handler(record).prePass?.(context, record);
    if (overlay) for (const module of this.#modules) module.drawOverlay?.(context);
    for (const module of this.#modules) module.global?.(context);
    if (slot !== null) {
      this.#elements(context, slot, 0);
      this.#records(context, slot);
      this.#elements(context, slot, 1);
    }
    this.#fullRedraw = false;
    if (view === 'base') return;
    const { top, bottom } = frameEndRows(view);
    copyRect(this.#back, this.#screen, { x0: 0, y0: top, x1: WIDTH - 1, y1: bottom });
  }

  /**
   * `0x49c98`: draws an element every frame or in a full redraw, and copies it when it is not every frame (so in a
   * full redraw) or in pass 1. Schema 1 has no pass-1 element that is not every frame, which would be copied undrawn.
   */
  #elements(context: CockpitDrawContext, slot: InstrumentSlot, pass: 0 | 1): void {
    slot.elements.forEach((element, index) => {
      if (element.pass !== pass || (!element.everyFrame && !this.#fullRedraw)) return;
      const bounds = this.#painter?.paintElement?.(context, element, index) ?? invariant('elements', 'have no painter');
      if (pass !== 0 || !element.everyFrame) this.#publish(bounds);
    });
  }

  /** `0x49b2c`'s record walk with one clock sample: each due record is drawn and stores the sample. */
  #records(context: CockpitDrawContext, slot: InstrumentSlot): void {
    const { clock } = context;
    const last = this.#lastDraw[this.#content.slots.indexOf(slot)];
    slot.instruments.forEach((record, index) => {
      const due = slot.alwaysRedraw || this.#fullRedraw || record.redrawInterval === 0 || clockExceeds(clock, last[index], record.redrawInterval);
      if (!due) return;
      last[index] = clock;
      this.#handler(record).draw(context, record);
    });
  }
}

export function createCockpitPresentation(input: CockpitPresentationInput): CockpitPresentation {
  return new Presentation(input);
}
