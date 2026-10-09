import { describe, expect, it } from 'vitest';
import { directoryData, ISO_DIRECTORY_FLAG, primaryVolumeDescriptor, volumeDescriptor } from '../synthetic.test-support.ts';
import { isDiscPath } from './disc-path.ts';
import { openDiscImage } from './disc-image.ts';
import {
  failure, failureOf, fileRecord, MARKER, parentRecord, requestedLbas, ROOT_LBA, rootRecord, selfRecord, subdirectoryRecord, syntheticDisc,
} from './disc.test-support.ts';

const SECTORS = 200;
const MAIN = 60;
const SUB = 61;
const DATA = 100;

interface Directory {
  readonly lba: number;
  readonly parent: number;
  /** Records after `.` and `..`. */
  readonly entries: readonly Uint8Array[];
  /** Declared length; defaults to the packed records rounded up to whole sectors. */
  readonly byteLength?: number;
}

const baseDirectories = (): Directory[] => [
  { lba: ROOT_LBA, parent: ROOT_LBA, entries: [subdirectoryRecord('MAIN', MAIN), fileRecord('README.TXT;1', DATA, 100), fileRecord('EMPTY.DAT;1', 0xffff_ffff, 0)] },
  { lba: MAIN, parent: ROOT_LBA, entries: [fileRecord('SR.NOB;1', DATA + 1, 5_000), subdirectoryRecord('SUB', SUB)] },
  { lba: SUB, parent: MAIN, entries: [fileRecord('DEEP.BIN;32767', DATA + 5, 10)] },
];

/** Replaces the entries of the directory at `lba`. */
const withEntries = (directories: Directory[], lba: number, entries: (current: readonly Uint8Array[]) => Uint8Array[]): Directory[] =>
  directories.map(directory => (directory.lba === lba ? { ...directory, entries: entries(directory.entries) } : directory));

/** Packs each directory with `.` and `..` records that name its own and its parent's extent and length. */
function packDirectories(directories: readonly Directory[]): Map<number, Uint8Array> {
  const lengthOf = (directory: Directory): number =>
    directory.byteLength ?? directoryData([selfRecord(0), parentRecord(0), ...directory.entries]).length;
  const lengths = new Map(directories.map(directory => [directory.lba, lengthOf(directory)]));
  return new Map(directories.map(directory => {
    const length = lengths.get(directory.lba)!;
    const records = [selfRecord(directory.lba, length), parentRecord(directory.parent, lengths.get(directory.parent) ?? 2_048), ...directory.entries];
    return [directory.lba, directoryData(records, length)];
  }));
}

/** Opens a disc holding `directories`; `data` overrides a directory's packed bytes. */
async function openDisc(directories: readonly Directory[], data: ReadonlyMap<number, Uint8Array> = new Map(), sectorCount = SECTORS) {
  const packed = packDirectories(directories);
  for (const [lba, bytes] of data) packed.set(lba, bytes);
  const sectors = new Map([[16, primaryVolumeDescriptor(sectorCount, rootRecord(ROOT_LBA, packed.get(ROOT_LBA)!.length))], [17, volumeDescriptor(255)]]);
  for (const [lba, bytes] of packed) {
    for (let offset = 0; offset < bytes.length; offset += 2_048) sectors.set(lba + offset / 2_048, bytes.subarray(offset, offset + 2_048));
  }
  const disc = syntheticDisc(sectorCount, sectors);
  return { ...disc, opened: await openDiscImage(disc.files) };
}

async function lookupFailure(directories: readonly Directory[], path: string, data?: ReadonlyMap<number, Uint8Array>) {
  const { opened } = await openDisc(directories, data);
  return failure(() => opened.lookup(path));
}

/** File records named `F0000.DAT;1` upward, 44 bytes each. */
const fillers = (count: number, from = 0): Uint8Array[] =>
  Array.from({ length: count }, (_, index) => fileRecord(`F${String(from + index).padStart(4, '0')}.DAT;1`, DATA, 1));

