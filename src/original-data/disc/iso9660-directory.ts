import { DiscReadError } from './disc-error.ts';
import { isDiscPath, isDosName, type DiscPath } from './disc-path.ts';
import {
  ASSOCIATED_FLAG, DIRECTORY_FLAG, extentFits, MAX_DIRECTORY_BYTES, readDirectoryRecord, unsupportedFeature, type DirectoryRecord, type DiscExtent,
} from './iso9660-record.ts';
import { readSectors, SECTOR_DATA_BYTES } from './raw-sector.ts';
import type { SourceReader, SourceSnapshot } from './source-reader.ts';

// ISO9660 directories (P2-02 S-05): on-demand path resolution that reads only the directories a path passes through.

/** Records per directory, including `.` and `..`. */
const MAX_DIRECTORY_RECORDS = 1_024;
const MAX_VERSION = 32_767;
const FILE_VERSION = /^(.*);([1-9][0-9]{0,4})$/;

/** A resolved file or directory: frozen, structured-cloneable plain data. */
export interface DiscEntry {
  readonly path: DiscPath;
  readonly kind: 'file' | 'directory';
  readonly byteLength: number;
  readonly firstSector: number;
  /** `ceil(byteLength / 2048)`. */
  readonly sectorCount: number;
}

export interface DirectoryContext {
  readonly reader: SourceReader;
  readonly image: SourceSnapshot;
  readonly volumeSectors: number;
  readonly root: DiscExtent;
}

type Extent = DiscExtent;

// Locations use only the resolved path prefix and a record's index in its directory, never a record's own name.
const directoryAt = (prefix: string): string => `dir:/${prefix}`;
const recordAt = (prefix: string, index: number): string => `${directoryAt(prefix)}[${index}]`;
const invalid = (location: string, reason: string): DiscReadError => new DiscReadError('invalid-directory', location, reason);

/**
 * The name a record can be found by, or undefined when it cannot match: associated records, non-8.3 names, and files
 * without a terminal `;N` version of 1–32767. A file loses its version and then one trailing dot.
 */
function matchableName(record: DirectoryRecord): string | undefined {
  if ((record.flags & ASSOCIATED_FLAG) !== 0) return undefined;
  const text = String.fromCharCode(...record.identifier);
  if ((record.flags & DIRECTORY_FLAG) !== 0) return isDosName(text) ? text : undefined;
  const versioned = FILE_VERSION.exec(text);
  if (!versioned || Number(versioned[2]) > MAX_VERSION) return undefined;
  const name = versioned[1].endsWith('.') ? versioned[1].slice(0, -1) : versioned[1];
  return isDosName(name) ? name : undefined;
}

/** Checks the `.` (0) or `..` (1) record against the extent it must name. */
function checkDotRecord(record: DirectoryRecord, identifier: 0 | 1, expected: Extent, location: string): void {
  if (record.identifier.length !== 1 || record.identifier[0] !== identifier) throw invalid(location, 'must be the . or .. record');
  if ((record.flags & DIRECTORY_FLAG) === 0 || (record.flags & ASSOCIATED_FLAG) !== 0) throw invalid(location, 'must mark a directory');
  if (unsupportedFeature(record)) throw new DiscReadError('unsupported-layout', location, 'the record uses a feature outside the supported layout');
  if (record.extent !== expected.firstSector || record.dataLength !== expected.byteLength) {
    throw invalid(location, 'must name this directory or its parent');
  }
}

/** One step of a lookup: the directory being scanned and the path segment sought in it. */
interface Step {
  readonly directory: Extent;
  readonly parent: Extent;
  readonly prefix: string;
  readonly segment: string;
  readonly last: boolean;
  /** First sectors of the directories already on the path. */
  readonly onPath: ReadonlySet<number>;
}

interface Match {
  readonly kind: DiscEntry['kind'];
  readonly extent: Extent;
}

/**
 * Checks the record matching a path segment where the scan meets it, so its first problem precedes those of later
 * records: features, kind, extent and length, then loops.
 */
