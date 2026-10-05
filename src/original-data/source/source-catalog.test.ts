import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { readSourceFingerprint } from '../../content/content-identity.ts';
import { ContentContractError } from '../../content/contract-validation.ts';
import { SourceError, type SourceErrorData } from '../source-error.ts';
import { inLocationGrammar } from '../source-error.test-support.ts';
import { PRODUCTION_CATALOG, readSourceCatalog, sourceFingerprint, type SourceCatalog } from './source-catalog.ts';
import { catalogFor } from './source.test-support.ts';

const PRODUCTION_FINGERPRINT = 'source:sha256:fd97bcea3c3aee835c9058419469786587a4580e96b431bb9ce9c127ff2181be';
const DIGEST = `sha256:${'ab'.repeat(32)}`;

function rejected(value: unknown): Pick<SourceErrorData, 'code' | 'location'> {
  try {
    readSourceCatalog(value);
  } catch (error) {
    expect(error).toBeInstanceOf(SourceError);
    expect(inLocationGrammar((error as SourceError).toData())).toBe(true);
    const { code, location } = (error as SourceError).toData();
    return { code, location };
  }
  throw new Error('expected a SourceError');
}

const file = (path: string, byteLength = 1, sha256 = DIGEST) => ({ path, byteLength, sha256 });
const catalog = (files: unknown, versionId: unknown = 'test-version') => ({ versionId, files });

/** The fingerprint recomputed independently with Node from the specified canonical text. */
function nodeFingerprint({ files }: SourceCatalog): string {
  const lines = files.map(({ path, byteLength, sha256 }) => `${path}\t${byteLength}\t${sha256.slice('sha256:'.length)}\n`);
  return `source:sha256:${createHash('sha256').update(`open-star-rangers/source-fingerprint/1\n${lines.join('')}`, 'ascii').digest('hex')}`;
}

describe('PRODUCTION_CATALOG', () => {
  it('covers exactly the eight baseline files in ASCII order under one frozen version', () => {
    expect(PRODUCTION_CATALOG.versionId).toBe('star-rangers-1995-cd');
    expect(PRODUCTION_CATALOG.files.map(({ path }) => path)).toEqual([
      'MAIN/AISTUFF.NOB', 'MAIN/COMM.NOB', 'MAIN/CRAFT.NOB', 'MAIN/DEBRIS.NOB',
      'MAIN/OPTIONS.NOB', 'MAIN/SCENARIO.NOB', 'MAIN/SR.NOB', 'MAIN/SRANGERS.EXE',
    ]);
    expect(Object.isFrozen(PRODUCTION_CATALOG) && Object.isFrozen(PRODUCTION_CATALOG.files) && PRODUCTION_CATALOG.files.every(Object.isFrozen)).toBe(true);
  });

  it('has the pinned fingerprint, which changing the algorithm or the whitelist breaks', () => {
    expect(sourceFingerprint(PRODUCTION_CATALOG)).toBe(PRODUCTION_FINGERPRINT);
    expect(nodeFingerprint(PRODUCTION_CATALOG)).toBe(PRODUCTION_FINGERPRINT);
  });
});

