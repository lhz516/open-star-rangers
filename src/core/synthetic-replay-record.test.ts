import { describe, expect, it } from 'vitest';
import { CoreInputError } from './errors.ts';
import { createSyntheticScene, type Command, type SyntheticScene, type SyntheticSceneConfig, type TickInput } from './synthetic-scene.ts';
import { createSyntheticRecordingSession, type SyntheticRecording, type SyntheticReplayCheckpoint } from './synthetic-replay.ts';
import { hashSyntheticScene } from './synthetic-snapshot.ts';

const add: Command = { type: 'add-marker' };
const remove: Command = { type: 'remove-marker' };

function tick(moveX: number, ...commands: Command[]): TickInput {
  return { input: { moveX }, commands };
}

const idle = tick(0);

/** Movement, a successful add, both rejection kinds, a remove, and add/remove/add in one tick. */
const inputs = [tick(0.5, add), tick(-1, add), tick(1, remove), tick(0, remove), tick(0.25, add, remove, add), idle, tick(-0.5)];

function errorFrom(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error('expected the action to throw');
}

function isDeeplyFrozen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeeplyFrozen);
}

/** Checkpoints a control scene reaches at `ticks` when stepped with `inputs`. */
function controlCheckpoints(config: SyntheticSceneConfig, stepInputs: readonly TickInput[], ticks: readonly number[]): SyntheticReplayCheckpoint[] {
  const scene = createSyntheticScene(config);
  const checkpoints: SyntheticReplayCheckpoint[] = [];
  for (let n = 0; n <= stepInputs.length; n++) {
    if (ticks.includes(n)) checkpoints.push({ tick: n, hash: hashSyntheticScene(scene) });
    if (n < stepInputs.length) scene.step(stepInputs[n]);
  }
  return checkpoints;
}

function expectSameReads(session: SyntheticScene, control: SyntheticScene): void {
  expect(session.inspect()).toStrictEqual(control.inspect());
  expect(session.uiProjection()).toStrictEqual(control.uiProjection());
  expect(session.renderState()).toStrictEqual(control.renderState());
}

describe('recording session behaves like a plain scene (AC-07)', () => {
  it.each([undefined, 120])('returns the same events and reads tick by tick at %s Hz', (tickRateHz) => {
    const config = tickRateHz === undefined ? { seed: 42 } : { seed: 42, tickRateHz };
    const session = createSyntheticRecordingSession(config, 2);
    const control = createSyntheticScene(config);
    expectSameReads(session, control);
    for (const input of inputs) {
      expect(session.step(input)).toStrictEqual(control.step(input));
      expectSameReads(session, control);
    }
  });

  it('records every successful tick, including ticks with rejected commands, with their events', () => {
    const session = createSyntheticRecordingSession({ seed: 42 }, 1);
    const control = createSyntheticScene({ seed: 42 });
    const events = inputs.flatMap((input) => {
      session.step(input);
      return control.step(input);
    });
    const { record, result } = session.exportRecording();
    expect(record.ticks).toStrictEqual(inputs);
    expect(result.events).toStrictEqual(events);
    expect(result.events.filter((event) => event.type === 'command-rejected')).toHaveLength(2);
  });
});

