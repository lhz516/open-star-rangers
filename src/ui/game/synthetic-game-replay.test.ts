import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ControlledHost } from '../../app/session/synthetic-session.test-support.ts';
import { createSyntheticSession, type SessionRun } from '../../app/session/synthetic-session.ts';
import type * as SceneModule from '../../core/synthetic/synthetic-scene.ts';
import type { Command, SyntheticSceneConfig, TickInput } from '../../core/synthetic/synthetic-scene.ts';
import { compareSyntheticReplayResults, replaySyntheticRecord, type SyntheticRecording } from '../../core/synthetic/synthetic-replay.ts';
import { createSyntheticCommandFeedback } from './synthetic-command-feedback.ts';
import { createSyntheticGameStore, type SyntheticGameState } from './synthetic-game-store.ts';
import { createSyntheticSessionBridge } from './synthetic-session-bridge.ts';
import { TestClock } from './synthetic-ui.test-support.ts';

const injection = vi.hoisted(() => ({ failOn: 0, calls: 0, cause: new Error('Core injection') }));
vi.mock('../../core/synthetic/synthetic-scene.ts', async importOriginal => {
  const original = await importOriginal<typeof SceneModule>();
  return {
    ...original,
    createSyntheticScene(config: SyntheticSceneConfig) {
      const scene = original.createSyntheticScene(config);
      return {
        inspect: () => scene.inspect(), uiProjection: () => scene.uiProjection(), renderState: () => scene.renderState(),
        step(input: TickInput) {
          injection.calls++;
          if (injection.calls === injection.failOn) throw injection.cause;
          return scene.step(input);
        },
      };
    },
  };
});
beforeEach(() => { injection.calls = 0; });
afterEach(() => { injection.failOn = 0; });

type Mode = 'bare' | 'sampled-1x' | 'sampled-10x';

/** The two bridged modes differ only in the sampling clock they read. */
const SAMPLE_CLOCK: Record<Exclude<Mode, 'bare'>, (hostMs: number) => number> = {
  'sampled-1x': hostMs => hostMs,
  'sampled-10x': hostMs => hostMs * 10,
};

const FORBIDDEN_IN_RECORD = ['runId', 'commandId', 'cancel', 'pause', 'resume', 'session-failed', 'unconfirmed', 'actionError', 'nowMs'];

function harness(mode: Mode, checkpointInterval: number) {
  const host = new ControlledHost(), clock = new TestClock(), writer = createSyntheticGameStore();
  const clockReads: number[] = [];
  const feedback = createSyntheticCommandFeedback(writer);
  const bridge = createSyntheticSessionBridge(writer, () => { const now = clock.read(); clockReads.push(now); return now; }, [feedback]);
  const session = createSyntheticSession(
    { scene: { seed: 7, tickRateHz: 50 }, recording: { checkpointInterval } }, host, error => { bridge.onError(error); },
  );
  if (mode !== 'bare') bridge.bind(session);
  const events: (string | number)[][] = [];
  const publications: number[] = [];
  writer.reader.subscribe((state, previous) => {
    if (state.projection && state.projection !== previous.projection) publications.push(state.projection.tick);
  });
  const run = (): SessionRun => {
    const current = session.currentRun();
    if (!current) throw new Error('Expected a run');
    return current;
  };
  const watch = () => {
    const current = run();
    current.onAny((event, { commandId }) => { events.push([current.runId, event.type, event.tick, event.commandIndex, commandId]); });
  };
  const frame = (hostMs: number) => {
    if (mode !== 'bare') clock.now = SAMPLE_CLOCK[mode](hostMs);
    host.deliver(hostMs);
    run().uiProjection();
    run().renderFrame();
  };
  const submit = (type: Command['type']) => {
    if (mode === 'bare') run().submitCommand({ type });
    else feedback.submit(type);
  };
  return { host, clock, writer, session, bridge, events, publications, clockReads, run, watch, frame, submit };
}

