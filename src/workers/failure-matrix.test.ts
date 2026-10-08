import { describe, expect, it, onTestFinished } from 'vitest';
import type { ResourceGroup } from '../content/asset-contract.ts';
import { readAssetId } from '../content/asset-id.ts';
import { readGroupManifest } from '../content/manifest.ts';
import { fontPayloadLength } from '../content/graphics/font-payload.ts';
import { layoutPayloadLength } from '../content/graphics/layout-payload.ts';
import { readPayloadRecords } from '../content/payload.ts';
import { sha256Fingerprint } from '../content/sha256.ts';
import { createImportJobOwner, type ImportJobOwner, type ImportJobSnapshot } from '../app/import/import-job-owner.ts';
import type { ImportWorkerPortFactory } from '../app/import/import-worker-port.ts';
import { allGroups, finishedJob, flush, testHolder } from '../app/resources/resource-holder.test-support.ts';
import { PRODUCTION_GRAPHICS_MAPPINGS } from '../original-data/conversion/production-graphics.ts';
import { PRODUCTION_LAYOUT_POSITIONS } from '../original-data/conversion/production-graphics.test-support.ts';
import { PRODUCTION_MODEL_TEXTURES } from '../original-data/conversion/production-model-textures.ts';
import { archiveLocator } from '../original-data/source-mapping.ts';
import { DiscReadError } from '../original-data/disc/disc-error.ts';
import { requestedLbas, syntheticFileDisc } from '../original-data/disc/disc.test-support.ts';
import { openVerifiedSource } from '../original-data/source/open-verified-source.ts';
import { SourceError } from '../original-data/source-error.ts';
import { syntheticSource } from './synthetic-import.test-support.ts';
import { buildPackageRecord, buildStoredPayload, readGroupInputs } from '../platform/storage/resource-cache-records.ts';
import { BlobByteSource } from '../platform/files/blob-byte-source.ts';
import { connectImportWorker, type WorkerLike } from '../platform/workers/worker-port.ts';
import {
  CANARY_ASSET, CANARY_PRODUCTION_OFFSET, CANARY_PRODUCTION_PATH, CANARY_TEXT, canaryBytes, canaryCoveredFiles, canaryMarkerBytes,
  canaryProductionSizedFiles, containsBytes,
} from './canary.test-support.ts';
import { FAILURE_MATRIX, type FailureCase } from './failure-matrix.test-support.ts';
import { runImportHost } from './import-host.ts';
import { FakeEndpoint, portEndpoint } from './import-host.test-support.ts';
import { IMPORT_PROTOCOL_VERSION, IMPORT_STAGES, type ImportWorkerMessage } from './import-protocol.ts';
import {
  BUDGET_LAST_ASSET, BUDGET_PAYLOAD_BYTES, graphicsBudgetJob, holdAtStage, IMPORT_SCENARIOS, PROTOCOL_SCRIPTS, scenarioEntryProfile, scenarioSource,
  type RawWorkerEndpoint,
} from './import-scenarios.test-support.ts';
import { GRAPHICS_PAYLOAD_BYTES, MARKER, PADDING, sliceCoveredFiles, syntheticImport } from './synthetic-import.test-support.ts';

// P2-12 subtask 05: the failure matrix's fixed expectations in Node (AC-06, AC-07), the timing scenarios and the
// network canaries' arrival. Every case runs its test entry scenario behind the host, a structured-clone channel and
// the job owner, as the browser does; expected values come from the table, never from the run.

type ChannelPort = InstanceType<typeof MessageChannel>['port1'];
type Listener = Parameters<ChannelPort['addEventListener']>[1];

const TERMINAL = new Set(['finished', 'failed', 'cancelled']);

/** The Worker side of a channel port for a protocol script. */
const rawEndpoint = (port: ChannelPort): RawWorkerEndpoint => ({
  postMessage: message => port.postMessage(message),
  addEventListener: (type, listener) => {
    port.addEventListener(type, listener as unknown as Listener);
    port.start();
  },
});

