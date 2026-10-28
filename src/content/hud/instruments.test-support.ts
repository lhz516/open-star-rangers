import type { AssetId } from '../asset-id.ts';
import type { LayoutPayload } from '../graphics/layout-payload.ts';
import type { CockpitInstrumentAssets, CockpitInstruments } from './instruments-payload.ts';
import type { MapGeometry } from './map-geometry-payload.ts';

// Code-generated synthetic cockpit instruments; the values are not the original records'. Slot 0 keeps a source order
// other than ascending type order, every element is pass 0 or an every-frame pass-1 element, and the type-10 record of
// slot 2 agrees with `syntheticInstrumentAssets`' map geometry.

/** Content shape with every field writable and every leaf widened, so tests can break any field. */
type Loose<T> = T extends string ? string : T extends number ? number : T extends boolean ? boolean
  : T extends readonly (infer Item)[] ? Loose<Item>[] : T extends object ? { -readonly [Key in keyof T]: Loose<T[Key]> } : T;

export type MutableCockpitInstruments = Loose<CockpitInstruments>;

const record = (type: number, rectangle: readonly [number, number, number, number], redrawInterval = 0, drawParam = 0, params: number[] = []) => {
  const [x0, y0, x1, y1] = rectangle;
  return { type, rectangle: { x0, y0, x1, y1 }, redrawInterval, drawParam, params };
};

/** Fresh mutable synthetic content that readCockpitInstruments accepts. */
export function syntheticCockpitInstruments(): MutableCockpitInstruments {
  return {
    slots: [
      {
        slot: 0, layoutNumber: 0, alwaysRedraw: false, layout: 'layout/cockpit/front',
        elements: [
          { image: 'image/synthetic/front-panel', pass: 0, everyFrame: false },
          { image: 'image/synthetic/front-frame', pass: 0, everyFrame: true },
          { image: 'image/synthetic/front-sight', pass: 1, everyFrame: true },
        ],
        instruments: [
          record(0, [4, 320, 40, 470], 7, 21, [2]),
          record(1, [600, 320, 636, 470], 9, 22, []),
          record(2, [44, 400, 80, 470], 0, 23, [-5]),
          record(3, [560, 400, 596, 470], 0, 24, [0]),
          record(5, [260, 330, 380, 470], 3),
          record(7, [491, 346, 586, 442], 11),
          record(8, [100, 300, 540, 315]),
          record(6, [120, 340, 219, 439]),
          record(9, [230, 450, 410, 465], 0, 0, [230, 300, 340, 410]),
          record(12, [300, 466, 340, 476]),
        ],
      },
      {
        slot: 2, layoutNumber: 6, alwaysRedraw: false, layout: 'layout/map/frame',
        elements: [
          { image: 'image/synthetic/map-border', pass: 1, everyFrame: true },
          { image: 'image/synthetic/map-legend', pass: 1, everyFrame: true },
        ],
        instruments: [record(10, [13, 37, 503, 337], 0), record(8, [30, 460, 212, 476])],
      },
      { slot: 7, layoutNumber: 8, alwaysRedraw: true, layout: null, elements: [], instruments: [record(8, [30, 460, 212, 476])] },
    ],
    targetViewDistances: Array.from({ length: 20 }, (_, index) => 12.5 * (index + 1)),
  };
}

const layoutOf = ({ elements }: MutableCockpitInstruments['slots'][number]): LayoutPayload => ({
  kind: 'layout',
  frame: { width: 640, height: 480 },
  elements: elements.map(({ image }, index) => ({ image: image as AssetId, x: index, y: index })),
});

/** The layouts and map geometry that `content` (by default the synthetic content) passes checkCockpitInstruments with. */
export function syntheticInstrumentAssets(content = syntheticCockpitInstruments()): CockpitInstrumentAssets {
  const [front, map] = content.slots;
  const { rectangle, redrawInterval } = map.instruments.find(({ type }) => type === 10)!;
  const mapGeometry: MapGeometry = { rectangle: { ...rectangle }, redrawInterval, informationLineHeight: 7 };
  return { front: layoutOf(front), mapFrame: layoutOf(map), mapGeometry };
}
