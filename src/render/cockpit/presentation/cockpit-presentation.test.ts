import { describe, expect, it } from 'vitest';
import type { InstrumentType } from '../../../content/hud/instruments-payload.ts';
import type { DomainEvent } from '../../../core/contracts/domain-events.ts';
import { isCovered, plot } from '../raster/indexed-surface.ts';
import type { CockpitAdvance, CockpitDrawContext, CockpitModule, CockpitPresentation, CockpitTick, CockpitTickContext } from './cockpit-contract.ts';
import { PresentationError } from './cockpit-limits.ts';
import { createCockpitPresentation } from './cockpit-presentation.ts';
import { cockpitRandom } from './cockpit-random.ts';
import {
  BASE_VIEW, cockpitBatch, cockpitContent, cockpitTick, cockpitTicks, createTestPresentation, DESTRUCTION_SUB_MODE, EXTERNAL_VIEW,
  FLIGHT_VIEW, MAP_VIEW, supportModule, syntheticEvent, syntheticInitial, syntheticProjection, TEST_SEED, viewSwitched, WARP_VIEW,
  type HookCall,
} from './cockpit.test-support.ts';

const SLOT0_ORDER: readonly InstrumentType[] = [0, 1, 2, 3, 5, 7, 8, 6, 9, 12];
const WIDTH = 640;
const at = (x: number, y: number): number => y * WIDTH + x;

const hooks = (log: readonly HookCall[], tick: number): string[] =>
  log.filter((call) => call.tick === tick).map(({ hook, type, detail }) => (type === undefined ? (detail === undefined ? hook : `${hook}:${detail}`) : `${hook}:${type}`));
const drawn = (log: readonly HookCall[], tick: number): InstrumentType[] =>
  log.filter((call) => call.tick === tick && call.hook === 'draw').map(({ type }) => type!);

function failure(run: () => unknown): PresentationError {
  try {
    run();
  } catch (error) {
    if (error instanceof PresentationError) return error;
    throw error;
  }
  throw new Error('expected a PresentationError');
}

/** A module handling `type` whose draw runs `draw`. */
const handlerModule = (name: string, type: InstrumentType, draw: (context: CockpitDrawContext) => void, extra: Partial<CockpitModule> = {}): CockpitModule =>
  ({ name, instruments: { [type]: { draw } }, ...extra });

