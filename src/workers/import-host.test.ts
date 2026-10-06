import { describe, expect, it, vi } from 'vitest';
import { EMPTY_BUDGET_USAGE } from '../content/budget.ts';
import type { SourceFingerprint } from '../content/content-identity.ts';
import { ContentContractError } from '../content/contract-validation.ts';
import type { ResourceGroup } from '../content/asset-contract.ts';
import { syntheticGroup } from '../content/synthetic-content.test-support.ts';
import { DiscReadError } from '../original-data/disc/disc-error.ts';
import { SourceError } from '../original-data/source-error.ts';
import { runImportHost, type ImportJob, type ImportReporter } from './import-host.ts';
import { FakeEndpoint, portEndpoint } from './import-host.test-support.ts';
import {
  IMPORT_PROTOCOL_VERSION, readImportWorkerMessage, type ImportFile, type ImportSourceIdentity, type ImportWorkerMessage,
} from './import-protocol.ts';

const MARKER = 'PRIVATE-MARKER';
const FINGERPRINT = `source:sha256:${'0123456789abcdef'.repeat(4)}`;
const IDENTITY: ImportSourceIdentity = Object.freeze({ versionId: 'synthetic-disc', sourceFingerprint: FINGERPRINT as SourceFingerprint });
const USAGE = Object.freeze({ ...EMPTY_BUDGET_USAGE, sourceReadBytes: 42 });
const INTERNAL_ERROR = { layer: 'import', code: 'internal-error', location: 'job', reason: 'the import job failed unexpectedly', limit: null };

const file = (name: string): ImportFile => ({ name, blob: new Blob([MARKER]) });
const start = (overrides: Record<string, unknown> = {}) =>
  ({ type: 'start', protocol: IMPORT_PROTOCOL_VERSION, jobId: 7, files: [file('GAME.CCD'), file('GAME.IMG')], ...overrides });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const group = (name: ResourceGroup) => ({ ...syntheticGroup(name), sources: { sourceFingerprint: FINGERPRINT, states: [] } });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(settle => { resolve = settle; });
  return { promise, resolve };
}

/** A host whose job runs `steps` with the reporter, then resolves to `USAGE` unless it is still pending. */
function host(steps: (report: ImportReporter, files: readonly ImportFile[]) => unknown = report => report.identified(IDENTITY)) {
  const endpoint = new FakeEndpoint();
  const calls: { files: readonly ImportFile[]; report: ImportReporter }[] = [];
  const job: ImportJob = async (files, report) => {
    calls.push({ files, report });
    await steps(report, files);
    return USAGE;
  };
  runImportHost(endpoint, job);
  return { endpoint, calls };
}

async function started(steps?: (report: ImportReporter, files: readonly ImportFile[]) => unknown) {
  const run = host(steps);
  run.endpoint.dispatch('message', start());
  await flush();
  return run;
}

const failed = (jobId: number | null, error: unknown, sequence = 1) => ({ type: 'failed', jobId, sequence, error });

