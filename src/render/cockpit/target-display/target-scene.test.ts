import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../../../core/contracts/domain-events.ts';
import type { Matrix3 } from '../../../core/world/entity-table.ts';
import { cameraRequest, libraryOrientation, TargetScene, type TargetView } from './target-scene.ts';
import { backgroundTexel, expectedDevice, IDENTITY, rectangleGeometry, syntheticModel, targetBackground } from './target-display.test-support.ts';

// The right display's device (hud §4.5, T7, PV3, PV5; textures TEX 11089). The target sits at the origin with the
// identity rows, the player at (0, 0, −100) looking along +z; with view distance 25 the camera is at (0, 0, −25), so a
// model point (x, y, 0) projects to (50 + 4x, 50 − 4y).

const SIZE = 100;
const COLOUR = 0x10;
const rows = (...values: number[]): Matrix3 => Object.freeze(values) as unknown as Matrix3;
const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

/** The device after a render of `view`. */
function render(view: Partial<TargetView> | null): Uint8Array {
  const scene = new TargetScene(targetBackground().indices);
  scene.render(view === null ? null : {
    model: syntheticModel(), colour: COLOUR, target: { position: vec(0, 0, 0), orientation: IDENTITY }, distance: 100, viewDistance: 25,
    player: { position: vec(0, 0, -100), orientation: IDENTITY }, ...view,
  });
  return scene.device.indices;
}


describe('background', () => {
  it('stretches the 96 × 96 texture over the device by ⌊96u/100⌋ without shading', () => {
    const device = render(null);
    expect(device).toEqual(expectedDevice());
    // Exactly columns 1, 26, 51 and 76 repeat their left neighbour (rows likewise): not centred, tiled or sampled at centres.
    const repeated = Array.from({ length: SIZE - 1 }, (_, at) => at + 1).filter((u) => device[u] === device[u - 1]);
    expect(repeated).toEqual([1, 26, 51, 76]);
    expect(device[99 * SIZE + 99]).toBe(backgroundTexel(95, 95));
  });

  it('starts a rebuilt device at index 0 until the next render', () => {
    const scene = new TargetScene(targetBackground().indices);
    scene.render(null);
    scene.rebuild();
    expect(scene.device.indices.every((index) => index === 0)).toBe(true);
  });
});

describe('model silhouette', () => {
  it('draws the list-0 parts in one colour at the view distance on the line to the player', () => {
    // x ∈ [−5, 5], y ∈ [−2, 2] → columns 30–69, rows 42–57.
    expect(render({})).toEqual(expectedDevice([30, 42, 69, 57]));
  });

  it('negative controls: a mirrored model is culled, a rotated one is tall, the next table distance is smaller', () => {
    const mirrored = syntheticModel([{ ...rectangleGeometry(), indices: Uint16Array.of(0, 2, 1, 0, 3, 2) }]);
    expect(render({ model: mirrored })).toEqual(expectedDevice());
    expect(render({ model: syntheticModel([rectangleGeometry(2, 5)]) })).toEqual(expectedDevice([42, 30, 57, 69]));
    // D = 37.5: x = ±5 → 36.67 and 63.33 (columns 36–62), y = ±2 → 44.67 and 55.33 (rows 45–54).
    expect(render({ viewDistance: 37.5 })).toEqual(expectedDevice([36, 45, 62, 54]));
  });

  it('places mesh vertices with the target\'s library rows (dir = R2, up = R1)', () => {
    // The target rolled 90° about z (R1 = −x): its x axis becomes world +y, so the wide rectangle stands tall.
    const rolled = rows(0, 1, 0, -1, 0, 0, 0, 0, 1);
    expect(render({ target: { position: vec(0, 0, 0), orientation: rolled } })).toEqual(expectedDevice([42, 30, 57, 69]));
  });

  it('orients the camera with the player\'s R1 unless |R2 · u| ≤ 0.01, then with world up', () => {
    // The player rolled so that its R1 is world +x: the camera's up is +x and the rectangle stands tall.
    const rolledPlayer = rows(0, -1, 0, 1, 0, 0, 0, 0, 1);
    expect(render({ player: { position: vec(0, 0, -100), orientation: rolledPlayer } })).toEqual(expectedDevice([42, 30, 57, 69]));
    // Looking along +y (R2 · u = 0) with the same R1: world up wins, so the rectangle is wide again.
    const sideways = rows(0, 0, 1, 1, 0, 0, 0, 1, 0);
    expect(render({ player: { position: vec(0, 0, -100), orientation: sideways } })).toEqual(expectedDevice([30, 42, 69, 57]));
  });

  it('clips at the front plane and the back plane 900', () => {
    // Entirely behind the front plane (camera z < 1) or beyond the back plane: nothing.
    expect(render({ viewDistance: 0.5 })).toEqual(expectedDevice());
    expect(render({ viewDistance: 900 })).toEqual(expectedDevice());
    // Straddling the front plane: a long strip along z keeps only its part with z ≥ 1, so it still covers the device's
    // lower centre rows down to the bottom row and stops short of the top.
    const strip: TargetView['model'] = syntheticModel([{
      positions: Float32Array.of(-1, -2, -40, 1, -2, -40, 1, -2, 40, -1, -2, 40),
      uvs: new Float32Array(8), normals: new Float32Array(12), indices: Uint16Array.of(0, 3, 2, 0, 2, 1), cornerShading: new Uint16Array(6), shadingSlotCount: 1,
    }]);
    const device = render({ model: strip });
    const covered = (v: number) => device.subarray(v * SIZE, (v + 1) * SIZE).includes(COLOUR);
    expect(covered(99)).toBe(true);
    expect(covered(50)).toBe(false);
    expect(device.every((index, at) => index === COLOUR || index === expectedDevice()[at])).toBe(true);
  });
});