describe('creation', () => {
  it('selects tick 0’s layout without advancing, drawing or drawing random numbers', () => {
    const log: HookCall[] = [];
    const presentation = createTestPresentation({ log });
    expect(log).toEqual(SLOT0_ORDER.map((type) => ({ hook: 'activate', tick: 0, module: 'support', type })));
    expect(presentation.status()).toBe('ready');
    expect(presentation.layout()).toMatchObject({ viewMode: FLIGHT_VIEW, view: 'flight' });
    expect(presentation.schedule()).toEqual({
      tick: 0, clock: 0, viewMode: FLIGHT_VIEW, fullRedraw: true, lastDraw: [Array(10).fill(0), [0, 0], [0]], randomDraws: 0,
    });
    const { back, screen } = presentation.surfaces();
    expect(back.indices.every((index) => index === 0) && screen.indices.every((index) => index === 0)).toBe(true);
    expect(back.coverage!.every((bits) => bits === 0)).toBe(true);
    expect(screen.coverage).toBeNull();
  });

  it('activates the map slot when the run starts in the map', () => {
    const log: HookCall[] = [];
    createTestPresentation({ log, viewMode: MAP_VIEW });
    expect(hooks(log, 0)).toEqual(['activate:10', 'activate:8']);
  });

  it('rejects a start that is not tick 0, has an unready partition or does not cover every type', () => {
    const content = cockpitContent();
    const base = { ownerId: 1, runId: 1, content, seed: TEST_SEED, initial: syntheticInitial(), modules: [supportModule()] };
    const kind = (input: Partial<typeof base>) => failure(() => createCockpitPresentation({ ...base, ...input }));
    expect(kind({ ownerId: -1 })).toMatchObject({ kind: 'invalid-input', path: 'cockpit.ownerId' });
    expect(kind({ runId: 0.5 })).toMatchObject({ kind: 'invalid-input', path: 'cockpit.runId' });
    expect(kind({ seed: 2 ** 32 })).toMatchObject({ kind: 'invalid-input', path: 'cockpit.seed' });
    const later = cockpitTick(1).output;
    expect(kind({ initial: { ...syntheticInitial(), render: later.render } })).toMatchObject({ kind: 'invalid-input', path: 'cockpit.initial' });
    for (const [patch, name] of [
      [{ flight: { motion: { readiness: 'not-implemented' } } }, 'flight.motion'],
      [{ flight: { combat: { readiness: 'not-implemented' } } }, 'flight.combat'],
      [{ map: { readiness: 'not-implemented' } }, 'map'],
      [{ communications: { readiness: 'not-implemented' } }, 'communications'],
    ] as const) {
      expect(kind({ initial: syntheticInitial({ patch }) })).toMatchObject({ kind: 'invalid-input', path: `cockpit.initial.projection.${name}` });
    }
    expect(kind({ modules: [supportModule({ except: [9] })] })).toMatchObject({ kind: 'invalid-input', path: 'cockpit.modules' });
    expect(kind({ modules: [supportModule(), supportModule({ name: 'twice', types: [8], painter: false })] }))
      .toMatchObject({ kind: 'invalid-input', path: 'cockpit.modules.twice.instruments.8' });
    expect(kind({ modules: [supportModule(), supportModule({ name: 'painter', types: [] })] })).toMatchObject({ kind: 'invalid-input', path: 'cockpit.modules' });
    expect(kind({ modules: [supportModule({ painter: false })] })).toMatchObject({ kind: 'invalid-input', path: 'cockpit.modules' });
    expect(kind({ modules: [supportModule({ except: [3] }), { name: 'broken', instruments: { 3: {} as never } }] }))
      .toMatchObject({ kind: 'invalid-input', path: 'cockpit.modules.broken.instruments.3' });
  });
});

describe('one logical display per tick', () => {
  it('runs ① to ④ in the original order on the first tick, which is a full redraw', () => {
    const log: HookCall[] = [];
    const presentation = createTestPresentation({ log });
    presentation.advance(cockpitBatch([cockpitTick(1, { events: [syntheticEvent(1, 'warp-wall-contact'), syntheticEvent(1, 'target-cleared')] })]));
    expect(hooks(log, 1)).toEqual([
      'beforeDraw:warp-wall-contact', 'beforeDraw:target-cleared', 'prepare', 'eraseOverlay',
      ...SLOT0_ORDER.map((type) => `prePass:${type}`), 'drawOverlay', 'global', 'paintElement:0', 'paintElement:1',
      ...SLOT0_ORDER.map((type) => `draw:${type}`), 'paintElement:2', 'afterDraw:warp-wall-contact', 'afterDraw:target-cleared',
    ]);
    expect(presentation.schedule()).toMatchObject({ tick: 1, clock: 2, fullRedraw: false, lastDraw: [Array(10).fill(2), [0, 0], [0]] });
  });

  it('draws a record when its interval is 0 or the clock passed its last draw by more than the interval', () => {
    const log: HookCall[] = [];
    const presentation = createTestPresentation({ log });
    presentation.advance(cockpitBatch(cockpitTicks(1, 4)));
    presentation.advance(cockpitBatch(cockpitTicks(5, 8)));
    const always = [2, 3, 8, 6, 9, 12];
    const order = (types: number[]) => SLOT0_ORDER.filter((type) => types.includes(type));
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((tick) => drawn(log, tick))).toEqual([
      SLOT0_ORDER, order(always), order([...always, 5]), order(always), order([...always, 0, 5]), order([...always, 1]),
      order([...always, 5, 7]), order(always),
    ]);
    expect(presentation.schedule().lastDraw[0]).toEqual([10, 12, 16, 16, 14, 14, 16, 16, 16, 16]);
  });

  it('does not draw when the difference equals the interval', () => {
    const log: HookCall[] = [];
    const content = cockpitContent((mutable) => {
      mutable.slots[0].instruments[4].redrawInterval = 4;
    });
    const presentation = createTestPresentation({ log, content });
    presentation.advance(cockpitBatch(cockpitTicks(1, 4)));
    expect([2, 3, 4].map((tick) => drawn(log, tick).includes(5))).toEqual([false, false, true]);
  });

  it('paints elements by pass and copies them to S by the original rule', () => {
    const log: HookCall[] = [];
    const frame: CockpitModule = {
      name: 'frame',
      paintElement: (context, _element, index) => {
        log.push({ hook: 'paint', tick: context.tick, detail: String(index) });
        plot(context.back, 10 + index, 400, index + 1);
        return { x0: 10 + index, y0: 400, x1: 10 + index, y1: 400 };
      },
    };
    const presentation = createTestPresentation({ modules: [frame] });
    presentation.advance(cockpitBatch([cockpitTick(1)]));
    const { back, screen } = presentation.surfaces();
    expect([10, 11, 12].map((x) => back.indices[at(x, 400)])).toEqual([1, 2, 3]);
    expect([10, 11, 12].map((x) => screen.indices[at(x, 400)])).toEqual([1, 0, 3]);
    back.indices.fill(0);
    presentation.advance(cockpitBatch([cockpitTick(2)]));
    expect(log.filter(({ tick }) => tick === 2).map(({ detail }) => detail)).toEqual(['1', '2']);
    expect([10, 11, 12].map((x) => screen.indices[at(x, 400)])).toEqual([1, 0, 3]);
  });
});

