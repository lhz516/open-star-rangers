import { describe, expect, it } from 'vitest';
import { ASSET_ID_LIMITS, readAssetId } from '../../content/asset-id.ts';
import { EMPTY_BUDGET_USAGE } from '../../content/budget.ts';
import { validateGroup } from '../../content/completeness.ts';
import { compareText } from '../../content/contract-validation.ts';
import type { CraftTypeTable } from '../../content/logic/logic-content.ts';
import { decodeLogicPayload } from '../../content/logic/logic-payload.ts';
import { applyManifestIdentity } from '../../content/manifest-identity.ts';
import { MODEL_LIMITS, MODEL_PAYLOAD_LAYOUT } from '../../content/models/model-payload.ts';
import { CLASSIC_P2_SLICE } from '../../content/slice-definition.ts';
import { DEFAULT_MODEL_IDS, syntheticScenarioArchive } from '../formats/formats.test-support.ts';
import { archiveLocator } from '../source-mapping.ts';
import { buildImfat, syntheticMesh, syntheticModl } from '../synthetic.ts';
import { countedVerifiedSource, expectSourceError, UNLIMITED_BUDGET } from './conversion.test-support.ts';
import { convertLogic } from './convert-logic.ts';
import { convertModels } from './convert-models.ts';
import { productionIdentityBasis } from './converter-version.ts';
import { bindCraftTypes } from './craft-binding.ts';
import { runGraphicsStep } from './graphics-step.ts';
import { modelsGroupDraft, runModelStep } from './model-step.ts';
import { PRODUCTION_GRAPHICS_DECLARATIONS, PRODUCTION_GRAPHICS_MAPPINGS, PRODUCTION_GRAPHICS_SHARE } from './production-graphics.ts';
import { PRODUCTION_TEXTURE_REFERENCES } from './production-model-textures.ts';
import {
  PRODUCTION_MODEL_REFERENCES, PRODUCTION_MODEL_SHARE, productionModelDeclarations, productionModelMappings,
} from './production-models.ts';
import { PRODUCTION_MESH_ENTRIES, productionModelReferences, productionSliceEntries } from './production-models.test-support.ts';
import { PRODUCTION_SOUND_TABLE } from './production-sounds.ts';

/** The production logic conversion on the synthetic slice disc, and the binding its craft types give on the same M2ID list. */
async function slice() {
  const { source, reads } = await countedVerifiedSource({ 'MAIN/SCENARIO.NOB': syntheticScenarioArchive(), 'MAIN/SR.NOB': buildImfat(10_000, productionSliceEntries()) });
  const logic = await convertLogic(source, UNLIMITED_BUDGET);
  const craftTypes = logic.draft.assets.find(({ role }) => role === 'craft-types')!;
  const { content } = decodeLogicPayload(logic.draft.payloads.find(({ id }) => id === craftTypes.id)!.bytes, craftTypes) as { content: CraftTypeTable };
  const binding = bindCraftTypes(content.entries.map(({ craftType }) => craftType), DEFAULT_MODEL_IDS, 'archive:/MAIN/SR.NOB#1');
  return { source, reads, logic, binding };
}

const soundIdOf = new Map(PRODUCTION_SOUND_TABLE.map(({ mapping }) => [archiveLocator(mapping.parts[0].alternatives[0]).entry.id, mapping.asset.id]));

/** The effect model the P2-06/11 research recorded: converted besides the bound craft models, with its own evidence. */
const DEBRIS = Object.freeze({ id: 'model/debris', modelEntryId: 10_383 });

