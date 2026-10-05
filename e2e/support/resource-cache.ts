import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, type BrowserContext, type Page } from '@playwright/test';
import type * as BudgetModule from '../../src/content/budget.ts';
import type * as CompletenessModule from '../../src/content/completeness.ts';
import type * as OwnershipModule from '../../src/content/ownership.ts';
import type * as SliceModule from '../../src/content/slice-definition.ts';
import type * as SyntheticModule from '../../src/content/synthetic-content.test-support.ts';
import type * as CacheModule from '../../src/platform/storage/browser-resource-cache.ts';
import type * as RecordsModule from '../../src/platform/storage/resource-cache-records.ts';
import { collectBrowserErrors } from './browser-test.ts';
import { installedBrowser } from './environment.ts';

// Test-side support for the P2-10 resource cache. The page imports the real modules from the development server; the
// probe only observes native IndexedDB calls and the record reader is read-only. Nothing here enters the website.

type GroupInput = ReturnType<typeof SyntheticModule.syntheticGroup>;

export interface PackageOptions {
  /** `synthetic` uses the fixture ID; anything else is an original-import source fingerprint. */
  readonly origin?: 'synthetic' | `source:${string}`;
  readonly converterVersion?: string;
  /** Prefix of every payload, so packages are distinguishable by their bytes. */
  readonly tag?: string;
  /** Adds a non-required image Asset to the models group. */
  readonly extraAsset?: boolean;
  /** Bytes of every models payload, to make a write transaction long enough to observe. */
  readonly modelBytes?: number;
}

export interface CacheModules {
  readonly cache: typeof CacheModule;
  readonly records: typeof RecordsModule;
  readonly completeness: typeof CompletenessModule;
  readonly slice: typeof SliceModule;
  readonly ownership: typeof OwnershipModule;
  /** Four complete group inputs built from the synthetic content assets. */
  buildPackage(options?: PackageOptions): GroupInput[];
  /** Every budget dimension at a generous limit, with overrides. */
  limits(overrides?: Record<string, number>): Record<string, number>;
  /** Payload bytes as an ID-ordered list of plain number arrays, for comparison outside the page. */
  payloadBytes(groups: readonly { payloads: readonly { id: string; bytes: Uint8Array }[] }[]): [string, number[]][];
}

export interface ProbeEvent {
  readonly kind: 'transaction' | 'complete' | 'abort' | 'write' | 'abort-call';
  readonly mode?: IDBTransactionMode;
  readonly store?: string;
  readonly threw?: string;
}

interface IdbProbe {
  readonly events: ProbeEvent[];
  /** Runs synchronously after each write request is issued; the request itself is unchanged. */
  afterWrite: (() => void) | null;
  reset(): void;
}

declare global {
  interface Window {
    osrCache: CacheModules;
    osrIdbProbe: IdbProbe;
  }
}

/** Opens the development page and installs the cache modules and synthetic package builders on `window.osrCache`. */
export async function loadCacheModules(page: Page): Promise<void> {
  if (page.url() === 'about:blank') await page.goto('/');
  await page.evaluate(async () => {
    const load = <T>(path: string): Promise<T> => import(path) as Promise<T>;
    const [cache, records, completeness, slice, ownership, synthetic, budget] = await Promise.all([
      load<typeof CacheModule>('/src/platform/storage/browser-resource-cache.ts'),
      load<typeof RecordsModule>('/src/platform/storage/resource-cache-records.ts'),
      load<typeof CompletenessModule>('/src/content/completeness.ts'),
      load<typeof SliceModule>('/src/content/slice-definition.ts'),
      load<typeof OwnershipModule>('/src/content/ownership.ts'),
      load<typeof SyntheticModule>('/src/content/synthetic-content.test-support.ts'),
      load<typeof BudgetModule>('/src/content/budget.ts'),
    ]);
    const ascii = (text: string): Uint8Array => Uint8Array.from(text, character => character.charCodeAt(0));
    window.osrCache = {
      cache, records, completeness, slice, ownership,
      buildPackage({ origin = 'synthetic', converterVersion = 'synthetic-converter.1', tag = 'payload', extraAsset = false, modelBytes } = {}) {
        const identity = { converterVersion, ...(origin === 'synthetic' ? {} : { origin: { type: 'original-import', sourceFingerprint: origin } }) };
        return slice.CLASSIC_P2_SLICE.groups.map(group => {
          const specs = [...synthetic.SYNTHETIC_ASSETS[group], ...(extraAsset && group === 'models' ? [{ id: 'image/synthetic-extra', role: 'model-texture' }] : [])]
            .map(spec => ({
              ...spec,
              bytes: modelBytes !== undefined && group === 'models'
                ? Uint8Array.from({ length: modelBytes }, (_, index) => (index * 31 + spec.id.length) % 256)
                : ascii(`${tag}:${spec.id}`),
            }))
            .sort((left, right) => (left.id < right.id ? -1 : 1));
          const input = synthetic.syntheticGroup(group, specs, identity);
          if (origin !== 'synthetic') {
            input.sources = { sourceFingerprint: origin, states: specs.map(({ id }) => ({ id, state: 'verified', unknowns: [] })) };
          }
          return input;
        });
      },
      limits: overrides => ({ ...Object.fromEntries(budget.BUDGET_DIMENSIONS.map(dimension => [dimension, 1_000_000_000])), ...overrides }),
      payloadBytes: groups => groups.flatMap(({ payloads }) => payloads.map(({ id, bytes }): [string, number[]] => [id, [...bytes]]))
        .sort(([left], [right]) => (left < right ? -1 : 1)),
    };
  });
}

