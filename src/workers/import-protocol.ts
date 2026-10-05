import { readResourceGroup, type ResourceGroup } from '../content/asset-contract.ts';
import { readBudgetRecord, type BudgetRecord } from '../content/budget.ts';
import type { GroupInput } from '../content/completeness.ts';
import { readSourceFingerprint, type SourceFingerprint } from '../content/content-identity.ts';
import { ContentContractError, fail, matchesWhole, readArray, readRecord, requireFields } from '../content/contract-validation.ts';

/** Any change to a message shape, the stage set or an ordering rule increments it (P2-04 spec, message protocol). */
export const IMPORT_PROTOCOL_VERSION = 1;

export const IMPORT_STAGES = Object.freeze(['identify-source'] as const);
export type ImportStage = typeof IMPORT_STAGES[number];

/** The main thread never sends a `start` outside these limits; names are counted in UTF-16 code units. */
export const IMPORT_FILE_LIMITS = Object.freeze({ minFiles: 1, maxFiles: 4, maxNameLength: 255 });

export const IMPORT_ERROR_LAYERS = Object.freeze(['disc', 'source', 'content', 'import'] as const);
export type ImportErrorLayer = typeof IMPORT_ERROR_LAYERS[number];

/** The closed `import` layer codes. Only the first two come from the Worker; the rest only from the main thread. */
export const WORKER_IMPORT_ERROR_CODES = Object.freeze(['invalid-request', 'internal-error'] as const);
export type WorkerImportErrorCode = typeof WORKER_IMPORT_ERROR_CODES[number];
export const IMPORT_ERROR_CODES = Object.freeze([
  ...WORKER_IMPORT_ERROR_CODES, 'worker-start-failed', 'worker-failed', 'protocol-error', 'invalid-result',
] as const);
export type ImportErrorCode = typeof IMPORT_ERROR_CODES[number];

export interface ImportErrorLimit {
  readonly name: string;
  readonly limit: number;
  /** null when the rejected amount is beyond the safe integer range. */
  readonly observed: number | null;
}

interface ErrorDetails {
  /** A structural position; never bytes, file names or host paths. */
  readonly location: string;
  /** Fixed text; host error text never enters it. */
  readonly reason: string;
  readonly limit: ImportErrorLimit | null;
}

export type ImportLayerError<Code extends ImportErrorCode = ImportErrorCode> = ErrorDetails & { readonly layer: 'import'; readonly code: Code };
type UpstreamError = ErrorDetails & { readonly layer: Exclude<ImportErrorLayer, 'import'>; readonly code: string };

/**
 * Plain, structured-cloneable failure. Disc and source errors keep their `toData()` fields, content errors their code and
 * path; their codes are checked against the token grammar only, so this module never depends on `original-data`.
 */
export type ImportErrorData = ImportLayerError | UpstreamError;
/** A failure the Worker may report: of the import codes, only `invalid-request` and `internal-error`. */
export type WorkerImportErrorData = ImportLayerError<WorkerImportErrorCode> | UpstreamError;

/** One input file. Names travel separately because a structured clone of a File may lose its name. */
export interface ImportFile {
  readonly name: string;
  readonly blob: Blob;
}

/** The identified source; the covered files stay in the Worker because the fingerprint already determines them. */
export interface ImportSourceIdentity {
  readonly versionId: string;
  readonly sourceFingerprint: SourceFingerprint;
}

export interface ImportReadyMessage {
  readonly type: 'ready';
  readonly protocol: typeof IMPORT_PROTOCOL_VERSION;
}

/** The only message the main thread sends, once, after a valid `ready`. */
export interface ImportStartMessage {
  readonly type: 'start';
  readonly protocol: typeof IMPORT_PROTOCOL_VERSION;
  readonly jobId: number;
  readonly files: readonly ImportFile[];
}

interface JobMessage {
  readonly jobId: number;
  /** 1 for the first message after `ready`, then one more per message. */
  readonly sequence: number;
}

export interface ImportProgressMessage extends JobMessage {
  readonly type: 'progress';
  readonly stage: ImportStage;
  /** Bytes the job's input ports have returned so far. */
  readonly readBytes: number;
}

export interface ImportIdentifiedMessage extends JobMessage {
  readonly type: 'identified';
  readonly identity: ImportSourceIdentity;
}

/**
 * One raw resource group. Only the envelope is read here: the input values are the received ones, not deep copies, and
 * the receiver checks them with `validateGroup`.
 */
export interface ImportGroupMessage extends JobMessage {
  readonly type: 'group';
  readonly group: ResourceGroup;
  readonly input: GroupInput;
}

export interface ImportFinishedMessage extends JobMessage {
  readonly type: 'finished';
  /** The groups sent, in sending order. */
  readonly groups: readonly ResourceGroup[];
  readonly usage: BudgetRecord;
}

export interface ImportFailedMessage {
  readonly type: 'failed';
  /** null when the Worker could not read a job ID from `start`. */
  readonly jobId: number | null;
  readonly sequence: number;
  readonly error: WorkerImportErrorData;
}

