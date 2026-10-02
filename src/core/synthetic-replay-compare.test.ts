import { describe, expect, it } from 'vitest';
import { CoreInputError } from './errors.ts';
import type { Command, TickInput } from './synthetic-scene.ts';
import {
  compareSyntheticReplayResults,
  createSyntheticRecordingSession,
  replaySyntheticRecord,
  type SyntheticRecording,
  type SyntheticReplayResult,
} from './synthetic-replay.ts';

const add: Command = { type: 'add-marker' };
const remove: Command = { type: 'remove-marker' };

function tick(moveX: number, ...commands: Command[]): TickInput {
  return { input: { moveX }, commands };
}

/** The fixed record of synthetic-replay.test.ts: events at ticks 1, 3, 4, 5, 6 (three), 9 and 10. */
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

function recording(ticks: readonly TickInput[] = fixedTicks, checkpointInterval = 1, seed = 0, tickRateHz = 60): SyntheticRecording {
  const session = createSyntheticRecordingSession({ seed, tickRateHz }, checkpointInterval);
  for (const input of ticks) session.step(input);
  return session.exportRecording();
}

function replayed(ticks: readonly TickInput[], checkpointInterval = 1, seed = 0, tickRateHz = 60): SyntheticReplayResult {
  return replaySyntheticRecord({ ...recording([], checkpointInterval, seed, tickRateHz).record, ticks });
}

function withTick(index: number, input: TickInput): TickInput[] {
  return fixedTicks.map((original, n) => (n === index ? input : original));
}

function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('comparing a recording with its replay (AC-08)', () => {
  it.each([
    [60, 1],
    [60, 4],
    [120, 1],
    [120, 4],
  ])('matches at %i Hz with interval %i, also after a JSON round trip', (tickRateHz, interval) => {
    const { record, result } = recording(fixedTicks, interval, 0, tickRateHz);
    const replay = replaySyntheticRecord(record);
    expect(compareSyntheticReplayResults(result, replay)).toStrictEqual({ match: true });
    expect(compareSyntheticReplayResults(plain(result), plain(replaySyntheticRecord(plain(record))))).toStrictEqual({ match: true });
  });
});