interface Outcome {
  readonly events: (string | number)[][];
  readonly firstRun: SyntheticRecording;
  readonly firstRunJson: string;
  readonly firstRunState: SyntheticGameState;
  readonly secondRun: SyntheticRecording;
  readonly finalState: SyntheticGameState;
  readonly publications: readonly number[];
  readonly clockReads: readonly number[];
}

/** Drives the same host frames, inputs and executed commands with or without the UI bridge. */
function drive(mode: Mode, checkpointInterval: number): Outcome {
  const h = harness(mode, checkpointInterval);
  h.session.control({ type: 'start' });
  h.watch();
  h.frame(0);
  h.run().setInput({ moveX: 1 });
  h.submit('add-marker'); h.submit('remove-marker');
  h.frame(20); h.frame(40);
  h.submit('add-marker');
  h.frame(60); h.frame(80);
  h.submit('remove-marker');
  h.session.control({ type: 'pause' });
  h.session.control({ type: 'resume' });
  h.run().setInput({ moveX: -0.5 });
  h.frame(1000); h.frame(1020);
  h.submit('remove-marker');
  h.frame(1040); h.frame(1200);
  const firstRun = h.run().exportRecording();
  if (!firstRun) throw new Error('Expected a recording');
  const firstRunJson = JSON.stringify(firstRun);
  const firstRunState = h.writer.reader.getState();

  h.session.control({ type: 'restart' });
  h.watch();
  h.frame(2000);
  h.submit('add-marker');
  h.frame(2020); h.frame(2140);
  const secondRun = h.run().exportRecording();
  if (!secondRun) throw new Error('Expected a recording');
  const finalState = h.writer.reader.getState();
  h.session.control({ type: 'dispose' });
  h.bridge.unbind();
  return {
    events: h.events, firstRun, firstRunJson, firstRunState, secondRun, finalState, publications: h.publications, clockReads: h.clockReads,
  };
}

const settled = (state: SyntheticGameState) => state.recentResults.map(result => [
  result.runId, result.commandId, result.outcome, result.outcome === 'accepted' || result.outcome === 'rejected' ? result.event.type : result.reason,
]);

