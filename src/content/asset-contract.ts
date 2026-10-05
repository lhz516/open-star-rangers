import { readAssetId, readAssetKind, type AssetId, type AssetKind } from './asset-id.ts';
import { readPayloadIdentity, type PayloadIdentity } from './content-identity.ts';
import { compareText, fail, matchesWhole, readOrderedArray, readRecord, requireFields } from './contract-validation.ts';

export const RESOURCE_GROUPS = Object.freeze(['logic', 'models', 'cockpit-hud-map', 'audio'] as const);
export type ResourceGroup = typeof RESOURCE_GROUPS[number];

export interface AssetReference {
  readonly id: AssetId;
  readonly kind: AssetKind;
}

export interface AssetDescriptor extends AssetReference {
  /** Semantic role token; required role membership and cardinality belong to the later slice definition. */
  readonly role: string;
  readonly group: ResourceGroup;
  /** Strict ASCII ID order, with no duplicates. */
  readonly dependencies: readonly AssetReference[];
  readonly payloadIdentity: PayloadIdentity;
}

export function readResourceGroup(value: unknown, path = 'group'): ResourceGroup {
  if (typeof value !== 'string' || !RESOURCE_GROUPS.some(group => group === value)) {
    fail('invalid-resource-group', path, 'must be a known resource group');
  }
  return value as ResourceGroup;
}

function readReferenceFields(record: Record<string, unknown>, path: string): AssetReference {
  const id = readAssetId(record.id, `${path}.id`);
  const kind = readAssetKind(record.kind, `${path}.kind`);
  if (id.split('/')[0] !== kind) fail('kind-mismatch', `${path}.kind`, 'must match the Asset ID kind');
  return Object.freeze({ id, kind });
}

export function readAssetReference(value: unknown, path = 'reference'): AssetReference {
  const record = readRecord(value, path);
  requireFields(record, path, ['id', 'kind']);
  return readReferenceFields(record, path);
}

const DEPENDENCY_CODES = Object.freeze({ invalid: 'invalid-dependencies', duplicate: 'duplicate-dependency', order: 'dependency-order' } as const);

function readDependencies(value: unknown, path: string): readonly AssetReference[] {
  return readOrderedArray(value, path, DEPENDENCY_CODES, readAssetReference, reference => reference.id,
    (left, right) => compareText(left.id, right.id));
}

/** Frozen metadata only: graph closure is in completeness.ts; payload bytes and their ownership are in payload.ts and ownership.ts. */
export function readAssetDescriptor(value: unknown, path = 'asset'): AssetDescriptor {
  const record = readRecord(value, path);
  requireFields(record, path, ['id', 'kind', 'role', 'group', 'dependencies', 'payloadIdentity']);
  const reference = readReferenceFields(record, path);
  if (!matchesWhole(record.role, /^[a-z0-9]+(?:-[a-z0-9]+)*$/)) fail('invalid-role', `${path}.role`, 'must be a nonempty ASCII semantic role token');
  return Object.freeze({
    ...reference,
    role: record.role,
    group: readResourceGroup(record.group, `${path}.group`),
    dependencies: readDependencies(record.dependencies, `${path}.dependencies`),
    payloadIdentity: readPayloadIdentity(record.payloadIdentity, `${path}.payloadIdentity`),
  });
}
