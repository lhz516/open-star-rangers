import type { CommMessages } from '../../content/rule-data/comm-messages.ts';
import { message, syntheticCommMessages, text } from '../../content/rule-data/rule-data.test-support.ts';
import { readCommMessages } from '../../content/rule-data/comm-messages.ts';
import type { ArchiveEntryRead } from '../archive/archive-reader.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import type { SyntheticEntry } from '../synthetic.test-support.ts';
import { CMOV_LAYOUT, type CommMessageSources } from './comm-face.ts';
import { BlockWriter } from './craft.test-support.ts';
import { entryRead, type SyntheticBlock } from './formats.test-support.ts';

// Code-generated synthetic COMMFACE tables, CMOV entries and COMM name lists for P3-10/29 tests, laid out from canonical
// `data/comm-messages` content with the structure of executable.md RQ4 and RQ9 and comm.md §9. They never hold original
// data: entry IDs, durations, names and the bytes the parser skips are arbitrary synthetic values, texts carry MARKER,
// pointers are unaligned and relocation tables out of order.

export const COMMFACE_NOB = 'MAIN/COMMFACE.NOB' as DiscPath;

/** The entry IDs a layout gives its tables: the sub-tables and CMOVs in first-use order. */
export interface CommFaceIds {
  readonly faceTables: readonly [number, number, number];
  readonly direct: number;
  /** One per sub-table, in face table and face order. */
  readonly subTables: readonly number[];
  /** One per present message, in face table, face and index order, then the direct list. */
  readonly messages: readonly number[];
  readonly names2001: number;
  readonly names2011: number;
}

/** A COMMFACE TABL: the u32 entry IDs from offset 0, without relocations. */
export function idTable(ids: readonly number[]): SyntheticBlock {
  const writer = new BlockWriter();
  writer.alloc(ids.length * 4);
  writer.words(0, ids);
  return writer.toBlock();
}

/**
 * A CMOV block (RQ9) of one frame per duration: +0 a pointer to a non-empty text, +4 a pointer to the frame records and
 * +8 their count; each 0x1C-byte record points at +0 to its header and at +8 to sound filler, and each header holds the
 * duration, two filler words and filler image bytes. Headers start at odd offsets and in reverse frame order.
 */
export function syntheticCmov(durations: readonly number[], seed = 1): SyntheticBlock & { readonly frames: number; readonly headers: readonly number[] } {
  const writer = new BlockWriter();
  writer.alloc(16);
  const frames = writer.oddAlloc(durations.length * CMOV_LAYOUT.frameBytes);
  writer.pointer(CMOV_LAYOUT.frames, frames).word(CMOV_LAYOUT.frameCount, durations.length);
  const headers: number[] = [];
  for (let frame = durations.length - 1; frame >= 0; frame--) {
    const header = writer.oddAlloc(12 + 5);
    writer.words(header, [durations[frame], 32 + seed, 24 + frame]);
    writer.pointer(frames + frame * CMOV_LAYOUT.frameBytes, header);
    headers[frame] = header;
  }
  const sound = writer.oddAlloc(7);
  durations.forEach((_, frame) => writer.pointer(frames + frame * CMOV_LAYOUT.frameBytes + 8, sound).word(frames + frame * CMOV_LAYOUT.frameBytes + 12, seed + frame));
  if (writer.length % 2 === 0) writer.alloc(1);
  writer.pointer(0, writer.text(text(12)));
  return { ...writer.toBlock(), frames, headers };
}

/** A COMM name list (comm.md §9): one relocated pointer per name, a null pointer, then the names at odd offsets. */
export function syntheticNameList(names: readonly string[]): SyntheticBlock & { readonly names: readonly number[] } {
  const writer = new BlockWriter();
  writer.alloc((names.length + 1) * 4);
  const at = names.map((name, index) => {
    if (writer.length % 2 === 0) writer.alloc(1);
    const offset = writer.text(name);
    writer.pointer(index * 4, offset);
    return offset;
  });
  return { ...writer.toBlock(), names: at };
}

/** The entries of a layout: the face tables, the direct list, the sub-tables, the CMOVs and the two name lists. */
export interface CommFaceLayout {
  readonly ids: CommFaceIds;
  readonly faceTables: readonly SyntheticEntry[];
  readonly direct: SyntheticEntry;
  readonly subTables: readonly SyntheticEntry[];
  readonly messages: readonly SyntheticEntry[];
  readonly names2001: SyntheticEntry;
  readonly names2011: SyntheticEntry;
}

const entry = (id: number, type: string, { bytes, relocations }: SyntheticBlock): SyntheticEntry => ({ id, type, data: bytes, relocations });

