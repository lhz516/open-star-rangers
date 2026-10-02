import { describe, expect, it } from 'vitest';
import { entryData, entryRelocations, ImfatError, parseImfat } from './imfat.ts';
import { buildImfat, ByteWriter } from './synthetic.ts';

describe('parseImfat', () => {
  const archive = buildImfat(5000, [
    { id: 5001, type: 'TEX', data: new ByteWriter().u32(8, 0, 0).toBytes(), relocations: [0] },
    { id: 5003, type: 'MODL', flags: 0x10, data: Uint8Array.of(1, 2, 3, 4, 5, 6) },
  ]);

  it('reads the header and directory', () => {
    const parsed = parseImfat(archive);
    expect(parsed.version).toBe(1);
    expect(parsed.idBase).toBe(5000);
    expect(parsed.dataStart).toBe(0x18 + 2 * 36);
    expect(parsed.entries.map((e) => [e.id, e.type, e.flags, e.size, e.relocationCount])).toEqual([
      [5001, 'TEX', 0, 12, 1],
      [5003, 'MODL', 0x10, 6, 0],
    ]);
  });

  it('returns entry data and relocation positions', () => {
    const [tex, modl] = parseImfat(archive).entries;
    expect(Array.from(entryData(archive, modl))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(entryRelocations(archive, tex)).toEqual([0]);
  });

  it('rejects a missing magic', () => {
    const bad = archive.slice();
    bad[0] = 0;
    expect(() => parseImfat(bad)).toThrow(ImfatError);
  });

  it('rejects an entry that extends past the file', () => {
    expect(() => parseImfat(archive.subarray(0, archive.length - 1))).toThrow(/out of bounds/);
  });

  it('rejects a relocation outside its block', () => {
    const bad = buildImfat(1, [{ id: 2, type: 'TEX', data: new Uint8Array(4), relocations: [2] }]);
    const [entry] = parseImfat(bad).entries;
    expect(() => entryRelocations(bad, entry)).toThrow(/outside the block/);
  });
});
