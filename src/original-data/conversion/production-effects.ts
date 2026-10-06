import { readAssetId, type AssetId } from '../../content/asset-id.ts';
import { compareText } from '../../content/contract-validation.ts';
import type { EffectKind } from '../../content/effects/effect-payload.ts';
import { readSourceMappingTable, type SourceMappingTable } from '../source-mapping.ts';
import { readEffectDeclarations, type EffectDeclaration } from './effect-declarations.ts';
import { EFFECT_ARCHIVE } from './effect-step.ts';
import { PRODUCTION_TEXTURE_REFERENCES } from './production-model-textures.ts';

// The production effect inputs (docs/plan/p2/06/spec.md, effect geometry data). Every region is named by its address
// in docs/original/formats/executable.md (effect geometry data, builder arguments) and its length; only addresses and
// lengths are here, never the bytes they hold.

/**
 * The approved bound of the three effect payloads together, in bytes (P2-06 spec, effect geometry data): the production
 * regions fix every face list, so only the record and type counts vary, up to their structural limits.
 */
export const PRODUCTION_EFFECT_PAYLOAD_BOUND = 16_384;

/** The executable the regions are read from. */
export const EFFECT_EXECUTABLE = 'MAIN/SRANGERS.EXE';
/** The RENS entry of the projectile records (executable, effect geometry data). */
export const PRODUCTION_RENS_ENTRY = 10_751;
/** TEX 10151, the debris shapes' texture (executable, effect presentation sources). */
const DEBRIS_TEXTURE_ENTRY = 10_151;

/** The objects' base addresses in the documented address space (executable §4): object n is at index n − 1. */
const OBJECT_BASES = Object.freeze([0x1_0000, 0x2_0000, 0x14_0000, 0x17_0000]);

/** The 1-based object and offset of a documented address. */
function objectOffset(address: number): { readonly object: number; readonly offset: number } {
  const index = OBJECT_BASES.findLastIndex(base => base <= address);
  return { object: index + 1, offset: address - OBJECT_BASES[index] };
}

type RegionRow = readonly [use: string, address: number, length: number];

/** The second projectile builder has the first one's instruction layout this many bytes later. */
const BUILDER_B = 0x16c;

/**
 * A projectile builder's marker immediates: x, y and z each compared with two 32-bit immediates (the operand two bytes
 * into the instruction), then the tail compare (the operand four bytes in).
 */
const projectileMarkers = (template: number, shift: number): RegionRow[] => [
  ...[0x3_f7bd, 0x3_f7c5, 0x3_f7e4, 0x3_f7ec, 0x3_f80b, 0x3_f813]
    .map((instruction, marker): RegionRow => [`template-${template}-width-marker-${marker}`, instruction + shift + 2, 4]),
  [`template-${template}-length-marker`, 0x3_f82e + shift + 4, 4],
];

/** A 32-bit push immediate (opcode 68) or an 8-bit one (opcode 6A), one byte into the instruction. */
const push32 = (use: string, instruction: number): RegionRow => [use, instruction + 1, 4];
const push8 = (use: string, instruction: number): RegionRow => [use, instruction + 1, 1];

