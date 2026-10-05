import { describe, expect, it } from 'vitest';
import { ARCHIVE_SAMPLES, BASE_ARCHIVE, BASE_ENTRIES, BLOCK_MARKER, type SampleFailure } from './archive/archive.test-support.ts';
import { SourceError } from './source-error.ts';
import { entryData, entryRelocations, parseImfat } from './imfat.ts';

function caught(action: () => unknown): SourceError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(SourceError);
    return error as SourceError;
  }
  throw new Error('expected a SourceError');
}

const diagnostic = ({ code, at, limit }: SampleFailure) => ({ code, location: `archive${at}`, limit });
const data = (error: SourceError) => {
  const { code, location, limit } = error.toData();
  return { code, location, limit };
};

describe('parseImfat and entryRelocations', () => {
  it.each(ARCHIVE_SAMPLES.map(sample => [sample.name, sample] as const))('%s', (_, sample) => {
    if ('failure' in sample.open) {
      expect(data(caught(() => parseImfat(sample.bytes)))).toEqual(diagnostic(sample.open.failure));
      return;
    }
    const archive = parseImfat(sample.bytes);
    expect(archive.entries).toEqual(sample.open.entries);
    for (const read of sample.reads) {
      const entry = archive.entries.find(({ id }) => id === read.id)!;
      if (read.failure) expect(data(caught(() => entryRelocations(sample.bytes, entry)))).toEqual(diagnostic(read.failure));
      else expect(entryRelocations(sample.bytes, entry)).toEqual(read.relocations);
    }
  });

  it('returns the header, frozen entries and block views', () => {
    const archive = parseImfat(BASE_ARCHIVE);
    expect([archive.version, archive.idBase, archive.dataStart]).toEqual([1, 10_000, 24 + BASE_ENTRIES.length * 36]);
    expect(Object.isFrozen(archive) && Object.isFrozen(archive.entries) && archive.entries.every(Object.isFrozen)).toBe(true);
    archive.entries.forEach((entry, index) => expect(entryData(BASE_ARCHIVE, entry)).toEqual(BASE_ENTRIES[index].data));
    expect(Object.isFrozen(entryRelocations(BASE_ARCHIVE, archive.entries[1]))).toBe(true);
  });

  it('rejects an entry parsed from other bytes, even with the same layout', () => {
    const { entries } = parseImfat(BASE_ARCHIVE);
    const [entry] = entries;
    const twin = BASE_ARCHIVE.slice();
    expect(parseImfat(twin).entries).toEqual(entries);
    for (const bytes of [twin, BASE_ARCHIVE.subarray(0, entry.offset + entry.size)]) {
      const rejected = { code: 'invalid-request', location: 'request.entry', limit: null };
      expect(data(caught(() => entryData(bytes, entry)))).toEqual(rejected);
      expect(data(caught(() => entryRelocations(bytes, entry)))).toEqual(rejected);
    }
  });

  it('keeps diagnostics free of bytes and raw type tags', () => {
    const errors = ARCHIVE_SAMPLES.flatMap(sample => {
      if ('failure' in sample.open) return [caught(() => parseImfat(sample.bytes))];
      const { entries } = parseImfat(sample.bytes);
      return sample.reads.filter(read => read.failure)
        .map(read => caught(() => entryRelocations(sample.bytes, entries.find(({ id }) => id === read.id)!)));
    });
    for (const error of errors) {
      const dto = error.toData();
      expect(structuredClone(dto)).toEqual(dto);
      expect(Object.isFrozen(dto)).toBe(true);
      expect(JSON.stringify(dto)).not.toMatch(/PRIV|priv|BLOCK-MARKER/);
      expect(error.message).not.toContain(BLOCK_MARKER);
    }
  });
});
