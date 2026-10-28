import type { Matrix4} from 'three';
import { Camera, Vector4 } from 'three';
import { describe, expect, it } from 'vitest';
import type { RenderEntity } from '../../../core/projections/render-state.ts';
import { computeViewportLayout } from '../../viewport/viewport-layout.ts';
import { logicalTransform, RASTER_OFFSET_X, setWorldCamera, worldProjectionMatrix } from '../composition/logical-screen.ts';
import { presentationViewport } from '../presentation/presentation-camera.ts';
import { renderEntity, vec } from '../presentation/presentation.test-support.ts';
import type { IDENTITY_ROWS } from './drawn-pose.ts';
import type { FlightSceneFrame } from './flight-scene.ts';
import { backPlane, cameraSpace, checkSceneDevice, insideViewVolume, projectToScreen, rasterPixel, viewportProjection } from './projection.ts';
import { SCENE_SETTINGS } from './scene.test-support.ts';

const F1 = presentationViewport(0x0c, 0);
const DESTRUCTION = presentationViewport(0x11, 8);
const B = 600;

const kind = (kindBit: number, change: Partial<RenderEntity> = {}): RenderEntity => Object.freeze({ ...renderEntity(1), kindBit, ...change });

/** A camera-space point through `matrix`, as logical pixels (x right, y down) and WebGL's normalised depth. */
function throughMatrix(matrix: Matrix4, { x, y, z }: { x: number; y: number; z: number }, bufferWidth: number, bufferHeight: number, scale: number) {
  const clip = new Vector4(x, y, z, 1).applyMatrix4(matrix);
  const ndc = { x: clip.x / clip.w, y: clip.y / clip.w, z: clip.z / clip.w };
  return { x: ((ndc.x + 1) / 2) * bufferWidth / scale, y: ((1 - ndc.y) / 2) * bufferHeight / scale, depth: ndc.z };
}

