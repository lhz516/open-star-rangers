import { RESOURCE_GROUPS, type AssetDescriptor, type AssetReference, type ResourceGroup } from '../../content/asset-contract.ts';
import { EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import type { PayloadRecord } from '../../content/payload.ts';
import type { AssetSourceState } from '../../content/source-state.ts';
import type { ArchiveEntryRead, ImfatArchiveHandle } from '../archive/archive-reader.ts';
import { SourceError } from '../source-error.ts';
import { assetSourceStates, readSourceMappingTable, type SourceMapping } from '../source-mapping.ts';
import type { VerifiedSource } from '../source/open-verified-source.ts';
import { verifySourceMappings, type EntryReader } from '../source/verify-source-mappings.ts';
import { convertGraphics, type GraphicsSource } from './convert-graphics.ts';
import { readGraphicsDeclarations } from './graphics-declarations.ts';

export interface GraphicsStepGroup {
  readonly group: ResourceGroup;
  /** In ascending Asset ID order, one to one with `payloads` and `sources`. */
  readonly descriptors: readonly AssetDescriptor[];
  /** Each owns its whole ArrayBuffer. */
  readonly payloads: readonly PayloadRecord[];
  /** Locator-free source states. */
  readonly sources: readonly AssetSourceState[];
}

export interface GraphicsStepResult {
  /** Only groups with Assets, in `RESOURCE_GROUPS` order. */
  readonly groups: readonly GraphicsStepGroup[];
  /** The step's conversion usage; source reads are metered by the verified source. */
  readonly usage: BudgetRecord;
}

/** Entry types whose payload is an image record at offset 0 (textures.md §2). */
const WHOLE_RECORD_TYPES: readonly string[] = Object.freeze(['TEX', 'BITM']);
const FONT_SUBRESOURCE = /^fonts\/(0|[1-9][0-9]*)$/;
const SOURCE_FIELDS = Object.freeze({ palette: 'palette', image: 'record', font: 'fonts' } as Record<string, string>);

/**
 * A step-local entry reader: each (archive, type, entry ID) is read at most once and its result shared by mapping
 * verification and conversion. The cache lives only as long as the reader, so entry bytes are released with the step.
 */
function stepEntryReader(source: VerifiedSource): EntryReader {
  const archives = new Map<string, Promise<ImfatArchiveHandle>>();
  const entries = new Map<string, Promise<ArchiveEntryRead>>();
  const read = async (discPath: string, id: number, type: string): Promise<ArchiveEntryRead> => {
    let archive = archives.get(discPath);
    if (!archive) {
      archive = source.openArchive(discPath);
      archives.set(discPath, archive);
    }
    const handle = await archive;
    // As in mapping verification: an ID beyond u32 cannot be in an archive, which the handle would call malformed.
    if (id > 0xffffffff) throw new SourceError('entry-not-found', 'request.id', 'the archive has no entry with this ID');
    return handle.read(id, type);
  };
  return ({ discPath, entry: { id, type } }) => {
    const key = `${discPath}\u0000${type}\u0000${id}`;
    let entry = entries.get(key);
    if (!entry) {
      entry = read(discPath, id, type);
      entries.set(key, entry);
    }
    return entry;
  };
}

type SourceKind = { readonly type: Exclude<GraphicsSource['type'], 'cockpit-font'> } | { readonly type: 'cockpit-font'; readonly index: number };

/** What a locator supplies for an Asset kind, or null when this task does not convert it. */
function sourceKindOf(kind: string, entryType: string, subresource: string | null): SourceKind | null {
  if (kind === 'palette' && subresource === null) return entryType === 'DATA' ? { type: 'data-palette' } : null;
  if (kind === 'palette') return subresource === 'palette' && WHOLE_RECORD_TYPES.includes(entryType) ? { type: 'embedded-palette' } : null;
  if (kind === 'image') return subresource === null && WHOLE_RECORD_TYPES.includes(entryType) ? { type: 'image-record' } : null;
  const font = kind === 'font' && entryType === 'CCKD' ? FONT_SUBRESOURCE.exec(subresource ?? '') : null;
  return font ? { type: 'cockpit-font', index: Number(font[1]) } : null;
}

/**
 * The typed source of one Asset from its mapping: a whole DATA entry, the `palette` subresource of a whole-entry image
 * record, a whole-entry image record, or `fonts/<i>` of a CCKD entry. Exact alternatives are equal, so the first is used.
 */
async function graphicsSource({ id, kind }: AssetReference, mapping: SourceMapping, readEntry: EntryReader): Promise<GraphicsSource> {
  const locator = mapping.parts.length === 1 ? mapping.parts[0].alternatives[0] : null;
  const source = locator && sourceKindOf(kind, locator.entry.type, locator.subresource);
  if (!locator || !source) {
    throw new SourceError('invalid-declaration', `graphics[${id}].${SOURCE_FIELDS[kind]}`, 'the mapped source does not supply this kind');
  }
  return { ...source, block: (await readEntry(locator)).bytes };
}

/**
 * Runs the graphics conversion step: verifies the mapping table, pairs each declaration with its mapping, converts
 * the Assets from step-shared entry reads, and only then marks their mappings, including subresource ones, verified.
 * Returns frozen locator-free results by resource group. Any failure rejects the whole step without results; read
 * failures keep their P2-02/P2-03 layer, code and location, and reads already issued stay charged to the source.
 */
export async function runGraphicsStep(
  source: VerifiedSource,
  mappings: unknown,
  declarations: unknown,
  limits: unknown,
  usage: unknown = EMPTY_BUDGET_USAGE,
): Promise<GraphicsStepResult> {
  const readEntry = stepEntryReader(source);
  const table = await verifySourceMappings(mappings, source, readEntry);
  const checked = readGraphicsDeclarations(declarations);
  const mappingById = new Map<string, SourceMapping>(table.mappings.map(mapping => [mapping.asset.id, mapping]));
  checked.forEach(({ asset }, index) => {
    if (!mappingById.has(asset.id)) throw new SourceError('invalid-declaration', `graphics.declarations[${index}]`, 'the Asset has no source mapping');
  });
  if (table.mappings.length !== checked.length) throw new SourceError('invalid-declaration', 'graphics.declarations', 'every mapped Asset must be declared');
  const sources = new Map<string, GraphicsSource>();
  for (const { asset } of checked) sources.set(asset.id, await graphicsSource(asset, mappingById.get(asset.id)!, readEntry));
  const conversion = convertGraphics(checked, sources, limits, usage);
  const verified = readSourceMappingTable({ ...table, mappings: table.mappings.map(mapping => ({ ...mapping, resolution: 'verified' })) });
  const stateById = new Map<string, AssetSourceState>(assetSourceStates(verified).states.map(state => [state.id, state]));
  const groups = RESOURCE_GROUPS.flatMap(group => {
    const assets = conversion.assets.filter(({ descriptor }) => descriptor.group === group);
    return assets.length === 0 ? [] : [Object.freeze({
      group,
      descriptors: Object.freeze(assets.map(({ descriptor }) => descriptor)),
      payloads: Object.freeze(assets.map(({ payload }) => payload)),
      sources: Object.freeze(assets.map(({ descriptor }) => stateById.get(descriptor.id)!)),
    })];
  });
  return Object.freeze({ groups: Object.freeze(groups), usage: conversion.usage });
}
