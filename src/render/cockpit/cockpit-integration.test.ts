vi.mock('../../core/world/create-world.ts', async (importOriginal) => {
  const original = await importOriginal<typeof CreateWorldModule>();
  return { ...original, createWorld: (input: CreateWorldInput) => injection.wrap(original.createWorld(input)) };
});
vi.mock('../../core/replay/recording.ts', async (importOriginal) => {
  const original = await importOriginal<typeof RecordingModule>();
  return {
    ...original,
    createRecordingSession: (input: CreateWorldInput, options: RecordingOptions) => injection.wrap(original.createRecordingSession(input, options)),
  };
});

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { thirdLossSpec } from '../../app/runtime/mission-end.test-support.ts';
import { recordingOptions, TICK_MS } from '../../app/runtime/game-runtime.test-support.ts';
import type { FrameReport } from '../../app/runtime/game-runtime.ts';
import type { GameRunSpec } from '../../app/session/game-session.ts';
import { current, sessionSetup } from '../../app/session/game-session.test-support.ts';
import { CoreFaultError, CoreInputError } from '../../core/errors.ts';
import { compareReplayResults } from '../../core/replay/compare.ts';
import type * as RecordingModule from '../../core/replay/recording.ts';
import type { RecordingOptions } from '../../core/replay/recording.ts';
import { replayRecord } from '../../core/replay/replay.ts';
import { contentOf } from '../../core/replay/replay.test-support.ts';
import type * as CreateWorldModule from '../../core/world/create-world.ts';
import type { CreateWorldInput } from '../../core/world/create-world.ts';
import type { CommunicationsProjection, Projection } from '../../core/projections/projection.ts';
import {
  BLOCK, cockpitState, coreOf, GROUPING_NAMES, GROUPINGS, hashOf, oneTickAtATime, play, TICKS, wire, type Played, type TickFacts,
} from './cockpit-integration.test-support.ts';
import { createCockpitRun } from './composition/cockpit-run.ts';
import type { CockpitTick } from './presentation/cockpit-contract.ts';

// P3-13/26 (docs/plan/p3/13/spec.md, AC-01, AC-03, AC-04, AC-13, AC-14; D-01 定稿 DC-03, DC-04, DC-07; D-02 定稿 DD-02,
// DD-05, DD-06): formal Core, Runtime and Session with P3-12's presentation module and every real cockpit module, none
// replaced, on a synthetic scenario whose projection and events change from tick to tick. The same seeded input grouped
// into frames of 1, of 5 and of 2 + 0 + 3 ticks gives the cockpit the same state and draws; Core and P3-12 do not
// notice it; cuts, stops and failures leave it at the last tick it was given.
//
// Faults are injected only where the world is created: the mocked creation entries wrap the real Core world or
// recording session and, once armed, replace one chosen call (as game-runtime-fault.test.ts does). Unarmed, every call
// is the real one.

const injection = vi.hoisted(() => {
  const calls = new Map<string, number>();
  let armed: { method: string; nth: number; replace: () => unknown } | null = null;
  const call = (method: string, real: () => unknown): unknown => {
    const count = (calls.get(method) ?? 0) + 1;
    calls.set(method, count);
    if (armed?.method === method && armed.nth === count) return armed.replace();
    return real();
  };
  return {
    /** Counts calls from now on; the `nth` call of `method` runs `replace` instead. */
    arm(method: string, nth: number, replace: () => unknown) {
      calls.clear();
      armed = { method, nth, replace };
    },
    reset() {
      calls.clear();
      armed = null;
    },
    wrap<World extends object>(world: World): World {
      const target = world as unknown as Record<string, (...args: unknown[]) => unknown>;
      const wrapped: Record<string, (...args: unknown[]) => unknown> = {};
      for (const method of ['step', 'projection', 'renderState', 'snapshot', 'exportRecording']) {
        if (typeof target[method] === 'function') wrapped[method] = (...args) => call(method, () => target[method](...args));
      }
      return wrapped as unknown as World;
    },
  };
});

