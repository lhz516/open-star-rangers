import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../../core/contracts/domain-events.ts';
import { CORE_LIMITS } from '../../core/contracts/limits.ts';
import type { Command } from '../../core/contracts/tick-input.ts';
import { CoreInputError } from '../../core/errors.ts';
import { replayRecord } from '../../core/replay/replay.ts';
import { contentOf } from '../../core/replay/replay.test-support.ts';
import { playerOnlyMission } from '../../core/world/create-world.test-support.ts';
import { thrownBy } from '../../core/world/world.test-support.ts';
import type { EventDelivery } from './game-event-bus.ts';
import { COMMAND_QUEUE_LIMIT, createGameRuntime, type FrameReport, type GameRuntime } from './game-runtime.ts';
import { NEUTRAL_AXES as NEUTRAL, recordingOptions, runtimeSpec, TICK_MS } from './game-runtime.test-support.ts';

const COMMANDS: readonly Command[] = [
  { type: 'launch' }, { type: 'fire', channel: 'secondary' }, { type: 'select-number', value: 3 }, { type: 'speed-preset', level: 5 },
  { type: 'map-point', operation: 'hover', right: 0.25, down: 0.5 },
];

/**
 * Drives `runtime` through held and pressed fire, commands deferred over several ticks, zero-tick and capped frames,
 * and the Session's lifecycle operations (fold, re-anchor, clear) between them. Returns the frame reports.
 */
function script(runtime: GameRuntime): FrameReport[] {
  const reports: FrameReport[] = [];
  let now = 1000;
  const frame = (ticks: number) => { now += ticks * TICK_MS; reports.push(runtime.frame(now)); };
  frame(0);
  runtime.setIntent({ axes: { pitch: 0.5, yaw: -0.25, roll: 0 }, primaryFire: true });
  for (let index = 0; index < 150; index++) runtime.submitCommand(COMMANDS[index % COMMANDS.length]);
  frame(3);
  frame(0.5);
  runtime.setIntent({ axes: NEUTRAL, primaryFire: false });
  runtime.setIntent({ axes: NEUTRAL, primaryFire: true });
  runtime.setIntent({ axes: { pitch: 0, yaw: 1, roll: -1 }, primaryFire: false });
  frame(6.5);
  // A pause: cancel what is queued, fold, and re-anchor on resume.
  for (let index = 0; index < 10; index++) runtime.submitCommand(COMMANDS[index % COMMANDS.length]);
  runtime.clearIntent();
  runtime.foldRenderState();
  runtime.resetClock();
  now += 5000;
  frame(0);
  runtime.setIntent({ axes: NEUTRAL, primaryFire: true });
  runtime.submitCommand({ type: 'cockpit-front' });
  frame(1.75);
  frame(1.25);
  return reports;
}

