import { describe, expect, it } from 'vitest';
import { deepFrozen } from '../../content/logic/logic-content.test-support.ts';
import { syntheticIdentity } from '../../content/synthetic-content.test-support.ts';
import { CORE_LIMITS } from '../contracts/limits.ts';
import type { Command, TickInput } from '../contracts/tick-input.ts';
import { CoreFaultError, CoreInputError } from '../errors.ts';
import { createWorld, initialWorldState } from '../world/create-world.ts';
import { asCreateInput, playerOnlyMission, SYNTHETIC_RUN, worldInput } from '../world/create-world.test-support.ts';
import { entityInit, expectFault, testState, thrownBy, tickInput } from '../world/world.test-support.ts';
import {
  createRecordingSession,
  GAME_REPLAY_FORMAT,
  GAME_REPLAY_VERSION,
  PRODUCER_MAX_LENGTH,
  recordState,
  requireRecordingCapacity,
  type RecordingSession,
} from './recording.ts';
import { longInput, PRODUCER, scriptedInput } from './replay.test-support.ts';
import { RULES_VERSION } from './rules-version.ts';
import { snapshotHash } from './snapshot.ts';

const options = (checkpointInterval: number) => ({ producer: PRODUCER, checkpointInterval });

/** A recording of the synthetic player-only world, whose queue has drained, so a step emits only command results. */
const idleSession = (checkpointInterval = 1): RecordingSession => recordState(testState(), options(checkpointInterval));

const stepTimes = (session: RecordingSession, ticks: number, input: TickInput = tickInput()): void => {
  for (let tick = 0; tick < ticks; tick++) session.step(input);
};

const checkpointTicks = (session: RecordingSession): number[] => session.exportRecording().result.checkpoints.map(({ tick }) => tick);

