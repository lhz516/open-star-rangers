import { readAssetId, type AssetId } from '../../content/asset-id.ts';
import { EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import { imagePayloadLength } from '../../content/graphics/image-payload.ts';
import { layoutPayloadLength } from '../../content/graphics/layout-payload.ts';
import { palettePayloadLength } from '../../content/graphics/palette-payload.ts';
import { buildImfat, type SyntheticEntry } from '../synthetic.ts';
import {
  cockpitLayoutBlock, dataPaletteBlock, hudFontTables, mfdBlock, rawImageBlock, spriteImageBlock, tableBlock,
} from './conversion.test-support.ts';
import { PRODUCTION_GRAPHICS_MAPPINGS } from './production-graphics.ts';
import { PRODUCTION_MODEL_TEXTURES, modelTexturePaletteId } from './production-model-textures.ts';

// A synthetic archive in the production graphics structure, generated in code; never original data.

const locators = PRODUCTION_GRAPHICS_MAPPINGS.mappings.flatMap(({ parts }) => parts.flatMap(({ alternatives }) => alternatives));

type GraphicsBlocks = Partial<Record<'DATA' | 'CCKD' | 'TEX' | 'MFDD' | 'BITM' | 'TABL', Uint8Array | null>>;

const TEXTURE = Object.freeze({ width: 4, height: 2, paletteEntries: 4 });
const FLIGHT_PALETTE = readAssetId('palette/flight/models');

/** A small raw texture record with an embedded BGR palette, whose indices and colours are a function of `entry`. */
const syntheticTexture = (entry: number): Uint8Array => rawImageBlock(
  TEXTURE.width, TEXTURE.height,
  Array.from({ length: TEXTURE.width * TEXTURE.height }, (_, pixel) => (pixel + entry) % TEXTURE.paletteEntries),
  Array.from({ length: TEXTURE.paletteEntries * 3 }, (_, component) => (entry * 7 + component * 29) & 0xff),
);

const COCKPIT_PALETTE = readAssetId('palette/flight/cockpit-hud-map');
const MAP_PALETTE = readAssetId('palette/map/screen');

/** A synthetic image record and what the length of its converted payload depends on. */
interface SyntheticImage {
  readonly block: Uint8Array;
  readonly width: number;
  readonly height: number;
  /** The palette the production declaration binds. */
  readonly palette: AssetId;
  /** Whether the converted image has a mask: a sprite, or a raw record converted with a colour key. */
  readonly masked: boolean;
}

/**
 * A raw record whose indices are a function of `seed`, so that records differ across lists and entries: index 0, which
 * colour key 0 makes transparent, at every third pixel and other indices elsewhere.
 */
function rawImage(seed: number, width: number, height: number, palette: AssetId, masked = false): SyntheticImage {
  const indices = Array.from({ length: width * height }, (_, pixel) => (pixel % 3 === 0 ? 0 : 1 + ((seed * 37 + pixel * 11) % 255)));
  return { block: rawImageBlock(width, height, indices), width, height, palette, masked };
}

/** `count` raw records of one list, seeded from `seed`. */
const rawImages = (count: number, seed: number, size: (index: number) => readonly [number, number], palette: AssetId, masked = false): SyntheticImage[] =>
  Array.from({ length: count }, (_, index) => rawImage(seed + index, ...size(index), palette, masked));

interface PlacedImage {
  readonly image: SyntheticImage;
  readonly x: number;
  readonly y: number;
  readonly flags: readonly [number, number];
}

/**
 * The four front cockpit elements of CCKD slot 0 under the flight palette: a bottom panel on the frame's lower edge, two
 * struts, the right one on its right edge, and a sprite strip with transparent runs.
 */
const FRONT: readonly PlacedImage[] = [
  { image: rawImage(1, 6, 2, COCKPIT_PALETTE), x: 0, y: 478, flags: [0, 1] },
  { image: rawImage(2, 2, 4, COCKPIT_PALETTE), x: 0, y: 200, flags: [0, 0] },
  { image: rawImage(3, 2, 4, COCKPIT_PALETTE), x: 638, y: 200, flags: [0, 0] },
  {
    image: { block: spriteImageBlock(5, 3, [0, 0, 2, 0, 1, 2, 3, 0, 5, 0, 1, 0, 3, 0, 3, 4, 5, 1, 0]), width: 5, height: 3, palette: COCKPIT_PALETTE, masked: true },
    x: 300, y: 250, flags: [0, 1],
  },
];

/**
 * The four map frame elements of CCKD slot 2 under the map palette, drawn in the second pass; the last ends in the
 * frame's lower right corner.
 */
const MAP_FRAME: readonly PlacedImage[] = [
  { image: rawImage(11, 6, 2, MAP_PALETTE), x: 0, y: 0, flags: [1, 1] },
  { image: rawImage(12, 2, 3, MAP_PALETTE), x: 0, y: 2, flags: [1, 1] },
  { image: rawImage(13, 3, 3, MAP_PALETTE), x: 637, y: 2, flags: [1, 1] },
  { image: rawImage(14, 6, 2, MAP_PALETTE), x: 634, y: 478, flags: [1, 1] },
];

/** The map frame group's palette, unlike the DATA palette. */
const MAP_PALETTE_BLOCK = dataPaletteBlock(index => (index * 11 + 3) % 64);

const STATUS_BACKGROUNDS = rawImages(3, 21, () => [4, 4], COCKPIT_PALETTE);
const STATUS_OVERLAYS = rawImages(9, 31, () => [4, 4], COCKPIT_PALETTE, true);
const DISPLAY_PAGE = rawImage(41, 5, 4, COCKPIT_PALETTE);
const GAUGE_BARS = rawImages(4, 51, index => [2, index < 2 ? 5 : 6], COCKPIT_PALETTE, true);
const UNIT_MARKERS = rawImages(29, 61, () => [4, 3], MAP_PALETTE, true);
const ZOOM_ICONS = rawImages(29, 101, index => (index < 20 ? [5, 5] : [4, 3]), MAP_PALETTE, true);

/** Every synthetic P2-07 image, one per production image Asset. */
const COCKPIT_HUD_MAP_IMAGES: readonly SyntheticImage[] = [
  ...[...FRONT, ...MAP_FRAME].map(({ image }) => image), ...STATUS_BACKGROUNDS, ...STATUS_OVERLAYS, DISPLAY_PAGE, ...GAUGE_BARS,
  ...UNIT_MARKERS, ...ZOOM_ICONS,
];

/** The element positions of the synthetic front cockpit and map frame layouts, by layout Asset ID. */
export const PRODUCTION_LAYOUT_POSITIONS: Readonly<Record<string, readonly { readonly x: number; readonly y: number }[]>> = Object.freeze({
  'layout/cockpit/front': FRONT.map(({ x, y }) => ({ x, y })),
  'layout/map/frame': MAP_FRAME.map(({ x, y }) => ({ x, y })),
});

/**
 * A CCKD entry in the production cockpit structure: `fonts` in its font directory, the front cockpit in slot 0, an empty
 * slot 1, and the map frame with the group palette in slot 2. `firstFrontFlags` replaces the flags of the first front
 * element, such as a value the reader rejects.
 */
export const productionCockpitBlock = (fonts: readonly Uint8Array[] = hudFontTables(), firstFrontFlags?: readonly [number, number]): Uint8Array => {
  const front = FRONT.map((placed, index) => (index === 0 && firstFrontFlags ? { ...placed, flags: firstFrontFlags } : placed));
  return cockpitLayoutBlock(
    [front, [], MAP_FRAME].map(elements => elements.map(({ image, x, y, flags }) => ({ record: image.block, x, y, flags }))),
    fonts,
    [null, null, MAP_PALETTE_BLOCK],
  );
};

/** The `MAIN/SR.NOB` entry a production Asset maps to. */
const entryOf = (id: string): number => PRODUCTION_GRAPHICS_MAPPINGS.mappings.find(({ asset }) => asset.id === id)!.parts[0].alternatives[0].entry.id;

/** The synthetic CCKD, MFDD, BITM and TABL blocks by the entry the production cockpit, HUD and map Assets map to. */
const cockpitHudMapBlocks = (): ReadonlyMap<number, Uint8Array> => {
  const blocks = (images: readonly SyntheticImage[]) => images.map(({ block }) => block);
  return new Map([
    [entryOf('layout/cockpit/front'), productionCockpitBlock()],
    [entryOf('image/hud/status-display/background-0'), mfdBlock([blocks(STATUS_BACKGROUNDS), blocks(STATUS_OVERLAYS)])],
    [entryOf('image/hud/display-page/background'), DISPLAY_PAGE.block],
    [entryOf('image/hud/gauge-bar-1/0'), tableBlock(blocks(GAUGE_BARS))],
    [entryOf('image/map/unit-marker/0'), tableBlock(blocks(UNIT_MARKERS))],
    [entryOf('image/map/zoom-icon/0'), tableBlock(blocks(ZOOM_ICONS))],
  ]);
};

/**
 * Synthetic entries at the mapped production graphics locators, in ascending ID order: a DATA palette; a
 * `productionCockpitBlock()` with two 8×8 fonts and one 4×6 font at the mapped indices; a `syntheticTexture` at every TEX
 * entry of the production texture table; an MFDD with 3 + 9 records, a BITM image and TABL image lists of 4, 29 and 29
 * records at the status display, display page, gauge bar, unit marker and zoom icon entries. Every image is small and
 * differs by list and entry. `blocks` replaces every entry of a type, or omits them when null.
 */
export function productionGraphicsEntries(blocks: GraphicsBlocks = {}): SyntheticEntry[] {
  const cockpitHudMap = cockpitHudMapBlocks();
  const content = (type: string, id: number): Uint8Array | null => {
    const block = blocks[type as keyof GraphicsBlocks];
    if (block !== undefined) return block;
    return type === 'DATA' ? dataPaletteBlock() : type === 'TEX' ? syntheticTexture(id) : cockpitHudMap.get(id)!;
  };
  const entries = new Map<number, SyntheticEntry>();
  for (const { entry: { id, type } } of locators) {
    if (entries.has(id)) continue;
    const data = content(type, id);
    if (data) entries.set(id, { id, type, data });
  }
  return [...entries.values()].sort((left, right) => left.id - right.id);
}

/**
 * The disc files of a source holding only the production graphics archive with `productionGraphicsEntries`;
 * `extra` adds other entries to the same archive.
 */
export const productionGraphicsFiles = (blocks: GraphicsBlocks = {}, extra: readonly SyntheticEntry[] = []): Record<string, Uint8Array> =>
  ({ [locators[0].discPath]: buildImfat(10_000, [...productionGraphicsEntries(blocks), ...extra].sort((left, right) => left.id - right.id)) });

/**
 * The graphics conversion usage of the slice textures on `productionGraphicsEntries()`: per table row an image of
 * `TEXTURE` pixels shown through the flight palette, so two dependencies, and its embedded palette.
 */
export const MODEL_TEXTURE_USAGE: BudgetRecord = Object.freeze({
  ...EMPTY_BUDGET_USAGE,
  assets: 2 * PRODUCTION_MODEL_TEXTURES.length,
  dependencyEdges: 2 * PRODUCTION_MODEL_TEXTURES.length,
  paletteEntries: TEXTURE.paletteEntries * PRODUCTION_MODEL_TEXTURES.length,
  imagePixels: TEXTURE.width * TEXTURE.height * PRODUCTION_MODEL_TEXTURES.length,
  payloadBytes: PRODUCTION_MODEL_TEXTURES.reduce((total, _, index) => total + palettePayloadLength(TEXTURE.paletteEntries) + imagePayloadLength({
    width: TEXTURE.width, height: TEXTURE.height, palette: modelTexturePaletteId(index), display: { nearest: FLIGHT_PALETTE },
  }, false), 0),
});

/** A layout payload's length depends only on the element image IDs. */
const layoutBytes = (prefix: string, count: number): number =>
  layoutPayloadLength({ elements: Array.from({ length: count }, (_, index) => ({ image: readAssetId(`${prefix}${index}`), x: 0, y: 0 })) });

/**
 * The graphics conversion usage of the P2-07 Assets on `productionGraphicsEntries()`: every synthetic image with its
 * palette, the 256-entry map palette, and the front cockpit and map frame layouts with an edge per element.
 */
export const COCKPIT_HUD_MAP_USAGE: BudgetRecord = Object.freeze({
  ...EMPTY_BUDGET_USAGE,
  assets: COCKPIT_HUD_MAP_IMAGES.length + 1 + 2,
  dependencyEdges: COCKPIT_HUD_MAP_IMAGES.length + FRONT.length + MAP_FRAME.length,
  paletteEntries: 256,
  imagePixels: COCKPIT_HUD_MAP_IMAGES.reduce((total, { width, height }) => total + width * height, 0),
  payloadBytes: COCKPIT_HUD_MAP_IMAGES.reduce((total, { width, height, palette, masked }) => total + imagePayloadLength({ width, height, palette, display: 'direct' }, masked), 0)
    + palettePayloadLength(256) + layoutBytes('image/cockpit/front/element-', FRONT.length) + layoutBytes('image/map/frame/element-', MAP_FRAME.length),
});
