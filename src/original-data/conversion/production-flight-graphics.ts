import { readAssetId, type AssetId } from '../../content/asset-id.ts';
import { compareText } from '../../content/contract-validation.ts';
import { VIEW_LABELS_FORMAT, VIEW_LABELS_ROLE } from '../../content/hud/view-labels-payload.ts';
import { readSourceMappingTable, type SourceMappingTable } from '../source-mapping.ts';
import { readGraphicsDeclarations, type GraphicsDeclaration } from './graphics-declarations.ts';

// The P3-03 flight graphics (docs/plan/p3/03/spec.md, S-08 to S-12, Asset 与角色 and field rule 9): the hit-shimmer
// band map (TEX 11069), the right display's background (TEX 11089) with its embedded palette, the 15 nebula backgrounds
// of NEBC 10661, every frame of the 17 explosion animations, and the view label of TABL 10399. Their representation
// follows P3-03/05 (textures §3, §4, §6) and the coordinator's decisions in the goal's execution record: the frames,
// the nebulae and the hit-shimmer thresholds keep their stored indices and bind the models group's flight palette with
// direct display, so there is neither a hit-shimmer nor an explosion palette. Entry IDs stay in original-data and never
// enter canonical content. P3-03/19 merges these tables into the production graphics tables and sets their share.

const ARCHIVE = 'MAIN/SR.NOB';
/** Hit-shimmer band thresholds without a palette (textures, TEX 11069). */
const HIT_SHIMMER_ENTRY = 11_069;
/** The right display's background with its own palette (textures, TEX 11089). */
const TARGET_DISPLAY_ENTRY = 11_089;
/** The view labels by sub-mode (hud, TABL 10399). */
const VIEW_LABELS_ENTRY = 10_399;

/** One explosion animation: its ANIM entry and frame count. */
interface ExplosionAnimationRow {
  readonly entry: number;
  readonly frames: number;
}

const animations = (frames: number, entries: readonly number[]): ExplosionAnimationRow[] => entries.map(entry => Object.freeze({ entry, frames }));

/**
 * The explosion animations in Asset number order: by the first appearance of their EXPL in EXIC 10211's three lists, in
 * list and position order (textures §7; each EXPL names a different ANIM), with each ANIM's frame count (textures §6).
 */
export const PRODUCTION_EXPLOSION_ANIMATIONS: readonly ExplosionAnimationRow[] = Object.freeze([
  ...animations(12, [10_183, 10_187, 10_191, 10_195, 10_199, 10_203, 10_207]),
  ...animations(12, [10_185, 10_189, 10_193, 10_197, 10_201, 10_205, 10_209]),
  ...animations(6, [11_383, 11_385, 11_387]),
]);

/** The BITM entries of NEBC 10661 in list order (hud §3, textures §4), from the P3-03/16 local read of the list. */
export const PRODUCTION_NEBULA_IMAGES: readonly number[] = Object.freeze([
  10_379, 10_381, 10_453, 10_653, 10_651, 10_655, 10_657, 10_659, 10_105, 11_077, 11_079, 11_081, 11_083, 11_373, 11_377,
]);

/** The two-digit number, from 01, of the item at `index`. */
const number = (index: number): string => String(index + 1).padStart(2, '0');

/** `image/explosion/<nn>/<mm>`: frame `frame` of animation `animation`, both indices from 0. */
export const explosionFrameImageId = (animation: number, frame: number): AssetId => readAssetId(`image/explosion/${number(animation)}/${number(frame)}`);

/** `image/nebula/<nn>`: the NEBC list's image at `index`, from 0. */
export const nebulaImageId = (index: number): AssetId => readAssetId(`image/nebula/${number(index)}`);

const MODELS_PALETTE = 'palette/flight/models';
const COCKPIT_PALETTE = 'palette/flight/cockpit-hud-map';
const TARGET_DISPLAY_PALETTE = 'palette/hud/target-display/background';

const TEXTURES = 'docs/original/formats/textures.md';
const HIT_SHIMMER_EVIDENCE = [`${TEXTURES}#tex-11069-hit-shimmer-band-map-confirmed`];
const TARGET_DISPLAY_EVIDENCE = [`${TEXTURES}#tex-11089-right-display-background-confirmed-structure-display-likely`];
const NEAREST_EVIDENCE = `${TEXTURES}#nearest-colour-metric-and-tie-rule-confirmed`;
const NEBULA_EVIDENCE = ['docs/original/formats/hud.md#3-id-lists-confirmed-structure', `${TEXTURES}#4-bitm-bitmaps-confirmed-structure`];
const EXPLOSION_EVIDENCE = [`${TEXTURES}#6-anim-explosion-animations-confirmed`, `${TEXTURES}#7-expl-explosion-records-confirmed`];
const VIEW_LABELS_EVIDENCE = ['docs/original/formats/hud.md#tabl-10165-selectors-and-tabl-10399-labels-p3-0304'];

/** A declaration and its mapping, both plain data. */
interface FlightGraphic {
  readonly declaration: { readonly asset: { readonly id: string; readonly kind: string }; readonly [field: string]: unknown };
  readonly mapping: Readonly<Record<string, unknown>>;
}

/** The research confidence of a mapping, its open unknowns and its evidence (P3-03 spec, Asset 与角色). */
interface Confidence {
  readonly confidence: 'confirmed' | 'likely';
  readonly unknowns: readonly string[];
  readonly evidence: readonly string[];
}