describe('production models', () => {
  it('exports the approved share, which bounds the payloads within its counts and the part limit', () => {
    expect(PRODUCTION_MODEL_SHARE).toEqual({ ...EMPTY_BUDGET_USAGE, assets: 16, dependencyEdges: 96, vertices: 8_192, triangles: 8_192, payloadBytes: 1_048_576 });
    // Worst case within the share: every model at the part limit with a geometry per part, every dependency edge a
    // reference of the longest Asset ID, and every vertex and triangle of the share.
    const { assets, dependencyEdges, vertices, triangles, payloadBytes } = PRODUCTION_MODEL_SHARE;
    const layout = MODEL_PAYLOAD_LAYOUT;
    const bound = assets * (layout.headerBytes + MODEL_LIMITS.modelParts * (layout.partBytes + layout.geometryHeaderBytes))
      + dependencyEdges * (layout.referenceLengthBytes + ASSET_ID_LIMITS.totalLength)
      + vertices * layout.vertexBytes + triangles * layout.triangleBytes;
    expect(bound).toBeLessThanOrEqual(payloadBytes);
  });

  it('declares and maps every bound craft model, deriving its role from the binding, and the debris model', async () => {
    const { binding } = await slice();
    const expected = [
      { id: 'model/base-1', category: 'base', role: 'base' },
      { id: 'model/enemy-ship-1', category: 'enemy', role: 'enemy-ship' },
      { id: 'model/enemy-ship-2', category: 'enemy', role: 'enemy-ship' },
      { id: 'model/friendly-craft-1', category: 'friendly', role: 'friendly-craft' },
      { id: 'model/player-ship', category: 'player', role: 'player-ship' },
    ];
    expect(binding.models.map(({ id, category }) => ({ id, category }))).toEqual(expected.map(({ id, category }) => ({ id, category })));
    expect(productionModelDeclarations(binding.models)).toEqual([...expected, { id: DEBRIS.id, role: 'debris' }]
      .map(({ id, role }) => ({ asset: { id, kind: 'model' }, role, group: 'models' })));
    const table = productionModelMappings(binding.models);
    expect(table.sourceFingerprint).toBeNull();
    const mapping = (id: string, modelEntryId: number, unknowns: string[], evidence: string[]) => ({
      asset: { id, kind: 'model' },
      parts: [{ alternatives: [{ discPath: 'MAIN/SR.NOB', entry: { id: modelEntryId, type: 'MODL' }, subresource: null }] }],
      confidence: 'likely', unknowns, evidence, resolution: 'declared',
    });
    const crafts = binding.models.map(({ id, modelEntryId }) => mapping(id, modelEntryId, ['U-022', 'U-027', 'U-028'], [
      'docs/original/formats/executable.md#player-target-modes-and-enemy-classification',
      'docs/original/formats/hud.md#3-id-lists-confirmed-structure',
      'docs/original/formats/mesh.md#2-modl-structure-confirmed-on-all-19-entries',
      'docs/original/formats/mesh.md#3-comparison-with-the-original-partial',
    ]));
    // The debris model carries the effects research instead of the binding's, sorted with the craft models by ID.
    const debris = mapping(DEBRIS.id, DEBRIS.modelEntryId, ['U-027', 'U-028'], [
      'docs/original/formats/executable.md#effect-presentation-sources',
      'docs/original/formats/mesh.md#2-modl-structure-confirmed-on-all-19-entries',
    ]);
    expect(table.mappings).toEqual([...crafts, debris].sort((left, right) => compareText(left.asset.id, right.asset.id)));
  });

  it('converts the bound and debris models from the synthetic production disc with the production tables and share', async () => {
    const { source, reads, binding } = await slice();
    const result = await runModelStep(source, productionModelMappings(binding.models), productionModelDeclarations(binding.models), PRODUCTION_MODEL_REFERENCES, PRODUCTION_MODEL_SHARE);
    const [models] = result.groups;
    const all = [...binding.models, DEBRIS].sort((left, right) => compareText(left.id, right.id));
    expect(models.descriptors.map(({ id }) => id)).toEqual(all.map(({ id }) => id));
    // Each model's dependencies are its MODL's textures, through the texture table, and its sounds, through the
    // production sound table: no sound ID is named here.
    all.forEach(({ modelEntryId }, index) => {
      const { textures, sounds } = productionModelReferences(modelEntryId);
      const expected = [
        ...textures.map(entry => ({ id: PRODUCTION_TEXTURE_REFERENCES.get(entry)!, kind: 'image' })),
        ...sounds.map(entry => ({ id: soundIdOf.get(entry)!, kind: 'sound' })),
      ].sort((left, right) => compareText(left.id, right.id));
      expect(models.descriptors[index].dependencies).toEqual(expected);
    });
    expect(models.sources.map(({ id, state, unknowns }) => `${id}:${state}:${unknowns.join()}`))
      .toEqual(all.map(({ id }) => `${id}:verified:${id === DEBRIS.id ? 'U-027,U-028' : 'U-022,U-027,U-028'}`));
    // Distinct meshes per model: base triangle + quad, debris quad + triangle, enemy-ship-1 pair + quad, enemy-ship-2
    // quad, friendly triangle, player quad + pair + triangle; each model stores its own copy of a shared mesh.
    expect(result.usage).toMatchObject({ assets: 6, vertices: 7 + 7 + 7 + 4 + 3 + 10, triangles: 2 + 2 + 3 + 1 + 1 + 4 });
    // The quad mesh five models share is read once.
    expect(reads.get(PRODUCTION_MESH_ENTRIES.quad)).toBe(1);
  });

  it('gives the merged models draft every model the logic group requires on the same disc', async () => {
    const { source, logic, binding } = await slice();
    const graphics = await runGraphicsStep(source, PRODUCTION_GRAPHICS_MAPPINGS, PRODUCTION_GRAPHICS_DECLARATIONS, PRODUCTION_GRAPHICS_SHARE);
    const models = await runModelStep(source, productionModelMappings(binding.models), productionModelDeclarations(binding.models), PRODUCTION_MODEL_REFERENCES, PRODUCTION_MODEL_SHARE);
    const draft = modelsGroupDraft([graphics, models], source.identity.fingerprint);
    const [logicGroup] = applyManifestIdentity(productionIdentityBasis(source.identity.fingerprint), [logic.draft, draft]);
    const result = validateGroup(CLASSIC_P2_SLICE, logicGroup);
    if (result.status !== 'group-complete') throw new Error('expected a complete logic group');
    const owned = new Set(draft.assets.map(({ id }) => id));
    expect(result.externalRequirements.map(({ id, kind }) => [id, kind])).toEqual(binding.models.map(({ id }) => [id, 'model']));
    expect(result.externalRequirements.every(({ id }) => owned.has(id))).toBe(true);
  });

  it('rejects structurally valid models whose vertices exceed the share', () => {
    const vertices = MODEL_LIMITS.meshVertices;
    const big = syntheticMesh({
      positions: new Float32Array(vertices * 3), uvs: new Float32Array(vertices * 2), normals: new Float32Array(vertices * 3),
      shadingSlotCount: 1, faces: [[[0, 0], [1, 0], [2, 0]]],
    }).data;
    const modl = syntheticModl({ partLists: [[{ mesh: 1 }, { mesh: 2 }, { mesh: 3 }], [], []] }).data;
    expectSourceError(() => convertModels(
      [{ asset: { id: 'model/synthetic-big', kind: 'model' }, role: 'base', group: 'models' }],
      { models: new Map([[readAssetId('model/synthetic-big'), modl]]), meshes: new Map([[1, big], [2, big], [3, big]]) },
      PRODUCTION_MODEL_REFERENCES, PRODUCTION_MODEL_SHARE,
    ), 'budget-exceeded', 'models[model/synthetic-big].model', { name: 'vertices', limit: 8_192, observed: 3 * vertices });
  });
});
