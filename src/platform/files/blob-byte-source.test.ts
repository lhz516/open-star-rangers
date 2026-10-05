import { describe, expect, it } from 'vitest';
import { EMPTY_BUDGET_USAGE } from '../../content/budget.ts';
import { openDiscImage } from '../../original-data/disc/disc-image.ts';
import { snapshotSource, SourceReader } from '../../original-data/disc/source-reader.ts';
import { directoryData } from '../../original-data/synthetic.ts';
import { fileRecord, parentRecord, selfRecord, syntheticDisc, volumeSectors } from '../../original-data/disc/disc.test-support.ts';
import { BlobByteSource } from './blob-byte-source.ts';

// These tests run on Node's WHATWG Blob and File. They do not stand in for real browser or Worker reads, which P2-04
// proves end to end.

const CONTENT = Uint8Array.from({ length: 5_000 }, (_, index) => (index * 11) % 256);

/** A Blob that counts `slice` calls and can replace what a slice's `arrayBuffer()` resolves to. */
class ObservedBlob extends Blob {
  slices = 0;
  readonly #arrayBuffer: (() => Promise<ArrayBuffer>) | undefined;

  constructor(bytes: Uint8Array, arrayBuffer?: () => Promise<ArrayBuffer>) {
    super([bytes]);
    this.#arrayBuffer = arrayBuffer;
  }

  override slice(start?: number, end?: number): Blob {
    this.slices++;
    const slice = super.slice(start, end);
    return this.#arrayBuffer ? Object.assign(slice, { arrayBuffer: this.#arrayBuffer }) : slice;
  }
}

describe('Blob byte source', () => {
  it('reads ranges equal to the sliced bytes, as fresh buffers', async () => {
    const blob = new ObservedBlob(CONTENT);
    const source = new BlobByteSource(blob);
    expect(source.byteLength).toBe(5_000);
    for (const [offset, length] of [[0, 1], [100, 2_048], [4_999, 1], [0, 5_000]]) {
      const bytes = await source.read(offset, length);
      expect(bytes).toEqual(CONTENT.subarray(offset, offset + length));
      expect(bytes.byteOffset === 0 && bytes.buffer.byteLength === length).toBe(true);
    }
    expect(blob.slices).toBe(4);
  });

  it.each([
    ['a negative offset', -1, 1],
    ['a fractional offset', 0.5, 1],
    ['an unsafe offset', Number.MAX_SAFE_INTEGER + 1, 1],
    ['a NaN length', 0, Number.NaN],
    ['an empty length', 0, 0],
    ['a fractional length', 0, 1.5],
    ['a range past the end', 4_999, 2],
    ['an offset whose sum is unsafe', Number.MAX_SAFE_INTEGER, 1],
  ])('rejects %s without slicing', async (_case, offset, length) => {
    const blob = new ObservedBlob(CONTENT);
    await expect(new BlobByteSource(blob).read(offset, length)).rejects.toThrow(RangeError);
    expect(blob.slices).toBe(0);
  });

  it.each([
    ['arrayBuffer() rejects', () => Promise.reject(new Error('host read failure'))],
    ['arrayBuffer() returns too few bytes', () => Promise.resolve(new ArrayBuffer(3))],
  ])('fails as read-failed through the disc reader when %s', async (_case, arrayBuffer) => {
    const reader = new SourceReader(Object.freeze({ ...EMPTY_BUDGET_USAGE, sourceReadBytes: 5_000 }));
    const source = snapshotSource(new BlobByteSource(new ObservedBlob(CONTENT, arrayBuffer)), 'image');
    await expect(reader.read(source, 0, 4, 'image')).rejects.toMatchObject({ code: 'read-failed', location: 'image' });
  });

  it('needs no window or document', () => {
    expect(['window' in globalThis, 'document' in globalThis]).toEqual([false, false]);
  });

  it('opens, resolves and reads a synthetic disc image from File objects', async () => {
    const sectors = 24;
    const layout = volumeSectors(sectors);
    layout.set(18, directoryData([selfRecord(18), parentRecord(18), fileRecord('DATA.BIN;1', 20, CONTENT.length)]));
    for (let index = 0; index < 3; index++) layout.set(20 + index, CONTENT.subarray(index * 2_048, (index + 1) * 2_048));
    // Materialize the generated ports as File objects, so only the Blob adapter reads them.
    const generated = syntheticDisc(sectors, layout);
    const [descriptor, image] = await Promise.all([generated.descriptor, generated.image].map(async (port, index) =>
      new File([await port.read(0, port.byteLength)], index === 0 ? 'disc.ccd' : 'DISC.IMG')));
    const disc = await openDiscImage([descriptor, image].map(file => ({ name: file.name, source: new BlobByteSource(file) })));
    expect(disc.volume).toEqual({ sectorCount: sectors, volumeSectors: sectors });
    const file = await disc.openFile('DATA.BIN');
    expect(file.entry.byteLength).toBe(5_000);
    expect(await file.read(2_000, 3_000)).toEqual(CONTENT.subarray(2_000));
  });
});
