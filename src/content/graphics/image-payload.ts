import { ASSET_ID_LIMITS, type AssetId } from '../asset-id.ts';
import {
  GRAPHICS_LIMITS, asciiBytes, asciiText, bytesAt, copyBytes, invalid, payloadView, readPaletteReference, requireBytes,
  requireInteger, requireLength,
} from './graphics-format.ts';

// Image payload schema 1, little-endian:
//   0    u16  width, 1–640
//   2    u16  height, 1–480
//   4    u8   alpha: 0 opaque, 1 mask
//   5    u8   display: 0 direct, 1 nearest
//   6    u8   palette Asset ID length P, 1–128
//   7    u8   nearest target Asset ID length T: 0 for direct, 1–128 for nearest
//   8    P    palette Asset ID, ASCII
//   8+P  T    nearest target palette Asset ID, ASCII
//   …    width × height palette indices, row-major, row 0 at the top
//   …    mask, only for alpha 1: ceil(width / 8) bytes per row, bit 7 leftmost, 1 = opaque

export type ImageDisplay = 'direct' | { readonly nearest: AssetId };

export interface ImagePayload {
  readonly kind: 'image';
  readonly width: number;
  readonly height: number;
  /** The palette Asset the indices address. */
  readonly palette: AssetId;
  /** `nearest` shows each palette entry as its nearest colour in the target palette, chosen when expanding. */
  readonly display: ImageDisplay;
  /** width × height indices, row-major with row 0 at the top; 0 at every transparent pixel. */
  readonly indices: Uint8Array;
  /** Null when fully opaque; otherwise 1 bit per pixel, bit 7 leftmost, rows padded with 0 bits, 1 = opaque. */
  readonly mask: Uint8Array | null;
}

const HEADER_BYTES = 8;

/** Mask bytes per row. */
export const maskStride = (width: number): number => (width + 7) >> 3;

/** Whether pixel (x, y) is opaque under `mask`; every pixel is opaque without one. */
export const isOpaque = (mask: Uint8Array | null, width: number, x: number, y: number): boolean =>
  mask === null || (mask[y * maskStride(width) + (x >> 3)] & (0x80 >> (x & 7))) !== 0;

/** The unused low bits of each row's last mask byte. */
const paddingBits = (width: number): number => 0xff >> (((width - 1) & 7) + 1);

/** Calls `visit` with the row-major index of each transparent pixel, skipping fully opaque mask bytes. */
function forEachTransparent(mask: Uint8Array, width: number, height: number, visit: (pixel: number) => void): void {
  const stride = maskStride(width);
  for (let y = 0; y < height; y++) {
    for (let column = 0; column < stride; column++) {
      const bits = mask[y * stride + column];
      if (bits === 0xff) continue;
      const left = column * 8;
      for (let x = left; x < Math.min(left + 8, width); x++) if (!(bits & (0x80 >> (x - left)))) visit(y * width + x);
    }
  }
}

/** Encodes an image into a new buffer that the result owns entirely, writing 0 for transparent indices and padding bits. */
export function encodeImagePayload(image: Omit<ImagePayload, 'kind'>, path = 'image'): Uint8Array<ArrayBuffer> {
  const width = requireInteger(image.width, 1, GRAPHICS_LIMITS.imageWidth, `${path}.width`);
  const height = requireInteger(image.height, 1, GRAPHICS_LIMITS.imageHeight, `${path}.height`);
  const palette = asciiBytes(readPaletteReference(image.palette, `${path}.palette`));
  const { display } = image;
  let target: Uint8Array | null = null;
  if (display !== 'direct') {
    if (typeof display !== 'object' || display === null) invalid(`${path}.display`, 'must be direct or a nearest target');
    target = asciiBytes(readPaletteReference(display.nearest, `${path}.display.nearest`));
  }
  const indices = requireBytes(image.indices, `${path}.indices`, width * height);
  const mask = image.mask === null ? null : requireBytes(image.mask, `${path}.mask`, maskStride(width) * height);
  const pixelsAt = HEADER_BYTES + palette.length + (target?.length ?? 0);
  const maskAt = pixelsAt + indices.length;
  const bytes = new Uint8Array(maskAt + (mask?.length ?? 0));
  const view = new DataView(bytes.buffer);
  view.setUint16(0, width, true);
  view.setUint16(2, height, true);
  bytes.set([mask ? 1 : 0, target ? 1 : 0, palette.length, target?.length ?? 0], 4);
  bytes.set(palette, HEADER_BYTES);
  if (target) bytes.set(target, HEADER_BYTES + palette.length);
  bytes.set(indices, pixelsAt);
  if (mask) {
    const outMask = bytes.subarray(maskAt);
    outMask.set(mask);
    const stride = maskStride(width);
    for (let end = stride - 1; end < outMask.length; end += stride) outMask[end] &= ~paddingBits(width);
    forEachTransparent(outMask, width, height, pixel => { bytes[pixelsAt + pixel] = 0; });
  }
  return bytes;
}

/** Strictly reads an image payload into frozen data whose indices and mask are the caller's own copies. */
export function readImagePayload(bytes: unknown, schemaVersion: unknown, path = 'payload'): ImagePayload {
  const view = payloadView(bytes, schemaVersion, path);
  if (view.byteLength < HEADER_BYTES) invalid(path, 'is truncated');
  const width = requireInteger(view.getUint16(0, true), 1, GRAPHICS_LIMITS.imageWidth, `${path}.width`);
  const height = requireInteger(view.getUint16(2, true), 1, GRAPHICS_LIMITS.imageHeight, `${path}.height`);
  const alpha = requireInteger(view.getUint8(4), 0, 1, `${path}.alpha`);
  const nearest = requireInteger(view.getUint8(5), 0, 1, `${path}.display`) === 1;
  const paletteLength = requireInteger(view.getUint8(6), 1, ASSET_ID_LIMITS.totalLength, `${path}.palette`);
  const targetLength = nearest
    ? requireInteger(view.getUint8(7), 1, ASSET_ID_LIMITS.totalLength, `${path}.display.nearest`)
    : requireInteger(view.getUint8(7), 0, 0, `${path}.display.nearest`);
  const pixelsAt = HEADER_BYTES + paletteLength + targetLength;
  const pixelCount = width * height;
  const maskLength = alpha === 1 ? maskStride(width) * height : 0;
  requireLength(view, pixelsAt + pixelCount + maskLength, path);
  const palette = readPaletteReference(asciiText(bytesAt(view, HEADER_BYTES, paletteLength)), `${path}.palette`);
  const display: ImageDisplay = nearest
    ? Object.freeze({ nearest: readPaletteReference(asciiText(bytesAt(view, HEADER_BYTES + paletteLength, targetLength)), `${path}.display.nearest`) })
    : 'direct';
  if (alpha === 1) {
    const [indices, mask] = [bytesAt(view, pixelsAt, pixelCount), bytesAt(view, pixelsAt + pixelCount, maskLength)];
    const stride = maskStride(width);
    for (let end = stride - 1; end < mask.length; end += stride) {
      if (mask[end] & paddingBits(width)) invalid(`${path}.mask`, 'must have 0 padding bits');
    }
    forEachTransparent(mask, width, height, pixel => {
      if (indices[pixel] !== 0) invalid(`${path}.indices`, 'must be 0 at transparent pixels');
    });
  }
  const indices = copyBytes(view, pixelsAt, pixelCount);
  const mask = alpha === 1 ? copyBytes(view, pixelsAt + pixelCount, maskLength) : null;
  return Object.freeze({ kind: 'image', width, height, palette, display, indices, mask });
}
