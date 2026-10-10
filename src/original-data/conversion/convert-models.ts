import { readAssetDescriptor, type AssetDescriptor } from '../../content/asset-contract.ts';
import type { AssetId } from '../../content/asset-id.ts';
import { EMPTY_BUDGET_USAGE, readBudgetRecord, type BudgetRecord } from '../../content/budget.ts';
import { compareText } from '../../content/contract-validation.ts';
import {
  MODEL_PAYLOAD_SCHEMA_VERSION, encodeModelPayload, modelPayloadLength, modelReferences, type ModelPart,
} from '../../content/models/model-payload.ts';
import type { PayloadRecord } from '../../content/payload.ts';
import { sha256Fingerprint } from '../../content/sha256.ts';
import { readMesh, readMeshCounts, type MeshCounts } from '../formats/mesh.ts';
import { readModel } from '../formats/modl.ts';
import { SourceError } from '../source-error.ts';
import { chargeConversionBudget, readConversionUsage } from './conversion-budget.ts';
import { readModelDeclarations } from './model-declarations.ts';

/**
 * The model stage's component of the production `ConverterVersion`: the models, effects and flight data it converts into
 * the models group. Bump it when that output changes; version 4 adds the P3-03 flight data Assets.
 */
export const MODEL_CONVERTER_COMPONENT = 'models-4';

/** Source blocks already read by the step: each declared model's whole MODL entry, and the MESH entries its parts name. */
export interface ModelSources {
  readonly models: ReadonlyMap<AssetId, Uint8Array>;
  /** By MESH entry ID. */
  readonly meshes: ReadonlyMap<number, Uint8Array>;
}

/** The only bindings of source entries to Asset IDs: the production texture table and the P2-08 production sound table. */
export interface ModelReferences {
  /** TEX entry ID → image Asset ID. */
  readonly textures: ReadonlyMap<number, AssetId>;
  /** SND entry ID → sound Asset ID. */
  readonly sounds: ReadonlyMap<number, AssetId>;
}

export interface ConvertedModel {
  readonly descriptor: AssetDescriptor;
  /** Owns its whole ArrayBuffer. */
  readonly payload: PayloadRecord;
}

export interface ModelConversion {
  /** In ascending Asset ID order. */
  readonly assets: readonly ConvertedModel[];
  /** Conversion usage after the starting usage; `sourceReadBytes` is never charged here. */
  readonly usage: BudgetRecord;
}

/** One distinct MESH of a model: its entry, the location of its first part and its counts. */
interface ModelMesh extends MeshCounts {
  readonly entry: number;
  readonly path: string;
}

function undeclared(location: string, reason: string): never {
  throw new SourceError('invalid-declaration', location, reason);
}

/**
 * Converts one model: reads its MODL, resolves textures and sounds through the tables, reads only the counts of each
 * distinct MESH, charges the whole model, and only then decodes the meshes and encodes the payload.
 */
function convertModel(
  id: AssetId,
  role: string,
  sources: ModelSources,
  references: ModelReferences,
  limits: BudgetRecord,
  usage: BudgetRecord,
): { readonly converted: ConvertedModel; readonly usage: BudgetRecord } {
  const at = `models[${id}]`;
  const source = readModel(sources.models.get(id)!, `${at}.model`);
  const meshes: ModelMesh[] = [];
  const geometryOf = new Map<number, number>();
  const list = (listIndex: number): readonly ModelPart[] => Object.freeze(source.partLists[listIndex].map(({ sourceFlags, colour, meshEntry, textureEntry }, partIndex) => {
    const partPath = `${at}.parts[${listIndex}][${partIndex}]`;
    let geometry = geometryOf.get(meshEntry);
    if (geometry === undefined) {
      const block = sources.meshes.get(meshEntry) ?? undeclared(`${partPath}.mesh`, 'the mesh source was not supplied');
      geometry = meshes.push({ entry: meshEntry, path: `${partPath}.mesh`, ...readMeshCounts(block, `${partPath}.mesh`) }) - 1;
      geometryOf.set(meshEntry, geometry);
    }
    const texture = textureEntry === 0 ? null
      : references.textures.get(textureEntry) ?? undeclared(`${partPath}.texture`, 'the texture is not in the production texture table');
    return Object.freeze({ sourceFlags, colour, geometry, texture });
  }));
  const slot = (index: number): AssetId | null => {
    const entry = source.soundEntries[index];
    return entry === 0 ? null : references.sounds.get(entry) ?? undeclared(`${at}.sounds[${index}]`, 'the sound is not in the production sound table');
  };
  // Lists in source order, so geometries are numbered by first use as the payload requires.
  const partLists = Object.freeze([list(0), list(1), list(2)] as const);
  const soundSlots = Object.freeze([slot(0), slot(1), slot(2), slot(3), slot(4)] as const);
  const dependencies = modelReferences({ partLists, soundSlots });
  const charged = chargeConversionBudget(limits, usage, {
    assets: 1,
    dependencyEdges: dependencies.length,
    vertices: meshes.reduce((sum, mesh) => sum + mesh.vertices, 0),
    triangles: meshes.reduce((sum, mesh) => sum + mesh.triangles, 0),
    payloadBytes: modelPayloadLength({ geometries: meshes, parts: partLists.flat().length, references: dependencies.map(reference => reference.id) }),
  }, `${at}.model`);
  const geometries = meshes.map(mesh => readMesh(sources.meshes.get(mesh.entry)!, mesh.path));
  const bytes = encodeModelPayload({ geometries, partLists, soundSlots }, at);
  const payloadIdentity = { schemaVersion: MODEL_PAYLOAD_SCHEMA_VERSION, byteLength: bytes.length, fingerprint: sha256Fingerprint(bytes) };
  const descriptor = readAssetDescriptor({ id, kind: 'model', role, group: 'models', dependencies, payloadIdentity });
  const payload = Object.freeze({ id, schemaVersion: MODEL_PAYLOAD_SCHEMA_VERSION, bytes });
  return { converted: Object.freeze({ descriptor, payload }), usage: charged };
}

/**
 * Converts a model declaration set in Asset ID order. Each model is charged against `limits` on top of `usage`, the
 * conversion usage of earlier steps (never source reads), after reading only its MODL and its meshes' counts and
 * before any geometry is decoded or payload allocated. Within a model a MESH is stored once; models never share
 * geometry. Any failure rejects the whole set without results, and a rejected charge leaves the caller's usage as it was.
 */
export function convertModels(
  declarations: unknown,
  sources: ModelSources,
  references: ModelReferences,
  limits: unknown,
  usage: unknown = EMPTY_BUDGET_USAGE,
): ModelConversion {
  const checked = readModelDeclarations(declarations);
  const checkedLimits = readBudgetRecord(limits, 'limits');
  let current = readConversionUsage(usage);
  checked.forEach(({ asset }, index) => {
    if (!sources.models.has(asset.id)) undeclared(`models.declarations[${index}]`, 'the Asset has no source');
  });
  const assets = [...checked].sort((left, right) => compareText(left.asset.id, right.asset.id)).map(({ asset, role }) => {
    const { converted, usage: next } = convertModel(asset.id, role, sources, references, checkedLimits, current);
    current = next;
    return converted;
  });
  return Object.freeze({ assets: Object.freeze(assets), usage: current });
}
