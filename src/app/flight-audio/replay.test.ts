import { describe, expect, it } from 'vitest';
import { SOUND_PAYLOAD_SCHEMA_VERSION } from '../../content/sound-payload.ts';
import type { DomainEvent } from '../../core/contracts/domain-events.ts';
import type { Command } from '../../core/contracts/tick-input.ts';
import { CoreInputError } from '../../core/errors.ts';
import { compareReplayResults } from '../../core/replay/compare.ts';
import { CHAIN_COMMANDS, chainInput } from '../../core/replay/map-warp.test-support.ts';
import { GAME_REPLAY_FORMAT, GAME_REPLAY_VERSION, type Recording } from '../../core/replay/recording.ts';
import { replayRecord } from '../../core/replay/replay.ts';
import { contentOf, roundTrip } from '../../core/replay/replay.test-support.ts';
import { RULES_VERSION } from '../../core/replay/rules-version.ts';
import { createAudioController } from '../../platform/audio/audio-controller.ts';
import { FakeAudio, FakeLifecycle, sound, type FakeContext, type FakeVoice } from '../../platform/audio/audio-controller.test-support.ts';
import type { PresentationTick } from '../../render/flight/presentation/presentation-contract.ts';
import type { GameIntent } from '../runtime/game-runtime.ts';
import { NEUTRAL_AXES, recordingOptions, TICK_MS } from '../runtime/game-runtime.test-support.ts';
import { successSpec } from '../runtime/mission-end.test-support.ts';
import { isRunningTransition, type GameCommandsCancelled, type GameRunSpec } from '../session/game-session.ts';
import { current, sessionSetup } from '../session/game-session.test-support.ts';
import type { FlightSoundContent } from './content.ts';
import { attachRunAudio, type FlightSoundDecision, type RunAudio } from './consumer.ts';
import { combatRunSpec, OWNER, PRESENTATION_SEED, realPresentation, type InputOrder } from './consumer.test-support.ts';
import { EVENT_SOUNDS } from './events.ts';
import { HUD_CUE_SOUNDS } from './hud-cues.ts';
import { runSpecOf, soundContentFor } from './rule-integration.test-support.ts';

// P3-14/21 (docs/plan/p3/14/spec.md S-04, S-10, AC-13; 验证策略, Replay/一致性): the same version, content, seed and
// input sequence, run through the real Session, Runtime and Core with P3-12's real presentation module and the run's
// flight sound consumer over a real audio controller, records the same Core events, checkpoints and hashes whatever the
// sound does: off, enabled with either frame consumer first, locked, unavailable, failing mid-run, interrupted by the
// browser, its voices' end notifications in different orders and at different times, another presentation random seed,
// or turned off mid-run. Each run's own recording then replays through Core's formal replay. The runs span multi-tick,
// zero-tick and capped frames, a user pause and a hidden pause (the controller's gate and page lifecycle following
// them), cancelled commands, input cleared on focus loss, held fire, the Warp's non-contiguous placement and a
// mission's completion. Sound sequences are only required to repeat with the presentation seed and the host's callbacks
// fixed; a production replay promises no same EXPL draws or mix timing. Synthetic worlds only, never original data.

/** A plan step: a frame `n` ticks of time after the last (fractions accumulate), or a control between frames. */
type Step =
  | number
  | 'pause' | 'resume' | 'hide' | 'show' | 'focus-loss' | 'export'
  | { readonly intent: GameIntent }
  /** Commands submitted now that the next pause cancels. */
  | { readonly doomed: number };

interface World {
  readonly name: string;
  readonly spec: () => GameRunSpec;
  /** Commands by tick, each submitted before the first frame that reaches its tick. */
  readonly script: Readonly<Record<number, readonly Command[]>>;
  readonly plan: readonly Step[];
}

const repeat = (steps: Step | readonly Step[], times: number): Step[] => Array.from({ length: times }, () => steps).flat() as Step[];
const FIRING: Step = { intent: { axes: { pitch: 0.25, yaw: -0.5, roll: 0 }, primaryFire: true } };
const TURNING: Step = { intent: { axes: { pitch: -1, yaw: 0, roll: 0.5 }, primaryFire: false } };
const STEADY: Step = { intent: { axes: NEUTRAL_AXES, primaryFire: false } };

