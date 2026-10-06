import { addBudgets, EMPTY_BUDGET_USAGE, type BudgetRecord } from '../content/budget.ts';
import { applyManifestIdentity, type GroupDraft } from '../content/manifest-identity.ts';
import { convertLogic, PRODUCTION_LOGIC_SHARE } from '../original-data/conversion/convert-logic.ts';
import { productionIdentityBasis } from '../original-data/conversion/converter-version.ts';
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

/** Group drafts a step converted, and the conversion usage after it. */
export interface StepGroups {
  readonly drafts: readonly GroupDraft[];
  readonly usage: BudgetRecord;
}

/**
 * The logic conversion step and the budget share approved for it. `convert` charges `limits` on top of `usage`, the
 * earlier steps' conversion usage.
 */
export interface LogicStepInput {
  readonly convert: (source: VerifiedSource, limits: BudgetRecord, usage: BudgetRecord) => Promise<StepGroups>;
  readonly share: BudgetRecord;
}

/** The P2-09 production logic conversion; tests vary its share or wrap its `convert`. */
export const PRODUCTION_LOGIC_STEP: LogicStepInput = Object.freeze({
  convert: async (source: VerifiedSource, limits: BudgetRecord, usage: BudgetRecord) => {
    const converted = await convertLogic(source, limits, usage);
    return { drafts: [converted.draft], usage: converted.usage };
  },
  share: PRODUCTION_LOGIC_SHARE,
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
 * graphics and the logic conversion steps. Each stage reports progress once when it starts and after every port read,
 * with the read bytes accumulated across stages. The job's limits are the P2-02 default read limit (the input size)
 * plus every step's share; each step charges on top of the earlier steps' conversion usage. The graphics result stays
 * in the job for the group assembly of later tasks. The converted groups get one manifest identity derived from all of
 * them before any is sent. The job resolves to the final read usage plus the conversion usage. `open`, `graphics` and
 * `logic` are replaced only by tests.
 */
export function createImportJob(
  open: OpenSource = openVerifiedSource,
  graphics: GraphicsStepInput = PRODUCTION_GRAPHICS_STEP,
  logic: LogicStepInput = PRODUCTION_LOGIC_STEP,
): ImportJob {
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
    const inputBytes = files.reduce((total, { blob }) => total + blob.size, 0);
    const limits = addBudgets(addBudgets({ ...EMPTY_BUDGET_USAGE, sourceReadBytes: inputBytes }, graphics.share, 'limits'), logic.share, 'limits');
    stage = 'convert-graphics';
    report.progress(stage, readBytes);
    const converted = await runGraphicsStep(source, graphics.mappings, graphics.declarations, limits);
    stage = 'convert-logic';
    report.progress(stage, readBytes);
    const { drafts, usage } = await logic.convert(source, limits, converted.usage);
    // Everything that can still fail runs before the first group is sent, so a failure never follows a group.
    const total = addBudgets(source.usage(), usage, 'usage');
    const groups = drafts.length > 0 ? applyManifestIdentity(productionIdentityBasis(source.identity.fingerprint), drafts) : [];
    for (const group of groups) report.group(group.manifest.group, group);
    return total;
  };
}
