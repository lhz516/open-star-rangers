import { test, expect } from './support/browser-test.ts';
import type { ResourceCache } from '../src/platform/storage/browser-resource-cache.ts';
import {
  clearOriginIndexedDb, installIdbProbe, loadCacheModules, readStoredRecords, requestsDuring, withPersistentProfile, withQuotaOverride,
  type StoredRecords,
} from './support/resource-cache.ts';

// P2-10 resource cache in real Chrome IndexedDB, with code-generated synthetic packages only. Ordinary cases use the
// runner's isolated context; reload cases use a test-owned temporary persistent profile so data reaches disk.

declare global {
  interface Window {
    osrCacheSubject: ResourceCache;
    /** A large package built once and committed more than once; commits copy their inputs. */
    osrCacheLarge: unknown;
    /** A commit left running while the test acts from outside the page. */
    osrCachePending?: ReturnType<ResourceCache['commit']>;
  }
}

// Each second value extends the first, so a range that matched by text prefix instead of key components would leak.
const F1 = 'source:synthetic-disc-one';
const F2 = 'source:synthetic-disc-one.b';
const V1 = 'synthetic-converter.1';
const V2 = 'synthetic-converter.10';

/** The records of one original-import key, matched by whole key components. */
const recordsOf = (records: StoredRecords, originToken: string, converterVersion: string): StoredRecords => {
  const ofKey = ({ key }: { key: unknown[] }) => key[0] === 'original-import' && key[1] === originToken && key[2] === converterVersion;
  return { packages: records.packages.filter(ofKey), payloads: records.payloads.filter(ofKey) };
};
/** Payload tags restored for the three keys, with the given tag for [F1, V1]. */
const expectedTags = (f1v1: string) => ({ [`${F1}|${V1}`]: [f1v1], [`${F1}|${V2}`]: ['a12'], [`${F2}|${V1}`]: ['a21'] });
const hasExtraAsset = (records: StoredRecords) => records.payloads.some(({ key }) => key[3] === 'image/synthetic-extra');

test('rejects incomplete, over-budget and malformed commits without opening a write transaction', async ({ page }) => {
  await loadCacheModules(page);
  await installIdbProbe(page);
  const seeded = await page.evaluate(async () => {
    const { cache, buildPackage, limits } = window.osrCache;
    window.osrCacheSubject = cache.createResourceCache();
    const result = await window.osrCacheSubject.commit(buildPackage({ origin: 'source:synthetic-disc', tag: 'seed' }), limits());
    // Copied as the commit resolves, before any later storage operation can finish the transaction.
    return { result, events: window.osrIdbProbe.events.map(event => ({ ...event })) };
  });
  expect(seeded.result).toMatchObject({ status: 'committed' });
  expect(seeded.events).toContainEqual({ kind: 'complete', mode: 'readwrite' });
  const before = await readStoredRecords(page);
  expect(before.packages).toHaveLength(1);
  await page.evaluate(() => window.osrIdbProbe.reset());

  const results = await page.evaluate(async () => {
    const { buildPackage, limits } = window.osrCache;
    const subject = window.osrCacheSubject;
    const original = () => buildPackage({ origin: 'source:synthetic-disc', tag: 'next' });
    const totals = (() => {
      const manifests = original().map(({ manifest }) => manifest);
      const assets = manifests.flatMap(({ assets }) => assets);
      return {
        assets: assets.length,
        dependencyEdges: assets.reduce((sum, { dependencies }) => sum + dependencies.length, 0),
        payloadBytes: assets.reduce((sum, { payloadIdentity }) => sum + payloadIdentity.byteLength, 0),
      };
    })();
    const changed = (change: (groups: ReturnType<typeof original>) => void) => { const groups = original(); change(groups); return groups; };
    const cases: [string, unknown, unknown][] = [
      ['missing group', original().slice(1), limits()],
      ['duplicate group', [...original(), original()[3]], limits()],
      ['same-length payload change', changed(groups => {
        const [payload] = groups[1].payloads;
        payload.bytes = payload.bytes.map((byte, index) => (index === 0 ? byte ^ 1 : byte));
      }), limits()],
      ['payload length change', changed(groups => {
        const [payload] = groups[1].payloads;
        payload.bytes = Uint8Array.from([...payload.bytes, 0]);
      }), limits()],
      ['unverified source', changed(groups => { groups[2].sources!.states[0].state = 'unverified'; }), limits()],
      ['source fingerprint mismatch', changed(groups => { groups[2].sources!.sourceFingerprint = 'source:synthetic-other'; }), limits()],
      ['identity mismatch', changed(groups => { groups[0].manifest.identity.manifestIdentity = 'manifest:other'; }), limits()],
      ['assets over budget', original(), limits({ assets: totals.assets - 1 })],
      ['dependency edges over budget', original(), limits({ dependencyEdges: totals.dependencyEdges - 1 })],
      ['payload bytes over budget', original(), limits({ payloadBytes: totals.payloadBytes - 1 })],
      ['malformed limits', original(), (() => { const malformed: Record<string, number> = limits(); delete malformed.assets; return malformed; })()],
    ];
    const outcomes: Record<string, unknown> = {};
    for (const [name, inputs, budget] of cases) {
      const result = await subject.commit(inputs, budget);
      outcomes[name] = result.status === 'failed'
        ? { code: result.code, diagnostics: [...new Set(result.diagnostics.map(({ code }) => code))], budget: result.budget.map(({ dimension }) => dimension) }
        : result.status;
    }
    return outcomes;
  });

  expect(results).toEqual({
    'missing group': { code: 'package-incomplete', diagnostics: ['group-missing'], budget: [] },
    'duplicate group': { code: 'package-incomplete', diagnostics: ['group-duplicate'], budget: [] },
    'same-length payload change': { code: 'package-incomplete', diagnostics: ['payload-mismatch'], budget: [] },
    'payload length change': { code: 'package-incomplete', diagnostics: ['payload-mismatch'], budget: [] },
    'unverified source': { code: 'package-incomplete', diagnostics: ['source-not-ready'], budget: [] },
    'source fingerprint mismatch': { code: 'package-incomplete', diagnostics: ['source-fingerprint-mismatch'], budget: [] },
    'identity mismatch': { code: 'package-incomplete', diagnostics: ['package-identity-mismatch'], budget: [] },
    'assets over budget': { code: 'over-budget', diagnostics: [], budget: ['assets'] },
    'dependency edges over budget': { code: 'over-budget', diagnostics: [], budget: ['dependencyEdges'] },
    'payload bytes over budget': { code: 'over-budget', diagnostics: [], budget: ['payloadBytes'] },
    'malformed limits': { code: 'invalid-request', diagnostics: ['missing-budget-dimension'], budget: [] },
  });
  expect(await readStoredRecords(page)).toEqual(before);
  const events = await page.evaluate(() => window.osrIdbProbe.events);
  expect(events.filter(({ kind, mode }) => kind === 'write' || mode === 'readwrite')).toEqual([]);
});

