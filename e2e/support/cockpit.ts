import { expect, type Page } from '@playwright/test';
import type { HeldGroup } from '../../src/app/resources/resource-holder.ts';
import type { AssetDescriptor } from '../../src/content/asset-contract.ts';
import { readFontPayload, type FontPayload } from '../../src/content/graphics/font-payload.ts';
import { glyphsFor } from '../../src/content/graphics/glyph-lookup.ts';
import { readImagePayload, type ImagePayload } from '../../src/content/graphics/image-payload.ts';
import { readLayoutPayload, type LayoutPayload } from '../../src/content/graphics/layout-payload.ts';
import { readPalettePayload } from '../../src/content/graphics/palette-payload.ts';
import { decodeHudTextPayload, type HudText } from '../../src/content/hud/hud-text-payload.ts';
import { decodeCockpitInstrumentsPayload, type InclusiveRectangle, type InstrumentSlot } from '../../src/content/hud/instruments-payload.ts';
import { readStatusMessagesPayload, type StatusMessagesPayload } from '../../src/content/hud/status-messages-payload.ts';
import { decodeViewLabelsPayload } from '../../src/content/hud/view-labels-payload.ts';
import { LOGIC_PAYLOAD_SCHEMA_VERSION, type MissionContent, type MissionDeclaration, type WingmanRoster } from '../../src/content/logic/logic-content.ts';
import { decodeLogicPayload, encodeLogicPayload } from '../../src/content/logic/logic-payload.ts';
import { readGroupManifest } from '../../src/content/manifest.ts';
import { readPayloadRecords } from '../../src/content/payload.ts';
import type { CommMenus } from '../../src/content/rule-data/comm-menus.ts';
import type { CraftInfo } from '../../src/content/rule-data/craft-info.ts';
import type { FlightMessages } from '../../src/content/rule-data/flight-messages.ts';
import { decodeRuleDataPayload, RULE_DATA_SCHEMA_VERSIONS } from '../../src/content/rule-data/rule-data-payload.ts';
import { sha256Fingerprint } from '../../src/content/sha256.ts';
import type { MessageIdentity } from '../../src/core/world/world-state.ts';
import { scenarioGroups } from '../../src/workers/import-scenarios.test-support.ts';
import { missionAssetContent, ruleDataBytes, withPayloads } from './ai-wingman.ts';
import { F1_BOTTOM, logicalImage, nearestEntry, nextFrames, same, vga, type LogicalImage, type Rgb } from './flight-pictures.ts';
import { readDevEntity } from './map-warp.ts';
import { devState } from './mission-observations.ts';
import { missionPackage } from './production-cache.ts';

// The cockpit's browser regression (P3-13/27; docs/plan/p3/13/spec.md, 验证策略, AC-08 to AC-15, AC-19, AC-20). The
// synthetic package's HUD content is read in Node with the content readers alone, and every expectation is written
// out here from the original's drawing rules as docs/original/formats/hud.md §4 and cockpit.md record them (positions,
// colour indices, primitives, text, copies and cadences), without the renderer's modules. Pictures are the composited
// page (flight-pictures.ts `logicalImage`); run facts come from the mission screen's attributes, the development event
// log and the UI store's projection, read through page evaluations only. Nothing here writes application state.

// Content

const MISSION_ASSET = 'mission/first-campaign';
const CRAFT_INFO_ASSET = 'data/craft-info';

/** The package's cockpit content the regression reads. */
export interface CockpitFixture {
  /** DATA (`palette/flight/cockpit-hud-map`) and the map group palette (`palette/map/screen`), 8-bit. */
  readonly data: readonly Rgb[];
  readonly map: readonly Rgb[];
  /** Every palette of the package by Asset ID. */
  readonly palettes: ReadonlyMap<string, readonly Rgb[]>;
  /** fonts/0 (advance 8) and fonts/1 (advance 6, upper case) as `0x49694` sets them up (hud §4.1). */
  readonly regular: HudFont;
  readonly small: HudFont;
  /** Slots 0, 2 and 7 of `data/hud/instruments`. */
  readonly slots: readonly [InstrumentSlot, InstrumentSlot, InstrumentSlot];
  readonly front: LayoutPayload;
  readonly mapFrame: LayoutPayload;
  readonly images: ReadonlyMap<string, ImagePayload>;
  readonly hudText: HudText['entries'];
  /** The destruction view's label (sub-mode 8). */
  readonly viewLabel: string;
  readonly status: StatusMessagesPayload;
  readonly flightMessages: FlightMessages;
  readonly commMenus: CommMenus;
}

export interface HudFont {
  readonly payload: FontPayload;
  readonly advance: number;
  readonly upperCase: boolean;
}

type Entry = { readonly descriptor: AssetDescriptor; readonly bytes: Uint8Array };

/** Every payload of `groups` by Asset ID, with its descriptor. */
function assetsOf(groups: readonly HeldGroup[]): Map<string, Entry> {
  const found = new Map<string, Entry>();
  for (const { manifest, payloads } of groups) {
    const records = new Map(readPayloadRecords(payloads).map(({ id, bytes }) => [id as string, bytes]));
    for (const descriptor of readGroupManifest(manifest).assets) {
      const bytes = records.get(descriptor.id);
      if (bytes) found.set(descriptor.id, { descriptor, bytes });
    }
  }
  return found;
}

const rgbs = (entries: Uint8Array): Rgb[] =>
  Array.from({ length: entries.length / 3 }, (_, index) => [entries[index * 3], entries[index * 3 + 1], entries[index * 3 + 2]] as const);

let startable: Promise<CockpitFixture> | undefined;

/** The startable package's cockpit content, which every package here shares (its variants change only logic payloads). */
export const startableCockpit = (): Promise<CockpitFixture> => (startable ??= missionPackage().then(cockpitFixture));

/** Reads the cockpit content of a converted synthetic package. */
function cockpitFixture(groups: readonly HeldGroup[]): CockpitFixture {
  const assets = assetsOf(groups);
  const found = (entry: Entry | undefined, what: string): Entry => {
    if (!entry) throw new Error(`The package has no ${what}`);
    return entry;
  };
  const byId = (id: string) => found(assets.get(id), id);
  const byRole = (role: string) => found([...assets.values()].find(({ descriptor }) => descriptor.role === role), role);
  const graphics = <T>(read: (bytes: Uint8Array, schemaVersion: number) => T, { descriptor, bytes }: Entry): T => read(bytes, descriptor.payloadIdentity.schemaVersion);
  const decode = <T>(read: (bytes: Uint8Array, descriptor: AssetDescriptor) => T, { descriptor, bytes }: Entry): T => read(bytes, descriptor);
  const ofKind = (kind: string) => [...assets.values()].filter(({ descriptor }) => descriptor.kind === kind);
  const palettes = new Map(ofKind('palette').map(entry => [entry.descriptor.id as string, rgbs(graphics(readPalettePayload, entry).entries)]));
  return {
    data: palettes.get('palette/flight/cockpit-hud-map')!,
    map: palettes.get('palette/map/screen')!,
    palettes,
    regular: { payload: graphics(readFontPayload, byId('font/hud/8x8-1')), advance: 8, upperCase: false },
    small: { payload: graphics(readFontPayload, byId('font/hud/8x8-2')), advance: 6, upperCase: true },
    slots: decode(decodeCockpitInstrumentsPayload, byRole('cockpit-instruments')).slots,
    front: graphics(readLayoutPayload, byId('layout/cockpit/front')),
    mapFrame: graphics(readLayoutPayload, byId('layout/map/frame')),
    images: new Map(ofKind('image').map(entry => [entry.descriptor.id as string, graphics(readImagePayload, entry)])),
    hudText: decode(decodeHudTextPayload, byRole('hud-text')).entries,
    viewLabel: decode(decodeViewLabelsPayload, byRole('view-labels')).labels[0].text,
    status: graphics(readStatusMessagesPayload, byRole('status-messages')),
    flightMessages: decode(decodeRuleDataPayload, byRole('flight-messages')).content as FlightMessages,
    commMenus: decode(decodeRuleDataPayload, byRole('comm-menus')).content as CommMenus,
  };
}