describe('views and persistence (DC-05)', () => {
  it('keeps B’s cockpit band in F1: a mark appears on S only when a later copy covers it', () => {
    const overlay: CockpitModule = {
      name: 'overlay',
      drawOverlay: (context) => {
        if (context.tick !== 1) return;
        plot(context.back, 5, 400, 7);
        plot(context.back, 5, 100, 4);
      },
    };
    const left = handlerModule('left', 6, (context) => {
      if (context.tick === 3) context.publish({ x0: 0, y0: 395, x1: 20, y1: 405 });
    });
    const presentation = createTestPresentation({ modules: [overlay, left] });
    presentation.advance(cockpitBatch(cockpitTicks(1, 2)));
    const { back, screen } = presentation.surfaces();
    expect([back.indices[at(5, 400)], screen.indices[at(5, 400)]]).toEqual([7, 0]);
    expect([back.indices[at(5, 100)], screen.indices[at(5, 100)], isCovered(back, 5, 100), isCovered(back, 6, 100)]).toEqual([4, 4, true, false]);
    presentation.advance(cockpitBatch([cockpitTick(3)]));
    expect(screen.indices[at(5, 400)]).toBe(7);
  });

  it('fills B with 0 before every Warp display, so unwritten copy areas publish index 0', () => {
    const log: HookCall[] = [];
    const lamp = handlerModule('lamp', 12, (context) => {
      if (context.tick === 1) plot(context.back, 5, 470, 9);
      if (context.tick !== 2) context.publishRow(470, 0, 10);
    });
    const presentation = createTestPresentation({ log, viewMode: WARP_VIEW, modules: [lamp] });
    presentation.advance(cockpitBatch(cockpitTicks(1, 1, { viewMode: WARP_VIEW })));
    const { back, screen } = presentation.surfaces();
    expect([back.indices[at(5, 470)], screen.indices[at(5, 470)]]).toEqual([9, 9]);
    presentation.advance(cockpitBatch(cockpitTicks(2, 2, { viewMode: WARP_VIEW })));
    expect([back.indices[at(5, 470)], isCovered(back, 5, 470), screen.indices[at(5, 470)]]).toEqual([0, false, 9]);
    presentation.advance(cockpitBatch(cockpitTicks(3, 3, { viewMode: WARP_VIEW })));
    expect(screen.indices[at(5, 470)]).toBe(0);
    expect(hooks(log, 3)).toEqual(['prepare', ...SLOT0_ORDER.filter((type) => type !== 12).map((type) => `prePass:${type}`), 'global',
      'paintElement:1', ...[2, 3, 5, 8, 6, 9].map((type) => `draw:${type}`), 'paintElement:2']);
  });

  it('selects the map on its view switch, activates its slot and copies the whole screen', () => {
    const log: HookCall[] = [];
    const map = handlerModule('map', 10, (context) => plot(context.back, 3, 100, 6));
    const presentation = createTestPresentation({ log, modules: [map] });
    presentation.advance(cockpitBatch([
      cockpitTick(1),
      cockpitTick(2, { viewMode: MAP_VIEW, events: [viewSwitched(2, FLIGHT_VIEW, MAP_VIEW)] }),
      cockpitTick(3, { viewMode: MAP_VIEW }),
    ]));
    expect(hooks(log, 2)).toEqual(['activate:8', 'beforeDraw:view-switched', 'prepare', 'global', 'draw:8', 'paintElement:0', 'paintElement:1',
      'afterDraw:view-switched']);
    expect(hooks(log, 3)).toEqual(['prepare', 'global', 'draw:8', 'paintElement:0', 'paintElement:1']);
    expect(presentation.layout()).toMatchObject({ view: 'map', palette: 'map' });
    expect(presentation.surfaces().screen.indices[at(3, 100)]).toBe(6);
  });

  it('runs slot 7 every display in the destruction view, with the overlay and the pre-pass', () => {
    const log: HookCall[] = [];
    const destruction = { viewMode: EXTERNAL_VIEW, subMode: DESTRUCTION_SUB_MODE };
    const presentation = createTestPresentation({ log });
    presentation.advance(cockpitBatch([
      cockpitTick(1, { ...destruction, events: [viewSwitched(1, FLIGHT_VIEW, EXTERNAL_VIEW, DESTRUCTION_SUB_MODE)] }),
      cockpitTick(2, destruction),
    ]));
    expect(hooks(log, 1)).toEqual(['activate:8', 'beforeDraw:view-switched', 'prepare', 'eraseOverlay', 'prePass:8', 'drawOverlay', 'global', 'draw:8',
      'afterDraw:view-switched']);
    expect(hooks(log, 2)).toEqual(['prepare', 'eraseOverlay', 'prePass:8', 'drawOverlay', 'global', 'draw:8']);
    expect(presentation.layout()).toMatchObject({ view: 'external', screenRows: null, worldRows: { top: 0, bottom: 479 } });
  });

  it('runs only the global callbacks in the base, nothing in other views, and reactivates on return', () => {
    const log: HookCall[] = [];
    const presentation = createTestPresentation({ log });
    presentation.advance(cockpitBatch([
      cockpitTick(1),
      cockpitTick(2, { viewMode: BASE_VIEW, events: [viewSwitched(2, FLIGHT_VIEW, BASE_VIEW)] }),
      cockpitTick(3, { viewMode: BASE_VIEW }),
    ]));
    expect(hooks(log, 3)).toEqual(['prepare', 'global']);
    expect(presentation.schedule().fullRedraw).toBe(false);
    presentation.advance(cockpitBatch([
      cockpitTick(4, { viewMode: 0x13, events: [viewSwitched(4, BASE_VIEW, 0x13)] }),
      cockpitTick(5, { viewMode: 0x13 }),
    ]));
    expect(hooks(log, 5)).toEqual(['prepare']);
    expect(presentation.schedule()).toMatchObject({ fullRedraw: true, viewMode: 0x13 });
    presentation.advance(cockpitBatch([cockpitTick(6, { events: [viewSwitched(6, 0x13, FLIGHT_VIEW)] })]));
    expect(hooks(log, 6).slice(0, 10)).toEqual(SLOT0_ORDER.map((type) => `activate:${type}`));
    expect(drawn(log, 6)).toEqual(SLOT0_ORDER);
  });

  it('clears B and S and forces a full redraw at every select, activating only on a slot change', () => {
    const log: HookCall[] = [];
    const views: string[] = [];
    const observer: CockpitModule = { name: 'observer', beforeDraw: (context) => void views.push(`${context.layout.view}:${context.fullRedraw}`) };
    const presentation = createTestPresentation({ log, modules: [observer] });
    presentation.advance(cockpitBatch(cockpitTicks(1, 5)));
    const { back, screen } = presentation.surfaces();
    plot(back, 1, 1, 5);
    screen.indices[at(1, 400)] = 5;
    presentation.advance(cockpitBatch([cockpitTick(6, { viewMode: WARP_VIEW, events: [viewSwitched(6, FLIGHT_VIEW, WARP_VIEW)] })]));
    expect(views).toEqual(['warp:true']);
    expect(hooks(log, 6).filter((hook) => hook.startsWith('activate'))).toEqual([]);
    expect(drawn(log, 6)).toEqual(SLOT0_ORDER);
    expect([back.indices[at(1, 1)], screen.indices[at(1, 400)]]).toEqual([0, 0]);
  });

  it('selects at each of a tick’s view switches', () => {
    const log: HookCall[] = [];
    const presentation = createTestPresentation({ log });
    presentation.advance(cockpitBatch([
      cockpitTick(1),
      cockpitTick(2, { viewMode: FLIGHT_VIEW, events: [viewSwitched(2, FLIGHT_VIEW, MAP_VIEW), viewSwitched(2, MAP_VIEW, FLIGHT_VIEW)] }),
    ]));
    expect(hooks(log, 2).slice(0, 14)).toEqual([
      'activate:10', 'activate:8', 'beforeDraw:view-switched', ...SLOT0_ORDER.map((type) => `activate:${type}`), 'beforeDraw:view-switched',
    ]);
    expect(presentation.layout().view).toBe('flight');
    expect(drawn(log, 2)).toEqual(SLOT0_ORDER);
  });

  it('gives each hook the previous tick’s view', () => {
    const previous: number[] = [];
    const reader: CockpitModule = { name: 'reader', prepare: (context) => void previous.push(context.previousViewMode) };
    const presentation = createTestPresentation({ modules: [reader] });
    presentation.advance(cockpitBatch([
      cockpitTick(1), cockpitTick(2, { viewMode: MAP_VIEW, events: [viewSwitched(2, FLIGHT_VIEW, MAP_VIEW)] }), cockpitTick(3, { viewMode: MAP_VIEW }),
    ]));
    expect(previous).toEqual([FLIGHT_VIEW, FLIGHT_VIEW, MAP_VIEW]);
  });
});

