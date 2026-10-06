import { isDiscPath } from './disc/disc-path.ts';
import { SourceError, type SourceErrorData } from './source-error.ts';

// The closed location grammar of P2-03 errors (docs/plan/p2/03/spec.md, error codes), kept as an oracle written from
// the spec; disc paths in it are checked with the production DiscPath grammar.
// Payload structure paths (P2-09) follow an entry ID: `/name` or `/name[index]` segments.
const ARCHIVE = /^archive(?::\/([^#[]+))?(?:\[\d+\]|#\d+(?:\.relocations\[\d+\]|(?:\/[a-z][a-zA-Z0-9]*(?:\[\d+\])?)+)?)?$/;
const FILE = /^file:\/(.+)$/;
const STRUCTURAL = new RegExp(`^(?:${[
  String.raw`catalog(?:\.versionId|\.files\[\d+\](?:\.(?:path|byteLength|sha256))?)?`,
  String.raw`request\.(?:path|id|type)`,
  String.raw`sources\.mappings\[\d+\]\.parts\[\d+\]\.alternatives\[\d+\]`,
  String.raw`sources\.sourceFingerprint`,
].join('|')})$`);

/** Whether a P2-03 diagnostic location belongs to the closed grammar. */
export function inLocationGrammar({ location }: Pick<SourceErrorData, 'location'>): boolean {
  const archive = ARCHIVE.exec(location);
  if (archive) return archive[1] === undefined || isDiscPath(archive[1]);
  const file = FILE.exec(location);
  return file ? isDiscPath(file[1]) : STRUCTURAL.test(location);
}

/**
 * Awaits a `SourceError` and returns its diagnostic without the reason, after checking its location is in the grammar
 * and that nothing besides the location matches `hidden`, such as a name marker or entry ID.
 */
export async function sourceFailure(action: () => unknown, hidden: RegExp): Promise<Omit<SourceErrorData, 'reason'>> {
  let error: unknown = null;
  try {
    await action();
  } catch (caught) {
    error = caught;
  }
  if (error === null) throw new Error('expected a SourceError');
  if (!(error instanceof SourceError)) throw error;
  const data = error.toData();
  if (!inLocationGrammar(data)) throw new Error('the location is outside the grammar');
  if (hidden.test(JSON.stringify({ ...data, location: '' }))) throw new Error('the diagnostic leaks private input');
  return { code: data.code, location: data.location, limit: data.limit };
}
