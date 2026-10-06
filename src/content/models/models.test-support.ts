import { expect } from 'vitest';
import { readAssetId } from '../asset-id.ts';
import type { ModelGeometry, ModelPayload } from './model-payload.ts';

// Synthetic models built in code for the model payload tests and the converter tests that compare against them.

export const TEXTURE_A = readAssetId('image/synthetic-texture-a');
export const TEXTURE_B = readAssetId('image/synthetic-texture-b');
export const SOUND_A = readAssetId('sound/synthetic-clip-a');
export const SOUND_B = readAssetId('sound/synthetic-clip-b');

/** A Float32Array holding exactly these IEEE 754 single-precision bit patterns. */
export const floatsFromBits = (...bits: number[]): Float32Array => new Float32Array(Uint32Array.from(bits).buffer);

/** The bit patterns of a Float32Array, for bit-exact comparisons that also tell -0 from 0. */
export const floatBits = (floats: Float32Array): number[] => [...new Uint32Array(floats.buffer, floats.byteOffset, floats.length)];

/** Asserts that two geometries hold the same floats bit for bit, indices, corner shading slots and slot count. */
export function expectSameGeometry(actual: ModelGeometry, expected: ModelGeometry): void {
  for (const field of ['positions', 'uvs', 'normals'] as const) expect(floatBits(actual[field])).toEqual(floatBits(expected[field]));
  expect([...actual.indices]).toEqual([...expected.indices]);
  expect([...actual.cornerShading]).toEqual([...expected.cornerShading]);
  expect(actual.shadingSlotCount).toBe(expected.shadingSlotCount);
}

// Negative zero, the smallest and largest subnormals, the largest finite value and its negation, one and -1.5.
const EDGE_BITS = [0x8000_0000, 0x0000_0001, 0x007f_ffff, 0x7f7f_ffff, 0xff7f_ffff, 0x3f80_0000, 0xbfc0_0000];

const bitsAt = (index: number): number => EDGE_BITS[index % EDGE_BITS.length];

/**
 * Geometry 0: four vertices, the last unused, one triangle wound 0-2-1 and two shading slots. Floats cycle through edge
 * bit patterns, including -0 and subnormals.
 */
export function quadGeometry(): ModelGeometry {
  return {
    positions: floatsFromBits(...Array.from({ length: 12 }, (_, index) => bitsAt(index))),
    uvs: floatsFromBits(...Array.from({ length: 8 }, (_, index) => bitsAt(index + 3))),
    normals: floatsFromBits(...Array.from({ length: 12 }, (_, index) => bitsAt(index + 5))),
    indices: Uint16Array.of(0, 2, 1),
    cornerShading: Uint16Array.of(1, 0, 1),
    shadingSlotCount: 2,
  };
}

/** Geometry 1: three vertices, two triangles of opposite winding and one shading slot per corner. */
export function pairGeometry(): ModelGeometry {
  return {
    positions: Float32Array.of(0, 0, 0, 1, 0, 0, 0, 1, 0),
    uvs: Float32Array.of(0, 0, 2, 0, 0, -1),
    normals: Float32Array.of(0, 0, 1, 0, 0, 1, 0, 0, -1),
    indices: Uint16Array.of(0, 1, 2, 2, 1, 0),
    cornerShading: Uint16Array.of(0, 1, 2, 3, 4, 5),
    shadingSlotCount: 6,
  };
}

/**
 * A model covering the payload's cases: list 2 empty, two parts sharing geometry 0, textured and untextured parts,
 * colour channels 0 and 255, raw flag words up to 0xFFFFFFFF, one texture used twice, and sound slots both empty and
 * set, with one sound in two slots.
 */
export function syntheticModel(): Omit<ModelPayload, 'kind'> {
  return {
    geometries: [quadGeometry(), pairGeometry()],
    partLists: [
      [
        { sourceFlags: 1, colour: [255, 255, 255], geometry: 0, texture: TEXTURE_B },
        { sourceFlags: 0x8000_0003, colour: [0, 0, 0], geometry: 0, texture: null },
        { sourceFlags: 2, colour: [12, 34, 56], geometry: 1, texture: TEXTURE_A },
      ],
      [{ sourceFlags: 0xffff_ffff, colour: [255, 0, 128], geometry: 1, texture: TEXTURE_A }],
      [],
    ],
    soundSlots: [SOUND_B, null, SOUND_A, null, SOUND_B],
  };
}
