import {
  LinearSRGBColorSpace, NearestFilter, NoColorSpace, RepeatWrapping, Vector2, Vector3,
  type BufferGeometry, type DataTexture, type Material, type MeshBasicMaterial, type OrthographicCamera,
} from 'three';
import { describe, expect, it } from 'vitest';
import { readAssetId } from '../../content/asset-id.ts';
import { RollbackError } from '../../app/session/rollback-error.ts';
import { RecordingSurface, type DrawRecord, type DrawnObject } from '../scene/render-surface.test-support.ts';
import { CHECKER_GREYS, CHECKER_SQUARE, VIEWER_SURFACE } from './viewer-presentation.ts';
import { glyphSheet, paletteSheet } from './viewer-pictures.ts';
import { createViewerRenderer, type ViewerItem, type ViewerRenderer } from './viewer-renderer.ts';
import {
  expandSynthetic, syntheticFont, syntheticImage, syntheticItems, syntheticLayout, syntheticPalette,
} from './viewer.test-support.ts';

function setup(surface = new RecordingSurface()) {
  const reported: unknown[] = [];
  const renderer = createViewerRenderer({ surface, reportError: error => { reported.push(error); } });
  return { surface, renderer, reported };
}

const pictureOf = (draw: DrawRecord | undefined): DrawnObject | undefined => draw?.objects.find(object => object.name !== 'checkerboard');
const mapOf = (material: Material): DataTexture => (material as MeshBasicMaterial).map as DataTexture;

/** The quad's (u, v) at a local point, read from its corner attributes. */
function uvAt(geometry: BufferGeometry, x: number, y: number): Vector2 {
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  const corner = (cx: number, cy: number): Vector2 => {
    for (let vertex = 0; vertex < position.count; vertex++) {
      if (position.getX(vertex) === cx && position.getY(vertex) === cy) return new Vector2(uv.getX(vertex), uv.getY(vertex));
    }
    throw new Error('Missing quad corner');
  };
  const [topLeft, bottomRight] = [corner(-0.5, 0.5), corner(0.5, -0.5)];
  return new Vector2(topLeft.x + (x + 0.5) * (bottomRight.x - topLeft.x), topLeft.y + (0.5 - y) * (bottomRight.y - topLeft.y));
}

/**
 * The colour drawn at drawing-buffer pixel (x, y), counted from the top-left, emulating the renderer: the pixel centre
 * through the orthographic camera, each mesh's transform, its UVs and texture transform, nearest sampling, the alpha
 * test, and render order. Null where only the background shows.
 */
function drawnAt(draw: DrawRecord, x: number, y: number): number[] | null {
  const camera = draw.camera as OrthographicCamera;
  const world = new Vector3(camera.left + x + 0.5, camera.top - y - 0.5, 0);
  const objects = [...draw.objects].sort((a, b) => b.mesh.renderOrder - a.mesh.renderOrder);
  for (const { mesh, geometry, material } of objects) {
    mesh.updateMatrixWorld();
    const local = mesh.worldToLocal(world.clone());
    if (Math.abs(local.x) > 0.5 || Math.abs(local.y) > 0.5) continue;
    const map = mapOf(material);
    map.updateMatrix();
    const uv = uvAt(geometry, local.x, local.y).applyMatrix3(map.matrix);
    const wrap = (value: number): number => (map.wrapS === RepeatWrapping ? value - Math.floor(value) : Math.min(Math.max(value, 0), 1 - 1e-9));
    const { width, height, data } = map.image as { width: number; height: number; data: Uint8Array };
    const at = (Math.floor(wrap(uv.y) * height) * width + Math.floor(wrap(uv.x) * width)) * 4;
    const texel = [...data.subarray(at, at + 4)];
    if (texel[3] >= 128) return texel;
  }
  return null;
}

