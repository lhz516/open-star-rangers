// Shared helpers for disc reader tests. Pure like the layer itself; assertions stay in the test files.

import {
  cloneCdSections, cloneCdText, directoryRecord, ISO_DIRECTORY_FLAG, memoryByteSource, primaryVolumeDescriptor, sectorImageSource,
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

/** A CloneCD file set whose image builds sectors on demand from `sectors`, after `edit` changes raw sectors. */
export function syntheticDisc(sectorCount: number, sectors: ReadonlyMap<number, Uint8Array>, edit?: (lba: number, raw: Uint8Array) => void): SyntheticDisc {
  const descriptor = memoryByteSource(cloneCdText(cloneCdSections(sectorCount)));
  const image = sectorImageSource(sectorCount, lba => sectors.get(lba), edit);
  return { descriptor, image, files: [{ name: `${MARKER}.ccd`, source: descriptor }, { name: `${MARKER}.img`, source: image }] };
}

/** The LBAs of the image port's requests, one per requested sector; a request that is not whole raw sectors fails. */
export const requestedLbas = (image: SyntheticByteSource): number[] =>
  image.requests.flatMap(({ offset, length }) => {
    if (offset % SYNTHETIC_RAW_SECTOR_BYTES !== 0 || length % SYNTHETIC_RAW_SECTOR_BYTES !== 0) throw new Error('an image request is not whole raw sectors');
    return Array.from({ length: length / SYNTHETIC_RAW_SECTOR_BYTES }, (_, index) => offset / SYNTHETIC_RAW_SECTOR_BYTES + index);
  });
