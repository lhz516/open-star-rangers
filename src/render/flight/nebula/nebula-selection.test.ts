import { describe, expect, it } from 'vitest';
import { ContentContractError } from '../../../content/contract-validation.ts';
import { readNebulaBackgrounds } from '../../../content/flight/flight-data-readers.ts';
import { syntheticNebulaBackgrounds } from '../../../content/flight/flight-data.test-support.ts';
import { controlledRand } from '../presentation/effects/effects.test-support.ts';
import { PresentationError } from '../presentation/presentation-budget.ts';
import { NEBULA_SLOT_COUNT, selectNebulaImages } from './nebula-selection.ts';

// Synthetic lists only; the production list's length is never assumed.

const list = (count: number) => readNebulaBackgrounds({
  images: Array.from({ length: count }, (_, at) => ({ id: `image/synthetic-nebula/${at}`, kind: 'image' })),
});

const ids = (count: number, ...draws: number[]) => {
  const random = controlledRand(0);
  random.queue(...draws);
  return { ids: selectNebulaImages(list(count), random).map(({ id }) => id.replace('image/synthetic-nebula/', '')), draws: random.used };
};

describe('nebula selection', () => {
  it('takes six consecutive items from a uniformly drawn start, wrapping at the list\'s end, with one draw', () => {
    expect(NEBULA_SLOT_COUNT).toBe(6);
    expect(ids(15, 20)).toEqual({ ids: ['5', '6', '7', '8', '9', '10'], draws: 1 });
    expect(ids(15, 0)).toEqual({ ids: ['0', '1', '2', '3', '4', '5'], draws: 1 });
    expect(ids(15, 14)).toEqual({ ids: ['14', '0', '1', '2', '3', '4'], draws: 1 });
    expect(ids(7, 13)).toEqual({ ids: ['6', '0', '1', '2', '3', '4'], draws: 1 });
  });

  it('wraps short lists more than once and keeps repeated references', () => {
    expect(ids(1, 12345).ids).toEqual(['0', '0', '0', '0', '0', '0']);
    expect(ids(4, 3).ids).toEqual(['3', '0', '1', '2', '3', '0']);
    const random = controlledRand(3);
    const synthetic = selectNebulaImages(readNebulaBackgrounds(syntheticNebulaBackgrounds()), random).map(({ id }) => id);
    expect(synthetic).toEqual(['a', 'b', 'a', 'c', 'a', 'b'].map((name) => `image/synthetic-nebula/${name}`));
  });

  it('gives every start the same number of rand values, drawing again above the largest multiple of the length', () => {
    for (const count of [1, 4, 7, 15, 32]) {
      // One list per length: the selection only reads it, so building and validating it for every value adds nothing.
      const nebula = list(count);
      const accepted = 32768 - (32768 % count);
      const starts = new Array<number>(count).fill(0);
      for (let value = 0; value < accepted; value++) {
        const random = controlledRand(0);
        random.queue(value);
        starts[nebula.images.indexOf(selectNebulaImages(nebula, random)[0])]++;
      }
      expect(new Set(starts)).toEqual(new Set([accepted / count]));
    }
    // 32768 = 2184 · 15 + 8: the values 32760–32767 are drawn again.
    expect(ids(15, 32760, 32767, 4)).toEqual({ ids: ['4', '5', '6', '7', '8', '9'], draws: 3 });
    expect(ids(15, 32759).ids[0]).toBe('14');
  });

  it('rejects an empty list without drawing, and rand values outside 0–32767', () => {
    const random = controlledRand(0);
    expect(() => selectNebulaImages(list(0), random)).toThrow(ContentContractError);
    expect(random.used).toBe(0);
    for (const value of [-1, 32768, 1.5, Number.NaN]) {
      expect(() => ids(15, value)).toThrow(PresentationError);
    }
  });

  it('returns a frozen list of the content\'s own references', () => {
    const nebula = list(3);
    const images = selectNebulaImages(nebula, controlledRand(1));
    expect(Object.isFrozen(images)).toBe(true);
    expect(images[0]).toBe(nebula.images[1]);
    expect(images[2]).toBe(nebula.images[0]);
  });
});