afterEach(() => { injection.reset(); });

const ticksOf = (batches: readonly (readonly CockpitTick[])[]) => batches.flat().map(({ output }) => output.tick);
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, at) => from + at);
const eventTicks = (facts: readonly TickFacts[], type: string) => facts.filter(({ events }) => events.some((event) => event.type === type)).map(({ tick }) => tick);

/** `projection` with the lock or the warnings (DD-02's visual inputs) of `cues`, all else its own. */
function withCue(projection: Projection, cues: Projection, cue: 'lock' | 'warnings'): Projection {
  if (cue === 'lock') {
    type Ready = Extract<Projection['flight']['combat'], { readonly readiness: 'ready' }>;
    const combat = projection.flight.combat as Ready;
    const lock = (cues.flight.combat as Ready).player?.lock;
    return { ...projection, flight: { ...projection.flight, combat: { ...combat, player: combat.player && { ...combat.player, lock: lock ?? combat.player.lock } } } };
  }
  const communications = projection.communications as CommunicationsProjection;
  return { ...projection, communications: { ...communications, warnings: (cues.communications as CommunicationsProjection).warnings } };
}

// Whole runs of 200 ticks with every module drawing: about 0.3 s each alone.
describe('the cockpit on the real chain (P3-13/26)', { timeout: 120_000 }, () => {
  let baseline: Played;
  let core: ReturnType<typeof coreOf>;

  beforeAll(() => {
    baseline = play(GROUPINGS['1×5']);
    core = coreOf(play(GROUPINGS['1×5'], { bare: true }));
  });

  it('runs a scenario whose every tick has its own projection: pages, subsystems, target, incoming, views, lock and warnings', () => {
    const { session, errors, wired, blockEnds } = baseline;
    expect([session.status().phase, errors]).toEqual(['running', []]);
    const { facts, batches } = wired!;
    expect(ticksOf(batches)).toEqual(range(1, TICKS));
    // Page changes: the energy page (1), the menu (2, 4, closed within its tick), page 5 for each incoming message and
    // page 6 for the player's Warp; the projection shows the pages that last a tick.
    const pages = facts.flatMap(({ events }) => events.flatMap((event) => (event.type === 'left-page-changed' ? [event.page] : [])));
    expect(new Set(pages)).toEqual(new Set([0, 1, 2, 4, 5, 6]));
    expect(new Set(facts.map(({ page }) => page))).toEqual(new Set([0, 1, 5]));
    // A collision at tick 2 damages two subsystems; one of them is repaired and damaged again.
    const subsystems = new Set(facts.map(({ subsystems: fields }) => fields!.join('')));
    expect(subsystems.size).toBeGreaterThanOrEqual(3);
    // The lock runs from none (−1) through positive values to 0, then is lost with its target.
    const progress = facts.map(({ lock }) => lock!.progress);
    expect(new Set(progress)).toEqual(new Set([-1, 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]));
    // A hostile missile comes at the player: the type-9 warning turns on.
    expect(facts.find(({ warnings }) => warnings!.missileIncoming)?.tick).toBeGreaterThan(1);
    expect(facts[0].warnings).toEqual({ attackerOnTail: false, missileIncoming: false });
    // The wingman, the player's target, goes into Warp: the target leaves (a before-draw event).
    const cleared = facts.flatMap(({ events }) => events.filter((event) => event.type === 'target-cleared'));
    expect(cleared).toEqual([expect.objectContaining({ cause: 'warp', previousTarget: 2 })]);
    // Three incoming messages (an after-draw event); the base's status reply starts and ends in the same tick.
    const started = eventTicks(facts, 'incoming-started');
    expect(started).toHaveLength(3);
    const sameTick = started.filter((tick) => eventTicks(facts, 'incoming-ended').includes(tick));
    expect(sameTick).toHaveLength(1);
    // The map is open for two blocks; the player's Warp switches to view 1 and back in one tick.
    const views = facts.flatMap(({ events }) => events.flatMap((event) => (event.type === 'view-switched' ? [[event.tick, event.viewMode]] : [])));
    expect(views.map(([, view]) => view)).toEqual([8, 0x0c, 1, 0x0c]);
    expect(views[2][0]).toBe(views[3][0]);
    // The cockpit drew with all of it: draws from its random source, the map picture in view 8, the message queue.
    expect(blockEnds.get(TICKS)!.diagnostics).toMatchObject({ tick: TICKS, viewMode: 0x0c, messageDrops: 0 });
    expect(blockEnds.get(TICKS)!.diagnostics.randomDraws).toBeGreaterThan(20);
    const mapEnds = [...blockEnds].filter(([, state]) => state.map !== null).map(([tick]) => tick);
    expect(mapEnds).toEqual([views[0][0] + BLOCK - 1, views[0][0] + 2 * BLOCK - 1]);
  });

  it('keeps a message that starts and ends in one tick once, queued after that tick\'s draw', () => {
    const { wired, blockEnds } = baseline;
    const [tick] = eventTicks(wired!.facts, 'incoming-started').filter((at) => eventTicks(wired!.facts, 'incoming-ended').includes(at));
    const before = blockEnds.get(Math.floor(tick / BLOCK) * BLOCK)!.message;
    const after = blockEnds.get(Math.ceil(tick / BLOCK) * BLOCK)!.message;
    // Posted once, after the tick's draw; the message itself has ended.
    expect(after.length).toBe(before.length + 1);
    expect([after.messageDrops, after.incoming]).toEqual([0, null]);
  });

  describe.each(GROUPING_NAMES)('frames of %s ticks', (grouping) => {
    it('gives the cockpit the same state, surfaces and random draws at every block end as one tick a frame', () => {
      const played = play(GROUPINGS[grouping]);
      expect(played.errors).toEqual([]);
      expect(played.blockEnds).toEqual(baseline.blockEnds);
      expect([...played.blockEnds.keys()]).toEqual(range(1, TICKS / BLOCK).map((block) => block * BLOCK));
      // Each frame's ticks once, in order: none lost, repeated or taken from a later frame.
      expect(ticksOf(played.wired!.batches)).toEqual(range(1, TICKS));
      expect(played.wired!.batches.every((batch) => batch.length <= BLOCK)).toBe(true);
      // The same as processing the same ticks one at a time.
      expect(cockpitState(oneTickAtATime(played.wired!))).toEqual(baseline.blockEnds.get(TICKS));
      // P3-12's module saw the same ticks and drew the same.
      expect(played.wired!.flightRecords).toEqual(baseline.wired!.flightRecords);
      expect(played.wired!.random.state).toEqual(baseline.wired!.random.state);
    });

    it('gives Core the same events, checkpoints and state hashes with and without the cockpit and another reader', () => {
      const bare = play(GROUPINGS[grouping], { bare: true });
      const flightOnly = play(GROUPINGS[grouping], { cockpit: false });
      const withReader = play(GROUPINGS[grouping], { reader: true });
      for (const played of [bare, flightOnly, withReader]) expect(coreOf(played)).toEqual(core);
      // P3-12's presentation stream is not drawn from by the cockpit: its records and random state are the same without it.
      expect(flightOnly.wired!.flightRecords).toEqual(baseline.wired!.flightRecords);
      expect(flightOnly.wired!.random.state).toEqual(baseline.wired!.random.state);
      // Another reader of the same projections (as P3-14's sounds would read the lock and the warnings) changes nothing.
      expect(withReader.blockEnds).toEqual(baseline.blockEnds);
      expect(withReader.wired!.heard).toHaveLength(TICKS);
    });
  });

  it('replays the recording to the same events and checkpoints', () => {
    const { recording } = core;
    expect(recording.result.checkpoints.map(({ tick }) => tick)).toEqual(range(0, TICKS));
    expect(compareReplayResults(recording.result, replayRecord(recording.record, contentOf(baseline.spec as never)))).toEqual({ match: true });
  });

  it('advances nothing on frames without a tick, and nothing reaches it after the run', () => {
    const { session, host, wired } = play(GROUPINGS['5'].slice(0, 4));
    const state = cockpitState(wired!.cockpit!);
    const before = wired!.batches.length;
    host.deliver(4 * BLOCK * TICK_MS);
    host.deliver(4 * BLOCK * TICK_MS);
    expect(wired!.batches.slice(before)).toEqual([[], []]);
    expect(cockpitState(wired!.cockpit!)).toEqual(state);
    // After the run no frame is requested, so nothing more reaches the cockpit.
    session.control({ type: 'exit' });
    expect(host.pending.size).toBe(0);
    expect(wired!.batches).toHaveLength(before + 2);
    expect(cockpitState(wired!.cockpit!)).toEqual(state);
  });

  /**
   * The same ticks, one at a time, to two cockpits: one gets each tick's own projection, the other the lock or the
   * warnings of the tick `lag` before with all else its own (still a valid batch). Returns the first tick whose cue
   * changes and the ticks whose back surface differs.
   */
  function lagged(cue: 'lock' | 'warnings', lag: number) {
    const ticks = baseline.wired!.batches.flat();
    const own = createCockpitRun(baseline.wired!.cockpitInput);
    const late = createCockpitRun(baseline.wired!.cockpitInput);
    const differing: number[] = [];
    let changed: number | null = null;
    ticks.forEach((tick, at) => {
      const { projection } = tick.output;
      const prior = ticks[Math.max(0, at - lag)].output.projection;
      own.presentation.advance({ ownerId: 1, runId: 1, ticks: [tick] });
      late.presentation.advance({ ownerId: 1, runId: 1, ticks: [{ ...tick, output: { ...tick.output, projection: withCue(projection, prior, cue) } }] });
      if (changed === null && JSON.stringify(withCue(projection, prior, cue)) !== JSON.stringify(projection)) changed = tick.output.tick;
      if (hashOf(own.presentation.surfaces().back.indices) !== hashOf(late.presentation.surfaces().back.indices)) differing.push(tick.output.tick);
    });
    own.presentation.dispose();
    late.presentation.dispose();
    return { changed, differing };
  }

  it.each([
    // The lock's rings and text, drawn by every F1 overlay call.
    ['lock', 1],
    // The type-9 strip toggles its phase every 0x15 clock units (10.5 ticks) and draws only then: a lag of more than one
    // period, so that the first label after the missile warning turns on reads the flags from before it.
    ['warnings', 15],
  ] as const)('draws the %s from each tick\'s own projection (D-02): %i tick(s) late, the picture differs', (cue, lag) => {
    const { changed, differing } = lagged(cue, lag);
    expect(changed).not.toBeNull();
    expect(differing.length).toBeGreaterThan(0);
    // Nothing differs before the cue first differs.
    expect(Math.min(...differing)).toBeGreaterThanOrEqual(changed!);
  });

  describe('refused batches (DC-04): before any draw, the cockpit unchanged, Core as without it', () => {
    /** Frames of five ticks; the eighth frame (ticks 36–40) is changed by `tamper`. */
    const TAMPERED_END = 40;

    function refused(tamper: (ticks: readonly CockpitTick[]) => readonly CockpitTick[]) {
      const played = play(GROUPINGS['5'], { exportEachFrame: true, tamper: (ticks) => (ticks[0]?.output.tick === TAMPERED_END - BLOCK + 1 ? tamper(ticks) : ticks) });
      const { session, wired, exported } = played;
      expect(session.status()).toMatchObject({
        phase: 'faulted',
        error: { kind: 'operation-failed', failures: [{ phase: 'consumer', cause: expect.objectContaining({ name: 'PresentationError', kind: 'invalid-input' }) }] },
      });
      // Refused whole: nothing of the batch was processed or drawn, and the model is still usable.
      expect(wired!.cockpit!.presentation.status()).toBe('ready');
      expect(cockpitState(wired!.cockpit!)).toEqual(baseline.blockEnds.get(TAMPERED_END - BLOCK));
      // Core ran the whole frame as without the cockpit.
      const { record, result } = core.recording;
      expect(exported!.record.ticks).toEqual(record.ticks.slice(0, TAMPERED_END));
      expect(exported!.result.events).toEqual(result.events.filter((event) => event.tick <= TAMPERED_END));
      expect(exported!.result.checkpoints).toEqual(result.checkpoints.slice(0, TAMPERED_END + 1));
      return played;
    }

    it('refuses ticks that carry the frame\'s last projection instead of their own (no future state filled back)', () => {
      refused((ticks) => ticks.map((tick) => ({ ...tick, output: { ...tick.output, projection: ticks.at(-1)!.output.projection } })));
    });

    it('refuses a repeated, a missing and a reordered tick', () => {
      refused((ticks) => [ticks[0], ...ticks]);
      refused((ticks) => ticks.slice(1));
      refused((ticks) => [ticks[1], ticks[0], ...ticks.slice(2)]);
    });

    it('refuses a sixth tick', () => {
      refused((ticks) => [...ticks, ticks.at(-1)!]);
    });
  });

  it('refuses another run\'s or owner\'s batch before any change, and a new run starts its own cockpit from tick 0', () => {
    const { session, host, run, wired } = play(GROUPINGS['5'].slice(0, 2));
    const cockpit = wired!.cockpit!;
    const state = cockpitState(cockpit);
    expect(state).toEqual(baseline.blockEnds.get(2 * BLOCK));
    // The same scenario's next ticks, from the one-tick run, continue this cockpit only under its own owner and run.
    const next = baseline.wired!.batches.flat().slice(2 * BLOCK, 3 * BLOCK);
    for (const [ownerId, runId] of [[1, run.runId + 1], [2, run.runId]]) {
      expect(() => { cockpit.presentation.advance({ ownerId, runId, ticks: next }); }).toThrow(expect.objectContaining({ kind: 'invalid-input' }));
      expect(cockpitState(cockpit)).toEqual(state);
    }
    cockpit.presentation.advance({ ownerId: 1, runId: run.runId, ticks: next });
    expect(cockpitState(cockpit)).toEqual(baseline.blockEnds.get(3 * BLOCK));
    // The session's next run gets a cockpit of its own from tick 0; the first run's cockpit gets nothing more.
    const kept = wired!.batches.length;
    session.control({ type: 'exit' });
    const spec = baseline.spec;
    session.control({ type: 'start', spec });
    const second = current(session);
    const rewired = wire(second, spec);
    expect(() => { rewired.cockpit!.presentation.advance({ ownerId: 1, runId: run.runId, ticks: next.slice(0, 1) }); })
      .toThrow(expect.objectContaining({ kind: 'invalid-input' }));
    let now = 0;
    host.deliver(now);
    for (let frame = 0; frame < 2; frame++) host.deliver(now += BLOCK * TICK_MS);
    expect(ticksOf(rewired.batches)).toEqual(range(1, 2 * BLOCK));
    expect(cockpitState(rewired.cockpit!)).toEqual(baseline.blockEnds.get(2 * BLOCK));
    expect(wired!.batches).toHaveLength(kept);
  });
});

