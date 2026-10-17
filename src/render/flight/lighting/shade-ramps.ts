/**
 * The scene's light levels and colour ramps (docs/original/formats/executable.md, LS2–LS4; textures.md §3;
 * docs/plan/p3/12/spec.md, 模型、光照与第 2 列表). Every ramp is built from source colours, never from the quantised
 * RGBA of `expandImage`: a part's colour, or each entry of a texture's own palette. Ramp entry i of colour c for N
 * shades is, per component, min(255, chop(c·a + c·((i/(N − 1))·F(1 − a)))) (the game's faces have no material, so no
 * specular or emissive term); one shade (unlit) is c itself. Each entry is then mapped to DATA by `nearestColourMap`,
 * the project's only nearest-colour rule, and shown as that DATA colour: no tone mapping or colour-space conversion.
 *
 * The lit primitives take the single-light path `0x6e3b8`, which the original selects only for one directional light of
 * intensity in (0, 1]; other settings would take the general path (`0x6e1a0`), which was not researched, so they are
 * refused, as is an ambient level the original would not send as one byte. Ramp-table sharing when the original's
 * 4,096 slots run out is not modelled (Likely not reached, LS4).
 */
import { fail } from '../../../content/contract-validation.ts';
import type { SceneSettings } from '../../../content/flight/flight-data-content.ts';
import { nearestColourMap } from '../../../content/graphics/expand-image.ts';
import type { PalettePayload } from '../../../content/graphics/palette-payload.ts';
import { ambientByte, lightIntensity, lightScale } from './lighting-math.ts';

const F = Math.fround;

/** The lighting of the run's scene, from `data/scene-settings`. */
export interface SceneLighting {
  /** I_d, the directional light's intensity. */
  readonly directional: number;
  /** The ambient byte; the ramps use `ambient` = byte / 256. */
  readonly ambientByte: number;
  readonly ambient: number;
  /** k = F(3·I_d), the lit primitives' light scale. */
  readonly scale: number;
}

export function sceneLighting({ lightType3Colour, lightType0Colour }: SceneSettings, path = 'lighting.settings'): SceneLighting {
  const directional = lightIntensity(lightType3Colour);
  if (!(directional > 0 && directional <= 1)) {
    fail('invalid-record', `${path}.lightType3Colour`, 'must give a directional intensity in (0, 1], the only lighting path researched');
  }
  const byte = ambientByte(lightIntensity(lightType0Colour));
  if (!(byte >= 0)) fail('invalid-record', `${path}.lightType0Colour`, 'must give a non-negative ambient level');
  return Object.freeze({ directional, ambientByte: byte, ambient: byte / 256, scale: lightScale(directional) });
}

/** Component `c` of ramp entry `shade` of `shades` at ambient level `ambient`. */
export function rampComponent(c: number, shade: number, shades: number, ambient: number): number {
  if (shades === 1) return c;
  return Math.min(255, Math.trunc(c * ambient + c * ((shade / (shades - 1)) * F(1 - ambient))));
}

/** The DATA entries of the ramps of some source colours. */
export interface ShadeRamps {
  readonly shades: number;
  readonly colours: number;
  /** The DATA index of source colour e at shade s, at s × colours + e. */
  readonly indices: Uint8Array;
  /** Those DATA entries' colours as opaque RGBA in the same layout: a texture of `colours` × `shades` texels. */
  readonly rgba: Uint8Array<ArrayBuffer>;
}

/** The ramps of the source colours `source` (R, G, B triples, at most 256) mapped to `data`. */
export function shadeRamps(source: Uint8Array, shades: number, ambient: number, data: PalettePayload): ShadeRamps {
  const colours = source.length / 3;
  const indices = new Uint8Array(colours * shades);
  const rgba = new Uint8Array(colours * shades * 4);
  for (let shade = 0; shade < shades; shade++) {
    const entries = source.map((component) => rampComponent(component, shade, shades, ambient));
    nearestColourMap({ kind: 'palette', entries }, data).forEach((index, colour) => {
      const at = shade * colours + colour;
      indices[at] = index;
      rgba.set(data.entries.subarray(index * 3, index * 3 + 3), at * 4);
      rgba[at * 4 + 3] = 255;
    });
  }
  return Object.freeze({ shades, colours, indices, rgba });
}
