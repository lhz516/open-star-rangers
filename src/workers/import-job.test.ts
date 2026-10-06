import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VerifiedSource } from '../original-data/source/open-verified-source.ts';
import { runImportHost, type ImportJob } from './import-host.ts';
import { createImportJob } from './import-job.ts';
import { FakeEndpoint } from './import-host.test-support.ts';
import { IMPORT_PROTOCOL_VERSION, type ImportWorkerMessage } from './import-protocol.ts';
import { productionGraphicsFiles } from '../original-data/conversion/production-graphics.test-support.ts';
import { MARKER, NO_GRAPHICS, syntheticImport } from './synthetic-import.test-support.ts';

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
 * The progress byte counts, checked to be identification progress until `identified` and graphics progress after it:
 * each stage reports once as it starts and once per read, accumulating across stages from 0.
 */
function progress(messages: readonly ImportWorkerMessage[], reads: readonly number[]): number[] {
  let identified = false;
  const stages: Record<string, number[]> = { 'identify-source': [], 'convert-graphics': [] };
  for (const message of messages) {
    if (message.type === 'identified') identified = true;
    if (message.type !== 'progress') continue;
    expect(message.stage).toBe(identified ? 'convert-graphics' : 'identify-source');
    stages[message.stage].push(message.readBytes);
  }
  const [identifying, converting] = [stages['identify-source'], stages['convert-graphics']];
  let total = 0;
  expect([...identifying, ...converting.slice(1)]).toEqual([0, ...reads.map(bytes => (total += bytes))]);
  if (converting.length > 0) expect(converting[0]).toBe(identifying.at(-1));
  return [...identifying, ...converting];
}

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
    const messages = await run(createImportJob(async inputs => (source = await imported.open(inputs)), NO_GRAPHICS), imported.files);
    const counts = progress(messages, reads);
    const usage = source!.usage();
    expect(counts.at(-1)).toBe(usage.sourceReadBytes);
    expect(usage.sourceReadBytes).toBeGreaterThan(Object.values(COVERED).reduce((total, bytes) => total + bytes.length, 0));
    expect(messages.slice(-3)).toEqual([
      {
        type: 'identified', jobId: 3, sequence: messages.length - 2,
        identity: { versionId: 'job-test-disc', sourceFingerprint: source!.identity.fingerprint },
      },
      { type: 'progress', jobId: 3, sequence: messages.length - 1, stage: 'convert-graphics', readBytes: usage.sourceReadBytes },
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
    const messages = await run(createImportJob(async inputs => (source = await imported.open(inputs))), imported.files);
    const counts = progress(messages, reads);
    const types = messages.map(message => (message.type === 'progress' ? `progress:${message.stage}` : message.type));
    const afterIdentification = types.slice(types.indexOf('identified') + 1, -1);
    expect(types.at(-1)).toBe('finished');
    expect(afterIdentification.length).toBeGreaterThan(1);
    expect(afterIdentification.every(type => type === 'progress:convert-graphics')).toBe(true);
    const readUsage = source!.usage();
    expect(counts.at(-1)).toBe(readUsage.sourceReadBytes);
    const last = messages.at(-1);
    if (last?.type !== 'finished') throw new Error('expected the job to finish');
    expect(last.groups).toEqual([]);
    // Two 770-byte palettes, two 2,052-byte 8×8 fonts and a 1,540-byte 4×6 font, all with empty character maps.
    expect(last.usage).toEqual({ ...readUsage, assets: 5, paletteEntries: 512, glyphs: 768, payloadBytes: 7_184 });
  });
});
