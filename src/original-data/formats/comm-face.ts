import { ABSENT_MESSAGE, COMM_FACE_TABLES, COMM_MESSAGES_LIMITS, type CommFaceTable, type CommMessage, type CommMessages } from '../../content/rule-data/comm-messages.ts';
import type { ArchiveEntryRead } from '../archive/archive-reader.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import { SourceError } from '../source-error.ts';
import { parseCommNames } from './comm.ts';
import { entryLocation, PayloadBlock } from './payload-block.ts';

// Directed parsing of the COMMFACE.NOB message tables and the CMOV entries they name (docs/original/formats/executable.md
// RQ4 and RQ9, comm.md §9) into `data/comm-messages` content (P3-03 spec S-18, revision 2), together with the COMM name
// lists. A TABL here is a list of u32 entry IDs from offset 0, one per 4 bytes. Only the fields the logical incoming
// channel needs are read: a CMOV's frame count and each frame's duration, never its text, image or sound.

/** Entry size limits: twice the baseline maxima (a TABL of 340 bytes, a CMOV of 137,556), rounded up to a power of two. */
export const COMM_FACE_SOURCE_LIMITS = Object.freeze({ tableEntryBytes: 1_024, messageEntryBytes: 524_288 });

/** The CMOV block (RQ9): +4 a pointer to the frame records, +8 their i32 count; a frame record's +0 points to its header. */
export const CMOV_LAYOUT = Object.freeze({ frames: 4, frameCount: 8, frameBytes: 0x1c });

/** The entry reads `parseCommMessages` takes; the sub-tables and CMOVs each once, in any order. */
export interface CommMessageSources {
  /** TABL 20011, 20019 and 20985 of COMMFACE.NOB, in that order. */
  readonly faceTables: readonly ArchiveEntryRead[];
  /** TABL 20983. */
  readonly direct: ArchiveEntryRead;
  /** Every sub-table the face tables name. */
  readonly subTables: readonly ArchiveEntryRead[];
  /** Every CMOV the sub-tables and the direct list name. */
  readonly messages: readonly ArchiveEntryRead[];
  /** COMM.NOB TABL 2001 and 2011. */
  readonly names2001: ArchiveEntryRead;
  readonly names2011: ArchiveEntryRead;
}

const mismatch = (location: string, reason: string): never => {
  throw new SourceError('subresource-mismatch', location, reason);
};

/** The u32 entry IDs of a COMMFACE TABL; its size must be whole IDs, and the count is checked before any is read. */
function readIds(archive: DiscPath, read: ArchiveEntryRead, limit: number, list: string): readonly number[] {
  const block = new PayloadBlock(archive, read, COMM_FACE_SOURCE_LIMITS.tableEntryBytes);
  if (read.bytes.length % 4 !== 0) block.unsupported(`/${list}`, 'the table size is not a whole number of entry IDs');
  const count = read.bytes.length / 4;
  block.limit(`/${list}`, 'commTableItems', limit, count);
  return Array.from({ length: count }, (_, index) => block.u32(index * 4, `/${list}[${index}]`));
}

/** The frame durations of a CMOV: at least one frame, each duration a non-negative i32 (spec, 规范 payload). */
function readFrameDurations(archive: DiscPath, read: ArchiveEntryRead): readonly number[] {
  const block = new PayloadBlock(archive, read, COMM_FACE_SOURCE_LIMITS.messageEntryBytes);
  const count = block.i32(CMOV_LAYOUT.frameCount, '/frames');
  if (count < 1) block.unsupported('/frames', 'the message has no frames');
  block.limit('/frames', 'payloadItems', COMM_MESSAGES_LIMITS.frames, count);
  const start = block.target(CMOV_LAYOUT.frames, count * CMOV_LAYOUT.frameBytes, '/frames');
  return Object.freeze(Array.from({ length: count }, (_, frame) => {
    const header = block.target(start + frame * CMOV_LAYOUT.frameBytes, 4, `/frames[${frame}]/header`);
    const duration = block.i32(header, `/frames[${frame}]/duration`);
    if (duration < 0) block.unsupported(`/frames[${frame}]/duration`, 'the duration is negative');
    return duration;
  }));
}

