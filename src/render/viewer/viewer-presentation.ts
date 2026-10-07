/**
 * The resource viewer's presentation conventions (P2-11 S-09), kept here alone so that a correction from the P2-12
 * screenshot comparison changes only this module: no re-import and no payload schema change. The basis and confidence
 * of each choice are recorded in docs/engineering/source-structure.md ("资源查看渲染").
 *
 * 2D part:
 * - Colour: bytes are display values. Textures carry no colour space, so they are not decoded; the surface outputs
 *   linear sRGB, so shader output is not encoded; materials skip tone mapping. A drawn texel reads back as its bytes.
 * - Filtering: nearest for magnification and minification, no mipmaps.
 * - Orientation: row 0 of a picture, the top row of `expandImage` output, is at v = 0; textures are not flipped.
 * - Transparency: alpha is 0 or 255, so an alpha test discards transparent texels and nothing is blended.
 *
 * 3D part (models and effects):
 * - Camera: a perspective camera with a VIEWER_FOV vertical field of view, framing the bounding sphere; zoom magnifies
 *   without moving the camera.
 * - Axes: source coordinates are read as left-handed with y up, so positions and normals get z negated for three.js.
 *   Unconfirmed: a reversible initial choice.
 * - Winding: both sides are drawn and nothing is culled, so the unconfirmed winding changes nothing.
 * - Textures: as in 2D (display bytes, nearest, no mipmaps, v = 0 at row 0); model and effect textures repeat on both axes.
 * - Lighting: unlit by default, showing the part colour, or the texel for a textured part, as is. Optionally a neutral
 *   light, which is not the original's lighting (P3, U-028). Effects have no normals and stay unlit.
 * - Effect colour: the three floats are RGB, each clamped to [0, 1] and quantised to round(v × 255). A shape without a
 *   colour gets DIAGNOSTIC_GREY, which is not an original colour. Textured shapes show their texels unchanged.
 * - Effect seams: interpolate vertex UVs linearly, with no seam correction; mark faces spanning more than half of u.
 *   The original seam interpolation is unconfirmed (P2-11/16).
 */
import {
  AmbientLight, ClampToEdgeWrapping, Color, DataTexture, DirectionalLight, DoubleSide, LinearSRGBColorSpace, MeshBasicMaterial,
  MeshLambertMaterial, NearestFilter, NoColorSpace, RepeatWrapping, RGBAFormat, UnsignedByteType, type Light, type Material,
  type Texture, type Wrapping,
} from 'three';
import type { EffectColour } from '../../content/effects/effect-payload.ts';
import type { EffectShape } from '../../content/effects/expand-effects.ts';
import type { ExpandedImage } from '../../content/graphics/expand-image.ts';
import type { PartMaterial } from '../../content/models/model-parts.ts';
import type { RenderSurfaceOptions } from '../scene/render-surface.ts';

/** The viewer canvas: its accessible name, and output without a transfer encoding. */
export const VIEWER_SURFACE: RenderSurfaceOptions = Object.freeze({
  label: 'Resource viewer picture (diagnostic view of imported resources, not the original game screen)',
  outputColorSpace: LinearSRGBColorSpace,
});

/** Drawing-buffer pixels per checkerboard square. */
export const CHECKER_SQUARE = 8;
/** The two neutral greys of the checkerboard shown behind transparent pixels. */
export const CHECKER_GREYS = Object.freeze([102, 153] as const);

function dataTexture(rgba: Uint8Array<ArrayBuffer>, width: number, height: number, wrap: Wrapping): DataTexture {
  const texture = new DataTexture(rgba, width, height, RGBAFormat, UnsignedByteType);
  texture.colorSpace = NoColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.wrapS = wrap;
  texture.wrapT = wrap;
  texture.needsUpdate = true;
  return texture;
}

function pictureData(picture: ExpandedImage, wrap: Wrapping): DataTexture {
  const { width, height, rgba } = picture;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || rgba.length !== width * height * 4) {
    throw new RangeError(`A picture needs width × height × 4 RGBA bytes, got ${String(width)} × ${String(height)} and ${String(rgba.length)}`);
  }
  return dataTexture(rgba, width, height, wrap);
}

/** Uploads a picture's RGBA unchanged, clamped at its edges; the texture shares the picture's buffer. */
export const pictureTexture = (picture: ExpandedImage): DataTexture => pictureData(picture, ClampToEdgeWrapping);

