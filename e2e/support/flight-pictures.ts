import type { Locator, Page } from '@playwright/test';

// Independent expectations and picture reads for the flight renderer's browser regression (P3-12/25). The expected
// pictures follow the original's rules as docs/original/formats/executable.md records them (star field SD2/SD3, nebula
// NB1/NB3/NB4, 3D projection PV3), written out here without the renderer's modules; reads take the composited page, as
// the user sees it, through a screenshot decoded in the page (the chain viewer-observations.ts verified).

export type Rgb = readonly [number, number, number];

export const LOGICAL_WIDTH = 640;
export const LOGICAL_HEIGHT = 480;
/** The last row of the 3D viewport in F1 and Warp (rows 316–479 are the cockpit's, black until P3-13). */
export const F1_BOTTOM = 315;
/** The last row in the destruction view, whose viewport is the whole screen. */
export const FULL_BOTTOM = 479;

/** A 640 × 480 picture of 8-bit RGB triples, row-major from the top left. */
export class LogicalImage {
  readonly data: Uint8Array;

  constructor(data?: Uint8Array) {
    this.data = data ?? new Uint8Array(LOGICAL_WIDTH * LOGICAL_HEIGHT * 3);
  }

  at(x: number, y: number): Rgb {
    const at = (y * LOGICAL_WIDTH + x) * 3;
    return [this.data[at], this.data[at + 1], this.data[at + 2]];
  }

  set(x: number, y: number, [r, g, b]: Rgb): void {
    this.data.set([r, g, b], (y * LOGICAL_WIDTH + x) * 3);
  }

  clone(): LogicalImage {
    return new LogicalImage(this.data.slice());
  }
}

export const same = (a: Rgb, b: Rgb): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
export const isBlack = (rgb: Rgb): boolean => same(rgb, [0, 0, 0]);

export interface Mismatch {
  readonly x: number;
  readonly y: number;
  readonly actual: Rgb;
  readonly expected: Rgb;
}

/** The pixels of `points` (default: every pixel) where `actual` differs from `expected`. */
export function mismatches(actual: LogicalImage, expected: LogicalImage, points?: Iterable<readonly [number, number]>): Mismatch[] {
  const found: Mismatch[] = [];
  const check = (x: number, y: number): void => {
    const [a, e] = [actual.at(x, y), expected.at(x, y)];
    if (!same(a, e)) found.push({ x, y, actual: a, expected: e });
  };
  if (points) for (const [x, y] of points) check(x, y);
  else for (let y = 0; y < LOGICAL_HEIGHT; y++) for (let x = 0; x < LOGICAL_WIDTH; x++) check(x, y);
  return found;
}

/** Whether two pictures are equal, stopping at the first difference. */
export function sameImage(a: LogicalImage, b: LogicalImage): boolean {
  for (let at = 0; at < a.data.length; at++) if (a.data[at] !== b.data[at]) return false;
  return true;
}

/** Every pixel of the rectangle, ends included. */
export function* rect(left: number, top: number, right: number, bottom: number): Generator<readonly [number, number]> {
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) yield [x, y];
}

// Palettes

/** A 6-bit VGA component as the original's DATA display expands it. */
export const vga = (value: number): number => (value << 2) | (value >> 4);

/** A 256-entry palette of 8-bit colours from 6-bit components `component(entry, channel)`. */
export const palette6 = (component: (entry: number, channel: number) => number): readonly Rgb[] =>
  Array.from({ length: 256 }, (_, entry) => [0, 1, 2].map(channel => vga(component(entry, channel))) as unknown as Rgb);

/** The DATA palette of the pass integration content (lighting.test-support.ts): (i, 5i, 11i) mod 64. */
export const SCENE_DATA = palette6((entry, channel) => (entry * [1, 5, 11][channel]) % 64);
/** The DATA palette of the synthetic production package (conversion.test-support.ts `dataPaletteBlock`): byte b is 7b mod 64. */
export const PRODUCTION_DATA = palette6((entry, channel) => ((entry * 3 + channel) * 7) % 64);

/** The nearest palette entry by the original's rule: each stored colour's top six bits, least squares, first wins. */
export function nearestEntry(palette: readonly Rgb[], [r, g, b]: Rgb): number {
  let best = -1;
  let distance = Infinity;
  palette.forEach(([R, G, B], entry) => {
    const d = (r - (R & 0xfc)) ** 2 + (g - (G & 0xfc)) ** 2 + (b - (B & 0xfc)) ** 2;
    if (d < distance) [best, distance] = [entry, d];
  });
  return best;
}

