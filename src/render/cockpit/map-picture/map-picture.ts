/**
 * The strategic map picture, type 10 (`0x49f8c`; docs/original/formats/hud.md §4.9; P3-13 spec, 战略地图画面 and D-01
 * 定稿 DC-09/DC-11; ADR-0019): drawn by the cockpit presentation into B in view 8, which fills B with 0 first and copies
 * the whole screen after the slot's pass-1 frame elements (the frame painter) and the type-8 message line (its own
 * module). Every rule fact comes from the tick's `map` partition: nothing here re-derives visibility, membership,
 * energy or the pick. Random draws: none.
 *
 * **Draw order** (each map draw): the draw call of `0x2b9bc` (below); the information rows; Core's de-overlapped pixels
 * stand for `0x4b3a8`; coverage discs of the friendly contacts (0x11), the player's disc (0x12), the hostile rings (9);
 * the grid (4, `geometry.sectors`); the labels; record 26 at the pointer and the cursor cost; record 27 at an in-world
 * destination and its cost; the other in-world icons, the target's record 28, the line (8), the player's icon; the
 * caption at the zoom window's origin + (4, 4); the zoom de-overlap `0x4b56c` (map-zoom-spread.ts); each zoom icon
 * followed by its number; the outlines (information 0xD, zoom 0xD, main map 8); the pointer box (0xD).
 *
 * **Pointer and readings:** only the pointer box and record 26 may follow the P3-05 local pointer (`pointer`, read at
 * each draw); the cost text (value and place), the line's end, the zoom members, numbers and information rows come
 * from the Core-confirmed `cursor`, so an old cost never moves beside an unconfirmed point.
 *
 * **Cost texts** (only while the player has a map icon, as the original): the finite percentage in the imported
 * format; `percent: null` (E = 0, MW-12) draws the project marker `costUnavailable` at the same anchor in the top
 * band, as c ≥ E gives (Δ-06). Whether a Warp can start is never read from here (`warpRequest`).
 *
 * **Distance labels (DC-09):** `labelsOn`, the signed `debounce` and `readDue` start at false, 0, 0 for the run (the
 * instance is per run; a rescue keeps it). Per tick, ② `prepare`: an opening (the tick ends in view 8, the previous
 * did not) clears `labelsOn` and sets `readDue` to the clock, keeping the count; otherwise, when the previous tick
 * ended in view 8 and the clock is above `readDue` (u32), the read call sets `readDue` to the clock + 6, toggles
 * `labelsOn` and loads 20 when `mapRightButton` is down and the count is ≤ 0, then decrements a positive count. ③ the
 * map draw starts with the button-0 call, which only decrements a positive count. Input eligibility (Δ-09) is the
 * caller's: a lost level arrives as `false`.
 *
 * **Drawn credential:** `drawn()` names the last logical map picture of the current opening (opening, serial, tick,
 * geometry and pointer); it is null before the first draw of an opening, after a tick ending outside view 8, when the
 * draw found no open map, and after dispose. The composition (subtask 24) grants map input readiness only once it has
 * also submitted that picture. `drawn()` never throws; `labels()` rejects use after dispose.
 */
import type { FontPayload } from '../../../content/graphics/font-payload.ts';
import type { ImagePayload } from '../../../content/graphics/image-payload.ts';
import type { HudText, HudTextKey } from '../../../content/hud/hud-text-payload.ts';
import type { InstrumentRecord } from '../../../content/hud/instruments-payload.ts';
import type { MapContact, MapCostReading, MapInformationRow, MapOpen } from '../../../core/projections/projection.ts';
import { quantiseMapPoint } from '../../../core/rules/map-frame.ts';
import { MAP_VIEW_MODE } from '../../../core/systems/view-switch.ts';
import type { NameReference } from '../../../core/world/entity-table.ts';
import type { MapPixel } from '../../../core/world/map-rule-data.ts';
import type { CockpitDrawContext, CockpitModule, CockpitTickContext, InstrumentHandler } from '../presentation/cockpit-contract.ts';
import { PresentationError } from '../presentation/cockpit-limits.ts';
import { drawText, hudFont, type HudFont } from '../raster/glyph-text.ts';
import { createIndexedSurface, drawCircle, drawLine, fillDisc, type IndexedSurface } from '../raster/indexed-surface.ts';
import { formatText, type TextFormatArgument } from '../raster/text-format.ts';
import {
  clipLineStart, drawGrid, drawPanelOutline, drawPointerBox, drawRecord, inclusiveBox, type MapRect,
} from './map-drawing.ts';
import { mainMapBounds, MAP_PICTURE_SCREEN, type MapPictureGeometry } from './map-picture-geometry.ts';
import { spreadZoomIcons, type ZoomEntry } from './map-zoom-spread.ts';

