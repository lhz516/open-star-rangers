import { RESOURCE_GROUPS, type AssetDescriptor, type ResourceGroup } from '../../content/asset-contract.ts';
import { EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import { compareText } from '../../content/contract-validation.ts';
import type { GroupDraft } from '../../content/manifest-identity.ts';
import { readAssetDescriptors } from '../../content/manifest.ts';
import { readPayloadRecords, type PayloadRecord } from '../../content/payload.ts';
import { readSourceStateSet, type AssetSourceState, type SourceStateSet } from '../../content/source-state.ts';
import { MAP_GEOMETRY_ROLE } from '../../content/hud/map-geometry-payload.ts';
import { STATUS_MESSAGES_LIMITS } from '../../content/hud/status-messages-payload.ts';
import { VIEW_LABELS_FORMAT } from '../../content/hud/view-labels-payload.ts';
import { ANIM_LIMITS } from '../formats/anim.ts';
import { parseHudText, type HudTextRegions } from '../formats/executable-text.ts';
import { requireEntryBytes } from '../formats/payload-block.ts';
import { VIEW_LABEL_LIMITS } from '../formats/view-labels.ts';
import { SourceError } from '../source-error.ts';
import {
  assetSourceStates, compareLocators, executableRegion, isRegionLocator, readSourceMappingTable, type ArchiveEntryLocator, type SourceMapping,
  type SourceMappingTable,
} from '../source-mapping.ts';
import type { VerifiedSource } from '../source/open-verified-source.ts';
import { verifySourceMappings, type EntryReader } from '../source/verify-source-mappings.ts';
import { convertGraphics, SOURCE_FIELDS, type GraphicsSource, type RecordSelector } from './convert-graphics.ts';
import {
  isHudTextDeclaration, readGraphicsDeclarations, type GraphicsDeclaration, type HudTextDeclaration, type LayoutDeclaration,
} from './graphics-declarations.ts';
import { SNIP_COLOURS } from './source-graphics.ts';
import { stepEntryReader, stepRegionReader, type RegionReader } from './step-entry-reader.ts';

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

/**
 * The draft of `group`: that group's partitions of the step results merged by Asset ID without reconverting, with the
 * source states bound to `sourceFingerprint`. A repeated Asset ID fails as a content contract error; with no Assets the
 * draft is an empty group.
 */
export function stepGroupDraft(group: ResourceGroup, results: readonly GraphicsStepResult[], sourceFingerprint: SourceStateSet['sourceFingerprint']): GroupDraft {
  const partitions = results.flatMap(({ groups }) => groups.filter(partition => partition.group === group));
  return mergedDraft(group, partitions.flatMap(({ descriptors, payloads, sources }) =>
    descriptors.map((descriptor, index) => ({ descriptor, payload: payloads[index], state: sources[index] }))), sourceFingerprint);
}

/**
 * The draft of `group` merged by Asset ID from drafts of it, such as the logic and rule-data drafts of the logic group,
 * as `stepGroupDraft` merges step partitions. Each draft's assets, payloads and source states are in the same ID order.
 */
export function mergeGroupDrafts(group: ResourceGroup, drafts: readonly GroupDraft[], sourceFingerprint: SourceStateSet['sourceFingerprint']): GroupDraft {
  return mergedDraft(group, drafts.flatMap(({ assets, payloads, sources }) =>
    assets.map((descriptor, index) => ({ descriptor, payload: payloads[index], state: sources?.states[index] }))), sourceFingerprint);
}

function mergedDraft(
  group: ResourceGroup,
  unordered: readonly { readonly descriptor: AssetDescriptor; readonly payload: PayloadRecord; readonly state: AssetSourceState | undefined }[],
  sourceFingerprint: SourceStateSet['sourceFingerprint'],
): GroupDraft {
  const items = [...unordered].sort((left, right) => compareText(left.descriptor.id, right.descriptor.id));
  return Object.freeze({
    group,
    assets: readAssetDescriptors(items.map(({ descriptor }) => descriptor), `${group}.assets`),
    payloads: readPayloadRecords(items.map(({ payload }) => payload), `${group}.payloads`),
    sources: readSourceStateSet({ sourceFingerprint, states: items.map(({ state }) => state) }, `${group}.sources`),
  });
}

/** Entry types whose payload is an image record at offset 0 (textures.md §2). */
const WHOLE_RECORD_TYPES: readonly string[] = Object.freeze(['TEX', 'BITM']);
// Container subresources (docs/plan/p2/07/spec.md): decimal indices without leading zeros; a record path may end in
// `/palette` for the record's embedded palette.
const INDEX = '(0|[1-9][0-9]*)';
const FONT_SUBRESOURCE = new RegExp(`^fonts/${INDEX}$`);
const GROUP_SUBRESOURCE = new RegExp(`^groups/${INDEX}$`);
const GROUP_PALETTE_SUBRESOURCE = new RegExp(`^groups/${INDEX}/palette$`);
/** The one instrument record of a type in the slot of a layout number (P3-03 spec, P3-09 的修订：地图几何（修订 2）). */
const INSTRUMENT_SUBRESOURCE = new RegExp(`^layouts/${INDEX}/instruments/type-${INDEX}$`);
const ELEMENT_SUBRESOURCE = new RegExp(`^groups/${INDEX}/elements/${INDEX}(/palette)?$`);
const MFD_SUBRESOURCE = new RegExp(`^lists/${INDEX}/records/${INDEX}(/palette)?$`);
const TABLE_SUBRESOURCE = new RegExp(`^records/${INDEX}(/palette)?$`);
/** A SNIP or ANIM frame. */
const FRAME_SUBRESOURCE = new RegExp(`^frames/${INDEX}$`);
/** The one TABL view label the view labels payload holds (P3-03 spec, S-08). */
const VIEW_LABEL_SUBRESOURCE = `labels/${VIEW_LABELS_FORMAT.subMode}`;
/** Structural entry limits by source type, judged on an entry's directory size before it is read (P3-03 spec, 限值与预算). */
const ENTRY_LIMITS: Readonly<Partial<Record<GraphicsSource['type'], number>>> = Object.freeze({
  'anim-frame': ANIM_LIMITS.entryBytes, 'view-labels': VIEW_LABEL_LIMITS.entryBytes,
});

/**
 * What a source needs besides its entry's bytes: the relocations of a DIAG entry, the region of a SNIP or DIAG mapping,
 * or the whole entry read of an ANIM frame or the view labels.
 */
type Extra = 'block' | 'relocations' | 'colours' | 'format' | 'archive' | 'read' | 'content';
type WithoutBytes<Source> = Source extends unknown ? Omit<Source, Extra> : never;
type SourceKind = WithoutBytes<GraphicsSource>;

/**
 * The region part a source type needs after its archive entry, the field it fills and the region lengths it accepts:
 * a SNIP frame's 4-byte colour table, and the lower line's NUL-terminated format for DIAG (P2-07 spec).
 */
const REGION_PARTS: Readonly<Partial<Record<GraphicsSource['type'], { readonly field: 'colours' | 'format'; readonly fits: (length: number) => boolean }>>> = Object.freeze({
  'snip-frame': Object.freeze({ field: 'colours', fits: (length: number) => length === SNIP_COLOURS }),
  'status-messages': Object.freeze({ field: 'format', fits: (length: number) => length <= STATUS_MESSAGES_LIMITS.textBytes + 1 }),
});

/**
 * The image record a locator selects and whether it names that record's embedded palette, or null when the locator
 * names no image record: a whole TEX/BITM entry, a CCKD element, an MFDD list record or a TABL image list record.
 */
function recordOf(entryType: string, subresource: string | null): { readonly record?: RecordSelector; readonly palette: boolean } | null {
  if (subresource === null || subresource === 'palette') return WHOLE_RECORD_TYPES.includes(entryType) ? { palette: subresource !== null } : null;
  const element = entryType === 'CCKD' ? ELEMENT_SUBRESOURCE.exec(subresource) : null;
  if (element) return { record: { container: 'cockpit-element', slot: Number(element[1]), index: Number(element[2]) }, palette: element[3] !== undefined };
  const record = entryType === 'MFDD' ? MFD_SUBRESOURCE.exec(subresource) : null;
  if (record) return { record: { container: 'mfd-record', list: Number(record[1]), index: Number(record[2]) }, palette: record[3] !== undefined };
  const table = entryType === 'TABL' ? TABLE_SUBRESOURCE.exec(subresource) : null;
  return table && { record: { container: 'table-record', index: Number(table[1]) }, palette: table[2] !== undefined };
}

/** What a locator supplies for an Asset kind, or null when it supplies nothing of that kind. */
function sourceKindOf(kind: string, entryType: string, subresource: string | null): SourceKind | null {
  if (kind === 'data') {
    if (entryType === 'DIAG' && subresource === null) return { type: 'status-messages' };
    return entryType === 'TABL' && subresource === VIEW_LABEL_SUBRESOURCE ? { type: 'view-labels' } : null;
  }
  const frame = kind === 'image' && (entryType === 'SNIP' || entryType === 'ANIM') && subresource !== null ? FRAME_SUBRESOURCE.exec(subresource) : null;
  if (frame) return { type: entryType === 'SNIP' ? 'snip-frame' : 'anim-frame', index: Number(frame[1]) };
  if (kind === 'palette' && subresource === null) return entryType === 'DATA' ? { type: 'data-palette' } : null;
  const groupPalette = kind === 'palette' && entryType === 'CCKD' && subresource !== null ? GROUP_PALETTE_SUBRESOURCE.exec(subresource) : null;
  if (groupPalette) return { type: 'cockpit-group-palette', slot: Number(groupPalette[1]) };
  if (kind === 'palette' || kind === 'image') {
    const located = recordOf(entryType, subresource);
    if (!located || located.palette !== (kind === 'palette')) return null;
    return { type: kind === 'palette' ? 'embedded-palette' : 'image-record', ...(located.record && { record: located.record }) };
  }
  if (entryType !== 'CCKD' || subresource === null) return null;
  const font = kind === 'font' ? FONT_SUBRESOURCE.exec(subresource) : null;
  if (font) return { type: 'cockpit-font', index: Number(font[1]) };
  const group = kind === 'layout' ? GROUP_SUBRESOURCE.exec(subresource) : null;
  return group && { type: 'cockpit-group', slot: Number(group[1]) };
}

/**
 * The archive entry locator a mapping converts from: its first part's first alternative, since exact alternatives are
 * equal; null when that is a region.
 */
function entryOf(mapping: SourceMapping): ArchiveEntryLocator | null {
  const [first] = mapping.parts[0].alternatives;
  return isRegionLocator(first) ? null : first;
}

/** The locator of a single-part mapping, the form of every source but SNIP frames and DIAG. */
const locatorOf = (mapping: SourceMapping): ArchiveEntryLocator | null => (mapping.parts.length === 1 ? entryOf(mapping) : null);

/**
 * The typed source of one Asset from its mapping: a whole DATA entry; a whole-entry image record, a CCKD element, an
 * MFDD list record or a TABL image list record, or the embedded palette of any of them; `fonts/<i>`, `groups/<s>` or
 * `groups/<s>/palette` of a CCKD entry; `frames/<i>` of an ANIM entry; `labels/8` of a TABL view label entry; a SNIP
 * frame with its colour table, or a whole DIAG entry with the lower line's format. Only the last two have a second
 * part, one region of the length their use accepts.
 */
async function graphicsSource({ id, kind }: GraphicsDeclaration['asset'], mapping: SourceMapping, readEntry: EntryReader, readRegion: RegionReader): Promise<GraphicsSource> {
  const entry = entryOf(mapping);
  const source = entry && sourceKindOf(kind, entry.entry.type, entry.subresource);
  if (!entry || !source) throw new SourceError('invalid-declaration', `graphics[${id}].${SOURCE_FIELDS[kind]}`, 'the mapped source does not supply this kind');
  const regionPart = REGION_PARTS[source.type];
  const [, second, ...rest] = mapping.parts;
  const region = second?.alternatives[0];
  const fitting = regionPart && region && rest.length === 0 && isRegionLocator(region) && regionPart.fits(executableRegion(region).length) ? region : null;
  if (regionPart ? !fitting : second !== undefined) {
    throw new SourceError('invalid-declaration', `graphics[${id}].${regionPart?.field ?? SOURCE_FIELDS[kind]}`, 'the mapping does not have the parts this source needs');
  }
  const read = await readEntry(entry);
  // The format readers of ANIM frames and the view labels take the whole entry read.
  if (source.type === 'anim-frame' || source.type === 'view-labels') return { ...source, archive: entry.discPath, read };
  const { bytes, relocations } = read;
  const extra = regionPart && fitting ? { [regionPart.field]: await readRegion(fitting, `graphics[${id}].${regionPart.field}`) } : {};
  // SNIP frames and DIAG check their entry's relocations, the pointer fields their structure names.
  return { ...source, block: bytes, ...(regionPart && { relocations }), ...extra } as GraphicsSource;
}

/**
 * The HUD text from its mapping, `mappings[index]` of the step's table, whose parts must be exactly one EXE region per
 * key the declaration names, in part order. Each region is read through the step's region reader, so it shares the
 * executable and region reads of the step's other Assets. A failure in a region is located at its locator's place in
 * the table followed by its key's structural path, as the rule-data step locates its regions.
 */
async function hudTextSource(
  { asset: { id }, regions: keys }: HudTextDeclaration, mapping: SourceMapping, index: number, readRegion: RegionReader,
): Promise<GraphicsSource> {
  const locators = mapping.parts.map(({ alternatives: [locator] }) => locator);
  if (locators.length !== keys.length || !locators.every(isRegionLocator)) {
    throw new SourceError('invalid-declaration', `graphics[${id}].regions`, 'the mapping must have exactly one region part per declared key');
  }
  const regions = Object.fromEntries(keys.map((key, part) =>
    [key, { locator: locators[part], path: `sources.mappings[${index}].parts[${part}].alternatives[0]/entries/${key}` }])) as HudTextRegions;
  return { type: 'hud-text', content: await parseHudText(regions, readRegion) };
}

/**
 * The map geometry from its mapping, whose parts must be exactly `fonts/<f>` and then `layouts/<l>/instruments/type-<t>`
 * of the same CCKD entry, in canonical locator order; the entry is read once through the step's entry reader, shared
 * with the fonts and layouts.
 */
async function mapGeometrySource({ id }: GraphicsDeclaration['asset'], mapping: SourceMapping, readEntry: EntryReader): Promise<GraphicsSource> {
  const [font, instrument] = mapping.parts.map(({ alternatives: [locator] }) => (isRegionLocator(locator) ? null : locator));
  const record = instrument?.entry.type === 'CCKD' ? INSTRUMENT_SUBRESOURCE.exec(instrument.subresource ?? '') : null;
  const table = font ? FONT_SUBRESOURCE.exec(font.subresource ?? '') : null;
  if (mapping.parts.length !== 2 || !instrument || !font || !record || !table
    || compareLocators({ ...font, subresource: null }, { ...instrument, subresource: null }) !== 0) {
    throw new SourceError('invalid-declaration', `graphics[${id}].messages`, 'the mapping must name an instrument record and a font of one CCKD entry');
  }
  const { bytes } = await readEntry(instrument);
  return { type: 'map-geometry', block: bytes, layout: Number(record[1]), instrumentType: Number(record[2]), font: Number(table[1]) };
}

/**
 * Requires element i of every layout to be mapped to `groups/<s>/elements/<i>` of the layout's own CCKD entry and slot,
 * so the layout and its element images describe the same records.
 */
function checkLayoutElements(declarations: readonly GraphicsDeclaration[], mappingById: ReadonlyMap<string, SourceMapping>): void {
  for (const declaration of declarations) {
    if (declaration.asset.kind !== 'layout') continue;
    const layout = locatorOf(mappingById.get(declaration.asset.id)!)!;
    (declaration as LayoutDeclaration).elements.forEach((image, index) => {
      const element = locatorOf(mappingById.get(image)!);
      if (!element || compareLocators(element, { ...layout, subresource: `${layout.subresource}/elements/${index}` }) !== 0) {
        throw new SourceError('invalid-declaration', `graphics[${declaration.asset.id}].elements[${index}]`, 'the element image is not mapped to this element of the layout group');
      }
    });
  }
}

/**
 * The step's entry reader, shared by mapping verification and conversion: an entry a mapping of `table` locates as a
 * source type with an entry limit must be within it by its directory size before its bytes are read.
 */
function graphicsEntryReader(source: VerifiedSource, table: SourceMappingTable): EntryReader {
  const key = (discPath: string, type: string, id: number) => `${discPath}\u0000${type}\u0000${id}`;
  const limits = new Map<string, number>();
  for (const { asset, parts } of table.mappings) {
    for (const locator of parts.flatMap(({ alternatives }) => alternatives)) {
      if (isRegionLocator(locator)) continue;
      const type = sourceKindOf(asset.kind, locator.entry.type, locator.subresource)?.type;
      const limit = type && ENTRY_LIMITS[type];
      if (limit) limits.set(key(locator.discPath, locator.entry.type, locator.entry.id), limit);
    }
  }
  return stepEntryReader(source, (discPath, entry) => {
    const limit = limits.get(key(discPath, entry.type, entry.id));
    if (limit !== undefined) requireEntryBytes(discPath, entry, limit);
  });
}

/**
 * Runs the graphics conversion step: verifies the mapping table, pairs each declaration with its mapping, requires
 * each layout's element images to be mapped to that layout's group elements, converts the Assets from step-shared
 * entry and region reads (ANIM and view label entries limited by their directory size first; the HUD text from its EXE
 * regions, read like the SNIP colour table and the DIAG format; the map geometry from an instrument record and a font
 * of the cockpit entry), and only then marks their mappings, including subresource and region ones such as ANIM frames,
 * the view label, the HUD text and the map geometry, verified.
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
  const declared = readSourceMappingTable(mappings);
  const readEntry = graphicsEntryReader(source, declared);
  const readRegion = stepRegionReader(source);
  const table = await verifySourceMappings(declared, source, readEntry);
  const checked = readGraphicsDeclarations(declarations);
  const mappingById = new Map<string, SourceMapping>(table.mappings.map(mapping => [mapping.asset.id, mapping]));
  checked.forEach(({ asset }, index) => {
    if (!mappingById.has(asset.id)) throw new SourceError('invalid-declaration', `graphics.declarations[${index}]`, 'the Asset has no source mapping');
  });
  if (table.mappings.length !== checked.length) throw new SourceError('invalid-declaration', 'graphics.declarations', 'every mapped Asset must be declared');
  const sources = new Map<string, GraphicsSource>();
  for (const declaration of checked) {
    const mapping = mappingById.get(declaration.asset.id)!;
    const isMapGeometry = declaration.asset.kind === 'data' && declaration.role === MAP_GEOMETRY_ROLE;
    sources.set(declaration.asset.id, isHudTextDeclaration(declaration)
      ? await hudTextSource(declaration, mapping, table.mappings.indexOf(mapping), readRegion)
      : isMapGeometry
        ? await mapGeometrySource(declaration.asset, mapping, readEntry)
        : await graphicsSource(declaration.asset, mapping, readEntry, readRegion));
  }
  checkLayoutElements(checked, mappingById);
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