const checkerAt = (x: number, y: number, left: number, top: number): number[] => {
  const grey = CHECKER_GREYS[(Math.floor((x - left) / CHECKER_SQUARE) + Math.floor((y - top) / CHECKER_SQUARE)) % 2];
  return [grey, grey, grey, 255];
};

describe('viewer renderer 2D items', () => {
  it('uploads expandImage and composeLayout RGBA byte for byte, unconverted, nearest and without mipmaps', () => {
    const { surface, renderer } = setup();
    surface.resize(640, 480);
    const image = syntheticImage(['1101', '0111', '1110']);
    const picture = expandSynthetic(image);
    renderer.show({ kind: 'image', id: readAssetId('image/sample'), picture });
    const shown = mapOf(pictureOf(surface.lastDraw)!.material);
    expect(shown.image.data).toEqual(expandSynthetic(image).rgba);
    expect(shown.image.data).toBe(picture.rgba);
    expect([shown.colorSpace, shown.magFilter, shown.minFilter, shown.generateMipmaps, shown.flipY])
      .toEqual([NoColorSpace, NearestFilter, NearestFilter, false, false]);
    const material = pictureOf(surface.lastDraw)!.material as MeshBasicMaterial;
    expect([material.toneMapped, material.alphaTest, material.transparent, material.color.getHex()]).toEqual([false, 0.5, false, 0xffffff]);
    expect(VIEWER_SURFACE.outputColorSpace).toBe(LinearSRGBColorSpace);

    const layout = syntheticLayout();
    renderer.show({ kind: 'layout', id: readAssetId('layout/sample'), picture: layout });
    expect(mapOf(pictureOf(surface.lastDraw)!.material).image.data).toEqual(syntheticLayout().rgba);
    expect(renderer.diagnostics().placement).toEqual({ left: 0, top: 0, width: 640, height: 480 });
  });

  it('uploads the palette swatch grid and the glyph sheet', () => {
    const { surface, renderer } = setup();
    surface.resize();
    const palette = syntheticPalette(20);
    renderer.show({ kind: 'palette', id: readAssetId('palette/sample'), palette });
    expect(mapOf(pictureOf(surface.lastDraw)!.material).image.data).toEqual(paletteSheet(palette).rgba);
    const font = syntheticFont(18);
    renderer.show({ kind: 'font', id: readAssetId('font/sample'), font });
    expect(mapOf(pictureOf(surface.lastDraw)!.material).image.data).toEqual(glyphSheet(font).rgba);
  });

  it('shows row 0 at the top, each texel as a whole-scale square, and the checkerboard through transparent pixels', () => {
    const { surface, renderer } = setup();
    surface.resize(640, 480);
    const picture = expandSynthetic(syntheticImage(['10111', '11011', '01110']));
    renderer.show({ kind: 'image', id: readAssetId('image/sample'), picture });
    // Scale 128 by width: 640 × 384, 48 pixels below the top.
    const placement = { left: 0, top: 48, width: 640, height: 384 };
    expect(renderer.diagnostics().placement).toEqual(placement);
    const draw = surface.lastDraw!;
    const camera = draw.camera as OrthographicCamera;
    expect([camera.left, camera.right, camera.top, camera.bottom]).toEqual([0, 640, 480, 0]);
    for (let y = 0; y < 480; y += 4) {
      for (let x = 0; x < 640; x += 4) {
        const [tx, ty] = [Math.floor((x - placement.left) / 128), Math.floor((y - placement.top) / 128)];
        const inside = y >= placement.top && y < placement.top + placement.height;
        const texel = [...picture.rgba.subarray((ty * 5 + tx) * 4, (ty * 5 + tx) * 4 + 4)];
        const expected = !inside ? null : texel[3] === 255 ? texel : checkerAt(x, y, placement.left, placement.top);
        expect(drawnAt(draw, x, y), `pixel ${x}, ${y}`).toEqual(expected);
      }
    }
    // The last pixel of opaque texel squares, at the bottom and right edges of their squares.
    expect(drawnAt(draw, 511, 431)).toEqual([...picture.rgba.subarray((2 * 5 + 3) * 4, (2 * 5 + 3) * 4 + 4)]);
    expect(drawnAt(draw, 127, 175)).toEqual([...picture.rgba.subarray(0, 4)]);
  });

  it('covers the whole buffer with a layout, the checkerboard showing where nothing is composed', () => {
    const { surface, renderer } = setup();
    surface.resize(400, 300);
    const layout = syntheticLayout();
    renderer.show({ kind: 'layout', id: readAssetId('layout/sample'), picture: layout });
    const draw = surface.lastDraw!;
    // 8 × 6 over 400 × 300: 50 buffer pixels per frame pixel.
    for (let y = 25; y < 300; y += 50) {
      for (let x = 25; x < 400; x += 50) {
        const at = (Math.floor(y / 50) * 8 + Math.floor(x / 50)) * 4;
        const texel = [...layout.rgba.subarray(at, at + 4)];
        expect(drawnAt(draw, x, y), `pixel ${x}, ${y}`).toEqual(texel[3] === 255 ? texel : checkerAt(x, y, 0, 0));
      }
    }
  });
});

