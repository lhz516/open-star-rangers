import { addBudgets, EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import { modelPayloadLength } from '../../content/models/model-payload.ts';
import { pairGeometry, quadGeometry } from '../../content/models/models.test-support.ts';
import { DEFAULT_MODEL_IDS, syntheticModelEntries } from '../formats/formats.test-support.ts';
import { syntheticModl, type SyntheticEntry, type SyntheticModlFields } from '../synthetic.ts';
import { meshBlockFor, triangleMeshBlock } from './conversion.test-support.ts';
import { productionGraphicsEntries } from './production-graphics.test-support.ts';
import { PRODUCTION_MODEL_TEXTURES } from './production-model-textures.ts';
import { PRODUCTION_MODEL_REFERENCES } from './production-models.ts';
import { productionSoundEntries } from './production-sounds.test-support.ts';

// Valid synthetic models for the five MODL entries the default synthetic mission binds, with their meshes, generated
// in code; never original data. Parts name TEX entries of the production texture table and slots SND entries of the
// production sound table, so the synthetic production disc converts with the production lookup tables.

/** Synthetic MESH entries, at IDs no graphics, sound, model or list entry uses. */
export const PRODUCTION_MESH_ENTRIES = Object.freeze({ quad: 21_001, pair: 21_002, triangle: 21_003 });

const MESH_BLOCKS: Readonly<Record<keyof typeof PRODUCTION_MESH_ENTRIES, Uint8Array>> = {
  quad: meshBlockFor(quadGeometry()), pair: meshBlockFor(pairGeometry()), triangle: triangleMeshBlock(),
};

const texture = (number: number): number => PRODUCTION_MODEL_TEXTURES[number - 1].entry;
const { quad, pair, triangle } = PRODUCTION_MESH_ENTRIES;

/**
 * The bound models by MODL entry, in the default mission's craft type slots: player 0, enemies 7 and 8, the base 17
 * and the friendly craft 14. All three part lists are used; the quad mesh is shared by four models; sound slots name
 * the production table's player, enemy, base and shared entries.
 */
const MODELS: ReadonlyMap<number, SyntheticModlFields> = new Map([
  [DEFAULT_MODEL_IDS[0], {
    partLists: [
      [{ mesh: quad, texture: texture(13), flags: 1 }, { mesh: pair, texture: texture(11), flags: 1, colour: [255, 0, 0] }],
      [{ mesh: pair, flags: 3 }],
      [{ mesh: triangle, flags: 2, colour: [0, 0, 0] }],
    ],
    sounds: [10_679, 10_669, 10_647, 0, 10_175],
  }],
  [DEFAULT_MODEL_IDS[7], { partLists: [[{ mesh: pair, texture: texture(6) }], [{ mesh: quad, flags: 3 }], []], sounds: [0, 10_179, 0, 0, 10_177] }],
  [DEFAULT_MODEL_IDS[8], { partLists: [[{ mesh: quad, texture: texture(3) }], [], []], sounds: [0, 10_037, 0, 0, 10_177] }],
  [DEFAULT_MODEL_IDS[17], { partLists: [[{ mesh: triangle, texture: texture(1) }, { mesh: quad, texture: texture(1) }], [], []], sounds: [0, 10_155, 0, 0, 0] }],
  [DEFAULT_MODEL_IDS[14], { partLists: [[{ mesh: triangle }], [], []] }],
]);

/** The valid MODL blocks of the bound models by entry ID, for `syntheticModelEntries`. */
const productionModelBlocks = (): ReadonlyMap<number, { readonly data: Uint8Array; readonly relocations: number[] }> =>
  new Map([...MODELS].map(([entry, fields]) => [entry, syntheticModl(fields)]));

/** The quad mesh with a non-zero trailer, which the MESH reader rejects as `invalid-payload`. */
function corruptQuad(): Uint8Array {
  const block = meshBlockFor(quadGeometry());
  new DataView(block.buffer).setUint32(block.length - 4, 1, true);
  return block;
}

/** The MESH entries the bound models' parts name; `corrupt` breaks the quad mesh that four models share. */
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

/**
 * The `MAIN/SR.NOB` entries of the synthetic production disc, in ascending ID order: the production graphics, the M2ID
 * list with the valid bound models and their meshes, and synthetic samples at every production sound table entry.
 * `corruptMesh` breaks the shared quad mesh.
 */
export const productionSliceEntries = (corruptMesh = false): SyntheticEntry[] => [
  ...productionGraphicsEntries(), ...syntheticModelEntries(DEFAULT_MODEL_IDS, productionModelBlocks()), ...productionMeshEntries(corruptMesh),
  ...productionSoundEntries(),
].sort((left, right) => left.id - right.id);

/** Vertex and triangle counts of the synthetic meshes. */
const MESH_COUNTS: ReadonlyMap<number, { readonly vertices: number; readonly triangles: number }> = new Map([
  [quad, { vertices: 4, triangles: 1 }], [pair, { vertices: 3, triangles: 2 }], [triangle, { vertices: 3, triangles: 1 }],
]);

/**
 * The model step's conversion usage on the bound models with the production lookup tables, from the payload layout:
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
