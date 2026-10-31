import { expect, type CDPSession, type Page } from '@playwright/test';
import { cockpitCopy } from '../../src/app/composition/cockpit-copy.ts';
import { cockpitContentOf } from '../../src/app/mission/cockpit-content.ts';
import type { HeldGroup } from '../../src/app/resources/resource-holder.ts';
import type { AssetId } from '../../src/content/asset-id.ts';
import { readConverterVersion } from '../../src/content/content-identity.ts';
import { encodeMapGeometryPayload, type MapGeometry } from '../../src/content/hud/map-geometry-payload.ts';
import { encodeCockpitInstrumentsPayload, type CockpitInstruments, type InclusiveRectangle } from '../../src/content/hud/instruments-payload.ts';
import type { MissionContent } from '../../src/content/logic/logic-content.ts';
import { encodeLogicPayload } from '../../src/content/logic/logic-payload.ts';
import type { CraftInfo } from '../../src/content/rule-data/craft-info.ts';
import { encodeRuleDataPayload } from '../../src/content/rule-data/rule-data-payload.ts';
import { sha256Fingerprint } from '../../src/content/sha256.ts';
import type { MapOpen } from '../../src/core/projections/projection.ts';
import type { CockpitContent } from '../../src/render/cockpit/composition/cockpit-run.ts';
import { createMapPicture } from '../../src/render/cockpit/map-picture/map-picture.ts';
import type { CockpitDrawContext } from '../../src/render/cockpit/presentation/cockpit-contract.ts';
import { blit, createIndexedSurface, type IndexedSurface } from '../../src/render/cockpit/raster/indexed-surface.ts';
import { MAP_CURSOR_STYLE } from '../../src/render/map/map-cursor.ts';
import { LogicalImage, logicalImage, nextFrames, same, type Rgb } from './flight-pictures.ts';

// P3-13/28 (docs/plan/p3/13/subtasks/28-browser-map.md; spec 战略地图画面, 地图输入几何与指针, DC-09, Δ-09; AC-02, AC-05,
// AC-16, AC-17, AC-19, AC-20): reads and expectations for the strategic map picture of the formal mission flow with
// synthetic packages. Core's facts come from the mission's UI store (read only, through the screen's React fiber, as
// map-warp.ts reads it); the picture is the composited page (flight-pictures.ts). The expected picture is the map module
// drawing the same Core-confirmed `map` partition in Node from the same synthetic content (`cockpitContentOf`), so the
// browser shows exactly what Core confirmed through the map palette; independent checks key single elements to Core's
// facts and the synthetic fixtures. Variant packages edit the synthetic mission package's canonical JSON payloads in
// Node, re-encoded by their own content encoders (never original data).

/** A logical rectangle, ends included. */
export interface Rect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** What the mission's UI store shows of the run and its map, as the session bridge last published it. */
export interface MapView {
  readonly phase: string | null;
  readonly runId: number | null;
  readonly tick: number | null;
  readonly clock: number | null;
  readonly viewMode: number | null;
  readonly context: string | null;
  /** The `map` partition's readiness; null without a projection. */
  readonly readiness: string | null;
  /** The open map, as Core confirmed it; null when closed, not ready or without a player. */
  readonly map: MapOpen | null;
  /** The cockpit message line's head (DC-07); null when empty. */
  readonly messageHead: { readonly text: string; readonly origin: string } | null;
}

/**
 * Page function: the store as the mission screen's component holds it (its `game` prop), or null without a mission
 * screen; it only calls `getState` and copies plain data out.
 */
export function readMapView(): MapView | null {
  interface Fiber { readonly memoizedProps?: { readonly game?: { getState(): unknown } } | null; readonly return: Fiber | null }
  const screen = document.querySelector('[data-testid="mission-screen"]');
  if (!screen) return null;
  const key = Object.keys(screen).find(name => name.startsWith('__reactFiber$'));
  let fiber = key ? (screen as unknown as Record<string, Fiber>)[key] : null;
  while (fiber && typeof fiber.memoizedProps?.game?.getState !== 'function') fiber = fiber.return;
  if (!fiber) return null;
  const state = fiber.memoizedProps!.game!.getState() as {
    status: { phase: string; runId: number | null } | null;
    projection: {
      clock: { tick: number; clock: number };
      player: { viewMode: number; interactionContext: string };
      map: { readiness: string; player?: { state: string } | null };
    } | null;
    messages: { head: { text: string; origin: string } | null } | null;
  };
  const projection = state.projection;
  const player = projection?.map.readiness === 'ready' ? projection.map.player ?? null : null;
  const head = state.messages?.head ?? null;
  return JSON.parse(JSON.stringify({
    phase: state.status?.phase ?? null,
    runId: state.status?.runId ?? null,
    tick: projection?.clock.tick ?? null,
    clock: projection?.clock.clock ?? null,
    viewMode: projection?.player.viewMode ?? null,
    context: projection?.player.interactionContext ?? null,
    readiness: projection?.map.readiness ?? null,
    map: player?.state === 'open' ? player : null,
    messageHead: head && { text: head.text, origin: head.origin },
  })) as MapView;
}

