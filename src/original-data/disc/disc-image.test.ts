import { describe, expect, it } from 'vitest';
import { BUDGET_DIMENSIONS, EMPTY_BUDGET_USAGE } from '../../content/budget.ts';
import { directoryData, memoryByteSource } from '../synthetic.ts';
import { openDiscImage } from './disc-image.ts';
import {
  failure, failureOf, fileRecord, MARKER, parentRecord, rejection, selfRecord, syntheticDisc, volumeSectors,
} from './disc.test-support.ts';

const SECTORS = 20;

describe('opening a disc image', () => {
  it('returns a frozen handle with frozen volume facts and a twelve-dimension usage snapshot', async () => {
    const disc = await openDiscImage(syntheticDisc(SECTORS, volumeSectors(SECTORS)).files);
    expect([disc, disc.volume, disc.usage()].every(Object.isFrozen)).toBe(true);
    expect(Object.keys(disc.usage())).toEqual(BUDGET_DIMENSIONS);
  });

  it('reports the same first error for the same input and initial state at every layer', async () => {
    // The root at 18 holds BAD.DAT at sector 19, whose raw header is corrupted.
    const sectors = volumeSectors(SECTORS);
    sectors.set(18, directoryData([selfRecord(18), parentRecord(18), fileRecord('BAD.DAT;1', 19, 100)]));
    const corrupt = (lba: number, raw: Uint8Array): void => { if (lba === 19) raw[15] = 2; };
    // The same initial budget each time, below the input total.
    const limits = { ...EMPTY_BUDGET_USAGE, sourceReadBytes: 40_000 };
    const twice = async (attempt: () => Promise<unknown>) => {
      const [first, second] = [await rejection(attempt), await rejection(attempt)];
      expect(second.toData()).toEqual(first.toData());
      return first.toData().code;
    };
    // Opening: fresh, identical inputs whose volume descriptor sector is empty.
    expect(await twice(() => openDiscImage(syntheticDisc(SECTORS, new Map(), corrupt).files, { limits }))).toBe('invalid-volume');
    // Lookup and read: fresh handles over the same input, and repeated calls on one handle.
    const fresh = () => openDiscImage(syntheticDisc(SECTORS, sectors, corrupt).files, { limits });
    expect(await twice(async () => (await fresh()).lookup('MISSING.DAT'))).toBe('path-not-found');
    expect(await twice(async () => (await (await fresh()).openFile('BAD.DAT')).read(0, 100))).toBe('invalid-sector');
    const disc = await fresh();
    expect(await twice(() => disc.lookup('MISSING.DAT'))).toBe('path-not-found');
    const bad = await disc.openFile('BAD.DAT');
    expect(await twice(() => bad.read(0, 100))).toBe('invalid-sector');
  });

  it('rejects with a diagnostic and no handle when the file set is unsupported', async () => {
    expect(await failure(() => openDiscImage([{ name: `${MARKER}.img`, source: memoryByteSource(new Uint8Array(1)) }])))
      .toEqual(failureOf('unsupported-file-set', 'files'));
  });
});
