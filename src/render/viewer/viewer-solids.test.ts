import {
  DirectionalLight, DoubleSide, MeshBasicMaterial, MeshLambertMaterial, NearestFilter, NoColorSpace, RepeatWrapping, Scene, Vector3,
  type DataTexture, type Material,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { readAssetId } from '../../content/asset-id.ts';
import { effectExpansionSize } from '../../content/effects/expand-effects.ts';
import { RecordingSurface, type DrawnObject } from '../scene/render-surface.test-support.ts';
import { effectViews, fanTriangles } from './viewer-effects.ts';
import { DIAGNOSTIC_GREY, effectAppearance, effectColourBytes } from './viewer-presentation.ts';
import { createViewerRenderer, type ViewerItem } from './viewer-renderer.ts';
import { createModelDisplay } from './viewer-solids.ts';
import { ViewerTextures } from './viewer-textures.ts';
import { applyViewAction, INITIAL_VIEW, type ViewerViewAction } from './viewer-view.ts';
import {
  effectItem, expandSynthetic, modelItem, syntheticEffects, syntheticItems, syntheticModel, TEXTURE_ID, textureImage,
} from './viewer.test-support.ts';

function setup() {
  const surface = new RecordingSurface();
  const renderer = createViewerRenderer({ surface, reportError: () => {} });
  surface.resize();
  return { surface, renderer };
}

const drawn = (surface: RecordingSurface): readonly DrawnObject[] => surface.lastDraw!.objects;
const attribute = (object: DrawnObject, name: string): number[] => [...object.geometry.getAttribute(name).array];
const indices = (object: DrawnObject): number[] => [...object.geometry.getIndex()!.array];
const rgbOf = (material: Material): number[] => (material as MeshBasicMaterial).color.toArray().map(channel => Math.round(channel * 255));
const negatedZ = (coordinates: ArrayLike<number>): number[] => Array.from(coordinates, (value, index) => (index % 3 === 2 ? -value : value));
const act = (actions: readonly ViewerViewAction[]) => actions.reduce(applyViewAction, INITIAL_VIEW);

describe('viewer view', () => {
  it('turns in 15° steps, wrapping within a full turn', () => {
    expect(act([{ type: 'rotate', axis: 'vertical', steps: 1 }])).toMatchObject({ yaw: 15, pitch: 0 });
    expect(act([{ type: 'rotate', axis: 'vertical', steps: -1 }])).toMatchObject({ yaw: 345 });
    expect(act(Array.from({ length: 24 }, () => ({ type: 'rotate', axis: 'horizontal', steps: 1 }) as const))).toMatchObject({ pitch: 0 });
    expect(Object.is(act([{ type: 'rotate', axis: 'horizontal', steps: 1 }, { type: 'rotate', axis: 'horizontal', steps: -1 }]).pitch, 0)).toBe(true);
  });

  it('zooms by 1.25 within 1/8 and 8 times the framing, and resets rotation and zoom only', () => {
    expect(act([{ type: 'zoom', steps: 1 }]).zoom).toBe(1.25);
    expect(act(Array.from({ length: 12 }, () => ({ type: 'zoom', steps: 1 }) as const)).zoom).toBe(8);
    expect(act(Array.from({ length: 12 }, () => ({ type: 'zoom', steps: -1 }) as const)).zoom).toBe(1 / 8);
    const changed = act([{ type: 'rotate', axis: 'vertical', steps: 2 }, { type: 'zoom', steps: 3 }, { type: 'light', lit: true }, { type: 'mapping-rotation', index: 31 }]);
    expect(applyViewAction(changed, { type: 'reset' })).toEqual({ yaw: 0, pitch: 0, zoom: 1, lit: true, mappingRotation: 31 });
  });

  it('returns the same view when nothing changes and rejects invalid steps and rotations', () => {
    expect(applyViewAction(INITIAL_VIEW, { type: 'reset' })).toBe(INITIAL_VIEW);
    expect(applyViewAction(INITIAL_VIEW, { type: 'zoom', steps: -0 })).toBe(INITIAL_VIEW);
    for (const action of [
      { type: 'rotate', axis: 'vertical', steps: 0.5 }, { type: 'zoom', steps: Number.NaN },
      { type: 'mapping-rotation', index: 32 }, { type: 'mapping-rotation', index: -1 }, { type: 'mapping-rotation', index: 1.5 },
    ] as const) {
      expect(() => applyViewAction(INITIAL_VIEW, action)).toThrow(RangeError);
    }
  });
});

describe('viewer models', () => {
  it('draws each part with z negated, indices and UVs as stored, in a two-sided unlit material', () => {
    const { surface, renderer } = setup();
    const item = modelItem();
    renderer.show(item);
    const [textured, plain] = drawn(surface);
    const [first, second] = (item as Extract<ViewerItem, { kind: 'model' }>).parts;
    expect(attribute(textured, 'position')).toEqual(negatedZ(first.positions));
    expect(attribute(textured, 'normal')).toEqual(negatedZ(first.normals));
    expect(attribute(textured, 'uv')).toEqual([...first.uvs]);
    expect(indices(textured)).toEqual([...first.indices]);
    expect(attribute(plain, 'position')).toEqual(negatedZ(second.positions));
    expect(indices(plain)).toEqual([0, 1, 2, 0, 2, 3]);
    for (const { material } of [textured, plain]) {
      expect(material).toBeInstanceOf(MeshBasicMaterial);
      expect(material).toMatchObject({ side: DoubleSide, toneMapped: false, depthTest: true });
    }
    // A textured part shows its texels; an untextured one its colour bytes.
    expect(rgbOf(textured.material)).toEqual([255, 255, 255]);
    expect(rgbOf(plain.material)).toEqual([51, 102, 153]);
    expect((plain.material as MeshBasicMaterial).map).toBeNull();
    const map = (textured.material as MeshBasicMaterial).map as DataTexture;
    expect(map).toMatchObject({
      wrapS: RepeatWrapping, wrapT: RepeatWrapping, magFilter: NearestFilter, minFilter: NearestFilter,
      generateMipmaps: false, flipY: false, colorSpace: NoColorSpace,
    });
    expect(map.image.data).toEqual(expandSynthetic(textureImage()).rgba);
    expect(renderer.diagnostics()).toMatchObject({ item: { kind: 'model' }, placement: { left: 0, top: 0, width: 640, height: 480 } });
  });

  /** Every drawn vertex in normalised device coordinates, as the WebGL renderer would project it. */
  function projected(surface: RecordingSurface): Vector3[] {
    const { camera, objects } = surface.lastDraw!;
    // The WebGL renderer updates both before drawing.
    camera.updateMatrixWorld();
    objects[0].mesh.parent!.parent!.updateMatrixWorld(true);
    return objects.flatMap(({ mesh }) => {
      const positions = mesh.geometry.getAttribute('position');
      return Array.from({ length: positions.count }, (_, vertex) => new Vector3().fromBufferAttribute(positions, vertex).applyMatrix4(mesh.matrixWorld).project(camera));
    });
  }

  it('shows an empty part list as nothing, without a three.js error', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { surface, renderer } = setup();
      renderer.show(modelItem(syntheticModel(), 2));
      expect(renderer.getSnapshot().state).toBe('ready');
      expect(drawn(surface)).toEqual([]);
      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });

  it('frames the bounding sphere so every vertex is in view', () => {
    const { surface, renderer } = setup();
    renderer.show(modelItem());
    for (const ndc of projected(surface)) expect(Math.max(Math.abs(ndc.x), Math.abs(ndc.y), Math.abs(ndc.z))).toBeLessThanOrEqual(1);
  });

  it('keeps every vertex between the near and far planes at the deepest zoom and any rotation', () => {
    const { surface, renderer } = setup();
    renderer.show(modelItem());
    let view = INITIAL_VIEW;
    for (let step = 0; step < 12; step++) view = applyViewAction(view, { type: 'zoom', steps: 1 });
    for (const yaw of [0, 3, 7]) {
      renderer.setView(applyViewAction(view, { type: 'rotate', axis: 'vertical', steps: yaw }));
      expect(surface.lastDraw!.camera).toMatchObject({ zoom: 8 });
      const depths = projected(surface).map(({ z }) => z);
      expect(Math.min(...depths)).toBeGreaterThanOrEqual(-1);
      expect(Math.max(...depths)).toBeLessThanOrEqual(1);
      // Magnified, so some vertices leave the picture: zoom does not shrink the content.
      expect(Math.max(...projected(surface).map(({ x, y }) => Math.max(Math.abs(x), Math.abs(y))))).toBeGreaterThan(1);
    }
  });

  it('creates one texture for two models sharing it, and none once the last is released', () => {
    const { surface, renderer } = setup();
    renderer.show(modelItem(syntheticModel(0), 0, 'model/a'));
    const shared = (drawn(surface)[0].material as MeshBasicMaterial).map;
    renderer.show(modelItem(syntheticModel(1), 0, 'model/b'));
    expect((drawn(surface)[0].material as MeshBasicMaterial).map).toBe(shared);
    expect(surface.gpuStats().textures).toBe(1);
    // Part list 1 has no texture, so the shared one goes with model b's list 0.
    renderer.show(modelItem(syntheticModel(1), 1, 'model/b'));
    expect(surface.gpuStats()).toEqual({ geometries: 1, textures: 0, programs: 1 });
    renderer.show(null);
    expect(surface.gpuStats()).toEqual({ geometries: 0, textures: 0, programs: 0 });
  });

  it('returns every texture lease when building a display fails', () => {
    const cache = new ViewerTextures();
    const other = readAssetId('image/synthetic-other');
    const held = cache.acquire(TEXTURE_ID, expandSynthetic(textureImage()));
    let disposed = false;
    held.addEventListener('dispose', () => { disposed = true; });
    const [textured, plain] = (modelItem() as Extract<ViewerItem, { kind: 'model' }>).parts;
    const parts = [textured, { ...plain, material: { colour: plain.material.colour, texture: other, wrap: 'repeat' as const } }];
    const pictures = new Map([[TEXTURE_ID, expandSynthetic(textureImage())]]);
    expect(() => createModelDisplay(new Scene(), 'model', parts, pictures, cache, INITIAL_VIEW)).toThrow(RangeError);
    expect(cache.size).toBe(1);
    expect(disposed).toBe(false);
    expect(cache.release(TEXTURE_ID)).toEqual([]);
    expect(disposed).toBe(true);
    expect(cache.size).toBe(0);
  });

  it('lights a model only on request, with the neutral light, drawing once per change', () => {
    const { surface, renderer } = setup();
    renderer.show(modelItem());
    const draws = surface.draws.length;
    renderer.setView(applyViewAction(INITIAL_VIEW, { type: 'light', lit: true }));
    expect(surface.draws.length).toBe(draws + 1);
    expect(drawn(surface).every(({ material }) => material instanceof MeshLambertMaterial)).toBe(true);
    expect(rgbOf(drawn(surface)[1].material)).toEqual([51, 102, 153]);
    const lights: DirectionalLight[] = [];
    surface.lastDraw!.objects[0].mesh.parent!.parent!.parent!.traverseVisible(object => { if (object instanceof DirectionalLight) lights.push(object); });
    expect(lights).toHaveLength(1);
    renderer.setView(INITIAL_VIEW);
    expect(surface.draws.length).toBe(draws + 2);
    expect(drawn(surface).every(({ material }) => material instanceof MeshBasicMaterial)).toBe(true);
  });

  it('turns and zooms the view, drawing exactly once for each change of the picture', () => {
    const { surface, renderer } = setup();
    renderer.show(modelItem());
    const distance = surface.lastDraw!.camera.position.z;
    let view = INITIAL_VIEW;
    const step = (action: ViewerViewAction, draws: number) => {
      const before = surface.draws.length;
      view = applyViewAction(view, action);
      renderer.setView(view);
      expect(surface.draws.length - before).toBe(draws);
    };
    step({ type: 'rotate', axis: 'vertical', steps: 1 }, 1);
    expect(drawn(surface)[0].mesh.parent!.parent!.rotation.y).toBeCloseTo(Math.PI / 12, 12);
    step({ type: 'rotate', axis: 'horizontal', steps: -1 }, 1);
    expect(drawn(surface)[0].mesh.parent!.parent!.rotation.x).toBeCloseTo((345 * Math.PI) / 180, 12);
    step({ type: 'zoom', steps: 1 }, 1);
    expect(surface.lastDraw!.camera).toMatchObject({ zoom: 1.25, position: { z: distance } });
    // The texture rotation changes no picture before the effect texture coordinates are known.
    step({ type: 'mapping-rotation', index: 7 }, 0);
    step({ type: 'reset' }, 1);
    expect(surface.lastDraw!.camera).toMatchObject({ zoom: 1, position: { z: distance } });
    renderer.setView(view);
    expect(renderer.diagnostics().view).toBe(view);
    // The view is kept for the next item, and changes no 2D picture.
    renderer.show(syntheticItems()[0]);
    step({ type: 'rotate', axis: 'vertical', steps: 1 }, 0);
    step({ type: 'light', lit: true }, 0);
  });
});

