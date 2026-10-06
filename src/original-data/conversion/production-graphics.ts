import { addBudgets, EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import { compareText } from '../../content/contract-validation.ts';
import { readSourceMappingTable, type SourceMappingTable } from '../source-mapping.ts';
import { readGraphicsDeclarations, type CharMapRange, type GraphicsDeclaration } from './graphics-declarations.ts';
import {
  PRODUCTION_MODEL_TEXTURE_SHARE, PRODUCTION_MODEL_TEXTURES, modelTextureImageId, modelTexturePaletteId,
} from './production-model-textures.ts';

// The production graphics: the P2-05 flight palette once per group that owns palettes and the three HUD fonts of the
// full HI cockpit set (docs/plan/p2/05/spec.md, production Assets and sources), and the P2-06 slice textures with their
// embedded palettes (docs/plan/p2/06/spec.md). Entry IDs and font indices come from the local structure checks recorded
// in P2-05/06 and P2-06/04; they stay in original-data and never enter canonical content.

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

const palette = (group: string) => ({ asset: { id: `palette/flight/${group}`, kind: 'palette' }, role: 'flight-palette', group });

/** Each slice texture's embedded palette, and its image shown through the nearest flight colours of the models group. */
const textureDeclarations = PRODUCTION_MODEL_TEXTURES.flatMap((_, index) => [
  { asset: { id: modelTexturePaletteId(index), kind: 'palette' }, role: 'texture-palette', group: 'models' },
  {
    asset: { id: modelTextureImageId(index), kind: 'image' }, role: 'model-texture', group: 'models',
    palette: modelTexturePaletteId(index), display: { nearest: 'palette/flight/models' }, alpha: 'encoding', rowOrder: 'stored',
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
  ...textureDeclarations,
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

/**
 * Each texture's palette is its own embedded BGR palette (confirmed); its image is the whole TEX record shown through
 * the provisional nearest-colour rule (U-028), so at most likely, and unconfirmed while it uses an ambiguous entry.
 */
const textureMappings = PRODUCTION_MODEL_TEXTURES.flatMap(({ entry, ambiguous }, index) => [
  mapping(modelTextureImageId(index), 'TEX', entry, null, ['U-028'], [TEXTURE_EVIDENCE, NEAREST_EVIDENCE], ambiguous ? 'unconfirmed' : 'likely'),
  mapping(modelTexturePaletteId(index), 'TEX', entry, 'palette', [], [TEXTURE_EVIDENCE]),
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
    ...textureMappings,
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
