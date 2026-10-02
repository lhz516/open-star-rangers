/**
 * Parsers for IMFAT entry payloads: images, meshes (MESH), and models (MODL).
 * Formats: docs/original/formats/textures.md and docs/original/formats/mesh.md.
 * All offsets inside a block are relative to the block start (see imfat.ts).
 */

export class PayloadError extends Error {}

function view(block: Uint8Array): DataView {
  return new DataView(block.buffer, block.byteOffset, block.byteLength);
}

function need(block: Uint8Array, end: number, what: string): void {
  if (end > block.byteLength) throw new PayloadError(`${what} extends past the block`);
}

/** Size of the image record shared by TEX, BITM, MFDD, CCKD, ANIM, and some TABL entries. */
export const IMAGE_RECORD_SIZE = 36;

export const ImageEncoding = {
  Raw: 0,
  /** Animation frames; not decoded yet. */
  Animation: 1,
  /** Per-row runs of transparent and opaque pixels. */
  SpriteRle: 2,
} as const;

export interface IndexedImage {
  width: number;
  height: number;
  encoding: number;
  /** One palette index per pixel, row by row. */
  pixels: Uint8Array;
  /** 1 where a pixel is opaque; null when every pixel is opaque (raw images). */
  opaque: Uint8Array | null;
  /**
   * Embedded palette as 8-bit RGB triplets (converted from the stored BGR order), or null if
   * the image has none. In game these colours are mapped to the nearest DATA palette entries.
   */
  palette: Uint8Array | null;
}

/**
 * Decodes the sprite run-length encoding: each row alternates u16 transparent-run and
 * u16 opaque-run lengths, starting with a transparent run; each opaque run is followed by
 * its pixels. A row ends when the runs add up to the width.
 */
export function decodeSpriteRle(data: Uint8Array, width: number, height: number): { pixels: Uint8Array; opaque: Uint8Array } {
  const v = view(data);
  const pixels = new Uint8Array(width * height);
  const opaque = new Uint8Array(width * height);
  let o = 0;
  for (let y = 0; y < height; y++) {
    let x = 0;
    let transparent = true;
    while (x < width) {
      if (o + 2 > data.byteLength) throw new PayloadError(`sprite row ${y} is truncated`);
      const run = v.getUint16(o, true);
      o += 2;
      if (x + run > width) throw new PayloadError(`sprite row ${y} overflows the width`);
      if (!transparent) {
        if (o + run > data.byteLength) throw new PayloadError(`sprite row ${y} is truncated`);
        const at = y * width + x;
        pixels.set(data.subarray(o, o + run), at);
        opaque.fill(1, at, at + run);
        o += run;
      }
      x += run;
      transparent = !transparent;
    }
  }
  if (o !== data.byteLength) throw new PayloadError('trailing bytes after sprite data');
  return { pixels, opaque };
}

/** Parses the 36-byte image record at `offset` (0 for TEX and BITM entries). */
export function parseImage(block: Uint8Array, offset = 0): IndexedImage {
  const v = view(block);
  need(block, offset + IMAGE_RECORD_SIZE, 'image record');
  if (v.getUint32(offset, true) !== 8) throw new PayloadError('unsupported bits per pixel');
  const encoding = v.getUint32(offset + 4, true);
  const width = v.getUint32(offset + 8, true);
  const height = v.getUint32(offset + 12, true);
  const paletteOffset = v.getUint32(offset + 20, true);
  const paletteCount = v.getUint32(offset + 24, true);
  const pixelOffset = v.getUint32(offset + 28, true);
  const dataSize = v.getUint32(offset + 32, true);
  need(block, pixelOffset + dataSize, 'pixel data');
  const data = block.subarray(pixelOffset, pixelOffset + dataSize);
  let pixels: Uint8Array;
  let opaque: Uint8Array | null = null;
  if (encoding === ImageEncoding.Raw) {
    if (dataSize !== width * height) throw new PayloadError('raw image size mismatch');
    pixels = data;
  } else if (encoding === ImageEncoding.SpriteRle) {
    ({ pixels, opaque } = decodeSpriteRle(data, width, height));
  } else {
    throw new PayloadError(`unsupported image encoding ${encoding}`);
  }
  let palette: Uint8Array | null = null;
  if (paletteCount > 0) {
    need(block, paletteOffset + paletteCount * 3, 'palette');
    palette = new Uint8Array(paletteCount * 3);
    for (let i = 0; i < paletteCount * 3; i += 3) {
      palette[i] = block[paletteOffset + i + 2];
      palette[i + 1] = block[paletteOffset + i + 1];
      palette[i + 2] = block[paletteOffset + i];
    }
  }
  return { width, height, encoding, pixels, opaque, palette };
}

