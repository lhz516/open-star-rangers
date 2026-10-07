import type { ResourceGroup } from '../../content/asset-contract.ts';
import type { AssetId } from '../../content/asset-id.ts';
import { ContentContractError } from '../../content/contract-validation.ts';
import { composeLayout } from '../../content/graphics/compose-layout.ts';
import { expandImage } from '../../content/graphics/expand-image.ts';
import { readFontPayload } from '../../content/graphics/font-payload.ts';
import { imagePalettes, layoutImages, referencedPalettes } from '../../content/graphics/graphics-binding.ts';
import { readImagePayload, type ImagePayload } from '../../content/graphics/image-payload.ts';
import { readLayoutPayload } from '../../content/graphics/layout-payload.ts';
import { readPalettePayload, type PalettePayload } from '../../content/graphics/palette-payload.ts';
import { readGroupManifest } from '../../content/manifest.ts';
import { readPayloadRecords, type PayloadRecord } from '../../content/payload.ts';
import type { ViewerItem } from '../../render/viewer/viewer-renderer.ts';
import type { HeldGroup } from '../resources/resource-holder.ts';

// The viewer's items (P2-11 S-07): the 2D Assets of the held package's complete groups, and their resolution into what
// the renderer shows, only through the content readers and consumers. Models and effects join with subtask 09.

export type ViewerEntryKind = ViewerItem['kind'];

/** One listed item: an Asset of a complete group the renderer can show. */
export interface ViewerEntry {
  readonly kind: ViewerEntryKind;
  readonly id: AssetId;
  readonly group: ResourceGroup;
  readonly role: string;
}

/** Why an item could not be shown: the content error's stable code, structural path and fixed reason. */
export interface ViewerItemFailure {
  readonly code: string;
  readonly path: string;
  readonly reason: string;
}

export type ResolvedItem =
  | { readonly status: 'resolved'; readonly item: ViewerItem }
  | { readonly status: 'failed'; readonly failure: ViewerItemFailure };

const KINDS: ReadonlySet<string> = new Set<ViewerEntryKind>(['image', 'layout', 'palette', 'font']);

/** The held package's payload records by Asset ID, across its complete groups. */
export type PackagePayloads = ReadonlyMap<AssetId, PayloadRecord>;

/** Every 2D Asset of the complete groups, in group order and then manifest order, with their payloads by Asset ID. */
export function viewerCatalog(groups: readonly HeldGroup[]): { readonly entries: readonly ViewerEntry[]; readonly payloads: PackagePayloads } {
  const entries: ViewerEntry[] = [];
  const payloads = new Map<AssetId, PayloadRecord>();
  for (const held of groups) {
    const listed = readGroupManifest(held.manifest, `groups.${held.group}.manifest`).assets.filter(({ kind }) => KINDS.has(kind));
    if (listed.length === 0) continue;
    for (const { id, kind, role } of listed) entries.push(Object.freeze({ kind: kind as ViewerEntryKind, id, group: held.group, role }));
    const ids = new Set(listed.map(({ id }) => id));
    for (const record of readPayloadRecords(held.payloads, `groups.${held.group}.payloads`)) if (ids.has(record.id)) payloads.set(record.id, record);
  }
  return Object.freeze({ entries: Object.freeze(entries), payloads });
}

function record(payloads: PackagePayloads, id: AssetId, path: string): PayloadRecord {
  const found = payloads.get(id);
  if (!found) throw new ContentContractError('binding-mismatch', path, 'is not in the held package');
  return found;
}

const readPalette = (payloads: PackagePayloads, id: AssetId): PalettePayload => {
  const { bytes, schemaVersion } = record(payloads, id, `palettes[${id}]`);
  return readPalettePayload(bytes, schemaVersion, `palettes[${id}]`);
};

const readImage = (payloads: PackagePayloads, id: AssetId): ImagePayload => {
  const { bytes, schemaVersion } = record(payloads, id, `images[${id}]`);
  return readImagePayload(bytes, schemaVersion, `images[${id}]`);
};

const paletteMap = (payloads: PackagePayloads, ids: readonly AssetId[]): Map<AssetId, PalettePayload> =>
  new Map(ids.map(id => [id, readPalette(payloads, id)]));

function resolve(entry: ViewerEntry, payloads: PackagePayloads): ViewerItem {
  const { kind, id } = entry;
  switch (kind) {
    case 'palette':
      return { kind, id, palette: readPalette(payloads, id) };
    case 'font': {
      const { bytes, schemaVersion } = record(payloads, id, `fonts[${id}]`);
      return { kind, id, font: readFontPayload(bytes, schemaVersion, `fonts[${id}]`) };
    }
    case 'image': {
      const image = readImage(payloads, id);
      return { kind, id, picture: expandImage(image, paletteMap(payloads, imagePalettes(image)), `images[${id}]`) };
    }
    case 'layout': {
      const { bytes, schemaVersion } = record(payloads, id, `layouts[${id}]`);
      const layout = readLayoutPayload(bytes, schemaVersion, `layouts[${id}]`);
      const images = new Map(layoutImages(layout).map(image => [image, readImage(payloads, image)]));
      const palettes = paletteMap(payloads, [...new Set([...images.values()].flatMap(referencedPalettes))]);
      return { kind, id, picture: composeLayout(layout, images, palettes, `layouts[${id}]`) };
    }
  }
}

/** Reads and expands one entry; a content error becomes the item's failure, and anything else is a defect that propagates. */
export function resolveItem(entry: ViewerEntry, payloads: PackagePayloads): ResolvedItem {
  try {
    return Object.freeze({ status: 'resolved', item: resolve(entry, payloads) });
  } catch (error) {
    if (!(error instanceof ContentContractError)) throw error;
    return Object.freeze({ status: 'failed', failure: Object.freeze({ code: error.code, path: error.path, reason: error.reason }) });
  }
}
