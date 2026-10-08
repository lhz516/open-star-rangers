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

export interface SyntheticMeshFields {
  /** x, y, z per vertex. */
  positions: ArrayLike<number>;
  /** u, v per vertex, as a geometry holds them; the block stores every u value, then every v value. */
  uvs: ArrayLike<number>;
  /** x, y, z per vertex. */
  normals: ArrayLike<number>;
  shadingSlotCount: number;
  /** Each face's corners as [vertex index, shading slot]; each face's stored corner count is its length. */
  faces: readonly (readonly (readonly [number, number])[])[];
  /** Stored fields that default to the consistent values. */
  structurePointer?: number;
  structureLength?: number;
  reserved?: number;
  trailer?: number;
}

/** A code-generated MESH data block and its relocated structure pointer at offset 0, to spread into a `SyntheticEntry`. */
export function syntheticMesh(fields: SyntheticMeshFields): { data: Uint8Array; relocations: number[] } {
  const { positions, uvs, normals, shadingSlotCount, faces, structurePointer = 12, reserved = 0, trailer = 0 } = fields;
  const length = 28 + (positions.length + uvs.length + normals.length) * 4 + faces.reduce((sum, corners) => sum + 4 + corners.length * 8, 0);
  const data = new Uint8Array(length);
  const view = new DataView(data.buffer);
  let at = 0;
  const u32 = (...values: number[]): void => {
    for (const value of values) view.setUint32((at += 4) - 4, value, true);
  };
  const f32 = (values: ArrayLike<number>): void => {
    for (let index = 0; index < values.length; index++) view.setFloat32((at += 4) - 4, values[index], true);
  };
  const vertices = positions.length / 3;
  if (uvs.length !== vertices * 2) throw new RangeError('a synthetic mesh needs two UV values per vertex');
  u32(structurePointer, fields.structureLength ?? length - 12, reserved, vertices);
  f32(positions);
  for (const component of [0, 1]) f32(Array.from({ length: vertices }, (_, vertex) => uvs[vertex * 2 + component]));
  u32(shadingSlotCount);
  f32(normals);
  u32(faces.length);
  for (const corners of faces) u32(corners.length, ...corners.flat());
  u32(trailer);
  return { data, relocations: [0] };
}

export interface SyntheticModlPart {
  mesh: number;
  /** TEX entry ID, 0 (the default) for none. */
  texture?: number;
  flags?: number;
  colour?: readonly [number, number, number];
  /** The +16 field, 0 unless a test needs another value. */
  reserved?: number;
}

export interface SyntheticModlFields {
  partLists: readonly [readonly SyntheticModlPart[], readonly SyntheticModlPart[], readonly SyntheticModlPart[]];
  /** SND entry IDs of slots 0–4; all 0 by default. */
  sounds?: readonly number[];
  /** Stored {pointer, count} list headers; by default contiguous after the header, with null pointers for empty lists. */
  listHeaders?: readonly (readonly [number, number])[];
}

/** A code-generated MODL data block and its relocated list pointers, to spread into a `SyntheticEntry`. */
export function syntheticModl(fields: SyntheticModlFields): { data: Uint8Array; relocations: number[] } {
  let next = 44;
  const headers = fields.listHeaders ?? fields.partLists.map(list => {
    const header = [list.length ? next : 0, list.length] as const;
    next += list.length * 28;
    return header;
  });
  const writer = new ByteWriter();
  for (const [pointer, count] of headers) writer.u32(pointer, count);
  writer.u32(...(fields.sounds ?? [0, 0, 0, 0, 0]));
  for (const { mesh, texture = 0, flags = 1, colour = [128, 128, 128], reserved = 0 } of fields.partLists.flat()) {
    writer.u32(flags, ...colour, reserved, mesh, texture);
  }
  return { data: writer.toBytes(), relocations: headers.flatMap(([pointer], list) => (pointer ? [list * 8] : [])) };
}

export interface SyntheticSnipFields {
  width: number;
  height: number;
  /** Each frame's 2-bit pixel values, row-major from the top, width × height per frame. */
  frames: readonly (readonly number[])[];
  /** Stored fields that default to the consistent values: the frame block offset (28) and size, and the frame count. */
  blockOffset?: number;
  blockSize?: number;
  count?: number;
}

/**
 * A code-generated SNIP data block (hud, SNIP 10487) and its relocated frame block pointer at offset 0: the pointer and
 * size, zero bytes up to the block, then u32 count, height and width and the frames, four pixels per byte with the
 * leftmost in the lowest two bits.
 */
