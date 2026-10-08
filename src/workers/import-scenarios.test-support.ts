import { RESOURCE_GROUPS } from '../content/asset-contract.ts';
import type { GroupInput } from '../content/completeness.ts';
import { ContentContractError } from '../content/contract-validation.ts';
import { withPlayerWingmanOption } from '../content/logic/logic-content.test-support.ts';
import { syntheticSourceGroup } from '../content/synthetic-content.test-support.ts';
import { PRODUCTION_CONVERTER_VERSION } from '../original-data/conversion/converter-version.ts';
import { PRODUCTION_GRAPHICS_DECLARATIONS, PRODUCTION_GRAPHICS_MAPPINGS, PRODUCTION_GRAPHICS_SHARE } from '../original-data/conversion/production-graphics.ts';
import { PRODUCTION_MODEL_TEXTURES } from '../original-data/conversion/production-model-textures.ts';
import { productionSliceEntries } from '../original-data/conversion/production-models.test-support.ts';
import { PRODUCTION_SND_RULES, PRODUCTION_SOUND_TABLE } from '../original-data/conversion/production-sounds.ts';
import { sourceFingerprint } from '../original-data/source/source-catalog.ts';
import { catalogFor } from '../original-data/source/source.test-support.ts';
import { buildImfat } from '../original-data/synthetic.ts';
import { canaryCoveredFiles } from './canary.test-support.ts';
import type { ImportJob } from './import-host.ts';
import { createImportJob, PRODUCTION_LOGIC_STEP, type OpenSource } from './import-job.ts';
import { IMPORT_PROTOCOL_VERSION, IMPORT_STAGES, type ImportStage } from './import-protocol.ts';
import { PRODUCTION_PACKAGE, type ExpectedPackageProfile } from './production-package.ts';
import {
  boundGroups, MARKER, NO_LOGIC, NO_MODELS, SCENARIO_SOURCES, scenarioOpen, scenarioProfile, sliceCoveredFiles, SYNTHETIC_AUDIO,
  syntheticGroupsJob, syntheticOpen, type IdentifyingScenario, type ScenarioSource, type SyntheticGroups,
} from './synthetic-import.test-support.ts';

// The import Worker test scenarios by name. The browser test Worker entry runs the one its `name` option selects, and
// Node tests run the same job or script, so both observe one fixture. Each is built on first use; none holds original
// data. P2-12 adds the failure matrix, timing and canary scenarios to the P2-04 to P2-11 ones.

/** Text the failing scenarios throw with; it contains the file-name marker, which must never reach a snapshot, error or console. */
export const EXCEPTION_MARKER = `${MARKER}-exception`;

/** Identifies production-sized synthetic files, sends the four bound groups and proves each was transferred, not copied. */
const synthetic: ImportJob = async (files, report) => {
  const sent: GroupInput[] = [];
  const usage = await syntheticGroupsJob(scenarioOpen('synthetic'), fingerprint => {
    const groups = boundGroups(fingerprint);
    sent.push(...groups.map(([, input]) => input));
    return groups;
  })(files, report);
  if (sent.flatMap(input => input.payloads as { readonly bytes: Uint8Array }[]).some(({ bytes }) => bytes.byteLength !== 0)) {
    throw new Error('A group payload was copied instead of transferred');
  }
  return usage;
};

/** The slice disc without the TEX entry of the first production model texture, which a bound model's parts name. */
const MISSING_TEXTURE_ENTRY = PRODUCTION_MODEL_TEXTURES[0].entry;

/**
 * The synthetic discs P2-12 scenarios identify beyond `SCENARIO_SOURCES`, each against a whitelist of exactly its own
 * files, so a broken payload or reference passes identification and fails where it is checked.
 */
const ENTRY_SOURCES: Readonly<Record<string, () => ScenarioSource>> = Object.freeze({
  'texture-missing': () => ({
    covered: { ...sliceCoveredFiles(), 'MAIN/SR.NOB': buildImfat(10_000, productionSliceEntries().filter(({ id }) => id !== MISSING_TEXTURE_ENTRY)) },
    versionId: 'synthetic-texture-missing',
  }),
  canary: () => ({ covered: canaryCoveredFiles(), versionId: 'synthetic-canary' }),
});

/** Identification of a P2-12 disc against its synthetic whitelist. */
function entryOpen(name: keyof typeof ENTRY_SOURCES): OpenSource {
  const { covered, versionId } = ENTRY_SOURCES[name]();
  return syntheticOpen(covered, versionId);
}

/** The Asset the budget scenarios' graphics step charges last. */
export const BUDGET_LAST_ASSET = 'font/hud/4x6';

