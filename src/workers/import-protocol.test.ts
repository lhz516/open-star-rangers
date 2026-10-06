import { describe, expect, it } from 'vitest';
import { BUDGET_DIMENSIONS, EMPTY_BUDGET_USAGE, type BudgetDimension } from '../content/budget.ts';
import type { ContentContractErrorCode } from '../content/contract-validation.ts';
import type { BudgetShapeCode, DiscLimitName, DiscReadErrorCode } from '../original-data/disc/disc-error.ts';
import type { SourceErrorCode, SourceLimitName } from '../original-data/source-error.ts';
import {
  canReportStage, IMPORT_ERROR_CODES, IMPORT_ERROR_LAYERS, IMPORT_FILE_LIMITS, IMPORT_PROTOCOL_VERSION, IMPORT_STAGES, importError,
  readImportStartMessage, readImportWorkerMessage, WORKER_IMPORT_ERROR_CODES, type ImportFailedMessage,
} from './import-protocol.ts';

const MARKER = 'PRIVATE-MARKER';
const FINGERPRINT = `source:sha256:${'0123456789abcdef'.repeat(4)}`;
const MAX = Number.MAX_SAFE_INTEGER;

type Sample = Record<string, unknown>;
const error = (overrides: Sample = {}): Sample =>
  ({ layer: 'disc', code: 'read-failed', location: 'image', reason: 'the byte source failed to read', limit: null, ...overrides });
const ready = (overrides: Sample = {}): Sample => ({ type: 'ready', protocol: IMPORT_PROTOCOL_VERSION, ...overrides });
const progress = (overrides: Sample = {}): Sample =>
  ({ type: 'progress', jobId: 3, sequence: 1, stage: 'identify-source', readBytes: 0, ...overrides });
const identified = (identity: Sample = {}): Sample =>
  ({ type: 'identified', jobId: 3, sequence: 2, identity: { versionId: 'star-rangers-1995-cd', sourceFingerprint: FINGERPRINT, ...identity } });
const input = (overrides: Sample = {}): Sample =>
  ({ manifest: { opaque: true }, payloads: [], sources: { sourceFingerprint: FINGERPRINT, states: [] }, ...overrides });
const group = (overrides: Sample = {}): Sample => ({ type: 'group', jobId: 3, sequence: 3, group: 'audio', input: input(), ...overrides });
const finished = (overrides: Sample = {}): Sample =>
  ({ type: 'finished', jobId: 3, sequence: 4, groups: ['audio', 'logic'], usage: { ...EMPTY_BUDGET_USAGE, sourceReadBytes: 7 }, ...overrides });
const failed = (overrides: Sample = {}): Sample => ({ type: 'failed', jobId: 3, sequence: 2, error: error(), ...overrides });
const file = (name = 'GAME.CCD'): Sample => ({ name, blob: new Blob([MARKER]) });
const start = (overrides: Sample = {}): Sample =>
  ({ type: 'start', protocol: IMPORT_PROTOCOL_VERSION, jobId: 3, files: [file(), file('GAME.IMG')], ...overrides });

/** Whether every container is frozen; Blobs and payload views cannot be frozen and are exempt. */
function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || value instanceof Blob || ArrayBuffer.isView(value)) return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

function rejection(read: { readonly status: string; readonly error?: unknown }): string {
  expect(read.status).toBe('invalid');
  const { layer, code, location, limit } = read.error as Sample;
  expect(layer).toBe('import');
  expect(limit).toBeNull();
  expect(JSON.stringify(read)).not.toContain(MARKER);
  return `${String(code)}@${String(location)}`;
}

