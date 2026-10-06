import { describe, expect, it } from 'vitest';
import { expectContractError } from '../graphics/graphics.test-support.ts';
import type { MissileVisuals } from './effect-payload.ts';
import { effectExpansionSize, expandDebris, expandMissiles, expandProjectiles, type EffectShape } from './expand-effects.ts';
import { MISSILE_TEXTURE, DEBRIS_TEXTURE, F32_SUBNORMAL, syntheticDebris, syntheticMissile, syntheticProjectile } from './effects.test-support.ts';

// P2-06 AC-19 (expansion): expected shapes are written here from the builder rules in docs/original/formats/
// executable.md, for the arbitrary synthetic payloads; nothing comes from the original game.

const f = Math.fround;
const positions = (...values: number[]) => Float32Array.from(values, f);

/** Angles 0, step, 2 × step, … accumulated by addition, as the builders do. */
function angles(count: number, step: number): number[] {
  const result: number[] = [];
  for (let index = 0, angle = 0; index < count; index++, angle += step) result.push(angle);
  return result;
}

const shapeSize = (shapes: readonly EffectShape[]) => ({
  vertices: shapes.reduce((sum, shape) => sum + shape.positions.length / 3, 0),
  triangles: shapes.reduce((sum, shape) => sum + shape.faces.reduce((total, face) => total + face.length - 2, 0), 0),
});

describe('projectile expansion', () => {
  const payload = syntheticProjectile();
  const shapes = expandProjectiles(payload);

  it('scales marked components by the width, then marked z components by length times the constant', () => {
    // Record 0, template 0: x is marked by ±2.5, y by ±0.75, z by ±4; a z of 9.5 is length-scaled.
    const [w0, l0, k0] = [2.375, 3, 0.3];
    expect(shapes[0].positions).toEqual(positions(
      2.5 * w0, 0.75 * w0, f(4 * w0) * (l0 * k0),
      -2.5 * w0, -0.75 * w0, 9.5 * (l0 * k0),
      0.75, 2.5, -4 * w0, // 0.75 on x and 2.5 on y are markers of other axes
      -0, 1.25, 6.5,
    ));
    // Records 1 and 2, template 1: every axis is marked by ±3.5 and a z of -6 is length-scaled.
    const k1 = -0;
    for (const [index, w, l] of [[1, -0, 1.5], [2, 1.75, -2.5]]) {
      expect(shapes[index].positions).toEqual(positions(
        3.5 * w, -3.5 * w, -6 * (l * k1),
        F32_SUBNORMAL, 3.5 * w, -3.5 * w,
        -3.5 * w, 0, 3.5 * w,
        7.25, -1.625, -6 * (l * k1),
      ));
    }
  });

  it('gives the template faces and the record colour, with no texture', () => {
    expect(shapes[0].faces).toEqual([[0, 1, 2], [0, 2, 3, 1]]);
    expect(shapes[1].faces).toEqual([[3, 2, 1, 0]]);
    shapes.forEach((shape, index) => {
      expect(shape.colour).toEqual(payload.records[index].colour);
      expect([shape.texture, shape.perVertex, shape.mapping]).toEqual([null, null, null]);
    });
  });
});

describe('missile expansion', () => {
  const payload = syntheticMissile();
  const c = payload.constants;
  const visuals = expandMissiles(payload);

  function bodyPositions(r0: number, r1: number, length: number, segments: number): Float32Array {
    return positions(...angles(segments, c.bodyAngle / segments).flatMap(a =>
      [r0 * Math.cos(a), r0 * Math.sin(a), 0, r1 * Math.cos(a), r1 * Math.sin(a), length]));
  }

  function elementPositions([e0, e1, e2]: readonly number[]): Float32Array {
    return positions(...angles(3, c.elementStep).flatMap(a =>
      [e0 * Math.cos(a), e0 * Math.sin(a), 0, e1 * Math.cos(a), e1 * Math.sin(a), -e2]));
  }

  function extraPositions([e0, e1, e2]: readonly number[]): Float32Array {
    const z = -e2 + c.extraOffset;
    const radius = e0 + (-z * (e1 - e0)) / e2;
    return positions(...angles(3, c.extraStep).flatMap(a => [radius * Math.cos(a), radius * Math.sin(a), z]));
  }

  it('builds each body as a ring of quadrilaterals coloured by the packed colour times the body scale', () => {
    payload.types.forEach(({ body }, index) => {
      const shape = visuals[index].parts[0];
      expect(shape.positions).toEqual(bodyPositions(body.r0, body.r1, body.length, body.segments));
      expect([shape.texture, shape.perVertex, shape.mapping]).toEqual([null, null, null]);
    });
    expect(visuals[0].parts[0].faces).toEqual([[0, 2, 3, 1], [2, 4, 5, 3], [4, 0, 1, 5]]);
    expect(visuals[2].parts[0].faces).toEqual([[0, 2, 3, 1], [2, 4, 5, 3], [4, 6, 7, 5], [6, 0, 1, 7]]);
    const s = c.bodyColourScale;
    expect(visuals[0].parts[0].colour).toEqual([255 * s, 255 * s, 255 * s]);
    expect(visuals[1].parts[0].colour).toEqual([0x12 * s, 0x34 * s, 0x56 * s]);
  });

  it('builds parts − 1 fins of 9 vertices with the fin template and scale', () => {
    expect(visuals.map(visual => visual.parts.length)).toEqual([1, 3, 4]);
    const [fin] = visuals[1].parts.slice(1);
    expect(fin.positions).toEqual(positions(
      0, 0, 1.5 + -0.625,
      0.25, 0, -0.625, -0.25, 0, -0.625, 0, 0.25, -0.625, 0, -0.25, -0.625,
      0.75, 0, -0.625, -0.75, 0, -0.625, 0, 0.75, -0.625, 0, -0.75, -0.625,
    ));
    // A negative zero parameter gives -0 and its negation 0.
    expect(visuals[1].parts[2].positions.slice(3, 9)).toEqual(Float32Array.of(-0, 0, 2.5, 0, 0, 2.5));
    expect(fin.faces).toEqual([[0, 1, 3], [0, 3, 2], [5, 7, 6, 8]]);
    expect(visuals[1].parts[2].colour).toEqual([0x80 * c.finColourScale, 0x7f * c.finColourScale, 1 * c.finColourScale]);
    expect(fin.colour).toEqual([0, 0, 0]);
  });

  it('builds the textured element with the template its flag selects and the raw rotation parameters', () => {
    payload.types.forEach(({ element }, index) => {
      const shape = visuals[index].element;
      expect(shape.positions).toEqual(elementPositions(element));
      expect(shape.colour).toBeNull();
      expect(shape.texture).toBe(MISSILE_TEXTURE);
      expect(shape.mapping).toEqual({ rotationStep: -0, rotationScale: 4.75 });
    });
    // Flags 0 and -0 select the element template, 1.5 the flagged one.
    expect(visuals.map(visual => visual.element.faces)).toEqual([
      [[0, 1, 3, 2], [2, 3, 5, 4]], [[0, 2, 4], [1, 5, 3]], [[0, 1, 3, 2], [2, 3, 5, 4]],
    ]);
  });

  it('adds the extra element when the flag bits are not zero, including a negative zero flag', () => {
    expect(visuals[0].extra).toBeNull();
    for (const index of [1, 2]) {
      const extra = visuals[index].extra!;
      expect(extra.positions).toEqual(extraPositions(payload.types[index].element));
      expect(extra.faces).toEqual([[0, 1, 2]]);
      expect(extra.colour).toEqual(payload.extraColour);
      expect(extra.texture).toBeNull();
    }
  });
});