describe('GameRuntime recording', () => {
  it.each([1, 4])('replays held fire and deferred commands with interval %s: events and every checkpoint agree', (interval) => {
    const spec = runtimeSpec({ recording: recordingOptions(interval), run: { wingman: 2 } });
    const runtime = createGameRuntime(spec);
    const delivered: DomainEvent[] = [];
    runtime.onAny((event) => { delivered.push(event); });
    const reports = script(runtime);
    const ticks = reports.reduce((sum, report) => sum + report.ticks, 0);
    expect(reports.map((report) => report.ticks)).toEqual([0, 3, 0, 5, 0, 1, 2]);
    expect(reports[3].capped).toBe(true);
    const exported = runtime.exportRecording();
    if (!exported) throw new Error('expected a recording');
    const { record, result } = exported;
    expect(record.ticks).toHaveLength(ticks);
    expect(result.finalTick).toBe(ticks);
    // Held fire every tick, deferred commands in FIFO order after it, the press kept once, cancelled commands absent.
    expect(record.ticks.map((input) => input.commands.length)).toEqual([64, 64, 25, 1, 0, 0, 0, 0, 2, 1, 1]);
    expect(record.ticks.slice(0, 3).flatMap((input) => input.commands.slice(1))).toEqual(Array.from({ length: 150 }, (_, index) => COMMANDS[index % COMMANDS.length]));
    expect(record.ticks[8].commands).toEqual([{ type: 'fire', channel: 'primary' }, { type: 'cockpit-front' }]);
    expect(record.ticks[4].axes).toEqual({ pitch: 0, yaw: 1, roll: -1 });
    expect(result.checkpoints.map((checkpoint) => checkpoint.tick)).toEqual(
      interval === 1 ? Array.from({ length: ticks + 1 }, (_, tick) => tick) : [0, 4, 8, ticks],
    );
    expect(delivered).toEqual(result.events);
    const text = JSON.stringify(record);
    expect(text).not.toMatch(/commandId|nowMs|runId/);
    expect(replayRecord(JSON.parse(text), contentOf(spec))).toEqual(result);
  });

  it('records nothing that changes what a run without recording does', () => {
    const outputs = [recordingOptions(3), null].map((recording) => {
      const runtime = createGameRuntime(runtimeSpec({ recording }));
      const deliveries: [DomainEvent, EventDelivery][] = [];
      runtime.onAny((event, delivery) => { deliveries.push([event, delivery]); });
      const reports = script(runtime);
      return { reports, deliveries, projection: runtime.projection(), render: runtime.renderFrame(), snapshot: runtime.snapshot() };
    });
    expect(outputs[0]).toEqual(outputs[1]);
  });

  it('keeps earlier exports unchanged while the run continues', () => {
    const runtime = createGameRuntime(runtimeSpec({ recording: recordingOptions(2) }));
    runtime.frame(0);
    runtime.setIntent({ axes: NEUTRAL, primaryFire: true });
    runtime.frame(3 * TICK_MS);
    const first = runtime.exportRecording();
    const text = JSON.stringify(first);
    runtime.frame(7 * TICK_MS);
    const second = runtime.exportRecording();
    expect(JSON.stringify(first)).toBe(text);
    expect([first?.result.finalTick, second?.result.finalTick]).toEqual([3, 7]);
    expect(second?.record.ticks.slice(0, 3)).toEqual(first?.record.ticks);
  });
});

