import { readBudgetRecord, type BudgetRecord } from '../../content/budget.ts';
import { validatePackage } from '../../content/completeness.ts';
import { exclusiveBytes } from '../../content/ownership.ts';
import { CLASSIC_P2_SLICE } from '../../content/slice-definition.ts';
import {
  cacheFailure, classifyHostError, failWith, packageRecordKey, payloadRecordKey, readCacheKey, ResourceCacheFailureError,
  withContractFailure, type CommitResult, type ListResult, type ResourceCacheFailure, type ResourceCacheFailureCode,
  type ResourceCacheKey, type RestoreResult, type StorageRequirementResult,
} from './resource-cache-contract.ts';
import {
  assembleRestoredGroups, buildPackageRecord, buildStoredPayload, cacheEntryOf, chargeDeclaredBudget, inDefinitionOrder,
  measureStorageRequirement, readGroupInputs, readPackageRecord, RESOURCE_CACHE_DATABASE, type PackageRecord,
  type ReadGroupInput,
} from './resource-cache-records.ts';

// IndexedDB adapter of the resource cache (P2-10). It needs only the IndexedDB and StorageManager capabilities, never
// window or document, so it also runs in a dedicated Worker. Expected failures are returned as results.

export interface ResourceCacheOptions {
  /** Defaults to the global `indexedDB`; null stands for an environment without IndexedDB. */
  readonly indexedDB?: IDBFactory | null;
}

export interface CommitOptions {
  readonly signal?: AbortSignal;
}

export interface ResourceCache {
  /** Exact payload bytes plus the metadata estimate of four group inputs; no storage access. */
  measure(inputs: unknown): StorageRequirementResult;
  /** Validates a complete package within `limits` and replaces the key's package in one readwrite transaction. */
  commit(inputs: unknown, limits: unknown, options?: CommitOptions): Promise<CommitResult>;
  /** Metadata status of every stored package; payload records are never read. */
  list(): Promise<ListResult>;
  /** Reads one key's package in one readonly transaction and returns it only if it revalidates as complete. */
  restore(key: unknown, limits: unknown): Promise<RestoreResult>;
  /** Closes the connection; a later operation opens a new one. */
  close(): void;
}

const { name, version, packageStore, payloadStore } = RESOURCE_CACHE_DATABASE;

/** Every payload record key of a package: they extend the package key, and an array sorts after any string. */
const payloadRange = (key: ResourceCacheKey): IDBKeyRange => {
  const lower = packageRecordKey(key);
  return IDBKeyRange.bound(lower, [...lower, []]);
};

async function settle<T>(run: () => Promise<T>): Promise<T | ResourceCacheFailure> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ResourceCacheFailureError) return error.failure;
    throw error;
  }
}

const failure = (code: ResourceCacheFailureCode, location: string): ResourceCacheFailureError =>
  new ResourceCacheFailureError(cacheFailure(code, location));

const readLimits = (limits: unknown): BudgetRecord => withContractFailure('invalid-request', () => readBudgetRecord(limits, 'limits'));

/** The caller's group inputs read once, with every payload copied into a buffer only the cache owns. */
function snapshot(inputs: unknown): readonly ReadGroupInput[] {
  return Object.freeze(readGroupInputs(inputs, 'package-incomplete').map(group => Object.freeze({
    ...group,
    payloads: Object.freeze(group.payloads.map(payload => Object.freeze({ ...payload, bytes: exclusiveBytes(payload.bytes) }))),
  })));
}

/** Starts a transaction; a connection that is closing or closed reports `storage-closed`. */
function transaction(db: IDBDatabase, mode: IDBTransactionMode, phase: 'write' | 'read'): IDBTransaction {
  try {
    return db.transaction([packageStore, payloadStore], mode);
  } catch (error) {
    const closed = error instanceof DOMException && error.name === 'InvalidStateError';
    throw failure(closed ? 'storage-closed' : classifyHostError(phase, error), 'transaction');
  }
}

function writePackage(db: IDBDatabase, record: PackageRecord, groups: readonly ReadGroupInput[], signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) throw failure('cancelled', 'transaction');
    const tx = transaction(db, 'readwrite', 'write');
    /** Why this adapter aborted the transaction; unset when the browser aborted it. */
    let reason: ResourceCacheFailureCode | undefined;
    const abort = (code: ResourceCacheFailureCode): void => {
      try {
        tx.abort();
        reason ??= code;
      } catch {
        // Already committing or finished: the transaction's own final event decides the result.
      }
    };
    const cancel = (): void => abort('cancelled');
    signal?.addEventListener('abort', cancel, { once: true });
    const settled = (): void => signal?.removeEventListener('abort', cancel);
    tx.oncomplete = () => { settled(); resolve(); };
    tx.onabort = () => {
      settled();
      reject(failure(reason ?? classifyHostError('write', tx.error), 'transaction'));
    };
    try {
      const key = packageRecordKey(record.key);
      const packages = tx.objectStore(packageStore);
      const payloads = tx.objectStore(payloadStore);
      packages.delete(key);
      payloads.delete(payloadRange(record.key));
      packages.put(record, key);
      for (const { payloads: groupPayloads } of groups) {
        for (const payload of groupPayloads) payloads.put(buildStoredPayload(payload), payloadRecordKey(record.key, payload.id));
      }
    } catch (error) {
      abort(classifyHostError('write', error));
    }
  });
}

