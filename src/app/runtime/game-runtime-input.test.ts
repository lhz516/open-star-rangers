import { describe, expect, it } from 'vitest';
import type { Command, TickInput } from '../../core/contracts/tick-input.ts';
import { CORE_LIMITS } from '../../core/contracts/limits.ts';
import { CoreInputError } from '../../core/errors.ts';
import { COMMAND_QUEUE_LIMIT, createGameRuntime, type GameIntent, type GameRuntime } from './game-runtime.ts';
import { thrownBy } from '../../core/world/world.test-support.ts';
import { NEUTRAL_AXES as NEUTRAL, recordingOptions, runtimeSpec, TICK_MS } from './game-runtime.test-support.ts';
import { GameRuntimeError } from './runtime-errors.ts';

const hold = (primaryFire: boolean): GameIntent => ({ axes: NEUTRAL, primaryFire });
const launch = (): Command => ({ type: 'launch' });

interface Delivered {
  readonly tick: number;
  readonly type: string;
  readonly commandIndex: number | null;
  readonly commandId: number | null;
}

/** A recording Runtime, anchored at time 0, with a receiver of every delivery from the start. */
function recorded() {
  const runtime = createGameRuntime(runtimeSpec({ recording: recordingOptions(1) }));
  const delivered: Delivered[] = [];
  runtime.onAny((event, { commandId }) => {
    delivered.push({ tick: event.tick, type: event.type, commandIndex: event.type === 'command-result' ? event.commandIndex : null, commandId });
  });
  let now = 0;
  runtime.frame(now);
  return {
    runtime,
    delivered,
    /** Runs a frame `ticks` ticks after the last one. */
    advance(ticks: number) {
      now += ticks * TICK_MS;
      return runtime.frame(now);
    },
    /** The recorded inputs of ticks `from` onwards (1-based). */
    inputs(from = 1): readonly TickInput[] {
      return runtime.exportRecording()?.record.ticks.slice(from - 1) ?? [];
    },
    /** Each recorded tick's commands as labels: `fire:primary`, other types by name. */
    commands(from = 1): string[][] {
      return this.inputs(from).map((input) => input.commands.map((command) => (command.type === 'fire' ? `fire:${command.channel}` : command.type)));
    },
    /** The submitted IDs delivered with command results of tick `tick`, by commandIndex. */
    results(tick: number): (number | null)[] {
      return delivered.filter((entry) => entry.tick === tick && entry.type === 'command-result').map((entry) => entry.commandId);
    },
  };
}

describe('GameRuntime intent', () => {
  it('validates and normalises the axes as Core does, and keeps them for every later tick until changed', () => {
    const run = recorded();
    const intent = { axes: { pitch: -0, yaw: 0.5, roll: -1 }, primaryFire: false };
    run.runtime.setIntent(intent);
    intent.axes.yaw = 1;
    intent.primaryFire = true;
    run.advance(2);
    run.runtime.setIntent({ axes: { pitch: 1, yaw: 0, roll: 0 }, primaryFire: false });
    run.advance(1);
    const axes = run.inputs().map((input) => input.axes);
    expect(axes).toEqual([{ pitch: 0, yaw: 0.5, roll: -1 }, { pitch: 0, yaw: 0.5, roll: -1 }, { pitch: 1, yaw: 0, roll: 0 }]);
    expect(Object.is(axes[0].pitch, 0)).toBe(true);
    expect(run.commands()).toEqual([[], [], []]);
  });

  it.each([
    ['a non-object', null, 'intent', 'must be a plain object'],
    ['an accessor', Object.defineProperty({ axes: NEUTRAL }, 'primaryFire', { get: () => { throw new Error('ran'); }, enumerable: true }), 'intent', 'must contain only enumerable data fields'],
    ['an extra field', { ...hold(false), secondaryFire: false }, 'intent', 'contains unknown fields'],
    ['no primaryFire', { axes: NEUTRAL }, 'intent.primaryFire', 'is required'],
    ['a non-boolean primaryFire', { axes: NEUTRAL, primaryFire: 1 }, 'intent.primaryFire', 'must be a boolean'],
    ['an axis out of range', { axes: { ...NEUTRAL, pitch: 1.5 }, primaryFire: true }, 'intent.axes.pitch', null],
    ['a non-finite axis', { axes: { ...NEUTRAL, roll: NaN }, primaryFire: true }, 'intent.axes.roll', null],
    ['a missing axis', { axes: { pitch: 0, yaw: 0 }, primaryFire: true }, 'intent.axes.roll', null],
  ])('rejects %s and keeps the accepted intent', (_name, intent, path, reason) => {
    const run = recorded();
    run.runtime.setIntent({ axes: { pitch: 0.25, yaw: 0, roll: 0 }, primaryFire: false });
    const error = thrownBy(() => run.runtime.setIntent(intent as GameIntent));
    expect(error).toBeInstanceOf(GameRuntimeError);
    expect(error).toMatchObject({ kind: 'invalid-argument', path, ...(reason === null ? {} : { reason }) });
    if (reason === null) expect((error as Error).cause).toBeInstanceOf(CoreInputError);
    run.advance(1);
    expect(run.inputs()).toEqual([{ axes: { pitch: 0.25, yaw: 0, roll: 0 }, commands: [] }]);
  });
});

