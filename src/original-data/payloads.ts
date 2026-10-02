/**
 * Parsers for IMFAT entry payloads: images (TEX/BITM), meshes (MESH), and models (MODL).
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

export interface IndexedImage {
  width: number;
  height: number;
  /** One palette index per pixel, row by row. */
  pixels: Uint8Array;
  /** Embedded palette as 8-bit RGB triplets, or null if the image has none. */
  palette: Uint8Array | null;
}

/** TEX and BITM share this layout. */
export function parseImage(block: Uint8Array): IndexedImage {
  const v = view(block);
  need(block, 4, 'image header pointer');
  const h = v.getUint32(0, true);
  need(block, h + 24, 'image header');
  const width = v.getUint32(h, true);
  const height = v.getUint32(h + 4, true);
  const paletteOffset = v.getUint32(h + 12, true);
  const paletteCount = v.getUint32(h + 16, true);
  const pixelOffset = v.getUint32(h + 20, true);
  need(block, pixelOffset + width * height, 'pixel data');
  let palette: Uint8Array | null = null;
  if (paletteCount > 0) {
    need(block, paletteOffset + paletteCount * 3, 'palette');
    palette = block.subarray(paletteOffset, paletteOffset + paletteCount * 3);
  }
  return { width, height, pixels: block.subarray(pixelOffset, pixelOffset + width * height), palette };
}

/** DATA entry: 256 VGA colours with 6-bit components, scaled to 8 bits. */
export function parseVgaPalette(block: Uint8Array): Uint8Array {
  need(block, 768, 'palette');
  return Uint8Array.from(block.subarray(0, 768), (c) => Math.min(255, Math.round((c * 255) / 63)));
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