/** Runs the scenario or protocol script `worker` on one end of a real MessageChannel; terminating closes both ends. */
function channelFactory(worker: string): ImportWorkerPortFactory {
  return events => {
    const { port1, port2 } = new MessageChannel();
    if (Object.hasOwn(PROTOCOL_SCRIPTS, worker)) PROTOCOL_SCRIPTS[worker](rawEndpoint(port1));
    else runImportHost(portEndpoint(port1), IMPORT_SCENARIOS[worker]());
    const port: WorkerLike = {
      postMessage: message => port2.postMessage(message),
      addEventListener: (type, listener) => {
        // A MessagePort has no `error` event.
        if (type === 'error') return;
        port2.addEventListener(type, listener as unknown as Listener);
        port2.start();
      },
      removeEventListener: (type, listener) => port2.removeEventListener(type, listener as unknown as Listener),
      terminate: () => {
        port1.close();
        port2.close();
      },
    };
    return connectImportWorker(port, events);
  };
}

/** Starts `worker` on `files` through a job owner and resolves once the owner reaches a terminal state. */
async function runCase(worker: string, files: readonly File[]): Promise<ImportJobOwner> {
  const owner = createImportJobOwner({ createPort: channelFactory(worker), reportError: error => { throw error; } });
  await new Promise<void>(resolve => {
    owner.subscribe(() => { if (TERMINAL.has(owner.getSnapshot().status)) resolve(); });
    expect(owner.start([...files])).toMatchObject({ status: 'started' });
  });
  return owner;
}

/** Whether a snapshot's data mentions the file-name marker. */
const mentionsMarker = (value: unknown): boolean => JSON.stringify(value).includes(MARKER);

describe('failure matrix fixed expectations (F-01 to F-10)', () => {
  it('covers every row from F-01 to F-10 with unique case IDs and known Worker scenarios', () => {
    expect([...new Set(FAILURE_MATRIX.map(({ row }) => row))]).toEqual(Array.from({ length: 10 }, (_, index) => `F-${String(index + 1).padStart(2, '0')}`));
    expect(new Set(FAILURE_MATRIX.map(({ id }) => id)).size).toBe(FAILURE_MATRIX.length);
    for (const { worker } of FAILURE_MATRIX) expect(Object.hasOwn(IMPORT_SCENARIOS, worker) || Object.hasOwn(PROTOCOL_SCRIPTS, worker), worker).toBe(true);
    // F-04 pairs each limit at and one past it.
    expect(FAILURE_MATRIX.filter(({ row }) => row === 'F-04').map(({ expected }) => expected.status)).toEqual(['finished', 'failed', 'finished', 'failed']);
  });

  it.each(FAILURE_MATRIX.map(test => [test.id, test] as const))('%s', async (_, test: FailureCase) => {
    const { holder, cache } = testHolder();
    // A package held before the case, which a failing job must leave as it was (I-2).
    expect(holder.acceptImport(finishedJob(allGroups()))).toBe(true);
    const before = holder.current();
    const owner = await runCase(test.worker, await test.files());
    onTestFinished(() => holder.dispose());
    const snapshot: ImportJobSnapshot = owner.getSnapshot();
    // I-6: no file name, host error text or marked content reaches the snapshot.
    expect(mentionsMarker(snapshot)).toBe(false);
    const { expected } = test;
    if (expected.status === 'failed') {
      if (snapshot.status !== 'failed') throw new Error(`expected a failed job, got ${snapshot.status}`);
      const { layer, code, location, limit } = snapshot.error;
      expect({ layer, code, location, limit }).toEqual(expected.error);
      expect(owner.takeGroups()).toBeNull();
      expect(holder.acceptImport(owner)).toBe(false);
      expect(holder.current()).toBe(before);
      expect(test.holder).toBe('unchanged');
      return;
    }
    if (snapshot.status !== 'finished') throw new Error(`expected a finished job, got ${JSON.stringify(snapshot)}`);
    expect(snapshot.groups.map(({ group, status }) => ({ group, status }))).toEqual(expected.groups);
    const commits = cache.commits.length;
    expect(holder.acceptImport(owner)).toBe(true);
    const summary = holder.getSnapshot().package!;
    expect(summary.origin).toBe('import');
    expect(summary.generation).toBe(before!.generation + 1);
    // Only complete groups are held, each received one once.
    expect(holder.current()!.groups.map(({ group }) => group))
      .toEqual(expected.groups.filter(({ status }) => status === 'group-complete').map(({ group }) => group));
    if (expected.package.status === 'complete') {
      expect(summary.completeness.status).toBe('complete');
    } else {
      if (summary.completeness.status !== 'incomplete') throw new Error('expected an incomplete package');
      expect(summary.completeness.diagnostics.map(({ code, path, assetId }) => ({ code, path, assetId }))).toEqual(expected.package.diagnostics);
    }
    const { mission } = summary;
    expect(mission.status === 'failed' ? { status: 'failed', kind: mission.failure.kind, path: mission.failure.path } : { status: mission.status })
      .toEqual(expected.mission);
    // A complete package is committed whatever its mission; a partial one is held for diagnosis only.
    const saved = expected.package.status === 'complete';
    expect(test.holder).toBe(saved ? 'complete-saved' : 'partial-unsaved');
    expect(cache.commits.length - commits).toBe(saved ? 1 : 0);
    expect(summary.cache.status).toBe(saved ? 'saving' : 'not-saved');
    expect(mentionsMarker(summary)).toBe(false);
  });

  it('keeps every disc-layer case the same through the production source entry', async () => {
    for (const test of FAILURE_MATRIX.filter(({ expected }) => expected.status === 'failed' && expected.error.layer === 'disc')) {
      const files = await test.files();
      let error: unknown;
      try {
        await openVerifiedSource(files.map(file => ({ name: file.name, source: new BlobByteSource(file) })));
      } catch (thrown) {
        error = thrown;
      }
      if (!(error instanceof DiscReadError) || test.expected.status !== 'failed') throw new Error(`${test.id}: expected a disc failure`);
      const { code, location, limit } = error.toData();
      expect({ layer: 'disc', code, location, limit }, test.id).toEqual(test.expected.error);
    }
  });
});

