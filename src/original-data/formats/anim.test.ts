import { describe, expect, it } from 'vitest';
import { FLIGHT_DATA_LIMITS } from '../../content/flight/flight-data-content.ts';
import { payloadTransferList } from '../../content/ownership.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import type { SourceLimit } from '../source-error.ts';
import { sourceFailure } from '../source-error.test-support.ts';
import { ANIM_LIMITS, decodeAnimationFrame, readAnimationFrames } from './anim.ts';
import {
  animFrame, byteRunData, byteRunRows, encodeByteRunFrame, expectedFrame, patternFrame, solidFrame, syntheticAnimation, type ByteRun,
  type SyntheticAnimFrame, type SyntheticFrame,
} from './anim.test-support.ts';
import { entryRead, type SyntheticBlock } from './formats.test-support.ts';

const SR_NOB = 'MAIN/SR.NOB' as DiscPath;
/** A synthetic entry ID, not one of the original ANIM IDs. */
const ANIM_ID = 30_011;
const at = `archive:/${SR_NOB}#${ANIM_ID}`;
/** An opaque index every rejected frame draws; no diagnostic may contain it. */
const SECRET_INDEX = 231;

const readOf = (block: SyntheticBlock) => entryRead(ANIM_ID, 'ANIM', block);
const framesOf = (block: SyntheticBlock) => readAnimationFrames(SR_NOB, readOf(block));
const decode = (block: SyntheticBlock, index: number) => {
  const image = decodeAnimationFrame(SR_NOB, readOf(block), index);
  return { width: image.width, height: image.height, indices: [...image.indices], mask: [...image.mask!] };
};
const view = (block: SyntheticBlock) => new DataView(block.bytes.buffer, block.bytes.byteOffset);
const recordAt = (frame: number) => 8 + frame * 40;

/** Expects a diagnostic in the location grammar that does not echo SECRET_INDEX. */
const rejects = async (action: () => unknown, code: string, location: string, limit: SourceLimit | null = null): Promise<void> =>
  expect(await sourceFailure(action, new RegExp(`\\b${SECRET_INDEX}\\b`))).toEqual({ code, location, limit });

/** Rejects `block` both when only its structure is read and when its first frame is decoded. */
async function rejectsEntry(block: SyntheticBlock, code: string, location: string, limit: SourceLimit | null = null): Promise<void> {
  await rejects(() => framesOf(block), code, location, limit);
  await rejects(() => decodeAnimationFrame(SR_NOB, readOf(block), 0), code, location, limit);
}

/** A 2-frame animation with distinct frames, both drawing SECRET_INDEX. */
const pair = (): SyntheticBlock => syntheticAnimation([
  { width: 3, height: 2, data: byteRunData([[0, [SECRET_INDEX, 1, 2]], [1, [SECRET_INDEX], 1]]) },
  { width: 4, height: 1, data: byteRunData([[2, [SECRET_INDEX, 0]]]) },
]);

/** A 126-pixel-wide frame whose encoding is exactly `bytes` long: whole opaque rows of 128 bytes, then one partial row of 4 to 127 bytes or 1 to 3 blank rows. */
function sizedFrame(bytes: number): SyntheticFrame {
  const width = 126;
  const [full, rest] = [Math.floor(bytes / 128), bytes % 128];
  const rows = [
    ...Array.from({ length: full }, () => new Array<boolean>(width).fill(true)),
    ...(rest >= 4 ? [Array.from({ length: width }, (_, x) => x < rest - 3)] : Array.from({ length: rest }, () => new Array<boolean>(width).fill(false))),
  ];
  return { width, height: rows.length, pixels: rows.flat().map((opaque, pixel) => (opaque ? 1 + (pixel % 200) : null)) };
}

