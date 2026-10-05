import { openVerifiedSource, type DiscInputFile, type VerifiedSource } from '../original-data/source/open-verified-source.ts';
import { BlobByteSource } from '../platform/files/blob-byte-source.ts';
import type { ImportJob } from './import-host.ts';

/** Opens and identifies a file set; production always uses the product entry with its default budget. */
export type OpenSource = (files: readonly DiscInputFile[]) => Promise<VerifiedSource>;

type ByteSource = DiscInputFile['source'];

/** A port that reports the bytes each read actually returned, after the read succeeds. */
class MeteredByteSource implements ByteSource {
  readonly byteLength: number;
  readonly #source: ByteSource;
  readonly #onRead: (bytes: number) => void;

  constructor(source: ByteSource, onRead: (bytes: number) => void) {
    this.byteLength = source.byteLength;
    this.#source = source;
    this.#onRead = onRead;
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    const bytes = await this.#source.read(offset, length);
    this.#onRead(bytes.byteLength);
    return bytes;
  }
}

/**
 * The import job: reads the files on demand through metered Blob ports, opens and identifies them, and reports
 * `identify-source` progress (once at 0, then after every read), the identity and the usage. `open` is replaced only by
 * tests, which identify synthetic discs against a synthetic whitelist.
 */
export function createImportJob(open: OpenSource = openVerifiedSource): ImportJob {
  return async (files, report) => {
    let readBytes = 0;
    let identified = false;
    report.progress('identify-source', 0);
    const meter = (bytes: number) => {
      readBytes += bytes;
      if (!identified) report.progress('identify-source', readBytes);
    };
    const source = await open(files.map(({ name, blob }) => ({ name, source: new MeteredByteSource(new BlobByteSource(blob), meter) })));
    identified = true;
    report.identified({ versionId: source.identity.versionId, sourceFingerprint: source.identity.fingerprint });
    return source.usage();
  };
}
