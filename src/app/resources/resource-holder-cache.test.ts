import { describe, expect, it, vi } from 'vitest';
import type { BudgetRecord } from '../../content/budget.ts';
import { readConverterVersion, readSourceFingerprint, type ContentIdentity } from '../../content/content-identity.ts';
import { CLASSIC_P2_SLICE } from '../../content/slice-definition.ts';
import { syntheticPackage } from '../../content/synthetic-content.test-support.ts';
import {
  cacheFailure, cacheKeyOf, RESOURCE_CACHE_FAILURE_CODES, type ResourceCacheFailureCode, type ResourceCacheFailureError,
} from '../../platform/storage/resource-cache-contract.ts';
import { chargeDeclaredBudget, readGroupInputs } from '../../platform/storage/resource-cache-records.ts';
import { PRODUCTION_PACKAGE } from '../../workers/production-package.ts';
import { restorableEntry } from './resource-holder.ts';
import {
  allGroups, committed, entryFor, finishedJob, flush, identityOf, listed, restored, SYNTHETIC_PROFILE, testHolder,
} from './resource-holder.test-support.ts';
import { resourceStatuses } from './resource-status.ts';

const IDENTITY = identityOf(allGroups());
const failed = (code: ResourceCacheFailureCode) => cacheFailure(code, 'database');

/** A holder whose initial listing found nothing and whose complete import is now committing. */
async function committing(options: Parameters<typeof testHolder>[0] = {}) {
  const test = testHolder(options);
  test.cache.lists[0].resolve(listed());
  await flush();
  test.holder.acceptImport(finishedJob(allGroups()));
  return test;
}

describe('cache listing', () => {
  it('lists the cache once on creation and offers only the entry the expected profile accepts', async () => {
    const { holder, cache } = testHolder();
    expect(cache.lists).toHaveLength(1);
    expect(holder.getSnapshot().catalog).toEqual({ status: 'checking' });
    const otherVersion = { ...IDENTITY, converterVersion: readConverterVersion('synthetic-converter.2') };
    const otherSource = { ...IDENTITY, origin: { type: 'original-import' as const, sourceFingerprint: readSourceFingerprint(`source:sha256:${'cd'.repeat(32)}`) } };
    const entries = [entryFor(otherVersion), entryFor(otherSource), entryFor(IDENTITY, 'corrupt'), entryFor(IDENTITY)];
    cache.lists[0].resolve(listed(...entries));
    await flush();
    expect(holder.getSnapshot().catalog).toEqual({ status: 'listed', restorable: entries[3] });
  });

  it.each([
    ['another converter version', { converterVersion: readConverterVersion('synthetic-converter.2') }],
    ['another source fingerprint', { origin: { type: 'original-import', sourceFingerprint: readSourceFingerprint(`source:sha256:${'cd'.repeat(32)}`) } }],
    ['a synthetic origin', { origin: { type: 'synthetic', fixtureId: 'p2-01-contracts' } }],
  ])('never offers an entry of %s', (_name, change) => {
    expect(restorableEntry([entryFor({ ...IDENTITY, ...change } as ContentIdentity)], SYNTHETIC_PROFILE)).toBeNull();
  });

  it('never offers an incompatible, corrupt or unreadable entry, even under the expected key', () => {
    for (const status of ['incompatible', 'corrupt'] as const) expect(restorableEntry([entryFor(IDENTITY, status)], SYNTHETIC_PROFILE)).toBeNull();
    expect(restorableEntry([{ key: null, status: 'corrupt', identity: null, payloadBytes: null }], SYNTHETIC_PROFILE)).toBeNull();
  });

  it('filters by the injected profile alone: the production profile refuses the synthetic entry, and the reverse', () => {
    const production = { ...IDENTITY, converterVersion: PRODUCTION_PACKAGE.converterVersion, origin: { type: 'original-import' as const, sourceFingerprint: PRODUCTION_PACKAGE.sourceFingerprint } };
    expect(restorableEntry([entryFor(IDENTITY)], PRODUCTION_PACKAGE)).toBeNull();
    expect(restorableEntry([entryFor(production)], SYNTHETIC_PROFILE)).toBeNull();
    expect(restorableEntry([entryFor(production)], PRODUCTION_PACKAGE)).toEqual(entryFor(production));
  });

  it('shows storage that cannot be listed as unavailable, reporting an unexpected rejection as read-failed', async () => {
    const { holder, cache, reportError } = testHolder();
    cache.lists[0].resolve(failed('storage-unavailable'));
    await flush();
    expect(holder.getSnapshot().catalog).toEqual({ status: 'unavailable', failure: failed('storage-unavailable') });
    const bug = new Error('bug');
    holder.relist();
    cache.lists[1].reject(bug);
    await flush();
    expect(holder.getSnapshot().catalog).toMatchObject({ status: 'unavailable', failure: { code: 'read-failed', location: 'list' } });
    expect(reportError).toHaveBeenCalledWith(bug);
  });

  it('checks again on each relist and applies only the latest listing, whatever the completion order', async () => {
    const { holder, cache } = testHolder();
    cache.lists[0].resolve(listed());
    await flush();
    holder.relist();
    expect(holder.getSnapshot().catalog).toEqual({ status: 'checking' });
    holder.relist();
    cache.lists[2].resolve(listed(entryFor(IDENTITY)));
    await flush();
    cache.lists[1].resolve(listed());
    await flush();
    expect(holder.getSnapshot().catalog).toEqual({ status: 'listed', restorable: entryFor(IDENTITY) });
  });
});