describe('path resolution', () => {
  it('resolves a nested file to a frozen entry, reading only the directories on the path', async () => {
    const { image, opened } = await openDisc(baseDirectories());
    const entry = await opened.lookup('MAIN/SR.NOB');
    expect(entry).toEqual({ path: 'MAIN/SR.NOB', kind: 'file', byteLength: 5_000, firstSector: DATA + 1, sectorCount: 3 });
    expect(Object.isFrozen(entry) && structuredClone(entry)).toEqual(entry);
    expect(requestedLbas(image)).toEqual([16, 17, ROOT_LBA, MAIN]);
  });

  it('resolves a directory without reading it, and a deep file with the largest version', async () => {
    const { image, opened } = await openDisc(baseDirectories());
    expect(await opened.lookup('MAIN/SUB')).toEqual({ path: 'MAIN/SUB', kind: 'directory', byteLength: 2_048, firstSector: SUB, sectorCount: 1 });
    expect(requestedLbas(image)).toEqual([16, 17, ROOT_LBA, MAIN]);
    expect((await opened.lookup('MAIN/SUB/DEEP.BIN')).byteLength).toBe(10);
  });

  it('resolves an empty file without checking its extent', async () => {
    const { opened } = await openDisc(baseDirectories());
    expect(await opened.lookup('EMPTY.DAT')).toEqual({ path: 'EMPTY.DAT', kind: 'file', byteLength: 0, firstSector: 0xffff_ffff, sectorCount: 0 });
  });

  it('matches version 1 and a trailing dot, past siblings that can never match', async () => {
    const siblings = [
      fileRecord('readme.txt;1', DATA, 1), fileRecord('LONGFILENAME.TXT;1', DATA, 1), fileRecord(`${MARKER};1`, DATA, 1),
      fileRecord('NOVER.TXT', DATA, 1), fileRecord('V0.TXT;0', DATA, 1), fileRecord('V32768.TXT;32768', DATA, 1),
      fileRecord('V01.TXT;01', DATA, 1), fileRecord('VX.TXT;X', DATA, 1), fileRecord('VEMPTY.TXT;', DATA, 1),
      subdirectoryRecord('DIR.VER;1', DATA), subdirectoryRecord('lower', DATA),
      fileRecord('README.TXT;1', DATA, 1, { flags: 0x04 }),
      fileRecord('ODD.TXT;1', 0xffff_ffff, 1, { flags: 0x80, extendedAttributeLength: 9 }),
      fileRecord('NOEXT.;1', DATA + 2, 7),
    ];
    const { opened } = await openDisc(withEntries(baseDirectories(), ROOT_LBA, entries => [...entries, ...siblings]));
    expect((await opened.lookup('README.TXT')).byteLength).toBe(100);
    expect((await opened.lookup('NOEXT')).byteLength).toBe(7);
    for (const unmatchable of ['V0.TXT', 'V32768.TXT', 'V01.TXT', 'VX.TXT', 'VEMPTY.TXT', 'NOVER.TXT', 'DIR.VER', 'LONGFILENAME.TXT']) {
      expect((await failure(() => opened.lookup(unmatchable))).code).toBe(isDiscPath(unmatchable) ? 'path-not-found' : 'invalid-path');
    }
  });

  it('accepts a hidden target', async () => {
    const { opened } = await openDisc(withEntries(baseDirectories(), MAIN, () => [fileRecord('SR.NOB;1', DATA, 3, { flags: 0x01 })]));
    expect((await opened.lookup('MAIN/SR.NOB')).byteLength).toBe(3);
  });

  it('caches nothing: repeating a lookup gives the same entry and reads and meters again', async () => {
    const { image, opened } = await openDisc(baseDirectories());
    const first = await opened.lookup('MAIN/SR.NOB');
    const used = opened.usage().sourceReadBytes;
    expect(await opened.lookup('MAIN/SR.NOB')).toEqual(first);
    expect(opened.usage().sourceReadBytes - used).toBe(2 * 2_352);
    expect(requestedLbas(image)).toEqual([16, 17, ROOT_LBA, MAIN, ROOT_LBA, MAIN]);
  });

  it('keeps a handle usable after a failed lookup', async () => {
    const directories = withEntries(baseDirectories(), ROOT_LBA, entries => [...entries, subdirectoryRecord('BAD', DATA + 20)]);
    const { opened } = await openDisc(directories);
    const before = await opened.lookup('MAIN/SR.NOB');
    expect((await failure(() => opened.lookup('BAD/X'))).code).toBe('invalid-directory');
    expect(await opened.lookup('MAIN/SR.NOB')).toEqual(before);
  });
});

