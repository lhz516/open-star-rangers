import { addBudgets, EMPTY_BUDGET_USAGE, type BudgetRecord } from '../content/budget.ts';
import { runGraphicsStep } from '../original-data/conversion/graphics-step.ts';
import {
  PRODUCTION_GRAPHICS_DECLARATIONS, PRODUCTION_GRAPHICS_MAPPINGS, PRODUCTION_GRAPHICS_SHARE,
} from '../original-data/conversion/production-graphics.ts';
import { openVerifiedSource, type DiscInputFile, type VerifiedSource } from '../original-data/source/open-verified-source.ts';
import { BlobByteSource } from '../platform/files/blob-byte-source.ts';
import type { ImportJob } from './import-host.ts';
import type { ImportStage } from './import-protocol.ts';

/** Opens and identifies a file set; production always uses the product entry with its default budget. */
export type OpenSource = (files: readonly DiscInputFile[]) => Promise<VerifiedSource>;

/** What the graphics conversion step converts, and the budget share approved for it. */
export interface GraphicsStepInput {
  readonly mappings: unknown;
  readonly declarations: unknown;
  readonly share: BudgetRecord;
}

/** The P2-05 production graphics. */
const PRODUCTION_GRAPHICS_STEP: GraphicsStepInput = Object.freeze({
  mappings: PRODUCTION_GRAPHICS_MAPPINGS,
  declarations: PRODUCTION_GRAPHICS_DECLARATIONS,
  share: PRODUCTION_GRAPHICS_SHARE,
});

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
 * The import job: reads the files on demand through metered Blob ports, opens and identifies them, then runs the
 * graphics conversion step. Each stage reports progress once when it starts and after every port read, with the read
 * bytes accumulated across stages. The job's limits are the P2-02 default read limit (the input size) plus the step's
 * share, and it resolves to the final read usage plus the conversion usage. The step result stays in the job for the
 * group assembly of later tasks; no group is sent yet. `open` and `graphics` are replaced only by tests.
 */
export function createImportJob(open: OpenSource = openVerifiedSource, graphics: GraphicsStepInput = PRODUCTION_GRAPHICS_STEP): ImportJob {
  return async (files, report) => {
    let readBytes = 0;
    let stage: ImportStage = 'identify-source';
    report.progress(stage, 0);
    const meter = (bytes: number) => {
      readBytes += bytes;
      report.progress(stage, readBytes);
    };
    const source = await open(files.map(({ name, blob }) => ({ name, source: new MeteredByteSource(new BlobByteSource(blob), meter) })));
    report.identified({ versionId: source.identity.versionId, sourceFingerprint: source.identity.fingerprint });
    stage = 'convert-graphics';
    report.progress(stage, readBytes);
    const inputBytes = files.reduce((total, { blob }) => total + blob.size, 0);
    const limits = addBudgets({ ...EMPTY_BUDGET_USAGE, sourceReadBytes: inputBytes }, graphics.share, 'limits');
    const converted = await runGraphicsStep(source, graphics.mappings, graphics.declarations, limits);
    return addBudgets(source.usage(), converted.usage, 'usage');
  };
}