/** Every world's controls happen in its first 13 frames, so the scenarios' frames 14 and later see a running page. */
const WORLDS: readonly World[] = [
  {
    name: 'combat',
    spec: () => combatRunSpec(),
    script: {
      5: [{ type: 'fire', channel: 'primary' }],
      10: [{ type: 'target', operation: 'enemy' }],
      15: [{ type: 'fire', channel: 'secondary' }],
      50: [{ type: 'damage-report' }, { type: 'energy', operation: 'open' }, { type: 'energy', operation: 'shield-increase' }],
      55: [{ type: 'select-missile', direction: 'next' }],
      80: [{ type: 'fire', channel: 'secondary' }],
    },
    plan: [
      1, 1, 1, 1, 1, FIRING, 3, 0, 2, STEADY, { doomed: 3 }, 'pause', 'resume', 5, 6.5, 0.5, 2,
      { doomed: 2 }, 'hide', 'show', 'resume', ...repeat(4, 10), 'export', TURNING, 'focus-loss', ...repeat([2, 0, 3], 8), STEADY, ...repeat(5, 6),
    ],
  },
  {
    // P3-09's map and Warp chain: the Warp starts at tick 10 and moves the player to its far arrival (tick 639).
    name: 'map and Warp',
    spec: () => runSpecOf(chainInput()),
    script: CHAIN_COMMANDS,
    plan: [...repeat(1, 12), { doomed: 4 }, 'pause', 'resume', { doomed: 1 }, 'hide', 'show', 'resume', 'export', 7, 0, ...repeat(5, 130)],
  },
  {
    // P3-11's all-clear success: the run completes at tick 647 and its sound ends with it.
    name: 'success',
    spec: () => runSpecOf(successSpec()),
    script: {},
    plan: [...repeat(5, 8), { doomed: 2 }, 'pause', 'resume', ...repeat(5, 4), { doomed: 2 }, 'hide', 'show', 'resume', 'export', ...repeat([5, 0], 10), ...repeat(5, 120)],
  },
];

interface Scenario {
  /** Wires P3-12's presentation module; false runs Core alone. */
  readonly presentation?: boolean;
  /** The run's sound: null wires none (sound off); otherwise the controller's state. */
  readonly audio?: 'enabled' | 'locked' | 'unavailable' | null;
  /** Which of the presentation module and the sound consumer the run notifies first. */
  readonly order?: InputOrder;
  readonly seed?: number;
  /**
   * Ends every voice that has sounded for two frames, in this order, before each frame or, `within`, inside it before
   * the sound reads the frame.
   */
  readonly ends?: { readonly order: 'forward' | 'reverse'; readonly within: boolean };
  /** From this frame on the host refuses new voices, and the controller fails. */
  readonly failAt?: number;
  /** The browser interrupts the context at the first frame and runs it again at the second. */
  readonly interrupt?: readonly [number, number];
  /** The owner turns the sound off before this frame. */
  readonly invalidateAt?: number;
}

const SCENARIOS: Readonly<Record<string, Scenario>> = {
  'sound off': { audio: null },
  'enabled, presentation first': { order: 'presentation-first' },
  locked: { audio: 'locked' },
  unavailable: { audio: 'unavailable' },
  'failing from frame 4': { failAt: 4 },
  'interrupted for frames 14 to 19': { interrupt: [14, 20] },
  'ends in order, between frames': { ends: { order: 'forward', within: false } },
  'ends in reverse, between frames': { ends: { order: 'reverse', within: false } },
  'ends in reverse, within frames': { ends: { order: 'reverse', within: true }, order: 'presentation-first' },
  'another presentation seed': { seed: PRESENTATION_SEED ^ 0x5a5a_5a5a },
  'turned off at frame 30': { invalidateAt: 30 },
};

