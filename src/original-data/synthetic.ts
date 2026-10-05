// Builders for synthetic test data in the original formats. Test-only; never reads original files.

import type { ByteSource } from './io/byte-source.ts';

export interface SourceRequest {
  readonly offset: number;
  readonly length: number;
}

/**
 * A byte port double that records every request in order and answers with `respond`, which may return bytes, any other
 * value or a promise, or throw. This models in-memory, generated, slow and contract-breaking ports.
 */
export class SyntheticByteSource implements ByteSource {
  readonly byteLength: number;
  readonly requests: SourceRequest[] = [];
  readonly #respond: (offset: number, length: number) => unknown;

  constructor(byteLength: number, respond: (offset: number, length: number) => unknown) {
    this.byteLength = byteLength;
    this.#respond = respond;
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    this.requests.push(Object.freeze({ offset, length }));
    return this.#respond(offset, length) as Uint8Array;
  }
}

/** A port over in-memory bytes; each read returns a fresh copy. */
export function memoryByteSource(bytes: Uint8Array): SyntheticByteSource {
  return new SyntheticByteSource(bytes.length, (offset, length) => bytes.slice(offset, offset + length));
}

export interface PendingRead extends SourceRequest {
  resolve(value: unknown): void;
  reject(reason: unknown): void;
}

/** A port whose reads stay pending until the test settles them, to replay overlapping reads and cancellation mid-wait. */
export function deferredByteSource(byteLength: number): { source: SyntheticByteSource; pending: PendingRead[] } {
  const pending: PendingRead[] = [];
  const source = new SyntheticByteSource(byteLength, (offset, length) => new Promise((resolve, reject) => {
    pending.push({ offset, length, resolve, reject });
  }));
  return { source, pending };
}

export class ByteWriter {
  private bytes: number[] = [];

  get length(): number {
    return this.bytes.length;
  }

  u8(...values: number[]): this {
    for (const v of values) this.bytes.push(v & 0xff);
    return this;
  }

  u16(...values: number[]): this {
    for (const v of values) this.bytes.push(v & 0xff, (v >>> 8) & 0xff);
    return this;
  }

  u32(...values: number[]): this {
    for (const v of values) this.bytes.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
    return this;
  }

  f32(...values: number[]): this {
    const view = new DataView(new ArrayBuffer(4));
    for (const v of values) {
      view.setFloat32(0, v, true);
      this.u8(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    }
    return this;
  }

  raw(data: ArrayLike<number>): this {
    for (let i = 0; i < data.length; i++) this.bytes.push(data[i] & 0xff);
    return this;
  }

  ascii(text: string, size: number): this {
    for (let i = 0; i < size; i++) this.bytes.push(i < text.length ? text.charCodeAt(i) : 0);
    return this;
  }

  toBytes(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

export interface SyntheticEntry {
  id: number;
  type: string;
  flags?: number;
  data: Uint8Array;
  relocations?: number[];
}

/** Builds an IMFAT archive: header, 36-byte directory, then each block followed by its relocation table. */
export function buildImfat(idBase: number, entries: SyntheticEntry[]): Uint8Array {
  const dataStart = 0x18 + entries.length * 36;
  const w = new ByteWriter().ascii('IMFAT', 8).u32(1, entries.length, idBase, dataStart);
  let offset = dataStart;
  for (const e of entries) {
    const relocations = e.relocations ?? [];
    w.u32(e.flags ?? 0, e.id).ascii(e.type, 4).u32(relocations.length, offset, e.data.length, 0, 0, 0);
    offset += e.data.length + relocations.length * 4;
  }
  for (const e of entries) {
    w.raw(e.data);
    for (const r of e.relocations ?? []) w.u32(r);
  }
  return w.toBytes();
}

/** A 36-byte image record followed (at the given offsets) by nothing else; callers append data. */
export function imageRecord(
  w: ByteWriter,
  fields: { encoding: number; width: number; height: number; paletteOffset: number; paletteCount: number; pixelOffset: number; size: number },
): ByteWriter {
  return w.u32(8, fields.encoding, fields.width, fields.height, 0, fields.paletteOffset, fields.paletteCount, fields.pixelOffset, fields.size);
}
