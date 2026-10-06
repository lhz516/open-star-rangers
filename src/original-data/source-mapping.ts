import { readAssetReference, type AssetReference } from '../content/asset-contract.ts';
import type { AssetId, AssetKind } from '../content/asset-id.ts';
import { readSourceFingerprint, type SourceFingerprint } from '../content/content-identity.ts';
import { compareText, fail, matchesWhole, readOrderedArray, readRecord, requireFields } from '../content/contract-validation.ts';
import { readUnknownIds, type SourceState, type SourceStateSet } from '../content/source-state.ts';
import { isDiscPath, type DiscPath } from './disc/disc-path.ts';
import type { ImfatEntry } from './imfat.ts';

/** Research confidence in a mapping; it is not proof that a payload was verified. */
export const SOURCE_CONFIDENCES = Object.freeze(['confirmed', 'likely', 'unconfirmed'] as const);
export type SourceConfidence = typeof SOURCE_CONFIDENCES[number];

/** `declared` by research; `verified` once an import resolved every locator in the fingerprinted source. */
export const SOURCE_RESOLUTIONS = Object.freeze(['declared', 'verified'] as const);
export type SourceResolution = typeof SOURCE_RESOLUTIONS[number];

/**
 * Archive entry types that can supply each canonical kind: entry types from
 * docs/original/formats/imfat.md §5; image records also embedded in MFDD/CCKD/ANIM/TABL (textures.md §2).
 */
export const SOURCE_ENTRY_TYPES = Object.freeze({
  mission: Object.freeze(['SCCT', 'SCEN']),
  model: Object.freeze(['MESH', 'MODL']),
  image: Object.freeze(['ANIM', 'BITM', 'CCKD', 'MFDD', 'TABL', 'TEX']),
  palette: Object.freeze(['ANIM', 'BITM', 'CCKD', 'DATA', 'MFDD', 'TABL', 'TEX']),
  font: Object.freeze(['CCKD', 'TABL']),
  layout: Object.freeze(['CCKD', 'TABL']),
  sound: Object.freeze(['SND']),
  data: Object.freeze(['AICO', 'CINF', 'DFPG', 'EXIC', 'EXPL', 'M2ID', 'NEBC', 'SCCT', 'TABL']),
} satisfies Record<AssetKind, readonly string[]>);

export interface OriginalAssetLocator {
  /** Disc-relative archive path such as `MAIN/SR.NOB`, in the grammar the disc reader resolves. */
  readonly discPath: DiscPath;
  /** IMFAT entry selected by the parser's own entry ID and type tag. */
  readonly entry: Readonly<Pick<ImfatEntry, 'id' | 'type'>>;
  /** Path inside the entry payload, or null for the whole entry. */
  readonly subresource: string | null;
}

export interface SourcePart {
  /**
   * Exact source equivalents (same entry type and sub-resource); any one supplies the part.
   * A `verified` mapping means the importer also proved their bytes and entry metadata equal.
   */
  readonly alternatives: readonly OriginalAssetLocator[];
}

export interface SourceMapping {
  readonly asset: AssetReference;
  /** All parts are needed to produce the Asset. */
  readonly parts: readonly SourcePart[];
  readonly confidence: SourceConfidence;
  /** U-### items the mapping depends on; required unless the mapping is confirmed. */
  readonly unknowns: readonly string[];
  /** Authoritative `docs/original/` references. */
  readonly evidence: readonly string[];
  readonly resolution: SourceResolution;
}

export interface SourceMappingTable {
  /** Source the locators were verified against; null until P2-03 supplies a fingerprint. */
  readonly sourceFingerprint: SourceFingerprint | null;
  /** Ascending unique Asset IDs; several Assets may share a locator. */
  readonly mappings: readonly SourceMapping[];
}

export type SourceDiagnosticCode = 'source-missing' | 'source-type-conflict' | 'source-unconfirmed' | 'source-unverified';

/** Safe diagnostic: a canonical ID, a structural path and U items, never original content or locator values. */
export interface SourceDiagnostic {
  readonly code: SourceDiagnosticCode;
  readonly assetId: AssetId;
  readonly path: string;
  readonly unknowns: readonly string[];
}

