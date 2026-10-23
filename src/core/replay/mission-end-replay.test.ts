import { describe, expect, it } from 'vitest';
import { deepFrozen } from '../../content/logic/logic-content.test-support.ts';
import { syntheticIdentity } from '../../content/synthetic-content.test-support.ts';
import type { DomainEvent } from '../contracts/domain-events.ts';
import type { TickInput } from '../contracts/tick-input.ts';
import { CoreInputError } from '../errors.ts';
import type { MissionPhase, Projection } from '../projections/projection.ts';
import { initialWorldState, type CreateWorldInput } from '../world/create-world.ts';
import { expectFault, thrownBy, tickInput } from '../world/world.test-support.ts';
import type { MissionResult, PlayerLoss } from '../world/world-state.ts';
import { compareReplayResults } from './compare.ts';
import { recordToCompletion, stepToCompletion, successInput, successScript, thirdLossInput, thirdLossScript } from './mission-end.test-support.ts';
import { completedRun, GAME_REPLAY_VERSION, recordState, type Recording, type RecordingSession } from './recording.ts';
import { replayRecord } from './replay.ts';
import { contentOf, PRODUCER, roundTrip } from './replay.test-support.ts';
import { RULES_VERSION } from './rules-version.ts';

// docs/plan/p3/02/spec.md, ME-11 to ME-14 and ME-16; docs/plan/p3/11/spec.md, 结果读模型、事件与门禁 and 运行中与终局衔接
// (S-08, AC-09, AC-10). Two synthetic runs reach the end of the mission from their inputs alone
// (mission-end.test-support.ts): a success through the all-clear, and a failure through two energy rescues and the third
// loss. Their recordings hold the latch and every teardown tick and end at the completion; JSON copies of their records
// replay to the same events and checkpoint hashes, whatever the checkpoint interval and however a host groups the ticks
// into frames and reads between them; a tick after the completion is rejected, never dropped.

type Script = (tick: number) => TickInput;

interface Ending {
  readonly name: string;
  readonly input: () => CreateWorldInput;
  readonly script: Script;
  /** The phases the run passes through in order, each once per stretch (ME-14). */
  readonly phases: readonly MissionPhase[];
  /** The latched result but its tick. */
  readonly result: Omit<MissionResult, 'latchTick'>;
  readonly rescues: readonly (readonly [PlayerLoss, number])[];
  /** The commands its script gives in the latch's tick. */
  readonly latchCommands: number;
}

const ENDINGS: readonly Ending[] = [
  {
    name: 'success',
    input: successInput,
    script: successScript,
    phases: ['normal', 'settlement-wait', 'result-delay', 'teardown', 'completed'],
    result: {
      outcome: 'success', reason: { type: 'all-clear' }, summary: null, rescuesUsed: 0, endingGaps: [{ gap: 'G-02/8', variant: 'solo' }], playerKills: 0,
    },
    rescues: [],
    latchCommands: 1,
  },
  {
    name: 'failure after two rescues',
    input: thirdLossInput,
    script: thirdLossScript,
    phases: ['normal', 'beacon-wait', 'normal', 'beacon-wait', 'normal', 'beacon-wait', 'teardown', 'completed'],
    result: {
      outcome: 'failure', reason: { type: 'third-loss', loss: 'energy' }, summary: null, rescuesUsed: 2,
      endingGaps: [{ gap: 'G-02/7', variant: 'energy' }], playerKills: 0,
    },
    rescues: [['energy', 1], ['energy', 2]],
    latchCommands: 0,
  },
];

const options = (checkpointInterval: number) => ({ producer: PRODUCER, checkpointInterval });
const ofType = <Type extends DomainEvent['type']>(events: readonly DomainEvent[], type: Type) =>
  events.filter((event): event is Extract<DomainEvent, { type: Type }> => event.type === type);

/** A recording session of `ending`'s world, with the world's state for tests that change it. */
function session(ending: Ending, checkpointInterval = 50) {
  const state = initialWorldState(ending.input());
  return { state, session: recordState(state, options(checkpointInterval)) };
}

/** A JSON copy of a record, changed by `change`. */
function recordWith(recording: Recording, change: (record: Record<string, unknown> & { ticks: unknown[] }) => void): unknown {
  const record = roundTrip(recording.record) as Record<string, unknown> & { ticks: unknown[] };
  change(record);
  return record;
}

function expectRejected(work: () => unknown, path: string, reason?: string): void {
  const error = thrownBy(work);
  expect(error).toBeInstanceOf(CoreInputError);
  expect(error).toMatchObject(reason === undefined ? { path } : { path, reason });
}

