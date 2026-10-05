import { describe, expect, it } from 'vitest';
import { BUDGET_DIMENSIONS, EMPTY_BUDGET_USAGE } from '../../content/budget.ts';
import { cloneCdSections, cloneCdText, memoryByteSource, SyntheticByteSource } from '../synthetic.ts';
import { RAW_SECTOR_BYTES } from './clone-cd.ts';
import { openDiscImage } from './disc-image.ts';
import { failure, failureOf, MARKER } from './disc.test-support.ts';

const SECTORS = 20;
const DESCRIPTOR = cloneCdText(cloneCdSections(SECTORS));

describe('opening a disc image', () => {
  it('returns a frozen handle with frozen volume facts and a twelve-dimension usage snapshot', async () => {
    const image = new SyntheticByteSource(SECTORS * RAW_SECTOR_BYTES, (_offset, length) => new Uint8Array(length));
    const disc = await openDiscImage([{ name: `${MARKER}.ccd`, source: memoryByteSource(DESCRIPTOR) }, { name: `${MARKER}.img`, source: image }]);
    expect(disc.volume).toEqual({ sectorCount: SECTORS });
    expect([disc, disc.volume, disc.usage()].every(Object.isFrozen)).toBe(true);
    expect(Object.keys(disc.usage())).toEqual(BUDGET_DIMENSIONS);
    expect(disc.usage()).toEqual({ ...EMPTY_BUDGET_USAGE, sourceReadBytes: DESCRIPTOR.length });
    expect(image.requests).toEqual([]);
  });

  it('rejects with a diagnostic and no handle when the file set is unsupported', async () => {
    expect(await failure(() => openDiscImage([{ name: `${MARKER}.img`, source: memoryByteSource(DESCRIPTOR) }])))
      .toEqual(failureOf('unsupported-file-set', 'files'));
  });
});
