import type { ArchiveEntryRead, ImfatArchiveHandle } from '../archive/archive-reader.ts';
import type { ImfatEntry } from '../archive/imfat-rules.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import { SourceError } from '../source-error.ts';
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
