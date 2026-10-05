import type { AssetId } from '../../content/asset-id.ts';
import type { ResourceGroup } from '../../content/asset-contract.ts';
import { contentIdentityKey, type ContentIdentity } from '../../content/content-identity.ts';
import { ContentContractError, readArray, readRecord, requireFields } from '../../content/contract-validation.ts';
import { readGroupManifest, type GroupManifest } from '../../content/manifest.ts';
import { exclusiveBytes } from '../../content/ownership.ts';
import { readPayloadRecords, type PayloadRecord } from '../../content/payload.ts';
import { CLASSIC_P2_SLICE } from '../../content/slice-definition.ts';
import { readSourceStateSet, type SourceStateSet } from '../../content/source-state.ts';
import {
  cacheKeyOf, contractDiagnostic, failWith, packageRecordKey, payloadRecordKey, readCacheKey,
  readPackageRecordKey, ResourceCacheFailureError, sameCacheKey, withContractFailure,
  type CacheEntry, type ResourceCacheFailureCode, type ResourceCacheKey, type StorageRequirementResult,
} from './resource-cache-contract.ts';

// DOM-free record layout of the resource cache (P2-10 S-01, S-04, S-06): compatibility constants, the package and
// payload records written to IndexedDB, their untrusted reads, and the storage requirement estimate.

/** Database identity; the store names are the implementation's and tests reach the stores only through these. */
export const RESOURCE_CACHE_DATABASE = Object.freeze({
  name: 'osr-resource-cache',
  version: 1,
  packageStore: 'packages',
  payloadStore: 'payloads',
} as const);

export const RESOURCE_CACHE_FORMAT = 'osr-resource-cache';
export const RESOURCE_CACHE_FORMAT_VERSION = 1;

/** One group's stored metadata: the reader-normalized manifest and source states, never payload bytes. */
export interface CachedGroup {
  readonly manifest: GroupManifest;
  readonly sources: SourceStateSet | null;
}

/** The single package record per key, written and deleted with all of its payload records in one transaction. */
export interface PackageRecord {
  readonly format: typeof RESOURCE_CACHE_FORMAT;
  readonly formatVersion: typeof RESOURCE_CACHE_FORMAT_VERSION;
  readonly key: ResourceCacheKey;
  /** In `CLASSIC_P2_SLICE.groups` order. */
  readonly groups: readonly CachedGroup[];
  /** Sums declared by the four manifests. */
  readonly payloadCount: number;
  readonly payloadBytes: number;
}

/** One Asset's stored payload: `bytes` is exactly the payload's length. */
export interface StoredPayload {
  readonly schemaVersion: number;
  readonly bytes: ArrayBuffer;
}

/** A group input read through the P2-01 readers; payload views are still the caller's. */
export interface ReadGroupInput extends CachedGroup {
  readonly payloads: readonly PayloadRecord[];
}

/** A package record read back from storage and checked for format, versions, key and declared sums. */
export interface ReadPackageRecord {
  readonly key: ResourceCacheKey;
  readonly identity: ContentIdentity;
  readonly groups: readonly CachedGroup[];
  readonly payloadCount: number;
  readonly payloadBytes: number;
}

const property = (value: object, name: string): unknown => Object.getOwnPropertyDescriptor(value, name)?.value;

/**
 * Reads each `{ manifest, payloads, sources }` group input through the P2-01 readers, in input order. A P2-01 error
 * fails with `code` at the error's path; group membership is left to `validatePackage` or `inDefinitionOrder`.
 */
export function readGroupInputs(inputs: unknown, code: ResourceCacheFailureCode): readonly ReadGroupInput[] {
  if (!Array.isArray(inputs)) failWith('invalid-request', 'groups');
  return Object.freeze(inputs.map((input: unknown, index) => {
    if (typeof input !== 'object' || input === null) failWith(code, `groups[${index}]`);
    const root = `groups[${index}].`;
    return withContractFailure(code, () => {
      const sources = property(input, 'sources');
      return Object.freeze({
        manifest: readGroupManifest(property(input, 'manifest'), `${root}manifest`),
        payloads: readPayloadRecords(property(input, 'payloads'), `${root}payloads`),
        sources: sources === null ? null : readSourceStateSet(sources, `${root}sources`),
      });
    });
  }));
}