export async function mapView(page: Page): Promise<MapView> {
  const view = await page.evaluate(readMapView);
  if (!view) throw new Error('No mission screen');
  return view;
}

/** Polls the store until `accept` holds; resolves to that view. */
export async function waitForMapView(page: Page, accept: (view: MapView) => boolean, what: string, timeout = 15_000): Promise<MapView> {
  const seen: { last: MapView | null } = { last: null };
  try {
    await expect.poll(async () => {
      seen.last = await page.evaluate(readMapView);
      return seen.last !== null && accept(seen.last);
    }, { timeout }).toBe(true);
  } catch (cause) {
    const { last } = seen;
    throw new Error(`${what}; last ${JSON.stringify(last && { ...last, map: last.map && { cursor: last.map.cursor, contacts: last.map.contacts.length } })}`, { cause });
  }
  return seen.last!;
}

/** The open map Core confirmed, which must be ready, open and hold contacts: never an empty or not-ready map. */
export function openMap(view: MapView): MapOpen {
  expect(view.readiness, 'the map partition is ready').toBe('ready');
  expect(view.map, 'the map is open').not.toBeNull();
  expect(view.map!.contacts.length, 'Core lists contacts').toBeGreaterThan(0);
  return view.map!;
}

// Content

/** The synthetic content the picture is drawn from, decoded in Node as the app decodes it. */
export interface MapContent {
  readonly cockpit: CockpitContent;
  /** `palette/map/screen` and `palette/flight/cockpit-hud-map` as 8-bit colours. */
  readonly mapPalette: readonly Rgb[];
  readonly flightPalette: readonly Rgb[];
  /** The type-10 record's inclusive rectangle and the slot's type-8 message line rectangle. */
  readonly mapRecord: InclusiveRectangle;
  readonly messageRect: Rect;
  /** The map frame's pass-1 elements, in draw order. */
  readonly frame: readonly { readonly image: AssetId; readonly x: number; readonly y: number; readonly width: number; readonly height: number }[];
}

const colours = (entries: Uint8Array): Rgb[] =>
  Array.from({ length: entries.length / 3 }, (_, index) => [entries[index * 3], entries[index * 3 + 1], entries[index * 3 + 2]] as const);

export function mapContent(groups: readonly HeldGroup[]): MapContent {
  const cockpit = cockpitContentOf({ groups, generation: 1, identity: 'e2e-map-picture' }, cockpitCopy());
  const slot = cockpit.instruments.slots[1];
  const record = (type: number) => slot.instruments.find(instrument => instrument.type === type)!.rectangle;
  const layout = cockpit.layouts.get(slot.layout!)!;
  return {
    cockpit,
    mapPalette: colours(cockpit.palettes.map.entries),
    flightPalette: colours(cockpit.palettes.flight.entries),
    mapRecord: record(10),
    messageRect: record(8),
    frame: layout.elements.map(({ image, x, y }) => {
      const { width, height } = cockpit.elementImages.get(image)!;
      return { image, x, y, width, height };
    }),
  };
}

export interface ExpectedOptions {
  /** DC-09's distance labels. */
  readonly labelsOn?: boolean;
  /** The local pointer's main-map pixel; null draws it at the confirmed cursor. */
  readonly pointer?: { readonly column: number; readonly row: number } | null;
}

/**
 * The indices of the map screen for Core's `map` as the map module draws it in Node from the same content (B filled with
 * 0, the type-10 picture, the pass-1 frame elements), without the message line, whose rectangle callers check apart.
 */
export function expectedMapIndices(content: MapContent, view: MapView, { labelsOn = false, pointer = null }: ExpectedOptions = {}): IndexedSurface {
  const { cockpit } = content;
  const side = view.map!.geometry.main.width;
  const picture = createMapPicture({
    font: cockpit.fonts.small, unitMarkers: cockpit.unitMarkers, zoomIcons: cockpit.zoomIcons, hudText: cockpit.hudText,
    names: cockpit.names, costUnavailable: cockpitCopy().costUnavailable,
    pointer: () => (pointer === null ? null : { right: (pointer.column + 0.5) / side, down: (pointer.row + 0.5) / side }),
  });
  // One read call with the button down turns the labels on (DC-09 step 2).
  if (labelsOn) picture.prepare({ render: { viewMode: 8 }, previousViewMode: 8, clock: 1, mapRightButton: true } as never);
  const back = createIndexedSurface(640, 480, true);
  const context = { projection: { map: { readiness: 'ready', player: view.map } }, back, clock: view.clock, tick: view.tick } as unknown as CockpitDrawContext;
  const { x0, y0, x1, y1 } = content.mapRecord;
  picture.instruments[10].draw(context, { type: 10, rectangle: { x0, y0, x1, y1 } } as never);
  for (const { image, x, y } of content.frame) blit(back, cockpit.elementImages.get(image)!, x, y, 'mask');
  picture.dispose();
  return back;
}

/** A picture of `indices` through `palette`. */
export function paint(indices: IndexedSurface, palette: readonly Rgb[]): LogicalImage {
  const image = new LogicalImage();
  for (let at = 0; at < indices.indices.length; at++) image.data.set(palette[indices.indices[at]], at * 3);
  return image;
}

