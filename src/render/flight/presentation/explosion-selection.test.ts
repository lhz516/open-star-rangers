import { describe, expect, it } from 'vitest';
import { ContentContractError } from '../../../content/contract-validation.ts';
import { syntheticExplosionTable } from '../../../content/flight/flight-data.test-support.ts';
import { scriptedRand } from '../../../core/rules/rand.test-support.ts';
import {
  checkPresentationContent, drawExplosionSubset, EXPLOSION_SUBSET_SIZES, FAR_EXPLOSION_SQUARED_DISTANCE, selectExplosion,
  type ExplosionSubset,
} from './explosion-selection.ts';
import { PresentationError } from './presentation-budget.ts';
import { presentationContent, vec } from './presentation.test-support.ts';

const contentError = (action: () => void): ContentContractError => {
  try {
    action();
  } catch (error) {
    if (error instanceof ContentContractError) return error;
    throw error;
  }
  throw new Error('expected a content error');
};

/** The synthetic table with list `at` replaced by `entries` of the given animation numbers. */
function tableWith(at: number, animations: readonly string[]): unknown {
  const table = syntheticExplosionTable();
  table.lists[at] = animations.map((number) => ({ sound: { id: 'sound/synthetic/boom-a', kind: 'sound' }, animation: { id: `data/synthetic-animation/${number}`, kind: 'data' } }));
  return table;
}

describe('presentation content checks', () => {
  it('accepts the synthetic content, an empty list 3, and list 3 frames that differ from lists 1 and 2', () => {
    expect(() => checkPresentationContent(presentationContent())).not.toThrow();
    expect(() => checkPresentationContent(presentationContent({ table: tableWith(2, []) }))).not.toThrow();
    const frames = new Map([['data/synthetic-animation/06', 7]]);
    expect(() => checkPresentationContent(presentationContent({ table: tableWith(2, ['06', '06']), frames }))).not.toThrow();
  });

  it('rejects an empty list 1 or 2 at its path', () => {
    for (const at of [0, 1]) {
      const error = contentError(() => checkPresentationContent(presentationContent({ table: tableWith(at, []) })));
      expect(error.path).toBe(`presentation.content.explosions.lists[${at}]`);
      expect(error.code).toBe('invalid-record');
    }
  });

  it('rejects an entry whose animation is missing', () => {
    const content = presentationContent();
    const animations = new Map(content.animations);
    animations.delete(content.explosions.lists[1][1].animation.id);
    expect(contentError(() => checkPresentationContent({ ...content, animations })).path).toBe('presentation.content.explosions.lists[1][1].animation');
  });

  it('rejects frame counts that differ within lists 1 and 2 together, or within list 3', () => {
    const list2 = new Map([['data/synthetic-animation/05', 4]]);
    expect(contentError(() => checkPresentationContent(presentationContent({ frames: list2 }))).path).toBe('presentation.content.explosions.lists[1][1].animation');
    const list3 = new Map([['data/synthetic-animation/07', 4]]);
    expect(contentError(() => checkPresentationContent(presentationContent({ table: tableWith(2, ['06', '07']), frames: list3 }))).path)
      .toBe('presentation.content.explosions.lists[2][1].animation');
  });

  it('rejects an empty nebula list', () => {
    const content = presentationContent();
    expect(contentError(() => checkPresentationContent({ ...content, nebula: { images: [] } })).path).toBe('presentation.content.nebula.images');
  });
});

describe('EXPL subset', () => {
  it('keeps 5, 5 and 3 original indices from one start per list, in list order, wrapping and keeping repeats', () => {
    // Lists of 3, 2 and 1 entries: starts 4 % 3 = 1, 1 % 2 = 1 and 7 % 1 = 0.
    const random = scriptedRand([4, 1, 7]);
    const subset = drawExplosionSubset(presentationContent().explosions, random);
    expect(subset).toEqual([[1, 2, 0, 1, 2], [1, 0, 1, 0, 1], [0, 0, 0]]);
    expect(random.used).toBe(3);
    expect(subset.map((list) => list.length)).toEqual(EXPLOSION_SUBSET_SIZES);
    expect(Object.isFrozen(subset) && subset.every(Object.isFrozen)).toBe(true);
  });

  it('starts anywhere in a list of 7, the shipped length, and keeps 5 distinct entries', () => {
    const table = presentationContent({ table: tableWith(0, ['01', '02', '03', '01', '02', '03', '01']) }).explosions;
    expect(drawExplosionSubset(table, scriptedRand([6, 0, 0]))[0]).toEqual([6, 0, 1, 2, 3]);
    // 32767 = 7 × 4681.
    expect(drawExplosionSubset(table, scriptedRand([32767, 0, 0]))[0]).toEqual([0, 1, 2, 3, 4]);
  });

  it('draws nothing for an empty list 3', () => {
    const random = scriptedRand([0, 0]);
    expect(drawExplosionSubset(presentationContent({ table: tableWith(2, []) }).explosions, random)[2]).toEqual([]);
    expect(random.used).toBe(2);
  });

  it('rejects a random source outside the original rand range', () => {
    for (const value of [-1, 32768, 0.5, Number.NaN]) {
      expect(() => drawExplosionSubset(presentationContent().explosions, scriptedRand([value]))).toThrow(PresentationError);
    }
  });
});

describe('explosion choice', () => {
  const subset: ExplosionSubset = [[1, 2, 0, 1, 2], [1, 0, 1, 0, 1], [0, 0, 0]];
  const camera = vec(1000, -20, 5);

  it('takes list 1 for large and list 3 for missile explosions, at any distance', () => {
    expect(selectExplosion(subset, 'large', vec(1e6), camera, scriptedRand([7]))).toEqual({ list: 1, item: subset[0][7 % 5] });
    expect(selectExplosion(subset, 'missile', camera, camera, scriptedRand([4]))).toEqual({ list: 3, item: 0 });
  });

  it('takes list 2 for other explosions at 400 or farther from the camera, and list 1 nearer', () => {
    expect(FAR_EXPLOSION_SQUARED_DISTANCE).toBe(400 ** 2);
    // At exactly 400 along x from the camera: 400 × f32(400) = 160000.
    expect(selectExplosion(subset, 'other', vec(1400, -20, 5), camera, scriptedRand([1]))).toEqual({ list: 2, item: 0 });
    expect(selectExplosion(subset, 'other', vec(1000, 380, 5), camera, scriptedRand([0]))).toEqual({ list: 2, item: 1 });
    // Just inside: the item indexes list 1 in the original list, not the subset.
    const near = Math.fround(1399.9999);
    expect(near).toBeLessThan(1400);
    expect(selectExplosion(subset, 'other', vec(near, -20, 5), camera, scriptedRand([2]))).toEqual({ list: 1, item: 0 });
    // Measured from the camera, not the origin.
    expect(selectExplosion(subset, 'other', vec(0, 0, 0), vec(0, 0, 399), scriptedRand([0]))).toEqual({ list: 1, item: 1 });
  });

  it('draws exactly one rand value', () => {
    const random = scriptedRand([3]);
    selectExplosion(subset, 'other', vec(0), camera, random);
    expect(random.used).toBe(1);
  });

  it('rejects a missile explosion when list 3 is empty', () => {
    const empty: ExplosionSubset = [subset[0], subset[1], []];
    expect(() => selectExplosion(empty, 'missile', camera, camera, scriptedRand([0]))).toThrow(expect.objectContaining({ kind: 'invariant-violated' }));
  });
});
