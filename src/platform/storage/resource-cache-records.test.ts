import { describe, expect, it } from 'vitest';
import { validatePackage } from '../../content/completeness.ts';
import { CLASSIC_P2_SLICE } from '../../content/slice-definition.ts';
import {
  diagnosticCodes, syntheticGroup, syntheticOriginalGroup, syntheticPackage, SYNTHETIC_ASSETS,
} from '../../content/synthetic-content.test-support.ts';
import {
  cacheKeyOf, packageRecordKey, readPackageRecordKey, ResourceCacheFailureError, type ResourceCacheFailure,
} from './resource-cache-contract.ts';
import {
  buildPackageRecord, buildStoredPayload, cacheEntryOf, inDefinitionOrder, measureStorageRequirement,
  readGroupInputs, readPackageRecord, readStoredPayload, RESOURCE_CACHE_DATABASE, RESOURCE_CACHE_FORMAT,
  RESOURCE_CACHE_FORMAT_VERSION,
} from './resource-cache-records.ts';

const originalPackage = () => CLASSIC_P2_SLICE.groups.map(group => syntheticOriginalGroup(group));
const recordOf = (inputs: unknown) => buildPackageRecord(inDefinitionOrder(readGroupInputs(inputs, 'package-incomplete'), 'package-incomplete'));
type Json = Record<string, unknown>;
/** A mutable structured clone of a stored record, as IndexedDB returns it. */
const stored = (inputs: unknown = syntheticPackage()): Json => structuredClone(recordOf(inputs)) as unknown as Json;
/** The nested record at `path`, for corrupting one field of a stored record. */
const at = (value: unknown, ...path: (string | number)[]): Json =>
  path.reduce<unknown>((current, key) => (current as Json)[key], value) as Json;
const groupsOf = (record: Json): Json[] => record.groups as Json[];

function failureOf(read: () => unknown): ResourceCacheFailure {
  try {
    read();
  } catch (error) {
    if (error instanceof ResourceCacheFailureError) return error.failure;
    throw error;
  }
  throw new Error('The read unexpectedly succeeded');
}

describe('record layout', () => {
  it('fixes the database, format and version constants', () => {
    expect(RESOURCE_CACHE_DATABASE).toMatchObject({ name: 'osr-resource-cache', version: 1 });
    expect(RESOURCE_CACHE_DATABASE.packageStore).not.toBe(RESOURCE_CACHE_DATABASE.payloadStore);
    expect([RESOURCE_CACHE_FORMAT, RESOURCE_CACHE_FORMAT_VERSION]).toEqual(['osr-resource-cache', 1]);
    expect(Object.isFrozen(RESOURCE_CACHE_DATABASE)).toBe(true);
  });

  it('builds a package record with only the specified fields, in definition order, with declared sums', () => {
    const inputs = [...syntheticPackage()].reverse();
    const record = recordOf(inputs);
    expect(Object.keys(record).sort()).toEqual(['format', 'formatVersion', 'groups', 'key', 'payloadBytes', 'payloadCount']);
    expect(record.groups.map(({ manifest }) => manifest.group)).toEqual(CLASSIC_P2_SLICE.groups);
    expect(record.groups.every(group => Object.keys(group).sort().join() === 'manifest,sources')).toBe(true);
    const assets = Object.values(SYNTHETIC_ASSETS).flat();
    expect(record.payloadCount).toBe(assets.length);
    expect(record.payloadBytes).toBe(assets.reduce((sum, { id }) => sum + `payload:${id}`.length, 0));
    expect(record.key).toEqual(cacheKeyOf(record.groups[0].manifest.identity));
    expect(JSON.stringify(record)).not.toMatch(/"(complete|bytes|timestamp|createdAt|updatedAt)":/);
  });

  it('drops extra caller fields and reads back to the same manifests and source states', () => {
    for (const inputs of [syntheticPackage(), originalPackage()]) {
      const withExtra = inputs.map(input => ({ ...input, extra: 'private' }));
      const record = recordOf(withExtra);
      const read = readPackageRecord(structuredClone(record), record.key);
      expect(read.groups).toEqual(record.groups);
      expect(read.identity).toEqual(record.groups[0].manifest.identity);
      expect(read.key).toEqual(record.key);
      expect([read.payloadCount, read.payloadBytes]).toEqual([record.payloadCount, record.payloadBytes]);
      expect(JSON.stringify(record)).not.toContain('private');
    }
  });

  it('stores a payload view as exactly its own bytes', () => {
    const buffer = new Uint8Array([9, 9, 1, 2, 3, 9]);
    const offset = buildStoredPayload({ id: 'image/synthetic-hull' as never, schemaVersion: 1, bytes: buffer.subarray(2, 5) });
    expect([...new Uint8Array(offset.bytes)]).toEqual([1, 2, 3]);
    const whole = new Uint8Array([4, 5]);
    expect(buildStoredPayload({ id: 'image/synthetic-hull' as never, schemaVersion: 2, bytes: whole }))
      .toEqual({ schemaVersion: 2, bytes: whole.buffer });
  });

  it('never stores the pooled memory behind a Node Buffer', () => {
    const pooled = Buffer.from([7, 8, 9]);
    expect(pooled.buffer.byteLength).toBeGreaterThan(3);
    const { bytes } = buildStoredPayload({ id: 'image/synthetic-hull' as never, schemaVersion: 1, bytes: pooled });
    expect(bytes).not.toBe(pooled.buffer);
    expect([...new Uint8Array(bytes)]).toEqual([7, 8, 9]);
  });

  it('reads a stored payload into a fresh view for its Asset', () => {
    const read = readStoredPayload({ schemaVersion: 1, bytes: new Uint8Array([1, 2]).buffer }, 'image/synthetic-hull' as never);
    expect(read).toMatchObject({ id: 'image/synthetic-hull', schemaVersion: 1 });
    expect([...read.bytes]).toEqual([1, 2]);
  });
});

