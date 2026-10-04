import { fail, matchesWhole } from './contract-validation.ts';

export const ASSET_KINDS = Object.freeze(['mission', 'model', 'image', 'palette', 'font', 'layout', 'sound', 'data'] as const);
export type AssetKind = typeof ASSET_KINDS[number];

declare const assetIdBrand: unique symbol;
export type AssetId = string & { readonly [assetIdBrand]: 'AssetId' };

export const ASSET_ID_LIMITS = Object.freeze({ segments: 8, segmentLength: 32, totalLength: 128 });

export function readAssetKind(value: unknown, path = 'kind'): AssetKind {
  if (typeof value !== 'string' || !ASSET_KINDS.some(kind => kind === value)) {
    fail('invalid-kind', path, 'must be a known Asset kind');
  }
  return value as AssetKind;
}

/** Identity syntax only: semantic naming and source mapping remain the producer's responsibility. */
export function readAssetId(value: unknown, path = 'assetId'): AssetId {
  if (typeof value !== 'string' || value.length > ASSET_ID_LIMITS.totalLength) {
    fail('invalid-asset-id', path, 'must be an ASCII semantic path of at most 128 characters');
  }
  const segments = value.split('/');
  if (segments.length < 2 || segments.length > ASSET_ID_LIMITS.segments) {
    fail('invalid-asset-id', path, 'must have 2 to 8 segments including kind');
  }
  for (const segment of segments) {
    if (segment.length > ASSET_ID_LIMITS.segmentLength || !matchesWhole(segment, /^[a-z0-9]+(?:-[a-z0-9]+)*$/)) {
      fail('invalid-asset-id', path, 'must have nonempty ASCII segments of at most 32 characters with single internal hyphens');
    }
  }
  readAssetKind(segments[0], path);
  return value as AssetId;
}
