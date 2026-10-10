import type { ResourceGroup } from '../content/asset-contract.ts';
import { addBudgets, EMPTY_BUDGET_USAGE, type BudgetRecord } from '../content/budget.ts';
import type { GroupInput } from '../content/completeness.ts';
import { fail } from '../content/contract-validation.ts';
import { applyManifestIdentity, type GroupDraft } from '../content/manifest-identity.ts';
import { payloadTransferList } from '../content/ownership.ts';
import { readPayloadRecords } from '../content/payload.ts';
import { convertAudioGroup } from '../original-data/conversion/audio-conversion.ts';
import { convertLogic, PRODUCTION_LOGIC_SHARE } from '../original-data/conversion/convert-logic.ts';
import { convertRuleData } from '../original-data/conversion/convert-rule-data.ts';
import type { ModelReferences } from '../original-data/conversion/convert-models.ts';
import { productionIdentityBasis } from '../original-data/conversion/converter-version.ts';
import type { ModelBinding } from '../original-data/conversion/craft-binding.ts';
import { runEffectStep } from '../original-data/conversion/effect-step.ts';
import { runFlightDataStep } from '../original-data/conversion/flight-data-step.ts';
import { mergeGroupDrafts, runGraphicsStep, stepGroupDraft } from '../original-data/conversion/graphics-step.ts';
import { modelsGroupDraft, runModelStep } from '../original-data/conversion/model-step.ts';
import { PRODUCTION_EFFECT_DECLARATIONS, PRODUCTION_EFFECT_MAPPINGS } from '../original-data/conversion/production-effects.ts';
import {
  PRODUCTION_FLIGHT_DATA_DECLARATIONS, PRODUCTION_FLIGHT_DATA_MAPPINGS, PRODUCTION_FLIGHT_DATA_SHARE,
} from '../original-data/conversion/production-flight-data.ts';
import {
  PRODUCTION_GRAPHICS_DECLARATIONS, PRODUCTION_GRAPHICS_MAPPINGS, PRODUCTION_GRAPHICS_SHARE,
} from '../original-data/conversion/production-graphics.ts';
import {
  PRODUCTION_MODEL_REFERENCES, PRODUCTION_MODEL_SHARE, productionModelDeclarations, productionModelMappings,
} from '../original-data/conversion/production-models.ts';
import { PRODUCTION_RULE_DATA_SHARE } from '../original-data/conversion/production-rule-data.ts';
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

/** The P2-05 production graphics, the P2-06 slice textures, the P2-07 cockpit, HUD and map Assets and the P3-03 flight graphics. */
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

/** The logic step's groups and usage, and the craft models its binding names for the model step. */
export interface LogicStepGroups extends StepGroups {
  readonly models: readonly ModelBinding[];
}

/**
 * The logic conversion step and the budget share approved for it. `convert` charges `limits` on top of `usage`, the
 * earlier steps' conversion usage.
 */
export interface LogicStepInput {
  readonly convert: (source: VerifiedSource, limits: BudgetRecord, usage: BudgetRecord) => Promise<LogicStepGroups>;
  readonly share: BudgetRecord;
}

/**
 * The P2-09 production logic conversion followed by the P3-03 rule-data conversion, charged on top of it; their logic
 * group drafts merge by Asset ID into one. The share is both steps'. Tests vary the share or wrap `convert`.
 */
export const PRODUCTION_LOGIC_STEP: LogicStepInput = Object.freeze({
  convert: async (source: VerifiedSource, limits: BudgetRecord, usage: BudgetRecord) => {
    const logic = await convertLogic(source, limits, usage);
    const ruleData = await convertRuleData(source, limits, logic.usage);
    const draft = mergeGroupDrafts('logic', [logic.draft, ruleData.partition], source.identity.fingerprint);
    return { drafts: [draft], usage: ruleData.usage, models: logic.models };
  },
  share: addBudgets(PRODUCTION_LOGIC_SHARE, PRODUCTION_RULE_DATA_SHARE, 'share'),
});

/**
 * The model stage: the mappings and declarations of the craft models the logic step bound, the lookup tables of part
 * textures and sound slots, the effect mappings and declarations the effect step converts after the models, the flight
 * data mappings and declarations the flight data step converts after the effects, and the budget share approved for the
 * three steps.
 */
export interface ModelStepInput {
  readonly inputs: (models: readonly ModelBinding[]) => { readonly mappings: unknown; readonly declarations: unknown };
  readonly references: ModelReferences;
  readonly effects: { readonly mappings: unknown; readonly declarations: unknown };
  readonly flightData: { readonly mappings: unknown; readonly declarations: unknown };
  readonly share: BudgetRecord;
}

