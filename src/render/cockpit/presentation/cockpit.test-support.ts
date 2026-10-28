import { readCockpitInstruments, type CockpitInstruments, type InstrumentType } from '../../../content/hud/instruments-payload.ts';
import { syntheticCockpitInstruments, type MutableCockpitInstruments } from '../../../content/hud/instruments.test-support.ts';
import type { DomainEvent } from '../../../core/contracts/domain-events.ts';
import type { Projection } from '../../../core/projections/projection.ts';
import type { RenderState } from '../../../core/projections/render-state.ts';
import { DESTRUCTION_SUB_MODE, DESTRUCTION_VIEW_MODE, INITIAL_CAMERA_POSE } from '../../flight/presentation/presentation-camera.ts';
import type { PresentationCamera } from '../../flight/presentation/presentation-contract.ts';
import { createIndexedSurface, type PixelRect } from '../raster/indexed-surface.ts';
import type {
  CockpitAdvance, CockpitDrawContext, CockpitInitial, CockpitModule, CockpitPresentation, CockpitSurfaces, CockpitTick,
  CockpitTickContext, InstrumentHandler,
} from './cockpit-contract.ts';
import { copyRect, layoutOf } from './cockpit-layout.ts';
import { createCockpitPresentation } from './cockpit-presentation.ts';
import { cockpitRandom } from './cockpit-random.ts';

// Code-generated synthetic inputs for the cockpit presentation and its modules' tests; never original data. Every
// builder takes only the fields a test cares about: the projection starts with every read partition ready and no
// player, and a deep partial patch replaces any part of it (arrays and null replace, objects merge).

export const FLIGHT_VIEW = 0x0c;
export const WARP_VIEW = 0x01;
export const MAP_VIEW = 0x08;
export const EXTERNAL_VIEW = DESTRUCTION_VIEW_MODE;
export { DESTRUCTION_SUB_MODE };
export const BASE_VIEW = 0x06;
export const CLOCK_UNITS_PER_TICK = 2;
export const TEST_SEED = 0x2468_ace0;
export const ALL_TYPES: readonly InstrumentType[] = Object.freeze([0, 1, 2, 3, 5, 6, 7, 8, 9, 10, 12]);

export type DeepPartial<T> = T extends readonly unknown[] ? T : T extends object ? { readonly [Key in keyof T]?: DeepPartial<T[Key]> | null } : T;

export interface ViewOptions {
  readonly viewMode?: number;
  readonly subMode?: number;
}

export interface TickOptions extends ViewOptions {
  /** Applied to the default projection; the clock and the player's view always follow the tick and view. */
  readonly patch?: DeepPartial<Projection>;
  readonly events?: readonly DomainEvent[];
  readonly mapRightButton?: boolean;
  readonly render?: Partial<RenderState>;
}

const isPlain = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function merge(base: unknown, patch: unknown): unknown {
  if (!isPlain(base) || !isPlain(patch)) return patch;
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) if (value !== undefined) result[key] = merge(base[key], value);
  return result;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}

/** The synthetic instruments content, read by the canonical reader; `mutate` may change it first. */
export function cockpitContent(mutate?: (content: MutableCockpitInstruments) => void): CockpitInstruments {
  const content = syntheticCockpitInstruments();
  mutate?.(content);
  return readCockpitInstruments(content);
}

export function syntheticRender(tick: number, { viewMode = FLIGHT_VIEW, subMode = 0 }: ViewOptions = {}, patch: Partial<RenderState> = {}): RenderState {
  return Object.freeze({
    tick, clock: tick * CLOCK_UNITS_PER_TICK, viewMode, observedEntityId: null, entities: Object.freeze([]), warp: null, subMode,
    followedEntityId: null, activeAreaCentre: null, speedShare: 0, ...patch,
  });
}

