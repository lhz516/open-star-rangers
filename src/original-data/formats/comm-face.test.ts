import { describe, expect, it } from 'vitest';
import { COMM_MESSAGES_LIMITS, readCommMessages } from '../../content/rule-data/comm-messages.ts';
import { absentMessage, deepFrozen, message, text } from '../../content/rule-data/rule-data.test-support.ts';
import type { SourceErrorCode, SourceLimit } from '../source-error.ts';
import { CMOV_LAYOUT, COMM_FACE_SOURCE_LIMITS, parseCommMessages } from './comm-face.ts';
import {
  COMMFACE_NOB, commMessageReads, defaultCommMessages, generatedCommMessages, idTable, syntheticCmov, syntheticCommFace,
  syntheticCommFaceIds, syntheticNameList, type CommFaceLayout,
} from './comm-face.test-support.ts';
import { COMM_NAME_LIST_ENTRY_BYTES } from './comm.ts';
import { COMM_NOB } from './comm.test-support.ts';
import { expectSourceError, resized } from './craft.test-support.ts';
import type { SyntheticBlock } from './formats.test-support.ts';
import type { SyntheticEntry } from '../synthetic.test-support.ts';

// P3-10/29 (P3-03 AC-22, AC-11 and AC-14 for revision 2): code-generated COMMFACE tables, CMOVs and COMM name lists only.

const parse = (layout: CommFaceLayout) => parseCommMessages(COMMFACE_NOB, COMM_NOB, commMessageReads(layout));
const at = (id: number, path = '') => `archive:/${COMMFACE_NOB}#${id}${path}`;
const atNames = (id: number, path = '') => `archive:/${COMM_NOB}#${id}${path}`;
const block = ({ data, relocations }: SyntheticEntry): SyntheticBlock => ({ bytes: data, relocations: [...(relocations ?? [])] });
const withBlock = (entry: SyntheticEntry, { bytes, relocations }: SyntheticBlock): SyntheticEntry => ({ ...entry, data: bytes, relocations });
const times = <T>(count: number, make: (index: number) => T): T[] => Array.from({ length: count }, (_, index) => make(index));

/** The default layout with its first CMOV replaced by `cmov`. */
function withFirstMessage(cmov: SyntheticBlock): CommFaceLayout {
  const layout = syntheticCommFace();
  return { ...layout, messages: [withBlock(layout.messages[0], cmov), ...layout.messages.slice(1)] };
}

const expectFailure = (layout: CommFaceLayout, code: SourceErrorCode, location: string, limit?: SourceLimit) =>
  expectSourceError(() => parse(layout), code, location, limit);


