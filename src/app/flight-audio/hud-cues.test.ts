import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssetId } from '../../content/asset-id.ts';
import { SOUND_PAYLOAD_SCHEMA_VERSION } from '../../content/sound-payload.ts';
import type { Projection } from '../../core/projections/projection.ts';
import { createAudioController, type PlayFailureCode } from '../../platform/audio/audio-controller.ts';
import { FakeAudio, FakeLifecycle, sound } from '../../platform/audio/audio-controller.test-support.ts';
import type { TickEvent } from '../runtime/game-runtime.ts';
import { createHudCues, HUD_CUE_SOUNDS, type HudCues, type HudCueTick } from './hud-cues.ts';
import {
  createVoiceLedger, type VoiceClass, type VoiceHandle, type VoiceHandleState, type VoiceLedger, type VoicePlayResult, type VoiceRequest,
} from './voices.ts';

type Cue = 'lock-loop' | 'lock-pulse' | 'instrument-9-missile' | 'instrument-9-craft';
type Outcome = 'started' | 'voice-limit' | PlayFailureCode;

/** A scripted ledger: each play takes its cue's next outcome (default `started`); handles are named `<cue>#<serial>`. */
class FakeLedger implements VoiceLedger {
  readonly calls: string[] = [];
  readonly requests: VoiceRequest[] = [];
  readonly outcomes = new Map<Cue, Outcome[]>();
  readonly states = new Map<VoiceHandle, VoiceHandleState>();
  readonly #names = new Map<VoiceHandle, string>();
  #serial = 0;

  script(cue: Cue, ...outcomes: Outcome[]): void {
    this.outcomes.set(cue, [...(this.outcomes.get(cue) ?? []), ...outcomes]);
  }

