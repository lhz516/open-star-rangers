import type { ResourceGroup } from '../../content/asset-contract.ts';
import type { BudgetRecord } from '../../content/budget.ts';
import type { CompletenessDiagnostic } from '../../content/completeness.ts';
import {
  IMPORT_PROTOCOL_VERSION, importError, readImportStartMessage, readImportWorkerMessage, type ImportErrorData,
  type ImportSourceIdentity, type ImportStage, type ImportStartMessage, type ImportWorkerMessage,
} from '../../workers/import-protocol.ts';
import type { ImportWorkerEvents, ImportWorkerPort, ImportWorkerPortFactory } from './import-worker-port.ts';

/** One received group as the snapshot shows it: no payload bytes. */
export interface ImportGroupSummary {
  readonly group: ResourceGroup;
  readonly status: 'group-complete' | 'incomplete';
  /** Verified descriptors of a complete group; null for an incomplete one. */
  readonly assets: number | null;
  /** P2-01 safe diagnostics; empty for a complete group. */
  readonly diagnostics: readonly CompletenessDiagnostic[];
}

/** Frozen plain data, the same object between two changes. `finished` means the job ended normally, not that content is usable. */
export type ImportJobSnapshot =
  | { readonly status: 'idle' }
  | { readonly status: 'starting'; readonly jobId: number }
  | {
    readonly status: 'running';
    readonly jobId: number;
    readonly stage: ImportStage | null;
    readonly readBytes: number;
    readonly identity: ImportSourceIdentity | null;
    readonly groups: readonly ImportGroupSummary[];
  }
  | {
    readonly status: 'finished';
    readonly jobId: number;
    readonly identity: ImportSourceIdentity;
    readonly groups: readonly ImportGroupSummary[];
    readonly usage: BudgetRecord;
  }
  | { readonly status: 'failed'; readonly jobId: number; readonly stage: ImportStage | null; readonly error: ImportErrorData }
  | { readonly status: 'cancelled'; readonly jobId: number; readonly stage: ImportStage | null };

export type ImportStartResult =
  | { readonly status: 'started'; readonly jobId: number }
  | { readonly status: 'busy' | 'invalid-files' | 'disposed' };

export interface ImportJobOwner {
  /**
   * Starts a job with a new job ID and a new Worker when no job is active. The accepted files are copied at once to a
   * private `{ name, blob }` list holding only the Blob references; later changes to the array do not reach the job.
   */
  start(files: readonly File[]): ImportStartResult;
  /** Ends a starting or running job as `cancelled` and terminates its Worker at once; false otherwise. */
  cancel(): boolean;
  /** Terminates any active Worker, drops results and subscribers; later commands are rejected. Repeatable. */
  dispose(): void;
  /** Notified synchronously after each change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
  getSnapshot(): ImportJobSnapshot;
}

export interface ImportJobOwnerOptions {
  readonly createPort: ImportWorkerPortFactory;
  /** Receives what a subscriber throws; neither other subscribers nor the owner see it. */
  readonly reportError: (error: unknown) => void;
}

const IDLE: ImportJobSnapshot = Object.freeze({ status: 'idle' });
const NO_GROUPS: readonly ImportGroupSummary[] = Object.freeze([]);
const BUSY: ImportStartResult = Object.freeze({ status: 'busy' });
const INVALID_FILES: ImportStartResult = Object.freeze({ status: 'invalid-files' });
const DISPOSED: ImportStartResult = Object.freeze({ status: 'disposed' });

const WORKER_START_FAILED = importError('worker-start-failed', 'worker', 'the import Worker could not start');
const WORKER_FAILED = importError('worker-failed', 'worker', 'the import Worker failed');
const UNREADABLE_MESSAGE = importError('protocol-error', 'message', 'a message could not be deserialized');
const UNEXPECTED_MESSAGE = importError('protocol-error', 'message.type', 'the message is not allowed at this point of the job');
const OTHER_JOB = importError('protocol-error', 'message.jobId', 'the message does not belong to this job');
const OUT_OF_SEQUENCE = importError('protocol-error', 'message.sequence', 'the message is out of sequence');
const LATE_PROGRESS = importError('protocol-error', 'message.stage', 'identification progress after identification');
const INVALID_READ_BYTES = importError('protocol-error', 'message.readBytes', 'the read byte count decreased or exceeds the input size');
const REPEATED_GROUP = importError('protocol-error', 'message.group', 'the group was already received');

