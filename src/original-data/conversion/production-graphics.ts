import { addBudgets, EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import { compareText } from '../../content/contract-validation.ts';
import { readSourceMappingTable, type SourceMappingTable } from '../source-mapping.ts';
import { readGraphicsDeclarations, type CharMapRange, type GraphicsDeclaration } from './graphics-declarations.ts';
import {
  PRODUCTION_MODEL_TEXTURE_SHARE, PRODUCTION_MODEL_TEXTURES, modelTextureImageId, modelTexturePaletteId,
} from './production-model-textures.ts';

// The production graphics: the P2-05 flight palette once per group that owns palettes and the three HUD fonts of the
// full HI cockpit set (docs/plan/p2/05/spec.md, production Assets and sources), the P2-06 slice textures and
// research-confirmed effect images with their embedded palettes (docs/plan/p2/06/spec.md), and the P2-07 front cockpit
// and map frame layouts with their element images, the map palette, and the HUD and map image families
// (docs/plan/p2/07/spec.md, production Assets and sources). Entry IDs, slots and record indices come from the local
// structure checks and research recorded in P2-05/06, P2-06/04, P2-06/11 and P2-07/07–09; they stay in original-data
// and never enter canonical content.

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

const TEXTURE_EVIDENCE = 'docs/original/formats/textures.md#3-tex-textures-confirmed';
const NEAREST_EVIDENCE = 'docs/original/formats/textures.md#nearest-colour-metric-and-tie-rule-unconfirmed';
const EFFECT_EVIDENCE = 'docs/original/formats/executable.md#effect-presentation-sources';

/**
 * Whole-entry TEX images research confirmed for the slice's effect roles (P2-06/11, U-027): `image/<role>` with its
 * embedded palette `palette/<role>`, shown like the slice textures. `ambiguous` as in the texture table.
 */
export const PRODUCTION_EFFECT_IMAGES: readonly { readonly role: string; readonly entry: number; readonly ambiguous: boolean }[] =
  Object.freeze([Object.freeze({ role: 'missile', entry: 10_377, ambiguous: true })]);

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
 * Each image is the whole TEX record shown through the provisional nearest-colour rule (U-028), so at most likely, and
 * unconfirmed while it uses an ambiguous entry; an effect image's role assignment also carries the effects research.
 */
const TEX_IMAGES = [
  ...PRODUCTION_MODEL_TEXTURES.map(({ entry, ambiguous }, index) => ({
    imageId: modelTextureImageId(index), paletteId: modelTexturePaletteId(index), role: 'model-texture', entry, ambiguous,
    unknowns: ['U-028'], evidence: [TEXTURE_EVIDENCE, NEAREST_EVIDENCE],
  })),
  ...PRODUCTION_EFFECT_IMAGES.map(({ role, entry, ambiguous }) => ({
    imageId: `image/${role}`, paletteId: `palette/${role}`, role, entry, ambiguous,
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
  readonly mapping: ReturnType<typeof mapping>;
}

const cockpitAsset = (declaration: CockpitAsset['declaration'], source: CockpitSource, subresource: string | null): CockpitAsset => ({
  declaration,
  mapping: mapping(declaration.asset.id, source.type, source.entry, subresource, source.unknowns, source.evidence, source.confidence),
});

/** `<prefix>0` … `<prefix><count − 1>`: the index of a record in its full source list, without zero padding. */
const indexed = (prefix: string, count: number): string[] => Array.from({ length: count }, (_, index) => `${prefix}${index}`);

/** Images shown directly in stored row order; image i is record `<list>/<i>` of `source`, or the whole entry without `list`. */
const images = (ids: readonly string[], role: string, paletteId: string, alpha: 'encoding' | typeof COLOUR_KEY_0, source: CockpitSource, list: string | null) =>
  ids.map((id, index) => cockpitAsset(
    { asset: { id, kind: 'image' }, role, group: 'cockpit-hud-map', palette: paletteId, display: 'direct', alpha, rowOrder: 'stored' },
    source, list === null ? null : `${list}/${index}`,
  ));

/** A 640×480 layout of CCKD slot `slot` whose element i draws `elements[i]`. */
const layout = (id: string, role: string, elements: readonly string[], source: CockpitSource, slot: number): CockpitAsset =>
  cockpitAsset({ asset: { id, kind: 'layout' }, role, group: 'cockpit-hud-map', frame: { width: 640, height: 480 }, elements }, source, `groups/${slot}`);

const FRONT_ELEMENTS = indexed('image/cockpit/front/element-', 4);
const MAP_FRAME_ELEMENTS = indexed('image/map/frame/element-', 4);
const STATUS_DISPLAY = hudSource('MFDD', STATUS_DISPLAY_ENTRY, STATUS_DISPLAY_EVIDENCE);

/**
 * The P2-07 Assets with the element and record counts of the local structure check (cockpit §1–3, hud §2). The front
 * cockpit (R1) and the HUD use the default flight palette, the map frame and map symbols the map group palette (R2).
 * CCKD elements, the status display backgrounds and the page background are drawn as encoded, so raw ones are opaque;
 * the status display overlays, gauge bars, unit markers and zoom icons with colour key 0 (R3, R4).
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
];

/** The codes hud §1.1 records per table: printable ASCII whose glyph is that character, and space. */
export const PRODUCTION_GRAPHICS_DECLARATIONS: readonly GraphicsDeclaration[] = readGraphicsDeclarations([
  palette('models'),
  palette('cockpit-hud-map'),
  font('8x8-1', 8, 8, [same(0x20, 0x7a), same(0x7c, 0x7e)]),
  font('8x8-2', 8, 8, [same(0x20, 0x7e)]),
  font('4x6', 4, 6, [same(0x20, 0x20), same(0x25, 0x25), same(0x27, 0x3f), same(0x41, 0x5d)]),
  ...texImageDeclarations,
  ...COCKPIT_HUD_MAP_ASSETS.map(({ declaration }) => declaration),
]);

/** Each TEX image maps to its whole record; its palette, the embedded BGR palette, is confirmed. */
const texImageMappings = TEX_IMAGES.flatMap(({ imageId, paletteId, entry, ambiguous, unknowns, evidence }) => [
  mapping(imageId, 'TEX', entry, null, unknowns, evidence, ambiguous ? 'unconfirmed' : 'likely'),
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
  ].sort((left, right) => compareText(left.asset.id, right.asset.id)),
});

/**
 * The approved P2-07 share (docs/plan/p2/07/spec.md, limits and budgets): an upper bound over every candidate cockpit,
 * HUD and map Asset rather than their exact usage. The group's fonts stay in the P2-05 share.
 */
export const PRODUCTION_COCKPIT_HUD_MAP_SHARE: BudgetRecord = Object.freeze({
  ...EMPTY_BUDGET_USAGE,
  assets: 96,
  dependencyEdges: 192,
  paletteEntries: 1_024,
  glyphs: 0,
  imagePixels: 524_288,
  payloadBytes: 786_432,
});

/**
 * The approved budget share of these Assets: the P2-05 share plus the P2-06 slice texture and P2-07 cockpit, HUD and
 * map shares. The P2-05 and texture `payloadBytes` bound their payloads at the structural limits; source reads keep the
 * P2-02 default limit, so no share adds any.
 */
export const PRODUCTION_GRAPHICS_SHARE: BudgetRecord = [PRODUCTION_MODEL_TEXTURE_SHARE, PRODUCTION_COCKPIT_HUD_MAP_SHARE].reduce(
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