/** Orders the groups as the slice definition does; each defined group must appear exactly once. */
export function inDefinitionOrder<T extends CachedGroup>(groups: readonly T[], code: ResourceCacheFailureCode): readonly T[] {
  const ordered = CLASSIC_P2_SLICE.groups.map((group: ResourceGroup) => {
    const matches = groups.filter(({ manifest }) => manifest.group === group);
    if (matches.length !== 1) failWith(code, `groups.${group}`);
    return matches[0];
  });
  if (groups.length !== ordered.length) failWith(code, 'groups');
  return Object.freeze(ordered);
}

const declaredCount = (groups: readonly CachedGroup[]): number =>
  groups.reduce((sum, { manifest }) => sum + manifest.assets.length, 0);
const declaredBytes = (groups: readonly CachedGroup[]): number =>
  groups.reduce((sum, { manifest }) => manifest.assets.reduce((total, asset) => total + asset.payloadIdentity.byteLength, sum), 0);

/** Builds the package record from groups already in definition order and validated as one complete package. */
export function buildPackageRecord(groups: readonly CachedGroup[]): PackageRecord {
  return Object.freeze({
    format: RESOURCE_CACHE_FORMAT,
    formatVersion: RESOURCE_CACHE_FORMAT_VERSION,
    key: cacheKeyOf(groups[0].manifest.identity),
    groups: Object.freeze(groups.map(({ manifest, sources }) => Object.freeze({ manifest, sources }))),
    payloadCount: declaredCount(groups),
    payloadBytes: declaredBytes(groups),
  });
}

/** The stored payload value; a view that does not span its whole buffer is copied so no extra bytes are stored. */
export function buildStoredPayload(payload: PayloadRecord): StoredPayload {
  const { bytes } = payload;
  const whole = bytes.buffer instanceof ArrayBuffer && bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength;
  return Object.freeze({ schemaVersion: payload.schemaVersion, bytes: whole ? bytes.buffer as ArrayBuffer : exclusiveBytes(bytes).buffer as ArrayBuffer });
}

/** A P2-01 read of stored data: an unsupported schema is incompatible, any other problem is corruption. */
function readStored<T>(read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (!(error instanceof ContentContractError)) throw error;
    const code = error.code === 'unsupported-schema' ? 'cache-incompatible' : 'cache-corrupt';
    return failWith(code, error.path, { diagnostics: [contractDiagnostic(error)] });
  }
}

/** Reads one stored group after its wrapper and raw group name passed the structural preflight. */
function readStoredGroup(record: Record<string, unknown>, index: number): CachedGroup {
  const path = `record.groups[${index}]`;
  const manifest = readStored(() => readGroupManifest(record.manifest, `${path}.manifest`));
  if (manifest.identity.sliceDefinitionVersion !== CLASSIC_P2_SLICE.version) {
    failWith('cache-incompatible', `${path}.manifest.identity.sliceDefinitionVersion`);
  }
  const sources = record.sources === null ? null : readStored(() => readSourceStateSet(record.sources, `${path}.sources`));
  return Object.freeze({ manifest, sources });
}

/**
 * Reads a stored package record. An unknown format or format version, content schema or slice definition version is
 * `cache-incompatible`; any other mismatch, including a record key other than `storedKey`, is `cache-corrupt`.
 * Structure is checked before any P2-01 read, so a structurally damaged record is corrupt even if it is also newer.
 */
export function readPackageRecord(value: unknown, storedKey?: ResourceCacheKey): ReadPackageRecord {
  const record = readStored(() => readRecord(value, 'record'));
  if (!Object.hasOwn(record, 'format') || !Object.hasOwn(record, 'formatVersion')) failWith('cache-corrupt', 'record');
  if (record.format !== RESOURCE_CACHE_FORMAT) failWith('cache-incompatible', 'record.format');
  if (record.formatVersion !== RESOURCE_CACHE_FORMAT_VERSION) failWith('cache-incompatible', 'record.formatVersion');
  const wrappers = readStored(() => {
    requireFields(record, 'record', ['format', 'formatVersion', 'key', 'groups', 'payloadCount', 'payloadBytes']);
    return readArray(record.groups, 'record.groups', 'invalid-record', (item, at) => {
      const fields = readRecord(item, at);
      requireFields(fields, at, ['manifest', 'sources']);
      return fields;
    });
  });
  if (wrappers.length !== CLASSIC_P2_SLICE.groups.length) failWith('cache-corrupt', 'record.groups');
  wrappers.forEach(({ manifest }, index) => {
    if (typeof manifest !== 'object' || manifest === null) failWith('cache-corrupt', `record.groups[${index}].manifest`);
    if (property(manifest, 'group') !== CLASSIC_P2_SLICE.groups[index]) failWith('cache-corrupt', `record.groups[${index}].manifest.group`);
  });
  const groups = Object.freeze(wrappers.map(readStoredGroup));
  const key = readCacheKey(record.key, 'record.key', 'cache-corrupt');
  const { identity } = groups[0].manifest;
  if (!sameCacheKey(key, cacheKeyOf(identity))) failWith('cache-corrupt', 'record.key');
  const expected = contentIdentityKey(identity);
  groups.forEach(({ manifest }, index) => {
    if (contentIdentityKey(manifest.identity) !== expected) failWith('cache-corrupt', `record.groups[${index}].manifest.identity`);
  });
  const payloadCount = declaredCount(groups);
  const payloadBytes = declaredBytes(groups);
  if (record.payloadCount !== payloadCount) failWith('cache-corrupt', 'record.payloadCount');
  if (record.payloadBytes !== payloadBytes) failWith('cache-corrupt', 'record.payloadBytes');
  if (storedKey !== undefined && !sameCacheKey(storedKey, key)) failWith('cache-corrupt', 'key');
  return Object.freeze({ key, identity, groups, payloadCount, payloadBytes });
}

