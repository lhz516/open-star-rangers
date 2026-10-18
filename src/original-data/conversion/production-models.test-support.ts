import { addBudgets, EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import { modelPayloadLength } from '../../content/models/model-payload.ts';
import { pairGeometry, quadGeometry } from '../../content/models/models.test-support.ts';
import { DEFAULT_MODEL_IDS, syntheticModelEntries } from '../formats/formats.test-support.ts';
import { syntheticModl, type SyntheticEntry, type SyntheticModlFields } from '../synthetic.test-support.ts';
import { meshBlockFor, triangleMeshBlock } from './conversion.test-support.ts';
import { productionFlightDataEntries } from './flight-data.test-support.ts';
import { productionGraphicsEntries } from './production-graphics.test-support.ts';
import { PRODUCTION_MODEL_TEXTURES } from './production-model-textures.ts';
import { PRODUCTION_EFFECT_MODELS, PRODUCTION_MODEL_REFERENCES } from './production-models.ts';
import { productionRuleData } from './production-rule-data.test-support.ts';
import { productionSoundEntries } from './production-sounds.test-support.ts';

// Valid synthetic models for the five MODL entries the default synthetic mission binds and for the effect models, with
// their meshes, generated in code; never original data. Parts name TEX entries of the production texture table and slots SND entries of the
// production sound table, so the synthetic production disc converts with the production lookup tables.

/** Synthetic MESH entries, at IDs no graphics, sound, model or list entry uses. */
export const PRODUCTION_MESH_ENTRIES = Object.freeze({ quad: 21_001, pair: 21_002, triangle: 21_003 });

const MESH_BLOCKS: Readonly<Record<keyof typeof PRODUCTION_MESH_ENTRIES, Uint8Array>> = {
  quad: meshBlockFor(quadGeometry()), pair: meshBlockFor(pairGeometry()), triangle: triangleMeshBlock(),
};

const texture = (number: number): number => PRODUCTION_MODEL_TEXTURES[number - 1].entry;
const { quad, pair, triangle } = PRODUCTION_MESH_ENTRIES;

const EFFECT_MODEL_ENTRIES = PRODUCTION_EFFECT_MODELS.map(({ modelEntryId }) => modelEntryId);

/**
 * The models by MODL entry: the bound ones in the default mission's craft type slots (player 0, enemies 7 and 8, the
 * base 17 and the friendly craft 14), then the debris model, which like the original has only list 1. All three part
 * lists are used; the quad mesh is shared by five models; sound slots name the production table's player, enemy, base
 * and shared entries.
 */
const MODELS: ReadonlyMap<number, SyntheticModlFields> = new Map([
  [DEFAULT_MODEL_IDS[0], {
    partLists: [
      [{ mesh: quad, texture: texture(13), flags: 1 }, { mesh: pair, texture: texture(11), flags: 1, colour: [255, 0, 0] }],
      [{ mesh: pair, flags: 3 }],
      [{ mesh: triangle, texture: texture(5), flags: 1 }],
    ],
    sounds: [10_679, 10_669, 10_647, 0, 10_175],
  }],
  [DEFAULT_MODEL_IDS[7], { partLists: [[{ mesh: pair, texture: texture(6), flags: 2 }], [{ mesh: quad, flags: 3 }], []], sounds: [0, 10_179, 0, 0, 10_177] }],
  [DEFAULT_MODEL_IDS[8], { partLists: [[{ mesh: quad, texture: texture(3), flags: 3 }], [], []], sounds: [0, 10_037, 0, 0, 10_177] }],
  [DEFAULT_MODEL_IDS[17], { partLists: [[{ mesh: triangle, texture: texture(1), flags: 2 }, { mesh: quad, texture: texture(1), flags: 1 }], [], []], sounds: [0, 10_155, 0, 0, 0] }],
  [DEFAULT_MODEL_IDS[14], { partLists: [[{ mesh: triangle, flags: 2 }], [], []] }],
  [EFFECT_MODEL_ENTRIES[0], { partLists: [[], [{ mesh: quad, texture: texture(16), flags: 3 }, { mesh: triangle, texture: texture(16), flags: 3 }], []] }],
]);

/** The valid MODL blocks of the models by entry ID. */
const productionModelBlocks = (): ReadonlyMap<number, { readonly data: Uint8Array; readonly relocations: number[] }> =>
  new Map([...MODELS].map(([entry, fields]) => [entry, syntheticModl(fields)]));

/** The quad mesh with a non-zero trailer, which the MESH reader rejects as `invalid-payload`. */
function corruptQuad(): Uint8Array {
  const block = meshBlockFor(quadGeometry());
  new DataView(block.buffer).setUint32(block.length - 4, 1, true);
  return block;
}

/** The MESH entries the models' parts name; `corrupt` breaks the quad mesh that five models share. */
export const productionMeshEntries = (corrupt = false): SyntheticEntry[] => Object.entries(PRODUCTION_MESH_ENTRIES).map(([name, id]) =>
  ({ id, type: 'MESH', data: corrupt && id === quad ? corruptQuad() : MESH_BLOCKS[name as keyof typeof MESH_BLOCKS], relocations: [0] }));

/** The distinct textures and sounds each bound model references, by MODL entry. */
export function productionModelReferences(entry: number): { readonly textures: readonly number[]; readonly sounds: readonly number[] } {
  const { partLists, sounds = [] } = MODELS.get(entry)!;
  return {
    textures: [...new Set(partLists.flat().flatMap(({ texture: id }) => (id ? [id] : [])))],
    sounds: [...new Set(sounds.filter(id => id !== 0))],
  };
}

/** A MUSC entry no production mapping names, which no job may read (P3-03 spec, AC-16). */
export const SLICE_DECOY_ENTRY = 21_101;

/** The flight data entries the graphics entries lack: the RENS entry with its scene settings header, EXIC, EXPL and NEBC. */
const FLIGHT_DATA_TYPES: ReadonlySet<string> = new Set(['RENS', 'EXIC', 'EXPL', 'NEBC']);

/**
 * The `MAIN/SR.NOB` entries of the synthetic production disc, in ascending ID order: the production graphics with the
 * flight graphics, the M2ID list with the valid bound models, the effect models, their meshes, the production RENS entry
 * with the effect records and scene settings, the explosion and nebula lists, the base repair TABL of the rule data,
 * synthetic samples at every production sound table entry and the decoy MUSC entry. `corruptMesh` breaks the shared
 * quad mesh.
 */
export const productionSliceEntries = (corruptMesh = false): SyntheticEntry[] => {
  const blocks = productionModelBlocks();
  return [
    ...productionGraphicsEntries(), ...syntheticModelEntries(DEFAULT_MODEL_IDS, blocks),
    ...EFFECT_MODEL_ENTRIES.map(id => ({ id, type: 'MODL', ...blocks.get(id)! })), ...productionMeshEntries(corruptMesh), ...productionSoundEntries(),
    ...productionFlightDataEntries().filter(({ type }) => FLIGHT_DATA_TYPES.has(type)), ...productionRuleData().srEntries,
    { id: SLICE_DECOY_ENTRY, type: 'MUSC', data: Uint8Array.from({ length: 32 }, (_, index) => index + 1) },
  ].sort((left, right) => left.id - right.id);
};

/** Vertex and triangle counts of the synthetic meshes. */
const MESH_COUNTS: ReadonlyMap<number, { readonly vertices: number; readonly triangles: number }> = new Map([
  [quad, { vertices: 4, triangles: 1 }], [pair, { vertices: 3, triangles: 2 }], [triangle, { vertices: 3, triangles: 1 }],
]);

/**
 * The model step's conversion usage on the bound and effect models with the production lookup tables, from the payload layout:
 * each model stores each of its distinct meshes once and references its distinct textures and sounds once.
 */
export const PRODUCTION_MODEL_USAGE: BudgetRecord = [...MODELS.keys()].reduce((usage, entry) => {
  const meshes = [...new Set(MODELS.get(entry)!.partLists.flat().map(({ mesh }) => mesh))].map(mesh => MESH_COUNTS.get(mesh)!);
  const { textures, sounds } = productionModelReferences(entry);
  const references = [
    ...textures.map(id => PRODUCTION_MODEL_REFERENCES.textures.get(id)!), ...sounds.map(id => PRODUCTION_MODEL_REFERENCES.sounds.get(id)!),
  ];
  const parts = MODELS.get(entry)!.partLists.flat().length;
  return addBudgets(usage, {
    ...EMPTY_BUDGET_USAGE,
    assets: 1,
    dependencyEdges: references.length,
    vertices: meshes.reduce((sum, { vertices }) => sum + vertices, 0),
    triangles: meshes.reduce((sum, { triangles }) => sum + triangles, 0),
    payloadBytes: modelPayloadLength({ geometries: meshes, parts, references }),
  }, 'usage');
}, EMPTY_BUDGET_USAGE);
