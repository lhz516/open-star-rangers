import { addBudgets, EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import { compareText } from '../../content/contract-validation.ts';
import { readSourceMappingTable, type SourceMappingTable } from '../source-mapping.ts';
import { readGraphicsDeclarations, type CharMapRange, type GraphicsDeclaration } from './graphics-declarations.ts';
import {
  PRODUCTION_MODEL_TEXTURE_SHARE, PRODUCTION_MODEL_TEXTURES, modelTextureImageId, modelTexturePaletteId,
} from './production-model-textures.ts';

// The production graphics: the P2-05 flight palette once per group that owns palettes and the three HUD fonts of the
// full HI cockpit set (docs/plan/p2/05/spec.md, production Assets and sources), and the P2-06 slice textures and
// research-confirmed effect images with their embedded palettes (docs/plan/p2/06/spec.md). Entry IDs and font indices
// come from the local structure checks and research recorded in P2-05/06, P2-06/04 and P2-06/11; they stay in
// original-data and never enter canonical content.

const ARCHIVE = 'MAIN/SR.NOB';
/** The only DATA entry (imfat §4). */
const DATA_ENTRY = 11_075;
/** The full HI cockpit set with the strategic map frame (cockpit §1); whether HI flight loads its fonts is U-029. */
const HI_COCKPIT_ENTRY = 10_103;

const PALETTE_EVIDENCE = ['docs/original/formats/textures.md#1-data-global-palette-confirmed'];
const FONT_EVIDENCE = [
  'docs/original/formats/cockpit.md#1-cckd-cockpit-layouts',
  'docs/original/formats/hud.md#1-bitmap-fonts-confirmed',
  'docs/original/formats/hud.md#11-glyph-layout-and-character-maps-likely',
];

const TEXTURE_EVIDENCE = 'docs/original/formats/textures.md#3-tex-textures-confirmed';
const NEAREST_EVIDENCE = 'docs/original/formats/textures.md#nearest-colour-metric-and-tie-rule-unconfirmed';
const EFFECT_EVIDENCE = 'docs/original/formats/executable.md#effect-presentation-sources';

/**
 * Whole-entry TEX images research confirmed for the slice's effect roles (P2-06/11, U-027): `image/<role>` with its
 * embedded palette `palette/<role>`, shown like the slice textures. `ambiguous` as in the texture table.
 */
export const PRODUCTION_EFFECT_IMAGES: readonly { readonly role: string; readonly entry: number; readonly ambiguous: boolean }[] =
  Object.freeze([Object.freeze({ role: 'missile', entry: 10_377, ambiguous: true })]);

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

/** The codes hud §1.1 records per table: printable ASCII whose glyph is that character, and space. */
export const PRODUCTION_GRAPHICS_DECLARATIONS: readonly GraphicsDeclaration[] = readGraphicsDeclarations([
  palette('models'),
  palette('cockpit-hud-map'),
  font('8x8-1', 8, 8, [same(0x20, 0x7a), same(0x7c, 0x7e)]),
  font('8x8-2', 8, 8, [same(0x20, 0x7e)]),
  font('4x6', 4, 6, [same(0x20, 0x20), same(0x25, 0x25), same(0x27, 0x3f), same(0x41, 0x5d)]),
  ...texImageDeclarations,
]);

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
  ].sort((left, right) => compareText(left.asset.id, right.asset.id)),
});

/**
 * The approved budget share of these Assets: the P2-05 share plus the P2-06 slice texture share. `payloadBytes` bounds
 * the payloads at the structural limits; source reads keep the P2-02 default limit, so neither share adds any.
 */
export const PRODUCTION_GRAPHICS_SHARE: BudgetRecord = addBudgets(Object.freeze({
  ...EMPTY_BUDGET_USAGE,
  assets: 5,
  dependencyEdges: 0,
  paletteEntries: 512,
  glyphs: 768,
  imagePixels: 0,
  payloadBytes: 16_384,
}), PRODUCTION_MODEL_TEXTURE_SHARE, 'share');
