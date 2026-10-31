import type { ByteSource } from '../io/byte-source.ts';
import { REGION_LIMITS, type ExecutableRegion } from '../source-mapping.ts';
import { SourceError } from '../source-error.ts';

// Linear Executable (LE) structure, little-endian (docs/original/formats/executable.md §1). Only the parts a byte
// region needs are read: the MZ header's LE offset, the LE header, the object table, the object page map and the
// fixup page table, plus the fixup records of the pages a region touches.
//   MZ  0x00 'MZ'; 0x3C u32 LE header offset
//   LE  0x00 'LE'; 0x02 u8 byte order, 0x03 u8 word order (both 0); 0x14 u32 page count; 0x28 u32 page size;
//       0x2C u32 bytes on the last page; 0x40 u32 object table offset, 0x44 u32 object count; 0x48 u32 page map
//       offset; 0x68 u32 fixup page table offset, 0x6C u32 fixup record table offset (all relative to the LE header);
//       0x80 u32 data pages offset (from the file start)
//   Object (24 bytes): u32 virtual size, u32 base, u32 flags, u32 first page map index (1-based), u32 page count, u32
//   Page map entry (4 bytes): 3-byte page number, most significant first; u8 type, 0 for a page stored in the file
//   Fixup page table: page count + 1 u32 offsets into the fixup record table; page i's records are [i - 1, i)
//   Fixup record: u8 source type, u8 target flags, then the source offset or list and the target data (executable §1)

const LE_HEADER_BYTES = 0x84;
const OBJECT_BYTES = 24;
/** The page size every LE file of the x86 targets uses. */
export const LE_PAGE_SIZE = 4_096;

/** Structural limits of the reader (P2-06 spec, effect geometry data). */
export const EXECUTABLE_LIMITS = Object.freeze({ objects: REGION_LIMITS.objects, pages: 1_024, regionBytes: REGION_LIMITS.bytes });

interface LeObject {
  readonly virtualSize: number;
  /** 1-based index of the object's first page map entry. */
  readonly firstPage: number;
  readonly pageCount: number;
}

/** A position in an object: the 1-based object number and the offset from the object's start. */
export interface ObjectPosition {
  readonly object: number;
  readonly offset: number;
}

/** A fixup record's internal target: the position and how many bits the record stores the target offset in (flag 0x10). */
export interface FixupTarget extends ObjectPosition {
  readonly targetBits: 16 | 32;
}

/**
 * A 32-bit offset that the loader sets to the address of `object` + `offset` (a fixup record's internal target). Both
 * target offset widths load the same; a contract that requires one checks `targetBits`.
 */
export interface RegionFixup extends FixupTarget {
  /** Offset of the 4 patched bytes from the region's start. */
  readonly at: number;
}

/** A region's bytes as stored in the file, before the loader applies any fixup, and the fixups that patch it. */
export interface FixedUpRegion {
  readonly bytes: Uint8Array;
  /** In position order. */
  readonly fixups: readonly RegionFixup[];
}

/** An opened LE file: its validated layout and region readers. */
export interface LeExecutable {
  readonly objectCount: number;
  /**
   * Reads a region of an object into a new buffer. It must lie inside the object and its file-backed pages, and no
   * fixup may patch any of its bytes; otherwise `invalid-payload` at `path`.
   */
  readRegion(region: ExecutableRegion, path: string): Promise<Uint8Array>;
  /**
   * Reads a region like `readRegion`, but accepts fixups that patch it when each is a non-additive 32-bit offset (source
   * type 7) to a position inside an object of the file, wholly inside the region and overlapping no other; any other
   * fixup that patches the region is `invalid-payload` at `path`. A fixup that crosses a page boundary may be recorded
   * once on each of its two pages, with the same target; it is one fixup. Any other repeated record is invalid.
   */
  readFixedUpRegion(region: ExecutableRegion, path: string): Promise<FixedUpRegion>;
}

function invalid(path: string, reason: string): never {
  throw new SourceError('invalid-payload', path, reason);
}