describe('viewer renderer drawing on demand', () => {
  it('draws once for each change of item, layout or pixel ratio and never for an unchanged one', () => {
    const { surface, renderer } = setup();
    const [first, second] = syntheticItems();
    renderer.show(first);
    expect(surface.draws).toHaveLength(0);
    surface.resize();
    expect(surface.draws).toHaveLength(1);
    expect(renderer.diagnostics()).toMatchObject({ item: { kind: first.kind, id: first.id }, draws: 1 });
    renderer.show(first);
    renderer.show({ ...first });
    expect(surface.draws).toHaveLength(1);
    renderer.show(second);
    expect(surface.draws).toHaveLength(2);
    renderer.show({ ...first, id: readAssetId('image/renamed') });
    expect(surface.draws).toHaveLength(3);
    renderer.show({ kind: 'image', id: readAssetId('image/renamed'), picture: expandSynthetic(syntheticImage(['110', '011'])) });
    expect(surface.draws).toHaveLength(4);
    surface.resize();
    surface.resize(640, 480, 1);
    expect(surface.draws).toHaveLength(4);
    surface.resize(800, 600);
    expect(surface.draws).toHaveLength(5);
    surface.resize(800, 600, 1.5);
    expect(surface.draws).toHaveLength(6);
    renderer.show(null);
    expect(surface.draws).toHaveLength(7);
    expect(pictureOf(surface.lastDraw)).toBeUndefined();
    expect(surface.lastDraw!.objects).toEqual([]);
    expect(renderer.diagnostics()).toMatchObject({ item: null, placement: null, draws: 7 });
    renderer.show(null);
    expect(surface.draws).toHaveLength(7);
  });

  it('keeps the GPU counters of the current item only after switching between ten items', () => {
    const items = syntheticItems();
    const { surface, renderer } = setup();
    surface.resize();
    for (const item of items) renderer.show(item);
    expect(surface.draws).toHaveLength(items.length + 1);
    const alone = setup();
    alone.surface.resize();
    alone.renderer.show(items.at(-1)!);
    expect(renderer.diagnostics().gpu).toEqual(alone.renderer.diagnostics().gpu);
    expect(renderer.diagnostics().gpu).toEqual({ geometries: 1, textures: 2, programs: 2 });
    renderer.show(null);
    expect(renderer.diagnostics().gpu).toEqual({ geometries: 0, textures: 0, programs: 0 });
  });

  it('draws nothing while the context is lost and redraws the current item once when it is restored', () => {
    const { surface, renderer } = setup();
    const [first, second] = syntheticItems();
    surface.resize();
    renderer.show(first);
    expect(surface.draws).toHaveLength(2);
    surface.events!.contextLost();
    expect(renderer.getSnapshot()).toEqual({ state: 'context-lost', error: null });
    renderer.show(second);
    surface.resize(800, 600);
    expect(surface.draws).toHaveLength(2);
    surface.events!.contextLost();
    surface.events!.contextRestored();
    expect(renderer.getSnapshot()).toEqual({ state: 'ready', error: null });
    expect(surface.draws).toHaveLength(3);
    expect(pictureOf(surface.lastDraw)!.name).toBe(`${second.kind}:${second.id}`);
    expect(renderer.diagnostics().layout).toMatchObject({ bufferWidth: 800, bufferHeight: 600 });
    surface.events!.contextRestored();
    expect(surface.draws).toHaveLength(3);
  });
});