describe('automatic commit', () => {
  it('commits a complete imported package with the package budget, then shows it saved with the commit time', async () => {
    const { holder, cache, clock } = testHolder();
    cache.lists[0].resolve(listed());
    clock.time = 100;
    holder.acceptImport(finishedJob(allGroups()));
    expect(cache.commits).toHaveLength(1);
    expect(cache.commits[0].inputs).toBe(holder.current()!.groups);
    expect(cache.commits[0].limits).toBe(SYNTHETIC_PROFILE.limits);
    expect(resourceStatuses(holder.getSnapshot())).toEqual(['complete-viewable', 'memory-only', 'saving']);
    clock.time = 142;
    cache.commits[0].result.resolve(committed(allGroups()));
    await flush();
    expect(holder.getSnapshot().package!.cache).toEqual({ status: 'saved', via: 'commit', durationMs: 42 });
    expect(resourceStatuses(holder.getSnapshot())).toEqual(['complete-viewable', 'saved']);
  });

  it('never commits a partial package', async () => {
    const { holder, cache } = testHolder();
    holder.acceptImport(finishedJob(allGroups().slice(1)));
    expect(holder.save()).toBe(false);
    await flush();
    expect(cache.commits).toEqual([]);
    expect(holder.getSnapshot().package!.cache).toEqual({ status: 'not-saved', failure: null, durationMs: null });
  });

  const commitCodes = RESOURCE_CACHE_FAILURE_CODES.filter(code => !['read-failed', 'not-found', 'cache-incompatible', 'cache-corrupt'].includes(code));

  it.each(commitCodes)('keeps the package in memory only after %s, timing the commit, and saves it on a successful retry', async (code) => {
    const { holder, cache, clock } = await committing();
    clock.time = 7;
    cache.commits[0].result.resolve(failed(code));
    await flush();
    expect(holder.getSnapshot().package!.cache).toEqual({ status: 'not-saved', failure: failed(code), durationMs: 7 });
    expect(resourceStatuses(holder.getSnapshot())).toEqual(['complete-viewable', 'memory-only']);
    expect(holder.save()).toBe(true);
    expect(holder.save()).toBe(false);
    expect(holder.getSnapshot().package!.cache).toEqual({ status: 'saving' });
    expect(cache.commits).toHaveLength(2);
    cache.commits[1].result.resolve(committed(allGroups()));
    await flush();
    expect(holder.getSnapshot().package!.cache).toMatchObject({ status: 'saved', via: 'commit' });
    expect(holder.save()).toBe(false);
  });

  it('reports an unexpected commit rejection and keeps the package in memory as write-failed', async () => {
    const { holder, cache, reportError } = await committing();
    const bug = new Error('bug');
    cache.commits[0].result.reject(bug);
    await flush();
    expect(holder.getSnapshot().package!.cache).toMatchObject({ status: 'not-saved', failure: { code: 'write-failed', location: 'commit' } });
    expect(reportError).toHaveBeenCalledWith(bug);
  });

  it('keeps a package over the package budget in memory as over-budget', async () => {
    const tight: BudgetRecord = { ...SYNTHETIC_PROFILE.limits, assets: 3 };
    const { holder, cache } = await committing({ profile: { ...SYNTHETIC_PROFILE, limits: tight } });
    const { inputs, limits, result } = cache.commits[0];
    expect(limits).toBe(tight);
    // The adapter's own declared-budget charge decides, before any storage access.
    try {
      chargeDeclaredBudget(limits, readGroupInputs(inputs, 'package-incomplete'), 'groups');
      result.resolve(committed(inputs));
    } catch (error) {
      result.resolve((error as ResourceCacheFailureError).failure);
    }
    await flush();
    expect(holder.getSnapshot().package!.cache).toMatchObject({ status: 'not-saved', failure: { code: 'over-budget' } });
    expect(resourceStatuses(holder.getSnapshot())).toEqual(['complete-viewable', 'memory-only']);
  });

  it('leaves the payloads unchanged and attached while it commits', async () => {
    const { holder, cache } = await committing();
    const before = holder.current()!.groups.map(({ payloads }) => (payloads as { bytes: Uint8Array }[]).map(({ bytes }) => [...bytes]));
    cache.commits[0].result.resolve(committed(allGroups()));
    await flush();
    expect(holder.current()!.groups.map(({ payloads }) => (payloads as { bytes: Uint8Array }[]).map(({ bytes }) => [...bytes]))).toEqual(before);
  });

  it('checks the space for the package budget payload bytes and only reports the result', async () => {
    const { holder, cache } = testHolder();
    cache.capacity = { status: 'insufficient', requiredBytes: SYNTHETIC_PROFILE.limits.payloadBytes, availableBytes: 10, usage: 90, quota: 100 };
    expect(await holder.checkSpace()).toBe(cache.capacity);
    expect(cache.capacityRequests).toEqual([SYNTHETIC_PROFILE.limits.payloadBytes]);
    expect(holder.getSnapshot().package).toBeNull();
  });
});