  /** The handle a play returned, by its name. */
  handle(name: string): VoiceHandle {
    const found = [...this.#names].find(([, value]) => value === name);
    if (!found) throw new Error(`no handle ${name}`);
    return found[0];
  }

  end(name: string, reason: 'natural' | 'preempted' | 'stopped' | 'interrupted' | 'failed'): void {
    this.states.set(this.handle(name), { status: 'ended', reason });
  }

  take(): string[] {
    return this.calls.splice(0);
  }

  play(request: VoiceRequest): VoicePlayResult {
    if (request.source.namespace !== 'cue') throw new Error('not a cue');
    const { cue } = request.source;
    this.requests.push(request);
    const outcome = this.outcomes.get(cue)?.shift() ?? 'started';
    if (outcome === 'voice-limit') {
      this.calls.push(`refuse ${cue}`);
      return { status: 'refused', code: 'voice-limit', reaped: null };
    }
    if (outcome !== 'started') {
      this.calls.push(`fail ${cue} ${outcome}`);
      return { status: 'failed', code: outcome, reaped: null, preempted: null };
    }
    const handle: VoiceHandle = Object.freeze({ ownerId: 1, runId: 1, serial: ++this.#serial });
    const name = `${cue}#${this.#serial}`;
    this.#names.set(handle, name);
    this.calls.push(`play ${name}`);
    return { status: 'started', handle, record: 0, reaped: null, preempted: null };
  }

  query(handle: VoiceHandle): VoiceHandleState {
    return this.states.get(handle) ?? { status: 'playing' };
  }

  stop(handle: VoiceHandle): boolean {
    this.calls.push(`stop ${this.#names.get(handle)}`);
    const held = this.query(handle).status === 'playing';
    this.states.set(handle, { status: 'ended', reason: 'stopped' });
    return held;
  }

  stopAll(): void {
    for (const handle of this.#names.keys()) if (this.query(handle).status === 'playing') this.states.set(handle, { status: 'ended', reason: 'stopped' });
  }

  update(): never {
    throw new Error('the HUD cues never update a voice');
  }

  counts(): Readonly<Record<VoiceClass, number>> {
    return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  }

  dispose(): void {}
}

interface Frame {
  readonly view?: number;
  readonly sub?: number;
  readonly clock?: number;
  /** The lock progress of a live target; `inactive` gives a target below state 7, `none` no target. */
  readonly progress?: number;
  readonly target?: 'live' | 'inactive' | 'none';
  readonly combat?: 'player' | 'no-player' | 'not-implemented';
  readonly communications?: 'ready' | 'not-implemented';
  readonly missile?: boolean;
  readonly craft?: boolean;
  /** `view-switched` events of the tick, by the view they enter. */
  readonly switches?: readonly number[];
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}

/** A synthetic, frozen tick output holding only what the cues read. */
function output(tick: number, frame: Frame = {}): HudCueTick {
  const { view = 0x0c, sub = 0, clock = tick * 2, progress = -1, target = 'live', combat = 'player', communications = 'ready' } = frame;
  const player = {
    entityId: 1,
    target: target === 'none' ? null : { entityId: 2, activeState: target === 'live' },
    lock: { level: 2, losing: false, progress },
  };
  const projection = {
    clock: { tick, clock, clockUnitsPerTick: 2 },
    player: { entityId: 1, viewMode: view, previousViewMode: view, subMode: sub, interactionContext: 'flight' },
    flight: { combat: combat === 'not-implemented' ? { readiness: 'not-implemented' } : { readiness: 'ready', player: combat === 'player' ? player : null } },
    communications: communications === 'not-implemented'
      ? { readiness: 'not-implemented' }
      : { readiness: 'ready', player: null, warnings: { missileIncoming: frame.missile ?? false, attackerOnTail: frame.craft ?? false } },
  } as unknown as Projection;
  const events = (frame.switches ?? []).map(viewMode => ({
    event: { type: 'view-switched', tick, fromViewMode: view, fromSubMode: sub, viewMode, subMode: 0, stage: 'player-update', player: null },
    commandId: null,
  })) as unknown as TickEvent[];
  return deepFreeze({ tick, projection, events });
}

function setup() {
  const ledger = new FakeLedger();
  let cues: HudCues = createHudCues(ledger);
  let tick = 0;
  /** One tick's DW-04 steps 1 and 4, at the next tick; the clock is twice the tick unless given. */
  const step = (frame: Frame = {}): string[] => {
    tick += 1;
    const out = output(tick, frame);
    cues.beforeDispatch(out);
    cues.afterDispatch(out);
    return ledger.take();
  };
  const newRun = () => {
    cues = createHudCues(ledger);
    tick = 0;
  };
  return { ledger, step, newRun, cues: () => cues };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('lock tone (A-06)', () => {
  it('follows the four transitions: nothing while the value holds, the loop at 0, a pulse on a change after the due, all off at −1', () => {
    const { ledger, step } = setup();
    expect(step({ target: 'none' })).toEqual([]);
    expect(step({ progress: 0, clock: 10 })).toEqual(['play lock-loop#1']);
    expect(step({ progress: 0, clock: 400 })).toEqual([]);
    // A change to a positive value after the due (0 < 402): stop the loop, one pulse, due := 402 + (61 >> 1).
    expect(step({ progress: 61, clock: 402 })).toEqual(['stop lock-loop#1', 'play lock-pulse#2']);
    // Changes before or at the due only record the value (strict comparison).
    expect(step({ progress: 58, clock: 420 })).toEqual([]);
    expect(step({ progress: 57, clock: 432 })).toEqual([]);
    // After the due: the previous pulse is overwritten, not stopped; the stale loop handle is stopped again.
    expect(step({ progress: 56, clock: 433 })).toEqual(['stop lock-loop#1', 'play lock-pulse#3']);
    // However long the value holds after its due, nothing plays.
    expect(step({ progress: 56, clock: 5_000 })).toEqual([]);
    expect(step({ progress: 56, clock: 9_000 })).toEqual([]);
    // A target that became invalid: both stopped and cleared; the next −1 does nothing.
    expect(step({ target: 'none', clock: 9_002 })).toEqual(['stop lock-pulse#3', 'stop lock-loop#1']);
    expect(step({ target: 'none', clock: 9_004 })).toEqual([]);
    expect(ledger.requests.map(({ sound, voiceClass, preempt, parameters }) => [sound, voiceClass, preempt, parameters])).toEqual([
      [HUD_CUE_SOUNDS.lockLoop, 4, true, undefined],
      [HUD_CUE_SOUNDS.lockPulse, 4, true, undefined],
      [HUD_CUE_SOUNDS.lockPulse, 4, true, undefined],
    ]);
  });

  it('reads −1 for a target below state 7 whatever its progress, and starts the pulse only strictly after the initial due 0', () => {
    const { step } = setup();
    expect(step({ progress: 0, target: 'inactive' })).toEqual([]);
    expect(step({ progress: 80, clock: 0 })).toEqual([]);
    expect(step({ progress: 0, clock: 2 })).toEqual(['play lock-loop#1']);
    expect(step({ progress: 0, target: 'inactive', clock: 4 })).toEqual(['stop lock-loop#1']);
    expect(step({ progress: 100, clock: 6 })).toEqual(['play lock-pulse#2']);
  });

  it('keeps the loop through a positive value before the due, and starts an untracked second loop on the next 0', () => {
    const { step } = setup();
    expect(step({ progress: 70, clock: 10 })).toEqual(['play lock-pulse#1']);
    expect(step({ progress: 0, clock: 12 })).toEqual(['stop lock-pulse#1', 'play lock-loop#2']);
    expect(step({ progress: 30, clock: 14 })).toEqual([]);
    expect(step({ progress: 0, clock: 16 })).toEqual(['stop lock-pulse#1', 'play lock-loop#3']);
    expect(step({ target: 'none', clock: 18 })).toEqual(['stop lock-pulse#1', 'stop lock-loop#3']);
  });

  it('sets the due time although the pulse failed to start, and never retries the pulse', () => {
    const { ledger, step } = setup();
    ledger.script('lock-pulse', 'audio-suspended');
    expect(step({ progress: 40, clock: 10 })).toEqual(['fail lock-pulse audio-suspended']);
    expect(step({ progress: 40, clock: 100 })).toEqual([]);
    expect(step({ progress: 38, clock: 30 })).toEqual([]);
    expect(step({ progress: 36, clock: 31 })).toEqual(['play lock-pulse#1']);
  });

  it('is called with −1 by a switch into the Warp view and frozen in views 1, 6, 8 and 0x13', () => {
    const { step } = setup();
    expect(step({ progress: 0 })).toEqual(['play lock-loop#1']);
    // Map from flight: not called, the loop keeps sounding and the value is kept.
    expect(step({ progress: 0, switches: [8], view: 8 })).toEqual([]);
    expect(step({ progress: 60, view: 8 })).toEqual([]);
    expect(step({ progress: 0 })).toEqual([]);
    // The switch into Warp stops both voices before the dispatch, even with a live target.
    expect(step({ progress: 0, switches: [1], view: 1 })).toEqual(['stop lock-loop#1']);
    for (const view of [1, 6, 8, 0x13]) expect(step({ progress: 0, view })).toEqual([]);
    expect(step({ progress: 0, switches: [0x0c] })).toEqual(['play lock-loop#2']);
    // Other views of the original's 0xC–0x12 range that the project does not show do not call it either.
    expect(step({ target: 'none', view: 0x0d })).toEqual([]);
  });

  it('is called in the destruction view only at sub-mode 8, and only with a combat player', () => {
    const { step } = setup();
    expect(step({ progress: 0, view: 0x11, sub: 8 })).toEqual(['play lock-loop#1']);
    expect(step({ target: 'none', view: 0x11, sub: 0 })).toEqual([]);
    expect(step({ combat: 'no-player' })).toEqual([]);
    expect(step({ target: 'none', view: 0x11, sub: 8 })).toEqual(['stop lock-loop#1']);
  });

  it('stops nothing in the Warp switch beyond the lock tone, and the switch call itself starts nothing', () => {
    const { step } = setup();
    expect(step({ craft: true, switches: [1], view: 1 })).toEqual(['play instrument-9-craft#1']);
  });
});

describe('instrument-9 warning (A-07)', () => {
  it('gives the missile voice priority and replaces the craft voice; the craft voice takes over in the call the missile flag clears', () => {
    const { ledger, step } = setup();
    expect(step({ craft: true })).toEqual(['play instrument-9-craft#1']);
    expect(step({ craft: true })).toEqual([]);
    expect(step({ craft: true, missile: true })).toEqual(['stop instrument-9-craft#1', 'play instrument-9-missile#2']);
    expect(step({ craft: true, missile: true })).toEqual([]);
    expect(step({ craft: true })).toEqual(['stop instrument-9-missile#2', 'play instrument-9-craft#3']);
    expect(step({})).toEqual(['stop instrument-9-craft#3']);
    expect(step({ missile: true })).toEqual(['play instrument-9-missile#4']);
    expect(step({})).toEqual(['stop instrument-9-missile#4']);
    expect(ledger.requests.map(({ sound, voiceClass, preempt, parameters }) => [sound, voiceClass, preempt, parameters])).toEqual([
      [HUD_CUE_SOUNDS.instrument9, 4, false, { volume: 50 }],
      [HUD_CUE_SOUNDS.instrument9, 4, false, { rate: 22_000, volume: 127 }],
      [HUD_CUE_SOUNDS.instrument9, 4, false, { volume: 50 }],
      [HUD_CUE_SOUNDS.instrument9, 4, false, { rate: 22_000, volume: 127 }],
    ]);
  });

  it('retries a failed or refused start at every call, the craft voice sounding while the missile start fails', () => {
    const { ledger, step } = setup();
    ledger.script('instrument-9-craft', 'voice-limit', 'audio-failed');
    expect(step({ craft: true })).toEqual(['refuse instrument-9-craft']);
    expect(step({ craft: true })).toEqual(['fail instrument-9-craft audio-failed']);
    expect(step({ craft: true })).toEqual(['play instrument-9-craft#1']);
    ledger.script('instrument-9-missile', 'voice-limit');
    expect(step({ craft: true, missile: true })).toEqual(['stop instrument-9-craft#1', 'refuse instrument-9-missile', 'play instrument-9-craft#2']);
    expect(step({ craft: true, missile: true })).toEqual(['stop instrument-9-craft#2', 'play instrument-9-missile#3']);
  });

  it('is called in views 1, 6, 8, 0xC and 0x11 and not in 0x13, holding its voices there', () => {
    const { step } = setup();
    expect(step({ missile: true, view: 0x13 })).toEqual([]);
    for (const [index, [view, sub]] of [[1, 0], [6, 0], [8, 0], [0x0c, 0], [0x11, 8], [0x11, 0]].entries()) {
      expect(step({ missile: index % 2 === 0, view, sub })).toEqual([index % 2 === 0 ? `play instrument-9-missile#${index / 2 + 1}` : `stop instrument-9-missile#${(index + 1) / 2}`]);
    }
    expect(step({ missile: true })).toEqual(['play instrument-9-missile#4']);
    expect(step({ view: 0x13 })).toEqual([]);
  });

  it('runs after the lock tone in one tick', () => {
    const { step } = setup();
    expect(step({ progress: 0, missile: true })).toEqual(['play lock-loop#1', 'play instrument-9-missile#2']);
  });
});

describe('HUD cue ticks', () => {
  it('advances each tick once: a repeated call of the same tick, and a frame without ticks, do nothing', () => {
    const { ledger, cues } = setup();
    const first = output(1, { progress: 0, craft: true });
    cues().beforeDispatch(first);
    cues().afterDispatch(first);
    expect(ledger.take()).toEqual(['play lock-loop#1', 'play instrument-9-craft#2']);
    ledger.end('lock-loop#1', 'interrupted');
    cues().beforeDispatch(first);
    cues().afterDispatch(first);
    expect(ledger.take()).toEqual([]);
    const warp = output(2, { progress: 0, craft: true, switches: [1], view: 1 });
    cues().beforeDispatch(warp);
    cues().beforeDispatch(warp);
    expect(ledger.take()).toEqual(['stop lock-loop#1']);
    cues().afterDispatch(warp);
    cues().afterDispatch(warp);
    expect(ledger.take()).toEqual([]);
  });

  it('refuses a tick out of order or a dispatch step without its first step', () => {
    const { cues } = setup();
    expect(() => cues().afterDispatch(output(1))).toThrow(/before-dispatch/);
    cues().beforeDispatch(output(1));
    expect(() => cues().beforeDispatch(output(2))).toThrow(/not complete/);
    cues().afterDispatch(output(1));
    expect(() => cues().beforeDispatch(output(0))).toThrow(/in order/);
    cues().beforeDispatch(output(3));
    expect(() => cues().afterDispatch(output(2))).toThrow(/before-dispatch/);
  });

  it('treats a group that is not implemented as a contract error, not as no threat, only where it is read', () => {
    const { step } = setup();
    expect(() => step({ combat: 'not-implemented' })).toThrow(/combat group/);
    expect(() => step({ communications: 'not-implemented', view: 8 })).toThrow(/communications/);
    expect(step({ combat: 'not-implemented', communications: 'not-implemented', view: 0x13 })).toEqual([]);
    expect(step({ combat: 'not-implemented', view: 8 })).toEqual([]);
  });

  it('draws no random numbers and reads no host time', () => {
    const random = vi.spyOn(Math, 'random');
    const now = vi.spyOn(Date, 'now');
    const performanceNow = vi.spyOn(performance, 'now');
    const { step } = setup();
    step({ progress: 0, craft: true });
    step({ progress: 90, missile: true, clock: 500 });
    step({ target: 'none', switches: [1] });
    expect([random, now, performanceNow].map(spy => spy.mock.calls.length)).toEqual([0, 0, 0]);
  });

  it('starts each new run from the initial values', () => {
    const { step, newRun } = setup();
    expect(step({ progress: 0, missile: true })).toEqual(['play lock-loop#1', 'play instrument-9-missile#2']);
    expect(step({ progress: 90, missile: true, clock: 1_000 })).toEqual(['stop lock-loop#1', 'play lock-pulse#3']);
    newRun();
    // The previous value −1, due 0 and empty handles: the same readings start everything again.
    expect(step({ progress: 0, missile: true })).toEqual(['play lock-loop#4', 'play instrument-9-missile#5']);
    newRun();
    expect(step({ progress: 90, clock: 2 })).toEqual(['play lock-pulse#6']);
  });
});

describe('HUD cue recovery (D1-08 (c))', () => {
  it('does not restart a voice ended for an in-game reason while its condition holds', () => {
    const { ledger, step } = setup();
    expect(step({ progress: 0, craft: true })).toEqual(['play lock-loop#1', 'play instrument-9-craft#2']);
    ledger.stopAll();
    expect(step({ progress: 0, craft: true })).toEqual([]);
    expect(step({ progress: 0, missile: true })).toEqual(['stop instrument-9-craft#2', 'play instrument-9-missile#3']);
    for (const reason of ['natural', 'preempted', 'stopped', 'failed'] as const) {
      ledger.end('instrument-9-missile#3', reason);
      ledger.end('lock-loop#1', reason);
      expect(step({ progress: 0, missile: true })).toEqual([]);
    }
    // A stale handle is harmless at the next change to −1.
    expect(step({ target: 'none', missile: true })).toEqual(['stop lock-loop#1']);
  });

  it('rebuilds the loops that should sound after an interruption, at their next call, and never a pulse', () => {
    const { ledger, step } = setup();
    expect(step({ progress: 0, missile: true })).toEqual(['play lock-loop#1', 'play instrument-9-missile#2']);
    ledger.end('lock-loop#1', 'interrupted');
    ledger.end('instrument-9-missile#2', 'interrupted');
    // In the map the lock tone is not called; the warning is.
    expect(step({ progress: 0, missile: true, view: 8 })).toEqual(['play instrument-9-missile#3']);
    expect(step({ progress: 0, missile: true })).toEqual(['play lock-loop#4']);
    expect(step({ progress: 0, missile: true })).toEqual([]);
    expect(ledger.requests.at(2)).toMatchObject({ parameters: { rate: 22_000, volume: 127 } });
    expect(step({ progress: 0, craft: true })).toEqual(['stop instrument-9-missile#3', 'play instrument-9-craft#5']);
    ledger.end('instrument-9-craft#5', 'interrupted');
    expect(step({ progress: 0, craft: true })).toEqual(['play instrument-9-craft#6']);
    // An interrupted pulse, or a loop that should no longer sound, is not rebuilt.
    expect(step({ progress: 50, clock: 1_000, craft: true })).toEqual(['stop lock-loop#4', 'play lock-pulse#7']);
    ledger.end('lock-pulse#7', 'interrupted');
    expect(step({ progress: 50, clock: 2_000, craft: true })).toEqual([]);
    // A cleared flag stops its handle, also an interrupted one, and starts nothing.
    ledger.end('instrument-9-craft#6', 'interrupted');
    expect(step({ progress: 50, clock: 2_002 })).toEqual(['stop instrument-9-craft#6']);
  });

  it.each(['audio-locked', 'audio-suspended', 'audio-unavailable', 'audio-paused'] as const)(
    'retries a loop start rejected with %s until the controller plays, while the value holds at 0',
    code => {
      const { ledger, step } = setup();
      ledger.script('lock-loop', code, code);
      expect(step({ progress: 0 })).toEqual([`fail lock-loop ${code}`]);
      expect(step({ progress: 0, view: 8 })).toEqual([]);
      expect(step({ progress: 0 })).toEqual([`fail lock-loop ${code}`]);
      expect(step({ progress: 0 })).toEqual(['play lock-loop#1']);
      expect(step({ progress: 0 })).toEqual([]);
      // A change of value ends the retry.
      ledger.script('lock-loop', code);
      expect(step({ target: 'none' })).toEqual(['stop lock-loop#1']);
      expect(step({ progress: 0 })).toEqual([`fail lock-loop ${code}`]);
      expect(step({ progress: 20, clock: 0 })).toEqual([]);
      expect(step({ progress: 20 })).toEqual([]);
    },
  );

  it.each(['audio-failed', 'unknown-sound', 'disposed', 'voice-limit'] as const)('does not retry a loop start that failed with %s until the value changes', code => {
    const { ledger, step } = setup();
    ledger.script('lock-loop', code);
    expect(step({ progress: 0 })).toEqual([code === 'voice-limit' ? 'refuse lock-loop' : `fail lock-loop ${code}`]);
    expect(step({ progress: 0 })).toEqual([]);
    expect(step({ target: 'none' })).toEqual([]);
    expect(step({ progress: 0 })).toEqual(['play lock-loop#1']);
  });
});

describe('HUD cues over the real voice ledger', () => {
  const NAMES = Object.values(HUD_CUE_SOUNDS);

  function real(state: 'running' | 'locked') {
    const audio = new FakeAudio();
    audio.initialState = 'running';
    const lifecycle = new FakeLifecycle();
    const controller = createAudioController({ audio, lifecycle, reportError: error => { throw error; } });
    const records = NAMES.map((id: AssetId) => ({ id, schemaVersion: SOUND_PAYLOAD_SCHEMA_VERSION, bytes: sound() }));
    expect(controller.load(records)).toEqual({ status: 'loaded', count: NAMES.length });
    if (state === 'running') expect(controller.unlock()).toBe('running');
    const ledger = createVoiceLedger({ controller, ownerId: 7, runId: 3 });
    const cues = createHudCues(ledger);
    let tick = 0;
    const step = (frame: Frame = {}) => {
      tick += 1;
      const out = output(tick, frame);
      cues.beforeDispatch(out);
      cues.afterDispatch(out);
    };
    return { audio, lifecycle, controller, ledger, step };
  }

  it('rebuilds the sounding loops after hiding but not after a stop of every voice', () => {
    const { audio, lifecycle, controller, ledger, step } = real('running');
    step({ progress: 0, missile: true });
    expect([controller.getSnapshot().voices, ledger.counts()[4]]).toEqual([2, 2]);
    ledger.stopAll();
    step({ progress: 0, missile: true });
    expect(controller.getSnapshot().voices).toBe(0);
    // A new condition starts its voice; the stale lock loop handle stays silent.
    step({ progress: 0, craft: true });
    expect(controller.getSnapshot().voices).toBe(1);
    step({ progress: 0, missile: true });
    expect(controller.getSnapshot().voices).toBe(1);
    lifecycle.hide();
    expect(controller.getSnapshot().voices).toBe(0);
    // While suspended the rebuild is rejected and stays due.
    step({ progress: 0, missile: true });
    expect(controller.getSnapshot().voices).toBe(0);
    lifecycle.show();
    audio.context.setState('running');
    step({ progress: 0, missile: true });
    expect([controller.getSnapshot().voices, ledger.counts()[4]]).toEqual([1, 1]);
    // The lock loop ended by the stop of every voice before the hiding: an in-game end, not rebuilt.
    step({ target: 'none', missile: true });
    step({ progress: 0, missile: true });
    expect([controller.getSnapshot().voices, ledger.counts()[4]]).toEqual([2, 2]);
  });

  it('starts the lock loop once the controller is unlocked', () => {
    const { controller, step } = real('locked');
    step({ progress: 0 });
    expect(controller.getSnapshot()).toMatchObject({ status: 'idle', voices: 0 });
    expect(controller.unlock()).toBe('running');
    step({ progress: 0 });
    expect(controller.getSnapshot().voices).toBe(1);
  });
});
