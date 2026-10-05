import type { BudgetViolation } from '../../content/budget.ts';
import type { CompletenessDiagnostic } from '../../content/completeness.ts';
import {
  readConverterVersion, readFixtureId, readSourceFingerprint, type ContentIdentity, type ContentOrigin, type ConverterVersion,
} from '../../content/content-identity.ts';
import { ContentContractError, readRecord, requireFields } from '../../content/contract-validation.ts';
import type { GroupManifest } from '../../content/manifest.ts';
import type { PayloadRecord } from '../../content/payload.ts';
import type { SourceStateSet } from '../../content/source-state.ts';

// DOM-free cache contract (P2-10 S-02, S-10): keys, closed failure codes, result shapes and host error classification.
// The IndexedDB adapter lives in browser-resource-cache.ts; this module stays testable in Node.

export const RESOURCE_CACHE_FAILURE_CODES = Object.freeze([
  'invalid-request',
  'package-incomplete',
  'over-budget',
  'storage-unavailable',
  'storage-newer-version',
  'storage-closed',
  'quota-exceeded',
  'write-failed',
  'read-failed',
  'cancelled',
  'not-found',
  'cache-incompatible',
  'cache-corrupt',
] as const);
export type ResourceCacheFailureCode = typeof RESOURCE_CACHE_FAILURE_CODES[number];

const REASONS: Readonly<Record<ResourceCacheFailureCode, string>> = Object.freeze({
  'invalid-request': 'the request is malformed',
  'package-incomplete': 'the package is not a complete slice package',
  'over-budget': 'the package exceeds the resource budget',
  'storage-unavailable': 'browser storage is unavailable',
  'storage-newer-version': 'the cache database belongs to a newer version',
  'storage-closed': 'the browser closed the cache connection',
  'quota-exceeded': 'browser storage quota was exceeded',
  'write-failed': 'the cache write did not complete',
  'read-failed': 'the cache read did not complete',
  cancelled: 'the commit was cancelled before it was written',
  'not-found': 'no cached package exists for the key',
  'cache-incompatible': 'the cached package belongs to an incompatible format or content version',
  'cache-corrupt': 'the cached package is damaged',
});

/** Every expected failure; `reason` is fixed per code and host error text never enters it. */
export interface ResourceCacheFailure {
  readonly status: 'failed';
  readonly code: ResourceCacheFailureCode;
  /** Structural position such as `key.originToken`, `groups[1].manifest.assets[3]` or `database`. */
  readonly location: string;
  readonly reason: string;
  readonly diagnostics: readonly CompletenessDiagnostic[];
  readonly budget: readonly BudgetViolation[];
}

export interface FailureDetails {
  readonly diagnostics?: readonly CompletenessDiagnostic[];
  readonly budget?: readonly BudgetViolation[];
}

const NONE = Object.freeze([]) as readonly never[];

export function cacheFailure(code: ResourceCacheFailureCode, location: string, details: FailureDetails = {}): ResourceCacheFailure {
  const { diagnostics, budget } = details;
  return Object.freeze({
    status: 'failed',
    code,
    location,
    reason: REASONS[code],
    diagnostics: diagnostics?.length ? Object.freeze([...diagnostics]) : NONE,
    budget: budget?.length ? Object.freeze([...budget]) : NONE,
  });
}

/** Carries an expected failure through internal reads; adapter operations return its `failure` instead of throwing. */
export class ResourceCacheFailureError extends Error {
  readonly failure: ResourceCacheFailure;

  constructor(failure: ResourceCacheFailure) {
    super(`${failure.location} ${failure.reason}`);
    this.name = 'ResourceCacheFailureError';
    this.failure = failure;
  }
}

export function failWith(code: ResourceCacheFailureCode, location: string, details?: FailureDetails): never {
  throw new ResourceCacheFailureError(cacheFailure(code, location, details));
}

/** The P2-01 contract error as a diagnostic: its stable code, path and fixed reason, never the rejected value. */
export function contractDiagnostic(error: ContentContractError): CompletenessDiagnostic {
  return Object.freeze({ code: error.code, path: error.path, assetId: null, unknowns: Object.freeze([]), reason: error.reason });
}

/** Runs a P2-01 read; a contract error becomes `code` at the error's path with the error as its diagnostic. */
export function withContractFailure<T>(code: ResourceCacheFailureCode, read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (error instanceof ContentContractError) failWith(code, error.path, { diagnostics: [contractDiagnostic(error)] });
    throw error;
  }
}

/** Origin type, the origin's own token (source fingerprint or fixture ID) and the converter version. */
export interface ResourceCacheKey {
  readonly originType: ContentOrigin['type'];
  readonly originToken: string;
  readonly converterVersion: ConverterVersion;
}

/** IndexedDB array key of a package record, fresh per call; payload records append the Asset ID. */
export type PackageRecordKey = [ContentOrigin['type'], string, string];
export type PayloadRecordKey = [ContentOrigin['type'], string, string, string];

export function cacheKeyOf(identity: ContentIdentity): ResourceCacheKey {
  const { origin, converterVersion } = identity;
  const originToken = origin.type === 'synthetic' ? origin.fixtureId : origin.sourceFingerprint;
  return Object.freeze({ originType: origin.type, originToken, converterVersion });
}

