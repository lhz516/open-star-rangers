import { describe, expect, it } from 'vitest';
import { ContentContractError } from '../../../content/contract-validation.ts';
import type { ModelGeometry, ModelPayload } from '../../../content/models/model-payload.ts';
import { lightingSettings, TEXTURE } from '../lighting/lighting.test-support.ts';
import { BAND_TABLE_SIZE, SCREEN_DOOR_TABLE_SIZE } from './shimmer-band.ts';
import { prepareShimmerSurfaces, WRAP_TABLE_WIDTH } from './shimmer-surfaces.ts';
import { SHARED_WRAPS, TURNING_WRAPS, boundsWrap, wrappedCornerUvs } from './shimmer-wraps.ts';
import { MODEL, OTHER_MODEL, PLAIN_MODEL, plainModel, shimmerContent, thresholdsImage } from './shimmer.test-support.ts';
import { litModel } from '../lighting/lighting.test-support.ts';

const withList2 = (model: ModelPayload, sourceFlags: number, texture = model.partLists[2][0].texture): ModelPayload =>
  Object.freeze<ModelPayload>({ ...model, partLists: [model.partLists[0], model.partLists[1], [{ ...model.partLists[2][0], sourceFlags, texture }]] });

const refusal = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ContentContractError);
    return (error as ContentContractError).message;
  }
  throw new Error('expected a refusal');
};

describe('shimmer surfaces', () => {
  it('prepares one unlit shell per model with a list 2, list-2 part 0 with its texture, and none without', () => {
    const { models } = prepareShimmerSurfaces(shimmerContent(), lightingSettings());
    expect([...models.keys()]).toEqual([MODEL, OTHER_MODEL, PLAIN_MODEL]);
    expect(models.get(PLAIN_MODEL)).toBeNull();
    const shell = models.get(MODEL)!;
    expect(shell.model).toBe(MODEL);
    expect(shell.part).toMatchObject({ quality: 1, corners: 6, texture: { id: TEXTURE, width: 4, height: 2 } });
    expect(shell.part.ramps.ramps.shades).toBe(1);
  });

  it('keeps the thresholds exactly, in stored order, without reading their palette', () => {
    const image = thresholdsImage();
    const { thresholds } = prepareShimmerSurfaces(shimmerContent({ thresholds: image }), lightingSettings());
    expect(thresholds).toEqual({ width: 4, height: 2, indices: image.indices });
    expect([...thresholds.indices]).toEqual([0, 2, 39, 40, 42, 43, 200, 255]);
  });

  it('tabulates each family’s wraps per stored corner, a wrap’s rows after the previous wrap’s', () => {
    const { models } = prepareShimmerSurfaces(shimmerContent(), lightingSettings());
    const { tables } = models.get(MODEL)!;
    const { positions, indices } = litModel().geometries[0];
    expect([tables.turning.wraps, tables.bounds.wraps, tables.shared.wraps]).toEqual([32, 1, 16]);
    expect(tables.turning).toMatchObject({ width: 6, rowsPerWrap: 1 });
    expect(tables.turning.uvs.subarray(5 * 12, 6 * 12)).toEqual(wrappedCornerUvs(TURNING_WRAPS[5], positions, indices));
    expect(tables.shared.uvs.subarray(15 * 12, 16 * 12)).toEqual(wrappedCornerUvs(SHARED_WRAPS[15], positions, indices));
    expect(tables.bounds.uvs).toEqual(wrappedCornerUvs(boundsWrap(positions)!, positions, indices));
  });

  it('wraps rows of a long shell at 1024 corners', () => {
    const triangles = 400;
    const geometry: ModelGeometry = {
      positions: Float32Array.of(0, -1, 0, 1, 0, 0, 0, 1, 1),
      uvs: new Float32Array(6),
      normals: new Float32Array(9),
      indices: Uint16Array.from({ length: triangles * 3 }, (_, at) => at % 3),
      cornerShading: new Uint16Array(triangles * 3),
      shadingSlotCount: 1,
    };
    const model = Object.freeze({ ...litModel(), geometries: [geometry] });
    const { models, plan } = prepareShimmerSurfaces(shimmerContent({ models: new Map([[MODEL, model]]) }), lightingSettings());
    const { turning } = models.get(MODEL)!.tables;
    expect(turning).toMatchObject({ width: WRAP_TABLE_WIDTH, rowsPerWrap: 2 });
    expect(turning.uvs.length).toBe(WRAP_TABLE_WIDTH * 2 * 32 * 2);
    const second = wrappedCornerUvs(TURNING_WRAPS[1], geometry.positions, geometry.indices);
    expect(turning.uvs.subarray(WRAP_TABLE_WIDTH * 2 * 2, WRAP_TABLE_WIDTH * 2 * 2 + second.length)).toEqual(second);
    expect(plan.vertices).toBe(1200);
  });

  it('plans one geometry per shell and every texture its drawing can acquire', () => {
    const { plan } = prepareShimmerSurfaces(shimmerContent(), lightingSettings());
    const tables = 2 * 6 * (32 + 1 + 16);
    const fixed = 4 * 2 + BAND_TABLE_SIZE.width * BAND_TABLE_SIZE.height + SCREEN_DOOR_TABLE_SIZE.width * SCREEN_DOOR_TABLE_SIZE.height;
    // The shared texture (4 × 2) and its one-shade ramps (4 colours), once.
    expect(plan).toEqual({ texels: 8 + 4 + tables + fixed, vertices: 12, indices: 0, renderTargets: 0 });
  });

  it('refuses before the run thresholds with a mask, a shell of another size, quality or without a texture', () => {
    expect(refusal(() => prepareShimmerSurfaces(shimmerContent({ thresholds: thresholdsImage({ mask: new Uint8Array(2) }) }), lightingSettings())))
      .toContain('shimmer.thresholds');
    expect(refusal(() => prepareShimmerSurfaces(shimmerContent({ thresholds: thresholdsImage({ width: 2, height: 4 }) }), lightingSettings())))
      .toContain('the thresholds are 2 × 4');
    expect(refusal(() => prepareShimmerSurfaces(shimmerContent({ models: new Map([[MODEL, withList2(litModel(), 2)]]) }), lightingSettings())))
      .toContain('render quality 2');
    expect(refusal(() => prepareShimmerSurfaces(shimmerContent({ models: new Map([[MODEL, withList2(litModel(), 1, null)]]) }), lightingSettings())))
      .toContain('must name a texture');
  });

  it('refuses a shell whose mesh cannot size kind 0x80’s wrap, whichever kinds use it', () => {
    const model = litModel();
    const flat = { ...model.geometries[0], positions: Float32Array.of(0, 4, 0, 1, 4, 0, 1, 4, 1, 0, 4, 1) };
    const content = shimmerContent({ models: new Map([[MODEL, Object.freeze({ ...model, geometries: [flat] })]]) });
    expect(refusal(() => prepareShimmerSurfaces(content, lightingSettings()))).toContain('no finite y extent');
  });

  it('draws the shell unlit at quality min(device, 1), and refuses the device byte 0', () => {
    expect(prepareShimmerSurfaces(shimmerContent(), lightingSettings({ deviceByte: 1 })).models.get(MODEL)!.part.quality).toBe(1);
    expect(refusal(() => prepareShimmerSurfaces(shimmerContent(), lightingSettings({ deviceByte: 0 })))).toContain('render quality 0');
    expect(prepareShimmerSurfaces(shimmerContent({ models: new Map([[PLAIN_MODEL, plainModel()]]) }), lightingSettings()).models.get(PLAIN_MODEL)).toBeNull();
  });
});
