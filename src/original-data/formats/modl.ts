import { MODEL_LIMITS, type ModelColour } from '../../content/models/model-payload.ts';
import { SourceError } from '../source-error.ts';

// MODL entry structure (docs/original/formats/mesh.md §2), little-endian:
//   0x00 3 × { u32 pointer, u32 count }: part lists 0, 1 and 2
//   0x18 5 × u32 SND entry IDs, 0 for an empty slot
//   0x2C the parts of lists 0, 1 and 2, stored contiguously in list order, 28 bytes each:
//        u32 flags; 3 × u32 colour, 0–255; u32 0; u32 MESH entry ID; u32 TEX entry ID or 0
// A non-empty list points at its first part and an empty one has a null pointer, so the block is exactly
// 44 + 28 × parts bytes. Every failure is located at the caller's `path` exactly.

const HEADER_BYTES = 44;
const PART_BYTES = 28;
const SOUNDS_AT = 0x18;

export interface SourceModelPart {
  /** The flag word, unchanged. */
  readonly sourceFlags: number;
  readonly colour: ModelColour;
  readonly meshEntry: number;
  /** TEX entry ID, or 0 for an untextured part. */
  readonly textureEntry: number;
}

type SourcePartList = readonly SourceModelPart[];

export interface SourceModel {
  readonly partLists: readonly [SourcePartList, SourcePartList, SourcePartList];
  /** SND entry IDs of slots 0–4, 0 for an empty slot. */
  readonly soundEntries: readonly [number, number, number, number, number];
}

function invalid(path: string, reason: string): never {
  throw new SourceError('invalid-payload', path, reason);
}

/**
 * Reads a MODL block into frozen part lists and sound slots. List pointers and counts are checked against the block
 * and the part total against `modelParts` before any part is read; then the exact block length, each part's reserved
 * field and colour range. Entry IDs are returned unresolved.
 */
export function readModel(block: Uint8Array, path: string): SourceModel {
  if (block.byteLength < HEADER_BYTES) invalid(path, 'the model header is truncated');
  const view = new DataView(block.buffer, block.byteOffset, block.byteLength);
  let next = HEADER_BYTES;
  const counts = [0, 1, 2].map(list => {
    const pointer = view.getUint32(list * 8, true);
    const count = view.getUint32(list * 8 + 4, true);
    if (count === 0) {
      if (pointer !== 0) invalid(path, 'an empty part list must have a null pointer');
      return 0;
    }
    if (pointer !== next) invalid(path, 'the part lists must follow the header contiguously in list order');
    if (count > (block.byteLength - next) / PART_BYTES) invalid(path, 'a part list extends past the block');
    next += count * PART_BYTES;
    return count;
  });
  const parts = counts[0] + counts[1] + counts[2];
  if (parts < 1 || parts > MODEL_LIMITS.modelParts) {
    throw new SourceError('limit-exceeded', path, 'the part count is outside the supported range', { name: 'modelParts', limit: MODEL_LIMITS.modelParts, observed: parts });
  }
  if (block.byteLength !== HEADER_BYTES + parts * PART_BYTES) invalid(path, 'the model length must be 44 + 28 bytes per part');
  const field = (offset: number): number => view.getUint32(offset, true);
  let at = HEADER_BYTES;
  const partList = (count: number): SourcePartList => Object.freeze(Array.from({ length: count }, () => {
    const colour: ModelColour = Object.freeze([field(at + 4), field(at + 8), field(at + 12)]);
    if (colour.some(channel => channel > 255)) invalid(path, 'a part colour channel must be at most 255');
    if (field(at + 16) !== 0) invalid(path, 'the reserved part field must be 0');
    const part = Object.freeze({ sourceFlags: field(at), colour, meshEntry: field(at + 20), textureEntry: field(at + 24) });
    at += PART_BYTES;
    return part;
  }));
  const sound = (slot: number): number => field(SOUNDS_AT + slot * 4);
  return Object.freeze({
    partLists: Object.freeze([partList(counts[0]), partList(counts[1]), partList(counts[2])] as const),
    soundEntries: Object.freeze([sound(0), sound(1), sound(2), sound(3), sound(4)] as const),
  });
}
