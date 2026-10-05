import { readAssetId, type AssetId } from './asset-id.ts';
import { readSourceFingerprint, type SourceFingerprint } from './content-identity.ts';
import { compareText, fail, matchesWhole, readOrderedArray, readRecord, requireFields } from './contract-validation.ts';

/**
 * Readiness of one Asset's original source. `original-data` derives it from its source mapping, so
 * completeness validation can use it without seeing locators. Only `verified` is ready.
 */
const SOURCE_STATES = Object.freeze(['verified', 'unverified', 'unconfirmed', 'conflict'] as const);
export type SourceState = typeof SOURCE_STATES[number];

export interface AssetSourceState {
  readonly id: AssetId;
  readonly state: SourceState;
  /** U-### register items behind the mapping. */
  readonly unknowns: readonly string[];
}

const SOURCE_CODES = Object.freeze({ invalid: 'invalid-source-mapping', duplicate: 'duplicate-mapping', order: 'mapping-order' } as const);

function readUnknownId(value: unknown, path: string): string {
  if (!matchesWhole(value, /^U-\d{3}$/)) fail('invalid-source-mapping', path, 'must be a U-### register ID');
  return value;
}

/** Reads unique ascending U-### items. */
export function readUnknownIds(value: unknown, path: string, minimum = 0): readonly string[] {
  return readOrderedArray(value, path, SOURCE_CODES, readUnknownId, item => item, compareText, minimum);
}

/** States of one fingerprinted source; null fingerprint means the mappings were not verified against a source. */
export interface SourceStateSet {
  readonly sourceFingerprint: SourceFingerprint | null;
  /** Ascending unique Asset IDs. */
  readonly states: readonly AssetSourceState[];
}

export function readSourceStateSet(value: unknown, path = 'sources'): SourceStateSet {
  const record = readRecord(value, path);
  requireFields(record, path, ['sourceFingerprint', 'states']);
  return Object.freeze({
    sourceFingerprint: record.sourceFingerprint === null ? null : readSourceFingerprint(record.sourceFingerprint, `${path}.sourceFingerprint`),
    states: readAssetSourceStates(record.states, `${path}.states`),
  });
}

function readAssetSourceStates(value: unknown, path: string): readonly AssetSourceState[] {
  return readOrderedArray(value, path, SOURCE_CODES, (item, at) => {
    const record = readRecord(item, at);
    requireFields(record, at, ['id', 'state', 'unknowns']);
    if (!SOURCE_STATES.some(state => state === record.state)) {
      fail('invalid-source-mapping', `${at}.state`, 'must be verified, unverified, unconfirmed or conflict');
    }
    return Object.freeze({
      id: readAssetId(record.id, `${at}.id`),
      state: record.state as SourceState,
      unknowns: readUnknownIds(record.unknowns, `${at}.unknowns`),
    });
  }, state => state.id, (left, right) => compareText(left.id, right.id));
}
