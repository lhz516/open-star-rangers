import { Box3, Vector3, type BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { SYNTHETIC_MARKER_MAX, SYNTHETIC_MARKER_MIN } from '../../core/synthetic/synthetic-scene.ts';
import {
  createSyntheticAppearance, disposeSyntheticAppearance, SYNTHETIC_BACKGROUND_COLOR, SYNTHETIC_KIND_COLORS,
} from './synthetic-appearance.ts';
import { VIEWPORT_ASPECT } from '../viewport/viewport-layout.ts';
import { createSyntheticCamera } from './synthetic-camera.ts';

const CORNERS = [SYNTHETIC_MARKER_MIN, SYNTHETIC_MARKER_MAX].flatMap(x =>
  [SYNTHETIC_MARKER_MIN, SYNTHETIC_MARKER_MAX].flatMap(y =>
    [SYNTHETIC_MARKER_MIN, SYNTHETIC_MARKER_MAX].map(z => new Vector3(x, y, z))));

/** Screen-space bounding box, in device px of a 320×240 DPR 1 view, of a geometry placed at `at`. */
function projectedBox(geometry: BufferGeometry, at: Vector3): { width: number; height: number } {
  const camera = createSyntheticCamera();
  geometry.computeBoundingBox();
  const box = new Box3().copy(geometry.boundingBox!).translate(at);
  const xs: number[] = [], ys: number[] = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const ndc = new Vector3(x, y, z).project(camera);
    xs.push(((ndc.x + 1) / 2) * 320);
    ys.push(((1 - ndc.y) / 2) * 240);
  }
  return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

/** Displayed sRGB channels: Three.js converts the sRGB hex to linear and back on output. */
function channels(color: number): number[] {
  return [16, 8, 0].map(shift => (color >> shift) & 0xff);
}
function maxChannelDifference(a: number, b: number): number {
  const [x, y] = [channels(a), channels(b)];
  return Math.max(...x.map((channel, index) => Math.abs(channel - y[index])));
}

describe('synthetic camera', () => {
  it('has a fixed 4:3 projection independent of any layout', () => {
    const camera = createSyntheticCamera();
    expect(camera.aspect).toBe(4 / 3);
    expect(VIEWPORT_ASPECT).toBe(4 / 3);
    expect(camera.projectionMatrix.equals(createSyntheticCamera().projectionMatrix)).toBe(true);
  });

  it('keeps every marker corner and the origin inside the view and depth range', () => {
    const camera = createSyntheticCamera();
    for (const point of [...CORNERS, new Vector3(0, 0, 0)]) {
      const ndc = point.clone().project(camera);
      expect(Math.abs(ndc.x), `x of ${point.toArray()}`).toBeLessThan(1);
      expect(Math.abs(ndc.y), `y of ${point.toArray()}`).toBeLessThan(1);
      expect(Math.abs(ndc.z), `depth of ${point.toArray()}`).toBeLessThan(1);
    }
  });

  it('covers at least 3×3 device pixels for the mover at the origin and a marker at every far corner at 320×240', () => {
    const appearance = createSyntheticAppearance();
    const mover = projectedBox(appearance.mover.geometry, new Vector3(0, 0, 0));
    expect(mover.width).toBeGreaterThanOrEqual(3);
    expect(mover.height).toBeGreaterThanOrEqual(3);
    for (const corner of CORNERS) {
      const marker = projectedBox(appearance.marker.geometry, corner);
      expect(marker.width, `marker width at ${corner.toArray()}`).toBeGreaterThanOrEqual(3);
      expect(marker.height, `marker height at ${corner.toArray()}`).toBeGreaterThanOrEqual(3);
    }
    expect(disposeSyntheticAppearance(appearance)).toEqual([]);
  });
});

describe('synthetic appearance', () => {
  it('separates the background from black and every colour from each other', () => {
    expect(maxChannelDifference(SYNTHETIC_BACKGROUND_COLOR, 0x000000)).toBeGreaterThanOrEqual(32);
    const colors = [SYNTHETIC_BACKGROUND_COLOR, SYNTHETIC_KIND_COLORS.mover, SYNTHETIC_KIND_COLORS.marker];
    for (const [index, a] of colors.entries()) {
      for (const b of colors.slice(index + 1)) expect(maxChannelDifference(a, b)).toBeGreaterThanOrEqual(64);
    }
  });

  it('shares one unlit, untextured geometry and material per kind and disposes each exactly once', () => {
    const appearance = createSyntheticAppearance();
    const disposed: string[] = [];
    for (const [kind, { geometry, material }] of Object.entries(appearance)) {
      expect(material.type).toBe('MeshBasicMaterial');
      expect(material.map).toBeNull();
      expect(material.color.getHex()).toBe(SYNTHETIC_KIND_COLORS[kind as keyof typeof SYNTHETIC_KIND_COLORS]);
      geometry.addEventListener('dispose', () => { disposed.push(`${kind} geometry`); });
      material.addEventListener('dispose', () => { disposed.push(`${kind} material`); });
    }
    expect(appearance.mover.geometry).not.toBe(appearance.marker.geometry);
    expect(disposeSyntheticAppearance(appearance)).toEqual([]);
    expect(disposed.sort()).toEqual(['marker geometry', 'marker material', 'mover geometry', 'mover material']);
  });

  it('attempts every disposal and returns all failures', () => {
    const appearance = createSyntheticAppearance();
    const failure = new Error('geometry');
    appearance.mover.geometry.dispose = () => { throw failure; };
    let materialDisposed = false;
    appearance.marker.material.addEventListener('dispose', () => { materialDisposed = true; });
    expect(disposeSyntheticAppearance(appearance)).toEqual([failure]);
    expect(materialDisposed).toBe(true);
  });
});
