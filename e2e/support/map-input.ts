import { inflateSync } from 'node:zlib';
import { expect, type CDPSession, type Page } from '@playwright/test';
import { mapCursorShape, MAP_CURSOR_STYLE } from '../../src/render/map/map-cursor.ts';
import type { MapBounds, MapInputGeometry, MapPosition } from '../../src/render/map/map-input-geometry.ts';
import { MAX_PIXEL_RATIO } from '../../src/render/viewport/viewport-layout.ts';

// P3-05 subtask 27: driving the isolated map input entry (`e2e/entries/map-input.html`, whose script documents what is
// synthetic) and reading the cursor back from real screenshots. Every hook call goes through CDP `Runtime.evaluate`
// without a user gesture, because Playwright's own `evaluate` runs as one and would give the page the user activation
// that decides whether gaining map qualification asks for Pointer Lock. Mouse and key input are real browser events.

const ENTRY = '/e2e/entries/map-input.html';
export const ZONE = '[data-testid="game-input-zone"]';

/** As `map-input-entry.test-support.tsx` declares them; the e2e program does not compile that JSX module. */
export type LockMode = 'native' | 'pending' | 'refuse' | 'unsupported';
export type GeometryMode = 'live' | 'null' | 'inverted';

/** The entry's `state()`, as it crosses CDP. */
export interface MapInputEntryState {
  readonly open: boolean;
  readonly phase: string | null;
  readonly context: 'flight' | 'warp' | 'map' | 'base';
  readonly clock: number | null;
  readonly frames: number;
  readonly userActivation: boolean;
  readonly map: { readonly state: string; readonly systemPointerHidden: boolean; readonly error: string | null };
  readonly pointerLock: { readonly state: string; readonly failure: string | null };
  readonly cursor: MapPosition | null;
  readonly requests: number;
  readonly commands: readonly {
    readonly type: string; readonly operation: string | null; readonly right: number | null; readonly down: number | null;
    readonly clock: number; readonly frame: number; readonly id: number | null;
  }[];
  readonly portCalls: readonly string[];
  readonly geometry: MapInputGeometry | null;
  readonly zoneCursor: string;
  readonly errors: readonly string[];
}

/** CDP evaluation in the page without a user gesture; rejects on a protocol error or a thrown exception. */
async function call<T>(cdp: CDPSession, expression: string): Promise<T> {
  const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true, userGesture: false,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  return result.value as T;
}

/** The entry's hooks, called without a user gesture. */
export class MapEntry {
  readonly page: Page;
  readonly cdp: CDPSession;

  private constructor(page: Page, cdp: CDPSession) {
    this.page = page;
    this.cdp = cdp;
  }

  /** Loads the entry, which must show its input zone; nothing is open yet. */
  static async load(page: Page, options: { manual?: boolean } = {}): Promise<MapEntry> {
    await page.goto(options.manual ? `${ENTRY}?manual=1` : ENTRY);
    // Not a locator: its waits evaluate as user gestures too.
    const entry = new MapEntry(page, await page.context().newCDPSession(page));
    await expect.poll(() => entry.call<boolean>(`window.osrMapInput !== undefined && document.querySelector('${ZONE}') !== null`)).toBe(true);
    // Lock changes as the document reports them, recorded by the test from page load on.
    await entry.call(`window.osrLockChanges = []; document.addEventListener('pointerlockchange', () => {
      window.osrLockChanges.push(document.pointerLockElement === document.querySelector('${ZONE}') ? 'zone' : document.pointerLockElement ? 'other' : 'none');
    })`);
    return entry;
  }

  call<T>(expression: string): Promise<T> {
    return call<T>(this.cdp, expression);
  }

  open(lock: LockMode, geometry: GeometryMode = 'live', movementScale = 1): Promise<void> {
    return this.call(`window.osrMapInput.open(${JSON.stringify({ lock, geometry, movementScale })})`);
  }

  state(): Promise<MapInputEntryState> {
    return this.call('window.osrMapInput.state()');
  }

  setContext(context: 'flight' | 'map'): Promise<void> {
    return this.call(`window.osrMapInput.setContext('${context}')`);
  }

