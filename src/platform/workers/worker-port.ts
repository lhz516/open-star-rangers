import type { ImportStartMessage } from '../../workers/import-protocol.ts';
import type { ImportWorkerEvents, ImportWorkerPort } from '../../app/import/import-worker-port.ts';

type WorkerEventType = 'message' | 'messageerror' | 'error';

interface WorkerEvent {
  readonly data?: unknown;
  preventDefault(): void;
}

/** The part of a dedicated Worker the adapter uses, so it needs no DOM types and runs in Node tests. */
export interface WorkerLike {
  postMessage(message: unknown): void;
  addEventListener(type: WorkerEventType, listener: (event: WorkerEvent) => void): void;
  removeEventListener(type: WorkerEventType, listener: (event: WorkerEvent) => void): void;
  terminate(): void;
}

class WorkerPort implements ImportWorkerPort {
  readonly #worker: WorkerLike;
  readonly #listeners: readonly (readonly [WorkerEventType, (event: WorkerEvent) => void])[];
  #terminated = false;

  constructor(worker: WorkerLike, events: ImportWorkerEvents) {
    this.#worker = worker;
    this.#listeners = [
      ['message', event => events.message(event.data)],
      ['messageerror', () => events.messageError()],
      // Cancelling keeps the Worker's error text out of the page's console; the owner only learns that it happened.
      ['error', event => { event.preventDefault(); events.error(); }],
    ];
    for (const [type, listener] of this.#listeners) worker.addEventListener(type, listener);
  }

  post(message: ImportStartMessage): void {
    this.#worker.postMessage(message);
  }

  terminate(): void {
    if (this.#terminated) return;
    this.#terminated = true;
    for (const [type, listener] of this.#listeners) this.#worker.removeEventListener(type, listener);
    this.#worker.terminate();
  }
}

/**
 * Implements the app's import Worker port on a Worker: it passes on only received data or the fact of an event, never an
 * event object, error text or file name; `terminate()` removes its listeners before terminating, once.
 */
export function connectImportWorker(worker: WorkerLike, events: ImportWorkerEvents): ImportWorkerPort {
  return new WorkerPort(worker, events);
}
