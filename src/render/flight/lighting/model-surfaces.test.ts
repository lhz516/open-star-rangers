import { describe, expect, it } from 'vitest';
import { ContentContractError } from '../../../content/contract-validation.ts';
import type { Matrix3 } from '../../../core/world/entity-table.ts';
import { lightScale, litValue, modelLight, shadeOf } from './lighting-math.ts';
import {
  bruteNearest, dataPalette, DATA, grey, lightingContent, lightingSettings, litModel, MODEL, TEXTURE, TEXTURE_COLOURS, TEXTURE_PALETTE,
  textureImage,
} from './lighting.test-support.ts';
import { LitPartBuilder, partQuality, prepareModelSurfaces, type LitPart } from './model-surfaces.ts';

const F = Math.fround;
const rows = (...values: number[]): Matrix3 => values as unknown as Matrix3;
const AMBIENT = 0.125;

/** Frames putting the vector towards the light on each model axis (as in lighting-math.test.ts). */
const FRAMES: Readonly<Record<string, Matrix3>> = {
  '+x': rows(-1, 0, 0, 0, -1, 0, 0, 0, 1), '-x': rows(1, 0, 0, 0, 1, 0, 0, 0, 1),
  '+y': rows(0, 1, 0, -1, 0, 0, 0, 0, 1), '-y': rows(0, -1, 0, 1, 0, 0, 0, 0, 1),
  '+z': rows(0, 0, 1, 0, 1, 0, -1, 0, 0), '-z': rows(0, 0, -1, 0, 1, 0, 1, 0, 0),
};

const expectedComponent = (c: number, shade: number, shades: number): number =>
  shades === 1 ? c : Math.min(255, Math.trunc(c * AMBIENT + c * ((shade / (shades - 1)) * F(1 - AMBIENT))));

/** The DATA entry of `colour` at `shade` of `shades`, independently of the module. */
const expectedIndex = (colour: readonly number[], shade: number, shades: number): number =>
  bruteNearest(dataPalette(), colour.map((c) => expectedComponent(c, shade, shades)));

const normalOf = (part: LitPart, corner: number) => ({ x: part.normals[corner * 3], y: part.normals[corner * 3 + 1], z: part.normals[corner * 3 + 2] });

/** The DATA entry the part shows at `corner` for source colour `colour` (a texel's index, 0 untextured) under L′. */
const shownIndex = (part: LitPart, frame: Matrix3, corner: number, colour: number): number => {
  const shade = shadeOf(litValue(modelLight(frame, lightScale(0.5)), normalOf(part, corner)));
  return part.ramps.ramps.indices[shade * part.ramps.ramps.colours + colour];
};

describe('part quality', () => {
  const model = litModel();

  it('is the flag byte of list-0 parts, 2 for list 1 and the first list-2 flag, capped by the device byte', () => {
    expect([0, 1, 2].map((part) => partQuality(model, 0, part, 3))).toEqual([2, 3, 1]);
    expect([0, 1, 2].map((part) => partQuality(model, 0, part, 2))).toEqual([2, 2, 1]);
    expect(partQuality(model, 1, 0, 3)).toBe(2);
    expect(partQuality(model, 1, 0, 1)).toBe(1);
    expect(partQuality(model, 2, 0, 3)).toBe(1);
    expect(partQuality(model, 0, 1, 0xc7)).toBe(3);
  });

  it('refuses wireframe and quality 4', () => {
    expect(() => partQuality(model, 0, 0, 0)).toThrow(ContentContractError);
    const four = { ...model, partLists: [[{ ...model.partLists[0][0], sourceFlags: 4 }], [], []] } as typeof model;
    expect(() => partQuality(four, 0, 0, 4)).toThrow(/render quality 4/);
    expect(partQuality(four, 0, 0, 3)).toBe(3);
  });
});

