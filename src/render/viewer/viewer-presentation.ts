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
 */
import {
  ClampToEdgeWrapping, DataTexture, LinearSRGBColorSpace, MeshBasicMaterial, NearestFilter, NoColorSpace, RepeatWrapping,
  RGBAFormat, UnsignedByteType, type Texture, type Wrapping,
} from 'three';
import type { ExpandedImage } from '../../content/graphics/expand-image.ts';
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

/** Uploads a picture's RGBA unchanged, clamped at its edges; the texture shares the picture's buffer. */
export function pictureTexture(picture: ExpandedImage): DataTexture {
  const { width, height, rgba } = picture;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || rgba.length !== width * height * 4) {
    throw new RangeError(`A picture needs width × height × 4 RGBA bytes, got ${String(width)} × ${String(height)} and ${String(rgba.length)}`);
  }
  return dataTexture(rgba, width, height, ClampToEdgeWrapping);
}

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
