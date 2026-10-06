import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_BUDGET_USAGE } from '../content/budget.ts';
import { validateGroup } from '../content/completeness.ts';
import { deriveManifestIdentity, type GroupDraft } from '../content/manifest-identity.ts';
import { CLASSIC_P2_SLICE } from '../content/slice-definition.ts';
import { productionIdentityBasis } from '../original-data/conversion/converter-version.ts';
import type { VerifiedSource } from '../original-data/source/open-verified-source.ts';
import { runImportHost, type ImportJob } from './import-host.ts';
import { createImportJob, PRODUCTION_LOGIC_STEP } from './import-job.ts';
import { FakeEndpoint } from './import-host.test-support.ts';
import { canReportStage, IMPORT_PROTOCOL_VERSION, type ImportStage, type ImportWorkerMessage } from './import-protocol.ts';
import { productionGraphicsFiles } from '../original-data/conversion/production-graphics.test-support.ts';
import { MARKER, NO_GRAPHICS, NO_LOGIC, sliceCoveredFiles, syntheticImport } from './synthetic-import.test-support.ts';

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
 * The progress byte counts, checked to follow the stage order: identification progress until `identified`, then the
 * conversion stages in order. Each stage reports once as it starts, with the bytes read so far, and once per read,
 * accumulating across stages from 0.
 */
function progress(messages: readonly ImportWorkerMessage[], reads: readonly number[]): number[] {
  let identified = false;
  let latest: ImportStage | null = null;
  const counts: number[] = [];
  const perRead: number[] = [];
  for (const message of messages) {
    if (message.type === 'identified') identified = true;
    if (message.type !== 'progress') continue;
    expect(canReportStage(latest, message.stage, identified)).toBe(true);
    if (message.stage === latest) perRead.push(message.readBytes);
    else expect(message.readBytes).toBe(counts.at(-1) ?? 0);
    latest = message.stage;
    counts.push(message.readBytes);
  }
  let total = 0;
  expect(perRead).toEqual(reads.map(bytes => (total += bytes)));
  return counts;
}

/** Message types, with each progress message labelled by its stage. */
const typesOf = (messages: readonly ImportWorkerMessage[]): string[] =>
  messages.map(message => (message.type === 'progress' ? `progress:${message.stage}` : message.type));

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
  it('identifies the synthetic whitelist, converts nothing, then finishes without groups and with the source usage', async () => {
    const imported = await syntheticImport(COVERED, 'job-test-disc');
    let source: VerifiedSource | undefined;
    const reads = blobReads();
    const messages = await run(createImportJob(async inputs => (source = await imported.open(inputs)), NO_GRAPHICS, NO_LOGIC), imported.files);
    const counts = progress(messages, reads);
    const usage = source!.usage();
    expect(counts.at(-1)).toBe(usage.sourceReadBytes);
    expect(usage.sourceReadBytes).toBeGreaterThan(Object.values(COVERED).reduce((total, bytes) => total + bytes.length, 0));
    expect(messages.slice(-4)).toEqual([
      {
        type: 'identified', jobId: 3, sequence: messages.length - 3,
        identity: { versionId: 'job-test-disc', sourceFingerprint: source!.identity.fingerprint },
      },
      { type: 'progress', jobId: 3, sequence: messages.length - 2, stage: 'convert-graphics', readBytes: usage.sourceReadBytes },
      { type: 'progress', jobId: 3, sequence: messages.length - 1, stage: 'convert-logic', readBytes: usage.sourceReadBytes },
      { type: 'finished', jobId: 3, sequence: messages.length, groups: [], usage },
    ]);
    expect(source!.identity.fingerprint).toMatch(/^source:sha256:[0-9a-f]{64}$/);
  });
});

describe('graphics conversion', () => {
  it('converts the production graphics after identification and finishes with the read and conversion usage added', async () => {
    const imported = await syntheticImport(productionGraphicsFiles(), 'graphics-job-disc');
    let source: VerifiedSource | undefined;
    const reads = blobReads();
    const messages = await run(createImportJob(async inputs => (source = await imported.open(inputs)), undefined, NO_LOGIC), imported.files);
    const counts = progress(messages, reads);
    const types = typesOf(messages);
    const afterIdentification = types.slice(types.indexOf('identified') + 1, -1);
    expect(types.at(-1)).toBe('finished');
    expect(afterIdentification.length).toBeGreaterThan(2);
    expect(afterIdentification.slice(0, -1).every(type => type === 'progress:convert-graphics')).toBe(true);
    expect(afterIdentification.at(-1)).toBe('progress:convert-logic');
    const readUsage = source!.usage();
    expect(counts.at(-1)).toBe(readUsage.sourceReadBytes);
    const last = messages.at(-1);
    if (last?.type !== 'finished') throw new Error('expected the job to finish');
    expect(last.groups).toEqual([]);
    // Two 770-byte palettes, 8×8 fonts of 2,243 and 2,245 bytes (256 glyphs, 94 and 95 map entries) and a 1,655-byte
    // 4×6 font (192 eight-row glyphs, 56 map entries).
    expect(last.usage).toEqual({ ...readUsage, assets: 5, paletteEntries: 512, glyphs: 256 + 256 + 192, payloadBytes: 7_683 });
  });
});