/** The rectangle of the instrument of `type` in `slot`. */
export function instrument(fixture: CockpitFixture, type: number, slot: 0 | 2 | 7 = 0): InclusiveRectangle {
  const record = fixture.slots.find(candidate => candidate.slot === slot)!.instruments.find(candidate => candidate.type === type);
  if (!record) throw new Error(`Slot ${slot} has no type-${type} instrument`);
  return record.rectangle;
}

/** The fixture with another palette taken for DATA: a wrong fixture every colour check must reject. */
export const withData = (fixture: CockpitFixture, data: readonly Rgb[]): CockpitFixture => ({ ...fixture, data });

// Colour indices of the drawing code (hud §4.3–§4.8, comm §4)

export const COLOUR = Object.freeze({
  /** The radar's background rings (§4.3). */
  rings: 0x0d,
  /** Right-display text (§4.5) and the incoming summary on the message line (§4.7). */
  targetText: 0x08,
  incoming: 0x08,
  /** The speed-assist messages (§4.7). */
  speedAssist: 0x0f,
  /** The destruction view's label (§4.6). */
  viewLabel: 0x0f,
  /** The Warp lamp's text (§4.8). */
  lamp: 0x10,
  /** The menu page's title, its ordinary rows and its last row (comm §4). */
  menuTitle: 0x13,
  menuRow: 0x0f,
  menuLast: 0x0c,
});

/** Every colour the F1 overlay `0x45de0` draws in (§4.6); its erase repaints index 0, which equals not drawing. */
const OVERLAY_COLOURS = Object.freeze([0x0a, 0x0c, 0x0f, 0x10, 0x12, 0x13]);

// Pixels and text

export type Point = readonly [number, number];
const pointKey = ([x, y]: Point) => y * 640 + x;
const onScreen = ([x, y]: Point) => x >= 0 && x < 640 && y >= 0 && y < 480;
const within = ([x, y]: Point, { x0, y0, x1, y1 }: InclusiveRectangle) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

/** Every pixel of an inclusive rectangle. */
export function rectPoints({ x0, y0, x1, y1 }: InclusiveRectangle): Point[] {
  const points: Point[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) points.push([x, y]);
  return points;
}

/** The pixels of `points` whose colour in `image` is not `rgb`. */
export const wrongPixels = (image: LogicalImage, points: Iterable<Point>, rgb: Rgb): Point[] => [...points].filter(([x, y]) => !same(image.at(x, y), rgb));

/** The pixels of `points` whose colour in `image` is `rgb`. */
export const pixelsOf = (image: LogicalImage, points: Iterable<Point>, rgb: Rgb): Point[] => [...points].filter(([x, y]) => same(image.at(x, y), rgb));

/**
 * The pixels the original's text drawer sets for `text` with its first glyph at (x, y) (hud §4.1): the first `height`
 * rows and all 8 columns of each glyph, glyph i at x + i × advance, fonts/1 upper-casing a–z; overlaps are one set.
 */
export function textPixels({ payload, advance, upperCase }: HudFont, text: string, x: number, y: number): Point[] {
  const codes = [...text].map(character => {
    const code = character.charCodeAt(0);
    return upperCase && code >= 0x61 && code <= 0x7a ? code - 0x20 : code;
  });
  const set = new Map<number, Point>();
  glyphsFor(payload, codes).forEach((glyph, index) => {
    for (let row = 0; row < payload.height; row++) {
      const bits = payload.glyphs[glyph * payload.glyphRows + row];
      for (let column = 0; column < 8; column++) {
        const point: Point = [x + index * advance + column, y + row];
        if (bits & (0x80 >> column) && onScreen(point)) set.set(pointKey(point), point);
      }
    }
  });
  return [...set.values()];
}

/** Whether every pixel of `text` drawn at (x, y) in `font` shows `rgb`. */
export const showsText = (image: LogicalImage, font: HudFont, text: string, x: number, y: number, rgb: Rgb): boolean =>
  wrongPixels(image, textPixels(font, text, x, y), rgb).length === 0;

/** Every origin in `area` (inclusive) where `text` shows whole in one colour, with that colour. */
export function findText(image: LogicalImage, font: HudFont, text: string, area: InclusiveRectangle): { readonly at: Point; readonly rgb: Rgb }[] {
  const relative = textPixels(font, text, 0, 0);
  const found: { at: Point; rgb: Rgb }[] = [];
  for (let y = area.y0; y <= area.y1; y++) {
    for (let x = area.x0; x <= area.x1; x++) {
      const [dx, dy] = relative[0];
      if (x + dx >= 640 || y + dy >= 480) continue;
      const rgb = image.at(x + dx, y + dy);
      if (relative.every(([ox, oy]) => x + ox < 640 && y + oy < 480 && same(image.at(x + ox, y + oy), rgb))) found.push({ at: [x, y], rgb });
    }
  }
  return found;
}

/** `format` with one argument per conversion: `%d`, `%s`, `%%` and `%.0f` (round half to even), hud §4.1. */
export function formatText(format: string, ...args: readonly (number | string)[]): string {
  let next = 0;
  return format.replace(/%(%|d|s|\.0f)/g, (_, conversion: string) => {
    if (conversion === '%') return '%';
    const value = args[next++];
    if (conversion === 's') return String(value);
    if (conversion === 'd') return String(Math.trunc(Number(value)));
    const number = Number(value);
    const floor = Math.floor(Math.abs(number));
    const fraction = Math.abs(number) - floor;
    const rounded = fraction > 0.5 || (fraction === 0.5 && floor % 2 === 1) ? floor + 1 : floor;
    return `${number < 0 ? '-' : ''}${rounded}`;
  });
}

/** The pixels an image payload covers at (x, y) with their colours under `palette`: every pixel, or its mask's set ones. */
function imagePixels(image: ImagePayload, x: number, y: number, palette: readonly Rgb[], rows = image.height): { readonly point: Point; readonly rgb: Rgb }[] {
  const pixels: { point: Point; rgb: Rgb }[] = [];
  const stride = (image.width + 7) >> 3;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < image.width; column++) {
      if (image.mask && !(image.mask[row * stride + (column >> 3)] & (0x80 >> (column & 7)))) continue;
      pixels.push({ point: [x + column, y + row], rgb: palette[image.indices[row * image.width + column]] });
    }
  }
  return pixels;
}