  setGeometry(mode: GeometryMode): Promise<void> {
    return this.call(`window.osrMapInput.setGeometry('${mode}')`);
  }

  control(type: 'pause' | 'resume'): Promise<void> {
    return this.call(`window.osrMapInput.control('${type}')`);
  }

  failHovers(count: number): Promise<void> {
    return this.call(`window.osrMapInput.failHovers(${count})`);
  }

  settleLock(answer: 'grant' | 'refuse'): Promise<void> {
    return this.call(`window.osrMapInput.settleLock('${answer}')`);
  }

  retryLock(): Promise<void> {
    return this.call('window.osrMapInput.retryLock()');
  }

  close(): Promise<readonly string[]> {
    return this.call('window.osrMapInput.close()');
  }

  /** Focuses the input zone without a user gesture. */
  focusZone(): Promise<void> {
    return this.call(`document.querySelector('${ZONE}').focus()`);
  }

  blurZone(): Promise<void> {
    return this.call(`document.querySelector('${ZONE}').blur()`);
  }

  /** Sets the input zone's host size, CSS px. */
  resize(width: number, height: number): Promise<void> {
    return this.call(`Object.assign(document.getElementById('root').style, { width: '${width}px', height: '${height}px' })`);
  }

  /** Whether the document's pointer-lock element is the input zone. */
  zoneLocked(): Promise<boolean> {
    return this.call(`document.pointerLockElement === document.querySelector('${ZONE}')`);
  }

  lockChanges(): Promise<string[]> {
    return this.call('window.osrLockChanges');
  }

  /** Waits for the map state, one of `states`, and resolves to the entry state then. */
  async waitForMap(...states: string[]): Promise<MapInputEntryState> {
    let last: MapInputEntryState | null = null;
    try {
      await expect.poll(async () => {
        last = await this.state();
        return states.includes(last.map.state);
      }).toBe(true);
    } catch (cause) {
      throw new Error(`Map state ${states.join(' or ')} not reached; last ${JSON.stringify(last)}`, { cause });
    }
    return last!;
  }

  /**
   * Waits until the map qualifies, and locks it with a click at `at` unless the user activation left by earlier real
   * input had it ask for the lock by itself as it qualified; resolves to the locked state.
   */
  async lock(at = { x: 400, y: 300 }): Promise<MapInputEntryState> {
    const { map } = await this.waitForMap('click-to-lock', 'locking', 'locked');
    if (map.state === 'click-to-lock') await this.page.mouse.click(at.x, at.y);
    return this.waitForMap('locked');
  }

  /** Waits until the run's clock advanced by at least `units` from `after`'s. */
  async advance(units: number, after?: MapInputEntryState): Promise<MapInputEntryState> {
    const from = (after ?? await this.state()).clock ?? 0;
    await expect.poll(async () => (await this.state()).clock ?? -1).toBeGreaterThanOrEqual(from + units);
    return this.state();
  }

  /** Waits until `count` selects the run took exist; resolves to the state then. */
  async selects(count: number): Promise<MapInputEntryState> {
    await expect.poll(async () => selects(await this.state()).length).toBeGreaterThanOrEqual(count);
    return this.state();
  }

  /** Waits until at least `count` more session frames reached the input than `after` had. */
  async frames(count: number, after?: MapInputEntryState): Promise<MapInputEntryState> {
    const from = (after ?? await this.state()).frames;
    await expect.poll(async () => (await this.state()).frames).toBeGreaterThanOrEqual(from + count);
    return this.state();
  }
}

/**
 * Checkpoint K's start, computed here from its definition rather than through `mapStartPosition`: column ⌊(W−1)/2⌋ and
 * row ⌊(H−1)/2⌋ from the screen origin, clamped to the main map's pixels, normalised at the pixel centre.
 */
export function kStart({ left, top, right, bottom }: MapBounds): MapPosition {
  const [width, height] = [right - left, bottom - top];
  const column = Math.min(left + width - 1, Math.max(left, Math.floor((width - 1) / 2)));
  const row = Math.min(top + height - 1, Math.max(top, Math.floor((height - 1) / 2)));
  return { right: (column + 0.5 - left) / width, down: (row + 0.5 - top) / height };
}

