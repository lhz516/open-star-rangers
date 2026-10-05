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

/** One `[section]` of a CloneCD descriptor with its `key=value` lines in order; tests mutate these to build cases. */
export interface CloneCdSection {
  name: string;
  keys: [key: string, value: string][];
}

function tocEntry(index: number, point: string, frames: number): CloneCdSection {
  const [min, sec, frame] = [Math.floor(frames / 4_500), Math.floor(frames / 75) % 60, frames % 75];
  return {
    name: `Entry ${index}`,
    keys: [
      ['Session', '1'], ['Point', point], ['ADR', '0x01'], ['Control', '0x04'], ['TrackNo', '0'], ['AMin', '0'], ['ASec', '0'],
      ['AFrame', '0'], ['ALBA', '-150'], ['Zero', '0'], ['PMin', String(min)], ['PSec', String(sec)], ['PFrame', String(frame)],
      ['PLBA', String(frames - 150)],
    ],
  };
}

/**
 * Descriptor sections shaped like the base disc's: one session whose TOC holds the first-track (0xa0), last-track
 * (0xa1) and lead-out (0xa2) points and one MODE1 data track starting at LBA 0, for an image of `sectorCount` sectors.
 * The lead-in PMin values name track 1, so their PLBA is not an address.
 */
export function cloneCdSections(sectorCount: number): CloneCdSection[] {
  return [
    { name: 'CloneCD', keys: [['Version', '3']] },
    { name: 'Disc', keys: [['TocEntries', '4'], ['Sessions', '1'], ['DataTracksScrambled', '0'], ['CDTextLength', '0']] },
    { name: 'Session 1', keys: [['PreGapMode', '1'], ['PreGapSubC', '0']] },
    tocEntry(0, '0xa0', 4_500),
    tocEntry(1, '0xa1', 4_500),
    tocEntry(2, '0xa2', sectorCount + 150),
    tocEntry(3, '0x01', 150),
    { name: 'TRACK 1', keys: [['MODE', '1'], ['INDEX 1', '0']] },
  ];
}

