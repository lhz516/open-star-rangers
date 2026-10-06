import { describe, expect, it } from 'vitest';
import { readAssetId, type AssetId } from '../asset-id.ts';
import { composeLayout } from './compose-layout.ts';
import { expandImage } from './expand-image.ts';
import { expectContractError, packMask } from './graphics.test-support.ts';
import { encodeImagePayload, readImagePayload, type ImageDisplay, type ImagePayload } from './image-payload.ts';
import { encodeLayoutPayload, readLayoutPayload, type LayoutPayload } from './layout-payload.ts';
import { encodePalettePayload, readPalettePayload, type PalettePayload } from './palette-payload.ts';

const PA = readAssetId('palette/synthetic-a');
const PB = readAssetId('palette/synthetic-b');
const PC = readAssetId('palette/synthetic-c');

// Distinct colours per entry and per palette, so a pixel's colour identifies both its image and its index.
const COLOURS: Record<string, readonly (readonly number[])[]> = {
  [PA]: Array.from({ length: 16 }, (_, entry) => [entry * 10 + 1, entry * 10 + 2, entry * 10 + 3]),
  [PB]: Array.from({ length: 9 }, (_, entry) => [250 - entry, 100 + entry * 7, 33 + entry * 3]),
  [PC]: [[9, 9, 9]],
};

const palette = (id: AssetId, length = COLOURS[id].length): PalettePayload =>
  readPalettePayload(encodePalettePayload({ entries: Uint8Array.from(COLOURS[id].slice(0, length).flat()) }), 1);

interface Spec {
  readonly id: AssetId;
  readonly palette: AssetId;
  readonly display?: ImageDisplay;
  /** One string per row; '1' is opaque. */
  readonly opacity: readonly string[];
  /** Row-major indices; 0 at transparent pixels. */
  readonly indices: readonly number[];
}

// A: raw, fully opaque. B: masked with transparent runs, so the RLE shape of a P2-05 image. C: raw on a second palette.
const A: Spec = { id: readAssetId('image/synthetic-a'), palette: PA, opacity: ['1111', '1111', '1111'], indices: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] };
const B: Spec = { id: readAssetId('image/synthetic-b'), palette: PA, opacity: ['1001', '0111', '1111'], indices: [13, 0, 0, 14, 0, 15, 2, 3, 4, 5, 6, 7] };
const C: Spec = { id: readAssetId('image/synthetic-c'), palette: PB, opacity: ['111', '111', '111'], indices: [0, 1, 2, 3, 4, 5, 6, 7, 8] };

const imageOf = ({ palette: imagePalette, display = 'direct', opacity, indices }: Spec): ImagePayload => {
  const opaque = opacity.every(row => !row.includes('0'));
  return readImagePayload(encodeImagePayload({
    width: opacity[0].length, height: opacity.length, palette: imagePalette, display,
    indices: Uint8Array.from(indices), mask: opaque ? null : packMask(opacity),
  }), 1);
};

interface Placed {
  readonly spec: Spec;
  readonly x: number;
  readonly y: number;
}

const FRAME = { width: 8, height: 6 };
// A and B overlap at x 2–3, y 1–2; B and C overlap at (5, 3); C ends exactly at the right and bottom edges.
const PLACED: readonly Placed[] = [{ spec: A, x: 0, y: 0 }, { spec: B, x: 2, y: 1 }, { spec: C, x: 5, y: 3 }];

const layoutOf = (placed: readonly Placed[], frame = FRAME): LayoutPayload => readLayoutPayload(encodeLayoutPayload({
  frame, elements: placed.map(({ spec, x, y }) => ({ image: spec.id, x, y })),
}), 1);

const imagesOf = (specs: readonly Spec[]) => new Map(specs.map(spec => [spec.id, imageOf(spec)]));
const palettesOf = (...ids: AssetId[]) => new Map(ids.map(id => [id, palette(id)]));

/** The expected composition, computed directly: the last element whose opaque pixel covers a frame pixel decides it. */
function expected(placed: readonly Placed[], frame = FRAME): number[] {
  const out: number[] = [];
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      let colour = [0, 0, 0, 0];
      for (const { spec, x: left, y: top } of placed) {
        const [column, row] = [x - left, y - top];
        if (row < 0 || row >= spec.opacity.length || column < 0 || column >= spec.opacity[0].length) continue;
        if (spec.opacity[row][column] === '1') colour = [...COLOURS[spec.palette][spec.indices[row * spec.opacity[0].length + column]], 255];
      }
      out.push(...colour);
    }
  }
  return out;
}

const pixelAt = (rgba: Uint8Array, x: number, y: number) => [...rgba.subarray((y * FRAME.width + x) * 4, (y * FRAME.width + x) * 4 + 4)];