/**
 * CSS px from the zone's (and page's) top-left corner of a main-map position; computed here, independently of the
 * production conversion `containerPointOf`.
 */
export function clientPoint({ screen, mainMap, frame }: MapInputGeometry, { right, down }: MapPosition): { x: number; y: number } {
  const x = mainMap.left + right * (mainMap.right - mainMap.left);
  const y = mainMap.top + down * (mainMap.bottom - mainMap.top);
  return { x: frame.left + (x * frame.width) / screen.width, y: frame.top + (y * frame.height) / screen.height };
}

/** The main-map position under a client point, CSS px from the page origin; independent of `mapPositionAt`. */
export function positionAt({ screen, mainMap, frame }: MapInputGeometry, x: number, y: number): MapPosition {
  const logicalX = ((x - frame.left) * screen.width) / frame.width;
  const logicalY = ((y - frame.top) * screen.height) / frame.height;
  return { right: (logicalX - mainMap.left) / (mainMap.right - mainMap.left), down: (logicalY - mainMap.top) / (mainMap.bottom - mainMap.top) };
}

export interface PixelBox {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * Cursor-coloured pixels of a screenshot: how many, the box (inclusive, device px) around all of them, and the centre of
 * the crosshair's bars: the middle of the rows and columns that hold more than half as many as the fullest one.
 */
export interface CursorPixels {
  readonly count: number;
  readonly box: PixelBox | null;
  readonly centre: { readonly x: number; readonly y: number } | null;
}

/** Decodes an 8-bit, non-interlaced RGB or RGBA PNG, as Chrome's screenshots are. */
function decodePng(png: Buffer): { width: number; height: number; channels: number; pixels: Uint8Array } {
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const data: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const body = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const [depth, colour, , , interlace] = body.subarray(8, 13);
      if (depth !== 8 || interlace !== 0 || (colour !== 2 && colour !== 6)) throw new Error(`Unsupported PNG: depth ${depth}, colour ${colour}`);
      channels = colour === 6 ? 4 : 3;
    } else if (type === 'IDAT') {
      data.push(body);
    }
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[y * stride + x - channels] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += Math.floor((a + b) / 2);
      else if (filter === 4) {
        const p = a + b - c;
        const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      pixels[y * stride + x] = value & 0xff;
    }
  }
  return { width, height, channels, pixels };
}

const [CURSOR_R, CURSOR_G, CURSOR_B] = [1, 3, 5].map(index => parseInt(MAP_CURSOR_STYLE.colour.slice(index, index + 2), 16));

/**
 * The cursor colour's pixels in a real screenshot of the page's viewport at device scale, composited as shown.
 * Playwright's screenshot evaluates in the page as a user gesture, so it leaves a user activation; a capture through
 * the test's own CDP session would not, but comes at CSS scale, and with a clip resets the emulated pixel ratio.
 */
export async function cursorPixels({ page }: MapEntry): Promise<CursorPixels> {
  const image = decodePng(await page.screenshot({ scale: 'device' }));
  const { channels, pixels } = image;
  const rows = new Map<number, number>();
  const columns = new Map<number, number>();
  let count = 0;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const at = (y * image.width + x) * channels;
      if (Math.abs(pixels[at] - CURSOR_R) > 24 || Math.abs(pixels[at + 1] - CURSOR_G) > 24 || Math.abs(pixels[at + 2] - CURSOR_B) > 24) continue;
      count += 1;
      rows.set(y, (rows.get(y) ?? 0) + 1);
      columns.set(x, (columns.get(x) ?? 0) + 1);
    }
  }
  if (count === 0) return { count, box: null, centre: null };
  /** The middle of the lines holding more than half the fullest line's pixels, at pixel centres. */
  const bar = (lines: Map<number, number>): number => {
    const fullest = Math.max(...lines.values());
    const bars = [...lines].filter(([, n]) => n > fullest / 2).map(([line]) => line);
    return (Math.min(...bars) + Math.max(...bars) + 1) / 2;
  };
  const ys = [...rows.keys()];
  const xs = [...columns.keys()];
  return {
    count,
    box: { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) },
    centre: { x: bar(columns), y: bar(rows) },
  };
}

