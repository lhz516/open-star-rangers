import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_BUDGET_USAGE } from '../content/budget.ts';
import { validateGroup } from '../content/completeness.ts';
import { CONTENT_SCHEMA_VERSION } from '../content/content-identity.ts';
import { readGroupManifest } from '../content/manifest.ts';
import { computeManifestIdentity } from '../content/manifest-identity.ts';
import { CLASSIC_P2_SLICE } from '../content/slice-definition.ts';
import { syntheticSourceGroup } from '../content/synthetic-content.test-support.ts';
import { PRODUCTION_CONVERTER_VERSION } from '../original-data/conversion/converter-version.ts';
import type { VerifiedSource } from '../original-data/source/open-verified-source.ts';
import { runImportHost, type ImportJob } from './import-host.ts';
import {
  checkPackageTransfers, createImportJob, type AudioStageInput, type GraphicsStepInput, type OpenSource, type PackageGroup,
} from './import-job.ts';
import { FakeEndpoint } from './import-host.test-support.ts';
import { IMPORT_PROTOCOL_VERSION, IMPORT_STAGES, type ImportWorkerMessage } from './import-protocol.ts';
import { productionGraphicsFiles } from '../original-data/conversion/production-graphics.test-support.ts';
import {
  AUDIO_CONVERSION_USAGE, audioCoveredFiles, GRAPHICS_PAYLOAD_BYTES, MARKER, NO_AUDIO, NO_GRAPHICS, SYNTHETIC_AUDIO, syntheticImport,
} from './synthetic-import.test-support.ts';

const ascii = (text: string): Uint8Array => Uint8Array.from(text, character => character.charCodeAt(0));
const COVERED = {
  'MAIN/ALPHA.DAT': ascii('alpha '.repeat(900)),
  'MAIN/SUB/BETA.NOB': ascii('beta '.repeat(3000)),
};

/** Runs `job` behind the host on `files` and resolves to the messages after `ready` once the host closes. */
async function run(job: ImportJob, files: readonly Blob[], names = files.map(file => (file as File).name)): Promise<ImportWorkerMessage[]> {
  const endpoint = new FakeEndpoint();
  runImportHost(endpoint, job);
  endpoint.dispatch('message', { type: 'start', protocol: IMPORT_PROTOCOL_VERSION, jobId: 3, files: files.map((blob, index) => ({ name: names[index], blob })) });
  await endpoint.closed;
  expect(JSON.stringify(endpoint.messages)).not.toContain(MARKER);
  return endpoint.afterReady;
}

/** The bytes each Blob read actually returned. */
function blobReads(): number[] {
  const arrayBuffer = Blob.prototype.arrayBuffer;
  const reads: number[] = [];
  vi.spyOn(Blob.prototype, 'arrayBuffer').mockImplementation(async function (this: Blob) {
    const buffer = await arrayBuffer.call(this);
    reads.push(buffer.byteLength);
    return buffer;
  });
  return reads;
}

/**
 * The progress byte counts, checked to be identification progress until `identified` and conversion progress after
 * it, in stage order: each stage reports once as it starts, repeating the latest count, and once per read, accumulating
 * across stages from 0.
 */
function progress(messages: readonly ImportWorkerMessage[], reads: readonly number[]): number[] {
  let identified = false;
  let stage: string | null = null;
  const counts: number[] = [];
  const perRead: number[] = [];
  for (const message of messages) {
    if (message.type === 'identified') identified = true;
    if (message.type !== 'progress') continue;
    expect(message.stage === 'identify-source').toBe(!identified);
    if (stage !== null && message.stage !== stage) {
      expect(IMPORT_STAGES.indexOf(message.stage)).toBeGreaterThan(IMPORT_STAGES.indexOf(stage as typeof message.stage));
      expect(message.readBytes).toBe(counts.at(-1));
    } else {
      perRead.push(message.readBytes);
    }
    stage = message.stage;
    counts.push(message.readBytes);
  }
  let total = 0;
  expect(perRead).toEqual([0, ...reads.map(bytes => (total += bytes))]);
  return counts;
}

/** Each message as its stage or type, with repeats collapsed. */
const steps = (messages: readonly ImportWorkerMessage[]): string[] => messages
  .map(message => (message.type === 'progress' ? message.stage : message.type))
  .filter((step, index, all) => step !== all[index - 1]);

/** The one group message of a finished job. */
function sentGroup(messages: readonly ImportWorkerMessage[]): Extract<ImportWorkerMessage, { type: 'group' }> {
  const groups = messages.filter(message => message.type === 'group');
  expect(groups).toHaveLength(1);
  return groups[0];
}

