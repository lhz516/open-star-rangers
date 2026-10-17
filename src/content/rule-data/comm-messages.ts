import { byteStrings, invalid, readInt32, readList, readPlainRecord, readTuple, type ByteString } from './rule-data-fields.ts';

// Canonical content of `data/comm-messages` (P3-03 spec S-18, revision 2): the message metadata the logical incoming
// channel of P3-10 D-03 needs, from COMMFACE.NOB and COMM.NOB (docs/original/formats/executable.md RQ4, RQ7, RQ9 and
// RX1). Each message keeps only whether its table entry is non-zero and the duration of each frame of the CMOV it names;
// images, sounds and texts stay out (G-03). Lookup, face assignment and timing belong to P3-10.

/**
 * Structural limits: twice the baseline maxima, rounded up to a power of two (5 faces per table, 61 messages per face,
 * 85 direct messages, 4 frames per message, 20 names per list and names of 11 bytes).
 */
export const COMM_MESSAGES_LIMITS = Object.freeze({ faces: 16, faceMessages: 128, directMessages: 256, frames: 8, names: 64, nameBytes: 32 });

/** The face tables the lookup `0x3c618` names (RQ4), a fixed count of the format. */
export const COMM_FACE_TABLES = 3;

/** A table entry: 0 (no message) or the CMOV it names, with each frame's +0 header i32 in frame order (RQ9). */
export type CommMessage =
  | { readonly present: false }
  | {
    readonly present: true;
    /** The frames' durations in 1/8 s, as stored; at least one frame. */
    readonly frameDurations: readonly number[];
  };

/** A face table: one sub-table per face, in face order, each the messages of that sub-table in index order. */
export type CommFaceTable = readonly (readonly CommMessage[])[];

export interface CommMessages {
  /** TABL 20011, 20019 and 20985, in that order. */
  readonly faceTables: readonly [CommFaceTable, CommFaceTable, CommFaceTable];
  /** TABL 20983, indexed directly. */
  readonly direct: readonly CommMessage[];
  /** COMM TABL 2001: the names before its null pointer, in list order; a name's position is its name index (RX1). */
  readonly names2001: readonly ByteString[];
  /** COMM TABL 2011, as `names2001`. */
  readonly names2011: readonly ByteString[];
}

const readName = byteStrings(COMM_MESSAGES_LIMITS.nameBytes);

function readNonEmptyName(value: unknown, path: string): ByteString {
  const name = readName(value, path);
  if (name.length === 0) invalid(path, 'must not be empty');
  return name;
}

const readFrameDurations = (value: unknown, path: string): readonly number[] => readList(value, path, COMM_MESSAGES_LIMITS.frames, readInt32, 1);

/** The one frozen absent message, which readers and parsers share. */
export const ABSENT_MESSAGE: CommMessage = Object.freeze({ present: false });

/** `{ present: false }`, or `{ present: true, frameDurations }` with 1 to `frames` non-negative i32 durations. */
function readMessage(value: unknown, path: string): CommMessage {
  const { present } = readPlainRecord(value, path);
  if (present === false) {
    readPlainRecord(value, path, ['present']);
    return ABSENT_MESSAGE;
  }
  if (present !== true) invalid(`${path}.present`, 'must be a boolean');
  const record = readPlainRecord(value, path, ['present', 'frameDurations']);
  return Object.freeze({ present: true, frameDurations: readFrameDurations(record.frameDurations, `${path}.frameDurations`) });
}

const messages = (max: number) => (value: unknown, path: string): readonly CommMessage[] => readList(value, path, max, readMessage);

const readFaceTable = (value: unknown, path: string): CommFaceTable =>
  readList(value, path, COMM_MESSAGES_LIMITS.faces, messages(COMM_MESSAGES_LIMITS.faceMessages));

const readNames = (value: unknown, path: string): readonly ByteString[] => readList(value, path, COMM_MESSAGES_LIMITS.names, readNonEmptyName);

/** Strictly reads `data/comm-messages` content into frozen data isolated from `value`. */
export function readCommMessages(value: unknown, path = 'commMessages'): CommMessages {
  const record = readPlainRecord(value, path, ['faceTables', 'direct', 'names2001', 'names2011']);
  return Object.freeze({
    faceTables: readTuple(record.faceTables, `${path}.faceTables`, COMM_FACE_TABLES, readFaceTable) as CommMessages['faceTables'],
    direct: messages(COMM_MESSAGES_LIMITS.directMessages)(record.direct, `${path}.direct`),
    names2001: readNames(record.names2001, `${path}.names2001`),
    names2011: readNames(record.names2011, `${path}.names2011`),
  });
}
