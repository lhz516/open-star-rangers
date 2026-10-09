import { readAssetId } from '../../content/asset-id.ts';
import { EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import { imagePayloadLength } from '../../content/graphics/image-payload.ts';
import { palettePayloadLength } from '../../content/graphics/palette-payload.ts';
import { encodeViewLabelsPayload } from '../../content/hud/view-labels-payload.ts';
import { patternFrame, type SyntheticFrame } from '../formats/anim.test-support.ts';
import { archiveLocator } from '../source-mapping.ts';
import { buildImfat, type SyntheticEntry } from '../synthetic.test-support.ts';
import { animEntry, blockEntry, dataPaletteBlock, rawImageBlock, viewLabelTable } from './conversion.test-support.ts';
import { PRODUCTION_FLIGHT_GRAPHICS_MAPPINGS, PRODUCTION_EXPLOSION_ANIMATIONS, PRODUCTION_NEBULA_IMAGES } from './production-flight-graphics.ts';
import { PRODUCTION_GRAPHICS_MAPPINGS } from './production-graphics.ts';

// Synthetic SR.NOB entries in the production flight graphics structure, generated in code; never original data. Every
// image is small, and its indices, sizes and label bytes are made up and differ by entry, so a test can tell which
// entry and frame each Asset was converted from.

/** The entry a production mapping of `table` converts `id` from. */
const entryOf = (table: typeof PRODUCTION_GRAPHICS_MAPPINGS, id: string): number =>
  archiveLocator(table.mappings.find(({ asset }) => asset.id === id)!.parts[0].alternatives[0]).entry.id;

/** The DATA entry the production flight palettes map to. */
export const FLIGHT_PALETTE_ENTRY = entryOf(PRODUCTION_GRAPHICS_MAPPINGS, 'palette/flight/models');

const HIT_SHIMMER_ENTRY = entryOf(PRODUCTION_FLIGHT_GRAPHICS_MAPPINGS, 'image/hit-shimmer');
const TARGET_DISPLAY_ENTRY = entryOf(PRODUCTION_FLIGHT_GRAPHICS_MAPPINGS, 'image/hud/target-display/background');
const VIEW_LABELS_ENTRY = entryOf(PRODUCTION_FLIGHT_GRAPHICS_MAPPINGS, 'data/hud/view-labels');

/** A raw record without a palette: `width` × `height` made-up indices over the whole 8-bit range, seeded by `seed`. */
interface SyntheticRawImage {
  readonly width: number;
  readonly height: number;
  readonly indices: readonly number[];
}

const rawIndices = (width: number, height: number, seed: number, range = 256): SyntheticRawImage =>
  ({ width, height, indices: Array.from({ length: width * height }, (_, pixel) => (seed * 41 + pixel * 53 + 7) % range) });

/** The hit-shimmer thresholds: every value is kept as stored, including those beyond any palette's use. */
export const SYNTHETIC_HIT_SHIMMER = rawIndices(8, 6, 3);

/** The target display background: indices below its 16-entry embedded palette, and that palette as stored BGR triples. */
export const SYNTHETIC_TARGET_DISPLAY = Object.freeze({
  ...rawIndices(5, 4, 9, 16),
  bgr: Array.from({ length: 16 * 3 }, (_, component) => (component * 23 + 11) & 0xff),
});

/** Nebula background `index` of the NEBC list. */
export const syntheticNebula = (index: number): SyntheticRawImage => rawIndices(3 + (index % 3), 4, 100 + index);

/** Frame `frame` of explosion animation `animation`, both from 0: runs of both kinds, sized by animation and frame. */
export const syntheticExplosionFrame = (animation: number, frame: number): SyntheticFrame =>
  patternFrame(3 + (animation % 5), 3 + (frame % 3), animation * 31 + frame + 1);

/** Made-up bytes of the view label of sub-mode 8, including 1, 0x7F and bytes 128–255. */
export const SYNTHETIC_VIEW_LABEL = String.fromCharCode(0x5a, 1, 0x7f, 0x80, 0xa7, 0xff, 0x20, 0x2e, 0x5a);

const rawEntry = (id: number, type: string, { width, height, indices }: SyntheticRawImage, bgr: readonly number[] = []): SyntheticEntry =>
  ({ id, type, data: rawImageBlock(width, height, indices, bgr) });

/**
 * The synthetic entries of every production flight graphic, in ascending ID order: TEX 11069 and 11089, the 15 BITM of
 * the NEBC list, the 17 ANIM entries with their production frame counts and TABL 10399. `replace` swaps an entry by ID
 * for another, or omits it when null. The DATA entry of the flight palettes is not included.
 */
export function productionFlightGraphicsEntries(replace: Readonly<Record<number, SyntheticEntry | null>> = {}): SyntheticEntry[] {
  const entries = [
    rawEntry(HIT_SHIMMER_ENTRY, 'TEX', SYNTHETIC_HIT_SHIMMER),
    rawEntry(TARGET_DISPLAY_ENTRY, 'TEX', SYNTHETIC_TARGET_DISPLAY, SYNTHETIC_TARGET_DISPLAY.bgr),
    ...PRODUCTION_NEBULA_IMAGES.map((entry, index) => rawEntry(entry, 'BITM', syntheticNebula(index))),
    ...PRODUCTION_EXPLOSION_ANIMATIONS.map(({ entry, frames }, animation) =>
      animEntry(entry, Array.from({ length: frames }, (_, frame) => syntheticExplosionFrame(animation, frame)))),
    blockEntry(VIEW_LABELS_ENTRY, 'TABL', viewLabelTable(SYNTHETIC_VIEW_LABEL)),
  ];
  return entries
    .map(entry => (Object.hasOwn(replace, entry.id) ? replace[entry.id] : entry))
    .filter((entry): entry is SyntheticEntry => entry !== null)
    .sort((left, right) => left.id - right.id);
}

/** The disc files of a source holding the flight graphics entries and the DATA entry of the flight palettes. */
export const productionFlightGraphicsFiles = (replace: Readonly<Record<number, SyntheticEntry | null>> = {}): Record<string, Uint8Array> => ({
  'MAIN/SR.NOB': buildImfat(10_000, [{ id: FLIGHT_PALETTE_ENTRY, type: 'DATA', data: dataPaletteBlock() }, ...productionFlightGraphicsEntries(replace)]
    .sort((left, right) => left.id - right.id)),
});

const MODELS_PALETTE = readAssetId('palette/flight/models');

/**
 * The graphics conversion usage of the flight graphics on `productionFlightGraphicsEntries()`, computed from the
 * synthetic images and label alone: each image with an edge per bound palette, the target display's embedded palette,
 * and the view labels payload. The flight palettes are not included.
 */
export const FLIGHT_GRAPHICS_USAGE: BudgetRecord = (() => {
  const direct = (width: number, height: number, masked: boolean) => imagePayloadLength({ width, height, palette: MODELS_PALETTE, display: 'direct' }, masked);
  const frames = PRODUCTION_EXPLOSION_ANIMATIONS.flatMap(({ frames: count }, animation) =>
    Array.from({ length: count }, (_, frame) => syntheticExplosionFrame(animation, frame)));
  const nebulae = PRODUCTION_NEBULA_IMAGES.map((_, index) => syntheticNebula(index));
  const opaque = [SYNTHETIC_HIT_SHIMMER, ...nebulae];
  const target = SYNTHETIC_TARGET_DISPLAY;
  const pixels = (images: readonly { readonly width: number; readonly height: number }[]) => images.reduce((total, { width, height }) => total + width * height, 0);
  return Object.freeze({
    ...EMPTY_BUDGET_USAGE,
    assets: frames.length + opaque.length + 2 + 1,
    dependencyEdges: frames.length + opaque.length + 2,
    paletteEntries: target.bgr.length / 3,
    imagePixels: pixels(frames) + pixels(opaque) + target.width * target.height,
    payloadBytes: frames.reduce((total, { width, height }) => total + direct(width, height, true), 0)
      + opaque.reduce((total, { width, height }) => total + direct(width, height, false), 0)
      + imagePayloadLength({
        width: target.width, height: target.height, palette: readAssetId('palette/hud/target-display/background'),
        display: { nearest: readAssetId('palette/flight/cockpit-hud-map') },
      }, false)
      + palettePayloadLength(target.bgr.length / 3)
      + encodeViewLabelsPayload({ labels: [{ subMode: 8, text: SYNTHETIC_VIEW_LABEL }] }).length,
  });
})();