describe('ANIM frame decoding (encoding 1)', () => {
  const FRAMES = [patternFrame(13, 9, 1), patternFrame(48, 48, 2), patternFrame(128, 128, 3), solidFrame(5, 3, null), solidFrame(7, 2, 0)];

  it('reads the frame records and decodes every frame of a multi-frame animation pixel for pixel', () => {
    const block = syntheticAnimation(FRAMES.map(animFrame));
    const frames = framesOf(block);
    expect(frames.map(({ width, height, recordOffset }) => [width, height, recordOffset])).toEqual(FRAMES.map(({ width, height }, index) => [width, height, recordAt(index)]));
    expect(Object.isFrozen(frames) && frames.every(Object.isFrozen)).toBe(true);
    FRAMES.forEach((frame, index) => expect(decode(block, index)).toEqual(expectedFrame(frame)));
  });

  it('decodes into new buffers the caller owns', () => {
    const block = syntheticAnimation([animFrame(FRAMES[0])]);
    const image = decodeAnimationFrame(SR_NOB, readOf(block), 0);
    block.bytes.fill(0);
    expect([...image.indices]).toEqual(expectedFrame(FRAMES[0]).indices);
    expect(payloadTransferList([image.indices, image.mask!])).toEqual([image.indices.buffer, image.mask!.buffer]);
  });

  it('decodes each frame alone: frames are complete images, not deltas', () => {
    const shared = animFrame(FRAMES[1]);
    const left = syntheticAnimation([animFrame(FRAMES[0]), shared]);
    const right = syntheticAnimation([animFrame(solidFrame(9, 4, 6)), shared, animFrame(FRAMES[4])]);
    expect(decode(left, 1)).toEqual(decode(right, 1));
    expect(decode(right, 1)).toEqual(expectedFrame(FRAMES[1]));
  });

  // Every branch of the documented rule, one row each, in a 6-pixel-wide frame, with the pixels it must give.
  const _ = null;
  const BRANCH_ROWS: readonly (readonly [string, readonly ByteRun[], readonly (number | null)[]])[] = [
    ['transparent, opaque and transparent runs ending at the width', [2, [5, 6], 2], [_, _, 5, 6, _, _]],
    ['a zero transparent run before an opaque run ending at the width', [0, [1, 2, 3, 4, 5, 6]], [1, 2, 3, 4, 5, 6]],
    ['a single transparent run', [6], [_, _, _, _, _, _]],
    ['a zero-length opaque run between transparent runs', [1, [], 2, [7], 2], [_, _, _, 7, _, _]],
    ['a zero-length transparent run between opaque runs', [0, [8], 0, [9, 10], 3], [8, 9, 10, _, _, _]],
    ['a transparent run past the width, which only ends the row', [1, [11, 12], 200], [_, 11, 12, _, _, _]],
    ['opaque index 0, which is drawn', [3, [0, 0, 13]], [_, _, _, 0, 0, 13]],
  ];

  it.each(BRANCH_ROWS)('decodes %s', (_name, runs, pixels) => {
    expect(decode(syntheticAnimation([{ width: 6, height: 1, data: byteRunData([runs]) }]), 0)).toEqual(expectedFrame({ width: 6, height: 1, pixels }));
  });

  it('decodes all branches together, each row starting after the previous row\'s last run', () => {
    const frame: SyntheticFrame = { width: 6, height: BRANCH_ROWS.length, pixels: BRANCH_ROWS.flatMap(([, , pixels]) => pixels) };
    expect(decode(syntheticAnimation([{ width: 6, height: frame.height, data: byteRunData(BRANCH_ROWS.map(([, runs]) => runs)) }]), 0)).toEqual(expectedFrame(frame));
  });

  it('encodes runs longer than 255 pixels across zero-length runs of the other kind and decodes them', () => {
    const wide: SyntheticFrame = { width: 300, height: 3, pixels: [...new Array<number>(300).fill(9), ...new Array<null>(300).fill(null), ...patternFrame(300, 1, 5).pixels] };
    expect(byteRunRows(wide).slice(0, 2).map(row => row.map(run => (typeof run === 'number' ? run : run.length)))).toEqual([[0, 255, 0, 45], [255, 0, 45]]);
    expect(decode(syntheticAnimation([animFrame(wide)]), 0)).toEqual(expectedFrame(wide));
  });

  it('writes the record fields the readers use and leaves the others zero', () => {
    const block = syntheticAnimation([animFrame(FRAMES[0])]);
    const data = encodeByteRunFrame(FRAMES[0]);
    const words = Array.from({ length: 10 }, (_, word) => view(block).getUint32(recordAt(0) + word * 4, true));
    expect(words).toEqual([8, 1, 13, 9, 0, 0, 0, 48, data.length, 0]);
    expect([view(block).getUint32(0, true), view(block).getInt32(4, true), block.bytes.length]).toEqual([8, 1, 48 + data.length]);
    expect(block.relocations).toEqual([recordAt(0) + 28, 0]);
  });
});

