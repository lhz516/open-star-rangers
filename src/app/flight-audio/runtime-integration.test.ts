import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SOUND_PAYLOAD_SCHEMA_VERSION } from '../../content/sound-payload.ts';
import type { DomainEvent } from '../../core/contracts/domain-events.ts';
import type { Command } from '../../core/contracts/tick-input.ts';
import type { Recording } from '../../core/replay/recording.ts';
import { replayRecord } from '../../core/replay/replay.ts';
import { contentOf, roundTrip } from '../../core/replay/replay.test-support.ts';
import { createAudioController } from '../../platform/audio/audio-controller.ts';
import { FakeAudio, FakeLifecycle, sound, type FakeContext } from '../../platform/audio/audio-controller.test-support.ts';
import type { GameIntent } from '../runtime/game-runtime.ts';
import { NEUTRAL_AXES, recordingOptions, TICK_MS } from '../runtime/game-runtime.test-support.ts';
import type { GameCommandsCancelled, GameRunSpec, GameSessionRun } from '../session/game-session.ts';
import { current, sessionSetup } from '../session/game-session.test-support.ts';
import { GameSessionError } from '../session/session-errors.ts';
import { attachRunAudio, FlightSoundConsumerError, type AudioPresentation, type FlightSoundDecision } from './consumer.ts';
import { CONTENT, combatRunSpec, OWNER, realPresentation, type InputOrder } from './consumer.test-support.ts';
import { EVENT_SOUNDS } from './events.ts';
import { HUD_CUE_SOUNDS } from './hud-cues.ts';

// P3-14/21 (docs/plan/p3/14/spec.md S-04, AC-03, AC-13): the flight sound consumer on the formal notification and input
// chain. A controllable SessionHost drives the real Session, Runtime and Core of the synthetic combat world through
// multi-tick, zero-tick and capped frames, a user pause and a hidden pause, cancelled commands, held fire and input
// cleared on focus loss, while P3-12's real presentation module and the consumer, over a real audio controller on fake
// host capabilities, take each frame. The consumer reads the run's frames and the presentation's ticks only: it submits
// no command or intent, steps nothing, schedules no frame or timer, and handles each executed tick once inside the frame
// that ran it. Host audio callbacks (voices ending, the context suspended or interrupted, the page lifecycle) at any
// point of the chain, and a broken sound contract, leave what Core executed and recorded as it was.

type Step =
  | number
  | 'pause' | 'resume' | 'hide' | 'show' | 'focus-loss'
  | { readonly intent: GameIntent }
  | { readonly commands: readonly Command[] };

const FIRE: Command = { type: 'fire', channel: 'primary' };
const MISSILE: Command = { type: 'fire', channel: 'secondary' };
const DOOMED: Command = { type: 'cockpit-front' };
const repeat = (steps: readonly Step[], times: number): Step[] => Array.from({ length: times }, () => steps).flat();

const PLAN: readonly Step[] = [
  1, 1, 1, { commands: [FIRE] }, 1, { commands: [{ type: 'target', operation: 'enemy' }] }, 2, 0, 3,
  { intent: { axes: { pitch: 0.25, yaw: -0.5, roll: 0 }, primaryFire: true } }, { commands: [MISSILE, DOOMED] }, 5, 6.5,
  { commands: [DOOMED, DOOMED] }, 'pause', 'resume', 0.5, 2, { commands: [FIRE, DOOMED] }, 'hide', 'show', 'resume',
  ...repeat([4, { commands: [FIRE] }, 1], 6), { intent: { axes: { pitch: -1, yaw: 0, roll: 0.5 }, primaryFire: false } },
  { commands: [DOOMED] }, 'focus-loss', ...repeat([2, 0, 3, { commands: [MISSILE] }], 6), { intent: { axes: NEUTRAL_AXES, primaryFire: true } }, ...repeat([5], 6),
];

