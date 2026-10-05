import type { BudgetRecord } from '../../content/budget.ts';
import { openCloneCd, type DiscInputFile, type OpenDiscOptions } from './clone-cd.ts';
import { resolvePath, type DirectoryContext, type DiscEntry } from './iso9660-directory.ts';
import { readVolume } from './iso9660-volume.ts';

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
  /**
   * Resolves a disc path such as `MAIN/SR.NOB` to a frozen entry, reading only the directories it passes through. A
   * failed lookup leaves the handle usable; source reads already issued stay metered.
   */
  lookup(path: string): Promise<DiscEntry>;
  /** All twelve budget dimensions as a frozen snapshot of the source reads issued so far. */
  usage(): BudgetRecord;
}

class OpenedDiscImage implements DiscImage {
  readonly volume: DiscVolumeInfo;
  readonly #directories: DirectoryContext;

  constructor(directories: DirectoryContext, volume: DiscVolumeInfo) {
    this.#directories = directories;
    this.volume = volume;
  }

  lookup(path: string): Promise<DiscEntry> {
    return resolvePath(this.#directories, path);
  }

  usage(): BudgetRecord {
    return this.#directories.reader.usage();
  }
}

/**
 * Opens a CloneCD file set read-only, reading only the `.ccd` and the volume descriptor sectors. Failures reject with a
 * `DiscReadError` and return no handle.
 */
export async function openDiscImage(files: readonly DiscInputFile[], options?: OpenDiscOptions): Promise<DiscImage> {
  const { reader, image, sectorCount } = await openCloneCd(files, options);
  const { volumeSectors, root } = await readVolume(reader, image, sectorCount);
  const directories = Object.freeze({ reader, image, volumeSectors, root });
  return Object.freeze(new OpenedDiscImage(directories, Object.freeze({ sectorCount, volumeSectors })));
}