/**
 * The `start` request for the files, or null when they break the start rules. The protocol reader checks it, so the
 * main thread never sends a request the Worker rejects, and returns the frozen private `{ name, blob }` copy.
 */
function startRequest(jobId: number, files: unknown): ImportStartMessage | null {
  if (!Array.isArray(files)) return null;
  const read = readImportStartMessage({
    type: 'start', protocol: IMPORT_PROTOCOL_VERSION, jobId,
    files: files.map((file: unknown) => ({ name: (file as { readonly name?: unknown } | null)?.name, blob: file })),
  });
  return read.status === 'valid' ? read.message : null;
}

class Job {
  readonly id: number;
  readonly totalBytes: number;
  /** Released once sent or when the job ends. */
  request: ImportStartMessage | null;
  /** Assigned when the factory returns. */
  port: ImportWorkerPort | null = null;
  /** Events the factory delivered before returning, replayed in order once `starting` is published. */
  readonly early: (() => void)[] = [];
  ready = false;
  sequence = 0;
  stage: ImportStage | null = null;
  readBytes = 0;
  identity: ImportSourceIdentity | null = null;
  readonly received: ResourceGroup[] = [];

  constructor(request: ImportStartMessage) {
    this.id = request.jobId;
    this.request = request;
    this.totalBytes = request.files.reduce((total, { blob }) => total + blob.size, 0);
  }
}

class Owner implements ImportJobOwner {
  readonly #createPort: ImportWorkerPortFactory;
  readonly #reportError: (error: unknown) => void;
  readonly #listeners = new Set<{ readonly listener: () => void }>();
  #snapshot = IDLE;
  /** The active job; cleared when it ends. */
  #job: Job | null = null;
  #lastJobId = 0;
  #disposed = false;

  constructor({ createPort, reportError }: ImportJobOwnerOptions) {
    this.#createPort = createPort;
    this.#reportError = reportError;
  }

