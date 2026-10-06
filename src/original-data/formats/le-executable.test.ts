import { describe, expect, it } from 'vitest';
import type { ByteSource } from '../io/byte-source.ts';
import { SourceError } from '../source-error.ts';
import { leInternalFixup, syntheticLeExecutable, type SyntheticLeFields } from '../synthetic.ts';
import { EXECUTABLE_LIMITS, openLeExecutable } from './le-executable.ts';

// P2-06 AC-18 (EXE part): code-generated LE files only.

const PAGE = 4_096;
const pattern = (length: number, seed: number) => Uint8Array.from({ length }, (_, index) => (index * 7 + seed) & 0xff);
const BIG = pattern(5_000, 1);
const SMALL = pattern(100, 2);
/** Object 1 spans pages 1–2 with a 32-bit fixup at offset 10 of page 2; object 2 is the short last page 3. */
const valid = (overrides: Partial<SyntheticLeFields> = {}): SyntheticLeFields =>
  ({ objects: [{ bytes: BIG }, { bytes: SMALL }], fixups: { 2: leInternalFixup(10) }, ...overrides });

/** A file reader over bytes that counts its reads. */
function fileOf(bytes: Uint8Array): ByteSource & { reads: number } {
  const file = {
    byteLength: bytes.length,
    reads: 0,
    async read(offset: number, length: number) {
      file.reads += 1;
      return bytes.slice(offset, offset + length);
    },
  };
  return file;
}

const open = (fields: SyntheticLeFields) => openLeExecutable(fileOf(syntheticLeExecutable(fields)), 'effects[data/x].source');

async function failure(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    if (!(error instanceof SourceError)) throw error;
    return { code: error.code, location: error.location, limit: error.limit };
  }
  throw new Error('expected a SourceError');
}

async function expectInvalid(action: () => Promise<unknown>) {
  expect((await failure(action)).code).toBe('invalid-payload');
}

/** A 32-bit offset fixup starting 2 bytes before its page: the second half of a record that crosses from the previous page. */
const CROSSING = leInternalFixup(-2);