function checkMatch(record: DirectoryRecord, at: string, step: Step, volumeSectors: number): Match {
  const resolved = step.prefix === '' ? step.segment : `${step.prefix}/${step.segment}`;
  if (unsupportedFeature(record)) throw new DiscReadError('unsupported-layout', at, 'the entry uses a feature outside the supported layout');
  const isDirectory = (record.flags & DIRECTORY_FLAG) !== 0;
  if (!step.last && !isDirectory) throw new DiscReadError('wrong-entry-kind', directoryAt(resolved), 'a path prefix names a file');
  const extent: Extent = { firstSector: record.extent, byteLength: record.dataLength };
  if (isDirectory && (extent.byteLength < SECTOR_DATA_BYTES || extent.byteLength % SECTOR_DATA_BYTES !== 0)) {
    throw invalid(at, 'a directory must be a positive multiple of 2,048 bytes');
  }
  // An empty file has no extent to check.
  if (extent.byteLength > 0 && !extentFits(extent.firstSector, extent.byteLength, volumeSectors)) {
    throw invalid(at, 'the extent must lie inside the volume');
  }
  if (isDirectory && extent.byteLength > MAX_DIRECTORY_BYTES) {
    throw new DiscReadError('limit-exceeded', directoryAt(resolved), 'the directory is too long', {
      name: 'directoryBytes', limit: MAX_DIRECTORY_BYTES, observed: extent.byteLength,
    });
  }
  if (isDirectory && step.onPath.has(extent.firstSector)) throw new DiscReadError('directory-loop', directoryAt(resolved), 'the directory is already on the path');
  return { kind: isDirectory ? 'directory' : 'file', extent };
}

/**
 * Reads one whole directory, checking every record in byte order, and returns the checked match for the step's segment
 * only after the full scan, so a bad record after the target still fails.
 */
async function findMatch(context: DirectoryContext, step: Step): Promise<Match> {
  const { directory, prefix } = step;
  const sectors = await readSectors(context.reader, context.image, directory.firstSector, directory.byteLength / SECTOR_DATA_BYTES);
  const names = new Set<string>();
  let match: Match | undefined;
  let index = 0;
  for (const sector of sectors) {
    for (let offset = 0; offset < SECTOR_DATA_BYTES;) {
      // A zero length ends the sector's records; anything after it would be hidden data.
      if (sector[offset] === 0) {
        if (sector.subarray(offset).some(byte => byte !== 0)) throw invalid(recordAt(prefix, index), 'a zero-length record must end the sector');
        break;
      }
      if (index === MAX_DIRECTORY_RECORDS) {
        throw new DiscReadError('limit-exceeded', directoryAt(prefix), 'the directory has too many records', {
          name: 'directoryRecords', limit: MAX_DIRECTORY_RECORDS, observed: index + 1,
        });
      }
      const record = readDirectoryRecord(sector, offset, SECTOR_DATA_BYTES);
      if (typeof record === 'string') throw invalid(recordAt(prefix, index), 'is not a valid directory record');
      if (index < 2) {
        checkDotRecord(record, index === 0 ? 0 : 1, index === 0 ? directory : step.parent, recordAt(prefix, index));
      } else {
        const name = matchableName(record);
        if (name !== undefined) {
          if (names.has(name)) throw invalid(recordAt(prefix, index), 'repeats a name in its directory');
          names.add(name);
          if (name === step.segment) match = checkMatch(record, recordAt(prefix, index), step, context.volumeSectors);
        }
      }
      index++;
      offset += record.recordLength;
    }
  }
  if (index < 2) throw invalid(directoryAt(prefix), 'must start with the . and .. records');
  if (!match) throw new DiscReadError('path-not-found', directoryAt(prefix), 'the directory has no entry with the requested name');
  return match;
}

/**
 * Resolves a disc path from the root, reading only the directories it passes through; a final directory is not read.
 * Entering or naming a directory already on the path is a loop. Failures leave the opened image usable; there is no
 * cache.
 */
export async function resolvePath(context: DirectoryContext, path: unknown): Promise<DiscEntry> {
  if (!isDiscPath(path)) throw new DiscReadError('invalid-path', 'path', 'must be 1-8 upper-case 8.3 names separated by /');
  const segments = path.split('/');
  const onPath = new Set([context.root.firstSector]);
  let directory: Extent = context.root;
  let parent: Extent = context.root;
  for (let position = 0; ; position++) {
    const last = position === segments.length - 1;
    const prefix = segments.slice(0, position).join('/');
    const { kind, extent } = await findMatch(context, { directory, parent, prefix, segment: segments[position], last, onPath });
    if (last) {
      return Object.freeze({
        path, kind, byteLength: extent.byteLength, firstSector: extent.firstSector, sectorCount: Math.ceil(extent.byteLength / SECTOR_DATA_BYTES),
      });
    }
    onPath.add(extent.firstSector);
    parent = directory;
    directory = extent;
  }
}
