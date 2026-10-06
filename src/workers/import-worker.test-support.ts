import type { GroupInput } from '../content/completeness.ts';
import { runImportHost, type ImportHostEndpoint, type ImportJob } from './import-host.ts';
import { createImportJob } from './import-job.ts';
import {
  audioCoveredFiles, boundGroups, graphicsCoveredFiles, MARKER, productionSizedFiles, SYNTHETIC_AUDIO, syntheticGroupsJob, syntheticOpen,
} from './synthetic-import.test-support.ts';

// The import Worker entry for browser tests. It shares the host with the production entry; the Worker's `name` option
// selects the scenario, so no query parameter or message reaches beyond the protocol.

/** Identifies production-sized synthetic files, sends the four bound groups and proves each was transferred, not copied. */
const synthetic: ImportJob = async (files, report) => {
  const sent: GroupInput[] = [];
  const usage = await syntheticGroupsJob(syntheticOpen(productionSizedFiles(), 'synthetic-browser'), fingerprint => {
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
  /** The production job with its graphics step, identifying a disc in the production graphics structure. */
  graphics: createImportJob(syntheticOpen(graphicsCoveredFiles(), 'synthetic-graphics')),
  /** The same, with a font table the converter rejects. */
  'graphics-corrupt': createImportJob(syntheticOpen(graphicsCoveredFiles(true), 'synthetic-graphics')),
  /** The production job with its graphics step and the synthetic sound table, on that disc with synthetic SND entries. */
  audio: createImportJob(syntheticOpen(audioCoveredFiles(), 'synthetic-audio'), undefined, SYNTHETIC_AUDIO),
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