describe('path failures', () => {
  it.each([
    'main/sr.nob', 'A/B/C/D/E/F/G/H/I', 'MAIN/../SR.NOB', 'MAIN//SR.NOB', 'MAIN\\SR.NOB', '/MAIN', '', 'SR.NOB;1',
  ])('rejects the path %j before reading a directory', async path => {
    const { image, opened } = await openDisc(baseDirectories());
    expect(await failure(() => opened.lookup(path))).toEqual(failureOf('invalid-path', 'path'));
    expect(requestedLbas(image)).toEqual([16, 17]);
  });

  it('rejects a path that is not text', async () => {
    const { opened } = await openDisc(baseDirectories());
    expect(await failure(() => opened.lookup(1 as unknown as string))).toEqual(failureOf('invalid-path', 'path'));
  });

  it.each([
    ['MISSING', 'dir:/'],
    ['MAIN/MISSING', 'dir:/MAIN'],
  ])('reports %s as not found in its directory', async (path, location) => {
    expect(await lookupFailure(baseDirectories(), path)).toEqual(failureOf('path-not-found', location));
  });

  it('rejects a file used as a directory', async () => {
    expect(await lookupFailure(baseDirectories(), 'README.TXT/X')).toEqual(failureOf('wrong-entry-kind', 'dir:/README.TXT'));
  });
});

describe('directory records', () => {
  /** The base root with one more record after the target's directory entry; looked up through `MAIN/SR.NOB`. */
  const rootWith = (record: Uint8Array): Directory[] => withEntries(baseDirectories(), ROOT_LBA, entries => [...entries, record]);
  const edited = (record: Uint8Array, edit: (bytes: Uint8Array) => void): Uint8Array => {
    const copy = record.slice();
    edit(copy);
    return copy;
  };
  const sibling = (): Uint8Array => fileRecord('AB;1', DATA, 1);

  it.each([
    ['a record under 34 bytes', edited(sibling(), bytes => { bytes[0] = 32; })],
    ['an odd record length', edited(sibling(), bytes => { bytes[0] += 1; })],
    ['differing extent copies', edited(sibling(), bytes => { bytes[2] ^= 1; })],
    ['differing data length copies', edited(sibling(), bytes => { bytes[17] ^= 1; })],
    ['differing volume sequence copies', edited(sibling(), bytes => { bytes[28] ^= 1; })],
    ['an empty identifier', edited(sibling(), bytes => { bytes[32] = 0; })],
    ['an identifier past the record', edited(fileRecord(`${MARKER};1`, DATA, 1), bytes => { bytes[32] = 60; })],
    ['nonzero identifier padding', edited(sibling(), bytes => { bytes[37] = 1; })],
  ])('rejects %s even after the target', async (_case, record) => {
    expect(await lookupFailure(rootWith(record), 'MAIN/SR.NOB')).toEqual(failureOf('invalid-directory', 'dir:/[5]'));
  });

  it('rejects a record that crosses the end of a sector', async () => {
    const entries = [...baseDirectories()[0].entries, ...fillers(42)];
    const packed = packDirectories(withEntries(baseDirectories(), ROOT_LBA, () => entries)).get(ROOT_LBA)!;
    const end = [selfRecord(0), parentRecord(0), ...entries].reduce((total, record) => total + record.length, 0);
    expect(2_048 - end).toBeGreaterThan(0);
    expect(2_048 - end).toBeLessThan(44);
    packed.set(fillers(1, 99).at(0)!.subarray(0, 2_048 - end), end);
    expect(await lookupFailure(baseDirectories(), 'MAIN/SR.NOB', new Map([[ROOT_LBA, packed]])))
      .toEqual(failureOf('invalid-directory', `dir:/[${entries.length + 2}]`));
  });

  it('rejects hidden bytes after a zero-length record', async () => {
    const packed = packDirectories(baseDirectories()).get(ROOT_LBA)!;
    packed[2_000] = 1;
    expect(await lookupFailure(baseDirectories(), 'MAIN/SR.NOB', new Map([[ROOT_LBA, packed]]))).toEqual(failureOf('invalid-directory', 'dir:/[5]'));
  });

  it('continues into the next sector after zero padding', async () => {
    const entries = [...baseDirectories()[0].entries, ...fillers(43), fileRecord('NEXT.DAT;1', DATA, 9)];
    const { opened } = await openDisc(withEntries(baseDirectories(), ROOT_LBA, () => entries));
    expect((await opened.lookup('NEXT.DAT')).byteLength).toBe(9);
  });

  it.each([
    ['a . record with the wrong identifier', MAIN, 0, () => parentRecord(MAIN)],
    ['a . record that is a file', MAIN, 0, () => selfRecord(MAIN, 2_048, { flags: 0 })],
    ['a . record naming another extent', MAIN, 0, () => selfRecord(SUB)],
    ['a . record with another length', MAIN, 0, () => selfRecord(MAIN, 4_096)],
    ['a .. record with the wrong identifier', MAIN, 1, () => selfRecord(ROOT_LBA)],
    ['a .. record naming another directory', MAIN, 1, () => parentRecord(MAIN)],
    ['an associated .. record', MAIN, 1, () => parentRecord(ROOT_LBA, 2_048, { flags: ISO_DIRECTORY_FLAG | 0x04 })],
  ])('rejects %s', async (_case, lba, index, record) => {
    const packed = packDirectories(baseDirectories()).get(lba)!;
    const offset = index === 0 ? 0 : 34;
    packed.set(record(), offset);
    expect(await lookupFailure(baseDirectories(), 'MAIN/SR.NOB', new Map([[lba, packed]]))).toEqual(failureOf('invalid-directory', `dir:/MAIN[${index}]`));
  });

  it('rejects a directory without . and .. records', async () => {
    expect(await lookupFailure(baseDirectories(), 'MAIN/SR.NOB', new Map([[MAIN, new Uint8Array(2_048)]]))).toEqual(failureOf('invalid-directory', 'dir:/MAIN'));
  });

  it('rejects a . record that uses an unsupported feature', async () => {
    const packed = packDirectories(baseDirectories()).get(MAIN)!;
    packed.set(selfRecord(MAIN, 2_048, { flags: ISO_DIRECTORY_FLAG | 0x80 }), 0);
    expect(await lookupFailure(baseDirectories(), 'MAIN/SR.NOB', new Map([[MAIN, packed]]))).toEqual(failureOf('unsupported-layout', 'dir:/MAIN[0]'));
  });

  it.each([
    ['the same name twice', fileRecord('SR.NOB;1', DATA, 1)],
    ['another version of the name', fileRecord('SR.NOB;2', DATA, 1)],
    ['the name with a trailing dot', fileRecord('SR.NOB.;1', DATA, 1)],
    ['a directory of the same name', subdirectoryRecord('SR.NOB', DATA)],
  ])('rejects %s instead of choosing one', async (_case, record) => {
    const directories = withEntries(baseDirectories(), MAIN, entries => [...entries, record]);
    expect(await lookupFailure(directories, 'MAIN/SUB')).toEqual(failureOf('invalid-directory', 'dir:/MAIN[4]'));
  });
});