export interface MapPictureInput {
  /** fonts/1 (`font/hud/8x8-2`), drawn with advance 6 and upper-casing (`0x49694`). */
  readonly font: FontPayload;
  /** TABL 10461's 29 records (`image/map/unit-marker/0`–`28`): one per kind bit, 26 cursor, 27 destination, 28 target. */
  readonly unitMarkers: readonly ImagePayload[];
  /** TABL 11401's 29 records (`image/map/zoom-icon/0`–`28`), by kind bit. */
  readonly zoomIcons: readonly ImagePayload[];
  /** `data/hud/text`. */
  readonly hudText: HudText;
  /** The byte string of an object's name (the app resolves it from the mission setup). */
  readonly names: (name: NameReference) => string;
  /** `MAP_COST_UNAVAILABLE`, the project marker for a cost at E = 0: 1–5 printable ASCII bytes in fonts/1's map. */
  readonly costUnavailable: string;
  /**
   * The P3-05 local pointer as a normalised main-map position (`MapPosition`: 0 at the left/top edge, 1 at the
   * right/bottom), read at each draw; null (or none) draws the pointer at the confirmed cursor.
   */
  readonly pointer?: () => { readonly right: number; readonly down: number } | null;
}

/** The last logical map picture (see the module comment). */
export interface MapPictureDrawn {
  /** Openings of the map in this run, counted at each DC-09 opening from 1 (0 when the run started in view 8). */
  readonly opening: number;
  /** Map pictures drawn in this run, from 1. */
  readonly serial: number;
  readonly tick: number;
  readonly geometry: MapPictureGeometry;
  /** The main-map pixel the pointer box and record 26 were drawn at, and where it came from. */
  readonly pointer: MapPixel;
  readonly pointerSource: 'local' | 'confirmed';
}

/** DC-09's presentation state after the last processed hook. */
export interface MapLabelState {
  readonly labelsOn: boolean;
  readonly debounce: number;
  /** u32 clock units. */
  readonly readDue: number;
}

export interface MapPictureModule extends CockpitModule {
  readonly instruments: { readonly 10: InstrumentHandler };
  prepare(context: CockpitTickContext): void;
  dispose(): void;
  drawn(): MapPictureDrawn | null;
  labels(): MapLabelState;
}

/**
 * The map's GPU plan: none of its own. It is drawn on the CPU into the cockpit's screen surface S, which the
 * composition resolves with `palette/map/screen`; both are counted in DC-08's cockpit plan.
 */
export const MAP_PICTURE_GPU_PLAN = Object.freeze({ texels: 0, renderTargets: 0 });

const PATH = 'map';
const TYPE = 10;
const RECORDS = 29;
const CURSOR_RECORD = 26;
const DESTINATION_RECORD = 27;
const TARGET_RECORD = 28;
/** fonts/1's advance as `0x49694` sets it. */
const ADVANCE = 6;
/** The information window's 88-byte line buffer less its NUL; every map text is shorter. */
const LINE_BYTES = 87;
const DEBOUNCE = 20;
const READ_INTERVAL = 6;
const COST_MARKER_BYTES = Object.freeze({ min: 1, max: 5 });
/** hud §4.9: the cost text's flip width in glyphs. */
const COST_FLIP_GLYPHS = 6;
const LABEL_GAP = 6;
const LEADER_INSET = 4;
const THREAT_BLINK_BIT = 0x20;

const COLOURS = Object.freeze({
  information: 0x13,
  count: 0x0a,
  friendlyDisc: 0x11,
  playerDisc: 0x12,
  hostileRing: 0x09,
  grid: 0x04,
  leader: 0x10,
  label: 0x10,
  labelBright: 0x0f,
  labelBlink: 0x0a,
  costHigh: 0x0a,
  costMiddle: 0x0f,
  cursorCostLow: 0x08,
  destinationCostLow: 0x0d,
  line: 0x08,
  caption: 0x0a,
  zoomBox: 0x0d,
  number: 0x08,
  targetNumber: 0x0f,
  outline: 0x0d,
  mainOutline: 0x08,
  pointerBox: 0x0d,
});