describe.each(ENDINGS)('a run that ends in $name', (ending) => {
  const recording = recordToCompletion(ending.input(), ending.script, 50);
  const { events, finalTick } = recording.result;
  const [latched] = ofType(events, 'result-latched');

  it('records the latch and every teardown tick and ends at the completion, its last event (ME-11, ME-13)', () => {
    expect(ofType(events, 'result-latched')).toHaveLength(1);
    expect(ofType(events, 'teardown-started')).toEqual([expect.objectContaining({ tick: latched.tick })]);
    expect(events.at(-1)).toEqual({ type: 'mission-completed', tick: latched.tick + 1, outcome: latched.result.outcome });
    expect([finalTick, recording.record.ticks.length]).toEqual([latched.tick + 1, latched.tick + 1]);
    expect(completedRun(recording.result)).toBe(true);
    // The latch's tick answers its commands `ignored`/`mission-ended` (ME-12).
    const latchResults = ofType(events, 'command-result').filter(({ tick }) => tick >= latched.tick);
    expect(latchResults).toHaveLength(ending.latchCommands);
    for (const result of latchResults) expect(result).toMatchObject({ outcome: 'ignored', reason: 'mission-ended' });
  });

  it('latches the frozen result the rules give', () => {
    expect(ofType(events, 'player-rescued').map(({ loss, rescues }) => [loss, rescues])).toEqual(ending.rescues);
    expect(latched.result).toEqual({ ...ending.result, latchTick: latched.tick });
  });

  it('replays a JSON copy of its record to the same events and checkpoint hashes (AC-10)', () => {
    const replayed = replayRecord(roundTrip(recording.record), contentOf(ending.input()));
    expect(compareReplayResults(roundTrip(recording.result), replayed)).toEqual({ match: true });
    expect(replayed).toEqual(recording.result);
    expect(completedRun(replayed)).toBe(true);
  });

  it('takes the final checkpoint once, on the interval or off it, with the same hashes at the same ticks', () => {
    const byTick = new Map<number, string>();
    for (const interval of [1, finalTick, finalTick - 1, 50]) {
      const { checkpoints } = recordToCompletion(ending.input(), ending.script, interval).result;
      const ticks = checkpoints.map(({ tick }) => tick);
      expect(ticks.filter((tick) => tick === finalTick), `interval ${interval}`).toHaveLength(1);
      expect(ticks.at(-1)).toBe(finalTick);
      expect(ticks).toEqual([...new Set(ticks)].sort((a, b) => a - b));
      for (const { tick, hash } of checkpoints) {
        expect(byTick.get(tick) ?? hash, `tick ${tick}`).toBe(hash);
        byTick.set(tick, hash);
      }
    }
    expect(byTick.size).toBe(finalTick + 1);
  });

  it('gives the same recording however the ticks are grouped into frames and read between them', () => {
    // Frames of 1, 2, 3, … ticks, each followed by every read a host makes; reads never draw or change state.
    let frame = 1;
    let frameEnd = 1;
    const read = (target: RecordingSession) => (tick: number) => {
      if (tick !== frameEnd) return;
      frame++;
      frameEnd += frame;
      expect(deepFrozen(target.projection())).toBe(true);
      target.renderState();
      target.snapshot();
    };
    const grouped = session(ending).session;
    stepToCompletion(grouped, ending.script, read(grouped));
    expect(roundTrip(grouped.exportRecording())).toEqual(roundTrip(recording));
    expect(frame).toBeGreaterThan(10);
  });

  it('gives the mission phase and the result as state, so a consumer attached late reads them without the events (AC-09)', () => {
    const { session: target } = session(ending);
    const projections: Projection[] = [target.projection()];
    stepToCompletion(target, ending.script, () => projections.push(target.projection()));
    expect(target.exportRecording()).toEqual(recording);
    // The phase changes only between its stretches, in order.
    const stretches = projections.map(({ mission }) => mission.phase).filter((phase, tick, all) => tick === 0 || all[tick - 1] !== phase);
    expect(stretches).toEqual(ending.phases);
    // Every tick before the completion reads in progress, the latch's and the teardown's included; the beacon waits
    // start with each energy loss and end with each rescue or the latch.
    for (const projection of projections.slice(0, -1)) expect(projection.result).toEqual({ readiness: 'ready', outcome: 'in-progress' });
    for (const { tick, loss } of ofType(events, 'player-loss-started')) {
      expect([loss, projections[tick].mission.phase, projections[tick - 1].mission.phase]).toEqual(['energy', 'beacon-wait', 'normal']);
    }
    expect(projections[latched.tick].mission.phase).toBe('teardown');
    // The final projection: the frozen result, though the player's entity is gone.
    const final = projections[finalTick];
    expect(final.mission).toMatchObject({ status: 'ended', phase: 'completed' });
    expect(final.player.entityId).toBeNull();
    expect(final.result).toEqual({ readiness: 'ready', ...latched.result, completedTick: finalTick });
    expect(deepFrozen(final)).toBe(true);
    // Reads after the completion give the same, and change nothing.
    const snapshot = target.snapshot();
    expect(target.projection()).toEqual(final);
    expect(target.snapshot()).toEqual(snapshot);
  });

  describe('after the completion', () => {
    it('refuses another step before reading its input or checking capacity, without latching (ME-12)', () => {
      const { session: target } = session(ending);
      stepToCompletion(target, ending.script);
      const exported = target.exportRecording();
      const snapshot = target.snapshot();
      for (const input of [tickInput(), null, { axes: { pitch: 9 } }]) expectRejected(() => target.step(input as TickInput), 'step', 'mission-completed');
      // The world, the recording and every read are as they were: a healthy ending exports.
      expect(target.snapshot()).toEqual(snapshot);
      expect(target.exportRecording()).toEqual(exported);
      expect(target.projection().result).toMatchObject({ outcome: latched.result.outcome, completedTick: finalTick });
      target.renderState();
    });

    it('refuses a step of a session recording an already completed world', () => {
      const { state, session: target } = session(ending);
      stepToCompletion(target, ending.script);
      expectRejected(() => recordState(state, options(1)).step(tickInput()), 'step', 'mission-completed');
    });

    it('rejects a record with a tick after the completion at that tick, never dropping it', () => {
      const content = contentOf(ending.input());
      for (const extra of [1, 3]) {
        const record = recordWith(recording, (value) => { value.ticks.push(...Array.from({ length: extra }, () => tickInput())); });
        expectRejected(() => replayRecord(record, content), `record.ticks[${finalTick}]`, 'after-completion');
      }
    });

    it('replays a prefix that stops before the completion as the incomplete run it is', () => {
      const prefix = recordWith(recording, (value) => { value.ticks.pop(); });
      const replayed = replayRecord(prefix, contentOf(ending.input()));
      expect(replayed.finalTick).toBe(finalTick - 1);
      expect(completedRun(replayed)).toBe(false);
      expect(compareReplayResults(recording.result, replayed)).toEqual({ match: false, tick: finalTick, kind: 'length' });
    });
  });

  it.each([
    ['another replay format version', (record: Record<string, unknown>) => { record.version = GAME_REPLAY_VERSION + 1; }, 'record.version'],
    ['the rules version before P3-11', (record: Record<string, unknown>) => { record.rulesVersion = RULES_VERSION - 1; }, 'record.rulesVersion'],
    ['another rules version', (record: Record<string, unknown>) => { record.rulesVersion = RULES_VERSION + 1; }, 'record.rulesVersion'],
    ['another setup hash', (record: Record<string, unknown>) => { record.setupHash = '0123456789abcdef'; }, 'record.setupHash'],
  ])('rejects its record with %s before any tick', (_, change, path) => {
    expectRejected(() => replayRecord(recordWith(recording, change), contentOf(ending.input())), path);
  });

  it('rejects its record on content of another identity', () => {
    const content = { ...contentOf(ending.input()), identity: syntheticIdentity({ manifestIdentity: `manifest:sha256:${'0'.repeat(64)}` }) };
    expectRejected(() => replayRecord(roundTrip(recording.record), content as never), 'record.content', 'must be the identity of the replayed content');
  });
});