describe('model surfaces', () => {
  const surfaces = prepareModelSurfaces(lightingContent(), lightingSettings());
  const [flat, gouraud, unlit] = surfaces.models.get(MODEL)!;

  it('keeps the stored corners, UVs and winding, one vertex per corner', () => {
    expect(flat.corners).toBe(6);
    expect([...flat.positions]).toEqual([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 0, 0, 0]);
    expect([...flat.uvs]).toEqual([0, 0, 1, 0, 1, 1, 0, 1, 1, 1, 0, 0]);
    expect([flat.quality, gouraud.quality, unlit.quality]).toEqual([2, 3, 1]);
  });

  it('reads face normals for flat parts, slot normals for Gouraud parts and none for unlit parts', () => {
    expect([...flat.normals]).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1]);
    // Slots 0–3 read the four stored normals, normalised; slots 4 and 5 lie beyond them and light nothing.
    expect([...gouraud.normals]).toEqual([0, 0, 1, 0, 0, 1, 1, 0, 0, 0, F(0.6), F(0.8), 0, 0, 0, 0, 0, 0]);
    expect([...unlit.normals].every((value) => value === 0)).toBe(true);
    const capped = prepareModelSurfaces(lightingContent(), lightingSettings({ deviceByte: 2 })).models.get(MODEL)![1];
    expect([capped.quality, ...capped.normals]).toEqual([2, ...flat.normals]);
  });

  it('builds textured ramps from the texture palette and untextured ramps from the part colour', () => {
    expect(flat.texture).toMatchObject({ id: TEXTURE, width: 4, height: 2 });
    expect([...flat.texture!.indices]).toEqual([0, 1, 2, 3, 3, 2, 1, 0]);
    expect(flat.ramps.ramps).toMatchObject({ colours: 4, shades: 4 });
    expect(gouraud.texture).toBeNull();
    expect(gouraud.ramps.ramps).toMatchObject({ colours: 1, shades: 4 });
    expect(unlit.ramps.ramps).toMatchObject({ colours: 4, shades: 1 });
    expect(new Set([flat.ramps.key, gouraud.ramps.key, unlit.ramps.key]).size).toBe(3);
    TEXTURE_COLOURS.forEach((colour, entry) => expect(unlit.ramps.ramps.indices[entry]).toBe(expectedIndex(colour, 0, 1)));
  });

  it('shows the independently expected DATA entry for every light direction, part and texel', () => {
    // Expected shades: flat triangle 0 faces +z and triangle 1 −z; Gouraud corners per stored slot normal.
    const gouraudLit: Readonly<Record<string, readonly number[]>> = {
      '+x': [0, 0, 384, 0, 0, 0], '-x': [0, 0, 0, 0, 0, 0], '+y': [0, 0, 0, 230, 0, 0], '-y': [0, 0, 0, 0, 0, 0],
      '+z': [384, 384, 0, 307, 0, 0], '-z': [0, 0, 0, 0, 0, 0],
    };
    for (const [axis, frame] of Object.entries(FRAMES)) {
      const flatShades = [axis === '+z' ? 2 : 0, axis === '-z' ? 2 : 0];
      for (let corner = 0; corner < 6; corner++) {
        const shade = flatShades[corner < 3 ? 0 : 1];
        TEXTURE_COLOURS.forEach((colour, entry) => {
          expect(shownIndex(flat, frame, corner, entry), `${axis} flat ${corner} ${entry}`).toBe(expectedIndex(colour, shade, 4));
          expect(shownIndex(unlit, frame, corner, entry), `${axis} unlit ${corner} ${entry}`).toBe(expectedIndex(colour, 0, 1));
        });
        const value = gouraudLit[axis][corner];
        expect(litValue(modelLight(frame, 1.5), normalOf(gouraud, corner)), `${axis} gouraud ${corner}`).toBe(value);
        expect(shownIndex(gouraud, frame, corner, 0)).toBe(expectedIndex([103, 103, 103], Math.floor((value + 128) / 256), 4));
      }
    }
  });

  it('plans one geometry per part and one texture per texture and ramp set', () => {
    expect(surfaces.plan).toEqual({ vertices: 18, indices: 0, renderTargets: 0, texels: 8 + 16 + 4 + 4 });
    expect(surfaces.lighting).toEqual({ directional: 0.5, ambientByte: 32, ambient: AMBIENT, scale: 1.5 });
  });

  it('builds list-1 and list-2 parts for the effects that draw them', () => {
    const builder = new LitPartBuilder(lightingContent(), lightingSettings());
    const fragment = builder.part(litModel(), 1, 0, partQuality(litModel(), 1, 0, 3), 'fragment');
    expect(fragment.quality).toBe(2);
    expect(fragment.ramps.key).toBe('ramps:colour:10,20,30:4');
    const hull = builder.part(litModel(), 2, 0, partQuality(litModel(), 2, 0, 3), 'hull');
    expect([hull.quality, hull.ramps.ramps.shades]).toEqual([1, 1]);
    expect(builder.ramps.map(({ key }) => key)).toEqual(['ramps:colour:10,20,30:4', `ramps:${TEXTURE}:1`]);
  });

  it('refuses textures and palettes it cannot use, before the run', () => {
    const palettes = lightingContent().palettes;
    const cases = [
      lightingContent({ images: new Map() }),
      lightingContent({ palettes: new Map([[DATA, dataPalette()]]) }),
      lightingContent({ palettes: new Map([[TEXTURE_PALETTE, palettes.get(TEXTURE_PALETTE)!]]) }),
      lightingContent({ images: new Map([[TEXTURE, textureImage({ display: 'direct' })]]) }),
      lightingContent({ images: new Map([[TEXTURE, textureImage({ display: { nearest: TEXTURE_PALETTE } })]]) }),
      lightingContent({ images: new Map([[TEXTURE, textureImage({ mask: new Uint8Array(2).fill(0xff) })]]) }),
      lightingContent({ images: new Map([[TEXTURE, textureImage({ indices: Uint8Array.of(0, 1, 2, 4, 0, 0, 0, 0) })]]) }),
    ];
    for (const content of cases) expect(() => prepareModelSurfaces(content, lightingSettings())).toThrow(ContentContractError);
    expect(() => prepareModelSurfaces(lightingContent(), lightingSettings({ lightType3Colour: grey(0) }))).toThrow(ContentContractError);
  });
});
