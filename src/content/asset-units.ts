import type { AssetKind } from './asset-id.ts';

/** Canonical counting units, not a source-entry mapping or a complete candidate graph. */
export const ASSET_UNITS = Object.freeze({
  mission: 'whole-mission',
  model: 'model-with-internal-geometry',
  image: 'independent-image',
  palette: 'independently-reused-palette',
  font: 'font-library',
  layout: 'consumer-layout',
  sound: 'independent-sample-clip',
  data: 'independently-reused-logic-data',
} as const satisfies Record<AssetKind, string>);

// Internal elements have no independent Asset identity. Source splits/merges belong to source mapping.
export const INTERNAL_ASSET_ELEMENTS = Object.freeze({
  mission: Object.freeze(['numeric-values', 'short-labels', 'objects', 'references'] as const),
  model: Object.freeze(['mesh-geometry', 'numeric-values', 'short-labels'] as const),
  image: Object.freeze(['pixels', 'numeric-values', 'short-labels'] as const),
  palette: Object.freeze(['palette-entries'] as const),
  font: Object.freeze(['glyphs'] as const),
  layout: Object.freeze(['numeric-values', 'short-labels'] as const),
  sound: Object.freeze(['sample-points'] as const),
  data: Object.freeze(['numeric-values', 'short-labels'] as const),
} as const satisfies Record<AssetKind, readonly string[]>);
