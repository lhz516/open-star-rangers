import type { AssetReference, ResourceGroup } from './asset-contract.ts';
import type { AssetId } from './asset-id.ts';
import { contentIdentityKey, type ContentIdentity } from './content-identity.ts';
import { compareText, ContentContractError, type ContentContractErrorCode } from './contract-validation.ts';
import { readGroupManifest, type GroupManifest } from './manifest.ts';
import { payloadMismatch, readPayloadRecords } from './payload.ts';
import type { SliceDefinition, SliceRoleRequirement } from './slice-definition.ts';
import { readSourceStateSet, type SourceStateSet } from './source-state.ts';

/** Stable diagnostic codes; malformed input keeps its reader code. */
export type CompletenessCode =
  | ContentContractErrorCode
  | 'definition-version-mismatch'
  | 'group-mismatch'
  | 'role-cardinality'
  | 'missing-dependency'
  | 'self-dependency'
  | 'dependency-cycle'
  | 'payload-missing'
  | 'payload-mismatch'
  | 'payload-unexpected'
  | 'source-missing'
  | 'source-not-ready'
  | 'source-unexpected'
  | 'source-fingerprint-mismatch'
  | 'group-missing'
  | 'group-duplicate'
  | 'package-identity-mismatch';

/** Safe diagnostic: canonical IDs, structural paths and U items only, never payload bytes or locators. */
export interface CompletenessDiagnostic {
  readonly code: CompletenessCode;
  readonly path: string;
  readonly assetId: AssetId | null;
  readonly unknowns: readonly string[];
  readonly reason: string;
}

export interface GroupInput {
  /** `{ identity, group, assets }` with assets in ascending unique ID order. */
  readonly manifest: unknown;
  /** `{ id, schemaVersion, bytes }` records of the actual converted payloads. */
  readonly payloads: unknown;
  /** Locator-free `{ sourceFingerprint, states }` from original-data for original imports; null for synthetic content. */
  readonly sources: unknown;
}

export type GroupCompletenessResult =
  | {
    readonly status: 'group-complete';
    readonly group: ResourceGroup;
    readonly identity: ContentIdentity;
    readonly assets: readonly AssetReference[];
    /** Typed requirements other groups must satisfy, in ascending unique ID order. */
    readonly externalRequirements: readonly AssetReference[];
  }
  | { readonly status: 'incomplete'; readonly group: ResourceGroup | null; readonly diagnostics: readonly CompletenessDiagnostic[] };

export type PackageCompletenessResult =
  | { readonly status: 'complete'; readonly identity: ContentIdentity; readonly groups: readonly ResourceGroup[] }
  | { readonly status: 'incomplete'; readonly diagnostics: readonly CompletenessDiagnostic[] };

function diagnostic(code: CompletenessCode, path: string, reason: string, assetId: AssetId | null = null, unknowns: readonly string[] = []): CompletenessDiagnostic {
  return Object.freeze({ code, path, assetId, unknowns: Object.freeze([...unknowns]), reason });
}

const sortDiagnostics = (diagnostics: CompletenessDiagnostic[]): readonly CompletenessDiagnostic[] =>
  Object.freeze(diagnostics.sort((left, right) => compareText(left.path, right.path) || compareText(left.code, right.code)));

/** Reports one diagnostic per dependency edge that closes a cycle. */
function cycleDiagnostics(edges: ReadonlyMap<AssetId, readonly { readonly target: AssetId; readonly path: string }[]>): CompletenessDiagnostic[] {
  const found: CompletenessDiagnostic[] = [];
  const state = new Map<AssetId, 'active' | 'done'>();
  const visit = (id: AssetId): void => {
    state.set(id, 'active');
    for (const { target, path } of edges.get(id) ?? []) {
      if (state.get(target) === 'active') found.push(diagnostic('dependency-cycle', path, 'closes a dependency cycle', id));
      else if (!state.has(target) && edges.has(target)) visit(target);
    }
    state.set(id, 'done');
  };
  for (const id of edges.keys()) if (!state.has(id)) visit(id);
  return found;
}

interface CheckedGroup {
  readonly result: GroupCompletenessResult;
  readonly manifest: GroupManifest | null;
}

