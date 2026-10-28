import { describe, expect, it } from 'vitest';
import type { AssetId } from '../../../content/asset-id.ts';
import { composeLayout } from '../../../content/graphics/compose-layout.ts';
import type { CharMapEntry } from '../../../content/graphics/font-payload.ts';
import type { ImagePayload } from '../../../content/graphics/image-payload.ts';
import type { LayoutPayload } from '../../../content/graphics/layout-payload.ts';
import type { PalettePayload } from '../../../content/graphics/palette-payload.ts';
import type { CockpitInstruments } from '../../../content/hud/instruments-payload.ts';
import type { Projection } from '../../../core/projections/projection.ts';
import { SUBSYSTEM_COUNT } from '../../../core/world/entity-table.ts';
import { createCornerGauges } from '../gauges/corner-gauges.ts';
import type { CockpitModule, CockpitPresentation } from '../presentation/cockpit-contract.ts';
import { PresentationError } from '../presentation/cockpit-limits.ts';
import {
  cockpitBatch, cockpitContent, cockpitTick, createTestPresentation, FLIGHT_VIEW, MAP_VIEW, viewSwitched, type DeepPartial,
} from '../presentation/cockpit.test-support.ts';
import { createRadar } from '../radar/radar.ts';
import { radarGeometry } from '../radar/radar-geometry.ts';
import { hudFont } from '../raster/glyph-text.ts';
import { resolveRows } from '../raster/indexed-surface.ts';
import { createCockpitFrame, type CockpitFrameInput } from './cockpit-frame.ts';

// docs/original/formats/cockpit.md (element, group palette and drawing; Confirmed, EXE): raw elements are opaque with
// index 0 included, sprites write their opaque runs; pass 0 before the records, pass 1 after; +48 = 0 only in a full
// redraw. The static region (outside every instrument rectangle) must equal the production layout composition.
// Synthetic images and palette only.

const PALETTE_ID = 'palette/synthetic/cockpit' as AssetId;
const PALETTE: PalettePayload = Object.freeze({ kind: 'palette', entries: new Uint8Array(Array.from({ length: 32 * 3 }, (_, i) => (i * 37 + 11) & 0xff)) });
const id = (value: string): AssetId => value as AssetId;

