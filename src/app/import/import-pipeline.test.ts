import { beforeAll, describe, expect, it } from 'vitest';
import { RESOURCE_GROUPS } from '../../content/asset-contract.ts';
import { addBudgets, EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import { validateGroup, type GroupInput } from '../../content/completeness.ts';
import { readGroupManifest } from '../../content/manifest.ts';
import { deriveManifestIdentity, type GroupDraft } from '../../content/manifest-identity.ts';
import { CLASSIC_P2_SLICE } from '../../content/slice-definition.ts';
import { syntheticSourceGroup } from '../../content/synthetic-content.test-support.ts';
import { connectImportWorker, type WorkerLike } from '../../platform/workers/worker-port.ts';
import { runImportHost, type ImportJob, type ImportReporter } from '../../workers/import-host.ts';
import { FakeEndpoint, portEndpoint } from '../../workers/import-host.test-support.ts';
import { productionIdentityBasis } from '../../original-data/conversion/converter-version.ts';
import { runGraphicsStep, stepGroupDraft } from '../../original-data/conversion/graphics-step.ts';
import { modelsGroupDraft } from '../../original-data/conversion/model-step.ts';
import { COCKPIT_HUD_MAP_USAGE, MODEL_TEXTURE_USAGE, productionGraphicsFiles } from '../../original-data/conversion/production-graphics.test-support.ts';
import { fail } from '../../content/contract-validation.ts';
import { PRODUCTION_MODEL_USAGE } from '../../original-data/conversion/production-models.test-support.ts';
import { PRODUCTION_EFFECT_USAGE } from '../../original-data/conversion/production-effects.test-support.ts';
import { PRODUCTION_FLIGHT_DATA_USAGE } from '../../original-data/conversion/flight-data.test-support.ts';
import { FLIGHT_GRAPHICS_USAGE } from '../../original-data/conversion/production-flight-graphics.test-support.ts';
import { HUD_TEXT_USAGE } from '../../original-data/conversion/production-hud-text.test-support.ts';
import { PRODUCTION_SOUND_USAGE } from '../../original-data/conversion/production-sounds.test-support.ts';
import { defaultScenarioSpec, syntheticScenario } from '../../original-data/formats/formats.test-support.ts';
import type { VerifiedSource } from '../../original-data/source/open-verified-source.ts';
import { createImportJob, PRODUCTION_LOGIC_STEP, type LogicStepInput, type OpenSource } from '../../workers/import-job.ts';
import { IMPORT_PROTOCOL_VERSION } from '../../workers/import-protocol.ts';
import {
  AUDIO_CONVERSION_USAGE, audioCoveredFiles, boundGroups, COCKPIT_GRAPHICS_ASSETS, cockpitCoveredFiles, cockpitGraphics, GRAPHICS_CONVERSION_USAGE,
  GRAPHICS_PAYLOAD_BYTES, MARKER, NO_AUDIO, NO_GRAPHICS, NO_LOGIC, NO_MODELS, PRODUCTION_CONVERSION_USAGE, productionCoveredFiles, RULE_DATA_USAGE,
  sliceCoveredFiles, SYNTHETIC_AUDIO, SYNTHETIC_FIRE_SOUND, syntheticGroupsJob, syntheticImport, syntheticSource, type SyntheticGroups,
} from '../../workers/synthetic-import.test-support.ts';
import { createImportJobOwner, type ImportJobOwner, type ImportJobSnapshot } from './import-job-owner.ts';
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

/**
 * Runs one job through the owner, the adapter, a real channel and the host until the owner reaches a terminal state;
 * `onChange` sees the owner after each recorded snapshot.
 */
async function run(job: ImportJob, files: readonly File[], onChange: (owner: ImportJobOwner) => void = () => undefined) {
  const ports = openPorts();
  const traffic: Traffic = { toWorker: [], fromWorker: [] };
  const owner = createImportJobOwner({ createPort: channelFactory(job, traffic), reportError: error => { throw error; } });
  const snapshots: ImportJobSnapshot[] = [];
  await new Promise<void>(resolve => {
    owner.subscribe(() => {
      snapshots.push(owner.getSnapshot());
      onChange(owner);
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

/** `job` with every group it sends recorded before the host transfers it. */
const recording = (job: ImportJob, sent: GroupInput[]): ImportJob => (files, report) => job(files, Object.freeze({
  ...report,
  group: (group: Parameters<ImportReporter['group']>[0], input: GroupInput) => {
    sent.push(input);
    report.group(group, input);
  },
}));

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
  it('reports every stage\'s progress, and finishes with the graphics partitions and the complete production cockpit-hud-map and audio groups', async () => {
    const graphics = await syntheticImport(productionCoveredFiles(), 'graphics-disc');
    const { owner, traffic } = await run(createImportJob(graphics.open, undefined, NO_LOGIC, undefined, NO_MODELS), graphics.files);
    const snapshot = owner.getSnapshot();
    if (snapshot.status !== 'finished') throw new Error(`expected finished, got ${snapshot.status}`);
    // With no bound craft model, the models group is incomplete: no craft roles. The P2-05 palette and fonts with the
    // production cockpit, HUD and map Assets, the P3-03 target display with its palette and view labels, and the HUD text
    // complete the cockpit-hud-map group.
    expect(snapshot.groups).toEqual([
      { group: 'models', status: 'incomplete', assets: null, diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'role-cardinality' })]) },
      { group: 'cockpit-hud-map', status: 'group-complete', assets: 4 + COCKPIT_HUD_MAP_USAGE.assets + 3 + HUD_TEXT_USAGE.assets, diagnostics: [] },
      { group: 'audio', status: 'group-complete', assets: PRODUCTION_SOUND_USAGE.assets, diagnostics: [] },
    ]);
    expect(snapshot.usage).toEqual({ ...PRODUCTION_CONVERSION_USAGE, sourceReadBytes: snapshot.usage.sourceReadBytes });
    const messages = traffic.fromWorker as { readonly type: string; readonly stage?: string; readonly readBytes?: number }[];
    expect(stepsOf(messages)).toEqual(['ready', 'identify-source', 'identified', 'convert-graphics', 'convert-logic', 'convert-audio', 'convert-models', 'group', 'finished']);
    const counts = messages.flatMap(({ readBytes }) => (readBytes === undefined ? [] : [readBytes]));
    expect(counts).toEqual([...counts].sort((left, right) => left - right));
    expect(counts.at(-1)).toBe(snapshot.usage.sourceReadBytes);
    expect(owner.takeGroups()?.map(({ group }) => group)).toEqual(['cockpit-hud-map', 'audio']);
  });

  it('keeps the layer, code and location of identification, read and conversion failures, with no partial result', async () => {
    const [complete, withoutCockpit, brokenFont, brokenElement] = await Promise.all([
      syntheticImport(productionCoveredFiles(), 'graphics-disc'),
      syntheticImport(productionGraphicsFiles({ CCKD: null }), 'graphics-disc'),
      syntheticImport(productionCoveredFiles('font'), 'graphics-disc'),
      syntheticImport(cockpitCoveredFiles(true), 'cockpit-disc'),
    ]);
    const cases: [string, ImportJob, readonly File[], Record<string, unknown>][] = [
      ['identify-source', createImportJob(), complete.files, { layer: 'source', code: 'unsupported-version' }],
      // The status display messages, the HUD text and the view labels are mapped first; the fonts after them name the
      // missing CCKD entry.
      ['convert-graphics', createImportJob(withoutCockpit.open), withoutCockpit.files,
        { layer: 'source', code: 'entry-not-found', location: 'sources.mappings[3].parts[0].alternatives[0]' }],
      // Opening the archive again resolves its path from the root directory, the first sector the graphics stage reads.
      ['convert-graphics', createImportJob(failingAfterIdentification(complete.open)), complete.files, { layer: 'disc', code: 'read-failed', location: 'image:lba 18' }],
      ['convert-graphics', createImportJob(brokenFont.open), brokenFont.files,
        { layer: 'source', code: 'invalid-payload', location: 'graphics[font/hud/4x6].glyphs' }],
      ['convert-graphics', createImportJob(brokenElement.open, cockpitGraphics(), NO_LOGIC, NO_AUDIO, NO_MODELS), brokenElement.files,
        { layer: 'source', code: 'invalid-payload', location: 'graphics[layout/cockpit/front].elements' }],
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
  it('sends the logic, models, cockpit-hud-map and audio groups after the conversion stages, and the owner validates them and hands the complete ones over once', async () => {
    const slice = await syntheticImport(sliceCoveredFiles(), 'slice-disc');
    const { owner, traffic, snapshots } = await run(createImportJob(slice.open), slice.files);
    const snapshot = owner.getSnapshot();
    if (snapshot.status !== 'finished') throw new Error(`expected finished, got ${snapshot.status}`);
    expect(stepsOf(traffic.fromWorker as { type: string; stage?: string }[]))
      .toEqual(['ready', 'identify-source', 'identified', 'convert-graphics', 'convert-logic', 'convert-audio', 'convert-models', 'group', 'finished']);
    // Every effect role has its data Asset (AC-20), every P3-03 role its Assets, and no texture mapping is unconfirmed
    // (AC-14), so all four groups are complete.
    expect(snapshot.groups.map(({ group, status, diagnostics }) => [group, status, diagnostics]))
      .toEqual(['logic', 'models', 'cockpit-hud-map', 'audio'].map(group => [group, 'group-complete', []]));
    // The receiver's validation of the models group equals Node's validation of the group message it received.
    const received = (traffic.fromWorker as { type: string; group?: string; input?: GroupInput }[]).find(({ type, group }) => type === 'group' && group === 'models')!;
    const expected = validateGroup(CLASSIC_P2_SLICE, received.input!);
    if (expected.status !== 'group-complete') throw new Error('expected a complete models group');
    // The models group adds the flight graphics of the group and the flight data.
    const flightModels = FLIGHT_GRAPHICS_USAGE.assets - 3;
    expect(snapshot.groups[1].assets)
      .toBe(1 + MODEL_TEXTURE_USAGE.assets + flightModels + PRODUCTION_MODEL_USAGE.assets + PRODUCTION_EFFECT_USAGE.assets + PRODUCTION_FLIGHT_DATA_USAGE.assets);
    expect(snapshot.usage).toMatchObject({
      assets: GRAPHICS_CONVERSION_USAGE.assets + 3 + RULE_DATA_USAGE.assets + PRODUCTION_SOUND_USAGE.assets + PRODUCTION_MODEL_USAGE.assets
        + PRODUCTION_EFFECT_USAGE.assets + PRODUCTION_FLIGHT_DATA_USAGE.assets,
      missionObjects: 11, missionReferences: 40,
      vertices: PRODUCTION_MODEL_USAGE.vertices + PRODUCTION_EFFECT_USAGE.vertices, triangles: PRODUCTION_MODEL_USAGE.triangles + PRODUCTION_EFFECT_USAGE.triangles,
    });
    const taken = owner.takeGroups()!;
    expect(taken.map(({ group }) => group)).toEqual(['logic', 'models', 'cockpit-hud-map', 'audio']);
    // One package: every group carries the same identity.
    const [logicManifest, ...others] = taken.map(({ manifest }) => readGroupManifest(manifest));
    expect(others.map(({ identity }) => identity)).toEqual(others.map(() => logicManifest.identity));
    expect(owner.takeGroups()).toBeNull();
    expect(mentions(traffic.fromWorker) || mentions(snapshots)).toBe(false);
  });

  it('keeps the layer, code, location and limit of logic failures, with no group', async () => {
    const unequal = defaultScenarioSpec();
    unequal.sectors = [6, 7];
    const [slice, unsupported] = await Promise.all([
      syntheticImport(sliceCoveredFiles(), 'slice-disc'),
      syntheticImport(sliceCoveredFiles({ scenario: syntheticScenario(unequal) }), 'slice-disc'),
    ]);
    const tight: LogicStepInput = { ...PRODUCTION_LOGIC_STEP, share: { ...PRODUCTION_LOGIC_STEP.share, missionReferences: 39 } };
    const failing: LogicStepInput = { convert: async () => fail('invalid-logic-payload', 'payload', 'is not a logic payload'), share: EMPTY_BUDGET_USAGE };
    const cases: [ImportJob, readonly File[], Record<string, unknown>][] = [
      [createImportJob(unsupported.open), unsupported.files, { layer: 'source', code: 'unsupported-payload', location: 'archive:/MAIN/SCENARIO.NOB#3019/header/height', limit: null }],
      [createImportJob(slice.open, NO_GRAPHICS, tight), slice.files,
        { layer: 'source', code: 'budget-exceeded', location: 'archive:/MAIN/SCENARIO.NOB#3019', limit: { name: 'missionReferences', limit: 39, observed: 40 } }],
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

describe('model conversion over a structured-clone channel', () => {
  it('carries a model conversion failure through the channel exactly as the host converted it, without a group', async () => {
    const corrupt = await syntheticImport(sliceCoveredFiles({ corruptMesh: true }), 'slice-disc');
    const job = createImportJob(corrupt.open);
    const expected = await hostError(job, corrupt.files);
    expect(expected).toMatchObject({ layer: 'source', code: 'invalid-payload', location: 'models[model/base-1].parts[0][1].mesh' });
    const { owner, traffic, snapshots } = await run(job, corrupt.files);
    expect(owner.getSnapshot()).toEqual({ status: 'failed', jobId: 1, stage: 'convert-models', error: expected });
    expect(traffic.fromWorker.some(message => (message as { type: string }).type === 'group')).toBe(false);
    expect(owner.takeGroups()).toBeNull();
    expect(mentions(traffic.fromWorker) || mentions(snapshots)).toBe(false);
  });
});

describe('audio conversion over a structured-clone channel', () => {
  it('transfers the converted audio group, detaching the sender views, and the owner hands it over complete', async () => {
    const audio = await syntheticImport(audioCoveredFiles(), 'audio-disc');
    const sent: GroupInput[] = [];
    const { owner, traffic } = await run(recording(createImportJob(audio.open, undefined, NO_LOGIC, SYNTHETIC_AUDIO, NO_MODELS), sent), audio.files);
    const snapshot = owner.getSnapshot();
    if (snapshot.status !== 'finished') throw new Error(`expected finished, got ${snapshot.status}`);
    expect(stepsOf(traffic.fromWorker as { type: string; stage?: string }[]))
      .toEqual(['ready', 'identify-source', 'identified', 'convert-graphics', 'convert-logic', 'convert-audio', 'convert-models', 'group', 'finished']);
    expect(snapshot.groups.map(({ group, status }) => [group, status])).toEqual([['models', 'incomplete'], ['cockpit-hud-map', 'group-complete'], ['audio', 'group-complete']]);
    expect(snapshot.groups[2]).toEqual({ group: 'audio', status: 'group-complete', assets: AUDIO_CONVERSION_USAGE.assets, diagnostics: [] });
    expect(snapshot.usage).toMatchObject({
      assets: GRAPHICS_CONVERSION_USAGE.assets + AUDIO_CONVERSION_USAGE.assets, payloadBytes: GRAPHICS_PAYLOAD_BYTES + AUDIO_CONVERSION_USAGE.payloadBytes, audioSamples: AUDIO_CONVERSION_USAGE.audioSamples,
    });
    expect(sent).toHaveLength(3);
    expect(sent.flatMap(({ payloads }) => payloads as { bytes: Uint8Array }[]).every(({ bytes }) => bytes.byteLength === 0 && bytes.buffer.byteLength === 0)).toBe(true);
    const taken = owner.takeGroups()!;
    expect(taken.map(({ group }) => group)).toEqual(['cockpit-hud-map', 'audio']);
    const audioGroup = taken[1];
    const manifest = readGroupManifest(audioGroup.manifest);
    expect(manifest.identity).toMatchObject({
      converterVersion: 'osr-import.graphics-4.logic-2.audio-2.models-4', origin: { type: 'original-import', sourceFingerprint: snapshot.identity.sourceFingerprint },
    });
    expect((audioGroup.payloads as { bytes: Uint8Array }[]).map(({ bytes }) => bytes.byteLength))
      .toEqual(manifest.assets.map(({ payloadIdentity }) => payloadIdentity.byteLength));
  });

  it('carries an SND conversion failure through the channel exactly as the host converted it, without a group', async () => {
    const corrupt = await syntheticImport(audioCoveredFiles(true), 'audio-disc');
    const job = createImportJob(corrupt.open, undefined, NO_LOGIC, SYNTHETIC_AUDIO, NO_MODELS);
    const expected = await hostError(job, corrupt.files);
    expect(expected).toMatchObject({ layer: 'source', code: 'unsupported-payload', location: `sources.mappings[${SYNTHETIC_FIRE_SOUND}].parts[0].alternatives[0].flags` });
    const { owner, traffic, snapshots } = await run(job, corrupt.files);
    expect(owner.getSnapshot()).toEqual({ status: 'failed', jobId: 1, stage: 'convert-audio', error: expected });
    expect(traffic.fromWorker.some(message => (message as { type: string }).type === 'group')).toBe(false);
    expect(owner.takeGroups()).toBeNull();
    expect(mentions(traffic.fromWorker) || mentions(snapshots)).toBe(false);
  });

  it('discards the received groups when the job fails after sending them', async () => {
    const audio = await syntheticImport(audioCoveredFiles(), 'audio-disc');
    const converting = createImportJob(audio.open, undefined, NO_LOGIC, SYNTHETIC_AUDIO, NO_MODELS);
    // The group is already sent when the host rejects the job's final usage.
    const failingLate: ImportJob = async (files, report) => {
      await converting(files, report);
      return { ...EMPTY_BUDGET_USAGE, assets: -1 } as BudgetRecord;
    };
    const { owner, traffic } = await run(failingLate, audio.files);
    expect(traffic.fromWorker.filter(message => (message as { type: string }).type === 'group')).toHaveLength(3);
    expect(owner.getSnapshot()).toMatchObject({ status: 'failed', stage: 'convert-models', error: { layer: 'content', code: 'invalid-budget-value' } });
    expect(owner.takeGroups()).toBeNull();
  });
});

describe('cockpit-hud-map assembly over a structured-clone channel', () => {
  const idsOf = (keep: (asset: typeof COCKPIT_GRAPHICS_ASSETS[number]) => boolean) => COCKPIT_GRAPHICS_ASSETS.filter(keep).map(({ id }) => id);
  const COCKPIT_IDS = idsOf(({ group }) => group === 'cockpit-hud-map');
  const MODEL_IDS = idsOf(({ group }) => group === 'models');
  type GroupMessage = { readonly type: 'group'; readonly group: string; readonly input: GroupInput };

  let disc: Awaited<ReturnType<typeof syntheticImport>>;
  beforeAll(async () => { disc = await syntheticImport(cockpitCoveredFiles(), 'cockpit-disc'); });

  /** The job converting `graphics` and nothing else on the cockpit disc; `capture` receives the source it identifies. */
  const cockpitJob = (graphics = cockpitGraphics(), capture: (source: VerifiedSource) => void = () => undefined) =>
    createImportJob(async inputs => {
      const source = await disc.open(inputs);
      capture(source);
      return source;
    }, graphics, NO_LOGIC, NO_AUDIO, NO_MODELS);

  const groupMessages = (traffic: Traffic) => traffic.fromWorker.filter(message => (message as { type: string }).type === 'group') as GroupMessage[];

  it('sends the complete cockpit-hud-map group apart from the models partition, and the owner hands it over after finished', async () => {
    let source: VerifiedSource | undefined;
    const sent: GroupInput[] = [];
    const { owner, traffic } = await run(recording(cockpitJob(undefined, opened => { source = opened; }), sent), disc.files);
    const snapshot = owner.getSnapshot();
    if (snapshot.status !== 'finished') throw new Error(`expected finished, got ${snapshot.status}`);
    const sourceFingerprint = source!.identity.fingerprint;

    // Messages in protocol order with read bytes that never decrease and no progress after the first group.
    const messages = traffic.fromWorker as { readonly type: string; readonly stage?: string; readonly readBytes?: number; readonly groups?: string[] }[];
    expect(stepsOf(messages)).toEqual(['ready', 'identify-source', 'identified', 'convert-graphics', 'convert-logic', 'convert-audio', 'convert-models', 'group', 'finished']);
    const counts = messages.flatMap(({ readBytes }) => (readBytes === undefined ? [] : [readBytes]));
    expect(counts).toEqual([...counts].sort((left, right) => left - right));
    expect(counts.at(-1)).toBe(source!.usage().sourceReadBytes);
    const received = groupMessages(traffic);
    expect(received.map(({ group }) => group)).toEqual(['models', 'cockpit-hud-map', 'audio']);
    expect(messages.at(-1)).toMatchObject({ type: 'finished', groups: ['models', 'cockpit-hud-map', 'audio'] });
    expect(sent.flatMap(({ payloads }) => payloads as { bytes: Uint8Array }[]).every(({ bytes }) => bytes.byteLength === 0 && bytes.buffer.byteLength === 0)).toBe(true);
    expect(snapshot.groups.map(({ group, status }) => [group, status])).toEqual([['models', 'incomplete'], ['cockpit-hud-map', 'group-complete'], ['audio', 'incomplete']]);
    expect(snapshot.groups[1]).toEqual({ group: 'cockpit-hud-map', status: 'group-complete', assets: COCKPIT_IDS.length, diagnostics: [] });

    // The received groups are the graphics step's partitions as Node converts them from the same source.
    const graphics = cockpitGraphics();
    const step = await runGraphicsStep(await syntheticSource(cockpitCoveredFiles(), 'cockpit-disc'), graphics.mappings, graphics.declarations, graphics.share);
    const taken = owner.takeGroups()!;
    expect(taken.map(({ group }) => group)).toEqual(['cockpit-hud-map']);
    const [cockpit] = taken;
    const expected = stepGroupDraft('cockpit-hud-map', [step], sourceFingerprint);
    const manifest = readGroupManifest(cockpit.manifest);
    expect(manifest.assets).toEqual(expected.assets);
    expect(manifest.assets.map(({ id }) => id)).toEqual(COCKPIT_IDS);
    expect(new Set(manifest.assets.map(({ kind }) => kind))).toEqual(new Set(['data', 'font', 'image', 'layout', 'palette']));
    const payloads = cockpit.payloads as { readonly id: string; readonly bytes: Uint8Array }[];
    expect(payloads.map(({ id, bytes }) => [id, [...bytes]])).toEqual(expected.payloads.map(({ id, bytes }) => [id, [...bytes]]));
    expect(payloads.every(({ bytes }) => bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength)).toBe(true);
    expect(new Set(payloads.map(({ bytes }) => bytes.buffer)).size).toBe(payloads.length);
    expect(cockpit.sources).toEqual({ sourceFingerprint, states: COCKPIT_IDS.map(id => ({ id, state: 'verified', unknowns: [] })) });
    expect(validateGroup(CLASSIC_P2_SLICE, cockpit)).toMatchObject({ status: 'group-complete', group: 'cockpit-hud-map', externalRequirements: [] });
    expect(owner.takeGroups()).toBeNull();
    const manifests = received.map(({ input }) => readGroupManifest(input.manifest));
    const models = manifests[0];
    expect(models.assets).toEqual(modelsGroupDraft([step], sourceFingerprint).assets);
    expect(models.assets.map(({ id }) => id)).toEqual(MODEL_IDS);

    // One package identity over every sent group, from the production basis with the incremented graphics component.
    const basis = productionIdentityBasis(sourceFingerprint);
    const drafts = received.map(({ group, input }, index) => ({ group, assets: manifests[index].assets, payloads: [], sources: input.sources }) as GroupDraft);
    const identity = { ...basis, manifestIdentity: deriveManifestIdentity(basis, drafts) };
    expect(manifests.map(({ identity: sent }) => sent)).toEqual(received.map(() => identity));
    expect(identity.converterVersion).toBe('osr-import.graphics-4.logic-2.audio-2.models-4');

    // The read usage plus the conversion usage, which counts every sent Asset and payload byte once.
    expect(snapshot.usage).toEqual(addBudgets(source!.usage(), step.usage));
    const assets = manifests.flatMap(({ assets: sent }) => sent);
    expect(snapshot.usage).toMatchObject({
      assets: COCKPIT_GRAPHICS_ASSETS.length, glyphs: 256 + 256 + 192,
      dependencyEdges: assets.reduce((sum, { dependencies }) => sum + dependencies.length, 0),
      payloadBytes: assets.reduce((sum, { payloadIdentity }) => sum + payloadIdentity.byteLength, 0),
    });
  });

  it('reports each missing role and an unconfirmed source, and changes the package identity with any descriptor, payload or source state', async () => {
    const roleIds = (role: string) => idsOf(asset => asset.role === role);
    const [gauge] = roleIds('hud-mfd');
    const background = 'image/hud/status-display/background-0';
    const cases: [string, ReturnType<typeof cockpitGraphics>, readonly Record<string, unknown>[]][] = [
      ['every role', cockpitGraphics(), []],
      ['no front layout', cockpitGraphics({ without: roleIds('front-cockpit') }), [{ code: 'role-cardinality', path: 'roles.front-cockpit' }]],
      ['no strategic-map Asset', cockpitGraphics({ without: roleIds('strategic-map') }), [{ code: 'role-cardinality', path: 'roles.strategic-map' }]],
      ['no hud-mfd Asset', cockpitGraphics({ without: roleIds('hud-mfd') }), [{ code: 'role-cardinality', path: 'roles.hud-mfd' }]],
      ['an unconfirmed mapping', cockpitGraphics({ mappings: { [gauge]: { confidence: 'unconfirmed', unknowns: ['U-030'] } } }),
        [{ code: 'source-not-ready', assetId: gauge, unknowns: ['U-030'] }]],
      // Complete groups that differ from the first only in one descriptor's role, or in one payload's rows.
      ['a relabelled image', cockpitGraphics({ declarations: { 'image/map/unit-marker/0': { role: 'hud-mfd' } } }), []],
      ['reversed rows', cockpitGraphics({ declarations: { [background]: { rowOrder: 'reversed' } } }), []],
    ];
    const identities: string[] = [];
    for (const [name, graphics, diagnostics] of cases) {
      const { owner, traffic } = await run(cockpitJob(graphics), disc.files);
      const snapshot = owner.getSnapshot();
      if (snapshot.status !== 'finished') throw new Error(`expected ${name} to finish, got ${snapshot.status}`);
      const summary = snapshot.groups.find(({ group }) => group === 'cockpit-hud-map')!;
      expect(summary, name).toMatchObject(diagnostics.length === 0
        ? { status: 'group-complete', diagnostics: [] }
        : { status: 'incomplete', diagnostics: diagnostics.map(diagnostic => expect.objectContaining(diagnostic)) });
      const sent = new Set(groupMessages(traffic).map(({ input }) => readGroupManifest(input.manifest).identity.manifestIdentity));
      expect(sent.size, name).toBe(1);
      identities.push(...sent);
    }
    expect(new Set(identities).size).toBe(cases.length);
  });

  /** `job` whose reporter hands the host an audio group with a detached payload buffer, which it cannot transfer. */
  const detachingAudio = (job: ImportJob): ImportJob => (files, report) => job(files, Object.freeze({
    ...report,
    group: (group: Parameters<ImportReporter['group']>[0], input: GroupInput) => {
      if (group !== 'audio') return report.group(group, input);
      const bytes = new Uint8Array(1);
      structuredClone(bytes.buffer, { transfer: [bytes.buffer] });
      report.group(group, { ...input, payloads: [{ id: 'sound/detached', schemaVersion: 1, bytes }] });
    },
  }));
  /** `job` returning a usage the host rejects once every group is sent. */
  const invalidUsage = (job: ImportJob): ImportJob => async (files, report) => {
    await job(files, report);
    return { ...EMPTY_BUDGET_USAGE, assets: -1 } as BudgetRecord;
  };

  it.each([
    ['a later group fails to transfer', detachingAudio, ['models', 'cockpit-hud-map'], { code: 'payload-detached', location: 'groups.audio.payloads[0].bytes' }],
    ['the final usage is rejected', invalidUsage, ['models', 'cockpit-hud-map', 'audio'], { code: 'invalid-budget-value', location: 'usage.assets' }],
  ])('discards the received complete cockpit-hud-map group when %s after sending began', async (_, inject, groups, error) => {
    const { owner, traffic, snapshots } = await run(inject(cockpitJob()), disc.files);
    expect(groupMessages(traffic).map(({ group }) => group)).toEqual(groups);
    expect(snapshots.some(snapshot => snapshot.status === 'running'
      && snapshot.groups.some(({ group, status }) => group === 'cockpit-hud-map' && status === 'group-complete'))).toBe(true);
    expect(owner.getSnapshot()).toMatchObject({ status: 'failed', stage: 'convert-models', error: { layer: 'content', ...error } });
    expect(owner.takeGroups()).toBeNull();
  });

  it('cancels during the graphics stage, and nothing the job still does changes the cancelled state', async () => {
    let ended!: () => void;
    const jobEnded = new Promise<void>(resolve => { ended = resolve; });
    const converting = cockpitJob();
    const job: ImportJob = async (files, report) => {
      try {
        return await converting(files, report);
      } finally {
        ended();
      }
    };
    const { owner, traffic, snapshots } = await run(job, disc.files, current => {
      const snapshot = current.getSnapshot();
      if (snapshot.status === 'running' && snapshot.stage === 'convert-graphics') expect(current.cancel()).toBe(true);
    });
    // The host runs on in this thread until the job ends; its later messages go nowhere.
    await jobEnded;
    await new Promise(resolve => setTimeout(resolve, 20));
    const cancelled = { status: 'cancelled', jobId: 1, stage: 'convert-graphics' };
    expect(snapshots.slice(-2)).toEqual([expect.objectContaining({ status: 'running', stage: 'convert-graphics' }), cancelled]);
    expect(owner.getSnapshot()).toEqual(cancelled);
    expect(owner.takeGroups()).toBeNull();
    expect(stepsOf(traffic.fromWorker as { type: string; stage?: string }[]).at(-1)).toBe('convert-graphics');
  });
});