describe('protocol constants', () => {
  it('fixes version 2, two ordered stages, four layers and the six import codes', () => {
    expect(IMPORT_PROTOCOL_VERSION).toBe(2);
    expect(IMPORT_STAGES).toEqual(['identify-source', 'convert-graphics']);
    expect(IMPORT_ERROR_LAYERS).toEqual(['disc', 'source', 'content', 'import']);
    expect(IMPORT_ERROR_CODES).toEqual(['invalid-request', 'internal-error', 'worker-start-failed', 'worker-failed', 'protocol-error', 'invalid-result']);
    expect(WORKER_IMPORT_ERROR_CODES).toEqual(['invalid-request', 'internal-error']);
    expect(IMPORT_FILE_LIMITS).toEqual({ minFiles: 1, maxFiles: 4, maxNameLength: 255 });
    expect([IMPORT_STAGES, IMPORT_ERROR_LAYERS, IMPORT_ERROR_CODES, WORKER_IMPORT_ERROR_CODES, IMPORT_FILE_LIMITS].every(Object.isFrozen)).toBe(true);
    expect(importError('worker-failed', 'worker', 'the Worker reported an error'))
      .toEqual({ layer: 'import', code: 'worker-failed', location: 'worker', reason: 'the Worker reported an error', limit: null });
    expect(Object.isFrozen(importError('protocol-error', 'message', 'x'))).toBe(true);
  });

  it.each([
    [null, 'identify-source', false, true],
    ['identify-source', 'identify-source', false, true],
    [null, 'convert-graphics', false, false],
    ['identify-source', 'convert-graphics', false, false],
    ['identify-source', 'identify-source', true, false],
    ['identify-source', 'convert-graphics', true, true],
    [null, 'convert-graphics', true, true],
    ['convert-graphics', 'convert-graphics', true, true],
    ['convert-graphics', 'identify-source', true, false],
  ] as const)('orders stages: after %s, %s with identified %s is %s', (latest, stage, identified, allowed) => {
    expect(canReportStage(latest, stage, identified)).toBe(allowed);
  });

  it('types a Worker failure with only the import codes the Worker may report', () => {
    const failure = (error: ImportFailedMessage['error']): ImportFailedMessage => ({ type: 'failed', jobId: 1, sequence: 1, error });
    expect(failure(importError('internal-error', 'job', 'x')).error.code).toBe('internal-error');
    // @ts-expect-error Only the main thread reports worker-failed.
    expect(failure(importError('worker-failed', 'worker', 'x')).error.code).toBe('worker-failed');
    // @ts-expect-error Only the main thread reports protocol-error.
    expect(failure(importError('protocol-error', 'message', 'x')).error.code).toBe('protocol-error');
  });
});

