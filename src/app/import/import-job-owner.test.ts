import { describe, expect, it } from 'vitest';
import { RESOURCE_GROUPS, type ResourceGroup } from '../../content/asset-contract.ts';
import { EMPTY_BUDGET_USAGE } from '../../content/budget.ts';
import { SYNTHETIC_ASSETS, syntheticSourceGroup } from '../../content/synthetic-content.test-support.ts';
import { IMPORT_PROTOCOL_VERSION, type ImportStartMessage } from '../../workers/import-protocol.ts';
import { createImportJobOwner, type ImportJobSnapshot } from './import-job-owner.ts';
import type { ImportWorkerEvents, ImportWorkerPort } from './import-worker-port.ts';

const MARKER = 'PRIVATE-MARKER';
const FINGERPRINT = `source:sha256:${'0123456789abcdef'.repeat(4)}`;
const IDENTITY = Object.freeze({ versionId: 'synthetic-disc', sourceFingerprint: FINGERPRINT });
const USAGE = Object.freeze({ ...EMPTY_BUDGET_USAGE, sourceReadBytes: 6 });
const DISC_ERROR = Object.freeze({ layer: 'disc', code: 'read-failed', location: 'image', reason: 'the byte source failed to read', limit: null });

/** A port double that records posts and terminations and can still fire events after termination. */
class FakePort implements ImportWorkerPort {
  readonly posts: ImportStartMessage[] = [];
  terminations = 0;
  postError: unknown = null;
  readonly events: ImportWorkerEvents;

  constructor(events: ImportWorkerEvents) {
    this.events = events;
  }

  post(message: ImportStartMessage): void {
    this.posts.push(message);
    if (this.postError) throw this.postError;
  }

  terminate(): void {
    this.terminations += 1;
  }

  send(...messages: unknown[]): void {
    for (const message of messages) this.events.message(message);
  }
}

function setup() {
  const ports: FakePort[] = [];
  const reported: unknown[] = [];
  let factoryError: unknown = null;
  const owner = createImportJobOwner({
    createPort: events => {
      if (factoryError) throw factoryError;
      const port = new FakePort(events);
      ports.push(port);
      return port;
    },
    reportError: error => { reported.push(error); },
  });
  const snapshots: ImportJobSnapshot[] = [];
  owner.subscribe(() => { snapshots.push(owner.getSnapshot()); });
  return { owner, ports, reported, snapshots, failFactory: (error: unknown) => { factoryError = error; } };
}

const files = (...names: string[]) => names.map(name => new File([name], name));
const ready = { type: 'ready', protocol: IMPORT_PROTOCOL_VERSION };
const progress = (sequence: number, readBytes: number, jobId = 1, stage = 'identify-source') => ({ type: 'progress', jobId, sequence, stage, readBytes });
const graphicsProgress = (sequence: number, readBytes: number) => progress(sequence, readBytes, 1, 'convert-graphics');
const logicProgress = (sequence: number, readBytes: number) => progress(sequence, readBytes, 1, 'convert-logic');
const audioProgress = (sequence: number, readBytes: number) => progress(sequence, readBytes, 1, 'convert-audio');
const identified = (sequence: number, jobId = 1) => ({ type: 'identified', jobId, sequence, identity: IDENTITY });
const group = (sequence: number, jobId = 1) => ({
  type: 'group', jobId, sequence, group: 'audio',
  input: { manifest: {}, payloads: [{ id: 'sound/a', schemaVersion: 1, bytes: new Uint8Array(4) }], sources: { sourceFingerprint: FINGERPRINT, states: [] } },
});
const finished = (sequence: number, jobId = 1) => ({ type: 'finished', jobId, sequence, groups: [], usage: USAGE });
const failed = (sequence: number, error: unknown = DISC_ERROR, jobId: number | null = 1) => ({ type: 'failed', jobId, sequence, error });
const protocolError = (location: string) => expect.objectContaining({ layer: 'import', code: 'protocol-error', location });

/** A started job whose Worker sent `ready`, so the owner is running. */
function running(names = ['GAME.CCD', 'GAME.IMG']) {
  const context = setup();
  context.owner.start(files(...names));
  context.ports[0].send(ready);
  return { ...context, port: context.ports[0] };
}

/** Whether every container is frozen; payload views cannot be frozen and are exempt. */
function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || ArrayBuffer.isView(value)) return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