/**
 * Runs one readonly transaction. `issue` sends the requests and returns how to read the outcome once the transaction
 * completes; an outcome may throw an expected failure recorded by a request handler.
 */
function readTransaction<T>(db: IDBDatabase, issue: (tx: IDBTransaction) => () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = transaction(db, 'readonly', 'read');
    const outcome = issue(tx);
    tx.oncomplete = () => {
      try {
        resolve(outcome());
      } catch (error) {
        reject(error);
      }
    };
    tx.onabort = () => reject(failure(classifyHostError('read', tx.error), 'transaction'));
  });
}

/** The package record, the budget charge, then the payload records, as one snapshot; payloads are read only within budget. */
function readPackage(db: IDBDatabase, key: ResourceCacheKey, limits: BudgetRecord) {
  return readTransaction(db, tx => {
    let outcome: (() => { read: ReturnType<typeof readPackageRecord>; keys: IDBValidKey[]; values: unknown[] }) | undefined;
    const packageRequest = tx.objectStore(packageStore).get(packageRecordKey(key));
    packageRequest.onsuccess = () => {
      try {
        if (packageRequest.result === undefined) failWith('not-found', 'key');
        const read = readPackageRecord(packageRequest.result, key);
        chargeDeclaredBudget(limits, read.groups, 'record.groups');
        const payloads = tx.objectStore(payloadStore);
        const keys = payloads.getAllKeys(payloadRange(key));
        const values = payloads.getAll(payloadRange(key));
        outcome = () => ({ read, keys: keys.result, values: values.result });
      } catch (error) {
        if (!(error instanceof ResourceCacheFailureError)) throw error;
        outcome = () => { throw error; };
      }
    };
    return () => {
      if (!outcome) throw failure('read-failed', 'transaction');
      return outcome();
    };
  });
}

function openDatabase(factory: IDBFactory | null | undefined): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!factory) throw failure('storage-unavailable', 'database');
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(name, version);
    } catch (error) {
      throw failure(classifyHostError('open', error), 'database');
    }
    request.onupgradeneeded = () => {
      // Version 1 is the only version; there is no upgrade path from an older cache.
      const db = request.result;
      db.createObjectStore(packageStore);
      db.createObjectStore(payloadStore);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(failure(classifyHostError('open', request.error), 'database'));
  });
}

export function createResourceCache(options: ResourceCacheOptions = {}): ResourceCache {
  const factory = 'indexedDB' in options ? options.indexedDB : globalThis.indexedDB;
  let connection: Promise<IDBDatabase> | null = null;

  const database = (): Promise<IDBDatabase> => {
    connection ??= openDatabase(factory).catch((error: unknown) => {
      connection = null;
      throw error;
    });
    return connection;
  };

  return Object.freeze({
    measure: measureStorageRequirement,

    commit: (inputs: unknown, limits: unknown, { signal }: CommitOptions = {}) => settle(async () => {
      const groups = snapshot(inputs);
      const checkedLimits = readLimits(limits);
      chargeDeclaredBudget(checkedLimits, groups, 'groups');
      const validation = validatePackage(CLASSIC_P2_SLICE, groups);
      if (validation.status === 'incomplete') failWith('package-incomplete', 'groups', { diagnostics: validation.diagnostics });
      const ordered = inDefinitionOrder(groups, 'package-incomplete');
      const record = buildPackageRecord(ordered);
      if (signal?.aborted) failWith('cancelled', 'transaction');
      await writePackage(await database(), record, ordered, signal);
      return Object.freeze({
        status: 'committed' as const,
        key: record.key,
        identity: validation.identity,
        payloadCount: record.payloadCount,
        payloadBytes: record.payloadBytes,
      });
    }),

    list: () => settle(async () => {
      const entries = await readTransaction(await database(), tx => {
        const store = tx.objectStore(packageStore);
        const keys = store.getAllKeys();
        const values = store.getAll();
        return () => keys.result.map((key, index) => cacheEntryOf(key, values.result[index]));
      });
      return Object.freeze({ status: 'listed' as const, entries: Object.freeze(entries) });
    }),

    restore: (key: unknown, limits: unknown) => settle(async () => {
      const requested = readCacheKey(key);
      const checkedLimits = readLimits(limits);
      const { read, keys, values } = await readPackage(await database(), requested, checkedLimits);
      return Object.freeze({ status: 'restored' as const, key: read.key, identity: read.identity, groups: assembleRestoredGroups(read, keys, values) });
    }),

    close: () => {
      const current = connection;
      connection = null;
      void current?.then(db => db.close(), () => undefined);
    },
  });
}