describe('handshake', () => {
  it('installs its listeners, then sends ready exactly once and waits for start', () => {
    const { endpoint, calls } = host();
    expect(endpoint.log).toEqual(['listen:message', 'listen:messageerror', 'listen:unhandledrejection', 'post:ready']);
    expect(endpoint.messages).toEqual([{ type: 'ready', protocol: IMPORT_PROTOCOL_VERSION }]);
    expect(calls).toHaveLength(0);
  });

  it('runs one job with the files of the first valid start, then finishes and closes', async () => {
    const request = start();
    const { endpoint, calls } = host();
    endpoint.dispatch('message', request);
    await flush();
    expect(calls).toHaveLength(1);
    expect(calls[0].files).toEqual(request.files);
    calls[0].files.forEach((item, index) => expect(item.blob).toBe(request.files[index].blob));
    expect(endpoint.afterReady).toEqual([
      { type: 'identified', jobId: 7, sequence: 1, identity: IDENTITY },
      { type: 'finished', jobId: 7, sequence: 2, groups: [], usage: USAGE },
    ]);
    expect(endpoint.log.slice(-2)).toEqual(['post:finished', 'close']);
    endpoint.dispatch('message', start({ jobId: 8 }));
    endpoint.dispatch('messageerror');
    expect(endpoint.posts).toHaveLength(3);
    expect(endpoint.closes).toBe(1);
  });

  it.each([
    ['a non-record', MARKER, null, 'request'],
    ['a Worker message', { type: 'ready', protocol: 1, jobId: 5 }, 5, 'request.type'],
    ['the previous protocol version', start({ protocol: IMPORT_PROTOCOL_VERSION - 1 }), 7, 'request.protocol'],
    ['an unreadable job ID', start({ jobId: -7 }), null, 'request.jobId'],
    ['a 256-unit name', start({ files: [file('GAME.CCD'), file(MARKER.padEnd(256, 'x'))] }), 7, 'request.files[1].name'],
  ])('answers %s with invalid-request and never runs the job', async (_, request, jobId, location) => {
    const { endpoint, calls } = host();
    endpoint.dispatch('message', request);
    await flush();
    const [message, ...rest] = endpoint.afterReady;
    expect(rest).toEqual([]);
    expect(message).toMatchObject(failed(jobId, { layer: 'import', code: 'invalid-request', location, limit: null }));
    expect(JSON.stringify(message)).not.toContain(MARKER);
    expect(calls).toHaveLength(0);
    expect(endpoint.log.at(-1)).toBe('close');
    endpoint.dispatch('message', start());
    await flush();
    expect(calls).toHaveLength(0);
    expect(endpoint.closes).toBe(1);
  });

  it('answers a request that cannot be deserialized with invalid-request and no job ID', () => {
    const { endpoint, calls } = host();
    endpoint.dispatch('messageerror');
    expect(endpoint.afterReady).toEqual([failed(null, {
      layer: 'import', code: 'invalid-request', location: 'request', reason: 'the request could not be deserialized', limit: null,
    })]);
    expect(calls).toHaveLength(0);
    expect(endpoint.closes).toBe(1);
  });

  it.each([
    ['another start', (endpoint: FakeEndpoint) => endpoint.dispatch('message', start({ jobId: 8 })), 'the Worker accepts a single start message'],
    ['any other message', (endpoint: FakeEndpoint) => endpoint.dispatch('message', { type: MARKER }), 'the Worker accepts a single start message'],
    ['a message that cannot be deserialized', (endpoint: FakeEndpoint) => endpoint.dispatch('messageerror'), 'the request could not be deserialized'],
  ])('fails the running job with invalid-request when it receives %s, and ignores the job afterwards', async (_, receive, reason) => {
    const pending = deferred<void>();
    const { endpoint, calls } = await started(async report => {
      report.progress('identify-source', 0);
      await pending.promise;
      report.identified(IDENTITY);
    });
    receive(endpoint);
    pending.resolve();
    await flush();
    expect(endpoint.afterReady).toEqual([
      { type: 'progress', jobId: 7, sequence: 1, stage: 'identify-source', readBytes: 0 },
      failed(7, { layer: 'import', code: 'invalid-request', location: 'request', reason, limit: null }, 2),
    ]);
    expect(calls).toHaveLength(1);
    expect(endpoint.closes).toBe(1);
  });
});

