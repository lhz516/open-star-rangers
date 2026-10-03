import { describe, expect, it } from 'vitest';
import { ControlledHost } from '../../app/session/synthetic-session.test-support.ts';
import { createSyntheticSession, type SessionRun } from '../../app/session/synthetic-session.ts';
import { compareSyntheticReplayResults, replaySyntheticRecord, type SyntheticRecording } from '../../core/synthetic/synthetic-replay.ts';
import type { Command } from '../../core/synthetic/synthetic-scene.ts';
import { createSyntheticGameStore } from '../../ui/game/synthetic-game-store.ts';
import { createSyntheticSessionBridge } from '../../ui/game/synthetic-session-bridge.ts';
import { TestClock } from '../../ui/game/synthetic-ui.test-support.ts';
import { RecordingSurface } from '../scene/render-surface.test-support.ts';
import { createSyntheticRenderer, type SyntheticRendererState } from './synthetic-renderer.ts';

/** Without a renderer, or with one that draws, has failed, lost its context or has no layout. */
type Mode = 'bare' | 'drawing' | 'failed' | 'context-lost' | 'no-layout';

interface Outcome {
  readonly events: (string | number)[][];
  readonly recordings: readonly SyntheticRecording[];
  readonly draws: number;
  readonly state: SyntheticRendererState | null;
}

/** Drives the same host frames, inputs and commands (docs/plan/p1/07/spec.md AC-16). */
function drive(mode: Mode, checkpointInterval: number): Outcome {
  const host = new ControlledHost(), surface = new RecordingSurface();
  const renderer = mode === 'bare' ? null : createSyntheticRenderer({ surface, reportError: error => { throw error; } });
  const bridge = createSyntheticSessionBridge(createSyntheticGameStore(), new TestClock().read,
    renderer ? [{ attach: binding => { renderer.attach(binding); } }] : []);
  const session = createSyntheticSession({ scene: { seed: 11, tickRateHz: 50 }, recording: { checkpointInterval } }, host, error => {
    bridge.onError(error);
  });
  bridge.bind(session);
  if (mode === 'failed') {
    // Layout, attachment and the first frame draw; the run's second frame fails, mid-run.
    surface.drawFailure = new Error('draw');
    surface.drawFailureAt = 3;
  }
  if (mode === 'context-lost') surface.events?.contextLost();
  if (mode !== 'no-layout') surface.resize();
  const events: (string | number)[][] = [];
  const run = (): SessionRun => session.currentRun()!;
  const watch = (): void => {
    const current = run();
    current.onAny((event, { commandId }) => { events.push([current.runId, event.type, event.tick, event.commandIndex, commandId]); });
  };
  const submit = (type: Command['type']): void => { run().submitCommand({ type }); };
  const recordings: SyntheticRecording[] = [];
  session.control({ type: 'start' });
  watch();
  host.deliver(0);
  run().setInput({ moveX: 1 });
  submit('add-marker'); submit('remove-marker');
  host.deliver(20); host.deliver(30); host.deliver(40);
  submit('add-marker');
  host.deliver(60); host.deliver(110);
  session.control({ type: 'pause' });
  if (mode !== 'no-layout') surface.resize(800, 600);
  session.control({ type: 'resume' });
  run().setInput({ moveX: -0.5 });
  host.deliver(1000); host.deliver(1020);
  submit('remove-marker'); submit('remove-marker');
  host.deliver(1045); host.deliver(1200);
  recordings.push(run().exportRecording()!);
  session.control({ type: 'restart' });
  watch();
  host.deliver(2000);
  submit('add-marker');
  run().setInput({ moveX: 0.25 });
  host.deliver(2020); host.deliver(2150);
  recordings.push(run().exportRecording()!);
  const outcome = { events, recordings, draws: renderer?.diagnostics().draws ?? 0, state: renderer?.getSnapshot().state ?? null };
  expect(session.status()).toMatchObject({ phase: 'running', error: null });
  session.control({ type: 'dispose' });
  bridge.unbind();
  renderer?.dispose();
  return outcome;
}

describe('renderer replay invariants', () => {
  it.each([1, 4])('leaves Core events, recordings and state hashes unchanged in every renderer state (checkpoint interval %s)', interval => {
    const bare = drive('bare', interval);
    expect(bare.events.map(event => event[1])).toEqual(['marker-added', 'marker-removed', 'marker-added', 'marker-removed', 'command-rejected', 'marker-added']);
    for (const recording of bare.recordings) {
      const replayed = replaySyntheticRecord(JSON.parse(JSON.stringify(recording.record)));
      expect(compareSyntheticReplayResults(recording.result, replayed)).toEqual({ match: true });
    }
    expect(bare.recordings[0].result.checkpoints.length).toBeGreaterThan(2);
    const expected: Record<Exclude<Mode, 'bare'>, SyntheticRendererState> = {
      drawing: 'ready', failed: 'failed', 'context-lost': 'context-lost', 'no-layout': 'ready',
    };
    for (const [mode, state] of Object.entries(expected) as [Exclude<Mode, 'bare'>, SyntheticRendererState][]) {
      const outcome = drive(mode, interval);
      expect(outcome.state, mode).toBe(state);
      expect(outcome.events, mode).toEqual(bare.events);
      expect(outcome.recordings, mode).toEqual(bare.recordings);
    }
  });

  it('really draws while drawing, stops after the mid-run failure and never draws without a context or layout', () => {
    expect(drive('drawing', 1).draws).toBeGreaterThan(15);
    expect(drive('failed', 1).draws).toBe(3);
    for (const mode of ['context-lost', 'no-layout'] as const) expect(drive(mode, 1).draws, mode).toBe(0);
  });
});
