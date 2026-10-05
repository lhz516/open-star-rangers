import type { ImportWorkerPortFactory } from '../../app/import/import-worker-port.ts';
import { connectImportWorker, type WorkerLike } from './worker-port.ts';

/** The production import Worker, as a module Worker Vite builds in ES format. */
const createProductionWorker = (): WorkerLike =>
  new Worker(new URL('../../workers/import-worker.ts', import.meta.url), { type: 'module' });

/**
 * The browser's import Worker port factory: one new Worker per job. Browser tests pass `createWorker` to load a
 * test entry; production uses the default.
 */
export function browserImportWorkerFactory(createWorker: () => WorkerLike = createProductionWorker): ImportWorkerPortFactory {
  return events => connectImportWorker(createWorker(), events);
}