describe('recording only successful steps (AC-07)', () => {
  it('leaves calls that throw out of the record and keeps recording afterwards', () => {
    const session = createSyntheticRecordingSession({ seed: 3 }, 1);
    const control = createSyntheticScene({ seed: 3 });
    const invalid: [unknown, string][] = [
      [tick(2), 'tickInput.input.moveX'],
      [{ input: { moveX: 0 }, commands: [{ type: 'teleport' }] }, 'tickInput.commands[0].type'],
      [{ input: { moveX: 0 } }, 'tickInput.commands'],
    ];
    const accepted: TickInput[] = [];
    inputs.forEach((input, index) => {
      const [bad, path] = invalid[index % invalid.length];
      const error = errorFrom(() => session.step(bad as TickInput));
      expect(error).toBeInstanceOf(CoreInputError);
      expect((error as CoreInputError).path).toBe(path);
      expect(session.step(input)).toStrictEqual(control.step(input));
      accepted.push(input);
    });
    const { record, result } = session.exportRecording();
    expect(record.ticks).toStrictEqual(accepted);
    expect(result.checkpoints).toStrictEqual(controlCheckpoints({ seed: 3 }, accepted, accepted.map((_, n) => n).concat(accepted.length)));
    expectSameReads(session, control);
  });

  it('leaves a tick rejected by a numeric guard out of the record', () => {
    // 1 / 1e-308 is finite, but a second full-speed tick would move the mover past the largest double.
    const session = createSyntheticRecordingSession({ seed: 0, tickRateHz: 1e-308 }, 1);
    session.step(tick(1));
    const error = errorFrom(() => session.step(tick(1)));
    expect(error).toBeInstanceOf(CoreInputError);
    expect((error as CoreInputError).path).toBe('tickInput.input.moveX');
    session.step(tick(-1));
    const { record, result } = session.exportRecording();
    expect(record.ticks).toStrictEqual([tick(1), tick(-1)]);
    expect(result.checkpoints.map((checkpoint) => checkpoint.tick)).toEqual([0, 1, 2]);
  });
});

describe('checkpoints (AC-07)', () => {
  const config = { seed: 8, tickRateHz: 30 };

  it.each([
    ['interval 1', 1, 7, [0, 1, 2, 3, 4, 5, 6, 7]],
    ['interval 3 ending off a multiple', 3, 7, [0, 3, 6, 7]],
    ['interval 3 ending on a multiple', 3, 6, [0, 3, 6]],
    ['an interval longer than the run', 10, 4, [0, 4]],
    ['no ticks', 3, 0, [0]],
  ])('places them at 0, the multiples and the final tick once each for %s', (_name, interval, length, ticks) => {
    const session = createSyntheticRecordingSession(config, interval);
    const stepInputs = inputs.slice(0, length);
    for (const input of stepInputs) session.step(input);
    expect(session.exportRecording().result.checkpoints).toStrictEqual(controlCheckpoints(config, stepInputs, ticks));
  });

  it('adds the final checkpoint only to the export, not to later recording', () => {
    const session = createSyntheticRecordingSession(config, 3);
    session.step(inputs[0]);
    session.step(inputs[1]);
    expect(session.exportRecording().result.checkpoints.map((checkpoint) => checkpoint.tick)).toEqual([0, 2]);
    session.step(inputs[2]);
    session.step(inputs[3]);
    expect(session.exportRecording().result.checkpoints).toStrictEqual(controlCheckpoints(config, inputs.slice(0, 4), [0, 3, 4]));
  });
});

describe('record contents (AC-07)', () => {
  it('records the effective tick rate and the seed', () => {
    expect(createSyntheticRecordingSession({ seed: 9 }, 5).exportRecording().record).toStrictEqual({
      format: 'osr-synthetic-replay',
      version: 1,
      config: { seed: 9, tickRateHz: 60 },
      checkpointInterval: 5,
      ticks: [],
    });
    expect(createSyntheticRecordingSession({ seed: 4294967295, tickRateHz: 120 }, 1).exportRecording().record.config).toStrictEqual({
      seed: 4294967295,
      tickRateHz: 120,
    });
    expect(Object.is(createSyntheticRecordingSession({ seed: -0 }, 1).exportRecording().record.config.seed, 0)).toBe(true);
  });

  it('records moveX -0 as 0 and only the contract fields', () => {
    const session = createSyntheticRecordingSession({ seed: 1 }, 1);
    session.step(tick(-0, add));
    const [recorded] = session.exportRecording().record.ticks;
    expect(Object.is(recorded.input.moveX, 0)).toBe(true);
    expect(recorded).toStrictEqual({ input: { moveX: 0 }, commands: [{ type: 'add-marker' }] });
  });

  it('records the value that was executed when a getter changes between reads', () => {
    let reads = 0;
    const input = {
      get moveX() {
        reads++;
        return reads === 1 ? 0.5 : 1;
      },
    };
    const session = createSyntheticRecordingSession({ seed: 1 }, 1);
    session.step({ input, commands: [] });
    expect(reads).toBe(1);
    expect(session.exportRecording().record.ticks[0].input.moveX).toBe(0.5);
    expect(session.inspect().mover.position.x).toBe(0.5 / 60);
  });
});

