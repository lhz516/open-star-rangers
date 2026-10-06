import { pairGeometry, quadGeometry } from '../../content/models/models.test-support.ts';
import { DEFAULT_MODEL_IDS, syntheticModelEntries } from '../formats/formats.test-support.ts';
import { syntheticModl, type SyntheticEntry, type SyntheticModlFields } from '../synthetic.ts';
import { meshBlockFor, triangleMeshBlock } from './conversion.test-support.ts';
import { productionGraphicsEntries } from './production-graphics.test-support.ts';
import { PRODUCTION_MODEL_TEXTURES } from './production-model-textures.ts';
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

/** The MESH entries the bound models' parts name. */
export const productionMeshEntries = (): SyntheticEntry[] =>
  Object.entries(PRODUCTION_MESH_ENTRIES).map(([name, id]) => ({ id, type: 'MESH', data: MESH_BLOCKS[name as keyof typeof MESH_BLOCKS], relocations: [0] }));

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
 */
export const productionSliceEntries = (): SyntheticEntry[] => [
  ...productionGraphicsEntries(), ...syntheticModelEntries(DEFAULT_MODEL_IDS, productionModelBlocks()), ...productionMeshEntries(), ...productionSoundEntries(),
].sort((left, right) => left.id - right.id);