/** The pixels of `pixels` that `image` does not show. */
export const imageMismatches = (image: LogicalImage, pixels: readonly { readonly point: Point; readonly rgb: Rgb }[]) =>
  pixels.filter(({ point: [x, y], rgb }) => !same(image.at(x, y), rgb));

/**
 * The midpoint circle of `0x5a390` (hud §4.1): d = 1 − r, increments 3 and 5 − 2r, the eight-way points of each step,
 * then the four axis points; `steps` limits it to the first steps per octant from the axes (`0x5a4d4`).
 */
function circlePoints(cx: number, cy: number, r: number, steps = Infinity): Point[] {
  const points = new Map<number, Point>();
  const add = (point: Point) => { if (onScreen(point)) points.set(pointKey(point), point); };
  let [x, y, d, step] = [0, r, 1 - r, 0];
  while (x < y && step < steps) {
    if (d < 0) d += 2 * x + 3;
    else {
      d += 2 * (x - y) + 5;
      y -= 1;
    }
    x += 1;
    step += 1;
    for (const [a, b] of [[x, y], [y, x]]) for (const [sa, sb] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) add([cx + sa * a, cy + sb * b]);
  }
  for (const point of [[cx + r, cy], [cx - r, cy], [cx, cy + r], [cx, cy - r]] as const) add(point);
  return [...points.values()];
}

// The front cockpit (layout 0, slot 0): cockpit.md "What each view shows" and the element table (+44, +48)

/**
 * The visible pixels of the front layout's elements in F1 and Warp: a pass-0 element drawn every frame is never copied
 * (`0x49c98`), so in the band (rows 316–479) it shows only through an instrument's copy and is left out; within the 3D
 * viewport the frame-end copy shows it every frame. An element drawn only in the full redraw lies, in the synthetic
 * layout, within the viewport, where the original draws the world over it in the next frame: left out too.
 */
export function frameElementPixels(fixture: CockpitFixture): { readonly point: Point; readonly rgb: Rgb }[] {
  const [front] = fixture.slots;
  return fixture.front.elements.flatMap(({ image: id, x, y }, index) => {
    const image = fixture.images.get(id)!;
    const viewport = y + image.height - 1 <= F1_BOTTOM;
    return front.elements[index].everyFrame && viewport ? imagePixels(image, x, y, fixture.data) : [];
  });
}

/** The rectangles of the slot-0 cockpit over the 3D viewport: its elements' and its instruments' there. */
export function viewportCockpit(fixture: CockpitFixture): InclusiveRectangle[] {
  const elements = fixture.front.elements.map(({ image: id, x, y }) => {
    const { width, height } = fixture.images.get(id)!;
    return { x0: x, y0: y, x1: x + width - 1, y1: y + height - 1 };
  });
  const records = fixture.slots[0].instruments.map(({ rectangle }) => rectangle);
  return [...elements, ...records].filter(({ y0 }) => y0 <= F1_BOTTOM).map(rect => ({ ...rect, y1: Math.min(rect.y1, F1_BOTTOM) }));
}

/** Whether a 3D-viewport pixel of colour `rgb` may be the cockpit's in F1: in its rectangles or in an overlay colour. */
export function inF1Cockpit(fixture: CockpitFixture): (x: number, y: number, rgb: Rgb) => boolean {
  const rects = viewportCockpit(fixture);
  const overlay = new Set(OVERLAY_COLOURS.map(entry => fixture.data[entry].join()));
  return (x, y, rgb) => rects.some(rect => within([x, y], rect)) || overlay.has(rgb.join());
}

/**
 * The band pixels no slot-0 handler copies: rows 316–479 outside every instrument rectangle. The layout select fills
 * the buffer with index 0 and copies the whole screen; afterwards only the handlers' copies reach rows 316–479.
 */
export function bandStatic(fixture: CockpitFixture): Point[] {
  const rects = fixture.slots[0].instruments.map(({ rectangle }) => rectangle);
  return rectPoints({ x0: 0, y0: F1_BOTTOM + 1, x1: 639, y1: 479 }).filter(point => !rects.some(rect => within(point, rect)));
}

/** The radar (§4.3): r = (min(w, h) >> 1) − 2 with w = x1 − x0, h = y1 − y0, centre = origin + (w >> 1, h >> 1). */
function radarGeometry(fixture: CockpitFixture) {
  const { x0, y0, x1, y1 } = instrument(fixture, 5);
  const [w, h] = [x1 - x0, y1 - y0];
  return { cx: x0 + (w >> 1), cy: y0 + (h >> 1), r: (Math.min(w, h) >> 1) - 2, x0, y0, y1 };
}

/** The background rings `0x40b7c`: circles of r, chop(0.9r) and chop(0.1r), the first 8 steps of chop(0.5r), the centre. */
export function radarRings(fixture: CockpitFixture): Point[] {
  const { cx, cy, r } = radarGeometry(fixture);
  const points = new Map<number, Point>();
  for (const point of [
    ...circlePoints(cx, cy, r), ...circlePoints(cx, cy, Math.trunc(0.9 * r)), ...circlePoints(cx, cy, Math.trunc(0.1 * r)),
    ...circlePoints(cx, cy, Math.trunc(0.5 * r), 8), [cx, cy] as Point,
  ]) points.set(pointKey(point), point);
  return [...points.values()];
}

/** The disc spans each rebuild clears and copies: rows y0 … y1 − 1 within r of the centre, half-width max(√|r² − d²| + 3, 10). */
export function radarSpans(fixture: CockpitFixture): Point[] {
  const { cx, cy, r, y0, y1 } = radarGeometry(fixture);
  const points: Point[] = [];
  for (let y = y0; y < y1; y++) {
    const d = Math.abs(cy - y);
    if (d > r) continue;
    const half = Math.max(Math.trunc(Math.sqrt(Math.abs(r * r - d * d)) + 3), 10);
    for (let x = cx - half; x <= cx + half; x++) points.push([x, y]);
  }
  return points;
}

/** The reticle's partial circle (§4.6): radius 20, 10 steps per octant, centre (319, 157). */
export const reticle = (): Point[] => circlePoints(319, 157, 20, 10);

/** The pixels of the map frame's elements (layout 6, slot 2) under the map palette: pass 1, every frame, opaque. */
export function mapFramePixels(fixture: CockpitFixture): { readonly point: Point; readonly rgb: Rgb }[] {
  return fixture.mapFrame.elements.flatMap(({ image, x, y }) => imagePixels(fixture.images.get(image)!, x, y, fixture.map));
}

/** The stretched right-display background (§4.5): device pixel (u, v) shows texel (⌊96u/100⌋, ⌊96v/100⌋). */
function targetBackground(fixture: CockpitFixture): (u: number, v: number) => Rgb {
  const texture = fixture.images.get('image/hud/target-display/background')!;
  const own = fixture.palettes.get(texture.palette)!;
  return (u, v) => fixture.data[nearestEntry(fixture.data, own[texture.indices[Math.floor((96 * v) / 100) * texture.width + Math.floor((96 * u) / 100)]])];
}