describe('isolation from the caller (AC-07)', () => {
  it('is unaffected by later changes to the config, axes, commands or arrays, and does not freeze them', () => {
    const config = { seed: 6, tickRateHz: 30 };
    const session = createSyntheticRecordingSession(config, 1);
    const command = { type: 'add-marker' as Command['type'] };
    const commands = [command];
    const axis = { moveX: 0.5 };
    const input = { input: axis, commands };
    session.step(input);
    expect([config, input, axis, commands, command].some((object) => Object.isFrozen(object))).toBe(false);

    const recordingBefore = JSON.stringify(session.exportRecording());
    const stateBefore = session.inspect();
    config.seed = 7;
    config.tickRateHz = 90;
    axis.moveX = -1;
    command.type = 'remove-marker';
    commands.push({ type: 'remove-marker' });
    input.commands = [];
    expect(JSON.stringify(session.exportRecording())).toBe(recordingBefore);
    expect(session.inspect()).toStrictEqual(stateBefore);
  });
});

describe('exportRecording (AC-07)', () => {
  it('returns deeply frozen data that later recording does not change', () => {
    const session = createSyntheticRecordingSession({ seed: 5 }, 2);
    const exports: [SyntheticRecording, string][] = [];
    for (const input of inputs) {
      session.step(input);
      const exported = session.exportRecording();
      expect(isDeeplyFrozen(exported)).toBe(true);
      exports.push([exported, JSON.stringify(exported)]);
    }
    for (const [exported, text] of exports) expect(JSON.stringify(exported)).toBe(text);
    expect(exports.map(([exported]) => exported.record.ticks.length)).toEqual(inputs.map((_, n) => n + 1));
  });

  it('does not change the scene or the recording', () => {
    const session = createSyntheticRecordingSession({ seed: 5 }, 2);
    const control = createSyntheticRecordingSession({ seed: 5 }, 2);
    const [first, ...rest] = inputs;
    session.step(first);
    control.step(first);
    const before = session.inspect();
    session.exportRecording();
    expect(session.inspect()).toStrictEqual(before);
    for (const input of rest) expect(session.step(input)).toStrictEqual(control.step(input));
    expect(session.exportRecording()).toStrictEqual(control.exportRecording());
  });
});

describe('createSyntheticRecordingSession validation (AC-07)', () => {
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53, '2', undefined, null])(
    'rejects checkpoint interval %s',
    (interval) => {
      const error = errorFrom(() => createSyntheticRecordingSession({ seed: 0 }, interval as number));
      expect(error).toBeInstanceOf(CoreInputError);
      expect((error as CoreInputError).path).toBe('checkpointInterval');
    },
  );

  it('accepts the largest safe interval', () => {
    expect(createSyntheticRecordingSession({ seed: 0 }, Number.MAX_SAFE_INTEGER).exportRecording().record.checkpointInterval).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it.each([
    [{ seed: -1 }, 'config.seed'],
    [{ seed: 0, tickRateHz: 0 }, 'config.tickRateHz'],
    [{ seed: 0, extra: 1 }, 'config.extra'],
  ])('rejects an invalid config with the createSyntheticScene path', (config, path) => {
    const error = errorFrom(() => createSyntheticRecordingSession(config as SyntheticSceneConfig, 1));
    expect(error).toBeInstanceOf(CoreInputError);
    expect((error as CoreInputError).path).toBe(path);
  });
});