describe('UI bridge replay invariants', () => {
  it.each([1, 4])('leaves Core events, recordings and state hashes unchanged (checkpoint interval %s)', checkpointInterval => {
    const bare = drive('bare', checkpointInterval);
    const oneX = drive('sampled-1x', checkpointInterval);
    const tenX = drive('sampled-10x', checkpointInterval);
    expect(bare.events).toEqual([
      [1, 'marker-added', 1, 0, 1], [1, 'marker-removed', 1, 1, 2], [1, 'marker-added', 3, 0, 3],
      [1, 'marker-removed', 6, 0, 5], [2, 'marker-added', 1, 0, 1],
    ]);
    for (const [recording, runId] of [[bare.firstRun, 1], [bare.secondRun, 2]] as const) {
      expect(recording.result.events.map(event => [runId, event.type, event.tick, event.commandIndex]))
        .toEqual(bare.events.filter(entry => entry[0] === runId).map(entry => entry.slice(0, 4)));
    }
    for (const bridged of [oneX, tenX]) {
      expect(bridged.events).toEqual(bare.events);
      expect(bridged.firstRun).toEqual(bare.firstRun);
      expect(bridged.secondRun).toEqual(bare.secondRun);
    }
    for (const recording of [bare.firstRun, bare.secondRun]) {
      const replayed = replaySyntheticRecord(JSON.parse(JSON.stringify(recording.record)));
      expect(compareSyntheticReplayResults(recording.result, replayed)).toEqual({ match: true });
    }
    expect(bare.firstRun.result.checkpoints.length).toBeGreaterThan(2);
  });

  it('exercises different sampling schedules through the bridge and its command feedback', () => {
    const bare = drive('bare', 1);
    const oneX = drive('sampled-1x', 1);
    const tenX = drive('sampled-10x', 1);
    expect(bare.clockReads).toEqual([]);
    expect(bare.firstRunState).toMatchObject({ status: null, projection: null, recentResults: [] });
    expect(new Set(oneX.clockReads).size).toBeGreaterThan(3);
    expect(tenX.clockReads).not.toEqual(oneX.clockReads);
    expect(tenX.publications).not.toEqual(oneX.publications);
    expect(tenX.publications.length).toBeGreaterThan(oneX.publications.length);
    for (const bridged of [oneX, tenX]) {
      expect(settled(bridged.firstRunState)).toEqual([
        [1, 1, 'accepted', 'marker-added'], [1, 2, 'accepted', 'marker-removed'], [1, 3, 'accepted', 'marker-added'],
        [1, 4, 'cancelled', 'user-pause'], [1, 5, 'accepted', 'marker-removed'],
      ]);
      expect(bridged.firstRunState.pendingCommands).toEqual([]);
      expect(settled(bridged.finalState)).toEqual([[2, 1, 'accepted', 'marker-added']]);
    }
  });

  it('records only executed tick inputs, never cancellations, IDs, controls or sampling time', () => {
    const { firstRun, firstRunJson, secondRun, events } = drive('sampled-10x', 1);
    const commands = firstRun.record.ticks.map(tick => tick.commands.map(command => command.type));
    expect(commands.filter(list => list.length > 0)).toEqual([['add-marker', 'remove-marker'], ['add-marker'], ['remove-marker']]);
    expect(events.some(entry => entry[0] === 1 && entry[4] === 4)).toBe(false);
    const json = JSON.stringify(firstRun.record);
    for (const word of FORBIDDEN_IN_RECORD) expect(json).not.toContain(word);
    expect(Object.keys(firstRun.record).sort()).toEqual(['checkpointInterval', 'config', 'format', 'ticks', 'version']);
    expect(secondRun.record.ticks[0]).toEqual({ input: { moveX: 0 }, commands: [{ type: 'add-marker' }] });
    expect(secondRun.result.checkpoints[0].tick).toBe(0);
    expect(JSON.stringify(firstRun)).toBe(firstRunJson);
  });

  it('keeps UI errors and unconfirmed results out of a faulted run recording', () => {
    const exports: SyntheticRecording[] = [];
    for (const mode of ['bare', 'sampled-10x'] as const) {
      const h = harness(mode, 1);
      h.session.control({ type: 'start' });
      h.frame(0);
      h.submit('add-marker');
      h.frame(20);
      h.session.control({ type: 'pause' });
      if (mode !== 'bare') {
        h.submit('remove-marker');
        expect(h.writer.reader.getState().actionError).toMatchObject({ operation: 'remove-marker', cause: { kind: 'invalid-state' } });
      }
      h.session.control({ type: 'resume' });
      h.frame(1000);
      h.submit('remove-marker');
      injection.failOn = injection.calls + 2;
      h.host.deliver(1040);
      injection.failOn = 0;
      if (mode !== 'bare') {
        expect(h.writer.reader.getState()).toMatchObject({ status: { phase: 'faulted' }, pendingCommands: [] });
        expect(settled(h.writer.reader.getState()).at(-1)).toEqual([1, 2, 'unconfirmed', 'session-failed']);
      }
      const recording = h.run().exportRecording();
      if (!recording) throw new Error('Expected a recording');
      exports.push(recording);
      injection.calls = 0;
    }
    const [bare, bridged] = exports;
    expect(bridged).toEqual(bare);
    expect(bridged.record.ticks.map(tick => tick.commands.map(command => command.type))).toEqual([['add-marker'], ['remove-marker']]);
    const json = JSON.stringify(bridged.record);
    for (const word of FORBIDDEN_IN_RECORD) expect(json).not.toContain(word);
    const replayed = replaySyntheticRecord(JSON.parse(JSON.stringify(bridged.record)));
    expect(compareSyntheticReplayResults(bridged.result, replayed)).toEqual({ match: true });
  });
});
