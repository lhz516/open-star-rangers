import { EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import { readAssetId, type AssetId } from '../../content/asset-id.ts';

// The production texture table (docs/plan/p2/06/spec.md, production Assets and sources): every TEX entry that a part
// of a production model references, in all three part lists. Rows 01–15 are the five slice craft models' textures,
// numbered in order of first reference by model Asset ID, list 0–2 and part order (local check, P2-06/04); row 16 is
// the texture of the research-confirmed debris model (P2-06/11). Rows are only ever appended: a row's number is its
// Asset ID, so reordering or removing one changes output and needs a new converter version.

export interface ModelTextureRow {
  /** The `MAIN/SR.NOB` TEX entry; it stays in original-data and never enters canonical content. */
  readonly entry: number;
}

export const PRODUCTION_MODEL_TEXTURES: readonly ModelTextureRow[] = Object.freeze([
  { entry: 10_613 },
  { entry: 10_615 },
  { entry: 10_617 },
  { entry: 10_619 },
  { entry: 11_073 },
  { entry: 11_067 },
  { entry: 10_003 },
  { entry: 10_001 },
  { entry: 10_147 },
  { entry: 10_321 },
  { entry: 10_747 },
  { entry: 10_749 },
  { entry: 10_681 },
  { entry: 11_009 },
  { entry: 10_149 },
  { entry: 10_151 },
].map(row => Object.freeze(row)));

/** The two-digit number of the row at `index`, shared by its image and palette. */
const number = (index: number): string => String(index + 1).padStart(2, '0');

export const modelTextureImageId = (index: number): AssetId => readAssetId(`image/model-texture/${number(index)}`);
export const modelTexturePaletteId = (index: number): AssetId => readAssetId(`palette/model-texture/${number(index)}`);

/** TEX entry → image Asset ID: the model converter resolves part textures only through this table. */
export const PRODUCTION_TEXTURE_REFERENCES: ReadonlyMap<number, AssetId> =
  new Map(PRODUCTION_MODEL_TEXTURES.map(({ entry }, index) => [entry, modelTextureImageId(index)]));

/**
 * The approved graphics step share added for the slice textures and the research-confirmed effect images (P2-06 spec,
 * limits and budget). `payloadBytes` bounds the payloads within these counts at the structural limits.
 */
export const PRODUCTION_MODEL_TEXTURE_SHARE: BudgetRecord = Object.freeze({
  ...EMPTY_BUDGET_USAGE,
  assets: 40,
  dependencyEdges: 64,
  paletteEntries: 1_024,
  imagePixels: 524_288,
  payloadBytes: 655_360,
});