describe('F-04 limits are enforced before the reads and allocations they guard', () => {
  /** The slice disc whose root holds `records` records, built on demand so its image reads can be logged. */
  const rootDisc = (records: number) => syntheticFileDisc({
    ...sliceCoveredFiles(), 'PAD/PAD.DAT': PADDING,
    ...Object.fromEntries(Array.from({ length: records - 4 }, (_, index) => [`F${String(index).padStart(4, '0')}.DAT`, new Uint8Array(0)])),
  });

  /** The LBAs of the root directory, from the primary volume descriptor's root record (ECMA-119 §8.4.18, §9.1). */
  async function rootLbas(disc: ReturnType<typeof rootDisc>): Promise<number[]> {
    const sector = await disc.image.read(16 * 2_352, 2_352);
    const view = new DataView(sector.buffer, sector.byteOffset + 16);
    const [extent, length] = [view.getUint32(156 + 2, true), view.getUint32(156 + 10, true)];
    return Array.from({ length: length / 2_048 }, (_, index) => extent + index);
  }

  it('reads only the volume descriptors and the root before rejecting its record past the limit', async () => {
    const over = rootDisc(1_025);
    await expect(openVerifiedSource(over.files)).rejects.toMatchObject({
      code: 'limit-exceeded', location: 'dir:/', limit: { name: 'directoryRecords', limit: 1_024, observed: 1_025 },
    });
    const requested = requestedLbas(over.image);
    expect(requested).toEqual([16, 17, ...await rootLbas(over)]);
    // At the limit, the lookup goes on past the root.
    const at = rootDisc(1_024);
    await expect(openVerifiedSource(at.files)).rejects.toMatchObject({ code: 'unsupported-version' });
    expect(Math.max(...requestedLbas(at.image))).toBeGreaterThan(Math.max(...await rootLbas(at)));
  });

  it('fixes the budget step usage from the fixture\'s payload sizes', () => {
    // The production graphics usage less the two 8×8 fonts and the two layouts the budget step leaves out.
    const omitted = fontPayloadLength(256, 8, 94) + fontPayloadLength(256, 8, 95) + Object.entries(PRODUCTION_LAYOUT_POSITIONS)
      .reduce((total, [id, positions]) => total + layoutPayloadLength({
        elements: positions.map((_, index) => ({ image: readAssetId(`image/${id.slice('layout/'.length)}/element-${index}`), x: 0, y: 0 })),
      }), 0);
    expect(BUDGET_PAYLOAD_BYTES).toBe(GRAPHICS_PAYLOAD_BYTES - omitted);
    expect(BUDGET_LAST_ASSET).toBe('font/hud/4x6');
  });

  it('rejects the budget at the last charged font before reading its table, and reads it at the budget', async () => {
    // The same step on a disc whose 4×6 font table is one byte short: reading it fails as `invalid-payload`.
    const run = async (payloadBytes: number) => {
      const endpoint = new FakeEndpoint();
      runImportHost(endpoint, graphicsBudgetJob(payloadBytes, 'graphics-corrupt'));
      const { files } = await syntheticImport(scenarioSource('graphics-corrupt')!.covered);
      endpoint.dispatch('message', { type: 'start', protocol: IMPORT_PROTOCOL_VERSION, jobId: 1, files: files.map(file => ({ name: file.name, blob: file })) });
      await endpoint.closed;
      return endpoint.afterReady.at(-1);
    };
    expect(await run(BUDGET_PAYLOAD_BYTES - 1)).toMatchObject({
      type: 'failed',
      error: { layer: 'source', code: 'budget-exceeded', location: 'graphics[font/hud/4x6].glyphs', limit: { name: 'payloadBytes', limit: 9_209, observed: 9_210 } },
    });
    expect(await run(BUDGET_PAYLOAD_BYTES)).toMatchObject({
      type: 'failed', error: { layer: 'source', code: 'invalid-payload', location: 'graphics[font/hud/4x6].glyphs', limit: null },
    });
  });
});