/** The kind word of each listed kind bit (`0x4ba80`); 0x40 and 0x800 share one. */
const KIND_WORDS: ReadonlyMap<number, HudTextKey> = new Map<number, HudTextKey>([
  [0, 'mapInfoKindWord0x1'], [1, 'mapInfoKindWord0x2'], [2, 'mapInfoKindWord0x4'], [3, 'mapInfoKindWord0x8'],
  [4, 'mapInfoKindWord0x10'], [5, 'mapInfoKindWord0x20'], [6, 'mapInfoKindWord0x40And0x800'],
  [11, 'mapInfoKindWord0x40And0x800'], [15, 'mapInfoKindWord0x8000'], [17, 'mapInfoKindWord0x20000'], [18, 'mapInfoKindWord0x40000'],
]);

/** The count row of each counted kind bit. */
const COUNT_ROWS: ReadonlyMap<number, HudTextKey> = new Map<number, HudTextKey>([
  [7, 'mapInfoKindCount0x80'], [8, 'mapInfoKindCount0x100'], [9, 'mapInfoKindCount0x200'], [10, 'mapInfoKindCount0x400'],
  [19, 'mapInfoKindCount0x80000'], [13, 'mapInfoKindCount0x2000'], [14, 'mapInfoKindCount0x4000'],
  [16, 'mapInfoKindCount0x10000'], [12, 'mapInfoKindCount0x1000'],
]);
/** The one count row in the unit rows' colour. */
const COUNT_KIND_IN_UNIT_COLOUR = 14;

const invalid = (path: string, reason: string): never => {
  throw new PresentationError('invalid-input', `${PATH}.${path}`, reason);
};

const fault = (path: string, reason: string): never => {
  throw new PresentationError('invariant-violated', `${PATH}.${path}`, reason);
};

function checkImages(images: readonly ImagePayload[], path: string): readonly ImagePayload[] {
  if (!Array.isArray(images) || images.length !== RECORDS) invalid(path, `must hold the table's ${RECORDS} records`);
  images.forEach((image, index) => {
    if (image?.display !== 'direct') invalid(`${path}[${index}]`, 'must display its indices directly');
  });
  return Object.freeze([...images]);
}

/** The project marker: 1–5 printable ASCII bytes, each mapped in the font after its upper-casing. */
function checkCostMarker(text: string, font: HudFont): string {
  if (typeof text !== 'string' || text.length < COST_MARKER_BYTES.min || text.length > COST_MARKER_BYTES.max) {
    invalid('costUnavailable', `must hold ${COST_MARKER_BYTES.min} to ${COST_MARKER_BYTES.max} bytes`);
  }
  if (!/^[\x20-\x7e]+$/.test(text)) invalid('costUnavailable', 'must hold only printable ASCII bytes');
  // The drawer looks every glyph up before it writes a pixel: an unmapped byte is `unmapped-character` here.
  drawText(createIndexedSurface(1, 1), font, text, 0, 0, 0, `${PATH}.costUnavailable`);
  return text;
}

/**
 * The colour band of a cost readout by the shown percentage. Bands follow c ≥ E (Δ-06): with E ≥ 1 that is a shown
 * value ≥ 100; `percent: null` means E = 0, which always takes the top band, never a "low cost" colour.
 */
function costColour({ percent }: MapCostReading, low: number): number {
  if (percent === null || percent >= 100) return COLOURS.costHigh;
  return percent >= 67 ? COLOURS.costMiddle : low;
}

/** `0x4ba80`'s value: current ÷ full scale × 100.0; a zero full scale is the original's division fault (DC-09). */
function percentOf({ current, maximum }: { readonly current: number; readonly maximum: number }, path: string): number {
  if (maximum === 0) fault(path, 'needs a non-zero full scale');
  return (current / maximum) * 100;
}