describe('recording session (P3-02 AC-12, 快照、哈希与 replay)', () => {
  it('behaves like the world it records', () => {
    const input = longInput();
    const world = createWorld(input);
    const session = createRecordingSession(input, options(10));
    for (let tick = 1; tick <= 305; tick++) {
      const events = session.step(scriptedInput(tick));
      expect(events).toEqual(world.step(scriptedInput(tick)));
    }
    expect(session.projection()).toEqual(world.projection());
    expect(session.renderState()).toEqual(world.renderState());
    expect(session.snapshot()).toEqual(world.snapshot());
    expect(session.snapshot().state.spawn.queue).toEqual([]);
  });

  it('exports the record and the result, deeply frozen, with the effective configuration and the inputs as run', () => {
    const input = asCreateInput(worldInput({ run: { wingman: 1 } }));
    const session = createRecordingSession(input, options(2));
    const caller = { commands: [{ value: 3, type: 'select-number' }], axes: { roll: 0, yaw: -0.25, pitch: -0 } } as unknown as TickInput;
    const events = [session.step(caller), session.step(tickInput()), session.step(tickInput([{ type: 'launch' }]))];
    const { record, result } = session.exportRecording();

    expect(Object.keys(record)).toEqual(['format', 'version', 'rulesVersion', 'producer', 'content', 'mission', 'setupHash', 'run', 'checkpointInterval', 'ticks']);
    expect(record).toMatchObject({ format: GAME_REPLAY_FORMAT, version: GAME_REPLAY_VERSION, rulesVersion: RULES_VERSION, producer: PRODUCER, checkpointInterval: 2 });
    expect([GAME_REPLAY_FORMAT, GAME_REPLAY_VERSION]).toEqual(['osr-game-replay', 1]);
    expect(record.content).toEqual(syntheticIdentity());
    expect(record.mission).toBe('mission/first-campaign');
    expect(record.setupHash).toBe(session.snapshot().state.config.setupHash);
    expect(record.run).toEqual({ rawDifficulty: SYNTHETIC_RUN.rawDifficulty, wingman: 1, seed: SYNTHETIC_RUN.seed, clockUnitsPerTick: 2 });
    // The canonical copy of what ran: fields in contract order, -0 as 0.
    expect(record.ticks).toHaveLength(3);
    expect(JSON.stringify(record.ticks[0])).toBe('{"axes":{"pitch":0,"yaw":-0.25,"roll":0},"commands":[{"type":"select-number","value":3}]}');
    expect(Object.is(record.ticks[0].axes.pitch, 0)).toBe(true);
    expect(record.ticks.slice(1)).toEqual([tickInput(), tickInput([{ type: 'launch' }])]);

    expect(result.events).toEqual(events.flat());
    expect(result.events.filter(({ type }) => type === 'object-instantiated').every(({ tick }) => tick === 1)).toBe(true);
    expect(result.checkpoints.map(({ tick }) => tick)).toEqual([0, 2, 3]);
    expect(result.finalTick).toBe(3);
    expect(deepFrozen(record)).toBe(true);
    expect(deepFrozen(result)).toBe(true);
  });

  it('records a checkpoint at tick 0, every multiple of the interval and the last tick, once each, with the state hash', () => {
    const input = longInput();
    const world = createWorld(input);
    const session = createRecordingSession(input, options(3));
    const hashes = [snapshotHash(world.snapshot())];
    const step = () => {
      const tick = hashes.length;
      session.step(scriptedInput(tick));
      world.step(scriptedInput(tick));
      hashes.push(snapshotHash(world.snapshot()));
    };
    expect(session.exportRecording().result.checkpoints).toEqual([{ tick: 0, hash: hashes[0] }]);
    for (let tick = 1; tick <= 6; tick++) step();
    expect(checkpointTicks(session)).toEqual([0, 3, 6]);
    step();
    const seven = session.exportRecording();
    expect(seven.result.checkpoints).toEqual([0, 3, 6, 7].map((tick) => ({ tick, hash: hashes[tick] })));
    const text = JSON.stringify(seven);
    step();
    step();
    expect(session.exportRecording().result.checkpoints).toEqual([0, 3, 6, 9].map((tick) => ({ tick, hash: hashes[tick] })));
    // An earlier export keeps its own final checkpoint.
    expect(JSON.stringify(seven)).toBe(text);
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it('exports a run of no ticks with its tick 0 checkpoint', () => {
    const session = createRecordingSession(longInput(), options(5));
    const { record, result } = session.exportRecording();
    expect(record.ticks).toEqual([]);
    expect(result).toEqual({ events: [], checkpoints: [{ tick: 0, hash: snapshotHash(session.snapshot()) }], finalTick: 0 });
  });

  it.each([1, 4, 1000])('takes the checkpoints of interval %i', (interval) => {
    const session = idleSession(interval);
    stepTimes(session, 10);
    const expected = [0, ...Array.from({ length: 10 }, (_, index) => index + 1).filter((tick) => tick % interval === 0)];
    if (expected.at(-1) !== 10) expected.push(10);
    expect(checkpointTicks(session)).toEqual(expected);
  });

  it.each([
    ['a missing field', { commands: [] }],
    ['an unknown command', tickInput([{ type: 'self-destruct' } as unknown as Command])],
    ['too many commands', tickInput(Array.from({ length: CORE_LIMITS.commandsPerTick + 1 }, (): Command => ({ type: 'launch' })))],
  ])('rejects %s without changing the world or the recording', (_, input) => {
    const session = createRecordingSession(longInput(), options(2));
    session.step(tickInput());
    const [before, snapshot] = [session.exportRecording(), session.snapshot()];
    expect(thrownBy(() => session.step(input as TickInput))).toBeInstanceOf(CoreInputError);
    expect(session.exportRecording()).toEqual(before);
    expect(session.snapshot()).toEqual(snapshot);
    session.step(tickInput());
    expect(session.exportRecording().result.finalTick).toBe(2);
  });

  it.each([
    ['an empty producer', { producer: '', checkpointInterval: 1 }, 'options.producer'],
    ['a producer one character too long', { producer: 'v'.repeat(PRODUCER_MAX_LENGTH + 1), checkpointInterval: 1 }, 'options.producer'],
    ['a producer that is not a string', { producer: 1, checkpointInterval: 1 }, 'options.producer'],
    ['an interval of 0', { producer: PRODUCER, checkpointInterval: 0 }, 'options.checkpointInterval'],
    ['a fractional interval', { producer: PRODUCER, checkpointInterval: 1.5 }, 'options.checkpointInterval'],
    ['an unsafe interval', { producer: PRODUCER, checkpointInterval: 2 ** 53 }, 'options.checkpointInterval'],
    ['an interval that is not a number', { producer: PRODUCER, checkpointInterval: '1' }, 'options.checkpointInterval'],
    ['a missing interval', { producer: PRODUCER }, 'options.checkpointInterval'],
    ['an extra option', { producer: PRODUCER, checkpointInterval: 1, seed: 1 }, 'options'],
  ])('rejects %s', (_, invalid, path) => {
    const error = thrownBy(() => createRecordingSession(longInput(), invalid as never));
    expect(error).toBeInstanceOf(CoreInputError);
    expect(error).toMatchObject({ path });
  });

  it(`accepts any producer of 1 to ${PRODUCER_MAX_LENGTH} characters and passes world creation errors on`, () => {
    for (const producer of ['v', 'versi\u00f3n 1', '\u{1f680}'.repeat(PRODUCER_MAX_LENGTH / 2)]) {
      expect(createRecordingSession(longInput(), { producer, checkpointInterval: 1 }).exportRecording().record.producer).toBe(producer);
    }
    expect(thrownBy(() => createRecordingSession(longInput({ run: { seed: -1 } }), options(1)))).toMatchObject({ path: 'input.run.seed' });
  });

  describe('capacity (上限)', () => {
    it('refuses a tick that could pass any recording capacity, at the exact bounds', () => {
      const { recordedTicks, recordedCommands, recordedEvents, eventsPerTick, commandsPerTick } = CORE_LIMITS;
      const fits = (counts: { ticks: number; commands: number; events: number }, commands: number) => thrownBy(() => requireRecordingCapacity(counts, commands));
      expect(fits({ ticks: recordedTicks - 1, commands: 0, events: 0 }, 0)).toBeUndefined();
      expect(fits({ ticks: recordedTicks, commands: 0, events: 0 }, 0)).toMatchObject({ path: 'recording', reason: `would exceed ${recordedTicks} recorded ticks` });
      expect(fits({ ticks: 0, commands: recordedCommands - commandsPerTick, events: 0 }, commandsPerTick)).toBeUndefined();
      expect(fits({ ticks: 0, commands: recordedCommands - commandsPerTick + 1, events: 0 }, commandsPerTick))
        .toMatchObject({ path: 'recording', reason: `would exceed ${recordedCommands} recorded commands` });
      // A tick's events are unknown before it runs: it must fit at the per-tick bound.
      expect(fits({ ticks: 0, commands: 0, events: recordedEvents - eventsPerTick }, 0)).toBeUndefined();
      expect(fits({ ticks: 0, commands: 0, events: recordedEvents - eventsPerTick + 1 }, 0))
        .toMatchObject({ path: 'recording', reason: `could exceed ${recordedEvents} recorded events` });
      expect(fits({ ticks: 0, commands: 0, events: 0 }, 0)).toBeUndefined();
      // Interval 1 takes the most checkpoints, tick 0 and one per tick, so the tick capacity bounds them.
      expect(CORE_LIMITS.recordedCheckpoints).toBeGreaterThanOrEqual(1 + recordedTicks);
    });

    // The session itself at the tick and command capacity (an event capacity run would hold over 520,000 events,
    // about 250 MB, so the bound above covers it). Each case takes 0.3–0.4 s alone at load 4–5; subtask 13 measured
    // CPU-bound cases up to 19 times slower at load 90.
    describe('limit-sized recordings', { timeout: 30_000 }, () => {
      it(`records ${CORE_LIMITS.recordedTicks} ticks and refuses the next one, changing nothing`, () => {
        const session = idleSession(CORE_LIMITS.recordedTicks);
        stepTimes(session, CORE_LIMITS.recordedTicks);
        const snapshot = session.snapshot();
        expect(snapshot.state.tick).toBe(CORE_LIMITS.recordedTicks);
        const error = thrownBy(() => session.step(tickInput()));
        expect(error).toBeInstanceOf(CoreInputError);
        expect(error).toMatchObject({ path: 'recording', reason: `would exceed ${CORE_LIMITS.recordedTicks} recorded ticks` });
        expect(session.snapshot()).toEqual(snapshot);
        const { record, result } = session.exportRecording();
        expect([record.ticks.length, result.finalTick, result.checkpoints.length]).toEqual([CORE_LIMITS.recordedTicks, CORE_LIMITS.recordedTicks, 2]);
      });

      it(`records ${CORE_LIMITS.recordedCommands} commands and refuses a tick with one more, changing nothing`, () => {
        const full = tickInput(Array.from({ length: CORE_LIMITS.commandsPerTick }, (): Command => ({ type: 'launch' })));
        const ticks = CORE_LIMITS.recordedCommands / CORE_LIMITS.commandsPerTick;
        const session = idleSession(1000);
        stepTimes(session, ticks, full);
        const snapshot = session.snapshot();
        const error = thrownBy(() => session.step(tickInput([{ type: 'launch' }])));
        expect(error).toMatchObject({ path: 'recording', reason: `would exceed ${CORE_LIMITS.recordedCommands} recorded commands` });
        expect(session.snapshot()).toEqual(snapshot);
        expect(session.exportRecording().result.events).toHaveLength(CORE_LIMITS.recordedCommands);
        session.step(tickInput());
        expect(session.exportRecording().record.ticks).toHaveLength(ticks + 1);
      });
    });
  });

  describe('Core faults', () => {
    it('fail every later call, export included, after a fault in a step', () => {
      const state = testState();
      state.entities.allocate(entityInit(9)).state = 'new';
      const session = recordState(state, options(1));
      const fault = expectFault(() => session.step(tickInput([{ type: 'launch' }])), 'invariant-violated', 'object-update.new');
      for (const call of [() => session.exportRecording(), () => session.step(tickInput()), () => session.projection(), () => session.renderState(), () => session.snapshot()]) {
        expect(thrownBy(call)).toBe(fault);
      }
    });

    it('fail the export after a fault in a read, even when the last tick has its checkpoint', () => {
      const state = testState();
      const session = recordState(state, options(1));
      stepTimes(session, 2);
      Object.defineProperty(state, 'missionStatus', { get: () => { throw new RangeError('broken state'); } });
      const fault = expectFault(() => session.projection(), 'invariant-violated', 'world.projection');
      expect(thrownBy(() => session.exportRecording())).toBe(fault);
    });

    it('turn a state that cannot be written at a checkpoint into a latched fault', () => {
      const state = testState();
      // Parked, so that movement does not fault on the position first.
      const entity = state.entities.allocate(entityInit(9, { activity: 'parked' }));
      const session = recordState(state, options(2));
      session.step(tickInput());
      entity.position = { x: Number.NaN, y: 0, z: 0 };
      const fault = expectFault(() => session.step(tickInput()), 'invariant-violated', 'recording.checkpoint');
      expect(fault.cause).toBeInstanceOf(CoreInputError);
      expect(thrownBy(() => session.exportRecording())).toBe(fault);
      expect(thrownBy(() => session.step(tickInput()))).toBe(fault);
    });

    it('are never CoreInputErrors', () => {
      const state = testState();
      state.entities.allocate(entityInit(1)).state = 'new';
      const error = thrownBy(() => recordState(state, options(1)).step(tickInput()));
      expect(error).toBeInstanceOf(CoreFaultError);
      expect(error).not.toBeInstanceOf(CoreInputError);
    });
  });

  it('creates the same world as createWorld from the same input', () => {
    const input = asCreateInput(worldInput({ mission: playerOnlyMission() }));
    expect(createRecordingSession(input, options(1)).snapshot()).toEqual(createWorld(input).snapshot());
    expect(recordState(initialWorldState(input), options(1)).snapshot()).toEqual(createWorld(input).snapshot());
  });
});