describe('camera', () => {
  it('stands at the view distance from the target on the line to the player, with f32 coordinates', () => {
    const { position } = cameraRequest({
      target: { position: vec(10, 20, 30), orientation: IDENTITY }, distance: 3, viewDistance: 1,
      player: { position: vec(10, 20, 33), orientation: IDENTITY },
    });
    expect(position).toEqual(vec(10, 20, 31));
    const far = cameraRequest({ target: { position: vec(0, 0, 0), orientation: IDENTITY }, distance: 3, viewDistance: 1, player: { position: vec(0.1, 0, 3), orientation: IDENTITY } });
    expect(far.position.x).toBe(Math.fround(0.1 * (1 / 3)));
  });

  it('rejects dir = up and unnormalisable vectors, as the library does', () => {
    expect(libraryOrientation(vec(0, 0, 1), vec(0, 0, 1))).toBeNull();
    expect(libraryOrientation(vec(0, 0, 0), vec(0, 1, 0))).toBeNull();
    expect(libraryOrientation(vec(0, 0, 1), vec(0, 0, -2))).toBeNull();
    expect(libraryOrientation(vec(0, 0, 2), vec(0, 3, 1))).toEqual(rows(1, 0, 0, 0, 1, 0, 0, 0, 1));
  });

  it('keeps the previous camera orientation when the request is rejected', () => {
    // The player's R1 equals u (both +z): rejected, so the camera keeps the orientation of the previous render.
    const scene = new TargetScene(targetBackground().indices);
    const base: TargetView = {
      model: syntheticModel(), colour: COLOUR, target: { position: vec(0, 0, 0), orientation: IDENTITY }, distance: 100, viewDistance: 25,
      player: { position: vec(0, 0, -100), orientation: rows(0, -1, 0, 1, 0, 0, 0, 0, 1) },
    };
    scene.render(base);
    scene.render({ ...base, player: { position: vec(0, 0, -100), orientation: rows(1, 0, 0, 0, 0, 1, 0, 0, 1) } });
    expect(scene.device.indices).toEqual(expectedDevice([42, 30, 57, 69]));
  });

  it('uses the degenerate world up (−dy, s, 0) when |s| ≤ 0.0001', () => {
    // Looking straight down (u = −y), with the player's R2 along +x: look-at; s = 0 gives up = (1, 0, 0).
    const request = cameraRequest({
      target: { position: vec(0, 0, 0), orientation: IDENTITY }, distance: 100, viewDistance: 25,
      player: { position: vec(0, 100, 0), orientation: rows(0, 1, 0, 0, 0, 1, 1, 0, 0) },
    });
    expect(request.orientation).toEqual(libraryOrientation(vec(0, -1, 0), vec(1, 0, 0)));
  });
});