/**
 * The right display (§4.5): every pixel is the background the device window (2, 1)–(98, 98) copies to (x0, y0), text
 * in colour 8 or the target's model in its one colour, outside the other instruments' rectangles. Returns the pixels
 * that are none of these and the model's count;
 * `shift` moves the expected device window by whole columns (a wrong expectation).
 */
export function targetDisplayRead(image: LogicalImage, fixture: CockpitFixture, shift = 0) {
  const rect = instrument(fixture, 7);
  const background = targetBackground(fixture);
  const text = fixture.data[COLOUR.targetText];
  const models = new Set([0x0a, 0x0f, 0x10].map(entry => fixture.data[entry].join()));
  // Other instruments' rectangles may overlap it (the synthetic type-3 gauge does); they draw there too.
  const others = fixture.slots[0].instruments.filter(({ type }) => type !== 7).map(({ rectangle }) => rectangle);
  const wrong: Point[] = [];
  let model = 0;
  for (const [x, y] of rectPoints(rect).filter(point => !others.some(other => within(point, other)))) {
    const actual = image.at(x, y);
    if (same(actual, background(x - rect.x0 + 2 + shift, y - rect.y0 + 1)) || same(actual, text)) continue;
    if (models.has(actual.join())) model += 1;
    else wrong.push([x, y]);
  }
  return { wrong, model };
}

/** The distance readout's x (§4.5): base x1 − 33, 8 pixels left for each of the thresholds 10, 99, 999, 9999 it exceeds. */
export const distanceX = (fixture: CockpitFixture, value: number): number =>
  instrument(fixture, 7).x1 - 33 - 8 * [10, 99, 999, 9999].filter(threshold => value > threshold).length;

/** The left display's interference frames (SNIP) whose pixels `image` shows at (x0, y0 + 1) of `rect`. */
export function interferenceFrames(image: LogicalImage, fixture: CockpitFixture, rect: InclusiveRectangle): number[] {
  return Array.from({ length: 9 }, (_, frame) => frame).filter(frame =>
    imageMismatches(image, imagePixels(fixture.images.get(`image/hud/display-interference/frame-${frame}`)!, rect.x0, rect.y0 + 1, fixture.data)).length === 0);
}

// The screen flash (executable.md SF4): every colour through table k, the picture shifted up by whole rows

/** A DATA colour through flash table k: each 6-bit component + 2k, at most 63, expanded again. */
const flashed = (rgb: Rgb, table: number): Rgb => rgb.map(component => vga(Math.min((component >> 2) + 2 * table, 63))) as unknown as Rgb;

/**
 * Every (rows, table) under which `image` shows the flashed cockpit: each static band pixel `rows` higher in flashed
 * index 0 and each radar ring pixel there in the flashed ring colour, for table 1–31 and a shift of 0–15 rows.
 */
export function flashFits(image: LogicalImage, fixture: CockpitFixture): { readonly rows: number; readonly table: number }[] {
  const band = bandStatic(fixture).filter(([, y]) => y <= 470);
  const rings = radarRings(fixture);
  const fits: { rows: number; table: number }[] = [];
  for (let rows = 0; rows < 16; rows++) {
    for (let table = 1; table < 32; table++) {
      const shown = (points: readonly Point[], entry: number) => points.every(([x, y]) => same(image.at(x, y - rows), flashed(fixture.data[entry], table)));
      if (shown(band, 0) && shown(rings, COLOUR.rings)) fits.push({ rows, table });
    }
  }
  return fits;
}

// The message line (type 8, §4.7)

export type MessageMode = 1 | 2;

/** The offset of a shown item `dt` clock units after its first logical display: W − ((dt × 48 or 120) mod 2³²) >> 6. */
export const messageOffset = (mode: MessageMode, dt: number, width: number): number => width - (((dt * (mode === 1 ? 48 : 120)) >>> 0) >>> 6);

/**
 * The message line of `rect` showing `text` at `offset` (§4.7 steps 3, 6 and 7, not the map): the band (x0, y)–(x1 − 1,
 * y + h) in index 0 at text row y = trunc((y0 + y1 − h) / 2), whole glyphs i at x0 + offset + 8i; null after the item
 * leaves (width + offset ≤ 0).
 */
export function messageLinePixels(fixture: CockpitFixture, rect: InclusiveRectangle, text: string, offset: number) {
  const font = fixture.regular;
  const { height } = font.payload;
  if (text.length * font.advance + offset <= 0) return null;
  const y = Math.trunc((rect.y0 + rect.y1 - height) / 2);
  const width = rect.x1 - rect.x0 - 1;
  const first = offset >= 0 ? 0 : Math.ceil(-offset / font.advance);
  const end = Math.max(first, Math.min(text.length, Math.trunc((width - offset - 1) / font.advance)));
  const glyphs = textPixels(font, text.slice(first, end), rect.x0 + offset + first * font.advance, y);
  const inText = new Set(glyphs.map(pointKey));
  const band = rectPoints({ x0: rect.x0, y0: y, x1: rect.x1 - 1, y1: y + height }).filter(point => !inText.has(pointKey(point)));
  return { glyphs, band };
}

/**
 * The pixels of the message line in `rect` that do not show `text` at `offset` in `colour` over its index-0 band; an
 * offset at which no whole glyph is drawn (just after the first display, or after the item left) compares nothing.
 */
export function messageLineWrong(image: LogicalImage, fixture: CockpitFixture, rect: InclusiveRectangle, text: string, offset: number, colour: number): Point[] {
  const shown = messageLinePixels(fixture, rect, text, offset);
  if (shown === null || shown.glyphs.length === 0) throw new Error(`No glyph of the item is on the message line at offset ${offset}`);
  return [...wrongPixels(image, shown.glyphs, fixture.data[colour]), ...wrongPixels(image, shown.band, fixture.data[0])];
}

// The status page's upper DIAG line (§4.4 and DIAG 10489 "Timing")

/** One state of a typed DIAG line: its message, the visible characters typed and whether the cursor shows. */
export interface DiagState {
  readonly text: string;
  readonly typed: number;
  readonly cursor: boolean;
}

/** The visible characters of a DIAG message (its line breaks are passed in the step that types the character before them). */
export const visibleLength = (text: string): number => text.replaceAll('\n', '').length;

/**
 * The pixels of `state` drawn at (x, y): the typed part of each line on its own row (pitch: the font height) and, when it
 * shows, the cursor, a one-pixel outline of advance × height right after the last part drawn.
 */
function diagPixels(font: HudFont, { text, typed, cursor }: DiagState, x: number, y: number): Point[] {
  const { advance, payload: { height } } = font;
  const points: Point[] = [];
  let [left, top, width] = [typed, y, 0];
  for (const line of text.split('\n')) {
    if (left <= 0) break;
    const part = line.slice(0, left);
    points.push(...textPixels(font, part, x, top));
    width = part.length * advance;
    left -= part.length;
    top += height;
  }
  if (cursor) {
    const [cx, cy] = [x + width, top - height];
    for (let dx = 0; dx < advance; dx++) points.push([cx + dx, cy], [cx + dx, cy + height - 1]);
    for (let dy = 1; dy < height - 1; dy++) points.push([cx, cy + dy], [cx + advance - 1, cy + dy]);
  }
  return points;
}