describe('batch validation', () => {
  function snapshot(presentation: CockpitPresentation) {
    const { back, screen } = presentation.surfaces();
    return { schedule: presentation.schedule(), back: [...back.indices], coverage: [...back.coverage!], screen: [...screen.indices] };
  }

  const drawing: CockpitModule = handlerModule('drawing', 5, (context) => {
    plot(context.back, context.random.next() % 640, 400, 3);
  });

  it.each<[string, (ticks: CockpitTick[]) => CockpitAdvance | unknown, string]>([
    ['another owner', (ticks) => cockpitBatch(ticks, 2, 1), 'cockpit.batch'],
    ['another run', (ticks) => cockpitBatch(ticks, 1, 2), 'cockpit.batch'],
    ['no array', () => ({ ownerId: 1, runId: 1, ticks: null }), 'cockpit.batch.ticks'],
    ['six ticks', () => cockpitBatch(cockpitTicks(3, 8)), 'cockpit.batch.ticks'],
    ['a gap', () => cockpitBatch([cockpitTick(4)]), 'cockpit.batch.ticks[0].output.tick'],
    ['a repeated tick', () => cockpitBatch([cockpitTick(2)]), 'cockpit.batch.ticks[0].output.tick'],
    ['ticks out of order', () => cockpitBatch([cockpitTick(4), cockpitTick(3)]), 'cockpit.batch.ticks[0].output.tick'],
    ['a later bad tick', () => cockpitBatch([cockpitTick(3), cockpitTick(5)]), 'cockpit.batch.ticks[1].output.tick'],
    ['a clock jump', ([tick]) => cockpitBatch([{ ...tick, output: { ...tick.output, clock: 7 } }]), 'cockpit.batch.ticks[0].output.clock'],
    ['another tick’s Render State', ([tick]) => cockpitBatch([{ ...tick, output: { ...tick.output, render: cockpitTick(2).output.render } }]), 'cockpit.batch.ticks[0].output.render'],
    ['another tick’s projection', ([tick]) => cockpitBatch([{ ...tick, output: { ...tick.output, projection: syntheticProjection(2) } }]), 'cockpit.batch.ticks[0].output.projection.clock'],
    ['another view’s projection', ([tick]) => cockpitBatch([{ ...tick, output: { ...tick.output, projection: syntheticProjection(3, { viewMode: MAP_VIEW }) } }]), 'cockpit.batch.ticks[0].output.projection.player'],
    ['another tick’s camera', ([tick]) => cockpitBatch([{ ...tick, camera: cockpitTick(2).camera }]), 'cockpit.batch.ticks[0].camera'],
    ['another view’s camera', ([tick]) => cockpitBatch([{ ...tick, camera: cockpitTick(3, { viewMode: WARP_VIEW }).camera }]), 'cockpit.batch.ticks[0].camera'],
    ['no button level', ([tick]) => cockpitBatch([{ ...tick, mapRightButton: 1 as unknown as boolean }]), 'cockpit.batch.ticks[0].mapRightButton'],
    ['another tick’s event', () => cockpitBatch([cockpitTick(3, { events: [syntheticEvent(2, 'target-cleared')] })]), 'cockpit.batch.ticks[0].output.events[0]'],
    ['a malformed event', ([tick]) => cockpitBatch([{ ...tick, output: { ...tick.output, events: [null as never] } }]), 'cockpit.batch.ticks[0].output.events[0]'],
    ['a view change without an event', () => cockpitBatch([cockpitTick(3, { viewMode: WARP_VIEW })]), 'cockpit.batch.ticks[0].output.render'],
    ['a later view change without an event', () => cockpitBatch([
      cockpitTick(3, { viewMode: MAP_VIEW, events: [viewSwitched(3, FLIGHT_VIEW, MAP_VIEW)] }), cockpitTick(4, { viewMode: FLIGHT_VIEW }),
    ]), 'cockpit.batch.ticks[1].output.render'],
    ['an end view other than the last switch’s', () => cockpitBatch([cockpitTick(3, { events: [viewSwitched(3, FLIGHT_VIEW, MAP_VIEW)] })]), 'cockpit.batch.ticks[0].output.render'],
    ['a sub-mode change without an event', () => cockpitBatch([cockpitTick(3, { subMode: DESTRUCTION_SUB_MODE })]), 'cockpit.batch.ticks[0].output.render'],
    ['a malformed view switch', () => cockpitBatch([cockpitTick(3, { events: [syntheticEvent(3, 'view-switched', { viewMode: '12', subMode: 0 })] })]), 'cockpit.batch.ticks[0].output.events[0]'],
    ['an unready map', () => cockpitBatch([cockpitTick(3, { patch: { map: { readiness: 'not-implemented' } as never } })]), 'cockpit.batch.ticks[0].output.projection.map'],
    ['an unready combat group', () => cockpitBatch([cockpitTick(3, { patch: { flight: { combat: { readiness: 'not-implemented' } as never } } })]), 'cockpit.batch.ticks[0].output.projection.flight.combat'],
  ])('rejects %s before any change or draw', (_name, make, path) => {
    const log: HookCall[] = [];
    const presentation = createTestPresentation({ log, modules: [drawing] });
    presentation.advance(cockpitBatch(cockpitTicks(1, 2)));
    const before = snapshot(presentation);
    const calls = log.length;
    expect(failure(() => presentation.advance(make([cockpitTick(3)]) as CockpitAdvance))).toMatchObject({ kind: 'invalid-input', path });
    expect(snapshot(presentation)).toEqual(before);
    expect(log.length).toBe(calls);
    expect(presentation.status()).toBe('ready');
    presentation.advance(cockpitBatch([cockpitTick(3)]));
    expect(presentation.schedule().tick).toBe(3);
  });

  it('accepts five ticks and an empty batch, which changes nothing', () => {
    const log: HookCall[] = [];
    const presentation = createTestPresentation({ log, modules: [drawing] });
    presentation.advance(cockpitBatch(cockpitTicks(1, 5)));
    const before = snapshot(presentation);
    const calls = log.length;
    for (let frame = 0; frame < 3; frame++) {
      presentation.advance(cockpitBatch([]));
      presentation.layout();
      presentation.surfaces();
      presentation.schedule();
    }
    expect(snapshot(presentation)).toEqual(before);
    expect(log.length).toBe(calls);
  });
});

