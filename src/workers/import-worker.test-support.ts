import type { GroupInput } from '../content/completeness.ts';
import { runImportHost, type ImportHostEndpoint, type ImportJob } from './import-host.ts';
import { boundGroups, productionSizedFiles, syntheticGroupsJob, syntheticOpen } from './synthetic-import.test-support.ts';

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

const scenarios: Readonly<Record<string, ImportJob>> = { synthetic };

const scope = self as unknown as ImportHostEndpoint & { readonly name: string };
const job = Object.hasOwn(scenarios, scope.name) ? scenarios[scope.name] : null;
if (!job) throw new Error('Unknown import Worker test scenario');
runImportHost(scope, job);
