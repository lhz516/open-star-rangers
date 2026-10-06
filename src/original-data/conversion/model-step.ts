import type { AssetId } from '../../content/asset-id.ts';
import { EMPTY_BUDGET_USAGE } from '../../content/budget.ts';
import { compareText } from '../../content/contract-validation.ts';
import type { GroupDraft } from '../../content/manifest-identity.ts';
import { readAssetDescriptors } from '../../content/manifest.ts';
import { readPayloadRecords } from '../../content/payload.ts';
import { readSourceStateSet, type AssetSourceState, type SourceStateSet } from '../../content/source-state.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import { readModel } from '../formats/modl.ts';
import { SourceError } from '../source-error.ts';
import { assetSourceStates, readSourceMappingTable, type OriginalAssetLocator, type SourceMapping } from '../source-mapping.ts';
import type { VerifiedSource } from '../source/open-verified-source.ts';
import { verifySourceMappings, type EntryReader } from '../source/verify-source-mappings.ts';
import { convertModels, type ModelReferences } from './convert-models.ts';
import type { GraphicsStepResult } from './graphics-step.ts';
import { readModelDeclarations } from './model-declarations.ts';
import { stepEntryReader } from './step-entry-reader.ts';

/** The archive of every model and of the meshes its parts name (docs/plan/p2/06/spec.md, production Assets and sources). */
export const MODEL_ARCHIVE = 'MAIN/SR.NOB';

/** The model step's result has the graphics step's shape: only the `models` group, present when it has Assets. */
export type ModelStepResult = GraphicsStepResult;

/** The whole MODL entry a model maps to; any other mapping is a declaration error at the model. */
function modelLocator(mapping: SourceMapping): OriginalAssetLocator {
  const [first] = mapping.parts;
  const whole = mapping.parts.length === 1
    && first.alternatives.every(({ discPath, entry, subresource }) => discPath === MODEL_ARCHIVE && entry.type === 'MODL' && subresource === null);
  if (!whole) throw new SourceError('invalid-declaration', `models[${mapping.asset.id}].model`, 'a model must map to one whole MODL entry of MAIN/SR.NOB');
  return first.alternatives[0];
}

/**
 * Reads a MESH a part names. A P2-03 failure keeps its code, reason and limit but is located at that part's mesh, as
 * mapping verification relocates its own reads; P2-02 disc failures pass through unchanged.
 */
async function readMeshEntry(readEntry: EntryReader, discPath: DiscPath, id: number, location: string): Promise<Uint8Array> {
  try {
    return (await readEntry({ discPath, entry: { id, type: 'MESH' }, subresource: null })).bytes;
  } catch (error) {
    if (error instanceof SourceError) throw new SourceError(error.code, location, error.reason, error.limit);
    throw error;
  }
}

/**
 * Runs the model conversion step. It pairs each declaration with exactly one whole-MODL mapping, verifies the mappings
 * through a step-local reader, reads every MESH the models' parts name once per step from the same archive, converts
 * the models and derives their locator-free source states. Mapping verification failures keep their P2-03 location,
 * a mesh read failure is located at its first referencing part, and P2-02 disc failures pass through unchanged. Any
 * failure rejects the whole step without results; reads already issued stay charged to the source.
 */
export async function runModelStep(
  source: VerifiedSource,
  mappings: unknown,
  declarations: unknown,
  references: ModelReferences,
  limits: unknown,
  usage: unknown = EMPTY_BUDGET_USAGE,
): Promise<ModelStepResult> {
  const checked = readModelDeclarations(declarations);
  const table = readSourceMappingTable(mappings);
  const mappingById = new Map<string, SourceMapping>(table.mappings.map(mapping => [mapping.asset.id, mapping]));
  checked.forEach(({ asset }, index) => {
    if (!mappingById.has(asset.id)) throw new SourceError('invalid-declaration', `models.declarations[${index}]`, 'the Asset has no source mapping');
  });
  if (table.mappings.length !== checked.length) throw new SourceError('invalid-declaration', 'models.declarations', 'every mapped Asset must be declared');
  const ids = checked.map(({ asset }) => asset.id).sort(compareText);
  const locators = new Map(ids.map(id => [id, modelLocator(mappingById.get(id)!)]));

  const readEntry = stepEntryReader(source);
  const verified = await verifySourceMappings(table, source, readEntry);
  const models = new Map<AssetId, Uint8Array>();
  const meshes = new Map<number, Uint8Array>();
  for (const id of ids) {
    const locator = locators.get(id)!;
    const block = (await readEntry(locator)).bytes;
    models.set(id, block);
    const { partLists } = readModel(block, `models[${id}].model`);
    for (const [list, parts] of partLists.entries()) {
      for (const [part, { meshEntry }] of parts.entries()) {
        if (!meshes.has(meshEntry)) meshes.set(meshEntry, await readMeshEntry(readEntry, locator.discPath, meshEntry, `models[${id}].parts[${list}][${part}].mesh`));
      }
    }
  }

  const conversion = convertModels(checked, { models, meshes }, references, limits, usage);
  const stateById = new Map<string, AssetSourceState>(assetSourceStates(verified).states.map(state => [state.id, state]));
  const { assets } = conversion;
  const groups = assets.length === 0 ? [] : [Object.freeze({
    group: 'models' as const,
    descriptors: Object.freeze(assets.map(({ descriptor }) => descriptor)),
    payloads: Object.freeze(assets.map(({ payload }) => payload)),
    sources: Object.freeze(assets.map(({ descriptor }) => stateById.get(descriptor.id)!)),
  })];
  return Object.freeze({ groups: Object.freeze(groups), usage: conversion.usage });
}

/**
 * The `models` group draft: the `models` partitions of the graphics and model step results merged by Asset ID without
 * reconverting, with the source states bound to `sourceFingerprint`. A repeated Asset ID fails as a content contract
 * error; with no Assets the draft is an empty group.
 */
export function modelsGroupDraft(graphics: GraphicsStepResult, models: ModelStepResult, sourceFingerprint: SourceStateSet['sourceFingerprint']): GroupDraft {
  const items = [graphics, models]
    .flatMap(({ groups }) => groups.filter(({ group }) => group === 'models'))
    .flatMap(({ descriptors, payloads, sources }) => descriptors.map((descriptor, index) => ({ descriptor, payload: payloads[index], state: sources[index] })))
    .sort((left, right) => compareText(left.descriptor.id, right.descriptor.id));
  return Object.freeze({
    group: 'models',
    assets: readAssetDescriptors(items.map(({ descriptor }) => descriptor), 'models.assets'),
    payloads: readPayloadRecords(items.map(({ payload }) => payload), 'models.payloads'),
    sources: readSourceStateSet({ sourceFingerprint, states: items.map(({ state }) => state) }, 'models.sources'),
  });
}
