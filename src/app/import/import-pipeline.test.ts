import { beforeAll, describe, expect, it } from 'vitest';
import { RESOURCE_GROUPS } from '../../content/asset-contract.ts';
import { syntheticSourceGroup } from '../../content/synthetic-content.test-support.ts';
import { connectImportWorker, type WorkerLike } from '../../platform/workers/worker-port.ts';
import { runImportHost, type ImportJob } from '../../workers/import-host.ts';
import { FakeEndpoint, portEndpoint } from '../../workers/import-host.test-support.ts';
import { productionGraphicsFiles } from '../../original-data/conversion/production-graphics.test-support.ts';
import { createImportJob, type OpenSource } from '../../workers/import-job.ts';
import { IMPORT_PROTOCOL_VERSION } from '../../workers/import-protocol.ts';
import {
  boundGroups, graphicsCoveredFiles, MARKER, syntheticGroupsJob, syntheticImport, type SyntheticGroups,
} from '../../workers/synthetic-import.test-support.ts';
import { createImportJobOwner, type ImportJobSnapshot } from './import-job-owner.ts';
import type { ImportWorkerPortFactory } from './import-worker-port.ts';

const ascii = (text: string): Uint8Array => Uint8Array.from(text, character => character.charCodeAt(0));
const COVERED = { 'MAIN/ALPHA.DAT': ascii('alpha '.repeat(900)), 'MAIN/SUB/BETA.NOB': ascii('beta '.repeat(3000)) };
const TERMINAL = new Set(['finished', 'failed', 'cancelled']);

interface Traffic {
  readonly toWorker: unknown[];
  readonly fromWorker: unknown[];
}

/**
 * Connects the owner to a host running `job` over a real MessageChannel, so every message is structured-cloned and
 * group payloads are transferred. Terminating closes both ports; a MessagePort has no `error` event.
 */
function channelFactory(job: ImportJob, traffic: Traffic): ImportWorkerPortFactory {
  return events => {
    const { port1, port2 } = new MessageChannel();
    runImportHost(portEndpoint(port1), job);
    type Listener = Parameters<WorkerLike['addEventListener']>[1];
    const installed = new Map<Listener, (event: Event) => void>();
    const worker: WorkerLike = {
      postMessage: message => {
        traffic.toWorker.push(message);
        port2.postMessage(message);
      },
      addEventListener: (type, listener) => {
        if (type === 'error') return;
        const wrapped = (event: Event) => {
          const received = event as Event & { readonly data?: unknown };
          if (type === 'message') traffic.fromWorker.push(received.data);
          listener(received);
        };
        installed.set(listener, wrapped);
        port2.addEventListener(type, wrapped as Parameters<typeof port2.addEventListener>[1]);
        port2.start();
      },
      removeEventListener: (type, listener) => {
        const wrapped = installed.get(listener);
        if (wrapped) port2.removeEventListener(type, wrapped as Parameters<typeof port2.addEventListener>[1]);
      },
      terminate: () => {
        port1.close();
        port2.close();
      },
    };
    return connectImportWorker(worker, events);
  };
}

const openPorts = () => process.getActiveResourcesInfo().filter(resource => resource === 'MessagePort').length;

/** Runs one job through the owner, the adapter, a real channel and the host until the owner reaches a terminal state. */
async function run(job: ImportJob, files: readonly File[]) {
  const ports = openPorts();
  const traffic: Traffic = { toWorker: [], fromWorker: [] };
  const owner = createImportJobOwner({ createPort: channelFactory(job, traffic), reportError: error => { throw error; } });
  const snapshots: ImportJobSnapshot[] = [];
  await new Promise<void>(resolve => {
    owner.subscribe(() => {
      snapshots.push(owner.getSnapshot());
      if (TERMINAL.has(owner.getSnapshot().status)) resolve();
    });
    expect(owner.start([...files])).toMatchObject({ status: 'started' });
  });
  // Closing a port releases its handle asynchronously.
  for (let wait = 0; openPorts() > ports && wait < 50; wait++) await new Promise(resolve => setTimeout(resolve, 10));
  expect(openPorts()).toBe(ports);
  return { owner, traffic, snapshots };
}

