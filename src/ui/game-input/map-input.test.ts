import { describe, expect, it } from 'vitest';
import type { Command } from '../../core/contracts/tick-input.ts';
import type { PointerInput } from '../../platform/input/pointer-lock.ts';
import { createMapCursorDrawer, type MapCursorCanvas } from '../../render/map/map-cursor.ts';
import { MapInputGeometryError, mapStartPosition, type MapInputGeometry, type MapPosition } from '../../render/map/map-input-geometry.ts';
import { moment } from './game-input.test-support.ts';
import type { InputMoment } from './input-state.ts';
import type { CapabilityState, MapInputStatus } from './input-status.ts';
import { MapInput, type MapInputOptions, type MapInputPolicy } from './map-input.ts';

// P3-05 subtask 22 (Node): the map input's opening, qualification, commands, held-button repeat and Pointer Lock
// handling against a host the test drives (docs/plan/p3/05/spec.md 战略地图输入 and checkpoint K (地图) in 审批; S-11;
// AC-12 and AC-13, the Node part). Synthetic geometry and explicit synthetic policies only: the production start rule
// and interval are subtask 26's.

/** A 640×480 logical screen with a 320×320 main map at (20, 40), shown in an 800×600 frame 100 px from the left. */
const GEOMETRY: MapInputGeometry = Object.freeze({
  screen: { width: 640, height: 480 },
  mainMap: { left: 20, top: 40, right: 340, bottom: 360 },
  frame: { left: 100, top: 0, width: 800, height: 600 },
});
/** The Pointer Lock target's client rect; the geometry's frame is inside it. */
const RECT = Object.freeze({ left: 50, top: 30, width: 1000, height: 600 });
/** 1.25 CSS px per logical px and 320 logical px across the map: 400 CSS px per unit of position. */
const CSS_PER_UNIT = 400;

/** An explicit synthetic rule, not the production one. */
const FIXED_START: MapPosition = Object.freeze({ right: 0.25, down: 0.75 });
const POLICY: MapInputPolicy = { start: () => FIXED_START, repeatInterval: 8 };

const at = (right: number, down: number): MapPosition => ({ right, down });
const clientX = (right: number): number => RECT.left + GEOMETRY.frame.left + (20 + right * 320) * 1.25;
const clientY = (down: number): number => RECT.top + GEOMETRY.frame.top + (40 + down * 320) * 1.25;

const relative = (type: PointerInput['type'], movementX = 0, movementY = 0, button = 0): PointerInput => {
  const sample = { mode: 'relative', unit: 'host-reported', movementX, movementY } as const;
  return type === 'move' ? { type, sample } : { type, button, sample };
};

const absolute = (type: PointerInput['type'], x: number, y: number, button = 0): PointerInput => {
  const sample = { mode: 'absolute', unit: 'css-client', clientX: x, clientY: y, rect: RECT } as const;
  return type === 'move' ? { type, sample } : { type, button, sample };
};

/** A canvas that only counts what the real drawer paints. */
function countingCanvas(): MapCursorCanvas & { fills: number } {
  return {
    fills: 0,
    show: () => undefined,
    hide: () => undefined,
    resize: () => undefined,
    clear: () => undefined,
    fill() { this.fills += 1; },
    readDevicePixelRatio: () => 1,
    remove: () => undefined,
  };
}

interface Options {
  readonly policy?: MapInputPolicy | null;
  readonly activation?: boolean;
  readonly lock?: CapabilityState;
  readonly scale?: number;
  readonly cursor?: boolean;
}

/**
 * A map input on the real cursor drawer, with a Pointer Lock whose state the test sets and whose request and exit move
 * it as the capabilities would, and a log of every command, request, exit and start taken, in order.
 */