export const inside = ({ x0, y0, x1, y1 }: Rect, x: number, y: number): boolean => x >= x0 && x <= x1 && y >= y0 && y <= y1;

/** The pixels of `actual` that differ from `expected`, outside `exclude`. */
export function differences(actual: LogicalImage, expected: LogicalImage, exclude: readonly Rect[] = []) {
  const found: { x: number; y: number; actual: Rgb; expected: Rgb }[] = [];
  for (let y = 0; y < 480; y++) {
    for (let x = 0; x < 640; x++) {
      if (exclude.some(rect => inside(rect, x, y))) continue;
      const [a, e] = [actual.at(x, y), expected.at(x, y)];
      if (!same(a, e)) found.push({ x, y, actual: a, expected: e });
    }
  }
  return found;
}

/** The composited picture of the flight area, after two animation frames. */
export async function screenPicture(page: Page): Promise<LogicalImage> {
  await nextFrames(page);
  return logicalImage(page, page.getByTestId('flight-area'));
}

/** Which of the labels' states the picture shows, if exactly one matches Core's map; null when neither does. */
export function matchLabels(content: MapContent, view: MapView, image: LogicalImage, pointer: ExpectedOptions['pointer'] = null) {
  const exclude = [content.messageRect];
  const off = differences(image, paint(expectedMapIndices(content, view, { pointer }), content.mapPalette), exclude);
  const on = differences(image, paint(expectedMapIndices(content, view, { pointer, labelsOn: true }), content.mapPalette), exclude);
  return { labelsOn: off.length === 0 ? false : on.length === 0 ? true : null, off, on };
}

/**
 * Expects the picture to be exactly Core's map as the map module draws it, with the labels off or on (`labelsOn`, or
 * whichever matches), outside the message line; resolves to which.
 */
export function expectMapPicture(content: MapContent, view: MapView, image: LogicalImage, options: ExpectedOptions = {}): boolean {
  openMap(view);
  const { labelsOn, off, on } = matchLabels(content, view, image, options.pointer ?? null);
  const wanted = options.labelsOn === undefined ? labelsOn : labelsOn === options.labelsOn ? labelsOn : null;
  if (wanted === null) {
    const closest = (options.labelsOn ?? on.length < off.length) ? on : off;
    expect(closest.slice(0, 12), `${closest.length} pixels differ from Core's map (tick ${view.tick})`).toEqual([]);
  }
  return wanted!;
}

/**
 * Negative controls: the same map without contacts, members, labels, rows or destination (an empty or not-ready map
 * would look like that), or through the flight palette, differs from the picture.
 */
export function expectNotEmptyOrFlight(content: MapContent, view: MapView, image: LogicalImage, options: ExpectedOptions = {}): void {
  const map = openMap(view);
  const empty: MapView = {
    ...view,
    map: { ...map, contacts: [], zoomMembers: [], labels: [], destination: null, information: { ...map.information, rows: [] } },
  };
  const exclude = [content.messageRect];
  expect(differences(image, paint(expectedMapIndices(content, empty, options), content.mapPalette), exclude).length, 'an empty map differs').toBeGreaterThan(50);
  expect(differences(image, paint(expectedMapIndices(content, view, options), content.flightPalette), exclude).length, 'the flight palette differs')
    .toBeGreaterThan(1000);
}

/** The share of `points` whose colour is map palette `index`. */
function share(content: MapContent, image: LogicalImage, points: readonly (readonly [number, number])[], index: number): number {
  return points.filter(([x, y]) => same(image.at(x, y), content.mapPalette[index])).length / points.length;
}

const row = (y: number, x0: number, x1: number): [number, number][] => Array.from({ length: x1 - x0 + 1 }, (_, i) => [x0 + i, y]);
const column = (x: number, y0: number, y1: number): [number, number][] => Array.from({ length: y1 - y0 + 1 }, (_, i) => [x, y0 + i]);

/** fonts/1's cell: advance 6, height 8 (`0x49694`; the synthetic font's height). */
const GLYPH = Object.freeze({ advance: 6, height: 8 });

/**
 * Element checks keyed to Core's facts and the synthetic content, written out here from hud §4.9 and DC-09 without the
 * map module: the background is palette entry 0, not black; the outlines (main map 8, information and zoom 0xD) at
 * x + w and y + h; the grid (4); every isolated in-world contact's unit marker (TABL 10461, by kind bit) at its pixel
 * with its own indices; each label's name next to its pixel; the cursor's cost text at the confirmed cursor + (2, 2) in
 * its band's colour (0xA for E = 0); one text band per information row, rows past the window drawn below it. A `crowded`
 * map may have no contact apart from the others.
 */
