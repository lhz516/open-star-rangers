import { maskStride } from '../../content/graphics/image-payload.ts';
import { ByteWriter, imageRecord } from '../synthetic.test-support.ts';
import type { SyntheticBlock } from './formats.test-support.ts';

// Code-generated synthetic ANIM entries for P3-03 tests, encoded with the documented frame rule (textures.md §2,
// encoding 1) by a writer independent of the decoder; they never hold original data. Each row is a sequence of u8 runs
// alternating from a transparent run: a transparent run is its length byte, an opaque run its length byte followed by
// that many palette indices, and the row ends once its runs reach the width.

/** A frame image: row-major palette indices, null at transparent pixels. */
export interface SyntheticFrame {
  readonly width: number;
  readonly height: number;
  readonly pixels: readonly (number | null)[];
}

/** One stored run of a row: a transparent run's length, or an opaque run's pixel indices. Runs alternate from transparent. */
export type ByteRun = number | readonly number[];

const MAX_RUN = 255;

/** Writes rows of runs as stored; the runs of each row must alternate from a transparent run. */
export function byteRunData(rows: readonly (readonly ByteRun[])[]): Uint8Array {
  const writer = new ByteWriter();
  for (const row of rows) {
    row.forEach((run, index) => {
      if ((typeof run === 'number') !== (index % 2 === 0)) throw new Error('runs must alternate from a transparent run');
      if (typeof run === 'number') writer.u8(run);
      else writer.u8(run.length).raw(run);
    });
  }
  return writer.toBytes();
}

/**
 * The runs of each row of `frame` by the documented rule: alternating from a transparent run (0 when the row starts
 * opaque), ending exactly at the width. A run longer than 255 pixels continues after a zero-length run of the other kind.
 */
export function byteRunRows({ width, height, pixels }: SyntheticFrame): ByteRun[][] {
  return Array.from({ length: height }, (_, y) => {
    const row = pixels.slice(y * width, (y + 1) * width);
    const runs: ByteRun[] = [];
    for (let x = 0, transparent = true; x < width; transparent = !transparent) {
      let end = x;
      while (end < width && end - x < MAX_RUN && (row[end] === null) === transparent) end++;
      runs.push(transparent ? end - x : row.slice(x, end) as number[]);
      x = end;
    }
    return runs;
  });
}

/** The encoding-1 data of `frame`. */
export const encodeByteRunFrame = (frame: SyntheticFrame): Uint8Array => byteRunData(byteRunRows(frame));

/** The decoded indices and packed mask (bit 7 leftmost, rows padded to whole bytes, 1 = opaque) `frame` must give. */
export function expectedFrame({ width, height, pixels }: SyntheticFrame): { width: number; height: number; indices: number[]; mask: number[] } {
  const stride = maskStride(width);
  const mask = new Array<number>(stride * height).fill(0);
  pixels.forEach((index, pixel) => {
    const [x, y] = [pixel % width, Math.floor(pixel / width)];
    if (index !== null) mask[y * stride + (x >> 3)] |= 0x80 >> (x & 7);
  });
  return { width, height, indices: pixels.map(index => index ?? 0), mask };
}

/**
 * A deterministic frame whose rows differ: runs of 1 to 9 pixels of either kind, a fully transparent and a fully opaque
 * row, and opaque index 0.
 */
export function patternFrame(width: number, height: number, seed: number): SyntheticFrame {
  let state = seed >>> 0 || 1;
  const next = (): number => (state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0) >>> 16;
  const pixels: (number | null)[] = [];
  for (let y = 0; y < height; y++) {
    let run = 0;
    let opaque = next() % 2 === 0;
    for (let x = 0; x < width; x++) {
      if (run === 0) [run, opaque] = [1 + (next() % 9), !opaque];
      const index = pixels.length % 7 === 3 ? 0 : 1 + (next() % 255);
      pixels.push((y === 1 ? false : y === 2 ? true : opaque) ? index : null);
      run--;
    }
  }
  return { width, height, pixels };
}

/** A uniform frame: every pixel opaque with `index`, or every pixel transparent when `index` is null. */
export const solidFrame = (width: number, height: number, index: number | null): SyntheticFrame =>
  ({ width, height, pixels: new Array<number | null>(width * height).fill(index) });

/** One frame of a synthetic ANIM: its size, encoded data and image record fields a test may override. */
export interface SyntheticAnimFrame {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
  /** The record's +4 encoding, 1 unless a test needs another. */
  readonly encoding?: number;
  /** The record's +32 data size, the data length unless a test needs another. */
  readonly size?: number;
}

/** The synthetic ANIM frame of `frame`, encoded by the documented rule. */
export const animFrame = (frame: SyntheticFrame): SyntheticAnimFrame => ({ width: frame.width, height: frame.height, data: encodeByteRunFrame(frame) });

/**
 * An ANIM block: the frame array pointer and count, the 40-byte frame records (an image record without palette and a
 * zero +36), then each frame's data in frame order. Relocations are the array pointer and each pixel pointer, listed in
 * reverse order.
 */
export function syntheticAnimation(frames: readonly SyntheticAnimFrame[]): SyntheticBlock {
  const writer = new ByteWriter().u32(8, frames.length);
  let dataAt = 8 + frames.length * 40;
  for (const { width, height, data, encoding = 1, size = data.length } of frames) {
    imageRecord(writer, { encoding, width, height, paletteOffset: 0, paletteCount: 0, pixelOffset: dataAt, size }).u32(0);
    dataAt += data.length;
  }
  for (const { data } of frames) writer.raw(data);
  return { bytes: writer.toBytes(), relocations: [0, ...frames.map((_, index) => 8 + index * 40 + 28)].reverse() };
}