/** The graphics conversion usage of the production graphics on the synthetic disc. */
const GRAPHICS_USAGE = Object.freeze({ ...EMPTY_BUDGET_USAGE, assets: 5, paletteEntries: 512, glyphs: 768, payloadBytes: GRAPHICS_PAYLOAD_BYTES });

class UnreadableBlob extends Blob {
  override slice(start?: number, end?: number): Blob {
    return new UnreadableBlob([super.slice(start, end)]);
  }

  override arrayBuffer(): Promise<ArrayBuffer> {
    return Promise.reject(new Error(MARKER));
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('production job', () => {
  it('reports progress, then the production whitelist rejects a disc it does not cover', async () => {
    const { files } = await syntheticImport(COVERED);
    const reads = blobReads();
    const messages = await run(createImportJob(), files);
    const counts = progress(messages, reads);
    expect(counts.at(-1)).toBeGreaterThan(0);
    expect(messages.at(-1)).toEqual({
      type: 'failed', jobId: 3, sequence: messages.length,
      error: expect.objectContaining({ layer: 'source', code: 'unsupported-version', location: 'file:/MAIN/AISTUFF.NOB' }),
    });
    expect(messages.map(message => message.type).filter(type => type !== 'progress')).toEqual(['failed']);
  });

  it('rejects a file set with only the descriptor before reading anything', async () => {
    const { files } = await syntheticImport(COVERED);
    const reads = blobReads();
    const messages = await run(createImportJob(), files.slice(0, 1));
    expect(reads).toEqual([]);
    expect(messages).toEqual([
      { type: 'progress', jobId: 3, sequence: 1, stage: 'identify-source', readBytes: 0 },
      { type: 'failed', jobId: 3, sequence: 2, error: expect.objectContaining({ layer: 'disc', code: 'unsupported-file-set', location: 'files' }) },
    ]);
  });

  it('reports a rejected port read as a disc read failure without its text, counting only returned bytes', async () => {
    const { files } = await syntheticImport(COVERED);
    const reads = blobReads();
    const messages = await run(createImportJob(), [files[0], new UnreadableBlob([files[1]])], files.map(file => file.name));
    expect(progress(messages, reads).at(-1)).toBe(files[0].size);
    expect(messages.at(-1)).toEqual({
      type: 'failed', jobId: 3, sequence: messages.length, error: expect.objectContaining({ layer: 'disc', code: 'read-failed' }),
    });
  });
});

describe('injected identification', () => {
  it('identifies the synthetic whitelist, converts nothing, then sends an empty audio group and finishes with the source usage', async () => {
    const imported = await syntheticImport(COVERED, 'job-test-disc');
    let source: VerifiedSource | undefined;
    const reads = blobReads();
    const messages = await run(createImportJob(async inputs => (source = await imported.open(inputs)), NO_GRAPHICS, NO_AUDIO), imported.files);
    const counts = progress(messages, reads);
    const usage = source!.usage();
    const fingerprint = source!.identity.fingerprint;
    expect(counts.at(-1)).toBe(usage.sourceReadBytes);
    expect(usage.sourceReadBytes).toBeGreaterThan(Object.values(COVERED).reduce((total, bytes) => total + bytes.length, 0));
    expect(messages.slice(-5)).toEqual([
      { type: 'identified', jobId: 3, sequence: messages.length - 4, identity: { versionId: 'job-test-disc', sourceFingerprint: fingerprint } },
      { type: 'progress', jobId: 3, sequence: messages.length - 3, stage: 'convert-graphics', readBytes: usage.sourceReadBytes },
      { type: 'progress', jobId: 3, sequence: messages.length - 2, stage: 'convert-audio', readBytes: usage.sourceReadBytes },
      {
        type: 'group', jobId: 3, sequence: messages.length - 1, group: 'audio',
        input: { manifest: expect.objectContaining({ group: 'audio', assets: [] }), payloads: [], sources: { sourceFingerprint: fingerprint, states: [] } },
      },
      { type: 'finished', jobId: 3, sequence: messages.length, groups: ['audio'], usage },
    ]);
    expect(fingerprint).toMatch(/^source:sha256:[0-9a-f]{64}$/);
  });
});

describe('graphics conversion', () => {
  it('converts the production graphics after identification and finishes with the read and conversion usage added', async () => {
    const imported = await syntheticImport(productionGraphicsFiles(), 'graphics-job-disc');
    let source: VerifiedSource | undefined;
    const reads = blobReads();
    const messages = await run(createImportJob(async inputs => (source = await imported.open(inputs))), imported.files);
    const counts = progress(messages, reads);
    expect(steps(messages)).toEqual(['identify-source', 'identified', 'convert-graphics', 'convert-audio', 'group', 'finished']);
    expect(messages.filter(message => message.type === 'progress' && message.stage === 'convert-graphics').length).toBeGreaterThan(1);
    const readUsage = source!.usage();
    expect(counts.at(-1)).toBe(readUsage.sourceReadBytes);
    const last = messages.at(-1);
    if (last?.type !== 'finished') throw new Error('expected the job to finish');
    expect(last.groups).toEqual(['audio']);
    // Two 770-byte palettes, two 2,052-byte 8×8 fonts and a 1,540-byte 4×6 font, all with empty character maps.
    expect(last.usage).toEqual({ ...readUsage, ...GRAPHICS_USAGE, sourceReadBytes: readUsage.sourceReadBytes });
    // The empty production sound table: the audio group is sent without Assets and is incomplete for every core role.
    const result = validateGroup(CLASSIC_P2_SLICE, sentGroup(messages).input);
    if (result.status !== 'incomplete') throw new Error('expected an incomplete audio group');
    expect(result.diagnostics.map(({ code, path }) => [code, path])).toEqual(
      ['explosion-sound', 'fire-sound', 'missile-sound', 'warp-sound'].map(role => ['role-cardinality', `roles.${role}`]),
    );
  });
});

describe('audio conversion', () => {
  interface AudioJobOptions {
    readonly audio?: AudioStageInput;
    readonly graphics?: GraphicsStepInput;
    /** Gives one sound a `flags` value the synthetic rules reject. */
    readonly corrupt?: boolean;
    readonly wrap?: (open: OpenSource) => OpenSource;
  }

  /** Runs the production job with `graphics` and `audio` on a synthetic disc of the production graphics and the synthetic sounds. */
  async function audioJob({ audio = SYNTHETIC_AUDIO, graphics, corrupt = false, wrap = open => open }: AudioJobOptions = {}) {
    const imported = await syntheticImport(audioCoveredFiles(corrupt), 'audio-job-disc');
    let source: VerifiedSource | undefined;
    const open = wrap(async inputs => (source = await imported.open(inputs)));
    const messages = await run(createImportJob(open, graphics, audio), imported.files);
    return { messages, source: source! };
  }

  it('converts the audio group after the graphics step, sends it with the package identity and adds every usage', async () => {
    const reads = blobReads();
    const { messages, source } = await audioJob();
    const counts = progress(messages, reads);
    expect(steps(messages)).toEqual(['identify-source', 'identified', 'convert-graphics', 'convert-audio', 'group', 'finished']);
    // The audio stage starts once, then reports each archive read of mapping verification and conversion.
    expect(messages.filter(message => message.type === 'progress' && message.stage === 'convert-audio').length).toBeGreaterThan(1);
    const { group, input } = sentGroup(messages);
    expect(group).toBe('audio');
    expect(validateGroup(CLASSIC_P2_SLICE, input)).toMatchObject({ status: 'group-complete', group: 'audio' });
    const manifest = readGroupManifest(input.manifest);
    const origin = { type: 'original-import', sourceFingerprint: source.identity.fingerprint };
    expect(PRODUCTION_CONVERTER_VERSION).toBe('osr-import.audio-1');
    expect(manifest.identity).toEqual({
      schemaVersion: CONTENT_SCHEMA_VERSION, sliceId: CLASSIC_P2_SLICE.sliceId, sliceDefinitionVersion: CLASSIC_P2_SLICE.version,
      converterVersion: PRODUCTION_CONVERTER_VERSION, origin,
      // Over exactly the sent group: the graphics result stays in the job.
      manifestIdentity: computeManifestIdentity(CLASSIC_P2_SLICE, {
        schemaVersion: CONTENT_SCHEMA_VERSION, converterVersion: PRODUCTION_CONVERTER_VERSION, origin,
        groups: [{ group: 'audio', assets: manifest.assets, sources: input.sources }],
      }),
    });
    expect(manifest.assets.map(({ id, role }) => [id, role])).toEqual([
      ['sound/explosion', 'explosion-sound'], ['sound/fire', 'fire-sound'], ['sound/missile', 'missile-sound'], ['sound/warp', 'warp-sound'],
    ]);
    const readUsage = source.usage();
    expect(counts.at(-1)).toBe(readUsage.sourceReadBytes);
    expect(AUDIO_CONVERSION_USAGE).toMatchObject({ assets: 4, payloadBytes: 4 * 16 + 4 + 5 + 3 + 6, audioSamples: 2 + 5 + 3 + 6 });
    // Overlapping dimensions add up: five graphics and four sound Assets, and both conversions' payload bytes.
    expect(messages.at(-1)).toEqual({
      type: 'finished', jobId: 3, sequence: messages.length, groups: ['audio'],
      usage: {
        ...readUsage, assets: 5 + 4, paletteEntries: 512, glyphs: 768, payloadBytes: GRAPHICS_PAYLOAD_BYTES + AUDIO_CONVERSION_USAGE.payloadBytes,
        audioSamples: AUDIO_CONVERSION_USAGE.audioSamples,
      },
    });
  });

  it('charges the audio stage from zero under its own limits, apart from the graphics share', async () => {
    // Assets and payload bytes exactly at their limits, while the graphics step already charged both. The directory
    // preflight bounds samples by sample bytes, so the 16-bit clip counts twice its sample points there.
    const exact = await audioJob({ audio: { ...SYNTHETIC_AUDIO, limits: { ...AUDIO_CONVERSION_USAGE, audioSamples: 4 + 5 + 3 + 6 } } });
    expect(exact.messages.at(-1)).toMatchObject({ type: 'finished', groups: ['audio'], usage: { assets: 9 } });
    const payloadBytes = AUDIO_CONVERSION_USAGE.payloadBytes;
    const { messages } = await audioJob({ audio: { ...SYNTHETIC_AUDIO, limits: { ...AUDIO_CONVERSION_USAGE, payloadBytes: payloadBytes - 1 } } });
    expect(messages.some(message => message.type === 'group')).toBe(false);
    expect(messages.at(-1)).toEqual({
      type: 'failed', jobId: 3, sequence: messages.length,
      error: {
        layer: 'source', code: 'budget-exceeded', location: 'sources.mappings[3].parts[0].alternatives[0].size',
        reason: expect.any(String), limit: { name: 'payloadBytes', limit: payloadBytes - 1, observed: payloadBytes },
      },
    });
  });

  it('keeps the package identity independent of the graphics result it does not send', async () => {
    const identity = (messages: readonly ImportWorkerMessage[]) => readGroupManifest(sentGroup(messages).input.manifest).identity;
    const [withGraphics, withoutGraphics] = (await Promise.all([audioJob(), audioJob({ graphics: NO_GRAPHICS })])).map(({ messages }) => messages);
    expect(withoutGraphics.at(-1)).toMatchObject({ type: 'finished', usage: { assets: 4, paletteEntries: 0 } });
    expect(identity(withoutGraphics)).toEqual(identity(withGraphics));
  });

  it('fails before sending any group when a sample, or the final usage, is rejected', async () => {
    const corrupt = await audioJob({ corrupt: true });
    expect(corrupt.messages.at(-1)).toEqual({
      type: 'failed', jobId: 3, sequence: corrupt.messages.length,
      error: { layer: 'source', code: 'unsupported-payload', location: 'sources.mappings[1].parts[0].alternatives[0].flags', reason: expect.any(String), limit: null },
    });
    // A source whose read usage cannot take the conversion usage: the final usage is checked before any group is sent.
    const overflowing = (open: OpenSource): OpenSource => async inputs => {
      const source = await open(inputs);
      return {
        identity: source.identity, openFile: path => source.openFile(path), openArchive: path => source.openArchive(path),
        usage: () => ({ ...source.usage(), assets: Number.MAX_SAFE_INTEGER }),
      };
    };
    const { messages } = await audioJob({ wrap: overflowing });
    expect(messages.at(-1)).toEqual({
      type: 'failed', jobId: 3, sequence: messages.length,
      error: expect.objectContaining({ layer: 'content', code: 'invalid-budget-value', location: 'usage.assets' }),
    });
    expect([...corrupt.messages, ...messages].some(message => message.type === 'group')).toBe(false);
  });
});

describe('package transfer check', () => {
  const FINGERPRINT = `source:sha256:${'ab'.repeat(32)}`;
  const twoGroups = (): PackageGroup[] => (['models', 'audio'] as const).map(group => [group, syntheticSourceGroup(group, FINGERPRINT)]);
  const failure = (groups: readonly PackageGroup[]) => {
    try {
      checkPackageTransfers(groups);
    } catch (error) {
      return { code: (error as { code?: unknown }).code, path: (error as { path?: unknown }).path };
    }
    return null;
  };

  it('accepts groups whose payloads each own a separate buffer', () => {
    expect(failure(twoGroups())).toBeNull();
  });

  it('rejects a buffer shared across groups, and an invalid later group, before any group is sent', () => {
    const shared = twoGroups();
    const [models, audio] = shared.map(([, input]) => input.payloads as { bytes: Uint8Array }[]);
    audio[0].bytes = models[0].bytes;
    expect(failure(shared)).toEqual({ code: 'payload-aliased', path: 'groups.audio.payloads[0]' });
    const detached = twoGroups();
    const [, [, input]] = detached;
    const [payload] = input.payloads as { bytes: Uint8Array }[];
    const buffer = payload.bytes.buffer as ArrayBuffer;
    structuredClone(buffer, { transfer: [buffer] });
    expect(failure(detached)).toEqual({ code: 'payload-detached', path: 'groups.audio.payloads[0].bytes' });
  });
});