describe('viewer renderer status and release', () => {
  const counted = (renderer: ViewerRenderer): { notifications: number } => {
    const count = { notifications: 0 };
    renderer.subscribe(() => { count.notifications++; });
    return count;
  };

  it('notifies state changes only and reports a failing listener', () => {
    const { surface, renderer, reported } = setup();
    const count = counted(renderer);
    const failure = new Error('listener');
    renderer.subscribe(() => { throw failure; });
    surface.resize();
    renderer.show(syntheticItems()[0]);
    expect(count.notifications).toBe(0);
    surface.events!.contextLost();
    surface.events!.contextRestored();
    expect(count.notifications).toBe(2);
    expect(reported).toEqual([failure, failure]);
  });

  it('becomes failed with the original error when a draw or a picture fails, and stops drawing', () => {
    const surface = new RecordingSurface();
    const failure = new Error('draw');
    surface.drawFailure = failure;
    surface.drawFailureAt = 1;
    const { renderer } = setup(surface);
    const count = counted(renderer);
    const [first, second] = syntheticItems();
    surface.resize();
    renderer.show(first);
    expect(renderer.getSnapshot()).toEqual({ state: 'failed', error: failure });
    expect(count.notifications).toBe(1);
    renderer.show(second);
    surface.resize(800, 600);
    surface.events!.contextLost();
    surface.events!.contextRestored();
    expect(surface.calls.filter(call => call === 'draw')).toHaveLength(2);
    expect(renderer.diagnostics()).toMatchObject({ state: 'failed', draws: 1 });
    renderer.dispose();
    expect(surface.gpuStats()).toEqual({ geometries: 0, textures: 0, programs: 0 });

    const other = setup();
    other.surface.resize();
    const [shown] = syntheticItems();
    other.renderer.show(shown);
    other.renderer.show({ kind: 'image', id: readAssetId('image/short'), picture: { width: 2, height: 2, rgba: new Uint8Array(12) } });
    expect(other.renderer.getSnapshot()).toMatchObject({ state: 'failed', error: expect.any(RangeError) });
    expect(other.renderer.diagnostics().item).toEqual({ kind: shown.kind, id: shown.id });
    other.renderer.dispose();
    expect(other.surface.gpuStats()).toEqual({ geometries: 0, textures: 0, programs: 0 });
  });

  it('disconnects, releases every geometry, material and texture, then the surface, and never draws again', () => {
    const { surface, renderer } = setup();
    const count = counted(renderer);
    surface.resize();
    renderer.show(syntheticItems()[1]);
    const events = surface.events!;
    const resources = surface.lastDraw!.objects.flatMap(({ geometry, material }) => [geometry, material, mapOf(material)]);
    for (const resource of new Set(resources)) resource.addEventListener('dispose', () => { surface.calls.push('resource'); });
    renderer.dispose();
    renderer.dispose();
    expect(surface.calls.slice(-7)).toEqual(['disconnect', 'resource', 'resource', 'resource', 'resource', 'resource', 'dispose']);
    expect(surface.gpuStats()).toEqual({ geometries: 0, textures: 0, programs: 0 });
    expect(renderer.getSnapshot()).toEqual({ state: 'disposed', error: null });
    expect(renderer.diagnostics()).toMatchObject({ state: 'disposed', gpu: null });
    expect(count.notifications).toBe(0);
    events.resize({ width: 800, height: 600, devicePixelRatio: 1 });
    events.contextLost();
    events.contextRestored();
    renderer.show(syntheticItems()[2]);
    expect(surface.draws).toHaveLength(2);
  });

  it('attempts every release step and throws their failures together', () => {
    const { surface, renderer } = setup();
    surface.resize();
    renderer.show(syntheticItems()[0]);
    const disconnect = new Error('disconnect'), dispose = new Error('dispose');
    surface.disconnectFailure = disconnect;
    surface.disposeFailure = dispose;
    let thrown: unknown;
    try { renderer.dispose(); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(AggregateError);
    expect((thrown as AggregateError).errors).toEqual([disconnect, dispose]);
    expect(surface.gpuStats()).toEqual({ geometries: 0, textures: 0, programs: 0 });
    expect(() => renderer.dispose()).not.toThrow();
  });

  it('releases the shown item on request, even when failed, and throws a failed release', () => {
    const { surface, renderer } = setup();
    surface.resize();
    renderer.show(syntheticItems()[0]);
    const draws = surface.draws.length;
    renderer.releaseItem();
    expect(renderer.diagnostics()).toMatchObject({ state: 'ready', item: null, placement: null, draws: draws + 1 });
    expect(surface.gpuStats().textures).toBe(0);
    renderer.releaseItem();
    expect(surface.draws).toHaveLength(draws + 1);

    const failed = setup();
    failed.surface.resize();
    failed.renderer.show(syntheticItems()[0]);
    failed.surface.layoutFailure = new Error('layout');
    failed.surface.resize(800, 600);
    expect(failed.renderer.getSnapshot().state).toBe('failed');
    expect(failed.surface.gpuStats().textures).toBeGreaterThan(0);
    failed.renderer.releaseItem();
    expect(failed.renderer.diagnostics().item).toBeNull();
    expect(failed.surface.gpuStats()).toEqual({ geometries: 0, textures: 0, programs: 0 });

    const failing = setup();
    failing.surface.resize();
    failing.renderer.show(syntheticItems()[0]);
    const texture = mapOf(failing.surface.lastDraw!.objects[1].material);
    const failure = new Error('texture');
    texture.dispose = () => { throw failure; };
    let thrown: unknown;
    try { failing.renderer.releaseItem(); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(AggregateError);
    expect((thrown as AggregateError).errors).toEqual([failure]);
    expect(failing.renderer.getSnapshot()).toEqual({ state: 'failed', error: thrown });
  });

  it('disposes a surface it cannot connect, and reports a failed rollback as a RollbackError', () => {
    const surface = new RecordingSurface();
    const failure = new Error('connect');
    surface.connectFailure = failure;
    expect(() => createViewerRenderer({ surface, reportError: () => {} })).toThrow(failure);
    expect(surface.calls).toEqual(['connect', 'disconnect', 'dispose']);

    const failing = new RecordingSurface();
    failing.connectFailure = failure;
    failing.disposeFailure = new Error('dispose');
    let thrown: unknown;
    try { createViewerRenderer({ surface: failing, reportError: () => {} }); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(RollbackError);
    expect(thrown).toMatchObject({ cause: failure, errors: [failure, failing.disposeFailure] });
  });

  it('only reports why when no surface could be created', () => {
    const cause = new Error('no WebGL 2');
    const renderer = createViewerRenderer({ unavailable: cause, reportError: () => {} });
    const item: ViewerItem = syntheticItems()[0];
    renderer.show(item);
    expect(renderer.getSnapshot()).toEqual({ state: 'unavailable', error: cause });
    expect(renderer.diagnostics()).toEqual({ state: 'unavailable', item: null, draws: 0, gpu: null, layout: null, placement: null });
    renderer.releaseItem();
    renderer.dispose();
    expect(renderer.getSnapshot()).toEqual({ state: 'disposed', error: null });
  });
});
