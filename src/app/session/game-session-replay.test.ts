import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../../core/contracts/domain-events.ts';
import type { Command } from '../../core/contracts/tick-input.ts';
import { compareReplayResults } from '../../core/replay/compare.ts';
import type { Recording, RecordingOptions } from '../../core/replay/recording.ts';
import { replayRecord } from '../../core/replay/replay.ts';
import { contentOf, roundTrip } from '../../core/replay/replay.test-support.ts';
import type { FrameReport } from '../runtime/game-runtime.ts';
import { NEUTRAL_AXES, recordingOptions, TICK_MS } from '../runtime/game-runtime.test-support.ts';
import type { GameCommandsCancelled, GameRunSpec } from './game-session.ts';
import { current, departure, runSpec, sessionSetup } from './game-session.test-support.ts';

// AC-06: a run taken through the session's lifecycle records exactly the input its successful ticks executed. The
// commands that end up cancelled are all `cockpit-front`, which no executed command uses. The secondary fire launches
// guided missiles at the automatically selected target, which then fly (P3-07/22).

const EXECUTED: readonly Command[] = [{ type: 'launch' }, { type: 'fire', channel: 'secondary' }, { type: 'select-number', value: 3 }, { type: 'map-point', operation: 'hover', right: 0.25, down: 0.5 }];
const DOOMED: Command = { type: 'cockpit-front' };
const PRIMARY_FIRE = JSON.stringify({ type: 'fire', channel: 'primary' });

/** `spec` with a lifetime its missiles' guidance accepts: the synthetic records' is negative, which it rejects (P3-07/20). */
function flyable(spec: GameRunSpec): GameRunSpec {
  for (const missile of (spec.craftInfo.content as unknown as { missiles: { at44: number }[] }).missiles) missile.at44 = 320;
  return spec;
}

/**
 * From the initial departure hold (hidden during it), through a user pause, a hidden pause, a menu-style pause, held
 * and pressed fire, commands deferred over several ticks, zero-tick and capped frames, and clearing input on focus loss
 * and on a Pointer Lock exit.
 */
function lifecycle(recording: RecordingOptions | null) {
  const spec = flyable(runSpec({ run: { wingman: 2 }, recording, initialTransition: departure('wingman') }));
  const { session, host, errors } = sessionSetup();
  session.control({ type: 'start', spec });
  const run = current(session);
  const delivered: DomainEvent[] = [], cancelled: GameCommandsCancelled[] = [], reports: (FrameReport | null)[] = [];
  run.onAny((event) => { delivered.push(event); });
  run.onCommandsCancelled((notice) => { cancelled.push(notice); });
  run.onFrame((frame) => { reports.push(frame.report); });
  let submitted = 0;
  const submit = (command: Command, times = 1) => { for (let index = 0; index < times; index++) { run.submitCommand(command); submitted++; } };
  let now = 1000;
  const frame = (ticks: number) => { now += ticks * TICK_MS; host.deliver(now); };

  host.emit({ type: 'visibility', visibility: 'hidden' });
  host.emit({ type: 'visibility', visibility: 'visible' });
  const zeroTick = run.exportRecording();
  session.control({ type: 'complete-departure', runId: run.runId });
  expect(session.status()).toMatchObject({ phase: 'paused', pauseReason: 'hidden', resumeRequired: true });
  session.control({ type: 'resume' });
  frame(0);
  run.setIntent({ axes: { pitch: 0.5, yaw: -0.25, roll: 0 }, primaryFire: true });
  for (let index = 0; index < 150; index++) submit(EXECUTED[index % EXECUTED.length]);
  frame(3);
  frame(0.5);
  run.setIntent({ axes: NEUTRAL_AXES, primaryFire: false });
  run.setIntent({ axes: NEUTRAL_AXES, primaryFire: true });
  run.setIntent({ axes: { pitch: 0, yaw: 1, roll: -1 }, primaryFire: false });
  frame(6.5);
  // A user pause.
  submit(DOOMED, 10);
  session.control({ type: 'pause' });
  now += 5000;
  session.control({ type: 'resume' });
  frame(0);
  run.setIntent({ axes: NEUTRAL_AXES, primaryFire: true });
  submit(EXECUTED[0]);
  frame(1.75);
  const middle = run.exportRecording();
  // A hidden pause.
  submit(DOOMED, 3);
  host.emit({ type: 'visibility', visibility: 'hidden' });
  now += 1234;
  host.emit({ type: 'visibility', visibility: 'visible' });
  session.control({ type: 'resume' });
  frame(0);
  // A menu-style pause: paused while the menu is open, through a hidden page, resumed when it closes.
  submit(DOOMED, 2);
  session.control({ type: 'pause' });
  host.emit({ type: 'visibility', visibility: 'hidden' });
  host.emit({ type: 'visibility', visibility: 'visible' });
  session.control({ type: 'pause' });
  expect(session.status()).toMatchObject({ phase: 'paused', pauseReason: 'user' });
  now += 99_999;
  session.control({ type: 'resume' });
  frame(0);
  // Clearing input on focus loss leaves Core as it was and the clock anchored; a Pointer Lock exit finds nothing to clear.
  run.setIntent({ axes: { pitch: -1, yaw: 0, roll: 0.5 }, primaryFire: true });
  for (let index = 0; index < 63; index++) submit(EXECUTED[index % EXECUTED.length]);
  submit(DOOMED, 9);
  frame(1);
  const before = run.snapshot();
  session.control({ type: 'clear-input', reason: 'focus-loss' });
  expect(run.snapshot()).toEqual(before);
  frame(2.25);
  session.control({ type: 'clear-input', reason: 'pointer-lock-exit' });
  submit(EXECUTED[1]);
  frame(1);
  expect(errors).toEqual([]);
  return { spec, session, host, run, delivered, cancelled, reports, submitted, zeroTick, middle };
}