describe('debris expansion', () => {
  const payload = syntheticDebris();
  const shapes = expandDebris(payload);

  it('scales the untextured template by each untextured scale and the textured one by each textured scale', () => {
    const [plain, textured] = payload.templates;
    expect(shapes.untextured.map(shape => shape.positions)).toEqual(payload.untexturedScales.map(scale => positions(...[...plain.vertices].map(v => v * scale))));
    expect(shapes.textured.map(shape => shape.positions)).toEqual(payload.texturedScales.map(scale => positions(...[...textured.vertices].map(v => v * scale))));
    for (const shape of shapes.untextured) {
      expect([shape.faces, shape.colour, shape.texture, [...shape.perVertex!]]).toEqual([[[0, 1, 2], [2, 3, 4, 5]], payload.untexturedColour, null, [...plain.perVertex]]);
    }
    for (const shape of shapes.textured) {
      expect([shape.faces, shape.colour, shape.texture, [...shape.perVertex!]]).toEqual([[[0, 1, 2, 3, 4], [3, 4, 5]], payload.texturedColour, DEBRIS_TEXTURE, [...textured.perVertex]]);
    }
  });
});

describe('effect expansion', () => {
  it('is deterministic and returns frozen shapes the caller owns', () => {
    expect(expandMissiles(syntheticMissile())).toEqual(expandMissiles(syntheticMissile()));
    const payload = syntheticDebris();
    const first = expandDebris(payload);
    expect(Object.isFrozen(first.untextured[0])).toBe(true);
    first.untextured[0].positions.fill(0);
    first.untextured[0].perVertex!.fill(0);
    expect(expandDebris(payload)).toEqual(expandDebris(syntheticDebris()));
    expect(payload).toEqual(syntheticDebris());
  });

  it('computes the expanded size without expanding', () => {
    const projectile = syntheticProjectile();
    const missile = syntheticMissile();
    const debris = syntheticDebris();
    expect(effectExpansionSize(projectile)).toEqual({ vertices: 12, triangles: 7 });
    expect(effectExpansionSize(missile)).toEqual({ vertices: 93, triangles: 56 });
    expect(effectExpansionSize(debris)).toEqual({ vertices: 30, triangles: 17 });
    expect(effectExpansionSize(projectile)).toEqual(shapeSize(expandProjectiles(projectile)));
    expect(effectExpansionSize(missile)).toEqual(shapeSize(expandMissiles(missile).flatMap(v => [...v.parts, v.element, ...(v.extra ? [v.extra] : [])])));
    const { untextured, textured } = expandDebris(debris);
    expect(effectExpansionSize(debris)).toEqual(shapeSize([...untextured, ...textured]));
  });

  it.each<[string, () => unknown, string]>([
    ['an extra element whose e2 is 0', () => {
      const payload = syntheticMissile();
      const types = [{ ...payload.types[1], element: [1, 2, 0] as const }];
      return expandMissiles({ ...payload, types } as MissileVisuals);
    }, 'payload.types[0].extra.positions'],
    ['a width product beyond 32 bits', () => {
      const payload = syntheticProjectile();
      return expandProjectiles({ ...payload, records: [{ ...payload.records[0], width: 3e38 }] });
    }, 'payload.records[0].positions'],
    ['a colour product beyond 32 bits', () => {
      const payload = syntheticMissile();
      return expandMissiles({ ...payload, constants: { ...payload.constants, bodyColourScale: 1e300 } });
    }, 'payload.types[0].body.colour'],
  ])('rejects %s', (_, action, path) => expectContractError(action, 'invalid-effect-payload', path));
});
