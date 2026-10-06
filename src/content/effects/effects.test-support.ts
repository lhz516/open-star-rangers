import { readAssetId } from '../asset-id.ts';
import { floatBits } from '../models/models.test-support.ts';
import type { DebrisVisuals, MissileVisuals, ProjectileVisuals } from './effect-payload.ts';

// Synthetic effect payloads built in code with arbitrary values, for the payload and expansion tests and the converter
// tests that compare against them. Nothing here comes from the original game.

export const MISSILE_TEXTURE = readAssetId('image/synthetic-missile');
export const DEBRIS_TEXTURE = readAssetId('image/synthetic-debris');

/** The IEEE 754 single-precision bit pattern of a number. */
export const bitsOf = (value: number): number => floatBits(Float32Array.of(value))[0];

/** The smallest positive single-precision subnormal. */
export const F32_SUBNORMAL = Math.fround(1.4e-45);

/**
 * Template 0 marks x by ±2.5, y by ±0.75 and z by ±4, and length-scales a z of 9.5; template 1 uses ±3.5 on every axis
 * and length-scales a z of -6. Record 1 selects template 1 with a non-zero selector other than 1.
 */
export function syntheticProjectile(): ProjectileVisuals {
  return {
    kind: 'projectile',
    templates: [
      {
        faces: Uint32Array.of(3, 0, 1, 2, 4, 0, 2, 3, 1, 0),
        vertices: Float32Array.of(2.5, 0.75, 4, -2.5, -0.75, 9.5, 0.75, 2.5, -4, -0, 1.25, 6.5),
        widthMarkers: Uint32Array.of(bitsOf(2.5), bitsOf(-2.5), bitsOf(0.75), bitsOf(-0.75), bitsOf(4), bitsOf(-4)),
        lengthMarker: bitsOf(9.5),
        lengthConstant: 0.3,
      },
      {
        faces: Uint32Array.of(4, 3, 2, 1, 0, 0),
        vertices: Float32Array.of(3.5, -3.5, -6, F32_SUBNORMAL, 3.5, -3.5, -3.5, 0, 3.5, 7.25, -1.625, -6),
        widthMarkers: Uint32Array.of(...[3.5, -3.5, 3.5, -3.5, 3.5, -3.5].map(bitsOf)),
        lengthMarker: bitsOf(-6),
        lengthConstant: -0,
      },
    ],
    records: [
      { selector: 0, width: 2.375, length: 3, colour: [0.125, 0.875, 6] },
      { selector: 7, width: -0, length: 1.5, colour: [-0, 2, F32_SUBNORMAL] },
      { selector: 0xffff_ffff, width: 1.75, length: -2.5, colour: [3.25, -0.375, 0] },
    ],
  };
}

/** Type 0 has no fins and a zero flag; type 1 two fins and a non-zero flag; type 2 three fins and a negative zero flag. */
export function syntheticMissile(): MissileVisuals {
  return {
    kind: 'missile',
    texture: MISSILE_TEXTURE,
    faces: {
      fin: Uint32Array.of(3, 0, 1, 3, 3, 0, 3, 2, 4, 5, 7, 6, 8, 0),
      element: Uint32Array.of(4, 0, 1, 3, 2, 4, 2, 3, 5, 4, 0),
      flaggedElement: Uint32Array.of(3, 0, 2, 4, 3, 1, 5, 3, 0),
      extra: Uint32Array.of(3, 0, 1, 2, 0),
    },
    constants: {
      finColourScale: 0.25, bodyAngle: 5.75, bodyColourScale: 0.0625, elementStep: 1.375,
      extraOffset: 0.875, extraStep: 2.125, rotationStep: -0,
    },
    rotationScale: 4.75,
    extraColour: [0.375, -1.25, 3],
    types: [
      {
        parts: 1,
        body: { r0: 0.625, r1: 0.4375, length: 7.5, segments: 3, colour: 0xff_ffff },
        fins: [],
        element: [0.3125, 0.1875, 1.75],
        flag: 0,
      },
      {
        parts: 3,
        body: { r0: 1.125, r1: -0, length: -2.25, segments: 5, colour: 0x12_3456 },
        fins: [{ params: [0.25, 0.75, 1.5, -0.625], colour: 0 }, { params: [-0, 3.25, -1.5, 2.5], colour: 0x80_7f01 }],
        element: [2.5, 1.25, 0.625],
        flag: 1.5,
      },
      {
        parts: 4,
        body: { r0: 2.75, r1: 1.375, length: F32_SUBNORMAL, segments: 4, colour: 0x01_0203 },
        fins: [
          { params: [1.5, 0.25, 0.125, 3], colour: 0x00_ff00 },
          { params: [0.875, -1.25, 2, 0], colour: 0x7f_0000 },
          { params: [3.75, 2.625, -0.25, 1.125], colour: 0x00_00ff },
        ],
        element: [-1.5, 0.375, -2.75],
        flag: -0,
      },
    ],
  };
}

export function syntheticDebris(): DebrisVisuals {
  return {
    kind: 'debris',
    texture: DEBRIS_TEXTURE,
    templates: [
      {
        faces: Uint32Array.of(3, 0, 1, 2, 4, 2, 3, 4, 5, 0),
        vertices: Float32Array.of(0.25, -1.5, 2, 3.125, 0, -0, -2.75, 1.125, 0.5625, 4, -0.0625, 1.75, F32_SUBNORMAL, 2.5, -3, 0.375, -0.875, 6),
        perVertex: Uint32Array.of(0, 1, 0xffff_ffff, 0x7fc0_0001, 0x8000_0000, 17, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13),
      },
      {
        faces: Uint32Array.of(5, 0, 1, 2, 3, 4, 3, 3, 4, 5, 0),
        vertices: Float32Array.of(-1, 2.25, 0.75, 1.5, -0.125, 3.5, 0, 0, -2, 5.25, 1.875, -0.625, -3.25, 0.4375, 2.125, 1, -1, 1.25),
        perVertex: Uint32Array.of(...Array.from({ length: 18 }, (_, index) => 0x1000 * index + 3)),
      },
    ],
    untexturedScales: [0.375, -1.5, 2.25],
    texturedScales: [0.625, 3.125],
    untexturedColour: [0.25, -0, 1.75],
    texturedColour: [2, 0.125, -0.5],
  };
}