describe('runs that stop without their completion', () => {
  it('a fault in the completion\'s tick is no completion: every call and the export throw it', () => {
    const ending = ENDINGS[0];
    const { state, session: target } = session(ending);
    for (let tick = 1; ; tick++) {
      const events = target.step(ending.script(tick));
      if (ofType(events, 'teardown-started').length > 0) break;
    }
    // A script use that outlives the teardown (ME-11).
    state.ai.parseCache.unshift({ script: -1, uses: 1, items: [] });
    const fault = expectFault(() => target.step(tickInput()), 'invariant-violated', 'mission-teardown');
    expect(state.flow.completedTick).toBeNull();
    expect(thrownBy(() => target.exportRecording())).toBe(fault);
    expect(thrownBy(() => target.projection())).toBe(fault);
  });

  it('a recording stopped early exports a prefix without the completion, which never reads as completed', () => {
    const ending = ENDINGS[1];
    const { session: target } = session(ending);
    for (let tick = 1; tick <= 200; tick++) target.step(ending.script(tick));
    const { result } = target.exportRecording();
    expect([result.finalTick, completedRun(result), ofType(result.events, 'mission-completed')]).toEqual([200, false, []]);
    expect(target.projection().result).toEqual({ readiness: 'ready', outcome: 'in-progress' });
  });
});