export function expectCoreElements(content: MapContent, view: MapView, image: LogicalImage, { crowded = false } = {}): void {
  const map = openMap(view);
  const { main, information, zoom, sectors } = map.geometry;
  const side = main.width;
  const background = image.at(content.mapRecord.x1 + 8, 240);
  expect(background, 'the background is map palette entry 0').toEqual(content.mapPalette[0]);
  expect(background, 'not black').not.toEqual([0, 0, 0]);

  // Outlines and grid, by majority: the pointer box and icons may cross them.
  expect(share(content, image, row(main.y + side, main.x + 1, main.x + side - 1), 0x08), 'main map bottom edge').toBeGreaterThan(0.9);
  expect(share(content, image, column(main.x, main.y + 1, main.y + side - 1), 0x08), 'main map left edge').toBeGreaterThan(0.9);
  const right = information.x + information.width;
  expect(share(content, image, column(right, information.y + 1, information.y + information.height - 1), 0x0d), 'information right edge').toBeGreaterThan(0.9);
  expect(share(content, image, row(zoom.y + zoom.height, zoom.x + 1, zoom.x + zoom.width - 1), 0x0d), 'zoom bottom edge').toBeGreaterThan(0.9);
  const step = Math.trunc(side / sectors);
  for (let index = 1; index < sectors; index++) {
    expect(share(content, image, column(main.x + index * step, main.y + 1, main.y + side - 1), 0x04), `grid line ${index}`).toBeGreaterThan(0.5);
  }

  // Unit markers of contacts nothing else covers: away from other icons, the line, labels and the pointer box.
  const markers = content.cockpit.unitMarkers;
  const box = (column: number, row: number, kind: number) => ({ x0: main.x + column, y0: main.y + row, x1: main.x + column + markers[kind].width - 1, y1: main.y + row + markers[kind].height - 1 });
  const near = (a: Rect, b: Rect, margin: number) => a.x0 - margin <= b.x1 && b.x0 - margin <= a.x1 && a.y0 - margin <= b.y1 && b.y0 - margin <= a.y1;
  const { cursor: { pixel: cursor }, line } = map;
  const pointerBox = { x0: main.x + cursor.column - 40, y0: main.y + cursor.row - 80, x1: main.x + cursor.column + 40, y1: main.y + cursor.row + 80 };
  const lineBox = {
    x0: main.x + Math.min(line.from.column, line.to.column), y0: main.y + Math.min(line.from.row, line.to.row),
    x1: main.x + Math.max(line.from.column, line.to.column), y1: main.y + Math.max(line.from.row, line.to.row),
  };
  const labelBoxes = map.labels.map(({ pixel }) => ({ x0: main.x + pixel.column - 8, y0: main.y + pixel.row - 16, x1: main.x + pixel.column + 120, y1: main.y + pixel.row + 16 }));
  if (map.destination?.inWorld) {
    const { column, row } = map.destination.pixel;
    labelBoxes.push({ x0: main.x + column, y0: main.y + row, x1: main.x + column + 3 + 6 * GLYPH.advance, y1: main.y + row + 3 + GLYPH.height });
  }
  let checked = 0;
  for (const contact of map.contacts) {
    if (!contact.inWorld || contact.class === 'player' || contact.target) continue;
    const own = box(contact.pixel.column, contact.pixel.row, contact.kindBit);
    const others = map.contacts.filter(other => other !== contact).map(other => box(other.pixel.column, other.pixel.row, other.target ? 28 : other.kindBit));
    if (own.x1 >= main.x + side || own.y1 >= main.y + side) continue;
    if ([...others, lineBox, ...labelBoxes, pointerBox].some(other => near(own, other, 2))) continue;
    const marker = markers[contact.kindBit];
    for (let y = 0; y < marker.height; y++) {
      for (let x = 0; x < marker.width; x++) {
        const opaque = marker.mask === null || (marker.mask[y * ((marker.width + 7) >> 3) + (x >> 3)] & (0x80 >> (x & 7))) !== 0;
        if (opaque) expect(image.at(own.x0 + x, own.y0 + y), `contact ${contact.entityId} marker pixel ${x}, ${y}`).toEqual(content.mapPalette[marker.indices[y * marker.width + x]]);
      }
    }
    checked += 1;
  }
  if (!crowded) expect(checked, 'at least one isolated contact marker').toBeGreaterThan(0);

  // Labels: the name's cells beside the label pixel hold the label colours.
  for (const label of map.labels) {
    const name = content.cockpit.names(label.name);
    if (name.length === 0) continue;
    const [x, y] = [main.x + label.pixel.column, main.y + label.pixel.row];
    const top = label.pixel.row > Math.trunc(side / 2) ? y - GLYPH.height - 6 : y + 6;
    const cells = { x0: x, y0: top, x1: x + GLYPH.advance * name.length - 1, y1: top + GLYPH.height - 1 };
    expect(pixelsOf(content, image, cells, [0x0a, 0x0f, 0x10]).length, `label ${label.entityId}`).toBeGreaterThan(0);
  }

  // The cursor's cost text at the confirmed cursor, in its band (Δ-06: E = 0 is always 0xA).
  const { percent } = map.cursorCost;
  const band = percent === null || percent >= 100 ? 0x0a : percent >= 67 ? 0x0f : 0x08;
  const flip = 6 * GLYPH.advance;
  const costX = main.x + (cursor.column > side - flip ? cursor.column - flip - 2 : cursor.column + 2);
  const costY = main.y + (cursor.row > side - GLYPH.height ? cursor.row - GLYPH.height - 2 : cursor.row + 2);
  const length = percent === null ? cockpitCopy().costUnavailable.length : 6;
  expect(pixelsOf(content, image, { x0: costX, y0: costY, x1: costX + GLYPH.advance * length - 1, y1: costY + GLYPH.height - 1 }, [band]).length, 'cost text')
    .toBeGreaterThan(0);

  // Information rows: one band of row colours per row; rows past the window draw below it.
  const rows = map.information.rows;
  rows.forEach((_, index) => {
    const y0 = information.y + 4 + GLYPH.height * index;
    expect(pixelsOf(content, image, { x0: information.x + 4, y0, x1: information.x + information.width - 1, y1: y0 + GLYPH.height - 1 }, [0x13, 0x0a]).length,
      `information row ${index}`).toBeGreaterThan(0);
  });
  const next = information.y + 4 + GLYPH.height * rows.length;
  if (next + GLYPH.height <= information.y + information.height) {
    expect(pixelsOf(content, image, { x0: information.x + 4, y0: next, x1: information.x + information.width - 1, y1: next + GLYPH.height - 1 }, [0x13, 0x0a]),
      'no row after the last').toEqual([]);
  }
}

