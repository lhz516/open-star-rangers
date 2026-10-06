import { EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import { readSourceMappingTable, type SourceMappingTable } from '../source-mapping.ts';
import { readGraphicsDeclarations, type CharMapRange, type GraphicsDeclaration } from './graphics-declarations.ts';

// The P2-05 production graphics (docs/plan/p2/05/spec.md, production Assets and sources): the flight palette once per
// group that owns palettes, and the three HUD fonts of the full HI cockpit set. Entry IDs and font indices come from
// the local structure check recorded in P2-05/06; they stay in original-data and never enter canonical content.

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

const palette = (group: string) => ({ asset: { id: `palette/flight/${group}`, kind: 'palette' }, role: 'flight-palette', group });

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
]);

function mapping(id: string, type: string, entry: number, subresource: string | null, unknowns: string[], evidence: string[]) {
  return {
    asset: { id, kind: id.split('/')[0] },
    parts: [{ alternatives: [{ discPath: ARCHIVE, entry: { id: entry, type }, subresource }] }],
    confidence: unknowns.length === 0 ? 'confirmed' : 'likely',
    unknowns,
    evidence,
    resolution: 'declared',
  };
}

/** Declared mappings without a fingerprint; the import job binds them to the verified source. */
export const PRODUCTION_GRAPHICS_MAPPINGS: SourceMappingTable = readSourceMappingTable({
  sourceFingerprint: null,
  mappings: [
    mapping('font/hud/4x6', 'CCKD', HI_COCKPIT_ENTRY, 'fonts/2', ['U-029', 'U-030'], FONT_EVIDENCE),
    mapping('font/hud/8x8-1', 'CCKD', HI_COCKPIT_ENTRY, 'fonts/0', ['U-029', 'U-030'], FONT_EVIDENCE),
    mapping('font/hud/8x8-2', 'CCKD', HI_COCKPIT_ENTRY, 'fonts/1', ['U-029', 'U-030'], FONT_EVIDENCE),
    mapping('palette/flight/cockpit-hud-map', 'DATA', DATA_ENTRY, null, [], PALETTE_EVIDENCE),
    mapping('palette/flight/models', 'DATA', DATA_ENTRY, null, [], PALETTE_EVIDENCE),
  ],
});

/**
 * The approved budget share of these Assets. `payloadBytes` bounds the payloads at the structural limits; source reads
 * keep the P2-02 default limit, so this share adds none.
 */
export const PRODUCTION_GRAPHICS_SHARE: BudgetRecord = Object.freeze({
  ...EMPTY_BUDGET_USAGE,
  assets: 5,
  dependencyEdges: 0,
  paletteEntries: 512,
  glyphs: 768,
  imagePixels: 0,
  payloadBytes: 16_384,
});