/**
 * DATA entry: 256 VGA colours with 6-bit components, expanded to 8 bits by bit replication
 * ((c << 2) | (c >> 4)), which reproduces the colours in DOSBox-X screenshots exactly.
 */
export function parseVgaPalette(block: Uint8Array): Uint8Array {
  need(block, 768, 'palette');
  return Uint8Array.from(block.subarray(0, 768), (c) => ((c & 63) << 2) | ((c & 63) >> 4));
}

/**
 * MFDD entry: two lists of image records, {u32 offset, u32 count} at 0x00 and 0x08.
 * For the ship status display, list 0 holds full backgrounds and list 1 overlays (Likely).
 */
export function parseMfdImages(block: Uint8Array): [IndexedImage[], IndexedImage[]] {
  const v = view(block);
  need(block, 16, 'MFD header');
  const lists: IndexedImage[][] = [];
  for (let l = 0; l < 2; l++) {
    const offset = v.getUint32(l * 8, true);
    const count = v.getUint32(l * 8 + 4, true);
    const images: IndexedImage[] = [];
    for (let i = 0; i < count; i++) images.push(parseImage(block, offset + i * IMAGE_RECORD_SIZE));
    lists.push(images);
  }
  return lists as [IndexedImage[], IndexedImage[]];
}

export interface BitmapFont {
  /** Glyph cell width in pixels (at most 8). */
  width: number;
  /** Glyph height in pixels; one byte per row. */
  height: number;
  /** 256 glyphs × `height` bytes; bit 7 of each byte is the leftmost pixel. */
  glyphs: Uint8Array;
}

/**
 * 1-bit bitmap font with 256 glyphs: a 4-byte header {0, unknown, width, height}, then
 * `height` bytes per glyph. Found as CCKD header tables and as an OPTIONS.NOB TABL entry.
 */
export function parseBitmapFont(table: Uint8Array): BitmapFont {
  if (table.byteLength < 4) throw new PayloadError('font table too small');
  const width = table[2];
  const height = table[3];
  if (width < 1 || width > 8 || height < 1 || table.byteLength !== 4 + 256 * height) {
    throw new PayloadError('unexpected font table layout');
  }
  return { width, height, glyphs: table.subarray(4) };
}

/** {u32 offset, u32 count} at 0x00 followed by `count` u32 entry IDs (M2ID, NEBC). */
export function parseIdList(block: Uint8Array): number[] {
  const v = view(block);
  need(block, 8, 'ID list header');
  const offset = v.getUint32(0, true);
  const count = v.getUint32(4, true);
  need(block, offset + count * 4, 'ID list');
  return Array.from({ length: count }, (_, i) => v.getUint32(offset + i * 4, true));
}
export interface Mesh {
  /** x, y, z per vertex. */
  positions: Float32Array;
  /** u, v per vertex; values may exceed [0, 1] (tiling). */
  uvs: Float32Array;
  /** Unit normal per vertex. */
  normals: Float32Array;
  /** Size of the per-corner slot table referenced by `cornerSlots`; not stored in the file. */
  slotCount: number;
  /** Three vertex indices per triangle. */
  indices: Uint32Array;
  /** Slot index for each corner, parallel to `indices`. */
  cornerSlots: Uint32Array;
}

