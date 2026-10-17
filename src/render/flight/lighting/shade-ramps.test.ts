import { describe, expect, it } from 'vitest';
import { ContentContractError } from '../../../content/contract-validation.ts';
import type { PalettePayload } from '../../../content/graphics/palette-payload.ts';
import { bruteNearest, dataPalette, grey, lightingSettings, TEXTURE_COLOURS, vga } from './lighting.test-support.ts';
import { rampComponent, sceneLighting, shadeRamps } from './shade-ramps.ts';

const F = Math.fround;

/** Ramp entry `shade` of `shades` for colour c, written out from LS4 for the game's keys (s = c, e = 0, p = 0). */
const expectedComponent = (c: number, shade: number, shades: number, a: number): number =>
  shades === 1 ? c : Math.min(255, Math.trunc((c * a + 0) + c * ((shade / (shades - 1)) * F(1 - a))));

describe('scene lighting', () => {
  it('derives the directional intensity, the ambient byte and the light scale', () => {
    expect(sceneLighting(lightingSettings())).toEqual({ directional: 0.5, ambientByte: 32, ambient: 0.125, scale: 1.5 });
    expect(sceneLighting(lightingSettings({ lightType3Colour: grey(1), lightType0Colour: grey(2) }))).toEqual({ directional: 1, ambientByte: 255, ambient: 255 / 256, scale: 3 });
  });

  it('refuses lights outside the single-light path and a negative ambient level', () => {
    for (const overrides of [{ lightType3Colour: grey(0) }, { lightType3Colour: grey(1.001) }, { lightType3Colour: [0.3, 0, -1.5] }, { lightType0Colour: grey(-0.01) }]) {
      expect(() => sceneLighting(lightingSettings(overrides))).toThrow(ContentContractError);
    }
  });
});

describe('shade ramps', () => {
  it('builds ramp entries from the source colour, chopped', () => {
    expect([0, 1, 2, 3].map((shade) => rampComponent(255, shade, 4, 0.25))).toEqual([63, 127, 191, 255]);
    // True value 15; the double arithmetic gives 14.999… and the chop keeps 14.
    expect(rampComponent(36, 1, 4, 0.125)).toBe(14);
    expect(rampComponent(36, 1, 4, 0.125)).toBe(expectedComponent(36, 1, 4, 0.125));
    expect(rampComponent(77, 0, 1, 0.125)).toBe(77);
    for (let c = 0; c < 256; c += 17) for (let shade = 0; shade < 4; shade++) expect(rampComponent(c, shade, 4, 0.125)).toBe(expectedComponent(c, shade, 4, 0.125));
  });

  it('maps every shade of every source colour to its nearest DATA entry and colour', () => {
    const data = dataPalette();
    const source = Uint8Array.from(TEXTURE_COLOURS.flat());
    for (const shades of [1, 4]) {
      const ramps = shadeRamps(source, shades, 0.125, data);
      expect(ramps).toMatchObject({ shades, colours: 4 });
      for (let shade = 0; shade < shades; shade++) {
        TEXTURE_COLOURS.forEach((colour, entry) => {
          const index = bruteNearest(data, colour.map((c) => expectedComponent(c, shade, shades, 0.125)));
          const at = shade * 4 + entry;
          expect(ramps.indices[at]).toBe(index);
          expect([...ramps.rgba.subarray(at * 4, at * 4 + 4)]).toEqual([...data.entries.subarray(index * 3, index * 3 + 3), 255]);
        });
      }
    }
  });

  it('shades the source colour before choosing its DATA entry', () => {
    // nearest(shade0(103)) = nearest(25) is 24 (entry 2); shade0(nearest(103)) = shade0(104) = 26 ties 28 (entry 1) and 24.
    const data: PalettePayload = { kind: 'palette', entries: Uint8Array.from([0, 7, 6, 26, 25].flatMap((value) => [vga(value), vga(value), vga(value)])) };
    const ramps = shadeRamps(Uint8Array.of(103, 103, 103), 4, 0.25, data);
    expect(ramps.indices[0]).toBe(2);
    expect(bruteNearest(data, [103, 103, 103])).toBe(3);
    expect(bruteNearest(data, grey(rampComponent(104, 0, 4, 0.25)))).toBe(1);
    expect(ramps.indices[3]).toBe(3);
  });
});