function counted(observed: number, name: 'executableObjects' | 'executablePages' | 'executableRegion', limit: number, path: string): number {
  if (observed < 1 || observed > limit) throw new SourceError('limit-exceeded', path, `must be 1 to ${limit}`, { name, limit, observed });
  return observed;
}

const viewOf = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/** Bytes per source type of a fixup record (its low nibble): the bytes the loader patches. */
const FIXUP_SOURCE_BYTES: Readonly<Record<number, number>> = Object.freeze({ 0x0: 1, 0x2: 2, 0x3: 4, 0x5: 2, 0x6: 6, 0x7: 4, 0x8: 4 });

/** The bytes one fixup patches, relative to its page's start, and the target of a non-additive internal 32-bit offset. */
interface PageFixup {
  readonly start: number;
  readonly end: number;
  readonly target: FixupTarget | null;
}

/**
 * The fixups of one page's records. A record whose layout this reader does not know is `invalid-payload`: an unknown
 * record cannot be proven not to touch a region.
 */
function pageFixups(records: Uint8Array, path: string): PageFixup[] {
  const view = viewOf(records);
  const fixups: PageFixup[] = [];
  let at = 0;
  const need = (bytes: number) => {
    if (at + bytes > records.length) invalid(path, 'a fixup record is truncated');
  };
  const u8 = () => { need(1); return view.getUint8(at++); };
  const u16 = () => { need(2); at += 2; return view.getUint16(at - 2, true); };
  const s16 = () => { need(2); at += 2; return view.getInt16(at - 2, true); };
  const u32 = () => { need(4); at += 4; return view.getUint32(at - 4, true); };
  const skip = (bytes: number) => { need(bytes); at += bytes; };
  while (at < records.length) {
    const source = u8();
    const flags = u8();
    const size = FIXUP_SOURCE_BYTES[source & 0x0f];
    if (size === undefined) invalid(path, 'a fixup record has an unknown source type');
    // Reserved source bits and target flag 0x08 are invalid; the alias flag applies only to selectors and pointers.
    if ((source & 0xc0) !== 0 || (flags & 0x08) !== 0) invalid(path, 'a fixup record sets a reserved flag');
    if ((source & 0x10) !== 0 && ![0x2, 0x3, 0x6].includes(source & 0x0f)) invalid(path, 'a fixup record sets the alias flag on an offset');
    const list = (source & 0x20) !== 0;
    const offsets = list ? [] as number[] : [s16()];
    const count = list ? u8() : 0;
    const wide = (flags & 0x40) !== 0 ? 2 : 1;
    let target: FixupTarget | null = null;
    switch (flags & 0x03) {
      case 0: { // internal reference: object, then a target offset unless the source is a 16-bit selector
        const object = wide === 2 ? u16() : u8();
        if ((source & 0x0f) !== 0x2) {
          const targetBits = (flags & 0x10) !== 0 ? 32 : 16;
          const offset = targetBits === 32 ? u32() : u16();
          if ((source & 0x0f) === 0x7 && (flags & 0x04) === 0) target = { object, offset, targetBits };
        }
        break;
      }
      case 1: // import by ordinal: module, then an 8-bit, 32-bit or 16-bit ordinal
        skip(wide);
        skip((flags & 0x80) !== 0 ? 1 : (flags & 0x10) !== 0 ? 4 : 2);
        break;
      case 2: // import by name: module, then a name offset
        skip(wide);
        skip((flags & 0x10) !== 0 ? 4 : 2);
        break;
      default: // internal entry: an entry ordinal
        skip(wide);
    }
    if ((flags & 0x04) !== 0) skip((flags & 0x20) !== 0 ? 4 : 2);
    for (let index = 0; index < count; index++) offsets.push(s16());
    for (const offset of offsets) fixups.push({ start: offset, end: offset + size, target });
  }
  return fixups;
}

/**
 * Opens an LE executable from its MZ header: checks the signatures, byte and word order, page size, the object table,
 * page map and fixup page table against the file, and the object and page counts against the limits before
 * allocating for them. Failures are `invalid-payload` or `limit-exceeded` at `path`.
 */