describe('restore', () => {
  /** A holder whose listing offers the synthetic package. */
  async function offering() {
    const test = testHolder();
    test.cache.lists[0].resolve(listed(entryFor(IDENTITY)));
    await flush();
    return test;
  }

  it('restores the offered entry with the package budget and holds it as saved, timing the restore', async () => {
    const { holder, cache, clock } = await offering();
    clock.time = 10;
    expect(holder.restore()).toBe(true);
    expect(holder.restore()).toBe(false);
    expect(holder.getSnapshot().restore).toEqual({ status: 'restoring' });
    expect(cache.restores).toEqual([expect.objectContaining({ key: cacheKeyOf(IDENTITY), limits: SYNTHETIC_PROFILE.limits })]);
    clock.time = 35;
    cache.restores[0].result.resolve(restored(allGroups()));
    await flush();
    const snapshot = holder.getSnapshot();
    expect(snapshot.restore).toEqual({ status: 'idle' });
    expect(snapshot.package).toMatchObject({ generation: 1, origin: 'cache', cache: { status: 'saved', via: 'restore', durationMs: 25 } });
    expect(snapshot.package!.groups).toEqual(CLASSIC_P2_SLICE.groups.map(group => expect.objectContaining({ group, status: 'complete' })));
    expect(resourceStatuses(snapshot)).toEqual(['complete-viewable', 'saved']);
    expect(holder.current()!.groups.map(({ group }) => group)).toEqual(CLASSIC_P2_SLICE.groups);
    // A package from the cache is never committed again on its own.
    expect(cache.commits).toEqual([]);
  });

  it('offers no restore while a package is held, saving or partial', async () => {
    for (const groups of [allGroups(), allGroups().slice(1)]) {
      const { holder, cache } = await offering();
      holder.acceptImport(finishedJob(groups));
      expect(holder.restore()).toBe(false);
      expect(cache.restores).toEqual([]);
    }
  });

  it('commits a restored package again only once a listing no longer shows it', async () => {
    const { holder, cache } = await offering();
    holder.restore();
    cache.restores[0].result.resolve(restored(allGroups()));
    await flush();
    expect(holder.save()).toBe(false);
    holder.relist();
    cache.lists[1].resolve(listed());
    await flush();
    expect(holder.getSnapshot().package).toMatchObject({ origin: 'cache', cache: { status: 'not-saved', failure: { code: 'not-found' } } });
    expect(holder.save()).toBe(true);
    expect(cache.commits).toHaveLength(1);
    expect(cache.commits[0].inputs).toBe(holder.current()!.groups);
  });

  it('offers no restore without a listed entry', async () => {
    const { holder, cache } = testHolder();
    expect(holder.restore()).toBe(false);
    cache.lists[0].resolve(listed());
    await flush();
    expect(holder.restore()).toBe(false);
    expect(cache.restores).toEqual([]);
  });

  const restoreCodes: ResourceCacheFailureCode[] = ['not-found', 'cache-corrupt', 'cache-incompatible', 'over-budget', 'read-failed', 'storage-unavailable', 'storage-newer-version', 'storage-closed', 'invalid-request'];

  it.each(restoreCodes)('holds nothing when the restore fails with %s, timing it, and may be retried', async (code) => {
    const { holder, cache, clock } = await offering();
    holder.restore();
    clock.time = 3;
    cache.restores[0].result.resolve(failed(code));
    await flush();
    expect(holder.getSnapshot()).toEqual({ package: null, catalog: expect.anything(), restore: { status: 'failed', failure: failed(code), durationMs: 3 } });
    expect(holder.current()).toBeNull();
    expect(holder.restore()).toBe(true);
  });

  it('refuses a restored package of another identity as cache-incompatible', async () => {
    const { holder, cache } = await offering();
    holder.restore();
    const other = syntheticPackage();
    cache.restores[0].result.resolve(restored(other));
    await flush();
    expect(holder.getSnapshot()).toMatchObject({ package: null, restore: { status: 'failed', failure: { code: 'cache-incompatible', location: 'identity' } } });
  });

  it('refuses a restored package that does not revalidate as cache-corrupt', async () => {
    const { holder, cache } = await offering();
    holder.restore();
    const result = restored(allGroups());
    cache.restores[0].result.resolve({ ...result, groups: result.status === 'restored' ? result.groups.slice(1) : [] } as typeof result);
    await flush();
    expect(holder.getSnapshot()).toMatchObject({ package: null, restore: { status: 'failed', failure: { code: 'cache-corrupt', location: 'groups' } } });
  });

  it('reports an unexpected restore rejection as read-failed', async () => {
    const { holder, cache, reportError } = await offering();
    holder.restore();
    const bug = new Error('bug');
    cache.restores[0].result.reject(bug);
    await flush();
    expect(holder.getSnapshot().restore).toMatchObject({ status: 'failed', failure: { code: 'read-failed', location: 'restore' } });
    expect(reportError).toHaveBeenCalledWith(bug);
  });
});