/** Uploads a model texture's RGBA unchanged, repeating on both axes as the part materials address it. */
export const modelTexture = (picture: ExpandedImage): DataTexture => pictureData(picture, RepeatWrapping);

/** A 2 × 2 repeating checkerboard; the caller sets `repeat` so that one texel covers CHECKER_SQUARE buffer pixels. */
export function checkerTexture(): DataTexture {
  const [dark, light] = CHECKER_GREYS;
  const rgba = Uint8Array.from([dark, dark, dark, 255, light, light, light, 255, light, light, light, 255, dark, dark, dark, 255]);
  return dataTexture(rgba, 2, 2, RepeatWrapping);
}

/** An unlit material that shows its texels unchanged: white base colour, no tone mapping, no depth, binary alpha. */
export function pictureMaterial(map: Texture): MeshBasicMaterial {
  return new MeshBasicMaterial({ map, alphaTest: 0.5, toneMapped: false, depthTest: false, depthWrite: false });
}

/** Vertical field of view of the 3D camera, in degrees. */
export const VIEWER_FOV = 40;

/** The fixed neutral grey of an effect shape without a colour, on every channel. */
export const DIAGNOSTIC_GREY = 128;

type Rgb = readonly [number, number, number];

const WHITE: Rgb = Object.freeze([255, 255, 255] as const);

/** Display bytes a model part's material multiplies its texels by: white for a textured part, else its colour. */
export const partColour = (material: PartMaterial): Rgb => ('texture' in material ? WHITE : material.colour);

/** Display bytes of an effect colour: each channel clamped to [0, 1], then round(v × 255). */
export const effectColourBytes = (colour: EffectColour): Rgb =>
  Object.freeze(colour.map(value => Math.round(Math.min(1, Math.max(0, value)) * 255)) as [number, number, number]);

/** How the viewer shows one effect shape. */
export interface EffectAppearance {
  /** Display bytes multiplying the texture: white when textured, else the colour or diagnostic grey. */
  readonly rgb: Rgb;
  /** The expanded colour as given, for display as numbers; null when the builder sets none. */
  readonly colour: EffectColour | null;
  readonly textured: boolean;
  readonly seamUnconfirmed: boolean;
}

export const effectAppearance = ({ colour, texture, uvs, faces }: EffectShape): EffectAppearance => Object.freeze({
  rgb: texture !== null && uvs !== null ? WHITE
    : colour === null ? Object.freeze([DIAGNOSTIC_GREY, DIAGNOSTIC_GREY, DIAGNOSTIC_GREY] as const) : effectColourBytes(colour),
  colour,
  textured: texture !== null && uvs !== null,
  seamUnconfirmed: texture !== null && uvs !== null && faces.some(face => {
    const us = face.map(vertex => uvs[vertex * 2]);
    return Math.max(...us) - Math.min(...us) > 0.5;
  }),
});

/** x, y, z coordinates converted to three.js space: a copy with every z negated. */
export function toViewerSpace(coordinates: Float32Array): Float32Array {
  const converted = coordinates.slice();
  for (let z = 2; z < converted.length; z += 3) converted[z] = -converted[z];
  return converted;
}

/**
 * A two-sided material showing `rgb` display bytes, times the texels of `map` when given, with binary alpha and no tone
 * mapping: unlit, or lit by the neutral light.
 */
export function solidMaterial(rgb: Rgb, map: Texture | null, lit: boolean): Material {
  const color = new Color().setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, LinearSRGBColorSpace);
  const parameters = { color, map, side: DoubleSide, toneMapped: false, alphaTest: map === null ? 0 : 0.5 };
  return lit ? new MeshLambertMaterial(parameters) : new MeshBasicMaterial(parameters);
}

/**
 * The neutral light: white ambient fill and a white directional light from the upper right front, fixed in the world.
 * Lambert materials divide by π, so a face turned to the light shows exactly its colour.
 */
export function neutralLights(): readonly Light[] {
  const ambient = new AmbientLight(0xffffff, Math.PI * 0.4);
  const directional = new DirectionalLight(0xffffff, Math.PI * 0.6);
  directional.position.set(1, 2, 3);
  return Object.freeze([ambient, directional]);
}
