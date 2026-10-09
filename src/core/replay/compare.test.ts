import { describe, expect, it } from 'vitest';
import { deepFrozen } from '../../content/logic/logic-content.test-support.ts';
import { CORE_LIMITS } from '../contracts/limits.ts';
import { CoreInputError } from '../errors.ts';
import { thrownBy } from '../world/world.test-support.ts';
import { compareReplayResults } from './compare.ts';

type Mutable = Record<string, unknown>;
type Result = { events: Mutable[]; checkpoints: { tick: number; hash: string }[]; finalTick: number };

const hashOf = (tick: number, salt = 0): string => (tick * 16 + salt).toString(16).padStart(16, '0');

const commandResult = (tick: number, commandIndex: number, overrides: Mutable = {}): Mutable => ({
  type: 'command-result', tick, commandIndex, commandType: 'launch', outcome: 'rejected', reason: 'not-implemented', ...overrides,
});

const instantiated = (tick: number, entityId: number, overrides: Mutable = {}): Mutable => ({
  type: 'object-instantiated',
  tick,
  entityId,
  kindBit: 7,
  source: { collection: 'mission', index: 3, group: { index: 0, request: 1, member: 2 } },
  position: { x: 1.5, y: -2, z: 0 },
  ...overrides,
});

/** A run of `finalTick` ticks: a command result every tick, an object on every third, checkpoints every `interval`. */
function run(finalTick: number, interval: number): Result {
  const events: Mutable[] = [];
  for (let tick = 1; tick <= finalTick; tick++) {
    events.push(commandResult(tick, 0));
    if (tick % 3 === 0) events.push(instantiated(tick, tick));
  }
  const ticks = [0];
  for (let tick = interval; tick <= finalTick; tick += interval) ticks.push(tick);
  if (ticks.at(-1) !== finalTick) ticks.push(finalTick);
  return { events, checkpoints: ticks.map((tick) => ({ tick, hash: hashOf(tick) })), finalTick };
}

const eventAt = (result: Result, tick: number, type = 'command-result'): Mutable => result.events.find((event) => event.tick === tick && event.type === type)!;
const checkpointAt = (result: Result, tick: number) => result.checkpoints.find((checkpoint) => checkpoint.tick === tick)!;