describe('readSourceCatalog', () => {
  it('copies and freezes a valid whitelist, leaving later caller changes without effect', () => {
    const files = [file('A-B'), file('A0'), file('AB'), file('A_B', 0)];
    const read = readSourceCatalog(catalog(files));
    files[0].byteLength = 99;
    expect(read).toEqual(catalog([file('A-B'), file('A0'), file('AB'), file('A_B', 0)]));
    expect(Object.isFrozen(read.files[0])).toBe(true);
  });

  it.each([
    ['null', null, 'catalog'],
    ['an array', [], 'catalog'],
    ['a class instance', new (class { versionId = 'a'; files = [file('A')]; })(), 'catalog'],
    ['an unknown field', { ...catalog([file('A')]), extra: 1 }, 'catalog'],
    ['a missing field', { versionId: 'a' }, 'catalog'],
    ['an empty version', catalog([file('A')], ''), 'catalog.versionId'],
    ['an upper-case version', catalog([file('A')], 'Star'), 'catalog.versionId'],
    ['a doubled hyphen', catalog([file('A')], 'a--b'), 'catalog.versionId'],
    ['a leading hyphen', catalog([file('A')], '-a'), 'catalog.versionId'],
    ['a 65-character version', catalog([file('A')], 'a'.repeat(65)), 'catalog.versionId'],
    ['a numeric version', catalog([file('A')], 7), 'catalog.versionId'],
    ['files that are not an array', catalog({}), 'catalog'],
    ['no files', catalog([]), 'catalog'],
    ['a file that is not a record', catalog(['A']), 'catalog.files[0]'],
    ['an unknown file field', catalog([{ ...file('A'), size: 1 }]), 'catalog.files[0]'],
    ['a lower-case path', catalog([file('main/sr.nob')]), 'catalog.files[0].path'],
    ['a versioned path', catalog([file('MAIN/SR.NOB;1')]), 'catalog.files[0].path'],
    ['a negative length', catalog([file('A', -1)]), 'catalog.files[0].byteLength'],
    ['a fractional length', catalog([file('A', 1.5)]), 'catalog.files[0].byteLength'],
    ['an unsafe length', catalog([file('A', 2 ** 53)]), 'catalog.files[0].byteLength'],
    ['a string length', catalog([file('A', '5' as unknown as number)]), 'catalog.files[0].byteLength'],
    ['a short digest', catalog([file('A', 1, `sha256:${'a'.repeat(63)}`)]), 'catalog.files[0].sha256'],
    ['an upper-case digest', catalog([file('A', 1, `sha256:${'A'.repeat(64)}`)]), 'catalog.files[0].sha256'],
    ['a digest without its prefix', catalog([file('A', 1, 'a'.repeat(64))]), 'catalog.files[0].sha256'],
    ['a repeated path', catalog([file('A'), file('A')]), 'catalog.files[1]'],
    ['paths out of ASCII order', catalog([file('A_B'), file('AB')]), 'catalog.files[1]'],
  ])('rejects %s as invalid-catalog', (_, value, location) => {
    expect(rejected(value)).toEqual({ code: 'invalid-catalog', location });
  });

  it('never echoes rejected values', () => {
    for (const value of [catalog([file('A')], 'PRIVATE-MARKER'), catalog([file('private-marker')]), { ...catalog([file('A')]), 'PRIVATE-MARKER': 1 }]) {
      try {
        readSourceCatalog(value);
      } catch (error) {
        expect(inLocationGrammar((error as SourceError).toData())).toBe(true);
        expect(JSON.stringify((error as SourceError).toData())).not.toMatch(/private/i);
        continue;
      }
      throw new Error('expected a rejection');
    }
  });
});

describe('readSourceCatalog with hostile proxies', () => {
  it('maps trap failures and forged paths to invalid-catalog at the whole catalog', () => {
    const forged = new ContentContractError('invalid-record', 'PRIVATE-MARKER', 'forged');
    const traps = [
      new Proxy(catalog([file('A')]), { ownKeys: () => { throw new Error('PRIVATE-MARKER'); } }),
      new Proxy(catalog([file('A')]), { getPrototypeOf: () => { throw forged; } }),
      catalog(new Proxy([file('A')], { getOwnPropertyDescriptor: () => { throw forged; } })),
    ];
    for (const value of traps) expect(rejected(value)).toEqual({ code: 'invalid-catalog', location: 'catalog' });
  });
});

describe('sourceFingerprint', () => {
  const files = { 'MAIN/A.NOB': Uint8Array.of(1, 2, 3), 'MAIN/B.EXE': new Uint8Array(0), 'X.DAT': Uint8Array.of(9) };
  const base = catalogFor(files);

  it('matches Node over the canonical text and is a valid source fingerprint', () => {
    expect(sourceFingerprint(base)).toBe(nodeFingerprint(base));
    expect(readSourceFingerprint(sourceFingerprint(base))).toBe(sourceFingerprint(base));
    expect(sourceFingerprint(base)).not.toBe(PRODUCTION_FINGERPRINT);
  });

  it('ignores the version ID but changes with any covered path, length or digest', () => {
    const fingerprint = sourceFingerprint(base);
    expect(sourceFingerprint(catalogFor(files, 'renamed-version'))).toBe(fingerprint);
    const variants = [
      catalogFor({ ...files, 'MAIN/A.NOB': Uint8Array.of(1, 2, 4) }),
      catalogFor({ ...files, 'MAIN/A.NOB': Uint8Array.of(1, 2, 3, 0) }),
      catalogFor({ 'MAIN/A.NOB': files['MAIN/A.NOB'], 'MAIN/B.EXE': files['MAIN/B.EXE'] }),
      catalogFor({ ...files, 'Y.DAT': Uint8Array.of(9) }),
      readSourceCatalog({ versionId: 'x', files: base.files.map(entry => ({ ...entry, byteLength: entry.byteLength + 1 })) }),
    ];
    for (const variant of variants) expect(sourceFingerprint(variant)).not.toBe(fingerprint);
  });
});