describe('directory loops and targets', () => {
  it.each([
    ['its own directory', 'MAIN/LOOP', 'dir:/MAIN/LOOP'],
    ['the root', 'MAIN/UP/MAIN', 'dir:/MAIN/UP'],
    ['the root, named directly', 'MAIN/UP', 'dir:/MAIN/UP'],
  ])('rejects a directory that names %s', async (_case, path, location) => {
    const directories = withEntries(baseDirectories(), MAIN, entries => [...entries, subdirectoryRecord('LOOP', MAIN), subdirectoryRecord('UP', ROOT_LBA)]);
    expect(await lookupFailure(directories, path)).toEqual(failureOf('directory-loop', location));
  });

  it.each([
    ['an extended attribute record', { extendedAttributeLength: 1 }],
    ['record format', { flags: 0x08 }],
    ['protection', { flags: 0x10 }],
    ['a reserved flag', { flags: 0x20 }],
    ['the other reserved flag', { flags: 0x40 }],
    ['multi-extent', { flags: 0x80 }],
    ['interleaving', { fileUnitSize: 1, interleaveGap: 2 }],
    ['another volume of the set', { volumeSequenceNumber: 2 }],
  ])('rejects a target that uses %s', async (_case, fields) => {
    const directories = withEntries(baseDirectories(), MAIN, entries => [fileRecord('SR.NOB;1', DATA, 10, fields), entries[1]]);
    expect(await lookupFailure(directories, 'MAIN/SR.NOB')).toEqual(failureOf('unsupported-layout', 'dir:/MAIN[2]'));
  });

  it('rejects an intermediate directory that uses an unsupported feature', async () => {
    const directories = withEntries(baseDirectories(), ROOT_LBA, entries => [subdirectoryRecord('MAIN', MAIN, 2_048, { flags: ISO_DIRECTORY_FLAG | 0x80 }), ...entries.slice(1)]);
    expect(await lookupFailure(directories, 'MAIN/SR.NOB')).toEqual(failureOf('unsupported-layout', 'dir:/[2]'));
  });

  it.each([
    ['a file extent past the volume', 'MAIN/SR.NOB', MAIN, [fileRecord('SR.NOB;1', SECTORS - 2, 4_097)], 'dir:/MAIN[2]'],
    ['an empty directory', 'MAIN/SUB', MAIN, [subdirectoryRecord('SUB', SUB, 0)], 'dir:/MAIN[2]'],
    ['a directory of partial sectors', 'MAIN/SUB', MAIN, [subdirectoryRecord('SUB', SUB, 2_050)], 'dir:/MAIN[2]'],
    ['a directory extent past the volume', 'MAIN/SUB/DEEP.BIN', MAIN, [subdirectoryRecord('SUB', SECTORS)], 'dir:/MAIN[2]'],
  ])('rejects %s', async (_case, path, lba, entries, location) => {
    expect(await lookupFailure(withEntries(baseDirectories(), lba, () => entries), path)).toEqual(failureOf('invalid-directory', location));
  });

  it.each([
    ['an unsupported target', 'MAIN/SR.NOB', [fileRecord('SR.NOB;1', DATA, 10, { flags: 0x80 })], 'unsupported-layout', 'dir:/MAIN[2]'],
    ['a file used as a directory', 'MAIN/SR.NOB/X', [fileRecord('SR.NOB;1', DATA, 10)], 'wrong-entry-kind', 'dir:/MAIN/SR.NOB'],
    ['a looping directory', 'MAIN/LOOP', [subdirectoryRecord('LOOP', MAIN)], 'directory-loop', 'dir:/MAIN/LOOP'],
  ] as const)('reports %s before a bad record later in the directory', async (_case, path, entries, code, location) => {
    const broken = fileRecord('AB;1', DATA, 1);
    broken[0] = 33;
    expect(await lookupFailure(withEntries(baseDirectories(), MAIN, () => [...entries, broken]), path)).toEqual(failureOf(code, location));
  });

  it('reports diagnostics without the names of records', async () => {
    const directories = withEntries(baseDirectories(), ROOT_LBA, entries => [...entries, fileRecord(`${MARKER};1`, DATA, 1), fileRecord(`${MARKER};1`, DATA, 1)]);
    const { opened } = await openDisc(directories);
    expect(await failure(() => opened.lookup('MISSING'))).toEqual(failureOf('path-not-found', 'dir:/'));
  });
});