describe('random stream', () => {
  it('serves draw routines from the derived stream and counts the draws', () => {
    const values: number[] = [];
    const radar = handlerModule('radar', 5, (context) => {
      values.push(context.random.next(), context.random.next());
    }, { global: (context) => void values.push(context.random.next()) });
    const presentation = createTestPresentation({ modules: [radar] });
    presentation.advance(cockpitBatch(cockpitTicks(1, 3)));
    const expected = cockpitRandom(TEST_SEED);
    expect(values).toEqual(Array.from({ length: values.length }, () => expected.next()));
    // A global draw every tick, and two in each draw of the type-5 record (ticks 1 and 3).
    expect(values.length).toBe(7);
    expect(presentation.schedule().randomDraws).toBe(7);
  });

  it.each<[string, Partial<CockpitModule>]>([
    ['before the draw', { beforeDraw: (context) => void (context as CockpitDrawContext).random.next() }],
    ['in the map read call', { prepare: (context) => void (context as CockpitDrawContext).random.next() }],
    ['after the draw', { afterDraw: (context) => void (context as CockpitDrawContext).random.next() }],
  ])('refuses draws %s and latches the failure', (_name, hook) => {
    const presentation = createTestPresentation({ modules: [{ name: 'rogue', ...hook }] });
    const error = failure(() => presentation.advance(cockpitBatch([cockpitTick(1, { events: [syntheticEvent(1, 'target-cleared')] })])));
    expect(error).toMatchObject({ kind: 'invariant-violated', path: 'cockpit.random' });
    expect(presentation.status()).toBe('failed');
  });

  it('refuses draws and copies outside a tick, and in activation', () => {
    let kept: CockpitDrawContext | null = null;
    const keeper = handlerModule('keeper', 5, (context) => {
      kept = context;
    });
    const presentation = createTestPresentation({ modules: [keeper] });
    presentation.advance(cockpitBatch([cockpitTick(1)]));
    expect(failure(() => kept!.random.next())).toMatchObject({ kind: 'invariant-violated', path: 'cockpit.random' });
    expect(failure(() => kept!.publish({ x0: 0, y0: 0, x1: 1, y1: 1 }))).toMatchObject({ kind: 'invariant-violated', path: 'cockpit.publish' });
    expect(presentation.schedule().randomDraws).toBe(0);
    const activating: CockpitModule = {
      name: 'activating',
      instruments: { 5: { draw: () => {}, activate: (context: CockpitTickContext) => void (context as CockpitDrawContext).random.next() } },
    };
    expect(failure(() => createTestPresentation({ modules: [activating] }))).toMatchObject({ kind: 'invariant-violated', path: 'cockpit.random' });
  });
});

