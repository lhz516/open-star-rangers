import { describe, expect, it } from 'vitest';
import type { AssetId } from '../../../content/asset-id.ts';
import { ContentContractError } from '../../../content/contract-validation.ts';
import { DEBRIS_TEXTURE, MISSILE_TEXTURE } from '../../../content/effects/effects.test-support.ts';
import { expandDebris, expandMissiles, expandProjectiles, type EffectShape } from '../../../content/effects/expand-effects.ts';
import type { Vec3 } from '../../../core/contracts/domain-events.ts';
import type { EntityPresentation } from '../../../core/world/entity-table.ts';
import { faceNormal } from '../lighting/lighting-math.ts';
import { bruteNearest, dataPalette, lightingSettings } from '../lighting/lighting.test-support.ts';
import { litPartsPlan, type LitPart } from '../lighting/model-surfaces.ts';
import { seamU } from '../shimmer/shimmer-wraps.ts';
import {
  colourByte, debrisShapeLook, entityLook, missileLook, partLook, podLook, prepareObjectSurfaces, presentationFragmentLook, projectileLook,
} from './object-surfaces.ts';
import { CRAFT, DEBRIS_MODEL, MODEL, objectContent, PROJECTILE_VISUALS } from './objects.test-support.ts';

const content = objectContent();
const surfaces = prepareObjectSurfaces(content, lightingSettings());
const look = (id: AssetId): readonly LitPart[] => surfaces.looks.models.get(id)!;

const at = (positions: Float32Array, vertex: number): Vec3 => ({ x: positions[vertex * 3], y: positions[vertex * 3 + 1], z: positions[vertex * 3 + 2] });

/** The fan corners of `shape`'s faces, each face's triangles (c₀, c_{k−1}, c_k). */
const fanVertices = (shape: EffectShape): number[] => shape.faces.flatMap((face) => face.slice(2).flatMap((_, k) => [face[0], face[k + 1], face[k + 2]]));

function expectGeometry(part: LitPart, shape: EffectShape): void {
  const vertices = fanVertices(shape);
  expect(part.corners).toBe(vertices.length);
  expect([...part.positions]).toEqual(vertices.flatMap((vertex) => [...shape.positions.subarray(vertex * 3, vertex * 3 + 3)]));
}

/** Every corner of a face's triangles takes normalise(normalise(c_{n−2} − c₀) × normalise(c_{n−1} − c₀)). */
function expectFaceNormals(part: LitPart, shape: EffectShape): void {
  const expected = shape.faces.flatMap((face) => {
    const n = face.length;
    const { x, y, z } = faceNormal(at(shape.positions, face[0]), at(shape.positions, face[n - 2]), at(shape.positions, face[n - 1]));
    return Array.from({ length: (n - 2) * 3 }, () => [x, y, z]).flat();
  });
  expect([...part.normals]).toEqual(expected);
}

/** The ramp's DATA entry for a colour byte triple at one shade, unlit. */
const unlitEntry = (part: LitPart): number => part.ramps.ramps.indices[0];

describe('effect colours', () => {
  it('clamps each component to [0, 1], multiplies by 255 and rounds half to even', () => {
    expect([0.125, 0.875, 6, -0, -0.375, 2, 0.5, Math.fround(1.4e-45)].map(colourByte)).toEqual([32, 223, 255, 0, 0, 255, 128, 0]);
    expect(Object.is(colourByte(-0), 0)).toBe(true);
  });
});

describe('projectile looks', () => {
  const shapes = expandProjectiles(content.projectiles.visuals);

  it('draw each record’s procedural geometry unlit with its converted colour', () => {
    shapes.forEach((shape, record) => {
      const [part, ...rest] = look(projectileLook(record));
      expect(rest).toEqual([]);
      expectGeometry(part, shape);
      expect(part.quality).toBe(1);
      expect(part.texture).toBeNull();
      expect(part.normals.every((value) => value === 0)).toBe(true);
      expect(part.ramps.ramps.shades).toBe(1);
    });
    const colours = [[32, 223, 255], [0, 255, 0], [255, 0, 0]];
    expect(shapes.map((_, record) => unlitEntry(look(projectileLook(record))[0]))).toEqual(colours.map((colour) => bruteNearest(dataPalette(), colour)));
  });

  it('fans a quadrilateral face from its first corner', () => {
    // Record 0's template: the triangle (0, 1, 2) and the quadrilateral (0, 2, 3, 1).
    expect(fanVertices(shapes[0])).toEqual([0, 1, 2, 0, 2, 3, 0, 3, 1]);
  });
});