describe('Worker messages', () => {
  it.each([
    ['ready', ready()],
    ['progress', progress({ readBytes: MAX })],
    ['graphics conversion progress', progress({ stage: 'convert-graphics', readBytes: 12 })],
    ['identified', identified()],
    ['group', group()],
    ['finished', finished()],
    ['finished without groups', finished({ groups: [] })],
    ['failed', failed({ error: error({ limit: { name: 'sourceReadBytes', limit: 10, observed: null } }) })],
    ['failed without a job ID', failed({ jobId: null, sequence: 1, error: error({ layer: 'import', code: 'invalid-request', location: 'request.files[1].name' }) })],
    ['failed with an internal error', failed({ error: error({ layer: 'import', code: 'internal-error', location: 'job' }) })],
  ])('reads a valid %s message as a frozen copy', (_, sample) => {
    const read = readImportWorkerMessage(sample);
    expect(read).toEqual({ status: 'valid', message: sample });
    expect(isDeepFrozen(read)).toBe(true);
  });

  it('copies every field it checks, so later changes to the received value do not reach the result', () => {
    const sample = finished();
    const read = readImportWorkerMessage(sample);
    (sample.groups as string[]).push('models');
    (sample.usage as Sample).assets = 9;
    expect(read.status === 'valid' && read.message).toEqual(finished());
  });

  it('freezes the received group input in place for the receiver to validate, without copying it', () => {
    const bytes = Uint8Array.of(1, 2, 3);
    const states = [{ id: 'sound/a', state: 'verified', unknowns: [] }];
    // A shallow-frozen container still gets its contents frozen.
    const manifest = Object.freeze({ identity: { origin: { type: 'synthetic' } }, assets: [{ dependencies: [{ id: 'x' }] }] });
    const payloads = [{ id: 'sound/a', schemaVersion: 1, bytes }];
    const sources = { sourceFingerprint: FINGERPRINT, states, extra: { nested: [MARKER] } };
    const read = readImportWorkerMessage(group({ input: { manifest, payloads, sources } }));
    if (read.status !== 'valid' || read.message.type !== 'group') throw new Error('expected a group message');
    expect(read.message.input).toEqual({ manifest, payloads, sources });
    expect([read.message.input.manifest, read.message.input.payloads, read.message.input.sources]).toEqual([manifest, payloads, sources]);
    expect(read.message.input.payloads).toBe(payloads);
    expect(isDeepFrozen(read)).toBe(true);
    expect([manifest.assets[0].dependencies, payloads[0], states, states[0].unknowns, sources.extra.nested].every(Object.isFrozen)).toBe(true);
    // Payload bytes are neither copied nor frozen, and stay readable.
    expect(payloads[0].bytes).toBe(bytes);
    expect([...bytes]).toEqual([1, 2, 3]);
  });

  it('freezes received input without running accessors, entering cycles or freezing other objects', () => {
    let getterRuns = 0;
    const manifest: Record<string, unknown> = Object.defineProperty({}, 'computed', { enumerable: true, get: () => { getterRuns++; return 1; } });
    manifest.self = manifest;
    const blob = new Blob(['x']);
    const map = new Map([['key', { value: 1 }]]);
    const read = readImportWorkerMessage(group({ input: input({ manifest, payloads: [{ blob, map }] }) }));
    expect(read.status).toBe('valid');
    expect(getterRuns).toBe(0);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect([Object.isFrozen(blob), Object.isFrozen(map)]).toEqual([false, false]);
  });

  it('normalizes a negative zero byte count', () => {
    const read = readImportWorkerMessage(progress({ readBytes: -0 }));
    expect(read.status === 'valid' && read.message.type === 'progress' && Object.is(read.message.readBytes, 0)).toBe(true);
  });

  const withoutReadBytes = progress();
  delete withoutReadBytes.readBytes;
  const accessor = Object.defineProperty(ready(), 'protocol', { enumerable: true, get: () => 1 });

  it.each([
    ['a non-record', null, 'protocol-error@message'],
    ['a class instance', new Date(), 'protocol-error@message'],
    ['an accessor field', accessor, 'protocol-error@message'],
    ['a message without a type', { protocol: 1 }, 'protocol-error@message.type'],
    ['an unknown type', ready({ type: MARKER }), 'protocol-error@message.type'],
    ['a start message in the wrong direction', start(), 'protocol-error@message.type'],
    ['a missing field', withoutReadBytes, 'protocol-error@message.readBytes'],
    ['an unknown field', ready({ [MARKER]: MARKER }), 'protocol-error@message'],
    ['the previous protocol version', ready({ protocol: 1 }), 'protocol-error@message.protocol'],
    ['a protocol version as text', ready({ protocol: '1' }), 'protocol-error@message.protocol'],
    ['job ID 0', progress({ jobId: 0 }), 'protocol-error@message.jobId'],
    ['a negative job ID', progress({ jobId: -1 }), 'protocol-error@message.jobId'],
    ['a fractional job ID', progress({ jobId: 1.5 }), 'protocol-error@message.jobId'],
    ['an unsafe job ID', progress({ jobId: MAX + 1 }), 'protocol-error@message.jobId'],
    ['a job ID as text', progress({ jobId: '3' }), 'protocol-error@message.jobId'],
    ['a null job ID outside failed', progress({ jobId: null }), 'protocol-error@message.jobId'],
    ['sequence 0', progress({ sequence: 0 }), 'protocol-error@message.sequence'],
    ['a fractional sequence', { ...identified(), sequence: 2.5 }, 'protocol-error@message.sequence'],
    ['an unknown stage', progress({ stage: MARKER }), 'protocol-error@message.stage'],
    ['a negative byte count', progress({ readBytes: -1 }), 'protocol-error@message.readBytes'],
    ['a fractional byte count', progress({ readBytes: 0.5 }), 'protocol-error@message.readBytes'],
    ['an infinite byte count', progress({ readBytes: Infinity }), 'protocol-error@message.readBytes'],
    ['an identity with extra fields', identified({ files: [MARKER] }), 'protocol-error@message.identity'],
    ['an upper-case version ID', identified({ versionId: `X${MARKER}` }), 'protocol-error@message.identity.versionId'],
    ['a 65-character version ID', identified({ versionId: 'a'.repeat(65) }), 'protocol-error@message.identity.versionId'],
    ['a fingerprint without its algorithm', identified({ sourceFingerprint: `source:${'0'.repeat(64)}` }), 'protocol-error@message.identity.sourceFingerprint'],
    ['a short fingerprint', identified({ sourceFingerprint: FINGERPRINT.slice(0, -1) }), 'protocol-error@message.identity.sourceFingerprint'],
    ['an upper-case fingerprint', identified({ sourceFingerprint: `source:sha256:${FINGERPRINT.slice(14).toUpperCase()}` }), 'protocol-error@message.identity.sourceFingerprint'],
    ['a fingerprint with a trailing newline', identified({ sourceFingerprint: `${FINGERPRINT}\n` }), 'protocol-error@message.identity.sourceFingerprint'],
    ['an unknown group', group({ group: MARKER }), 'protocol-error@message.group'],
    ['an input without payloads', group({ input: { manifest: {}, sources: { sourceFingerprint: FINGERPRINT } } }), 'protocol-error@message.input.payloads'],
    ['an input with extra fields', group({ input: input({ [MARKER]: 1 }) }), 'protocol-error@message.input'],
    ['null sources', group({ input: input({ sources: null }) }), 'protocol-error@message.input.sources'],
    ['sources without a fingerprint', group({ input: input({ sources: { states: [] } }) }), 'protocol-error@message.input.sources.sourceFingerprint'],
    ['a null source fingerprint', group({ input: input({ sources: { sourceFingerprint: null, states: [] } }) }), 'protocol-error@message.input.sources.sourceFingerprint'],
    ['finished groups that are not an array', finished({ groups: 'audio' }), 'protocol-error@message.groups'],
    ['an unknown finished group', finished({ groups: ['audio', MARKER] }), 'protocol-error@message.groups[1]'],
    ['a repeated finished group', finished({ groups: ['audio', 'logic', 'audio'] }), 'protocol-error@message.groups[2]'],
    ['usage without a dimension', finished({ usage: { ...EMPTY_BUDGET_USAGE, assets: undefined } }), 'protocol-error@message.usage.assets'],
    ['usage with an unknown dimension', finished({ usage: { ...EMPTY_BUDGET_USAGE, [MARKER]: 1 } }), 'protocol-error@message.usage'],
    ['a failed job ID of 0', failed({ jobId: 0 }), 'protocol-error@message.jobId'],
    ['an error with extra fields', failed({ error: error({ [MARKER]: 1 }) }), 'protocol-error@message.error'],
    ['an unknown error layer', failed({ error: error({ layer: MARKER }) }), 'protocol-error@message.error.layer'],
    ['an upper-case code', failed({ error: error({ code: `read-${MARKER}` }) }), 'protocol-error@message.error.code'],
    ['a code with a doubled hyphen', failed({ error: error({ code: 'read--failed' }) }), 'protocol-error@message.error.code'],
    ['a 65-character code', failed({ error: error({ code: 'a'.repeat(65) }) }), 'protocol-error@message.error.code'],
    ['an unknown import code', failed({ error: error({ layer: 'import', code: 'read-failed' }) }), 'protocol-error@message.error.code'],
    ['an empty location', failed({ error: error({ location: '' }) }), 'protocol-error@message.error.location'],
    ['a 513-character location', failed({ error: error({ location: `${MARKER}${'x'.repeat(513 - MARKER.length)}` }) }), 'protocol-error@message.error.location'],
    ['a location with a newline', failed({ error: error({ location: `file:/A\n${MARKER}` }) }), 'protocol-error@message.error.location'],
    ['an empty reason', failed({ error: error({ reason: '' }) }), 'protocol-error@message.error.reason'],
    ['a 513-character reason', failed({ error: error({ reason: 'x'.repeat(513) }) }), 'protocol-error@message.error.reason'],
    ['a non-ASCII reason', failed({ error: error({ reason: `${MARKER} \u00e9` }) }), 'protocol-error@message.error.reason'],
    ['a limit that is not a record', failed({ error: error({ limit: 5 }) }), 'protocol-error@message.error.limit'],
    ['a limit without its amount', failed({ error: error({ limit: { name: 'imageSectors', observed: 1 } }) }), 'protocol-error@message.error.limit.limit'],
    ['a limit name starting with a capital', failed({ error: error({ limit: { name: 'ImageSectors', limit: 1, observed: 2 } }) }), 'protocol-error@message.error.limit.name'],
    ['a limit name with a hyphen', failed({ error: error({ limit: { name: 'image-sectors', limit: 1, observed: 2 } }) }), 'protocol-error@message.error.limit.name'],
    ['a 65-character limit name', failed({ error: error({ limit: { name: 'a'.repeat(65), limit: 1, observed: 2 } }) }), 'protocol-error@message.error.limit.name'],
    ['a negative limit', failed({ error: error({ limit: { name: 'imageSectors', limit: -1, observed: 2 } }) }), 'protocol-error@message.error.limit.limit'],
    ['a fractional observed amount', failed({ error: error({ limit: { name: 'imageSectors', limit: 1, observed: 1.5 } }) }), 'protocol-error@message.error.limit.observed'],
  ])('rejects %s with a stable code and location', (_, sample, expected) => {
    expect(rejection(readImportWorkerMessage(sample))).toBe(expected);
  });

  it.each(IMPORT_ERROR_CODES.filter(code => !WORKER_IMPORT_ERROR_CODES.some(allowed => allowed === code)))(
    'rejects a Worker failure with the main-thread code %s',
    code => {
      expect(rejection(readImportWorkerMessage(failed({ error: error({ layer: 'import', code, location: 'worker' }) }))))
        .toBe('protocol-error@message.error.code');
    },
  );
});

