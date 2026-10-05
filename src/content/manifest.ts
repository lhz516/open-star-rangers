import { readAssetDescriptor, readResourceGroup, type AssetDescriptor, type ResourceGroup } from './asset-contract.ts';
import { readContentIdentity, type ContentIdentity } from './content-identity.ts';
import { compareText, readOrderedArray, readRecord, requireFields, visitOrderedArray } from './contract-validation.ts';

/** One resource group's manifest: identity, group and descriptors in ascending unique Asset ID order. */
export interface GroupManifest {
  readonly identity: ContentIdentity;
  readonly group: ResourceGroup;
  readonly assets: readonly AssetDescriptor[];
}

const ASSET_CODES = Object.freeze({ invalid: 'invalid-record', duplicate: 'duplicate-asset', order: 'asset-order' } as const);
const assetKey = (asset: AssetDescriptor): string => asset.id;
const compareAssets = (left: AssetDescriptor, right: AssetDescriptor): number => compareText(left.id, right.id);

function readManifestRecord(value: unknown, path: string): { identity: ContentIdentity; group: ResourceGroup; assets: unknown } {
  const record = readRecord(value, path);
  requireFields(record, path, ['identity', 'group', 'assets']);
  const identity = readContentIdentity(record.identity, `${path}.identity`);
  return { identity, group: readResourceGroup(record.group, `${path}.group`), assets: record.assets };
}

export function readGroupManifest(value: unknown, path = 'manifest'): GroupManifest {
  const { identity, group, assets } = readManifestRecord(value, path);
  return Object.freeze({ identity, group, assets: readManifestAssets(assets, `${path}.assets`) });
}

/** Reads manifest descriptors: each one checked, in ascending unique Asset ID order. */
export function readManifestAssets(value: unknown, path: string): readonly AssetDescriptor[] {
  return readOrderedArray(value, path, ASSET_CODES, readAssetDescriptor, assetKey, compareAssets);
}

/**
 * Checks the manifest like `readGroupManifest`, but visits each checked descriptor instead of collecting it. Reading
 * stops at the first descriptor whose visit returns a value other than undefined, and that value is returned.
 */
export function visitGroupManifest<R>(
  value: unknown,
  path: string,
  visit: (asset: AssetDescriptor, path: string) => R | undefined,
): R | undefined {
  const { assets } = readManifestRecord(value, path);
  return visitOrderedArray(assets, `${path}.assets`, ASSET_CODES, readAssetDescriptor, assetKey, compareAssets, visit);
}