function setup(options: Options = {}) {
  const log: string[] = [];
  const state = {
    geometry: GEOMETRY as MapInputGeometry | null,
    lock: options.lock ?? 'active' as CapabilityState,
    activation: options.activation ?? false,
    scale: options.scale ?? 1,
    /** Refuses the submission of commands for which it returns true. */
    refuse: null as ((command: Command) => boolean) | null,
    status: null as MapInputStatus | null,
    errors: [] as unknown[],
    clock: 0,
  };
  const policy = options.policy === undefined ? POLICY : options.policy;
  const counted = policy && {
    ...policy,
    start: (geometry: MapInputGeometry) => {
      log.push('start');
      return policy.start(geometry);
    },
  };
  const geometry = { read: () => state.geometry };
  const canvas = countingCanvas();
  const mapOptions: MapInputOptions = {
    policy: counted, geometry, cursor: () => (options.cursor === false ? null : drawer),
    movementScale: () => state.scale, userActivation: () => state.activation,
  };
  const input = new MapInput(mapOptions, {
    submit: (command) => {
      if (command.type !== 'map-point') throw new Error('only map-point');
      const refused = state.refuse?.(command) ?? false;
      log.push(`${refused ? '!' : ''}${command.operation} ${command.right},${command.down} @${state.clock}`);
      return !refused;
    },
    lock: {
      requestPointerLock: () => {
        log.push('request');
        if (state.lock === 'idle') state.lock = 'pending';
      },
      exitPointerLock: () => {
        log.push('exit');
        if (state.lock === 'pending' || state.lock === 'active') state.lock = 'idle';
      },
    },
    lockState: () => state.lock,
    setStatus: (status) => { state.status = status; },
    reportError: (cause) => { state.errors.push(cause); },
  });
  const drawer = createMapCursorDrawer(canvas, geometry, input.position);
  const now = (patch: Partial<InputMoment>): InputMoment => moment({ context: 'map', clock: state.clock, ...patch });
  return {
    state, log, input, canvas,
    /** One session frame at clock `clock`. */
    frame(clock = state.clock, patch: Partial<InputMoment> = {}) {
      state.clock = clock;
      input.frame(now(patch));
    },
    sync(patch: Partial<InputMoment> = {}) { input.sync(now(patch)); },
    pointer(event: PointerInput, patch: Partial<InputMoment> = {}) { input.pointer(event, now(patch)); },
    /** Moves a locked pointer by `right`, `down` units of position. */
    move(right: number, down: number) { input.pointer(relative('move', right * CSS_PER_UNIT, down * CSS_PER_UNIT), now({})); },
    press(button = 0) { input.pointer(relative('down', 0, 0, button), now({})); },
    release(button = 0) { input.pointer(relative('up', 0, 0, button), now({})); },
    position: () => input.position.read(),
    mapState: () => state.status?.state,
    /** The log since the last call. */
    take() { return log.splice(0); },
  };
}

/** `setup`, then the first map frame with Pointer Lock already active, its log taken. */
function locked(options: Options = {}) {
  const s = setup(options);
  s.frame(10);
  s.take();
  return s;
}

