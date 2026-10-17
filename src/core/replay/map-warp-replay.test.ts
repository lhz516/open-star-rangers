import { describe, expect, it } from 'vitest';
import { syntheticIdentity } from '../../content/synthetic-content.test-support.ts';
import { CORE_LIMITS } from '../contracts/limits.ts';
import type { Command } from '../contracts/tick-input.ts';
import { CoreInputError } from '../errors.ts';
import { mapGeometryContent } from '../world/create-world.test-support.ts';
import { thrownBy, tickInput } from '../world/world.test-support.ts';
import { compareReplayResults } from './compare.ts';
import {
  chainCraftInfo, chainInput, chainScript, CHAIN_TICKS, FAR_PIXEL, NEAR_ICON_PIXEL, NEAR_SELECT_TICK, OPEN_TICK, pointAt, selectAt, WARP_TICK,
} from './map-warp.test-support.ts';
import { createRecordingSession, GAME_REPLAY_VERSION, type Recording } from './recording.ts';
import { replayRecord } from './replay.ts';
import { contentOf, PRODUCER, recordScript, roundTrip } from './replay.test-support.ts';
import { RULES_VERSION } from './rules-version.ts';
import { snapshotHash, snapshotText, type GameSnapshot } from './snapshot.ts';

// P3-09 AC-11's replay part (docs/plan/p3/09/spec.md; docs/plan/p3/02/spec.md, MW-14 and MW-15): the synthetic map and
// Warp chain of map-warp.test-support.ts (code-generated content and inputs, never original data) recorded and replayed
// through the formal entries. The record's shape and format version are unchanged by P3-09; the rules version is 5.

const INPUT = chainInput();
const CONTENT = contentOf(INPUT);

/** The run with a checkpoint every tick, reading projection, Render State and snapshot after every step. */
function recordReading(): { readonly recording: Recording; readonly snapshots: readonly GameSnapshot[] } {
  const session = createRecordingSession(INPUT, { producer: PRODUCER, checkpointInterval: 1 });
  const snapshots: GameSnapshot[] = [];
  for (let tick = 1; tick <= CHAIN_TICKS; tick++) {
    session.step(chainScript(tick));
    session.projection();
    session.renderState();
    snapshots.push(session.snapshot());
  }
  return { recording: session.exportRecording(), snapshots };
}

const READ = recordReading();
const RECORDING = READ.recording;

type Mutable = Record<string, unknown>;

function expectRejected(work: () => unknown, path: string, reason?: string): void {
  const error = thrownBy(work);
  expect(error).toBeInstanceOf(CoreInputError);
  expect(error).toMatchObject(reason === undefined ? { path } : { path, reason });
}

/** A JSON copy of the record, changed by `change`. */
function recordWith(change: (record: Mutable & { ticks: Mutable[] }) => void): unknown {
  const record = roundTrip(RECORDING.record) as Mutable & { ticks: Mutable[] };
  change(record);
  return record;
}

/** The record with tick `tick`'s commands replaced. */
const withCommands = (tick: number, commands: readonly unknown[]) => recordWith(({ ticks }) => { ticks[tick - 1] = tickInput(commands as Command[]) as never; });

const typesOf = (recording: Recording) => new Set(recording.result.events.map(({ type }) => type));

