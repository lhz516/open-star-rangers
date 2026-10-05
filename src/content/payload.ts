import { readAssetId, type AssetId } from './asset-id.ts';
import type { PayloadIdentity } from './content-identity.ts';
import { compareText, fail, readOrderedArray, readRecord, requireFields } from './contract-validation.ts';
import { isDetached } from './ownership.ts';
import { sha256Fingerprint } from './sha256.ts';

/** An actual converted payload offered for validation; validation hashes the bytes but never retains them. */
export interface PayloadRecord {
  readonly id: AssetId;
  readonly schemaVersion: number;
  readonly bytes: Uint8Array;
}

const PAYLOAD_CODES = Object.freeze({ invalid: 'invalid-record', duplicate: 'duplicate-payload', order: 'payload-order' } as const);

/** Reads payload records in ascending unique Asset ID order, one per Asset. */
export function readPayloadRecords(value: unknown, path = 'payloads'): readonly PayloadRecord[] {
  return readOrderedArray(value, path, PAYLOAD_CODES, (item, at) => {
    const record = readRecord(item, at);
    requireFields(record, at, ['id', 'schemaVersion', 'bytes']);
    if (typeof record.schemaVersion !== 'number' || !Number.isSafeInteger(record.schemaVersion) || record.schemaVersion <= 0) {
      fail('invalid-payload-identity', `${at}.schemaVersion`, 'must be a positive safe integer');
    }
    if (!(record.bytes instanceof Uint8Array)) fail('invalid-record', `${at}.bytes`, 'must be a Uint8Array');
    if (isDetached(record.bytes.buffer)) fail('payload-detached', `${at}.bytes`, 'was transferred away and can no longer be used');
    return Object.freeze({ id: readAssetId(record.id, `${at}.id`), schemaVersion: record.schemaVersion, bytes: record.bytes });
  }, payload => payload.id, (left, right) => compareText(left.id, right.id));
}

/** Names the first declared identity field the actual payload fails, or null when version, length and SHA-256 match. */
export function payloadMismatch(declared: PayloadIdentity, payload: PayloadRecord): 'schema version' | 'byte length' | 'fingerprint' | null {
  if (payload.schemaVersion !== declared.schemaVersion) return 'schema version';
  if (payload.bytes.byteLength !== declared.byteLength) return 'byte length';
  return sha256Fingerprint(payload.bytes) === declared.fingerprint ? null : 'fingerprint';
}