describe('normal import', () => {
  it('moves from idle through starting and running to finished, terminating the Worker once', () => {
    const { owner, ports, snapshots } = setup();
    const idle = owner.getSnapshot();
    expect(idle).toEqual({ status: 'idle' });
    expect(owner.getSnapshot()).toBe(idle);
    const input = files(`${MARKER}.ccd`, `${MARKER}.img`);
    expect(owner.start(input)).toEqual({ status: 'started', jobId: 1 });
    expect(ports).toHaveLength(1);
    const [port] = ports;
    expect(owner.getSnapshot()).toEqual({ status: 'starting', jobId: 1 });
    expect(port.posts).toEqual([]);
    port.send(ready);
    expect(port.posts).toEqual([{
      type: 'start', protocol: IMPORT_PROTOCOL_VERSION, jobId: 1, files: input.map(file => ({ name: file.name, blob: file })),
    }]);
    port.posts[0].files.forEach((item, index) => expect(item.blob).toBe(input[index]));
    expect(owner.getSnapshot()).toEqual({ status: 'running', jobId: 1, stage: null, readBytes: 0, identity: null, groups: [] });
    port.send(progress(1, 0), progress(2, 5), identified(3));
    const before = owner.getSnapshot();
    expect(before).toEqual({ status: 'running', jobId: 1, stage: 'identify-source', readBytes: 5, identity: IDENTITY, groups: [] });
    expect(owner.getSnapshot()).toBe(before);
    port.send(graphicsProgress(4, 5), graphicsProgress(5, 9));
    expect(owner.getSnapshot()).toEqual({ status: 'running', jobId: 1, stage: 'convert-graphics', readBytes: 9, identity: IDENTITY, groups: [] });
    port.send(logicProgress(6, 9));
    expect(owner.getSnapshot()).toEqual({ status: 'running', jobId: 1, stage: 'convert-logic', readBytes: 9, identity: IDENTITY, groups: [] });
    port.send(audioProgress(7, 9));
    expect(owner.getSnapshot()).toEqual({ status: 'running', jobId: 1, stage: 'convert-audio', readBytes: 9, identity: IDENTITY, groups: [] });
    expect(port.terminations).toBe(0);
    port.send(finished(8));
    expect(owner.getSnapshot()).toEqual({ status: 'finished', jobId: 1, identity: IDENTITY, groups: [], usage: USAGE });
    expect(port.terminations).toBe(1);
    expect(snapshots.map(snapshot => snapshot.status)).toEqual(['starting', ...new Array(8).fill('running'), 'finished']);
    expect(snapshots.every(isDeepFrozen)).toBe(true);
    expect(JSON.stringify(snapshots)).not.toContain(MARKER);
    port.send(progress(5, 6));
    port.events.error();
    port.events.messageError();
    expect(snapshots).toHaveLength(10);
    expect(port.terminations).toBe(1);
  });

  it('reports a Worker failure with its error and stage, without the identity', () => {
    const { owner, port } = running();
    port.send(progress(1, 3), identified(2), failed(3));
    expect(owner.getSnapshot()).toEqual({ status: 'failed', jobId: 1, stage: 'identify-source', error: DISC_ERROR });
    expect(port.terminations).toBe(1);
  });

  it('copies the accepted files, so changing the array before ready does not change the start message', () => {
    const context = setup();
    const input = files('GAME.CCD', 'GAME.IMG');
    const [ccd, img] = input;
    context.owner.start(input);
    input.push(new File(['x'], 'EXTRA.SUB'));
    input[0] = new File(['y'], 'OTHER.CCD');
    input.length = 0;
    context.ports[0].send(ready);
    expect(context.ports[0].posts[0].files).toEqual([{ name: 'GAME.CCD', blob: ccd }, { name: 'GAME.IMG', blob: img }]);
    expect(context.ports[0].posts[0].files[1].blob).toBe(img);
  });
});

