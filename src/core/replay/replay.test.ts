import { describe, expect, it } from 'vitest';
import { ContentContractError } from '../../content/contract-validation.ts';
import { syntheticIdentity } from '../../content/synthetic-content.test-support.ts';
import { CORE_LIMITS } from '../contracts/limits.ts';
import type { Command, TickInput } from '../contracts/tick-input.ts';
import { CoreInputError } from '../errors.ts';
import { createWorld } from '../world/create-world.ts';
import { originalImportIdentity, worldInput, type MissionDraft } from '../world/create-world.test-support.ts';
import { thrownBy, tickInput } from '../world/world.test-support.ts';
import { compareReplayResults } from './compare.ts';
import type { Recording } from './recording.ts';
import { replayRecord } from './replay.ts';
import { contentOf, longInput, recordScript, roundTrip } from './replay.test-support.ts';
import { RULES_VERSION } from './rules-version.ts';

type Mutable = Record<string, unknown>;

/** The slice-shaped world with a wingman for 305 ticks of one second: every spawn, commands and checkpoints every 7. */
const INPUT = longInput();
const CONTENT = contentOf(INPUT);
const RECORDING = recordScript(INPUT, 305, 7);

/** A JSON copy of the record, changed by `change`. */
function recordWith(change: (record: Mutable & { run: Mutable; ticks: Mutable[] }) => void, recording: Recording = RECORDING): unknown {
  const record = roundTrip(recording.record) as Mutable & { run: Mutable; ticks: Mutable[] };
  change(record);
  return record;
}

function expectRejected(work: () => unknown, path: string, reason?: string): void {
  const error = thrownBy(work);
  expect(error).toBeInstanceOf(CoreInputError);
  expect(error).toMatchObject(reason === undefined ? { path } : { path, reason });
}

