import type { ArchiveEntryRead, ImfatArchiveHandle } from '../archive/archive-reader.ts';
import type { ImfatEntry } from '../archive/imfat-rules.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import { openLeExecutable, type LeExecutable } from '../formats/le-executable.ts';
import { SourceError } from '../source-error.ts';
import { executableRegion, type ExecutableRegionLocator } from '../source-mapping.ts';
import type { VerifiedSource } from '../source/open-verified-source.ts';
import type { EntryReader } from '../source/verify-source-mappings.ts';

/**
 * A step-local entry reader: each (archive, type, entry ID) is read at most once and its result shared by mapping
 * verification and conversion. The cache lives only as long as the reader, so entry bytes are released with the step.
 * `beforeRead` sees each directory entry before its bytes are read, so a step can reject an entry by its declared size.
 */
export function stepEntryReader(source: VerifiedSource, beforeRead?: (discPath: DiscPath, entry: ImfatEntry) => void): EntryReader {
  const archives = new Map<string, Promise<ImfatArchiveHandle>>();
  const entries = new Map<string, Promise<ArchiveEntryRead>>();
  const read = async (discPath: DiscPath, id: number, type: string): Promise<ArchiveEntryRead> => {
    let archive = archives.get(discPath);
    if (!archive) {
      archive = source.openArchive(discPath);
      archives.set(discPath, archive);
    }
    const handle = await archive;
    // As in mapping verification: an ID beyond u32 cannot be in an archive, which the handle would call malformed.
    if (id > 0xffffffff) throw new SourceError('entry-not-found', 'request.id', 'the archive has no entry with this ID');
    beforeRead?.(discPath, handle.entry(id, type));
    return handle.read(id, type);
  };
  return ({ discPath, entry: { id, type } }) => {
    const key = `${discPath}\u0000${type}\u0000${id}`;
    let entry = entries.get(key);
    if (!entry) {
      entry = read(discPath, id, type);
      entries.set(key, entry);
    }
    return entry;
  };
}

/** Reads the bytes of a region locator; `openPath` locates a failure to open the executable, `path` one in the region. */
export type RegionReader = (locator: ExecutableRegionLocator, path: string, openPath?: string) => Promise<Uint8Array>;

/**
 * A step-local region reader: each executable is opened once, located at the first read's `openPath`, and each region
 * is read from it once with the LE reader's checks, located at its first read's `path`; Assets that share a region
 * share its bytes, which they only read. The cache lives only as long as the reader.
 */
export function stepRegionReader(source: VerifiedSource): RegionReader {
  const executables = new Map<string, Promise<LeExecutable>>();
  const regions = new Map<string, Promise<Uint8Array>>();
  return (locator, path, openPath = path) => {
    const key = `${locator.discPath}\u0000${locator.subresource}`;
    let region = regions.get(key);
    if (!region) {
      let executable = executables.get(locator.discPath);
      if (!executable) {
        executable = source.openFile(locator.discPath)
          .then(file => openLeExecutable({ byteLength: file.entry.byteLength, read: (offset, length) => file.read(offset, length) }, openPath));
        executables.set(locator.discPath, executable);
      }
      region = executable.then(opened => opened.readRegion(executableRegion(locator), path));
      regions.set(key, region);
    }
    return region;
  };
}
