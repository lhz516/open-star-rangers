import { describe, expect, it } from 'vitest';
import { readAssetId } from '../../content/asset-id.ts';
import { EMPTY_BUDGET_USAGE } from '../../content/budget.ts';
import { quadGeometry } from '../../content/models/models.test-support.ts';
import { syntheticModl } from '../synthetic.ts';
import { countedVerifiedSource, meshBlockFor, textureBlock } from './conversion.test-support.ts';
import { convertModels } from './convert-models.ts';
import { runGraphicsStep } from './graphics-step.ts';
import { PRODUCTION_GRAPHICS_DECLARATIONS, PRODUCTION_GRAPHICS_MAPPINGS, PRODUCTION_GRAPHICS_SHARE } from './production-graphics.ts';
import { productionGraphicsFiles } from './production-graphics.test-support.ts';
import {
  PRODUCTION_MODEL_TEXTURES, PRODUCTION_TEXTURE_REFERENCES, modelTextureImageId, modelTexturePaletteId,
} from './production-model-textures.ts';

describe('production texture table', () => {
  it('numbers each TEX entry once, from 01 in table order, for both its image and palette', () => {
    const entries = PRODUCTION_MODEL_TEXTURES.map(({ entry }) => entry);
    expect(new Set(entries).size).toBe(15);
    expect(PRODUCTION_MODEL_TEXTURES.filter(({ ambiguous }) => ambiguous)).toHaveLength(8);
    expect([modelTextureImageId(0), modelTexturePaletteId(0), modelTextureImageId(14)]).toEqual(['image/model-texture/01', 'palette/model-texture/01', 'image/model-texture/15']);
    expect([...PRODUCTION_TEXTURE_REFERENCES]).toEqual(entries.map((entry, index) => [entry, modelTextureImageId(index)]));
    expect(Object.isFrozen(PRODUCTION_MODEL_TEXTURES) && PRODUCTION_MODEL_TEXTURES.every(row => Object.isFrozen(row))).toBe(true);
  });

  it('gives a TEX referenced by two models one image Asset that both models depend on', () => {
    const [first] = PRODUCTION_MODEL_TEXTURES;
    const modl = (flags: number) => syntheticModl({ partLists: [[{ mesh: 1, texture: first.entry, flags }], [], []] }).data;
    const [a, b] = [readAssetId('model/synthetic-a'), readAssetId('model/synthetic-b')];
    const { assets } = convertModels(
      [{ asset: { id: a, kind: 'model' }, role: 'enemy-ship', group: 'models' }, { asset: { id: b, kind: 'model' }, role: 'base', group: 'models' }],
      { models: new Map([[a, modl(1)], [b, modl(3)]]), meshes: new Map([[1, meshBlockFor(quadGeometry())]]) },
      { textures: PRODUCTION_TEXTURE_REFERENCES, sounds: new Map() },
      { ...EMPTY_BUDGET_USAGE, assets: 2, dependencyEdges: 2, vertices: 8, triangles: 2, payloadBytes: 4_096 },
    );
    expect(assets.map(({ descriptor }) => descriptor.dependencies)).toEqual([[{ id: 'image/model-texture/01', kind: 'image' }], [{ id: 'image/model-texture/01', kind: 'image' }]]);
  });

  it('gives TEX entries with identical content an image and a palette Asset each, not one shared Asset', async () => {
    const { source } = await countedVerifiedSource(productionGraphicsFiles({ TEX: textureBlock() }));
    const [models] = (await runGraphicsStep(source, PRODUCTION_GRAPHICS_MAPPINGS, PRODUCTION_GRAPHICS_DECLARATIONS, PRODUCTION_GRAPHICS_SHARE)).groups;
    const palettes = models.payloads.filter(({ id }) => id.startsWith('palette/model-texture/'));
    expect(palettes.map(({ id }) => id)).toEqual(PRODUCTION_MODEL_TEXTURES.map((_, index) => modelTexturePaletteId(index)));
    expect(new Set(palettes.map(({ bytes }) => bytes.join())).size).toBe(1);
    expect(models.payloads.filter(({ id }) => id.startsWith('image/model-texture/'))).toHaveLength(15);
  });
});
