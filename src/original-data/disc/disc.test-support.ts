// Shared helpers for disc reader tests. Pure like the layer itself; assertions stay in the test files.

import {
  cloneCdSections, cloneCdText, directoryData, directoryRecord, ISO_DIRECTORY_FLAG, memoryByteSource, primaryVolumeDescriptor, sectorImageSource,
  SYNTHETIC_RAW_SECTOR_BYTES, SYNTHETIC_SECTOR_DATA_BYTES, volumeDescriptor, type DirectoryRecordFields,
  type SyntheticByteSource,
} from '../synthetic.ts';
import { DiscReadError, type DiscReadErrorData } from './disc-error.ts';

/** Planted in host names, host error text and unknown descriptor names; no diagnostic may contain it. */
export const MARKER = 'PRIVATE-MARKER-7f3a';

export type Diagnostic = Omit<DiscReadErrorData, 'reason'>;

export const failureOf = (code: Diagnostic['code'], location: string, limit: Diagnostic['limit'] = null): Diagnostic => ({ code, location, limit });

/** Primitives and plain objects of them only, which structured cloning always copies faithfully. */
function isPlainData(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true;
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Reflect.ownKeys(value).every(key => typeof key === 'string' && isPlainData((value as Record<string, unknown>)[key]));
}

export async function rejection(action: () => unknown): Promise<DiscReadError> {
  try {
    await action();
  } catch (error) {
    if (error instanceof DiscReadError) return error;
    throw error;
  }
  throw new Error('expected a DiscReadError');
}

/**
 * Awaits a failure and returns its diagnostic without the fixed reason text, after checking the DTO is frozen plain data
 * (so it survives structured cloning), and that neither it, the message nor the error's own values carry the marker, bytes or a host error.
 */
export async function failure(action: () => unknown): Promise<Diagnostic> {
  const error = await rejection(action);
  const data = error.toData();
  if (!Object.isFrozen(data) || `${JSON.stringify(data)} ${error.message}`.includes(MARKER)
    || Object.values(error).some(value => value instanceof Uint8Array || value instanceof Error)) {
    throw new Error('the diagnostic leaks private input or is mutable');
  }
  if (!isPlainData(data)) throw new Error('the diagnostic is not structured-cloneable plain data');
  return { code: data.code, location: data.location, limit: data.limit };
}

export const ROOT_LBA = 18;

type RecordFields = Partial<DirectoryRecordFields>;

/** A root directory record for the primary volume descriptor. */
export const rootRecord = (extent = ROOT_LBA, dataLength = SYNTHETIC_SECTOR_DATA_BYTES): Uint8Array =>
  directoryRecord({ extent, dataLength, flags: ISO_DIRECTORY_FLAG, name: Uint8Array.of(0) });
/** The `.` record of a directory at `extent`. */
export const selfRecord = (extent: number, dataLength = SYNTHETIC_SECTOR_DATA_BYTES, fields: RecordFields = {}): Uint8Array =>
  directoryRecord({ extent, dataLength, flags: ISO_DIRECTORY_FLAG, name: Uint8Array.of(0), ...fields });
/** The `..` record naming the parent directory at `extent`. */
export const parentRecord = (extent: number, dataLength = SYNTHETIC_SECTOR_DATA_BYTES, fields: RecordFields = {}): Uint8Array =>
  directoryRecord({ extent, dataLength, flags: ISO_DIRECTORY_FLAG, name: Uint8Array.of(1), ...fields });
export const subdirectoryRecord = (name: string, extent: number, dataLength = SYNTHETIC_SECTOR_DATA_BYTES, fields: RecordFields = {}): Uint8Array =>
  directoryRecord({ extent, dataLength, flags: ISO_DIRECTORY_FLAG, name, ...fields });
/** A file record; `name` carries its own version suffix, such as `SR.NOB;1`. */
export const fileRecord = (name: string, extent: number, dataLength: number, fields: RecordFields = {}): Uint8Array =>
  directoryRecord({ extent, dataLength, name, ...fields });

