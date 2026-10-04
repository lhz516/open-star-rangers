import { describe, expect, it } from 'vitest';
import { ASSET_KINDS, readAssetId } from './asset-id.ts';
import { ASSET_UNITS, INTERNAL_ASSET_ELEMENTS } from './asset-units.ts';

describe('canonical resource unit policy', () => {
  it('has exactly one unit per closed kind, not per source container or entry', () => {
    expect(Object.keys(ASSET_UNITS)).toEqual([...ASSET_KINDS]);
    expect(Object.keys(INTERNAL_ASSET_ELEMENTS)).toEqual([...ASSET_KINDS]);
    expect(ASSET_UNITS).toEqual({
      mission: 'whole-mission',
      model: 'model-with-internal-geometry',
      image: 'independent-image',
      palette: 'independently-reused-palette',
      font: 'font-library',
      layout: 'consumer-layout',
      sound: 'independent-sample-clip',
      data: 'independently-reused-logic-data',
    });
    expect(INTERNAL_ASSET_ELEMENTS.model).toContain('mesh-geometry');
    expect(INTERNAL_ASSET_ELEMENTS.font).toContain('glyphs');
    expect(INTERNAL_ASSET_ELEMENTS.sound).toContain('sample-points');
    expect(INTERNAL_ASSET_ELEMENTS.palette).toContain('palette-entries');
    expect('mesh' in ASSET_UNITS).toBe(false);
    expect(() => readAssetId('mesh/synthetic-geometry')).toThrowError();
  });

  it('keeps the policy and its nested containers readonly and independently cloneable', () => {
    expect(Object.isFrozen(ASSET_UNITS)).toBe(true);
    expect(Object.isFrozen(INTERNAL_ASSET_ELEMENTS)).toBe(true);
    for (const elements of Object.values(INTERNAL_ASSET_ELEMENTS)) {
      expect(Object.isFrozen(elements)).toBe(true);
      expect(Reflect.set(elements, '0', 'changed')).toBe(false);
    }
    expect(Reflect.set(ASSET_UNITS, 'model', 'mesh')).toBe(false);
    const clone = structuredClone(INTERNAL_ASSET_ELEMENTS);
    Reflect.set(clone.model, '0', 'changed');
    expect(INTERNAL_ASSET_ELEMENTS.model[0]).toBe('mesh-geometry');
    expect(structuredClone(ASSET_UNITS)).toEqual(ASSET_UNITS);
  });
});