describe('generations', () => {
  it.each([
    ['restored', () => restored(allGroups())],
    ['failed', () => failed('read-failed')],
  ])('ends a restore an import replaced at once and drops its late %s result silently', async (_name, outcome) => {
    const { holder, cache } = testHolder();
    cache.lists[0].resolve(listed(entryFor(IDENTITY)));
    await flush();
    holder.restore();
    holder.acceptImport(finishedJob(allGroups()));
    const imported = holder.current();
    const snapshot = holder.getSnapshot();
    expect(snapshot).toMatchObject({ package: { generation: 1, origin: 'import' }, restore: { status: 'idle' } });
    const listener = vi.fn();
    holder.subscribe(listener);
    cache.restores[0].result.resolve(outcome());
    await flush();
    expect(listener).not.toHaveBeenCalled();
    expect(holder.getSnapshot()).toBe(snapshot);
    expect(holder.current()).toBe(imported);
  });

  it('drops a listing begun before a replacement and lists the new package afresh', async () => {
    const { holder, cache } = testHolder();
    cache.lists[0].resolve(listed());
    await flush();
    holder.relist();
    holder.acceptImport(finishedJob(allGroups()));
    cache.lists[1].resolve(listed(entryFor(IDENTITY)));
    await flush();
    expect(holder.getSnapshot().catalog).toEqual({ status: 'checking' });
    expect(cache.lists).toHaveLength(3);
    cache.lists[2].resolve(listed(entryFor(IDENTITY)));
    await flush();
    expect(holder.getSnapshot().catalog).toEqual({ status: 'listed', restorable: entryFor(IDENTITY) });
  });

  it.each([
    ['cancelled before its transaction', () => failed('cancelled')],
    ['failed after an abort', () => failed('write-failed')],
    ['committed anyway', () => committed(allGroups())],
  ])('keeps the new package state when the replaced package commit ends %s', async (_name, outcome) => {
    const { holder, cache } = await committing();
    const old = cache.commits[0];
    holder.acceptImport(finishedJob(allGroups()));
    expect(old.signal.aborted).toBe(true);
    expect(cache.commits[1].signal.aborted).toBe(false);
    const snapshot = holder.getSnapshot();
    const listener = vi.fn();
    holder.subscribe(listener);
    old.result.resolve(outcome());
    await flush();
    expect(listener).not.toHaveBeenCalled();
    expect(holder.getSnapshot()).toBe(snapshot);
    expect(snapshot.package).toMatchObject({ generation: 2, cache: { status: 'saving' } });
    cache.commits[1].result.resolve(failed('quota-exceeded'));
    await flush();
    expect(holder.getSnapshot().package!.cache).toEqual({ status: 'not-saved', failure: failed('quota-exceeded'), durationMs: 0 });
  });

  it('still aborts the current commit on dispose after a replaced commit ended', async () => {
    const { holder, cache } = await committing();
    holder.acceptImport(finishedJob(allGroups()));
    cache.commits[0].result.resolve(committed(allGroups()));
    await flush();
    holder.dispose();
    expect(cache.commits[1].signal.aborted).toBe(true);
  });

  it('shows a saved package whose key is no longer listed as in memory only, still held and saveable', async () => {
    const { holder, cache } = await committing();
    cache.commits[0].result.resolve(committed(allGroups()));
    await flush();
    const held = holder.current();
    holder.relist();
    cache.lists[1].resolve(listed(entryFor(IDENTITY)));
    await flush();
    expect(holder.getSnapshot().package!.cache).toMatchObject({ status: 'saved' });
    holder.relist();
    cache.lists[2].resolve(listed());
    await flush();
    expect(holder.getSnapshot().package!.cache).toEqual({ status: 'not-saved', failure: cacheFailure('not-found', 'key'), durationMs: null });
    expect(resourceStatuses(holder.getSnapshot())).toEqual(['complete-viewable', 'memory-only']);
    expect(holder.current()).toBe(held);
    expect(holder.save()).toBe(true);
  });

  it('never lets a listing begun before the commit completed mark the saved package as lost', async () => {
    const { holder, cache } = await committing();
    holder.relist();
    cache.commits[0].result.resolve(committed(allGroups()));
    await flush();
    cache.lists[1].resolve(listed());
    await flush();
    expect(holder.getSnapshot().package!.cache).toMatchObject({ status: 'saved' });
  });

  it('aborts the commit on dispose and ignores every later result without notifying', async () => {
    const { holder, cache } = await committing();
    holder.relist();
    const listener = vi.fn();
    holder.subscribe(listener);
    const snapshot = holder.getSnapshot();
    holder.dispose();
    expect(cache.commits[0].signal.aborted).toBe(true);
    cache.commits[0].result.resolve(committed(allGroups()));
    cache.lists[1].resolve(listed(entryFor(IDENTITY)));
    await flush();
    expect(listener).not.toHaveBeenCalled();
    expect(holder.getSnapshot()).toEqual({ ...snapshot, package: null });
    expect(holder.restore()).toBe(false);
    expect(holder.save()).toBe(false);
    holder.relist();
    expect(cache.lists).toHaveLength(2);
  });

  it('ignores a restore that completes after dispose', async () => {
    const { holder, cache } = testHolder();
    cache.lists[0].resolve(listed(entryFor(IDENTITY)));
    await flush();
    holder.restore();
    holder.dispose();
    cache.restores[0].result.resolve(restored(allGroups()));
    await flush();
    expect(holder.current()).toBeNull();
    expect(holder.getSnapshot().package).toBeNull();
  });
});