/** A synthetic image; `opaque(x, y)` builds a mask unless every pixel is opaque (a raw element). */
function image(width: number, height: number, index: (x: number, y: number) => number, opaque?: (x: number, y: number) => boolean): ImagePayload {
  const indices = new Uint8Array(width * height);
  const stride = (width + 7) >> 3;
  const mask = opaque ? new Uint8Array(stride * height) : null;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isOpaque = opaque?.(x, y) ?? true;
      indices[y * width + x] = isOpaque ? index(x, y) : 0;
      if (mask && isOpaque) mask[y * stride + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return Object.freeze({ kind: 'image', width, height, palette: PALETTE_ID, display: 'direct', indices, mask });
}

const IMAGES = new Map<AssetId, ImagePayload>([
  // The raw bottom panel, index 0 included.
  [id('image/synthetic/front-panel'), image(640, 164, (x, y) => (x * 7 + y * 3) % 31)],
  // A strut sprite in the viewport.
  [id('image/synthetic/front-frame'), image(40, 300, (x, y) => 1 + ((x + y) % 30), (x, y) => (x + 2 * y) % 5 !== 0)],
  // A pass-1 sight over the radar's disc.
  [id('image/synthetic/front-sight'), image(21, 21, () => 30, (x, y) => x === 10 || y === 10)],
  [id('image/synthetic/map-border'), image(640, 48, (x, y) => (x + y) % 29)],
  [id('image/synthetic/map-legend'), image(100, 20, (x) => 2 + (x % 20), (x, y) => (x * y) % 3 !== 1)],
]);

const layout = (elements: readonly (readonly [string, number, number])[]): LayoutPayload =>
  Object.freeze({ kind: 'layout', frame: Object.freeze({ width: 640, height: 480 }), elements: Object.freeze(elements.map(([image, x, y]) => Object.freeze({ image: id(image), x, y }))) });

const FRONT = layout([['image/synthetic/front-panel', 0, 316], ['image/synthetic/front-frame', 600, 10], ['image/synthetic/front-sight', 310, 390]]);
const MAP = layout([['image/synthetic/map-border', 0, 0], ['image/synthetic/map-legend', 10, 450]]);
const LAYOUTS = new Map([[id('layout/cockpit/front'), FRONT], [id('layout/map/frame'), MAP]]);

const frameInput = (content = cockpitContent(), patch: Partial<CockpitFrameInput> = {}): CockpitFrameInput => ({ content, layouts: LAYOUTS, images: IMAGES, ...patch });

const LABELS = { 0: 'S0', 1: 'S1', 2: 'S2', 3: 'S3' } as const;
const blank = hudFont(Object.freeze({
  kind: 'font', cellWidth: 8, height: 8, glyphRows: 8, glyphs: new Uint8Array(128 * 8),
  charMap: Object.freeze([...new Set(Object.values(LABELS).join(''))].sort().map((code): CharMapEntry => ({ code: code.charCodeAt(0), glyph: code.charCodeAt(0) }))),
}), 8, false);

function playerPatch(tick: number): DeepPartial<Projection> {
  return {
    flight: {
      motion: { player: { entityId: 1, speed: 40 + tick, commandedSpeed: 50, maximumSpeed: 100, recordMaximumSpeed: 100 } },
      combat: {
        player: {
          entityId: 1, subsystems: Array(SUBSYSTEM_COUNT).fill(0),
          resources: { energy: { current: 70, maximum: 100 }, shield: { current: 20, maximum: 100 } },
          radar: { status: 0, contacts: [{ entityId: 2, offset: { x: 100, y: 0, z: 0 }, position: { x: 100, y: 0, z: 0 }, class: 'hostile', missile: false, near: false, target: false }] },
        },
      },
    },
  } as DeepPartial<Projection>;
}

/** A presentation of the frame, the corner gauges and the radar, with every other type a no-op. */
function start(options: { readonly content?: CockpitInstruments; readonly viewMode?: number; readonly painted?: number[] } = {}): CockpitPresentation {
  const content = options.content ?? cockpitContent();
  const frame = createCockpitFrame(frameInput(content));
  const counted: CockpitModule = {
    ...frame,
    paintElement: (context, element, index) => {
      options.painted?.push(index);
      return frame.paintElement!(context, element, index);
    },
  };
  const modules = [counted, createCornerGauges({ font: blank, labels: LABELS }), createRadar()];
  return createTestPresentation({ modules, content, viewMode: options.viewMode });
}

/** Pixels of S that differ from the composition where the composition is opaque, outside `excluded`. */
function staticDifferences(presentation: CockpitPresentation, layoutPayload: LayoutPayload, excluded: readonly { x0: number; y0: number; x1: number; y1: number }[]): string[] {
  const images = new Map(layoutPayload.elements.map(({ image: imageId }) => [imageId, IMAGES.get(imageId)!]));
  const composed = composeLayout(layoutPayload, images, new Map([[PALETTE_ID, PALETTE]]));
  const shown = new Uint8Array(640 * 480 * 4);
  resolveRows(presentation.surfaces().screen, PALETTE, shown);
  const differences: string[] = [];
  for (let y = 0; y < 480; y++) {
    for (let x = 0; x < 640; x++) {
      const at = (y * 640 + x) * 4;
      if (composed.rgba[at + 3] !== 255 || excluded.some((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1)) continue;
      if ([0, 1, 2].some((c) => composed.rgba[at + c] !== shown[at + c])) differences.push(`${x},${y}`);
    }
  }
  return differences;
}

const pixel = (presentation: CockpitPresentation, x: number, y: number, surface: 'back' | 'screen' = 'screen'): number => presentation.surfaces()[surface].indices[y * 640 + x];

describe('frame input', () => {
  it('checks every slot’s layout and images before anything is drawn', () => {
    const cases: [Partial<CockpitFrameInput>, string][] = [
      [{ layouts: new Map([[id('layout/map/frame'), MAP]]) }, 'cockpit.frame.slots[0].layout'],
      [{ layouts: new Map([[id('layout/cockpit/front'), layout([['image/synthetic/front-panel', 0, 316]])], [id('layout/map/frame'), MAP]]) }, 'cockpit.frame.slots[0].elements'],
      [{ layouts: new Map([[id('layout/cockpit/front'), layout([['image/synthetic/front-panel', 0, 316], ['image/synthetic/front-sight', 600, 10], ['image/synthetic/front-sight', 310, 390]])], [id('layout/map/frame'), MAP]]) }, 'cockpit.frame.slots[0].elements[1]'],
      [{ images: new Map([...IMAGES].filter(([key]) => key !== 'image/synthetic/map-legend')) }, 'cockpit.frame.slots[2].elements[1]'],
      [{ images: new Map([...IMAGES, [id('image/synthetic/front-frame'), { ...IMAGES.get(id('image/synthetic/front-frame'))!, display: { nearest: PALETTE_ID } }]]) }, 'cockpit.frame.slots[0].elements[1]'],
      [{ layouts: new Map([[id('layout/cockpit/front'), layout([['image/synthetic/front-panel', 0, 317], ['image/synthetic/front-frame', 600, 10], ['image/synthetic/front-sight', 310, 390]])], [id('layout/map/frame'), MAP]]) }, 'cockpit.frame.slots[0].elements[0]'],
    ];
    for (const [patch, path] of cases) {
      let error: unknown;
      try {
        createCockpitFrame(frameInput(cockpitContent(), patch));
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(PresentationError);
      expect(error).toMatchObject({ kind: 'invalid-input', path });
    }
  });
});

describe('front cockpit (slot 0)', () => {
  const content = cockpitContent();
  // The radar's disc spans reach one column past a rectangle whose width is odd and the smaller side (hud §4.3).
  const radar = content.slots[0].instruments.find(({ type }) => type === 5)!;
  const rectangles = [
    ...content.slots[0].instruments.map(({ rectangle }) => rectangle),
    ...radarGeometry(radar.rectangle).spans.map(({ y, x0, x1 }) => ({ x0, y0: y, x1, y1: y })),
  ];

  it('shows the composition everywhere outside the instrument rectangles, and the instruments within their copy areas', () => {
    const presentation = start({ content });
    presentation.advance(cockpitBatch([cockpitTick(1, { patch: playerPatch(1) })]));
    expect(staticDifferences(presentation, FRONT, rectangles)).toEqual([]);
    // Negative control: shifting the panel by one row breaks the static region.
    const shifted = layout([['image/synthetic/front-panel', 0, 315], ['image/synthetic/front-frame', 600, 10], ['image/synthetic/front-sight', 310, 390]]);
    expect(staticDifferences(presentation, shifted, rectangles).length).toBeGreaterThan(1000);
    // The radar's copied disc replaced the panel at (300, 400); its spans end before x = 261 on row 343.
    expect(pixel(presentation, 300, 400)).toBe(0);
    expect(pixel(presentation, 261, 343)).toBe((261 * 7 + (343 - 316) * 3) % 31);
  });

  it('draws the pass-1 element after the records and copies it, over the radar', () => {
    const presentation = start({ content });
    presentation.advance(cockpitBatch([cockpitTick(1, { patch: playerPatch(1) })]));
    // The sight's opaque cross at (320, 400) ± 10 covers the radar's centre pixel and rings; its transparent pixels
    // leave what the radar drew.
    expect(pixel(presentation, 320, 400)).toBe(30);
    expect(pixel(presentation, 320, 342 + 48)).toBe(30);
    expect(pixel(presentation, 349, 400)).toBe(0x0d);
    expect(pixel(presentation, 311, 391)).toBe(0);
  });

  it('paints the +48 = 0 panel only in a full redraw and keeps it on the screen between redraws', () => {
    const painted: number[] = [];
    const presentation = start({ content, painted });
    for (let tick = 1; tick <= 6; tick++) presentation.advance(cockpitBatch([cockpitTick(tick, { patch: playerPatch(tick) })]));
    expect(painted).toEqual([0, 1, 2, ...Array(5).fill([1, 2]).flat()]);
    expect(staticDifferences(presentation, FRONT, rectangles)).toEqual([]);
    // Inside the shield gauge's rectangle but outside its copied shape the panel stays.
    expect(pixel(presentation, 596, 470)).toBe((596 * 7 + (470 - 316) * 3) % 31);
    // A view switch to the same view clears S and repaints the panel.
    painted.length = 0;
    presentation.advance(cockpitBatch([cockpitTick(7, { patch: playerPatch(7), events: [viewSwitched(7, FLIGHT_VIEW, FLIGHT_VIEW)] })]));
    expect(painted).toEqual([0, 1, 2]);
    expect(staticDifferences(presentation, FRONT, rectangles)).toEqual([]);
  });

  it('writes a raw element’s index 0 and only a sprite’s opaque pixels', () => {
    const presentation = start({ content });
    presentation.advance(cockpitBatch([cockpitTick(1, { patch: playerPatch(1) })]));
    // Panel (0, 316) has index 0 and is written (covered); the strut's transparent (600, 10) stays uncovered.
    const { back } = presentation.surfaces();
    const covered = (x: number, y: number): boolean => (back.coverage![y * 80 + (x >> 3)] & (0x80 >> (x & 7))) !== 0;
    expect([pixel(presentation, 0, 316, 'back'), covered(0, 316)]).toEqual([0, true]);
    expect([covered(600, 10), covered(601, 10)]).toEqual([false, true]);
    expect(pixel(presentation, 601, 10)).toBe(1 + (1 % 30));
  });
});

describe('map frame (slot 2)', () => {
  it('paints both pass-1 elements every frame over a cleared screen, equal to the composition', () => {
    const painted: number[] = [];
    const presentation = start({ viewMode: MAP_VIEW, painted });
    for (let tick = 1; tick <= 3; tick++) presentation.advance(cockpitBatch([cockpitTick(tick, { viewMode: MAP_VIEW, patch: playerPatch(tick) })]));
    expect(painted).toEqual([0, 1, 0, 1, 0, 1]);
    expect(staticDifferences(presentation, MAP, [])).toEqual([]);
    // Transparent legend pixels are index 0 in the map view: B is cleared every display.
    expect(pixel(presentation, 11, 451)).toBe(0);
  });
});
