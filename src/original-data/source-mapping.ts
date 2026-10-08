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
  image: Object.freeze(['ANIM', 'BITM', 'CCKD', 'MFDD', 'SNIP', 'TABL', 'TEX']),
  palette: Object.freeze(['ANIM', 'BITM', 'CCKD', 'DATA', 'MFDD', 'TABL', 'TEX']),
  font: Object.freeze(['CCKD', 'TABL']),
  layout: Object.freeze(['CCKD', 'TABL']),
  sound: Object.freeze(['SND']),
  data: Object.freeze(['AICO', 'CINF', 'DFPG', 'DIAG', 'EXIC', 'EXPL', 'M2ID', 'NEBC', 'RENS', 'SCCT', 'TABL']),
} satisfies Record<AssetKind, readonly string[]>);

/** The only files a region locator may name: non-archive files read by byte region (P2-06 spec, effect geometry data). */
export const REGION_FILES: readonly DiscPath[] = Object.freeze(['MAIN/SRANGERS.EXE' as DiscPath]);

/** Region lengths a locator may name, in bytes. */
export const REGION_LIMITS = Object.freeze({ objects: 8, bytes: 65_536 });

export interface ArchiveEntryLocator {
  /** Disc-relative archive path such as `MAIN/SR.NOB`, in the grammar the disc reader resolves. */
  readonly discPath: DiscPath;
  /** IMFAT entry selected by the parser's own entry ID and type tag. */
  readonly entry: Readonly<Pick<ImfatEntry, 'id' | 'type'>>;
  /** Path inside the entry payload, or null for the whole entry. */
  readonly subresource: string | null;
}

/** A byte region of a non-archive file: `le/<object>/<hex offset>/<bytes>` in the file's LE object `object`. */
export interface ExecutableRegionLocator {
  readonly discPath: DiscPath;
  readonly entry: null;
  readonly subresource: string;
}

export type OriginalAssetLocator = ArchiveEntryLocator | ExecutableRegionLocator;

/** A region locator's parsed numbers: the 1-based LE object, the offset from the object's start, and the length. */
export interface ExecutableRegion {
  readonly object: number;
  readonly offset: number;
  readonly length: number;
}

export const isRegionLocator = (locator: OriginalAssetLocator): locator is ExecutableRegionLocator => locator.entry === null;

/** Parses a canonical region sub-resource, or returns null when it is not one. */
function parseRegion(text: string): ExecutableRegion | null {
  const match = /^le\/([1-9])\/0x(0|[1-9a-f][0-9a-f]{0,7})\/([1-9][0-9]{0,4})$/.exec(text);
  if (!match) return null;
  const region = { object: Number(match[1]), offset: parseInt(match[2], 16), length: Number(match[3]) };
  return region.object <= REGION_LIMITS.objects && region.length <= REGION_LIMITS.bytes ? region : null;
}

/**
 * The locator as an archive entry locator, for code that has already checked its mapping's form, where a region
 * locator is impossible; one reaching it is a programming error.
 */
export function archiveLocator(locator: OriginalAssetLocator): ArchiveEntryLocator {
  if (isRegionLocator(locator)) throw new TypeError('expected an archive entry locator');
  return locator;
}

/** The region a region locator names; its syntax was checked when the table was read. */
export const executableRegion = (locator: ExecutableRegionLocator): ExecutableRegion => parseRegion(locator.subresource)!;

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
  if (record.entry === null) {
    if (!REGION_FILES.includes(record.discPath)) fail('invalid-source-mapping', `${path}.discPath`, 'must be a file that allows region locators');
    if (typeof record.subresource !== 'string' || parseRegion(record.subresource) === null) {
      fail('invalid-source-mapping', `${path}.subresource`, 'must be a canonical le/<object>/<hex offset>/<bytes> region');
    }
    return Object.freeze({ discPath: record.discPath, entry: null, subresource: record.subresource });
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

// Sub-resources are never empty, so '' unambiguously stands for null; a region's canonical text is its identity.
const locatorKey = ({ discPath, entry, subresource }: OriginalAssetLocator) =>
  entry === null ? `${discPath}\u0000region\u0000${subresource}` : `${discPath}\u0000${entry.type}\u0000${entry.id}\u0000${subresource ?? ''}`;

/**
 * Kinds a region locator may supply: data, or an image whose mapping starts with an archive entry, such as a colour
 * table the image's record needs (P2-07 spec, status display interference).
 */
const REGION_KINDS: readonly AssetKind[] = Object.freeze(['data', 'image']);

/** Whether the locator can supply the Asset's kind: an archive entry type admitted for it, or a region for a region kind. */
const admits = (asset: AssetReference, entry: OriginalAssetLocator['entry']): boolean =>
  entry === null ? REGION_KINDS.includes(asset.kind) : (SOURCE_ENTRY_TYPES[asset.kind] as readonly string[]).includes(entry.type);

/**
 * Canonical locator order: archive entries first, in path, type, ID and sub-resource order; then regions by path,
 * object, offset and length. 0 means the same locator.
 */
export function compareLocators(left: OriginalAssetLocator, right: OriginalAssetLocator): number {
  if (isRegionLocator(left) || isRegionLocator(right)) {
    if (!isRegionLocator(left)) return -1;
    if (!isRegionLocator(right)) return 1;
    const [a, b] = [executableRegion(left), executableRegion(right)];
    return compareText(left.discPath, right.discPath) || a.object - b.object || a.offset - b.offset || a.length - b.length;
  }
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
    // Before ordering is checked, so several region alternatives fail for their count, whatever their order.
    const raw = part.alternatives;
    if (Array.isArray(raw) && raw.length > 1 && raw.some(locator => typeof locator === 'object' && locator !== null && (locator as { entry?: unknown }).entry === null)) {
      fail('invalid-source-mapping', `${at}.alternatives`, 'a region part must have exactly one alternative');
    }
    const alternatives = readOrderedArray(raw, `${at}.alternatives`, SOURCE_CODES, readLocator, locatorKey, compareLocators, 1);
    alternatives.forEach(({ entry, subresource }, index) => {
      if (entry?.type !== alternatives[0].entry?.type || subresource !== alternatives[0].subresource) {
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
  const asset = readAssetReference(record.asset, `${path}.asset`);
  parts.forEach(({ alternatives }, part) => {
    if (!alternatives.some(isRegionLocator)) return;
    if (!REGION_KINDS.includes(asset.kind)) fail('invalid-source-mapping', `${path}.parts[${part}].alternatives[0]`, 'only a data or image Asset may map to a region');
    // Entries sort before regions, so an image's first part is a region only when it has no entry part.
    if (asset.kind === 'image' && part === 0) fail('invalid-source-mapping', `${path}.parts[0].alternatives[0]`, 'an image mapping must start with an archive entry');
  });
  return Object.freeze({ asset, parts, confidence, unknowns, evidence, resolution });
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