describe('rejected starts', () => {
  const blob = new Blob(['x']);
  it.each([
    ['no files', []],
    ['five files', files('A', 'B', 'C', 'D', 'E')],
    ['a value that is not an array', files('A')[0]],
    ['a Blob without a name', [blob]],
    ['bytes', [new Uint8Array(1)]],
    ['a record shaped like a file', [{ name: 'GAME.CCD', size: 1, slice: () => blob }]],
    ['an empty name', files('')],
    ['a 256-unit name', files(MARKER.padEnd(256, 'x'))],
  ])('rejects %s as invalid-files without changing state or creating a Worker', (_, input) => {
    const { owner, ports, snapshots } = setup();
    expect(owner.start(input as unknown as File[])).toEqual({ status: 'invalid-files' });
    expect(owner.getSnapshot()).toEqual({ status: 'idle' });
    expect(ports).toHaveLength(0);
    expect(snapshots).toHaveLength(0);
  });

  it('accepts four files and a 255-unit name', () => {
    expect(setup().owner.start(files('A.CCD', 'A.IMG', 'A.SUB', 'a'.repeat(255)))).toEqual({ status: 'started', jobId: 1 });
  });

  it.each(['starting', 'running'])('answers busy while a job is %s, without changing anything', state => {
    const { owner, ports, snapshots } = setup();
    owner.start(files('GAME.CCD'));
    if (state === 'running') ports[0].send(ready);
    const snapshot = owner.getSnapshot();
    const notified = snapshots.length;
    expect(owner.start(files('OTHER.CCD'))).toEqual({ status: 'busy' });
    expect(owner.getSnapshot()).toBe(snapshot);
    expect(ports).toHaveLength(1);
    expect(snapshots).toHaveLength(notified);
  });
});

describe('cancellation and retry', () => {
  it.each(['starting', 'running'])('cancels a %s job synchronously and terminates its Worker once', state => {
    const { owner, ports, snapshots } = setup();
    owner.start(files('GAME.CCD'));
    if (state === 'running') ports[0].send(ready, progress(1, 0));
    expect(owner.cancel()).toBe(true);
    expect(owner.getSnapshot()).toEqual({ status: 'cancelled', jobId: 1, stage: state === 'running' ? 'identify-source' : null });
    expect(ports[0].terminations).toBe(1);
    const notified = snapshots.length;
    ports[0].send(ready, identified(1), finished(2));
    ports[0].events.error();
    ports[0].events.messageError();
    expect(owner.cancel()).toBe(false);
    expect(snapshots).toHaveLength(notified);
    expect(ports[0].terminations).toBe(1);
  });

  it.each([
    ['idle', () => undefined],
    ['finished', (port: FakePort) => port.send(ready, identified(1), finished(2))],
    ['failed', (port: FakePort) => port.send(ready, failed(1))],
  ])('does not cancel when %s', (state, settle) => {
    const { owner, ports } = setup();
    if (state !== 'idle') {
      owner.start(files('GAME.CCD'));
      settle(ports[0]);
    }
    const snapshot = owner.getSnapshot();
    expect(owner.cancel()).toBe(false);
    expect(owner.getSnapshot()).toBe(snapshot);
  });

  it('runs a retry in a new Worker with a new job ID, unaffected by late messages of the cancelled job', () => {
    const { owner, ports, snapshots } = setup();
    owner.start(files('A.CCD'));
    ports[0].send(ready, progress(1, 1));
    owner.cancel();
    expect(owner.start(files('B.CCD', 'B.IMG'))).toEqual({ status: 'started', jobId: 2 });
    expect(ports).toHaveLength(2);
    const notified = snapshots.length;
    ports[0].send(identified(2), group(3), finished(4), failed(5));
    ports[0].events.error();
    ports[0].events.messageError();
    expect(snapshots).toHaveLength(notified);
    expect(owner.getSnapshot()).toEqual({ status: 'starting', jobId: 2 });
    ports[1].send(ready, progress(1, 0, 2), identified(2, 2), finished(3, 2));
    expect(owner.getSnapshot()).toEqual({ status: 'finished', jobId: 2, identity: IDENTITY, groups: [], usage: USAGE });
    expect(ports[1].posts[0].jobId).toBe(2);
    expect(ports.map(port => port.terminations)).toEqual([1, 1]);
  });

  it('starts again after a failure', () => {
    const { owner, ports } = running();
    ports[0].send(failed(1));
    expect(owner.start(files('GAME.CCD'))).toEqual({ status: 'started', jobId: 2 });
  });
});

