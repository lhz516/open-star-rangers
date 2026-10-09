import { describe, expect, it } from 'vitest';
import type { ImfatEntry } from '../archive/imfat-rules.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import { requireEntryBytes } from '../formats/payload-block.ts';
import { SourceError } from '../source-error.ts';
import type { ExecutableRegionLocator } from '../source-mapping.ts';
import type { VerifiedSource } from '../source/identify-source.ts';
import { buildImfat, leInternalFixup, syntheticLeExecutable } from '../synthetic.test-support.ts';
import { countedVerifiedSource } from './conversion.test-support.ts';
import { stepEntryReader, stepRegionReader, stepRegionReaders } from './step-entry-reader.ts';

// The step-local readers shared by mapping verification and conversion (P2-05, P3-03 来源映射与核验): each entry and each
// region is read once per step, entry sizes are judged before their bytes are read, and fixed-up regions such as the
// built-in AI program table are read with their fixups. Code-generated archives and LE files only.

const ARCHIVE = 'MAIN/SR.NOB' as DiscPath;
const EXECUTABLE = 'MAIN/SRANGERS.EXE' as DiscPath;
/** Object 1 offset whose 4 bytes a fixup patches, to object 1 offset 0. */
const FIXUP_AT = 1_500;

const archive = () => buildImfat(0, [
  { id: 11, type: 'TABL', data: new Uint8Array(8).fill(1) },
  { id: 13, type: 'TABL', data: new Uint8Array(40).fill(2) },
]);
const executable = () => syntheticLeExecutable({
  objects: [{ bytes: Uint8Array.from({ length: 2_048 }, (_, index) => (index % 251) + 1) }],
  fixups: { 1: leInternalFixup(FIXUP_AT) },
});
const entry = (id: number) => ({ discPath: ARCHIVE, entry: { id, type: 'TABL' }, subresource: null });
const region = (offset: number, length: number): ExecutableRegionLocator => ({ discPath: EXECUTABLE, entry: null, subresource: `le/1/0x${offset.toString(16)}/${length}` });

/** The counted source with the number of times each file was opened. */
async function counted(files: Record<string, Uint8Array> = { [ARCHIVE]: archive(), [EXECUTABLE]: executable() }) {
  const { source, reads } = await countedVerifiedSource(files);
  const opens = new Map<string, number>();
  const opened: VerifiedSource = {
    ...source,
    openFile: path => (opens.set(path, (opens.get(path) ?? 0) + 1), source.openFile(path)),
  };
  return { source: opened, reads, opens };
}

describe('step entry reader', () => {
  it('reads each entry once and shares its result', async () => {
    const { source, reads } = await counted();
    const read = stepEntryReader(source);
    const [first, second] = await Promise.all([read(entry(13)), read(entry(13))]);
    expect(second).toBe(first);
    expect(await read(entry(13))).toBe(first);
    expect(first.bytes).toEqual(new Uint8Array(40).fill(2));
    expect(Object.fromEntries(reads)).toEqual({ 13: 1 });
  });

  it('shows each directory entry to beforeRead first, which can reject it without reading its bytes', async () => {
    const { source, reads } = await counted();
    const seen: Pick<ImfatEntry, 'id' | 'size'>[] = [];
    const read = stepEntryReader(source, (discPath, { id, size, ...rest }) => {
      seen.push({ id, size });
      requireEntryBytes(discPath, { id, size, ...rest }, 8);
    });
    await expect(read(entry(11))).resolves.toMatchObject({ entry: { id: 11, size: 8 } });
    await expect(read(entry(13))).rejects.toMatchObject({
      code: 'limit-exceeded', location: `archive:/${ARCHIVE}#13`, limit: { name: 'payloadEntryBytes', limit: 8, observed: 40 },
    });
    expect(seen).toEqual([{ id: 11, size: 8 }, { id: 13, size: 40 }]);
    expect(Object.fromEntries(reads)).toEqual({ 11: 1 });
  });

  it('finds no entry beyond the u32 ID range', async () => {
    const { source } = await counted();
    await expect(stepEntryReader(source)(entry(2 ** 32))).rejects.toMatchObject({ code: 'entry-not-found', location: 'request.id' });
  });
});

describe('step region readers', () => {
  it('open the executable once and read each region once per reader kind', async () => {
    const { source, opens } = await counted();
    const { read, readFixedUp } = stepRegionReaders(source);
    const plain = region(0x10, 8);
    const [first, again] = await Promise.all([read(plain, 'a'), read(plain, 'b')]);
    expect(again).toBe(first);
    expect([...first]).toEqual(Array.from({ length: 8 }, (_, index) => ((0x10 + index) % 251) + 1));
    const fixedUp = region(FIXUP_AT - 4, 12);
    const withFixups = await readFixedUp(fixedUp, 'c');
    expect(await readFixedUp(fixedUp, 'd')).toBe(withFixups);
    // The fixup patches bytes 4–7 of the region with the address of object 1 offset 0; the stored bytes are unpatched.
    expect(withFixups.fixups).toEqual([{ at: 4, object: 1, offset: 0 }]);
    expect(withFixups.bytes).toHaveLength(12);
    // A region read without its fixups is a different read, which the LE reader rejects as patched.
    await expect(read(fixedUp, 'e')).rejects.toMatchObject({ name: 'SourceError', code: 'invalid-payload', location: 'e' });
    // Plain regions without fixups also read as fixed-up regions, with none.
    expect((await readFixedUp(plain, 'f')).fixups).toEqual([]);
    expect(Object.fromEntries(opens)).toEqual({ [EXECUTABLE]: 1 });
  });

  it('locate a failure to open the executable at the first read’s open path, and one in a region at its path', async () => {
    const damaged = executable();
    damaged[0] = 0;
    const { source } = await counted({ [EXECUTABLE]: damaged });
    const { read, readFixedUp } = stepRegionReaders(source);
    await expect(readFixedUp(region(0, 4), 'region', 'executable')).rejects.toMatchObject({ code: 'invalid-payload', location: 'executable' });
    await expect(read(region(8, 4), 'other', 'ignored')).rejects.toMatchObject({ code: 'invalid-payload', location: 'executable' });
    const { source: intact } = await counted();
    await expect(stepRegionReaders(intact).readFixedUp(region(2_040, 16), 'past')).rejects.toBeInstanceOf(SourceError);
  });

  it('keep the plain reader as stepRegionReader', async () => {
    const { source } = await counted();
    expect([...await stepRegionReader(source)(region(0x10, 2), 'a')]).toEqual([0x11, 0x12]);
  });
});