/** Wraps native IndexedDB methods to record transactions, write requests, abort calls and final events. */
export async function installIdbProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (window.osrIdbProbe) return;
    const events: ProbeEvent[] = [];
    const probe: IdbProbe = { events, afterWrite: null, reset: () => { events.length = 0; } };
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (this: IDBDatabase, ...args: Parameters<IDBDatabase['transaction']>) {
      const created = transaction.apply(this, args);
      events.push({ kind: 'transaction', mode: created.mode });
      created.addEventListener('complete', () => events.push({ kind: 'complete', mode: created.mode }));
      created.addEventListener('abort', () => events.push({ kind: 'abort', mode: created.mode }));
      return created;
    };
    for (const method of ['put', 'delete'] as const) {
      const original = IDBObjectStore.prototype[method] as (...args: unknown[]) => IDBRequest;
      (IDBObjectStore.prototype[method] as unknown) = function (this: IDBObjectStore, ...args: unknown[]) {
        const request = original.apply(this, args);
        events.push({ kind: 'write', store: this.name });
        probe.afterWrite?.();
        return request;
      };
    }
    const abort = IDBTransaction.prototype.abort;
    IDBTransaction.prototype.abort = function (this: IDBTransaction) {
      try {
        abort.call(this);
        events.push({ kind: 'abort-call' });
      } catch (error) {
        events.push({ kind: 'abort-call', threw: error instanceof DOMException ? error.name : 'unknown' });
        throw error;
      }
    };
    window.osrIdbProbe = probe;
  });
}

/** Stored records with their IndexedDB array keys; package values as JSON, payload bytes as length and digest. */
export interface StoredRecords {
  readonly packages: { key: unknown[]; value: string }[];
  readonly payloads: { key: unknown[]; schemaVersion: unknown; byteLength: number; digest: string }[];
}

/**
 * Reads every record through a separate read-only connection, using the adapter's exported constants. It opens the
 * database only if the page already lists it, so it never creates or upgrades one.
 */
export async function readStoredRecords(page: Page): Promise<StoredRecords> {
  return page.evaluate(async () => {
    const { name, packageStore, payloadStore } = window.osrCache.records.RESOURCE_CACHE_DATABASE;
    if (!(await indexedDB.databases()).some(database => database.name === name)) return { packages: [], payloads: [] };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const all = (store: string) => new Promise<{ keys: IDBValidKey[]; values: unknown[] }>((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const keys = tx.objectStore(store).getAllKeys();
        const values = tx.objectStore(store).getAll();
        tx.oncomplete = () => resolve({ keys: keys.result, values: values.result });
        tx.onabort = () => reject(tx.error);
      });
      const digest = (bytes: Uint8Array): string => {
        let hash = 0x811c9dc5;
        for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
        return hash.toString(16);
      };
      const packages = await all(packageStore);
      const payloads = await all(payloadStore);
      return {
        packages: packages.keys.map((key, index) => ({ key: key as unknown[], value: JSON.stringify(packages.values[index]) })),
        payloads: payloads.keys.map((key, index) => {
          const value = payloads.values[index] as { schemaVersion?: unknown; bytes?: unknown };
          const bytes = value.bytes instanceof ArrayBuffer ? new Uint8Array(value.bytes) : new Uint8Array(0);
          return { key: key as unknown[], schemaVersion: value.schemaVersion, byteLength: bytes.byteLength, digest: digest(bytes) };
        }),
      };
    } finally {
      db.close();
    }
  });
}

/** Records every request the page issues while `run` executes. */
export async function requestsDuring<T>(page: Page, run: () => Promise<T>): Promise<{ result: T; requests: string[] }> {
  const requests: string[] = [];
  const record = (request: { url(): string; method(): string }) => { requests.push(`${request.method()} ${request.url()}`); };
  page.on('request', record);
  try {
    return { result: await run(), requests };
  } finally {
    page.off('request', record);
  }
}

/**
 * Runs `use` with a test-owned persistent Chrome profile in a fresh temporary directory, so IndexedDB data is on disk
 * and survives reloads and relaunches. Every launched context is closed and the directory deleted afterwards.
 */
export async function withPersistentProfile<T>(baseURL: string, use: (launch: () => Promise<Page>) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'osr-p2-10-profile-'));
  const contexts: BrowserContext[] = [];
  const errors: string[][] = [];
  try {
    return await use(async () => {
      const context = await chromium.launchPersistentContext(directory, { ...installedBrowser(), baseURL });
      contexts.push(context);
      const page = context.pages()[0] ?? await context.newPage();
      errors.push(collectBrowserErrors(page).errors);
      return page;
    });
  } finally {
    await Promise.all(contexts.map(context => context.close().catch(() => undefined)));
    await rm(directory, { recursive: true, force: true });
    expect(errors.flat(), 'Unexpected browser errors in the persistent profile').toEqual([]);
  }
}
