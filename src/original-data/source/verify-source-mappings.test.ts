import { describe, expect, it } from 'vitest';
import { ContentContractError } from '../../content/contract-validation.ts';
import { DiscReadError } from '../disc/disc-error.ts';
import { openDiscImage } from '../disc/disc-image.ts';
import { rejection, syntheticFileDisc } from '../disc/disc.test-support.ts';
import { assetSourceStates, readSourceMappingTable } from '../source-mapping.ts';
import { SourceError } from '../source-error.ts';
import { inLocationGrammar } from '../source-error.test-support.ts';
import { block } from '../archive/archive.test-support.ts';
import { buildImfat, type SyntheticEntry } from '../synthetic.ts';
import { identifySource, type VerifiedSource } from './identify-source.ts';
import { catalogFor } from './source.test-support.ts';
import * as verifySourceMappingsModule from './verify-source-mappings.ts';
import { verifySourceMappings, type EntryReader } from './verify-source-mappings.ts';

const MARKER = 'PRIVATE-ENTRY-MARKER';

/** A 16-byte block with u32 pointers at positions 0 and 4, then eight bytes of marker text. */
function sixteen(pointer = 8, tail = MARKER.slice(0, 8)): Uint8Array {
  const bytes = block(16, { 0: pointer, 4: 4 });
  bytes.set(Array.from(tail, char => char.charCodeAt(0)), 8);
  return bytes;
}

const tex = (id: number, overrides: Partial<SyntheticEntry> = {}): SyntheticEntry => ({ id, type: 'TEX', data: sixteen(), relocations: [0], ...overrides });
const A_ENTRIES: SyntheticEntry[] = [
  tex(10_001),
  { id: 10_003, type: 'MESH', data: new Uint8Array(8) },
  tex(10_005),
  tex(10_007, { flags: 0x10 }),
  tex(10_009, { data: sixteen(8, 'DIFFEREN') }),
  tex(10_011, { data: Uint8Array.of(...sixteen(), 0, 0, 0, 0) }),
  tex(10_013, { relocations: [] }),
  tex(10_015, { relocations: [4] }),
];

const badArchive = buildImfat(10_000, [tex(10_001)]);
badArchive[0] = 0;
const FILES = {
  'MAIN/A.NOB': buildImfat(10_000, A_ENTRIES),
  'MAIN/B.NOB': buildImfat(20_000, [tex(20_001)]),
  'MAIN/BAD.NOB': badArchive,
  'MAIN/R.NOB': buildImfat(30_000, [tex(30_001, { data: sixteen(17) })]),
};
const CATALOG = catalogFor(FILES);

async function verified(): Promise<VerifiedSource> {
  // The unread padding raises the default read budget, which equals the input size, above this test's rereads.
  const padding = { byteLength: 1 << 20, read: (_: number, length: number) => new Uint8Array(length) };
  const disc = syntheticFileDisc({ ...FILES, 'MAIN/U.DAT': Uint8Array.of(1), 'DEMO/PAD.DAT': padding });
  return identifySource(await openDiscImage(disc.files), CATALOG);
}

type Locator = { discPath: string; entry: { id: number; type: string }; subresource: string | null };
const at = (discPath: string, type: string, id: number, subresource: string | null = null): Locator => ({ discPath, entry: { id, type }, subresource });

function mapping(id: string, parts: Locator[][]) {
  return {
    asset: { id, kind: id.split('/')[0] },
    parts: parts.map(alternatives => ({ alternatives })),
    confidence: 'confirmed',
    unknowns: [],
    evidence: ['docs/original/formats/imfat.md#5-entry-types'],
    resolution: 'declared',
  };
}
const table = (mappings: unknown[], sourceFingerprint: string | null = null) => ({ sourceFingerprint, mappings });

async function sourceFailure(action: () => unknown): Promise<{ code: string; location: string }> {
  try {
    await action();
  } catch (error) {
    if (!(error instanceof SourceError)) throw error;
    const data = error.toData();
    expect(inLocationGrammar(data), data.location).toBe(true);
    expect(structuredClone(data)).toEqual(data);
    // Diagnostics carry the structural path only: no locator path, entry ID or entry bytes.
    expect(`${JSON.stringify(data)} ${error.message}`).not.toMatch(/MAIN|NOB|U\.DAT|1000\d|4294967296|PRIVATE/);
    return { code: data.code, location: data.location };
  }
  throw new Error('expected a SourceError');
}