/** The P2-06 production models and effects and the P3-03 flight data. */
const PRODUCTION_MODEL_STEP: ModelStepInput = Object.freeze({
  inputs: (models: readonly ModelBinding[]) => ({ mappings: productionModelMappings(models), declarations: productionModelDeclarations(models) }),
  references: PRODUCTION_MODEL_REFERENCES,
  effects: Object.freeze({ mappings: PRODUCTION_EFFECT_MAPPINGS, declarations: PRODUCTION_EFFECT_DECLARATIONS }),
  flightData: Object.freeze({ mappings: PRODUCTION_FLIGHT_DATA_MAPPINGS, declarations: PRODUCTION_FLIGHT_DATA_DECLARATIONS }),
  share: addBudgets(PRODUCTION_MODEL_SHARE, PRODUCTION_FLIGHT_DATA_SHARE, 'share'),
});

/** What the audio stage converts: a sound table and the SND interpretations it accepts. */
export interface AudioStageInput {
  readonly table: unknown;
  readonly rules: SndFormatRules;
  /** Replaces `AUDIO_BUDGET_LIMITS`; only tests pass it. */
  readonly limits?: BudgetRecord;
}

/** The P2-08 production sounds and the P3-03 event and HUD sounds. */
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
 * graphics and the logic conversion steps, converts the audio group and runs the model, effect and flight data steps.
 * Each stage reports progress once when it starts and after every port read, with the read bytes accumulated across
 * stages. The graphics, logic and model limits are the P2-02 default read limit (the input size) plus the three stages'
 * shares: the logic step charges on top of the graphics usage, the model step on top of the logic usage, and the effect
 * and flight data steps, in the same stage, each on top of the step before; the audio stage charges its own limits from
 * zero (P2-08 budget). The graphics step's `cockpit-hud-map` partition becomes the `cockpit-hud-map` group, and the model
 * step converts the craft models the logic step bound; those models, the effect Assets and the flight data Assets join
 * the graphics step's `models` partition in the `models` group; neither group's Assets are converted again. The logic drafts and the always-sent `cockpit-hud-map`, audio and
 * models groups get one manifest identity derived from all of them; every conversion, that identity, the transfer
 * lists and the final usage (read usage plus every conversion's usage) are checked before the first group is sent, and
 * groups are sent in `RESOURCE_GROUPS` order. `open`, `graphics`, `logic`, `audio` and `models` are replaced only by
 * tests.
 */
export function createImportJob(
  open: OpenSource = openVerifiedSource,
  graphics: GraphicsStepInput = PRODUCTION_GRAPHICS_STEP,
  logic: LogicStepInput = PRODUCTION_LOGIC_STEP,
  audio: AudioStageInput = PRODUCTION_AUDIO_STAGE,
  models: ModelStepInput = PRODUCTION_MODEL_STEP,
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
    const limits = [graphics.share, logic.share, models.share]
      .reduce((total, share) => addBudgets(total, share, 'limits'), { ...EMPTY_BUDGET_USAGE, sourceReadBytes: inputBytes });
    const enter = (next: ImportStage) => {
      stage = next;
      report.progress(stage, readBytes);
    };
    enter('convert-graphics');
    const graphicsResult = await runGraphicsStep(source, graphics.mappings, graphics.declarations, limits);
    enter('convert-logic');
    const logicResult = await logic.convert(source, limits, graphicsResult.usage);
    enter('convert-audio');
    const { usage: audioUsage, ...sounds } = await convertAudioGroup(source, audio.table, audio.rules, { limits: audio.limits });
    enter('convert-models');
    const { mappings, declarations } = models.inputs(logicResult.models);
    const modelResult = await runModelStep(source, mappings, declarations, models.references, limits, logicResult.usage);
    const effectResult = await runEffectStep(source, models.effects.mappings, models.effects.declarations, limits, modelResult.usage);
    const flightDataResult = await runFlightDataStep(source, models.flightData.mappings, models.flightData.declarations, limits, effectResult.usage);
    // Everything that can still fail runs before the first group is sent, so a failure never follows a group.
    const fingerprint = source.identity.fingerprint;
    const drafts: GroupDraft[] = [
      stepGroupDraft('cockpit-hud-map', [graphicsResult], fingerprint),
      ...logicResult.drafts,
      { group: 'audio', ...sounds },
      modelsGroupDraft([graphicsResult, modelResult, effectResult, flightDataResult], fingerprint),
    ];
    const groups = applyManifestIdentity(productionIdentityBasis(fingerprint), drafts)
      .map((group): PackageGroup => [group.manifest.group, group]);
    checkPackageTransfers(groups);
    const usage = addBudgets(addBudgets(source.usage(), flightDataResult.usage, 'usage'), audioUsage, 'usage');
    for (const [group, input] of groups) report.group(group, input);
    return usage;
  };
}