test('restores committed packages byte for byte after a reload of a persistent profile', async ({ baseURL }, testInfo) => {
  await withPersistentProfile(baseURL!, async launch => {
    const page = await launch();
    await loadCacheModules(page);
    const committed = await page.evaluate(async () => {
      const { cache, buildPackage, limits, payloadBytes } = window.osrCache;
      const subject = cache.createResourceCache();
      const packages = [buildPackage(), buildPackage({ origin: 'source:synthetic-disc', tag: 'original' })];
      const results = [];
      for (const groups of packages) results.push(await subject.commit(groups, limits()));
      subject.close();
      return {
        results,
        inputs: packages.map(groups => ({
          manifests: groups.map(({ manifest }) => manifest), sources: groups.map(({ sources }) => sources), bytes: payloadBytes(groups),
        })),
      };
    });
    expect(committed.results.map(({ status }) => status)).toEqual(['committed', 'committed']);

    await page.reload();
    await loadCacheModules(page);
    const keys = committed.results.map(result => (result.status === 'committed' ? result.key : null));
    const restored = await page.evaluate(async keys => {
      const { cache, completeness, slice, limits, payloadBytes } = window.osrCache;
      const subject = cache.createResourceCache();
      const listed = await subject.list();
      const packages = [];
      for (const key of keys) {
        const result = await subject.restore(key, limits());
        if (result.status !== 'restored') return { listed, failed: result };
        packages.push({
          origin: result.identity.origin.type,
          manifests: result.groups.map(({ manifest }) => manifest),
          sources: result.groups.map(({ sources }) => sources),
          bytes: payloadBytes(result.groups),
          validation: completeness.validatePackage(slice.CLASSIC_P2_SLICE, result.groups).status,
        });
      }
      subject.close();
      return { listed, packages };
    }, keys);

    expect(restored.listed).toMatchObject({ status: 'listed' });
    if (restored.listed.status !== 'listed') return;
    expect(restored.listed.entries.map(({ key, status }) => ({ key, status })))
      .toEqual(expect.arrayContaining(keys.map(key => ({ key, status: 'compatible' }))));
    expect(restored.listed.entries).toHaveLength(2);
    expect(restored).not.toHaveProperty('failed');
    expect(restored.packages!.map(({ origin }) => origin)).toEqual(['synthetic', 'original-import']);
    restored.packages!.forEach((restoredPackage, index) => {
      expect(restoredPackage.manifests).toEqual(committed.inputs[index].manifests);
      expect(restoredPackage.sources).toEqual(committed.inputs[index].sources);
      expect(restoredPackage.bytes).toEqual(committed.inputs[index].bytes);
      expect(restoredPackage.validation).toBe('complete');
    });
    const summary = committed.results.map(result => (result.status === 'committed' ? { key: result.key, payloadCount: result.payloadCount, payloadBytes: result.payloadBytes } : result));
    await testInfo.attach('restored-packages', { body: JSON.stringify(summary), contentType: 'application/json' });
  });
});

test('isolates fingerprints and converter versions and replaces one key as a whole', async ({ page }) => {
  await loadCacheModules(page);
  const tags = await page.evaluate(async ([F1, F2, V1, V2]) => {
    const { cache, buildPackage, limits } = window.osrCache;
    window.osrCacheSubject = cache.createResourceCache();
    const commits = [
      buildPackage({ origin: F1 as `source:${string}`, converterVersion: V1, tag: 'a11', extraAsset: true }),
      buildPackage({ origin: F1 as `source:${string}`, converterVersion: V2, tag: 'a12' }),
      buildPackage({ origin: F2 as `source:${string}`, converterVersion: V1, tag: 'a21' }),
    ];
    const statuses = [];
    for (const groups of commits) statuses.push((await window.osrCacheSubject.commit(groups, limits())).status);
    return statuses;
  }, [F1, F2, V1, V2]);
  expect(tags).toEqual(['committed', 'committed', 'committed']);

  const restoreTags = () => page.evaluate(async ([F1, F2, V1, V2]) => {
    const { limits } = window.osrCache;
    const keys: [string, string][] = [[F1, V1], [F1, V2], [F2, V1]];
    const tags: Record<string, string[] | string> = {};
    for (const [originToken, converterVersion] of keys) {
      const result = await window.osrCacheSubject.restore({ originType: 'original-import', originToken, converterVersion }, limits());
      tags[`${originToken}|${converterVersion}`] = result.status === 'restored'
        ? [...new Set(result.groups.flatMap(({ payloads }) => payloads.map(({ bytes }) => String.fromCharCode(...bytes).split(':')[0])))]
        : result.code;
    }
    return tags;
  }, [F1, F2, V1, V2]);

  expect(await restoreTags()).toEqual(expectedTags('a11'));
  const before = await readStoredRecords(page);
  expect(hasExtraAsset(recordsOf(before, F1, V1))).toBe(true);

  const replace = () => page.evaluate(async ([F1, V1]) => {
    const { buildPackage, limits } = window.osrCache;
    return (await window.osrCacheSubject.commit(buildPackage({ origin: F1 as `source:${string}`, converterVersion: V1, tag: 'b11' }), limits())).status;
  }, [F1, V1]);
  expect(await replace()).toBe('committed');
  const replaced = await readStoredRecords(page);
  expect(await restoreTags()).toEqual(expectedTags('b11'));
  expect(hasExtraAsset(recordsOf(replaced, F1, V1))).toBe(false);
  expect(recordsOf(replaced, F1, V1).packages).toHaveLength(1);
  for (const [token, version] of [[F1, V2], [F2, V1]]) expect(recordsOf(replaced, token, version)).toEqual(recordsOf(before, token, version));

  expect(await replace()).toBe('committed');
  expect(await readStoredRecords(page)).toEqual(replaced);
  expect(await restoreTags()).toEqual(expectedTags('b11'));
});

