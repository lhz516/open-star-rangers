import { describe, expect, it } from 'vitest';
import { readAssetId, type AssetId } from '../asset-id.ts';
import { expandImage } from '../graphics/expand-image.ts';
import { expectContractError } from '../graphics/graphics.test-support.ts';
import { encodeImagePayload, readImagePayload, type ImagePayload } from '../graphics/image-payload.ts';
import { encodePalettePayload, readPalettePayload, type PalettePayload } from '../graphics/palette-payload.ts';
import { encodeModelPayload, readModelPayload, type ModelPayload } from './model-payload.ts';
import { expandModelTextures, modelPartItems } from './model-parts.ts';
import { TEXTURE_A, TEXTURE_B, expectSameGeometry, pairGeometry, quadGeometry, syntheticModel } from './models.test-support.ts';

const FLIGHT = readAssetId('palette/synthetic-flight');
const PALETTE_A = readAssetId('palette/synthetic-texture-a');
const PALETTE_B = readAssetId('palette/synthetic-texture-b');

const model = (): ModelPayload => readModelPayload(encodeModelPayload(syntheticModel()), 1);

const palette = (...colours: [number, number, number][]): PalettePayload =>
  readPalettePayload(encodePalettePayload({ entries: Uint8Array.from(colours.flat()) }), 1);

// Texture-like images: embedded palettes shown through their nearest flight palette colours, one with a mask.
const IMAGES = new Map<AssetId, ImagePayload>([
  [TEXTURE_A, readImagePayload(encodeImagePayload({ width: 2, height: 2, palette: PALETTE_A, display: { nearest: FLIGHT }, indices: Uint8Array.of(0, 1, 2, 3), mask: null }), 1)],
  [TEXTURE_B, readImagePayload(encodeImagePayload({ width: 3, height: 1, palette: PALETTE_B, display: { nearest: FLIGHT }, indices: Uint8Array.of(1, 0, 1), mask: Uint8Array.of(0b1010_0000) }), 1)],
]);
const PALETTES = new Map<AssetId, PalettePayload>([
  [FLIGHT, palette([0, 0, 0], [250, 10, 10], [10, 250, 10], [10, 10, 250], [128, 128, 128])],
  [PALETTE_A, palette([1, 2, 3], [240, 0, 0], [0, 0, 255], [120, 130, 140])],
  [PALETTE_B, palette([0, 0, 0], [0, 200, 30])],
]);

describe('model part items', () => {
  it('gives each part of a list, in stored order, its geometry and material', () => {
    const items = modelPartItems(model(), 0);
    expect(items).toHaveLength(3);
    [quadGeometry(), quadGeometry(), pairGeometry()].forEach((geometry, index) => expectSameGeometry(items[index], geometry));
    expect(items.map(item => item.material)).toEqual([
      { colour: [255, 255, 255], texture: TEXTURE_B, wrap: 'repeat' },
      { colour: [0, 0, 0] },
      { colour: [12, 34, 56], texture: TEXTURE_A, wrap: 'repeat' },
    ]);
    expect(Object.keys(items[1].material)).toEqual(['colour']);
    expect(modelPartItems(model(), 1).map(item => item.material)).toEqual([{ colour: [255, 0, 128], texture: TEXTURE_A, wrap: 'repeat' }]);
    expectSameGeometry(modelPartItems(model(), 1)[0], pairGeometry());
    expect(modelPartItems(model(), 2)).toEqual([]);
  });

  it('returns frozen items whose arrays are fresh copies on every call', () => {
    const payload = model();
    const [first, shared] = modelPartItems(payload, 0);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.material)).toBe(true);
    expect(first.positions.buffer).not.toBe(shared.positions.buffer);
    expect(first.positions.buffer).not.toBe(payload.geometries[0].positions.buffer);
    first.positions[0] = 9;
    first.uvs[0] = 9;
    first.indices[0] = 3;
    first.cornerShading[0] = 0;
    expectSameGeometry(modelPartItems(payload, 0)[0], quadGeometry());
    expectSameGeometry(payload.geometries[0], quadGeometry());
  });

  it.each([3, -1, 0.5, Number.NaN])('rejects list index %s', list => {
    expectContractError(() => modelPartItems(model(), list), 'invalid-model-payload', 'list');
  });
});

describe('model texture expansion', () => {
  it('expands each referenced texture exactly as expandImage does', () => {
    const textures = expandModelTextures(model(), IMAGES, PALETTES);
    expect([...textures.keys()]).toEqual([TEXTURE_A, TEXTURE_B]);
    for (const [id, image] of IMAGES) {
      const direct = expandImage(image, new Map([[FLIGHT, PALETTES.get(FLIGHT)!], [image.palette, PALETTES.get(image.palette)!]]));
      expect(textures.get(id)).toEqual(direct);
    }
    expect([...textures.get(TEXTURE_A)!.rgba]).toEqual([0, 0, 0, 255, 250, 10, 10, 255, 10, 10, 250, 255, 128, 128, 128, 255]);
    expect([...textures.get(TEXTURE_B)!.rgba]).toEqual([10, 250, 10, 255, 0, 0, 0, 0, 10, 250, 10, 255]);
  });

  it.each<[string, ReadonlyMap<AssetId, ImagePayload>, ReadonlyMap<AssetId, PalettePayload>, string]>([
    ['a missing texture', new Map([[TEXTURE_A, IMAGES.get(TEXTURE_A)!]]), PALETTES, 'images'],
    ['an image under another ID', new Map([[TEXTURE_A, IMAGES.get(TEXTURE_A)!], [readAssetId('image/synthetic-texture-c'), IMAGES.get(TEXTURE_B)!]]), PALETTES, 'images'],
    ['an extra image', new Map([...IMAGES, [readAssetId('image/synthetic-texture-c'), IMAGES.get(TEXTURE_B)!]]), PALETTES, 'images'],
    ['a missing palette', IMAGES, new Map([...PALETTES].filter(([id]) => id !== PALETTE_B)), 'palettes'],
    ['an extra palette', IMAGES, new Map([...PALETTES, [readAssetId('palette/synthetic-extra'), PALETTES.get(FLIGHT)!]]), 'palettes'],
  ])('rejects %s', (_, images, palettes, path) => {
    expectContractError(() => expandModelTextures(model(), images, palettes), 'binding-mismatch', path);
  });
});