export function syntheticSnip(fields: SyntheticSnipFields): { data: Uint8Array; relocations: number[] } {
  const { width, height, frames, blockOffset = 28 } = fields;
  const packed = frames.flatMap(frame => Array.from({ length: Math.ceil(frame.length / 4) }, (_, byte) =>
    [0, 1, 2, 3].reduce((value, pixel) => value | ((frame[byte * 4 + pixel] ?? 0) & 3) << (pixel * 2), 0)));
  const block = new ByteWriter().u32(fields.count ?? frames.length, height, width).raw(packed).toBytes();
  const data = new ByteWriter().u32(blockOffset, fields.blockSize ?? block.length).raw(new Uint8Array(Math.max(0, blockOffset - 8))).raw(block).toBytes();
  return { data, relocations: [0] };
}

export interface SyntheticDiagFields {
  /** Upper line character and hold ticks, then the lower line's. */
  timings: readonly [number, number, number, number];
  statusFormats: readonly string[];
  /** [text, maximum] per rating. */
  ratings: readonly (readonly [string, number])[];
  subsystemNames: readonly string[];
  stateWords: readonly string[];
  startupMessages: readonly string[];
}

/**
 * A code-generated DIAG data block (hud, DIAG 10489) and its relocations: the 0x98-byte header with the timings, text
 * pointers, rating maxima and the startup list pointer and count (both 0 without startup messages), then every text
 * NUL-terminated in header order, then the startup list. Texts are byte strings, one character per byte.
 */
export function syntheticDiag(fields: SyntheticDiagFields): { data: Uint8Array; relocations: number[] } {
  const texts: number[] = [];
  const place = (text: string): number => {
    const at = 0x98 + texts.length;
    texts.push(...Array.from(text, character => character.charCodeAt(0)), 0);
    return at;
  };
  const header = new ByteWriter().u32(...fields.timings).u32(...fields.statusFormats.map(place));
  for (const [text, maximum] of fields.ratings) header.u32(place(text), maximum);
  header.u32(...fields.subsystemNames.map(place), ...fields.stateWords.map(place));
  const startup = fields.startupMessages.map(place);
  const list = startup.length === 0 ? 0 : 0x98 + texts.length;
  header.u32(list, startup.length);
  const data = header.raw(texts).u32(...startup).toBytes();
  const pointers = (start: number, count: number, stride = 4) => Array.from({ length: count }, (_, index) => start + index * stride);
  const relocations = [
    ...pointers(0x10, fields.statusFormats.length), ...pointers(0x20, fields.ratings.length, 8),
    ...pointers(0x48, fields.subsystemNames.length + fields.stateWords.length), ...(list === 0 ? [] : [0x90, ...pointers(list, startup.length)]),
  ];
  return { data, relocations };
}

/** One object of a synthetic LE file: its stored bytes, split into 4,096-byte pages. */
export interface SyntheticLeObject {
  bytes: Uint8Array;
  /** The object's size in memory; its stored bytes by default. A larger size leaves a tail not stored in the file. */
  virtualSize?: number;
}

/** A code-generated MZ + LE executable; header fields default to the consistent values and can be overridden. */
export interface SyntheticLeFields {
  objects: readonly SyntheticLeObject[];
  /** Raw fixup records by 1-based page map index; see `leInternalFixup`. */
  fixups?: Readonly<Record<number, readonly number[]>>;
  /** Page map entry types by 1-based index; 0 (stored in the file) by default. */
  pageTypes?: Readonly<Record<number, number>>;
  /** The stored page each page map entry names, as a permutation of 1…n; in order by default. */
  storedOrder?: readonly number[];
  mzSignature?: number;
  leSignature?: number;
  byteOrder?: number;
  wordOrder?: number;
  pageSize?: number;
  pageCount?: number;
  objectCount?: number;
  lastPageBytes?: number;
  /** Offsets relative to the LE header, or from the file start for the data pages. */
  objectTableOffset?: number;
  pageMapOffset?: number;
  fixupPageTableOffset?: number;
  fixupRecordTableOffset?: number;
  dataPagesOffset?: number;
}

const LE_HEADER_AT = 0x40;
const SYNTHETIC_LE_PAGE = 4_096;

/** A fixup record patching a 32-bit offset at `offset` of its page (internal reference to object 1). */
export const leInternalFixup = (offset: number): number[] => Array.from(new ByteWriter().u8(0x07, 0x10).u16(offset).u8(1).u32(0).toBytes());

