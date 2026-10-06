import { readAssetId, type AssetId } from '../../content/asset-id.ts';
import { EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import { compareText } from '../../content/contract-validation.ts';
import { readSourceMappingTable, type SourceMappingTable } from '../source-mapping.ts';
import type { ModelReferences } from './convert-models.ts';
import type { ModelBinding, ModelCategory } from './craft-binding.ts';
import { readModelDeclarations, type ModelDeclaration } from './model-declarations.ts';
import { MODEL_ARCHIVE } from './model-step.ts';
import { PRODUCTION_SOUND_REFERENCES } from './production-sounds.ts';
import { PRODUCTION_TEXTURE_REFERENCES } from './production-model-textures.ts';

// The production model inputs (docs/plan/p2/06/spec.md, production Assets and sources). Craft models are named only by
// the P2-09 craft type binding, so their declarations and mappings are derived from it; the research-confirmed effect
// models are fixed. Textures and sounds resolve only through the production texture table and the P2-08 production
// sound table.

/** The slice role of a craft model, from the category its binding named it from. */
const ROLES: Readonly<Record<ModelCategory, string>> = Object.freeze({
  player: 'player-ship',
  enemy: 'enemy-ship',
  base: 'base',
  friendly: 'friendly-craft',
});

/**
 * The binding comes from M2ID (hud §3); MODL is read whole (mesh §2) and list 0 matches the original's models (mesh §3);
 * categories follow the player target modes. Part lists and slots stay open (U-027), base interaction is U-022 and
 * textures carry U-028.
 */
const MODEL_EVIDENCE = Object.freeze([
  'docs/original/formats/executable.md#player-target-modes-and-enemy-classification',
  'docs/original/formats/hud.md#3-id-lists-confirmed-structure',
  'docs/original/formats/mesh.md#2-modl-structure-confirmed-on-all-19-entries',
  'docs/original/formats/mesh.md#3-comparison-with-the-original-partial',
]);
const MODEL_UNKNOWNS = Object.freeze(['U-022', 'U-027', 'U-028']);

/**
 * Models research confirmed for the slice's effect roles (P2-06/11): the flight effect setup loads the debris model
 * by entry and the fragment effect draws its list 1 parts (executable, effect presentation sources). Its role
 * assignment carries U-027 and its texture U-028.
 */
export const PRODUCTION_EFFECT_MODELS: readonly { readonly id: AssetId; readonly role: string; readonly modelEntryId: number }[] =
  Object.freeze([Object.freeze({ id: readAssetId('model/debris'), role: 'debris', modelEntryId: 10_383 })]);
const EFFECT_EVIDENCE = Object.freeze([
  'docs/original/formats/executable.md#effect-presentation-sources',
  'docs/original/formats/mesh.md#2-modl-structure-confirmed-on-all-19-entries',
]);
const EFFECT_UNKNOWNS = Object.freeze(['U-027', 'U-028']);

/** One declaration per bound craft model, in the binding's ascending Asset ID order, then one per effect model. */
export const productionModelDeclarations = (bindings: readonly ModelBinding[]): readonly ModelDeclaration[] => readModelDeclarations([
  ...bindings.map(({ id, category }) => ({ asset: { id, kind: 'model' }, role: ROLES[category], group: 'models' })),
  ...PRODUCTION_EFFECT_MODELS.map(({ id, role }) => ({ asset: { id, kind: 'model' }, role, group: 'models' })),
]);

/**
 * Declared mappings of the bound craft models and the effect models to their whole MODL entries, without a
 * fingerprint until the job binds them.
 */
export function productionModelMappings(bindings: readonly ModelBinding[]): SourceMappingTable {
  const mapping = (id: string, modelEntryId: number, unknowns: readonly string[], evidence: readonly string[]) => ({
    asset: { id, kind: 'model' },
    parts: [{ alternatives: [{ discPath: MODEL_ARCHIVE, entry: { id: modelEntryId, type: 'MODL' }, subresource: null }] }],
    confidence: 'likely',
    unknowns,
    evidence,
    resolution: 'declared',
  });
  return readSourceMappingTable({
    sourceFingerprint: null,
    mappings: [
      ...bindings.map(({ id, modelEntryId }) => mapping(id, modelEntryId, MODEL_UNKNOWNS, MODEL_EVIDENCE)),
      ...PRODUCTION_EFFECT_MODELS.map(({ id, modelEntryId }) => mapping(id, modelEntryId, EFFECT_UNKNOWNS, EFFECT_EVIDENCE)),
    ].sort((left, right) => compareText(left.asset.id, right.asset.id)),
  });
}

/** The production lookup tables of the model converter. */
export const PRODUCTION_MODEL_REFERENCES: ModelReferences = Object.freeze({
  textures: PRODUCTION_TEXTURE_REFERENCES,
  sounds: PRODUCTION_SOUND_REFERENCES,
});

/**
 * The approved model step share (P2-06 spec, limits and budget): room beyond the five craft models for the Assets
 * research may add. `payloadBytes` bounds the payloads within these counts and `modelParts` at the actual layout.
 */
export const PRODUCTION_MODEL_SHARE: BudgetRecord = Object.freeze({
  ...EMPTY_BUDGET_USAGE,
  assets: 16,
  dependencyEdges: 96,
  vertices: 8_192,
  triangles: 8_192,
  payloadBytes: 1_048_576,
});
