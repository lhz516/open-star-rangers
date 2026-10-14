import { readAssetId, type AssetId } from '../../content/asset-id.ts';
import { EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import { imagePayloadLength } from '../../content/graphics/image-payload.ts';
import { layoutPayloadLength } from '../../content/graphics/layout-payload.ts';
import { palettePayloadLength } from '../../content/graphics/palette-payload.ts';
import { encodeMapGeometryPayload, type MapGeometry } from '../../content/hud/map-geometry-payload.ts';
import { statusMessagesPayloadLength, type StatusMessagesPayload } from '../../content/hud/status-messages-payload.ts';
import { archiveLocator, executableRegion, isRegionLocator, type ArchiveEntryLocator, type ExecutableRegionLocator } from '../source-mapping.ts';
import { buildImfat, syntheticDiag, syntheticLeExecutable, syntheticSnip, type SyntheticDiagFields, type SyntheticEntry } from '../synthetic.test-support.ts';
import {
  cockpitLayoutBlock, dataPaletteBlock, hudFontTables, instrumentRecord, mfdBlock, rawImageBlock, spriteImageBlock, tableBlock,
  type SyntheticInstruments,
} from './conversion.test-support.ts';
import { PRODUCTION_FLIGHT_GRAPHICS_MAPPINGS } from './production-flight-graphics.ts';
import { productionFlightGraphicsEntries } from './production-flight-graphics.test-support.ts';
import { PRODUCTION_EFFECT_IMAGES, PRODUCTION_GRAPHICS_MAPPINGS } from './production-graphics.ts';
import { PRODUCTION_HUD_TEXT_REGION_WRITES } from './production-hud-text.test-support.ts';
import { PRODUCTION_MODEL_TEXTURES, modelTexturePaletteId } from './production-model-textures.ts';

// A synthetic archive in the production graphics structure, generated in code; never original data.

const FLIGHT_GRAPHICS = new Set(PRODUCTION_FLIGHT_GRAPHICS_MAPPINGS.mappings.map(({ asset }) => asset.id));
/** The archive locators of the P2-05 to P2-07 graphics; the P3-03 flight graphics have their own synthetic entries. */
const locators: readonly ArchiveEntryLocator[] = PRODUCTION_GRAPHICS_MAPPINGS.mappings.filter(({ asset }) => !FLIGHT_GRAPHICS.has(asset.id))
  .flatMap(({ parts }) => parts.flatMap(({ alternatives }) => alternatives)).filter(locator => !isRegionLocator(locator)).map(archiveLocator);

type GraphicsBlocks = Partial<Record<'DATA' | 'CCKD' | 'TEX' | 'MFDD' | 'BITM' | 'TABL' | 'SNIP' | 'DIAG', Uint8Array | null>>;

const TEXTURE = Object.freeze({ width: 4, height: 2, paletteEntries: 4 });
const FLIGHT_PALETTE = readAssetId('palette/flight/models');

/** A small raw texture record with an embedded BGR palette, whose indices and colours are a function of `entry`. */
const syntheticTexture = (entry: number): Uint8Array => rawImageBlock(
  TEXTURE.width, TEXTURE.height,
  Array.from({ length: TEXTURE.width * TEXTURE.height }, (_, pixel) => (pixel + entry) % TEXTURE.paletteEntries),
  Array.from({ length: TEXTURE.paletteEntries * 3 }, (_, component) => (entry * 7 + component * 29) & 0xff),
);

const COCKPIT_PALETTE = readAssetId('palette/flight/cockpit-hud-map');
const MAP_PALETTE = readAssetId('palette/map/screen');

/** A synthetic image record and what the length of its converted payload depends on. */
interface SyntheticImage {
  readonly block: Uint8Array;
  readonly width: number;
  readonly height: number;
  /** The palette the production declaration binds. */
  readonly palette: AssetId;
  /** Whether the converted image has a mask: a sprite, or a raw record converted with a colour key. */
  readonly masked: boolean;
}

/**
 * A raw record whose indices are a function of `seed`, so that records differ across lists and entries: index 0, which
 * colour key 0 makes transparent, at every third pixel and other indices elsewhere.
 */
function rawImage(seed: number, width: number, height: number, palette: AssetId, masked = false): SyntheticImage {
  const indices = Array.from({ length: width * height }, (_, pixel) => (pixel % 3 === 0 ? 0 : 1 + ((seed * 37 + pixel * 11) % 255)));
  return { block: rawImageBlock(width, height, indices), width, height, palette, masked };
}

/** `count` raw records of one list, seeded from `seed`. */
const rawImages = (count: number, seed: number, size: (index: number) => readonly [number, number], palette: AssetId, masked = false): SyntheticImage[] =>
  Array.from({ length: count }, (_, index) => rawImage(seed + index, ...size(index), palette, masked));

interface PlacedImage {
  readonly image: SyntheticImage;
  readonly x: number;
  readonly y: number;
  readonly flags: readonly [number, number];
}

/**
 * The four front cockpit elements of CCKD slot 0 under the flight palette: a bottom panel on the frame's lower edge, two
 * struts, the right one on its right edge, and a sprite strip with transparent runs.
 */
const FRONT: readonly PlacedImage[] = [
  { image: rawImage(1, 6, 2, COCKPIT_PALETTE), x: 0, y: 478, flags: [0, 1] },
  { image: rawImage(2, 2, 4, COCKPIT_PALETTE), x: 0, y: 200, flags: [0, 0] },
  { image: rawImage(3, 2, 4, COCKPIT_PALETTE), x: 638, y: 200, flags: [0, 0] },
  {
    image: { block: spriteImageBlock(5, 3, [0, 0, 2, 0, 1, 2, 3, 0, 5, 0, 1, 0, 3, 0, 3, 4, 5, 1, 0]), width: 5, height: 3, palette: COCKPIT_PALETTE, masked: true },
    x: 300, y: 250, flags: [0, 1],
  },
];

/**
 * The four map frame elements of CCKD slot 2 under the map palette, drawn in the second pass; the last ends in the
 * frame's lower right corner.
 */
const MAP_FRAME: readonly PlacedImage[] = [
  { image: rawImage(11, 6, 2, MAP_PALETTE), x: 0, y: 0, flags: [1, 1] },
  { image: rawImage(12, 2, 3, MAP_PALETTE), x: 0, y: 2, flags: [1, 1] },
  { image: rawImage(13, 3, 3, MAP_PALETTE), x: 637, y: 2, flags: [1, 1] },
  { image: rawImage(14, 6, 2, MAP_PALETTE), x: 634, y: 478, flags: [1, 1] },
];

/** The map frame group's palette, unlike the DATA palette. */
const MAP_PALETTE_BLOCK = dataPaletteBlock(index => (index * 11 + 3) % 64);

const STATUS_BACKGROUNDS = rawImages(3, 21, () => [4, 4], COCKPIT_PALETTE);
const STATUS_OVERLAYS = rawImages(9, 31, () => [4, 4], COCKPIT_PALETTE, true);
const DISPLAY_PAGE = rawImage(41, 5, 4, COCKPIT_PALETTE);
const GAUGE_BARS = rawImages(4, 51, index => [2, index < 2 ? 5 : 6], COCKPIT_PALETTE, true);
const UNIT_MARKERS = rawImages(29, 61, () => [4, 3], MAP_PALETTE, true);
const ZOOM_ICONS = rawImages(29, 101, index => (index < 20 ? [5, 5] : [4, 3]), MAP_PALETTE, true);

/** The interference animation: nine small frames of 2-bit values that differ by frame, shown through the flight palette. */
const INTERFERENCE = Object.freeze({ width: 4, height: 2, frames: 9 });
const interferenceFrame = (frame: number): number[] =>
  Array.from({ length: INTERFERENCE.width * INTERFERENCE.height }, (_, pixel) => (pixel * 3 + frame) % 4);
const INTERFERENCE_FRAMES: readonly SyntheticImage[] = Array.from({ length: INTERFERENCE.frames }, () => ({
  block: new Uint8Array(0), width: INTERFERENCE.width, height: INTERFERENCE.height, palette: COCKPIT_PALETTE, masked: false,
}));

/** Every synthetic P2-07 image, one per production image Asset. */
const COCKPIT_HUD_MAP_IMAGES: readonly SyntheticImage[] = [
  ...[...FRONT, ...MAP_FRAME].map(({ image }) => image), ...STATUS_BACKGROUNDS, ...STATUS_OVERLAYS, DISPLAY_PAGE, ...GAUGE_BARS,
  ...UNIT_MARKERS, ...ZOOM_ICONS, ...INTERFERENCE_FRAMES,
];

/** Made-up status display texts in the DIAG structure: line breaks, conversions and one startup message. */
export const SYNTHETIC_STATUS_MESSAGES: SyntheticDiagFields = {
  timings: [2, 31, 3, 47],
  statusFormats: ['S1\n%d%%', 'S2\n%d', 'S3\n%s', 'S4 %u'],
  ratings: [['r-four', 30], ['r-three', 20], ['r-two', 12], ['r-one', 4], ['r-zero', 0]],
  subsystemNames: Array.from({ length: 15 }, (_, index) => `part ${index}`),
  stateWords: ['ok?', 'hurt', 'gone'],
  startupMessages: ['warming\nup'],
};

/** Made-up palette indices for the interference colour table, one per 2-bit value. */
const SYNTHETIC_INTERFERENCE_COLOURS = Uint8Array.of(5, 77, 140, 250);

/** The production region a graphics Asset maps to after its entry. */
const regionOf = (id: string) => {
  const [, { alternatives: [locator] }] = PRODUCTION_GRAPHICS_MAPPINGS.mappings.find(({ asset }) => asset.id === id)!.parts;
  return executableRegion(locator as ExecutableRegionLocator);
};
const COLOUR_TABLE = regionOf('image/hud/display-interference/frame-0');
const FORMAT_REGION = regionOf('data/hud/status-display/messages');

/** A made-up lower-line format filling the production format region, its NUL last, as a byte string. */
export const SYNTHETIC_SUBSYSTEM_FORMAT = String.fromCharCode(...Array.from({ length: FORMAT_REGION.length - 1 }, (_, index) => [0x7b, 0x25, 0x73, 0x7d][index % 4]));

/**
 * The bytes of each production executable region the graphics Assets map to: the colour table, the format and the 64
 * HUD texts.
 */
export const PRODUCTION_GRAPHICS_REGION_WRITES: readonly RegionWrite[] = Object.freeze([
  Object.freeze({ object: COLOUR_TABLE.object, offset: COLOUR_TABLE.offset, bytes: SYNTHETIC_INTERFERENCE_COLOURS }),
  Object.freeze({ object: FORMAT_REGION.object, offset: FORMAT_REGION.offset, bytes: Uint8Array.from(`${SYNTHETIC_SUBSYSTEM_FORMAT}\0`, character => character.charCodeAt(0)) }),
  ...PRODUCTION_HUD_TEXT_REGION_WRITES,
]);

/** Bytes to place at an offset of an executable object. */
export interface RegionWrite {
  readonly object: number;
  readonly offset: number;
  readonly bytes: Uint8Array;
}

/** A non-additive internal 32-bit offset fixup at `offset` of `object`, targeting `target`. */
export interface PositionedFixup {
  readonly object: number;
  readonly offset: number;
  readonly target: { readonly object: number; readonly offset: number };
}

const LE_PAGE = 4_096;

/** The LE fixup record of an internal 32-bit offset at `offset` of its page (negative on the later of two pages). */
function fixupRecord(offset: number, { object, offset: target }: PositionedFixup['target']): number[] {
  const wide = target > 0xffff;
  const record = [0x07, wide ? 0x10 : 0x00, offset & 0xff, (offset >>> 8) & 0xff, object];
  for (let index = 0; index < (wide ? 4 : 2); index++) record.push((target >>> (index * 8)) & 0xff);
  return record;
}

/**
 * A synthetic LE executable of four objects that holds `writes` and a generated pattern elsewhere. `fixups` adds a fixup
 * record on each page an internal offset touches; `pageFixups` adds raw fixup records by page map index.
 */
export function regionExecutable(
  writes: readonly RegionWrite[],
  fixups: readonly PositionedFixup[] = [],
  pageFixups: Readonly<Record<number, readonly number[]>> = {},
): Uint8Array {
  const objects = [1, 2, 3, 4].map(object => {
    const own = writes.filter(write => write.object === object);
    const bytes = Uint8Array.from({ length: Math.max(16, ...own.map(({ offset, bytes: written }) => offset + written.length)) }, (_, index) => (index * 13 + object) & 0xff);
    for (const write of own) bytes.set(write.bytes, write.offset);
    return { bytes };
  });
  // Page map indexes, from 1: each object takes whole pages after the previous objects'.
  const firstPages: number[] = [];
  let next = 1;
  for (const { bytes } of objects) {
    firstPages.push(next);
    next += Math.ceil(bytes.length / LE_PAGE);
  }
  const records: Record<number, number[]> = Object.fromEntries(Object.entries(pageFixups).map(([page, bytes]) => [page, [...bytes]]));
  for (const fixup of fixups) {
    const page = Math.floor(fixup.offset / LE_PAGE);
    for (const recorded of fixup.offset + 4 > (page + 1) * LE_PAGE ? [page, page + 1] : [page]) {
      (records[firstPages[fixup.object - 1] + recorded] ??= []).push(...fixupRecord(fixup.offset - recorded * LE_PAGE, fixup.target));
    }
  }
  return syntheticLeExecutable({ objects, fixups: records });
}

/** The element positions of the synthetic front cockpit and map frame layouts, by layout Asset ID. */
export const PRODUCTION_LAYOUT_POSITIONS: Readonly<Record<string, readonly { readonly x: number; readonly y: number }[]>> = Object.freeze({
  'layout/cockpit/front': FRONT.map(({ x, y }) => ({ x, y })),
  'layout/map/frame': MAP_FRAME.map(({ x, y }) => ({ x, y })),
});

/**
 * The synthetic map instrument: a 400-pixel main map with a 190-pixel strip, drawn every frame, and the 8-pixel line
 * height of `hudFontTables()`'s font 1. The values are made up, not the original record's.
 */
export const SYNTHETIC_MAP_GEOMETRY: MapGeometry = Object.freeze({
  rectangle: Object.freeze({ x0: 21, y0: 45, x1: 611, y1: 444 }), redrawInterval: 0, informationLineHeight: 8,
});

const { x0, y0, x1, y1 } = SYNTHETIC_MAP_GEOMETRY.rectangle;

/**
 * The layout numbers and instrument records of the synthetic production cockpit's three slots (cockpit §1): the front
 * cockpit (layout 0) and the empty full-screen slot (layout 5) with other instrument types, and the map (layout 6) with
 * its type-10 record before the message line (type 8), whose rectangle is elsewhere.
 */
export const PRODUCTION_COCKPIT_INSTRUMENTS: readonly SyntheticInstruments[] = Object.freeze([
  { layout: 0, records: [instrumentRecord(0, [5, 400, 60, 470], 2), instrumentRecord(8, [100, 300, 282, 316])] },
  { layout: 5, records: [instrumentRecord(1, [5, 5, 60, 60], 4), instrumentRecord(10, [0, 0, 9, 9], 9)] },
  { layout: 6, records: [instrumentRecord(10, [x0, y0, x1, y1], SYNTHETIC_MAP_GEOMETRY.redrawInterval), instrumentRecord(8, [30, 460, 212, 476])] },
]);

/** The synthetic map geometry's payload length. */
export const MAP_GEOMETRY_USAGE: BudgetRecord = Object.freeze({
  ...EMPTY_BUDGET_USAGE, assets: 1, payloadBytes: encodeMapGeometryPayload(SYNTHETIC_MAP_GEOMETRY).length,
});

/**
 * A CCKD entry in the production cockpit structure: `fonts` in its font directory, the front cockpit in slot 0, an empty
 * slot 1, and the map frame with the group palette in slot 2, each with `instruments`. `firstFrontFlags` replaces the
 * flags of the first front element, such as a value the reader rejects.
 */
export const productionCockpitBlock = (
  fonts: readonly Uint8Array[] = hudFontTables(),
  firstFrontFlags?: readonly [number, number],
  instruments: readonly (SyntheticInstruments | null)[] = PRODUCTION_COCKPIT_INSTRUMENTS,
): Uint8Array => {
  const front = FRONT.map((placed, index) => (index === 0 && firstFrontFlags ? { ...placed, flags: firstFrontFlags } : placed));
  return cockpitLayoutBlock(
    [front, [], MAP_FRAME].map(elements => elements.map(({ image, x, y, flags }) => ({ record: image.block, x, y, flags }))),
    fonts,
    [null, null, MAP_PALETTE_BLOCK],
    instruments,
  );
};

/** The `MAIN/SR.NOB` entry a production Asset maps to. */
const entryOf = (id: string): number => archiveLocator(PRODUCTION_GRAPHICS_MAPPINGS.mappings.find(({ asset }) => asset.id === id)!.parts[0].alternatives[0]).entry.id;

/** The indices the production interference frame `frame` converts to through the synthetic colour table. */
export const interferenceIndices = (frame: number): Uint8Array =>
  Uint8Array.from(interferenceFrame(frame), value => SYNTHETIC_INTERFERENCE_COLOURS[value]);

/** The synthetic CCKD, MFDD, BITM and TABL blocks by the entry the production cockpit, HUD and map Assets map to. */
const cockpitHudMapBlocks = (): ReadonlyMap<number, Uint8Array> => {
  const blocks = (images: readonly SyntheticImage[]) => images.map(({ block }) => block);
  return new Map([
    [entryOf('layout/cockpit/front'), productionCockpitBlock()],
    [entryOf('image/hud/status-display/background-0'), mfdBlock([blocks(STATUS_BACKGROUNDS), blocks(STATUS_OVERLAYS)])],
    [entryOf('image/hud/display-page/background'), DISPLAY_PAGE.block],
    [entryOf('image/hud/gauge-bar-1/0'), tableBlock(blocks(GAUGE_BARS))],
    [entryOf('image/map/unit-marker/0'), tableBlock(blocks(UNIT_MARKERS))],
    [entryOf('image/map/zoom-icon/0'), tableBlock(blocks(ZOOM_ICONS))],
    [entryOf('image/hud/display-interference/frame-0'), syntheticSnip({
      ...INTERFERENCE, frames: Array.from({ length: INTERFERENCE.frames }, (_, frame) => interferenceFrame(frame)),
    }).data],
    [entryOf('data/hud/status-display/messages'), syntheticDiag(SYNTHETIC_STATUS_MESSAGES).data],
  ]);
};

/** The relocations of the synthetic SNIP and DIAG entries, which their readers check. */
const RELOCATIONS: Readonly<Record<string, readonly number[]>> = Object.freeze({
  SNIP: syntheticSnip({ ...INTERFERENCE, frames: [] }).relocations, DIAG: syntheticDiag(SYNTHETIC_STATUS_MESSAGES).relocations,
});

/**
 * Synthetic entries at the mapped production graphics locators, in ascending ID order: a DATA palette; a
 * `productionCockpitBlock()` with two 8×8 fonts and one 4×6 font at the mapped indices; a `syntheticTexture` at every TEX
 * entry of the production texture table; an MFDD with 3 + 9 records, a BITM image and TABL image lists of 4, 29 and 29
 * records at the status display, display page, gauge bar, unit marker and zoom icon entries; a SNIP of nine 4×2 frames
 * and a DIAG of `SYNTHETIC_STATUS_MESSAGES`. Every image is small and differs by list and entry. `blocks` replaces every
 * such entry of a type, or omits them when null. The entries of `productionFlightGraphicsEntries()` follow unchanged.
 */
export function productionGraphicsEntries(blocks: GraphicsBlocks = {}): SyntheticEntry[] {
  const cockpitHudMap = cockpitHudMapBlocks();
  const content = (type: string, id: number): Uint8Array | null => {
    const block = blocks[type as keyof GraphicsBlocks];
    if (block !== undefined) return block;
    return type === 'DATA' ? dataPaletteBlock() : type === 'TEX' ? syntheticTexture(id) : cockpitHudMap.get(id)!;
  };
  const entries = new Map<number, SyntheticEntry>();
  for (const { entry: { id, type } } of locators) {
    if (entries.has(id)) continue;
    const data = content(type, id);
    if (data) entries.set(id, { id, type, data, ...(RELOCATIONS[type] && { relocations: [...RELOCATIONS[type]] }) });
  }
  return [...entries.values(), ...productionFlightGraphicsEntries()].sort((left, right) => left.id - right.id);
}

/**
 * The disc files of a source holding the production graphics archive with `productionGraphicsEntries` and an executable
 * with the graphics regions, the HUD texts included; `extra` adds other entries to the same archive.
 */
export const productionGraphicsFiles = (blocks: GraphicsBlocks = {}, extra: readonly SyntheticEntry[] = []): Record<string, Uint8Array> => ({
  [locators[0].discPath]: buildImfat(10_000, [...productionGraphicsEntries(blocks), ...extra].sort((left, right) => left.id - right.id)),
  'MAIN/SRANGERS.EXE': regionExecutable(PRODUCTION_GRAPHICS_REGION_WRITES),
});

/** The palette of every slice texture, in table order, then of every effect image. */
const TEXTURE_PALETTES = [
  ...PRODUCTION_MODEL_TEXTURES.map((_, index) => modelTexturePaletteId(index)),
  ...PRODUCTION_EFFECT_IMAGES.map(({ role }) => readAssetId(`palette/${role}`)),
];

/**
 * The graphics conversion usage of the slice textures and effect images on `productionGraphicsEntries()`: each an
 * image of `TEXTURE` pixels shown through the flight palette, so two dependencies, and its embedded palette.
 */
export const MODEL_TEXTURE_USAGE: BudgetRecord = Object.freeze({
  ...EMPTY_BUDGET_USAGE,
  assets: 2 * TEXTURE_PALETTES.length,
  dependencyEdges: 2 * TEXTURE_PALETTES.length,
  paletteEntries: TEXTURE.paletteEntries * TEXTURE_PALETTES.length,
  imagePixels: TEXTURE.width * TEXTURE.height * TEXTURE_PALETTES.length,
  payloadBytes: TEXTURE_PALETTES.reduce((total, palette) => total + palettePayloadLength(TEXTURE.paletteEntries) + imagePayloadLength({
    width: TEXTURE.width, height: TEXTURE.height, palette, display: { nearest: FLIGHT_PALETTE },
  }, false), 0),
});

/** A layout payload's length depends only on the element image IDs. */
const layoutBytes = (prefix: string, count: number): number =>
  layoutPayloadLength({ elements: Array.from({ length: count }, (_, index) => ({ image: readAssetId(`${prefix}${index}`), x: 0, y: 0 })) });

/** The status display messages payload converted from the synthetic DIAG and the synthetic format. */
export const SYNTHETIC_STATUS_MESSAGES_PAYLOAD: StatusMessagesPayload = Object.freeze({
  upper: { characterTicks: SYNTHETIC_STATUS_MESSAGES.timings[0], holdTicks: SYNTHETIC_STATUS_MESSAGES.timings[1] },
  lower: { characterTicks: SYNTHETIC_STATUS_MESSAGES.timings[2], holdTicks: SYNTHETIC_STATUS_MESSAGES.timings[3] },
  statusFormats: SYNTHETIC_STATUS_MESSAGES.statusFormats,
  ratings: SYNTHETIC_STATUS_MESSAGES.ratings.map(([text, maximum]) => ({ text, maximum })),
  subsystemNames: SYNTHETIC_STATUS_MESSAGES.subsystemNames,
  stateWords: SYNTHETIC_STATUS_MESSAGES.stateWords,
  subsystemFormat: SYNTHETIC_SUBSYSTEM_FORMAT,
  startupMessages: SYNTHETIC_STATUS_MESSAGES.startupMessages,
});

/**
 * The graphics conversion usage of the P2-07 Assets on `productionGraphicsEntries()`: every synthetic image with its
 * palette, the 256-entry map palette, the front cockpit and map frame layouts with an edge per element, and the status
 * display messages.
 */
export const COCKPIT_HUD_MAP_USAGE: BudgetRecord = Object.freeze({
  ...EMPTY_BUDGET_USAGE,
  assets: COCKPIT_HUD_MAP_IMAGES.length + 1 + 2 + 1,
  dependencyEdges: COCKPIT_HUD_MAP_IMAGES.length + FRONT.length + MAP_FRAME.length,
  paletteEntries: 256,
  imagePixels: COCKPIT_HUD_MAP_IMAGES.reduce((total, { width, height }) => total + width * height, 0),
  payloadBytes: COCKPIT_HUD_MAP_IMAGES.reduce((total, { width, height, palette, masked }) => total + imagePayloadLength({ width, height, palette, display: 'direct' }, masked), 0)
    + palettePayloadLength(256) + layoutBytes('image/cockpit/front/element-', FRONT.length) + layoutBytes('image/map/frame/element-', MAP_FRAME.length)
    + statusMessagesPayloadLength(SYNTHETIC_STATUS_MESSAGES_PAYLOAD),
});