test('owns committed and restored payload bytes', async ({ page }) => {
  await loadCacheModules(page);
  const observed = await page.evaluate(async () => {
    const { cache, buildPackage, limits, ownership } = window.osrCache;
    const subject = cache.createResourceCache();
    const groups = buildPackage();
    const [first] = groups[1].payloads;
    const original = [...first.bytes];
    const shared = new Uint8Array(original.length + 16).fill(0xee);
    shared.set(first.bytes, 8);
    first.bytes = shared.subarray(8, 8 + original.length);
    const committed = await subject.commit(groups, limits());
    shared.fill(0);
    const restore = async () => {
      const result = await subject.restore({ originType: 'synthetic', originToken: 'p2-01-contracts', converterVersion: 'synthetic-converter.1' }, limits());
      if (result.status !== 'restored') throw new Error(result.code);
      return result;
    };
    const [one, two] = [await restore(), await restore()];
    const views = (result: typeof one) => result.groups.flatMap(({ payloads }) => payloads.map(({ bytes }) => bytes));
    let transferable = true;
    try {
      ownership.payloadTransferList(views(one));
      ownership.payloadTransferList(views(two));
    } catch {
      transferable = false;
    }
    const restoredFirst = one.groups[1].payloads.find(({ id }) => id === first.id)!;
    /** Every object and array below the result is frozen; typed arrays cannot be and own their buffers instead. */
    const deeplyFrozen = (value: unknown): boolean => {
      if (typeof value !== 'object' || value === null || ArrayBuffer.isView(value)) return true;
      return Object.isFrozen(value) && Object.values(value).every(deeplyFrozen);
    };
    const frozen = deeplyFrozen(one);
    const plain = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => (item instanceof Uint8Array ? [...item] : item));
    const clone = structuredClone(one);
    subject.close();
    return {
      committed: committed.status,
      restoredFirst: [...restoredFirst.bytes],
      original,
      callerBufferIntact: shared.buffer.byteLength === original.length + 16,
      transferable,
      shared: views(one).some(view => views(two).some(other => other.buffer === view.buffer)),
      frozen,
      cloned: plain(clone) === plain(one) && plain(one).includes('"sources"'),
      firstId: first.id,
    };
  });
  expect(observed).toMatchObject({ committed: 'committed', callerBufferIntact: true, transferable: true, shared: false, frozen: true, cloned: true });
  expect(observed.restoredFirst).toEqual(observed.original);
  const stored = await readStoredRecords(page);
  const record = stored.payloads.find(({ key }) => key[3] === observed.firstId);
  expect(record?.byteLength).toBe(observed.original.length);
});