describe('map opening and start position', () => {
  it('starts each opening at the policy start, keeps it within the opening and takes it anew on the next one', () => {
    const s = setup({ policy: { start: (geometry) => mapStartPosition(geometry.mainMap), repeatInterval: 8 } });
    expect(s.position()).toBeNull();
    s.frame(0, { context: 'flight' });
    expect(s.position()).toBeNull();
    s.frame(2);
    // Column and row ⌊(320 − 1) / 2⌋ = 159 from the screen origin, inside the map at (20, 40), at the pixel centre.
    expect(s.position()).toEqual(at((159.5 - 20) / 320, (159.5 - 40) / 320));
    s.move(0.1, 0.1);
    const moved = s.position();
    // Pause, unlock and relock, a geometry that failed and recovered, and a resize keep the opening's position.
    s.frame(4, { running: false });
    s.input.clear();
    s.frame(6);
    s.state.geometry = null;
    s.frame(8);
    s.state.geometry = { ...GEOMETRY, frame: { left: 0, top: 0, width: 1280, height: 960 } };
    s.frame(10);
    expect(s.position()).toBe(moved);
    expect(s.take().filter((entry) => entry === 'start')).toEqual(['start']);

    s.frame(12, { context: 'flight' });
    expect(s.position()).toBeNull();
    s.frame(14);
    expect(s.position()).toEqual(at((159.5 - 20) / 320, (159.5 - 40) / 320));
    // A new run is a new opening too.
    s.move(0.1, 0);
    s.frame(16, { runId: 2 });
    expect(s.position()).toEqual(at((159.5 - 20) / 320, (159.5 - 40) / 320));
    expect(s.take().filter((entry) => entry === 'start')).toEqual(['start', 'start']);
  });

  it('takes a late geometry\'s start once, before drawing, locking or input, and submits nothing for it', () => {
    const s = setup({ lock: 'idle', activation: true });
    s.state.geometry = null;
    s.frame(0);
    s.pointer(relative('down'));
    s.frame(2);
    expect({ position: s.position(), state: s.mapState(), fills: s.canvas.fills, log: s.take() })
      .toEqual({ position: null, state: 'not-ready', fills: 0, log: [] });
    s.state.geometry = GEOMETRY;
    s.frame(4);
    s.frame(6);
    expect({ position: s.position(), state: s.mapState(), log: s.take() }).toEqual({ position: FIXED_START, state: 'locking', log: ['start', 'request'] });
    expect(s.canvas.fills).toBeGreaterThan(0);
  });

  it('stays not ready without a policy or a cursor, and reports a geometry contract error as invalid', () => {
    for (const options of [{ policy: null }, { cursor: false }] as const) {
      const s = setup({ ...options, activation: true, lock: 'idle' });
      s.frame(0);
      s.press();
      expect({ state: s.mapState(), log: s.take() }).toEqual({ state: 'not-ready', log: options.cursor === false ? ['start'] : [] });
    }
    const s = locked();
    s.press();
    s.take();
    s.state.geometry = { ...GEOMETRY, mainMap: { ...GEOMETRY.mainMap, right: Number.NaN } };
    s.frame(20);
    expect(s.state.status).toEqual({ state: 'invalid', systemPointerHidden: false, error: expect.any(MapInputGeometryError) as unknown });
    expect(s.take()).toEqual(['exit']);
    // The drawer's own report of the same geometry is not a second error.
    expect(s.state.errors).toEqual([]);
    s.state.geometry = GEOMETRY;
    s.frame(30);
    expect({ state: s.mapState(), position: s.position(), log: s.take() }).toEqual({ state: 'click-to-lock', position: FIXED_START, log: [] });
  });

  it('reports a cursor drawing failure once until a draw succeeds', () => {
    const s = setup();
    const failure = new Error('canvas lost');
    let failing = true;
    s.canvas.fill = () => {
      if (failing) throw failure;
    };
    s.frame(0);
    s.frame(2);
    expect(s.mapState()).toBe('not-ready');
    failing = false;
    s.frame(4);
    expect(s.mapState()).toBe('click-to-lock');
    // A resize repaints.
    failing = true;
    s.state.geometry = { ...GEOMETRY, frame: { ...GEOMETRY.frame, width: 400 } };
    s.frame(6);
    expect(s.state.errors).toEqual([failure, failure]);
  });

  it('accepts only a positive integer repeat interval and no default', () => {
    for (const repeatInterval of [0, -8, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => setup({ policy: { start: () => FIXED_START, repeatInterval } })).toThrow(RangeError);
    }
  });
});

