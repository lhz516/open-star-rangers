import { archiveLocator, isRegionLocator, readSourceMappingTable, type ArchiveEntryLocator, type SourceMappingTable } from '../source-mapping.ts';
import { SourceError } from '../source-error.ts';
import type { ArchiveEntryRead, ImfatArchiveHandle } from '../archive/archive-reader.ts';
import type { VerifiedSource } from './identify-source.ts';

/** Reads the entry a locator names; its failures may carry any location, which verification rewrites. */
export type EntryReader = (locator: ArchiveEntryLocator) => Promise<ArchiveEntryRead>;

/** The default reader: opens each archive of the verified source once and keeps only its directory, never entry bytes. */
function archiveEntryReader(source: VerifiedSource): EntryReader {
  const archives = new Map<string, ImfatArchiveHandle>();
  return async ({ discPath, entry }) => {
    let handle = archives.get(discPath);
    if (!handle) {
      handle = await source.openArchive(discPath);
      archives.set(discPath, handle);
    }
    // An ID beyond u32 cannot be in an archive; the archive handle itself would call it a malformed request.
    if (entry.id > 0xffffffff) throw new SourceError('entry-not-found', 'request.id', 'the archive has no entry with this ID');
    return handle.read(entry.id, entry.type);
  };
}

/** Reads one locator's entry, reporting any P2-03 failure at the locator's structural path instead of its values. */
async function readLocator(readEntry: EntryReader, locator: ArchiveEntryLocator, at: string): Promise<ArchiveEntryRead> {
  try {
    return await readEntry(locator);
  } catch (error) {
    if (error instanceof SourceError) throw new SourceError(error.code, at, error.reason, error.limit);
    throw error;
  }
}

function sameElements(left: ArrayLike<number>, right: ArrayLike<number>): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index++) if (left[index] !== right[index]) return false;
  return true;
}

const sameRead = (left: ArchiveEntryRead, right: ArchiveEntryRead): boolean =>
  left.entry.flags === right.entry.flags
  && left.entry.size === right.entry.size
  && left.entry.relocationCount === right.entry.relocationCount
  && sameElements(left.bytes, right.bytes)
  && sameElements(left.relocations, right.relocations);

/**
 * Verifies a P2-01 source mapping table against a verified source and returns a new frozen table bound to its
 * fingerprint. Every locator's entry must exist with its type and valid relocations in a covered archive; exact
 * alternatives must equal the first in flags, size, relocation count, bytes and relocation positions (P2-01 already
 * guarantees equal types and sub-resources). A region locator's file must be covered, but no bytes are read: its part
 * has one alternative and the step that reads it validates it. Mappings without sub-resource or region locators become
 * `verified`; any with one stay `declared` for the converter that understands the payload. The first failure rejects
 * the whole table.
 * A conversion step passes its own `readEntry` so verification and conversion share each entry read; by default the
 * entries are read here and not kept.
 */
export async function verifySourceMappings(
  value: unknown,
  source: VerifiedSource,
  readEntry: EntryReader = archiveEntryReader(source),
): Promise<SourceMappingTable> {
  const table = readSourceMappingTable(value);
  const { fingerprint } = source.identity;
  if (table.sourceFingerprint !== null && table.sourceFingerprint !== fingerprint) {
    throw new SourceError('fingerprint-mismatch', 'sources.sourceFingerprint', 'the table is bound to another source');
  }
  const covered = new Set<string>(source.identity.files.map(({ path }) => path));
  for (const [index, mapping] of table.mappings.entries()) {
    for (const [part, { alternatives }] of mapping.parts.entries()) {
      const at = (alternative: number) => `sources.mappings[${index}].parts[${part}].alternatives[${alternative}]`;
      // A region part has one alternative; the verified identity answers its coverage without a read.
      const [region] = alternatives;
      if (isRegionLocator(region)) {
        if (!covered.has(region.discPath)) throw new SourceError('path-not-covered', at(0), 'the file is outside the verified whitelist');
        continue;
      }
      const first = await readLocator(readEntry, region, at(0));
      for (let alternative = 1; alternative < alternatives.length; alternative++) {
        const other = await readLocator(readEntry, archiveLocator(alternatives[alternative]), at(alternative));
        if (!sameRead(first, other)) {
          throw new SourceError('alternatives-differ', at(alternative), 'the exact alternatives are not identical');
        }
      }
    }
  }
  return readSourceMappingTable({
    sourceFingerprint: fingerprint,
    mappings: table.mappings.map(mapping => ({
      ...mapping,
      resolution: mapping.parts.some(({ alternatives }) => alternatives.some(({ subresource }) => subresource !== null)) ? 'declared' : 'verified',
    })),
  });
}
