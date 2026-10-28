import { describe, expect, it } from 'vitest';
import type { Matrix3 } from '../../../core/world/entity-table.ts';
import {
  ambientByte, faceNormal, lightIntensity, lightScale, litValue, modelLight, normaliseScaled, normaliseVector, roundHalfEven, shadeOf,
} from './lighting-math.ts';

const F = Math.fround;
const v = (x: number, y: number, z: number) => ({ x, y, z });
const rows = (...values: number[]): Matrix3 => values as unknown as Matrix3;

/** Proper rotations whose x components (X.x, U.x, D.x) put the vector towards the light, world −x, on each model axis. */
const AXIS_FRAMES: readonly { readonly axis: string; readonly rows: Matrix3; readonly towards: readonly [number, number, number] }[] = [
  { axis: '+x', rows: rows(-1, 0, 0, 0, -1, 0, 0, 0, 1), towards: [1, 0, 0] },
  { axis: '−x', rows: rows(1, 0, 0, 0, 1, 0, 0, 0, 1), towards: [-1, 0, 0] },
  { axis: '+y', rows: rows(0, 1, 0, -1, 0, 0, 0, 0, 1), towards: [0, 1, 0] },
  { axis: '−y', rows: rows(0, -1, 0, 1, 0, 0, 0, 0, 1), towards: [0, -1, 0] },
  { axis: '+z', rows: rows(0, 0, 1, 0, 1, 0, -1, 0, 0), towards: [0, 0, 1] },
  { axis: '−z', rows: rows(0, 0, -1, 0, 1, 0, 1, 0, 0), towards: [0, 0, -1] },
];

describe('lighting arithmetic', () => {
  it('rounds half to even', () => {
    expect([0.5, 1.5, 2.5, 383.5, 384.5, 127.4999, 128.0001].map(roundHalfEven)).toEqual([0, 2, 2, 384, 384, 127, 128]);
  });

  it('weighs the light colour into one intensity and the ambient byte', () => {
    expect(lightIntensity([0.5, 0.5, 0.5])).toBe(0.5);
    expect(lightIntensity([1, 0, 0])).toBe(F(77 / 256));
    expect(lightIntensity([0.3, 0.6, 0.9])).toBe(F(((0.3 * 77 + 0.6 * 150) + 0.9 * 29) / 256));
    expect([0.25, 1.5 / 256, 2.5 / 256, 0.999, 1].map(ambientByte)).toEqual([64, 2, 2, 255, 255]);
  });

  it('normalises like 0x948a4 and 0x94938', () => {
    expect(normaliseVector(v(0, -0, 0))).toEqual(v(1, 0, 0));
    expect(normaliseVector(v(3, 4, 0))).toEqual(v(F(3 / 5), F(4 / 5), 0));
    const small = v(5e-5, -2e-5, 0);
    expect(normaliseScaled(small)).toBe(small);
    expect(normaliseScaled(v(0, -2, 0))).toEqual(v(0, -1, 0));
    // Scaled by 1/4 first: (0.75, 1, 0), then by 1/√1.5625.
    expect(normaliseScaled(v(3, 4, 0))).toEqual(v(F(0.75 / 1.25), F(1 / 1.25), 0));
  });

  it('takes the face normal from the corners in stored order', () => {
    expect(faceNormal(v(0, 0, 0), v(1, 0, 0), v(0, 1, 0))).toEqual(v(0, 0, 1));
    expect(faceNormal(v(0, 0, 0), v(0, 1, 0), v(1, 0, 0))).toEqual(v(0, 0, -1));
    expect(faceNormal(v(5, 5, 5), v(5, 5, 7), v(5, 9, 5))).toEqual(v(-1, 0, 0));
    expect(faceNormal(v(1, 1, 1), v(1, 1, 1), v(2, 2, 2))).toEqual(v(0, 0, 0));
  });

  it('puts world −x on each model axis and lights only the facing normal', () => {
    const k = lightScale(0.5);
    expect(k).toBe(1.5);
    for (const { axis, rows: frame, towards } of AXIS_FRAMES) {
      const light = modelLight(frame, k);
      expect([light.x, light.y, light.z].map((c) => c + 0), axis).toEqual(towards.map((c) => c * 1.5));
      const n = v(...towards);
      expect(litValue(light, n), axis).toBe(384);
      expect(litValue(light, v(-n.x, -n.y, -n.z)), axis).toBe(0);
    }
  });

  it('gives the shade boundaries of the single-light path', () => {
    const light = modelLight(AXIS_FRAMES[0].rows, lightScale(0.5));
    const third = F(1 / 3);
    expect(litValue(light, v(1, 0, 0))).toBe(384);
    expect(litValue(light, v(third, F(Math.sqrt(8 / 9)), 0))).toBe(128);
    expect(litValue(light, v(0, 1, 0))).toBe(0);
    expect(litValue(light, v(F(1 / 1024), 1, 0))).toBe(0);
    expect(litValue(light, v(F(3 / 1024), 1, 0))).toBe(1);
    expect([0, 127, 128, 383, 384, 639, 640, 768].map(shadeOf)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(shadeOf(litValue(light, v(third, 0, 0)))).toBe(1);
  });

  it('reads the drawn frame’s axes as f32 before normalising', () => {
    const tilted = rows(0.6, 0, -0.8, 0, 1, 0, 0.8, 0, 0.6);
    const expected = normaliseVector(v(-F(0.6), -0, -F(0.8)));
    expect(modelLight(tilted, 1)).toEqual(expected);
    expect(expected).toEqual(v(F(-F(0.6) / Math.sqrt(F(F(0.6) ** 2 + F(0.8) ** 2))), -0, F(-F(0.8) / Math.sqrt(F(F(0.6) ** 2 + F(0.8) ** 2)))));
  });
});