describe('reporting', () => {
  it('numbers every message after ready from 1 and finishes with the groups sent and the usage', async () => {
    const audio = group('audio');
    const models = group('models');
    const { endpoint } = await started(report => {
      report.progress('identify-source', 0);
      report.progress('identify-source', 2048);
      report.identified({ ...IDENTITY, files: [MARKER] } as typeof IDENTITY);
      report.progress('convert-graphics', 2048);
      report.progress('convert-graphics', 4096);
      report.progress('convert-audio', 4096);
      report.group('audio', audio);
      report.group('models', models);
    });
    const messages = endpoint.afterReady;
    expect(messages.map(message => [message.type, 'sequence' in message && message.sequence])).toEqual([
      ['progress', 1], ['progress', 2], ['identified', 3], ['progress', 4], ['progress', 5], ['progress', 6], ['group', 7], ['group', 8],
      ['finished', 9],
    ]);
    expect(messages[2]).toEqual({ type: 'identified', jobId: 7, sequence: 3, identity: IDENTITY });
    expect(messages[4]).toEqual({ type: 'progress', jobId: 7, sequence: 5, stage: 'convert-graphics', readBytes: 4096 });
    expect(messages[5]).toEqual({ type: 'progress', jobId: 7, sequence: 6, stage: 'convert-audio', readBytes: 4096 });
    expect(messages[6]).toEqual({ type: 'group', jobId: 7, sequence: 7, group: 'audio', input: audio });
    expect(Object.keys((messages[6] as { input: object }).input)).toEqual(['manifest', 'payloads', 'sources']);
    expect(messages[8]).toEqual({ type: 'finished', jobId: 7, sequence: 9, groups: ['audio', 'models'], usage: USAGE });
    expect(messages.every(message => 'jobId' in message && message.jobId === 7)).toBe(true);
    expect(endpoint.log.slice(-2)).toEqual(['post:finished', 'close']);
    expect(JSON.stringify(messages)).not.toContain(MARKER);
  });

  it('ignores every report after the terminal message', async () => {
    const { endpoint, calls } = await started();
    const { report } = calls[0];
    report.progress('identify-source', 1);
    report.identified(IDENTITY);
    report.group('audio', group('audio'));
    endpoint.dispatch('unhandledrejection');
    expect(endpoint.afterReady.map(message => message.type)).toEqual(['identified', 'finished']);
    expect(endpoint.closes).toBe(1);
  });

  it.each([
    ['a second identification', (report: ImportReporter) => { report.identified(IDENTITY); report.identified(IDENTITY); }, ['identified']],
    ['identification progress after identification', (report: ImportReporter) => { report.identified(IDENTITY); report.progress('identify-source', 9); }, ['identified']],
    ['graphics progress before identification', (report: ImportReporter) => report.progress('convert-graphics', 0), []],
    ['identification progress after graphics progress', (report: ImportReporter) => {
      report.identified(IDENTITY);
      report.progress('convert-graphics', 9);
      report.progress('identify-source', 9);
    }, ['identified', 'progress']],
    ['audio progress before identification', (report: ImportReporter) => report.progress('convert-audio', 0), []],
    ['graphics progress after audio progress', (report: ImportReporter) => {
      report.identified(IDENTITY);
      report.progress('convert-audio', 9);
      report.progress('convert-graphics', 9);
    }, ['identified', 'progress']],
    ['progress after the first group', (report: ImportReporter) => {
      report.identified(IDENTITY);
      report.progress('convert-audio', 9);
      report.group('audio', group('audio'));
      report.progress('convert-audio', 9);
    }, ['identified', 'progress', 'group']],
    ['a group before identification', (report: ImportReporter) => report.group('audio', group('audio')), []],
    ['a repeated group', (report: ImportReporter) => {
      report.identified(IDENTITY);
      report.group('audio', group('audio'));
      report.group('audio', group('audio'));
    }, ['identified', 'group']],
    ['finishing without identification', (report: ImportReporter) => report.progress('identify-source', 0), ['progress']],
  ])('fails the job with internal-error on %s', async (_, steps, before) => {
    const { endpoint, calls } = await started(steps);
    const messages = endpoint.afterReady;
    expect(messages.slice(0, -1).map(message => message.type)).toEqual(before);
    expect(messages.at(-1)).toEqual(failed(7, INTERNAL_ERROR, before.length + 1));
    calls[0].report.progress('identify-source', 10);
    expect(endpoint.afterReady).toHaveLength(before.length + 1);
    expect(endpoint.closes).toBe(1);
  });

  it('lets a send that cannot be cloned reach the job without consuming a sequence number', async () => {
    const endpoint = new FakeEndpoint();
    const post = endpoint.postMessage.bind(endpoint);
    vi.spyOn(endpoint, 'postMessage').mockImplementation((message, transfer) => {
      if (message.type === 'group') throw new DOMException(MARKER, 'DataCloneError');
      post(message, transfer);
    });
    let thrown: unknown;
    runImportHost(endpoint, async (_, report) => {
      report.identified(IDENTITY);
      try {
        report.group('audio', group('audio'));
      } catch (error) {
        thrown = error;
      }
      return USAGE;
    });
    endpoint.dispatch('message', start());
    await flush();
    expect(thrown).toBeInstanceOf(DOMException);
    expect(endpoint.afterReady).toEqual([
      { type: 'identified', jobId: 7, sequence: 1, identity: IDENTITY },
      { type: 'finished', jobId: 7, sequence: 2, groups: [], usage: USAGE },
    ]);
  });
});

