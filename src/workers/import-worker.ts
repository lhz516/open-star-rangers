import { runImportHost, type ImportHostEndpoint } from './import-host.ts';
import { createImportJob } from './import-job.ts';

// The production import Worker entry, loaded as a module Worker. The page program has no WebWorker types, so `self` is
// asserted to the host's minimal endpoint.
runImportHost(self as unknown as ImportHostEndpoint, createImportJob());
