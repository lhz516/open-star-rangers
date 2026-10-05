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
  /** Bytes of every models payload, pseudo-random so on-disk compression cannot shrink them. */
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
  /** The `tag` of a restored package (read from its first logic payload), or the failure code. */
  restoredTag(result: Awaited<ReturnType<CacheModule.ResourceCache['restore']>>): string;
  /** A result's status, or its failure code. */
  statusOf(result: { status: string; code?: string }): string;
  /**
   * Every group's Asset IDs with a digest and length of each payload, in order: equal signatures mean the same whole
   * package, so a restore can be matched to exactly one committed candidate.
   */
  signature(groups: readonly { payloads: readonly { id: string; bytes: Uint8Array }[] }[]): string;
  /** How many packages the subject lists (or the failure code) and what restoring `key` yields. */
  cacheState(subject: CacheModule.ResourceCache, key: unknown): Promise<{ listed: number | string; restored: string }>;
  /** Deletes the cache database from another connection: `blocked` if reported, then whether success followed a commit. */
  deleteDatabase(): Promise<string[]>;
}

export interface ProbeEvent {
  readonly kind: 'transaction' | 'complete' | 'abort' | 'write' | 'read' | 'abort-call' | 'versionchange' | 'close';
  readonly mode?: IDBTransactionMode;
  readonly store?: string;
  /** Name of the DOMException an `abort()` call threw. */
  readonly threw?: string;
  /** Name of the transaction's error when it aborted, if any. */
  readonly error?: string;
}

