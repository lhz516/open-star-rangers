import type { CharMapEntry, FontPayload } from '../../../content/graphics/font-payload.ts';
import type { ImagePayload } from '../../../content/graphics/image-payload.ts';
import type { AssetId } from '../../../content/asset-id.ts';
import { readHudText } from '../../../content/hud/hud-text-payload.ts';
import { syntheticHudText } from '../../../content/hud/hud-text.test-support.ts';
import type { StatusMessagesPayload } from '../../../content/hud/status-messages-payload.ts';
import type { CombatPlayer, Projection } from '../../../core/projections/projection.ts';
import { createDisplayInterference, type DisplayInterference } from '../interference/display-interference.ts';
import type { CockpitDrawContext } from '../presentation/cockpit-contract.ts';
import { createTestPresentation, syntheticProjection, type DeepPartial, type TestPresentationOptions } from '../presentation/cockpit.test-support.ts';
import { fillRect } from '../raster/indexed-surface.ts';
import { createLeftDisplay, type InjectedLeftPage, type LeftDisplayModule, type LeftPageDrawer, type LeftPageDrawers } from './left-display.ts';
import type { LeftDisplayContent } from './left-display-content.ts';

// Code-generated synthetic content for the left display and the interference picture; never original data. Every
// image has its own index range so a pixel tells which image (and which row) it came from.

const PALETTE = 'palette/flight/cockpit-hud-map' as AssetId;

/** A direct, opaque image whose pixel (x, y) is `pixel(x, y)`. */
export function syntheticImage(width: number, height: number, pixel: (x: number, y: number) => number): ImagePayload {
  const indices = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) indices[y * width + x] = pixel(x, y);
  return Object.freeze({ kind: 'image', width, height, palette: PALETTE, display: 'direct', indices, mask: null });
}

/** Status background k: index 0x30 + k with an index-0 diagonal, so the opaque copy is visible. */
export const statusBackground = (k: number): ImagePayload => syntheticImage(96, 96, (x, y) => (x === y ? 0 : 0x30 + k));

/** The rows and columns of field i's overlay block (0x40 + i, elsewhere 0); blocks 0 and 1 overlap in columns 4–11. */
export const OVERLAY_ROWS = Object.freeze({ top: 10, bottom: 20 });
export const overlayColumns = (field: number): { readonly left: number; readonly right: number } => ({ left: 4 * field, right: 4 * field + 11 });
export function statusOverlay(field: number): ImagePayload {
  const { left, right } = overlayColumns(field);
  return syntheticImage(96, 96, (x, y) => (y >= OVERLAY_ROWS.top && y <= OVERLAY_ROWS.bottom && x >= left && x <= right ? 0x40 + field : 0));
}

/** Level L's gauge record: (10 + L) × 6, row-varying indices with some colour-key zeros. */
export const levelImage = (level: number): ImagePayload =>
  syntheticImage(10 + level, 6, (x, y) => ((x + 3 * y) % 5 === 1 ? 0 : 0x60 + 4 * level + (y % 4)));

export const pageBackground = (): ImagePayload => syntheticImage(96, 96, (x, y) => ((x + y) % 7 === 0 ? 0 : 0x50 + (y % 3)));

/** SNIP frame f: index 0x70 + f, row 0 index 0x7f. */
export const interferenceFrames = (count = 9): ImagePayload[] =>
  Array.from({ length: count }, (_, frame) => syntheticImage(96, 96, (_x, y) => (y === 0 ? 0x7f : 0x70 + frame)));

/** An 8-row font over `codes` whose glyph c has the distinct rows of `glyphRow(c, row)`; space is empty. */
function syntheticFont(codes: readonly number[], cellWidth: number, height: number): FontPayload {
  const glyphRows = 8;
  const glyphs = new Uint8Array(256 * glyphRows);
  for (const code of codes) {
    if (code === 0x20) continue;
    for (let row = 0; row < glyphRows; row++) glyphs[code * glyphRows + row] = (code * 29 + row * 53) & 0xff | 0x01;
  }
  const charMap: CharMapEntry[] = [...codes].sort((a, b) => a - b).map((code) => Object.freeze({ code, glyph: code }));
  return Object.freeze({ kind: 'font', cellWidth, height, glyphRows, glyphs, charMap: Object.freeze(charMap) });
}

const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, at) => from + at);

/** fonts/0: printable ASCII, cell width 8, height 8. */
export const regularFont = (): FontPayload => syntheticFont(range(0x20, 0x7e), 8, 8);
/** fonts/1: printable ASCII without a–z (it upper-cases them), height 7 so the line pitch is not 8. */
export const smallFont = (): FontPayload => syntheticFont([...range(0x20, 0x60), ...range(0x7b, 0x7e)], 8, 7);

export const SYNTHETIC_RATINGS = Object.freeze([
  { text: 'wreck', maximum: 26 }, { text: 'poor', maximum: 20 }, { text: 'fair', maximum: 16 }, { text: 'good', maximum: 10 }, { text: 'best', maximum: 0 },
].map((rating) => Object.freeze(rating)));

