import { isDiscPath } from './disc/disc-path.ts';
import type { SourceErrorData } from './source-error.ts';

// The closed location grammar of P2-03 errors (docs/plan/p2/03/spec.md, error codes), kept as an oracle written from
// the spec; disc paths in it are checked with the production DiscPath grammar. P2-08 converters add a source mapping
// path followed by an SND header field.
const ARCHIVE = /^archive(?::\/([^#[]+))?(?:\[\d+\]|#\d+(?:\.relocations\[\d+\])?)?$/;
const FILE = /^file:\/(.+)$/;
const STRUCTURAL = new RegExp(`^(?:${[
  String.raw`catalog(?:\.versionId|\.files\[\d+\](?:\.(?:path|byteLength|sha256))?)?`,
  String.raw`request\.(?:path|id|type)`,
  String.raw`sources\.mappings\[\d+\]\.parts\[\d+\]\.alternatives\[\d+\]`,
  String.raw`sources\.mappings\[\d+\]\.parts\[\d+\]\.alternatives\[\d+\]\.(?:size|relocations|sampleOffset|sampleBytes|sampleRate|bitsPerSample|flags)`,
  String.raw`sources\.sourceFingerprint`,
].join('|')})$`);

/** Whether a P2-03 diagnostic location belongs to the closed grammar. */
export function inLocationGrammar({ location }: Pick<SourceErrorData, 'location'>): boolean {
  const archive = ARCHIVE.exec(location);
  if (archive) return archive[1] === undefined || isDiscPath(archive[1]);
  const file = FILE.exec(location);
  return file ? isDiscPath(file[1]) : STRUCTURAL.test(location);
}