describe('stored package record reading', () => {
  const corrupt: [string, (record: Json) => unknown, string][] = [
    ['a non-record', () => 'record', 'record'],
    ['a record without a format', record => { delete record.format; return record; }, 'record'],
    ['a record without a format version', record => { delete record.formatVersion; return record; }, 'record'],
    ['a missing field', record => { delete record.payloadCount; return record; }, 'record.payloadCount'],
    ['an extra field', record => ({ ...record, complete: true }), 'record'],
    ['a missing group', record => ({ ...record, groups: groupsOf(record).slice(1) }), 'record.groups'],
    ['groups out of order', record => { const groups = groupsOf(record); return { ...record, groups: [groups[1], groups[0], ...groups.slice(2)] }; }, 'record.groups[0].manifest.group'],
    ['a group with an extra field', record => { at(record, 'groups', 2).extra = 1; return record; }, 'record.groups[2]'],
    ['a key other than the identity key', record => { at(record, 'key').converterVersion = 'synthetic-converter.9'; return record; }, 'record.key'],
    ['a malformed key', record => { at(record, 'key').originToken = 'source:disc'; return record; }, 'record.key.originToken'],
    ['identities that differ between groups', record => { at(record, 'groups', 3, 'manifest', 'identity').manifestIdentity = 'manifest:other'; return record; }, 'record.groups[3].manifest.identity'],
    ['a payload count other than the manifests declare', record => ({ ...record, payloadCount: Number(record.payloadCount) + 1 }), 'record.payloadCount'],
    ['payload bytes other than the manifests declare', record => ({ ...record, payloadBytes: Number(record.payloadBytes) - 1 }), 'record.payloadBytes'],
    ['a P2-01 read error', record => { at(record, 'groups', 1, 'manifest', 'assets', 0).id = 'Image/Bad'; return record; }, 'record.groups[1].manifest.assets[0].id'],
    ['malformed source states', record => { at(record, 'groups', 0).sources = { sourceFingerprint: null }; return record; }, 'record.groups[0].sources.states'],
    ['a groups array with an extra field', record => { const groups = groupsOf(record); return { ...record, groups: Object.assign([...groups], { extra: 1 }) }; }, 'record.groups'],
    ['a sparse groups array', record => { const groups = [...groupsOf(record)]; delete groups[1]; return { ...record, groups }; }, 'record.groups'],
    ['a non-record manifest', record => { at(record, 'groups', 1).manifest = 'manifest'; return record; }, 'record.groups[1].manifest'],
    ['swapped groups that are also a newer schema', record => {
      const groups = groupsOf(record);
      at(groups[1], 'manifest', 'identity').schemaVersion = 2;
      return { ...record, groups: [groups[1], groups[0], ...groups.slice(2)] };
    }, 'record.groups[0].manifest.group'],
  ];

  it.each(corrupt)('reads %s as cache-corrupt', (_name, change, location) => {
    const record = change(stored());
    const failure = failureOf(() => readPackageRecord(record));
    expect(failure).toMatchObject({ code: 'cache-corrupt', location });
    expect(cacheEntryOf(packageRecordKey(cacheKeyOf(recordOf(syntheticPackage()).groups[0].manifest.identity)), record))
      .toMatchObject({ status: 'corrupt', identity: null, payloadBytes: null });
  });

  it('keeps the P2-01 code of a read error as a diagnostic', () => {
    const record = stored();
    at(record, 'groups', 1, 'manifest', 'assets', 0).id = 'Image/Bad';
    expect(failureOf(() => readPackageRecord(record)).diagnostics.map(({ code }) => code)).toEqual(['invalid-asset-id']);
  });

  const incompatible: [string, (record: Json) => unknown, string][] = [
    ['an unknown format', record => ({ ...record, format: 'other-cache' }), 'record.format'],
    ['format version 2', record => ({ ...record, formatVersion: 2 }), 'record.formatVersion'],
    ['a future format with another shape', () => ({ format: 'osr-resource-cache', formatVersion: 2, chunks: [] }), 'record.formatVersion'],
    ['content schema 2', record => { at(record, 'groups', 0, 'manifest', 'identity').schemaVersion = 2; return record; }, 'record.groups[0].manifest.identity.schemaVersion'],
    ['slice definition version 2', record => { groupsOf(record).forEach(group => { at(group, 'manifest', 'identity').sliceDefinitionVersion = 2; }); return record; }, 'record.groups[0].manifest.identity.sliceDefinitionVersion'],
  ];

  it.each(incompatible)('reads %s as cache-incompatible', (_name, change, location) => {
    const record = change(stored());
    expect(failureOf(() => readPackageRecord(record))).toMatchObject({ code: 'cache-incompatible', location });
    const key = packageRecordKey(cacheKeyOf(recordOf(syntheticPackage()).groups[0].manifest.identity));
    expect(cacheEntryOf(key, record)).toEqual({ key: cacheKeyOf(recordOf(syntheticPackage()).groups[0].manifest.identity), status: 'incompatible', identity: null, payloadBytes: null });
  });

  it('rejects a stored key other than the record key', () => {
    const record = stored();
    const other = ['synthetic', 'another-fixture', 'synthetic-converter.1'];
    expect(failureOf(() => readPackageRecord(record, readPackageRecordKey(other)))).toMatchObject({ code: 'cache-corrupt', location: 'key' });
    expect(cacheEntryOf(other, record)).toMatchObject({ status: 'corrupt', key: { originToken: 'another-fixture' } });
    expect(cacheEntryOf('not-a-key', record)).toEqual({ key: null, status: 'corrupt', identity: null, payloadBytes: null });
  });

  it('lists a readable compatible record with its identity and declared bytes', () => {
    const record = recordOf(originalPackage());
    const entry = cacheEntryOf([...packageRecordKey(record.key)], structuredClone(record));
    expect(entry).toEqual({ key: record.key, status: 'compatible', identity: record.groups[0].manifest.identity, payloadBytes: record.payloadBytes });
    expect(Object.isFrozen(entry)).toBe(true);
  });

  it.each([
    ['a non-record', 'bytes', 'payloads[image/synthetic-hull]'],
    ['a missing field', { schemaVersion: 1 }, 'payloads[image/synthetic-hull].bytes'],
    ['an extra field', { schemaVersion: 1, bytes: new ArrayBuffer(1), id: 'x' }, 'payloads[image/synthetic-hull]'],
    ['a typed array instead of a buffer', { schemaVersion: 1, bytes: new Uint8Array(1) }, 'payloads[image/synthetic-hull].bytes'],
    ['schema version 0', { schemaVersion: 0, bytes: new ArrayBuffer(1) }, 'payloads[image/synthetic-hull].schemaVersion'],
    ['a fractional schema version', { schemaVersion: 1.5, bytes: new ArrayBuffer(1) }, 'payloads[image/synthetic-hull].schemaVersion'],
  ])('reads a payload record with %s as cache-corrupt', (_name, value, location) => {
    expect(failureOf(() => readStoredPayload(value, 'image/synthetic-hull' as never))).toMatchObject({ code: 'cache-corrupt', location });
  });

  it('round-trips into a package validatePackage accepts', () => {
    const record = recordOf(originalPackage());
    const read = readPackageRecord(structuredClone(record));
    const groups = read.groups.map(({ manifest, sources }) => ({
      manifest,
      sources,
      payloads: manifest.assets.map(({ id }) => readStoredPayload({ schemaVersion: 1, bytes: Uint8Array.from(`payload:${id}`, c => c.charCodeAt(0)).buffer }, id)),
    }));
    expect(validatePackage(CLASSIC_P2_SLICE, groups)).toMatchObject({ status: 'complete' });
  });
});