/** The message line's rectangle shows the head in its outline (8) and text, or nothing (palette entry 0). */
export function expectMessageLine(content: MapContent, view: MapView, image: LogicalImage): void {
  const { x0, y0, x1, y1 } = content.messageRect;
  const lit = pixelsOf(content, image, content.messageRect, Array.from({ length: 255 }, (_, index) => index + 1)
    .filter(index => !same(content.mapPalette[index], content.mapPalette[0])));
  if (view.messageHead === null) {
    expect(lit, 'an empty message line draws nothing').toEqual([]);
    return;
  }
  expect(share(content, image, row(y0, x0, x1 - 1), 0x08), 'message line outline').toBeGreaterThan(0.9);
  expect(share(content, image, column(x0, y0, y1 - 1), 0x08), 'message line outline').toBeGreaterThan(0.9);
  const inner = lit.filter(({ x, y }) => x > x0 && x < x1 - 1 && y > y0 && y < y1 - 1);
  expect(inner.length, 'message text').toBeGreaterThan(0);
}

/** Every pixel of `rect` (clipped to the screen) whose colour is one of `indices` in the map palette. */
export function pixelsOf(content: MapContent, image: LogicalImage, rect: Rect, indices: readonly number[]): { x: number; y: number }[] {
  const wanted = indices.map(index => content.mapPalette[index]);
  const found: { x: number; y: number }[] = [];
  for (let y = Math.max(0, rect.y0); y <= Math.min(479, rect.y1); y++) {
    for (let x = Math.max(0, rect.x0); x <= Math.min(639, rect.x1); x++) {
      const rgb = image.at(x, y);
      if (wanted.some(colour => same(colour, rgb))) found.push({ x, y });
    }
  }
  return found;
}

/** The zoom window's inside: x + 1 … x + w − 1, y + 1 … y + h − 1. */
export const zoomInside = ({ geometry: { zoom } }: MapOpen): Rect => ({ x0: zoom.x + 1, y0: zoom.y + 1, x1: zoom.x + zoom.width - 1, y1: zoom.y + zoom.height - 1 });

/** The map palette indices that colour the distance labels: 8, and 0xF for the target's. */
const LABEL_INDICES = [0x08, 0x0f];

/**
 * Whether the zoom window can show the colours of palette `indices` only as what draws them: no zoom icon of `kinds`
 * uses them, nor do the caption (0xA) and selection boxes (0xD) unless they are among them.
 */
export function zoomColoursFree(content: MapContent, kinds: readonly number[], indices: readonly number[]): boolean {
  const wanted = indices.map(index => content.mapPalette[index]);
  const taken = (index: number) => wanted.some(colour => same(colour, content.mapPalette[index]));
  return kinds.every(kind => [...content.cockpit.zoomIcons[kind].indices].every(index => index === 0 || !taken(index)))
    && [0x0a, 0x0d].every(index => indices.includes(index) || !taken(index));
}

/** Whether the label colours tell the distance labels apart in the zoom window (see `zoomColoursFree`). */
export const labelColoursFree = (content: MapContent, kinds: readonly number[]): boolean => zoomColoursFree(content, kinds, LABEL_INDICES);

/** Whether any pixel of the viewport screenshot is the project crosshair's colour (map-cursor.ts). */
export function hasCrosshairColour(image: LogicalImage): boolean {
  const [r, g, b] = [1, 3, 5].map(index => parseInt(MAP_CURSOR_STYLE.colour.slice(index, index + 2), 16));
  for (let at = 0; at < image.data.length; at += 3) if (image.data[at] === r && image.data[at + 1] === g && image.data[at + 2] === b) return true;
  return false;
}

// Variant packages

type Editor<T> = (content: T) => T;