describe('directory limits', () => {
  it('reads a 65,536-byte directory and rejects 67,584 bytes before reading it', async () => {
    const sized = (byteLength: number): Directory[] => baseDirectories().map(directory => {
      if (directory.lba === ROOT_LBA) return { ...directory, entries: [subdirectoryRecord('MAIN', MAIN, byteLength), ...directory.entries.slice(1)] };
      if (directory.lba === MAIN) return { ...directory, entries: [directory.entries[0], subdirectoryRecord('SUB', 140)], byteLength };
      return { ...directory, lba: 140 };
    });
    const { image, opened } = await openDisc(sized(65_536));
    expect((await opened.lookup('MAIN/SR.NOB')).byteLength).toBe(5_000);
    expect(requestedLbas(image).slice(3)).toEqual(Array.from({ length: 32 }, (_, index) => MAIN + index));
    const over = await openDisc(sized(67_584));
    expect(await failure(() => over.opened.lookup('MAIN/SR.NOB')))
      .toEqual(failureOf('limit-exceeded', 'dir:/MAIN', { name: 'directoryBytes', limit: 65_536, observed: 67_584 }));
    expect(requestedLbas(over.image)).toEqual([16, 17, ROOT_LBA]);
  });

  it('rejects an oversized directory named as the target without reading it', async () => {
    const directories = withEntries(baseDirectories(), ROOT_LBA, entries => [subdirectoryRecord('MAIN', MAIN, 67_584), ...entries.slice(1)]);
    const { image, opened } = await openDisc(directories);
    expect(await failure(() => opened.lookup('MAIN')))
      .toEqual(failureOf('limit-exceeded', 'dir:/MAIN', { name: 'directoryBytes', limit: 65_536, observed: 67_584 }));
    expect(requestedLbas(image)).toEqual([16, 17, ROOT_LBA]);
  });

  it('reads 1,024 records in a directory and rejects 1,025 at the extra record', async () => {
    const base = baseDirectories()[0].entries;
    const withRecords = (count: number): Directory[] => withEntries(baseDirectories(), ROOT_LBA, () => [...base, ...fillers(count - 2 - base.length)]);
    const { opened } = await openDisc(withRecords(1_024));
    expect((await opened.lookup('F1018.DAT')).byteLength).toBe(1);
    const over = await openDisc(withRecords(1_025));
    expect(await failure(() => over.opened.lookup('MAIN/SR.NOB')))
      .toEqual(failureOf('limit-exceeded', 'dir:/', { name: 'directoryRecords', limit: 1_024, observed: 1_025 }));
  });
});