describe('qualification and Pointer Lock', () => {
  it('asks for Pointer Lock once on qualifying while a user activation remains, else shows click-to-lock', () => {
    const s = setup({ lock: 'idle' });
    for (const patch of [{ runId: null }, { running: false }, { eligible: false }] as const) {
      s.frame(0, patch);
      expect(s.mapState()).toBe(patch.runId === null ? 'off' : 'suspended');
    }
    s.frame(2);
    expect({ state: s.mapState(), log: s.take() }).toEqual({ state: 'click-to-lock', log: ['start'] });
    // Frames, moves and an activation that appears later ask nothing.
    s.state.activation = true;
    s.frame(4);
    s.pointer(absolute('move', clientX(0.5), clientY(0.5)));
    expect(s.take()).toEqual([]);
    // Losing and regaining qualification while an activation remains asks once.
    s.sync({ eligible: false });
    s.sync();
    s.frame(6);
    expect({ state: s.mapState(), log: s.take() }).toEqual({ state: 'locking', log: ['request'] });
  });

  it('only locks on a click without a lock: no select for it or its release, and nothing while the request is open', () => {
    const s = setup({ lock: 'idle' });
    s.frame(0);
    s.take();
    s.pointer(absolute('down', clientX(0.5), clientY(0.5)));
    s.pointer(absolute('up', clientX(0.5), clientY(0.5)));
    expect({ state: s.mapState(), log: s.take() }).toEqual({ state: 'locking', log: ['request'] });
    s.pointer(absolute('down', clientX(0.5), clientY(0.5)));
    s.frame(2);
    expect(s.take()).toEqual([]);
    // Confirmed: the cursor starts where it was and nothing is sent until a mouse operation.
    s.state.lock = 'active';
    s.frame(4);
    expect({ state: s.mapState(), hidden: s.state.status?.systemPointerHidden, log: s.take() })
      .toEqual({ state: 'locked', hidden: true, log: [] });
  });

  it('after an Esc unlock stays open waiting, and the next click relocks without selecting', () => {
    const s = locked();
    s.press();
    s.take();
    // The port reported the end: the capabilities set idle and clear the input.
    s.state.lock = 'idle';
    s.input.clear();
    s.state.activation = true;
    s.frame(20);
    s.frame(30);
    s.move(0.1, 0);
    expect({ state: s.mapState(), position: s.position(), log: s.take() }).toEqual({ state: 'click-to-lock', position: FIXED_START, log: [] });
    s.press();
    s.release();
    s.state.lock = 'active';
    s.frame(32);
    expect(s.take()).toEqual(['request']);
    // The press before the relock repeats nothing.
    s.frame(60);
    expect(s.take()).toEqual([]);
  });

  it('exits the lock when it loses qualification: leaving the map, focus, pause, the run or the geometry', () => {
    for (const lose of [
      (s: ReturnType<typeof setup>) => { s.frame(20, { context: 'flight' }); },
      (s: ReturnType<typeof setup>) => { s.sync({ eligible: false }); },
      (s: ReturnType<typeof setup>) => { s.sync({ running: false }); },
      (s: ReturnType<typeof setup>) => { s.sync({ runId: null, context: null }); },
      (s: ReturnType<typeof setup>) => {
        s.state.geometry = { ...GEOMETRY, frame: { ...GEOMETRY.frame, width: 0 } };
        s.frame(20);
      },
    ]) {
      const s = locked();
      lose(s);
      expect(s.take()).toEqual(['exit']);
      expect(s.state.lock).toBe('idle');
    }
  });

  it('qualifies anew only after the cursor was drawn for the current geometry, but keeps a lock across a resize', () => {
    const s = setup({ lock: 'failed', activation: true });
    s.frame(0);
    s.state.geometry = null;
    s.sync();
    s.state.geometry = GEOMETRY;
    s.sync();
    s.pointer(absolute('down', clientX(0.5), clientY(0.5)));
    expect({ state: s.mapState(), log: s.take() }).toEqual({ state: 'not-ready', log: ['start'] });
    s.frame(2);
    s.pointer(absolute('down', clientX(0.5), clientY(0.5)));
    expect({ state: s.mapState(), log: s.take() }).toEqual({ state: 'unlocked', log: ['hover 0.5,0.5 @2', 'select 0.5,0.5 @2'] });

    const t = locked();
    t.state.geometry = { ...GEOMETRY, frame: { left: 0, top: 0, width: 640, height: 480 } };
    t.sync();
    // 50 CSS px, now 320 CSS px per unit.
    t.move(0.125, 0);
    t.frame(12);
    expect({ state: t.mapState(), log: t.take() }).toEqual({ state: 'locked', log: ['hover 0.40625,0.75 @12'] });
  });

  it('forgets where an unlocked pointer was when the geometry changes: shown again, and its repeat ended', () => {
    const s = setup({ lock: 'unsupported' });
    s.frame(10);
    s.pointer(absolute('down', clientX(0.5), clientY(0.5)));
    expect(s.state.status?.systemPointerHidden).toBe(true);
    s.state.geometry = { ...GEOMETRY, frame: { ...GEOMETRY.frame, left: 0 } };
    s.frame(12);
    s.frame(30);
    expect({ hidden: s.state.status?.systemPointerHidden, position: s.position(), log: s.take() })
      .toEqual({ hidden: false, position: at(0.5, 0.5), log: ['start', 'hover 0.5,0.5 @10', 'select 0.5,0.5 @10'] });
  });

  it('falls back to absolute input where Pointer Lock is unsupported or failed, and never asks again by itself', () => {
    for (const lock of ['unsupported', 'failed'] as const) {
      const s = setup({ lock, activation: true });
      s.frame(0);
      s.sync({ eligible: false });
      s.sync();
      expect({ state: s.mapState(), hidden: s.state.status?.systemPointerHidden, log: s.take() })
        .toEqual({ state: 'unlocked', hidden: false, log: ['start'] });
      s.pointer(absolute('move', clientX(0.5), clientY(0.25)));
      expect({ position: s.position(), hidden: s.state.status?.systemPointerHidden }).toEqual({ position: at(0.5, 0.25), hidden: true });
      s.frame(2);
      s.pointer(absolute('down', clientX(0.75), clientY(0.5)));
      s.pointer(absolute('up', clientX(0.75), clientY(0.5)));
      // Black bars, outside the frame, and a right button select nothing, and their release does nothing.
      s.pointer(absolute('down', RECT.left + 50, clientY(0.5)));
      s.pointer(absolute('up', clientX(0.5), clientY(0.5)));
      s.pointer(absolute('down', clientX(0.5), clientY(1.2)));
      s.pointer(absolute('down', clientX(0.5), clientY(0.5), 2));
      s.frame(4);
      expect(s.take()).toEqual(['hover 0.5,0.25 @2', 'hover 0.75,0.5 @2', 'select 0.75,0.5 @2']);
      expect({ position: s.position(), hidden: s.state.status?.systemPointerHidden }).toEqual({ position: at(0.75, 0.5), hidden: false });
    }
  });
});

