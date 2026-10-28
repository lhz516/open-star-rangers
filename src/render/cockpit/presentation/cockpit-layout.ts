/**
 * The layout a view mode selects and the original's clock comparison (docs/plan/p3/13/spec.md, 视角与绘制内容 and
 * D-01 定稿 DC-02/DC-05; docs/original/formats/cockpit.md, instrument records, scheduling and visible persistence).
 */
import type { CockpitInstruments } from '../../../content/hud/instruments-payload.ts';
import type { IndexedSurface, PixelRect } from '../raster/indexed-surface.ts';
import type { CockpitLayout, CockpitView, RowRange } from './cockpit-contract.ts';

/** The first row of the cockpit band in views 0xC and 1; the world viewport ends one row above. */
export const COCKPIT_BAND_TOP = 316;
const LAST_ROW = 479;

const rows = (top: number, bottom: number): RowRange => Object.freeze({ top, bottom });
const BAND = rows(COCKPIT_BAND_TOP, LAST_ROW);
const VIEWPORT = rows(0, COCKPIT_BAND_TOP - 1);
const SCREEN = rows(0, LAST_ROW);

interface ViewRule {
  readonly view: CockpitView;
  /** The directory +0x00 the view's layout carries. */
  readonly layoutNumber: number | null;
  readonly palette: CockpitLayout['palette'];
  readonly screenRows: RowRange | null;
  readonly worldRows: RowRange | null;
}

const VIEW_RULES = new Map<number, ViewRule>([
  [0x0c, { view: 'flight', layoutNumber: 0, palette: 'flight', screenRows: BAND, worldRows: VIEWPORT }],
  [0x01, { view: 'warp', layoutNumber: 0, palette: 'flight', screenRows: BAND, worldRows: VIEWPORT }],
  [0x08, { view: 'map', layoutNumber: 6, palette: 'map', screenRows: SCREEN, worldRows: null }],
  [0x11, { view: 'external', layoutNumber: 8, palette: 'flight', screenRows: null, worldRows: SCREEN }],
  [0x06, { view: 'base', layoutNumber: null, palette: null, screenRows: null, worldRows: null }],
]);
const NONE: ViewRule = { view: 'none', layoutNumber: null, palette: null, screenRows: null, worldRows: null };

/** The layout `viewMode` selects in `content`. */
export function layoutOf(viewMode: number, content: CockpitInstruments): CockpitLayout {
  const { view, layoutNumber, palette, screenRows, worldRows } = VIEW_RULES.get(viewMode) ?? NONE;
  const slot = layoutNumber === null ? null : content.slots.find((candidate) => candidate.layoutNumber === layoutNumber) ?? null;
  return Object.freeze({ viewMode, view, slot, palette, screenRows, worldRows });
}

/** The rows the frame-end copy sends from B to S: the viewport in views 0xC and 1, otherwise the whole screen. */
export const frameEndRows = (view: CockpitView): RowRange => (view === 'flight' || view === 'warp' ? VIEWPORT : SCREEN);

/** Copies the inclusive rectangle of `from` to the same place in `to` (surfaces of one size), clipped to them. */
export function copyRect(from: IndexedSurface, to: IndexedSurface, { x0, y0, x1, y1 }: PixelRect): void {
  const { width, height } = from;
  const [left, right] = [Math.max(x0, 0), Math.min(x1, width - 1)];
  if (left > right) return;
  for (let y = Math.max(y0, 0); y <= Math.min(y1, height - 1); y++) {
    to.indices.set(from.indices.subarray(y * width + left, y * width + right + 1), y * width + left);
  }
}

/** The original's due comparison: `clock − since` as u32 strictly greater than `interval`. */
export const clockExceeds = (clock: number, since: number, interval: number): boolean => ((clock - since) >>> 0) > interval;
