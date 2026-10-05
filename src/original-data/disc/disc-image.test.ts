import { describe, expect, it } from 'vitest';
import { BUDGET_DIMENSIONS } from '../../content/budget.ts';
import { memoryByteSource } from '../synthetic.ts';
import { openDiscImage } from './disc-image.ts';
import { failure, failureOf, MARKER, syntheticDisc, volumeSectors } from './disc.test-support.ts';

const SECTORS = 20;

describe('opening a disc image', () => {
  it('returns a frozen handle with frozen volume facts and a twelve-dimension usage snapshot', async () => {
    const disc = await openDiscImage(syntheticDisc(SECTORS, volumeSectors(SECTORS)).files);
    expect([disc, disc.volume, disc.usage()].every(Object.isFrozen)).toBe(true);
    expect(Object.keys(disc.usage())).toEqual(BUDGET_DIMENSIONS);
  });

  it('rejects with a diagnostic and no handle when the file set is unsupported', async () => {
    expect(await failure(() => openDiscImage([{ name: `${MARKER}.img`, source: memoryByteSource(new Uint8Array(1)) }])))
      .toEqual(failureOf('unsupported-file-set', 'files'));
  });
});