describe('commands', () => {
  it('merges moves into one hover per running frame, and sends nothing for a frame without a move', () => {
    const s = locked();
    s.move(0.125, 0);
    s.move(0.125, 0.125);
    s.frame(12);
    s.frame(14);
    s.move(-0.125, 0);
    s.move(0.125, 0);
    s.frame(16);
    expect(s.take()).toEqual(['hover 0.5,0.875 @12']);
    // A paused frame drops the pending hover.
    s.move(0, 0.125);
    s.frame(18, { running: false });
    s.frame(20);
    expect(s.take()).toEqual(['exit']);
  });

  it('freezes the position for a new press: the hover it lacks, then the select, in arrival order and never merged', () => {
    const s = locked();
    s.move(0.25, 0);
    s.press();
    s.release();
    s.press();
    s.release();
    s.move(0.25, -0.25);
    s.press();
    s.release();
    s.move(-0.25, 0);
    s.frame(12);
    expect(s.take()).toEqual([
      'hover 0.5,0.75 @10', 'select 0.5,0.75 @10', 'select 0.5,0.75 @10',
      'hover 0.75,0.5 @10', 'select 0.75,0.5 @10', 'hover 0.5,0.5 @12',
    ]);
    // A press after entering or relocking sends the hover of the start position first.
    s.input.clear();
    s.press();
    expect(s.take()).toEqual(['hover 0.5,0.5 @12', 'select 0.5,0.5 @12']);
  });

  it('sends no select after its hover failed, and the next press sends both', () => {
    const s = locked();
    s.state.refuse = (command) => command.type === 'map-point' && command.operation === 'hover';
    s.move(0.25, 0);
    s.press();
    s.frame(30);
    expect(s.take()).toEqual(['!hover 0.5,0.75 @10']);
    s.state.refuse = null;
    s.press();
    expect(s.take()).toEqual(['hover 0.5,0.75 @30', 'select 0.5,0.75 @30']);
  });

  it('moves a locked pointer by the scaled host movement, clamped, and reports an invalid scale', () => {
    const s = locked({ scale: 0.5 });
    s.pointer(relative('move', 2 * 0.25 * CSS_PER_UNIT, -2 * CSS_PER_UNIT));
    expect(s.position()).toEqual(at(0.5, 0));
    s.state.scale = Number.NaN;
    s.pointer(relative('move', 10, 10));
    s.press();
    expect(s.position()).toEqual(at(0.5, 0));
    expect(s.state.errors).toEqual([expect.any(RangeError), expect.any(RangeError)]);
    expect(s.take()).toEqual([]);
  });
});