/** Replaces payload `id`'s bytes in a copy of `groups` with `encode(edit(its JSON))`, updating its declared identity. */
function editPayload<T>(groups: readonly HeldGroup[], id: string, encode: (content: T) => Uint8Array, edit: Editor<T>): HeldGroup[] {
  let found = false;
  const edited = groups.map(group => {
    const payloads = group.payloads as readonly { readonly id: string; readonly schemaVersion: number; readonly bytes: Uint8Array }[];
    const at = payloads.findIndex(payload => payload.id === id);
    if (at < 0) return group;
    found = true;
    const bytes = encode(edit(JSON.parse(new TextDecoder().decode(payloads[at].bytes)) as T));
    const manifest = group.manifest as { readonly assets: readonly { readonly id: string; readonly payloadIdentity: object }[] };
    return {
      ...group,
      manifest: {
        ...manifest,
        assets: manifest.assets.map(asset => (asset.id === id
          ? { ...asset, payloadIdentity: { ...asset.payloadIdentity, byteLength: bytes.length, fingerprint: sha256Fingerprint(bytes) } }
          : asset)),
      },
      payloads: payloads.map((payload, index) => (index === at ? { ...payload, bytes } : payload)),
    };
  });
  if (!found) throw new Error(`No payload ${id}`);
  return edited;
}

export const editMission = (groups: readonly HeldGroup[], edit: Editor<MissionContent>): HeldGroup[] =>
  editPayload<MissionContent>(groups, 'mission/first-campaign', content => encodeLogicPayload({ role: 'mission', content } as never), edit);

export const editCraftInfo = (groups: readonly HeldGroup[], edit: Editor<CraftInfo>): HeldGroup[] =>
  editPayload<CraftInfo>(groups, 'data/craft-info', content => encodeRuleDataPayload({ role: 'craft-info', content }), edit);

/** Moves only the map geometry's rectangle, so it no longer equals the slot-2 type-10 record's (DC-02): invalid content. */
export const editMapGeometryOnly = (groups: readonly HeldGroup[], rectangle: InclusiveRectangle): HeldGroup[] =>
  editPayload<MapGeometry>(groups, 'data/hud/map-geometry', encodeMapGeometryPayload, geometry => ({ ...geometry, rectangle }));

/** Moves the map: the geometry's rectangle and the slot-2 type-10 record's, which must stay equal (DC-02). */
export function editMapRectangle(groups: readonly HeldGroup[], rectangle: InclusiveRectangle): HeldGroup[] {
  const moved = editPayload<MapGeometry>(groups, 'data/hud/map-geometry', encodeMapGeometryPayload, geometry => ({ ...geometry, rectangle }));
  return editPayload<CockpitInstruments>(moved, 'data/hud/instruments', encodeCockpitInstrumentsPayload, instruments => ({
    ...instruments,
    slots: instruments.slots.map(slot => (slot.slot === 2
      ? { ...slot, instruments: slot.instruments.map(record => (record.type === 10 ? { ...record, rectangle } : record)) }
      : slot)) as unknown as CockpitInstruments['slots'],
  }));
}

// Input

/** One frame of `installLabelRecorder`: the store's tick and view mode, and whether the zoom window shows labels. */
export interface LabelSample {
  readonly tick: number | null;
  readonly viewMode: number | null;
  /** Null outside the map, or when the frame's drawing buffer held no map picture to read. */
  readonly shown: boolean | null;
  /** Whether the store published a projection in this frame, so `tick` is this frame's own. */
  readonly published: boolean;
  readonly time: number;
}

declare global {
  interface Window { osrLabelRecord?: { samples: LabelSample[]; stopped: boolean; presses: number[]; restart(): void } }
}

/**
 * Page function: records, each animation frame after the app's own, the run's tick and view mode from the UI store and
 * whether the zoom window's inside `zoom` holds a label colour, read from the canvas's drawing buffer before the frame
 * is presented (the default framebuffer, the read binding restored); a frame without the background colour in the
 * window has nothing to read. Read only: nothing in the app changes. Animation frame callbacks run in the order they were
 * requested, so after the app's own loop stopped and started again (a pause) the recorder must `restart` to read after it.
 */
function installLabelRecorder({ zoom, labels, background }: { zoom: Rect; labels: number[][]; background: number[] }): void {
  interface Fiber { readonly memoizedProps?: { readonly game?: { getState(): unknown } } | null; readonly return: Fiber | null }
  const screen = document.querySelector('[data-testid="mission-screen"]')!;
  const key = Object.keys(screen).find(name => name.startsWith('__reactFiber$'))!;
  let fiber: Fiber | null = (screen as unknown as Record<string, Fiber>)[key];
  while (fiber && typeof fiber.memoizedProps?.game?.getState !== 'function') fiber = fiber.return;
  const game = fiber!.memoizedProps!.game!;
  const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="flight-area"] canvas')!;
  const gl = canvas.getContext('webgl2')!;
  let generation = 0;
  const record = {
    samples: [] as LabelSample[], stopped: false, presses: [] as number[],
    restart() {
      const own = ++generation;
      requestAnimationFrame(time => { step(time, own); });
    },
  };
  window.osrLabelRecord = record;
  // Right-button presses by the page clock, as the input zone receives them.
  document.addEventListener('mousedown', event => { if (event.button === 2) record.presses.push(performance.now()); }, true);
  const equal = (pixels: Uint8Array, at: number, rgb: number[]) => pixels[at] === rgb[0] && pixels[at + 1] === rgb[1] && pixels[at + 2] === rgb[2];
  type State = { projection: { clock: { tick: number }; player: { viewMode: number } } | null };
  // The projection the store already holds may be up to a publication interval old, so the first frame does not count
  // it as published.
  let projection = (game.getState() as State).projection;
  const step = (time: number, own: number): void => {
    if (record.stopped || own !== generation) return;
    const state = game.getState() as State;
    const published = state.projection !== projection;
    projection = state.projection;
    const tick = state.projection?.clock.tick ?? null;
    const viewMode = state.projection?.player.viewMode ?? null;
    let shown: boolean | null = null;
    if (viewMode === 8) {
      const scale = canvas.width / 640;
      const [x, y] = [Math.ceil(zoom.x0 * scale), Math.ceil(zoom.y0 * scale)];
      const [width, height] = [Math.floor((zoom.x1 + 1) * scale) - x, Math.floor((zoom.y1 + 1) * scale) - y];
      const pixels = new Uint8Array(width * height * 4);
      const previous = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.readPixels(x, canvas.height - y - height, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, previous);
      let valid = false;
      let label = false;
      for (let at = 0; at < pixels.length; at += 4) {
        if (equal(pixels, at, background)) valid = true;
        else if (labels.some(rgb => equal(pixels, at, rgb))) label = true;
      }
      shown = valid ? label : null;
    }
    record.samples.push({ tick, viewMode, shown, published, time });
    requestAnimationFrame(next => { step(next, own); });
  };
  record.restart();
}