interface Options {
  /** Wires the run's sound; false runs Core with the presentation module only. */
  readonly sound?: boolean;
  readonly order?: InputOrder;
  /** Hands the consumer the frame that runs this tick twice, breaking its pairing contract. */
  readonly breakAt?: number;
  /** Host audio callbacks from inside the Session's own notifications and controls, out of step with the page. */
  readonly callbacks?: boolean;
}

/** `target` with each member read recorded in `accessed`, and `overrides` in place of its members. */
function watched<T extends object>(target: T, accessed: Set<PropertyKey>, overrides: Partial<T> = {}): T {
  return new Proxy(target, {
    get(object, key) {
      accessed.add(key);
      const value: unknown = Reflect.get(key in overrides ? overrides : object, key, object);
      return typeof value === 'function' ? value.bind(object) : value;
    },
  });
}

/**
 * Hands each `onFrame` listener the frame that runs tick `breakAt` twice; `atBreak` receives the run's recording
 * between the two.
 */
const breakingFrames = (run: GameSessionRun, breakAt: number, atBreak: (recording: Recording | null) => void): Partial<GameSessionRun> => ({
  onFrame: (listener) => run.onFrame((frame) => {
    listener(frame);
    if (!frame.report?.outputs.some(({ tick }) => tick === breakAt)) return;
    atBreak(run.exportRecording());
    listener(frame);
  }),
});

function play({ sound: wired = true, order = 'outputs-first', breakAt, callbacks = false }: Options = {}) {
  const spec = { ...combatRunSpec(), recording: recordingOptions(4) } as GameRunSpec;
  const { session, host, errors } = sessionSetup();
  session.control({ type: 'start', spec });
  const run = current(session);
  const delivered: DomainEvent[] = [];
  const cancelled: GameCommandsCancelled[] = [];
  /** Each delivered frame's executed ticks, by delivery. */
  const frames: number[][] = [];
  let delivery: number | null = null;
  run.onAny((event) => { delivered.push(event); });
  run.onCommandsCancelled((notice) => { cancelled.push(notice); });
  run.onFrame(({ report }) => { if (delivery !== null) frames[delivery].push(...(report?.outputs ?? []).map(({ tick }) => tick)); });

  const audio = new FakeAudio();
  audio.initialState = 'running';
  const lifecycle = new FakeLifecycle();
  const reported: unknown[] = [];
  const controller = createAudioController({ audio, lifecycle, reportError: (error) => { reported.push(error); } });
  const ids = [...new Set([...CONTENT.sounds, ...Object.values(EVENT_SOUNDS), ...Object.values(HUD_CUE_SOUNDS)])];
  expect(controller.load(ids.map(id => ({ id, schemaVersion: SOUND_PAYLOAD_SCHEMA_VERSION, bytes: sound() }))).status).toBe('loaded');
  controller.unlock();
  const context = (): FakeContext => audio.contexts[0];
  let notices = 0;
  controller.subscribe(() => { notices++; });
  /** The host reports the end of the oldest live voice. */
  const endOne = (): void => { context().voices.find(voice => voice.ended.size > 0)?.end(); };

  const flight = realPresentation(run, run.renderFrame().current);
  const runReads = new Set<PropertyKey>();
  const portReads = new Set<PropertyKey>();
  /** Each decision with the delivery it was made in, null outside one. */
  const decisions: (readonly [number | null, FlightSoundDecision])[] = [];
  if (order === 'presentation-first') flight.connect();
  if (wired) {
    const overrides = breakAt === undefined ? {} : breakingFrames(run, breakAt, (recording) => { atBreak = recording; });
    attachRunAudio(watched(run, runReads, overrides), {
      ownerId: OWNER, content: CONTENT, controller, presentation: watched<AudioPresentation>(flight.presentation, portReads), record: (decision) => { decisions.push([delivery, decision]); },
    });
  }
  if (order === 'outputs-first') flight.connect();
  if (callbacks) {
    // Voices end while the Session delivers events, reports cancellations and changes status, before the frame's consumers.
    run.onAny(() => { endOne(); });
    run.onCommandsCancelled(() => { endOne(); });
    session.onStatus(() => { endOne(); });
  }

  let now = 0;
  const submitted: number[] = [];
  /** The recording just before the frame that broke the sound, and within it before the sound broke, if any. */
  let beforeBreak: Recording | null = null;
  let atBreak = null as Recording | null;
  const deliver = (): void => {
    delivery = frames.push([]) - 1;
    try {
      host.deliver(now);
    } finally {
      delivery = null;
    }
  };
  deliver();
  let frame = 0;
  for (const step of PLAN) {
    if (session.status().phase === 'faulted') break;
    if (typeof step === 'number') {
      if (breakAt !== undefined && (run.renderFrame().current.tick < breakAt)) beforeBreak = run.exportRecording();
      frame++;
      if (callbacks && frame % 3 === 0) endOne();
      // The browser interrupts the context for frames 20 to 25.
      if (callbacks && frame === 20) context().setState('interrupted');
      if (callbacks && frame === 26) context().setState('running');
      now += step * TICK_MS;
      deliver();
    } else if (step === 'pause') {
      session.control({ type: 'pause' });
      controller.pause();
      context().setState('suspended');
      now += 5000;
    } else if (step === 'resume') {
      session.control({ type: 'resume' });
      controller.resume();
      context().setState('running');
      deliver();
    } else if (step === 'hide') {
      // With `callbacks`, the page's audio lifecycle hides ahead of the Session and shows after it.
      if (callbacks) lifecycle.hide();
      host.emit({ type: 'visibility', visibility: 'hidden' });
      if (!callbacks) lifecycle.hide();
      now += 1234;
    } else if (step === 'show') {
      host.emit({ type: 'visibility', visibility: 'visible' });
      lifecycle.show();
      context().setState('running');
    } else if (step === 'focus-loss') {
      session.control({ type: 'clear-input', reason: 'focus-loss' });
    } else if ('intent' in step) {
      run.setIntent(step.intent);
    } else {
      for (const command of step.commands) submitted.push(run.submitCommand(command));
    }
  }
  const phase = session.status().phase;
  return {
    spec, phase, errors, delivered, cancelled, frames, submitted, requests: host.callbacks.length, decisions, runReads, portReads,
    recording: phase === 'faulted' ? null : run.exportRecording(), beforeBreak, atBreak,
    presentation: flight.ticks, voices: controller.getSnapshot().voices, notices, reported,
  };
}