describe('replay (P3-02 AC-12, 快照、哈希与 replay)', () => {
  it('reproduces every event and checkpoint after a JSON round trip', () => {
    const { record, result } = roundTrip(RECORDING) as Recording;
    const replayed = replayRecord(record, CONTENT);
    expect(replayed).toEqual(RECORDING.result);
    expect(compareReplayResults(result, replayed)).toEqual({ match: true });
    // The run covers the delayed group, commands and the final checkpoint off the interval.
    expect(replayed.events.filter(({ type, tick }) => type === 'object-instantiated' && tick === 301)).toHaveLength(6);
    expect(replayed.events.filter(({ type }) => type === 'command-result').length).toBeGreaterThan(100);
    expect(replayed.checkpoints.map(({ tick }) => tick).slice(-3)).toEqual([294, 301, 305]);
    expect(replayed.finalTick).toBe(305);
  });

  it('replays runs of no ticks, of an interval dividing the length and of the default step on original-import content', () => {
    for (const [ticks, interval] of [[0, 3], [12, 4], [12, 1]] as const) {
      const recording = recordScript(INPUT, ticks, interval);
      expect(replayRecord(roundTrip(recording.record), CONTENT)).toEqual(recording.result);
    }
    const production = worldInput({ identity: originalImportIdentity(), run: { wingman: 2 } }) as never;
    const recording = recordScript(production, 40, 16);
    expect(recording.record.run.clockUnitsPerTick).toBe(2);
    expect(replayRecord(roundTrip(recording.record), contentOf(production))).toEqual(recording.result);
  });

  it('returns deeply frozen results, and recording the same run twice gives the same result', () => {
    const replayed = replayRecord(RECORDING.record, CONTENT);
    expect(Object.isFrozen(replayed) && Object.isFrozen(replayed.events) && Object.isFrozen(replayed.events[0])).toBe(true);
    expect(recordScript(INPUT, 305, 7)).toEqual(RECORDING);
  });

  describe('divergence', () => {
    it('reports the earliest tick of an input change with an observable effect as events', () => {
      const tampered = replayRecord(recordWith(({ ticks }) => { ticks[39] = tickInput([{ type: 'launch' }]) as never; }), CONTENT);
      expect(compareReplayResults(RECORDING.result, tampered)).toEqual({ match: false, tick: 40, kind: 'events' });
    });

    it('finds no difference for an input change without an observable effect', () => {
      const steered = recordWith(({ ticks }) => { ticks[10] = { axes: { pitch: 1, yaw: -1, roll: 0.5 }, commands: [] }; });
      expect(compareReplayResults(RECORDING.result, replayRecord(steered, CONTENT))).toEqual({ match: true });
    });

    it('reports a state difference without events at its first checkpoint', () => {
      const reseeded = replayRecord(recordWith(({ run }) => { run.seed = 1; }), CONTENT);
      expect(compareReplayResults(RECORDING.result, reseeded)).toEqual({ match: false, tick: 0, kind: 'checkpoint' });
    });

    it('reports a shorter run at its first missing tick, not at its final checkpoint off the interval', () => {
      const shorter = replayRecord(recordWith(({ ticks }) => { ticks.length = 100; }), CONTENT);
      expect(shorter.checkpoints.at(-1)?.tick).toBe(100);
      expect(compareReplayResults(RECORDING.result, shorter)).toEqual({ match: false, tick: 101, kind: 'length' });
      expect(compareReplayResults(shorter, RECORDING.result)).toEqual({ match: false, tick: 101, kind: 'length' });
    });

    it('uses a fixed set of seeds whose runs take different random branches', () => {
      const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
      const runs = seeds.map((seed) => {
        const input = longInput({ run: { seed } });
        const recording = recordScript(input, 2, 1);
        expect(replayRecord(roundTrip(recording.record), contentOf(input))).toEqual(recording.result);
        const world = createWorld(input);
        world.step(tickInput());
        const { entities, spawn } = world.snapshot().state;
        // Record 8 is placed in a rectangle; the +0x78 defaults of the records without a source value are drawn.
        return { recording, position: JSON.stringify(entities.find(({ source }) => source?.index === 8)?.position), default: spawn.records[8].ruleInputs.aiValueC };
      });
      expect(new Set(runs.map(({ position }) => position)).size).toBeGreaterThan(1);
      expect(new Set(runs.map(({ default: value }) => value)).size).toBeGreaterThan(1);
      expect(compareReplayResults(runs[0].recording.result, runs[1].recording.result)).toMatchObject({ match: false, tick: 0, kind: 'checkpoint' });
    });
  });

  describe('rejection', () => {
    it.each([
      ['an unknown format', (record: Mutable) => { record.format = 'osr-synthetic-replay'; }, 'record.format'],
      ['an unknown version', (record: Mutable) => { record.version = 2; }, 'record.version'],
      ['another version with other fields', (record: Mutable) => { record.version = 2; record.frames = []; }, 'record.version'],
      ['another rules version', (record: Mutable) => { record.rulesVersion = RULES_VERSION + 1; }, 'record.rulesVersion'],
      ['an extra field', (record: Mutable) => { record.notes = ''; }, 'record'],
      ['a missing field', (record: Mutable) => { delete record.checkpointInterval; }, 'record.checkpointInterval'],
      ['an empty producer', (record: Mutable) => { record.producer = ''; }, 'record.producer'],
      ['a malformed content identity', (record: Mutable) => { (record.content as Mutable).sliceId = 'other'; }, 'record.content.sliceId'],
      ['a malformed mission', (record: Mutable) => { record.mission = 'Mission'; }, 'record.mission'],
      ['a malformed setupHash', (record: Mutable) => { record.setupHash = 'ABCDEF0123456789'; }, 'record.setupHash'],
      ['a run without its default', (record: Mutable & { run: Mutable }) => { delete record.run.clockUnitsPerTick; }, 'record.run.clockUnitsPerTick'],
      ['a run with an odd step', (record: Mutable & { run: Mutable }) => { record.run.clockUnitsPerTick = 3; }, 'record.run.clockUnitsPerTick'],
      ['a run with a negative wingman', (record: Mutable & { run: Mutable }) => { record.run.wingman = -1; }, 'record.run.wingman'],
      ['a fractional seed', (record: Mutable & { run: Mutable }) => { record.run.seed = 0.5; }, 'record.run.seed'],
      ['a zero interval', (record: Mutable) => { record.checkpointInterval = 0; }, 'record.checkpointInterval'],
      ['a hole in the ticks', (record: Mutable & { ticks: unknown[] }) => { delete record.ticks[3]; }, 'record.ticks'],
      ['a bad tick input', (record: Mutable & { ticks: Mutable[] }) => { record.ticks[3] = { axes: { pitch: 0, yaw: 0, roll: 2 }, commands: [] }; }, 'record.ticks[3].axes.roll'],
      ['an unknown command', (record: Mutable & { ticks: Mutable[] }) => { record.ticks[4] = tickInput([{ type: 'eject' } as never]) as never; }, 'record.ticks[4].commands[0].type'],
    ])('rejects %s before running anything', (_, change, path) => {
      expectRejected(() => replayRecord(recordWith(change as never), CONTENT), path);
    });

    it('rejects a record that is not a plain object', () => {
      for (const record of [null, [], 'record', new Map()]) expectRejected(() => replayRecord(record, CONTENT), 'record');
    });

    it('rejects the content of another identity, mission or setup, even under the same identity', () => {
      const otherIdentity = { ...CONTENT, identity: syntheticIdentity({ manifestIdentity: 'manifest:other' }) };
      expectRejected(() => replayRecord(RECORDING.record, otherIdentity as never), 'record.content', 'must be the identity of the replayed content');
      expectRejected(() => replayRecord(recordWith((record) => { record.mission = 'mission/other'; }), CONTENT), 'record.mission', 'must be the mission of the replayed content');
      // Forged content: the same declared identity, one coordinate moved.
      const forged = longInput();
      const position = (forged.mission.content as MissionDraft).declarations[8].position as { x: number };
      position.x += 1;
      expect(forged.identity).toEqual(INPUT.identity);
      expectRejected(() => replayRecord(RECORDING.record, contentOf(forged)), 'record.setupHash', 'must be the setup hash of the replayed content');
    });

    it('rejects a run configuration the content does not admit, at the record', () => {
      expectRejected(() => replayRecord(recordWith(({ run }) => { run.rawDifficulty = 50; }), CONTENT), 'record.run.rawDifficulty');
      expectRejected(() => replayRecord(recordWith(({ run }) => { run.wingman = 5; }), CONTENT), 'record.run.wingman');
      const production = worldInput({ identity: originalImportIdentity() }) as never;
      const recording = recordScript(production, 1, 1);
      const changed = recordWith(({ run }) => { run.clockUnitsPerTick = 4; }, recording);
      expectRejected(() => replayRecord(changed, contentOf(production)), 'record.run.clockUnitsPerTick', 'must be the default for original-import content');
    });

    it('rejects malformed content at the content, keeping a content contract error', () => {
      expectRejected(() => replayRecord(RECORDING.record, { ...CONTENT, extra: 1 } as never), 'content');
      expectRejected(() => replayRecord(RECORDING.record, { ...CONTENT, mission: { ...CONTENT.mission, id: 'data/craft-types' } } as never), 'content.mission.id');
      const error = thrownBy(() => replayRecord(RECORDING.record, { ...CONTENT, identity: { ...CONTENT.identity, sliceId: 'other' } } as never));
      expect(error).toBeInstanceOf(ContentContractError);
      expect(error).toMatchObject({ path: 'content.identity.sliceId' });
    });

    it(`rejects more than ${CORE_LIMITS.recordedTicks} ticks before reading any`, () => {
      const ticks = new Array(CORE_LIMITS.recordedTicks + 1);
      expectRejected(() => replayRecord(recordWith((record) => { record.ticks = ticks; }), CONTENT), 'record.ticks', `must have at most ${CORE_LIMITS.recordedTicks} items`);
    });

    it(`rejects more than ${CORE_LIMITS.recordedCommands} commands before running any tick`, () => {
      const full: TickInput = tickInput(Array.from({ length: CORE_LIMITS.commandsPerTick }, (): Command => ({ type: 'launch' })));
      const count = CORE_LIMITS.recordedCommands / CORE_LIMITS.commandsPerTick;
      const record = recordWith((value) => { value.ticks = [...Array.from({ length: count }, () => full), tickInput([{ type: 'launch' }])] as never; });
      expectRejected(() => replayRecord(record, CONTENT), `record.ticks[${count}].commands`, `would exceed ${CORE_LIMITS.recordedCommands} recorded commands`);
    });
  });
});
