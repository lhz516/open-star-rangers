import type { BudgetRecord } from '../../content/budget.ts';
import { openCloneCd, type DiscInputFile, type OpenDiscOptions } from './clone-cd.ts';
import { readVolume } from './iso9660-volume.ts';
import type { SourceReader } from './source-reader.ts';

/** Frozen, structured-cloneable facts about an opened image. */
export interface DiscVolumeInfo {
  /** Raw sectors in the image. */
  readonly sectorCount: number;
  /** Logical blocks in the ISO9660 volume, at most `sectorCount`. */
  readonly volumeSectors: number;
}

/**
 * An opened disc image. It holds its ports, so it is not structured-cloneable and stays in one Worker or process; it
 * never closes the caller's sources.
 */
export interface DiscImage {
  readonly volume: DiscVolumeInfo;
  /** All twelve budget dimensions as a frozen snapshot of the source reads issued so far. */
  usage(): BudgetRecord;
}

class OpenedDiscImage implements DiscImage {
  readonly volume: DiscVolumeInfo;
  readonly #reader: SourceReader;

  constructor(reader: SourceReader, volume: DiscVolumeInfo) {
    this.#reader = reader;
    this.volume = volume;
  }

  usage(): BudgetRecord {
    return this.#reader.usage();
  }
}

/**
 * Opens a CloneCD file set read-only, reading only the `.ccd` and the volume descriptor sectors. Failures reject with a
 * `DiscReadError` and return no handle.
 */
export async function openDiscImage(files: readonly DiscInputFile[], options?: OpenDiscOptions): Promise<DiscImage> {
  const { reader, image, sectorCount } = await openCloneCd(files, options);
  const { volumeSectors } = await readVolume(reader, image, sectorCount);
  return Object.freeze(new OpenedDiscImage(reader, Object.freeze({ sectorCount, volumeSectors })));
}