describe('start failures', () => {
  it('fails with worker-start-failed when the Worker cannot be created, then allows a retry', () => {
    const { owner, ports, snapshots, failFactory } = setup();
    failFactory(new Error(MARKER));
    expect(owner.start(files('GAME.CCD'))).toEqual({ status: 'started', jobId: 1 });
    expect(owner.getSnapshot()).toEqual({
      status: 'failed', jobId: 1, stage: null,
      error: { layer: 'import', code: 'worker-start-failed', location: 'worker', reason: 'the import Worker could not start', limit: null },
    });
    expect(ports).toHaveLength(0);
    expect(JSON.stringify(snapshots)).not.toContain(MARKER);
    failFactory(null);
    expect(owner.start(files('GAME.CCD'))).toEqual({ status: 'started', jobId: 2 });
  });

  it('handles events a factory delivers before returning, in order, once the job is starting', () => {
    const snapshots: ImportJobSnapshot[] = [];
    let port: FakePort | undefined;
    const owner = createImportJobOwner({
      createPort: events => {
        events.message(ready);
        events.message(progress(1, 2));
        port = new FakePort(events);
        return port;
      },
      reportError: error => { throw error; },
    });
    owner.subscribe(() => { snapshots.push(owner.getSnapshot()); });
    owner.start(files('GAME.CCD'));
    expect(port!.posts.map(message => message.type)).toEqual(['start']);
    expect(snapshots.map(snapshot => snapshot.status)).toEqual(['starting', 'running', 'running']);
    expect(owner.getSnapshot()).toMatchObject({ status: 'running', stage: 'identify-source', readBytes: 2 });
  });

  it('fails with worker-start-failed on an error a factory delivers before returning', () => {
    let port: FakePort | undefined;
    const owner = createImportJobOwner({
      createPort: events => { events.error(); port = new FakePort(events); return port; },
      reportError: error => { throw error; },
    });
    owner.start(files('GAME.CCD'));
    expect(owner.getSnapshot()).toMatchObject({ status: 'failed', error: expect.objectContaining({ code: 'worker-start-failed' }) });
    expect(port!.terminations).toBe(1);
  });

  it('drops events a factory delivered when a subscriber cancels the starting job', () => {
    let port: FakePort | undefined;
    const owner = createImportJobOwner({
      createPort: events => { events.message(ready); port = new FakePort(events); return port; },
      reportError: error => { throw error; },
    });
    owner.subscribe(() => { if (owner.getSnapshot().status === 'starting') owner.cancel(); });
    owner.start(files('GAME.CCD'));
    expect(owner.getSnapshot()).toEqual({ status: 'cancelled', jobId: 1, stage: null });
    expect(port!.posts).toEqual([]);
    expect(port!.terminations).toBe(1);
  });

  it.each(['error', 'messageError'] as const)('fails with worker-start-failed on %s before ready, never sending start', event => {
    const { owner, ports } = setup();
    owner.start(files('GAME.CCD'));
    ports[0].events[event]();
    expect(owner.getSnapshot()).toEqual({ status: 'failed', jobId: 1, stage: null, error: expect.objectContaining({ code: 'worker-start-failed', location: 'worker' }) });
    expect(ports[0].posts).toEqual([]);
    expect(ports[0].terminations).toBe(1);
  });

  it('fails with protocol-error when ready has the previous protocol version, never sending start', () => {
    const { owner, ports } = setup();
    owner.start(files('GAME.CCD'));
    ports[0].send({ type: 'ready', protocol: IMPORT_PROTOCOL_VERSION - 1 });
    expect(owner.getSnapshot()).toEqual({ status: 'failed', jobId: 1, stage: null, error: protocolError('message.protocol') });
    expect(ports[0].posts).toEqual([]);
    expect(ports[0].terminations).toBe(1);
  });

  it('fails with worker-failed when sending start throws, terminating the Worker once', () => {
    const { owner, ports } = setup();
    owner.start(files(`${MARKER}.ccd`));
    ports[0].postError = new DOMException(MARKER, 'DataCloneError');
    ports[0].send(ready);
    expect(owner.getSnapshot()).toEqual({
      status: 'failed', jobId: 1, stage: null,
      error: { layer: 'import', code: 'worker-failed', location: 'worker', reason: 'the import Worker failed', limit: null },
    });
    expect(ports[0].terminations).toBe(1);
  });
});