/** A real audio controller over fake host capabilities with every sound of `content` loaded; reports are kept. */
function soundRig(content: FlightSoundContent, state: 'enabled' | 'locked' | 'unavailable') {
  const audio = new FakeAudio();
  audio.initialState = 'running';
  const lifecycle = new FakeLifecycle();
  const reported: unknown[] = [];
  const controller = createAudioController({ audio, lifecycle, reportError: (error) => { reported.push(error); } });
  const ids = [...new Set([...content.sounds, ...Object.values(EVENT_SOUNDS), ...Object.values(HUD_CUE_SOUNDS)])];
  expect(controller.load(ids.map(id => ({ id, schemaVersion: SOUND_PAYLOAD_SCHEMA_VERSION, bytes: sound() }))).status).toBe('loaded');
  if (state === 'unavailable') audio.failContext = true;
  if (state !== 'locked') controller.unlock();
  expect(controller.getSnapshot().status).toBe({ enabled: 'running', locked: 'idle', unavailable: 'unavailable' }[state]);
  const context = (): FakeContext | undefined => audio.contexts[0];
  return { lifecycle, controller, reported, context };
}

function play(world: World, scenario: Scenario = {}) {
  const { presentation: presented = true, order = 'outputs-first', seed = PRESENTATION_SEED, ends } = scenario;
  const audioState = scenario.audio === undefined ? (presented ? 'enabled' : null) : scenario.audio;
  const spec = { ...world.spec(), recording: recordingOptions(4) } as GameRunSpec;
  const { session, host, errors } = sessionSetup();
  session.control({ type: 'start', spec });
  const run = current(session);
  const delivered: DomainEvent[] = [];
  const cancelled: GameCommandsCancelled[] = [];
  const reports: (readonly [number, boolean])[] = [];
  let lastTick = 0;
  run.onAny((event) => { delivered.push(event); });
  run.onCommandsCancelled((notice) => { cancelled.push(notice); });
  run.onFrame(({ report }) => {
    if (report) {
      reports.push([report.ticks, report.capped]);
      lastTick = report.outputs.at(-1)?.tick ?? lastTick;
    }
  });

  const content = soundContentFor(spec);
  const rig = audioState === null ? null : soundRig(content, audioState);
  let frame = 0;
  const born = new Map<FakeVoice, number>();
  /** Each batch of ended voices, by creation index, in the order the host reported their ends. */
  const endedBatches: number[][] = [];
  const endVoices = (): void => {
    const due = [...born].filter(([voice, at]) => voice.ended.size > 0 && at <= frame - 2).map(([voice]) => voice);
    if (ends?.order === 'reverse') due.reverse();
    if (due.length > 0) endedBatches.push(due.map(voice => rig!.context()!.voices.indexOf(voice)));
    for (const voice of due) voice.end();
  };
  // Registered before the sound, so its ends land inside the frame, before the consumer reads its voices.
  if (ends?.within) run.onFrame(() => { endVoices(); });

  const flight = presented ? realPresentation(run, run.renderFrame().current, { seed }) : null;
  const decisions: FlightSoundDecision[] = [];
  let consumer: RunAudio | null = null;
  if (flight && order === 'presentation-first') flight.connect();
  if (flight && rig) {
    consumer = attachRunAudio(run, { ownerId: OWNER, content, controller: rig.controller, presentation: flight.presentation, record: (decision) => { decisions.push(decision); } });
  }
  if (flight && order === 'outputs-first') flight.connect();
  // The owner ends the run's sound once the session completed, stopped or faulted (DW-11, D2-14).
  session.onStatus(({ phase }) => {
    if (phase === 'completed' || phase === 'stopped' || phase === 'faulted') consumer?.invalidate();
  });

  let now = 0;
  const submitted = new Set<number>();
  let middle: Recording | null = null;
  let invalidatedAfter: number | null = null;
  host.deliver(now);
  for (const step of world.plan) {
    const { phase, transition } = session.status();
    if (phase === 'transition' && isRunningTransition(transition)) session.control({ type: 'complete-transition', runId: run.runId, transitionId: transition.transitionId });
    if (typeof step === 'number') {
      if (session.status().phase !== 'running') continue;
      frame++;
      if (scenario.invalidateAt === frame && consumer) {
        consumer.invalidate();
        invalidatedAfter = lastTick;
      }
      if (scenario.failAt === frame) rig!.context()!.failVoice = true;
      if (scenario.interrupt?.[0] === frame) rig!.context()!.setState('interrupted');
      if (scenario.interrupt?.[1] === frame) rig!.context()!.setState('running');
      if (ends && !ends.within) endVoices();
      for (const [tick, commands] of Object.entries(world.script)) {
        if (Number(tick) > lastTick + 1 || submitted.has(Number(tick))) continue;
        submitted.add(Number(tick));
        for (const command of commands) run.submitCommand(command);
      }
      now += step * TICK_MS;
      host.deliver(now);
      for (const voice of rig?.context()?.voices ?? []) if (!born.has(voice)) born.set(voice, frame);
    } else if (step === 'pause') {
      session.control({ type: 'pause' });
      rig?.controller.pause();
      rig?.context()?.setState('suspended');
      now += 4321;
    } else if (step === 'resume') {
      session.control({ type: 'resume' });
      rig?.controller.resume();
      rig?.context()?.setState('running');
      host.deliver(now);
    } else if (step === 'hide') {
      host.emit({ type: 'visibility', visibility: 'hidden' });
      rig?.lifecycle.hide();
      now += 1234;
    } else if (step === 'show') {
      host.emit({ type: 'visibility', visibility: 'visible' });
      rig?.lifecycle.show();
      rig?.context()?.setState('running');
    } else if (step === 'focus-loss') {
      session.control({ type: 'clear-input', reason: 'focus-loss' });
    } else if (step === 'export') {
      middle = run.exportRecording();
    } else if ('intent' in step) {
      run.setIntent(step.intent);
    } else {
      for (let index = 0; index < step.doomed; index++) run.submitCommand({ type: 'cockpit-front' });
    }
  }
  const exported = run.exportRecording();
  if (!exported || !middle) throw new Error('expected both recordings');
  return {
    spec, exported, middle, delivered, cancelled, reports, errors, phase: session.status().phase, requests: host.callbacks.length,
    decisions, presentation: flight?.ticks ?? ([] as PresentationTick[]), invalidatedAfter,
    voices: rig?.controller.getSnapshot().voices ?? 0, reported: rig?.reported ?? [], endedBatches,
  };
}

