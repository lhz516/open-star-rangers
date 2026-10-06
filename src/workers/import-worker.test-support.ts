import type { GroupInput } from '../content/completeness.ts';
import { runImportHost, type ImportHostEndpoint, type ImportJob } from './import-host.ts';
import { ContentContractError } from '../content/contract-validation.ts';
import { createImportJob, PRODUCTION_LOGIC_STEP } from './import-job.ts';
import { boundGroups, MARKER, NO_LOGIC, NO_MODELS, scenarioOpen, SYNTHETIC_AUDIO, syntheticGroupsJob } from './synthetic-import.test-support.ts';

// The import Worker entry for browser tests. It shares the host with the production entry; the Worker's `name` option
// selects the scenario, so no query parameter or message reaches beyond the protocol.

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

/** Text the failing scenarios throw with; it contains the file-name marker, which must never reach a snapshot, error or console. */
const EXCEPTION_MARKER = `${MARKER}-exception`;

const scenarios: Readonly<Record<string, ImportJob>> = {
  synthetic,
  /**
   * The production job with its graphics, audio and model stages, no logic step and no model to convert, identifying a
   * disc in the production graphics and sound structure.
   */
  graphics: createImportJob(scenarioOpen('graphics'), undefined, NO_LOGIC, undefined, NO_MODELS),
  /** The same, with a font table the converter rejects. */
  'graphics-corrupt': createImportJob(scenarioOpen('graphics-corrupt'), undefined, NO_LOGIC, undefined, NO_MODELS),
  /** The same, with a front cockpit element the CCKD reader rejects. */
  'graphics-element-corrupt': createImportJob(scenarioOpen('graphics-element-corrupt'), undefined, NO_LOGIC, undefined, NO_MODELS),
  /** The production job with its graphics step and the synthetic sound table, on that disc with synthetic SND entries. */
  audio: createImportJob(scenarioOpen('audio'), undefined, NO_LOGIC, SYNTHETIC_AUDIO, NO_MODELS),
  /** The whole production job on the synthetic slice disc: the logic step binds the models the model step converts. */
  models: createImportJob(scenarioOpen('models')),
  /** The same, with a shared mesh the model step rejects. */
  'models-corrupt': createImportJob(scenarioOpen('models-corrupt')),
  /** Identifies the slice disc, then fails content validation in the logic step, so the job fails at the content layer. */
  'content-invalid': createImportJob(scenarioOpen('models'), undefined, {
    ...PRODUCTION_LOGIC_STEP,
    convert: async () => { throw new ContentContractError('invalid-record', 'drafts[0].manifest', 'must be a record'); },
  }),
  /** Announces itself with a progress message, then computes until the Worker is terminated. */
  busy: async (_, report) => {
    report.progress('identify-source', 0);
    for (;;) {
      // Only termination ends this loop.
    }
  },
  'job-throws': async () => {
    throw new Error(EXCEPTION_MARKER);
  },
  /** After `ready` and a progress message, throws outside the job, so only the Worker's error event reports it. */
  'late-error': (_, report) => {
    report.progress('identify-source', 0);
    setTimeout(() => { throw new Error(EXCEPTION_MARKER); });
    return new Promise(() => undefined);
  },
};

const scope = self as unknown as ImportHostEndpoint & { readonly name: string };
if (scope.name === 'top-level-throw') throw new Error(EXCEPTION_MARKER);
const job = Object.hasOwn(scenarios, scope.name) ? scenarios[scope.name] : null;
if (!job) throw new Error('Unknown import Worker test scenario');
runImportHost(scope, job);
