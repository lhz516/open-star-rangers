import type { ResourceGroup } from '../content/asset-contract.ts';
import { readBudgetRecord, type BudgetRecord } from '../content/budget.ts';
import type { GroupInput } from '../content/completeness.ts';
import { ContentContractError } from '../content/contract-validation.ts';
import { payloadTransferList } from '../content/ownership.ts';
import { readPayloadRecords } from '../content/payload.ts';
import { DiscReadError } from '../original-data/disc/disc-error.ts';
import { SourceError } from '../original-data/source-error.ts';
import {
  canReportStage, IMPORT_PROTOCOL_VERSION, importError, readImportStartMessage, type ImportFile, type ImportSourceIdentity, type ImportStage,
  type ImportWorkerMessage, type WorkerImportErrorData,
} from './import-protocol.ts';

export interface ImportHostEvent {
  readonly data?: unknown;
  preventDefault(): void;
}

/**
 * The part of a dedicated Worker scope the host uses; the Worker entry asserts `self` to it. The host never listens for
 * `error`: an uncaught error after `ready` reaches the main thread, which reports `worker-failed`.
 */
export interface ImportHostEndpoint {
  postMessage(message: ImportWorkerMessage, transfer: ArrayBuffer[]): void;
  addEventListener(type: 'message' | 'messageerror' | 'unhandledrejection', listener: (event: ImportHostEvent) => void): void;
  close(): void;
}

/** How a job reports; calls after the job's terminal message are ignored. */
export interface ImportReporter {
  progress(stage: ImportStage, readBytes: number): void;
  /** At most once, before any group. */
  identified(identity: ImportSourceIdentity): void;
  /** Each group at most once, after `identified`. The payload buffers are transferred and unusable afterwards. */
  group(group: ResourceGroup, input: GroupInput): void;
}

/** One import job: it reads the files, reports through the reporter, and resolves to its budget usage. */
export type ImportJob = (files: readonly ImportFile[], report: ImportReporter) => Promise<BudgetRecord>;

const INTERNAL_ERROR = importError('internal-error', 'job', 'the import job failed unexpectedly');
const SECOND_REQUEST = importError('invalid-request', 'request', 'the Worker accepts a single start message');
const UNREADABLE_REQUEST = importError('invalid-request', 'request', 'the request could not be deserialized');

/** Known failures keep their layer and safe fields; anything else, including host error text, is `internal-error`. */
function toErrorData(error: unknown): WorkerImportErrorData {
  if (error instanceof DiscReadError) return Object.freeze({ layer: 'disc', ...error.toData() });
  if (error instanceof SourceError) return Object.freeze({ layer: 'source', ...error.toData() });
  if (error instanceof ContentContractError) {
    return Object.freeze({ layer: 'content', code: error.code, location: error.path, reason: error.reason, limit: null });
  }
  return INTERNAL_ERROR;
}

class ImportHost {
  readonly #endpoint: ImportHostEndpoint;
  readonly #job: ImportJob;
  #phase: 'waiting' | 'running' | 'closed' = 'waiting';
  #jobId: number | null = null;
  #sequence = 0;
  #identified = false;
  #stage: ImportStage | null = null;
  readonly #groups: ResourceGroup[] = [];

  constructor(endpoint: ImportHostEndpoint, job: ImportJob) {
    this.#endpoint = endpoint;
    this.#job = job;
    endpoint.addEventListener('message', event => this.#receive(event.data));
    endpoint.addEventListener('messageerror', () => this.#fail(UNREADABLE_REQUEST));
    endpoint.addEventListener('unhandledrejection', event => {
      // Cancelling keeps the rejection's text out of the console; the failure carries no host text either.
      event.preventDefault();
      this.#fail(INTERNAL_ERROR);
    });
    endpoint.postMessage({ type: 'ready', protocol: IMPORT_PROTOCOL_VERSION }, []);
  }

  #receive(data: unknown): void {
    if (this.#phase === 'running') return this.#fail(SECOND_REQUEST);
    if (this.#phase === 'closed') return;
    const read = readImportStartMessage(data);
    this.#jobId = read.status === 'valid' ? read.message.jobId : read.jobId;
    if (read.status === 'invalid') return this.#fail(read.error);
    this.#phase = 'running';
    void this.#run(read.message.jobId, read.message.files);
  }

  async #run(jobId: number, files: readonly ImportFile[]): Promise<void> {
    const report: ImportReporter = Object.freeze({
      progress: (stage: ImportStage, readBytes: number) => {
        if (!canReportStage(this.#stage, stage, this.#identified)) return this.#fail(INTERNAL_ERROR);
        this.#stage = stage;
        this.#send(sequence => ({ type: 'progress', jobId, sequence, stage, readBytes }));
      },
      identified: ({ versionId, sourceFingerprint }: ImportSourceIdentity) => {
        if (this.#identified) return this.#fail(INTERNAL_ERROR);
        this.#send(sequence => ({ type: 'identified', jobId, sequence, identity: { versionId, sourceFingerprint } }));
        this.#identified = true;
      },
      group: (group: ResourceGroup, input: GroupInput) => this.#sendGroup(jobId, group, input),
    });
    try {
      // Read as a plain record, so the terminal message is always cloneable.
      const usage = readBudgetRecord(await this.#job(files, report), 'usage');
      if (this.#phase !== 'running') return;
      // `finished` always follows `identified`.
      if (!this.#identified) return this.#fail(INTERNAL_ERROR);
      this.#terminate(sequence => ({ type: 'finished', jobId, sequence, groups: [...this.#groups], usage }));
    } catch (error) {
      this.#fail(toErrorData(error));
    }
  }

  #sendGroup(jobId: number, group: ResourceGroup, { manifest, payloads, sources }: GroupInput): void {
    if (this.#phase !== 'running') return;
    if (!this.#identified || this.#groups.includes(group)) return this.#fail(INTERNAL_ERROR);
    let transfer: readonly ArrayBuffer[];
    try {
      const path = `groups.${group}.payloads`;
      transfer = payloadTransferList(readPayloadRecords(payloads, path).map(payload => payload.bytes), path);
    } catch (error) {
      return this.#fail(toErrorData(error));
    }
    this.#send(sequence => ({ type: 'group', jobId, sequence, group, input: { manifest, payloads, sources } }), [...transfer]);
    this.#groups.push(group);
  }

  #fail(error: WorkerImportErrorData): void {
    if (this.#phase === 'closed') return;
    this.#terminate(sequence => ({ type: 'failed', jobId: this.#jobId, sequence, error }));
  }

  // Ignored after the terminal message. A send that throws, such as a clone failure, consumes no sequence number and
  // the exception reaches the job.
  #send(message: (sequence: number) => ImportWorkerMessage, transfer: ArrayBuffer[] = []): void {
    if (this.#phase !== 'running') return;
    this.#endpoint.postMessage(message(this.#sequence + 1), transfer);
    this.#sequence += 1;
  }

  #terminate(message: (sequence: number) => ImportWorkerMessage): void {
    this.#phase = 'closed';
    try {
      this.#endpoint.postMessage(message(this.#sequence + 1), []);
    } finally {
      this.#endpoint.close();
    }
  }
}

/**
 * Runs one import job in a Worker: installs the listeners, sends `ready`, accepts the first valid `start`, and ends with
 * exactly one `finished` or `failed` before closing the endpoint. Every message after `ready` carries the job ID and a
 * sequence number counting from 1.
 */
export function runImportHost(endpoint: ImportHostEndpoint, job: ImportJob): void {
  new ImportHost(endpoint, job);
}