describe('the cockpit at Runtime stops, cuts and failures (P3-13/26)', { timeout: 120_000 }, () => {
  /** Frames of five ticks; the failure is armed for the frame of ticks 41–45, at its third tick (43). */
  const FRAME_FIRST = 41;
  const FAILING = 3;
  let baseline: Played;
  let core: ReturnType<typeof coreOf>;

  beforeAll(() => {
    baseline = play(GROUPINGS['5']);
    core = coreOf(play(GROUPINGS['5'], { bare: true }));
  });

  const armAt = (method: string, nth: number, replace: () => unknown) => (tick: number) => {
    if (tick === FRAME_FIRST) injection.arm(method, nth, replace);
  };

  it('takes the ticks before a recording capacity stop, as the Runtime delivers them, and nothing after', () => {
    const played = play(GROUPINGS['5'], {
      beforeFrame: armAt('step', FAILING, () => { throw new CoreInputError('recording', 'would exceed 131072 recorded ticks'); }),
    });
    const { session, host, wired } = played;
    expect(session.status()).toMatchObject({ phase: 'stopped', stopReason: 'recording-capacity', error: null });
    const last = FRAME_FIRST + FAILING - 2;
    expect(ticksOf(wired!.batches)).toEqual(range(1, last));
    // The stop frame's ticks before the refused one, then a still frame.
    expect(wired!.batches.slice(-2).map((batch) => batch.map(({ output }) => output.tick))).toEqual([[FRAME_FIRST, last], []]);
    const state = cockpitState(wired!.cockpit!);
    expect(state.diagnostics.tick).toBe(last);
    expect(state).toEqual(cockpitState(oneTickAtATime(wired!)));
    // The ticks before the stop are those of the run without it, processed one at a time.
    expect(state).toEqual(cockpitState(oneTickAtATime(baseline.wired!, [baseline.wired!.batches.flat().slice(0, last)])));
    // Stopped: no frame is requested any more.
    expect(host.pending.size).toBe(0);
  });

  it.each([
    ['a Core fault', 'step', () => { throw new CoreFaultError('invariant-violated', 'injected'); }],
    ['a read model failure', 'projection', () => { throw new CoreFaultError('invariant-violated', 'injected'); }],
  ] as const)('is given nothing of a frame that %s ends', (_, method, replace) => {
    const { session, wired } = play(GROUPINGS['5'], { beforeFrame: armAt(method, FAILING, replace) });
    expect(session.status()).toMatchObject({ phase: 'faulted', error: { failures: [{ phase: 'runtime' }] } });
    // The Runtime delivers nothing of the faulted frame: the cockpit stays at the frame before, as in the run without the fault.
    expect(ticksOf(wired!.batches)).toEqual(range(1, FRAME_FIRST - 1));
    expect(cockpitState(wired!.cockpit!)).toEqual(baseline.blockEnds.get(FRAME_FIRST - 1));
    expect(wired!.cockpit!.presentation.status()).toBe('ready');
  });

  it('faults the run as a consumer when a module fails while drawing, with Core and P3-12 as without the cockpit', () => {
    // No model for the right display's target: the first frame that draws the target fails in the cockpit.
    const played = play(GROUPINGS['5'], { models: new Map(), exportEachFrame: true });
    const { session, wired, exported } = played;
    expect(session.status()).toMatchObject({
      phase: 'faulted', error: { failures: [{ phase: 'consumer', cause: expect.objectContaining({ name: 'ContentContractError' }) }] },
    });
    expect(wired!.cockpit!.presentation.status()).toBe('failed');
    const end = ticksOf(wired!.batches).at(-1)!;
    expect(end).toBeLessThan(TICKS);
    const { record, result } = core.recording;
    expect(exported!.record.ticks).toEqual(record.ticks.slice(0, end));
    expect(exported!.result.checkpoints).toEqual(result.checkpoints.slice(0, end + 1));
    // P3-12's module advanced by the whole frame before the cockpit, as in the run without the failure.
    expect(wired!.flightRecords).toEqual(baseline.wired!.flightRecords.slice(0, end));
  });
});

