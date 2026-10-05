import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  readContentIdentity, readContentOrigin, readPayloadIdentity,
  type ContentOrigin, type ContentSchemaVersion, type ConverterVersion, type FixtureId, type ManifestIdentity,
  type PayloadFingerprint,   type PayloadSchemaVersion, type SliceDefinitionVersion, type SourceFingerprint,
} from './content-identity.ts';

const fingerprint = `sha256:${'a'.repeat(64)}`;
const payload = () => ({ schemaVersion: 1, byteLength: 0, fingerprint });
const identity = () => ({
  schemaVersion: 1,
  sliceId: 'classic-p2-slice',
  sliceDefinitionVersion: 1,
  converterVersion: 'synthetic-converter:1.0',
  manifestIdentity: 'synthetic-manifest:1',
  origin: { type: 'synthetic', fixtureId: 'contract-test-1' },
});

describe('separate content and payload identities', () => {
  it('preserves every field as cloneable, deeply frozen, isolated data', () => {
    const input = identity();
    const result = readContentIdentity(input);
    expect(result).toEqual(input);
    expect(structuredClone(result)).toEqual(input);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.origin)).toBe(true);
    input.origin.fixtureId = 'changed';
    input.converterVersion = 'changed';
    expect(result.origin).toEqual({ type: 'synthetic', fixtureId: 'contract-test-1' });
    expect(result.converterVersion).toBe('synthetic-converter:1.0');
    expect(Reflect.set(result.origin, 'fixtureId', 'changed')).toBe(false);
    const clone = structuredClone(result);
    expect(Reflect.set(clone.origin, 'fixtureId', 'changed')).toBe(true);
    expect(result.origin).not.toEqual(clone.origin);
    expect(readContentIdentity(identity())).toEqual(result);
  });

  it('keeps schema, definition, converter, manifest, source and payload brands distinct', () => {
    expectTypeOf<ContentSchemaVersion>().not.toExtend<SliceDefinitionVersion>();
    expectTypeOf<ContentSchemaVersion>().not.toExtend<PayloadSchemaVersion>();
    expectTypeOf<ConverterVersion>().not.toExtend<ManifestIdentity>();
    expectTypeOf<FixtureId>().not.toExtend<SourceFingerprint>();
    expectTypeOf<SourceFingerprint>().not.toExtend<PayloadFingerprint>();
  });

  it('lets neither origin take the other origin\'s field shape at the type level', () => {
    expectTypeOf<{ type: 'synthetic'; sourceFingerprint: SourceFingerprint }>().not.toExtend<ContentOrigin>();
    expectTypeOf<{ type: 'synthetic'; fixtureId: SourceFingerprint }>().not.toExtend<ContentOrigin>();
    expectTypeOf<{ type: 'original-import'; fixtureId: FixtureId }>().not.toExtend<ContentOrigin>();
    expectTypeOf<{ type: 'original-import'; sourceFingerprint: FixtureId }>().not.toExtend<ContentOrigin>();
    expectTypeOf<{ type: 'original-import'; sourceFingerprint: string }>().not.toExtend<ContentOrigin>();
    // Named values skip excess-property checks, so each origin must exclude the other's field.
    expectTypeOf<{ type: 'synthetic'; fixtureId: FixtureId; sourceFingerprint: SourceFingerprint }>().not.toExtend<ContentOrigin>();
    expectTypeOf<{ type: 'original-import'; sourceFingerprint: SourceFingerprint; fixtureId: FixtureId }>().not.toExtend<ContentOrigin>();
    expectTypeOf<{ type: 'synthetic'; fixtureId: FixtureId }>().toExtend<ContentOrigin>();
    expectTypeOf<{ type: 'original-import'; sourceFingerprint: SourceFingerprint }>().toExtend<ContentOrigin>();
  });

  it('checks source representation without claiming provenance or manufacturing a hash', () => {
    const origin = { type: 'original-import', sourceFingerprint: 'source:synthetic-test-token' };
    expect(readContentOrigin(origin)).toEqual(origin);
    expect(readContentIdentity({ ...identity(), origin }).origin).toEqual(origin);
    expect(structuredClone(readContentOrigin(origin))).toEqual(origin);
    expect(readPayloadIdentity(payload())).toEqual(payload());
    expect(structuredClone(readPayloadIdentity(payload()))).toEqual(payload());
    expect(readPayloadIdentity({ ...payload(), schemaVersion: Number.MAX_SAFE_INTEGER, byteLength: Number.MAX_SAFE_INTEGER }))
      .toMatchObject({ schemaVersion: Number.MAX_SAFE_INTEGER, byteLength: Number.MAX_SAFE_INTEGER });
    expect(readContentIdentity({ ...identity(), sliceDefinitionVersion: Number.MAX_SAFE_INTEGER }).sliceDefinitionVersion).toBe(Number.MAX_SAFE_INTEGER);
    expect(Object.is(readPayloadIdentity({ ...payload(), byteLength: -0 }).byteLength, 0)).toBe(true);
  });

  const invalidIntegers: unknown[] = [undefined, null, '1', true, 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, {}, () => 1];
  it.each(invalidIntegers)('rejects invalid version %# in all numeric version fields', version => {
    for (const field of ['schemaVersion', 'sliceDefinitionVersion']) {
      expect(() => readContentIdentity({ ...identity(), [field]: version }))
        .toThrowError(expect.objectContaining({ code: 'invalid-version', path: `identity.${field}` }));
    }
    expect(() => readPayloadIdentity({ ...payload(), schemaVersion: version }))
      .toThrowError(expect.objectContaining({ code: 'invalid-version', path: 'payloadIdentity.schemaVersion' }));
  });

  it('rejects unsupported schema and unknown slice without choosing a candidate', () => {
    expect(() => readContentIdentity({ ...identity(), schemaVersion: 2 }))
      .toThrowError(expect.objectContaining({ code: 'unsupported-schema', path: 'identity.schemaVersion' }));
    expect(() => readContentIdentity({ ...identity(), sliceId: 'another-slice' }))
      .toThrowError(expect.objectContaining({ code: 'invalid-slice-id', path: 'identity.sliceId' }));
  });

  it.each([undefined, null, 1, {}, [], () => 'id', '', ' ', '../private', '/private/source', 'https://test', 'UPPER', 'id--test', 'id\n', '\u0430'])(
    'rejects invalid converter/manifest token %#', value => {
      for (const field of ['converterVersion', 'manifestIdentity']) {
        expect(() => readContentIdentity({ ...identity(), [field]: value }))
          .toThrowError(expect.objectContaining({ code: 'invalid-identity', path: `identity.${field}` }));
      }
    },
  );

  it.each([undefined, null, '0', true, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, {}, () => 0])('rejects invalid byte length %#', byteLength => {
    expect(() => readPayloadIdentity({ ...payload(), byteLength }))
      .toThrowError(expect.objectContaining({ code: 'invalid-payload-identity', path: 'payloadIdentity.byteLength' }));
  });

  it.each([
    undefined, null, 1, {}, () => fingerprint, '', 'fnv1a64:0000000000000000',
    `sha256:${'a'.repeat(63)}`, `sha256:${'a'.repeat(65)}`, `sha256:${'A'.repeat(64)}`,
    `sha256:${'g'.repeat(64)}`, `SHA256:${'a'.repeat(64)}`, `${fingerprint}\n`, ` ${fingerprint}`,
  ])('rejects malformed payload fingerprint %#', value => {
    expect(() => readPayloadIdentity({ ...payload(), fingerprint: value }))
      .toThrowError(expect.objectContaining({ code: 'invalid-payload-identity', path: 'payloadIdentity.fingerprint' }));
  });

  it.each<[Record<string, unknown>, string, string]>([
    [{}, 'invalid-origin', 'origin.type'],
    [{ type: 'other' }, 'invalid-origin', 'origin.type'],
    [{ type: 'synthetic' }, 'invalid-record', 'origin.fixtureId'],
    [{ type: 'original-import' }, 'invalid-record', 'origin.sourceFingerprint'],
    [{ type: 'synthetic', sourceFingerprint: 'source:test' }, 'invalid-record', 'origin.fixtureId'],
    [{ type: 'original-import', fixtureId: 'test' }, 'invalid-record', 'origin.sourceFingerprint'],
    [{ type: 'synthetic', fixtureId: 'test', sourceFingerprint: 'source:test' }, 'invalid-record', 'origin'],
    [{ type: 'original-import', sourceFingerprint: 'source:test', fixtureId: 'test' }, 'invalid-record', 'origin'],
    [{ type: 'synthetic', fixtureId: 'source:test' }, 'invalid-identity', 'origin.fixtureId'],
  ])('rejects missing or mixed origin %j with a stable code', (value, code, path) => {
    expect(() => readContentOrigin(value)).toThrowError(expect.objectContaining({ code, path }));
  });

  it.each(['test-fixture', 'SR.NOB', 'volume-label', 'fnv1a64:0123456789abcdef', 'source:', 'source:test\n', 'source:../private', '\u0430'])(
    'rejects source fingerprint %j that is not an opaque source: identity',
    sourceFingerprint => {
      expect(() => readContentOrigin({ type: 'original-import', sourceFingerprint }))
        .toThrowError(expect.objectContaining({ code: 'invalid-identity', path: 'origin.sourceFingerprint' }));
    },
  );

  it('rejects missing fields rather than defaulting versions or identities', () => {
    for (const field of Object.keys(identity())) {
      const input: Record<string, unknown> = identity();
      delete input[field];
      expect(() => readContentIdentity(input)).toThrowError(expect.objectContaining({ code: 'invalid-record', path: `identity.${field}` }));
    }
    for (const field of Object.keys(payload())) {
      const input: Record<string, unknown> = payload();
      delete input[field];
      expect(() => readPayloadIdentity(input)).toThrowError(expect.objectContaining({ code: 'invalid-record', path: `payloadIdentity.${field}` }));
    }
  });

  it('rejects classes, functions, host-like values, accessors and unknown fields without echoing them', () => {
    class IdentityRecord { constructor() { Object.assign(this, identity()); } }
    class OriginRecord { type = 'synthetic'; fixtureId = 'test'; }
    class PayloadRecord { schemaVersion = 1; byteLength = 0; fingerprint = fingerprint; }
    for (const value of [new IdentityRecord(), [], new Map(), new Uint8Array(0), () => identity(), Object.create(identity())]) {
      expect(() => readContentIdentity(value)).toThrowError(expect.objectContaining({ code: 'invalid-record', path: 'identity' }));
    }
    expect(() => readContentOrigin(new OriginRecord())).toThrowError(expect.objectContaining({ code: 'invalid-record', path: 'origin' }));
    expect(() => readPayloadIdentity(new PayloadRecord())).toThrowError(expect.objectContaining({ code: 'invalid-record', path: 'payloadIdentity' }));
    const accessor = { ...identity() };
    Object.defineProperty(accessor, 'origin', { get: () => { throw new Error('Getter must not run'); } });
    expect(() => readContentIdentity(accessor)).toThrowError(expect.objectContaining({ code: 'invalid-record', path: 'identity' }));
    for (const extra of [{ ['/private/source']: () => 1 }, { [Symbol('private')]: 1 }, { complete: true }]) {
      expect(() => readContentIdentity({ ...identity(), ...extra }))
        .toThrowError(expect.objectContaining({ code: 'invalid-record', path: 'identity' }));
    }
    const hidden = Object.defineProperty(identity(), 'hidden', { value: 1 });
    expect(() => readContentIdentity(hidden)).toThrowError(expect.objectContaining({ code: 'invalid-record', path: 'identity' }));
    expect(readContentIdentity(Object.assign(Object.create(null), identity()))).toEqual(identity());
  });
});