describe('running failures', () => {
  it('fails with worker-failed on an error after ready', () => {
    const { owner, port } = running();
    port.send(progress(1, 2));
    port.events.error();
    expect(owner.getSnapshot()).toEqual({ status: 'failed', jobId: 1, stage: 'identify-source', error: expect.objectContaining({ code: 'worker-failed', location: 'worker' }) });
    expect(port.terminations).toBe(1);
  });

  it.each([
    ['a message that cannot be deserialized', (port: FakePort) => port.events.messageError(), 'message'],
    ['an invalid message', (port: FakePort) => port.send({ type: MARKER }), 'message.type'],
    ['a second ready', (port: FakePort) => port.send(ready), 'message.type'],
    ['another job ID', (port: FakePort) => port.send(progress(1, 0, 2)), 'message.jobId'],
    ['a failure without a job ID', (port: FakePort) => port.send(failed(1, { ...DISC_ERROR, layer: 'import', code: 'invalid-request', location: 'request' }, null)), 'message.jobId'],
    ['a skipped sequence number', (port: FakePort) => port.send(progress(2, 0)), 'message.sequence'],
    ['a repeated sequence number', (port: FakePort) => port.send(progress(1, 0), progress(1, 0)), 'message.sequence'],
    ['a decreasing byte count', (port: FakePort) => port.send(progress(1, 3), progress(2, 2)), 'message.readBytes'],
    ['more bytes than the input', (port: FakePort) => port.send(progress(1, 17)), 'message.readBytes'],
    ['identification progress after identification', (port: FakePort) => port.send(identified(1), progress(2, 0)), 'message.stage'],
    ['graphics progress as the first progress', (port: FakePort) => port.send(graphicsProgress(1, 0)), 'message.stage'],
    ['graphics progress before identification', (port: FakePort) => port.send(progress(1, 0), graphicsProgress(2, 0)), 'message.stage'],
    ['identification progress after graphics progress', (port: FakePort) => port.send(identified(1), graphicsProgress(2, 0), progress(3, 0)), 'message.stage'],
    ['logic progress before identification', (port: FakePort) => port.send(progress(1, 0), logicProgress(2, 0)), 'message.stage'],
    ['graphics progress after logic progress', (port: FakePort) => port.send(identified(1), logicProgress(2, 0), graphicsProgress(3, 0)), 'message.stage'],
    ['audio progress as the first progress', (port: FakePort) => port.send(audioProgress(1, 0)), 'message.stage'],
    ['audio progress before identification', (port: FakePort) => port.send(progress(1, 0), audioProgress(2, 0)), 'message.stage'],
    ['graphics progress after audio progress', (port: FakePort) => port.send(identified(1), audioProgress(2, 0), graphicsProgress(3, 0)), 'message.stage'],
    ['logic progress after audio progress', (port: FakePort) => port.send(identified(1), audioProgress(2, 0), logicProgress(3, 0)), 'message.stage'],
    ['progress after the first group', (port: FakePort) => port.send(identified(1), audioProgress(2, 0), group(3), audioProgress(4, 0)), 'message.stage'],
    ['a second identification', (port: FakePort) => port.send(identified(1), identified(2)), 'message.type'],
    ['a group before identification', (port: FakePort) => port.send(group(1)), 'message.type'],
    ['a repeated group', (port: FakePort) => port.send(identified(1), group(2), group(3)), 'message.group'],
    ['finished before identification', (port: FakePort) => port.send(finished(1)), 'message.type'],
  ])('fails with protocol-error on %s, never as an empty finish', (_, receive, location) => {
    const { owner, port } = running(['GAME.CCD', 'GAME.IMG']);
    receive(port);
    expect(owner.getSnapshot()).toMatchObject({ status: 'failed', jobId: 1, error: protocolError(location) });
    expect(JSON.stringify(owner.getSnapshot())).not.toContain(MARKER);
    expect(port.terminations).toBe(1);
    port.send(finished(9));
    expect(owner.getSnapshot().status).toBe('failed');
  });

  it('fails with protocol-error on a message other than ready before ready', () => {
    const { owner, ports } = setup();
    owner.start(files('GAME.CCD'));
    ports[0].send(progress(1, 0));
    expect(owner.getSnapshot()).toMatchObject({ status: 'failed', error: protocolError('message.type') });
    expect(ports[0].posts).toEqual([]);
  });
});

