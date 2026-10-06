import { readAssetReference, readResourceGroup } from '../../content/asset-contract.ts';
import { readAssetId, type AssetId } from '../../content/asset-id.ts';
import { ContentContractError, fail, readArray, readRecord, requireFields } from '../../content/contract-validation.ts';
import { EFFECT_LIMITS, EFFECT_SHAPES as S, MAX_FACE_WORDS, type EffectKind } from '../../content/effects/effect-payload.ts';
import { SourceError } from '../source-error.ts';

// Effect conversion declarations (docs/plan/p2/06/spec.md, effect geometry data): plain data paired one to one with
// source mappings but without locators. A declaration names the use of each region part of its mapping, in the
// mapping's part order, so the step knows which payload field each region supplies. The projectile mapping's first
// part is the RENS entry; the missile and debris mappings have only regions.

/** Bytes of one missile type record in the executable's table (executable, effect geometry data). */
export const MISSILE_RECORD_BYTES = 0x7c;

type LengthRule = (length: number) => boolean;
const bytes = (count: number): LengthRule => length => length === count;
/**
 * Instruction immediate operands, with the width of the instruction that holds each (executable, builder arguments):
 * an 8-bit operand is sign-extended to 32 bits, a 32-bit one taken as is.
 */
const imm8 = bytes(1);
const imm32 = bytes(4);
const faceWords: LengthRule = length => length % 4 === 0 && length >= 8 && length <= MAX_FACE_WORDS * 4;
const typeTable: LengthRule = length => length % MISSILE_RECORD_BYTES === 0 && length >= MISSILE_RECORD_BYTES
  && length <= EFFECT_LIMITS.missileTypes * MISSILE_RECORD_BYTES;

const range = (count: number): number[] => Array.from({ length: count }, (_, index) => index);

const projectileTemplate = (template: number): [string, LengthRule][] => [
  [`template-${template}-vertices`, bytes(S.projectileVertices * 12)],
  [`template-${template}-faces`, faceWords],
  [`template-${template}-length-constant`, bytes(8)],
  ...range(S.widthMarkers).map((marker): [string, LengthRule] => [`template-${template}-width-marker-${marker}`, imm32]),
  [`template-${template}-length-marker`, imm32],
];

const debrisTemplate = (name: 'untextured' | 'textured'): [string, LengthRule][] => [
  [`${name}-vertices`, bytes(S.debrisVertices * 12)],
  [`${name}-per-vertex`, bytes(S.debrisVertices * 12)],
  [`${name}-faces`, faceWords],
];

/** Every region use of each role with the region lengths it accepts; a declaration names each exactly once. */
export const EFFECT_REGION_USES: Readonly<Record<EffectKind, ReadonlyMap<string, LengthRule>>> = Object.freeze({
  projectile: new Map([...projectileTemplate(0), ...projectileTemplate(1)]),
  missile: new Map<string, LengthRule>([
    ['types', typeTable],
    ['type-count', bytes(4)],
    ['fin-faces', faceWords],
    ['element-faces', faceWords],
    ['flagged-element-faces', faceWords],
    ['extra-faces', faceWords],
    ['constants', bytes(56)],
    ['rotation-scale-high', imm32],
    ['rotation-scale-low', imm8],
    ['extra-colour-0', imm32],
    ['extra-colour-1', imm32],
    ['extra-colour-2', imm8],
  ]),
  debris: new Map<string, LengthRule>([
    ...debrisTemplate('untextured'),
    ...debrisTemplate('textured'),
    ...range(S.untexturedScales).map((scale): [string, LengthRule] => [`untextured-scale-${scale}`, imm32]),
    ...range(S.texturedScales).map((scale): [string, LengthRule] => [`textured-scale-${scale}`, imm32]),
    ['untextured-colour-0', imm32],
    ['untextured-colour-1', imm8],
    ['untextured-colour-2', imm8],
    ...range(3).map((channel): [string, LengthRule] => [`textured-colour-${channel}`, imm32]),
  ]),
});

export interface EffectDeclaration {
  readonly asset: { readonly id: AssetId; readonly kind: 'data' };
  readonly role: EffectKind;
  readonly group: 'models';
  /** The image the payload references: null for projectiles, an image Asset ID otherwise. */
  readonly texture: AssetId | null;
  /** The use of each region part of the mapping, in part order. */
  readonly regions: readonly string[];
}

function readDeclaration(value: unknown, path: string): EffectDeclaration {
  const record = readRecord(value, path);
  requireFields(record, path, ['asset', 'role', 'group', 'texture', 'regions']);
  const asset = readAssetReference(record.asset, `${path}.asset`);
  if (asset.kind !== 'data') fail('invalid-kind', `${path}.asset.kind`, 'must be data');
  const role = record.role;
  if (role !== 'projectile' && role !== 'missile' && role !== 'debris') fail('invalid-role', `${path}.role`, 'must be projectile, missile or debris');
  if (readResourceGroup(record.group, `${path}.group`) !== 'models') fail('invalid-resource-group', `${path}.group`, 'must be models');
  let texture: AssetId | null = null;
  if (role === 'projectile') {
    if (record.texture !== null) fail('invalid-record', `${path}.texture`, 'must be null for projectiles');
  } else {
    texture = readAssetId(record.texture, `${path}.texture`);
    if (!texture.startsWith('image/')) fail('invalid-record', `${path}.texture`, 'must be an image Asset ID');
  }
  const uses = EFFECT_REGION_USES[role];
  const seen = new Set<string>();
  const regions = readArray(record.regions, `${path}.regions`, 'invalid-record', (item, at) => {
    if (typeof item !== 'string' || !uses.has(item)) fail('invalid-record', at, 'must be a region use of the role');
    if (seen.has(item)) fail('invalid-record', at, 'must name each region use once');
    seen.add(item);
    return item;
  });
  if (regions.length !== uses.size) fail('invalid-record', `${path}.regions`, 'must name every region use of the role');
  return Object.freeze({ asset: asset as EffectDeclaration['asset'], role, group: 'models', texture, regions });
}

/**
 * Strictly reads a set of effect declarations into frozen data. Any problem, including an unknown or missing field, a
 * kind other than data, a role without effect data, a group other than models, a texture that does not suit the role,
 * region uses that are not exactly the role's or a duplicate Asset ID, is `invalid-declaration` at its structural path
 * under `effects.declarations`.
 */
export function readEffectDeclarations(value: unknown, path = 'effects.declarations'): readonly EffectDeclaration[] {
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