/** `root` prefixes every path, so package validation reports each problem once at its final location. */
function checkGroup(definition: SliceDefinition, input: GroupInput, root = ''): CheckedGroup {
  let manifest: GroupManifest;
  let payloads: ReturnType<typeof readPayloadRecords>;
  let sources: SourceStateSet | null;
  try {
    manifest = readGroupManifest(input.manifest, `${root}manifest`);
    payloads = readPayloadRecords(input.payloads, `${root}payloads`);
    sources = input.sources === null ? null : readSourceStateSet(input.sources, `${root}sources`);
  } catch (error) {
    if (!(error instanceof ContentContractError)) throw error;
    const manifestValue = input.manifest;
    const declared = typeof manifestValue === 'object' && manifestValue !== null
      ? Object.getOwnPropertyDescriptor(manifestValue, 'group')?.value : undefined;
    const known = definition.groups.find(group => group === declared) ?? null;
    return { manifest: null, result: Object.freeze({ status: 'incomplete', group: known, diagnostics: Object.freeze([diagnostic(error.code, error.path, error.reason)]) }) };
  }
  const { identity, group, assets } = manifest;
  const owned = definition.groupKinds[group];
  const diagnostics: CompletenessDiagnostic[] = [];
  if (identity.sliceDefinitionVersion !== definition.version) {
    diagnostics.push(diagnostic('definition-version-mismatch', `${root}manifest.identity.sliceDefinitionVersion`, 'must match the slice definition version'));
  }
  const requirements = new Map<string, SliceRoleRequirement>(definition.roles.map(requirement => [requirement.role, requirement]));
  const roleCounts = new Map<string, number>();
  const byId = new Map(assets.map(asset => [asset.id, asset]));
  const external = new Map<AssetId, AssetReference>();
  const internalEdges = new Map<AssetId, { target: AssetId; path: string }[]>();
  const payloadById = new Map(payloads.map((payload, index) => [payload.id, { payload, index }]));
  const { origin } = identity;
  const original = origin.type === 'original-import';
  if (!original && sources) diagnostics.push(diagnostic('source-unexpected', `${root}sources`, 'synthetic content has no original source'));
  if (original && !sources) diagnostics.push(diagnostic('source-missing', `${root}sources`, 'original-import content needs source states'));
  if (original && sources && sources.sourceFingerprint !== origin.sourceFingerprint) {
    diagnostics.push(diagnostic('source-fingerprint-mismatch', `${root}sources.sourceFingerprint`, 'must match the manifest source fingerprint'));
  }
  // Per-Asset states count only when they belong to the manifest's own source.
  const states = original && sources?.sourceFingerprint === origin.sourceFingerprint ? sources.states : null;
  const sourceById = new Map((states ?? []).map(source => [source.id, source]));
  assets.forEach((asset, index) => {
    const at = `${root}manifest.assets[${index}]`;
    roleCounts.set(asset.role, (roleCounts.get(asset.role) ?? 0) + 1);
    if (asset.group !== group) diagnostics.push(diagnostic('group-mismatch', `${at}.group`, 'must belong to the manifest group', asset.id));
    if (!owned.includes(asset.kind)) diagnostics.push(diagnostic('kind-mismatch', `${at}.kind`, 'is not a kind owned by this group', asset.id));
    const requirement = requirements.get(asset.role);
    if (requirement && requirement.group !== group) diagnostics.push(diagnostic('group-mismatch', `${at}.role`, 'belongs to another group', asset.id));
    if (requirement && !requirement.kinds.includes(asset.kind)) diagnostics.push(diagnostic('kind-mismatch', `${at}.kind`, 'is not allowed for the role', asset.id));
    const edges: { target: AssetId; path: string }[] = [];
    asset.dependencies.forEach((dependency, dependencyIndex) => {
      const path = `${at}.dependencies[${dependencyIndex}]`;
      if (dependency.id === asset.id) diagnostics.push(diagnostic('self-dependency', path, 'must not depend on itself', asset.id));
      else if (!owned.includes(dependency.kind)) external.set(dependency.id, dependency);
      else if (byId.has(dependency.id)) edges.push({ target: dependency.id, path });
      else diagnostics.push(diagnostic('missing-dependency', path, 'is not in this group', asset.id));
    });
    internalEdges.set(asset.id, edges);
    const found = payloadById.get(asset.id);
    if (!found) {
      diagnostics.push(diagnostic('payload-missing', at, 'has no payload', asset.id));
    } else {
      const mismatch = payloadMismatch(asset.payloadIdentity, found.payload);
      if (mismatch) diagnostics.push(diagnostic('payload-mismatch', `${root}payloads[${found.index}]`, `does not match the declared ${mismatch}`, asset.id));
    }
    if (states) {
      const source = sourceById.get(asset.id);
      if (!source) diagnostics.push(diagnostic('source-missing', at, 'has no original source state', asset.id));
      else if (source.state !== 'verified') diagnostics.push(diagnostic('source-not-ready', at, `source is ${source.state}`, asset.id, source.unknowns));
    }
  });
  payloads.forEach((payload, index) => {
    if (!byId.has(payload.id)) diagnostics.push(diagnostic('payload-unexpected', `${root}payloads[${index}]`, 'is not in the manifest', payload.id));
  });
  states?.forEach((source, index) => {
    if (!byId.has(source.id)) diagnostics.push(diagnostic('source-unexpected', `${root}sources.states[${index}]`, 'is not in the manifest', source.id));
  });
  for (const { role, group: roleGroup, minAssets, maxAssets } of definition.roles) {
    const count = roleCounts.get(role) ?? 0;
    if (roleGroup === group && (count < minAssets || (maxAssets !== null && count > maxAssets))) {
      diagnostics.push(diagnostic('role-cardinality', `${root}roles.${role}`, `has ${count} Assets; requires ${minAssets}..${maxAssets ?? 'any'}`));
    }
  }
  diagnostics.push(...cycleDiagnostics(internalEdges));
  if (diagnostics.length > 0) return { manifest, result: Object.freeze({ status: 'incomplete', group, diagnostics: sortDiagnostics(diagnostics) }) };
  return {
    manifest,
    result: Object.freeze({
      status: 'group-complete',
      group,
      identity,
      assets: Object.freeze(assets.map(({ id, kind }) => Object.freeze({ id, kind }))),
      externalRequirements: Object.freeze([...external.values()].sort((left, right) => compareText(left.id, right.id))),
    }),
  };
}