/** A projection with every partition the cockpit reads ready and no player entity, patched by `patch`. */
export function syntheticProjection(tick: number, { viewMode = FLIGHT_VIEW, subMode = 0 }: ViewOptions = {}, patch: DeepPartial<Projection> = {}): Projection {
  const base = {
    clock: { tick, clock: tick * CLOCK_UNITS_PER_TICK, clockUnitsPerTick: CLOCK_UNITS_PER_TICK },
    mission: { mission: 'mission/synthetic', group: 0, slot: 0, rawDifficulty: 0, wingman: null, status: 'in-progress', phase: 'normal' },
    player: { entityId: null, viewMode, previousViewMode: viewMode, subMode, interactionContext: 'flight' },
    flight: { motion: { readiness: 'ready', player: null }, combat: { readiness: 'ready', player: null } },
    map: { readiness: 'ready', player: null },
    communications: { readiness: 'ready', player: null },
    result: { readiness: 'ready', outcome: 'in-progress' },
  };
  const patched = merge(base, patch) as Record<string, Record<string, unknown>>;
  patched.clock = base.clock;
  patched.player = { ...patched.player, viewMode, subMode };
  return deepFreeze(patched) as unknown as Projection;
}

export function syntheticCamera(tick: number, { viewMode = FLIGHT_VIEW, subMode = 0 }: ViewOptions = {}): PresentationCamera {
  const bottom = viewMode === FLIGHT_VIEW || viewMode === WARP_VIEW || viewMode === BASE_VIEW ? 315 : 479;
  return Object.freeze({ tick, ...INITIAL_CAMERA_POSE, viewMode, subMode, viewport: Object.freeze({ left: 0, top: 0, right: 639, bottom }) });
}

export function syntheticInitial({ patch, render, ...view }: Omit<TickOptions, 'events' | 'mapRightButton'> = {}): CockpitInitial {
  return Object.freeze({ render: syntheticRender(0, view, render), projection: syntheticProjection(0, view, patch), camera: syntheticCamera(0, view) });
}

/** One tick's input; the events must carry this tick. */
export function cockpitTick(tick: number, { patch, events = [], mapRightButton = false, render, ...view }: TickOptions = {}): CockpitTick {
  const output = Object.freeze({
    tick, clock: tick * CLOCK_UNITS_PER_TICK, render: syntheticRender(tick, view, render), projection: syntheticProjection(tick, view, patch),
    events: Object.freeze(events.map((event) => Object.freeze({ event, commandId: null }))),
  });
  return Object.freeze({ output, camera: syntheticCamera(tick, view), mapRightButton });
}

/** Ticks first…last with the same options, or per-tick options from `options(tick)`. */
export function cockpitTicks(first: number, last: number, options: TickOptions | ((tick: number) => TickOptions) = {}): CockpitTick[] {
  return Array.from({ length: last - first + 1 }, (_, at) => cockpitTick(first + at, typeof options === 'function' ? options(first + at) : options));
}

export const cockpitBatch = (ticks: readonly CockpitTick[], ownerId = 1, runId = 1): CockpitAdvance => Object.freeze({ ownerId, runId, ticks });

export function viewSwitched(tick: number, fromViewMode: number, viewMode: number, subMode = 0): DomainEvent {
  return Object.freeze({ type: 'view-switched', tick, fromViewMode, fromSubMode: 0, viewMode, subMode, stage: 'request-handling', player: null }) as DomainEvent;
}

/** An event of `type` with only its tick; for hooks that read nothing else. */
export const syntheticEvent = (tick: number, type: DomainEvent['type'], fields: Record<string, unknown> = {}): DomainEvent =>
  Object.freeze({ type, tick, ...fields }) as unknown as DomainEvent;

/** One hook call a recording module saw. */
export interface HookCall {
  readonly hook: string;
  readonly tick: number;
  readonly module?: string;
  readonly type?: InstrumentType;
  readonly detail?: string;
}

/** A handler that only records its calls into `log`. */
export function recordingHandler(log: HookCall[], name = 'support'): InstrumentHandler {
  return {
    activate: ({ tick }, { type }) => void log.push({ hook: 'activate', tick, module: name, type }),
    prePass: ({ tick }, { type }) => void log.push({ hook: 'prePass', tick, module: name, type }),
    draw: ({ tick }, { type }) => void log.push({ hook: 'draw', tick, module: name, type }),
  };
}

/**
 * A module that handles every type in `types` (default: all those `except` lists) with recording handlers, records
 * every other hook into `log`, and paints elements as nothing, returning a one-pixel rectangle at (index, index).
 * Modules under test pass the types they handle as `except` so the presentation sees exactly one handler per type.
 */