describe('failures', () => {
  const discError = new DiscReadError('budget-exceeded', 'image', 'reading would exceed the source read budget',
    { name: 'sourceReadBytes', limit: 10, observed: 11 });
  const sourceError = new SourceError('unsupported-version', 'file:/MAIN/AISTUFF.NOB', 'the file does not match the whitelist');
  const contentError = new ContentContractError('payload-detached', 'groups.audio.payloads[0]', 'was already transferred');
  const sndError = new SourceError('unsupported-payload', 'sources.mappings[0].parts[0].alternatives[0].flags', 'the flags are not accepted');
  const sndHeaderError = new SourceError('invalid-payload', 'sources.mappings[0].parts[0].alternatives[0].sampleBytes', 'the sample bytes exceed the block');
  const audioBudgetError = new SourceError('budget-exceeded', 'sources.mappings[0].parts[0].alternatives[0].size',
    'the conversion exceeds its budget', { name: 'audioSamples', limit: 4_194_304, observed: null });

  it.each([
    ['a disc error', discError, { layer: 'disc', ...discError.toData() }],
    ['a source error', sourceError, { layer: 'source', ...sourceError.toData() }],
    ['an SND conversion error', sndError, { layer: 'source', ...sndError.toData() }],
    ['an SND structure error', sndHeaderError, { layer: 'source', ...sndHeaderError.toData() }],
    ['an audio budget error', audioBudgetError, { layer: 'source', ...audioBudgetError.toData() }],
    ['a content error', contentError, { layer: 'content', code: 'payload-detached', location: 'groups.audio.payloads[0]', reason: 'was already transferred', limit: null }],
    ['another Error', new TypeError(MARKER), INTERNAL_ERROR],
    ['an Error named like a known one', Object.assign(new Error(MARKER), { name: 'DiscReadError', code: 'read-failed' }), INTERNAL_ERROR],
    ['a string', MARKER, INTERNAL_ERROR],
    ['an error-like record', { code: 'read-failed', location: MARKER, reason: MARKER, limit: null }, INTERNAL_ERROR],
  ])('reports a job that rejects with %s in its own layer', async (_, thrown, error) => {
    const { endpoint } = await started(() => Promise.reject(thrown));
    expect(endpoint.afterReady).toEqual([failed(7, error)]);
    expect(JSON.stringify(endpoint.messages)).not.toContain(MARKER);
    expect(endpoint.log.slice(-2)).toEqual(['post:failed', 'close']);
  });

  it('reports a job that throws synchronously as internal-error', async () => {
    const endpoint = new FakeEndpoint();
    runImportHost(endpoint, () => { throw new Error(MARKER); });
    endpoint.dispatch('message', start());
    await flush();
    expect(endpoint.afterReady).toEqual([failed(7, INTERNAL_ERROR)]);
    expect(JSON.stringify(endpoint.messages)).not.toContain(MARKER);
  });

  it('reports an unhandled rejection as internal-error and cancels its default report', async () => {
    const pending = deferred<void>();
    const { endpoint } = await started(async report => {
      report.progress('identify-source', 0);
      await pending.promise;
    });
    const event = endpoint.dispatch('unhandledrejection', MARKER);
    expect(event.prevented).toBe(true);
    pending.resolve();
    await flush();
    expect(endpoint.afterReady).toEqual([
      { type: 'progress', jobId: 7, sequence: 1, stage: 'identify-source', readBytes: 0 },
      failed(7, INTERNAL_ERROR, 2),
    ]);
    expect(endpoint.closes).toBe(1);
  });

  it('reports usage that is not a complete budget record in the content layer', async () => {
    const endpoint = new FakeEndpoint();
    runImportHost(endpoint, async (_, report) => {
      report.identified(IDENTITY);
      return { sourceReadBytes: 1 } as unknown as typeof USAGE;
    });
    endpoint.dispatch('message', start());
    await flush();
    expect(endpoint.afterReady.slice(1)).toEqual([failed(7, expect.objectContaining({ layer: 'content', code: 'missing-budget-dimension', location: 'usage.assets' }), 2)]);
  });
});