/**
 * Every state among `messages` that explains the upper line of page 0 in `image` exactly: its pixels in `rgb` within the
 * line's two rows of glyphs (and the cursor) are the state's and no others.
 */
export function diagExplanations(image: LogicalImage, fixture: CockpitFixture, messages: readonly string[], rgb: Rgb): DiagState[] {
  const { x0, y0, x1 } = instrument(fixture, 6);
  const [x, y] = [x0 + 4, y0 + 5];
  const { height } = fixture.small.payload;
  const area = rectPoints({ x0, y0: y, x1, y1: y + 2 * height - 1 });
  const lit = new Set(pixelsOf(image, area, rgb).map(pointKey));
  const states: DiagState[] = [];
  for (const text of messages) {
    for (let typed = 1; typed <= visibleLength(text); typed++) {
      for (const cursor of [true, false]) {
        const expected = new Set(diagPixels(fixture.small, { text, typed, cursor }, x, y).filter(point => point[1] < y + 2 * height).map(pointKey));
        if (expected.size === lit.size && [...expected].every(point => lit.has(point))) states.push({ text, typed, cursor });
      }
    }
  }
  return states;
}

/** The DIAG timing a schedule fit assumes, in ticks at 2 clock units per tick and one page-0 call per tick. */
export interface DiagCadence {
  /** Ticks per typed character: max(1, ⌈interval ÷ 2⌉). */
  readonly typeTicks: number;
  /** Ticks from the call that finishes typing to the call that releases the message: ⌈hold ÷ 2⌉. */
  readonly holdTicks: number;
}

/** The cadence `timing` gives at 2 clock units per tick (DIAG 10489 "Timing": next ≤ sample, hold end ≤ sample). */
export const diagCadence = ({ characterTicks, holdTicks }: { characterTicks: number; holdTicks: number }): DiagCadence =>
  ({ typeTicks: Math.max(1, Math.ceil(characterTicks / 2)), holdTicks: Math.ceil(holdTicks / 2) });

/**
 * The state at `tick` of a message generated at `generated`: one character per step from that call, the cursor shown
 * while typing and toggled each step after, released `holdTicks` after the finishing call; null once released.
 */
function diagStateAt(text: string, generated: number, tick: number, { typeTicks, holdTicks }: DiagCadence): DiagState | null {
  const length = visibleLength(text);
  const finished = generated + (length - 1) * typeTicks;
  if (tick < generated || tick > finished + holdTicks) return null;
  if (tick <= finished) return { text, typed: 1 + Math.floor((tick - generated) / typeTicks), cursor: true };
  const steps = Math.floor((tick - finished) / typeTicks);
  return { text, typed: length, cursor: steps % 2 === 0 };
}

/** One page-0 sample: its tick and the states that explain its upper line. */
export interface DiagSample {
  readonly tick: number;
  readonly states: readonly DiagState[];
}

/**
 * Every schedule that explains all `samples` (in tick order): the first message, of format `first` in the cycle of four,
 * generated at tick `generated` and each next one at the call after its predecessor's release; `texts(format)` gives the
 * candidate texts of a format (format 3's raw energy, and so its length, depends on its generation tick).
 */
export function diagSchedules(samples: readonly DiagSample[], texts: (format: number) => readonly string[], cadence: DiagCadence) {
  const explains = (from: number, format: number, at: number): boolean => {
    if (from === samples.length) return true;
    return texts(format % 4).some(text => {
      const release = at + (visibleLength(text) - 1) * cadence.typeTicks + cadence.holdTicks;
      let next = from;
      for (; next < samples.length && samples[next].tick <= release; next++) {
        const expected = diagStateAt(text, at, samples[next].tick, cadence);
        if (!samples[next].states.some(state => expected !== null && state.text === text && state.typed === expected.typed && state.cursor === expected.cursor)) return false;
      }
      return explains(next, format + 1, release + 1);
    });
  };
  const fits: { first: number; generated: number }[] = [];
  for (let first = 0; first < 4; first++) {
    for (let generated = samples[0].tick - 200; generated <= samples[0].tick; generated++) if (explains(0, first, generated)) fits.push({ first, generated });
  }
  return fits;
}

// The left display's pages (§4.4, comm §4)

/** The page background BITM 10467 at (x0, y0 + 1). */
export const pageBackground = (fixture: CockpitFixture, rect: InclusiveRectangle) =>
  imagePixels(fixture.images.get('image/hud/display-page/background')!, rect.x0, rect.y0 + 1, fixture.data);

/** A menu row's text: the key, then its item's text from byte 2, objects as the separator and the name (comm §4). */
function menuRowText(fixture: CockpitFixture, table: string, option: MenuOption, name: (entityId: number) => string): string {
  const key = String.fromCharCode(option.key);
  const menus = fixture.commMenus;
  const items: Readonly<Record<string, readonly { readonly text: string }[]>> = {
    categories: menus.categories, objects: [{ text: menus.objectListLastEntry }], gated: menus.gatedTargetCommands,
    other: menus.otherTargetCommands, kind2: menus.kind2TargetCommands,
  };
  const { value } = option;
  if (value.type === 'object') return key + fixture.hudText.leftCommListSeparator + name(value.entityId!);
  const list = items[table];
  return key + list[value.type === 'exit' ? list.length - 1 : value.source!].text.slice(2);
}

// Checks, each a list of wrong pixels (empty when it holds), so that a wrong expectation can be shown to fail

/**
 * The F1/Warp cockpit at rest: the elements the frame-end copy shows over the viewport, the band outside the instrument
 * rectangles in index 0, the radar's background rings, and the Warp lamp's text (lit) or its cleared rectangle.
 */
export function cockpitChecks(image: LogicalImage, fixture: CockpitFixture, state: CockpitState) {
  const lamp = instrument(fixture, 12);
  return {
    frame: imageMismatches(image, frameElementPixels(fixture)).map(({ point }) => point),
    band: wrongPixels(image, bandStatic(fixture), fixture.data[0]),
    rings: wrongPixels(image, radarRings(fixture), fixture.data[COLOUR.rings]),
    lamp: state.combat!.lampLit
      ? wrongPixels(image, textPixels(fixture.small, fixture.hudText.indicatorWarpInterval, lamp.x0, lamp.y0), fixture.data[COLOUR.lamp])
      : wrongPixels(image, rectPoints(lamp), fixture.data[0]),
  };
}

/** `cockpitChecks` when every check holds. */
export const CLEAN = Object.freeze({ frame: [], band: [], rings: [], lamp: [] });

/** The page background BITM 10467 at (x0, y0 + 1) but under `drawn`, and row y0 in index 0 (§4.4, comm §4). */
export function pageFrameWrong(image: LogicalImage, fixture: CockpitFixture, drawn: readonly (readonly [number, number])[] = []) {
  const rect = instrument(fixture, 6);
  const over = new Set(drawn.map(([x, y]) => `${x},${y}`));
  return [
    ...imageMismatches(image, pageBackground(fixture, rect)).filter(({ point: [x, y] }) => !over.has(`${x},${y}`)).map(({ point }) => point),
    ...wrongPixels(image, rectPoints({ ...rect, y1: rect.y0 }), fixture.data[0]),
  ];
}