describe('held left button', () => {
  it('repeats from the press clock c at c + interval, then the observed clock + interval, once a frame, never catching up', () => {
    const s = locked();
    s.press();
    expect(s.take()).toEqual(['hover 0.25,0.75 @10', 'select 0.25,0.75 @10']);
    for (const clock of [12, 14, 16, 16]) s.frame(clock);
    expect(s.take()).toEqual([]);
    s.frame(18);
    s.frame(18);
    expect(s.take()).toEqual(['select 0.25,0.75 @18']);
    // The due frame first sends the pending hover, then selects at the frame's position.
    s.move(0.25, 0);
    s.frame(20);
    s.move(0.25, 0);
    s.frame(26);
    expect(s.take()).toEqual(['hover 0.5,0.75 @20', 'hover 0.75,0.75 @26', 'select 0.75,0.75 @26']);
    // A frame of many ticks past several due clocks selects once; the next is due 8 after it.
    s.frame(70);
    s.frame(76);
    s.frame(78);
    expect(s.take()).toEqual(['select 0.75,0.75 @70', 'select 0.75,0.75 @78']);
    // A paused frame past the due clock does not repeat, and pausing ended the hold.
    s.frame(90, { running: false });
    s.frame(92);
    expect(s.take()).toEqual(['exit']);
  });

  it('takes the policy interval', () => {
    const s = locked({ policy: { start: () => FIXED_START, repeatInterval: 5 } });
    s.press();
    s.frame(14);
    s.frame(15);
    s.frame(19);
    s.frame(20);
    expect(s.take()).toEqual(['hover 0.25,0.75 @10', 'select 0.25,0.75 @10', 'select 0.25,0.75 @15', 'select 0.25,0.75 @20']);
  });

  it('submits nothing on release, and ends the repeat on every listed condition until a new press', () => {
    const ends: readonly [string, (s: ReturnType<typeof setup>) => void][] = [
      ['release', (s) => { s.release(); }],
      ['unlock', (s) => {
        s.state.lock = 'idle';
        s.input.clear();
        s.state.lock = 'active';
      }],
      ['focus loss', (s) => { s.sync({ eligible: false }); s.state.lock = 'active'; s.sync(); }],
      ['pause', (s) => { s.frame(12, { running: false }); s.state.lock = 'active'; }],
      ['stop', (s) => { s.sync({ running: false }); s.state.lock = 'active'; }],
      ['run change', (s) => { s.sync({ runId: 2 }); s.state.lock = 'active'; }],
      ['leaving the map', (s) => { s.frame(12, { context: 'flight' }); s.state.lock = 'active'; }],
      ['geometry loss', (s) => {
        s.state.geometry = null;
        s.frame(12);
        s.state.geometry = GEOMETRY;
        s.state.lock = 'active';
      }],
      ['a failed repeat', (s) => {
        s.state.refuse = () => true;
        s.frame(18);
        s.state.refuse = null;
      }],
      ['a failed due hover', (s) => {
        s.move(0.25, 0);
        s.state.refuse = (command) => command.type === 'map-point' && command.operation === 'hover';
        s.frame(18);
        s.state.refuse = null;
      }],
      ['other button releases do not', (s) => { s.release(2); }],
    ];
    for (const [name, end] of ends) {
      const s = locked();
      s.press();
      end(s);
      s.take();
      s.frame(40);
      s.frame(60);
      const repeats = s.take().filter((entry) => entry.startsWith('select'));
      expect({ name, repeats }).toEqual({ name, repeats: name.startsWith('other') ? ['select 0.25,0.75 @40', 'select 0.25,0.75 @60'] : [] });
    }
  });

  it('ends an unlocked repeat once the pointer leaves the main map; returning does not revive it', () => {
    const s = setup({ lock: 'failed' });
    s.frame(10);
    s.pointer(absolute('down', clientX(0.5), clientY(0.5)));
    s.frame(18);
    s.pointer(absolute('move', clientX(1.01), clientY(0.5)));
    s.pointer(absolute('move', clientX(0.5), clientY(0.5)));
    s.frame(30);
    expect(s.take().filter((entry) => entry.startsWith('select'))).toEqual(['select 0.5,0.5 @10', 'select 0.5,0.5 @18']);
  });
});