describe('ANIM rejections', () => {
  /** A one-frame animation of the given size whose data are `runs`. */
  const single = (width: number, height: number, data: Uint8Array, fields: Partial<SyntheticAnimFrame> = {}) =>
    syntheticAnimation([{ width, height, data, ...fields }]);
  const RUNS = byteRunData([[1, [SECRET_INDEX, 2], 1], [0, [3, 4, SECRET_INDEX, 5]]]);

  it.each<[string, () => SyntheticBlock]>([
    ['a truncated opaque run', () => single(4, 2, RUNS.subarray(0, -1))],
    ['a missing row', () => single(4, 3, RUNS)],
    ['a row without its next run', () => single(4, 2, RUNS.subarray(0, 5))],
    ['an opaque run past the width', () => single(3, 1, byteRunData([[1, [SECRET_INDEX, 1, 2]]]))],
    ['trailing bytes', () => single(4, 2, Uint8Array.of(...RUNS, 0))],
  ])('rejects %s when the frame is decoded, keeping the structure readable', async (_, block) => {
    expect(framesOf(block())).toHaveLength(1);
    await rejects(() => decodeAnimationFrame(SR_NOB, readOf(block()), 0), 'invalid-payload', `${at}/frames[0]/pixels`);
  });

  it.each<[string, () => SyntheticBlock, string, string]>([
    ['a truncated header', () => ({ bytes: pair().bytes.subarray(0, 7), relocations: [0] }), 'invalid-payload', `${at}/frames`],
    ['an unlisted array pointer', () => ({ ...pair(), relocations: pair().relocations.filter(offset => offset !== 0) }), 'invalid-payload', `${at}/frames`],
    ['a null array pointer', () => {
      const block = pair();
      view(block).setUint32(0, 0, true);
      return { ...block, relocations: block.relocations.filter(offset => offset !== 0) };
    }, 'invalid-payload', `${at}/frames`],
    ['an array that does not follow the header', () => {
      const block = pair();
      view(block).setUint32(0, 48, true);
      return block;
    }, 'invalid-payload', `${at}/frames`],
    ['a negative frame count', () => {
      const block = pair();
      view(block).setInt32(4, -1, true);
      return block;
    }, 'invalid-payload', `${at}/frames`],
    ['a frame array past the block', () => {
      const block = syntheticAnimation([animFrame(solidFrame(1, 1, 4))]);
      view(block).setUint32(4, 2, true);
      return block;
    }, 'invalid-payload', `${at}/frames`],
    ['a relocation in the count', () => ({ ...pair(), relocations: [...pair().relocations, 4] }), 'invalid-payload', `${at}/frames`],
    ['a relocation elsewhere in a frame record', () => ({ ...pair(), relocations: [...pair().relocations, recordAt(1) + 8] }), 'invalid-payload', `${at}/frames`],
    ['an unlisted pixel pointer', () => ({ ...pair(), relocations: pair().relocations.filter(offset => offset !== recordAt(1) + 28) }), 'invalid-payload', `${at}/frames[1]/pixels`],
    ['a null pixel pointer', () => {
      const block = pair();
      view(block).setUint32(recordAt(0) + 28, 0, true);
      return { ...block, relocations: block.relocations.filter(offset => offset !== recordAt(0) + 28) };
    }, 'invalid-payload', `${at}/frames[0]/pixels`],
    ['a relocation inside frame data', () => ({ ...pair(), relocations: [...pair().relocations, 8 + 80 + 2] }), 'invalid-payload', `${at}/frames`],
    ['frame data in reverse order', () => {
      const block = pair();
      const [first, second] = [view(block).getUint32(recordAt(0) + 28, true), view(block).getUint32(recordAt(1) + 28, true)];
      view(block).setUint32(recordAt(0) + 28, second, true);
      view(block).setUint32(recordAt(1) + 28, first, true);
      return block;
    }, 'invalid-payload', `${at}/frames[0]/pixels`],
    ['a gap between frames\' data', () => {
      const frames = pair();
      const block = { bytes: Uint8Array.of(...frames.bytes, 0), relocations: frames.relocations };
      view(block).setUint32(recordAt(1) + 28, view(block).getUint32(recordAt(1) + 28, true) + 1, true);
      return block;
    }, 'invalid-payload', `${at}/frames[1]/pixels`],
    ['a data size past the block', () => {
      const block = pair();
      view(block).setUint32(recordAt(1) + 32, 6, true);
      return block;
    }, 'invalid-payload', `${at}/frames[1]/pixels`],
    ['a data size short of the next frame', () => {
      const block = pair();
      view(block).setUint32(recordAt(0) + 32, view(block).getUint32(recordAt(0) + 32, true) - 1, true);
      return block;
    }, 'invalid-payload', `${at}/frames[1]/pixels`],
    ['trailing bytes after the last frame', () => ({ bytes: Uint8Array.of(...pair().bytes, 0), relocations: pair().relocations }), 'invalid-payload', `${at}/frames`],
    ['16 bits per pixel', () => {
      const block = pair();
      view(block).setUint32(recordAt(1), 16, true);
      return block;
    }, 'invalid-payload', `${at}/frames[1]/record`],
    ['a non-zero +16 field', () => {
      const block = pair();
      view(block).setUint32(recordAt(0) + 16, 1, true);
      return block;
    }, 'invalid-payload', `${at}/frames[0]/record`],
    ['an unlisted palette pointer', () => {
      const block = pair();
      view(block).setUint32(recordAt(0) + 20, 8, true);
      return block;
    }, 'invalid-payload', `${at}/frames[0]/palette`],
    ['a relocated palette pointer past the block', () => {
      const block = pair();
      view(block).setUint32(recordAt(0) + 20, 0xffff_ffff, true);
      view(block).setUint32(recordAt(0) + 24, 1, true);
      return { ...block, relocations: [...block.relocations, recordAt(0) + 20] };
    }, 'invalid-payload', `${at}/frames[0]/palette`],
  ])('rejects %s before decoding', (_, block, code, location) => rejectsEntry(block(), code, location));

  it.each([0, 2, 3])('rejects a frame of encoding %i as an unsupported encoding', async encoding => {
    await rejectsEntry(syntheticAnimation([animFrame(solidFrame(2, 2, 1)), { ...animFrame(solidFrame(2, 2, 1)), encoding }]), 'unsupported-encoding', `${at}/frames[1]/record`);
  });

  it.each<[string, () => SyntheticBlock, string]>([
    ['an animation without frames', () => syntheticAnimation([]), `${at}/frames`],
    ['an embedded palette count', () => {
      const block = pair();
      view(block).setUint32(recordAt(1) + 24, 1, true);
      return block;
    }, `${at}/frames[1]/palette`],
    ['an embedded palette', () => {
      const block = pair();
      view(block).setUint32(recordAt(0) + 20, 8 + 80, true);
      view(block).setUint32(recordAt(0) + 24, 1, true);
      return { ...block, relocations: [...block.relocations, recordAt(0) + 20] };
    }, `${at}/frames[0]/palette`],
    ['a non-zero +36 field', () => {
      const block = pair();
      view(block).setUint8(recordAt(1) + 39, 1);
      return block;
    }, `${at}/frames[1]/at36`],
  ])('rejects %s as unsupported', (_, block, location) => rejectsEntry(block(), 'unsupported-payload', location));

  it.each([[2], [-1], [0.5]])('reports frames/%s as a missing subresource', async index => {
    await rejects(() => decodeAnimationFrame(SR_NOB, readOf(pair()), index), 'subresource-not-found', `${at}/frames`);
  });
});

