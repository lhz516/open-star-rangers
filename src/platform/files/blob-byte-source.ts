import type { ByteSource } from '../../original-data/io/byte-source.ts';

// Browser byte port (P2-02 S-08): a `File` or any other `Blob`, read on demand with `slice` and `arrayBuffer`. It uses
// only the Blob API, so it works in pages and Workers alike, and a `File` can be handed to a Worker unchanged.

const isCount = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;

/**
 * Reads a Blob on demand. Requests outside the Blob are rejected before slicing, never truncated by `slice`. A Blob
 * read cannot be aborted; the disc reader instead stops issuing reads and discards late results once cancelled.
 */
export class BlobByteSource implements ByteSource {
  readonly byteLength: number;
  readonly #blob: Blob;

  constructor(blob: Blob) {
    this.#blob = blob;
    this.byteLength = blob.size;
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    // Subtraction keeps the bound exact where offset + length would not be a safe integer.
    if (!isCount(offset) || !isCount(length) || length === 0 || offset > this.byteLength - length) {
      throw new RangeError('A Blob read must be a nonempty range inside the Blob');
    }
    return new Uint8Array(await this.#blob.slice(offset, offset + length).arrayBuffer());
  }
}