/** The given reads by entry ID; an ID given twice is a mismatch. */
function byId(archive: DiscPath, reads: readonly ArchiveEntryRead[]): Map<number, ArchiveEntryRead> {
  const given = new Map<number, ArchiveEntryRead>();
  for (const read of reads) {
    if (given.has(read.entry.id)) mismatch(entryLocation(archive, read.entry), 'the entry is given twice');
    given.set(read.entry.id, read);
  }
  return given;
}

/**
 * Parses `data/comm-messages` content from the COMMFACE.NOB reads of `faceArchive` and the COMM.NOB name lists of
 * `namesArchive`. The given sub-tables and CMOVs must be exactly those the ID chain names: a face table naming a sub-table
 * that is not given, a table naming a CMOV that is not given, and a given entry the chain does not name are all
 * `subresource-mismatch`. A face whose sub-table ID is 0 is unsupported; a message ID of 0 is an absent message. Each
 * sub-table and CMOV is parsed once, however often the chain names it.
 */
export function parseCommMessages(faceArchive: DiscPath, namesArchive: DiscPath, sources: CommMessageSources): CommMessages {
  if (sources.faceTables.length !== COMM_FACE_TABLES) throw new RangeError('three face tables are required');
  const subTables = byId(faceArchive, sources.subTables);
  const cmovs = byId(faceArchive, sources.messages);
  // Each sub-table and CMOV is parsed once; the keys of these maps are also what the chain named.
  const parsedSubTables = new Map<number, readonly CommMessage[]>();
  const durations = new Map<number, readonly number[]>();
  const once = <T>(cache: Map<number, T>, id: number, parse: () => T): T => {
    if (!cache.has(id)) cache.set(id, parse());
    return cache.get(id)!;
  };
  const message = (id: number, location: string): CommMessage => {
    if (id === 0) return ABSENT_MESSAGE;
    const read = cmovs.get(id) ?? mismatch(location, 'the table names a message entry that is not given');
    return Object.freeze({ present: true, frameDurations: once(durations, id, () => readFrameDurations(faceArchive, read)) });
  };
  const messages = (read: ArchiveEntryRead, limit: number): readonly CommMessage[] => {
    const location = entryLocation(faceArchive, read.entry);
    return Object.freeze(readIds(faceArchive, read, limit, 'messages').map((id, index) => message(id, `${location}/messages[${index}]`)));
  };

  const faceTables = sources.faceTables.map((table): CommFaceTable => {
    const location = entryLocation(faceArchive, table.entry);
    return Object.freeze(readIds(faceArchive, table, COMM_MESSAGES_LIMITS.faces, 'faces').map((id, face) => {
      const at = `${location}/faces[${face}]`;
      if (id === 0) throw new SourceError('unsupported-payload', at, 'the face has no message table');
      const read = subTables.get(id) ?? mismatch(at, 'the table names a sub-table that is not given');
      return once(parsedSubTables, id, () => messages(read, COMM_MESSAGES_LIMITS.faceMessages));
    }));
  });
  const direct = messages(sources.direct, COMM_MESSAGES_LIMITS.directMessages);

  for (const read of sources.subTables) {
    if (!parsedSubTables.has(read.entry.id)) mismatch(entryLocation(faceArchive, read.entry), 'no face table names the sub-table');
  }
  for (const read of sources.messages) {
    if (!durations.has(read.entry.id)) mismatch(entryLocation(faceArchive, read.entry), 'no table names the message entry');
  }
  return Object.freeze({
    faceTables: Object.freeze(faceTables) as unknown as CommMessages['faceTables'],
    direct,
    names2001: parseCommNames(namesArchive, sources.names2001),
    names2011: parseCommNames(namesArchive, sources.names2011),
  });
}