export type ImportWorkerMessage =
  | ImportReadyMessage
  | ImportProgressMessage
  | ImportIdentifiedMessage
  | ImportGroupMessage
  | ImportFinishedMessage
  | ImportFailedMessage;

export type ImportMessageRead<Message> =
  | { readonly status: 'valid'; readonly message: Message }
  | { readonly status: 'invalid'; readonly error: ImportErrorData };

export type ImportStartRead =
  | { readonly status: 'valid'; readonly message: ImportStartMessage }
  /** `jobId` is the request's job ID when it can be read, so the Worker's `failed` reply can carry it. */
  | { readonly status: 'invalid'; readonly error: ImportErrorData; readonly jobId: number | null };

const TOKEN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_TOKEN_LENGTH = 64;
const FINGERPRINT = /^source:sha256:[0-9a-f]{64}$/;
const TEXT = /^[\x20-\x7e]{1,512}$/;
const LIMIT_NAME = /^[a-z][a-zA-Z0-9]{0,63}$/;

export function importError<Code extends ImportErrorCode>(code: Code, location: string, reason: string): ImportLayerError<Code> {
  return Object.freeze({ layer: 'import', code, location, reason, limit: null });
}

// Rejections travel as content contract errors so one catch maps them; only the path and the fixed reason survive.
function reject(path: string, reason: string): never {
  fail('invalid-record', path, reason);
}

const isToken = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= MAX_TOKEN_LENGTH && matchesWhole(value, TOKEN);

function readCount(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) reject(path, 'must be a nonnegative safe integer');
  return value + 0;
}

function readPositive(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) reject(path, 'must be a positive safe integer');
  return value;
}

function readProtocol(value: unknown, path: string): typeof IMPORT_PROTOCOL_VERSION {
  if (value !== IMPORT_PROTOCOL_VERSION) reject(path, 'must be the protocol version of this build');
  return IMPORT_PROTOCOL_VERSION;
}

const { minFiles, maxFiles, maxNameLength } = IMPORT_FILE_LIMITS;

function readFile(value: unknown, path: string): ImportFile {
  const record = readRecord(value, path);
  requireFields(record, path, ['name', 'blob']);
  const { name, blob } = record;
  if (typeof name !== 'string' || name.length < 1 || name.length > maxNameLength) {
    reject(`${path}.name`, `must be 1 to ${maxNameLength} UTF-16 code units`);
  }
  if (!(blob instanceof Blob)) reject(`${path}.blob`, 'must be a Blob');
  return Object.freeze({ name, blob });
}

function readFiles(value: unknown, path: string): readonly ImportFile[] {
  // Checked before the items are read, so an oversized list is rejected without visiting them.
  if (Array.isArray(value) && (value.length < minFiles || value.length > maxFiles)) reject(path, `must contain ${minFiles} to ${maxFiles} files`);
  return readArray(value, path, 'invalid-record', readFile);
}

function readStage(value: unknown, path: string): ImportStage {
  if (!IMPORT_STAGES.some(stage => stage === value)) reject(path, 'must be a known import stage');
  return value as ImportStage;
}

function readIdentity(value: unknown, path: string): ImportSourceIdentity {
  const record = readRecord(value, path);
  requireFields(record, path, ['versionId', 'sourceFingerprint']);
  const { versionId } = record;
  if (!isToken(versionId)) reject(`${path}.versionId`, 'must be a lower-case token of at most 64 characters');
  const at = `${path}.sourceFingerprint`;
  const sourceFingerprint = readSourceFingerprint(record.sourceFingerprint, at);
  if (!matchesWhole(sourceFingerprint, FINGERPRINT)) reject(at, 'must be source:sha256: and 64 lowercase hexadecimal digits');
  return Object.freeze({ versionId, sourceFingerprint });
}

function readGroupInput(value: unknown, path: string): GroupInput {
  const record = readRecord(value, path);
  requireFields(record, path, ['manifest', 'payloads', 'sources']);
  const sources = readRecord(record.sources, `${path}.sources`);
  if (typeof sources.sourceFingerprint !== 'string') reject(`${path}.sources.sourceFingerprint`, 'must be a string');
  return Object.freeze({ manifest: record.manifest, payloads: record.payloads, sources: record.sources });
}

function readGroups(value: unknown, path: string): readonly ResourceGroup[] {
  const seen = new Set<ResourceGroup>();
  return readArray(value, path, 'invalid-record', (item, at) => {
    const group = readResourceGroup(item, at);
    if (seen.has(group)) reject(at, 'must not repeat a group');
    seen.add(group);
    return group;
  });
}

function readLimit(value: unknown, path: string): ImportErrorLimit | null {
  if (value === null) return null;
  const record = readRecord(value, path);
  requireFields(record, path, ['name', 'limit', 'observed']);
  const { name } = record;
  if (!matchesWhole(name, LIMIT_NAME)) reject(`${path}.name`, 'must be an alphanumeric name starting with a lower-case letter');
  const limit = readCount(record.limit, `${path}.limit`);
  const observed = record.observed === null ? null : readCount(record.observed, `${path}.observed`);
  return Object.freeze({ name, limit, observed });
}

