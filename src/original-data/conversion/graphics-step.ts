import { RESOURCE_GROUPS, type AssetDescriptor, type AssetReference, type ResourceGroup } from '../../content/asset-contract.ts';
import { EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import { compareText } from '../../content/contract-validation.ts';
import type { GroupDraft } from '../../content/manifest-identity.ts';
import { readAssetDescriptors } from '../../content/manifest.ts';
import { readPayloadRecords, type PayloadRecord } from '../../content/payload.ts';
import { readSourceStateSet, type AssetSourceState, type SourceStateSet } from '../../content/source-state.ts';
import { SourceError } from '../source-error.ts';
import { assetSourceStates, compareLocators, readSourceMappingTable, type OriginalAssetLocator, type SourceMapping } from '../source-mapping.ts';
import type { VerifiedSource } from '../source/open-verified-source.ts';
import { verifySourceMappings, type EntryReader } from '../source/verify-source-mappings.ts';
import { convertGraphics, type GraphicsSource, type RecordSelector } from './convert-graphics.ts';
import { readGraphicsDeclarations, type GraphicsDeclaration, type LayoutDeclaration } from './graphics-declarations.ts';
import { stepEntryReader } from './step-entry-reader.ts';

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
  const items = results
    .flatMap(({ groups }) => groups.filter(partition => partition.group === group))
    .flatMap(({ descriptors, payloads, sources }) => descriptors.map((descriptor, index) => ({ descriptor, payload: payloads[index], state: sources[index] })))
    .sort((left, right) => compareText(left.descriptor.id, right.descriptor.id));
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
const ELEMENT_SUBRESOURCE = new RegExp(`^groups/${INDEX}/elements/${INDEX}(/palette)?$`);
const MFD_SUBRESOURCE = new RegExp(`^lists/${INDEX}/records/${INDEX}(/palette)?$`);
const TABLE_SUBRESOURCE = new RegExp(`^records/${INDEX}(/palette)?$`);
const SOURCE_FIELDS = Object.freeze({ palette: 'palette', image: 'record', font: 'fonts', layout: 'groups' } as Record<string, string>);

type WithoutBlock<Source> = Source extends unknown ? Omit<Source, 'block'> : never;
type SourceKind = WithoutBlock<GraphicsSource>;

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

/** The locator a mapping converts from: its only part's first alternative, since exact alternatives are equal. */
const locatorOf = (mapping: SourceMapping): OriginalAssetLocator | null => (mapping.parts.length === 1 ? mapping.parts[0].alternatives[0] : null);

/**
 * The typed source of one Asset from its mapping: a whole DATA entry; a whole-entry image record, a CCKD element, an
 * MFDD list record or a TABL image list record, or the embedded palette of any of them; `fonts/<i>`, `groups/<s>` or
 * `groups/<s>/palette` of a CCKD entry.
 */
async function graphicsSource({ id, kind }: AssetReference, mapping: SourceMapping, readEntry: EntryReader): Promise<GraphicsSource> {
  const locator = locatorOf(mapping);
  const source = locator && sourceKindOf(kind, locator.entry.type, locator.subresource);
  if (!locator || !source) {
    throw new SourceError('invalid-declaration', `graphics[${id}].${SOURCE_FIELDS[kind]}`, 'the mapped source does not supply this kind');
  }
  return { ...source, block: (await readEntry(locator)).bytes } as GraphicsSource;
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
 * Runs the graphics conversion step: verifies the mapping table, pairs each declaration with its mapping, requires
 * each layout's element images to be mapped to that layout's group elements, converts the Assets from step-shared
 * entry reads, and only then marks their mappings, including subresource ones, verified.
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
