import { readAssetReference, readResourceGroup, readRole } from '../../content/asset-contract.ts';
import type { AssetId } from '../../content/asset-id.ts';
import { ContentContractError, fail, readArray, readRecord, requireFields } from '../../content/contract-validation.ts';
import { SourceError } from '../source-error.ts';

// Model conversion declarations (docs/plan/p2/06/spec.md, 模型转换声明): plain data paired one to one with source
// mappings but without locators. A model's source is always its mapping's whole MODL entry, the meshes come from the
// MODL's parts, and textures and sounds resolve only through the production texture and sound tables, so none of them
// is declared.

export interface ModelDeclaration {
  readonly asset: { readonly id: AssetId; readonly kind: 'model' };
  /** A P2-01 role token: player-ship, enemy-ship, base, friendly-craft, projectile, missile or debris. */
  readonly role: string;
  readonly group: 'models';
}

function readDeclaration(value: unknown, path: string): ModelDeclaration {
  const record = readRecord(value, path);
  requireFields(record, path, ['asset', 'role', 'group']);
  const asset = readAssetReference(record.asset, `${path}.asset`);
  if (asset.kind !== 'model') fail('invalid-kind', `${path}.asset.kind`, 'must be model');
  const role = readRole(record.role, `${path}.role`);
  if (readResourceGroup(record.group, `${path}.group`) !== 'models') fail('invalid-resource-group', `${path}.group`, 'must be models');
  return Object.freeze({ asset: asset as ModelDeclaration['asset'], role, group: 'models' });
}

/**
 * Strictly reads a set of model declarations into frozen data. Any problem, including an unknown or missing field, a
 * kind other than model, a group other than models or a duplicate Asset ID, is `invalid-declaration` at its
 * structural path under `models.declarations`.
 */
export function readModelDeclarations(value: unknown, path = 'models.declarations'): readonly ModelDeclaration[] {
  try {
    const seen = new Set<string>();
    return readArray(value, path, 'invalid-record', (item, at) => {
      const declaration = readDeclaration(item, at);
      if (seen.has(declaration.asset.id)) fail('duplicate-asset', `${at}.asset.id`, 'must be unique in the set');
      seen.add(declaration.asset.id);
      return declaration;
    });
  } catch (error) {
    // The content readers' reasons are fixed safe text that never echoes the rejected value.
    if (error instanceof ContentContractError) throw new SourceError('invalid-declaration', error.path, error.reason);
    throw error;
  }
}