function readErrorData(value: unknown, path: string): WorkerImportErrorData {
  const record = readRecord(value, path);
  requireFields(record, path, ['layer', 'code', 'location', 'reason', 'limit']);
  const { layer, code, location, reason } = record;
  if (!IMPORT_ERROR_LAYERS.some(known => known === layer)) reject(`${path}.layer`, 'must be a known error layer');
  if (!isToken(code)) reject(`${path}.code`, 'must be a lower-case hyphenated token of at most 64 characters');
  if (layer === 'import' && !WORKER_IMPORT_ERROR_CODES.some(known => known === code)) {
    reject(`${path}.code`, 'must be an import code the Worker may report');
  }
  if (!matchesWhole(location, TEXT)) reject(`${path}.location`, 'must be 1 to 512 printable ASCII characters');
  if (!matchesWhole(reason, TEXT)) reject(`${path}.reason`, 'must be 1 to 512 printable ASCII characters');
  return Object.freeze({ layer, code, location, reason, limit: readLimit(record.limit, `${path}.limit`) }) as WorkerImportErrorData;
}

function readJob(record: Record<string, unknown>, path: string): JobMessage {
  return { jobId: readPositive(record.jobId, `${path}.jobId`), sequence: readPositive(record.sequence, `${path}.sequence`) };
}

function readWorkerMessage(value: unknown, path: string): ImportWorkerMessage {
  const record = readRecord(value, path);
  switch (record.type) {
    case 'ready':
      requireFields(record, path, ['type', 'protocol']);
      return Object.freeze({ type: 'ready', protocol: readProtocol(record.protocol, `${path}.protocol`) });
    case 'progress':
      requireFields(record, path, ['type', 'jobId', 'sequence', 'stage', 'readBytes']);
      return Object.freeze({
        type: 'progress', ...readJob(record, path),
        stage: readStage(record.stage, `${path}.stage`), readBytes: readCount(record.readBytes, `${path}.readBytes`),
      });
    case 'identified':
      requireFields(record, path, ['type', 'jobId', 'sequence', 'identity']);
      return Object.freeze({ type: 'identified', ...readJob(record, path), identity: readIdentity(record.identity, `${path}.identity`) });
    case 'group':
      requireFields(record, path, ['type', 'jobId', 'sequence', 'group', 'input']);
      return Object.freeze({
        type: 'group', ...readJob(record, path),
        group: readResourceGroup(record.group, `${path}.group`), input: readGroupInput(record.input, `${path}.input`),
      });
    case 'finished':
      requireFields(record, path, ['type', 'jobId', 'sequence', 'groups', 'usage']);
      return Object.freeze({
        type: 'finished', ...readJob(record, path),
        groups: readGroups(record.groups, `${path}.groups`), usage: readBudgetRecord(record.usage, `${path}.usage`),
      });
    case 'failed':
      requireFields(record, path, ['type', 'jobId', 'sequence', 'error']);
      return Object.freeze({
        type: 'failed',
        jobId: record.jobId === null ? null : readPositive(record.jobId, `${path}.jobId`),
        sequence: readPositive(record.sequence, `${path}.sequence`),
        error: readErrorData(record.error, `${path}.error`),
      });
    default:
      return reject(`${path}.type`, 'must be a known message type');
  }
}

function readStart(value: unknown, path: string): ImportStartMessage {
  const record = readRecord(value, path);
  if (record.type !== 'start') reject(`${path}.type`, 'must be start');
  requireFields(record, path, ['type', 'protocol', 'jobId', 'files']);
  return Object.freeze({
    type: 'start',
    protocol: readProtocol(record.protocol, `${path}.protocol`),
    jobId: readPositive(record.jobId, `${path}.jobId`),
    files: readFiles(record.files, `${path}.files`),
  });
}

function attempt<Message>(read: () => Message): Message | ContentContractError {
  try {
    return read();
  } catch (error) {
    if (error instanceof ContentContractError) return error;
    throw error;
  }
}

/**
 * Reads a message the main thread received from the Worker as a frozen copy. Ordering, job identity and group content
 * belong to the receiver; a rejection is `protocol-error` at a `message…` location that never echoes the value.
 */
export function readImportWorkerMessage(value: unknown): ImportMessageRead<ImportWorkerMessage> {
  const read = attempt(() => readWorkerMessage(value, 'message'));
  if (!(read instanceof ContentContractError)) return Object.freeze({ status: 'valid', message: read });
  return Object.freeze({ status: 'invalid', error: importError('protocol-error', read.path, read.reason) });
}

/** Reads the `start` request the Worker received as a frozen copy; a rejection is `invalid-request` at `request…`. */
export function readImportStartMessage(value: unknown): ImportStartRead {
  const read = attempt(() => readStart(value, 'request'));
  if (!(read instanceof ContentContractError)) return Object.freeze({ status: 'valid', message: read });
  const jobId = attempt(() => readPositive(readRecord(value, 'request').jobId, 'request.jobId'));
  return Object.freeze({
    status: 'invalid',
    error: importError('invalid-request', read.path, read.reason),
    jobId: jobId instanceof ContentContractError ? null : jobId,
  });
}
