import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TickInput } from '../src/core/contracts/tick-input.ts';
import { compareReplayResults } from '../src/core/replay/compare.ts';
import type * as CompareModule from '../src/core/replay/compare.ts';
import { createRecordingSession, GAME_REPLAY_VERSION } from '../src/core/replay/recording.ts';
import { replayRecord, type ReplayContent } from '../src/core/replay/replay.ts';
import type * as ReplayModule from '../src/core/replay/replay.ts';
import { RULES_VERSION } from '../src/core/replay/rules-version.ts';
import { asCreateInput, worldInput } from '../src/core/world/create-world.test-support.ts';
import { ordinaryFiles } from '../tools/compliance/distribution.ts';
import { test, expect } from './support/browser-test.ts';

// P3-04 (docs/plan/p3/04/spec.md, 合成演示退役 and 验证策略: Replay/一致性): the formal Core's `replayRecord` in the
// browser, the module the development server serves, on a record of code-generated synthetic content that Node
// recorded; its result equals Node's replay of the same record, and records of another version or identity are
// rejected the same way. Development project only: production serves no source modules. The browser's own recordings
// replay in Node through tools/replay-check.ts in mission-flow.development.spec.ts.

const TICKS = 320;
const CHECKPOINT_INTERVAL = 16;

/** A fixed input script: commands on some ticks, P3-06's throttle presets and speed assist switch among them, steering on others. */
function scripted(tick: number): TickInput {
  if (tick % 5 === 0) return { axes: { pitch: 0, yaw: 0, roll: 0 }, commands: [{ type: 'fire', channel: 'primary' }, { type: 'speed-preset', level: (tick % 9) + 1 }] };
  if (tick % 7 === 0) return { axes: { pitch: -0, yaw: 0.5, roll: -1 }, commands: [{ type: 'map-point', operation: 'hover', right: 0.25, down: 1 }] };
  if (tick % 11 === 0) return { axes: { pitch: 0, yaw: 0, roll: 0 }, commands: [{ type: 'speed', operation: 'toggle-auto-match' }] };
  return { axes: { pitch: 0, yaw: 0, roll: 0 }, commands: [] };
}

/** Plain data, as a record read back from a JSON file (which writes -0 as 0). */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** What a rejected replay threw, or null when it did not throw. */
function rejection(run: () => unknown): { name: string; message: string } | null {
  try {
    run();
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return { name: error.name, message: error.message };
  }
  return null;
}