/**
 * A menu page (comm §4): the title in 0x13 at (x0 + 6, y0 + 4), then each row from y0 + 15, pitch 9, while
 * y ≤ y1 − 7, cut to trunc((x1 − x0) / 6) bytes; the page copies only its rectangle, so glyph pixels past x1 stay
 * unseen. Other pixels are not compared: the synthetic BITM 10467 is 5 × 4, so, by the original's rules, the panel
 * keeps what earlier pages drew there (the shipped image is opaque over the whole panel).
 */
export function menuPageWrong(image: LogicalImage, fixture: CockpitFixture, state: CockpitState, name: (entityId: number) => string) {
  const rect = instrument(fixture, 6);
  const menu = state.menu!;
  const { height } = fixture.small.payload;
  const drawn: Point[] = [];
  const wrong: Point[] = [];
  const text = (value: string, y: number, colour: number) => {
    const points = textPixels(fixture.small, value, rect.x0 + 6, y).filter(([x]) => x <= rect.x1);
    drawn.push(...points);
    wrong.push(...wrongPixels(image, points, fixture.data[colour]));
  };
  text(fixture.hudText.leftCommPanelTitle, rect.y0 + 4, COLOUR.menuTitle);
  const width = Math.trunc((rect.x1 - rect.x0) / 6);
  menu.options.forEach((option, index) => {
    const y = rect.y0 + 4 + height + 3 + index * (height + 1);
    if (y > rect.y1 - height + 1) return;
    const last = index === menu.options.length - 1;
    const tone = option.value.tone;
    // A threatened object blinks with bit 5 of the clock; an active one is 0x10.
    const colour = last ? COLOUR.menuLast : tone === 'active' ? 0x10 : tone === 'threatened' && (state.clock & 0x20) !== 0 ? 0x0a : COLOUR.menuRow;
    text(menuRowText(fixture, menu.table, option, name).slice(0, width), y, colour);
  });
  return [...wrong, ...pageFrameWrong(image, fixture, drawn)];
}

/**
 * The energy page (§4.4): BITM above the three bars (their top is y1 − 3 − (y1 − y0 − 6) = y0 + 3), row y0, the
 * labels at (cx − 4, y0 + 3) in one colour and the level records at (x0 + 18, y0 + 12) and (x1 − 18 − w, y0 + 12).
 */
export function energyPageWrong(image: LogicalImage, fixture: CockpitFixture, levels: readonly [number, number]) {
  const rect = instrument(fixture, 6);
  const bars = rectPoints({ x0: rect.x0, y0: rect.y0 + 3, x1: rect.x1, y1: rect.y1 - 3 });
  const { hudText: text, regular } = fixture;
  const labels = [
    textPixels(regular, text.leftEnergyBar1Label, rect.x0 + Math.trunc((rect.x1 - rect.x0) / 2) - 4, rect.y0 + 3),
    textPixels(regular, text.leftEnergyBar2Label, rect.x0 + 8 - 4, rect.y0 + 3),
    textPixels(regular, text.leftEnergyBar3Label, rect.x1 - 8 - 4, rect.y0 + 3),
  ].flat();
  const labelColour = image.at(...labels[0]);
  const records = levels.map((level, side) => {
    const record = fixture.images.get(`image/hud/gauge-bar-1/${level}`)!;
    return imagePixels(record, side === 0 ? rect.x0 + 18 : rect.x1 - 18 - record.width, rect.y0 + 12, fixture.data, record.height - 1);
  }).flat();
  return [
    ...(same(labelColour, fixture.data[0]) ? labels : wrongPixels(image, labels, labelColour)),
    ...imageMismatches(image, records).map(({ point }) => point),
    ...pageFrameWrong(image, fixture, [...labels, ...bars]),
  ];
}

/**
 * Page 5's G-03 placeholder (P3-13 spec, 左显示屏 页 5; DC-07): the 96 × 96 area from (x0, y0) in index 0 with the
 * label's lines centred in it, one colour other than index 0. Returns the wrong pixels, or every pixel when a line is
 * not found once at its centred x.
 */
export function incomingPageWrong(image: LogicalImage, fixture: CockpitFixture, label: readonly string[]): Point[] {
  const rect = instrument(fixture, 6);
  const area = rectPoints({ x0: rect.x0, y0: rect.y0, x1: rect.x0 + 95, y1: rect.y0 + 96 });
  const placed = label.map(line => findText(image, fixture.small, line, rect)
    .filter(({ at: [x], rgb }) => x === rect.x0 + Math.trunc((96 - line.length * fixture.small.advance) / 2) && !same(rgb, fixture.data[0])));
  if (placed.some(found => found.length !== 1) || placed.some(([found]) => !same(found.rgb, placed[0][0].rgb))) return area;
  const drawn = new Set(placed.flatMap(([{ at: [x, y] }], index) => textPixels(fixture.small, label[index], x, y)).map(pointKey));
  return wrongPixels(image, area.filter(point => !drawn.has(pointKey(point))), fixture.data[0]);
}

/** The upper DIAG line's candidate texts of format `format` (§4.4, DIAG `0x4d308`) from the run's readings. */
export function upperTexts(fixture: CockpitFixture, states: readonly CockpitState[]): (format: number) => string[] {
  const [first] = states;
  const { shield, hull } = first.combat!.resources;
  const { statusFormats, ratings } = fixture.status;
  const sum = first.combat!.subsystems.reduce((total, value) => total + value, 0);
  const rating = [...ratings].reverse().find(({ maximum }) => maximum >= sum)!.text;
  const energies = states.map(state => state.combat!.resources.energy.current);
  const values = [
    [Math.trunc((100 * shield.current) / shield.maximum)], [Math.max(0, Math.trunc((100 * hull.current) / hull.maximum))], [rating],
    Array.from({ length: Math.max(...energies) - Math.min(...energies) + 7 }, (_, index) => Math.min(...energies) - 3 + index),
  ];
  return format => values[format].map(value => formatText(statusFormats[format], value));
}

// The UI store's projection, as the mission screen's component holds it

export interface MenuOption {
  readonly key: number;
  readonly value: { readonly type: 'category' | 'object' | 'command' | 'exit'; readonly source?: number; readonly entityId?: number; readonly tone?: string };
}

/** What the cockpit tests read of the run, as the session bridge last published it. */
export interface CockpitState {
  readonly tick: number;
  readonly clock: number;
  readonly unitsPerTick: number;
  readonly viewMode: number;
  readonly subMode: number;
  /** Null without a player. */
  readonly combat: {
    readonly leftPage: number;
    readonly subsystems: readonly number[];
    readonly allocation: { readonly shieldLevel: number; readonly chargeLevel: number };
    readonly resources: Readonly<Record<'energy' | 'shield' | 'hull', { readonly current: number; readonly maximum: number }>>;
    readonly lampLit: boolean;
    readonly contacts: number;
    readonly target: { readonly entityId: number; readonly distance: number; readonly shield: { readonly current: number; readonly maximum: number } | null } | null;
  } | null;
  readonly menu: { readonly table: string; readonly options: readonly MenuOption[] } | null;
  readonly incoming: { readonly message: MessageIdentity; readonly shown: boolean } | null;
  /** The message line's head, as the store's `messages` holds it. */
  readonly head: { readonly text: string; readonly origin: string } | null;
}