/**
 * The payload usage of the budget scenarios' graphics step on the `graphics` disc: every production palette and image
 * and the 4×6 font. Fixed in advance; failure-matrix.test.ts checks it against the fixture's payload sizes.
 */
export const BUDGET_PAYLOAD_BYTES = 9_624;

/**
 * The budget scenarios' graphics step: the production graphics without the layouts, the two 8×8 fonts and the status
 * display messages, with the payload share replaced by `payloadBytes`, and no logic step or model, on the disc of
 * `scenario`. Palettes, images and fonts are charged in that order, each in Asset ID order, so the 4×6 font is charged
 * last, and its table is read only after its charge. Without logic and model shares the job's payload limit is `payloadBytes`, and the graphics step
 * charges from zero, so `BUDGET_PAYLOAD_BYTES` passes and one byte less fails at the 4×6 font.
 */
export function graphicsBudgetJob(payloadBytes: number, scenario: 'graphics' | 'graphics-corrupt' = 'graphics'): ImportJob {
  const kept = ({ asset: { id } }: { readonly asset: { readonly id: string } }) =>
    !id.startsWith('layout/') && !id.startsWith('data/') && (!id.startsWith('font/') || id === BUDGET_LAST_ASSET);
  const graphics = {
    mappings: { ...PRODUCTION_GRAPHICS_MAPPINGS, mappings: PRODUCTION_GRAPHICS_MAPPINGS.mappings.filter(kept) },
    declarations: PRODUCTION_GRAPHICS_DECLARATIONS.filter(kept),
    share: { ...PRODUCTION_GRAPHICS_SHARE, payloadBytes },
  };
  return createImportJob(scenarioOpen(scenario), graphics, NO_LOGIC, undefined, NO_MODELS);
}

/** The model-referenced sound the `sound-missing` audio stage leaves out. */
export const MISSING_SOUND = 'sound/model-clip/01';

/** Another source than any synthetic disc identifies. */
const OTHER_SOURCE = `source:sha256:${'0d'.repeat(32)}`;

/** The four synthetic groups, the models group bound to another source than the identified one. */
const mixedGroups: SyntheticGroups = fingerprint =>
  RESOURCE_GROUPS.map(group => [group, syntheticSourceGroup(group, group === 'models' ? OTHER_SOURCE : fingerprint)]);

/** A Blob whose reads never settle once `held()` is true; its slices share the condition. */
class HeldBlob extends Blob {
  readonly #held: () => boolean;
  readonly #onHold: () => void;

  constructor(parts: Blob[], held: () => boolean, onHold: () => void) {
    super(parts);
    this.#held = held;
    this.#onHold = onHold;
  }

