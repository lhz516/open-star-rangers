import { runImportHost, type ImportHostEndpoint } from './import-host.ts';
import { EXCEPTION_MARKER, IMPORT_SCENARIOS, PROTOCOL_SCRIPTS, type RawWorkerEndpoint } from './import-scenarios.test-support.ts';

// The import Worker entry for browser tests. It shares the host with the production entry; the Worker's `name` option
// selects a job scenario or a protocol script of import-scenarios.test-support.ts, so no query parameter or message
// reaches beyond the protocol.

const scope = self as unknown as ImportHostEndpoint & RawWorkerEndpoint & { readonly name: string };
if (scope.name === 'top-level-throw') throw new Error(EXCEPTION_MARKER);
if (Object.hasOwn(PROTOCOL_SCRIPTS, scope.name)) {
  PROTOCOL_SCRIPTS[scope.name](scope);
} else {
  if (!Object.hasOwn(IMPORT_SCENARIOS, scope.name)) throw new Error('Unknown import Worker test scenario');
  runImportHost(scope, IMPORT_SCENARIOS[scope.name]());
}