describe('ANIM limits', async () => {
  const tinyFrames = (count: number) => syntheticAnimation(Array.from({ length: count }, (_, index) => animFrame(solidFrame(1, 1, index))));

  it('shares the frame limit with the explosion-animation payload', () => {
    expect(ANIM_LIMITS).toEqual({ entryBytes: 131_072, frames: FLIGHT_DATA_LIMITS.animationFrames, frameBytes: 16_384 });
  });

  it('accepts 32 frames and rejects 33 before reading the array', async () => {
    expect(framesOf(tinyFrames(ANIM_LIMITS.frames))).toHaveLength(32);
    expect(decode(tinyFrames(ANIM_LIMITS.frames), 31).indices).toEqual([31]);
    await rejectsEntry(tinyFrames(ANIM_LIMITS.frames + 1), 'limit-exceeded', `${at}/frames`, { name: 'payloadItems', limit: 32, observed: 33 });
    const claimed = tinyFrames(1);
    view(claimed).setUint32(4, 0x7fff_ffff, true);
    await rejectsEntry(claimed, 'limit-exceeded', `${at}/frames`, { name: 'payloadItems', limit: 32, observed: 0x7fff_ffff });
  });

  it('accepts frame data of exactly 16,384 bytes and rejects 16,385 before reading the record', async () => {
    const largest = sizedFrame(ANIM_LIMITS.frameBytes);
    expect(encodeByteRunFrame(largest)).toHaveLength(16_384);
    expect(decode(syntheticAnimation([animFrame(largest)]), 0)).toEqual(expectedFrame(largest));
    const over = sizedFrame(ANIM_LIMITS.frameBytes + 1);
    expect(encodeByteRunFrame(over)).toHaveLength(16_385);
    const limit = { name: 'animFrameBytes', limit: 16_384, observed: 16_385 } as const;
    await rejectsEntry(syntheticAnimation([animFrame(solidFrame(1, 1, 3)), animFrame(over)]), 'limit-exceeded', `${at}/frames[1]`, limit);
    // A claimed size is limited before the record or the data are checked.
    const claimed = syntheticAnimation([{ ...animFrame(solidFrame(1, 1, 3)), size: 0xffff_ffff }]);
    await rejectsEntry(claimed, 'limit-exceeded', `${at}/frames[0]`, { name: 'animFrameBytes', limit: 16_384, observed: 0xffff_ffff });
  });

  it('accepts an entry of exactly 131,072 bytes and rejects 131,073 before reading it', async () => {
    const frames = (last: number) => syntheticAnimation([...new Array<number>(7).fill(16_384), last].map(bytes => animFrame(sizedFrame(bytes))));
    const largest = frames(131_072 - 8 - 8 * 40 - 7 * 16_384);
    expect(largest.bytes).toHaveLength(ANIM_LIMITS.entryBytes);
    expect(framesOf(largest)).toHaveLength(8);
    expect(decode(largest, 7)).toEqual(expectedFrame(sizedFrame(131_072 - 8 - 8 * 40 - 7 * 16_384)));
    const over = frames(131_073 - 8 - 8 * 40 - 7 * 16_384);
    await rejectsEntry(over, 'limit-exceeded', at, { name: 'payloadEntryBytes', limit: 131_072, observed: 131_073 });
  });

  it('keeps the frame image limits of the image record', async () => {
    await rejectsEntry(syntheticAnimation([{ width: 641, height: 1, data: byteRunData([[255, [], 255, [], 131]]) }]), 'limit-exceeded', `${at}/frames[0]/record`,
      { name: 'imageWidth', limit: 640, observed: 641 });
    await rejectsEntry(syntheticAnimation([{ width: 1, height: 0, data: new Uint8Array(0) }]), 'limit-exceeded', `${at}/frames[0]/record`,
      { name: 'imageHeight', limit: 480, observed: 0 });
  });
});