describe('COMMFACE message parsing', () => {
  it('converts the face tables, the direct list and the name lists as stored', () => {
    // The synthetic names are drawable HUD text; these keep bytes 0x80 and 0xFF.
    const plain = defaultCommMessages();
    const content = readCommMessages({
      ...plain,
      names2001: plain.names2001.map((name, index) => (index === 0 ? `\x80${name.slice(1)}` : index === 2 ? `${name.slice(0, -1)}\xff` : name)),
    });
    const parsed = parse(syntheticCommFace(content));
    expect(parsed).toEqual(content);
    expect(deepFrozen(parsed)).toBe(true);
    expect(readCommMessages(parsed)).toEqual(parsed);
    // Several faces, absent entries, 1 to 4 frames, and names that keep 0x80 and 0xFF.
    expect(parsed.faceTables.map(table => table.length)).toEqual([2, 1, 3]);
    expect(parsed.faceTables[0][0]).toEqual([message(3, 9, 2), absentMessage(), message(0, 1, 7, 0x7fff_ffff)]);
    expect(parsed.faceTables[1][0]).toEqual([absentMessage(), message(10, 1, 1)]);
    expect(parsed.names2001[2]).toBe(`${text(31)}\xff`);
    expect([...parsed.names2001[2]].map(character => character.charCodeAt(0))).toContain(0xff);
    expect(parsed.names2001[0].charCodeAt(0)).toBe(0x80);
  });

  it('follows the input: the generated production-sized content with 3 and 4 frames', () => {
    const content = generatedCommMessages(13, 481);
    expect(parse(syntheticCommFace(content))).toEqual(content);
    const frames = new Set([...content.faceTables.flat(2), ...content.direct].flatMap(item => (item.present ? [item.frameDurations.length] : [])));
    expect([...frames].sort()).toEqual([3, 4]);
  });

  it('parses a sub-table or CMOV named more than once once, and pairs each face table with its position', () => {
    const layout = syntheticCommFace();
    const twice = idTable([layout.ids.subTables[0], layout.ids.subTables[1], layout.ids.subTables[0]]);
    // The direct list names its own three CMOVs, the first twice, and the face tables' third CMOV.
    const { messages } = layout.ids;
    const direct = idTable([messages[7], 0, messages[7], messages[8], messages[9], messages[2]]);
    const parsed = parse({ ...layout, faceTables: [withBlock(layout.faceTables[0], twice), ...layout.faceTables.slice(1)], direct: withBlock(layout.direct, direct) });
    expect(parsed.faceTables[0][2]).toBe(parsed.faceTables[0][0]);
    expect(parsed.direct[0]).toEqual(parsed.direct[2]);
    expect(parsed.direct[5]).toEqual(parsed.faceTables[0][1][0]);
    const swapped = parse({ ...layout, faceTables: [layout.faceTables[2], layout.faceTables[1], layout.faceTables[0]] });
    expect(swapped.faceTables[0]).toEqual(parsed.faceTables[2]);
  });

  describe('ID chain', () => {
    const layout = syntheticCommFace();
    const { ids } = layout;

    it.each([
      ['a sub-table that is not given', { ...layout, subTables: layout.subTables.slice(1) }, at(ids.faceTables[0], '/faces[0]')],
      ['a sub-table no face table names', { ...layout, subTables: [...layout.subTables, { ...layout.subTables[0], id: 31_999 }] }, at(31_999)],
      ['a sub-table given twice', { ...layout, subTables: [...layout.subTables, layout.subTables[2]] }, at(ids.subTables[2])],
      ['a message that is not given', { ...layout, messages: layout.messages.filter(({ id }) => id !== ids.messages[3]) },
        at(ids.subTables[2], '/messages[1]')],
      ['a message no table names', { ...layout, messages: [...layout.messages, { ...layout.messages[0], id: 31_997 }] }, at(31_997)],
      ['a message given twice', { ...layout, messages: [layout.messages[1], ...layout.messages] }, at(ids.messages[1])],
      ['a face table naming the direct list', {
        ...layout, faceTables: [withBlock(layout.faceTables[0], idTable([ids.direct])), ...layout.faceTables.slice(1)],
      }, at(ids.faceTables[0], '/faces[0]')],
      ['a sub-table naming another sub-table', {
        ...layout, subTables: [withBlock(layout.subTables[0], idTable([ids.subTables[1]])), ...layout.subTables.slice(1)],
      }, at(ids.subTables[0], '/messages[0]')],
    ])('rejects %s as a subresource mismatch', (_, changed, location) => {
      expectFailure(changed as CommFaceLayout, 'subresource-mismatch', location);
    });

    it('rejects a face without a sub-table as unsupported', () => {
      const faces = idTable([ids.subTables[0], 0]);
      expectFailure({ ...layout, faceTables: [withBlock(layout.faceTables[0], faces), ...layout.faceTables.slice(1)] }, 'unsupported-payload',
        at(ids.faceTables[0], '/faces[1]'));
    });
  });

  describe('CMOV frames', () => {
    const first = () => syntheticCommFace().messages[0];
    const location = (path: string) => at(first().id, path);

    it.each([
      ['no frames', 0, 'unsupported-payload'],
      ['a negative frame count', -1, 'unsupported-payload'],
    ] as const)('rejects %s', (_, count, code) => {
      const cmov = syntheticCmov([5, 6, 7]);
      new DataView(cmov.bytes.buffer).setInt32(CMOV_LAYOUT.frameCount, count, true);
      expectFailure(withFirstMessage(cmov), code, location('/frames'));
    });

    it('rejects a negative duration as unsupported and keeps 0 and 2³¹−1', () => {
      expectFailure(withFirstMessage(syntheticCmov([5, -1, 7])), 'unsupported-payload', location('/frames[1]/duration'));
      expect(parse(withFirstMessage(syntheticCmov([0, 0x7fff_ffff, 1]))).faceTables[0][0][0]).toEqual(message(0, 0x7fff_ffff, 1));
    });

    it('passes the frame limit exactly and fails one frame above it, before reading the frames', () => {
      const limit = COMM_MESSAGES_LIMITS.frames;
      expect(parse(withFirstMessage(syntheticCmov(times(limit, index => index + 1)))).faceTables[0][0][0]).toEqual(message(...times(limit, index => index + 1)));
      const over = syntheticCmov([1, 2, 3]);
      new DataView(over.bytes.buffer).setInt32(CMOV_LAYOUT.frameCount, limit + 1, true);
      expectFailure(withFirstMessage(over), 'limit-exceeded', location('/frames'), { name: 'payloadItems', limit, observed: limit + 1 });
    });

    it.each([
      ['frame records beyond the block', (cmov: ReturnType<typeof syntheticCmov>) => {
        new DataView(cmov.bytes.buffer).setUint32(CMOV_LAYOUT.frames, cmov.bytes.length - CMOV_LAYOUT.frameBytes + 1, true);
      }, '/frames'],
      ['a frame pointer outside the relocations', (cmov: ReturnType<typeof syntheticCmov>) => {
        cmov.relocations = cmov.relocations.filter(offset => offset !== cmov.frames + CMOV_LAYOUT.frameBytes);
      }, '/frames[1]/header'],
      ['a null frame header', (cmov: ReturnType<typeof syntheticCmov>) => {
        cmov.relocations = cmov.relocations.filter(offset => offset !== cmov.frames);
        new DataView(cmov.bytes.buffer).setUint32(cmov.frames, 0, true);
      }, '/frames[0]/header'],
      ['a frame header beyond the block', (cmov: ReturnType<typeof syntheticCmov>) => {
        new DataView(cmov.bytes.buffer).setUint32(cmov.frames + 2 * CMOV_LAYOUT.frameBytes, cmov.bytes.length - 3, true);
      }, '/frames[2]/header'],
      ['a relocation over a duration', (cmov: ReturnType<typeof syntheticCmov>) => { cmov.relocations.push(cmov.headers[1] + 1); }, '/frames[1]/duration'],
      ['a block cut before its frame count', (cmov: ReturnType<typeof syntheticCmov>) => {
        Object.assign(cmov, resized(cmov, CMOV_LAYOUT.frameCount + 2), { relocations: [CMOV_LAYOUT.frames] });
      }, '/frames'],
    ])('rejects %s as invalid', (_, corrupt, path) => {
      const cmov = syntheticCmov([4, 4, 4]);
      corrupt(cmov);
      expectFailure(withFirstMessage(cmov), 'invalid-payload', location(path));
    });

    it('rejects a CMOV entry above its size limit before reading it', () => {
      const limit = COMM_FACE_SOURCE_LIMITS.messageEntryBytes;
      expect(parse(withFirstMessage(resized(syntheticCmov([2, 3, 4]), limit))).faceTables[0][0][0]).toEqual(message(2, 3, 4));
      expectFailure(withFirstMessage(resized(syntheticCmov([2, 3, 4]), limit + 1)), 'limit-exceeded', location(''),
        { name: 'payloadEntryBytes', limit, observed: limit + 1 });
    });
  });

  describe('tables', () => {
    const layout = syntheticCommFace();
    const { ids } = layout;
    const idsOf = (entry: SyntheticEntry) => [...new Uint32Array(entry.data.slice().buffer)];
    /** `entry` with its IDs padded to `count` by `fill`. */
    const padded = (entry: SyntheticEntry, count: number, fill: number) =>
      withBlock(entry, idTable([...idsOf(entry), ...times(count - idsOf(entry).length, () => fill)]));
    const CASES = [
      ['faces of a face table', COMM_MESSAGES_LIMITS.faces, at(ids.faceTables[1], '/faces'),
        (count: number) => ({ ...layout, faceTables: layout.faceTables.map((entry, index) => (index === 1 ? padded(entry, count, ids.subTables[0]) : entry)) })],
      ['messages of a sub-table', COMM_MESSAGES_LIMITS.faceMessages, at(ids.subTables[0], '/messages'),
        (count: number) => ({ ...layout, subTables: [padded(layout.subTables[0], count, 0), ...layout.subTables.slice(1)] })],
      ['messages of the direct list', COMM_MESSAGES_LIMITS.directMessages, at(ids.direct, '/messages'),
        (count: number) => ({ ...layout, direct: padded(layout.direct, count, 0) })],
    ] as const;

    it.each(CASES)('passes the limit of %s exactly and fails one above it', (_, limit, location, build) => {
      expect(() => parse(build(limit))).not.toThrow();
      const observed = limit + 1;
      // A list one ID above a limit that fills the entry limit already fails the entry size, before the entry is read.
      if (observed * 4 > COMM_FACE_SOURCE_LIMITS.tableEntryBytes) {
        expectFailure(build(observed), 'limit-exceeded', location.replace(/\/\w+$/, ''),
          { name: 'payloadEntryBytes', limit: COMM_FACE_SOURCE_LIMITS.tableEntryBytes, observed: observed * 4 });
      } else {
        expectFailure(build(observed), 'limit-exceeded', location, { name: 'commTableItems', limit, observed });
      }
    });

    it('rejects a table whose size is not whole entry IDs, and a relocation in a table', () => {
      const layout = syntheticCommFace();
      const cut = resized(block(layout.direct), layout.direct.data.length - 1);
      expectFailure({ ...layout, direct: withBlock(layout.direct, cut) }, 'unsupported-payload', at(layout.ids.direct, '/messages'));
      const relocated = { ...block(layout.subTables[0]), relocations: [4] };
      expectFailure({ ...layout, subTables: [withBlock(layout.subTables[0], relocated), ...layout.subTables.slice(1)] }, 'invalid-payload',
        at(layout.ids.subTables[0], '/messages[1]'));
    });
  });

  describe('name lists', () => {
    const ids = syntheticCommFaceIds(defaultCommMessages());
    const withNames = (names: SyntheticBlock) => {
      const layout = syntheticCommFace();
      return { ...layout, names2011: withBlock(layout.names2011, names) };
    };

    it('passes the name count and byte limits exactly and fails one above them', () => {
      const { names, nameBytes } = COMM_MESSAGES_LIMITS;
      expect(parse(withNames(syntheticNameList(times(names, () => text(1))))).names2011).toHaveLength(names);
      expectFailure(withNames(syntheticNameList(times(names + 1, () => text(1)))), 'limit-exceeded', atNames(ids.names2011, '/names'),
        { name: 'commNames', limit: names, observed: names + 1 });
      // A malformed pointer one above the limit is still one name too many.
      const malformed = syntheticNameList(times(names + 1, () => text(1)));
      expectFailure(withNames({ ...malformed, relocations: malformed.relocations.filter(offset => offset !== names * 4) }), 'limit-exceeded',
        atNames(ids.names2011, '/names'), { name: 'commNames', limit: names, observed: names + 1 });
      expect(parse(withNames(syntheticNameList([text(nameBytes)]))).names2011).toEqual([text(nameBytes)]);
      expectFailure(withNames(syntheticNameList([text(1), text(nameBytes + 1)])), 'limit-exceeded', atNames(ids.names2011, '/names[1]'),
        { name: 'textBytes', limit: nameBytes, observed: nameBytes + 1 });
    });

    it.each([
      ['a list without its null pointer', () => {
        const list = syntheticNameList([text(3), text(4)]);
        return { ...resized(list, 8), relocations: list.relocations };
      }, 'invalid-payload', '/names[2]'],
      ['a name without its NUL', () => {
        const list = syntheticNameList([text(3), text(4)]);
        return resized(list, list.bytes.length - 1);
      }, 'invalid-payload', '/names[1]'],
      ['a name pointer into the list', () => {
        const list = syntheticNameList([text(3), text(4)]);
        new DataView(list.bytes.buffer).setUint32(4, 4, true);
        return list;
      }, 'unsupported-payload', '/names[1]'],
      ['an empty name', () => syntheticNameList([text(3), '']), 'unsupported-payload', '/names[1]'],
      ['a name pointer outside the relocations', () => {
        const list = syntheticNameList([text(3), text(4)]);
        return { ...list, relocations: list.relocations.filter(offset => offset !== 4) };
      }, 'invalid-payload', '/names[1]'],
    ] as const)('rejects %s', (_, build, code, path) => {
      expectFailure(withNames(build()), code, atNames(ids.names2011, path));
    });

    it('rejects a name list above its entry limit before reading it', () => {
      const list = resized(syntheticNameList([text(3)]), COMM_NAME_LIST_ENTRY_BYTES + 1);
      expectFailure(withNames({ ...list, relocations: [0] }), 'limit-exceeded', atNames(ids.names2011),
        { name: 'payloadEntryBytes', limit: COMM_NAME_LIST_ENTRY_BYTES, observed: COMM_NAME_LIST_ENTRY_BYTES + 1 });
    });
  });

  it('derives the entry limits as twice the recorded observations, rounded up to a power of two', () => {
    const derive = (observed: number) => 2 ** Math.ceil(Math.log2(2 * observed));
    expect(COMM_FACE_SOURCE_LIMITS).toEqual({ tableEntryBytes: derive(340), messageEntryBytes: derive(137_556) });
    expect(COMM_NAME_LIST_ENTRY_BYTES).toBe(derive(229));
  });
});