/**
 * What the drawer's crosshair at `position` should fill on screen, device px: the box and pixel count of the shape
 * `mapCursorShape` gives for the drawing buffer, placed where Chrome composites the canvas, at its CSS position rounded
 * to a whole CSS pixel, then scaled by the pixel ratio (`e2e/support/viewer-observations.ts`, `bufferPixels`). The
 * input zone is at the page origin.
 */
function expectedCursor(geometry: MapInputGeometry, position: MapPosition, devicePixelRatio: number): { box: PixelBox; count: number } {
  const ratio = Math.min(devicePixelRatio, MAX_PIXEL_RATIO);
  const { frame } = geometry;
  const shape = mapCursorShape(geometry, position, { width: Math.round(frame.width * ratio), height: Math.round(frame.height * ratio) });
  if (!shape) throw new Error('The main map covers no buffer pixel');
  const [x, y] = [Math.round(frame.left) * devicePixelRatio, Math.round(frame.top) * devicePixelRatio];
  const { bounds, fills: [across, down] } = shape;
  const overlap = Math.max(0, Math.min(across.x + across.width, down.x + down.width) - Math.max(across.x, down.x))
    * Math.max(0, Math.min(across.y + across.height, down.y + down.height) - Math.max(across.y, down.y));
  return {
    box: { left: x + bounds.x, top: y + bounds.y, right: x + bounds.x + bounds.width - 1, bottom: y + bounds.y + bounds.height - 1 },
    count: across.width * across.height + down.width * down.height - overlap,
  };
}

/**
 * Expects the screenshot's cursor pixels to be the drawer's crosshair at `position`, and nothing else, so a crosshair
 * left at an earlier position fails:
 * - their box is the shape's, within `tolerance` device px, and so is their count, exactly, unless the compositor
 *   places the canvas at a fraction of a device pixel;
 * - independently of the drawer's arithmetic, the bars cross at the position's client point (`clientPoint`) times the
 *   pixel ratio, within one device pixel plus one CSS pixel's rounding of the canvas position.
 */
export async function expectCursorAt(entry: MapEntry, geometry: MapInputGeometry, position: MapPosition, devicePixelRatio: number, tolerance = 1): Promise<CursorPixels> {
  const expected = expectedCursor(geometry, position, devicePixelRatio);
  const { frame } = geometry;
  const whole = [frame.left, frame.top, frame.width, frame.height].every(value => Number.isInteger(value * devicePixelRatio));
  // A fractional placement blends the bars' edge pixels with the background, out of the colour match.
  const slack = whole ? 0 : Infinity;
  const point = clientPoint(geometry, position);
  // At the right and bottom edges the bars sit on the main map's last whole pixel, within that reach.
  const [cx, cy] = [point.x * devicePixelRatio, point.y * devicePixelRatio];
  const reach = 1 + devicePixelRatio;
  let seen: CursorPixels = { count: 0, box: null, centre: null };
  try {
    await expect.poll(async () => {
      seen = await cursorPixels(entry);
      const { box, centre, count } = seen;
      return box !== null && centre !== null && Math.abs(count - expected.count) <= slack
        && (['left', 'top', 'right', 'bottom'] as const).every(side => Math.abs(box[side] - expected.box[side]) <= tolerance)
        && Math.abs(centre.x - cx) <= reach && Math.abs(centre.y - cy) <= reach;
    }).toBe(true);
  } catch (cause) {
    throw new Error(`Expected the cursor ${JSON.stringify(expected)} crossing at ${cx}, ${cy}; last seen ${JSON.stringify(seen)}`, { cause });
  }
  return seen;
}

/** Expects no cursor pixel anywhere in the viewport. */
export async function expectNoCursor(entry: MapEntry): Promise<void> {
  await expect.poll(async () => (await cursorPixels(entry)).count, { message: 'no cursor pixels' }).toBe(0);
}

/** The map-point commands the run took, in order, as `operation@right,down`. */
export const points = (state: MapInputEntryState): string[] => state.commands
  .filter(({ type, id }) => type === 'map-point' && id !== null)
  .map(({ operation, right, down }) => `${operation}@${right},${down}`);

export const selects = (state: MapInputEntryState) => state.commands.filter(({ operation, id }) => operation === 'select' && id !== null);
