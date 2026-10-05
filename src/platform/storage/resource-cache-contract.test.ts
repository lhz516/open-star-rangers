import { describe, expect, it } from 'vitest';
import { readContentIdentity } from '../../content/content-identity.ts';
import { syntheticIdentity } from '../../content/synthetic-content.test-support.ts';
import {
  cacheFailure, cacheKeyOf, classifyHostError, packageRecordKey, payloadRecordKey, readCacheKey, readPackageRecordKey,
  RESOURCE_CACHE_FAILURE_CODES, ResourceCacheFailureError, sameCacheKey, type ResourceCacheFailure,
} from './resource-cache-contract.ts';

const FINGERPRINT = `source:sha256:${'a'.repeat(64)}`;
const original = (overrides: Record<string, unknown> = {}) =>
  readContentIdentity(syntheticIdentity({ origin: { type: 'original-import', sourceFingerprint: FINGERPRINT }, ...overrides }));
const synthetic = (overrides: Record<string, unknown> = {}) => readContentIdentity(syntheticIdentity(overrides));

/** The expected failure a read throws, so a test can assert its code and location. */
function failureOf(read: () => unknown): ResourceCacheFailure {
  try {
    read();
  } catch (error) {
    if (error instanceof ResourceCacheFailureError) return error.failure;
    throw error;
  }
  throw new Error('The read unexpectedly succeeded');
}

describe('cache key', () => {
  it('derives the origin type, the origin token and the converter version from the identity', () => {
    expect(cacheKeyOf(synthetic())).toEqual({ originType: 'synthetic', originToken: 'p2-01-contracts', converterVersion: 'synthetic-converter.1' });
    expect(cacheKeyOf(original())).toEqual({ originType: 'original-import', originToken: FINGERPRINT, converterVersion: 'synthetic-converter.1' });
    expect(Object.isFrozen(cacheKeyOf(original()))).toBe(true);
  });

  it('ignores the schema, slice definition version and manifest identity', () => {
    const base = cacheKeyOf(original());
    for (const overrides of [{ sliceDefinitionVersion: 2 }, { manifestIdentity: 'manifest:other' }]) {
      expect(cacheKeyOf(original(overrides))).toEqual(base);
    }
    // Schema 2 cannot be read, so the key is computed from the schema 1 identity with only the schema changed.
    expect(cacheKeyOf({ ...original(), schemaVersion: 2 } as never)).toEqual(base);
  });

  it('changes when the origin type, the token or the converter version changes', () => {
    const base = cacheKeyOf(original());
    const others = [
      cacheKeyOf(synthetic()),
      cacheKeyOf(original({ origin: { type: 'original-import', sourceFingerprint: `source:sha256:${'b'.repeat(64)}` } })),
      cacheKeyOf(original({ converterVersion: 'synthetic-converter.2' })),
    ];
    for (const other of others) {
      expect(sameCacheKey(base, other)).toBe(false);
      expect(packageRecordKey(other)).not.toEqual(packageRecordKey(base));
    }
    expect(sameCacheKey(base, cacheKeyOf(original()))).toBe(true);
  });

  it('round-trips through untrusted reads and IndexedDB array keys', () => {
    for (const key of [cacheKeyOf(synthetic()), cacheKeyOf(original())]) {
      expect(readCacheKey({ ...key })).toEqual(key);
      expect(readPackageRecordKey([...packageRecordKey(key)])).toEqual(key);
      expect(payloadRecordKey(key, 'model/synthetic-player')).toEqual([...packageRecordKey(key), 'model/synthetic-player']);
    }
  });

  it.each([
    ['a non-record', 'key', null],
    ['an array', 'key', ['synthetic', 'p2-01-contracts', 'synthetic-converter.1']],
    ['a missing field', 'key.converterVersion', { originType: 'synthetic', originToken: 'p2-01-contracts' }],
    ['an extra field', 'key', { originType: 'synthetic', originToken: 'p2-01-contracts', converterVersion: 'synthetic-converter.1', extra: 1 }],
    ['an unknown origin type', 'key.originType', { originType: 'fixture', originToken: 'p2-01-contracts', converterVersion: 'synthetic-converter.1' }],
    ['a fingerprint used as a fixture ID', 'key.originToken', { originType: 'synthetic', originToken: FINGERPRINT, converterVersion: 'synthetic-converter.1' }],
    ['a fixture ID used as a fingerprint', 'key.originToken', { originType: 'original-import', originToken: 'p2-01-contracts', converterVersion: 'synthetic-converter.1' }],
    ['a malformed converter version', 'key.converterVersion', { originType: 'synthetic', originToken: 'p2-01-contracts', converterVersion: 'UPPER' }],
  ])('rejects %s as invalid-request at %s', (_name, location, value) => {
    const failure = failureOf(() => readCacheKey(value));
    expect(failure).toMatchObject({ code: 'invalid-request', location });
  });

  it('keeps the P2-01 code and the key path in the token diagnostic', () => {
    const failure = failureOf(() => readCacheKey({ originType: 'synthetic', originToken: FINGERPRINT, converterVersion: 'synthetic-converter.1' }));
    expect(failure.diagnostics).toEqual([expect.objectContaining({ code: 'invalid-identity', path: 'key.originToken' })]);
  });

  it.each([
    [['synthetic', 'p2-01-contracts'], 'key'],
    [['fixture', 'p2-01-contracts', 'synthetic-converter.1'], 'key'],
    [['original-import', 'p2-01-contracts', 'synthetic-converter.1'], 'key.originToken'],
    [['synthetic', 'p2-01-contracts', 'UPPER'], 'key.converterVersion'],
    ['synthetic|p2-01-contracts|synthetic-converter.1', 'key'],
  ])('reads a malformed stored key %# as cache-corrupt', (value, location) => {
    expect(failureOf(() => readPackageRecordKey(value))).toMatchObject({ code: 'cache-corrupt', location });
  });
});