describe('frame grouping', () => {
  /** A run of ticks with view switches, a player that appears and changes, events, and random draws. */
  function run(groups: readonly number[]) {
    const log: HookCall[] = [];
    const values: string[] = [];
    const radar = handlerModule('radar', 5, (context) => {
      const value = context.random.next();
      values.push(`${context.tick}:${value}`);
      plot(context.back, value % 640, 330 + (value % 100), value & 0xff);
      context.publishRow(330 + (value % 100), 0, 639);
    }, {
      beforeDraw: (context, event) => void values.push(`${context.tick}:${event.type}:${context.layout.view}`),
      global: (context) => {
        const player = context.projection.flight.combat.player as unknown as { readonly shields: number } | null;
        if (player !== null && player.shields < 50) values.push(`${context.tick}:low:${context.random.next()}`);
      },
    });
    const options = (tick: number) => {
      const viewMode = tick >= 9 && tick < 12 ? MAP_VIEW : tick >= 14 ? WARP_VIEW : FLIGHT_VIEW;
      const events: DomainEvent[] = [];
      if (tick === 9) events.push(viewSwitched(tick, FLIGHT_VIEW, MAP_VIEW));
      if (tick === 12) events.push(viewSwitched(tick, MAP_VIEW, FLIGHT_VIEW));
      if (tick === 14) events.push(viewSwitched(tick, FLIGHT_VIEW, WARP_VIEW));
      if (tick === 4 || tick === 13) events.push(syntheticEvent(tick, tick === 4 ? 'incoming-started' : 'incoming-ended'));
      if (tick === 6) events.push(syntheticEvent(tick, 'target-cleared'));
      const patch = tick >= 3 ? { flight: { combat: { player: { shields: 100 - tick * 6 } } } } as never : undefined;
      return { viewMode, events, patch };
    };
    const presentation = createTestPresentation({ log, modules: [radar] });
    let next = 1;
    for (const size of groups) {
      presentation.advance(cockpitBatch(cockpitTicks(next, next + size - 1, options)));
      next += size;
    }
    expect(next).toBe(16);
    const { back, screen } = presentation.surfaces();
    return { log, values, schedule: presentation.schedule(), back: [...back.indices], coverage: [...back.coverage!], screen: [...screen.indices] };
  }

  it('gives the same state, hooks and draws for 1 × 15, 5 + 5 + 5 and 2 + 0 + 3 + 0 + 5 + 4 + 1', () => {
    const single = run(Array(15).fill(1));
    expect(single.values.some((value) => value.includes(':low:'))).toBe(true);
    expect(single.schedule.randomDraws).toBeGreaterThan(10);
    expect(run([5, 5, 5])).toEqual(single);
    expect(run([2, 0, 3, 0, 5, 4, 1])).toEqual(single);
  });
});