const SUBRESOURCE = /^[a-z0-9]+(?:[-.][a-z0-9]+)*(?:\/[a-z0-9]+(?:[-.][a-z0-9]+)*){0,7}$/;
const EVIDENCE = /^docs\/original\/(?:[A-Za-z0-9][A-Za-z0-9._-]*\/)*[A-Za-z0-9][A-Za-z0-9._-]*\.md(?:#[^\s#]+)?$/;

function readEnum<T extends string>(value: unknown, allowed: readonly T[], path: string, reason: string): T {
  if (!allowed.some(item => item === value)) fail('invalid-source-mapping', path, reason);
  return value as T;
}

function readLocator(value: unknown, path: string): OriginalAssetLocator {
  const record = readRecord(value, path);
  requireFields(record, path, ['discPath', 'entry', 'subresource']);
  if (!isDiscPath(record.discPath)) {
    fail('invalid-source-mapping', `${path}.discPath`, 'must be a relative upper-case 8.3 disc path');
  }
  const entry = readRecord(record.entry, `${path}.entry`);
  requireFields(entry, `${path}.entry`, ['id', 'type']);
  if (typeof entry.id !== 'number' || !Number.isSafeInteger(entry.id) || entry.id < 0) {
    fail('invalid-source-mapping', `${path}.entry.id`, 'must be a nonnegative safe integer archive entry ID');
  }
  if (!matchesWhole(entry.type, /^[A-Z0-9]{1,4}$/)) fail('invalid-source-mapping', `${path}.entry.type`, 'must be a 1-4 character archive type tag');
  const subresource = record.subresource;
  if (subresource !== null && (!matchesWhole(subresource, SUBRESOURCE) || subresource.length > 128)) {
    fail('invalid-source-mapping', `${path}.subresource`, 'must be null or a restricted ASCII path of at most 128 characters');
  }
  return Object.freeze({
    discPath: record.discPath,
    entry: Object.freeze({ id: entry.id + 0, type: entry.type }),
    subresource: subresource as string | null,
  });
}

// Sub-resources are never empty, so '' unambiguously stands for null.
const locatorKey = ({ discPath, entry, subresource }: OriginalAssetLocator) =>
  `${discPath}\u0000${entry.type}\u0000${entry.id}\u0000${subresource ?? ''}`;

/** Whether the archive entry type can supply the Asset's kind. */
const admits = (asset: AssetReference, entry: OriginalAssetLocator['entry']): boolean =>
  (SOURCE_ENTRY_TYPES[asset.kind] as readonly string[]).includes(entry.type);

/** Canonical locator order by archive path, entry type, entry ID and subresource; 0 means the same locator. */
export function compareLocators(left: OriginalAssetLocator, right: OriginalAssetLocator): number {
  return compareText(left.discPath, right.discPath) || compareText(left.entry.type, right.entry.type)
    || left.entry.id - right.entry.id
    || (left.subresource === right.subresource ? 0 : left.subresource === null ? -1 : right.subresource === null ? 1 : compareText(left.subresource, right.subresource));
}

const SOURCE_CODES = Object.freeze({ invalid: 'invalid-source-mapping', duplicate: 'duplicate-mapping', order: 'mapping-order' } as const);

function readMapping(value: unknown, path: string, fingerprinted: boolean): SourceMapping {
  const record = readRecord(value, path);
  requireFields(record, path, ['asset', 'parts', 'confidence', 'unknowns', 'evidence', 'resolution']);
  const parts = readOrderedArray(record.parts, `${path}.parts`, SOURCE_CODES, (item, at) => {
    const part = readRecord(item, at);
    requireFields(part, at, ['alternatives']);
    const alternatives = readOrderedArray(part.alternatives, `${at}.alternatives`, SOURCE_CODES, readLocator, locatorKey, compareLocators, 1);
    alternatives.forEach(({ entry, subresource }, index) => {
      if (entry.type !== alternatives[0].entry.type || subresource !== alternatives[0].subresource) {
        fail('invalid-source-mapping', `${at}.alternatives[${index}]`, 'must share the entry type and sub-resource of the other equivalents');
      }
    });
    return Object.freeze({ alternatives });
  }, part => locatorKey(part.alternatives[0]), (left, right) => compareLocators(left.alternatives[0], right.alternatives[0]), 1);
  const locators = new Set<string>();
  for (const { alternatives } of parts) {
    for (const locator of alternatives) {
      const key = locatorKey(locator);
      if (locators.has(key)) fail('duplicate-mapping', `${path}.parts`, 'must not repeat a locator across parts');
      locators.add(key);
    }
  }
  const confidence = readEnum(record.confidence, SOURCE_CONFIDENCES, `${path}.confidence`, 'must be confirmed, likely or unconfirmed');
  const unknowns = readUnknownIds(record.unknowns, `${path}.unknowns`, confidence === 'confirmed' ? 0 : 1);
  const evidence = readOrderedArray(record.evidence, `${path}.evidence`, SOURCE_CODES, (item, at) => {
    if (!matchesWhole(item, EVIDENCE) || item.length > 256) fail('invalid-source-mapping', at, 'must reference a docs/original document');
    return item;
  }, item => item, compareText, 1);
  const resolution = readEnum(record.resolution, SOURCE_RESOLUTIONS, `${path}.resolution`, 'must be declared or verified');
  if (resolution === 'verified' && !fingerprinted) {
    fail('invalid-source-mapping', `${path}.resolution`, 'cannot be verified without a source fingerprint');
  }
  return Object.freeze({ asset: readAssetReference(record.asset, `${path}.asset`), parts, confidence, unknowns, evidence, resolution });
}

/** Validates a source mapping table; locators stay in original-data and never enter canonical content. */
export function readSourceMappingTable(value: unknown): SourceMappingTable {
  const path = 'sources';
  const record = readRecord(value, path);
  requireFields(record, path, ['sourceFingerprint', 'mappings']);
  const sourceFingerprint = record.sourceFingerprint === null
    ? null
    : readSourceFingerprint(record.sourceFingerprint, `${path}.sourceFingerprint`);
  const mappings = readOrderedArray(record.mappings, `${path}.mappings`, SOURCE_CODES,
    (item, at) => readMapping(item, at, sourceFingerprint !== null),
    mapping => mapping.asset.id, (left, right) => compareText(left.asset.id, right.asset.id));
  return Object.freeze({ sourceFingerprint, mappings });
}

/**
 * Diagnoses entry-type conflicts in every mapping, and missing, unconfirmed or unverified sources
 * for the required Assets. `likely` mappings are allowed; their U items remain on the mapping.
 */
export function diagnoseSourceMappings(table: SourceMappingTable, required: readonly AssetReference[]): readonly SourceDiagnostic[] {
  const diagnostics: SourceDiagnostic[] = [];
  const report = (code: SourceDiagnosticCode, assetId: AssetId, path: string, unknowns: readonly string[] = []) =>
    diagnostics.push(Object.freeze({ code, assetId, path, unknowns: Object.freeze([...unknowns]) }));
  const byId = new Map(table.mappings.map((mapping, index) => [mapping.asset.id, { mapping, index }]));
  table.mappings.forEach(({ asset, parts, unknowns }, index) => {
    parts.forEach(({ alternatives }, part) => alternatives.forEach(({ entry }, alternative) => {
      if (!admits(asset, entry)) {
        report('source-type-conflict', asset.id, `mappings[${index}].parts[${part}].alternatives[${alternative}].entry.type`, unknowns);
      }
    }));
  });
  const firstRequired = new Map<AssetId, number>();
  required.forEach(({ id }, index) => { if (!firstRequired.has(id)) firstRequired.set(id, index); });
  for (const [id, requiredIndex] of firstRequired) {
    const found = byId.get(id);
    if (!found) {
      report('source-missing', id, `required[${requiredIndex}]`);
      continue;
    }
    const { mapping, index } = found;
    if (mapping.confidence === 'unconfirmed') report('source-unconfirmed', id, `mappings[${index}].confidence`, mapping.unknowns);
    if (mapping.resolution === 'declared') report('source-unverified', id, `mappings[${index}].resolution`, mapping.unknowns);
  }
  return Object.freeze(diagnostics.sort((a, b) =>
    compareText(a.assetId, b.assetId) || compareText(a.code, b.code) || compareText(a.path, b.path)));
}

/**
 * Derives the locator-free readiness of every mapped Asset, bound to the table's source fingerprint, for
 * content completeness validation. Most severe first: an entry-type conflict, then unconfirmed research,
 * then a declared (unverified) source.
 */
export function assetSourceStates(table: SourceMappingTable): SourceStateSet {
  const states = table.mappings.map(({ asset, parts, confidence, resolution, unknowns }) => {
    const conflict = parts.some(({ alternatives }) => alternatives.some(({ entry }) => !admits(asset, entry)));
    const state: SourceState = conflict ? 'conflict'
      : confidence === 'unconfirmed' ? 'unconfirmed'
        : resolution === 'declared' ? 'unverified' : 'verified';
    return Object.freeze({ id: asset.id, state, unknowns: Object.freeze([...unknowns]) });
  });
  return Object.freeze({ sourceFingerprint: table.sourceFingerprint, states: Object.freeze(states) });
}