// Real recording capacity, at the limit and one past it, on the player-only mission to keep each tick cheap. Measured
// at load 76–86 (other sessions' checks): 6.8 s for the command case (submissions, ticks and the replay about a third
// each) and 2–4 s for the tick case. Core's limit-sized cases use the same 30 s deadline (docs/engineering/README.md#测试).
describe('GameRuntime recording capacity', { timeout: 30_000 }, () => {
  it(`stops mid-frame at ${CORE_LIMITS.recordedCommands} recorded commands, delivering the earlier ticks and staying exportable`, () => {
    const { commandsPerTick, recordedCommands } = CORE_LIMITS;
    const spec = runtimeSpec({ mission: playerOnlyMission(), recording: recordingOptions(32) });
    const runtime = createGameRuntime(spec);
    let now = 0;
    runtime.frame(now);
    const ticksPerFill = COMMAND_QUEUE_LIMIT / commandsPerTick;
    const fills = recordedCommands / COMMAND_QUEUE_LIMIT - 1;
    for (let fill = 0; fill < fills; fill++) {
      for (let index = 0; index < COMMAND_QUEUE_LIMIT; index++) runtime.submitCommand({ type: 'launch' });
      now += ticksPerFill * TICK_MS;
      expect(runtime.frame(now).ticks).toBe(ticksPerFill);
    }
    const before = fills * ticksPerFill;
    expect(runtime.projection().clock.tick).toBe(before);
    // Fire held: each tick takes the fire and 63 queued commands, so the fifth tick's fire and 4 commands no longer fit.
    const last = Array.from({ length: COMMAND_QUEUE_LIMIT }, () => runtime.submitCommand({ type: 'toggle-map' }));
    runtime.setIntent({ axes: NEUTRAL, primaryFire: true });
    const delivered: number[] = [];
    let refused: unknown;
    runtime.on('command-result', (_event, { commandId }) => {
      if (commandId !== null) delivered.push(commandId);
      refused ??= thrownBy(() => runtime.submitCommand({ type: 'launch' }));
    });
    now += 5 * TICK_MS;
    expect(runtime.frame(now)).toMatchObject({ ticks: 4, capped: false, stop: 'recording-capacity', cut: null, transitions: [], completion: null, outputs: { length: 4 } });
    expect(delivered).toEqual(last.slice(0, 4 * 63));
    expect(refused).toMatchObject({ kind: 'recording-capacity' });
    expect((refused as Error).cause).toBeInstanceOf(CoreInputError);
    expect((refused as Error).cause).toMatchObject({ path: 'recording', reason: `would exceed ${recordedCommands} recorded commands` });
    const stopped = before + 4;
    expect(runtime.projection().clock.tick).toBe(stopped);
    expect(runtime.renderFrame()).toMatchObject({ previous: { tick: stopped }, current: { tick: stopped }, alpha: 0 });
    expect(runtime.snapshot().state.tick).toBe(stopped);
    for (const action of [() => runtime.frame(now + 1000), () => runtime.setIntent({ axes: NEUTRAL, primaryFire: false }), () => runtime.submitCommand({ type: 'launch' })]) {
      expect(thrownBy(action)).toMatchObject({ kind: 'recording-capacity' });
    }
    expect(runtime.clearIntent()).toEqual(last.slice(4 * 63));
    const exported = runtime.exportRecording();
    if (!exported) throw new Error('expected a recording');
    expect(exported.record.ticks).toHaveLength(stopped);
    expect(exported.record.ticks.reduce((sum, input) => sum + input.commands.length, 0)).toBe(recordedCommands);
    expect(exported.result.checkpoints.at(-1)?.tick).toBe(stopped);
    expect(replayRecord(JSON.parse(JSON.stringify(exported.record)), contentOf(spec))).toEqual(exported.result);
  });

  it(`stops at ${CORE_LIMITS.recordedTicks} recorded ticks, refusing the next one`, () => {
    const spec = runtimeSpec({ mission: playerOnlyMission(), recording: recordingOptions(CORE_LIMITS.recordedTicks) });
    // The player's craft decelerates (+0xC0 = 2): with the shared synthetic −2 a depleted player speeds up past +0xB8,
    // and the energy rescue of this long run would meet a throttle beyond the table, a Core fault (ME-10, ME-17 decision 7).
    (spec.craftInfo as { content: { craft: { atC0: number }[] } }).content.craft[0].atC0 = 2;
    const runtime = createGameRuntime(spec);
    let now = 0;
    runtime.frame(now);
    // Up to five ticks a frame until two remain; a rescue's transition cuts its frame, and the test releases the hold
    // as the Session would.
    const recorded = () => runtime.projection().clock.tick;
    const gaps: string[] = [];
    while (CORE_LIMITS.recordedTicks - recorded() > 2) {
      now += Math.min(5, CORE_LIMITS.recordedTicks - 2 - recorded()) * TICK_MS;
      const report = runtime.frame(now);
      if (report.cut === null) continue;
      gaps.push(...report.transitions.map(({ gap }) => gap));
      runtime.releaseTransitionBarrier();
    }
    expect(gaps.length).toBeGreaterThan(0);
    const remaining = CORE_LIMITS.recordedTicks - recorded();
    now += (remaining + 2) * TICK_MS;
    expect(runtime.frame(now)).toMatchObject({ ticks: remaining, capped: false, stop: 'recording-capacity', cut: null, transitions: [], completion: null, outputs: { length: remaining } });
    expect(runtime.projection().clock.tick).toBe(CORE_LIMITS.recordedTicks);
    const exported = runtime.exportRecording();
    expect([exported?.record.ticks.length, exported?.result.finalTick]).toEqual([CORE_LIMITS.recordedTicks, CORE_LIMITS.recordedTicks]);
    expect(thrownBy(() => runtime.frame(now + TICK_MS))).toMatchObject({ kind: 'recording-capacity', cause: { reason: `would exceed ${CORE_LIMITS.recordedTicks} recorded ticks` } });
  });
});