/** Each effect Asset with its role, texture and regions. Colour pushes are listed by argument, the reverse of push order. */
const EFFECTS: readonly { readonly id: string; readonly role: EffectKind; readonly texture: AssetId | null; readonly rows: readonly RegionRow[] }[] = [
  {
    id: 'data/projectile-visuals',
    role: 'projectile',
    texture: null,
    rows: [
      ['template-0-vertices', 0x3_f670, 48], ['template-0-faces', 0x3_f6a0, 68],
      ['template-1-vertices', 0x3_f6e4, 48], ['template-1-faces', 0x3_f714, 68],
      ['template-0-length-constant', 0x17_18f4, 8], ['template-1-length-constant', 0x17_18fc, 8],
      ...projectileMarkers(0, 0), ...projectileMarkers(1, BUILDER_B),
    ],
  },
  {
    id: 'data/missile-visuals',
    role: 'missile',
    texture: readAssetId('image/missile'),
    rows: [
      ['types', 0x17_54a0, 9 * 0x7c], ['type-count', 0x17_58fc, 4],
      ['fin-faces', 0x4_4270, 196], ['element-faces', 0x4_4334, 64], ['flagged-element-faces', 0x4_4374, 124], ['extra-faces', 0x4_43f0, 20],
      ['constants', 0x17_1ac8, 56],
      // A double argument pushed as its high half, then its low half.
      push32('rotation-scale-high', 0x4_44b5), push8('rotation-scale-low', 0x4_44ba),
      push32('extra-colour-0', 0x4_4cbb), push32('extra-colour-1', 0x4_4cb4), push8('extra-colour-2', 0x4_4cb2),
    ],
  },
  {
    id: 'data/debris-visuals',
    role: 'debris',
    texture: PRODUCTION_TEXTURE_REFERENCES.get(DEBRIS_TEXTURE_ENTRY)!,
    rows: [
      ['untextured-vertices', 0x3_e2a0, 72], ['untextured-per-vertex', 0x3_e2e8, 72], ['untextured-faces', 0x3_e330, 56],
      ['textured-vertices', 0x3_e368, 72], ['textured-per-vertex', 0x3_e3b0, 72], ['textured-faces', 0x3_e3f8, 56],
      push32('untextured-scale-0', 0x3_e462), push32('untextured-scale-1', 0x3_e46c), push32('untextured-scale-2', 0x3_e47b),
      push32('textured-scale-0', 0x3_e48a), push32('textured-scale-1', 0x3_e499),
      push32('untextured-colour-0', 0x3_ea85), push8('untextured-colour-1', 0x3_ea81), push8('untextured-colour-2', 0x3_ea7f),
      push32('textured-colour-0', 0x3_eb71), push32('textured-colour-1', 0x3_eb6a), push32('textured-colour-2', 0x3_eb65),
    ],
  },
];

/** Each Asset's region rows in locator order: by object, offset and length. */
const ordered = (rows: readonly RegionRow[]) => rows
  .map(([use, address, length]) => ({ use, ...objectOffset(address), length }))
  .sort((left, right) => left.object - right.object || left.offset - right.offset || left.length - right.length);

/** The planned regions of each effect Asset in locator order, for tests and the local check. */
export const PRODUCTION_EFFECT_REGIONS: ReadonlyMap<string, readonly { readonly use: string; readonly object: number; readonly offset: number; readonly length: number }[]> =
  new Map(EFFECTS.map(({ id, rows }) => [id, Object.freeze(ordered(rows).map(region => Object.freeze(region)))]));

/** One declaration per effect Asset, naming its regions' uses in locator order. */
export const PRODUCTION_EFFECT_DECLARATIONS: readonly EffectDeclaration[] = readEffectDeclarations(EFFECTS.map(({ id, role, texture }) => ({
  asset: { id, kind: 'data' }, role, group: 'models', texture, regions: PRODUCTION_EFFECT_REGIONS.get(id)!.map(({ use }) => use),
})));

/**
 * The structure of the RENS entry and the regions is confirmed (executable, effect geometry data), and so are the
 * builder rules; that these Assets reproduce the original effects carries U-027, so they are likely.
 */
const EFFECT_EVIDENCE = Object.freeze([
  'docs/original/formats/executable.md#effect-geometry-data-p2-0614-research',
  'docs/original/formats/executable.md#effect-presentation-sources',
]);

/** Declared mappings of the effect Assets, without a fingerprint until the job binds them. */
export const PRODUCTION_EFFECT_MAPPINGS: SourceMappingTable = readSourceMappingTable({
  sourceFingerprint: null,
  mappings: EFFECTS.map(({ id, role }) => ({
    asset: { id, kind: 'data' },
    parts: [
      ...(role === 'projectile' ? [{ alternatives: [{ discPath: EFFECT_ARCHIVE, entry: { id: PRODUCTION_RENS_ENTRY, type: 'RENS' }, subresource: null }] }] : []),
      ...PRODUCTION_EFFECT_REGIONS.get(id)!.map(({ object, offset, length }) => ({
        alternatives: [{ discPath: EFFECT_EXECUTABLE, entry: null, subresource: `le/${object}/0x${offset.toString(16)}/${length}` }],
      })),
    ],
    confidence: 'likely',
    unknowns: ['U-027'],
    evidence: EFFECT_EVIDENCE,
    resolution: 'declared',
  })).sort((left, right) => compareText(left.asset.id, right.asset.id)),
});