describe('start requests', () => {
  it.each([
    ['two files', start()],
    ['one file', start({ files: [file()] })],
    ['four files', start({ files: [file('A.CCD'), file('A.IMG'), file('A.SUB'), file('A.CUE')] })],
    ['a 255-unit name', start({ files: [file('a'.repeat(255))] })],
    ['a 254-unit name of surrogate pairs', start({ files: [file('\u{1f600}'.repeat(127))] })],
    ['a File', start({ files: [{ name: 'GAME.CCD', blob: new File([MARKER], 'OTHER.CCD') }] })],
  ])('reads a valid start with %s as a frozen copy that keeps the Blob references', (_, sample) => {
    const read = readImportStartMessage(sample);
    expect(read).toEqual({ status: 'valid', message: sample });
    expect(isDeepFrozen(read)).toBe(true);
    if (read.status !== 'valid') throw new Error('expected a valid start');
    read.message.files.forEach((item, index) => expect(item.blob).toBe((sample.files as Sample[])[index].blob));
  });

  it('is not affected by later changes to the received request', () => {
    const sample = start();
    const read = readImportStartMessage(sample);
    (sample.files as Sample[]).length = 0;
    expect(read.status === 'valid' && read.message.files.map(item => item.name)).toEqual(['GAME.CCD', 'GAME.IMG']);
  });

  const files = (count: number): Sample[] => Array.from({ length: count }, (_, index) => file(`F${index}.IMG`));
  const sparse = new Array<Sample>(2);
  sparse[1] = file();

  it.each([
    ['a non-record', MARKER, 'invalid-request@request', null],
    ['a Worker message type', ready({ jobId: 3 }), 'invalid-request@request.type', 3],
    ['a missing type', { protocol: 1, jobId: 4, files: files(1) }, 'invalid-request@request.type', 4],
    ['an unknown field', start({ [MARKER]: 1 }), 'invalid-request@request', 3],
    ['another protocol version', start({ protocol: 0 }), 'invalid-request@request.protocol', 3],
    ['job ID 0', start({ jobId: 0 }), 'invalid-request@request.jobId', null],
    ['a job ID as text', start({ jobId: MARKER }), 'invalid-request@request.jobId', null],
    ['files that are not an array', start({ files: file() }), 'invalid-request@request.files', 3],
    ['a sparse file list', start({ files: sparse }), 'invalid-request@request.files', 3],
    ['no files', start({ files: [] }), 'invalid-request@request.files', 3],
    ['five files', start({ files: files(5) }), 'invalid-request@request.files', 3],
    ['a file with extra fields', start({ files: [{ ...file(), [MARKER]: 1 }] }), 'invalid-request@request.files[0]', 3],
    ['an empty name', start({ files: [file(), file('')] }), 'invalid-request@request.files[1].name', 3],
    ['a 256-unit name', start({ files: [file(), file(`${MARKER}${'x'.repeat(256 - MARKER.length)}`)] }), 'invalid-request@request.files[1].name', 3],
    ['a 256-unit name of surrogate pairs', start({ files: [file('\u{1f600}'.repeat(128))] }), 'invalid-request@request.files[0].name', 3],
    ['a name that is not text', start({ files: [{ name: 7, blob: new Blob([]) }] }), 'invalid-request@request.files[0].name', 3],
    ['bytes instead of a Blob', start({ files: [{ name: 'GAME.CCD', blob: new TextEncoder().encode(MARKER) }] }), 'invalid-request@request.files[0].blob', 3],
    ['a Blob-like record', start({ files: [{ name: 'GAME.CCD', blob: { size: 1, type: '', slice: () => null } }] }), 'invalid-request@request.files[0].blob', 3],
  ])('rejects %s with a stable code and location and the readable job ID', (_, sample, expected, jobId) => {
    const read = readImportStartMessage(sample);
    expect(rejection(read)).toBe(expected);
    expect(read.status === 'invalid' && read.jobId).toBe(jobId);
    expect(isDeepFrozen(read)).toBe(true);
  });
});