/** The number of sub-tables and of present messages of `content`, the IDs a layout of it needs. */
export function commFaceCounts(content: CommMessages): { readonly subTables: number; readonly messages: number } {
  const subs = content.faceTables.flat();
  const present = [...subs.flat(), ...content.direct].filter(({ present }) => present).length;
  return { subTables: subs.length, messages: present };
}

/** Lays out `content` with `ids`, which must give exactly one ID per sub-table and per present message. */
export function layoutCommFace(content: CommMessages, ids: CommFaceIds): CommFaceLayout {
  const counts = commFaceCounts(content);
  if (counts.subTables !== ids.subTables.length || counts.messages !== ids.messages.length) throw new RangeError('the IDs do not fit the content');
  let sub = 0;
  let next = 0;
  const subTables: SyntheticEntry[] = [];
  const messages: SyntheticEntry[] = [];
  const list = (items: CommMessages['direct']) => idTable(items.map(item => {
    if (!item.present) return 0;
    const id = ids.messages[next++];
    messages.push(entry(id, 'CMOV', syntheticCmov(item.frameDurations, id)));
    return id;
  }));
  const faceTables = content.faceTables.map((table, index) => entry(ids.faceTables[index], 'TABL', idTable(table.map(items => {
    const id = ids.subTables[sub++];
    subTables.push(entry(id, 'TABL', list(items)));
    return id;
  }))));
  return {
    ids,
    faceTables,
    direct: entry(ids.direct, 'TABL', list(content.direct)),
    subTables,
    messages,
    names2001: entry(ids.names2001, 'TABL', syntheticNameList(content.names2001)),
    names2011: entry(ids.names2011, 'TABL', syntheticNameList(content.names2011)),
  };
}

/** Synthetic IDs for `content`: tables from 31_101, sub-tables from 31_201 and CMOVs from 31_401, all odd; names 4_101 and 4_103. */
export function syntheticCommFaceIds(content: CommMessages): CommFaceIds {
  const counts = commFaceCounts(content);
  return {
    faceTables: [31_103, 31_101, 31_107],
    direct: 31_105,
    subTables: Array.from({ length: counts.subTables }, (_, index) => 31_201 + index * 2),
    messages: Array.from({ length: counts.messages }, (_, index) => 31_401 + index * 2),
    names2001: 4_101,
    names2011: 4_103,
  };
}

const read = ({ id, type, data, relocations }: SyntheticEntry): ArchiveEntryRead => entryRead(id, type, { bytes: data, relocations: [...(relocations ?? [])] });

/** The parser's sources of `layout`, as the step reader returns them. */
export function commMessageReads(layout: CommFaceLayout): CommMessageSources {
  return {
    faceTables: layout.faceTables.map(read),
    direct: read(layout.direct),
    subTables: layout.subTables.map(read),
    messages: layout.messages.map(read),
    names2001: read(layout.names2001),
    names2011: read(layout.names2011),
  };
}

/** The content test support's messages, read strictly. */
export const defaultCommMessages = (): CommMessages => readCommMessages(syntheticCommMessages());

/** The synthetic layout of `content`, the default messages unless given. */
export const syntheticCommFace = (content: CommMessages = defaultCommMessages()): CommFaceLayout => layoutCommFace(content, syntheticCommFaceIds(content));

/**
 * Made-up messages for `subTables` sub-tables split 4, 4 and the rest over the face tables, and exactly `messages` present
 * messages: sub-tables of varying length with an absent entry every seventh index, 3 or 4 frames of made-up durations,
 * and the rest in the direct list; names of 1 to 12 bytes.
 */
export function generatedCommMessages(subTables: number, messages: number): CommMessages {
  const split = [4, 4, subTables - 8];
  let remaining = messages;
  let serial = 0;
  const sub = (length: number) => Array.from({ length }, (_, index) => {
    if (index % 7 === 3 || remaining === 0) return { present: false };
    remaining--;
    serial++;
    return message(...Array.from({ length: 3 + (serial % 2) }, (_, frame) => (serial * 5 + frame * 3) % 17 + 1));
  });
  const faceTables = split.map((faces, table) => Array.from({ length: faces }, (_, face) => sub(20 + ((table * 5 + face * 3) % 23))));
  const direct = sub(remaining + Math.ceil(remaining / 6) + 1);
  if (remaining !== 0) throw new RangeError('the messages do not fit');
  return readCommMessages({
    faceTables,
    direct,
    names2001: Array.from({ length: 7 }, (_, index) => text(1 + index)),
    names2011: Array.from({ length: 5 }, (_, index) => text(12 - index)),
  });
}