describe('GameRuntime primary fire', () => {
  it('fires once per tick while held, with null delivery IDs', () => {
    const run = recorded();
    run.runtime.setIntent(hold(true));
    run.advance(3);
    run.runtime.setIntent(hold(false));
    run.advance(1);
    expect(run.commands()).toEqual([['fire:primary'], ['fire:primary'], ['fire:primary'], []]);
    expect([1, 2, 3].map((tick) => run.results(tick))).toEqual([[null], [null], [null]]);
  });

  it('keeps one press between ticks, however many, and only after a step', () => {
    const run = recorded();
    for (const primaryFire of [true, false, true, false, true, false]) run.runtime.setIntent(hold(primaryFire));
    // A frame without ticks keeps the mark.
    expect(run.advance(0.5).ticks).toBe(0);
    expect(run.advance(1.5).ticks).toBe(2);
    expect(run.commands()).toEqual([['fire:primary'], []]);
    // Pressing again while held adds nothing: one per tick.
    run.runtime.setIntent(hold(true));
    run.runtime.setIntent(hold(false));
    run.runtime.setIntent(hold(true));
    run.advance(2);
    expect(run.commands(3)).toEqual([['fire:primary'], ['fire:primary']]);
  });

  it('runs beside a submitted fire, which keeps its own ID', () => {
    const run = recorded();
    run.runtime.setIntent(hold(true));
    const id = run.runtime.submitCommand({ type: 'fire', channel: 'primary' });
    run.advance(1);
    expect(run.commands()).toEqual([['fire:primary', 'fire:primary']]);
    expect(run.results(1)).toEqual([null, id]);
  });
});