  override slice(start?: number, end?: number): Blob {
    return new HeldBlob([super.slice(start, end)], this.#held, this.#onHold);
  }

  override arrayBuffer(): Promise<ArrayBuffer> {
    if (!this.#held()) return super.arrayBuffer();
    this.#onHold();
    return new Promise(() => undefined);
  }
}

/**
 * The `models` job on the slice disc, whose file reads stop settling once it reports progress for `stage`: every stage
 * reads the files, so the job stays in `stage` until its Worker is terminated. `onHold` runs at each held read.
 */
export function holdAtStage(stage: ImportStage, onHold: () => void = () => undefined): ImportJob {
  const job = createImportJob(scenarioOpen('models'));
  return (files, report) => {
    let entered = false;
    const held = () => entered;
    return job(files.map(({ name, blob }) => ({ name, blob: new HeldBlob([blob], held, onHold) })), Object.freeze({
      ...report,
      progress: (at: ImportStage, readBytes: number) => {
        if (at === stage) entered = true;
        report.progress(at, readBytes);
      },
    }));
  };
}

/**
 * The BroadcastChannel on which a browser test releases `held-late-error`: any message posted on it from the page makes
 * every waiting Worker of that scenario throw. Test wiring only; the import protocol is unchanged.
 */
export const LATE_ERROR_RELEASE_CHANNEL = 'osr-test-late-error-release';

/** Milliseconds between the progress messages of `progress-stream`. */
export const PROGRESS_STREAM_INTERVAL_MS = 2;

/** Reports identification progress again and again until its Worker is terminated or reporting throws. */
const progressStream: ImportJob = async (_, report) => {
  for (;;) {
    report.progress('identify-source', 0);
    await new Promise(resolve => { setTimeout(resolve, PROGRESS_STREAM_INTERVAL_MS); });
  }
};

const holdScenarios = Object.fromEntries(IMPORT_STAGES.map(stage => [`hold-${stage}`, () => holdAtStage(stage)]));

/** Import job scenarios by Worker name. */
export const IMPORT_SCENARIOS: Readonly<Record<string, () => ImportJob>> = Object.freeze({
  synthetic: () => synthetic,
  /**
   * The production job with its graphics, audio and model stages, no logic step and no model to convert, identifying a
   * disc in the production graphics and sound structure. It finishes without a logic group and with an incomplete
   * models group (F-10).
   */
  graphics: () => createImportJob(scenarioOpen('graphics'), undefined, NO_LOGIC, undefined, NO_MODELS),
  /** The same, with a font table the converter rejects. */
  'graphics-corrupt': () => createImportJob(scenarioOpen('graphics-corrupt'), undefined, NO_LOGIC, undefined, NO_MODELS),
  /** The same, with a front cockpit element the CCKD reader rejects. */
  'graphics-element-corrupt': () => createImportJob(scenarioOpen('graphics-element-corrupt'), undefined, NO_LOGIC, undefined, NO_MODELS),
  /** The production job with its graphics step and the synthetic sound table, on that disc with synthetic SND entries. */
  audio: () => createImportJob(scenarioOpen('audio'), undefined, NO_LOGIC, SYNTHETIC_AUDIO, NO_MODELS),
  /** The whole production job on the synthetic slice disc: the logic step binds the models the model step converts. */
  models: () => createImportJob(scenarioOpen('models')),
  /** The same, with a shared mesh the model step rejects (F-07). */
  'models-corrupt': () => createImportJob(scenarioOpen('models-corrupt')),
  /** Identifies the slice disc, then fails content validation in the logic step, so the job fails at the content layer (F-09). */
  'content-invalid': () => createImportJob(scenarioOpen('models'), undefined, {
    ...PRODUCTION_LOGIC_STEP,
    convert: async () => { throw new ContentContractError('invalid-record', 'drafts[0].manifest', 'must be a record'); },
  }),
  /** Announces itself with a progress message, then computes until the Worker is terminated. */
  busy: () => async (_, report) => {
    report.progress('identify-source', 0);
    for (;;) {
      // Only termination ends this loop.
    }
  },
  'job-throws': () => async () => {
    throw new Error(EXCEPTION_MARKER);
  },
  /** After `ready` and a progress message, throws outside the job, so only the Worker's error event reports it. */
  'late-error': () => (_, report) => {
    report.progress('identify-source', 0);
    setTimeout(() => { throw new Error(EXCEPTION_MARKER); });
    return new Promise(() => undefined);
  },
  /**
   * F-11, I-7: `late-error` once the test releases it on `LATE_ERROR_RELEASE_CHANNEL`, so the job stays running for a
   * window of the test's choosing before the Worker's error event reports it.
   */
  'held-late-error': () => (_, report) => {
    report.progress('identify-source', 0);
    const release = new BroadcastChannel(LATE_ERROR_RELEASE_CHANNEL);
    release.onmessage = () => {
      release.close();
      throw new Error(EXCEPTION_MARKER);
    };
    return new Promise(() => undefined);
  },
  /** F-04: the graphics payload budget exactly at the budget step's payload usage, which passes. */
  'graphics-budget-at-limit': () => graphicsBudgetJob(BUDGET_PAYLOAD_BYTES),
  /** F-04: one byte below it, which the last charged Asset, the 4×6 font, exceeds. */
  'graphics-budget-over-limit': () => graphicsBudgetJob(BUDGET_PAYLOAD_BYTES - 1),
  /** F-08: the whole production job on a slice disc whose referenced texture entry is missing, identified as that disc. */
  'texture-missing': () => createImportJob(entryOpen('texture-missing')),
  /**
   * F-08: the whole production job on the slice disc with a sound table lacking a sound a model references: every group
   * is complete, but the package misses that cross-group dependency.
   */
  'sound-missing': () => createImportJob(scenarioOpen('models'), undefined, undefined, {
    table: PRODUCTION_SOUND_TABLE.filter(({ mapping }) => mapping.asset.id !== MISSING_SOUND),
    rules: PRODUCTION_SND_RULES,
  }),
  /** F-09: identifies the slice disc, then sends the four synthetic groups with the models group bound to another source. */
  'mixed-identity': () => syntheticGroupsJob(scenarioOpen('models'), mixedGroups),
  /** F-10: the whole production job on the slice disc, with a converted roster whose first option is the player craft type. */
  'mission-invalid': () => createImportJob(scenarioOpen('models'), undefined, {
    ...PRODUCTION_LOGIC_STEP,
    convert: async (...args: Parameters<typeof PRODUCTION_LOGIC_STEP.convert>) => {
      const converted = await PRODUCTION_LOGIC_STEP.convert(...args);
      return { ...converted, drafts: converted.drafts.map(withPlayerWingmanOption) };
    },
  }),
  /** F-12: `hold-<stage>` stays in that stage until terminated. */
  ...holdScenarios,
  /** F-12: continuous identification progress until terminated. */
  'progress-stream': () => progressStream,
  /** S-06: the whole production job on the canary slice disc. */
  canary: () => createImportJob(entryOpen('canary')),
});

/** The part of a Worker scope a protocol script uses. */
export interface RawWorkerEndpoint {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: { readonly data?: unknown }) => void): void;
}

