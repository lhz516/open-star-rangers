import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test, expect } from './support/browser-test.ts';
import { replaySyntheticRecord, type SyntheticReplayRecord } from '../src/core/synthetic/synthetic-replay.ts';
import type * as ReplayModule from '../src/core/synthetic/synthetic-replay.ts';

test('browser production replay matches Node and rejects mismatch and invalid versions', async ({ page, browser, baseURL }, testInfo) => {
  const record: SyntheticReplayRecord = {
    format: 'osr-synthetic-replay', version: 1, config: { seed: 0, tickRateHz: 50 }, checkpointInterval: 1,
    ticks: [
      { input: { moveX: 1 }, commands: [{ type: 'add-marker' }] },
      { input: { moveX: 1 }, commands: [] },
      { input: { moveX: 0 }, commands: [] },
      { input: { moveX: -0.5 }, commands: [{ type: 'remove-marker' }] },
    ],
  };
  const reference = replaySyntheticRecord(record);
  const changed = {
    ...reference,
    checkpoints: reference.checkpoints.map(checkpoint => checkpoint.tick === 2 ? {
      ...checkpoint, hash: `${checkpoint.hash[0] === '0' ? '1' : '0'}${checkpoint.hash.slice(1)}`,
    } : checkpoint),
  };
  await page.goto('/');
  const observed = await page.evaluate(async ({ record, reference, changed }) => {
    const modulePath = '/src/core/synthetic/synthetic-replay.ts';
    const replay: typeof ReplayModule = await import(modulePath);
    const actual = replay.replaySyntheticRecord(record);
    const invalid = [{ ...record, format: 'invalid-synthetic-format' }, { ...record, version: 2 }];
    const rejected = invalid.map(value => {
      try {
        replay.replaySyntheticRecord(value);
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        return { name: error.name, message: error.message };
      }
      throw new Error('Production replay unexpectedly accepted an invalid record');
    });
    return { actual, comparison: replay.compareSyntheticReplayResults(reference, actual), mismatch: replay.compareSyntheticReplayResults(changed, actual), rejected };
  }, { record, reference, changed });
  expect(observed.actual.events).toEqual(reference.events);
  expect(observed.actual.checkpoints).toEqual(reference.checkpoints);
  expect(observed.comparison).toEqual({ match: true });
  expect(observed.mismatch).toEqual({ match: false, tick: 2, kind: 'checkpoint' });
  expect(observed.rejected).toEqual([
    { name: 'CoreInputError', message: 'record.format must be osr-synthetic-replay' },
    { name: 'CoreInputError', message: 'record.version must be 1' },
  ]);
  const sourceFiles = [
    'errors.ts', 'determinism/rng.ts', 'determinism/fnv1a64.ts',
    'synthetic/synthetic-scene.ts', 'synthetic/synthetic-snapshot.ts', 'synthetic/synthetic-replay.ts',
  ];
  const sourceHash = createHash('sha256');
  for (const name of sourceFiles) sourceHash.update(name).update(readFileSync(new URL(`../src/core/${name}`, import.meta.url)));
  await testInfo.attach('replay-equivalence', {
    body: JSON.stringify({
      node: process.version, browser: browser.version(), origin: baseURL,
      sourceFiles, sourceSHA256: sourceHash.digest('hex'),
      record, recordSHA256: createHash('sha256').update(JSON.stringify(record)).digest('hex'), reference, observed,
    }),
    contentType: 'application/json',
  });
});