describe('failure and disposal', () => {
  it('latches a failure while processing and rejects every later use but dispose', () => {
    const log: HookCall[] = [];
    const broken = handlerModule('broken', 6, (context) => {
      if (context.tick === 2) throw new Error('draw failed');
    });
    const presentation = createTestPresentation({ log, modules: [broken] });
    expect(() => presentation.advance(cockpitBatch(cockpitTicks(1, 3)))).toThrow('draw failed');
    expect(presentation.status()).toBe('failed');
    for (const use of [() => presentation.layout(), () => presentation.surfaces(), () => presentation.schedule(), () => presentation.advance(cockpitBatch([]))]) {
      expect(failure(use)).toMatchObject({ kind: 'invalid-state' });
    }
    presentation.dispose();
    expect(presentation.status()).toBe('disposed');
    expect(log.filter(({ hook }) => hook === 'dispose')).toHaveLength(1);
  });

  it('disposes every module once, idempotently, and reports their failures together', () => {
    const log: HookCall[] = [];
    const failing = (name: string): CockpitModule => ({ name, dispose: () => { throw new Error(name); } });
    const presentation = createTestPresentation({ log, modules: [failing('a'), failing('b')] });
    expect(() => presentation.dispose()).toThrow(AggregateError);
    presentation.dispose();
    expect(log.filter(({ hook }) => hook === 'dispose')).toHaveLength(1);
    expect(presentation.status()).toBe('disposed');
    expect(failure(() => presentation.advance(cockpitBatch([cockpitTick(1)])))).toMatchObject({ kind: 'invalid-state', path: 'cockpit.advance' });
    expect(failure(() => presentation.schedule())).toMatchObject({ kind: 'invalid-state' });
  });
});