test('the browser replays a formal Core record like Node and rejects records of another version or identity', async ({ page, browser, baseURL }, testInfo) => {
  // Loads while Node records and replays.
  const navigation = page.goto('/');
  // A slice-shaped world with the first wingman at one second per tick, so the run covers every spawn group.
  const input = asCreateInput(worldInput({ run: { wingman: 0, clockUnitsPerTick: 64 } }));
  const session = createRecordingSession(input, { producer: 'open-star-rangers e2e', checkpointInterval: CHECKPOINT_INTERVAL });
  for (let tick = 1; tick <= TICKS; tick++) session.step(scripted(tick));
  const recording = session.exportRecording();
  const record = plain(recording.record);
  expect(record.version).toBe(GAME_REPLAY_VERSION);
  expect(record.rulesVersion).toBe(RULES_VERSION);
  expect(record.ticks.some(({ commands }) => commands.some(command => command.type === 'speed-preset')))
    .toBe(true);
  const { mission, craftTypes, wingmanRoster, craftInfo, identity } = input;
  const content: ReplayContent = plain({ mission, craftTypes, wingmanRoster, craftInfo, identity });
  const reference = replayRecord(record, content);
  expect(compareReplayResults(recording.result, reference)).toEqual({ match: true });
  expect(reference.finalTick).toBe(TICKS);
  expect(new Set(reference.events.map(({ type }) => type))).toEqual(new Set(['command-result', 'object-instantiated', 'speed-assist-toggled']));
  const flipped = (hash: string): string => `${hash[0] === '0' ? '1' : '0'}${hash.slice(1)}`;
  const changed = {
    ...reference,
    checkpoints: reference.checkpoints.map(checkpoint => (checkpoint.tick === 2 * CHECKPOINT_INTERVAL ? { ...checkpoint, hash: flipped(checkpoint.hash) } : checkpoint)),
  };
  // Records of another format, version or rules version (the next ones, and those before P3-05's speed-preset), or of
  // other content or setup, each with what replay throws.
  const cases: readonly { readonly record: Record<string, unknown>; readonly message: string }[] = [
    { record: { ...record, format: 'osr-synthetic-replay' }, message: 'record.format must be osr-game-replay' },
    { record: { ...record, version: GAME_REPLAY_VERSION + 1 }, message: `record.version must be ${GAME_REPLAY_VERSION}` },
    { record: { ...record, version: 1 }, message: `record.version must be ${GAME_REPLAY_VERSION}` },
    { record: { ...record, rulesVersion: RULES_VERSION + 1 }, message: `record.rulesVersion must be ${RULES_VERSION}, the rules version of this code` },
    { record: { ...record, rulesVersion: 2 }, message: `record.rulesVersion must be ${RULES_VERSION}, the rules version of this code` },
    {
      record: { ...record, content: { ...record.content, converterVersion: 'synthetic-converter.2' } },
      message: 'record.content must be the identity of the replayed content',
    },
    { record: { ...record, setupHash: flipped(record.setupHash) }, message: 'record.setupHash must be the setup hash of the replayed content' },
  ];
  const invalid = cases.map(({ record }) => record);
  const expectedRejections = cases.map(({ message }) => ({ name: 'CoreInputError', message }));
  expect(invalid.map(value => rejection(() => replayRecord(value, content)))).toEqual(expectedRejections);

  await navigation;
  const observed = await page.evaluate(async ({ record, content, reference, changed, invalid }) => {
    const [replayPath, comparePath] = ['/src/core/replay/replay.ts', '/src/core/replay/compare.ts'];
    const replay: typeof ReplayModule = await import(replayPath);
    const compare: typeof CompareModule = await import(comparePath);
    const actual = replay.replayRecord(record, content);
    const rejected = invalid.map(value => {
      try {
        replay.replayRecord(value, content);
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        return { name: error.name, message: error.message };
      }
      return null;
    });
    return {
      actual, rejected,
      comparison: compare.compareReplayResults(reference, actual),
      mismatch: compare.compareReplayResults(changed, actual),
    };
  }, { record, content, reference, changed, invalid });
  expect(observed.actual).toEqual(reference);
  expect(observed.comparison).toEqual({ match: true });
  expect(observed.mismatch).toEqual({ match: false, tick: 2 * CHECKPOINT_INTERVAL, kind: 'checkpoint' });
  expect(observed.rejected).toEqual(expectedRejections);

  // Identifies the Core sources both runtimes ran, as the evidence's code version.
  const root = join(import.meta.dirname, '..');
  const sources = ordinaryFiles(root, 'src/core').filter(path => /\.ts$/.test(path) && !/\.test(?:-support)?\.ts$/.test(path));
  const sourceHash = createHash('sha256');
  for (const path of sources) sourceHash.update(path).update(readFileSync(join(root, path)));
  await testInfo.attach('replay-equivalence', {
    body: JSON.stringify({
      node: process.version, v8: process.versions.v8, browser: browser.version(), origin: baseURL, rulesVersion: RULES_VERSION,
      sources: sources.length, sourceSHA256: sourceHash.digest('hex'),
      recordSHA256: createHash('sha256').update(JSON.stringify(record)).digest('hex'),
      ticks: TICKS, events: reference.events.length, checkpoints: reference.checkpoints.length, rejected: observed.rejected,
    }),
    contentType: 'application/json',
  });
});