describe('missile looks', () => {
  const missiles = expandMissiles(content.missiles);

  it('attach the body and fins lit, the extra element and the textured element unlit, in that order', () => {
    missiles.forEach(({ parts, element, extra }, type) => {
      const drawn = look(missileLook(type));
      const shapes = [...parts, ...(extra ? [extra] : []), element];
      expect(drawn).toHaveLength(shapes.length);
      shapes.forEach((shape, index) => expectGeometry(drawn[index], shape));
      expect(drawn.map(({ quality }) => quality)).toEqual([...parts.map(() => 2), ...(extra ? [1] : []), 1]);
      parts.forEach((shape, index) => expectFaceNormals(drawn[index], shape));
      expect(drawn.at(-1)!.texture?.id).toBe(MISSILE_TEXTURE);
      expect(drawn.at(-1)!.ramps.key).toBe(`ramps:${MISSILE_TEXTURE}:1`);
    });
    // Types 1 (flag 1.5) and 2 (flag −0) have the extra element; type 0 does not.
    expect([0, 1, 2].map((type) => look(missileLook(type)).length)).toEqual([2, 5, 6]);
  });

  it('give the body and fins their packed colour’s ramp at four shades', () => {
    const [body, fin] = look(missileLook(1));
    // 0x123456 × 1/16 and 0x807f01 × 1/4, clamped.
    expect(body.ramps.key).toBe('ramps:colour:255,255,255:4');
    expect(fin.ramps.key).toBe('ramps:colour:0,0,0:4');
    expect(look(missileLook(1))[2].ramps.key).toBe('ramps:colour:255,255,64:4');
  });

  it('apply the seam rule to each element triangle’s u, and keep v', () => {
    const element = missiles[0].element;
    const part = look(missileLook(0)).at(-1)!;
    const vertices = fanVertices(element);
    let moved = 0;
    for (let first = 0; first < vertices.length; first += 3) {
      const raw = [0, 1, 2].map((corner) => element.uvs![vertices[first + corner] * 2]);
      const expected = seamU(raw[0], raw[1], raw[2]);
      expect([0, 1, 2].map((corner) => part.uvs[(first + corner) * 2])).toEqual(expected.map(Math.fround));
      expect([0, 1, 2].map((corner) => part.uvs[(first + corner) * 2 + 1])).toEqual([0, 1, 2].map((corner) => element.uvs![vertices[first + corner] * 2 + 1]));
      if (expected.some((u, corner) => u !== raw[corner])) moved++;
    }
    expect(moved).toBeGreaterThan(0);
  });
});

describe('fragment looks', () => {
  const debris = expandDebris(content.debris);

  it('draw discriminator 1’s textured debris shapes flat lit with the face normal of the last fan triangle', () => {
    debris.textured.forEach((shape, index) => {
      const [part] = look(debrisShapeLook(index));
      expectGeometry(part, shape);
      expectFaceNormals(part, shape);
      expect(part.quality).toBe(2);
      expect(part.ramps.key).toBe(`ramps:${DEBRIS_TEXTURE}:4`);
    });
    // The pentagon is not planar: its first triangle's own normal is not the face's.
    const pentagon = debris.textured[0];
    const own = faceNormal(at(pentagon.positions, 0), at(pentagon.positions, 1), at(pentagon.positions, 2));
    expect([...look(debrisShapeLook(0))[0].normals.subarray(0, 3)]).not.toEqual([own.x, own.y, own.z]);
  });

  it('draw list-1 parts at quality 2 whatever their flags, and pods’ parts 0–2', () => {
    const craft = content.models.get(CRAFT)!;
    craft.partLists[1].forEach((source, index) => {
      const [part] = look(partLook(CRAFT, index));
      expect(part.quality).toBe(2);
      expect(part.texture?.id ?? null).toBe(source.texture);
    });
    expect(look(podLook(CRAFT))).toEqual([0, 1, 2].map((index) => look(partLook(CRAFT, index))[0]));
    expect(look(partLook(MODEL, 0))[0].quality).toBe(2);
    expect(surfaces.looks.models.has(podLook(MODEL))).toBe(false);
    expect(surfaces.listOneParts).toEqual(new Map([[MODEL, 1], [CRAFT, 4], [DEBRIS_MODEL, 3]]));
  });

  it('plan every look’s corners, ramps and textures', () => {
    expect(surfaces.looks.plan).toEqual(litPartsPlan([...surfaces.looks.models.values()].flat()));
    expect(surfaces.looks.plan.vertices).toBe([...surfaces.looks.models.values()].flat().reduce((sum, { corners }) => sum + corners, 0));
  });
});

describe('device quality', () => {
  it('caps every look at RENS +0x18', () => {
    const unlit = prepareObjectSurfaces(content, lightingSettings({ deviceByte: 1 }));
    for (const part of [...unlit.looks.models.values()].flat()) {
      expect(part.quality).toBe(1);
      expect(part.normals.every((value) => value === 0)).toBe(true);
    }
  });

  it('refuses a device quality of 0', () => {
    expect(() => prepareObjectSurfaces(content, lightingSettings({ deviceByte: 0 }))).toThrow(expect.objectContaining({ code: 'invalid-record' }));
  });
});