/** Page function: the cockpit's facts from the mission screen's store (its `game` prop), or null without a projection. */
function readCockpitState(): CockpitState | null {
  interface Fiber { readonly memoizedProps?: { readonly game?: { getState(): unknown } } | null; readonly return: Fiber | null }
  const screen = document.querySelector('[data-testid="mission-screen"]');
  if (!screen) return null;
  const key = Object.keys(screen).find(name => name.startsWith('__reactFiber$'));
  let fiber = key ? (screen as unknown as Record<string, Fiber>)[key] : null;
  while (fiber && typeof fiber.memoizedProps?.game?.getState !== 'function') fiber = fiber.return;
  if (!fiber) return null;
  type Reading = { current: number; maximum: number };
  // The store's shapes, as far as read here (src/ui/game/game-store.ts, src/core/projections/projection.ts).
  const state = fiber.memoizedProps!.game!.getState() as {
    projection: {
      clock: { tick: number; clock: number; clockUnitsPerTick: number };
      player: { viewMode: number; subMode: number };
      flight: {
        combat: {
          readiness: string;
          player?: {
            leftPage: number; subsystems: number[]; allocation: { shieldLevel: number; chargeLevel: number }; resources: Record<string, Reading>;
            warp: { indicator: boolean }; radar: { contacts: unknown[] }; target: { entityId: number; distance: number; shield: Reading | null } | null;
          } | null;
        };
      };
      communications: { readiness: string; player?: { menu: { menu: { table: string }; options: MenuOption[] } | null; incoming: CockpitState['incoming'] } | null };
    } | null;
    messages: { head: { text: string; origin: string } | null } | null;
  };
  const { projection } = state;
  if (!projection) return null;
  const combat = projection.flight.combat.readiness === 'ready' ? projection.flight.combat.player ?? null : null;
  const communications = projection.communications.readiness === 'ready' ? projection.communications.player ?? null : null;
  const reading = ({ current, maximum }: Reading) => ({ current, maximum });
  return {
    tick: projection.clock.tick,
    clock: projection.clock.clock,
    unitsPerTick: projection.clock.clockUnitsPerTick,
    viewMode: projection.player.viewMode,
    subMode: projection.player.subMode,
    combat: combat && {
      leftPage: combat.leftPage, subsystems: [...combat.subsystems], allocation: { ...combat.allocation },
      resources: { energy: reading(combat.resources.energy), shield: reading(combat.resources.shield), hull: reading(combat.resources.hull) },
      lampLit: combat.warp.indicator, contacts: combat.radar.contacts.length,
      target: combat.target && { entityId: combat.target.entityId, distance: combat.target.distance, shield: combat.target.shield && reading(combat.target.shield) },
    },
    menu: communications?.menu ? {
      table: communications.menu.menu.table,
      options: communications.menu.options.map(({ key: byte, value }) => ({ key: byte, value: { ...value } })),
    } : null,
    incoming: communications?.incoming ? { message: { ...communications.incoming.message }, shown: communications.incoming.shown } : null,
    head: state.messages?.head ? { text: state.messages.head.text, origin: state.messages.head.origin } : null,
  };
}

/** The cockpit's facts now; fails without a projection. */
export async function cockpitState(page: Page): Promise<CockpitState> {
  const state = await page.evaluate(readCockpitState);
  if (state === null) throw new Error('The mission screen shows no projection');
  return state;
}

// Driving and reading a run: trusted `p` presses in the game input zone, which keep its focus

const status = (page: Page) => page.getByTestId('mission-status');

/** `p` in the input zone: the run pauses with focus kept there. */
export async function pause(page: Page): Promise<void> {
  await page.keyboard.press('p');
  await expect(status(page)).toHaveAttribute('data-phase', 'paused');
}

export async function resume(page: Page): Promise<void> {
  await page.keyboard.press('p');
  await expect(status(page)).toHaveAttribute('data-phase', 'running');
}

/** The paused picture and the projection it was drawn from (the run holds its tick while paused). */
export async function shot(page: Page): Promise<{ readonly image: LogicalImage; readonly state: CockpitState }> {
  await nextFrames(page);
  const state = await cockpitState(page);
  const image = await logicalImage(page, page.getByTestId('flight-area'));
  expect((await cockpitState(page)).tick, 'the run held its tick').toBe(state.tick);
  return { image, state };
}

/** Runs until `accept` holds for the projection (read every 20 ms), then pauses there; resolves to the paused picture. */
export async function pauseWhen(page: Page, accept: (state: CockpitState) => boolean, what: string, timeout = 30_000) {
  await expect.poll(async () => accept(await cockpitState(page)), { timeout, message: what, intervals: [20] }).toBe(true);
  await pause(page);
  return shot(page);
}

/** Runs `ticks` more ticks, then pauses. */
export async function after(page: Page, ticks: number) {
  const { tick } = await cockpitState(page);
  return pauseWhen(page, state => state.tick >= tick + ticks, `${ticks} more ticks`);
}

/** The mission clock at `tick`, from a state of the same run. */
export const clockAt = (state: CockpitState, tick: number) => state.clock - (state.tick - tick) * state.unitsPerTick;

/**
 * A paused picture of `view` from tick `from` on outside a screen flash (its static band in index 0): the Warp's flash 2
 * of the package lasts 1.6 s from its last restart and may shift the picture out of the screen.
 */
export async function calmPicture(page: Page, fixture: CockpitFixture, from: number, view: number) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const read = await pauseWhen(page, state => state.tick >= from + attempt * 9 && state.viewMode === view, `view ${view} from tick ${from}`, 90_000);
    if (wrongPixels(read.image, bandStatic(fixture), fixture.data[0]).length === 0) return read;
    await resume(page);
  }
  throw new Error(`No picture of view ${view} outside a flash`);
}

// Names

/** The mission, roster and craft info of `groups`, which name references resolve from. */
function nameSources(groups: readonly HeldGroup[]) {
  const assets = [...assetsOf(groups).values()];
  const content = <T>(found: Entry | undefined, decode: (bytes: Uint8Array, descriptor: AssetDescriptor) => { readonly content: unknown }): T => {
    if (!found) throw new Error('The package lacks a name source');
    return decode(found.bytes, found.descriptor).content as T;
  };
  const mission = content<MissionContent>(assets.find(({ descriptor }) => descriptor.role === 'mission'), decodeLogicPayload);
  return {
    mission,
    roster: content<WingmanRoster>(assets.find(({ descriptor }) => descriptor.id === mission.references.wingmanRoster), decodeLogicPayload),
    craftInfo: content<CraftInfo>(assets.find(({ descriptor }) => descriptor.role === 'craft-info'), decodeRuleDataPayload),
  };
}

/**
 * The byte string a name reference stands for, from the diagnostics panel's description of it (`describeName`:
 * `candidate mission#2 [0]` or `wingman#…`, `pool [5]`, `craft-type bit 3`, `none`), as the cockpit resolves names
 * from the package's mission setup and craft info (P3-13 spec, 文字与格式化).
 */