/** Synthetic DIAG texts: formats with the shipped conversions, short timings. */
export function statusMessages(patch: Partial<StatusMessagesPayload> = {}): StatusMessagesPayload {
  return Object.freeze({
    upper: Object.freeze({ characterTicks: 4, holdTicks: 6 }),
    lower: Object.freeze({ characterTicks: 0, holdTicks: 2 }),
    statusFormats: Object.freeze(['S%d%%', 'H%d%%\nok', 'R%s', 'E%d']),
    ratings: SYNTHETIC_RATINGS,
    subsystemNames: Object.freeze(range(0, 14).map((index) => `n${index}`)),
    stateWords: Object.freeze(['ok', 'hit', 'dead']),
    subsystemFormat: '%s\n%s',
    startupMessages: Object.freeze(['boot\nup', 'go']),
    ...patch,
  });
}

export function leftDisplayContent(patch: Partial<LeftDisplayContent> = {}): LeftDisplayContent {
  return Object.freeze({
    statusBackgrounds: Object.freeze([0, 1, 2].map(statusBackground)),
    statusOverlays: Object.freeze(range(0, 8).map(statusOverlay)),
    statusMessages: statusMessages(),
    pageBackground: pageBackground(),
    levelImages: Object.freeze([0, 1, 2, 3].map(levelImage)),
    hudText: readHudText(syntheticHudText('e')),
    fonts: Object.freeze({ regular: regularFont(), small: smallFont() }),
    ...patch,
  });
}

/** One call of a recording page drawer. */
export interface PageCall {
  readonly page: InjectedLeftPage;
  readonly tick: number;
  /** The slot's always-redraw flag the drawer saw. */
  readonly forced: boolean;
}

/** A stub drawer of `page`: fills the rectangle below row y0 with the marker 0xA0 + page, publishes unless forced, logs. */
export function recordingDrawer(page: InjectedLeftPage, log: PageCall[]): LeftPageDrawer {
  return (context: CockpitDrawContext, { rectangle }) => {
    const forced = context.layout.slot?.alwaysRedraw === true;
    log.push({ page, tick: context.tick, forced });
    fillRect(context.back, rectangle.x0, rectangle.y0 + 1, rectangle.x1, rectangle.y1, 0xa0 + page);
    if (!forced) context.publish(rectangle);
    return true;
  };
}

/** Stub drawers for pages 2–6. */
export function recordingPages(log: PageCall[] = []): LeftPageDrawers {
  return Object.freeze({ 2: recordingDrawer(2, log), 3: recordingDrawer(3, log), 4: recordingDrawer(4, log), 5: recordingDrawer(5, log), 6: recordingDrawer(6, log) });
}

/** A player whose combat readings the left display reads; every other field is a placeholder. */
export function syntheticPlayer(patch: Partial<CombatPlayer> = {}): CombatPlayer {
  return {
    entityId: 1,
    destroyed: false,
    targetMode: 0,
    target: null,
    radar: { status: 0, contacts: [] },
    resources: {
      energy: { current: 500, maximum: 1000 },
      shield: { current: 800, maximum: 1000 },
      charge: { current: 300, maximum: 600 },
      hull: { current: 900, maximum: 1000 },
      'spare-power': { current: 40, maximum: 100 },
    },
    allocation: { shieldLevel: 1, chargeLevel: 2 },
    weapons: [] as unknown as CombatPlayer['weapons'],
    lock: { level: 0, losing: false, progress: 0 },
    subsystems: Array<0>(19).fill(0),
    leftPage: 0,
    warp: { indicator: false, page: null },
    statusDisplay: { blink: 0, rebuilds: 0 },
    energyPageRedraws: 0,
    ...patch,
  } as unknown as CombatPlayer;
}

/** The projection patch that places `player` (null: none). */
export const withPlayer = (player: CombatPlayer | null): DeepPartial<Projection> => ({ flight: { combat: { player } } }) as DeepPartial<Projection>;

export interface LeftDisplayFixture {
  readonly display: LeftDisplayModule;
  readonly interference: DisplayInterference;
  readonly presentation: ReturnType<typeof createTestPresentation>;
  readonly pageCalls: PageCall[];
}

/** A presentation with the left display (type 6) and a support module for every other type, at tick 0 with `player`. */
export function leftDisplayFixture({
  player = syntheticPlayer(), display: content = leftDisplayContent(), interference = createDisplayInterference(interferenceFrames()), pages, pageCalls = [], ...options
}: Omit<TestPresentationOptions, 'modules' | 'patch'> & {
  readonly player?: CombatPlayer | null;
  /** The left display's content (`content` is the instruments content). */
  readonly display?: LeftDisplayContent;
  readonly interference?: DisplayInterference;
  readonly pages?: LeftPageDrawers;
  readonly pageCalls?: PageCall[];
} = {}): LeftDisplayFixture {
  const patch = withPlayer(player);
  const initial = syntheticProjection(0, options, patch);
  const module = createLeftDisplay({ content, interference, pages: pages ?? recordingPages(pageCalls), initial });
  const presentation = createTestPresentation({ ...options, patch, modules: [module] });
  return { display: module, interference, presentation, pageCalls };
}
