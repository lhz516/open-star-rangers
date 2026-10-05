import type { BudgetRecord } from '../../content/budget.ts';
import { openCloneCd, type DiscInputFile, type OpenDiscOptions } from './clone-cd.ts';
import { DiscReadError } from './disc-error.ts';
import { readFileRange } from './file-range.ts';
import { resolvePath, type DirectoryContext, type DiscEntry } from './iso9660-directory.ts';
import { readVolume } from './iso9660-volume.ts';

export type { DiscInputFile, OpenDiscOptions } from './clone-cd.ts';
export type { DiscEntry } from './iso9660-directory.ts';

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
  /** Resolves a file path and binds it to this image; a directory is `wrong-entry-kind`. */
  openFile(path: string): Promise<DiscFile>;
  /** All twelve budget dimensions as a frozen snapshot of the source reads issued so far. */
  usage(): BudgetRecord;
}

/**
 * A file opened through its image, sharing the image's budget and cancellation. Only `openFile` creates one, so an
 * entry made by a caller never grants a read.
 */
export interface DiscFile {
  readonly entry: DiscEntry;
  /**
   * Reads `[offset, offset + length)` into a new, exclusive buffer of exactly `length` bytes. Changing or transferring
   * a result never affects other reads, and a failure leaves the file and image usable.
   */
  read(offset: number, length: number): Promise<Uint8Array<ArrayBuffer>>;
}

class OpenedDiscFile implements DiscFile {
  readonly entry: DiscEntry;
  readonly #directories: DirectoryContext;

  constructor(directories: DirectoryContext, entry: DiscEntry) {
    this.#directories = directories;
    this.entry = entry;
  }

  read(offset: number, length: number): Promise<Uint8Array<ArrayBuffer>> {
    return readFileRange(this.#directories.reader, this.#directories.image, this.entry, offset, length);
  }
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

  async openFile(path: string): Promise<DiscFile> {
    const entry = await resolvePath(this.#directories, path);
    if (entry.kind !== 'file') throw new DiscReadError('wrong-entry-kind', `dir:/${entry.path}`, 'only a file can be opened');
    return Object.freeze(new OpenedDiscFile(this.#directories, entry));
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