describe('subscribers and disposal', () => {
  it('isolates a throwing subscriber from the others and from the state', () => {
    const { owner, reported } = setup();
    const failure = new Error('subscriber');
    const calls: string[] = [];
    owner.subscribe(() => { calls.push('first'); throw failure; });
    const unsubscribe = owner.subscribe(() => { calls.push('second'); });
    owner.start(files('GAME.CCD'));
    expect(calls).toEqual(['first', 'second']);
    expect(reported).toEqual([failure]);
    expect(owner.getSnapshot()).toEqual({ status: 'starting', jobId: 1 });
    unsubscribe();
    owner.cancel();
    expect(calls).toEqual(['first', 'second', 'first']);
  });

  it('survives an error outlet that throws', () => {
    const owner = createImportJobOwner({ createPort: events => new FakePort(events), reportError: () => { throw new Error('outlet'); } });
    let second = 0;
    owner.subscribe(() => { throw new Error('subscriber'); });
    owner.subscribe(() => { second += 1; });
    expect(owner.start(files('GAME.CCD'))).toEqual({ status: 'started', jobId: 1 });
    expect(second).toBe(1);
  });

  it.each(['idle', 'starting', 'running', 'finished'])('disposes when %s: terminates any active Worker, then rejects every command', state => {
    const { owner, ports, snapshots } = setup();
    if (state !== 'idle') owner.start(files('GAME.CCD'));
    if (state === 'running' || state === 'finished') ports[0].send(ready, progress(1, 1));
    if (state === 'finished') ports[0].send(identified(2), finished(3));
    const snapshot = owner.getSnapshot();
    const notified = snapshots.length;
    owner.dispose();
    owner.dispose();
    expect(ports.map(port => port.terminations)).toEqual(state === 'idle' ? [] : [1]);
    ports[0]?.send(identified(2), finished(3));
    ports[0]?.events.error();
    let late = 0;
    owner.subscribe(() => { late += 1; })();
    owner.subscribe(() => { late += 1; });
    expect(owner.start(files('GAME.CCD'))).toEqual({ status: 'disposed' });
    expect(owner.cancel()).toBe(false);
    expect(owner.getSnapshot()).toBe(snapshot);
    expect(snapshots).toHaveLength(notified);
    expect(late).toBe(0);
    expect(ports).toHaveLength(state === 'idle' ? 0 : 1);
  });

  it('skips a subscriber that an earlier one removed during the same notification', () => {
    const { owner } = setup();
    const calls: string[] = [];
    let unsubscribeLater = () => undefined as void;
    owner.subscribe(() => { calls.push('first'); unsubscribeLater(); });
    unsubscribeLater = owner.subscribe(() => { calls.push('later'); });
    owner.start(files('GAME.CCD'));
    expect(calls).toEqual(['first']);
  });

  it('stops notifying the remaining subscribers when one disposes the owner', () => {
    const { owner } = setup();
    const calls: string[] = [];
    owner.subscribe(() => { calls.push('disposer'); owner.dispose(); });
    owner.subscribe(() => { calls.push('later'); });
    owner.start(files('GAME.CCD'));
    expect(calls).toEqual(['disposer']);
  });
});

describe('snapshots', () => {
  it('keeps the identity and every byte count out of failed and cancelled snapshots', () => {
    const cancelled = running();
    cancelled.port.send(identified(1));
    cancelled.owner.cancel();
    expect(Object.keys(cancelled.owner.getSnapshot())).toEqual(['status', 'jobId', 'stage']);
    const failedJob = running();
    failedJob.port.send(identified(1), failed(2));
    expect(Object.keys(failedJob.owner.getSnapshot())).toEqual(['status', 'jobId', 'stage', 'error']);
  });

  it('never holds payload bytes', () => {
    const { owner, port, snapshots } = running();
    port.send(identified(1), group(2));
    expect(owner.getSnapshot().status).toBe('running');
    const holdsBytes = (value: unknown): boolean => value instanceof Uint8Array
      || (typeof value === 'object' && value !== null && Object.values(value).some(holdsBytes));
    expect(snapshots.some(holdsBytes)).toBe(false);
  });
});

