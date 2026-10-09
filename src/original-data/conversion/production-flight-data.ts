import { readAssetId, type AssetId } from '../../content/asset-id.ts';
import { EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import { compareText } from '../../content/contract-validation.ts';
import { readSourceMappingTable, type SourceMappingTable } from '../source-mapping.ts';
import { readFlightDataDeclarations, SCENE_SETTINGS_SUBRESOURCE, type FlightDataDeclarations } from './flight-data-step.ts';
import { PRODUCTION_RENS_ENTRY } from './production-effects.ts';
import {
  explosionFrameImageId, nebulaImageId, PRODUCTION_EXPLOSION_ANIMATIONS, PRODUCTION_FLIGHT_GRAPHICS_MAPPINGS, PRODUCTION_NEBULA_IMAGES,
} from './production-flight-graphics.ts';
import { PRODUCTION_SOUND_TABLE } from './production-sounds.ts';

// The P3-03 flight presentation data (docs/plan/p3/03/spec.md, S-09 to S-11, Asset 与角色): the scene settings of the
// RENS 10751 header, the explosion table of EXIC 10211 and its 17 EXPL records, one animation per ANIM, and the nebula
// list of NEBC 10661. The frames and nebula images are P3-03/16's (production-flight-graphics.ts) and the explosion
// sounds the delivered audio table's (production-sounds.ts); their mappings are this step's references. Entry IDs stay in
// original-data and never enter canonical content. P3-03/19 wires the step into the import job and sets its share.

const ARCHIVE = 'MAIN/SR.NOB';
/** The three lists of EXPL entries (hud §3, textures §7). */
const EXPLOSION_LISTS_ENTRY = 10_211;
/** The 15 nebula backgrounds (hud §3). */
const NEBULA_LIST_ENTRY = 10_661;

/**
 * The EXPL entries in animation number order: EXIC 10211's lists 1, 2 and 3 in position order, each listed once
 * (textures §7). Entry n names the ANIM of `PRODUCTION_EXPLOSION_ANIMATIONS[n]`.
 */
export const PRODUCTION_EXPLOSION_RECORDS: readonly number[] = Object.freeze([
  10_223, 10_227, 10_231, 10_235, 10_239, 10_243, 10_247,
  10_225, 10_229, 10_233, 10_237, 10_241, 10_245, 10_249,
  11_389, 11_391, 11_393,
]);

/** The delivered sounds the EXPL records name (spec, 技术决定 12; textures §7: SND 10213–10219). */
const EXPLOSION_SOUNDS: readonly AssetId[] = ['blast-v1', 'blast-v2', 'blast-v3', 'blast-v4'].map(name => readAssetId(`sound/explosion/${name}`));

/** `data/explosion-animation/<nn>`: animation `index`, from 0, numbered as its frames are. */
export const explosionAnimationId = (index: number): AssetId => readAssetId(`data/explosion-animation/${String(index + 1).padStart(2, '0')}`);

const EXECUTABLE = 'docs/original/formats/executable.md';
const HUD_LISTS = 'docs/original/formats/hud.md#3-id-lists-confirmed-structure';
const TEXTURES = 'docs/original/formats/textures.md';

/** The research confidence of a mapping, its open unknowns and its evidence (P3-03 spec, Asset 与角色). */
interface Confidence {
  readonly confidence: 'confirmed' | 'likely';
  readonly unknowns: readonly string[];
  readonly evidence: readonly string[];
}

/** Field types confirmed by code; what the fields mean stays open (U-027, U-028). */
const SCENE_SETTINGS: Confidence = {
  confidence: 'likely', unknowns: ['U-027', 'U-028'],
  evidence: [`${EXECUTABLE}#flight-message-strings-and-the-rens-header-p3-0304`, `${EXECUTABLE}#data-loaded-by-the-loop-p3-0110`],
};
const EXPLOSIONS: Confidence = { confidence: 'confirmed', unknowns: [], evidence: [HUD_LISTS, `${TEXTURES}#7-expl-explosion-records-confirmed`] };
/** The ANIM structure is confirmed by code (P3-03/05), as for the frames; U-001 stays open. */
const ANIMATION: Confidence = {
  confidence: 'confirmed', unknowns: ['U-001'], evidence: [`${TEXTURES}#6-anim-explosion-animations-confirmed`, `${TEXTURES}#7-expl-explosion-records-confirmed`],
};
const NEBULA: Confidence = { confidence: 'confirmed', unknowns: [], evidence: [HUD_LISTS, `${EXECUTABLE}#data-loaded-by-the-loop-p3-0110`] };

const locator = (type: string, entry: number, subresource: string | null = null) => ({ discPath: ARCHIVE, entry: { id: entry, type }, subresource });

const mapping = (id: AssetId, locators: readonly ReturnType<typeof locator>[], { confidence, unknowns, evidence }: Confidence) => ({
  asset: { id, kind: 'data' },
  parts: locators.map(alternative => ({ alternatives: [alternative] })),
  confidence,
  unknowns: [...unknowns],
  // The mapping table keeps evidence in canonical ascending order.
  evidence: [...evidence].sort(compareText),
  resolution: 'declared',
});

const SCENE_SETTINGS_ID = readAssetId('data/scene-settings');
const EXPLOSIONS_ID = readAssetId('data/explosions');
const NEBULA_ID = readAssetId('data/nebula-backgrounds');

const animationIds = PRODUCTION_EXPLOSION_ANIMATIONS.map((_, index) => explosionAnimationId(index));
/** Each animation's frame images in frame order. */
const frameIds = PRODUCTION_EXPLOSION_ANIMATIONS.map(({ frames }, animation) =>
  Array.from({ length: frames }, (_, frame) => explosionFrameImageId(animation, frame)));
const nebulaIds = PRODUCTION_NEBULA_IMAGES.map((_, index) => nebulaImageId(index));

/** Declared mappings without a fingerprint, in Asset ID order; the import job binds them to the verified source. */
export const PRODUCTION_FLIGHT_DATA_MAPPINGS: SourceMappingTable = readSourceMappingTable({
  sourceFingerprint: null,
  mappings: [
    mapping(SCENE_SETTINGS_ID, [locator('RENS', PRODUCTION_RENS_ENTRY, SCENE_SETTINGS_SUBRESOURCE)], SCENE_SETTINGS),
    // Locator order: the EXIC entry, then the EXPL entries by ID.
    mapping(EXPLOSIONS_ID, [locator('EXIC', EXPLOSION_LISTS_ENTRY), ...[...PRODUCTION_EXPLOSION_RECORDS].sort((left, right) => left - right).map(entry => locator('EXPL', entry))], EXPLOSIONS),
    ...PRODUCTION_EXPLOSION_ANIMATIONS.map(({ entry }, index) => mapping(animationIds[index], [locator('ANIM', entry)], ANIMATION)),
    mapping(NEBULA_ID, [locator('NEBC', NEBULA_LIST_ENTRY)], NEBULA),
  ].sort((left, right) => compareText(left.asset.id, right.asset.id)),
});

/**
 * Every flight data Asset, with the references of the step: P3-03/16's mappings of the frames and nebula images and
 * the audio table's mappings of the four blast sounds.
 */
export const PRODUCTION_FLIGHT_DATA_DECLARATIONS: FlightDataDeclarations = (() => {
  const named = new Set<string>([...frameIds.flat(), ...nebulaIds, ...EXPLOSION_SOUNDS]);
  const models = { group: 'models' } as const;
  return readFlightDataDeclarations({
    assets: [
      { asset: { id: SCENE_SETTINGS_ID, kind: 'data' }, role: 'scene-settings', ...models },
      { asset: { id: EXPLOSIONS_ID, kind: 'data' }, role: 'explosion-table', ...models, animations: animationIds, sounds: EXPLOSION_SOUNDS },
      ...animationIds.map((id, index) => ({ asset: { id, kind: 'data' }, role: 'explosion-animation', ...models, frames: frameIds[index] })),
      { asset: { id: NEBULA_ID, kind: 'data' }, role: 'nebula-backgrounds', ...models, images: nebulaIds },
    ],
    references: {
      sourceFingerprint: null,
      mappings: [...PRODUCTION_FLIGHT_GRAPHICS_MAPPINGS.mappings, ...PRODUCTION_SOUND_TABLE.map(row => row.mapping)]
        .filter(({ asset }) => named.has(asset.id))
        .sort((left, right) => compareText(left.asset.id, right.asset.id)),
    },
  });
})();

/**
 * The approved flight data step share (P3-03 spec, 限值与预算). P3-03/19 derives its values from the step's baseline
 * usage by the spec's rule; until then it is empty, and the step is not part of the import job.
 */
export const PRODUCTION_FLIGHT_DATA_SHARE: BudgetRecord = EMPTY_BUDGET_USAGE;