describe('the cockpit through real transition holds and the completion (P3-13/26)', { timeout: 120_000 }, () => {
  /** The failing run of thirdLossSpec (two energy rescues, G-02/6, then the third loss) in frames of five ticks. */
  function playThirdLoss(cockpit: boolean) {
    const { session, host, errors } = sessionSetup();
    const spec = { ...thirdLossSpec(recordingOptions(64)), initialTransition: null } as unknown as GameRunSpec;
    session.control({ type: 'start', spec });
    const run = current(session);
    const reports: FrameReport[] = [];
    const after: { readonly cut: FrameReport['cut'] | 'still'; readonly ticks: readonly number[]; readonly cockpitTick: number | null }[] = [];
    run.onFrame(({ report }) => { if (report) reports.push(report); });
    const wired = cockpit ? wire(run, spec) : null;
    run.onFrame(({ report }) => {
      after.push({ cut: report ? report.cut : 'still', ticks: report?.outputs.map(({ tick }) => tick) ?? [], cockpitTick: wired?.cockpit!.presentation.schedule().tick ?? null });
    });
    const holds: unknown[] = [];
    let now = 0;
    host.deliver(now);
    for (let frame = 0; frame < 20_000; frame++) {
      const { phase, transition } = session.status();
      if (phase === 'transition') {
        holds.push(transition);
        // Held: no frame is requested, so nothing reaches the cockpit until the hold completes.
        expect(host.pending.size).toBe(0);
        session.control({ type: 'complete-transition', runId: run.runId, transitionId: (transition as { transitionId: number }).transitionId });
        continue;
      }
      if (phase !== 'running') break;
      // The player keeps spending energy.
      run.submitCommand({ type: 'speed', operation: 'maximum' });
      now += BLOCK * TICK_MS;
      host.deliver(now);
    }
    return { session, host, errors, run, reports, after, wired, holds };
  }

  it('is given each cut frame\'s ticks up to its cut, nothing while held or completed, and then the next tick', () => {
    const played = playThirdLoss(true);
    const { session, errors, reports, after, wired, holds } = played;
    expect(errors).toEqual([]);
    expect(holds).toEqual([expect.objectContaining({ gap: 'G-02/6' }), expect.objectContaining({ gap: 'G-02/6' })]);
    const { phase, result } = session.status();
    expect(phase).toBe('completed');
    const completed = result!.completedTick;
    // Every tick once, in order, across the holds and up to the completion.
    expect(ticksOf(wired!.batches)).toEqual(range(1, completed));
    const cuts = reports.filter(({ cut }) => cut !== null);
    expect(cuts.map(({ cut }) => cut)).toEqual(['transition', 'transition', 'completed']);
    for (const report of cuts) {
      const cutTick = report.cut === 'completed' ? report.completion!.tick : report.transitions[0].tick;
      expect(report.outputs.at(-1)!.tick).toBe(cutTick);
      // The cockpit processed the cut frame up to its cut tick, and a still frame followed without advancing it.
      const at = after.findIndex(({ ticks }) => ticks.at(-1) === cutTick);
      expect(after[at]).toMatchObject({ cut: report.cut, cockpitTick: cutTick });
      expect(after[at + 1]).toEqual({ cut: 'still', ticks: [], cockpitTick: cutTick });
    }
    // At least one cut fell inside a frame of five, so the Runtime discarded the rest of that frame's time.
    expect(cuts.some(({ outputs }) => outputs.length < BLOCK)).toBe(true);
    expect(wired!.cockpit!.presentation.schedule().tick).toBe(completed);
    expect(cockpitState(wired!.cockpit!)).toEqual(cockpitState(oneTickAtATime(wired!)));
    // Core is the same without the cockpit.
    const bare = playThirdLoss(false);
    expect(bare.run.exportRecording()).toEqual(played.run.exportRecording());
  });
});