// Star field (SD2, SD3)

export const F = Math.fround;
/** c, the f32 constant F(1 ÷ 32767). */
const RAND_C = F(1 / 32767);
const PI_PRIME = 3.1415927;
const TWO_PI_PRIME = 6.2831854;
export const STAR_S = F(Math.sin(Math.atan(0.5)));
export const STAR_K = F(Math.cos(Math.SQRT2 * Math.atan(0.5)));

/** The C library's default `rand` sequence: state × 0x41C64E6D + 0x3039 mod 2³², bits 16–30, from state 1. */
export function* defaultRand(): Generator<number> {
  let state = 1;
  for (;;) {
    state = (Math.imul(state, 0x41c64e6d) + 0x3039) >>> 0;
    yield (state >>> 16) & 0x7fff;
  }
}

export interface Star {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** A DATA index, 1–6. */
  readonly colour: number;
}

/** The 500-entry star table, from draws 1–1000 of the default sequence. */
export const STAR_TABLE: readonly Star[] = (() => {
  const rand = defaultRand();
  const draw = (): number => rand.next().value!;
  const raw = Array.from({ length: 500 }, () => {
    const [r1, r2] = [draw(), draw()];
    const theta = F(r1 * RAND_C) * PI_PRIME;
    const phi = (r2 * RAND_C) * TWO_PI_PRIME;
    return [F(Math.cos(phi) * Math.sin(theta)), F(Math.sin(phi) * Math.sin(theta)), F(Math.cos(theta))];
  });
  return raw.map(([x, y, z], index) => {
    const inv = 1 / Math.sqrt((y * y + x * x) + z * z);
    return { x: F(x * inv), y: F(y * inv), z: F(z * inv), colour: (index % 6) + 1 };
  });
})();

/** Camera rows R0–R2 as nine numbers. */
export type Rows = readonly number[];
export const IDENTITY_ROWS: Rows = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** The pixels the star field draws with the camera `rows` in a view whose last row is `bottom`, in drawing order. */
export function starPixels(rows: Rows, bottom: number): { readonly x: number; readonly y: number; readonly colour: number }[] {
  const hw = 320;
  const hd = 81;
  const P = hw * (1 / STAR_S);
  const N = -hw * (1 / STAR_S);
  const pixels: { x: number; y: number; colour: number }[] = [];
  for (const { x, y, z, colour } of STAR_TABLE) {
    const depth = ((y * rows[7]) + (x * rows[6])) + (z * rows[8]);
    if (!(depth >= STAR_K)) continue;
    const r = STAR_K / F(depth);
    const a = ((y * rows[1]) + (x * rows[0])) + (z * rows[2]);
    const b = ((y * rows[4]) + (x * rows[3])) + (z * rows[5]);
    const [xs, ys] = [F(a * r), F(b * r)];
    if (!(-STAR_S < xs && xs < STAR_S)) continue;
    const sxf = F((P * xs) + hw);
    const syf = F((N * ys) + hw);
    if (!(hd <= syf && syf < bottom + hd)) continue;
    const [sx, sy] = [Math.trunc(sxf + 0.5), Math.trunc(syf + 0.5) - hd];
    // An unclipped write: column 640 is column 0 of the next row.
    const index = sy * LOGICAL_WIDTH + sx;
    if (index < LOGICAL_WIDTH * LOGICAL_HEIGHT) pixels.push({ x: index % LOGICAL_WIDTH, y: Math.floor(index / LOGICAL_WIDTH), colour });
  }
  return pixels;
}

// Nebula (NB1, NB3, NB4)

/**
 * The nebula as the identity rows show it: only slot 0 (+z) is in view, at (320, 240) with θ = π (C → B points to
 * screen −x), so the stored image's rows run right to left and its columns top to bottom, axis-aligned with all 128 × 128
 * source pixels: source row 384 − x, column y − 177 for x 257–384, y 177–304, written for 1 ≤ y ≤ `bottom`. `indices` is
 * the 128 × 128 image, row-major.
 */
export function drawIdentityNebula(image: LogicalImage, palette: readonly Rgb[], indices: ArrayLike<number>, bottom: number): void {
  for (let y = 177; y <= Math.min(304, bottom); y++) {
    for (let x = 257; x <= 384; x++) image.set(x, y, palette[indices[(384 - x) * 128 + (y - 177)]]);
  }
}

/**
 * The F1/Warp/destruction background with the identity rows: black, the nebula of `nebula` (none when null), then the
 * star field; everything the 3D world, sprites and effects draw goes over it.
 */
