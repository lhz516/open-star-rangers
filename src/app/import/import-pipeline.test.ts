import { beforeAll, describe, expect, it } from 'vitest';
import { RESOURCE_GROUPS } from '../../content/asset-contract.ts';
import { EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import type { GroupInput } from '../../content/completeness.ts';
import { readGroupManifest } from '../../content/manifest.ts';
import { syntheticSourceGroup } from '../../content/synthetic-content.test-support.ts';
import { connectImportWorker, type WorkerLike } from '../../platform/workers/worker-port.ts';
import { runImportHost, type ImportJob, type ImportReporter } from '../../workers/import-host.ts';
import { FakeEndpoint, portEndpoint } from '../../workers/import-host.test-support.ts';
import { productionGraphicsFiles } from '../../original-data/conversion/production-graphics.test-support.ts';
import { fail } from '../../content/contract-validation.ts';
import { PRODUCTION_SOUND_USAGE } from '../../original-data/conversion/production-sounds.test-support.ts';
import { defaultScenarioSpec, syntheticScenario } from '../../original-data/formats/formats.test-support.ts';
import { createImportJob, PRODUCTION_LOGIC_STEP, type LogicStepInput, type OpenSource } from '../../workers/import-job.ts';
import { IMPORT_PROTOCOL_VERSION } from '../../workers/import-protocol.ts';
import {
  AUDIO_CONVERSION_USAGE, audioCoveredFiles, boundGroups, GRAPHICS_PAYLOAD_BYTES, MARKER, NO_GRAPHICS, NO_LOGIC,
  PRODUCTION_CONVERSION_USAGE, productionCoveredFiles, sliceCoveredFiles, SYNTHETIC_AUDIO, syntheticGroupsJob, syntheticImport, type SyntheticGroups,
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

/** Each message as its stage or type, with repeats collapsed. */
const stepsOf = (messages: readonly { readonly type: string; readonly stage?: string }[]): string[] => messages
  .map(({ type, stage }) => stage ?? type)
  .filter((step, index, all) => step !== all[index - 1]);

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
  it('reports identification, graphics, logic and audio progress, and finishes with the complete production audio group', async () => {
    const graphics = await syntheticImport(productionCoveredFiles(), 'graphics-disc');
    const { owner, traffic } = await run(createImportJob(graphics.open, undefined, NO_LOGIC), graphics.files);
    const snapshot = owner.getSnapshot();
    if (snapshot.status !== 'finished') throw new Error(`expected finished, got ${snapshot.status}`);
    expect(snapshot.groups).toEqual([{ group: 'audio', status: 'group-complete', assets: PRODUCTION_SOUND_USAGE.assets, diagnostics: [] }]);
    expect(snapshot.usage).toEqual({ ...PRODUCTION_CONVERSION_USAGE, sourceReadBytes: snapshot.usage.sourceReadBytes });
    const messages = traffic.fromWorker as { readonly type: string; readonly stage?: string; readonly readBytes?: number }[];
    expect(stepsOf(messages)).toEqual(['ready', 'identify-source', 'identified', 'convert-graphics', 'convert-logic', 'convert-audio', 'group', 'finished']);
    const counts = messages.flatMap(({ readBytes }) => (readBytes === undefined ? [] : [readBytes]));
    expect(counts).toEqual([...counts].sort((left, right) => left - right));
    expect(counts.at(-1)).toBe(snapshot.usage.sourceReadBytes);
    expect(owner.takeGroups()?.map(({ group }) => group)).toEqual(['audio']);
  });

  it('keeps the layer, code and location of identification, read and conversion failures, with no partial result', async () => {
    const [complete, withoutCockpit, brokenFont] = await Promise.all([
      syntheticImport(productionCoveredFiles(), 'graphics-disc'),
      syntheticImport(productionGraphicsFiles({ CCKD: null }), 'graphics-disc'),
      syntheticImport(productionCoveredFiles(true), 'graphics-disc'),
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

describe('logic conversion over a structured-clone channel', () => {
  it('sends the logic group after the conversion stages, and the owner validates and hands it over once', async () => {
    const slice = await syntheticImport(sliceCoveredFiles(), 'slice-disc');
    const { owner, traffic, snapshots } = await run(createImportJob(slice.open), slice.files);
    const snapshot = owner.getSnapshot();
    if (snapshot.status !== 'finished') throw new Error(`expected finished, got ${snapshot.status}`);
    const steps = (traffic.fromWorker as { readonly type: string; readonly stage?: string }[]).map(({ type, stage }) => stage ?? type);
    const distinct = steps.filter((step, index) => step !== steps[index - 1]);
    expect(distinct).toEqual(['ready', 'identify-source', 'identified', 'convert-graphics', 'convert-logic', 'convert-audio', 'group', 'finished']);
    expect(snapshot.groups.map(({ group, status }) => [group, status])).toEqual([['logic', 'group-complete'], ['audio', 'group-complete']]);
    expect(snapshot.usage).toMatchObject({ assets: 8 + PRODUCTION_SOUND_USAGE.assets, missionObjects: 11, missionReferences: 37 });
    const taken = owner.takeGroups()!;
    expect(taken.map(({ group }) => group)).toEqual(['logic', 'audio']);
    // One package: both groups carry the same identity.
    const [logicManifest, audioManifest] = taken.map(({ manifest }) => readGroupManifest(manifest));
    expect(audioManifest.identity).toEqual(logicManifest.identity);
    expect(owner.takeGroups()).toBeNull();
    expect(mentions(traffic.fromWorker) || mentions(snapshots)).toBe(false);
  });

  it('keeps the layer, code, location and limit of logic failures, with no group', async () => {
    const unequal = defaultScenarioSpec();
    unequal.sectors = [6, 7];
    const [slice, unsupported] = await Promise.all([
      syntheticImport(sliceCoveredFiles(), 'slice-disc'),
      syntheticImport(sliceCoveredFiles(syntheticScenario(unequal)), 'slice-disc'),
    ]);
    const tight: LogicStepInput = { ...PRODUCTION_LOGIC_STEP, share: { ...PRODUCTION_LOGIC_STEP.share, missionReferences: 36 } };
    const failing: LogicStepInput = { convert: async () => fail('invalid-logic-payload', 'payload', 'is not a logic payload'), share: EMPTY_BUDGET_USAGE };
    const cases: [ImportJob, readonly File[], Record<string, unknown>][] = [
      [createImportJob(unsupported.open), unsupported.files, { layer: 'source', code: 'unsupported-payload', location: 'archive:/MAIN/SCENARIO.NOB#3019/header/height', limit: null }],
      [createImportJob(slice.open, NO_GRAPHICS, tight), slice.files,
        { layer: 'source', code: 'budget-exceeded', location: 'archive:/MAIN/SCENARIO.NOB#3019', limit: { name: 'missionReferences', limit: 36, observed: 37 } }],
      [createImportJob(slice.open, NO_GRAPHICS, failing), slice.files, { layer: 'content', code: 'invalid-logic-payload', location: 'payload', limit: null }],
    ];
    for (const [job, files, error] of cases) {
      const expected = await hostError(job, files);
      expect(expected).toMatchObject(error);
      const { owner, traffic, snapshots } = await run(job, files);
      expect(owner.getSnapshot()).toEqual({ status: 'failed', jobId: 1, stage: 'convert-logic', error: expected });
      expect(owner.takeGroups()).toBeNull();
      expect(traffic.fromWorker.some(message => (message as { type: string }).type === 'group')).toBe(false);
      expect(mentions(traffic.fromWorker) || mentions(snapshots)).toBe(false);
    }
  });
});

describe('audio conversion over a structured-clone channel', () => {
  /** `job` with every group it sends recorded before the host transfers it. */
  const recording = (job: ImportJob, sent: GroupInput[]): ImportJob => (files, report) => job(files, Object.freeze({
    ...report,
    group: (group: Parameters<ImportReporter['group']>[0], input: GroupInput) => {
      sent.push(input);
      report.group(group, input);
    },
  }));

  it('transfers the converted audio group, detaching the sender views, and the owner hands it over complete', async () => {
    const audio = await syntheticImport(audioCoveredFiles(), 'audio-disc');
    const sent: GroupInput[] = [];
    const { owner, traffic } = await run(recording(createImportJob(audio.open, undefined, NO_LOGIC, SYNTHETIC_AUDIO), sent), audio.files);
    const snapshot = owner.getSnapshot();
    if (snapshot.status !== 'finished') throw new Error(`expected finished, got ${snapshot.status}`);
    expect(stepsOf(traffic.fromWorker as { type: string; stage?: string }[]))
      .toEqual(['ready', 'identify-source', 'identified', 'convert-graphics', 'convert-logic', 'convert-audio', 'group', 'finished']);
    expect(snapshot.groups).toEqual([{ group: 'audio', status: 'group-complete', assets: 4, diagnostics: [] }]);
    expect(snapshot.usage).toMatchObject({
      assets: 5 + 4, payloadBytes: GRAPHICS_PAYLOAD_BYTES + AUDIO_CONVERSION_USAGE.payloadBytes, audioSamples: AUDIO_CONVERSION_USAGE.audioSamples,
    });
    expect(sent).toHaveLength(1);
    expect((sent[0].payloads as { bytes: Uint8Array }[]).every(({ bytes }) => bytes.byteLength === 0 && bytes.buffer.byteLength === 0)).toBe(true);
    const taken = owner.takeGroups()!;
    expect(taken.map(({ group }) => group)).toEqual(['audio']);
    const manifest = readGroupManifest(taken[0].manifest);
    expect(manifest.identity).toMatchObject({
      converterVersion: 'osr-import.logic-1.audio-1', origin: { type: 'original-import', sourceFingerprint: snapshot.identity.sourceFingerprint },
    });
    expect((taken[0].payloads as { bytes: Uint8Array }[]).map(({ bytes }) => bytes.byteLength))
      .toEqual(manifest.assets.map(({ payloadIdentity }) => payloadIdentity.byteLength));
  });

  it('carries an SND conversion failure through the channel exactly as the host converted it, without a group', async () => {
    const corrupt = await syntheticImport(audioCoveredFiles(true), 'audio-disc');
    const job = createImportJob(corrupt.open, undefined, NO_LOGIC, SYNTHETIC_AUDIO);
    const expected = await hostError(job, corrupt.files);
    expect(expected).toMatchObject({ layer: 'source', code: 'unsupported-payload', location: 'sources.mappings[1].parts[0].alternatives[0].flags' });
    const { owner, traffic, snapshots } = await run(job, corrupt.files);
    expect(owner.getSnapshot()).toEqual({ status: 'failed', jobId: 1, stage: 'convert-audio', error: expected });
    expect(traffic.fromWorker.some(message => (message as { type: string }).type === 'group')).toBe(false);
    expect(owner.takeGroups()).toBeNull();
    expect(mentions(traffic.fromWorker) || mentions(snapshots)).toBe(false);
  });

  it('discards the received audio group when the job fails after sending it', async () => {
    const audio = await syntheticImport(audioCoveredFiles(), 'audio-disc');
    const converting = createImportJob(audio.open, undefined, NO_LOGIC, SYNTHETIC_AUDIO);
    // The group is already sent when the host rejects the job's final usage.
    const failingLate: ImportJob = async (files, report) => {
      await converting(files, report);
      return { ...EMPTY_BUDGET_USAGE, assets: -1 } as BudgetRecord;
    };
    const { owner, traffic } = await run(failingLate, audio.files);
    expect(traffic.fromWorker.filter(message => (message as { type: string }).type === 'group')).toHaveLength(1);
    expect(owner.getSnapshot()).toMatchObject({ status: 'failed', stage: 'convert-audio', error: { layer: 'content', code: 'invalid-budget-value' } });
    expect(owner.takeGroups()).toBeNull();
  });
});