describe('replay result comparison (P3-02 AC-12, 快照、哈希与 replay)', () => {
  it('matches equal results, treating -0 as 0, and returns frozen data', () => {
    const [expected, actual] = [run(12, 4), run(12, 4)];
    (eventAt(actual, 3, 'object-instantiated').position as Mutable).z = -0;
    const comparison = compareReplayResults(expected, actual);
    expect(comparison).toEqual({ match: true });
    expect(deepFrozen(comparison)).toBe(true);
    expect(compareReplayResults(run(0, 1), run(0, 5))).toEqual({ match: true });
  });

  describe('events', () => {
    it.each([
      ['an extra event', (result: Result) => result.events.splice(3, 0, commandResult(3, 1))],
      ['a missing event', (result: Result) => result.events.splice(result.events.indexOf(eventAt(result, 3, 'object-instantiated')), 1)],
      ['a different field', (result: Result) => { (eventAt(result, 3, 'object-instantiated').source as Mutable).index = 4; }],
      ['a different position', (result: Result) => { (eventAt(result, 3, 'object-instantiated').position as Mutable).x = 1.25; }],
      ['a different outcome', (result: Result) => Object.assign(eventAt(result, 3), { outcome: 'accepted', reason: null })],
      ['another order', (result: Result) => result.events.splice(result.events.indexOf(eventAt(result, 3)), 2, eventAt(result, 3, 'object-instantiated'), eventAt(result, 3))],
    ])('reports %s at its tick', (_, change) => {
      const actual = run(12, 4);
      change(actual);
      expect(compareReplayResults(run(12, 4), actual)).toEqual({ match: false, tick: 3, kind: 'events' });
    });

    it('reports an event moved to a later tick at the earlier one', () => {
      const actual = run(12, 4);
      const moved = eventAt(actual, 6, 'object-instantiated');
      actual.events.splice(actual.events.indexOf(moved), 1);
      actual.events.splice(actual.events.indexOf(eventAt(actual, 7)) + 1, 0, { ...moved, tick: 7 });
      expect(compareReplayResults(run(12, 4), actual)).toEqual({ match: false, tick: 6, kind: 'events' });
    });

    it('wins over a checkpoint difference at the same tick, but not over an earlier one', () => {
      const actual = run(12, 4);
      eventAt(actual, 8).commandType = 'toggle-map';
      checkpointAt(actual, 8).hash = hashOf(8, 1);
      expect(compareReplayResults(run(12, 4), actual)).toEqual({ match: false, tick: 8, kind: 'events' });
      checkpointAt(actual, 4).hash = hashOf(4, 1);
      expect(compareReplayResults(run(12, 4), actual)).toEqual({ match: false, tick: 4, kind: 'checkpoint' });
    });
  });

  describe('checkpoints', () => {
    it('reports a different hash', () => {
      const actual = run(12, 4);
      checkpointAt(actual, 8).hash = hashOf(8, 3);
      expect(compareReplayResults(run(12, 4), actual)).toEqual({ match: false, tick: 8, kind: 'checkpoint' });
    });

    it('reports a checkpoint only one side took, other than the shorter run\'s final one', () => {
      expect(compareReplayResults(run(12, 4), run(12, 2))).toEqual({ match: false, tick: 2, kind: 'checkpoint' });
      expect(compareReplayResults(run(12, 2), run(12, 4))).toEqual({ match: false, tick: 2, kind: 'checkpoint' });
    });
  });

  describe('length', () => {
    it('reports the shorter run\'s first missing tick, not its final checkpoint off the interval nor the longer run\'s events', () => {
      const [shorter, longer] = [run(10, 4), run(15, 4)];
      expect(shorter.checkpoints.map(({ tick }) => tick)).toEqual([0, 4, 8, 10]);
      expect(longer.checkpoints.map(({ tick }) => tick)).toEqual([0, 4, 8, 12, 15]);
      expect(compareReplayResults(shorter, longer)).toEqual({ match: false, tick: 11, kind: 'length' });
      expect(compareReplayResults(longer, shorter)).toEqual({ match: false, tick: 11, kind: 'length' });
      expect(compareReplayResults(run(0, 4), longer)).toEqual({ match: false, tick: 1, kind: 'length' });
    });

    it('still compares the shorter run\'s final checkpoint where the longer run sampled too', () => {
      const [shorter, longer] = [run(8, 4), run(15, 4)];
      checkpointAt(shorter, 8).hash = hashOf(8, 5);
      expect(compareReplayResults(shorter, longer)).toEqual({ match: false, tick: 8, kind: 'checkpoint' });
    });

    it('comes after an earlier difference', () => {
      const shorter = run(10, 4);
      eventAt(shorter, 9).outcome = 'ignored';
      expect(compareReplayResults(shorter, run(15, 4))).toEqual({ match: false, tick: 9, kind: 'events' });
    });
  });

  describe('validation', () => {
    const invalid: [string, (result: Result & Mutable) => void, string][] = [
      ['an extra field', (result) => { result.seed = 1; }, ''],
      ['a missing final tick', (result) => { delete (result as Mutable).finalTick; }, '.finalTick'],
      ['a negative final tick', (result) => { result.finalTick = -1; }, '.finalTick'],
      ['a final tick beyond the recording capacity', (result) => { result.finalTick = CORE_LIMITS.recordedTicks + 1; }, '.finalTick'],
      ['no checkpoints', (result) => { result.checkpoints = []; }, '.checkpoints'],
      ['a first checkpoint after tick 0', (result) => { result.checkpoints.shift(); }, '.checkpoints[0].tick'],
      ['checkpoints out of order', (result) => { result.checkpoints.reverse(); }, '.checkpoints[0].tick'],
      ['a repeated checkpoint', (result) => { result.checkpoints.splice(1, 0, { tick: 0, hash: hashOf(0) }); }, '.checkpoints[1].tick'],
      ['a last checkpoint before the final tick', (result) => { result.checkpoints.pop(); }, '.checkpoints[2].tick'],
      ['an uppercase hash', (result) => { result.checkpoints[1].hash = 'ABCDEF0123456789'; }, '.checkpoints[1].hash'],
      ['a short hash', (result) => { result.checkpoints[1].hash = 'abc'; }, '.checkpoints[1].hash'],
      ['a checkpoint with an extra field', (result) => { Object.assign(result.checkpoints[1], { state: {} }); }, '.checkpoints[1]'],
      ['a hole in the checkpoints', (result) => { delete (result.checkpoints as unknown[])[1]; }, '.checkpoints'],
      ['a hole in the events', (result) => { delete (result.events as unknown[])[1]; }, '.events'],
      ['an event at tick 0', (result) => { result.events[0].tick = 0; }, '.events[0].tick'],
      ['an event after the final tick', (result) => { result.events.push(commandResult(13, 0)); }, '.events[16].tick'],
      ['events out of tick order', (result) => { result.events.reverse(); }, '.events[2].tick'],
      ['an event without a type', (result) => { delete result.events[0].type; }, '.events[0].type'],
      ['an unknown event type', (result) => { result.events[0].type = 'marker-added'; }, '.events[0].type'],
      ['an event with an extra field', (result) => { result.events[0].note = ''; }, '.events[0]'],
      ['an unknown command type', (result) => { result.events[0].commandType = 'eject'; }, '.events[0].commandType'],
      ['an unknown outcome', (result) => { result.events[0].outcome = 'deferred'; }, '.events[0].outcome'],
      ['an accepted command with a reason', (result) => { result.events[0].outcome = 'accepted'; }, '.events[0].reason'],
      ['a rejected command without a reason', (result) => { result.events[0].reason = null; }, '.events[0].reason'],
      ['an unknown reason', (result) => { result.events[0].reason = 'cooldown'; }, '.events[0].reason'],
      ['a command index out of sequence', (result) => { result.events[0].commandIndex = 1; }, '.events[0].commandIndex'],
      ['a command index beyond a tick\'s commands', (result) => { result.events[0].commandIndex = CORE_LIMITS.commandsPerTick; }, '.events[0].commandIndex'],
      ['an entity ID of 0', (result) => { eventAt(result, 3, 'object-instantiated').entityId = 0; }, '.events[3].entityId'],
      ['a kind bit of 32', (result) => { eventAt(result, 3, 'object-instantiated').kindBit = 32; }, '.events[3].kindBit'],
      ['an unknown source collection', (result) => { (eventAt(result, 3, 'object-instantiated').source as Mutable).collection = 'runtime'; }, '.events[3].source.collection'],
      ['a negative group member', (result) => { ((eventAt(result, 3, 'object-instantiated').source as Mutable).group as Mutable).member = -1; }, '.events[3].source.group.member'],
      ['a non-finite position', (result) => { (eventAt(result, 3, 'object-instantiated').position as Mutable).y = Number.NaN; }, '.events[3].position.y'],
      ['a position that is not a number', (result) => { (eventAt(result, 3, 'object-instantiated').position as Mutable).z = '0'; }, '.events[3].position.z'],
      ['more events than a recording holds', (result) => { result.events = new Array(CORE_LIMITS.recordedEvents + 1); }, '.events'],
      ['more checkpoints than a recording holds', (result) => { result.checkpoints = new Array(CORE_LIMITS.recordedCheckpoints + 1); }, '.checkpoints'],
    ];

    it.each(invalid)('rejects %s on either side', (_, change, path) => {
      for (const side of ['expected', 'actual'] as const) {
        const broken = run(12, 4) as Result & Mutable;
        change(broken);
        const error = thrownBy(() => (side === 'expected' ? compareReplayResults(broken, run(12, 4)) : compareReplayResults(run(12, 4), broken)));
        expect(error).toBeInstanceOf(CoreInputError);
        expect(error).toMatchObject({ path: `${side}${path}` });
      }
    });

    it(`accepts ${CORE_LIMITS.eventsPerTick} events in a tick and rejects one more`, () => {
      const tick = (count: number): Result => ({
        events: Array.from({ length: count }, (_, index) => (index < CORE_LIMITS.commandsPerTick ? commandResult(1, index) : instantiated(1, index))),
        checkpoints: [{ tick: 0, hash: hashOf(0) }, { tick: 1, hash: hashOf(1) }],
        finalTick: 1,
      });
      expect(compareReplayResults(tick(CORE_LIMITS.eventsPerTick), tick(CORE_LIMITS.eventsPerTick))).toEqual({ match: true });
      expect(thrownBy(() => compareReplayResults(tick(CORE_LIMITS.eventsPerTick + 1), run(1, 1))))
        .toMatchObject({ path: `expected.events[${CORE_LIMITS.eventsPerTick}]`, reason: `must not be one of more than ${CORE_LIMITS.eventsPerTick} events of a tick` });
    });

    // Each case builds and reads one result of over 260,000 events: about 0.33 s alone at load 5. Subtask 13 measured
    // CPU-bound cases up to 19 times slower at load 90.
    describe('limit-sized results', { timeout: 30_000 }, () => {
      const commands = (ticks: number): Result => ({
        events: Array.from({ length: ticks * CORE_LIMITS.commandsPerTick }, (_, index) => commandResult(Math.floor(index / CORE_LIMITS.commandsPerTick) + 1, index % CORE_LIMITS.commandsPerTick)),
        checkpoints: [{ tick: 0, hash: hashOf(0) }, { tick: ticks, hash: hashOf(ticks) }],
        finalTick: ticks,
      });
      const fullTicks = CORE_LIMITS.recordedCommands / CORE_LIMITS.commandsPerTick;

      it(`accepts ${CORE_LIMITS.recordedCommands} command results`, () => {
        expect(compareReplayResults(commands(fullTicks), commands(1))).toEqual({ match: false, tick: 2, kind: 'length' });
      });

      it('rejects one more command result', () => {
        expect(thrownBy(() => compareReplayResults(run(1, 1), commands(fullTicks + 1))))
          .toMatchObject({ path: `actual.events[${CORE_LIMITS.recordedCommands}]`, reason: `must not be one of more than ${CORE_LIMITS.recordedCommands} command results` });
      });
    });

    it('rejects a result that is not a plain object', () => {
      for (const value of [null, [], 'result', new Map()]) {
        expect(thrownBy(() => compareReplayResults(value, run(1, 1)))).toMatchObject({ path: 'expected' });
        expect(thrownBy(() => compareReplayResults(run(1, 1), value))).toMatchObject({ path: 'actual' });
      }
    });

    it('accepts accepted and ignored results, wingman sources and events without a group', () => {
      const result = run(3, 1);
      Object.assign(result.events[0], { outcome: 'accepted', reason: null });
      Object.assign(result.events[1], { outcome: 'ignored' });
      Object.assign(eventAt(result, 3, 'object-instantiated'), { source: { collection: 'wingman', index: 0, group: null } });
      expect(compareReplayResults(result, structuredClone(result))).toEqual({ match: true });
    });
  });
});