describe('viewer effects', () => {
  it('fans polygon faces from their first corner', () => {
    expect([...fanTriangles([[4, 3, 2, 1, 0], [5, 6, 7]])]).toEqual([4, 3, 2, 4, 2, 1, 4, 1, 0, 5, 6, 7]);
  });

  it.each(syntheticEffects().map(payload => [payload.kind, payload] as const))(
    'draws every %s view with z negated and corners − 2 triangles per face, totalling the expansion size',
    (_, payload) => {
      const { surface, renderer } = setup();
      const totals = { vertices: 0, triangles: 0 };
      effectViews(payload).forEach((view, index) => {
        renderer.show(effectItem(payload, index));
        const objects = drawn(surface);
        expect(objects).toHaveLength(view.shapes.length);
        view.shapes.forEach((shape, at) => {
          const triangles = shape.faces.reduce((sum, face) => sum + face.length - 2, 0);
          expect(attribute(objects[at], 'position')).toEqual(negatedZ(shape.positions));
          expect(indices(objects[at])).toEqual([...fanTriangles(shape.faces)]);
          expect(indices(objects[at])).toHaveLength(3 * triangles);
          expect(rgbOf(objects[at].material)).toEqual([...effectAppearance(shape).rgb]);
          expect(objects[at].material).toMatchObject({ side: DoubleSide, map: null });
          totals.vertices += shape.positions.length / 3;
          totals.triangles += triangles;
        });
      });
      expect(totals).toEqual(effectExpansionSize(payload));
    },
  );

  it('clamps and quantises colours, greys a shape without one, and marks textures it cannot map', () => {
    expect(effectColourBytes([0.25, -0, 1.75])).toEqual([64, 0, 255]);
    expect(effectColourBytes([0.5, -3, 0.998])).toEqual([128, 0, 254]);
    const [, missile, debris] = syntheticEffects();
    const element = effectViews(missile)[0].shapes.find(shape => shape.colour === null)!;
    expect(effectAppearance(element)).toEqual({ rgb: [DIAGNOSTIC_GREY, DIAGNOSTIC_GREY, DIAGNOSTIC_GREY], colour: null, textureUnmapped: true });
    const views = effectViews(debris);
    expect(views.map(({ label, index }) => `${label} ${index}`)).toEqual([
      'untextured-shape 0', 'untextured-shape 1', 'untextured-shape 2', 'textured-shape 0', 'textured-shape 1',
    ]);
    expect(effectAppearance(views[0].shapes[0])).toEqual({ rgb: [64, 0, 255], colour: [0.25, -0, 1.75], textureUnmapped: false });
    expect(effectAppearance(views[3].shapes[0])).toMatchObject({ rgb: [255, 32, 0], colour: [2, 0.125, -0.5], textureUnmapped: true });
  });

  it('stays unlit, so the light changes no effect picture', () => {
    const { surface, renderer } = setup();
    renderer.show(effectItem(syntheticEffects()[1]));
    const draws = surface.draws.length;
    renderer.setView(applyViewAction(INITIAL_VIEW, { type: 'light', lit: true }));
    expect(surface.draws.length).toBe(draws);
    expect(drawn(surface).every(({ material }) => material instanceof MeshBasicMaterial)).toBe(true);
  });

  it('releases every geometry and material when the next item is shown', () => {
    const { surface, renderer } = setup();
    for (const payload of syntheticEffects()) renderer.show(effectItem(payload));
    renderer.show(effectItem(syntheticEffects()[0]));
    const single = surface.gpuStats();
    renderer.show(null);
    expect(single).toEqual({ geometries: 1, textures: 0, programs: 1 });
    expect(surface.gpuStats()).toEqual({ geometries: 0, textures: 0, programs: 0 });
    expect(drawn(surface)).toEqual([]);
  });
});
