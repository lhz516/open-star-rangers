import { test, expect } from './support/browser-test.ts';
import type { ResourceCache } from '../src/platform/storage/browser-resource-cache.ts';
import {
  installIdbProbe, loadCacheModules, readStoredRecords, requestsDuring, withPersistentProfile, type StoredRecords,
} from './support/resource-cache.ts';

// P2-10 resource cache in real Chrome IndexedDB, with code-generated synthetic packages only. Ordinary cases use the
// runner's isolated context; reload cases use a test-owned temporary persistent profile so data reaches disk.

declare global {
  interface Window { osrCacheSubject: ResourceCache }
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