describe('LE region reader', () => {
  it('reads regions across pages and objects into independent buffers', async () => {
    const executable = await open(valid());
    expect(executable.objectCount).toBe(2);
    expect(await executable.readRegion({ object: 1, offset: PAGE - 6, length: 16 }, 'r')).toEqual(BIG.slice(PAGE - 6, PAGE + 10));
    expect(await executable.readRegion({ object: 1, offset: 0, length: PAGE }, 'r')).toEqual(BIG.slice(0, PAGE));
    expect(await executable.readRegion({ object: 2, offset: 50, length: 50 }, 'r')).toEqual(SMALL.slice(50));
    const first = await executable.readRegion({ object: 1, offset: PAGE + 14, length: 8 }, 'r');
    first.fill(0);
    expect(await executable.readRegion({ object: 1, offset: PAGE + 14, length: 8 }, 'r')).toEqual(BIG.slice(4_110, 4_118));
  });

  it.each([
    ['the patched bytes', PAGE + 10, 4], ['the first patched byte', PAGE + 8, 3], ['the last patched byte', PAGE + 13, 2],
  ])('rejects a region that overlaps %s of a fixup', async (_name, offset, length) => {
    const executable = await open(valid());
    expect(await failure(() => executable.readRegion({ object: 1, offset, length }, 'effects[data/x].regions[0]')))
      .toEqual({ code: 'invalid-payload', location: 'effects[data/x].regions[0]', limit: null });
  });

  it('accepts regions next to a fixup, and checks list-form and page-crossing records', async () => {
    const executable = await open(valid());
    await expect(executable.readRegion({ object: 1, offset: PAGE + 6, length: 4 }, 'r')).resolves.toHaveLength(4);
    await expect(executable.readRegion({ object: 1, offset: PAGE + 14, length: 4 }, 'r')).resolves.toHaveLength(4);
    // A list record (source flag 0x20) patching offsets 20 and 30, and a record crossing in from the previous page.
    const list = [0x27, 0x10, 2, 1, 0, 0, 0, 0, 20, 0, 30, 0];
    const other = await open(valid({ fixups: { 2: [...list, ...CROSSING] } }));
    for (const offset of [PAGE + 20, PAGE + 30, PAGE]) {
      await expectInvalid(() => other.readRegion({ object: 1, offset, length: 1 }, 'r'));
    }
    await expect(other.readRegion({ object: 1, offset: PAGE + 24, length: 4 }, 'r')).resolves.toHaveLength(4);
    // Additive and import records have known lengths; an unknown source type is rejected.
    const additive = [0x07, 0x14, 40, 0, 1, 0, 0, 0, 0, 5, 0];
    const imported = [0x07, 0x01, 50, 0, 1, 7, 0];
    const mixed = await open(valid({ fixups: { 2: [...additive, ...imported] } }));
    await expectInvalid(() => mixed.readRegion({ object: 1, offset: PAGE + 52, length: 1 }, 'r'));
    await expect(mixed.readRegion({ object: 1, offset: PAGE + 60, length: 4 }, 'r')).resolves.toHaveLength(4);
    const unknown = await open(valid({ fixups: { 2: [0x0f, 0x00, 1, 0, 1] } }));
    await expectInvalid(() => unknown.readRegion({ object: 1, offset: PAGE + 60, length: 4 }, 'r'));
  });

  it('reads the fixup records of a page once for all regions on it', async () => {
    const file = fileOf(syntheticLeExecutable(valid()));
    const executable = await openLeExecutable(file, 'effects[data/x].source');
    const opened = file.reads;
    await executable.readRegion({ object: 1, offset: PAGE + 20, length: 4 }, 'r');
    expect(file.reads - opened).toBe(2);
    await executable.readRegion({ object: 1, offset: PAGE + 40, length: 4 }, 'r');
    expect(file.reads - opened).toBe(3);
  });

  it('looks pages up through the page map, and fixups by page map index', async () => {
    // Map entries 1, 2, 3 name stored pages 3, 1, 2: object 1's single page is stored last, after object 2's two pages.
    const objects = [{ bytes: SMALL }, { bytes: BIG }];
    const executable = await open({ objects, storedOrder: [3, 1, 2], fixups: { 2: leInternalFixup(10) } });
    expect(await executable.readRegion({ object: 1, offset: 0, length: 100 }, 'r')).toEqual(SMALL);
    expect(await executable.readRegion({ object: 2, offset: PAGE - 6, length: 16 }, 'r')).toEqual(BIG.slice(PAGE - 6, PAGE + 10));
    // Map entry 2 (object 2's first page) carries the fixup, whatever its stored position.
    await expectInvalid(() => executable.readRegion({ object: 2, offset: 10, length: 1 }, 'r'));
    await expect(executable.readRegion({ object: 2, offset: PAGE + 10, length: 4 }, 'r')).resolves.toHaveLength(4);
  });

  it('rejects regions on either side of a fixup recorded on both pages it crosses', async () => {
    // A 32-bit offset at the last two bytes of page 1 and the first two of page 2.
    const executable = await open(valid({ fixups: { 1: leInternalFixup(PAGE - 2), 2: CROSSING } }));
    for (const offset of [PAGE - 2, PAGE + 1]) {
      await expectInvalid(() => executable.readRegion({ object: 1, offset, length: 1 }, 'r'));
    }
    await expect(executable.readRegion({ object: 1, offset: PAGE - 6, length: 4 }, 'r')).resolves.toHaveLength(4);
  });

  it.each([
    // [source type, its patched bytes]: 8-bit, selector, 16:16 pointer, 16-bit offset, 16:32 pointer, 32-bit and self-relative.
    [0x00, 1], [0x02, 2], [0x03, 4], [0x05, 2], [0x06, 6], [0x07, 4], [0x08, 4],
  ])('knows the patched size of source type %i', async (type, size) => {
    // Each record: a 16-bit-object internal target, preceded by records with a 32-bit additive, an 8-bit import ordinal
    // and an import by name, so a wrong length anywhere would misplace the record under test.
    const additive = [0x07, 0x34, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0];
    const ordinal = [0x07, 0x81, 0, 1, 1, 9];
    const named = [0x07, 0x02, 0, 1, 1, 4, 0];
    const target = type === 0x02 ? [] : [0, 0];
    const record = [type, 0x40, 100, 0, 1, 0, ...target];
    const executable = await open(valid({ fixups: { 1: [...additive, ...ordinal, ...named, ...record] } }));
    await expectInvalid(() => executable.readRegion({ object: 1, offset: 100 + size - 1, length: 1 }, 'r'));
    await expect(executable.readRegion({ object: 1, offset: 100 + size, length: 1 }, 'r')).resolves.toHaveLength(1);
  });

  it.each([
    ['a reserved source bit', [0x47, 0x10, 0, 0, 1, 0, 0, 0, 0]],
    ['the reserved target flag', [0x07, 0x18, 0, 0, 1, 0, 0, 0, 0]],
    ['the alias flag on an offset', [0x17, 0x10, 0, 0, 1, 0, 0, 0, 0]],
  ])('rejects a fixup record with %s', async (_name, record) => {
    const executable = await open(valid({ fixups: { 1: record } }));
    await expectInvalid(() => executable.readRegion({ object: 1, offset: 200, length: 4 }, 'r'));
  });

  it.each<[string, Partial<SyntheticLeFields>]>([
    ['an MZ signature', { mzSignature: 0x4d5a }],
    ['an LE signature', { leSignature: 0x584c }],
    ['the byte order', { byteOrder: 1 }],
    ['the word order', { wordOrder: 1 }],
    ['the page size', { pageSize: 512 }],
    ['the last page size', { lastPageBytes: 0 }],
    ['the object table offset', { objectTableOffset: 0x7fff_0000 }],
    ['the page map offset', { pageMapOffset: 0x7fff_0000 }],
    ['the fixup page table offset', { fixupPageTableOffset: 0x7fff_0000 }],
    ['the fixup record table offset', { fixupRecordTableOffset: 0x7fff_0000 }],
    ['the data pages offset', { dataPagesOffset: 0x7fff_0000 }],
    ['the page count beyond the file', { pageCount: 4 }],
  ])('rejects %s', async (_name, overrides) => {
    expect(await failure(() => open(valid(overrides)))).toEqual({ code: 'invalid-payload', location: 'effects[data/x].source', limit: null });
  });

  it.each([
    ['an object the file does not have', { object: 3, offset: 0, length: 4 }],
    ['bytes beyond the object', { object: 2, offset: 98, length: 4 }],
  ])('rejects a region in %s', async (_name, region) => {
    const executable = await open(valid());
    await expectInvalid(() => executable.readRegion(region, 'r'));
  });

  it('rejects a region in a tail or page not stored in the file', async () => {
    const tail = await open(valid({ objects: [{ bytes: BIG, virtualSize: 12_000 }, { bytes: SMALL }] }));
    await expectInvalid(() => tail.readRegion({ object: 1, offset: 9_000, length: 4 }, 'r'));
    await expect(tail.readRegion({ object: 1, offset: PAGE + 900, length: 4 }, 'r')).resolves.toHaveLength(4);
    const zeroFilled = await open(valid({ pageTypes: { 1: 3 } }));
    await expectInvalid(() => zeroFilled.readRegion({ object: 1, offset: 0, length: 4 }, 'r'));
  });

  it.each([
    ['no objects', { objectCount: 0 }, 'executableObjects', 0],
    ['too many objects', { objectCount: EXECUTABLE_LIMITS.objects + 1 }, 'executableObjects', 9],
    ['too many pages', { pageCount: EXECUTABLE_LIMITS.pages + 1 }, 'executablePages', 1_025],
  ])('rejects %s from the counts alone', async (_name, overrides, name, observed) => {
    const file = fileOf(syntheticLeExecutable(valid(overrides)));
    expect(await failure(() => openLeExecutable(file, 'effects[data/x].source')))
      .toEqual({ code: 'limit-exceeded', location: 'effects[data/x].source', limit: { name, limit: name === 'executablePages' ? 1_024 : 8, observed } });
    // Only the MZ and LE headers were read.
    expect(file.reads).toBe(2);
  });

  it('rejects a region longer than the limit before reading it', async () => {
    const executable = await open(valid());
    expect(await failure(() => executable.readRegion({ object: 1, offset: 0, length: EXECUTABLE_LIMITS.regionBytes + 1 }, 'r')))
      .toEqual({ code: 'limit-exceeded', location: 'r', limit: { name: 'executableRegion', limit: 65_536, observed: 65_537 } });
  });
});