/** Page function: what `installLabelRecorder` recorded so far; `stop` ends it. */
function labelRecord(stop: boolean): { samples: LabelSample[]; presses: number[] } {
  const record = window.osrLabelRecord;
  if (!record) throw new Error('No label recorder');
  if (stop) record.stopped = true;
  return { samples: record.samples, presses: record.presses };
}

/** Restarts the label recorder's frame loop after the app's (see `installLabelRecorder`). */
export const restartLabelRecorder = (page: Page): Promise<void> => page.evaluate(() => { window.osrLabelRecord!.restart(); });

/** The label recorder's frames and right-button press times so far; `stop` ends it. */
export const recordedLabels = (page: Page, stop = false) => page.evaluate(labelRecord, stop);

/** The ticks of the first frame after page time `time`: the batch a press at that time reaches. */
export function tickAfter(samples: readonly LabelSample[], time: number): { low: number; high: number } {
  const index = samples.findIndex(sample => sample.time > time);
  if (index < 0) throw new Error(`No frame after ${time}`);
  return frameTicks(samples)[index];
}

/**
 * Starts the label recorder for `map`'s zoom window in `content`'s colours, and waits until it has recorded a published
 * frame and, from then on, a frame without labels: the ticks of later frames are bounded from that publication, and a
 * first change of the labels after it has a frame before to change from.
 */
export async function recordLabels(page: Page, content: MapContent, map: MapOpen): Promise<void> {
  const labels = LABEL_INDICES.map(index => [...content.mapPalette[index]]);
  await page.evaluate(installLabelRecorder, { zoom: zoomInside(map), labels, background: [...content.mapPalette[0]] });
  await expect.poll(async () => {
    const { samples } = await recordedLabels(page);
    const anchor = samples.findIndex(isAnchor);
    return anchor >= 0 && samples.slice(anchor).some(({ shown }) => shown === false);
  }, { message: 'the label recorder has a published frame and then one without labels', timeout: 5_000, intervals: [5] }).toBe(true);
}

/** Whether a frame knows its tick exactly: the store published it in that frame. */
const isAnchor = (sample: LabelSample): sample is LabelSample & { tick: number } => sample.published && sample.tick !== null;

/** The runtime's fixed step: 64 clock units a second at 2 a tick (core/contracts/time.ts, FixedStepClock). */
const TICK_MS = 1000 / 32;

/**
 * Each frame's tick as a range. The store publishes the projection about every 100 ms, so only a frame that published
 * knows its tick exactly; from the last published frame before, the fixed step adds ⌊Δt ÷ 31.25 ms⌋ ticks, or one more
 * for the step's leftover time, by the same animation frame time the session steps with. The next published tick
 * bounds both from above.
 */
export function frameTicks(samples: readonly LabelSample[]): { low: number; high: number }[] {
  const anchors = samples.map(sample => (isAnchor(sample) ? { tick: sample.tick, time: sample.time } : null));
  let previous: { tick: number; time: number } | null = null;
  const before = anchors.map(anchor => (previous = anchor ?? previous));
  let next: { tick: number; time: number } | null = null;
  const after = anchors.map((_, index) => anchors[anchors.length - 1 - index]).map(anchor => (next = anchor ?? next)).reverse();
  return samples.map(({ time }, index) => {
    const own = anchors[index];
    if (own) return { low: own.tick, high: own.tick };
    const [last, coming] = [before[index], after[index]];
    const ceiling = coming?.tick ?? Infinity;
    if (!last) return { low: -Infinity, high: ceiling };
    const steps = Math.floor((time - last.time) / TICK_MS);
    return { low: Math.min(last.tick + steps, ceiling), high: Math.min(last.tick + steps + 1, ceiling) };
  });
}

/**
 * The recorded changes of the labels, with the state they changed to, from the first frame after time `from` (page
 * clock, ms): each happened in the ticks (`after`, `tick`], after the earliest the frame before could show and by the
 * latest the changed frame could.
 */
