import { FLIGHT_DATA_LIMITS } from '../../content/flight/flight-data-content.ts';
import type { ArchiveEntryRead } from '../archive/archive-reader.ts';
import { decodeImageRecord, readImageRecordHeader, type SourceImage } from '../conversion/source-graphics.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import { SourceError } from '../source-error.ts';
import { PayloadBlock } from './payload-block.ts';

// ANIM explosion animations (docs/original/formats/textures.md §6): a relocated pointer to the frame array at +0x00, an
// i32 frame count at +0x04, then the 40-byte frame records in display order from +0x08: a 36-byte image record of
// encoding 1 (byte-run sprite RLE, decoded in source-graphics.ts) and four more bytes. The frames' data follow the
// array without gaps, in frame order, and end exactly at the end of the entry; the only relocations are +0x00 and each
// frame's pixel pointer. Frames have no embedded palette (they display directly under DATA), store rows top-down and
// are complete images, not deltas. The data hold no per-frame or per-animation parameter: timing and placement are code.

const HEADER_BYTES = 8;
const FRAME_BYTES = 40;
const PALETTE_POINTER = 20;
const PALETTE_COUNT = 24;
const PIXEL_POINTER = 28;
const DATA_SIZE = 32;
/** The four bytes after a frame's image record: zero in every baseline frame, no reader found, type Unconfirmed. */
const UNKNOWN_FIELD = 36;
const NO_PALETTE = 'an ANIM frame with an embedded palette is not supported';

/**
 * Structural limits (P3-03 spec, 限值与预算): twice the largest of all 186 baseline frames, rounded up to a power of two.
 * `entryBytes`: an ANIM entry, observed at most 58,087 bytes. `frames`: the frame array, observed at most 12, shared with
 * the `explosion-animation` payload. `frameBytes`: one frame's encoded data, observed at most 7,411 bytes.
 */
export const ANIM_LIMITS = Object.freeze({ entryBytes: 131_072, frames: FLIGHT_DATA_LIMITS.animationFrames, frameBytes: 16_384 });

/** One frame record in display order. */
export interface AnimationFrame {
  readonly width: number;
  readonly height: number;
  /** Block offset of the frame's 36-byte image record. */
  readonly recordOffset: number;
}

/**
 * Checks the whole structure of the ANIM entry `read` of `archive` without decoding any frame data: the header, every
 * frame record and the data layout. Each frame's data size is limited before its record is read; frame image limits and
 * the encoding come from the image record rules. Frame positions the research found unused (an embedded palette and
 * +36) and an empty frame array are `unsupported-payload`.
 */
export function readAnimationFrames(archive: DiscPath, read: ArchiveEntryRead): readonly AnimationFrame[] {
  return framesOf(new PayloadBlock(archive, read, ANIM_LIMITS.entryBytes), read);
}

/** Frame `index` of the ANIM entry `read`, the `frames/<index>` subresource, decoded after the whole structure is checked. */
export function decodeAnimationFrame(archive: DiscPath, read: ArchiveEntryRead, index: number): SourceImage {
  const block = new PayloadBlock(archive, read, ANIM_LIMITS.entryBytes);
  const frames = framesOf(block, read);
  if (!Number.isInteger(index) || index < 0 || index >= frames.length) {
    throw new SourceError('subresource-not-found', block.at('/frames'), 'the ANIM has no such frame');
  }
  return decodeImageRecord(read.bytes, frames[index].recordOffset, block.at(`/frames[${index}]`), 'anim-frame');
}

/**
 * Whether the relocation `position` is the frame array pointer or a pointer field of one of `count` frame records; a set
 * palette pointer is then unsupported rather than misplaced.
 */
function isPointerField(position: number, count: number): boolean {
  const field = (position - HEADER_BYTES) % FRAME_BYTES;
  return position === 0 || (position >= HEADER_BYTES && position < HEADER_BYTES + count * FRAME_BYTES && (field === PALETTE_POINTER || field === PIXEL_POINTER));
}

function framesOf(block: PayloadBlock, { bytes, relocations }: ArchiveEntryRead): readonly AnimationFrame[] {
  const count = block.i32(4, '/frames');
  if (count < 0) block.invalid('/frames', 'the frame count is negative');
  block.limit('/frames', 'payloadItems', ANIM_LIMITS.frames, count);
  if (block.target(0, count * FRAME_BYTES, '/frames') !== HEADER_BYTES) block.invalid('/frames', 'the frame array must follow the header');
  if (relocations.some(position => !isPointerField(position, count))) block.invalid('/frames', 'a relocation is not at a pointer field');
  if (count === 0) block.unsupported('/frames', 'an animation without frames is not supported');
  let dataEnd = HEADER_BYTES + count * FRAME_BYTES;
  const frames = Array.from({ length: count }, (_, index): AnimationFrame => {
    const path = `/frames[${index}]`;
    const at = HEADER_BYTES + index * FRAME_BYTES;
    block.limit(path, 'animFrameBytes', ANIM_LIMITS.frameBytes, block.u32(at + DATA_SIZE, path));
    const paletteCount = block.u32(at + PALETTE_COUNT, `${path}/palette`);
    block.unsupportedPointer(at + PALETTE_POINTER, paletteCount * 3, `${path}/palette`, NO_PALETTE);
    if (paletteCount !== 0) block.unsupported(`${path}/palette`, NO_PALETTE);
    if (block.hasNonZero(at + UNKNOWN_FIELD, 4, `${path}/at36`)) block.unsupported(`${path}/at36`, 'the frame field after the image record is not zero');
    const pixels = block.target(at + PIXEL_POINTER, 0, `${path}/pixels`);
    const { width, height, dataSize } = readImageRecordHeader(bytes, at, block.at(path), 'anim-frame');
    if (pixels !== dataEnd) block.invalid(`${path}/pixels`, 'frame data must follow the frame array in frame order without gaps');
    dataEnd += dataSize;
    return Object.freeze({ width, height, recordOffset: at });
  });
  if (dataEnd !== bytes.length) block.invalid('/frames', 'the frame data must end at the end of the entry');
  return Object.freeze(frames);
}