export async function openLeExecutable(file: ByteSource, path: string): Promise<LeExecutable> {
  const fits = (offset: number, length: number) => Number.isSafeInteger(offset) && offset >= 0 && offset + length <= file.byteLength;
  const readAt = async (offset: number, length: number, what: string) => {
    if (!fits(offset, length)) invalid(path, `the ${what} lies outside the file`);
    return file.read(offset, length);
  };
  const mz = viewOf(await readAt(0, 0x40, 'MZ header'));
  if (mz.getUint16(0, true) !== 0x5a4d) invalid(path, 'the file is not an MZ executable');
  const leAt = mz.getUint32(0x3c, true);
  const le = viewOf(await readAt(leAt, LE_HEADER_BYTES, 'LE header'));
  if (le.getUint16(0, true) !== 0x454c) invalid(path, 'the file has no LE header');
  if (le.getUint8(2) !== 0 || le.getUint8(3) !== 0) invalid(path, 'the LE byte and word order must be little-endian');
  if (le.getUint32(0x28, true) !== LE_PAGE_SIZE) invalid(path, `the LE page size must be ${LE_PAGE_SIZE}`);
  const pages = counted(le.getUint32(0x14, true), 'executablePages', EXECUTABLE_LIMITS.pages, path);
  const objectCount = counted(le.getUint32(0x44, true), 'executableObjects', EXECUTABLE_LIMITS.objects, path);
  const lastPageBytes = le.getUint32(0x2c, true);
  if (lastPageBytes < 1 || lastPageBytes > LE_PAGE_SIZE) invalid(path, 'the bytes on the last page must be 1 to the page size');
  const dataPagesAt = le.getUint32(0x80, true);
  if (!fits(dataPagesAt, (pages - 1) * LE_PAGE_SIZE + lastPageBytes)) invalid(path, 'the data pages lie outside the file');

  const [tableBytes, pageMap, fixupPageBytes] = await Promise.all([
    readAt(leAt + le.getUint32(0x40, true), objectCount * OBJECT_BYTES, 'object table'),
    readAt(leAt + le.getUint32(0x48, true), pages * 4, 'page map'),
    readAt(leAt + le.getUint32(0x68, true), (pages + 1) * 4, 'fixup page table'),
  ]);
  const table = viewOf(tableBytes);
  const fixupPages = viewOf(fixupPageBytes);
  const fixupRecordsAt = leAt + le.getUint32(0x6c, true);
  const fixupEnd = fixupPages.getUint32(pages * 4, true);
  if (!fits(fixupRecordsAt, fixupEnd)) invalid(path, 'the fixup record table lies outside the file');
  for (let page = 0; page < pages; page++) {
    if (fixupPages.getUint32(page * 4, true) > fixupPages.getUint32(page * 4 + 4, true)) invalid(path, 'the fixup page table is not ascending');
  }

  const objects: LeObject[] = [];
  for (let index = 0; index < objectCount; index++) {
    const at = index * OBJECT_BYTES;
    const object = { virtualSize: table.getUint32(at, true), firstPage: table.getUint32(at + 12, true), pageCount: table.getUint32(at + 16, true) };
    if (object.pageCount > 0 && (object.firstPage < 1 || object.firstPage + object.pageCount - 1 > pages)) {
      invalid(path, 'an object names pages outside the page map');
    }
    objects.push(object);
  }

  /** The file offset and stored length of page map entry `index` (1-based), which must be a file page. */
  const storedPage = (index: number, at: string) => {
    const entry = (index - 1) * 4;
    const number = (pageMap[entry] << 16) | (pageMap[entry + 1] << 8) | pageMap[entry + 2];
    if (pageMap[entry + 3] !== 0 || number < 1 || number > pages) invalid(at, 'the region lies in a page that is not stored in the file');
    return { offset: dataPagesAt + (number - 1) * LE_PAGE_SIZE, length: number === pages ? lastPageBytes : LE_PAGE_SIZE };
  };

  /** Fixups per page map index, parsed once whichever regions touch the page. */
  const parsed = new Map<number, PageFixup[]>();
  const fixupsOf = async (index: number, at: string) => {
    let fixups = parsed.get(index);
    if (!fixups) {
      const from = fixupPages.getUint32((index - 1) * 4, true);
      const to = fixupPages.getUint32(index * 4, true);
      fixups = to > from ? pageFixups(await file.read(fixupRecordsAt + from, to - from), at) : [];
      parsed.set(index, fixups);
    }
    return fixups;
  };

  /**
   * Reads the region's stored bytes, passing each fixup that patches any of them to `patches` with the object offset of
   * its first patched byte and the index of the object page that records it.
   */
  const regionBytes = async (
    { object, offset, length }: ExecutableRegion, at: string, patches: (fixup: PageFixup, from: number, page: number) => void,
  ) => {
    counted(length, 'executableRegion', EXECUTABLE_LIMITS.regionBytes, at);
    const info = objects[object - 1];
    if (!info) invalid(at, 'the region names an object the file does not have');
    if (offset + length > info.virtualSize) invalid(at, 'the region lies outside its object');
    const first = Math.floor(offset / LE_PAGE_SIZE);
    const last = Math.floor((offset + length - 1) / LE_PAGE_SIZE);
    if (last >= info.pageCount) invalid(at, 'the region lies in a part of its object that is not stored in the file');
    const bytes = new Uint8Array(length);
    const regionEnd = offset + length;
    for (let page = first; page <= last; page++) {
      const index = info.firstPage + page;
      const stored = storedPage(index, at);
      const pageStart = page * LE_PAGE_SIZE;
      // Page-relative bounds of the region's bytes on this page.
      const start = Math.max(offset, pageStart) - pageStart;
      const end = Math.min(regionEnd, pageStart + LE_PAGE_SIZE) - pageStart;
      if (end > stored.length) invalid(at, 'the region lies in a part of its object that is not stored in the file');
      for (const fixup of await fixupsOf(index, at)) {
        if (fixup.start < end && fixup.end > start) patches(fixup, pageStart + fixup.start, page);
      }
      bytes.set(await file.read(stored.offset + start, end - start), pageStart + start - offset);
    }
    return bytes;
  };

  return Object.freeze({
    objectCount,
    readRegion: (region: ExecutableRegion, at: string): Promise<Uint8Array> =>
      regionBytes(region, at, () => invalid(at, 'a fixup patches the region')),
    async readFixedUpRegion(region: ExecutableRegion, at: string): Promise<FixedUpRegion> {
      const found = new Map<number, { readonly fixup: RegionFixup; readonly page: number; readonly joined: boolean }>();
      const bytes = await regionBytes(region, at, ({ start, end, target }, from, page) => {
        const position = from - region.offset;
        if (!target || position < 0 || position + end - start > region.length) {
          invalid(at, 'a fixup patches the region other than as an internal 32-bit offset inside it');
        }
        const targetObject = objects[target.object - 1];
        if (!targetObject || target.offset >= targetObject.virtualSize) invalid(at, 'a fixup targets a position outside the objects');
        const known = found.get(position);
        if (known) {
          const first = Math.floor(from / LE_PAGE_SIZE);
          const crosses = Math.floor((from + 3) / LE_PAGE_SIZE) !== first;
          const pages = [known.page, page].sort((left, right) => left - right);
          if (known.joined || !crosses || pages[0] !== first || pages[1] !== first + 1) invalid(at, 'a fixup is recorded more than once');
          const { object, offset, targetBits } = known.fixup;
          if (object !== target.object || offset !== target.offset || targetBits !== target.targetBits) invalid(at, 'the records of a fixup disagree');
          found.set(position, { ...known, joined: true });
          return;
        }
        found.set(position, { fixup: Object.freeze({ at: position, ...target }), page, joined: false });
      });
      const fixups = [...found.values()].map(({ fixup }) => fixup).sort((left, right) => left.at - right.at);
      fixups.forEach((fixup, index) => {
        if (index > 0 && fixup.at < fixups[index - 1].at + 4) invalid(at, 'two fixups overlap');
      });
      return Object.freeze({ bytes, fixups: Object.freeze(fixups) });
    },
  });
}