/** Reads one stored payload record into a P2-01 payload record for `id`; any other shape is `cache-corrupt`. */
export function readStoredPayload(value: unknown, id: AssetId): PayloadRecord {
  const path = `payloads[${id}]`;
  const record = readStored(() => {
    const fields = readRecord(value, path);
    requireFields(fields, path, ['schemaVersion', 'bytes']);
    return fields;
  });
  const { schemaVersion, bytes } = record;
  if (typeof schemaVersion !== 'number' || !Number.isSafeInteger(schemaVersion) || schemaVersion <= 0) {
    failWith('cache-corrupt', `${path}.schemaVersion`);
  }
  if (!(bytes instanceof ArrayBuffer)) failWith('cache-corrupt', `${path}.bytes`);
  return Object.freeze({ id, schemaVersion, bytes: new Uint8Array(bytes) });
}

/** Metadata status of one stored package record for listing; payload records are never read. */
export function cacheEntryOf(storedKey: unknown, value: unknown): CacheEntry {
  let key: ResourceCacheKey | null = null;
  try {
    key = readPackageRecordKey(storedKey);
    const { identity, payloadBytes } = readPackageRecord(value, key);
    return Object.freeze({ key, status: 'compatible', identity, payloadBytes });
  } catch (error) {
    if (!(error instanceof ResourceCacheFailureError)) throw error;
    const status = error.failure.code === 'cache-incompatible' ? 'incompatible' : 'corrupt';
    return Object.freeze({ key, status, identity: null, payloadBytes: null });
  }
}

/** Fixed per-record allowance for the store's own bookkeeping beyond the key and value text. */
const RECORD_OVERHEAD_BYTES = 64;
/** UTF-16 bytes of a value's JSON text: a deterministic, implementation-independent size estimate. */
const textBytes = (value: unknown): number => 2 * JSON.stringify(value).length;

/** Estimated metadata bytes of the package record and every payload record's key, excluding payload bytes. */
function estimateMetadataBytes(record: PackageRecord): number {
  const assetIds = record.groups.flatMap(({ manifest }) => manifest.assets.map(asset => asset.id));
  return textBytes(record) + textBytes(packageRecordKey(record.key)) + RECORD_OVERHEAD_BYTES
    + assetIds.reduce((sum, id) => sum + textBytes(payloadRecordKey(record.key, id)) + RECORD_OVERHEAD_BYTES, 0);
}

/** The storage requirement of four group inputs; malformed inputs or totals beyond the safe range are `invalid-request`. */
export function measureStorageRequirement(inputs: unknown): StorageRequirementResult {
  try {
    const groups = inDefinitionOrder(readGroupInputs(inputs, 'invalid-request'), 'invalid-request');
    const payloadBytes = groups.reduce((sum, { payloads }) => payloads.reduce((total, { bytes }) => total + bytes.byteLength, sum), 0);
    const metadataBytes = estimateMetadataBytes(buildPackageRecord(groups));
    const requiredBytes = payloadBytes + metadataBytes;
    if (!Number.isSafeInteger(payloadBytes) || !Number.isSafeInteger(requiredBytes)) failWith('invalid-request', 'groups');
    return Object.freeze({ payloadBytes, metadataBytes, requiredBytes });
  } catch (error) {
    if (error instanceof ResourceCacheFailureError) return error.failure;
    throw error;
  }
}
