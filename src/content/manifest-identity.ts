import { RESOURCE_GROUPS, readResourceGroup, type AssetDescriptor, type ResourceGroup } from './asset-contract.ts';
import { readContentIdentityBasis, type ContentIdentityBasis, type ManifestIdentity } from './content-identity.ts';
import { fail, readArray, readRecord, requireFields } from './contract-validation.ts';
import { readAssetDescriptors, type GroupManifest } from './manifest.ts';
import { readPayloadRecords, type PayloadRecord } from './payload.ts';
import { Sha256 } from './sha256.ts';
import { readSourceStateSet, type SourceStateSet } from './source-state.ts';

/** One converted group before its package identity is known: descriptors, the payloads they describe and sources. */
export interface GroupDraft {
  readonly group: ResourceGroup;
  /** Ascending unique Asset ID order, as in a group manifest. */
  readonly assets: readonly AssetDescriptor[];
  readonly payloads: readonly PayloadRecord[];
  /** Locator-free source states for original imports; null for synthetic content. */
  readonly sources: SourceStateSet | null;
}

/** A group with the package identity written into its manifest; it is a `GroupInput` for completeness validation. */
export interface IdentifiedGroup {
  readonly manifest: GroupManifest;
  readonly payloads: readonly PayloadRecord[];
  readonly sources: SourceStateSet | null;
}

/** The identity-bearing part of a draft; payloads stay unread, keeping the caller's index for their path. */
interface IdentityDraft {
  readonly index: number;
  readonly group: ResourceGroup;
  readonly assets: readonly AssetDescriptor[];
  readonly sources: SourceStateSet | null;
  readonly payloads: unknown;
}

/** Version of the encoding below; any change to it changes every identity, so it is part of the hashed text. */
const ENCODING = 'osr-manifest-identity:1';

/** Reads the drafts into frozen copies in `RESOURCE_GROUPS` order, so the caller's order never matters. */
function readDrafts(value: unknown, path: string): readonly IdentityDraft[] {
  const byGroup = new Map<ResourceGroup, IdentityDraft>();
  readArray(value, path, 'invalid-record', (item, at) => {
    const record = readRecord(item, at);
    requireFields(record, at, ['group', 'assets', 'payloads', 'sources']);
    const group = readResourceGroup(record.group, `${at}.group`);
    if (byGroup.has(group)) fail('invalid-resource-group', `${at}.group`, 'must not repeat a group');
    byGroup.set(group, {
      index: byGroup.size,
      group,
      assets: readAssetDescriptors(record.assets, `${at}.assets`),
      sources: record.sources === null ? null : readSourceStateSet(record.sources, `${at}.sources`),
      payloads: record.payloads,
    });
  });
  if (byGroup.size === 0) fail('invalid-record', path, 'must contain at least one group');
  return RESOURCE_GROUPS.flatMap(group => byGroup.get(group) ?? []);
}

/**
 * Every value below is an integer or a token that the readers restrict to printable ASCII without quotes or
 * backslashes, so JSON text is an unambiguous ASCII encoding with one code unit per byte.
 */
function encode(basis: ContentIdentityBasis, drafts: readonly IdentityDraft[]): Uint8Array {
  const { origin } = basis;
  const text = JSON.stringify([
    ENCODING,
    basis.schemaVersion, basis.sliceId, basis.sliceDefinitionVersion, basis.converterVersion,
    origin.type, origin.type === 'synthetic' ? origin.fixtureId : origin.sourceFingerprint,
    drafts.map(({ group, assets, sources }) => [
      group,
      assets.map(asset => [
        asset.id, asset.kind, asset.role, asset.group,
        asset.dependencies.map(dependency => [dependency.id, dependency.kind]),
        [asset.payloadIdentity.schemaVersion, asset.payloadIdentity.byteLength, asset.payloadIdentity.fingerprint],
      ]),
      sources === null ? null : [
        sources.sourceFingerprint,
        sources.states.map(state => [state.id, state.state, state.unknowns]),
      ],
    ]),
  ]);
  return Uint8Array.from(text, character => character.charCodeAt(0));
}

function prepare(basis: unknown, drafts: unknown) {
  const readBasis = readContentIdentityBasis(basis);
  const groups = readDrafts(drafts, 'drafts');
  const manifestIdentity = `manifest:sha256:${new Sha256().update(encode(readBasis, groups)).digestHex()}` as ManifestIdentity;
  return { identity: Object.freeze({ ...readBasis, manifestIdentity }), groups };
}

/**
 * Derives the package's manifest identity from its identity basis and every group draft of one job: any change to a
 * basis field, descriptor, dependency, payload identity or source state changes it. Drafts are read strictly, so a
 * duplicate or unknown group or a malformed draft fails with `ContentContractError`; payloads are not read.
 */
export function deriveManifestIdentity(basis: ContentIdentityBasis, drafts: readonly GroupDraft[]): ManifestIdentity {
  return prepare(basis, drafts).identity.manifestIdentity;
}

/**
 * Writes one derived identity into every group and returns frozen groups in `RESOURCE_GROUPS` order. Payload records
 * are read and copied too, but keep the caller's byte views: ownership moves only when they are transferred.
 */
export function applyManifestIdentity(basis: ContentIdentityBasis, drafts: readonly GroupDraft[]): readonly IdentifiedGroup[] {
  const { identity, groups } = prepare(basis, drafts);
  return Object.freeze(groups.map(({ index, group, assets, sources, payloads }) => Object.freeze({
    manifest: Object.freeze({ identity, group, assets }),
    payloads: readPayloadRecords(payloads, `drafts[${index}].payloads`),
    sources,
  })));
}
