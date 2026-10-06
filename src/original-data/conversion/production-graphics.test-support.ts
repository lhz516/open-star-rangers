import { readAssetId } from '../../content/asset-id.ts';
import { EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import { imagePayloadLength } from '../../content/graphics/image-payload.ts';
import { palettePayloadLength } from '../../content/graphics/palette-payload.ts';
import { archiveLocator } from '../source-mapping.ts';
import { buildImfat, type SyntheticEntry } from '../synthetic.ts';
import { cockpitBlock, dataPaletteBlock, hudFontTables, rawImageBlock } from './conversion.test-support.ts';
import { PRODUCTION_EFFECT_IMAGES, PRODUCTION_GRAPHICS_MAPPINGS } from './production-graphics.ts';
import { PRODUCTION_MODEL_TEXTURES, modelTexturePaletteId } from './production-model-textures.ts';

// A synthetic archive in the production graphics structure, generated in code; never original data.

const locators = PRODUCTION_GRAPHICS_MAPPINGS.mappings.flatMap(({ parts }) => parts.flatMap(({ alternatives }) => alternatives));

type GraphicsBlocks = { DATA?: Uint8Array | null; CCKD?: Uint8Array | null; TEX?: Uint8Array | null };

const TEXTURE = Object.freeze({ width: 4, height: 2, paletteEntries: 4 });
const FLIGHT_PALETTE = readAssetId('palette/flight/models');

/** A small raw texture record with an embedded BGR palette, whose indices and colours are a function of `entry`. */
const syntheticTexture = (entry: number): Uint8Array => rawImageBlock(
  TEXTURE.width, TEXTURE.height,
  Array.from({ length: TEXTURE.width * TEXTURE.height }, (_, pixel) => (pixel + entry) % TEXTURE.paletteEntries),
  Array.from({ length: TEXTURE.paletteEntries * 3 }, (_, component) => (entry * 7 + component * 29) & 0xff),
);

/**
 * Synthetic entries at the mapped production graphics locators, in ascending ID order: a DATA palette, a CCKD entry
 * whose font directory holds two 8×8 fonts and one 4×6 font at the mapped indices, and a `syntheticTexture` at every
 * TEX entry of the production texture table. `blocks` replaces every entry of a type, or omits them when null.
 */
export function productionGraphicsEntries(blocks: GraphicsBlocks = {}): SyntheticEntry[] {
  const content = (type: string, id: number): Uint8Array | null => {
    const block = blocks[type as keyof GraphicsBlocks];
    if (block !== undefined) return block;
    return type === 'DATA' ? dataPaletteBlock() : type === 'CCKD' ? cockpitBlock(hudFontTables()) : syntheticTexture(id);
  };
  const entries = new Map<number, SyntheticEntry>();
  for (const { entry: { id, type } } of locators.map(archiveLocator)) {
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

/** The palette of every slice texture, in table order, then of every effect image. */
const TEXTURE_PALETTES = [
  ...PRODUCTION_MODEL_TEXTURES.map((_, index) => modelTexturePaletteId(index)),
  ...PRODUCTION_EFFECT_IMAGES.map(({ role }) => readAssetId(`palette/${role}`)),
];

/**
 * The graphics conversion usage of the slice textures and effect images on `productionGraphicsEntries()`: each an
 * image of `TEXTURE` pixels shown through the flight palette, so two dependencies, and its embedded palette.
 */
export const MODEL_TEXTURE_USAGE: BudgetRecord = Object.freeze({
  ...EMPTY_BUDGET_USAGE,
  assets: 2 * TEXTURE_PALETTES.length,
  dependencyEdges: 2 * TEXTURE_PALETTES.length,
  paletteEntries: TEXTURE.paletteEntries * TEXTURE_PALETTES.length,
  imagePixels: TEXTURE.width * TEXTURE.height * TEXTURE_PALETTES.length,
  payloadBytes: TEXTURE_PALETTES.reduce((total, palette) => total + palettePayloadLength(TEXTURE.paletteEntries) + imagePayloadLength({
    width: TEXTURE.width, height: TEXTURE.height, palette, display: { nearest: FLIGHT_PALETTE },
  }, false), 0),
});
