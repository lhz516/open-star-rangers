import { describe, expect, it } from 'vitest';
import {
  EFFECT_LIMITS, effectPayloadLength, MISSILE_CONSTANTS, type EffectPayload, type MissileType,
} from '../../content/effects/effect-payload.ts';
import { effectExpansionSize } from '../../content/effects/expand-effects.ts';
import { executableRegion, isRegionLocator, REGION_LIMITS } from '../source-mapping.ts';
import { EFFECT_REGION_USES } from './effect-declarations.ts';
import {
  EFFECT_EXECUTABLE, PRODUCTION_EFFECT_DECLARATIONS, PRODUCTION_EFFECT_MAPPINGS, PRODUCTION_EFFECT_PAYLOAD_BOUND, PRODUCTION_EFFECT_REGIONS,
} from './production-effects.ts';
import { syntheticDebrisSource, syntheticMissileSource, syntheticProjectileSource } from './production-effects.test-support.ts';

// P2-06 AC-20 (production inputs): the declared regions, and the payload and expansion bounds at the structural limits.

describe('production effect inputs', () => {
  it('declares the three effect data Assets with their roles, textures and every region use once', () => {
    expect(PRODUCTION_EFFECT_DECLARATIONS.map(({ asset, role, texture }) => [asset.id, role, texture])).toEqual([
      ['data/projectile-visuals', 'projectile', null],
      ['data/missile-visuals', 'missile', 'image/missile'],
      ['data/debris-visuals', 'debris', 'image/model-texture/16'],
    ]);
    for (const { asset, role, regions } of PRODUCTION_EFFECT_DECLARATIONS) {
      expect(new Set(regions)).toEqual(new Set(EFFECT_REGION_USES[role].keys()));
      expect(regions).toEqual(PRODUCTION_EFFECT_REGIONS.get(asset.id)!.map(({ use }) => use));
    }
  });

  it('maps each Asset to its regions in locator order, likely with U-027, and only the projectile to the RENS entry', () => {
    expect(PRODUCTION_EFFECT_MAPPINGS.mappings.map(({ asset, confidence, unknowns, resolution, parts }) =>
      [asset.id, confidence, unknowns, resolution, parts.filter(({ alternatives }) => !isRegionLocator(alternatives[0])).length]))
      .toEqual([
        ['data/debris-visuals', 'likely', ['U-027'], 'declared', 0],
        ['data/missile-visuals', 'likely', ['U-027'], 'declared', 0],
        ['data/projectile-visuals', 'likely', ['U-027'], 'declared', 1],
      ]);
    for (const { asset, parts } of PRODUCTION_EFFECT_MAPPINGS.mappings) {
      const regions = parts.flatMap(({ alternatives: [locator] }) => (isRegionLocator(locator) ? [{ discPath: locator.discPath, ...executableRegion(locator) }] : []));
      expect(regions).toEqual(PRODUCTION_EFFECT_REGIONS.get(asset.id)!.map(({ object, offset, length }) => ({ discPath: EFFECT_EXECUTABLE, object, offset, length })));
    }
  });

  it('reads exactly the documented regions, with the width of each immediate operand', () => {
    // Written independently from executable.md (effect geometry data, builder arguments): template, table and constant
    // addresses, and each immediate's address within its instruction, as [use, address, length].
    type Row = readonly [use: string, address: number, length: number];
    const projectileMarkers = (template: number, shift: number): Row[] => [
      ...[0x3_f7bf, 0x3_f7c7, 0x3_f7e6, 0x3_f7ee, 0x3_f80d, 0x3_f815].map((address, marker): Row => [`template-${template}-width-marker-${marker}`, address + shift, 4]),
      [`template-${template}-length-marker`, 0x3_f832 + shift, 4],
    ];
    const expected: Record<string, readonly Row[]> = {
      'data/projectile-visuals': [
        ['template-0-vertices', 0x3_f670, 48], ['template-0-faces', 0x3_f6a0, 68], ['template-1-vertices', 0x3_f6e4, 48], ['template-1-faces', 0x3_f714, 68],
        ['template-0-length-constant', 0x17_18f4, 8], ['template-1-length-constant', 0x17_18fc, 8],
        ...projectileMarkers(0, 0), ...projectileMarkers(1, 0x16c),
      ],
      'data/missile-visuals': [
        ['types', 0x17_54a0, 1_116], ['type-count', 0x17_58fc, 4], ['fin-faces', 0x4_4270, 196], ['element-faces', 0x4_4334, 64],
        ['flagged-element-faces', 0x4_4374, 124], ['extra-faces', 0x4_43f0, 20], ['constants', 0x17_1ac8, 56],
        ['rotation-scale-high', 0x4_44b6, 4], ['rotation-scale-low', 0x4_44bb, 1],
        ['extra-colour-0', 0x4_4cbc, 4], ['extra-colour-1', 0x4_4cb5, 4], ['extra-colour-2', 0x4_4cb3, 1],
      ],
      'data/debris-visuals': [
        ['untextured-vertices', 0x3_e2a0, 72], ['untextured-per-vertex', 0x3_e2e8, 72], ['untextured-faces', 0x3_e330, 56],
        ['textured-vertices', 0x3_e368, 72], ['textured-per-vertex', 0x3_e3b0, 72], ['textured-faces', 0x3_e3f8, 56],
        ['untextured-scale-0', 0x3_e463, 4], ['untextured-scale-1', 0x3_e46d, 4], ['untextured-scale-2', 0x3_e47c, 4],
        ['textured-scale-0', 0x3_e48b, 4], ['textured-scale-1', 0x3_e49a, 4],
        ['untextured-colour-0', 0x3_ea86, 4], ['untextured-colour-1', 0x3_ea82, 1], ['untextured-colour-2', 0x3_ea80, 1],
        ['textured-colour-0', 0x3_eb72, 4], ['textured-colour-1', 0x3_eb6b, 4], ['textured-colour-2', 0x3_eb66, 4],
      ],
    };
    // Object 2 is the code object at 0x20000, object 4 the data object at 0x170000.
    const located = ([use, address, length]: Row) =>
      ({ use, object: address >= 0x17_0000 ? 4 : 2, offset: address - (address >= 0x17_0000 ? 0x17_0000 : 0x2_0000), length });
    for (const [id, rows] of Object.entries(expected)) {
      const byUse = (regions: readonly { use: string }[]) => [...regions].sort((left, right) => (left.use < right.use ? -1 : 1));
      expect(byUse(PRODUCTION_EFFECT_REGIONS.get(id)!)).toEqual(byUse(rows.map(located)));
    }
  });

  it('places the regions in the code and data objects without overlaps', () => {
    const all = [...PRODUCTION_EFFECT_REGIONS.values()].flat().sort((left, right) => left.object - right.object || left.offset - right.offset);
    expect(new Set(all.map(({ object }) => object))).toEqual(new Set([2, 4]));
    all.forEach((region, index) => {
      expect(region.length).toBeLessThanOrEqual(REGION_LIMITS.bytes);
      const next = all[index + 1];
      if (next?.object === region.object) expect(region.offset + region.length).toBeLessThanOrEqual(next.offset);
    });
    // The first debris template starts 0x3e2a0 − 0x20000 into object 2 (executable, effect geometry data).
    expect(PRODUCTION_EFFECT_REGIONS.get('data/debris-visuals')![0]).toEqual({ use: 'untextured-vertices', object: 2, offset: 0x1_e2a0, length: 72 });
  });

  /** The largest payloads the production regions and the structural limits allow. */
  function largest(): EffectPayload[] {
    const projectile = syntheticProjectileSource();
    const missile = syntheticMissileSource();
    const type: MissileType = {
      parts: EFFECT_LIMITS.missileParts,
      body: { ...missile.types[0].body, segments: EFFECT_LIMITS.ringSegments },
      fins: Array(EFFECT_LIMITS.missileParts - 1).fill(missile.types[1].fins[0]),
      element: missile.types[0].element,
      flag: 1,
    };
    return [
      { ...projectile, records: Array(EFFECT_LIMITS.effectRecords).fill(projectile.records[0]) },
      { ...missile, types: Array(EFFECT_LIMITS.missileTypes).fill(type), constants: Object.fromEntries(MISSILE_CONSTANTS.map(name => [name, 0])) as typeof missile.constants },
      syntheticDebrisSource(),
    ];
  }

  it('bounds the three payloads within 16 KiB at the structural limits', () => {
    const total = largest().reduce((sum, payload) => sum + effectPayloadLength(payload), 0);
    expect(PRODUCTION_EFFECT_PAYLOAD_BOUND).toBe(16_384);
    expect(total).toBeLessThanOrEqual(PRODUCTION_EFFECT_PAYLOAD_BOUND);
  });

  it('expands to at most 5,534 vertices at the structural limits', () => {
    // 64 × 4 projectile vertices, 32 × (2 × 64 + 3 × 9 + 6 + 3) missile vertices and 5 × 6 debris vertices.
    expect(largest().reduce((sum, payload) => sum + effectExpansionSize(payload).vertices, 0)).toBe(64 * 4 + 32 * (2 * 64 + 3 * 9 + 6 + 3) + 5 * 6);
  });
});