describe('payload transfer', () => {
  it('transfers every payload buffer of a group, in payload order', async () => {
    const audio = group('audio');
    const { endpoint } = await started(report => {
      report.identified(IDENTITY);
      report.group('audio', audio);
    });
    const post = endpoint.posts.find(({ message }) => message.type === 'group')!;
    expect(post.transfer).toHaveLength(audio.payloads.length);
    post.transfer.forEach((buffer, index) => expect(buffer).toBe(audio.payloads[index].bytes.buffer));
  });

  const shared = new Uint8Array(4);
  const detached = new Uint8Array(4);
  structuredClone(detached.buffer, { transfer: [detached.buffer] });

  it.each([
    ['a view of part of a buffer', [{ id: 'sound/a', bytes: new Uint8Array(new ArrayBuffer(8), 2, 4) }], 'payload-not-exclusive', 'groups.audio.payloads[0]'],
    ['two views of one buffer', [{ id: 'sound/a', bytes: shared }, { id: 'sound/b', bytes: new Uint8Array(shared.buffer) }], 'payload-aliased', 'groups.audio.payloads[1]'],
    ['a transferred view', [{ id: 'sound/a', bytes: detached }], 'payload-detached', 'groups.audio.payloads[0].bytes'],
    ['payloads out of order', [{ id: 'sound/b', bytes: new Uint8Array(1) }, { id: 'sound/a', bytes: new Uint8Array(1) }], 'payload-order', 'groups.audio.payloads[1]'],
  ])('fails without sending the group when it holds %s', async (_, records, code, location) => {
    const payloads = records.map(record => ({ ...record, schemaVersion: 1 }));
    const { endpoint } = await started(report => {
      report.identified(IDENTITY);
      report.group('audio', { manifest: {}, payloads, sources: { sourceFingerprint: FINGERPRINT, states: [] } });
    });
    const messages = endpoint.afterReady;
    expect(messages.map(message => message.type)).toEqual(['identified', 'failed']);
    expect(messages[1]).toEqual(failed(7, expect.objectContaining({ layer: 'content', code, location, limit: null }), 2));
    expect(endpoint.posts.every(post => post.transfer.length === 0)).toBe(true);
  });

  it('detaches the sender views through a real message channel, and the receiver gets the bytes', async () => {
    const { port1, port2 } = new MessageChannel();
    const endpoint = portEndpoint(port1);
    const audio = group('audio');
    const expected = audio.payloads.map(payload => new Uint8Array(payload.bytes));
    const detachedAfterSend: boolean[] = [];
    let received = '';
    runImportHost(endpoint, async (files, report) => {
      received = await files[0].blob.text();
      report.identified(IDENTITY);
      report.group('audio', audio);
      detachedAfterSend.push(...audio.payloads.map(payload => payload.bytes.byteLength === 0));
      return USAGE;
    });
    const messages = await new Promise<ImportWorkerMessage[]>(resolve => {
      const list: ImportWorkerMessage[] = [];
      port2.on('message', (message: ImportWorkerMessage) => {
        list.push(message);
        if (message.type === 'ready') port2.postMessage(start({ files: [file('GAME.CCD')] }));
        if (message.type === 'finished' || message.type === 'failed') resolve(list);
      });
    });
    port2.close();
    expect(received).toBe(MARKER);
    expect(detachedAfterSend).toEqual(audio.payloads.map(() => true));
    expect(messages.map(message => message.type)).toEqual(['ready', 'identified', 'group', 'finished']);
    for (const message of messages) expect(readImportWorkerMessage(message).status).toBe('valid');
    const sent = messages[2] as Extract<ImportWorkerMessage, { type: 'group' }>;
    expect((sent.input.payloads as { bytes: Uint8Array }[]).map(payload => payload.bytes)).toEqual(expected);
    expect(sent.input.manifest).toEqual(audio.manifest);
  });
});
