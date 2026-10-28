/**
 * The hit shimmer's band and screen door (docs/original/formats/textures.md, TEX 11069; docs/original/formats/
 * executable.md, HS4, HS6; docs/plan/p3/12/spec.md, 模型、光照与第 2 列表, 技术决定 4; AC-08).
 *
 * - **Band position** (`0x42664`): t = chop(u32(sample − start) × (1/128 as f32) × 255.0) as i32, from the mission clock
 *   samples of the pass and of the hit. Every product is exact in double (u32 × 255 < 2^40), as in the x87; a value past
 *   i32 is FISTP's integer indefinite. A shimmer ends at the first step with t > 250.
 * - **Opacity** (`0x4294c`): per texel, from TEX 11069's stored value v (a threshold, never a colour): 0xFF where
 *   t + 1 < v < t + 40, else 0x7F where t − 3 < v < t + 43, else 0, compared as signed 32-bit integers.
 * - **Screen door** (HS6, table `0x17e1b0`): a pixel of opacity a is drawn exactly when a ≥ T(y & 3, x & 3), where T is
 *   16 × the 4 × 4 index matrix below with its 0 entry raised to 1, and x, y are the rasteriser's column and scanline,
 *   i.e. the 640 × 480 logical screen's (every flight viewport starts at (0, 0), PV2): 0 is never drawn, 0xFF always,
 *   0x7F on (x + y) even. A skipped pixel writes neither colour nor depth.
 */

/** The last band position that is drawn; the step that computes a larger one ends the shimmer. */
export const LAST_BAND = 250;

/** The band positions per shared step: shared shell s shows the band at t = 15 s (`0x41dcc`, HS4). */
export const SHARED_STEP_BAND = 15;

/** The x87 FISTP result for a value outside i32. */
const INTEGER_INDEFINITE = -(2 ** 31);

const ONE_128TH = Math.fround(1 / 128);

/** The band position t of a pass sampled at `sample` for a hit started at `start` (mission clock units). */
export function bandPosition(sample: number, start: number): number {
  const elapsed = (sample - start) >>> 0;
  const t = Math.trunc(elapsed * ONE_128TH * 255);
  return t > 0x7fff_ffff ? INTEGER_INDEFINITE : t;
}

/** The opacity of a texel whose threshold is `threshold` at band position `t`. */
export function bandOpacity(threshold: number, t: number): 0 | 0x7f | 0xff {
  if (t + 1 < threshold && threshold < t + 40) return 0xff;
  if (t - 3 < threshold && threshold < t + 43) return 0x7f;
  return 0;
}

/** Width and height of `bandTable`: one row per drawn band position, one column per threshold. */
export const BAND_TABLE_SIZE = Object.freeze({ width: 256, height: LAST_BAND + 1 });

/** bandOpacity(v, t) at column v of row t, for t = 0…250. */
export function bandTable(): Uint8Array<ArrayBuffer> {
  const { width, height } = BAND_TABLE_SIZE;
  const table = new Uint8Array(width * height);
  for (let t = 0; t < height; t++) for (let v = 0; v < width; v++) table[t * width + v] = bandOpacity(v, t);
  return table;
}

/** The ordered-dither index matrix, by row y & 3 and column x & 3. */
const INDEX_MATRIX: readonly (readonly number[])[] = Object.freeze([[0, 12, 3, 15], [8, 4, 11, 7], [2, 14, 1, 13], [10, 6, 9, 5]]);

/** The least opacity drawn at logical pixel (x, y). */
export function screenDoorThreshold(x: number, y: number): number {
  return Math.max(1, 16 * INDEX_MATRIX[y & 3][x & 3]);
}

/** Whether a shell pixel of opacity `opacity` at logical pixel (x, y) is drawn. */
export function isScreenDoorDrawn(opacity: number, x: number, y: number): boolean {
  return opacity >= screenDoorThreshold(x, y);
}

/** Width and height of `screenDoorTable`: one row per (y & 3, x & 3), one column per opacity. */
export const SCREEN_DOOR_TABLE_SIZE = Object.freeze({ width: 256, height: 16 });

/** 0xFF where opacity a (column) is drawn at row (y & 3) · 4 + (x & 3), else 0: `0x17e1b0` as a texture. */
export function screenDoorTable(): Uint8Array<ArrayBuffer> {
  const { width, height } = SCREEN_DOOR_TABLE_SIZE;
  const table = new Uint8Array(width * height);
  for (let row = 0; row < height; row++) {
    for (let opacity = 0; opacity < width; opacity++) table[row * width + opacity] = isScreenDoorDrawn(opacity, row & 3, row >> 2) ? 0xff : 0;
  }
  return table;
}