/** The error the host itself reports for `job`, before any channel or owner is involved. */
async function hostError(job: ImportJob, files: readonly File[]): Promise<unknown> {
  const endpoint = new FakeEndpoint();
  runImportHost(endpoint, job);
  endpoint.dispatch('message', { type: 'start', protocol: IMPORT_PROTOCOL_VERSION, jobId: 1, files: files.map(file => ({ name: file.name, blob: file })) });
  await endpoint.closed;
  const last = endpoint.afterReady.at(-1);
  if (last?.type !== 'failed') throw new Error('expected the host to fail');
  return last.error;
}

/** Every string a value holds, including the names of Files, which JSON would drop. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (typeof value !== 'object' || value === null || ArrayBuffer.isView(value)) return [];
  if (value instanceof Blob) return 'name' in value ? [String(value.name)] : [];
  return Object.values(value).flatMap(strings);
}
const mentions = (value: unknown): boolean => strings(value).some(text => text.includes(MARKER));

describe('import pipeline over a structured-clone channel', () => {
  let imported: Awaited<ReturnType<typeof syntheticImport>>;
  beforeAll(async () => { imported = await syntheticImport(COVERED, 'pipeline-disc'); });

  it('transfers four groups, detaching the sender views, and the owner validates and hands them over', async () => {
    const sent: ReturnType<SyntheticGroups>[number][1][] = [];
    const recording: SyntheticGroups = fingerprint => {
      const groups = boundGroups(fingerprint);
      sent.push(...groups.map(([, input]) => input));
      return groups;
    };
    const { owner, traffic, snapshots } = await run(syntheticGroupsJob(imported.open, recording), imported.files);
    const snapshot = owner.getSnapshot();
    if (snapshot.status !== 'finished') throw new Error(`expected finished, got ${snapshot.status}`);
    expect(snapshot.identity.versionId).toBe('pipeline-disc');
    expect(snapshot.groups.map(({ group, status }) => [group, status])).toEqual(RESOURCE_GROUPS.map(group => [group, 'group-complete']));
    expect(sent.flatMap(input => input.payloads as { bytes: Uint8Array }[]).every(({ bytes }) => bytes.byteLength === 0 && bytes.buffer.byteLength === 0)).toBe(true);
    const taken = owner.takeGroups()!;
    expect(taken).toEqual(RESOURCE_GROUPS.map(group => ({ group, ...syntheticSourceGroup(group, snapshot.identity.sourceFingerprint) })));
    expect(traffic.fromWorker.filter(message => (message as { type: string }).type === 'group')).toHaveLength(4);
    expect(snapshots.some(item => item.status === 'running' && item.readBytes > 0)).toBe(true);
  });

  it('carries a failure of every layer through the channel exactly as the host converted it', async () => {
    const aliased: SyntheticGroups = fingerprint => {
      const input = syntheticSourceGroup('audio', fingerprint);
      input.payloads[1].bytes = new Uint8Array(input.payloads[0].bytes.buffer);
      return [['audio', input]];
    };
    const throwing: ImportJob = async () => { throw new Error(MARKER); };
    const cases: [string, ImportJob, readonly File[]][] = [
      ['disc', createImportJob(), imported.files.slice(0, 1)],
      ['source', createImportJob(), imported.files],
      ['content', syntheticGroupsJob(imported.open, aliased), imported.files],
      ['import', throwing, imported.files],
    ];
    for (const [layer, job, files] of cases) {
      const expected = await hostError(job, files);
      const { owner, traffic, snapshots } = await run(job, files);
      expect(owner.getSnapshot()).toMatchObject({ status: 'failed', error: expected });
      expect(expected).toMatchObject({ layer });
      expect(mentions(traffic.fromWorker) || mentions(snapshots)).toBe(false);
    }
  });

  it('keeps file names in the start request only', async () => {
    const tampered: SyntheticGroups = fingerprint => {
      const groups = boundGroups(fingerprint);
      (groups[1][1].payloads as { bytes: Uint8Array }[])[0].bytes[0] ^= 1;
      return groups;
    };
    const { owner, traffic, snapshots } = await run(syntheticGroupsJob(imported.open, tampered), imported.files);
    const snapshot = owner.getSnapshot();
    if (snapshot.status !== 'finished') throw new Error(`expected finished, got ${snapshot.status}`);
    expect(snapshot.groups[1]).toMatchObject({ status: 'incomplete' });
    expect(snapshot.groups[1].diagnostics.length).toBeGreaterThan(0);
    expect(traffic.toWorker.map(message => (message as { type: string }).type)).toEqual(['start']);
    expect(mentions(traffic.toWorker)).toBe(true);
    expect(traffic.fromWorker.length).toBeGreaterThan(4);
    expect(mentions(traffic.fromWorker)).toBe(false);
    expect(mentions(snapshots)).toBe(false);
    const taken = owner.takeGroups()!;
    expect(taken.map(item => item.group)).toEqual(RESOURCE_GROUPS.filter(group => group !== 'models'));
    expect(mentions(taken)).toBe(false);
  });
});

/** `open` whose ports reject every read once identification has finished, as a disc that fails mid-import would. */
function failingAfterIdentification(open: OpenSource): OpenSource {
  return async inputs => {
    const gate = { failing: false };
    const source = await open(inputs.map(({ name, source: port }) => ({
      name,
      source: {
        byteLength: port.byteLength,
        read: (offset: number, length: number) => (gate.failing ? Promise.reject(new Error(MARKER)) : port.read(offset, length)),
      },
    })));
    gate.failing = true;
    return source;
  };
}

