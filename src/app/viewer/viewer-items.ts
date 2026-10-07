import type { ResourceGroup } from '../../content/asset-contract.ts';
import type { AssetId } from '../../content/asset-id.ts';
import { ContentContractError } from '../../content/contract-validation.ts';
import { readEffectPayload, type EffectKind } from '../../content/effects/effect-payload.ts';
import { composeLayout } from '../../content/graphics/compose-layout.ts';
import { expandImage } from '../../content/graphics/expand-image.ts';
import { readFontPayload } from '../../content/graphics/font-payload.ts';
import { imagePalettes, layoutImages, referencedPalettes } from '../../content/graphics/graphics-binding.ts';
import { readImagePayload, type ImagePayload } from '../../content/graphics/image-payload.ts';
import { readLayoutPayload } from '../../content/graphics/layout-payload.ts';
import { readPalettePayload, type PalettePayload } from '../../content/graphics/palette-payload.ts';
import { readGroupManifest } from '../../content/manifest.ts';
import { expandModelTextures, modelPartItems } from '../../content/models/model-parts.ts';
import { MODEL_LIMITS, modelReferences, readModelPayload } from '../../content/models/model-payload.ts';
import { readPayloadRecords, type PayloadRecord } from '../../content/payload.ts';
import { effectViews, type EffectViewLabel } from '../../render/viewer/viewer-effects.ts';
import { effectAppearance, type EffectAppearance } from '../../render/viewer/viewer-presentation.ts';
import type { ViewerItem } from '../../render/viewer/viewer-renderer.ts';
import type { HeldGroup } from '../resources/resource-holder.ts';

// The viewer's items (P2-11 S-07): the models, effects and 2D Assets of the held package's complete groups, and their
// resolution into what the renderer shows, only through the content readers and consumers.

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

/** What each source part list holds and how sure that is (docs/original/formats/mesh.md, U-027). */
export const MODEL_PART_LISTS = Object.freeze([
  Object.freeze({ list: 0, content: 'intact', confidence: 'likely' }),
  Object.freeze({ list: 1, content: 'fragments', confidence: 'confirmed' }),
  Object.freeze({ list: 2, content: 'unknown', confidence: 'unconfirmed' }),
] as const);

/** One alternative of an entry, chosen by its position: a model's part list, or one view of an effect. */
export type ViewerVariant =
  | {
    readonly kind: 'part-list'; readonly list: number; readonly parts: number;
    readonly content: (typeof MODEL_PART_LISTS)[number]['content']; readonly confidence: (typeof MODEL_PART_LISTS)[number]['confidence'];
  }
  | { readonly kind: 'effect-view'; readonly label: EffectViewLabel; readonly index: number; readonly shapes: readonly EffectAppearance[] };

/** An entry read and expanded once, so that switching between its variants reads nothing again. */
export interface ResolvedEntry {
  /** Empty for 2D items. */
  readonly variants: readonly ViewerVariant[];
  /** The item of a variant (0 for 2D items); null when the entry has no such variant. */
  item(variant: number): ViewerItem | null;
}

export type EntryResolution =
  | { readonly status: 'resolved'; readonly entry: ResolvedEntry }
  | { readonly status: 'failed'; readonly failure: ViewerItemFailure };

const PICTURES: ReadonlySet<string> = new Set<ViewerEntryKind>(['image', 'layout', 'palette', 'font']);
const EFFECT_ROLES: ReadonlySet<string> = new Set<EffectKind>(['projectile', 'missile', 'debris']);

/** How an Asset is listed: models and 2D kinds as themselves, effect data as `effect`; null when not listed. */
function entryKind(kind: string, role: string): ViewerEntryKind | null {
  if (PICTURES.has(kind) || kind === 'model') return kind as ViewerEntryKind;
  return kind === 'data' && EFFECT_ROLES.has(role) ? 'effect' : null;
}

/** The held package's payload records by Asset ID, across its complete groups. */
export type PackagePayloads = ReadonlyMap<AssetId, PayloadRecord>;

/**
 * Every model, effect and 2D Asset of the complete groups, in group order and then manifest order, with their payloads
 * by Asset ID; model textures and their palettes are 2D Assets, so they are among them.
 */