function readKeyFields(
  code: ResourceCacheFailureCode, originType: ContentOrigin['type'], originToken: unknown, converterVersion: unknown, path: string,
): ResourceCacheKey {
  return withContractFailure(code, () => Object.freeze({
    originType,
    // Each origin type accepts only its own token namespace, so a fingerprint never passes as a fixture ID or the reverse.
    originToken: originType === 'synthetic'
      ? readFixtureId(originToken, `${path}.originToken`)
      : readSourceFingerprint(originToken, `${path}.originToken`),
    converterVersion: readConverterVersion(converterVersion, `${path}.converterVersion`),
  }));
}

const isOriginType = (value: unknown): value is ContentOrigin['type'] => value === 'synthetic' || value === 'original-import';

/**
 * Reads an untrusted `{ originType, originToken, converterVersion }`; any other shape fails with `code`, which is
 * `invalid-request` for a caller's key and `cache-corrupt` for one read back from storage.
 */
export function readCacheKey(value: unknown, path = 'key', code: ResourceCacheFailureCode = 'invalid-request'): ResourceCacheKey {
  const record = withContractFailure(code, () => {
    const fields = readRecord(value, path);
    requireFields(fields, path, ['originType', 'originToken', 'converterVersion']);
    return fields;
  });
  if (!isOriginType(record.originType)) failWith(code, `${path}.originType`);
  return readKeyFields(code, record.originType, record.originToken, record.converterVersion, path);
}

export function packageRecordKey(key: ResourceCacheKey): PackageRecordKey {
  return [key.originType, key.originToken, key.converterVersion];
}

export function payloadRecordKey(key: ResourceCacheKey, assetId: string): PayloadRecordKey {
  return [...packageRecordKey(key), assetId];
}

/** Reads a stored package record key; any other value is `cache-corrupt`. */
export function readPackageRecordKey(value: unknown, path = 'key'): ResourceCacheKey {
  if (!Array.isArray(value) || value.length !== 3 || !isOriginType(value[0])) failWith('cache-corrupt', path);
  return readKeyFields('cache-corrupt', value[0], value[1], value[2], path);
}

export function sameCacheKey(left: ResourceCacheKey, right: ResourceCacheKey): boolean {
  return left.originType === right.originType && left.originToken === right.originToken
    && left.converterVersion === right.converterVersion;
}

/** The IndexedDB operation a host error came from. */
export type HostErrorPhase = 'open' | 'write' | 'read';

function hostErrorName(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  try {
    const name: unknown = Reflect.get(error, 'name');
    return typeof name === 'string' ? name : undefined;
  } catch {
    return undefined;
  }
}

/** Classifies a host error by its `name` alone; its message never enters a result. */
export function classifyHostError(phase: HostErrorPhase, error: unknown): ResourceCacheFailureCode {
  const name = hostErrorName(error);
  switch (phase) {
    case 'open': return name === 'VersionError' ? 'storage-newer-version' : 'storage-unavailable';
    case 'write': return name === 'QuotaExceededError' ? 'quota-exceeded' : 'write-failed';
    case 'read': return 'read-failed';
  }
}

export interface StorageRequirement {
  /** Exact sum of the actual payload byte lengths. */
  readonly payloadBytes: number;
  /** Deterministic estimate of the record metadata; see resource-cache-records.ts. */
  readonly metadataBytes: number;
  readonly requiredBytes: number;
}

export type CapacityCheck =
  | {
    readonly status: 'sufficient' | 'insufficient';
    readonly requiredBytes: number;
    readonly availableBytes: number;
    readonly usage: number;
    readonly quota: number;
  }
  | { readonly status: 'unknown'; readonly requiredBytes: number };

export interface CommittedPackage {
  readonly status: 'committed';
  readonly key: ResourceCacheKey;
  readonly identity: ContentIdentity;
  readonly payloadCount: number;
  readonly payloadBytes: number;
}

export type CacheEntryStatus = 'compatible' | 'incompatible' | 'corrupt';

export interface CacheEntry {
  /** Null only when the stored record key itself cannot be read. */
  readonly key: ResourceCacheKey | null;
  readonly status: CacheEntryStatus;
  /** Null unless the metadata is readable and compatible. */
  readonly identity: ContentIdentity | null;
  readonly payloadBytes: number | null;
}

export interface ListedPackages {
  readonly status: 'listed';
  readonly entries: readonly CacheEntry[];
}

export interface RestoredGroup {
  readonly manifest: GroupManifest;
  readonly payloads: readonly PayloadRecord[];
  readonly sources: SourceStateSet | null;
}

export interface RestoredPackage {
  readonly status: 'restored';
  readonly key: ResourceCacheKey;
  readonly identity: ContentIdentity;
  /** In slice definition group order; passing them to `validatePackage` yields `complete`. */
  readonly groups: readonly RestoredGroup[];
}

export type StorageRequirementResult = StorageRequirement | ResourceCacheFailure;
export type CapacityCheckResult = CapacityCheck | ResourceCacheFailure;
export type CommitResult = CommittedPackage | ResourceCacheFailure;
export type ListResult = ListedPackages | ResourceCacheFailure;
export type RestoreResult = RestoredPackage | ResourceCacheFailure;