describe('reporting the earliest observable difference (AC-09)', () => {
  // Every case compares separately produced results, never one object with itself.
  const original = recording().result;

  it.each([
    ['a changed moveX, which moves the mover but changes no event', withTick(1, tick(0.25)), 2, 'checkpoint'],
    ['an inserted command', withTick(1, tick(0.5, remove)), 2, 'events'],
    ['a deleted command', withTick(0, tick(1)), 1, 'events'],
    ['swapped commands', withTick(5, tick(1, remove, add, add)), 6, 'events'],
    ['a record truncated before a tick with events', fixedTicks.slice(0, 9), 10, 'events'],
    ['a record truncated before a tick without events', fixedTicks.slice(0, 7), 8, 'checkpoint'],
    ['an extended record', [...fixedTicks, tick(0)], 12, 'checkpoint'],
  ] as const)('reports %s at interval 1', (_name, ticks, reportedTick, kind) => {
    expect(compareSyntheticReplayResults(original, replayed(ticks))).toStrictEqual({ match: false, tick: reportedTick, kind });
  });

  it('reports events when the events and the hash of the same tick both differ', () => {
    const deleted = replayed(withTick(0, tick(1)));
    expect(deleted.checkpoints[1].hash).not.toBe(original.checkpoints[1].hash);
    expect(compareSyntheticReplayResults(original, deleted)).toStrictEqual({ match: false, tick: 1, kind: 'events' });
  });

  it('reports a tampered event field and a tampered hash in the expected result', () => {
    const tamperedEvent = plain(original) as unknown as { events: { position?: { x: number } }[] };
    tamperedEvent.events[0].position!.x = 4.5;
    expect(compareSyntheticReplayResults(tamperedEvent, replayed(fixedTicks))).toStrictEqual({ match: false, tick: 1, kind: 'events' });

    const tamperedHash = plain(original) as unknown as { checkpoints: { hash: string }[] };
    tamperedHash.checkpoints[3].hash = tamperedHash.checkpoints[3].hash === '0123456789abcdef' ? 'fedcba9876543210' : '0123456789abcdef';
    expect(compareSyntheticReplayResults(tamperedHash, replayed(fixedTicks))).toStrictEqual({ match: false, tick: 3, kind: 'checkpoint' });
  });

  it.each([
    ['seed', 1, 60],
    ['tickRateHz', 0, 120],
  ])('reports a different %s at the tick 0 checkpoint', (_name, seed, tickRateHz) => {
    expect(compareSyntheticReplayResults(original, replayed(fixedTicks, 1, seed, tickRateHz))).toStrictEqual({
      match: false,
      tick: 0,
      kind: 'checkpoint',
    });
  });

  it('reports a lasting state deviation at the next checkpoint with interval 4', () => {
    const expected = recording(fixedTicks, 4).result;
    expect(compareSyntheticReplayResults(expected, replayed(withTick(1, tick(0.25)), 4))).toStrictEqual({
      match: false,
      tick: 4,
      kind: 'checkpoint',
    });
  });

  it('reports an event difference at a tick without a checkpoint with interval 4', () => {
    const expected = recording(fixedTicks, 4).result;
    expect(compareSyntheticReplayResults(expected, replayed(withTick(2, tick(-1)), 4))).toStrictEqual({ match: false, tick: 3, kind: 'events' });
  });

  it('compares by value, whatever the key order of the results', () => {
    function reversed(value: unknown): unknown {
      if (Array.isArray(value)) return value.map(reversed);
      if (typeof value !== 'object' || value === null) return value;
      return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reversed(item)]));
    }
    const reordered = reversed(replayed(fixedTicks));
    expect(Object.keys(reordered as object)).toEqual(['checkpoints', 'events']);
    expect(compareSyntheticReplayResults(original, reordered)).toStrictEqual({ match: true });
  });

  it('uses the checkpoint hash it validated when a getter changes between reads', () => {
    const copy = plain(original) as unknown as { checkpoints: { tick: number; hash: string }[] };
    const { tick: checkpointTick, hash } = copy.checkpoints[2];
    let reads = 0;
    copy.checkpoints[2] = {
      tick: checkpointTick,
      get hash() {
        reads++;
        return reads === 1 ? hash : '0123456789abcdef';
      },
    };
    expect(compareSyntheticReplayResults(original, copy)).toStrictEqual({ match: true });
    expect(reads).toBe(1);
  });

  // Detection boundary (technical decision 9): with interval 2, a deviation at tick 1 that is gone by
  // tick 2 is not observable. This is the sampling granularity of periodic hashes, not a hash collision.
  it('matches [0,0] and [1,-1] with interval 2 although tick 1 differs', () => {
    const still = [tick(0), tick(0)];
    const backAndForth = [tick(1), tick(-1)];
    expect(compareSyntheticReplayResults(replayed(still, 2), replayed(backAndForth, 2))).toStrictEqual({ match: true });
    expect(compareSyntheticReplayResults(replayed(still, 1), replayed(backAndForth, 1))).toStrictEqual({
      match: false,
      tick: 1,
      kind: 'checkpoint',
    });
  });

  it('matches records that differ only in moveX -0 versus 0', () => {
    expect(compareSyntheticReplayResults(replayed([tick(0, add), tick(0)]), replayed([tick(-0, add), tick(-0)]))).toStrictEqual({ match: true });
  });
});