describe('failure results', () => {
  it('closes the code set to the spec codes', () => {
    expect([...RESOURCE_CACHE_FAILURE_CODES].sort()).toEqual([
      'cache-corrupt', 'cache-incompatible', 'cancelled', 'invalid-request', 'not-found', 'over-budget', 'package-incomplete',
      'quota-exceeded', 'read-failed', 'storage-closed', 'storage-newer-version', 'storage-unavailable', 'write-failed',
    ]);
  });

  it('gives each code a fixed reason and only the six result fields', () => {
    const reasons = new Set<string>();
    for (const code of RESOURCE_CACHE_FAILURE_CODES) {
      const failure = cacheFailure(code, 'database');
      expect(Object.keys(failure).sort()).toEqual(['budget', 'code', 'diagnostics', 'location', 'reason', 'status']);
      expect(failure).toMatchObject({ status: 'failed', code, location: 'database', diagnostics: [], budget: [] });
      expect(cacheFailure(code, 'elsewhere').reason).toBe(failure.reason);
      reasons.add(failure.reason);
      expect(Object.isFrozen(failure) && Object.isFrozen(failure.diagnostics) && Object.isFrozen(failure.budget)).toBe(true);
      expect(structuredClone(failure)).toEqual(failure);
    }
    expect(reasons.size).toBe(RESOURCE_CACHE_FAILURE_CODES.length);
  });

  it('copies the diagnostics and budget lists', () => {
    const diagnostics = [{ code: 'payload-mismatch' as const, path: 'payloads[0]', assetId: null, unknowns: [], reason: 'fixed' }];
    const failure = cacheFailure('package-incomplete', 'groups[0]', { diagnostics });
    diagnostics.pop();
    expect(failure.diagnostics).toHaveLength(1);
  });
});

describe('host error classification', () => {
  const named = (name: unknown) => ({ name, message: '/private/host/path secret', stack: 'at private', extra: new Uint8Array([1]) });

  it.each([
    ['open', 'VersionError', 'storage-newer-version'],
    ['open', 'SecurityError', 'storage-unavailable'],
    ['open', 'InvalidStateError', 'storage-unavailable'],
    ['open', 'UnknownError', 'storage-unavailable'],
    ['write', 'QuotaExceededError', 'quota-exceeded'],
    ['write', 'AbortError', 'write-failed'],
    ['write', 'UnknownError', 'write-failed'],
    ['write', 'VersionError', 'write-failed'],
    ['read', 'QuotaExceededError', 'read-failed'],
    ['read', 'NotFoundError', 'read-failed'],
  ] as const)('classifies a %s %s as %s', (phase, name, code) => {
    expect(classifyHostError(phase, named(name))).toBe(code);
    expect(classifyHostError(phase, new DOMException('message', name))).toBe(code);
  });

  it.each([undefined, null, 'QuotaExceededError', 7, {}, named(undefined), named(5)])('treats an unnamed value %# as the phase default', value => {
    expect(classifyHostError('open', value)).toBe('storage-unavailable');
    expect(classifyHostError('write', value)).toBe('write-failed');
    expect(classifyHostError('read', value)).toBe('read-failed');
  });

  it('survives a throwing name accessor', () => {
    const hostile = Object.defineProperty({}, 'name', { get() { throw new Error('private'); } });
    expect(classifyHostError('write', hostile)).toBe('write-failed');
  });

  it('never carries host error text into the result', () => {
    const code = classifyHostError('write', named('QuotaExceededError'));
    const failure = cacheFailure(code, 'transaction');
    expect(Object.keys(failure).sort()).toEqual(['budget', 'code', 'diagnostics', 'location', 'reason', 'status']);
    expect(JSON.stringify(failure)).not.toMatch(/private|secret|stack/);
  });
});
