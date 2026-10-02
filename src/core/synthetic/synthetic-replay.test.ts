import { describe, expect, it } from 'vitest';
import { CoreInputError } from '../errors.ts';
import { createSyntheticScene, type Command, type TickInput } from './synthetic-scene.ts';
import { createSyntheticRecordingSession, replaySyntheticRecord, type SyntheticRecording, type SyntheticReplayRecord } from './synthetic-replay.ts';
import { hashSyntheticScene } from './synthetic-snapshot.ts';

const add: Command = { type: 'add-marker' };
const remove: Command = { type: 'remove-marker' };

function tick(moveX: number, ...commands: Command[]): TickInput {
  return { input: { moveX }, commands };
}

/**
 * Covers moveX -1/0/0.5/1, a successful add and remove, both rejection kinds, and add/remove/add
 * in one tick. Eleven ticks span two complete intervals of 4 and end off a multiple of 4.
 */
const fixedTicks: readonly TickInput[] = [
  tick(1, add),
  tick(0.5),
  tick(-1, add),
  tick(0, remove),
  tick(0.5, remove),
  tick(1, add, remove, add),
  tick(-1),
  tick(0),
  tick(0.5, remove),
  tick(1, add),
  tick(-1),
];

function record(seed: number, tickRateHz: number, checkpointInterval: number, ticks: readonly TickInput[] = fixedTicks): SyntheticRecording {
  const session = createSyntheticRecordingSession({ seed, tickRateHz }, checkpointInterval);
  for (const input of ticks) session.step(input);
  return session.exportRecording();
}

function errorFrom(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error('expected the action to throw');
}

function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// Characteristic lock (technical decision 7): pins the checkpoint hashes of one fixed record. It
// only detects unintended changes to behaviour or encoding and does not prove correctness. An
// intended change must update these values in the same change and say why.
const PINNED = [
  { tick: 0, hash: '76828b86b27f508c' },
  { tick: 4, hash: 'f904e7ab14d5bf8c' },
  { tick: 8, hash: '082b2f7f7c92aadf' },
  { tick: 11, hash: '31393b356bd797b7' },
];

