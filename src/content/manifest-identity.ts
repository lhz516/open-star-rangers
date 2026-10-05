import { readResourceGroup, type AssetDescriptor, type ResourceGroup } from './asset-contract.ts';
import { readVersion, type ManifestIdentity } from './content-identity.ts';
import { fail, readOrderedArray, readRecord, requireFields } from './contract-validation.ts';
import { readManifestAssets } from './manifest.ts';
import { Sha256 } from './sha256.ts';
import type { SliceDefinition } from './slice-definition.ts';
import { readSourceStateSet, type SourceStateSet } from './source-state.ts';

// Package-level manifest identity (P2-08 S-06). One value covers every group of a package; payload bytes are covered
// through their fingerprints, not hashed again.

/** Versions the canonical serialization itself; changing it changes every identity. */
const SERIALIZATION_TAG = 'osr-manifest-identity-1';

/** One group of a package before its manifest identity exists: descriptors in manifest order and its source states. */
export interface ManifestGroupDraft {
  readonly group: ResourceGroup;
  readonly assets: readonly AssetDescriptor[];
  readonly sources: SourceStateSet | null;
}

export interface ManifestIdentityInput {
  /** The content schema version the manifests declare. */
  readonly schemaVersion: number;
  /** Each group once, in the slice definition's group order. */
  readonly groups: readonly ManifestGroupDraft[];
}

const GROUP_CODES = Object.freeze({ invalid: 'invalid-record', duplicate: 'duplicate-group', order: 'group-order' } as const);

function readGroupDraft(definition: SliceDefinition, value: unknown, path: string): ManifestGroupDraft {
  const record = readRecord(value, path);
  requireFields(record, path, ['group', 'assets', 'sources']);
  const group = readResourceGroup(record.group, `${path}.group`);
  if (!definition.groups.includes(group)) fail('invalid-resource-group', `${path}.group`, 'must be a group of the slice definition');
  return Object.freeze({
    group,
    assets: readManifestAssets(record.assets, `${path}.assets`),
    sources: record.sources === null ? null : readSourceStateSet(record.sources, `${path}.sources`),
  });
}

/**
 * The canonical serialization: a JSON array whose every position is fixed, so it never depends on property order, and
 * whose strings are quoted and escaped, so no field boundary is ambiguous.
 */
function canonicalText(definition: SliceDefinition, schemaVersion: number, groups: readonly ManifestGroupDraft[]): string {
  return JSON.stringify([
    SERIALIZATION_TAG, definition.sliceId, definition.version, schemaVersion,
    groups.map(({ group, assets, sources }) => [
      group,
      assets.map(asset => [
        asset.id, asset.kind, asset.role, asset.group,
        asset.dependencies.map(dependency => [dependency.id, dependency.kind]),
        [asset.payloadIdentity.schemaVersion, asset.payloadIdentity.byteLength, asset.payloadIdentity.fingerprint],
      ]),
      sources === null ? null : [sources.sourceFingerprint, sources.states.map(({ id, state, unknowns }) => [id, state, unknowns])],
    ]),
  ]);
}

/** UTF-16LE code units of the text, independent of the host byte order. */
function utf16le(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < text.length; index++) view.setUint16(index * 2, text.charCodeAt(index), true);
  return bytes;
}

/**
 * Computes `manifest:sha256:<64 hex>` over the slice ID and definition version, the schema version, and each group's
 * name, descriptors (ID, kind, role, group, dependencies, payload identity) and source states (fingerprint and each
 * Asset's ID, state and U items). Input is read with the P2-01 readers; groups are unique and in definition order.
 */
export function computeManifestIdentity(definition: SliceDefinition, input: unknown, path = 'package'): ManifestIdentity {
  const record = readRecord(input, path);
  requireFields(record, path, ['schemaVersion', 'groups']);
  const schemaVersion = readVersion(record.schemaVersion, `${path}.schemaVersion`);
  const order = (group: ResourceGroup) => definition.groups.indexOf(group);
  const groups = readOrderedArray(record.groups, `${path}.groups`, GROUP_CODES, (item, at) => readGroupDraft(definition, item, at),
    draft => draft.group, (left, right) => order(left.group) - order(right.group), 1);
  const hex = new Sha256().update(utf16le(canonicalText(definition, schemaVersion, groups))).digestHex();
  return `manifest:sha256:${hex}` as ManifestIdentity;
}