export function supportModule({ log = [], name = 'support', except = [], types, painter = true }: {
  readonly log?: HookCall[];
  readonly name?: string;
  readonly except?: readonly InstrumentType[];
  readonly types?: readonly InstrumentType[];
  readonly painter?: boolean;
} = {}): CockpitModule {
  const handled = (types ?? ALL_TYPES).filter((type) => !except.includes(type));
  const handler = recordingHandler(log, name);
  const event = (hook: string) => ({ tick }: CockpitTickContext, { type }: DomainEvent) => void log.push({ hook, tick, module: name, detail: type });
  const phase = (hook: string) => ({ tick }: CockpitTickContext) => void log.push({ hook, tick, module: name });
  return {
    name,
    instruments: Object.fromEntries(handled.map((type) => [type, handler])),
    beforeDraw: event('beforeDraw'),
    prepare: phase('prepare'),
    eraseOverlay: phase('eraseOverlay'),
    drawOverlay: phase('drawOverlay'),
    global: phase('global'),
    ...painter && {
      paintElement: ({ tick }: CockpitDrawContext, _element: unknown, index: number): PixelRect => {
        log.push({ hook: 'paintElement', tick, module: name, detail: String(index) });
        return { x0: index, y0: index, x1: index, y1: index };
      },
    },
    afterDraw: event('afterDraw'),
    dispose: () => void log.push({ hook: 'dispose', tick: -1, module: name }),
  };
}

export interface TestPresentationOptions extends Omit<TickOptions, 'events' | 'mapRightButton'> {
  /** The modules under test, registered before the support module. */
  readonly modules?: readonly CockpitModule[];
  /** Types the modules under test handle; the support module handles the rest. Default: every type they register. */
  readonly handled?: readonly InstrumentType[];
  readonly content?: CockpitInstruments;
  readonly seed?: number;
  readonly log?: HookCall[];
  readonly ownerId?: number;
  readonly runId?: number;
}

/** A presentation for the modules under test, completed by a support module; starts at tick 0 in `viewMode`. */
export function createTestPresentation({
  modules = [], handled, content = cockpitContent(), seed = TEST_SEED, log, ownerId = 1, runId = 1, ...initial
}: TestPresentationOptions = {}): CockpitPresentation {
  const except = handled ?? modules.flatMap((module) => Object.keys(module.instruments ?? {}).map(Number) as InstrumentType[]);
  const painter = !modules.some((module) => module.paintElement !== undefined);
  return createCockpitPresentation({
    ownerId, runId, content, seed, initial: syntheticInitial(initial), modules: [...modules, supportModule({ log, except, painter })],
  });
}

export interface IsolatedDraw {
  readonly context: CockpitDrawContext;
  readonly surfaces: CockpitSurfaces;
  /** Every rectangle the handler published, rows as one-row rectangles. */
  readonly published: PixelRect[];
}

/**
 * A stand-alone draw context for calling one handler directly: fresh B and S, the real cockpit stream for `seed`,
 * publishing copies B to S. `fullRedraw` and the layout follow `options`; nothing else is checked.
 */
export function isolatedDrawContext(tick: number, options: TickOptions & { readonly fullRedraw?: boolean; readonly seed?: number; readonly content?: CockpitInstruments } = {}): IsolatedDraw {
  const { fullRedraw = false, seed = TEST_SEED, content = cockpitContent(), ...tickOptions } = options;
  const { output, camera, mapRightButton } = cockpitTick(tick, tickOptions);
  const back = createIndexedSurface(640, 480, true);
  const screen = createIndexedSurface(640, 480);
  const published: PixelRect[] = [];
  const publish = (rect: PixelRect): void => {
    published.push(rect);
    copyRect(back, screen, rect);
  };
  const context: CockpitDrawContext = {
    tick, clock: output.clock, clockUnitsPerTick: CLOCK_UNITS_PER_TICK, render: output.render,
    projection: output.projection as CockpitDrawContext['projection'], camera, mapRightButton,
    events: output.events.map(({ event }) => event), previousViewMode: output.render.viewMode,
    layout: layoutOf(output.render.viewMode, content), fullRedraw, content, random: cockpitRandom(seed), back,
    publish, publishRow: (y, x0, x1) => publish({ x0, y0: y, x1, y1: y }),
  };
  return { context, surfaces: { back, screen }, published };
}