describe('GameRuntime command queue and batches', () => {
  it(`holds ${COMMAND_QUEUE_LIMIT} commands, refuses one more without using an ID, and runs ${CORE_LIMITS.commandsPerTick} per tick`, () => {
    const run = recorded();
    const ids = Array.from({ length: COMMAND_QUEUE_LIMIT }, () => run.runtime.submitCommand(launch()));
    expect(ids).toEqual(Array.from({ length: COMMAND_QUEUE_LIMIT }, (_, index) => index + 1));
    const full = thrownBy(() => run.runtime.submitCommand(launch()));
    expect(full).toBeInstanceOf(GameRuntimeError);
    expect(full).toMatchObject({ kind: 'command-queue-full' });
    run.advance(4);
    expect(run.inputs().map((input) => input.commands.length)).toEqual([64, 64, 64, 64]);
    expect([1, 2, 3, 4].flatMap((tick) => run.results(tick))).toEqual(ids);
    expect(run.runtime.submitCommand(launch())).toBe(COMMAND_QUEUE_LIMIT + 1);
  });

  it('defers the 65th command to the next tick, and automatic fire takes one place', () => {
    const run = recorded();
    for (let index = 0; index < 65; index++) run.runtime.submitCommand(launch());
    run.advance(2);
    expect(run.inputs().map((input) => input.commands.length)).toEqual([64, 1]);
    expect(run.results(2)).toEqual([65]);
    run.runtime.setIntent(hold(true));
    for (let index = 0; index < 64; index++) run.runtime.submitCommand(launch());
    run.advance(2);
    expect(run.commands(3).map((commands) => [commands[0], commands.length])).toEqual([['fire:primary', 64], ['fire:primary', 2]]);
    expect(run.results(3)).toEqual([null, ...Array.from({ length: 63 }, (_, index) => 66 + index)]);
    expect(run.results(4)).toEqual([null, 129]);
  });

  it('keeps FIFO order across ticks and frames without losing a command, with an independent map per tick', () => {
    const run = recorded();
    const types: Command[] = [{ type: 'launch' }, { type: 'toggle-map' }, { type: 'request-warp' }, { type: 'damage-report' }];
    const submitted = Array.from({ length: COMMAND_QUEUE_LIMIT }, (_, index) => ({ id: run.runtime.submitCommand(types[index % 4]), type: types[index % 4].type }));
    run.runtime.setIntent(hold(true));
    // A receiver's submissions join the queue behind the rest and run in a later frame.
    let late = 0;
    run.runtime.on('command-result', () => {
      if (late === 0) late = run.runtime.submitCommand({ type: 'cockpit-front' });
    });
    expect(run.advance(5).ticks).toBe(5);
    const inputs = run.inputs();
    expect(inputs.map((input) => input.commands.length)).toEqual([64, 64, 64, 64, 5]);
    const executed = inputs.flatMap((input) => input.commands.slice(1));
    expect(executed.map((command) => command.type)).toEqual(submitted.map((entry) => entry.type));
    for (let tick = 1; tick <= 5; tick++) {
      const results = run.delivered.filter((entry) => entry.tick === tick && entry.type === 'command-result');
      // Each tick's commandIndex restarts at 0 and maps through that tick's own batch.
      expect(results.map((entry) => entry.commandIndex)).toEqual(inputs[tick - 1].commands.map((_, index) => index));
      expect(results.map((entry) => entry.commandId)).toEqual([null, ...submitted.slice((tick - 1) * 63, tick * 63).map((entry) => entry.id)]);
    }
    expect(run.delivered.filter((entry) => entry.type === 'object-instantiated').every((entry) => entry.commandId === null)).toBe(true);
    expect(run.delivered.some((entry) => entry.type === 'object-instantiated')).toBe(true);
    expect(late).toBe(COMMAND_QUEUE_LIMIT + 1);
    run.advance(1);
    expect(run.commands(6)).toEqual([['fire:primary', 'cockpit-front']]);
    expect(run.results(6)).toEqual([null, late]);
  });

  it.each([
    ['an unknown type', { type: 'warp' }, 'command.type'],
    ['an extra field', { type: 'launch', value: 1 }, 'command'],
    ['a bad field', { type: 'fire', channel: 'tertiary' }, 'command.channel'],
    ['a non-object', 'launch', 'command'],
  ])('rejects %s without changing the queue or the next ID', (_name, command, path) => {
    const run = recorded();
    expect(run.runtime.submitCommand(launch())).toBe(1);
    const error = thrownBy(() => run.runtime.submitCommand(command as Command));
    expect(error).toMatchObject({ kind: 'invalid-argument', path });
    expect((error as Error).cause).toBeInstanceOf(CoreInputError);
    expect(run.runtime.submitCommand({ type: 'toggle-map' })).toBe(2);
    run.advance(1);
    expect(run.commands()).toEqual([['launch', 'toggle-map']]);
  });

  it('gives only a command\'s own result its ID: P3-06\'s events that name the command by commandIndex carry null', () => {
    // The automatic target selection (P3-07 CR-07) names no command either.
    const run = recorded();
    // The first tick instantiates the player and the second activates it, so the third takes speed commands.
    run.advance(2);
    run.runtime.setIntent(hold(true));
    const toggle = run.runtime.submitCommand({ type: 'speed', operation: 'toggle-auto-match' });
    run.advance(1);
    expect(run.commands(3)).toEqual([['fire:primary', 'speed']]);
    expect(run.delivered.filter((entry) => entry.tick === 3).map(({ type, commandIndex, commandId }) => [type, commandIndex, commandId])).toEqual([
      ['command-result', 0, null], ['command-result', 1, toggle], ['speed-assist-toggled', null, null], ['target-changed', null, null],
    ]);
  });

  it('queues a copy that later changes to the submitted object do not reach', () => {
    const run = recorded();
    const command = { type: 'speed', operation: 'increase' };
    run.runtime.submitCommand(command as Command);
    command.operation = 'decrease';
    run.advance(1);
    expect(run.inputs()[0].commands).toEqual([{ type: 'speed', operation: 'increase' }]);
  });

  it('clears the intent, the press mark and the queue, returning the unexecuted IDs in FIFO order once', () => {
    const run = recorded();
    run.runtime.setIntent({ axes: { pitch: 1, yaw: 1, roll: 1 }, primaryFire: true });
    for (let index = 0; index < 70; index++) run.runtime.submitCommand(launch());
    run.advance(1);
    run.runtime.setIntent(hold(false));
    run.runtime.setIntent(hold(true));
    expect(run.runtime.clearIntent()).toEqual(Array.from({ length: 7 }, (_, index) => 64 + index));
    expect(run.runtime.clearIntent()).toEqual([]);
    run.advance(1);
    expect(run.inputs(2)).toEqual([{ axes: NEUTRAL, commands: [] }]);
    expect(run.runtime.submitCommand(launch())).toBe(71);
  });
});

/** Only the methods a frame's receivers may call besides reads. */
function checkTypes(runtime: GameRuntime) {
  // @ts-expect-error Intent axes are numbers.
  runtime.setIntent({ axes: { pitch: '0', yaw: 0, roll: 0 }, primaryFire: false });
  // @ts-expect-error Commands are Core's closed union.
  runtime.submitCommand({ type: 'add-marker' });
}
void checkTypes;