export function viewerCatalog(groups: readonly HeldGroup[]): { readonly entries: readonly ViewerEntry[]; readonly payloads: PackagePayloads } {
  const entries: ViewerEntry[] = [];
  const payloads = new Map<AssetId, PayloadRecord>();
  for (const held of groups) {
    const listed = readGroupManifest(held.manifest, `groups.${held.group}.manifest`).assets.flatMap(({ id, kind, role }) => {
      const listedKind = entryKind(kind, role);
      return listedKind === null ? [] : [Object.freeze({ kind: listedKind, id, group: held.group, role })];
    });
    if (listed.length === 0) continue;
    entries.push(...listed);
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

const NO_VARIANTS = Object.freeze([]) as readonly never[];

const isVariant = (variant: number, count: number): boolean => Number.isSafeInteger(variant) && variant >= 0 && variant < count;

function resolve(entry: ViewerEntry, payloads: PackagePayloads): ResolvedEntry {
  const { kind, id } = entry;
  const picture = (item: ViewerItem): ResolvedEntry => ({ variants: NO_VARIANTS, item: variant => (variant === 0 ? item : null) });
  switch (kind) {
    case 'palette':
      return picture({ kind, id, palette: readPalette(payloads, id) });
    case 'font': {
      const { bytes, schemaVersion } = record(payloads, id, `fonts[${id}]`);
      return picture({ kind, id, font: readFontPayload(bytes, schemaVersion, `fonts[${id}]`) });
    }
    case 'image': {
      const image = readImage(payloads, id);
      return picture({ kind, id, picture: expandImage(image, paletteMap(payloads, imagePalettes(image)), `images[${id}]`) });
    }
    case 'layout': {
      const { bytes, schemaVersion } = record(payloads, id, `layouts[${id}]`);
      const layout = readLayoutPayload(bytes, schemaVersion, `layouts[${id}]`);
      const images = new Map(layoutImages(layout).map(image => [image, readImage(payloads, image)]));
      const palettes = paletteMap(payloads, [...new Set([...images.values()].flatMap(referencedPalettes))]);
      return picture({ kind, id, picture: composeLayout(layout, images, palettes, `layouts[${id}]`) });
    }
    case 'model': {
      const { bytes, schemaVersion } = record(payloads, id, `models[${id}]`);
      const model = readModelPayload(bytes, schemaVersion, `models[${id}]`);
      const images = new Map(modelReferences(model).filter(reference => reference.kind === 'image').map(({ id: image }) => [image, readImage(payloads, image)]));
      const textures = expandModelTextures(model, images, paletteMap(payloads, [...new Set([...images.values()].flatMap(imagePalettes))]));
      return {
        variants: Object.freeze(MODEL_PART_LISTS.map(({ list, content, confidence }): ViewerVariant =>
          Object.freeze({ kind: 'part-list', list, parts: model.partLists[list].length, content, confidence }))),
        item: list => (isVariant(list, MODEL_LIMITS.partLists) ? { kind, id, parts: modelPartItems(model, list), textures } : null),
      };
    }
    case 'effect': {
      const { bytes, schemaVersion } = record(payloads, id, `effects[${id}]`);
      const payload = readEffectPayload(bytes, schemaVersion, entry.role as EffectKind, `effects[${id}]`);
      const views = effectViews(payload);
      const textures = new Map<AssetId, ReturnType<typeof expandImage>>();
      if (payload.kind !== 'projectile') {
        const image = readImage(payloads, payload.texture);
        textures.set(payload.texture, expandImage(image, paletteMap(payloads, imagePalettes(image)), `images[${payload.texture}]`));
      }
      return {
        variants: Object.freeze(views.map(({ label, index, shapes }): ViewerVariant =>
          Object.freeze({ kind: 'effect-view', label, index, shapes: Object.freeze(shapes.map(effectAppearance)) }))),
        item: index => (isVariant(index, views.length) ? { kind, id, view: views[index], textures } : null),
      };
    }
  }
}

/**
 * Reads and expands one entry once, for all its variants. A content error becomes the item's failure; anything else is
 * a defect that propagates.
 */
export function resolveEntry(entry: ViewerEntry, payloads: PackagePayloads): EntryResolution {
  try {
    return Object.freeze({ status: 'resolved', entry: resolve(entry, payloads) });
  } catch (error) {
    if (!(error instanceof ContentContractError)) throw error;
    return Object.freeze({ status: 'failed', failure: Object.freeze({ code: error.code, path: error.path, reason: error.reason }) });
  }
}
