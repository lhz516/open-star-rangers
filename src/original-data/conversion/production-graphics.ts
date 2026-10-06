import { EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import { readSourceMappingTable, type SourceMappingTable } from '../source-mapping.ts';
import { readGraphicsDeclarations, type GraphicsDeclaration } from './graphics-declarations.ts';

// The P2-05 production graphics (docs/plan/p2/05/spec.md, production Assets and sources): the flight palette once per
// group that owns palettes, and the three HUD fonts of the full HI cockpit set. Entry IDs and font indices come from
// the local structure check recorded in P2-05/06; they stay in original-data and never enter canonical content.

const ARCHIVE = 'MAIN/SR.NOB';
/** The only DATA entry (imfat §4). */
const DATA_ENTRY = 11_075;
/** The full HI cockpit set with the strategic map frame (cockpit §1); whether HI flight loads its fonts is U-029. */
const HI_COCKPIT_ENTRY = 10_103;

const PALETTE_EVIDENCE = ['docs/original/formats/textures.md#1-data-global-palette-confirmed'];
const FONT_EVIDENCE = ['docs/original/formats/cockpit.md#1-cckd-cockpit-layouts', 'docs/original/formats/hud.md#1-bitmap-fonts-confirmed'];

const palette = (group: string) => ({ asset: { id: `palette/flight/${group}`, kind: 'palette' }, role: 'flight-palette', group });

/** Character maps start empty; P2-05/12 adds only evidenced ranges (hud §1, U-030). */
const font = (name: string, width: number, height: number) =>
  ({ asset: { id: `font/hud/${name}`, kind: 'font' }, role: 'font', group: 'cockpit-hud-map', cell: { width, height }, charMap: [] });

export const PRODUCTION_GRAPHICS_DECLARATIONS: readonly GraphicsDeclaration[] = readGraphicsDeclarations([
  palette('models'),
  palette('cockpit-hud-map'),
  font('8x8-1', 8, 8),
  font('8x8-2', 8, 8),
  font('4x6', 4, 6),
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
    mapping('font/hud/8x8-1', 'CCKD', HI_COCKPIT_ENTRY, 'fonts/0', ['U-029'], FONT_EVIDENCE),
    mapping('font/hud/8x8-2', 'CCKD', HI_COCKPIT_ENTRY, 'fonts/1', ['U-029'], FONT_EVIDENCE),
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