/** User data by LBA for the smallest supported volume: primary descriptor at 16, terminator at 17, root at 18. */
export function volumeSectors(sectorCount: number): Map<number, Uint8Array> {
  return new Map([[16, primaryVolumeDescriptor(sectorCount, rootRecord())], [17, volumeDescriptor(255)]]);
}

export interface SyntheticDisc {
  readonly descriptor: SyntheticByteSource;
  readonly image: SyntheticByteSource;
  readonly files: { readonly name: string; readonly source: SyntheticByteSource }[];
}

/** A CloneCD file set of `sectorCount` sectors whose image builds user data on demand, after `edit` changes raw sectors. */
function fileSet(sectorCount: number, userData: (lba: number) => Uint8Array | undefined, edit?: (lba: number, raw: Uint8Array) => void, lineEnd?: string): SyntheticDisc {
  const descriptor = memoryByteSource(cloneCdText(cloneCdSections(sectorCount), lineEnd));
  const image = sectorImageSource(sectorCount, userData, edit);
  return { descriptor, image, files: [{ name: `${MARKER}.ccd`, source: descriptor }, { name: `${MARKER}.img`, source: image }] };
}

/** A CloneCD file set whose image builds sectors on demand from `sectors`, after `edit` changes raw sectors. */
export function syntheticDisc(sectorCount: number, sectors: ReadonlyMap<number, Uint8Array>, edit?: (lba: number, raw: Uint8Array) => void): SyntheticDisc {
  return fileSet(sectorCount, lba => sectors.get(lba), edit);
}

/** The LBAs of the image port's requests, one per requested sector; a request that is not whole raw sectors fails. */
export const requestedLbas = (image: SyntheticByteSource): number[] =>
  image.requests.flatMap(({ offset, length }) => {
    if (offset % SYNTHETIC_RAW_SECTOR_BYTES !== 0 || length % SYNTHETIC_RAW_SECTOR_BYTES !== 0) throw new Error('an image request is not whole raw sectors');
    return Array.from({ length: length / SYNTHETIC_RAW_SECTOR_BYTES }, (_, index) => offset / SYNTHETIC_RAW_SECTOR_BYTES + index);
  });

/** File content: bytes, or a generated file of `byteLength` bytes whose `read(offset, length)` returns that range. */
export type SyntheticFileContent = Uint8Array | { readonly byteLength: number; readonly read: (offset: number, length: number) => Uint8Array };

export interface SyntheticFileDiscOptions {
  /** Unused sectors between the directories and the first file, to vary the layout. */
  readonly gapSectors?: number;
  /** Places the files in descending instead of ascending path order. */
  readonly reverse?: boolean;
  /** Line end of the `.ccd` text. */
  readonly lineEnd?: string;
  /** Changes a raw sector after it is built, such as corrupting a file sector. */
  readonly edit?: (lba: number, raw: Uint8Array) => void;
  /**
   * Files or directories whose records in their parent directory name an extent starting at the image's sector count,
   * just past its end, while their content keeps its place: a valid record whose extent lies outside the image.
   */
  readonly outOfImage?: readonly string[];
}

export interface SyntheticFileDisc extends SyntheticDisc {
  /** First sector of each file, by disc path. */
  readonly extents: ReadonlyMap<string, number>;
}

const contentLength = (content: SyntheticFileContent): number => (content instanceof Uint8Array ? content.length : content.byteLength);

/**
 * A CloneCD file set holding `files` by disc path (such as `MAIN/SR.NOB`) under an ISO9660 tree built on demand. Every
 * directory has `.`, `..` and its entries in name order; files carry a `;1` version. Generated contents are never
 * allocated whole, so production-size files stay cheap.
 */
