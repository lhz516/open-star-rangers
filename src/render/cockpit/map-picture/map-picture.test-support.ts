import type { ImagePayload } from '../../../content/graphics/image-payload.ts';
import { readHudText, type HudTextKey } from '../../../content/hud/hud-text-payload.ts';
import { syntheticHudText } from '../../../content/hud/hud-text.test-support.ts';
import type { MapContact, MapOpen, Projection } from '../../../core/projections/projection.ts';
import type { NameReference } from '../../../core/world/entity-table.ts';
import { syntheticImage } from '../left-display/left-display.test-support.ts';
import { syntheticFont } from '../messages/messages.test-support.ts';
import type { DeepPartial } from '../presentation/cockpit.test-support.ts';
import { createMapPicture, type MapPictureInput, type MapPictureModule } from './map-picture.ts';

// Code-generated synthetic map content and map partitions for the map picture's tests; never original data. The
// geometry agrees with the synthetic slot-2 type-10 record [13, 37, 503, 337] (cockpit.test-support.ts): side 301,
// strip 189, half 150. Images carry their record number in their indices, the font its codes, so pixels tell what drew.


export const MAIN = Object.freeze({ x: 13, y: 37, width: 301, height: 301 });
export const INFORMATION = Object.freeze({ x: 314, y: 37, width: 189, height: 150 });
export const ZOOM = Object.freeze({ x: 314, y: 187, width: 189, height: 150 });
/** fonts/1's synthetic glyph height, the information line pitch. */
export const FONT_HEIGHT = 7;
export const SECTORS = 8;
/** f32 pixels per unit and the zoom extent: a 37 × 75 pointer box (halves 18 and 37). */
export const PIXELS_PER_UNIT = Math.fround(0.0125);
export const ZOOM_EXTENT = Object.freeze({ x: 3000, y: 6000 });

/** A direct image whose pixel (x, y) is `pixel(x, y)`, 0 being the colour key. */
export const mapImage = syntheticImage;

/** Unit-marker record k: 3 × 3 of index 0x40 + k with a colour-key hole in the centre. */
export const unitMarker = (record: number): ImagePayload => mapImage(3, 3, (x, y) => (x === 1 && y === 1 ? 0 : 0x40 + record));
/** Zoom icon record k: 5 × 3 of index 0x80 + k. */
export const zoomIcon = (record: number): ImagePayload => mapImage(5, 3, () => 0x80 + record);

/** Readable texts for the keys the map draws; the rest stay synthetic. */
export const MAP_TEXTS: Partial<Record<HudTextKey, string>> = Object.freeze({
  mapCornerLabel: 'MAP',
  mapWarpCostReadout: '%d%%',
  mapUnitLabel: '%d',
  mapInfoKindWord0x1: 'P ',
  mapInfoKindWord0x2: 'W ',
  mapInfoKindWord0x40And0x800: 'F ',
  mapInfoUnitName: '%s',
  mapInfoPosition1: 'S%.0f',
  mapInfoPosition2: ' H%.0f',
  mapInfoPosition3: ' E%.0f',
  mapInfoKindCount0x80: 'A%d',
  mapInfoKindCount0x4000: 'B%d',
});

export const COST_UNAVAILABLE = 'n/a';

/** `N<index>` for a pool name, nothing for every other. */
export const syntheticNames = (name: NameReference): string => (name.type === 'pool' ? `N${name.index}` : '');

export function mapPictureInput(patch: Partial<MapPictureInput> = {}): MapPictureInput {
  const { entries } = syntheticHudText('m');
  return {
    font: syntheticFont(undefined, FONT_HEIGHT),
    unitMarkers: Array.from({ length: 29 }, (_, record) => unitMarker(record)),
    zoomIcons: Array.from({ length: 29 }, (_, record) => zoomIcon(record)),
    hudText: readHudText({ entries: { ...entries, ...MAP_TEXTS } }),
    names: syntheticNames,
    costUnavailable: COST_UNAVAILABLE,
    ...patch,
  };
}

export const createTestMapPicture = (patch: Partial<MapPictureInput> = {}): MapPictureModule => createMapPicture(mapPictureInput(patch));

/** A contact at a main-map pixel; `class` follows the kind bit unless given. */
export function contact(entityId: number, kindBit: number, column: number, row: number, patch: Partial<MapContact> = {}): MapContact {
  return Object.freeze({
    entityId,
    kindBit,
    name: Object.freeze({ type: 'pool', index: entityId }),
    position: Object.freeze({ x: column, y: row, z: 0 }),
    pixel: Object.freeze({ column, row }),
    inWorld: true,
    class: kindBit === 0 ? 'player' : kindBit <= 6 ? 'friendly' : 'hostile',
    target: false,
    coverage: null,
    ...patch,
  } as MapContact);
}

/** An open map with no contacts, the cursor at (100, 120) and a 50 % cursor cost. */
export function syntheticMapOpen(patch: Partial<MapOpen> = {}): MapOpen {
  const cursor = Object.freeze({ column: 100, row: 120 });
  return Object.freeze({
    state: 'open',
    openedFromBase: false,
    geometry: Object.freeze({
      main: MAIN,
      information: INFORMATION,
      zoom: ZOOM,
      pixelsPerUnit: Object.freeze({ x: PIXELS_PER_UNIT, y: PIXELS_PER_UNIT }),
      unitsPerPixel: Object.freeze({ x: Math.fround(80), y: Math.fround(80) }),
      zoomPixelsPerUnit: Object.freeze({ x: Math.fround(189 / 3000), y: Math.fround(150 / 6000) }),
      world: Object.freeze({ minX: -12_000, minY: -12_000, maxX: 12_000, maxY: 12_000 }),
      sectors: SECTORS,
      zoomExtent: ZOOM_EXTENT,
    }),
    cursor: Object.freeze({ pixel: cursor, world: Object.freeze({ x: 0, y: 0, z: 0 }), zoomBounds: Object.freeze({ left: -1500, right: 1500, top: -3000, bottom: 3000 }) }),
    contacts: Object.freeze([]),
    zoomMembers: Object.freeze([]),
    information: Object.freeze({ capacity: 21, rows: Object.freeze([]) }),
    labels: Object.freeze([]),
    line: Object.freeze({ from: cursor, to: cursor }),
    destination: null,
    cursorCost: Object.freeze({ cost: 50, energy: 100, percent: 50 }),
    markerEntityId: null,
    warpRequest: Object.freeze({ accepted: true }),
    ...patch,
  } as MapOpen);
}

/** The projection patch that makes `map` the player's map partition. */
export const mapPatch = (map: MapOpen | null = syntheticMapOpen()): DeepPartial<Projection> => ({ map: { readiness: 'ready', player: map } } as DeepPartial<Projection>);