describe('logic conversion', () => {
  it('converts the logic group after the graphics, sending it with its manifest identity before finishing', async () => {
    const imported = await syntheticImport(sliceCoveredFiles(), 'logic-job-disc');
    let source: VerifiedSource | undefined;
    let drafts: readonly GroupDraft[] = [];
    // The production conversion, capturing the drafts the job then identifies and sends.
    const logic = {
      ...PRODUCTION_LOGIC_STEP,
      convert: async (...args: Parameters<typeof PRODUCTION_LOGIC_STEP.convert>) => {
        const converted = await PRODUCTION_LOGIC_STEP.convert(...args);
        drafts = converted.drafts;
        return converted;
      },
    };
    const reads = blobReads();
    const messages = await run(createImportJob(async inputs => (source = await imported.open(inputs)), undefined, logic), imported.files);
    const counts = progress(messages, reads);
    const types = typesOf(messages);
    const afterIdentification = types.slice(types.indexOf('identified') + 1);
    const logicAt = afterIdentification.indexOf('progress:convert-logic');
    expect(afterIdentification.slice(0, logicAt).every(type => type === 'progress:convert-graphics')).toBe(true);
    expect(afterIdentification.slice(logicAt, -2).every(type => type === 'progress:convert-logic')).toBe(true);
    expect(afterIdentification.slice(logicAt, -2).length).toBeGreaterThan(1);
    expect(afterIdentification.slice(-2)).toEqual(['group', 'finished']);

    const group = messages.at(-2);
    const last = messages.at(-1);
    if (group?.type !== 'group' || last?.type !== 'finished') throw new Error('expected a group, then finished');
    expect(group.group).toBe('logic');
    const fingerprint = source!.identity.fingerprint;
    const validation = validateGroup(CLASSIC_P2_SLICE, group.input);
    expect(validation).toMatchObject({ status: 'group-complete', group: 'logic' });
    // One identity derived from every converted draft; payloads, already transferred, are not part of the derivation.
    expect((group.input.manifest as { identity: { manifestIdentity: string } }).identity.manifestIdentity)
      .toBe(deriveManifestIdentity(productionIdentityBasis(fingerprint), drafts));
    expect(last.groups).toEqual(['logic']);
    const readUsage = source!.usage();
    expect(counts.at(-1)).toBe(readUsage.sourceReadBytes);
    expect(last.usage).toEqual({
      ...readUsage, assets: 8, dependencyEdges: 8, paletteEntries: 512, glyphs: 768, missionObjects: 11, missionReferences: 37,
      payloadBytes: 7_184 + drafts[0].assets.reduce((sum, { payloadIdentity }) => sum + payloadIdentity.byteLength, 0),
    });
  });

  it('sends no group when the job fails after the logic step, such as on invalid usage', async () => {
    const imported = await syntheticImport(sliceCoveredFiles(), 'logic-job-disc');
    const invalid = {
      ...PRODUCTION_LOGIC_STEP,
      convert: async (...args: Parameters<typeof PRODUCTION_LOGIC_STEP.convert>) =>
        ({ ...await PRODUCTION_LOGIC_STEP.convert(...args), usage: { ...EMPTY_BUDGET_USAGE, missionObjects: -1 } }),
    };
    const messages = await run(createImportJob(imported.open, NO_GRAPHICS, invalid), imported.files);
    expect(typesOf(messages).filter(type => !type.startsWith('progress'))).toEqual(['identified', 'failed']);
    expect(messages.at(-1)).toMatchObject({ type: 'failed', error: { layer: 'content', code: 'invalid-budget-value' } });
  });

  it('fails without a group when the logic step fails, keeping the source layer and the budget limit', async () => {
    const imported = await syntheticImport(sliceCoveredFiles(), 'logic-job-disc');
    const tight = { ...PRODUCTION_LOGIC_STEP, share: { ...PRODUCTION_LOGIC_STEP.share, assets: 2 } };
    const messages = await run(createImportJob(imported.open, NO_GRAPHICS, tight), imported.files);
    expect(typesOf(messages).filter(type => !type.startsWith('progress'))).toEqual(['identified', 'failed']);
    expect(messages.at(-1)).toMatchObject({
      type: 'failed',
      error: { layer: 'source', code: 'budget-exceeded', location: 'archive:/MAIN/SCENARIO.NOB#3019', limit: { name: 'assets', limit: 2, observed: 3 } },
    });
  });
});