export function labelChanges(samples: readonly LabelSample[], from = -Infinity): { tick: number; after: number; shown: boolean }[] {
  const ticks = frameTicks(samples);
  const changes: { tick: number; after: number; shown: boolean }[] = [];
  let last: number | null = null;
  samples.forEach(({ shown, time }, index) => {
    if (shown === null) return;
    if (last !== null && samples[last].shown !== shown && time > from) changes.push({ tick: ticks[index].high, after: ticks[last].low, shown });
    last = index;
  });
  return changes;
}

/** Whether some first tick t puts change i at t + i × `period` inside its bracket, for every change. */
export function fitsPeriod(changes: readonly { tick: number; after: number }[], period: number): boolean {
  const earliest = Math.max(...changes.map(({ after }, index) => after + 1 - index * period));
  const latest = Math.min(...changes.map(({ tick }, index) => tick - index * period));
  return earliest <= latest;
}

/**
 * The first recorded frame after page time `from` whose view mode is (or, with `not`, is not) `viewMode`: the store
 * publishes a view mode change at once, in the frame of its tick, so the change happened in the ticks (`after`, `tick`].
 */
export function viewModeFrame(samples: readonly LabelSample[], viewMode: number, from: number, not = false): { time: number; tick: number; after: number } {
  const index = samples.findIndex(sample => sample.time > from && sample.tick !== null && (sample.viewMode === viewMode) !== not);
  if (index < 0) throw new Error(`No frame ${not ? 'outside' : 'in'} view mode ${viewMode} after ${from} ms`);
  const ticks = frameTicks(samples);
  return { time: samples[index].time, tick: ticks[index].high, after: index > 0 ? ticks[index - 1].low : -Infinity };
}

/**
 * CDP evaluation without a user gesture (map-input.ts), such as the page's own Pointer Lock exit standing for the
 * browser's unlock, or a focus change: Playwright's own evaluations run as user gestures, which would let the map ask
 * for the lock as it qualifies.
 */
export async function quietly(cdp: CDPSession, expression: string): Promise<void> {
  const { exceptionDetails } = await cdp.send('Runtime.evaluate', { expression, userGesture: false, awaitPromise: true });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
}

export const ZONE = '[data-testid="game-input-zone"]';

/** Whether the input zone holds the Pointer Lock. */
export const zoneLocked = (page: Page): Promise<boolean> =>
  page.evaluate(() => document.pointerLockElement === document.querySelector('[data-testid="game-input-zone"]'));

/** The flight canvas's CSS box and its CSS px per logical px, across and down (the buffer keeps 4:3 within a pixel). */
export async function canvasBox(page: Page): Promise<{ left: number; top: number; width: number; height: number; scale: number; scaleY: number }> {
  return page.getByTestId('flight-area').locator('canvas').evaluate(canvas => {
    const { left, top, width, height } = canvas.getBoundingClientRect();
    return { left, top, width, height, scale: width / 640, scaleY: height / 480 };
  });
}

// Cache

/** A digest of every record in the resource cache database, by key, so a test can tell they stayed unchanged. */
export interface StoredCache {
  readonly packages: readonly { readonly key: string; readonly digest: string }[];
  readonly payloads: number;
  readonly payloadDigest: string;
}

/** Page function: reads the resource cache database (`database`), changing nothing; empty when it does not exist. */
export async function readStoredCache({ name, packageStore, payloadStore }: { name: string; packageStore: string; payloadStore: string }): Promise<StoredCache> {
  if (!(await indexedDB.databases()).some(database => database.name === name)) return { packages: [], payloads: 0, payloadDigest: '' };
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => { resolve(request.result); };
    request.onerror = () => { reject(request.error); };
  });
  try {
    const all = (store: string) => new Promise<{ keys: IDBValidKey[]; values: unknown[] }>((resolve, reject) => {
      const transaction = db.transaction(store, 'readonly');
      const keys = transaction.objectStore(store).getAllKeys();
      const values = transaction.objectStore(store).getAll();
      transaction.oncomplete = () => { resolve({ keys: keys.result, values: values.result }); };
      transaction.onabort = () => { reject(transaction.error); };
    });
    let hash = 0x811c9dc5;
    const mix = (bytes: Uint8Array) => { for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0; };
    const text = new TextEncoder();
    const packages = await all(packageStore);
    const payloads = await all(payloadStore);
    payloads.keys.forEach((key, index) => {
      mix(text.encode(JSON.stringify(key)));
      mix(new Uint8Array((payloads.values[index] as { bytes: ArrayBuffer }).bytes));
    });
    return {
      packages: packages.keys.map((key, index) => {
        let digest = 0x811c9dc5;
        for (const byte of text.encode(JSON.stringify(packages.values[index]))) digest = Math.imul(digest ^ byte, 0x01000193) >>> 0;
        return { key: JSON.stringify(key), digest: digest.toString(16) };
      }),
      payloads: payloads.keys.length,
      payloadDigest: hash.toString(16),
    };
  } finally {
    db.close();
  }
}

/** The converter version before P3-13's graphics-6 (P3-03 修订 4): packages it saved must be imported anew. */
export const PREVIOUS_CONVERTER = readConverterVersion('osr-import.graphics-5.logic-4.audio-2.models-4');