const ALT = (alternative: number) => `sources.mappings[0].parts[0].alternatives[${alternative}]`;

describe('verifySourceMappings', () => {
  // A public source module may not export or wrap a low-level capability (engineering guide): the default archive
  // reader stays private, and callers that share reads supply their own `EntryReader`.
  it('exports only verifySourceMappings at runtime', () => {
    expect(Object.keys(verifySourceMappingsModule)).toEqual(['verifySourceMappings']);
  });

  it('binds the table to the fingerprint and verifies entry-level mappings only', async () => {
    const source = await verified();
    const input = table([
      mapping('image/alias', [[at('MAIN/A.NOB', 'TEX', 10_001), at('MAIN/A.NOB', 'TEX', 10_005), at('MAIN/B.NOB', 'TEX', 20_001)]]),
      mapping('image/composite', [[at('MAIN/A.NOB', 'TEX', 10_001)], [at('MAIN/A.NOB', 'TEX', 10_013)]]),
      mapping('model/ship', [[at('MAIN/A.NOB', 'MESH', 10_003)]]),
      mapping('palette/hull', [[at('MAIN/A.NOB', 'TEX', 10_001, 'palette')]]),
    ]);
    const before = structuredClone(input);
    const result = await verifySourceMappings(input, source);
    expect(input).toEqual(before);
    expect(result.sourceFingerprint).toBe(source.identity.fingerprint);
    expect(result.mappings.map(({ asset, resolution }) => [asset.id, resolution])).toEqual([
      ['image/alias', 'verified'], ['image/composite', 'verified'], ['model/ship', 'verified'], ['palette/hull', 'declared'],
    ]);
    expect(readSourceMappingTable(result)).toEqual(result);
    expect(Object.isFrozen(result) && result.mappings.every(Object.isFrozen)).toBe(true);
    expect(assetSourceStates(result).states.map(({ id, state }) => [id, state])).toEqual([
      ['image/alias', 'verified'], ['image/composite', 'verified'], ['model/ship', 'verified'], ['palette/hull', 'unverified'],
    ]);
    expect((await verifySourceMappings(result, source)).sourceFingerprint).toBe(source.identity.fingerprint);
  });

  it.each([
    ['a path outside the whitelist', [at('MAIN/U.DAT', 'TEX', 1)], 'path-not-covered', 0],
    ['an archive that cannot open', [at('MAIN/BAD.NOB', 'TEX', 10_001)], 'invalid-archive', 0],
    ['a missing entry', [at('MAIN/A.NOB', 'TEX', 10_002)], 'entry-not-found', 0],
    ['an ID beyond u32', [at('MAIN/A.NOB', 'TEX', 2 ** 32)], 'entry-not-found', 0],
    ['an uncovered path before an ID beyond u32', [at('MAIN/U.DAT', 'TEX', 2 ** 32)], 'path-not-covered', 0],
    ['a broken archive before an ID beyond u32', [at('MAIN/BAD.NOB', 'TEX', 2 ** 32)], 'invalid-archive', 0],
    ['another entry type', [at('MAIN/A.NOB', 'MESH', 10_001)], 'entry-type-mismatch', 0],
    ['an invalid relocation', [at('MAIN/R.NOB', 'TEX', 30_001)], 'invalid-entry', 0],
    ['alternatives with other flags', [at('MAIN/A.NOB', 'TEX', 10_001), at('MAIN/A.NOB', 'TEX', 10_007)], 'alternatives-differ', 1],
    ['alternatives with other bytes', [at('MAIN/A.NOB', 'TEX', 10_001), at('MAIN/A.NOB', 'TEX', 10_009)], 'alternatives-differ', 1],
    ['alternatives with another size', [at('MAIN/A.NOB', 'TEX', 10_001), at('MAIN/A.NOB', 'TEX', 10_011)], 'alternatives-differ', 1],
    ['alternatives with another relocation count', [at('MAIN/A.NOB', 'TEX', 10_001), at('MAIN/A.NOB', 'TEX', 10_013)], 'alternatives-differ', 1],
    ['alternatives with other relocation positions', [at('MAIN/A.NOB', 'TEX', 10_001), at('MAIN/A.NOB', 'TEX', 10_015)], 'alternatives-differ', 1],
  ])('rejects %s at the locator path', async (_, alternatives, code, alternative) => {
    const source = await verified();
    const input = table([mapping('image/hull', [alternatives])]);
    const before = structuredClone(input);
    expect(await sourceFailure(() => verifySourceMappings(input, source))).toEqual({ code, location: ALT(alternative) });
    expect(input).toEqual(before);
  });

  /** The verified source with `openArchive` recorded and optionally replaced. */
  function wrapped(source: VerifiedSource, openArchive?: VerifiedSource['openArchive']) {
    const opened: string[] = [];
    const wrapper: VerifiedSource = {
      identity: source.identity,
      openArchive: path => { opened.push(path); return (openArchive ?? (target => source.openArchive(target)))(path); },
      openFile: path => source.openFile(path),
      usage: () => source.usage(),
    };
    return { source: wrapper, opened };
  }

  it('rejects a table bound to another source before opening any archive', async () => {
    const { source, opened } = wrapped(await verified());
    const input = table([mapping('image/hull', [[at('MAIN/A.NOB', 'TEX', 10_001)]])], 'source:another-disc');
    expect(await sourceFailure(() => verifySourceMappings(input, source)))
      .toEqual({ code: 'fingerprint-mismatch', location: 'sources.sourceFingerprint' });
    expect(opened).toEqual([]);
  });

  it('keeps the code and limit of an archive error when moving it to the locator path', async () => {
    const limit = { name: 'archiveEntries', limit: 4_096, observed: 5_000 } as const;
    const { source } = wrapped(await verified(), () => Promise.reject(new SourceError('limit-exceeded', 'archive:/MAIN/A.NOB', 'too many', limit)));
    const input = table([mapping('image/hull', [[at('MAIN/A.NOB', 'TEX', 10_001)]])]);
    const error = await verifySourceMappings(input, source).then(() => undefined, (caught: unknown) => caught);
    expect(inLocationGrammar((error as SourceError).toData())).toBe(true);
    expect((error as SourceError).toData()).toEqual({ code: 'limit-exceeded', location: ALT(0), reason: 'too many', limit });
  });

  it('leaves malformed tables, including alternatives of different types, to the P2-01 reader', async () => {
    const source = await verified();
    for (const [input, code] of [
      [table([mapping('image/hull', [[at('MAIN/A.NOB', 'MESH', 10_003), at('MAIN/A.NOB', 'TEX', 10_001)]])]), 'invalid-source-mapping'],
      [{ sourceFingerprint: null }, 'invalid-record'],
    ] as const) {
      const error = await verifySourceMappings(input, source).then(() => undefined, (caught: unknown) => caught);
      expect(error).toBeInstanceOf(ContentContractError);
      expect((error as ContentContractError).code).toBe(code);
    }
  });

  it('reads every locator through a supplied entry reader, with the same result and locations', async () => {
    const source = await verified();
    const input = table([
      mapping('image/alias', [[at('MAIN/A.NOB', 'TEX', 10_001), at('MAIN/A.NOB', 'TEX', 10_005)]]),
      mapping('palette/hull', [[at('MAIN/A.NOB', 'TEX', 10_001, 'palette')]]),
    ]);
    const requested: number[] = [];
    const readEntry: EntryReader = async ({ discPath, entry: { id, type } }) => {
      requested.push(id);
      return (await source.openArchive(discPath)).read(id, type);
    };
    expect(await verifySourceMappings(input, source, readEntry)).toEqual(await verifySourceMappings(input, await verified()));
    expect(requested).toEqual([10_001, 10_005, 10_001]);
    const failing: EntryReader = () => Promise.reject(new SourceError('entry-not-found', 'request.id', 'the archive has no entry with this ID'));
    expect(await sourceFailure(() => verifySourceMappings(input, source, failing))).toEqual({ code: 'entry-not-found', location: ALT(0) });
  });

  it('passes disc errors through as the same instance', async () => {
    const source = await verified();
    const failed = new DiscReadError('read-failed', 'image', 'injected');
    const failing = wrapped(source, () => Promise.reject(failed)).source;
    const input = table([mapping('image/hull', [[at('MAIN/A.NOB', 'TEX', 10_001)]])]);
    expect(await rejection(() => verifySourceMappings(input, failing))).toBe(failed);
  });
});
