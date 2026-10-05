import { readSourceFingerprint, type SourceFingerprint } from '../../content/content-identity.ts';
import {
  compareText,
  ContentContractError,
  fail,
  matchesWhole,
  readOrderedArray,
  readRecord,
  requireFields,
} from '../../content/contract-validation.ts';
import { Sha256 } from '../../content/sha256.ts';
import { isDiscPath, type DiscPath } from '../disc/disc-path.ts';
import { SourceError } from '../source-error.ts';

/** One whitelisted file: its disc path, exact byte length and `sha256:` digest of its full contents. */
export interface CatalogFile {
  readonly path: DiscPath;
  readonly byteLength: number;
  readonly sha256: string;
}

/** A known version: a stable token and the files its identification covers, in ASCII path order. */
export interface SourceCatalog {
  readonly versionId: string;
  readonly files: readonly CatalogFile[];
}

/** The spec's catalog locations; a missing, malformed or empty file list is reported at the whole catalog. */
const CATALOG_LOCATION = /^catalog(?:\.versionId|\.files\[\d+\](?:\.(?:path|byteLength|sha256))?)?$/;
const CODES = Object.freeze({ invalid: 'invalid-record', duplicate: 'invalid-record', order: 'invalid-record' } as const);

function readCatalogFile(value: unknown, path: string): CatalogFile {
  const record = readRecord(value, path);
  requireFields(record, path, ['path', 'byteLength', 'sha256']);
  if (!isDiscPath(record.path)) fail('invalid-record', `${path}.path`, 'must be a disc path');
  const { byteLength } = record;
  if (typeof byteLength !== 'number' || !Number.isSafeInteger(byteLength) || byteLength < 0) {
    fail('invalid-record', `${path}.byteLength`, 'must be a nonnegative safe integer');
  }
  if (!matchesWhole(record.sha256, /^sha256:[0-9a-f]{64}$/)) fail('invalid-record', `${path}.sha256`, 'must be sha256: and 64 lowercase hexadecimal digits');
  return Object.freeze({ path: record.path, byteLength: byteLength + 0, sha256: record.sha256 });
}

/**
 * Reads a version whitelist: a `versionId` token and a nonempty list of files in strictly ascending ASCII path order.
 * Returns a frozen copy; any violation is `invalid-catalog` at its structural path, never echoing the value.
 */
export function readSourceCatalog(value: unknown): SourceCatalog {
  try {
    const record = readRecord(value, 'catalog');
    requireFields(record, 'catalog', ['versionId', 'files']);
    const { versionId } = record;
    if (!matchesWhole(versionId, /^[a-z0-9]+(?:-[a-z0-9]+)*$/) || versionId.length > 64) {
      fail('invalid-record', 'catalog.versionId', 'must be a lower-case token of at most 64 characters');
    }
    const files = readOrderedArray(record.files, 'catalog.files', CODES, readCatalogFile, file => file.path,
      (left, right) => compareText(left.path, right.path), 1);
    return Object.freeze({ versionId, files });
  } catch (error) {
    // Only structural paths this reader produces are reported; anything else, such as a proxy trap's own error or
    // path, becomes the whole catalog so no caller-made text reaches a diagnostic.
    const at = error instanceof ContentContractError && CATALOG_LOCATION.test(error.path) ? error.path : 'catalog';
    throw new SourceError('invalid-catalog', at, 'the version whitelist is malformed');
  }
}

/**
 * The content-addressed source fingerprint of a catalog's covered files: `source:sha256:` and the SHA-256 of the ASCII
 * text `open-star-rangers/source-fingerprint/1\n` followed by one `PATH\tBYTES\tHEX\n` line per file in catalog order.
 * The version ID is not part of it. The string alone proves nothing; only a successful identification does.
 */
export function sourceFingerprint(catalog: SourceCatalog): SourceFingerprint {
  const lines = catalog.files.map(({ path, byteLength, sha256 }) => `${path}\t${byteLength}\t${sha256.slice('sha256:'.length)}\n`);
  // Every character is ASCII: disc paths, decimal digits, hexadecimal digits, tabs and newlines.
  const text = `open-star-rangers/source-fingerprint/1\n${lines.join('')}`;
  const digest = new Sha256().update(Uint8Array.from(text, char => char.charCodeAt(0))).digestHex();
  return readSourceFingerprint(`source:sha256:${digest}`);
}

/**
 * The only production whitelist: the baseline Star Rangers CD (docs/original/manifest.md), covering every game data
 * archive P2 may convert and the main program. Communication face archives and FLICS/ belong to P4; DOS4G.EXE,
 * README.TXT and SETSOUND.BAT carry no content. Changing it changes the source fingerprint.
 */
export const PRODUCTION_CATALOG: SourceCatalog = readSourceCatalog({
  versionId: 'star-rangers-1995-cd',
  files: [
    { path: 'MAIN/AISTUFF.NOB', byteLength: 13_147, sha256: 'sha256:3c33f120b17376d0111780ea9197a0814624f248b1555069a667d528a8464539' },
    { path: 'MAIN/COMM.NOB', byteLength: 1_301, sha256: 'sha256:9f1ad9db8c8f757ef85339a1a05e1b80f01d3983c1f5a63da258d1ddcb2d05aa' },
    { path: 'MAIN/CRAFT.NOB', byteLength: 483_304, sha256: 'sha256:85cfd6b5e480a034272bc753f9977696fdc9cc35930bcecea4bc38c5b6fc2952' },
    { path: 'MAIN/DEBRIS.NOB', byteLength: 8_600, sha256: 'sha256:2a86eaa77ac76345f0101808046fded7ae0deabaf78b776e7e093acd90a5f124' },
    { path: 'MAIN/OPTIONS.NOB', byteLength: 7_051_150, sha256: 'sha256:01311c160d32566446c49d65f05aec761a0848141d7a4a917c1e3dd3fc7d08db' },
    { path: 'MAIN/SCENARIO.NOB', byteLength: 288_793, sha256: 'sha256:f1f7e6ce1faedf0902d86991226410192699d929478e9dbefd2d6cffb65e9a50' },
    { path: 'MAIN/SR.NOB', byteLength: 5_360_299, sha256: 'sha256:c469b601ae34713a043b2e52cd1a2badf4126913d1277c2ef20347c3c51b80bb' },
    { path: 'MAIN/SRANGERS.EXE', byteLength: 1_738_959, sha256: 'sha256:c1e0f4565988b6773ba1515e0b4f59f92ee22c118aea678d21817000cf924ffa' },
  ],
});