export function identityBackground(palette: readonly Rgb[], nebula: ArrayLike<number> | null, bottom: number): LogicalImage {
  const image = new LogicalImage();
  if (nebula) drawIdentityNebula(image, palette, nebula, bottom);
  for (const { x, y, colour } of starPixels(IDENTITY_ROWS, bottom)) image.set(x, y, palette[colour]);
  return image;
}

// 3D projection (PV3)

/** The logical screen point of camera-space (x, y, z) in a viewport centred at (320, `cy`) with half-size 320. */
export const project = (x: number, y: number, z: number, cy = 158): readonly [number, number] => [320 + (640 * x) / z, cy - (640 * y) / z];

// Reads

export interface CanvasPlacement {
  /** The canvas's CSS box in the viewport. */
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  /** The drawing buffer. */
  readonly bufferWidth: number;
  readonly bufferHeight: number;
  readonly pixelRatio: number;
}

/** Where the canvas inside `area` is drawn, after scrolling it fully into view. */
export async function canvasPlacement(area: Locator): Promise<CanvasPlacement> {
  await area.evaluate(element => { element.scrollIntoView({ block: 'start', inline: 'start' }); });
  return area.locator('canvas').evaluate(canvas => {
    const { left, top, width, height } = canvas.getBoundingClientRect();
    const { width: bufferWidth, height: bufferHeight } = canvas as HTMLCanvasElement;
    return { left, top, width, height, bufferWidth, bufferHeight, pixelRatio: window.devicePixelRatio };
  });
}

/**
 * The logical picture of the flight canvas inside `area` as composited on the page: a viewport screenshot decoded in the
 * page, each logical pixel read at the centre of the device pixels it covers. Chrome draws a canvas from its position
 * rounded to a whole CSS pixel, then scaled by the pixel ratio (viewer-observations.ts `bufferPixels`).
 */
export async function logicalImage(page: Page, area: Locator): Promise<LogicalImage> {
  const placement = await canvasPlacement(area);
  const screenshot = await page.screenshot({ animations: 'disabled', caret: 'hide' });
  const bytes = await page.evaluate(async ({ png, placement: { left, top, bufferWidth, pixelRatio } }) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(png), c => c.charCodeAt(0))], { type: 'image/png' }));
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Screenshot decode requires a 2D context');
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
      const scale = bufferWidth / 640;
      const [ox, oy] = [Math.round(left) * pixelRatio, Math.round(top) * pixelRatio];
      const out = new Uint8Array(640 * 480 * 3);
      for (let y = 0; y < 480; y++) {
        const dy = oy + Math.floor((y + 0.5) * scale);
        for (let x = 0; x < 640; x++) {
          const at = (dy * bitmap.width + ox + Math.floor((x + 0.5) * scale)) * 4;
          out[(y * 640 + x) * 3] = pixels[at];
          out[(y * 640 + x) * 3 + 1] = pixels[at + 1];
          out[(y * 640 + x) * 3 + 2] = pixels[at + 2];
        }
      }
      let text = '';
      for (let at = 0; at < out.length; at += 0x8000) text += String.fromCharCode(...out.subarray(at, at + 0x8000));
      return btoa(text);
    } finally {
      bitmap.close();
    }
  }, { png: screenshot.toString('base64'), placement });
  return new LogicalImage(Uint8Array.from(Buffer.from(bytes, 'base64')));
}

/** Waits two animation frames, so the compositor shows what the last evaluation drew. */
export const nextFrames = (page: Page): Promise<unknown> =>
  page.evaluate(() => new Promise(resolve => { requestAnimationFrame(() => { requestAnimationFrame(resolve); }); }));

/** The screenshot's colours at viewport CSS points, such as the letterbox around the canvas. */
export async function pagePixels(page: Page, points: readonly (readonly [number, number])[]): Promise<Rgb[]> {
  const screenshot = await page.screenshot({ animations: 'disabled', caret: 'hide' });
  return page.evaluate(async ({ png, points: wanted }) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(png), c => c.charCodeAt(0))], { type: 'image/png' }));
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Screenshot decode requires a 2D context');
      context.drawImage(bitmap, 0, 0);
      return wanted.map(([x, y]) => [...context.getImageData(Math.round(x * devicePixelRatio), Math.round(y * devicePixelRatio), 1, 1).data.slice(0, 3)] as [number, number, number]);
    } finally {
      bitmap.close();
    }
  }, { png: screenshot.toString('base64'), points: points.map(([x, y]) => [x, y] as [number, number]) });
}