function nameOf({ mission, roster, craftInfo }: ReturnType<typeof nameSources>, description: string): string {
  if (description === 'none') return '';
  const candidate = /^candidate (mission|wingman)#(\d+) \[(\d+)\]$/.exec(description);
  if (candidate) return (candidate[1] === 'mission' ? mission.declarations : roster.options)[Number(candidate[2])].nameCandidates[Number(candidate[3])];
  const pool = /^pool \[(\d+)\]$/.exec(description);
  if (pool) return mission.namePool[Number(pool[1])];
  const craft = /^craft-type bit (\d+)$/.exec(description);
  if (craft) return craftInfo.craft[Number(craft[1])].name;
  throw new Error(`Unknown name reference ${description}`);
}

/**
 * The names of the run's entities as the cockpit shows them (development builds): the diagnostics panel's name
 * references, refreshed by its button, resolved in `groups`, the run's package; focus goes back to the game input zone.
 */
export async function entityNames(page: Page, groups: Promise<readonly HeldGroup[]>): Promise<(entityId: number) => string> {
  const sources = nameSources(await groups);
  const names = new Map<number, string>();
  for (const { id } of (await devState(page)).entities) names.set(id, nameOf(sources, (await page.evaluate(readDevEntity, id))!.name));
  await page.getByTestId('game-input-zone').focus();
  return entityId => names.get(entityId) ?? '';
}

// Synthetic package variants (the pattern of mission-result.ts's ending variants)

/** The stored point of the player and the craft on it, in reference units. */
const POINT = Object.freeze({ x: 100, y: 200, z: 0 });
/** A spawn time far beyond any run here, in source units: such a record stays queued. */
const NEVER = 4_000_000;
const [PLAYER, FRIENDLY, BASE] = [0, 14, 17];
const HOSTILES = Object.freeze([7, 8]);
const AWAY_REGION = 1;
/** The friendlies on the player and the player's hull: about 48 collision hits in ticks 2–4, the player kept. */
const COLLIDERS = 16;
const PLAYER_HULL = 12_000;

/** A plain record of one craft of `kind` from `template`, at POINT or anywhere in spawn rectangle `region`. */
function craftRecord(template: MissionDeclaration, kind: number, changes: Partial<MissionDeclaration> = {}, region: number | null = null): MissionDeclaration {
  return {
    ...template, origins: ['object'], craftType: kind, nameCandidates: [], position: region === null ? POINT : { x: 0, y: 0, z: 0 }, spawnTime: 0,
    gridSpacing: 0, placement: { region, anchor: null }, memberOf: null, aiTarget: null, eventTrigger: null, aiTargetCraftTypes: [], ...changes,
    ruleInputs: { ...template.ruleInputs, craftCount: null, ...changes.ruleInputs },
  };
}

/**
 * The startable package with COLLIDERS friendlies of kind 14 (huge hulls) on the player, whose hull of PLAYER_HULL
 * outlasts their first collisions: each hit starts the screen flash and rolls subsystem damage, which with the run
 * seeds the tests choose raises display fields to interference (checked in a Node world: field 11 at 2 with seed 23,
 * field 14 at 2 with seed 79). Hostiles stay queued away, so no all-clear ends the run. Everything is code-generated
 * from the synthetic disc's conversion; none of it holds original data.
 */
async function buildCollisionPackage(): Promise<readonly HeldGroup[]> {
  const [mission, craftInfo] = await Promise.all([
    missionAssetContent<MissionContent>(MISSION_ASSET, decodeLogicPayload), missionAssetContent<CraftInfo>(CRAFT_INFO_ASSET),
  ]);
  const template = (kind: number) => mission.declarations.find(({ craftType }) => craftType === kind) ?? mission.declarations[0];
  const player = template(PLAYER);
  const declarations = [
    craftRecord(player, PLAYER, { ruleInputs: { ...player.ruleInputs, percentC: 40, percentD: 50 } }),
    ...HOSTILES.map(kind => craftRecord(template(kind), kind, { spawnTime: NEVER, eventTrigger: 0 }, AWAY_REGION)),
    ...Array.from({ length: COLLIDERS }, () => craftRecord(template(FRIENDLY), FRIENDLY)),
    craftRecord(template(BASE), BASE, {}, AWAY_REGION),
  ].map((declaration, index) => ({ ...declaration, index }));
  const craft = [...craftInfo.craft];
  craft[PLAYER] = { ...craft[PLAYER], atC0: 2, at9C: PLAYER_HULL };
  craft[FRIENDLY] = { ...craft[FRIENDLY], at9C: 100_000 };
  const content: MissionContent = { ...mission, declarations, groups: [], eventTriggers: [{ ranges: [{ lower: 0, upper: 100, messages: [], summarySelector: 0 }] }] };
  return withPayloads({
    [MISSION_ASSET]: { bytes: encodeLogicPayload({ role: 'mission', content }), schemaVersion: LOGIC_PAYLOAD_SCHEMA_VERSION },
    [CRAFT_INFO_ASSET]: { bytes: ruleDataBytes({ ...craftInfo, craft }), schemaVersion: RULE_DATA_SCHEMA_VERSIONS['craft-info'] },
  });
}

let collisions: Promise<readonly HeldGroup[]> | undefined;

/** The collision variant, built once per worker process. */
export const collisionPackage = (): Promise<readonly HeldGroup[]> => (collisions ??= buildCollisionPackage());

/**
 * P3-10's docking package with a second base (a copy of its base record, placed in its own spawn rectangle): the base
 * category then lists two objects, so `c`, 2 opens page 3 and 1 the first base's command menu on page 4 (comm §7).
 */
async function buildTwoBasesPackage(): Promise<readonly HeldGroup[]> {
  const groups = await scenarioGroups('mission-docking');
  const logic = groups.find(({ manifest }) => readGroupManifest(manifest).group === 'logic')!;
  const descriptor = readGroupManifest(logic.manifest).assets.find(({ role }) => role === 'mission')!;
  const mission = decodeLogicPayload(readPayloadRecords(logic.payloads).find(({ id }) => id === descriptor.id)!.bytes, descriptor).content as MissionContent;
  const bases = mission.declarations.filter(({ craftType }) => craftType === BASE);
  if (bases.length !== 1) throw new Error('The docking mission must have one base');
  const declarations = [...mission.declarations, { ...bases[0], index: mission.declarations.length }];
  const bytes = encodeLogicPayload({ role: 'mission', content: { ...mission, declarations } });
  const payloadIdentity = { schemaVersion: LOGIC_PAYLOAD_SCHEMA_VERSION, byteLength: bytes.length, fingerprint: sha256Fingerprint(bytes) };
  return groups.map(group => {
    if (group !== logic) return group;
    const manifest = readGroupManifest(group.manifest);
    return {
      ...group,
      manifest: { ...manifest, assets: manifest.assets.map(asset => (asset.id === descriptor.id ? { ...asset, payloadIdentity } : asset)) },
      payloads: readPayloadRecords(group.payloads).map(payload => (payload.id === descriptor.id ? { ...payload, schemaVersion: payloadIdentity.schemaVersion, bytes } : payload)),
    };
  });
}

let twoBases: Promise<readonly HeldGroup[]> | undefined;

/** The two-bases docking variant, built once per worker process. */
export const twoBasesPackage = (): Promise<readonly HeldGroup[]> => (twoBases ??= buildTwoBasesPackage());