// Whole runs recorded and replayed: 0.5–1.7 s per case alone, up to 6.8 s in full runs at load 50.
describe('map and Warp replay (P3-09 AC-11; MW-14)', { timeout: 30_000 }, () => {
  it('has the whole chain in the recorded run', () => {
    for (const type of ['map-toggled', 'warp-destination-set', 'target-changed', 'warp-started', 'left-page-changed', 'warp-completed', 'object-destroyed'] as const) {
      expect(typesOf(RECORDING).has(type), type).toBe(true);
    }
    expect(RECORDING.record).toMatchObject({ version: GAME_REPLAY_VERSION, rulesVersion: RULES_VERSION });
    // Merged with P3-10, whose own increment also took 5 (CB-16): the merge took 6, and P3-08/12 7 (CR-25); P3-08's
    // drop-transponder took the replay format to 3, and P3-14/08 the rules version to 8 (FA-08).
    expect([GAME_REPLAY_VERSION, RULES_VERSION]).toEqual([3, 8]);
  });

  it('reproduces every event and the snapshot at every checkpoint after a JSON round trip', () => {
    const { record, result } = roundTrip(RECORDING) as Recording;
    const replayed = replayRecord(record, roundTrip(CONTENT) as typeof CONTENT);
    expect(replayed).toEqual(RECORDING.result);
    expect(compareReplayResults(result, replayed)).toEqual({ match: true });
    expect(replayed.checkpoints.map(({ tick }) => tick)).toEqual(Array.from({ length: CHAIN_TICKS + 1 }, (_, tick) => tick));
    // Each checkpoint is the hash of the snapshot the session gave after that tick.
    expect(RECORDING.result.checkpoints.slice(1).map(({ hash }) => hash)).toEqual(READ.snapshots.map(snapshotHash));
  });

  it('gives the same record and result whether projection, Render State and snapshot are read every tick, now and then or never', () => {
    expect(recordScript(INPUT, CHAIN_TICKS, 1, chainScript)).toEqual(RECORDING);
    // A renderer reading at its own rate, here every seventh tick and twice in some, on a coarser checkpoint interval.
    const session = createRecordingSession(INPUT, { producer: PRODUCER, checkpointInterval: 16 });
    for (let tick = 1; tick <= CHAIN_TICKS; tick++) {
      session.step(chainScript(tick));
      if (tick % 7 === 0) session.projection();
      if (tick % 21 === 0) {
        session.renderState();
        session.projection();
        session.snapshot();
      }
    }
    const sparse = session.exportRecording();
    expect(sparse.record).toEqual({ ...RECORDING.record, checkpointInterval: 16 });
    expect(sparse.result.events).toEqual(RECORDING.result.events);
    const hashes = new Map(RECORDING.result.checkpoints.map(({ tick, hash }) => [tick, hash]));
    for (const { tick, hash } of sparse.result.checkpoints) expect(hash, `tick ${tick}`).toBe(hashes.get(tick));
  });

  it('separates by checkpoint alone a run whose only difference is map state no event reports: the cursor a hover leaves', () => {
    const elsewhere = replayRecord(withCommands(NEAR_SELECT_TICK, [selectAt(NEAR_ICON_PIXEL), { type: 'map-point', operation: 'hover', ...pointAt(FAR_PIXEL) }]), CONTENT);
    expect(elsewhere.events).toEqual(RECORDING.result.events);
    expect(compareReplayResults(RECORDING.result, elsewhere)).toEqual({ match: false, tick: NEAR_SELECT_TICK, kind: 'checkpoint' });
    // The next select overwrites the cursor, and from then on the two runs are the same.
    expect(elsewhere.checkpoints.slice(NEAR_SELECT_TICK + 1)).toEqual(RECORDING.result.checkpoints.slice(NEAR_SELECT_TICK + 1));
  });

  it('writes the map and Warp state but no derived copy of it', () => {
    const derived = ['startPixel', 'startupRotations', 'unitsPerPixel', 'zoomBounds', 'zoomMembers', 'contacts', 'coverage', 'cursorCost', 'warpRequest', 'markerEntityId', 'readings'];
    for (const tick of [OPEN_TICK, NEAR_SELECT_TICK, WARP_TICK, CHAIN_TICKS]) {
      const snapshot = READ.snapshots[tick - 1];
      const text = snapshotText(snapshot);
      for (const key of derived) expect(text.includes(`"${key}"`), `${key} at tick ${tick}`).toBe(false);
      expect(Object.keys(snapshot.state.player.map)).toEqual(['cursor', 'destination']);
      for (const icon of snapshot.state.mapIcons) expect(Object.keys(icon)).toEqual(['entityId', 'kindBit', 'position', 'pixel', 'inWorld']);
    }
    const inTransit = READ.snapshots[WARP_TICK - 1].state;
    expect(Object.keys(inTransit.player.warp!)).toEqual(['serial', 'origin', 'length', 'segments', 'fraction', 'error', 'angle', 'centring', 'frame', 'path']);
  });

  it('diverges at the first tick a map or Warp input changes', () => {
    const noWarp = replayRecord(withCommands(WARP_TICK, []), CONTENT);
    expect(compareReplayResults(RECORDING.result, noWarp)).toEqual({ match: false, tick: WARP_TICK, kind: 'events' });
    const otherPoint = replayRecord(withCommands(NEAR_SELECT_TICK + 1, [selectAt({ column: FAR_PIXEL.column + 1, row: FAR_PIXEL.row })]), CONTENT);
    expect(compareReplayResults(RECORDING.result, otherPoint)).toEqual({ match: false, tick: NEAR_SELECT_TICK + 1, kind: 'events' });
  });

  describe('rejection', () => {
    const select: Mutable = { type: 'map-point', operation: 'select', right: 0.5, down: 0.5 };
    /** A change putting `commands` at `ticks[index]`. */
    const at = (index: number, ...commands: unknown[]) => (record: Mutable & { ticks: Mutable[] }) => { record.ticks[index] = tickInput(commands as Command[]) as never; };
    it.each([
      ['an unknown version', (record: Mutable) => { record.version = GAME_REPLAY_VERSION + 1; }, 'record.version'],
      ['the rules version before P3-09', (record: Mutable) => { record.rulesVersion = 4; }, 'record.rulesVersion'],
      ['a later rules version', (record: Mutable) => { record.rulesVersion = RULES_VERSION + 1; }, 'record.rulesVersion'],
      ['a select beyond the right edge', at(5, { ...select, right: 1.5 }), 'record.ticks[5].commands[0].right'],
      ['a select above the top edge', at(5, { ...select, down: -0.25 }), 'record.ticks[5].commands[0].down'],
      ['a select at NaN', at(5, { ...select, right: Number.NaN }), 'record.ticks[5].commands[0].right'],
      ['a map point of an unknown operation', at(5, { ...select, operation: 'drag' }), 'record.ticks[5].commands[0].operation'],
      ['a map toggle with a field', at(3, { type: 'toggle-map', open: true }), 'record.ticks[3].commands[0]'],
      ['a Warp request with a destination', at(9, { type: 'request-warp', destination: { x: 0, y: 0, z: 0 } }), 'record.ticks[9].commands[0]'],
      [`${CORE_LIMITS.commandsPerTick + 1} map points in a tick`, at(5, ...Array.from({ length: CORE_LIMITS.commandsPerTick + 1 }, () => select)), 'record.ticks[5].commands'],
      ['another setupHash', (record: Mutable) => { record.setupHash = '0123456789abcdef'; }, 'record.setupHash'],
    ])('rejects %s before running anything', (_, change, path) => {
      expectRejected(() => replayRecord(recordWith(change as never), CONTENT), path);
    });

    it(`replays ${CORE_LIMITS.commandsPerTick} map points in a tick`, () => {
      const full = withCommands(5, Array.from({ length: CORE_LIMITS.commandsPerTick }, () => select));
      const result = replayRecord(full, CONTENT);
      expect(result.events.filter(({ tick, type }) => tick === 5 && type === 'warp-destination-set')).toHaveLength(CORE_LIMITS.commandsPerTick);
    });

    it('rejects content of another identity', () => {
      const other = { ...CONTENT, identity: syntheticIdentity({ manifestIdentity: 'manifest:other' }) };
      expectRejected(() => replayRecord(RECORDING.record, other as never), 'record.content', 'must be the identity of the replayed content');
    });

    it('rejects content whose map or Warp rule inputs changed under the same identity', () => {
      type Craft = Record<string, unknown> & { pairs: { at00: number; at04: number }[] };
      const craft = (change: (player: Craft) => void) => {
        const info = chainCraftInfo();
        change(info.craft[0] as unknown as Craft);
        return chainInput({ craftInfo: info });
      };
      const forgeries = [
        craft((player) => void (player.pairs[0].at04 = 101)),
        craft((player) => void (player.pairs[1].at00 = 999)),
        craft((player) => void (player.atA4 = 3)),
        craft((player) => void (player.atA8 = 15)),
        craft((player) => void (player.atB8 = 65)),
        chainInput({ mapGeometry: { ...mapGeometryContent(), rectangle: { x0: 21, y0: 45, x1: 611, y1: 443 } } }),
      ];
      for (const forged of forgeries) {
        expect(forged.identity).toEqual(INPUT.identity);
        expectRejected(() => replayRecord(RECORDING.record, contentOf(forged)), 'record.setupHash', 'must be the setup hash of the replayed content');
      }
    });
  });
});