describe('replaySyntheticRecord reproduces the recording (AC-08)', () => {
  describe.each([60, 120])('at %i Hz', (tickRateHz) => {
    describe.each([0, 4294967295])('with seed %i', (seed) => {
      it('matches the recording exactly with interval 1, without a duplicate final checkpoint', () => {
        const { record: input, result } = record(seed, tickRateHz, 1);
        const replayed = replaySyntheticRecord(input);
        expect(replayed).toStrictEqual(result);
        expect(replayed.checkpoints.map((checkpoint) => checkpoint.tick)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      });

      it('matches the recording exactly with interval 4, adding the final checkpoint at tick 11', () => {
        const { record: input, result } = record(seed, tickRateHz, 4);
        const replayed = replaySyntheticRecord(input);
        expect(replayed).toStrictEqual(result);
        expect(replayed.checkpoints.map((checkpoint) => checkpoint.tick)).toEqual([0, 4, 8, 11]);
        expect(replayed.events.map((event) => event.type)).toEqual([
          'marker-added',
          'command-rejected',
          'marker-removed',
          'command-rejected',
          'marker-added',
          'marker-removed',
          'marker-added',
          'marker-removed',
          'marker-added',
        ]);
      });
    });
  });

  it('gives an empty record only the tick 0 checkpoint and no events', () => {
    const empty: SyntheticReplayRecord = {
      format: 'osr-synthetic-replay',
      version: 1,
      config: { seed: 0, tickRateHz: 60 },
      checkpointInterval: 3,
      ticks: [],
    };
    expect(replaySyntheticRecord(empty)).toStrictEqual({
      events: [],
      checkpoints: [{ tick: 0, hash: hashSyntheticScene(createSyntheticScene({ seed: 0 })) }],
    });
  });

  it('gives the same result after a JSON round trip of record and result', () => {
    const { record: input, result } = record(7, 120, 4);
    expect(plain(replaySyntheticRecord(plain(input)))).toStrictEqual(plain(result));
  });

  it('is unaffected by the original session continuing after the export, and repeatable', () => {
    const session = createSyntheticRecordingSession({ seed: 9, tickRateHz: 60 }, 4);
    for (const input of fixedTicks) session.step(input);
    const exported = session.exportRecording();
    for (const input of fixedTicks) session.step(input);
    const first = replaySyntheticRecord(exported.record);
    const second = replaySyntheticRecord(exported.record);
    expect(first).toStrictEqual(exported.result);
    expect(second).toStrictEqual(first);
    expect(second).not.toBe(first);
  });

  it('accepts -0 in the config and input as 0', () => {
    const { record: input, result } = record(0, 60, 2, [tick(-0, add), tick(0)]);
    expect(replaySyntheticRecord({ ...input, config: { seed: -0, tickRateHz: 60 }, ticks: [tick(-0, add), tick(-0)] })).toStrictEqual(result);
  });

  it('reproduces the pinned checkpoint hashes of the fixed record', () => {
    expect(replaySyntheticRecord(record(0, 60, 4).record).checkpoints).toStrictEqual(PINNED);
  });
});

describe('replaySyntheticRecord rejects invalid records (AC-10)', () => {
  const valid = (): Record<string, unknown> => plain(record(1, 60, 4).record) as unknown as Record<string, unknown>;
  const withTicks = (ticks: unknown[]) => ({ ...valid(), ticks });

  const longTicks = Array.from({ length: 13 }, () => tick(0) as unknown);
  longTicks[12] = { input: { moveX: 0 }, commands: [{ type: 'teleport' }] };

  // eslint-disable-next-line no-sparse-arrays
  const sparse = [tick(0), , tick(0)];

  const invalid: [string, () => unknown, string][] = [
    ['null record', () => null, 'record'],
    ['array record', () => [], 'record'],
    ['wrong format', () => ({ ...valid(), format: 'osr-synthetic-snapshot' }), 'record.format'],
    ['unknown version', () => ({ ...valid(), version: 2 }), 'record.version'],
    ['missing ticks', () => {
      const rest = valid();
      delete rest.ticks;
      return rest;
    }, 'record.ticks'],
    ['extra field', () => ({ ...valid(), extra: 1 }), 'record.extra'],
    ['non-object config', () => ({ ...valid(), config: 60 }), 'record.config'],
    ['config without tickRateHz', () => ({ ...valid(), config: { seed: 1 } }), 'record.config.tickRateHz'],
    ['config with undefined tickRateHz', () => ({ ...valid(), config: { seed: 1, tickRateHz: undefined } }), 'record.config.tickRateHz'],
    ['extra config field', () => ({ ...valid(), config: { seed: 1, tickRateHz: 60, extra: 0 } }), 'record.config.extra'],
    ['invalid seed', () => ({ ...valid(), config: { seed: -1, tickRateHz: 60 } }), 'record.config.seed'],
    ['invalid tick rate', () => ({ ...valid(), config: { seed: 1, tickRateHz: 0 } }), 'record.config.tickRateHz'],
    ['zero interval', () => ({ ...valid(), checkpointInterval: 0 }), 'record.checkpointInterval'],
    ['fractional interval', () => ({ ...valid(), checkpointInterval: 1.5 }), 'record.checkpointInterval'],
    ['numeric-string interval', () => ({ ...valid(), checkpointInterval: '4' }), 'record.checkpointInterval'],
    ['non-array ticks', () => ({ ...valid(), ticks: { 0: tick(0), length: 1 } }), 'record.ticks'],
    ['sparse ticks', () => withTicks(sparse), 'record.ticks[1]'],
    ['null tick', () => withTicks([tick(0), null]), 'record.ticks[1]'],
    ['extra tick field', () => withTicks([{ ...tick(0), extra: 1 }]), 'record.ticks[0].extra'],
    ['tick without commands', () => withTicks([{ input: { moveX: 0 } }]), 'record.ticks[0].commands'],
    ['out-of-range moveX', () => withTicks([tick(0), tick(0), tick(2)]), 'record.ticks[2].input.moveX'],
    ['unknown command in a late tick', () => withTicks(longTicks), 'record.ticks[12].commands[0].type'],
  ];

  it.each(invalid)('rejects %s with CoreInputError at the right path', (_name, makeRecord, path) => {
    const error = errorFrom(() => replaySyntheticRecord(makeRecord()));
    expect(error).toBeInstanceOf(CoreInputError);
    expect((error as CoreInputError).path).toBe(path);
  });

  it('validates every tick before stepping, so a later malformed tick wins over an earlier guard failure', () => {
    const overflowThenMalformed = {
      ...valid(),
      config: { seed: 0, tickRateHz: 1e-308 },
      ticks: [tick(1), tick(1), { input: { moveX: 0 }, commands: [{ type: 'teleport' }] }],
    };
    const error = errorFrom(() => replaySyntheticRecord(overflowThenMalformed));
    expect((error as CoreInputError).path).toBe('record.ticks[2].commands[0].type');
  });

  it('rejects a tick that a Core numeric guard rejects, at that tick', () => {
    // 1 / 1e-308 is finite, but a second full-speed tick would move the mover past the largest double.
    const overflow = { ...valid(), config: { seed: 0, tickRateHz: 1e-308 }, ticks: [tick(1), tick(1), tick(0)] };
    const error = errorFrom(() => replaySyntheticRecord(overflow));
    expect(error).toBeInstanceOf(CoreInputError);
    expect((error as CoreInputError).path).toBe('record.ticks[1].input.moveX');
    expect((error as CoreInputError).reason).toBe('would move the mover to a non-finite position');
  });
});