/** Derives one group's completeness from its manifest, actual payloads and source states. */
export function validateGroup(definition: SliceDefinition, input: GroupInput): GroupCompletenessResult {
  return checkGroup(definition, input).result;
}

/**
 * Derives whole-package completeness by revalidating every raw group input; group results are never trusted.
 * Requires each defined group exactly once, identical identities, unique IDs and resolved cross-group requirements.
 */
export function validatePackage(definition: SliceDefinition, inputs: readonly GroupInput[]): PackageCompletenessResult {
  const checked = inputs.map((input, index) => checkGroup(definition, input, `groups[${index}].`));
  const diagnostics = checked.flatMap(({ result }) => (result.status === 'incomplete' ? result.diagnostics : []));
  for (const group of definition.groups) {
    const count = checked.filter(({ result }) => result.group === group).length;
    if (count === 0) diagnostics.push(diagnostic('group-missing', `groups.${group}`, 'is required for the whole package'));
    if (count > 1) diagnostics.push(diagnostic('group-duplicate', `groups.${group}`, 'must be provided once'));
  }
  if (diagnostics.length > 0) return Object.freeze({ status: 'incomplete', diagnostics: sortDiagnostics(diagnostics) });
  const complete = checked.map(({ result, manifest }) => ({ result: result as Extract<GroupCompletenessResult, { status: 'group-complete' }>, manifest: manifest! }));
  const identity = complete[0].result.identity;
  const expectedKey = contentIdentityKey(identity);
  const owners = new Map<AssetId, number>();
  const edges = new Map<AssetId, { target: AssetId; path: string }[]>();
  complete.forEach(({ result, manifest }, index) => {
    if (contentIdentityKey(result.identity) !== expectedKey) {
      diagnostics.push(diagnostic('package-identity-mismatch', `groups[${index}].manifest.identity`, 'must match every other group'));
    }
    manifest.assets.forEach((asset, assetIndex) => {
      if (owners.has(asset.id)) diagnostics.push(diagnostic('duplicate-asset', `groups[${index}].manifest.assets[${assetIndex}]`, 'appears in more than one group', asset.id));
      owners.set(asset.id, index);
      edges.set(asset.id, asset.dependencies.map((dependency, dependencyIndex) =>
        ({ target: dependency.id, path: `groups[${index}].manifest.assets[${assetIndex}].dependencies[${dependencyIndex}]` })));
    });
  });
  complete.forEach(({ result }, index) => {
    result.externalRequirements.forEach((requirement, requirementIndex) => {
      if (!owners.has(requirement.id)) {
        diagnostics.push(diagnostic('missing-dependency', `groups[${index}].externalRequirements[${requirementIndex}]`, 'is not provided by any group', requirement.id));
      }
    });
  });
  diagnostics.push(...cycleDiagnostics(edges));
  if (diagnostics.length > 0) return Object.freeze({ status: 'incomplete', diagnostics: sortDiagnostics(diagnostics) });
  return Object.freeze({ status: 'complete', identity, groups: Object.freeze([...definition.groups]) });
}