export function parseMesh(block: Uint8Array): Mesh {
  const v = view(block);
  need(block, 16, 'mesh header');
  if (v.getUint32(0, true) !== 12 || v.getUint32(4, true) !== block.byteLength - 12) {
    throw new PayloadError('unexpected mesh header');
  }
  let o = 12;
  const vertexCount = v.getUint32(o, true);
  o += 4;
  need(block, o + vertexCount * 20 + 4, 'vertex data');
  const positions = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount * 3; i++, o += 4) positions[i] = v.getFloat32(o, true);
  const uvs = new Float32Array(vertexCount * 2);
  for (let i = 0; i < vertexCount * 2; i++, o += 4) uvs[i] = v.getFloat32(o, true);
  const slotCount = v.getUint32(o, true);
  o += 4;
  need(block, o + vertexCount * 12 + 4, 'normal data');
  const normals = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount * 3; i++, o += 4) normals[i] = v.getFloat32(o, true);
  const faceCount = v.getUint32(o, true);
  o += 4;
  const indices = new Uint32Array(faceCount * 3);
  const cornerSlots = new Uint32Array(faceCount * 3);
  for (let f = 0; f < faceCount; f++) {
    need(block, o + 28, `face ${f}`);
    if (v.getUint32(o, true) !== 3) throw new PayloadError(`face ${f} is not a triangle`);
    o += 4;
    for (let c = 0; c < 3; c++, o += 8) {
      const vertex = v.getUint32(o, true);
      const slot = v.getUint32(o + 4, true);
      if (vertex >= vertexCount || slot >= slotCount) throw new PayloadError(`face ${f} index out of range`);
      indices[f * 3 + c] = vertex;
      cornerSlots[f * 3 + c] = slot;
    }
  }
  need(block, o + 4, 'mesh trailer');
  if (o + 4 !== block.byteLength) throw new PayloadError('trailing bytes after mesh');
  return { positions, uvs, normals, slotCount, indices, cornerSlots };
}

export interface ModelPart {
  /** Unknown flags word. */
  flags: number;
  /** Base colour, 0–255 per channel (used when there is no texture; Likely). */
  color: [number, number, number];
  meshId: number;
  /** TEX entry ID, or 0 for none. */
  textureId: number;
}

export interface Model {
  /** Three part lists: [0] intact model, [1] and [2] meaning Unconfirmed. */
  partLists: [ModelPart[], ModelPart[], ModelPart[]];
  /** Five SND entry IDs (0 = none); roles Unconfirmed. */
  soundIds: number[];
}

const MODEL_HEADER_SIZE = 44;
const MODEL_PART_SIZE = 28;

export function parseModel(block: Uint8Array): Model {
  const v = view(block);
  need(block, MODEL_HEADER_SIZE, 'model header');
  const partLists: ModelPart[][] = [];
  let partTotal = 0;
  for (let l = 0; l < 3; l++) {
    const offset = v.getUint32(l * 8, true);
    const count = v.getUint32(l * 8 + 4, true);
    need(block, offset + count * MODEL_PART_SIZE, `part list ${l}`);
    const parts: ModelPart[] = [];
    for (let i = 0; i < count; i++) {
      const p = offset + i * MODEL_PART_SIZE;
      parts.push({
        flags: v.getUint32(p, true),
        color: [v.getUint32(p + 4, true), v.getUint32(p + 8, true), v.getUint32(p + 12, true)],
        meshId: v.getUint32(p + 20, true),
        textureId: v.getUint32(p + 24, true),
      });
    }
    partLists.push(parts);
    partTotal += count;
  }
  if (MODEL_HEADER_SIZE + partTotal * MODEL_PART_SIZE !== block.byteLength) {
    throw new PayloadError('model size does not match its part lists');
  }
  const soundIds = [0, 1, 2, 3, 4].map((i) => v.getUint32(24 + i * 4, true));
  return { partLists: partLists as Model['partLists'], soundIds };
}
