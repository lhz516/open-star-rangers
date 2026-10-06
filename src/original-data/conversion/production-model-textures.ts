import { EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import { readAssetId, type AssetId } from '../../content/asset-id.ts';

// The production texture table (docs/plan/p2/06/spec.md, production Assets and sources): every TEX entry that a part
// of the five slice craft models references, in all three part lists. The initial rows were numbered from 01 in order
// of first reference by model Asset ID, list 0–2 and part order (local check, P2-06/04). Rows are only ever appended:
// a row's number is its Asset ID, so reordering or removing one changes output and needs a new converter version.

export interface ModelTextureRow {
  /** The `MAIN/SR.NOB` TEX entry; it stays in original-data and never enters canonical content. */
  readonly entry: number;
  /**
   * Whether the texture's pixels use a palette entry whose nearest flight colour is ambiguous (textures §3). Until
   * research resolves those entries (U-028), the image mapping is unconfirmed and blocks the group's completeness.
   */
  readonly ambiguous: boolean;
}

export const PRODUCTION_MODEL_TEXTURES: readonly ModelTextureRow[] = Object.freeze([
  { entry: 10_613, ambiguous: true },
  { entry: 10_615, ambiguous: false },
  { entry: 10_617, ambiguous: true },
  { entry: 10_619, ambiguous: false },
  { entry: 11_073, ambiguous: false },
  { entry: 11_067, ambiguous: true },
  { entry: 10_003, ambiguous: true },
  { entry: 10_001, ambiguous: true },
  { entry: 10_147, ambiguous: false },
  { entry: 10_321, ambiguous: true },
  { entry: 10_747, ambiguous: false },
  { entry: 10_749, ambiguous: false },
  { entry: 10_681, ambiguous: true },
  { entry: 11_009, ambiguous: false },
  { entry: 10_149, ambiguous: true },
].map(row => Object.freeze(row)));

/** The two-digit number of the row at `index`, shared by its image and palette. */
const number = (index: number): string => String(index + 1).padStart(2, '0');

export const modelTextureImageId = (index: number): AssetId => readAssetId(`image/model-texture/${number(index)}`);
export const modelTexturePaletteId = (index: number): AssetId => readAssetId(`palette/model-texture/${number(index)}`);

/** TEX entry → image Asset ID: the model converter resolves part textures only through this table. */
export const PRODUCTION_TEXTURE_REFERENCES: ReadonlyMap<number, AssetId> =
  new Map(PRODUCTION_MODEL_TEXTURES.map(({ entry }, index) => [entry, modelTextureImageId(index)]));

/**
 * The approved graphics step share added for the slice textures (P2-06 spec, limits and budget): room beyond the 15
 * textures for Assets research may add. `payloadBytes` bounds the payloads within these counts at the structural limits.
 */
export const PRODUCTION_MODEL_TEXTURE_SHARE: BudgetRecord = Object.freeze({
  ...EMPTY_BUDGET_USAGE,
  assets: 40,
  dependencyEdges: 64,
  paletteEntries: 1_024,
  imagePixels: 524_288,
  payloadBytes: 655_360,
});