describe('group input reading', () => {
  it('fails with the requested code at the P2-01 path', () => {
    const inputs = syntheticPackage();
    (inputs[2].manifest as Json).group = 'unknown-group';
    expect(failureOf(() => readGroupInputs(inputs, 'package-incomplete')))
      .toMatchObject({ code: 'package-incomplete', location: 'groups[2].manifest.group' });
    expect(failureOf(() => readGroupInputs('groups', 'package-incomplete'))).toMatchObject({ code: 'invalid-request', location: 'groups' });
  });

  it('requires each defined group exactly once to order them', () => {
    const groups = readGroupInputs(syntheticPackage(), 'invalid-request');
    expect(failureOf(() => inDefinitionOrder(groups.slice(1), 'invalid-request'))).toMatchObject({ location: 'groups.logic' });
    expect(failureOf(() => inDefinitionOrder([...groups, groups[0]], 'invalid-request'))).toMatchObject({ location: 'groups.logic' });
  });
});

describe('storage requirement', () => {
  it('sums the actual payload bytes and adds a deterministic metadata estimate', () => {
    const inputs = originalPackage();
    const result = measureStorageRequirement(inputs);
    if ('status' in result) throw new Error(`unexpected ${result.code}`);
    const actual = inputs.flatMap(({ payloads }) => payloads).reduce((sum, { bytes }) => sum + bytes.byteLength, 0);
    expect(result.payloadBytes).toBe(actual);
    expect(result.metadataBytes).toBeGreaterThan(0);
    expect(result.requiredBytes).toBe(result.payloadBytes + result.metadataBytes);
    expect(measureStorageRequirement(originalPackage())).toEqual(result);
    expect(measureStorageRequirement([...inputs].reverse())).toEqual(result);
  });

  it('grows with the payload bytes but not the metadata when payloads grow', () => {
    const small = measureStorageRequirement(syntheticPackage());
    const big = syntheticPackage();
    big[1] = syntheticGroup('models', SYNTHETIC_ASSETS.models.map(spec => ({ ...spec, bytes: new Uint8Array(1000) })));
    const large = measureStorageRequirement(big);
    if ('status' in small || 'status' in large) throw new Error('unexpected failure');
    expect(large.payloadBytes - small.payloadBytes).toBe(SYNTHETIC_ASSETS.models.reduce((sum, { id }) => sum + 1000 - `payload:${id}`.length, 0));
    expect(Math.abs(large.metadataBytes - small.metadataBytes)).toBeLessThan(2 * 100 * SYNTHETIC_ASSETS.models.length);
  });

  it.each([
    ['a non-array', 'groups', 'groups'],
    ['a missing group', syntheticPackage().slice(1), 'groups.logic'],
    ['a malformed manifest', [{ ...syntheticPackage()[0], manifest: {} }, ...syntheticPackage().slice(1)], 'groups[0].manifest.identity'],
    ['a non-object group', [null, ...syntheticPackage().slice(1)], 'groups[0]'],
  ])('rejects %s as invalid-request', (_name, inputs, location) => {
    expect(measureStorageRequirement(inputs)).toMatchObject({ status: 'failed', code: 'invalid-request', location });
  });

  it('rejects totals beyond the safe integer range', () => {
    class Huge extends Uint8Array {
      override get byteLength(): number { return Number.MAX_SAFE_INTEGER; }
    }
    const inputs = syntheticPackage();
    inputs[3].payloads = inputs[3].payloads.map(payload => ({ ...payload, bytes: new Huge(1) }));
    expect(measureStorageRequirement(inputs)).toMatchObject({ status: 'failed', code: 'invalid-request', location: 'groups' });
  });

  it('measures but never validates package completeness', () => {
    const inputs = syntheticPackage();
    inputs[0].payloads[0].bytes = new Uint8Array([1]);
    expect(diagnosticCodes(validatePackage(CLASSIC_P2_SLICE, inputs))).not.toEqual([]);
    expect(measureStorageRequirement(inputs)).not.toHaveProperty('status');
  });
});