describe('F-08 fixture assumptions', () => {
  it('removes the texture entry that production graphics mapping 87 names first', () => {
    const entry = PRODUCTION_MODEL_TEXTURES[0].entry;
    const first = PRODUCTION_GRAPHICS_MAPPINGS.mappings.findIndex(({ parts }) => archiveLocator(parts[0].alternatives[0]).entry.id === entry);
    expect(first).toBe(87);
    const archive = scenarioSource('texture-missing')!.covered['MAIN/SR.NOB'] as Uint8Array;
    expect(archive.length).toBeLessThan((sliceCoveredFiles()['MAIN/SR.NOB']).length);
  });
});

describe('timing scenarios (F-12)', () => {
  const start = (files: readonly File[]) => ({ type: 'start', protocol: IMPORT_PROTOCOL_VERSION, jobId: 1, files: files.map(file => ({ name: file.name, blob: file })) });

  it('names a hold scenario for every stage', () => {
    for (const stage of IMPORT_STAGES) expect(Object.hasOwn(IMPORT_SCENARIOS, `hold-${stage}`), stage).toBe(true);
  });

  let slice: Promise<readonly File[]> | undefined;
  it.each(IMPORT_STAGES)('holds the job in %s once it starts, sending nothing more', async stage => {
    const files = await (slice ??= syntheticImport(sliceCoveredFiles()).then(({ files: generated }) => generated));
    const endpoint = new FakeEndpoint();
    const held = new Promise<void>(resolve => { runImportHost(endpoint, holdAtStage(stage, resolve)); });
    endpoint.dispatch('message', start(files));
    await held;
    const count = endpoint.messages.length;
    for (let tick = 0; tick < 5; tick++) await flush();
    const messages = endpoint.afterReady;
    expect(messages).toHaveLength(count - 1);
    const progress = messages.filter((message): message is Extract<ImportWorkerMessage, { type: 'progress' }> => message.type === 'progress');
    expect(progress.at(-1)?.stage).toBe(stage);
    expect(messages.filter(({ type }) => type !== 'progress').map(({ type }) => type)).toEqual(stage === 'identify-source' ? [] : ['identified']);
    expect(endpoint.closes).toBe(0);
  });

  it('streams identification progress until reporting stops it', async () => {
    const stages: string[] = [];
    const stop = new Error('stop');
    await expect(IMPORT_SCENARIOS['progress-stream']()([], {
      progress: (stage, readBytes) => {
        stages.push(`${stage}:${readBytes}`);
        if (stages.length === 5) throw stop;
      },
      identified: () => { throw new Error('unexpected identification'); },
      group: () => { throw new Error('unexpected group'); },
    })).rejects.toBe(stop);
    expect(stages).toEqual(Array(5).fill('identify-source:0'));
  });
});