interface IdbProbe {
  readonly events: ProbeEvent[];
  /** Runs synchronously after each event is recorded, before the application's own handlers; it changes no request. */
  onEvent: ((event: ProbeEvent) => void) | null;
  /**
   * While true, the transaction of the next write request is kept open by chaining read-only `count()` requests on it,
   * so it stays uncommitted with the page's main thread free. It adds reads only, never writes.
   */
  holdWrites: boolean;
  /** As `holdWrites`, for the transaction of the next read request. */
  holdReads: boolean;
  /**
   * One-shot fault injection: the next `transaction()` call first closes its real connection, so the native call throws
   * `InvalidStateError` as on a connection closed before use. It resets itself.
   */
  closeNextTransaction: boolean;
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
    /** Incompressible deterministic bytes (xorshift32), different per Asset. */
    const noise = (length: number, seed: string): Uint8Array => {
      let state = [...seed].reduce((hash, character) => Math.imul(hash ^ character.charCodeAt(0), 0x01000193) >>> 0, 0x811c9dc5) || 1;
      const bytes = new Uint8Array(length);
      for (let index = 0; index < length; index++) {
        state ^= state << 13; state >>>= 0;
        state ^= state >>> 17;
        state ^= state << 5; state >>>= 0;
        bytes[index] = state & 0xff;
      }
      return bytes;
    };
    window.osrCache = {
      cache, records, completeness, slice, ownership,
      buildPackage({ origin = 'synthetic', converterVersion = 'synthetic-converter.1', tag = 'payload', extraAsset = false, modelBytes } = {}) {
        const identity = { converterVersion, ...(origin === 'synthetic' ? {} : { origin: { type: 'original-import', sourceFingerprint: origin } }) };
        return slice.CLASSIC_P2_SLICE.groups.map(group => {
          const specs = [...synthetic.SYNTHETIC_ASSETS[group], ...(extraAsset && group === 'models' ? [{ id: 'image/synthetic-extra', role: 'model-texture' }] : [])]
            .map(spec => ({
              ...spec,
              bytes: modelBytes !== undefined && group === 'models' ? noise(modelBytes, `${tag}:${spec.id}`) : ascii(`${tag}:${spec.id}`),
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
      restoredTag: result => (result.status === 'restored' ? String.fromCharCode(...result.groups[0].payloads[0].bytes).split(':')[0] : result.code),
      statusOf: result => (result.status === 'failed' ? result.code! : result.status),
      signature: groups => groups.map(({ payloads }) => payloads.map(({ id, bytes }) => {
        let hash = 0x811c9dc5;
        for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
        return `${id}=${bytes.length}:${hash.toString(16)}`;
      }).join(',')).join('|'),
      async cacheState(subject, key) {
        const listed = await subject.list();
        const restored = await subject.restore(key, this.limits());
        return { listed: listed.status === 'listed' ? listed.entries.length : listed.code, restored: this.statusOf(restored) };
      },
      deleteDatabase: () => new Promise(resolve => {
        const steps: string[] = [];
        const request = indexedDB.deleteDatabase(records.RESOURCE_CACHE_DATABASE.name);
        const committed = () => window.osrIdbProbe?.events.some(({ kind, mode }) => kind === 'complete' && mode === 'readwrite');
        request.onblocked = () => steps.push('blocked');
        request.onsuccess = () => resolve([...steps, committed() ? 'success-after-commit' : 'success']);
        request.onerror = () => resolve([...steps, 'error']);
      }),
    };
  });
}

/** Wraps native IndexedDB methods to record transactions, write requests, abort calls and final events. */
export async function installIdbProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (window.osrIdbProbe) return;
    const events: ProbeEvent[] = [];
    const probe: IdbProbe = {
      events, onEvent: null, holdWrites: false, holdReads: false, closeNextTransaction: false, reset: () => { events.length = 0; },
    };
    const held = new WeakSet<IDBTransaction>();
    /** Keeps the store's transaction open with chained read-only `count()` requests while the probe flag is set. */
    const hold = (store: IDBObjectStore, flag: 'holdReads' | 'holdWrites'): void => {
      if (!probe[flag] || held.has(store.transaction)) return;
      held.add(store.transaction);
      const keepOpen = (): void => {
        if (probe[flag]) store.count().onsuccess = keepOpen;
      };
      keepOpen();
    };
    const record = (event: ProbeEvent): void => {
      events.push(event);
      probe.onEvent?.(event);
    };
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (this: IDBDatabase, ...args: Parameters<IDBDatabase['transaction']>) {
      if (probe.closeNextTransaction) {
        probe.closeNextTransaction = false;
        this.close();
      }
      const created = transaction.apply(this, args);
      record({ kind: 'transaction', mode: created.mode });
      // Registered before the adapter assigns its handlers, so these run first.
      created.addEventListener('complete', () => record({ kind: 'complete', mode: created.mode }));
      created.addEventListener('abort', () => record({ kind: 'abort', mode: created.mode, ...(created.error ? { error: created.error.name } : {}) }));
      return created;
    };
    for (const method of ['put', 'delete'] as const) {
      const original = IDBObjectStore.prototype[method] as (...args: unknown[]) => IDBRequest;
      (IDBObjectStore.prototype[method] as unknown) = function (this: IDBObjectStore, ...args: unknown[]) {
        const request = original.apply(this, args);
        record({ kind: 'write', store: this.name });
        hold(this, 'holdWrites');
        return request;
      };
    }
    for (const method of ['get', 'getAll', 'getAllKeys'] as const) {
      const original = IDBObjectStore.prototype[method] as (...args: unknown[]) => IDBRequest;
      (IDBObjectStore.prototype[method] as unknown) = function (this: IDBObjectStore, ...args: unknown[]) {
        const request = original.apply(this, args);
        record({ kind: 'read', store: this.name });
        hold(this, 'holdReads');
        return request;
      };
    }
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (this: IDBFactory, ...args: Parameters<IDBFactory['open']>) {
      const request = open.apply(this, args);
      request.addEventListener('success', () => {
        request.result.addEventListener('versionchange', () => record({ kind: 'versionchange' }));
        request.result.addEventListener('close', () => record({ kind: 'close' }));
      });
      return request;
    };
    const abort = IDBTransaction.prototype.abort;
    IDBTransaction.prototype.abort = function (this: IDBTransaction) {
      try {
        abort.call(this);
        record({ kind: 'abort-call' });
      } catch (error) {
        record({ kind: 'abort-call', threw: error instanceof DOMException ? error.name : 'unknown' });
        throw error;
      }
    };
    window.osrIdbProbe = probe;
  });
}

/**
 * Arms the probe so the next `kind` request signals `issued` over the console (delivered as soon as the page's main
 * thread is free) and, with `hold`, keeps that request's transaction open. Start the operation after this resolves,
 * then clear the matching `holdReads`/`holdWrites` flag once it settles.
 */
export async function armHold(page: Page, kind: 'read' | 'write', hold = true): Promise<{ issued: Promise<unknown> }> {
  const token = `osr-${kind}-issued`;
  const issued = page.waitForEvent('console', message => message.text() === token);
  await page.evaluate(({ kind, hold, token }) => {
    const probe = window.osrIdbProbe;
    probe.reset();
    probe[kind === 'read' ? 'holdReads' : 'holdWrites'] = hold;
    probe.onEvent = event => {
      if (event.kind !== kind) return;
      probe.onEvent = null;
      console.log(token);
    };
  }, { kind, hold, token });
  return { issued };
}

/**
 * Stored records with their IndexedDB array keys; package values as JSON, payload bytes as length and digest, and in
 * `exact` mode also every payload record's whole value with its bytes listed.
 */
export interface StoredRecords {
  readonly packages: { key: unknown[]; value: string }[];
  readonly payloads: { key: unknown[]; schemaVersion: unknown; byteLength: number; digest: string; value?: string }[];
}

/**
 * Reads every record through a separate read-only connection, using the adapter's exported constants. It opens the
 * database only if the page already lists it, so it never creates or upgrades one.
 */
export async function readStoredRecords(page: Page, exact = false): Promise<StoredRecords> {
  return page.evaluate(async exact => {
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
          const whole = exact ? { value: JSON.stringify({ ...value, bytes: [...bytes] }) } : {};
          return { key: key as unknown[], schemaVersion: value.schemaVersion, byteLength: bytes.byteLength, digest: digest(bytes), ...whole };
        }),
      };
    } finally {
      db.close();
    }
  }, exact);
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

/**
 * Overrides the origin's quota over CDP while `run` executes and always resets it. Chrome 154 enforces the override
 * on IndexedDB writes only if it is set before the session's first IndexedDB use, reports it through
 * `Storage.getUsageAndQuota`, and never through `navigator.storage.estimate()`.
 */
export async function withQuotaOverride<T>(page: Page, origin: string, quotaSize: number, run: () => Promise<T>) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Storage.overrideQuotaForOrigin', { origin, quotaSize });
    const overridden = await cdp.send('Storage.getUsageAndQuota', { origin });
    return { overridden, result: await run() };
  } finally {
    await cdp.send('Storage.overrideQuotaForOrigin', { origin });
    await cdp.detach();
  }
}

/** Clears the origin's IndexedDB data over CDP, as a user or the browser clearing site data would. */
export async function clearOriginIndexedDb(page: Page, origin: string): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Storage.clearDataForOrigin', { origin, storageTypes: 'indexeddb' });
  } finally {
    await cdp.detach();
  }
}
