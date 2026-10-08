import type { Page } from '@playwright/test';
import type { HeldGroup } from '../../src/app/resources/resource-holder.ts';
import { validatePackage, type GroupInput } from '../../src/content/completeness.ts';
import type { ContentIdentity } from '../../src/content/content-identity.ts';
import { applyManifestIdentity } from '../../src/content/manifest-identity.ts';
import { CLASSIC_P2_SLICE } from '../../src/content/slice-definition.ts';
import { packageRecordKey, payloadRecordKey } from '../../src/platform/storage/resource-cache-contract.ts';
import {
  buildPackageRecord, buildStoredPayload, chargeDeclaredBudget, readGroupInputs, RESOURCE_CACHE_DATABASE,
} from '../../src/platform/storage/resource-cache-records.ts';
import { PRODUCTION_PACKAGE } from '../../src/workers/production-package.ts';
import { modelsPackage } from './viewer-observations.ts';

/** The package a seed stored: its groups under the production identity, in slice definition order. */
export interface SeededPackage {
  readonly identity: ContentIdentity;
  readonly groups: readonly GroupInput[];
}

/**
 * Seeds only an isolated test context with converted synthetic content under the production identity: the `models`
 * package, or `converted`, such as the canary package (P2-12 S-06). The manifest identity is derived anew for the
 * production basis; payloads are unchanged. Record builders run in Node; the page creates the stored ArrayBuffers. No
 * test modules or alternate app entry are served by preview. Resolves to what it stored.
 */
export async function seedProductionCache(page: Page, converted?: readonly HeldGroup[]): Promise<SeededPackage> {
  const inputs = readGroupInputs(converted ?? await modelsPackage(), 'invalid-request');
  const { schemaVersion, sliceId, sliceDefinitionVersion } = inputs[0].manifest.identity;
  const groups = applyManifestIdentity({
    schemaVersion, sliceId, sliceDefinitionVersion,
    converterVersion: PRODUCTION_PACKAGE.converterVersion,
    origin: { type: 'original-import', sourceFingerprint: PRODUCTION_PACKAGE.sourceFingerprint },
  }, inputs.map(({ manifest, payloads, sources }) => ({
    group: manifest.group, assets: manifest.assets, payloads,
    sources: sources && { ...sources, sourceFingerprint: PRODUCTION_PACKAGE.sourceFingerprint },
  })));
  chargeDeclaredBudget(PRODUCTION_PACKAGE.limits, groups, 'groups');
  const completeness = validatePackage(CLASSIC_P2_SLICE, groups);
  if (completeness.status !== 'complete') throw new Error('The seeded package must be complete');
  const record = buildPackageRecord(groups);
  await page.evaluate(async ({ database, record, key, payloads }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(database.name, database.version);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(database.packageStore);
        request.result.createObjectStore(database.payloadStore);
      };
      request.onerror = () => { reject(request.error); };
      request.onblocked = () => { reject(new Error('Synthetic cache database open was blocked')); };
      request.onsuccess = () => { resolve(request.result); };
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([database.packageStore, database.payloadStore], 'readwrite');
        transaction.oncomplete = () => { resolve(); };
        transaction.onabort = () => { reject(transaction.error ?? new Error('Synthetic cache transaction aborted')); };
        transaction.objectStore(database.packageStore).add(record, key);
        const store = transaction.objectStore(database.payloadStore);
        for (const { key, schemaVersion, bytes } of payloads) {
          store.add({ schemaVersion, bytes: new Uint8Array(bytes).buffer }, key);
        }
      });
    } finally {
      db.close();
    }
  }, {
    database: RESOURCE_CACHE_DATABASE,
    record,
    key: packageRecordKey(record.key),
    payloads: groups.flatMap(({ payloads }) => payloads.map(payload => {
      const stored = buildStoredPayload(payload);
      return { key: payloadRecordKey(record.key, payload.id), schemaVersion: stored.schemaVersion, bytes: [...new Uint8Array(stored.bytes)] };
    })),
  });
  return Object.freeze({ identity: completeness.identity, groups });
}