describe('layout composition', () => {
  it('stacks elements in draw order with opaque pixels covering, transparent ones keeping and uncovered ones (0, 0, 0, 0)', () => {
    const result = composeLayout(layoutOf(PLACED), imagesOf([A, B, C]), palettesOf(PA, PB));
    expect([result.width, result.height]).toEqual([8, 6]);
    expect(result.rgba).toHaveLength(8 * 6 * 4);
    expect([...result.rgba]).toEqual(expected(PLACED));
    expect(pixelAt(result.rgba, 2, 1)).toEqual([...COLOURS[PA][13], 255]);
    expect(pixelAt(result.rgba, 3, 1)).toEqual([...COLOURS[PA][8], 255]);
    expect(pixelAt(result.rgba, 2, 2)).toEqual([...COLOURS[PA][11], 255]);
    expect(pixelAt(result.rgba, 5, 3)).toEqual([...COLOURS[PB][0], 255]);
    expect(pixelAt(result.rgba, 7, 5)).toEqual([...COLOURS[PB][8], 255]);
    expect(pixelAt(result.rgba, 4, 1)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(result.rgba, 7, 0)).toEqual([0, 0, 0, 0]);
  });

  it('lets a later element cover an earlier one only where the later one is opaque', () => {
    const reversed = [PLACED[1], PLACED[0], PLACED[2]];
    const result = composeLayout(layoutOf(reversed), imagesOf([A, B, C]), palettesOf(PA, PB));
    expect([...result.rgba]).toEqual(expected(reversed));
    expect(pixelAt(result.rgba, 2, 1)).toEqual([...COLOURS[PA][7], 255]);
  });

  it('colours a nearest-display element exactly as expandImage does', () => {
    const nearest: Spec = { ...C, id: readAssetId('image/synthetic-d'), palette: PA, display: { nearest: PB } };
    const placed = [{ spec: A, x: 0, y: 0 }, { spec: nearest, x: 4, y: 2 }];
    const images = imagesOf([A, nearest]);
    const result = composeLayout(layoutOf(placed), images, palettesOf(PA, PB));
    const alone = expandImage(images.get(nearest.id)!, palettesOf(PA, PB));
    for (let row = 0; row < 3; row++) {
      expect([...result.rgba.subarray(((2 + row) * 8 + 4) * 4, ((2 + row) * 8 + 7) * 4)]).toEqual([...alone.rgba.subarray(row * 12, row * 12 + 12)]);
    }
  });

  it('returns the same bytes in a new frozen result on every call without changing its inputs', () => {
    const [layout, images, palettes] = [layoutOf(PLACED), imagesOf([A, B, C]), palettesOf(PA, PB)];
    const snapshot = () => [...images.values()].map(({ indices, mask }) => [[...indices], [...(mask ?? [])]])
      .concat([...palettes.values()].map(({ entries }) => [[...entries]]));
    const before = snapshot();
    const [first, second] = [composeLayout(layout, images, palettes), composeLayout(layout, images, palettes)];
    expect(first).toEqual(second);
    expect(first.rgba.buffer).not.toBe(second.rgba.buffer);
    expect(Object.isFrozen(first)).toBe(true);
    expect(snapshot()).toEqual(before);
    first.rgba.fill(1);
    expect([...composeLayout(layout, images, palettes).rgba]).toEqual(expected(PLACED));
  });

  it.each<[string, readonly Placed[], string]>([
    ['one column past the right edge', [PLACED[0], PLACED[1], { spec: C, x: 6, y: 3 }], 'layout.elements[2]'],
    ['one row past the bottom edge', [PLACED[0], PLACED[1], { spec: C, x: 5, y: 4 }], 'layout.elements[2]'],
    ['an earlier element past the edge', [{ spec: A, x: 5, y: 0 }, PLACED[1], PLACED[2]], 'layout.elements[0]'],
  ])('reports layout-out-of-frame for %s', (_, placed, path) => {
    expectContractError(() => composeLayout(layoutOf(placed), imagesOf([A, B, C]), palettesOf(PA, PB)), 'layout-out-of-frame', path);
  });

  it('reports layout-out-of-frame under the given path', () => {
    const placed = [{ spec: A, x: 5, y: 0 }];
    expectContractError(() => composeLayout(layoutOf(placed), imagesOf([A]), palettesOf(PA), 'front'), 'layout-out-of-frame', 'front.elements[0]');
  });

  it.each<[string, () => Map<AssetId, ImagePayload>]>([
    ['a missing image', () => imagesOf([A, C])],
    ['an extra image', () => imagesOf([A, B, C, { ...C, id: readAssetId('image/synthetic-e') }])],
    ['another image in place of one drawn', () => imagesOf([A, { ...B, id: readAssetId('image/synthetic-e') }, C])],
  ])('reports binding-mismatch for %s', (_, images) => {
    expectContractError(() => composeLayout(layoutOf(PLACED), images(), palettesOf(PA, PB)), 'binding-mismatch', 'images');
  });

  it.each<[string, () => Map<AssetId, PalettePayload>]>([
    ['a missing palette', () => palettesOf(PA)],
    ['an extra palette', () => palettesOf(PA, PB, PC)],
    ['another palette in place of one referenced', () => palettesOf(PA, PC)],
  ])('reports binding-mismatch for %s', (_, palettes) => {
    expectContractError(() => composeLayout(layoutOf(PLACED), imagesOf([A, B, C]), palettes()), 'binding-mismatch', 'palettes');
  });

  it('keeps the P2-05 code for an index outside the palette, at the image Asset ID', () => {
    const palettes = new Map([[PA, palette(PA)], [PB, palette(PB, 4)]]);
    expectContractError(() => composeLayout(layoutOf(PLACED), imagesOf([A, B, C]), palettes), 'palette-index-out-of-range', 'images[image/synthetic-c].indices');
  });

  it('processes elements in draw order, so the first failing element decides the error', () => {
    const palettes = new Map([[PA, palette(PA)], [PB, palette(PB, 4)]]);
    const indexFirst = [PLACED[0], PLACED[2], { spec: B, x: 5, y: 1 }];
    expectContractError(() => composeLayout(layoutOf(indexFirst), imagesOf([A, B, C]), palettes), 'palette-index-out-of-range', 'images[image/synthetic-c].indices');
    const frameFirst = [{ spec: B, x: 5, y: 1 }, PLACED[0], PLACED[2]];
    expectContractError(() => composeLayout(layoutOf(frameFirst), imagesOf([A, B, C]), palettes), 'layout-out-of-frame', 'layout.elements[0]');
  });
});
