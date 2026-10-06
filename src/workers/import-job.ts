import type { ResourceGroup } from '../content/asset-contract.ts';
import { addBudgets, EMPTY_BUDGET_USAGE, type BudgetRecord } from '../content/budget.ts';
import type { GroupInput } from '../content/completeness.ts';
import { fail } from '../content/contract-validation.ts';
import { applyManifestIdentity, type GroupDraft } from '../content/manifest-identity.ts';
import { payloadTransferList } from '../content/ownership.ts';
import { readPayloadRecords } from '../content/payload.ts';
import { convertAudioGroup } from '../original-data/conversion/audio-conversion.ts';
import { convertLogic, PRODUCTION_LOGIC_SHARE } from '../original-data/conversion/convert-logic.ts';
import { productionIdentityBasis } from '../original-data/conversion/converter-version.ts';
import { runGraphicsStep } from '../original-data/conversion/graphics-step.ts';
import {
  PRODUCTION_GRAPHICS_DECLARATIONS, PRODUCTION_GRAPHICS_MAPPINGS, PRODUCTION_GRAPHICS_SHARE,
} from '../original-data/conversion/production-graphics.ts';
import { PRODUCTION_SND_RULES, PRODUCTION_SOUND_TABLE } from '../original-data/conversion/production-sounds.ts';
import type { SndFormatRules } from '../original-data/formats/snd.ts';
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

/** What the audio stage converts: a sound table and the SND interpretations it accepts. */
export interface AudioStageInput {
  readonly table: unknown;
  readonly rules: SndFormatRules;
  /** Replaces `AUDIO_BUDGET_LIMITS`; only tests pass it. */
  readonly limits?: BudgetRecord;
}

/** The P2-08 production sounds. */
const PRODUCTION_AUDIO_STAGE: AudioStageInput = Object.freeze({ table: PRODUCTION_SOUND_TABLE, rules: PRODUCTION_SND_RULES });

type ByteSource = DiscInputFile['source'];

/** A group the job sends: its draft with the package identity filled into the manifest. */
export type PackageGroup = readonly [ResourceGroup, GroupInput];

/**
 * Checks every group's transfer list before the first is sent, at the host's paths: each payload owns its whole buffer
 * and no buffer is shared within a group or across groups, so sending one group never detaches a later one.
 */
export function checkPackageTransfers(groups: readonly PackageGroup[]): void {
  const transferred = new Set<ArrayBuffer>();
  for (const [group, { payloads }] of groups) {
    const path = `groups.${group}.payloads`;
    payloadTransferList(readPayloadRecords(payloads, path).map(({ bytes }) => bytes), path).forEach((buffer, index) => {
      if (transferred.has(buffer)) fail('payload-aliased', `${path}[${index}]`, 'shares an ArrayBuffer with a payload of another group');
      transferred.add(buffer);
    });
  }
}

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
 * graphics and the logic conversion steps and converts the audio group. Each stage reports progress once when it starts
 * and after every port read, with the read bytes accumulated across stages. The graphics and logic limits are the
 * P2-02 default read limit (the input size) plus both steps' shares, the logic step charging on top of the graphics
 * usage; the audio stage charges its own limits from zero (P2-08 budget). The graphics result stays in the job for the
 * group assembly of later tasks. The logic drafts and the audio group get one manifest identity derived from all of
 * them; every conversion, that identity, the transfer lists and the final usage (read usage plus every conversion's
 * usage) are checked before the first group is sent. `open`, `graphics`, `logic` and `audio` are replaced only by tests.
 */
export function createImportJob(
  open: OpenSource = openVerifiedSource,
  graphics: GraphicsStepInput = PRODUCTION_GRAPHICS_STEP,
  logic: LogicStepInput = PRODUCTION_LOGIC_STEP,
  audio: AudioStageInput = PRODUCTION_AUDIO_STAGE,
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
    // Until P2-06/07 assemble graphics groups, only the step's usage outlives it.
    const { usage: graphicsUsage } = await runGraphicsStep(source, graphics.mappings, graphics.declarations, limits);
    stage = 'convert-logic';
    report.progress(stage, readBytes);
    const logicResult = await logic.convert(source, limits, graphicsUsage);
    stage = 'convert-audio';
    report.progress(stage, readBytes);
    const { usage: audioUsage, ...sounds } = await convertAudioGroup(source, audio.table, audio.rules, { limits: audio.limits });
    // Everything that can still fail runs before the first group is sent, so a failure never follows a group.
    const drafts: GroupDraft[] = [...logicResult.drafts, { group: 'audio', ...sounds }];
    const groups = applyManifestIdentity(productionIdentityBasis(source.identity.fingerprint), drafts)
      .map((group): PackageGroup => [group.manifest.group, group]);
    checkPackageTransfers(groups);
    const usage = addBudgets(addBudgets(source.usage(), logicResult.usage, 'usage'), audioUsage, 'usage');
    for (const [group, input] of groups) report.group(group, input);
    return usage;
  };
}