const graphic = (declaration: FlightGraphic['declaration'], type: string, entry: number, subresource: string | null, { confidence, unknowns, evidence }: Confidence): FlightGraphic => ({
  declaration,
  mapping: {
    asset: declaration.asset,
    parts: [{ alternatives: [{ discPath: ARCHIVE, entry: { id: entry, type }, subresource }] }],
    confidence,
    unknowns: [...unknowns],
    // The mapping table keeps evidence in canonical ascending order.
    evidence: [...evidence].sort(compareText),
    resolution: 'declared',
  },
});

/** An image of its stored indices in stored row order, transparent only where its encoding says. */
const image = (id: string, role: string, group: string, palette: string, display: 'direct' | { readonly nearest: string }) =>
  ({ asset: { id, kind: 'image' }, role, group, palette, display, alpha: 'encoding', rowOrder: 'stored' });

const HIT_SHIMMER: Confidence = { confidence: 'likely', unknowns: ['U-027'], evidence: HIT_SHIMMER_EVIDENCE };
const TARGET_DISPLAY: Confidence = { confidence: 'likely', unknowns: ['U-030'], evidence: TARGET_DISPLAY_EVIDENCE };
const NEBULA: Confidence = { confidence: 'likely', unknowns: ['U-018'], evidence: NEBULA_EVIDENCE };
/** The ANIM structure, decoding, palette, transparency and display are confirmed by code (P3-03/05); U-001 stays open. */
const EXPLOSION: Confidence = { confidence: 'confirmed', unknowns: ['U-001'], evidence: EXPLOSION_EVIDENCE };
const VIEW_LABELS: Confidence = { confidence: 'confirmed', unknowns: [], evidence: VIEW_LABELS_EVIDENCE };

/**
 * Every flight graphic:
 * - the hit-shimmer thresholds as stored, kept exactly by direct display under the models flight palette, which serves
 *   only the viewer (textures, TEX 11069);
 * - the right display's background through the nearest colours of the cockpit group's flight palette, like the slice
 *   textures, and its embedded palette (textures, TEX 11089);
 * - each nebula background, opaque and direct under the models flight palette (textures §4);
 * - each explosion frame `frames/<index>`, direct under the models flight palette and masked by its transparent runs
 *   (textures §6);
 * - the view label of sub-mode 8 (hud, TABL 10399).
 */
const FLIGHT_GRAPHICS: readonly FlightGraphic[] = [
  graphic(image('image/hit-shimmer', 'hit-shimmer', 'models', MODELS_PALETTE, 'direct'), 'TEX', HIT_SHIMMER_ENTRY, null, HIT_SHIMMER),
  graphic({ asset: { id: TARGET_DISPLAY_PALETTE, kind: 'palette' }, role: 'texture-palette', group: 'cockpit-hud-map' }, 'TEX', TARGET_DISPLAY_ENTRY, 'palette', TARGET_DISPLAY),
  graphic(
    image('image/hud/target-display/background', 'target-display', 'cockpit-hud-map', TARGET_DISPLAY_PALETTE, { nearest: COCKPIT_PALETTE }),
    'TEX', TARGET_DISPLAY_ENTRY, null, { ...TARGET_DISPLAY, evidence: [...TARGET_DISPLAY.evidence, NEAREST_EVIDENCE] },
  ),
  ...PRODUCTION_NEBULA_IMAGES.map((entry, index) =>
    graphic(image(nebulaImageId(index), 'nebula-background', 'models', MODELS_PALETTE, 'direct'), 'BITM', entry, null, NEBULA)),
  ...PRODUCTION_EXPLOSION_ANIMATIONS.flatMap(({ entry, frames }, animation) => Array.from({ length: frames }, (_, frame) =>
    graphic(image(explosionFrameImageId(animation, frame), 'explosion-frame', 'models', MODELS_PALETTE, 'direct'), 'ANIM', entry, `frames/${frame}`, EXPLOSION))),
  graphic(
    { asset: { id: 'data/hud/view-labels', kind: 'data' }, role: VIEW_LABELS_ROLE, group: 'cockpit-hud-map' },
    'TABL', VIEW_LABELS_ENTRY, `labels/${VIEW_LABELS_FORMAT.subMode}`, VIEW_LABELS,
  ),
];

/** The flight palettes the images bind; the production graphics set these declarations join already declares them. */
const BOUND_PALETTES = ['models', 'cockpit-hud-map'].map(group => ({ asset: { id: `palette/flight/${group}`, kind: 'palette' }, role: 'flight-palette', group }));

/**
 * The flight graphics declarations, checked together with the flight palettes they bind but without them, so that
 * P3-03/19 can append them to the production graphics declarations.
 */
export const PRODUCTION_FLIGHT_GRAPHICS_DECLARATIONS: readonly GraphicsDeclaration[] = Object.freeze(
  readGraphicsDeclarations([...BOUND_PALETTES, ...FLIGHT_GRAPHICS.map(({ declaration }) => declaration)]).slice(BOUND_PALETTES.length),
);

/** Declared mappings without a fingerprint, in Asset ID order; the import job binds them to the verified source. */
export const PRODUCTION_FLIGHT_GRAPHICS_MAPPINGS: SourceMappingTable = readSourceMappingTable({
  sourceFingerprint: null,
  mappings: FLIGHT_GRAPHICS.map(({ mapping }) => mapping)
    .sort((left, right) => compareText((left.asset as { id: string }).id, (right.asset as { id: string }).id)),
});