class MapPicture implements MapPictureModule {
  readonly name = 'map-picture';
  readonly instruments = Object.freeze({ [TYPE]: Object.freeze({ draw: (context: CockpitDrawContext, record: InstrumentRecord) => this.#draw(context, record) }) });
  readonly #font: HudFont;
  readonly #markers: readonly ImagePayload[];
  readonly #zoomIcons: readonly ImagePayload[];
  readonly #text: HudText['entries'];
  readonly #names: MapPictureInput['names'];
  readonly #costUnavailable: string;
  readonly #pointer: MapPictureInput['pointer'];
  #labelsOn = false;
  #debounce = 0;
  #readDue = 0;
  #opening = 0;
  #serial = 0;
  #drawn: MapPictureDrawn | null = null;
  #disposed = false;

  constructor({ font, unitMarkers, zoomIcons, hudText, names, costUnavailable, pointer }: MapPictureInput) {
    this.#font = hudFont(font, ADVANCE, true);
    this.#markers = checkImages(unitMarkers, 'unitMarkers');
    this.#zoomIcons = checkImages(zoomIcons, 'zoomIcons');
    this.#text = hudText.entries;
    if (typeof names !== 'function') invalid('names', 'must be a function');
    this.#names = names;
    this.#costUnavailable = checkCostMarker(costUnavailable, this.#font);
    this.#pointer = pointer;
  }

  drawn(): MapPictureDrawn | null {
    return this.#drawn;
  }

  labels(): MapLabelState {
    if (this.#disposed) throw new PresentationError('invalid-state', `${PATH}.labels`, 'is not allowed once the map picture is disposed');
    return Object.freeze({ labelsOn: this.#labelsOn, debounce: this.#debounce, readDue: this.#readDue });
  }

  /** ②: the opening, or the read call of `0x2b9bc` (DC-09 steps 1 and 2). */
  prepare({ render, previousViewMode, clock, mapRightButton }: CockpitTickContext): void {
    const inMap = render.viewMode === MAP_VIEW_MODE;
    if (!inMap) this.#drawn = null;
    if (inMap && previousViewMode !== MAP_VIEW_MODE) {
      this.#labelsOn = false;
      this.#readDue = clock >>> 0;
      this.#opening++;
      this.#drawn = null;
    } else if (previousViewMode === MAP_VIEW_MODE && clock >>> 0 > this.#readDue) {
      this.#readDue = (clock + READ_INTERVAL) >>> 0;
      if (mapRightButton && this.#debounce <= 0) {
        this.#labelsOn = !this.#labelsOn;
        this.#debounce = DEBOUNCE;
      }
      if (this.#debounce > 0) this.#debounce--;
    }
  }

  dispose(): void {
    this.#disposed = true;
    this.#drawn = null;
  }

  /** ③ `0x49f8c`. */
  #draw(context: CockpitDrawContext, record: InstrumentRecord): void {
    if (this.#debounce > 0) this.#debounce--;
    this.#drawn = null;
    const map = context.projection.map.player;
    if (map === null || map.state !== 'open') return;
    const { back, clock, tick } = context;
    const { geometry } = map;
    const { main, information, zoom } = geometry;
    const { rectangle: { x0, y0, x1, y1 } } = record;
    if (main.x !== x0 || main.y !== y0 || main.width !== y1 - y0 + 1 || main.height !== main.width || information.x + information.width !== x1) {
      fault('geometry', 'must be the map record\'s rectangle');
    }
    const height = this.#font.payload.height;
    const cursor = map.cursor.pixel;
    const [pointer, pointerSource] = this.#pointerPixel(main.width, cursor);
    const player = map.contacts.find((contact) => contact.class === 'player') ?? null;
    const target = map.contacts.find((contact) => contact.target) ?? null;

    this.#information(back, information, map.information.rows, height);
    this.#coverage(back, main, map.contacts);
    drawGrid(back, main, geometry.sectors, COLOURS.grid);
    for (const [index, label] of map.labels.entries()) {
      const colour = label.threatened ? (clock & THREAT_BLINK_BIT ? COLOURS.labelBlink : COLOURS.labelBright) : label.playerOrWingman ? COLOURS.labelBright : COLOURS.label;
      this.#label(back, main, label.pixel, this.#names(label.name), colour, `labels[${index}]`);
    }

    drawRecord(back, this.#marker(CURSOR_RECORD), main, pointer.column, pointer.row);
    if (player !== null) this.#cursorCost(back, main, cursor, map.cursorCost);
    const { destination } = map;
    if (destination !== null && destination.inWorld) {
      drawRecord(back, this.#marker(DESTINATION_RECORD), main, destination.pixel.column, destination.pixel.row);
      if (player !== null) {
        const { column, row } = destination.pixel;
        this.#cost(back, main.x + column + 3, main.y + row + 3, destination.cost, COLOURS.destinationCostLow);
      }
    }
    for (const contact of map.contacts) {
      if (contact.inWorld && contact !== target && contact !== player) drawRecord(back, this.#marker(contact.kindBit), main, contact.pixel.column, contact.pixel.row);
    }
    if (target?.inWorld) drawRecord(back, this.#marker(TARGET_RECORD), main, target.pixel.column, target.pixel.row);
    this.#line(back, main, map.line, player);
    if (player?.inWorld) drawRecord(back, this.#marker(player.kindBit), main, player.pixel.column, player.pixel.row);

    drawText(back, this.#font, this.#text.mapCornerLabel, zoom.x + 4, zoom.y + 4, COLOURS.caption, `${PATH}.caption`);
    this.#zoom(back, zoom, map, target);
    drawPanelOutline(back, information, COLOURS.outline);
    drawPanelOutline(back, zoom, COLOURS.outline);
    drawPanelOutline(back, main, COLOURS.mainOutline);
    const { zoomExtent, pixelsPerUnit } = geometry;
    const size = {
      width: Math.trunc(Math.fround(zoomExtent.x) * pixelsPerUnit.x),
      height: Math.trunc(Math.fround(zoomExtent.y) * pixelsPerUnit.y),
    };
    drawPointerBox(back, main, pointer.column, pointer.row, size, COLOURS.pointerBox);

    this.#serial++;
    this.#drawn = Object.freeze({
      opening: this.#opening,
      serial: this.#serial,
      tick,
      geometry: Object.freeze({ screen: MAP_PICTURE_SCREEN, mainMap: mainMapBounds(main.x, main.y, main.width) }),
      pointer: Object.freeze({ ...pointer }),
      pointerSource,
    });
  }

  /** The local pointer quantised like a map point and clamped to the main map, else the confirmed cursor. */
  #pointerPixel(side: number, cursor: MapPixel): [MapPixel, MapPictureDrawn['pointerSource']] {
    const local = this.#pointer?.() ?? null;
    if (local === null || !Number.isFinite(local.right) || !Number.isFinite(local.down)) return [cursor, 'confirmed'];
    const { column, row } = quantiseMapPoint(side, local.right, local.down);
    return [{ column: Math.max(column, 0), row: Math.max(row, 0) }, 'local'];
  }

  #marker(index: number): ImagePayload {
    return this.#markers[index] ?? fault('unitMarkers', `have no record ${index}`);
  }

  #format(key: HudTextKey, args: readonly TextFormatArgument[], path: string): string {
    return formatText(this.#text[key], args, LINE_BYTES, `${PATH}.${path}`);
  }

  /** `0x4ba80`: every row at (x + 4, y + 4 + k × font height), not limited to the window. */
  #information(back: IndexedSurface, area: MapRect, rows: readonly MapInformationRow[], height: number): void {
    rows.forEach((row, index) => {
      const path = `information.rows[${index}]`;
      let text: string;
      let colour: number = COLOURS.information;
      if (row.type === 'unit-name') {
        const word = KIND_WORDS.get(row.kindBit) ?? fault(path, `has no kind word for kind bit ${row.kindBit}`);
        text = this.#format(word, [], path) + this.#format('mapInfoUnitName', [this.#names(row.name)], path);
      } else if (row.type === 'unit-values') {
        text = this.#format('mapInfoPosition1', [percentOf(row.shield, `${path}.shield`)], path)
          + this.#format('mapInfoPosition2', [percentOf(row.hull, `${path}.hull`)], path)
          + this.#format('mapInfoPosition3', [percentOf(row.energy, `${path}.energy`)], path);
      } else {
        text = this.#format(COUNT_ROWS.get(row.kindBit) ?? fault(path, `has no count row for kind bit ${row.kindBit}`), [row.count], path);
        if (row.kindBit !== COUNT_KIND_IN_UNIT_COLOUR) colour = COLOURS.count;
      }
      drawText(back, this.#font, text, area.x + 4, area.y + 4 + height * index, colour, `${PATH}.${path}`);
    });
  }

  /** `0x4ad1c`: friendly discs, the player's disc, then hostile rings; at every contact's pixel, radius 0 draws nothing. */
  #coverage(back: IndexedSurface, main: MapRect, contacts: readonly MapContact[]): void {
    const clip = inclusiveBox(main);
    const centre = ({ pixel }: MapContact): [number, number] => [main.x + pixel.column, main.y + pixel.row];
    const passes = [['friendly', COLOURS.friendlyDisc], ['player', COLOURS.playerDisc], ['hostile', COLOURS.hostileRing]] as const;
    for (const [type, colour] of passes) {
      for (const contact of contacts) {
        const radius = contact.coverage?.radius ?? 0;
        if (contact.class !== type || radius === 0) continue;
        const [x, y] = centre(contact);
        if (type === 'hostile') drawCircle(back, x, y, radius, colour);
        else fillDisc(back, x, y, radius, colour, clip);
      }
    }
  }

  /** `0x4af78`: the name above an icon in the lower half of the map, else below, with two leader lines (0x10). */
  #label(back: IndexedSurface, main: MapRect, pixel: MapPixel, name: string, colour: number, path: string): void {
    const height = this.#font.payload.height;
    const [x, y] = [main.x + pixel.column, main.y + pixel.row];
    const textY = pixel.row > Math.trunc(main.height / 2) ? y - height - LABEL_GAP : y + LABEL_GAP;
    const leaderY = textY + Math.trunc(height / 2);
    drawLine(back, x - LEADER_INSET, leaderY, x - ADVANCE, leaderY, COLOURS.leader);
    drawLine(back, x, y, x - ADVANCE, leaderY, COLOURS.leader);
    drawText(back, this.#font, name, x, textY, colour, `${PATH}.${path}`);
  }

  /** The cursor's cost at the confirmed cursor + (2, 2), moved left or up near the right or bottom edge. */
  #cursorCost(back: IndexedSurface, main: MapRect, cursor: MapPixel, reading: MapCostReading): void {
    const height = this.#font.payload.height;
    const flip = COST_FLIP_GLYPHS * ADVANCE;
    const x = cursor.column > main.width - flip ? cursor.column - flip - 2 : cursor.column + 2;
    const y = cursor.row > main.width - height ? cursor.row - height - 2 : cursor.row + 2;
    this.#cost(back, main.x + x, main.y + y, reading, COLOURS.cursorCostLow);
  }

  #cost(back: IndexedSurface, x: number, y: number, reading: MapCostReading, low: number): void {
    const text = reading.percent === null ? this.#costUnavailable : this.#format('mapWarpCostReadout', [reading.percent], 'cost');
    drawText(back, this.#font, text, x, y, costColour(reading, low), `${PATH}.cost`);
  }

  /** `0x4c674`: from the player's pixel to the confirmed cursor; the player's end is clipped unless it is in the world. */
  #line(back: IndexedSurface, main: MapRect, { from, to }: MapOpen['line'], player: MapContact | null): void {
    const end = { x: main.x + to.column, y: main.y + to.row };
    let start = { x: main.x + from.column, y: main.y + from.row };
    // Without a player icon (MW-11) the line starts at the live position, clipped like a player outside the world.
    if (!player?.inWorld) start = clipLineStart(start, end, inclusiveBox(main));
    drawLine(back, start.x, start.y, end.x, end.y, COLOURS.line);
  }

  /** `0x4b56c`, then each zoom icon by kind bit (boxed in 0xD) followed by its number while the labels are on. */
  #zoom(back: IndexedSurface, zoom: MapRect, map: MapOpen, target: MapContact | null): void {
    const listed = new Set(map.contacts.map(({ entityId }) => entityId));
    const members = new Map(map.zoomMembers.map((member, index) => {
      if (!listed.has(member.entityId)) fault(`zoomMembers[${index}]`, 'must be a contact');
      return [member.entityId, member];
    }));
    const icon = (kindBit: number): ImagePayload => this.#zoomIcons[kindBit] ?? fault('zoomIcons', `have no record ${kindBit}`);
    const entries: ZoomEntry[] = map.contacts.map(({ entityId, kindBit }) => {
      const member = members.get(entityId);
      if (member === undefined) return { member: false, width: 0, height: 0, x: 0, y: 0 };
      const { width, height } = icon(kindBit);
      return { member: true, width, height, x: member.pixel.column, y: member.pixel.row };
    });
    spreadZoomIcons(entries, zoom.width, zoom.height);
    map.contacts.forEach((contact, index) => {
      const member = members.get(contact.entityId);
      if (member === undefined) return;
      const { x, y } = entries[index];
      drawRecord(back, icon(contact.kindBit), zoom, x, y, member.boxed ? COLOURS.zoomBox : null);
      if (!this.#labelsOn || member.distance === null) return;
      const text = this.#format('mapUnitLabel', [member.distance], 'zoomMembers');
      drawText(back, this.#font, text, zoom.x + x + 2, zoom.y + y + 2, contact === target ? COLOURS.targetNumber : COLOURS.number, `${PATH}.zoomMembers`);
    });
  }
}

/** The map picture of one run: register it with the presentation (it handles type 10). */
export function createMapPicture(input: MapPictureInput): MapPictureModule {
  return new MapPicture(input);
}