/** Builds an MZ stub, an LE header, the object table, page map, fixup tables and data pages, in that order. */
export function syntheticLeExecutable(fields: SyntheticLeFields): Uint8Array {
  const pages: Uint8Array[] = [];
  const objects = fields.objects.map(({ bytes, virtualSize = bytes.length }) => {
    const firstPage = pages.length + 1;
    for (let at = 0; at < bytes.length; at += SYNTHETIC_LE_PAGE) {
      const page = new Uint8Array(SYNTHETIC_LE_PAGE);
      page.set(bytes.subarray(at, at + SYNTHETIC_LE_PAGE));
      pages.push(page);
    }
    return { virtualSize, firstPage, pageCount: pages.length + 1 - firstPage };
  });
  const lastObject = fields.objects.at(-1)!.bytes;
  const lastPageBytes = fields.lastPageBytes ?? (lastObject.length % SYNTHETIC_LE_PAGE || SYNTHETIC_LE_PAGE);
  const fixups = Array.from({ length: pages.length }, (_, index) => fields.fixups?.[index + 1] ?? []);
  const objectTable = 0x84;
  const pageMap = objectTable + objects.length * 24;
  const fixupPageTable = pageMap + pages.length * 4;
  const fixupRecords = fixupPageTable + (pages.length + 1) * 4;
  const recordBytes = fixups.reduce((total, records) => total + records.length, 0);
  const dataPages = LE_HEADER_AT + fixupRecords + recordBytes;

  const w = new ByteWriter().u16(fields.mzSignature ?? 0x5a4d).raw(new Uint8Array(0x3a)).u32(LE_HEADER_AT);
  const header = new Uint8Array(0x84);
  const view = new DataView(header.buffer);
  view.setUint16(0, fields.leSignature ?? 0x454c, true);
  view.setUint8(2, fields.byteOrder ?? 0);
  view.setUint8(3, fields.wordOrder ?? 0);
  view.setUint32(0x14, fields.pageCount ?? pages.length, true);
  view.setUint32(0x28, fields.pageSize ?? SYNTHETIC_LE_PAGE, true);
  view.setUint32(0x2c, lastPageBytes, true);
  view.setUint32(0x40, fields.objectTableOffset ?? objectTable, true);
  view.setUint32(0x44, fields.objectCount ?? objects.length, true);
  view.setUint32(0x48, fields.pageMapOffset ?? pageMap, true);
  view.setUint32(0x68, fields.fixupPageTableOffset ?? fixupPageTable, true);
  view.setUint32(0x6c, fields.fixupRecordTableOffset ?? fixupRecords, true);
  view.setUint32(0x80, fields.dataPagesOffset ?? dataPages, true);
  w.raw(header);
  for (const { virtualSize, firstPage, pageCount } of objects) w.u32(virtualSize, 0, 0, firstPage, pageCount, 0);
  const stored = fields.storedOrder ?? pages.map((_, index) => index + 1);
  stored.forEach((number, index) => w.u8((number >>> 16) & 0xff, (number >>> 8) & 0xff, number & 0xff, fields.pageTypes?.[index + 1] ?? 0));
  let offset = 0;
  for (const records of fixups) {
    w.u32(offset);
    offset += records.length;
  }
  w.u32(offset);
  for (const records of fixups) w.raw(records);
  // Stored page n holds the logical page whose map entry names n; only the last stored page may be short.
  const byStored: Uint8Array[] = [];
  stored.forEach((number, index) => { byStored[number - 1] = pages[index]; });
  byStored.forEach((page, index) => w.raw(index === pages.length - 1 ? page.subarray(0, lastPageBytes) : page));
  return w.toBytes();
}

/** A 36-byte image record followed (at the given offsets) by nothing else; callers append data. */
export function imageRecord(
  w: ByteWriter,
  fields: {
    encoding: number; width: number; height: number; paletteOffset: number; paletteCount: number; pixelOffset: number; size: number;
    /** 8 unless a test needs another bit depth. */
    bitsPerPixel?: number;
    /** The +16 field, 0 unless a test needs another value. */
    reserved?: number;
  },
): ByteWriter {
  const { bitsPerPixel = 8, reserved = 0 } = fields;
  return w.u32(bitsPerPixel, fields.encoding, fields.width, fields.height, reserved, fields.paletteOffset, fields.paletteCount, fields.pixelOffset, fields.size);
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