describe('content checks', () => {
  it('refuse a debris model the content lacks or without list-1 parts', () => {
    expect(() => prepareObjectSurfaces(objectContent({ debrisModel: 'model/absent' as AssetId }), lightingSettings()))
      .toThrow(expect.objectContaining({ code: 'binding-mismatch' }));
    const models = new Map(content.models);
    models.set(DEBRIS_MODEL, { ...models.get(DEBRIS_MODEL)!, partLists: [[], [], []] });
    expect(() => prepareObjectSurfaces(objectContent({ models }), lightingSettings())).toThrow(expect.objectContaining({ path: 'objects.debrisModel' }));
  });

  it('refuse a pod model of kind 1 or 2 the content lacks or with fewer than three list-1 parts, which its pod draws', () => {
    const refused = (id: AssetId) => expect.objectContaining({ code: 'binding-mismatch', path: `objects.podModels[${id}]` });
    expect(() => prepareObjectSurfaces(objectContent({ podModels: new Set([CRAFT, MODEL]) }), lightingSettings())).toThrow(refused(MODEL));
    expect(() => prepareObjectSurfaces(objectContent({ podModels: new Set(['model/absent' as AssetId]) }), lightingSettings())).toThrow(refused('model/absent' as AssetId));
    // Three parts are enough, and a model that is no pod's may have fewer.
    expect(prepareObjectSurfaces(objectContent({ podModels: new Set([CRAFT, DEBRIS_MODEL]) }), lightingSettings()).looks.models.has(podLook(DEBRIS_MODEL))).toBe(true);
    expect(() => prepareObjectSurfaces(objectContent({ podModels: new Set() }), lightingSettings())).not.toThrow();
  });

  it('refuse an effect texture the content lacks', () => {
    const images = new Map(content.images);
    images.delete(MISSILE_TEXTURE);
    expect(() => prepareObjectSurfaces(objectContent({ images }), lightingSettings())).toThrow(ContentContractError);
  });
});

describe('looks of presentations', () => {
  const lookOf = (presentation: EntityPresentation) => entityLook(surfaces, presentation);
  const unbound = expect.objectContaining({ code: 'binding-mismatch' });

  it('name the projectile record, missile type and fragment part', () => {
    expect(lookOf({ type: 'projectile', visuals: PROJECTILE_VISUALS, record: 2 })).toBe(projectileLook(2));
    expect(lookOf({ type: 'missile', missile: 2 })).toBe(missileLook(2));
    expect(lookOf({ type: 'fragment', model: CRAFT, part: 3, display: 'part' })).toBe(partLook(CRAFT, 3));
    expect(lookOf({ type: 'fragment', model: CRAFT, part: 0, display: 'parts-0-2' })).toBe(podLook(CRAFT));
    for (const other of [{ type: 'model', model: MODEL }, { type: 'explosion', variant: 'large' }, { type: 'map-marker' }] as const) {
      expect(lookOf(other)).toBeNull();
    }
  });

  it('refuse records, types and parts beyond the content, without clamping', () => {
    expect(() => lookOf({ type: 'projectile', visuals: PROJECTILE_VISUALS, record: 3 })).toThrow(unbound);
    expect(() => lookOf({ type: 'projectile', visuals: 'data/other' as AssetId, record: 0 })).toThrow(unbound);
    expect(() => lookOf({ type: 'missile', missile: 3 })).toThrow(unbound);
    expect(() => lookOf({ type: 'missile', missile: -1 })).toThrow(unbound);
    expect(() => lookOf({ type: 'fragment', model: CRAFT, part: 4, display: 'part' })).toThrow(unbound);
    expect(() => lookOf({ type: 'fragment', model: MODEL, part: 0, display: 'parts-0-2' })).toThrow(unbound);
    for (const part of [1, -1, 0.5]) expect(() => lookOf({ type: 'fragment', model: CRAFT, part, display: 'parts-0-2' })).toThrow(unbound);
    expect(() => lookOf({ type: 'fragment', model: 'model/absent' as AssetId, part: 0, display: 'part' })).toThrow(unbound);
  });

  it('give discriminator 1 its shape and discriminator 2 MODL 10383’s part i mod the count', () => {
    expect(presentationFragmentLook(surfaces, { discriminator: 1, shape: 1, part: null })).toBe(debrisShapeLook(1));
    expect([0, 2, 3, 4].map((part) => presentationFragmentLook(surfaces, { discriminator: 2, shape: null, part })))
      .toEqual([0, 2, 0, 1].map((part) => partLook(DEBRIS_MODEL, part)));
    expect(() => presentationFragmentLook(surfaces, { discriminator: 1, shape: null, part: 0 })).toThrow(unbound);
    expect(() => presentationFragmentLook(surfaces, { discriminator: 2, shape: null, part: null })).toThrow(unbound);
  });
});