  start(files: readonly File[]): ImportStartResult {
    if (this.#disposed) return DISPOSED;
    if (this.#job) return BUSY;
    const request = startRequest(this.#lastJobId + 1, files);
    if (!request) return INVALID_FILES;
    this.#lastJobId = request.jobId;
    const job = new Job(request);
    this.#job = job;
    const started: ImportStartResult = Object.freeze({ status: 'started', jobId: job.id });
    try {
      job.port = this.#createPort(this.#events(job));
    } catch {
      this.#fail(job, WORKER_START_FAILED);
      return started;
    }
    this.#set({ status: 'starting', jobId: job.id });
    for (const deliver of job.early.splice(0)) if (this.#job === job) deliver();
    return started;
  }

  cancel(): boolean {
    const job = this.#job;
    if (!job) return false;
    this.#end(job, { status: 'cancelled', jobId: job.id, stage: job.stage });
    return true;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#listeners.clear();
    const job = this.#job;
    this.#job = null;
    if (job) {
      job.request = null;
      job.port?.terminate();
    }
  }

  subscribe(listener: () => void): () => void {
    if (this.#disposed) return () => undefined;
    const entry = { listener };
    this.#listeners.add(entry);
    return () => { this.#listeners.delete(entry); };
  }

  getSnapshot(): ImportJobSnapshot {
    return this.#snapshot;
  }

  /**
   * Events reach the job until it ends; those delivered while the factory runs wait until it returns. A new job starts
   * only after the previous one ended, so late events of an earlier job are dropped.
   */
  #events(job: Job): ImportWorkerEvents {
    const deliver = (handle: () => void) => {
      if (job.port === null) job.early.push(handle);
      else if (this.#job === job) handle();
    };
    return {
      message: data => deliver(() => this.#receive(job, data)),
      messageError: () => deliver(() => this.#fail(job, job.ready ? UNREADABLE_MESSAGE : WORKER_START_FAILED)),
      error: () => deliver(() => this.#fail(job, job.ready ? WORKER_FAILED : WORKER_START_FAILED)),
    };
  }

  #receive(job: Job, data: unknown): void {
    const read = readImportWorkerMessage(data);
    if (read.status === 'invalid') return this.#fail(job, read.error);
    const message = read.message;
    if (!job.ready) return this.#handshake(job, message);
    if (message.type === 'ready') return this.#fail(job, UNEXPECTED_MESSAGE);
    if (message.jobId !== job.id) return this.#fail(job, OTHER_JOB);
    if (message.sequence !== job.sequence + 1) return this.#fail(job, OUT_OF_SEQUENCE);
    job.sequence = message.sequence;
    switch (message.type) {
      case 'progress':
        if (job.identity && message.stage === 'identify-source') return this.#fail(job, LATE_PROGRESS);
        if (message.readBytes < job.readBytes || message.readBytes > job.totalBytes) return this.#fail(job, INVALID_READ_BYTES);
        job.stage = message.stage;
        job.readBytes = message.readBytes;
        return this.#running(job);
      case 'identified':
        if (job.identity) return this.#fail(job, UNEXPECTED_MESSAGE);
        job.identity = message.identity;
        return this.#running(job);
      case 'group':
        if (!job.identity) return this.#fail(job, UNEXPECTED_MESSAGE);
        if (job.received.includes(message.group)) return this.#fail(job, REPEATED_GROUP);
        job.received.push(message.group);
        return;
      case 'finished':
        if (!job.identity) return this.#fail(job, UNEXPECTED_MESSAGE);
        return this.#end(job, { status: 'finished', jobId: job.id, identity: job.identity, groups: NO_GROUPS, usage: message.usage });
      case 'failed':
        return this.#end(job, { status: 'failed', jobId: job.id, stage: job.stage, error: message.error });
    }
  }

  /** The first message must be `ready`; then the only `start` is sent, and the file references are released. */
  #handshake(job: Job, message: ImportWorkerMessage): void {
    if (message.type !== 'ready') return this.#fail(job, UNEXPECTED_MESSAGE);
    job.ready = true;
    const request = job.request!;
    job.request = null;
    try {
      job.port!.post(request);
    } catch {
      return this.#fail(job, WORKER_FAILED);
    }
    this.#running(job);
  }

  #running(job: Job): void {
    const { id: jobId, stage, readBytes, identity } = job;
    this.#set({ status: 'running', jobId, stage, readBytes, identity, groups: NO_GROUPS });
  }

  #fail(job: Job, error: ImportErrorData): void {
    this.#end(job, { status: 'failed', jobId: job.id, stage: job.stage, error });
  }

  /** Ends the job: its port is terminated exactly once, before subscribers see the terminal snapshot. */
  #end(job: Job, snapshot: ImportJobSnapshot): void {
    this.#job = null;
    job.request = null;
    try {
      job.port?.terminate();
    } finally {
      this.#set(snapshot);
    }
  }

  #set(snapshot: ImportJobSnapshot): void {
    this.#snapshot = Object.freeze(snapshot);
    // A subscriber removed during the notification, including by dispose, is skipped.
    for (const entry of [...this.#listeners]) {
      if (!this.#listeners.has(entry)) continue;
      try {
        entry.listener();
      } catch (error) {
        this.#report(error);
      }
    }
  }

  #report(error: unknown): void {
    try {
      this.#reportError(error);
    } catch {
      // A failing outlet must not break the owner or the other subscribers either.
    }
  }
}

/**
 * The app's owner of import jobs (P2-04): at most one active job, each in a new Worker created through `createPort`.
 * Cancelling, disposing and every terminal state terminate the Worker at once, and events of an earlier job never
 * change a later one. Snapshots never hold payload bytes, file names or host error text.
 */
export function createImportJobOwner(options: ImportJobOwnerOptions): ImportJobOwner {
  return new Owner(options);
}