describe('graphics conversion over a structured-clone channel', () => {
  it('reports identification, then graphics progress, and finishes without groups with the conversion usage', async () => {
    const graphics = await syntheticImport(graphicsCoveredFiles(), 'graphics-disc');
    const { owner, traffic } = await run(createImportJob(graphics.open), graphics.files);
    const snapshot = owner.getSnapshot();
    if (snapshot.status !== 'finished') throw new Error(`expected finished, got ${snapshot.status}`);
    expect(snapshot.groups).toEqual([]);
    expect(snapshot.usage).toMatchObject({ assets: 5, dependencyEdges: 0, paletteEntries: 512, glyphs: 256 + 256 + 192, imagePixels: 0 });
    const messages = traffic.fromWorker as { readonly type: string; readonly stage?: string; readonly readBytes?: number }[];
    const steps = messages.map(({ type, stage }) => stage ?? type);
    const identifiedAt = steps.indexOf('identified');
    expect([steps[0], steps.at(-1)]).toEqual(['ready', 'finished']);
    expect(steps.slice(1, identifiedAt).every(step => step === 'identify-source')).toBe(true);
    expect(steps.slice(identifiedAt + 1, -1)).not.toHaveLength(0);
    expect(steps.slice(identifiedAt + 1, -1).every(step => step === 'convert-graphics')).toBe(true);
    const counts = messages.flatMap(({ readBytes }) => (readBytes === undefined ? [] : [readBytes]));
    expect(counts).toEqual([...counts].sort((left, right) => left - right));
    expect(counts.at(-1)).toBe(snapshot.usage.sourceReadBytes);
    expect(owner.takeGroups()).toEqual([]);
  });

  it('keeps the layer, code and location of identification, read and conversion failures, with no partial result', async () => {
    const [complete, withoutCockpit, brokenFont] = await Promise.all([
      syntheticImport(graphicsCoveredFiles(), 'graphics-disc'),
      syntheticImport(productionGraphicsFiles({ CCKD: null }), 'graphics-disc'),
      syntheticImport(graphicsCoveredFiles(true), 'graphics-disc'),
    ]);
    const cases: [string, ImportJob, readonly File[], Record<string, unknown>][] = [
      ['identify-source', createImportJob(), complete.files, { layer: 'source', code: 'unsupported-version' }],
      ['convert-graphics', createImportJob(withoutCockpit.open), withoutCockpit.files,
        { layer: 'source', code: 'entry-not-found', location: 'sources.mappings[0].parts[0].alternatives[0]' }],
      // Opening the archive again resolves its path from the root directory, the first sector the graphics stage reads.
      ['convert-graphics', createImportJob(failingAfterIdentification(complete.open)), complete.files, { layer: 'disc', code: 'read-failed', location: 'image:lba 18' }],
      ['convert-graphics', createImportJob(brokenFont.open), brokenFont.files,
        { layer: 'source', code: 'invalid-payload', location: 'graphics[font/hud/4x6].glyphs' }],
    ];
    for (const [stage, job, files, error] of cases) {
      const expected = await hostError(job, files);
      expect(expected).toMatchObject(error);
      const { owner, traffic, snapshots } = await run(job, files);
      expect(owner.getSnapshot()).toEqual({ status: 'failed', jobId: 1, stage, error: expected });
      expect(owner.takeGroups()).toBeNull();
      expect(mentions(traffic.fromWorker) || mentions(snapshots)).toBe(false);
    }
  });
});

