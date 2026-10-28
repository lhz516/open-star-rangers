import { addBudgets, EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import { compareText } from '../../content/contract-validation.ts';
import { COCKPIT_INSTRUMENTS_FORMAT, COCKPIT_INSTRUMENTS_LIMITS, COCKPIT_INSTRUMENTS_ROLE } from '../../content/hud/instruments-payload.ts';
import { MAP_GEOMETRY_LIMITS, MAP_GEOMETRY_ROLE } from '../../content/hud/map-geometry-payload.ts';
import { STATUS_MESSAGES_ROLE } from '../../content/hud/status-messages-payload.ts';
import { readSourceMappingTable, type SourceMappingTable } from '../source-mapping.ts';
import { readGraphicsDeclarations, type CharMapRange, type GraphicsDeclaration } from './graphics-declarations.ts';
import { executableRegionAt } from './production-executable.ts';
import {
  PRODUCTION_FLIGHT_GRAPHICS_DECLARATIONS, PRODUCTION_FLIGHT_GRAPHICS_MAPPINGS, PRODUCTION_FLIGHT_GRAPHICS_SHARE,
} from './production-flight-graphics.ts';
import { PRODUCTION_HUD_TEXT_DECLARATIONS, PRODUCTION_HUD_TEXT_MAPPINGS, PRODUCTION_HUD_TEXT_SHARE } from './production-hud-text.ts';
import {
  PRODUCTION_MODEL_TEXTURE_SHARE, PRODUCTION_MODEL_TEXTURES, modelTextureImageId, modelTexturePaletteId,
} from './production-model-textures.ts';

// The production graphics: the P2-05 flight palette once per group that owns palettes and the three HUD fonts of the
// full HI cockpit set (docs/plan/p2/05/spec.md, production Assets and sources), the P2-06 slice textures and
// research-confirmed effect images with their embedded palettes (docs/plan/p2/06/spec.md), and the P2-07 front cockpit
// and map frame layouts with their element images, the map palette, the HUD and map image families, the left display's
// interference frames and the status display messages (docs/plan/p2/07/spec.md, production Assets and sources), the
// P3-03 flight images and view labels of production-flight-graphics.ts, the HUD text of production-hud-text.ts, the
// map geometry of the P3-09 revision of the P3-03 spec, and the cockpit instruments of its revision 4 (P3-13).
// Entry IDs, slots, record indices and executable addresses come from the local structure checks and research recorded
// in P2-05/06, P2-06/04, P2-06/11, P2-07/07–09, P2-07/19, P3-03/05 and P3-03/24; they stay in original-data and never
// enter canonical content.

const ARCHIVE = 'MAIN/SR.NOB';
/** The only DATA entry (imfat §4). */
const DATA_ENTRY = 11_075;
/** The full HI cockpit set with the strategic map frame (cockpit §1); whether HI flight loads its fonts is U-029. */
const HI_COCKPIT_ENTRY = 10_103;
/** The HI HUD set of the reference player craft: status display MFDD, left-display page BITM and gauge bars (hud §2). */
const STATUS_DISPLAY_ENTRY = 10_473;
const DISPLAY_PAGE_ENTRY = 10_467;
const GAUGE_BAR_ENTRY = 10_479;
/** The strategic map's unit markers and zoom window icons (hud §2). */
const UNIT_MARKER_ENTRY = 10_461;
const ZOOM_ICON_ENTRY = 11_401;
/** The rest of the HI HUD set: the left display's interference animation and the status display's messages (hud §2). */
const INTERFERENCE_ENTRY = 10_487;
const STATUS_MESSAGES_ENTRY = 10_489;
/** The executable's four palette indices that a SNIP frame's 2-bit values select (hud, SNIP 10487). */
const INTERFERENCE_COLOURS = executableRegionAt(0x17_5ed8, 4);
/** The executable's format of the status display's lower line, with its NUL (hud, DIAG 10489). */
const SUBSYSTEM_FORMAT = executableRegionAt(0x17_1e58, 6);

const PALETTE_EVIDENCE = ['docs/original/formats/textures.md#1-data-global-palette-confirmed'];
const FONT_EVIDENCE = [
  'docs/original/formats/cockpit.md#1-cckd-cockpit-layouts',
  'docs/original/formats/hud.md#1-bitmap-fonts-confirmed',
  'docs/original/formats/hud.md#11-glyph-layout-and-character-maps-likely',
];

const FRONT_COCKPIT_EVIDENCE = [
  'docs/original/formats/cockpit.md#front-cockpit-source-r1',
  'docs/original/formats/cockpit.md#group-palette-and-drawing-confirmed',
];
const MAP_FRAME_EVIDENCE = ['docs/original/formats/cockpit.md#group-palette-and-drawing-confirmed'];
const HUD_PATH_EVIDENCE = [
  'docs/original/formats/hud.md#hud-and-map-drawing-paths-confirmed-exe',
  'docs/original/formats/hud.md#slice-screen-coverage-and-hud-image-families-r3-r4-r6',
];
const STATUS_DISPLAY_EVIDENCE = ['docs/original/formats/cockpit.md#2-mfdd-multi-function-display-images-confirmed-structure', ...HUD_PATH_EVIDENCE];
const TABLE_EVIDENCE = [...HUD_PATH_EVIDENCE, 'docs/original/formats/hud.md#tabl-image-lists-confirmed-structure'];
const ZOOM_ICON_EVIDENCE = [...TABLE_EVIDENCE, 'docs/original/formats/hud.md#zoom-window-icons-by-craft-type-r8'];
const INTERFERENCE_EVIDENCE = ['docs/original/formats/hud.md#snip-10487-confirmed-structure-p2-1227'];
const STATUS_MESSAGES_EVIDENCE = ['docs/original/formats/hud.md#diag-10489-confirmed-structure-p2-07-revision'];
const MAP_GEOMETRY_EVIDENCE = [
  'docs/original/formats/cockpit.md#instrument-types-per-slot-confirmed-p3-0730',
  'docs/original/formats/executable.md#cursor-destination-and-marker-p3-0902',
  'docs/original/formats/executable.md#map-mouse-input-p3-0503',
  'docs/original/formats/executable.md#zoom-window-information-window-and-labels-p3-0904',
  'docs/original/formats/hud.md#1-bitmap-fonts-confirmed',
];

const COCKPIT_INSTRUMENTS_EVIDENCE = [
  'docs/original/formats/cockpit.md#element-52-bytes-confirmed',
  'docs/original/formats/cockpit.md#instrument-records-scheduling-and-visible-persistence-p3-1301',
  'docs/original/formats/cockpit.md#instrument-types-per-slot-confirmed-p3-0730',
  'docs/original/formats/executable.md#t7-right-target-display-confirmed-code',
];

const TEXTURE_EVIDENCE = 'docs/original/formats/textures.md#3-tex-textures-confirmed';
const NEAREST_EVIDENCE = 'docs/original/formats/textures.md#nearest-colour-metric-and-tie-rule-confirmed';
const EFFECT_EVIDENCE = 'docs/original/formats/executable.md#effect-presentation-sources';

/**
 * Whole-entry TEX images research confirmed for the slice's effect roles (P2-06/11, U-027): `image/<role>` with its
 * embedded palette `palette/<role>`, shown like the slice textures.
 */
export const PRODUCTION_EFFECT_IMAGES: readonly { readonly role: string; readonly entry: number }[] =
  Object.freeze([Object.freeze({ role: 'missile', entry: 10_377 })]);

function mapping(
  id: string, type: string, entry: number, subresource: string | null, unknowns: string[], evidence: string[],
  confidence = unknowns.length === 0 ? 'confirmed' : 'likely',
) {
  return {
    asset: { id, kind: id.split('/')[0] },
    parts: [{ alternatives: [{ discPath: ARCHIVE, entry: { id: entry, type }, subresource }] }],
    confidence,
    unknowns,
    evidence,
    resolution: 'declared',
  };
}

const palette = (group: string) => ({ asset: { id: `palette/flight/${group}`, kind: 'palette' }, role: 'flight-palette', group });

/**
 * Every whole-entry TEX image with its embedded palette: the slice textures in table order, then the effect images.
 * Each image is the whole TEX record shown through the nearest flight colours (textures §3, confirmed). Runtime
 * shading stays unconfirmed (U-028), so the image mappings are likely; an effect image's role assignment also carries
 * the effects research.
 */
const TEX_IMAGES = [
  ...PRODUCTION_MODEL_TEXTURES.map(({ entry }, index) => ({
    imageId: modelTextureImageId(index), paletteId: modelTexturePaletteId(index), role: 'model-texture', entry,
    unknowns: ['U-028'], evidence: [TEXTURE_EVIDENCE, NEAREST_EVIDENCE],
  })),
  ...PRODUCTION_EFFECT_IMAGES.map(({ role, entry }) => ({
    imageId: `image/${role}`, paletteId: `palette/${role}`, role, entry,
    unknowns: ['U-027', 'U-028'], evidence: [EFFECT_EVIDENCE, TEXTURE_EVIDENCE, NEAREST_EVIDENCE],
  })),
];

/** Each TEX image's embedded palette, and the image shown through the nearest flight colours of the models group. */
const texImageDeclarations = TEX_IMAGES.flatMap(({ imageId, paletteId, role }) => [
  { asset: { id: paletteId, kind: 'palette' }, role: 'texture-palette', group: 'models' },
  {
    asset: { id: imageId, kind: 'image' }, role, group: 'models',
    palette: paletteId, display: { nearest: 'palette/flight/models' }, alpha: 'encoding', rowOrder: 'stored',
  },
]);

/** Text byte c draws glyph c (hud §1.1), so each range maps codes to the glyphs of the same number. */
const same = (first: number, last: number): CharMapRange => ({ firstCode: first, firstGlyph: first, count: last - first + 1 });

/** Every table stores 8 rows per glyph; the 4×6 table's 256 × 6 bytes are 192 such glyphs (hud §1.1). */
const font = (name: string, width: number, height: number, charMap: CharMapRange[]) =>
  ({ asset: { id: `font/hud/${name}`, kind: 'font' }, role: 'font', group: 'cockpit-hud-map', cell: { width, height }, glyphRows: 8, charMap });

/** One P2-07 source entry, and the confidence, unknowns and evidence every mapping into it shares. */
interface CockpitSource {
  readonly type: string;
  readonly entry: number;
  readonly confidence: 'confirmed' | 'likely';
  readonly unknowns: string[];
  readonly evidence: string[];
}

const FRONT_COCKPIT: CockpitSource = { type: 'CCKD', entry: HI_COCKPIT_ENTRY, confidence: 'likely', unknowns: ['U-029'], evidence: FRONT_COCKPIT_EVIDENCE };
const MAP_FRAME: CockpitSource = { type: 'CCKD', entry: HI_COCKPIT_ENTRY, confidence: 'confirmed', unknowns: ['U-029'], evidence: MAP_FRAME_EVIDENCE };
/** The HUD and map families, whose use, palette, transparency and row order the EXE drawing paths confirm (hud §2). */
const hudSource = (type: string, entry: number, evidence: string[]): CockpitSource => ({ type, entry, confidence: 'confirmed', unknowns: ['U-030'], evidence });

const FLIGHT_PALETTE = 'palette/flight/cockpit-hud-map';
/** The map frame group's own palette, under which the whole map screen is drawn (cockpit §1). */
const MAP_PALETTE = 'palette/map/screen';
/** Every HUD and map caller of the colour-keyed copy passes key 0 (hud §2). */
const COLOUR_KEY_0 = { colourKey: 0 };

interface CockpitAsset {
  readonly declaration: { readonly asset: { readonly id: string; readonly kind: string }; readonly [field: string]: unknown };
  /** Plain mapping data: an archive entry part, then a region part for the SNIP frames and DIAG. */
  readonly mapping: Omit<ReturnType<typeof mapping>, 'parts'> & { readonly parts: readonly { readonly alternatives: readonly object[] }[] };
}

/** An Asset of `source`; `region` adds the executable region its conversion also needs as a second part. */
const cockpitAsset = (
  declaration: CockpitAsset['declaration'], source: CockpitSource, subresource: string | null, region?: ReturnType<typeof executableRegionAt>,
): CockpitAsset => {
  const base = mapping(declaration.asset.id, source.type, source.entry, subresource, source.unknowns, source.evidence, source.confidence);
  return { declaration, mapping: region ? { ...base, parts: [...base.parts, { alternatives: [region] }] } : base };
};

/** `<prefix>0` … `<prefix><count − 1>`: the index of a record in its full source list, without zero padding. */
const indexed = (prefix: string, count: number): string[] => Array.from({ length: count }, (_, index) => `${prefix}${index}`);

/**
 * Images shown directly in stored row order; image i is record `<list>/<i>` of `source`, or the whole entry without
 * `list`, and also needs `region` when given.
 */
const images = (
  ids: readonly string[], role: string, paletteId: string, alpha: 'encoding' | typeof COLOUR_KEY_0, source: CockpitSource, list: string | null,
  region?: ReturnType<typeof executableRegionAt>,
) => ids.map((id, index) => cockpitAsset(
  { asset: { id, kind: 'image' }, role, group: 'cockpit-hud-map', palette: paletteId, display: 'direct', alpha, rowOrder: 'stored' },
  source, list === null ? null : `${list}/${index}`, region,
));

/** A 640×480 layout of CCKD slot `slot` whose element i draws `elements[i]`. */
const layout = (id: string, role: string, elements: readonly string[], source: CockpitSource, slot: number): CockpitAsset =>
  cockpitAsset({ asset: { id, kind: 'layout' }, role, group: 'cockpit-hud-map', frame: { width: 640, height: 480 }, elements }, source, `groups/${slot}`);

const FRONT_ELEMENTS = indexed('image/cockpit/front/element-', 4);
const MAP_FRAME_ELEMENTS = indexed('image/map/frame/element-', 4);
const STATUS_DISPLAY = hudSource('MFDD', STATUS_DISPLAY_ENTRY, STATUS_DISPLAY_EVIDENCE);

/**
 * The P2-07 Assets with the element, record and frame counts of the local structure checks (cockpit §1–3, hud §2). The
 * front cockpit (R1) and the HUD use the default flight palette, the map frame and map symbols the map group palette
 * (R2). CCKD elements, the status display backgrounds and the page background are drawn as encoded, so raw ones are
 * opaque; the status display overlays, gauge bars, unit markers and zoom icons with colour key 0 (R3, R4). The SNIP
 * interference frames are drawn whole through the executable's colour table, and the DIAG messages take the lower
 * line's format from the executable (2026-10-08 revision).
 */
const COCKPIT_HUD_MAP_ASSETS: readonly CockpitAsset[] = [
  layout('layout/cockpit/front', 'front-cockpit', FRONT_ELEMENTS, FRONT_COCKPIT, 0),
  ...images(FRONT_ELEMENTS, 'cockpit-element', FLIGHT_PALETTE, 'encoding', FRONT_COCKPIT, 'groups/0/elements'),
  layout('layout/map/frame', 'strategic-map', MAP_FRAME_ELEMENTS, MAP_FRAME, 2),
  ...images(MAP_FRAME_ELEMENTS, 'map-frame-element', MAP_PALETTE, 'encoding', MAP_FRAME, 'groups/2/elements'),
  cockpitAsset({ asset: { id: MAP_PALETTE, kind: 'palette' }, role: 'map-palette', group: 'cockpit-hud-map' }, MAP_FRAME, 'groups/2/palette'),
  ...images(indexed('image/hud/status-display/background-', 3), 'hud-mfd', FLIGHT_PALETTE, 'encoding', STATUS_DISPLAY, 'lists/0/records'),
  ...images(indexed('image/hud/status-display/overlay-', 9), 'hud-mfd', FLIGHT_PALETTE, COLOUR_KEY_0, STATUS_DISPLAY, 'lists/1/records'),
  ...images(['image/hud/display-page/background'], 'hud-mfd', FLIGHT_PALETTE, 'encoding', hudSource('BITM', DISPLAY_PAGE_ENTRY, HUD_PATH_EVIDENCE), null),
  ...images(indexed('image/hud/gauge-bar-1/', 4), 'hud-mfd', FLIGHT_PALETTE, COLOUR_KEY_0, hudSource('TABL', GAUGE_BAR_ENTRY, TABLE_EVIDENCE), 'records'),
  ...images(indexed('image/map/unit-marker/', 29), 'strategic-map', MAP_PALETTE, COLOUR_KEY_0, hudSource('TABL', UNIT_MARKER_ENTRY, TABLE_EVIDENCE), 'records'),
  ...images(indexed('image/map/zoom-icon/', 29), 'strategic-map', MAP_PALETTE, COLOUR_KEY_0, hudSource('TABL', ZOOM_ICON_ENTRY, ZOOM_ICON_EVIDENCE), 'records'),
  ...images(
    indexed('image/hud/display-interference/frame-', 9), 'hud-mfd', FLIGHT_PALETTE, 'encoding', hudSource('SNIP', INTERFERENCE_ENTRY, INTERFERENCE_EVIDENCE),
    'frames', INTERFERENCE_COLOURS,
  ),
  cockpitAsset(
    { asset: { id: 'data/hud/status-display/messages', kind: 'data' }, role: STATUS_MESSAGES_ROLE, group: 'cockpit-hud-map' },
    hudSource('DIAG', STATUS_MESSAGES_ENTRY, STATUS_MESSAGES_EVIDENCE), null, SUBSYSTEM_FORMAT,
  ),
];

/**
 * The map geometry's sources in the HI cockpit set (P3-03 spec, P3-09 的修订：地图几何（修订 2）): the one type-10 record
 * of the slot carrying layout 6, the map (cockpit §1), and font table 1, whose glyph height the information window's
 * lines use.
 */
export const MAP_GEOMETRY_SOURCE = Object.freeze({ layout: 6, instrumentType: 10, font: 1 });

const MAP_GEOMETRY_ID = 'data/hud/map-geometry';

/**
 * The map geometry: two subresource parts of the one CCKD entry in canonical locator order, the font and then the
 * instrument record, verified only after conversion parses them.
 */
const mapGeometryMapping = () => {
  const { layout, instrumentType, font } = MAP_GEOMETRY_SOURCE;
  const base = mapping(MAP_GEOMETRY_ID, 'CCKD', HI_COCKPIT_ENTRY, `fonts/${font}`, [], MAP_GEOMETRY_EVIDENCE);
  const instrument = { discPath: ARCHIVE, entry: { id: HI_COCKPIT_ENTRY, type: 'CCKD' }, subresource: `layouts/${layout}/instruments/type-${instrumentType}` };
  return { ...base, parts: [...base.parts, { alternatives: [instrument] }] };
};

const COCKPIT_INSTRUMENTS_ID = 'data/hud/instruments';

/** The right display's target view distance table: 20 f32 values by kind bit (executable, T7). */
export const TARGET_VIEW_DISTANCES = executableRegionAt(0x17_5424, 4 * COCKPIT_INSTRUMENTS_FORMAT.targetViewDistances);

/**
 * The cockpit instruments (P3-03 spec, 修订 4): `layouts/<n>` of the HI cockpit set for the layout number of each slot
 * the slice draws, in canonical locator order, then the target view distance region; verified only after conversion
 * parses them.
 */
const cockpitInstrumentsMapping = () => {
  const [first, ...rest] = COCKPIT_INSTRUMENTS_FORMAT.slots.map(({ layoutNumber }) => `layouts/${layoutNumber}`);
  const base = mapping(COCKPIT_INSTRUMENTS_ID, 'CCKD', HI_COCKPIT_ENTRY, first, [], COCKPIT_INSTRUMENTS_EVIDENCE);
  const slots = rest.map(subresource => ({ alternatives: [{ discPath: ARCHIVE, entry: { id: HI_COCKPIT_ENTRY, type: 'CCKD' }, subresource }] }));
  return { ...base, parts: [...base.parts, ...slots, { alternatives: [TARGET_VIEW_DISTANCES] }] };
};

/** The codes hud §1.1 records per table: printable ASCII whose glyph is that character, and space. */
export const PRODUCTION_GRAPHICS_DECLARATIONS: readonly GraphicsDeclaration[] = readGraphicsDeclarations([
  palette('models'),
  palette('cockpit-hud-map'),
  font('8x8-1', 8, 8, [same(0x20, 0x7a), same(0x7c, 0x7e)]),
  font('8x8-2', 8, 8, [same(0x20, 0x7e)]),
  font('4x6', 4, 6, [same(0x20, 0x20), same(0x25, 0x25), same(0x27, 0x3f), same(0x41, 0x5d)]),
  ...texImageDeclarations,
  ...COCKPIT_HUD_MAP_ASSETS.map(({ declaration }) => declaration),
  ...PRODUCTION_FLIGHT_GRAPHICS_DECLARATIONS,
  ...PRODUCTION_HUD_TEXT_DECLARATIONS,
  { asset: { id: MAP_GEOMETRY_ID, kind: 'data' }, role: MAP_GEOMETRY_ROLE, group: 'cockpit-hud-map' },
  { asset: { id: COCKPIT_INSTRUMENTS_ID, kind: 'data' }, role: COCKPIT_INSTRUMENTS_ROLE, group: 'cockpit-hud-map' },
]);

/** Each TEX image maps to its whole record; its palette, the embedded BGR palette, is confirmed. */
const texImageMappings = TEX_IMAGES.flatMap(({ imageId, paletteId, entry, unknowns, evidence }) => [
  mapping(imageId, 'TEX', entry, null, unknowns, evidence),
  mapping(paletteId, 'TEX', entry, 'palette', [], [TEXTURE_EVIDENCE]),
]);

/** Declared mappings without a fingerprint; the import job binds them to the verified source. */
export const PRODUCTION_GRAPHICS_MAPPINGS: SourceMappingTable = readSourceMappingTable({
  sourceFingerprint: null,
  mappings: [
    mapping('font/hud/4x6', 'CCKD', HI_COCKPIT_ENTRY, 'fonts/2', ['U-029', 'U-030'], FONT_EVIDENCE),
    mapping('font/hud/8x8-1', 'CCKD', HI_COCKPIT_ENTRY, 'fonts/0', ['U-029', 'U-030'], FONT_EVIDENCE),
    mapping('font/hud/8x8-2', 'CCKD', HI_COCKPIT_ENTRY, 'fonts/1', ['U-029', 'U-030'], FONT_EVIDENCE),
    mapping('palette/flight/cockpit-hud-map', 'DATA', DATA_ENTRY, null, [], PALETTE_EVIDENCE),
    mapping('palette/flight/models', 'DATA', DATA_ENTRY, null, [], PALETTE_EVIDENCE),
    ...texImageMappings,
    ...COCKPIT_HUD_MAP_ASSETS.map(asset => asset.mapping),
    ...PRODUCTION_FLIGHT_GRAPHICS_MAPPINGS.mappings,
    ...PRODUCTION_HUD_TEXT_MAPPINGS.mappings,
    mapGeometryMapping(),
    cockpitInstrumentsMapping(),
  ].sort((left, right) => compareText(left.asset.id, right.asset.id)),
});

/**
 * The approved P2-07 share (docs/plan/p2/07/spec.md, limits and budgets): an upper bound over every candidate cockpit,
 * HUD and map Asset rather than their exact usage. The group's fonts stay in the P2-05 share.
 */
export const PRODUCTION_COCKPIT_HUD_MAP_SHARE: BudgetRecord = Object.freeze({
  ...EMPTY_BUDGET_USAGE,
  assets: 112,
  dependencyEdges: 192,
  paletteEntries: 1_024,
  glyphs: 0,
  imagePixels: 655_360,
  payloadBytes: 917_504,
});

/**
 * The approved map geometry share (P3-03 spec, P3-09 的修订：地图几何（修订 2））: one Asset and its payload at the byte
 * limit.
 */
export const PRODUCTION_MAP_GEOMETRY_SHARE: BudgetRecord = Object.freeze({
  ...EMPTY_BUDGET_USAGE, assets: 1, payloadBytes: MAP_GEOMETRY_LIMITS.payloadBytes,
});

/**
 * The approved cockpit instruments share (P3-03 spec, 修订 4): one Asset and its payload at the byte limit.
 */
export const PRODUCTION_COCKPIT_INSTRUMENTS_SHARE: BudgetRecord = Object.freeze({
  ...EMPTY_BUDGET_USAGE, assets: 1, payloadBytes: COCKPIT_INSTRUMENTS_LIMITS.payloadBytes,
});

/**
 * The approved budget share of these Assets: the P2-05 share plus the P2-06 slice texture, P2-07 cockpit, HUD and map,
 * P3-03 flight graphics and HUD text, map geometry and cockpit instruments shares. The P2-05 and texture `payloadBytes` bound their payloads at the structural
 * limits; source reads keep the P2-02 default limit, so no share adds any.
 */
export const PRODUCTION_GRAPHICS_SHARE: BudgetRecord = [
  PRODUCTION_MODEL_TEXTURE_SHARE, PRODUCTION_COCKPIT_HUD_MAP_SHARE, PRODUCTION_FLIGHT_GRAPHICS_SHARE, PRODUCTION_HUD_TEXT_SHARE,
  PRODUCTION_MAP_GEOMETRY_SHARE, PRODUCTION_COCKPIT_INSTRUMENTS_SHARE,
].reduce(
  (total, share) => addBudgets(total, share, 'share'),
  Object.freeze({
    ...EMPTY_BUDGET_USAGE,
    assets: 5,
    dependencyEdges: 0,
    paletteEntries: 512,
    glyphs: 768,
    imagePixels: 0,
    payloadBytes: 16_384,
  }),
);