describe('world projection', () => {
  it('projects with the original\'s centre and scale in each view (PV3)', () => {
    expect(viewportProjection(F1)).toEqual({ width: 640, height: 316, half: 320, cx: 320, cy: 158 });
    expect(viewportProjection(DESTRUCTION)).toEqual({ width: 640, height: 480, half: 320, cx: 320, cy: 240 });
    expect(projectToScreen(F1, vec(1, 0.5, 4))).toEqual({ x: 480, y: 78 });
    expect(projectToScreen(DESTRUCTION, vec(-2, -1, 8))).toEqual({ x: 160, y: 320 });
    // f32 stores.
    expect(projectToScreen(F1, vec(1, 1, 3)).x).toBe(Math.fround(320 + 640 / 3));
  });

  it('turns a world point into camera space by the camera\'s rows', () => {
    const rows = Object.freeze([0, 0, -1, 0, 1, 0, 1, 0, 0]) as unknown as typeof IDENTITY_ROWS;
    expect(cameraSpace({ position: vec(10, 0, 0), rows }, vec(10, 2, 5))).toEqual({ x: -5, y: 2, z: 0 });
    expect(cameraSpace({ position: vec(0), rows }, vec(7, 0, 0))).toEqual({ x: 0, y: 0, z: 7 });
  });

  it('bounds the view volume by the viewport rectangle and the front and back planes', () => {
    const z = 100;
    expect(insideViewVolume(F1, B, vec(-50, 0, z))).toBe(true);
    expect(insideViewVolume(F1, B, vec(50, 0, z))).toBe(false);
    expect(insideViewVolume(F1, B, vec(49.999, 0, z))).toBe(true);
    // F1's vertical half-field is 0.246875 = 316 / 1280.
    expect(insideViewVolume(F1, B, vec(0, -24.687, z))).toBe(true);
    expect(insideViewVolume(F1, B, vec(0, 24.687, z))).toBe(true);
    // ky is the f32 of 0.49375, slightly above it, so the exact half-field is inside on both sides.
    expect(insideViewVolume(F1, B, vec(0, 24.6875, z))).toBe(true);
    expect(insideViewVolume(F1, B, vec(0, 24.6876, z))).toBe(false);
    expect(insideViewVolume(F1, B, vec(0, -24.6876, z))).toBe(false);
    expect(insideViewVolume(DESTRUCTION, B, vec(0, 24.6875, z))).toBe(true);
    expect(insideViewVolume(DESTRUCTION, B, vec(0, 37.5, z))).toBe(false);
    expect(insideViewVolume(F1, B, vec(0, 0, 1))).toBe(true);
    expect(insideViewVolume(F1, B, vec(0, 0, 0.999))).toBe(false);
    expect(insideViewVolume(F1, B, vec(0, 0, B - 0.001))).toBe(true);
    expect(insideViewVolume(F1, B, vec(0, 0, B))).toBe(false);
  });

  it('gives the rasteriser\'s pixel: rows rounded half to even, columns floored after the 16.16 rounding (RS1, RS2)', () => {
    expect(rasterPixel({ x: 10.75, y: 2.5 })).toEqual({ column: 10, row: 2 });
    expect(rasterPixel({ x: 10.25, y: 3.5 })).toEqual({ column: 10, row: 4 });
    expect(rasterPixel({ x: 10.999999999, y: 3.49 })).toEqual({ column: 11, row: 3 });
    expect(rasterPixel({ x: -0.25, y: -0.5 })).toEqual({ column: -1, row: 0 });
    expect(rasterPixel({ x: 0, y: -1.5 })).toEqual({ column: 0, row: -2 });
  });

  it('maps a camera-space point to the formula\'s logical position at every window size and pixel ratio, half a pixel left', () => {
    const points = [vec(1, 0.5, 4), vec(-30, 12, 97), vec(0.25, -0.125, 1.5), vec(80, -20, 590)];
    const sizes = [[640, 480, 1], [800, 600, 2], [1366, 768, 1.25], [500, 900, 3], [1920, 1080, 1.5]] as const;
    for (const viewport of [F1, DESTRUCTION]) {
      for (const [width, height, devicePixelRatio] of sizes) {
        const layout = computeViewportLayout({ width, height, devicePixelRatio, maxDrawingBufferSize: 8192 })!;
        const logical = logicalTransform(layout);
        const matrix = worldProjectionMatrix(viewport, B, logical);
        for (const point of points) {
          const screen = projectToScreen(viewport, point);
          const drawn = throughMatrix(matrix, point, layout.bufferWidth, layout.bufferHeight, logical.scale);
          expect(drawn.x).toBeCloseTo(screen.x + RASTER_OFFSET_X, 3);
          expect(drawn.y).toBeCloseTo(screen.y, 3);
          // The library's depth z_p = B(z − 1)/((B − 1)z), as [−1, 1].
          expect(drawn.depth).toBeCloseTo(2 * ((B * (point.z - 1)) / ((B - 1) * point.z)) - 1, 9);
        }
      }
    }
    const logical = logicalTransform(computeViewportLayout({ width: 640, height: 480, devicePixelRatio: 1, maxDrawingBufferSize: 8192 })!);
    const matrix = worldProjectionMatrix(F1, B, logical);
    expect(throughMatrix(matrix, vec(0, 0, 1), 640, 480, 1).depth).toBeCloseTo(-1, 12);
    expect(throughMatrix(matrix, vec(0, 0, B), 640, 480, 1).depth).toBeCloseTo(1, 12);
  });

  it('places the world camera at the scene\'s drawn camera', () => {
    const logical = logicalTransform(computeViewportLayout({ width: 640, height: 480, devicePixelRatio: 1, maxDrawingBufferSize: 8192 })!);
    const rows = Object.freeze([0, 0, -1, 0, 1, 0, 1, 0, 0]) as unknown as typeof IDENTITY_ROWS;
    const scene: FlightSceneFrame = { view: 'flight', viewport: F1, camera: { position: vec(10, 0, 0), rows }, backPlane: B, entities: [] };
    const camera = setWorldCamera(new Camera(), scene, logical);
    const world = vec(13, 4, 25);
    const view = new Vector4(world.x, world.y, world.z, 1).applyMatrix4(camera.matrixWorldInverse);
    const expected = cameraSpace(scene.camera, world);
    expect([view.x, view.y, view.z]).toEqual([expected.x, expected.y, expected.z].map((value) => expect.closeTo(value, 12)));
    expect(camera.projectionMatrix.elements).toEqual(worldProjectionMatrix(F1, B, logical).elements);
    expect(camera.matrixWorldAutoUpdate).toBe(false);
  });

  it('raises the back plane while counted visuals exist (PV4) and refuses device values it cannot order', () => {
    const values = SCENE_SETTINGS.deviceValues;
    expect(backPlane(values, [])).toBe(600);
    expect(backPlane(values, [kind(0), kind(22), kind(25)])).toBe(600);
    expect(backPlane(values, [kind(2)])).toBe(1200);
    expect(backPlane(values, [kind(2), kind(15)])).toBe(4000);
    expect(backPlane(values, [kind(19), kind(12)])).toBe(4000);
    expect(backPlane(values, [kind(15, { display: 'released' })])).toBe(600);
    expect(backPlane(values, [kind(15, { display: 'pending' })])).toBe(4000);
    // A discriminator-3 fragment counts by its source's kind.
    expect(backPlane(values, [kind(24, { sourceKindBit: 16 })])).toBe(4000);
    expect(backPlane(values, [kind(24, { sourceKindBit: 3 })])).toBe(1200);
    expect(backPlane(values, [kind(24, { sourceKindBit: 0 })])).toBe(600);
    for (const deviceValues of [{ base: 1, kinds1c7c: 2, kindsF8000: 3 }, { base: 600, kinds1c7c: 600, kindsF8000: 700 }, { base: 600, kinds1c7c: 900, kindsF8000: 800 }, { base: Number.NaN, kinds1c7c: 2, kindsF8000: 3 }]) {
      expect(() => { checkSceneDevice(deviceValues); }).toThrow(expect.objectContaining({ kind: 'invalid-input', path: 'scene.deviceValues' }));
    }
    expect(() => { checkSceneDevice({ base: 1.5, kinds1c7c: 2, kindsF8000: 3 }); }).not.toThrow();
  });
});
