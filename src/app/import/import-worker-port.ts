import type { ImportStartMessage } from '../../workers/import-protocol.ts';

/**
 * What the owner hears from one import Worker. The platform passes only the received data or the fact of an event,
 * never an event object, host error text or file name.
 */
export interface ImportWorkerEvents {
  message(data: unknown): void;
  /** A received message could not be deserialized. */
  messageError(): void;
  /** The Worker failed to load or reported an uncaught error. */
  error(): void;
}

/** One dedicated import Worker, defined by the app and implemented by the platform. */
export interface ImportWorkerPort {
  /** Sends a message; may throw synchronously, for example when the message cannot be cloned. */
  post(message: ImportStartMessage): void;
  /** Removes every listener, then terminates the Worker. Repeatable; no event is delivered afterwards. */
  terminate(): void;
}

/** Creates a new Worker for each call; may throw when the Worker cannot be created. */
export type ImportWorkerPortFactory = (events: ImportWorkerEvents) => ImportWorkerPort;