describe('rejecting invalid results (AC-10)', () => {
  type Mutable = { events: Record<string, unknown>[]; checkpoints: Record<string, unknown>[]; [key: string]: unknown };
  // Events: [0] added t1, [1] rejected add-marker t3, [2] removed t4, [3] rejected remove-marker t5, ...
  const valid = (): Mutable => plain(recording().result) as unknown as Mutable;
  const change = (mutate: (result: Mutable) => unknown) => () => {
    const result = valid();
    return mutate(result) ?? result;
  };

  const invalid: [string, () => unknown, string][] = [
    ['a non-object result', () => [], ''],
    ['an extra top-level field', change((result) => ({ ...result, final: 11 })), '.final'],
    ['missing events', change(({ checkpoints }) => ({ checkpoints })), '.events'],
    ['non-array checkpoints', change((result) => ({ ...result, checkpoints: {} })), '.checkpoints'],
    ['sparse events', change((result) => void delete result.events[1]), '.events[1]'],
    ['sparse checkpoints', change((result) => void delete result.checkpoints[1]), '.checkpoints[1]'],
    ['no checkpoints', change((result) => ({ ...result, events: [], checkpoints: [] })), '.checkpoints'],
    ['a first checkpoint other than 0', change((result) => void (result.checkpoints[0].tick = 1)), '.checkpoints[0].tick'],
    ['a non-increasing checkpoint', change((result) => void (result.checkpoints[2].tick = 1)), '.checkpoints[2].tick'],
    ['a fractional checkpoint tick', change((result) => void (result.checkpoints[2].tick = 1.5)), '.checkpoints[2].tick'],
    ['an extra checkpoint field', change((result) => void (result.checkpoints[0].extra = 0)), '.checkpoints[0].extra'],
    ['an upper-case hash', change((result) => void (result.checkpoints[0].hash = 'ABCDEF0123456789')), '.checkpoints[0].hash'],
    ['a short hash', change((result) => void (result.checkpoints[0].hash = '0123456789abcde')), '.checkpoints[0].hash'],
    ['a numeric hash', change((result) => void (result.checkpoints[0].hash = 1)), '.checkpoints[0].hash'],
    ['an unknown event type', change((result) => void (result.events[0].type = 'marker-moved')), '.events[0].type'],
    ['a non-object event', change((result) => void (result.events[0] = null as unknown as Record<string, unknown>)), '.events[0]'],
    ['a missing event field', change((result) => void delete result.events[0].entityId), '.events[0].entityId'],
    ['an extra event field', change((result) => void (result.events[1].extra = 0)), '.events[1].extra'],
    ['an entity ID of 1', change((result) => void (result.events[0].entityId = 1)), '.events[0].entityId'],
    ['a position at the exclusive maximum', change((result) => void (result.events[2].position = { x: 0, y: 5, z: 0 })), '.events[2].position.y'],
    ['an extra position field', change((result) => void (result.events[2].position = { x: 0, y: 0, z: 0, w: 0 })), '.events[2].position.w'],
    ['a negative command index', change((result) => void (result.events[0].commandIndex = -1)), '.events[0].commandIndex'],
    ['an unknown command type', change((result) => void (result.events[1].commandType = 'teleport')), '.events[1].commandType'],
    ['a mismatched rejection reason', change((result) => void (result.events[1].reason = 'marker-not-found')), '.events[1].reason'],
    ['an event at tick 0', change((result) => void (result.events[0].tick = 0)), '.events[0].tick'],
    ['an event after the final tick', change((result) => void (result.events[8].tick = 12)), '.events[8].tick'],
    ['events out of order', change((result) => void ([result.events[0], result.events[1]] = [result.events[1], result.events[0]])), '.events[1].tick'],
    ['a command index gap', change((result) => void (result.events[6].commandIndex = 3)), '.events[6].commandIndex'],
    ['a command index not starting at 0', change((result) => void (result.events[0].commandIndex = 1)), '.events[0].commandIndex'],
  ];

  describe.each(['expected', 'actual'] as const)('as %s', (side) => {
    it.each(invalid)('rejects %s with CoreInputError at the right path', (_name, makeResult, path) => {
      const other = recording().result;
      let error: unknown;
      try {
        if (side === 'expected') compareSyntheticReplayResults(makeResult(), other);
        else compareSyntheticReplayResults(other, makeResult());
      } catch (thrown) {
        error = thrown;
      }
      expect(error).toBeInstanceOf(CoreInputError);
      expect((error as CoreInputError).path).toBe(`${side}${path}`);
    });
  });

  it('validates both results before comparing them', () => {
    const differentButInvalid = plain(replayed(fixedTicks, 1, 1)) as unknown as Mutable;
    differentButInvalid.checkpoints[0].hash = 'not a hash';
    expect(() => compareSyntheticReplayResults(recording().result, differentButInvalid)).toThrow(
      expect.objectContaining({ path: 'actual.checkpoints[0].hash' }),
    );
  });

  it('accepts a structurally valid result that no replay could produce', () => {
    const empty = { events: [], checkpoints: [{ tick: 0, hash: '0000000000000000' }, { tick: 7, hash: 'ffffffffffffffff' }] };
    expect(compareSyntheticReplayResults(empty, plain(empty))).toStrictEqual({ match: true });
  });
});