export function syntheticFileDisc(files: Readonly<Record<string, SyntheticFileContent>>, options: SyntheticFileDiscOptions = {}): SyntheticFileDisc {
  const children = new Map<string, Set<string>>([['', new Set()]]);
  for (const path of Object.keys(files)) {
    const segments = path.split('/');
    segments.forEach((segment, index) => {
      const parent = segments.slice(0, index).join('/');
      if (!children.has(parent)) children.set(parent, new Set());
      children.get(parent)!.add(segment);
    });
  }
  const directoryPaths = [...children.keys()].sort();
  const join = (parent: string, name: string) => (parent ? `${parent}/${name}` : name);
  const isDirectory = (path: string) => children.has(path);
  // Record sizes do not depend on extents, so sizing with placeholders gives each directory's final length.
  const recordsOf = (path: string, extentOf: (child: string) => number, lengthOf: (child: string) => number, childExtent = extentOf) => [
    selfRecord(extentOf(path), lengthOf(path)),
    parentRecord(extentOf(path.split('/').slice(0, -1).join('/')), lengthOf(path.split('/').slice(0, -1).join('/'))),
    ...[...children.get(path)!].sort().map(name => {
      const child = join(path, name);
      return isDirectory(child)
        ? subdirectoryRecord(name, childExtent(child), lengthOf(child))
        : fileRecord(`${name};1`, childExtent(child), contentLength(files[child]));
    }),
  ];
  const directoryLength = new Map(directoryPaths.map(path => [path, directoryData(recordsOf(path, () => 0, () => 0)).length]));
  const extent = new Map<string, number>();
  let next = ROOT_LBA;
  for (const path of directoryPaths) {
    extent.set(path, next);
    next += directoryLength.get(path)! / SYNTHETIC_SECTOR_DATA_BYTES;
  }
  next += options.gapSectors ?? 0;
  const filePaths = Object.keys(files).sort();
  if (options.reverse) filePaths.reverse();
  const placed: { first: number; content: SyntheticFileContent; sectors: number }[] = [];
  for (const path of filePaths) {
    const sectors = Math.ceil(contentLength(files[path]) / SYNTHETIC_SECTOR_DATA_BYTES);
    extent.set(path, sectors === 0 ? 0 : next);
    if (sectors > 0) placed.push({ first: next, content: files[path], sectors });
    next += sectors;
  }
  const sectorCount = next + 1;
  const recordedExtent = (child: string): number => (options.outOfImage?.includes(child) ? sectorCount : extent.get(child)!);
  const directorySectors = new Map<number, Uint8Array>();
  for (const path of directoryPaths) {
    const data = directoryData(recordsOf(path, child => extent.get(child)!, child => directoryLength.get(child) ?? 0, recordedExtent), directoryLength.get(path));
    for (let sector = 0; sector * SYNTHETIC_SECTOR_DATA_BYTES < data.length; sector++) {
      directorySectors.set(extent.get(path)! + sector, data.subarray(sector * SYNTHETIC_SECTOR_DATA_BYTES, (sector + 1) * SYNTHETIC_SECTOR_DATA_BYTES));
    }
  }
  const userData = (lba: number): Uint8Array | undefined => {
    if (lba === 16) return primaryVolumeDescriptor(sectorCount, rootRecord(ROOT_LBA, directoryLength.get('')!));
    if (lba === 17) return volumeDescriptor(255);
    const directory = directorySectors.get(lba);
    if (directory) return directory;
    const file = placed.find(({ first, sectors }) => lba >= first && lba < first + sectors);
    if (!file) return undefined;
    const start = (lba - file.first) * SYNTHETIC_SECTOR_DATA_BYTES;
    const length = Math.min(SYNTHETIC_SECTOR_DATA_BYTES, contentLength(file.content) - start);
    return file.content instanceof Uint8Array ? file.content.subarray(start, start + length) : file.content.read(start, length);
  };
  return {
    ...fileSet(sectorCount, userData, options.edit, options.lineEnd),
    extents: new Map(Object.keys(files).map(path => [path, extent.get(path)!])),
  };
}

/** The LBAs a range read of `[offset, offset + length)` covers in a file whose first sector is `first`. */
export function rangeLbas(first: number, offset: number, length: number): number[] {
  if (length === 0) return [];
  const from = first + Math.floor(offset / SYNTHETIC_SECTOR_DATA_BYTES);
  const to = first + Math.floor((offset + length - 1) / SYNTHETIC_SECTOR_DATA_BYTES);
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}