type Played = ReturnType<typeof play>;

/** What the Session executed and reported: the sound may change none of it. */
const chainOf = ({ phase, errors, delivered, cancelled, frames, submitted, requests, recording }: Played) =>
  ({ phase, errors, delivered, cancelled, frames, submitted, requests, recording });

const started = (decisions: Played['decisions']) => decisions.filter(([, { result }]) => result === 'started');

describe('the flight sound on the formal notification and input chain', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'setImmediate', 'queueMicrotask', 'requestAnimationFrame', 'requestIdleCallback'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads only the run\'s frames and the presentation\'s ticks: no command, intent, step, frame request or timer (AC-13)', () => {
    const silent = play({ sound: false });
    expect(vi.getTimerCount()).toBe(0);
    for (const order of ['outputs-first', 'presentation-first'] as const) {
      const sounding = play({ order });
      expect(vi.getTimerCount(), order).toBe(0);
      expect(sounding.errors, order).toEqual([]);
      expect(sounding.reported, order).toEqual([]);
      expect(started(sounding.decisions).length, order).toBeGreaterThan(10);
      expect(chainOf(sounding), order).toEqual(chainOf(silent));
      expect(sounding.presentation, order).toEqual(silent.presentation);
      expect([...sounding.runReads].sort(), order).toEqual(['onFrame', 'ownCleanup', 'renderFrame', 'runId']);
      expect([...sounding.portReads].sort(), order).toEqual(['camera', 'ownerId', 'runId', 'subscribe']);
    }
    // The run did run the chain the test claims: cancelled commands, held fire, multi-tick, zero-tick and capped frames.
    expect(silent.cancelled.map(({ reason }) => reason)).toEqual(['user-pause', 'hidden', 'focus-loss']);
    expect(silent.frames.some(ticks => ticks.length === 0)).toBe(true);
    expect(silent.frames.some(ticks => ticks.length === 5)).toBe(true);
    expect(silent.recording?.record.ticks.some(({ commands }) => commands.some(command => command.type === 'fire' && command.channel === 'primary'))).toBe(true);
    const { record, result } = silent.recording!;
    expect(replayRecord(roundTrip(record), contentOf(silent.spec as never))).toEqual(result);
  });

  it('handles each executed tick once, in order, inside the frame that ran it, and nothing between frames', () => {
    const { decisions, frames } = play({ order: 'presentation-first' });
    expect(decisions.every(([delivery]) => delivery !== null)).toBe(true);
    for (const [delivery, { tick }] of decisions) expect(frames[delivery!], `tick ${tick}`).toContain(tick);
    const ticks = decisions.map(([, { tick }]) => tick);
    expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
    // Frames without ticks (still frames, a resume's anchor, a zero-tick frame) give no decision.
    for (const [delivery, ticksOfFrame] of frames.entries()) if (ticksOfFrame.length === 0) expect(decisions.filter(([at]) => at === delivery)).toEqual([]);
  });

  it('keeps the chain when voices end and the audio host changes state inside the Session\'s own notifications', () => {
    const silent = play({ sound: false });
    const reference = play();
    const shaken = play({ callbacks: true });
    expect(shaken.errors).toEqual([]);
    expect(shaken.notices).toBeGreaterThan(reference.notices);
    expect(shaken.decisions.map(([, decision]) => decision)).not.toEqual(reference.decisions.map(([, decision]) => decision));
    expect(shaken.decisions.some(([, { code }]) => code === 'audio-suspended')).toBe(true);
    expect(chainOf(shaken)).toEqual(chainOf(silent));
    expect(shaken.presentation).toEqual(silent.presentation);
  });

  it('faults the run at a broken sound contract, leaving what Core already executed and recorded as it was', () => {
    const silent = play({ sound: false });
    const broken = play({ breakAt: 30 });
    expect(broken.phase).toBe('faulted');
    expect(broken.errors).toHaveLength(1);
    const [error] = broken.errors;
    expect(error).toBeInstanceOf(GameSessionError);
    expect(error.failures?.map(({ phase }) => phase)).toEqual(['consumer']);
    expect(error.failures?.[0].cause).toBeInstanceOf(FlightSoundConsumerError);
    expect((error.failures?.[0].cause as FlightSoundConsumerError).failure).toBe('pairing');
    // The sound ended with the fault: nothing sounds, nothing more is decided.
    expect(broken.voices).toBe(0);
    const last = broken.frames.findLastIndex(ticks => ticks.length > 0);
    expect(broken.frames[last]).toContain(30);
    const lastTick = broken.frames[last].at(-1)!;
    expect(broken.decisions.every(([, { tick }]) => tick <= lastTick)).toBe(true);
    // Core ran the breaking frame's ticks exactly as without sound, and nothing after.
    expect(broken.delivered).toEqual(silent.delivered.filter(({ tick }) => tick <= lastTick));
    expect(broken.frames.flat()).toEqual(silent.frames.flat().filter(tick => tick <= lastTick));
    // The recordings before that frame and through its ticks are prefixes of the silent run's, and replay.
    const before = broken.beforeBreak!;
    const through = broken.atBreak!;
    expect(before.record.ticks.length).toBeGreaterThan(20);
    expect(through.result.finalTick).toBe(lastTick);
    for (const { record, result } of [before, through]) {
      expect(record.ticks).toEqual(silent.recording!.record.ticks.slice(0, record.ticks.length));
      expect(result.events).toEqual(silent.recording!.result.events.filter(({ tick }) => tick <= result.finalTick));
      expect(replayRecord(roundTrip(record), contentOf(broken.spec as never))).toEqual(result);
    }
  });
});
