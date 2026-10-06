/**
 * Research parser for IMFAT ID list payloads (M2ID, NEBC); format: docs/original/formats/hud.md. Meshes and models are
 * read by formats/mesh.ts and formats/modl.ts, palettes, images and fonts by conversion/source-graphics.ts. All
 * offsets inside a block are relative to the block start (see imfat.ts).
 */

export class PayloadError extends Error {}

function view(block: Uint8Array): DataView {
  return new DataView(block.buffer, block.byteOffset, block.byteLength);
}

function need(block: Uint8Array, end: number, what: string): void {
  if (end > block.byteLength) throw new PayloadError(`${what} extends past the block`);
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