type Played = ReturnType<typeof play>;

/** What Core did and what the Session reported of it: everything a sound may never change. */
const coreOf = ({ exported, middle, delivered, cancelled, reports, errors, phase, requests }: Played) =>
  ({ exported, middle, delivered, cancelled, reports, errors, phase, requests });

/** Replays `recording` through Core's formal replay after a JSON round trip, and compares it with the recorded result. */
function expectReplayed(spec: GameRunSpec, { record, result }: Recording): void {
  const replayed = replayRecord(roundTrip(record), contentOf(spec as never));
  expect(replayed).toEqual(result);
  expect(compareReplayResults(roundTrip(result), replayed)).toEqual({ match: true });
}

const played = (list: readonly FlightSoundDecision[], result: FlightSoundDecision['result'], code: FlightSoundDecision['code'] = null) =>
  list.filter(decision => decision.result === result && (code === null || decision.code === code));

describe.each(WORLDS)('the $name world under every sound state', (world) => {
  it('records the same Core events, checkpoints and hashes, and each recording replays (AC-13)', { timeout: 120_000 }, () => {
    const core = play(world, { presentation: false });
    const enabled = play(world);
    expect(core.errors).toEqual([]);
    expect(core.cancelled.map(({ reason }) => reason)).toContain('user-pause');
    expect(core.cancelled.map(({ reason }) => reason)).toContain('hidden');
    expect(core.reports.some(([ticks]) => ticks === 0)).toBe(true);
    expect(core.reports.some(([ticks]) => ticks > 1)).toBe(true);
    expect(core.delivered).toEqual(core.exported.result.events);
    expect(core.exported.result.checkpoints.length).toBeGreaterThan(10);
    expect(core.middle.record.ticks).toEqual(core.exported.record.ticks.slice(0, core.middle.record.ticks.length));
    expect(enabled.decisions.some(({ result }) => result === 'started')).toBe(true);

    const byName = new Map(Object.entries(SCENARIOS).map(([name, scenario]) => [name, play(world, scenario)]));
    for (const [name, result] of [['enabled', enabled] as const, ...byName]) {
      expect(coreOf(result), name).toEqual(coreOf(core));
      expect(result.reported, name).toEqual([]);
      expectReplayed(result.spec, result.exported);
      expectReplayed(result.spec, result.middle);
      // The presentation module reads Core and the sound reads both: neither changes what the other gets.
      if (SCENARIOS[name]?.seed === undefined) expect(result.presentation, name).toEqual(enabled.presentation);
    }

    // Each state did what it says, so the equality above is not vacuous.
    expect(byName.get('sound off')!.decisions).toEqual([]);
    expect(byName.get('enabled, presentation first')!.decisions).toEqual(enabled.decisions);
    for (const [name, code] of [['locked', 'audio-locked'], ['unavailable', 'audio-unavailable']] as const) {
      const { decisions } = byName.get(name)!;
      expect(played(decisions, 'started'), name).toEqual([]);
      expect(played(decisions, 'failed', code).length, name).toBeGreaterThan(0);
    }
    expect(played(byName.get('failing from frame 4')!.decisions, 'failed', 'audio-failed').length).toBeGreaterThan(0);
    expect(played(byName.get('interrupted for frames 14 to 19')!.decisions, 'failed', 'audio-suspended').length).toBeGreaterThan(0);
    const turnedOff = byName.get('turned off at frame 30')!;
    expect(turnedOff.invalidatedAfter).not.toBeNull();
    expect(turnedOff.decisions.every(({ tick }) => tick <= turnedOff.invalidatedAfter!)).toBe(true);
    expect(turnedOff.voices).toBe(0);
    // The host reported several voices' ends at once, in creation order or reversed with the same timing; the runs agree
    // up to their first batch, which is the same voices in the opposite order.
    const [forward, reverse, within] = ['ends in order, between frames', 'ends in reverse, between frames', 'ends in reverse, within frames'].map(name => byName.get(name)!);
    for (const [{ endedBatches, decisions }, ascending] of [[forward, true], [reverse, false], [within, false]] as const) {
      expect(endedBatches.some(batch => batch.length > 1)).toBe(true);
      for (const batch of endedBatches) expect(batch).toEqual([...batch].sort((a, b) => (ascending ? a - b : b - a)));
      // Natural ends change what the sound does next (a continuous voice that ended starts again), never Core.
      expect(decisions).not.toEqual(enabled.decisions);
    }
    expect(reverse.endedBatches[0]).toEqual([...forward.endedBatches[0]].reverse());
  });
});