describe('error code grammar', () => {
  // Typed as complete records, so the type checker reports any upstream code or limit name missing here.
  const discCodes: Record<DiscReadErrorCode | BudgetShapeCode, true> = {
    'unsupported-file-set': true, 'invalid-descriptor': true, 'unsupported-layout': true, 'image-size-mismatch': true,
    'invalid-sector': true, 'invalid-volume': true, 'invalid-directory': true, 'directory-loop': true, 'invalid-path': true,
    'path-not-found': true, 'wrong-entry-kind': true, 'invalid-range': true, 'limit-exceeded': true, 'budget-exceeded': true,
    'read-failed': true, cancelled: true, 'invalid-record': true, 'missing-budget-dimension': true,
    'unknown-budget-dimension': true, 'invalid-budget-value': true,
  };
  const sourceCodes: Record<SourceErrorCode, true> = {
    'invalid-archive': true, 'invalid-entry': true, 'limit-exceeded': true, 'entry-not-found': true, 'entry-type-mismatch': true,
    'invalid-request': true, 'invalid-catalog': true, 'unsupported-version': true, 'path-not-covered': true,
    'alternatives-differ': true, 'fingerprint-mismatch': true, 'invalid-payload': true, 'unsupported-encoding': true,
    'budget-exceeded': true, 'palette-index-out-of-range': true, 'subresource-not-found': true, 'invalid-declaration': true,
    'geometry-mismatch': true,
    'unsupported-payload': true, 'subresource-mismatch': true,
  };
  const contentCodes: Record<ContentContractErrorCode, true> = {
    'invalid-record': true, 'invalid-dependencies': true, 'invalid-asset-id': true, 'invalid-kind': true, 'kind-mismatch': true,
    'invalid-resource-group': true, 'invalid-role': true, 'invalid-version': true, 'unsupported-schema': true,
    'invalid-slice-id': true, 'invalid-identity': true, 'invalid-origin': true, 'invalid-payload-identity': true,
    'duplicate-dependency': true, 'dependency-order': true, 'invalid-source-mapping': true, 'duplicate-mapping': true,
    'mapping-order': true, 'duplicate-asset': true, 'asset-order': true, 'duplicate-payload': true, 'payload-order': true,
    'missing-budget-dimension': true, 'unknown-budget-dimension': true, 'invalid-budget-value': true,
    'payload-not-exclusive': true, 'payload-aliased': true, 'payload-detached': true,
    'invalid-graphics-payload': true, 'unsupported-payload-schema': true, 'binding-mismatch': true,
    'palette-index-out-of-range': true, 'unmapped-character': true,
    'invalid-logic-payload': true, 'non-canonical-payload': true, 'logic-reference-mismatch': true,
  };
  const limitNames: Record<DiscLimitName | SourceLimitName | BudgetDimension, true> = {
    ...Object.fromEntries(BUDGET_DIMENSIONS.map(dimension => [dimension, true])) as Record<BudgetDimension, true>,
    descriptorBytes: true, imageSectors: true, volumeDescriptors: true, directoryBytes: true, directoryRecords: true,
    rangeReadBytes: true, portReadBytes: true, sourceReadBytes: true, archiveEntries: true, entryBytes: true,
    imageWidth: true, imageHeight: true, paletteEntryCount: true, fontCellWidth: true, fontHeight: true,
    payloadEntryBytes: true, payloadItems: true, textBytes: true,
  };

  it.each([
    ...Object.keys(discCodes).map(code => ['disc', code]),
    ...Object.keys(sourceCodes).map(code => ['source', code]),
    ...Object.keys(contentCodes).map(code => ['content', code]),
  ])('accepts the %s code %s', (layer, code) => {
    expect(readImportWorkerMessage(failed({ error: error({ layer, code }) })).status).toBe('valid');
  });

  it.each(Object.keys(limitNames))('accepts the limit name %s', name => {
    expect(readImportWorkerMessage(failed({ error: error({ code: 'limit-exceeded', limit: { name, limit: 0, observed: MAX } }) })).status)
      .toBe('valid');
  });
});
