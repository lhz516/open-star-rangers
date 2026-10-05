import { fail, matchesWhole, readRecord, requireFields } from './contract-validation.ts';

declare const identityBrand: unique symbol;
type Identity<T, Name extends string> = T & { readonly [identityBrand]: Name };

export type ContentSchemaVersion = Identity<number, 'ContentSchemaVersion'>;
export type SliceDefinitionVersion = Identity<number, 'SliceDefinitionVersion'>;
export type ConverterVersion = Identity<string, 'ConverterVersion'>;
export type FixtureId = Identity<string, 'FixtureId'>;
export type SourceFingerprint = Identity<string, 'SourceFingerprint'>;
export type ManifestIdentity = Identity<string, 'ManifestIdentity'>;
export type PayloadSchemaVersion = Identity<number, 'PayloadSchemaVersion'>;
export type PayloadFingerprint = Identity<string, 'PayloadFingerprint'>;

export const CONTENT_SCHEMA_VERSION = 1;
export const SLICE_ID = 'classic-p2-slice';
export type SliceId = typeof SLICE_ID;

/**
 * Each origin excludes the other's field, so a value carrying both cannot pass as either at the type level.
 * Without `exactOptionalPropertyTypes` an explicit `undefined` still type-checks; it carries no identity, and
 * `readContentOrigin` rejects any extra field at runtime.
 */
export type ContentOrigin =
  | { readonly type: 'synthetic'; readonly fixtureId: FixtureId; readonly sourceFingerprint?: never }
  | { readonly type: 'original-import'; readonly sourceFingerprint: SourceFingerprint; readonly fixtureId?: never };

export interface ContentIdentity {
  readonly schemaVersion: ContentSchemaVersion;
  readonly sliceId: SliceId;
  readonly sliceDefinitionVersion: SliceDefinitionVersion;
  readonly converterVersion: ConverterVersion;
  readonly manifestIdentity: ManifestIdentity;
  readonly origin: ContentOrigin;
}

export interface PayloadIdentity {
  readonly schemaVersion: PayloadSchemaVersion;
  readonly byteLength: number;
  readonly fingerprint: PayloadFingerprint;
}

/** One comparable key over the six content identity fields: equal keys mean the same package identity. */
export const contentIdentityKey = ({ schemaVersion, sliceId, sliceDefinitionVersion, converterVersion, manifestIdentity, origin }: ContentIdentity): string =>
  [schemaVersion, sliceId, sliceDefinitionVersion, converterVersion, manifestIdentity, origin.type,
    origin.type === 'synthetic' ? origin.fixtureId : origin.sourceFingerprint].join('\u0000');

const OPAQUE_TOKEN = /^[a-z0-9]+(?:[-.:][a-z0-9]+)*$/;

function readVersion(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    fail('invalid-version', path, 'must be a positive safe integer');
  }
  return value;
}

function readToken(value: unknown, path: string): string {
  if (!matchesWhole(value, OPAQUE_TOKEN)) fail('invalid-identity', path, 'must be a nonempty restricted ASCII identity');
  return value;
}

/** Validates the converter version token as `readContentIdentity` does, for consumers that receive it alone. */
export function readConverterVersion(value: unknown, path = 'converterVersion'): ConverterVersion {
  return readToken(value, path) as ConverterVersion;
}

/** Validates representation, not provenance. P2-03 must produce verified source fingerprints. */
export function readSourceFingerprint(value: unknown, path = 'sourceFingerprint'): SourceFingerprint {
  if (!matchesWhole(value, /^source:[a-z0-9]+(?:[-.:][a-z0-9]+)*$/)) {
    fail('invalid-identity', path, 'must be a source: identity, not a fixture, filename or state hash');
  }
  return value as SourceFingerprint;
}

/** Validates a synthetic fixture token; it has no fingerprint namespace, so a source fingerprint never passes. */
export function readFixtureId(value: unknown, path = 'fixtureId'): FixtureId {
  if (!matchesWhole(value, /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/)) {
    fail('invalid-identity', path, 'must be a nonempty ASCII fixture token without a fingerprint namespace');
  }
  return value as FixtureId;
}

/** Validates representation, not provenance. P2-03 must produce verified source fingerprints. */
export function readContentOrigin(value: unknown, path = 'origin'): ContentOrigin {
  const record = readRecord(value, path);
  switch (record.type) {
    case 'synthetic': {
      requireFields(record, path, ['type', 'fixtureId']);
      return Object.freeze({ type: 'synthetic', fixtureId: readFixtureId(record.fixtureId, `${path}.fixtureId`) });
    }
    case 'original-import': {
      requireFields(record, path, ['type', 'sourceFingerprint']);
      return Object.freeze({ type: 'original-import', sourceFingerprint: readSourceFingerprint(record.sourceFingerprint, `${path}.sourceFingerprint`) });
    }
    default: return fail('invalid-origin', `${path}.type`, 'must be synthetic or original-import');
  }
}

/** No slice selection or manifest identity generation is performed here. */
export function readContentIdentity(value: unknown, path = 'identity'): ContentIdentity {
  const record = readRecord(value, path);
  requireFields(record, path, ['schemaVersion', 'sliceId', 'sliceDefinitionVersion', 'converterVersion', 'manifestIdentity', 'origin']);
  const schemaVersion = readVersion(record.schemaVersion, `${path}.schemaVersion`);
  if (schemaVersion !== CONTENT_SCHEMA_VERSION) fail('unsupported-schema', `${path}.schemaVersion`, 'must be the supported content schema');
  if (record.sliceId !== SLICE_ID) fail('invalid-slice-id', `${path}.sliceId`, 'must be the known slice identity');
  return Object.freeze({
    schemaVersion: schemaVersion as ContentSchemaVersion,
    sliceId: SLICE_ID,
    sliceDefinitionVersion: readVersion(record.sliceDefinitionVersion, `${path}.sliceDefinitionVersion`) as SliceDefinitionVersion,
    converterVersion: readConverterVersion(record.converterVersion, `${path}.converterVersion`),
    manifestIdentity: readToken(record.manifestIdentity, `${path}.manifestIdentity`) as ManifestIdentity,
    origin: readContentOrigin(record.origin, `${path}.origin`),
  });
}

/** Checks declared identity only; future converters must hash and verify actual payload bytes. */
export function readPayloadIdentity(value: unknown, path = 'payloadIdentity'): PayloadIdentity {
  const record = readRecord(value, path);
  requireFields(record, path, ['schemaVersion', 'byteLength', 'fingerprint']);
  const schemaVersion = readVersion(record.schemaVersion, `${path}.schemaVersion`);
  if (typeof record.byteLength !== 'number' || !Number.isSafeInteger(record.byteLength) || record.byteLength < 0) {
    fail('invalid-payload-identity', `${path}.byteLength`, 'must be a nonnegative safe integer byte length');
  }
  if (!matchesWhole(record.fingerprint, /^sha256:[0-9a-f]{64}$/)) {
    fail('invalid-payload-identity', `${path}.fingerprint`, 'must be sha256: followed by exactly 64 lowercase hexadecimal characters');
  }
  return Object.freeze({
    schemaVersion: schemaVersion as PayloadSchemaVersion,
    byteLength: record.byteLength + 0,
    fingerprint: record.fingerprint as PayloadFingerprint,
  });
}