const ticksOf = (recording: Recording | null) => recording?.record.ticks ?? [];

describe('session lifecycle recording', () => {
  it.each([1, 4])('replays the executed input after a JSON round trip, interval %s: events and every checkpoint agree', (interval) => {
    const { spec, run, delivered, cancelled, reports, submitted, zeroTick, middle } = lifecycle(recordingOptions(interval));
    expect(reports.filter((report) => report !== null).map((report) => report.ticks)).toEqual([0, 3, 0, 5, 0, 1, 0, 0, 1, 2, 1]);
    expect(reports.filter((report) => report?.capped)).toHaveLength(1);
    expect(cancelled.map(({ reason, commandIds }) => [reason, commandIds.length])).toEqual([['user-pause', 10], ['hidden', 3], ['user-pause', 2], ['focus-loss', 9]]);
    const exported = run.exportRecording();
    if (!exported) throw new Error('expected a recording');
    const { record, result } = exported;
    expect(record.ticks).toHaveLength(13);
    expect(result.finalTick).toBe(13);
    const commands = record.ticks.flatMap((input) => input.commands.map((command) => JSON.stringify(command)));
    expect(commands).not.toContain(JSON.stringify(DOOMED));
    expect(commands.filter((command) => command !== PRIMARY_FIRE)).toHaveLength(submitted - 24);
    expect(record.ticks.slice(9).map((input) => input.axes)).toEqual([{ pitch: -1, yaw: 0, roll: 0.5 }, NEUTRAL_AXES, NEUTRAL_AXES, NEUTRAL_AXES]);
    expect(result.checkpoints.map((checkpoint) => checkpoint.tick)).toEqual(interval === 1 ? Array.from({ length: 14 }, (_, tick) => tick) : [0, 4, 8, 12, 13]);
    expect(delivered).toEqual(result.events);
    // The tick-10 missile flies through ticks 11 to 13 in both runs.
    expect(result.events.flatMap((event) => (event.type === 'shot-fired' && event.family === 'missile' ? [event.tick] : []))).toEqual([10, 13]);
    const text = JSON.stringify(record);
    expect(text).not.toMatch(/commandId|runId|nowMs|cockpit-front|G-02|resumeRequired|pause/);
    const replayed = replayRecord(roundTrip(record), contentOf(spec as never));
    expect(replayed).toEqual(result);
    expect(compareReplayResults(roundTrip(result), replayed)).toEqual({ match: true });
    // Zero ticks: exported during the hold.
    expect(zeroTick?.record.ticks).toEqual([]);
    expect(zeroTick?.result).toMatchObject({ finalTick: 0, events: [] });
    expect(zeroTick?.result.checkpoints.map((checkpoint) => checkpoint.tick)).toEqual([0]);
    expect(replayRecord(roundTrip(zeroTick?.record), contentOf(spec as never))).toEqual(zeroTick?.result);
    // An earlier export is a frozen prefix.
    expect(ticksOf(middle)).toEqual(record.ticks.slice(0, 9));
    expect(replayRecord(roundTrip(middle?.record), contentOf(spec as never))).toEqual(middle?.result);
  });

  it('starts a new run\'s recording from tick 0 and leaves the exported copies unchanged', () => {
    const { spec, session, host, run, middle } = lifecycle(recordingOptions(4));
    const first = run.exportRecording();
    const texts = [JSON.stringify(first), JSON.stringify(middle)];
    session.control({ type: 'exit' });
    const next = runSpec({ recording: recordingOptions(4), run: { seed: 99 } });
    session.control({ type: 'start', spec: next });
    const second = current(session);
    expect(second.runId).toBe(2);
    expect(second.exportRecording()?.record.ticks).toEqual([]);
    host.deliver(0); host.deliver(2 * TICK_MS);
    const exported = second.exportRecording();
    expect(exported?.record).toMatchObject({ run: { seed: 99, wingman: null }, ticks: [expect.anything(), expect.anything()] });
    expect(replayRecord(roundTrip(exported?.record), contentOf(next as never))).toEqual(exported?.result);
    expect([JSON.stringify(first), JSON.stringify(middle)]).toEqual(texts);
    expect(replayRecord(roundTrip(first?.record), contentOf(spec as never))).toEqual(first?.result);
  });

  it('does exactly the same with recording off', () => {
    const outputs = [recordingOptions(4), null].map((recording) => {
      const { run, delivered, cancelled, reports } = lifecycle(recording);
      return { delivered, cancelled, reports, projection: run.projection(), render: run.renderFrame(), snapshot: run.snapshot(), recorded: run.exportRecording() !== null };
    });
    expect(outputs.map((output) => output.recorded)).toEqual([true, false]);
    expect({ ...outputs[0], recorded: null }).toEqual({ ...outputs[1], recorded: null });
  });
});