test('issues no network request during cache operations', async ({ page, baseURL }) => {
  await loadCacheModules(page);
  const { result, requests } = await requestsDuring(page, () => page.evaluate(async () => {
    // A fresh development-module request proves the recorder observes this interval.
    const probePath = `/src/content/budget.ts?p2-10-capture=${Date.now()}`;
    await import(probePath);
    const { cache, buildPackage, limits } = window.osrCache;
    const subject = cache.createResourceCache();
    const committed = await subject.commit(buildPackage({ origin: 'source:synthetic-disc' }), limits());
    const listed = await subject.list();
    const restored = await subject.restore({ originType: 'original-import', originToken: 'source:synthetic-disc', converterVersion: 'synthetic-converter.1' }, limits());
    subject.close();
    return [committed.status, listed.status, restored.status];
  }));
  expect(result).toEqual(['committed', 'listed', 'restored']);
  expect(requests.some(request => request.includes('/src/content/budget.ts?p2-10-capture='))).toBe(true);
  const foreign = requests.filter(request => !request.startsWith(`GET ${new URL(baseURL!).origin}/`));
  expect(foreign).toEqual([]);
  expect(requests.filter(request => !/^GET \S+\/(?:src|node_modules|@vite|@id|@fs)\//.test(request))).toEqual([]);
});

const SYNTHETIC_KEY = { originType: 'synthetic', originToken: 'p2-01-contracts', converterVersion: 'synthetic-converter.1' } as const;
/** Eight incompressible 1 MiB model payloads under the synthetic key. */
const LARGE_PACKAGE = { tag: 'new', modelBytes: 1 << 20 } as const;

test('reports unavailable storage and unknown estimates without a memory fallback', async ({ page }) => {
  await loadCacheModules(page);
  const outcomes = await page.evaluate(async key => {
    const { cache, buildPackage, limits, records } = window.osrCache;
    const throwing = (name: string) => ({ open: () => { throw new DOMException('private host detail', name); } }) as unknown as IDBFactory;
    const factories: [string, IDBFactory | null][] = [['missing', null], ['SecurityError', throwing('SecurityError')], ['InvalidStateError', throwing('InvalidStateError')]];
    const operations: Record<string, string[]> = {};
    for (const [name, factory] of factories) {
      const subject = cache.createResourceCache({ indexedDB: factory });
      const results = [await subject.commit(buildPackage(), limits()), await subject.list(), await subject.restore(key, limits())];
      operations[name] = results.map(result => (result.status === 'failed' ? `${result.code}${JSON.stringify(result).includes('private') ? ':leaked' : ''}` : result.status));
    }
    const estimates: [string, Pick<StorageManager, 'estimate'> | null][] = [
      ['missing', null],
      ['rejected', { estimate: () => Promise.reject(new Error('private')) }],
      ['thrown', { estimate: () => { throw new Error('private'); } }],
      ['non-finite', { estimate: async () => ({ usage: Number.NaN, quota: 10 }) }],
    ];
    const capacity: Record<string, string> = {};
    for (const [name, storage] of estimates) capacity[name] = (await cache.createResourceCache({ storage }).checkCapacity(100)).status;
    const real = await cache.createResourceCache().checkCapacity(100);
    const databases = (await indexedDB.databases()).map(({ name }) => name);
    return { operations, capacity, real: real.status, created: databases.includes(records.RESOURCE_CACHE_DATABASE.name) };
  }, SYNTHETIC_KEY);
  const unavailable = ['storage-unavailable', 'storage-unavailable', 'storage-unavailable'];
  expect(outcomes.operations).toEqual({ missing: unavailable, SecurityError: unavailable, InvalidStateError: unavailable });
  expect(outcomes.capacity).toEqual({ missing: 'unknown', rejected: 'unknown', thrown: 'unknown', 'non-finite': 'unknown' });
  expect(outcomes.real).toBe('sufficient');
  expect(outcomes.created).toBe(false);
});

test('cancels before the write and while abortable, but not after the commit point', async ({ page }) => {
  await loadCacheModules(page);
  await installIdbProbe(page);
  await page.evaluate(async () => {
    const { cache, buildPackage, limits } = window.osrCache;
    window.osrCacheSubject = cache.createResourceCache();
    await window.osrCacheSubject.commit(buildPackage({ tag: 'old' }), limits());
  });
  const before = await readStoredRecords(page);

  const attempt = (when: 'before' | 'write' | 'complete' | 'resolved') => page.evaluate(async ({ when, key }) => {
    const { buildPackage, limits } = window.osrCache;
    const probe = window.osrIdbProbe;
    const controller = new AbortController();
    probe.reset();
    if (when === 'before') controller.abort();
    probe.onEvent = event => {
      const trigger = when === 'write' ? event.kind === 'write' : when === 'complete' && event.kind === 'complete' && event.mode === 'readwrite';
      if (trigger && !controller.signal.aborted) controller.abort();
    };
    const result = await window.osrCacheSubject.commit(buildPackage({ tag: 'new' }), limits(), { signal: controller.signal });
    probe.onEvent = null;
    if (when === 'resolved') controller.abort();
    const events = probe.events.map(event => ({ ...event }));
    const tag = window.osrCache.restoredTag(await window.osrCacheSubject.restore(key, limits()));
    return { status: result.status === 'failed' ? result.code : result.status, events, tag };
  }, { when, key: SYNTHETIC_KEY });

  const early = await attempt('before');
  expect(early).toMatchObject({ status: 'cancelled', tag: 'old' });
  expect(early.events.filter(({ mode, kind }) => mode === 'readwrite' || kind === 'write')).toEqual([]);
  expect(await readStoredRecords(page)).toEqual(before);

  const abortable = await attempt('write');
  expect(abortable).toMatchObject({ status: 'cancelled', tag: 'old' });
  expect(abortable.events.filter(({ kind }) => kind === 'write').length).toBeGreaterThan(0);
  expect(abortable.events).toContainEqual({ kind: 'abort-call' });
  expect(abortable.events).toContainEqual({ kind: 'abort', mode: 'readwrite' });
  expect(abortable.events).not.toContainEqual({ kind: 'complete', mode: 'readwrite' });
  expect(await readStoredRecords(page)).toEqual(before);

  const committing = await attempt('complete');
  expect(committing).toMatchObject({ status: 'committed', tag: 'new' });
  expect(committing.events).toContainEqual({ kind: 'abort-call', threw: 'InvalidStateError' });

  const resolved = await attempt('resolved');
  expect(resolved).toMatchObject({ status: 'committed', tag: 'new' });
  // The commit removed its abort listener, so a later abort reaches no transaction.
  expect(resolved.events.filter(({ kind }) => kind === 'abort-call')).toEqual([]);
});

test('reports a real quota error from Chrome and keeps the old package', async ({ baseURL }, testInfo) => {
  // Chrome 154 fixes an origin's IndexedDB quota at the session's first IndexedDB use, so the override takes effect
  // only in a new browser session: the old package is committed under the default quota in one, and the override is
  // set before the cache opens in the next, over a test-owned persistent profile.
  const origin = new URL(baseURL!).origin;
  await withPersistentProfile(baseURL!, async launch => {
    const first = await launch();
    await loadCacheModules(first);
    const seeded = await first.evaluate(async () => {
      const { cache, buildPackage, limits } = window.osrCache;
      const subject = cache.createResourceCache();
      const result = await subject.commit(buildPackage({ tag: 'old' }), limits());
      subject.close();
      return result.status;
    });
    expect(seeded).toBe('committed');
    // Read in this session: in the next one, any IndexedDB use before the override would fix the default quota.
    const before = await readStoredRecords(first);
    await first.context().close();

    const page = await launch();
    await loadCacheModules(page);
    await installIdbProbe(page);
    const need = await page.evaluate(async large => {
      window.osrCacheLarge = window.osrCache.buildPackage(large);
      const requirement = window.osrCache.cache.createResourceCache({ indexedDB: null }).measure(window.osrCacheLarge);
      if ('status' in requirement) throw new Error(requirement.code);
      return { requiredBytes: requirement.requiredBytes, estimate: await navigator.storage.estimate() };
    }, LARGE_PACKAGE);
    // Above the current usage and below the new package's requirement and each of its 1 MiB model payloads.
    const quotaSize = (need.estimate.usage ?? 0) + (1 << 19);
    const { overridden, result: limited } = await withQuotaOverride(page, origin, quotaSize, () => page.evaluate(async ({ requiredBytes, key }) => {
      const { cache, limits, restoredTag } = window.osrCache;
      window.osrCacheSubject = cache.createResourceCache();
      const capacity = await window.osrCacheSubject.checkCapacity(requiredBytes);
      const estimate = await navigator.storage.estimate();
      const result = await window.osrCacheSubject.commit(window.osrCacheLarge, limits());
      const tag = restoredTag(await window.osrCacheSubject.restore(key, limits()));
      return { capacity, estimate, status: result.status === 'failed' ? result.code : result.status, abort: window.osrIdbProbe.events.find(({ kind }) => kind === 'abort'), tag };
    }, { requiredBytes: need.requiredBytes, key: SYNTHETIC_KEY }));
    await testInfo.attach('quota-evidence', {
      body: JSON.stringify({ method: 'Storage.overrideQuotaForOrigin', quotaSize, cdpQuota: overridden, requiredBytes: need.requiredBytes, capacity: limited.capacity, estimate: limited.estimate, abort: limited.abort }),
      contentType: 'application/json',
    });
    expect(overridden).toMatchObject({ quota: quotaSize, overrideActive: true });
    expect(overridden.usage).toBeLessThan(quotaSize);
    expect(quotaSize).toBeLessThan(need.requiredBytes);
    expect(quotaSize - overridden.usage).toBeLessThan(1 << 20);
    // estimate() does not reflect the CDP override, so the advisory check equals the result the spec formula derives
    // from an independent estimate() reading, and cannot see the override.
    const usage = limited.estimate.usage ?? 0;
    const quota = limited.estimate.quota ?? 0;
    const availableBytes = Math.max(0, quota - usage);
    expect(limited.capacity).toEqual({
      status: availableBytes >= need.requiredBytes ? 'sufficient' : 'insufficient',
      requiredBytes: need.requiredBytes,
      availableBytes,
      usage,
      quota,
    });
    expect(limited.estimate.quota).toBeGreaterThan(quotaSize);
    expect(limited.status).toBe('quota-exceeded');
    expect(limited.abort).toEqual({ kind: 'abort', mode: 'readwrite', error: 'QuotaExceededError' });
    expect(limited.tag).toBe('old');
    expect(await readStoredRecords(page)).toEqual(before);

    const recovered = await page.evaluate(async key => {
      const { limits } = window.osrCache;
      const result = await window.osrCacheSubject.commit(window.osrCacheLarge, limits());
      const restored = await window.osrCacheSubject.restore(key, limits());
      window.osrCacheSubject.close();
      return { status: result.status, restored: restored.status };
    }, SYNTHETIC_KEY);
    expect(recovered).toEqual({ status: 'committed', restored: 'restored' });
  });
});

test('compares a requirement with the real storage estimate', async ({ page }) => {
  await loadCacheModules(page);
  const checks = await page.evaluate(async () => {
    const snapshot = await navigator.storage.estimate();
    const subject = window.osrCache.cache.createResourceCache({ storage: { estimate: async () => snapshot } });
    const available = Math.max(0, (snapshot.quota ?? 0) - (snapshot.usage ?? 0));
    const real = await window.osrCache.cache.createResourceCache().checkCapacity(0);
    return { exact: await subject.checkCapacity(available), over: await subject.checkCapacity(available + 1), real, snapshot, available };
  });
  const { usage, quota } = checks.snapshot;
  expect(checks.exact).toEqual({ status: 'sufficient', requiredBytes: checks.available, availableBytes: checks.available, usage, quota });
  expect(checks.over).toEqual({ status: 'insufficient', requiredBytes: checks.available + 1, availableBytes: checks.available, usage, quota });
  // The default adapter reads the same real estimate through navigator.storage.
  expect(checks.real).toMatchObject({ status: 'sufficient', requiredBytes: 0, quota });
});

test('lets another connection delete the database when the cache is idle or busy', async ({ page }) => {
  await loadCacheModules(page);
  await installIdbProbe(page);
  await page.evaluate(async () => {
    const { cache, buildPackage, limits } = window.osrCache;
    window.osrCacheSubject = cache.createResourceCache();
    await window.osrCacheSubject.commit(buildPackage({ tag: 'old' }), limits());
  });
  const idle = await page.evaluate(async key => {
    window.osrIdbProbe.reset();
    const steps = await window.osrCache.deleteDatabase();
    const versionchange = window.osrIdbProbe.events.some(({ kind }) => kind === 'versionchange');
    return { steps, versionchange, ...await window.osrCache.cacheState(window.osrCacheSubject, key) };
  }, SYNTHETIC_KEY);
  expect(idle).toEqual({ steps: ['success'], versionchange: true, listed: 0, restored: 'not-found' });

  const busy = await page.evaluate(async ({ key, large }) => {
    const { buildPackage, limits, statusOf } = window.osrCache;
    await window.osrCacheSubject.commit(buildPackage({ tag: 'old' }), limits());
    const probe = window.osrIdbProbe;
    probe.reset();
    let deletion: Promise<string[]> | undefined;
    probe.onEvent = event => {
      if (event.kind === 'write') deletion ??= window.osrCache.deleteDatabase();
    };
    const status = statusOf(await window.osrCacheSubject.commit(buildPackage(large), limits()));
    probe.onEvent = null;
    const steps = await deletion!;
    const versionchange = probe.events.some(({ kind }) => kind === 'versionchange');
    return { status, steps, versionchange, ...await window.osrCache.cacheState(window.osrCacheSubject, key) };
  }, { key: SYNTHETIC_KEY, large: LARGE_PACKAGE });
  // The commit already writing finishes first; the deletion may wait briefly as blocked, then succeeds.
  expect(busy).toMatchObject({ status: 'committed', versionchange: true, listed: 0, restored: 'not-found' });
  expect(busy.steps.at(-1)).toBe('success-after-commit');
  expect(busy.steps.filter(step => step !== 'blocked')).toHaveLength(1);
});

test('reports an origin cleared over CDP as missing, including during a write', async ({ page, baseURL }, testInfo) => {
  await loadCacheModules(page);
  await installIdbProbe(page);
  const origin = new URL(baseURL!).origin;
  const state = () => page.evaluate(key => window.osrCache.cacheState(window.osrCacheSubject, key), SYNTHETIC_KEY);

  await page.evaluate(async () => {
    const { cache, buildPackage, limits } = window.osrCache;
    window.osrCacheSubject = cache.createResourceCache();
    await window.osrCacheSubject.commit(buildPackage({ tag: 'old' }), limits());
    window.osrIdbProbe.reset();
  });
  await clearOriginIndexedDb(page, origin);
  expect(await state()).toEqual({ listed: 0, restored: 'not-found' });
  expect(await page.evaluate(() => window.osrIdbProbe.events.some(({ kind }) => kind === 'close'))).toBe(true);

  // The write transaction is held open after its first write request, so the clear lands before it can commit.
  const issued = page.waitForEvent('console', message => message.text() === 'osr-write-issued');
  await page.evaluate(async large => {
    const { buildPackage, limits } = window.osrCache;
    const probe = window.osrIdbProbe;
    await window.osrCacheSubject.commit(buildPackage({ tag: 'old' }), limits());
    probe.reset();
    probe.holdWrites = true;
    probe.onEvent = event => {
      if (event.kind !== 'write') return;
      probe.onEvent = null;
      console.log('osr-write-issued');
    };
    window.osrCachePending = window.osrCacheSubject.commit(buildPackage(large), limits());
  }, LARGE_PACKAGE);
  await issued;
  await clearOriginIndexedDb(page, origin);
  const during = await page.evaluate(async () => {
    const status = window.osrCache.statusOf(await window.osrCachePending!);
    window.osrIdbProbe.holdWrites = false;
    return { status, events: window.osrIdbProbe.events.filter(({ kind }) => kind !== 'transaction').map(({ kind, mode, error }) => [kind, mode, error].filter(Boolean).join(':')) };
  });
  await testInfo.attach('clear-during-write', { body: JSON.stringify(during), contentType: 'application/json' });
  expect(['storage-closed', 'write-failed']).toContain(during.status);
  expect(during.events).toContain('close');
  expect(await state()).toEqual({ listed: 0, restored: 'not-found' });
});

test('refuses a newer database version without upgrading, deleting or writing it', async ({ page }) => {
  await loadCacheModules(page);
  const observed = await page.evaluate(async key => {
    const { cache, buildPackage, limits, records, statusOf } = window.osrCache;
    const { name } = records.RESOURCE_CACHE_DATABASE;
    const open = (version?: number) => new Promise<IDBDatabase>((resolve, reject) => {
      const request = version === undefined ? indexedDB.open(name) : indexedDB.open(name, version);
      request.onupgradeneeded = () => { request.result.createObjectStore('future').put({ future: true }, 'k'); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    (await open(2)).close();
    const subject = cache.createResourceCache();
    const results = [await subject.commit(buildPackage(), limits()), await subject.list(), await subject.restore(key, limits())];
    const db = await open();
    const content = await new Promise(resolve => {
      const request = db.transaction('future', 'readonly').objectStore('future').get('k');
      request.onsuccess = () => resolve(request.result);
    });
    const after = { version: db.version, stores: [...db.objectStoreNames], content };
    db.close();
    return { codes: results.map(statusOf), after };
  }, SYNTHETIC_KEY);
  expect(observed.codes).toEqual(['storage-newer-version', 'storage-newer-version', 'storage-newer-version']);
  expect(observed.after).toEqual({ version: 2, stores: ['future'], content: { future: true } });
});

test('keeps the old package or the whole new one when the browser closes during a write', async ({ baseURL }, testInfo) => {
  const outcomes: { held: boolean; resultBeforeClose: boolean; tag: string; unchanged: boolean }[] = [];
  await withPersistentProfile(baseURL!, async launch => {
    let page = await launch();
    // A natural-timing attempt records whichever state Chrome reaches; a held attempt keeps the write transaction open
    // with read-only requests after its first write request, so the close always lands before it can commit.
    for (const held of [false, true]) {
      await loadCacheModules(page);
      await page.evaluate(async () => {
        const { cache, buildPackage, limits } = window.osrCache;
        const subject = cache.createResourceCache();
        await subject.commit(buildPackage({ tag: 'old' }), limits());
        subject.close();
      });
      const before = await readStoredRecords(page);
      await installIdbProbe(page);
      const messages: string[] = [];
      const record = (message: { text(): string }) => { messages.push(message.text()); };
      page.on('console', record);
      const issued = page.waitForEvent('console', message => message.text() === 'osr-write-issued');
      await page.evaluate(({ large, held }) => {
        const { cache, buildPackage, limits } = window.osrCache;
        const probe = window.osrIdbProbe;
        probe.holdWrites = held;
        probe.onEvent = event => {
          if (event.kind !== 'write') return;
          probe.onEvent = null;
          console.log('osr-write-issued');
        };
        void cache.createResourceCache().commit(buildPackage(large), limits()).then(result => console.log(`osr-commit-${result.status}`));
      }, { large: { tag: 'new', modelBytes: 4 << 20 }, held });
      await issued;
      // Taken before closing, so a result caused by the close itself is not mistaken for one that preceded it.
      const resultBeforeClose = messages.some(text => text.startsWith('osr-commit-'));
      page.off('console', record);
      await page.context().close();

      page = await launch();
      await loadCacheModules(page);
      const tag = await page.evaluate(async key => {
        const { cache, limits, restoredTag } = window.osrCache;
        const subject = cache.createResourceCache();
        const restored = restoredTag(await subject.restore(key, limits()));
        subject.close();
        return restored;
      }, SYNTHETIC_KEY);
      const after = await readStoredRecords(page);
      outcomes.push({ held, resultBeforeClose, tag, unchanged: JSON.stringify(after) === JSON.stringify(before) });
    }
  });
  await testInfo.attach('interruption-outcomes', { body: JSON.stringify(outcomes), contentType: 'application/json' });
  // Every reopen finds exactly the old package unchanged or the whole new one; never a mix or a damaged package.
  for (const { tag, unchanged } of outcomes) expect(tag === 'old' ? unchanged : tag === 'new').toBe(true);
  expect(outcomes.find(({ held }) => held)).toEqual({ held: true, resultBeforeClose: false, tag: 'old', unchanged: true });
});

const ORIGINAL_KEY = { originType: 'original-import', originToken: 'source:synthetic-disc', converterVersion: 'synthetic-converter.1' } as const;
type Corruption = 'missing field' | 'key mismatch' | 'count mismatch' | 'payload missing' | 'payload extra' | 'payload rewritten'
  | 'payload length' | 'source unverified' | 'unknown format' | 'format version 2' | 'content schema 2' | 'slice definition version 2';

test('refuses damaged or incompatible stored records without deleting or changing them', async ({ page }) => {
  await loadCacheModules(page);
  await page.evaluate(() => { window.osrCacheSubject = window.osrCache.cache.createResourceCache(); });
  // Each case commits a fresh original-import package (replacing the key), then rewrites real stored records.
  const corrupt = async (name: Corruption) => {
    const committed = await page.evaluate(async ({ name, key }) => {
      const { buildPackage, limits, records, statusOf } = window.osrCache;
      const status = statusOf(await window.osrCacheSubject.commit(buildPackage({ origin: 'source:synthetic-disc' }), limits()));
      const { name: database, packageStore, payloadStore } = records.RESOURCE_CACHE_DATABASE;
      const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open(database); request.onsuccess = () => resolve(request.result); });
      const tx = db.transaction([packageStore, payloadStore], 'readwrite');
      const packages = tx.objectStore(packageStore);
      const payloads = tx.objectStore(payloadStore);
      const packageKey = [key.originType, key.originToken, key.converterVersion];
      const first = [...packageKey, 'font/synthetic-hud'];
      /** The stored shapes this test rewrites; see resource-cache-records.ts. */
      interface StoredPackage {
        format: string; formatVersion: number; payloadCount: number; payloadBytes?: number; key: { converterVersion: string };
        groups: { manifest: { identity: Record<string, unknown> }; sources: { states: { state: string }[] } }[];
      }
      interface StoredPayload { bytes: ArrayBuffer }
      const update = <T>(store: IDBObjectStore, storeKey: IDBValidKey, change: (value: T) => unknown) => {
        const request = store.get(storeKey);
        request.onsuccess = () => store.put(change(request.result as T) ?? request.result, storeKey);
      };
      const updatePackage = (change: (record: StoredPackage) => unknown) => update(packages, packageKey, change);
      const updatePayload = (change: (value: StoredPayload) => unknown) => update(payloads, first, change);
      const everyGroup = (change: (identity: Record<string, unknown>) => void) => (record: StoredPackage) => {
        for (const group of record.groups) change(group.manifest.identity);
      };
      const changes: Record<Corruption, () => void> = {
        'missing field': () => updatePackage(record => { delete record.payloadBytes; }),
        'key mismatch': () => updatePackage(record => { record.key.converterVersion = 'synthetic-converter.9'; }),
        'count mismatch': () => updatePackage(record => { record.payloadCount += 1; }),
        'payload missing': () => payloads.delete(first),
        'payload extra': () => updatePayload(value => { payloads.put(value, [...packageKey, 'image/synthetic-unlisted']); }),
        'payload rewritten': () => updatePayload(value => { new Uint8Array(value.bytes)[0] ^= 1; }),
        'payload length': () => updatePayload(value => ({ ...value, bytes: new Uint8Array([...new Uint8Array(value.bytes), 0]).buffer })),
        'source unverified': () => updatePackage(record => { record.groups[2].sources.states[0].state = 'unverified'; }),
        'unknown format': () => updatePackage(record => { record.format = 'another-cache'; }),
        'format version 2': () => updatePackage(record => { record.formatVersion = 2; }),
        'content schema 2': () => updatePackage(everyGroup(identity => { identity.schemaVersion = 2; })),
        'slice definition version 2': () => updatePackage(everyGroup(identity => { identity.sliceDefinitionVersion = 2; })),
      };
      changes[name]();
      await new Promise(resolve => { tx.oncomplete = resolve; });
      db.close();
      return status;
    }, { name, key: ORIGINAL_KEY });
    expect(committed).toBe('committed');
    const before = await readStoredRecords(page, true);
    const observed = await page.evaluate(async key => {
      const { limits } = window.osrCache;
      const restored = await window.osrCacheSubject.restore(key, limits());
      const listed = await window.osrCacheSubject.list();
      return {
        restored: restored.status === 'failed'
          ? { code: restored.code, diagnostics: [...new Set(restored.diagnostics.map(({ code }) => code))] }
          : { code: restored.status, diagnostics: [] },
        listed: listed.status === 'listed' ? listed.entries.map(({ status }) => status) : listed.code,
      };
    }, ORIGINAL_KEY);
    expect(await readStoredRecords(page, true)).toEqual(before);
    return observed;
  };

  const expected: Record<Corruption, { code: string; listed: string; diagnostics: string[] }> = {
    'missing field': { code: 'cache-corrupt', listed: 'corrupt', diagnostics: ['invalid-record'] },
    'key mismatch': { code: 'cache-corrupt', listed: 'corrupt', diagnostics: [] },
    'count mismatch': { code: 'cache-corrupt', listed: 'corrupt', diagnostics: [] },
    'payload missing': { code: 'cache-corrupt', listed: 'compatible', diagnostics: [] },
    'payload extra': { code: 'cache-corrupt', listed: 'compatible', diagnostics: [] },
    'payload rewritten': { code: 'cache-corrupt', listed: 'compatible', diagnostics: ['payload-mismatch'] },
    'payload length': { code: 'cache-corrupt', listed: 'compatible', diagnostics: ['payload-mismatch'] },
    'source unverified': { code: 'cache-corrupt', listed: 'compatible', diagnostics: ['source-not-ready'] },
    'unknown format': { code: 'cache-incompatible', listed: 'incompatible', diagnostics: [] },
    'format version 2': { code: 'cache-incompatible', listed: 'incompatible', diagnostics: [] },
    'content schema 2': { code: 'cache-incompatible', listed: 'incompatible', diagnostics: ['unsupported-schema'] },
    'slice definition version 2': { code: 'cache-incompatible', listed: 'incompatible', diagnostics: [] },
  };
  for (const [name, { code, listed, diagnostics }] of Object.entries(expected) as [Corruption, typeof expected[Corruption]][]) {
    const observed = await corrupt(name);
    expect(observed.restored, name).toEqual({ code, diagnostics });
    expect(observed.listed, name).toEqual([listed]);
  }
});

test('rejects a restore over budget before reading any payload record', async ({ page }) => {
  await loadCacheModules(page);
  await installIdbProbe(page);
  const observed = await page.evaluate(async key => {
    const { cache, buildPackage, limits, records, statusOf } = window.osrCache;
    const subject = cache.createResourceCache();
    const groups = buildPackage({ origin: 'source:synthetic-disc' });
    await subject.commit(groups, limits());
    const declared = groups.flatMap(({ manifest }) => manifest.assets).reduce((sum, { payloadIdentity }) => sum + payloadIdentity.byteLength, 0);
    window.osrIdbProbe.reset();
    const result = await subject.restore(key, limits({ payloadBytes: declared - 1 }));
    const reads = window.osrIdbProbe.events.filter(({ kind }) => kind === 'read').map(({ store }) => store);
    const within = statusOf(await subject.restore(key, limits({ payloadBytes: declared })));
    subject.close();
    return {
      code: statusOf(result),
      budget: result.status === 'failed' ? result.budget.map(({ dimension }) => dimension) : [],
      reads,
      payloadStore: records.RESOURCE_CACHE_DATABASE.payloadStore,
      within,
    };
  }, ORIGINAL_KEY);
  expect(observed).toMatchObject({ code: 'over-budget', budget: ['payloadBytes'], within: 'restored' });
  expect(observed.reads.length).toBeGreaterThan(0);
  expect(observed.reads).not.toContain(observed.payloadStore);
});

test('never mixes packages when commits and restores of one key run concurrently', async ({ page }, testInfo) => {
  await loadCacheModules(page);
  await installIdbProbe(page);
  const observed = await page.evaluate(async key => {
    const { cache, buildPackage, limits, signature, statusOf } = window.osrCache;
    const [one, two] = [cache.createResourceCache(), cache.createResourceCache()];
    const probe = window.osrIdbProbe;
    const candidates = { aaa: buildPackage({ tag: 'aaa' }), bbb: buildPackage({ tag: 'bbb' }), old: buildPackage({ tag: 'old' }), new: buildPackage({ tag: 'new', modelBytes: 1 << 20 }) };
    /** Which whole candidate a restore equals, else its failure code or `mixed`. */
    const which = async () => {
      const restored = await one.restore(key, limits());
      if (restored.status !== 'restored') return restored.code;
      const found = Object.entries(candidates).find(([, groups]) => signature(groups) === signature(restored.groups));
      return found ? found[0] : 'mixed';
    };
    const commits: string[] = [];
    for (let round = 0; round < 4; round++) {
      const statuses = await Promise.all([one.commit(candidates.aaa, limits()), two.commit(candidates.bbb, limits())]);
      commits.push(`${statuses.map(statusOf).join('+')}=${await which()}`);
    }
    /** Restores on `one` just before and at the first write request of `two` committing the new package. */
    const restoreAroundCommit = async (seed: boolean) => {
      if (seed) await one.commit(candidates.old, limits());
      let during: Promise<string> | undefined;
      probe.onEvent = event => {
        if (event.kind === 'write') during ??= which();
      };
      const before = which();
      const status = statusOf(await two.commit(candidates.new, limits()));
      probe.onEvent = null;
      return { status, before: await before, during: await during! };
    };
    const replacing = await restoreAroundCommit(true);
    one.close();
    two.close();
    await new Promise(resolve => { indexedDB.deleteDatabase(window.osrCache.records.RESOURCE_CACHE_DATABASE.name).onsuccess = resolve; });
    const first = await restoreAroundCommit(false);
    return { commits, replacing, first };
  }, SYNTHETIC_KEY);
  await testInfo.attach('concurrency-outcomes', { body: JSON.stringify(observed), contentType: 'application/json' });
  for (const outcome of observed.commits) expect(outcome).toMatch(/^committed\+committed=(aaa|bbb)$/);
  expect(observed.replacing.status).toBe('committed');
  for (const restored of [observed.replacing.before, observed.replacing.during]) expect(['old', 'new']).toContain(restored);
  expect(observed.first.status).toBe('committed');
  for (const restored of [observed.first.before, observed.first.during]) expect(['not-found', 'new']).toContain(restored);
});