describe('group results', () => {
  const bound = (name: ResourceGroup, fingerprint = FINGERPRINT) => syntheticSourceGroup(name, fingerprint);
  const sent = (sequence: number, name: ResourceGroup, input: unknown) => ({ type: 'group', jobId: 1, sequence, group: name, input });
  const finish = (sequence: number, groups: readonly ResourceGroup[]) => ({ type: 'finished', jobId: 1, sequence, groups, usage: USAGE });
  const holdsBytes = (value: unknown): boolean => value instanceof Uint8Array
    || (typeof value === 'object' && value !== null && Object.values(value).some(holdsBytes));
  const complete = (name: ResourceGroup) => ({ group: name, status: 'group-complete', assets: SYNTHETIC_ASSETS[name].length, diagnostics: [] });

  it('keeps four complete groups bound to the identified source and hands them over once', () => {
    const { owner, port, snapshots } = running();
    const inputs = RESOURCE_GROUPS.map(name => bound(name));
    port.send(identified(1), ...RESOURCE_GROUPS.map((name, index) => sent(index + 2, name, inputs[index])));
    expect(owner.getSnapshot()).toMatchObject({ status: 'running', groups: RESOURCE_GROUPS.map(complete) });
    expect(owner.takeGroups()).toBeNull();
    port.send(finish(6, RESOURCE_GROUPS));
    expect(owner.getSnapshot()).toEqual({ status: 'finished', jobId: 1, identity: IDENTITY, groups: RESOURCE_GROUPS.map(complete), usage: USAGE });
    expect(snapshots.map(snapshot => snapshot.status === 'running' && snapshot.groups.length)).toEqual([false, 0, 0, 1, 2, 3, 4, false]);
    expect(snapshots.some(holdsBytes)).toBe(false);
    expect(snapshots.filter(snapshot => !isDeepFrozen(snapshot))).toEqual([]);
    const taken = owner.takeGroups();
    expect(taken).toEqual(RESOURCE_GROUPS.map((name, index) => ({ group: name, ...inputs[index] })));
    taken!.forEach((item, index) => {
      expect(item.payloads).toBe(inputs[index].payloads);
      (item.payloads as { bytes: Uint8Array }[]).forEach((payload, at) => expect(payload.bytes).toBe(inputs[index].payloads[at].bytes));
    });
    expect(isDeepFrozen(taken)).toBe(true);
    expect(owner.takeGroups()).toBeNull();
  });

  it('accepts every stage in order before a group, and the group before finishing', () => {
    const { owner, port } = running();
    const audio = bound('audio');
    port.send(progress(1, 0), identified(2), graphicsProgress(3, 4), audioProgress(4, 9), sent(5, 'audio', audio), finish(6, ['audio']));
    expect(owner.getSnapshot()).toEqual({ status: 'finished', jobId: 1, identity: IDENTITY, groups: [complete('audio')], usage: USAGE });
    expect(owner.takeGroups()).toEqual([{ group: 'audio', ...audio }]);
  });

  it('records a group with a changed payload as incomplete and keeps no payload of it', () => {
    const { owner, port } = running();
    const models = bound('models');
    models.payloads[0].bytes[0] ^= 1;
    port.send(identified(1), sent(2, 'models', models), sent(3, 'audio', bound('audio')), finish(4, ['models', 'audio']));
    const snapshot = owner.getSnapshot();
    if (snapshot.status !== 'finished') throw new Error('expected a finished job');
    expect(snapshot.groups[0]).toMatchObject({ group: 'models', status: 'incomplete', assets: null });
    expect(snapshot.groups[0].diagnostics.map(({ code, path }) => `${code}@${path}`)).toEqual(['payload-mismatch@payloads[0]']);
    expect(snapshot.groups[1]).toEqual(complete('audio'));
    expect(owner.takeGroups()!.map(item => item.group)).toEqual(['audio']);
  });

  it.each([
    ['a manifest that cannot be read', (input: Record<string, unknown>) => { input.manifest = null; }],
    ['malformed source states', (input: Record<string, unknown>) => { input.sources = { sourceFingerprint: FINGERPRINT, states: MARKER }; }],
    ['an extra field in the source states', (input: Record<string, unknown>) => { input.sources = { ...(input.sources as object), [MARKER]: 1 }; }],
    ['an extra field in the manifest', (input: Record<string, unknown>) => { input.manifest = { ...(input.manifest as object), [MARKER]: 1 }; }],
  ])('records a group with %s as incomplete with P2-01 diagnostics', (_, change) => {
    const { owner, port } = running();
    const input: Record<string, unknown> = bound('audio');
    change(input);
    port.send(identified(1), sent(2, 'audio', input), finish(3, ['audio']));
    const snapshot = owner.getSnapshot();
    if (snapshot.status !== 'finished') throw new Error('expected a finished job');
    expect(snapshot.groups).toHaveLength(1);
    expect(snapshot.groups[0]).toMatchObject({ group: 'audio', status: 'incomplete', assets: null });
    expect(snapshot.groups[0].diagnostics.length).toBeGreaterThan(0);
    expect(JSON.stringify(snapshot)).not.toContain(MARKER);
    expect(owner.takeGroups()).toEqual([]);
  });

  it.each([
    ['a group bound to another source', (port: FakePort) => port.send(sent(2, 'audio', bound('audio', `source:sha256:${'f'.repeat(64)}`))), 'invalid-result', 'groups.audio'],
    ['sources that do not name the identified source', (port: FakePort) => port.send(sent(2, 'audio', { ...bound('audio'), sources: { sourceFingerprint: MARKER, states: [] } })), 'invalid-result', 'groups.audio'],
    ['audio content sent as models', (port: FakePort) => port.send(sent(2, 'models', bound('audio'))), 'protocol-error', 'message.group'],
    ['an input without sources', (port: FakePort) => port.send(sent(2, 'audio', { manifest: {}, payloads: [] })), 'protocol-error', 'message.input.sources'],
    ['an input with an extra field', (port: FakePort) => port.send(sent(2, 'audio', { ...bound('audio'), [MARKER]: 1 })), 'protocol-error', 'message.input'],
    ['a group message with an extra field', (port: FakePort) => port.send({ ...sent(2, 'audio', bound('audio')), [MARKER]: 1 }), 'protocol-error', 'message'],
    ['finished groups in another order', (port: FakePort) => port.send(sent(2, 'audio', bound('audio')), sent(3, 'logic', bound('logic')), finish(4, ['logic', 'audio'])), 'protocol-error', 'message.groups'],
    ['finished groups missing one', (port: FakePort) => port.send(sent(2, 'audio', bound('audio')), finish(3, [])), 'protocol-error', 'message.groups'],
    ['finished groups naming one never sent', (port: FakePort) => port.send(sent(2, 'audio', bound('audio')), finish(3, ['audio', 'logic'])), 'protocol-error', 'message.groups'],
  ])('fails on %s and discards every received group', (_, receive, code, location) => {
    const { owner, port } = running();
    port.send(identified(1));
    receive(port);
    const snapshot = owner.getSnapshot();
    expect(snapshot).toMatchObject({ status: 'failed', error: expect.objectContaining({ layer: 'import', code, location }) });
    expect(Object.keys(snapshot)).toEqual(['status', 'jobId', 'stage', 'error']);
    expect(JSON.stringify(snapshot)).not.toContain(MARKER);
    expect(owner.takeGroups()).toBeNull();
    expect(port.terminations).toBe(1);
  });

  it.each([
    ['idle', () => setup().owner],
    ['starting', () => { const context = setup(); context.owner.start(files('GAME.CCD')); return context.owner; }],
    ['running', () => { const { owner, port } = running(); port.send(identified(1), sent(2, 'audio', bound('audio'))); return owner; }],
    ['cancelled', () => { const { owner, port } = running(); port.send(identified(1), sent(2, 'audio', bound('audio'))); owner.cancel(); return owner; }],
    ['failed', () => { const { owner, port } = running(); port.send(identified(1), sent(2, 'audio', bound('audio')), failed(3)); return owner; }],
  ])('hands nothing over while %s', (_, make) => {
    expect(make().takeGroups()).toBeNull();
  });

  it.each([
    ['a new job starts', (owner: ReturnType<typeof setup>['owner']) => { expect(owner.start(files('GAME.CCD'))).toMatchObject({ status: 'started' }); }],
    ['the owner is disposed', (owner: ReturnType<typeof setup>['owner']) => owner.dispose()],
  ])('drops untaken groups when %s', (_, act) => {
    const { owner, port } = running();
    port.send(identified(1), sent(2, 'audio', bound('audio')), finish(3, ['audio']));
    act(owner);
    expect(owner.takeGroups()).toBeNull();
  });

  it('hands nothing over while the finishing port terminates, then once to the finished subscriber', () => {
    const { owner, port } = running();
    let duringTermination: unknown = 'not called';
    let taken: unknown = null;
    port.terminate = () => { duringTermination = owner.takeGroups(); };
    owner.subscribe(() => { if (owner.getSnapshot().status === 'finished') taken = owner.takeGroups(); });
    port.send(identified(1), sent(2, 'audio', bound('audio')), finish(3, ['audio']));
    expect(duringTermination).toBeNull();
    expect((taken as { group: string }[]).map(item => item.group)).toEqual(['audio']);
    expect(owner.takeGroups()).toBeNull();
  });

  it('keeps a validated group immutable from receipt to handoff', () => {
    const { owner, port } = running();
    const audio = bound('audio');
    port.send(identified(1), sent(2, 'audio', audio));
    expect(() => { (audio.manifest as { group: string }).group = 'models'; }).toThrow(TypeError);
    expect(() => { audio.payloads.pop(); }).toThrow(TypeError);
    expect(() => { audio.payloads[0].bytes = new Uint8Array(1); }).toThrow(TypeError);
    expect(() => { audio.sources!.states.push({ id: 'sound/x', state: 'verified', unknowns: [] }); }).toThrow(TypeError);
    port.send(finish(3, ['audio']));
    expect(owner.takeGroups()).toEqual([{ group: 'audio', ...bound('audio') }]);
  });

  it('freezes every container it hands over, even below one that arrived frozen', () => {
    const { owner, port } = running();
    const audio = bound('audio');
    Object.freeze(audio.sources);
    Object.freeze(audio.manifest);
    port.send(identified(1), sent(2, 'audio', audio), finish(3, ['audio']));
    const [taken] = owner.takeGroups()!;
    expect(Object.isFrozen((taken.sources as { states: unknown[] }).states)).toBe(true);
    expect(Object.isFrozen((taken.manifest as { assets: unknown[] }).assets)).toBe(true);
  });
});