/** A Worker that bypasses the host and speaks the protocol directly. */
export type ProtocolScript = (endpoint: RawWorkerEndpoint) => void;

const PROTOCOL_SOURCE = `source:sha256:${'5e'.repeat(32)}`;
const identifiedMessage = (jobId: number, sequence: number) =>
  ({ type: 'identified', jobId, sequence, identity: { versionId: 'synthetic-protocol', sourceFingerprint: PROTOCOL_SOURCE } });
const logicGroupMessage = (jobId: number, sequence: number) =>
  ({ type: 'group', jobId, sequence, group: 'logic', input: syntheticSourceGroup('logic', PROTOCOL_SOURCE) });

/** Sends `ready`, then answers `start` with `messages` for its job ID. */
const script = (messages: (jobId: number) => readonly unknown[]): ProtocolScript => endpoint => {
  endpoint.addEventListener('message', ({ data }) => {
    for (const message of messages((data as { readonly jobId: number }).jobId)) endpoint.postMessage(message);
  });
  endpoint.postMessage({ type: 'ready', protocol: IMPORT_PROTOCOL_VERSION });
};

/** F-09: Workers whose messages break the protocol at a known point, by Worker name. */
export const PROTOCOL_SCRIPTS: Readonly<Record<string, ProtocolScript>> = Object.freeze({
  /** A message of no known type. */
  'protocol-invalid-message': script(jobId => [{ type: 'unknown', jobId, sequence: 1 }]),
  /** A first message numbered 2. */
  'protocol-out-of-sequence': script(jobId => [{ type: 'progress', jobId, sequence: 2, stage: 'identify-source', readBytes: 0 }]),
  /** A group before the source is identified. */
  'protocol-group-before-identified': script(jobId => [logicGroupMessage(jobId, 1)]),
  /** The same group twice. */
  'protocol-repeated-group': script(jobId => [identifiedMessage(jobId, 1), logicGroupMessage(jobId, 2), logicGroupMessage(jobId, 3)]),
});

/** The disc every scenario identifies, by Worker name. */
const SCENARIO_DISCS: Readonly<Record<string, () => ScenarioSource>> = Object.freeze({
  ...SCENARIO_SOURCES,
  ...ENTRY_SOURCES,
  'graphics-budget-at-limit': SCENARIO_SOURCES.graphics,
  'graphics-budget-over-limit': SCENARIO_SOURCES.graphics,
  'sound-missing': SCENARIO_SOURCES.models,
  'mixed-identity': SCENARIO_SOURCES.models,
  'mission-invalid': SCENARIO_SOURCES.models,
  ...Object.fromEntries(IMPORT_STAGES.map(stage => [`hold-${stage}`, SCENARIO_SOURCES.models])),
});

/** The disc a scenario identifies, or null when it identifies none. */
export const scenarioSource = (name: string): ScenarioSource | null => (Object.hasOwn(SCENARIO_DISCS, name) ? SCENARIO_DISCS[name]() : null);

/**
 * The expected package profile of the test entry for a Worker scenario: `scenarioProfile` for the P2-04 to P2-11
 * scenarios, and for the P2-12 ones the identified disc's fingerprint with the production converter version and
 * package budget; null for a scenario that identifies no disc.
 */
export function scenarioEntryProfile(name: string): ExpectedPackageProfile | null {
  if (Object.hasOwn(SCENARIO_SOURCES, name)) return scenarioProfile(name as IdentifyingScenario);
  const source = scenarioSource(name);
  if (!source) return null;
  return Object.freeze({
    converterVersion: PRODUCTION_CONVERTER_VERSION,
    sourceFingerprint: sourceFingerprint(catalogFor(source.covered, source.versionId)),
    limits: PRODUCTION_PACKAGE.limits,
  });
}