describe('network canaries (S-06)', () => {
  it('places the canary text and byte marker contiguously in the image and keeps the existing slice disc unchanged', async () => {
    const [, image] = (await syntheticImport(canaryCoveredFiles())).files;
    const imageBytes = new Uint8Array(await image.arrayBuffer());
    expect(image.name).toContain(MARKER);
    expect(containsBytes(imageBytes, canaryBytes())).toBe(true);
    const [, plain] = (await syntheticImport(sliceCoveredFiles())).files;
    expect(containsBytes(new Uint8Array(await plain.arrayBuffer()), canaryMarkerBytes())).toBe(false);
    expect(Object.keys(canaryCoveredFiles())).toEqual(Object.keys(sliceCoveredFiles()));
  });

  it('carries the canary from the input into the converted payload and the cache records', async () => {
    const owner = await runCase('canary', (await syntheticImport(canaryCoveredFiles())).files);
    if (owner.getSnapshot().status !== 'finished') throw new Error(`expected a finished job, got ${JSON.stringify(owner.getSnapshot())}`);
    const groups = owner.takeGroups()!;
    expect(groups.map(({ group }) => group)).toEqual(['logic', 'models', 'cockpit-hud-map', 'audio'] satisfies ResourceGroup[]);
    const audio = groups.find(({ group }) => group === 'audio')!;
    const descriptor = readGroupManifest(audio.manifest).assets.find(({ id }) => id === CANARY_ASSET)!;
    const payload = readPayloadRecords(audio.payloads).find(({ id }) => id === CANARY_ASSET)!;
    expect(containsBytes(payload.bytes, canaryBytes())).toBe(true);
    expect(descriptor.payloadIdentity.fingerprint).toBe(sha256Fingerprint(payload.bytes));
    // The identity the package carries is that of the canary disc.
    const { identity } = readGroupManifest(audio.manifest);
    expect(identity.origin).toEqual({ type: 'original-import', sourceFingerprint: scenarioEntryProfile('canary')!.sourceFingerprint });
    // The records the cache stores: the package record names the identity and payload hash, the payload record holds the bytes.
    const record = JSON.stringify(buildPackageRecord(readGroupInputs(groups, 'invalid-request')));
    for (const text of [identity.manifestIdentity, identity.origin.sourceFingerprint, descriptor.payloadIdentity.fingerprint]) expect(record).toContain(text);
    expect(containsBytes(new Uint8Array(buildStoredPayload(payload).bytes), canaryBytes())).toBe(true);
    expect(record).not.toContain(CANARY_TEXT);
  });

  it('places the canary where the production job reads it before rejecting production-sized files', async () => {
    const disc = syntheticFileDisc({ ...canaryProductionSizedFiles(), 'PAD/PAD.DAT': PADDING });
    let error: unknown;
    try {
      await openVerifiedSource(disc.files);
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(SourceError);
    expect((error as SourceError).toData()).toMatchObject({ code: 'unsupported-version', location: `file:/${CANARY_PRODUCTION_PATH}` });
    const lba = disc.extents.get(CANARY_PRODUCTION_PATH)! + Math.floor(CANARY_PRODUCTION_OFFSET / 2_048);
    expect(requestedLbas(disc.image)).toContain(lba);
    expect(containsBytes(await disc.image.read(lba * 2_352, 2_352), canaryBytes())).toBe(true);
  });
});

describe('test entry profiles of the P2-12 scenarios', () => {
  it('names the fingerprint each scenario identifies, and none for a scenario that identifies no disc', async () => {
    const names = [...Object.keys(IMPORT_SCENARIOS), ...Object.keys(PROTOCOL_SCRIPTS)];
    for (const name of names) {
      const source = scenarioSource(name);
      const profile = scenarioEntryProfile(name);
      if (!source) {
        expect(profile, name).toBeNull();
        continue;
      }
      // The production-sized disc of `synthetic` is identified by the existing test entry profile test.
      if (name === 'synthetic') continue;
      expect((await syntheticSource(source.covered, source.versionId)).identity.fingerprint, name).toBe(profile!.sourceFingerprint);
    }
  });
});