describe('sound sequences and versions', () => {
  it('repeats the sound decisions only with the presentation seed and the host callbacks fixed', { timeout: 60_000 }, () => {
    const [combat] = WORLDS;
    const first = play(combat);
    const again = play(combat);
    expect(again.decisions).toEqual(first.decisions);
    expect(again.presentation).toEqual(first.presentation);
    // Another presentation seed draws other EXPL selections, so other explosion sounds, over the same Core run.
    const reseeded = play(combat, SCENARIOS['another presentation seed']);
    const selections = (ticks: readonly PresentationTick[]) => ticks.flatMap(({ activations }) => activations.map(({ key, selection }) => [key, selection]));
    expect(selections(first.presentation).length).toBeGreaterThan(0);
    expect(selections(reseeded.presentation)).not.toEqual(selections(first.presentation));
    expect(reseeded.decisions).not.toEqual(first.decisions);
    expect(coreOf(reseeded)).toEqual(coreOf(first));
  });

  it('records the current rules and format versions with no sound state, and replays no older record (06)', { timeout: 60_000 }, () => {
    const [combat] = WORLDS;
    const { spec, exported: { record } } = play(combat);
    expect(record).toMatchObject({ format: GAME_REPLAY_FORMAT, version: GAME_REPLAY_VERSION, rulesVersion: RULES_VERSION });
    expect(Object.keys(record).sort()).toEqual(['checkpointInterval', 'content', 'format', 'mission', 'producer', 'rulesVersion', 'run', 'setupHash', 'ticks', 'version']);
    expect(Object.keys(record.ticks[0]).sort()).toEqual(Object.keys(play(combat, { presentation: false }).exported.record.ticks[0]).sort());
    for (const [field, value] of [['rulesVersion', RULES_VERSION - 1], ['version', GAME_REPLAY_VERSION - 1]] as const) {
      const old = { ...(roundTrip(record) as Record<string, unknown>), [field]: value };
      expect(() => replayRecord(old, contentOf(spec as never)), field).toThrow(CoreInputError);
      expect(() => replayRecord(old, contentOf(spec as never)), field).toThrow(`record.${field}`);
    }
  });
});