/** Writes descriptor sections as ASCII text, each line ended with `lineEnd`. */
export function cloneCdText(sections: readonly CloneCdSection[], lineEnd = '\r\n'): Uint8Array {
  const lines = sections.flatMap(({ name, keys }) => [`[${name}]`, ...keys.map(([key, value]) => `${key}=${value}`)]);
  const text = lines.map(line => line + lineEnd).join('');
  return new ByteWriter().ascii(text, text.length).toBytes();
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

  u16be(...values: number[]): this {
    for (const v of values) this.bytes.push((v >>> 8) & 0xff, v & 0xff);
    return this;
  }

  u32be(...values: number[]): this {
    for (const v of values) this.bytes.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
    return this;
  }

  /** ISO9660 both-byte-order 16-bit fields: little-endian, then big-endian. */
  both16(...values: number[]): this {
    for (const v of values) this.u16(v).u16be(v);
    return this;
  }

  /** ISO9660 both-byte-order 32-bit fields: little-endian, then big-endian. */
  both32(...values: number[]): this {
    for (const v of values) this.u32(v).u32be(v);
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

export interface SyntheticSndFields {
  /** Raw sample bytes after the header. */
  samples: ArrayLike<number>;
  sampleRate?: number;
  bitsPerSample?: number;
  flags?: number;
  /** The stored sample pointer; defaults to 20, just past the header. */
  sampleOffset?: number;
  /** The declared sample length; defaults to the actual one. */
  sampleBytes?: number;
}

/** A code-generated SND data block and its one relocated sample pointer at offset 0, to spread into a `SyntheticEntry`. */
export function syntheticSnd(fields: SyntheticSndFields): { data: Uint8Array; relocations: number[] } {
  const { samples, sampleRate = 11_025, bitsPerSample = 8, flags = 0, sampleOffset = 20, sampleBytes = samples.length } = fields;
  const data = new Uint8Array(20 + samples.length);
  const view = new DataView(data.buffer);
  [sampleOffset, sampleBytes, sampleRate, bitsPerSample, flags].forEach((value, index) => view.setUint32(index * 4, value, true));
  data.set(samples, 20);
  return { data, relocations: [0] };
}

/** A 36-byte image record followed (at the given offsets) by nothing else; callers append data. */
export function imageRecord(
  w: ByteWriter,
  fields: { encoding: number; width: number; height: number; paletteOffset: number; paletteCount: number; pixelOffset: number; size: number },
): ByteWriter {
  return w.u32(8, fields.encoding, fields.width, fields.height, 0, fields.paletteOffset, fields.paletteCount, fields.pixelOffset, fields.size);
}

// Raw 2,352-byte MODE1 sectors and ISO9660 structures (ECMA-119), generated on demand.

export const SYNTHETIC_RAW_SECTOR_BYTES = 2_352;
export const SYNTHETIC_SECTOR_DATA_BYTES = 2_048;
const bcd = (value: number): number => (Math.floor(value / 10) << 4) | (value % 10);

/** Writes a MODE1 raw sector for `lba` into zeroed bytes at `start`: sync, BCD MSF of LBA + 150, mode 1, user data. */
function writeRawSector(target: Uint8Array, start: number, lba: number, userData: Uint8Array | undefined): void {
  target.fill(0xff, start + 1, start + 11);
  const frames = lba + 150;
  target[start + 12] = bcd(Math.floor(frames / 4_500));
  target[start + 13] = bcd(Math.floor(frames / 75) % 60);
  target[start + 14] = bcd(frames % 75);
  target[start + 15] = 1;
  if (userData) target.set(userData.length > SYNTHETIC_SECTOR_DATA_BYTES ? userData.subarray(0, SYNTHETIC_SECTOR_DATA_BYTES) : userData, start + 16);
}

/** A MODE1 raw sector for `lba` with the given user data and zeroed EDC/ECC. */
export function rawSector(lba: number, userData?: Uint8Array): Uint8Array {
  const raw = new Uint8Array(SYNTHETIC_RAW_SECTOR_BYTES);
  writeRawSector(raw, 0, lba, userData);
  return raw;
}

/**
 * An image port of `sectorCount` raw sectors that builds only the sectors a read covers, so a full-size image is never
 * allocated. `userData` supplies a sector's user data (zeros when undefined); `edit` may corrupt the raw sector.
 */
export function sectorImageSource(
  sectorCount: number,
  userData: (lba: number) => Uint8Array | undefined,
  edit?: (lba: number, raw: Uint8Array) => void,
): SyntheticByteSource {
  return new SyntheticByteSource(sectorCount * SYNTHETIC_RAW_SECTOR_BYTES, (offset, length) => {
    const bytes = new Uint8Array(length);
    const end = offset + length;
    let lba = Math.floor(offset / SYNTHETIC_RAW_SECTOR_BYTES);
    for (let start = lba * SYNTHETIC_RAW_SECTOR_BYTES; start < end; lba++, start += SYNTHETIC_RAW_SECTOR_BYTES) {
      if (!edit && start >= offset && start + SYNTHETIC_RAW_SECTOR_BYTES <= end) {
        writeRawSector(bytes, start - offset, lba, userData(lba));
        continue;
      }
      // A sector cut by the request or edited by the test is built whole first.
      const raw = rawSector(lba, userData(lba));
      edit?.(lba, raw);
      const from = Math.max(offset, start);
      bytes.set(raw.subarray(from - start, Math.min(end, start + SYNTHETIC_RAW_SECTOR_BYTES) - start), from - offset);
    }
    return bytes;
  });
}

export const ISO_DIRECTORY_FLAG = 0x02;

export interface DirectoryRecordFields {
  extent: number;
  dataLength: number;
  /** A file identifier as text, or raw identifier bytes such as 0x00 for `.` and 0x01 for `..`. */
  name: string | Uint8Array;
  flags?: number;
  extendedAttributeLength?: number;
  fileUnitSize?: number;
  interleaveGap?: number;
  volumeSequenceNumber?: number;
  /** System Use bytes after the identifier; an even count keeps the record length even. */
  systemUse?: Uint8Array;
}

/** An ISO9660 directory record with consistent both-byte-order fields. */
export function directoryRecord(fields: DirectoryRecordFields): Uint8Array {
  const name = typeof fields.name === 'string' ? new ByteWriter().ascii(fields.name, fields.name.length).toBytes() : fields.name;
  const padding = name.length % 2 === 0 ? 1 : 0;
  const systemUse = fields.systemUse ?? new Uint8Array();
  return new ByteWriter()
    .u8(33 + name.length + padding + systemUse.length, fields.extendedAttributeLength ?? 0)
    .both32(fields.extent, fields.dataLength)
    .u8(95, 1, 1, 0, 0, 0, 0)
    .u8(fields.flags ?? 0, fields.fileUnitSize ?? 0, fields.interleaveGap ?? 0)
    .both16(fields.volumeSequenceNumber ?? 1)
    .u8(name.length)
    .raw(name)
    .raw(new Uint8Array(padding))
    .raw(systemUse)
    .toBytes();
}

/** A volume descriptor of `type` with the standard identifier and version and an otherwise zero body. */
export function volumeDescriptor(type: number): Uint8Array {
  const descriptor = new Uint8Array(SYNTHETIC_SECTOR_DATA_BYTES);
  descriptor[0] = type;
  descriptor.set(new ByteWriter().ascii('CD001', 5).u8(1).toBytes(), 1);
  return descriptor;
}

/** A primary volume descriptor for one volume of `volumeSectors` 2,048-byte blocks with the given root directory record. */
export function primaryVolumeDescriptor(volumeSectors: number, root: Uint8Array): Uint8Array {
  const descriptor = volumeDescriptor(1);
  descriptor.set(new ByteWriter().both32(volumeSectors).toBytes(), 80);
  descriptor.set(new ByteWriter().both16(1, 1, SYNTHETIC_SECTOR_DATA_BYTES).both32(10).toBytes(), 120);
  descriptor.set(root, 156);
  descriptor[881] = 1;
  return descriptor;
}

/**
 * Packs directory records into whole 2,048-byte sectors, at least `byteLength` bytes: a record that does not fit the
 * rest of a sector starts the next one, leaving zero padding behind.
 */
export function directoryData(records: readonly Uint8Array[], byteLength = SYNTHETIC_SECTOR_DATA_BYTES): Uint8Array {
  const chunks: { record: Uint8Array; offset: number }[] = [];
  let offset = 0;
  for (const record of records) {
    const room = SYNTHETIC_SECTOR_DATA_BYTES - (offset % SYNTHETIC_SECTOR_DATA_BYTES);
    if (record.length > room) offset += room;
    chunks.push({ record, offset });
    offset += record.length;
  }
  const data = new Uint8Array(Math.max(byteLength, Math.ceil(offset / SYNTHETIC_SECTOR_DATA_BYTES) * SYNTHETIC_SECTOR_DATA_BYTES));
  for (const { record, offset: at } of chunks) data.set(record, at);
  return data;
}
